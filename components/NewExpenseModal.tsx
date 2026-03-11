
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { X, Edit2, Plus, Home, ShoppingCart, User, Trash2, ChevronDown, Camera, Loader2, Sparkles } from 'lucide-react';
import { Expense, Account, CreditCard as CreditCardType, ExpenseType, ExpenseTypeOption } from '../types';
import CardTag from './CardTag';
import { getAccountColor, getCardColor } from '../services/cardColorUtils';
import { categoryService } from '../services/categoryService';
import { isCreditPaymentMethod, resolveExpenseCardId } from '../services/invoiceUtils';
import { useAuth } from '../contexts/AuthContext';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import SelectDropdown from './common/SelectDropdown';
import WheelDatePicker from './common/WheelDatePicker';
import { modalInputClass, modalLabelClass, modalTextareaClass } from './ui/PremiumModal';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';
import { scanExpenseReceiptImage, type ExpenseReceiptDraft } from '../services/expenseReceiptScannerService';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: any) => void;
  initialData?: Expense | null;
  variant?: 'modal' | 'inline' | 'dock';
  hideFooter?: boolean;
  onPrimaryActionRef?: (handler: () => void) => void;
  accounts: Account[];
  creditCards: CreditCardType[];
  categories: string[]; 
  userId?: string | null;
  categoryType: 'expenses';
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  onResetCategories?: () => Promise<void> | void;
  expenseType: ExpenseType | null; 
  allowTypeSelection?: boolean;
  requireTypeSelection?: boolean;
  onExpenseTypeChange?: (type: ExpenseType) => void;
  expenseTypeOptions?: ExpenseTypeOption[];
  onUpdateExpenseTypes?: (next: ExpenseTypeOption[]) => void;
  themeColor?: 'indigo' | 'amber' | 'cyan' | 'pink';
  defaultDate?: Date; // New prop
  minDate: string;
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });

const downscaleImageDataUrl = (
  dataUrl: string,
  options?: { maxSide?: number; quality?: number }
) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxSide = options?.maxSide ?? 1600;
        const quality = options?.quality ?? 0.84;
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
          resolve(dataUrl);
          return;
        }

        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Falha ao processar imagem.'));
    image.src = dataUrl;
  });

const NewExpenseModal: React.FC<NewExpenseModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData,
  variant = 'modal',
  hideFooter = false,
  onPrimaryActionRef,
  accounts, 
  creditCards,
  categories,
  userId,
  categoryType,
  onAddCategory,
  onRemoveCategory,
  onResetCategories,
  expenseType,
  allowTypeSelection = false,
  requireTypeSelection = false,
  onExpenseTypeChange,
  expenseTypeOptions,
  onUpdateExpenseTypes,
  themeColor = 'indigo',
  defaultDate,
  minDate
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const isCredit = isCreditPaymentMethod(paymentMethod);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [notes, setNotes] = useState('');
  const [taxStatus, setTaxStatus] = useState<'PJ' | 'PF' | ''>('');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptScanMessage, setReceiptScanMessage] = useState('');
  const [receiptScanError, setReceiptScanError] = useState('');
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const { user: authUser } = useAuth();
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const availableAccounts = accounts.filter(acc => !acc.locked);
  const isMobile = useIsMobile();
  const isInline = variant === 'inline';
  const isDock = variant === 'dock';
  const isDockDesktop = isDock && !isMobile;
  const isMobileInline = isMobile && isInline;
  const contentPadding = isMobileInline
    ? 'px-3 py-2.5'
    : isInline
    ? 'px-3 py-1.5'
    : isMobile
      ? 'px-3 py-2'
      : isDockDesktop
        ? 'px-4 py-4'
        : 'px-8 py-8';
  const footerPadding = isMobileInline
    ? 'px-3 py-2'
    : isInline
    ? 'p-2'
    : isMobile
      ? 'px-3 py-2'
      : isDockDesktop
        ? 'pt-3'
        : 'px-8 py-6';
  const contentSpacing = isMobileInline
    ? 'space-y-2'
    : isInline
    ? 'space-y-0.5'
    : isMobile
      ? 'space-y-2'
      : isDockDesktop
        ? 'space-y-4'
        : 'space-y-6';
  
  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Installments State
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentValueType, setInstallmentValueType] = useState<'parcel' | 'total'>('parcel');
  const [applyScope, setApplyScope] = useState<'single' | 'series'>('single');
  const isEditing = Boolean(initialData);
  const showApplyScope =
      isEditing &&
      Boolean(initialData?.installments) &&
      Boolean((initialData?.totalInstallments ?? 0) > 1);
  const hasExplicitGroupId = Boolean(initialData?.installmentGroupId);

  // Installment Dates Summary
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');
  const [lastInstallmentDate, setLastInstallmentDate] = useState('');
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [tourSimulationStepId, setTourSimulationStepId] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);
  const lastInitialIdRef = useRef<string | null>(null);
  const [isManagingTypes, setIsManagingTypes] = useState(false);
  const [typeDrafts, setTypeDrafts] = useState<ExpenseTypeOption[]>([]);
  const [typeError, setTypeError] = useState('');

  // Helper for dynamic UI based on type
  const getModalConfig = () => {
      if (!expenseType) {
          return {
              title: 'Nova Despesa',
              icon: <ShoppingCart className="text-zinc-500 dark:text-zinc-300" />,
              colorClass: 'text-zinc-600 focus:ring-zinc-500',
              btnClass: 'bg-zinc-600 hover:bg-zinc-700 shadow-zinc-900/20',
              headerGradient: 'from-zinc-500/70 via-zinc-500/30 to-black',
              accentClass: 'accent-zinc-500'
          };
      }
      switch(expenseType) {
          case 'fixed': 
              return { 
                  title: allowTypeSelection ? 'Nova Despesa' : 'Nova Despesa Fixa', 
                  icon: <Home className="text-amber-600 dark:text-amber-400" />,
                  colorClass: 'text-amber-600 focus:ring-amber-500',
                  btnClass: 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20',
                  headerGradient: 'from-amber-500/80 via-amber-500/35 to-black',
                  accentClass: 'accent-amber-500'
              };
          case 'personal': 
              return { 
                  title: allowTypeSelection ? 'Nova Despesa' : 'Nova Despesa Pessoal', 
                  icon: <User className="text-cyan-600 dark:text-cyan-400" />,
                  colorClass: 'text-cyan-600 focus:ring-cyan-500',
                  btnClass: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-900/20',
                  headerGradient: 'from-cyan-500/80 via-cyan-500/35 to-black',
                  accentClass: 'accent-cyan-500'
              };
          case 'variable':
          default: 
              return { 
                  title: allowTypeSelection ? 'Nova Despesa' : 'Nova Despesa Variável', 
                  icon: <ShoppingCart className="text-red-600 dark:text-red-400" />,
                  colorClass: 'text-red-600 focus:ring-red-500',
                  btnClass: 'bg-red-600 hover:bg-red-700 shadow-red-900/20',
                  headerGradient: 'from-red-500/80 via-red-500/35 to-black',
                  accentClass: 'accent-red-500'
              };
      }
  };
  
  const config = getModalConfig();
  const mobileFocusToneClass =
    expenseType === 'fixed'
      ? 'focus:border-amber-400/60 focus:ring-amber-500/30'
      : expenseType === 'personal'
        ? 'focus:border-cyan-400/60 focus:ring-cyan-500/30'
        : expenseType === 'variable'
          ? 'focus:border-rose-400/60 focus:ring-rose-500/30'
          : 'focus:border-indigo-400/60 focus:ring-indigo-500/30';
  const isCompact = isInline || isMobile;
  const compactLabelClass = 'text-[10px] uppercase tracking-[0.12em] font-semibold text-white/65';
  const labelClass = isDockDesktop ? modalLabelClass : compactLabelClass;
  const dockFieldClass =
    'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2 py-1 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2';
  const mobileInlineInputClass =
    `w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:ring-2 ${mobileFocusToneClass} placeholder:text-[11px] placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500`;
  const mobileModalInputClass = isMobile
    ? (isMobileInline ? mobileInlineInputClass : `w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:ring-2 ${mobileFocusToneClass} placeholder:text-[11px] placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500`)
    : modalInputClass;
  const mobileModalTextareaClass = isMobile ? `${mobileModalInputClass} resize-none` : modalTextareaClass;
  const inputBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 pr-8 placeholder:uppercase placeholder:font-light`
    : `${mobileModalInputClass} pr-8`;
  const selectBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 text-left`
    : `${mobileModalInputClass} pr-8 text-left`;
  const compactSelectClass = `${selectBaseClass} text-[13px]`;
  const textareaBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 placeholder:uppercase placeholder:font-light min-h-[64px] resize-none`
    : `${mobileModalTextareaClass} min-h-[84px]`;
  const entityName = config.title.replace(/^Nova\s+/i, '').trim();
  const primaryLabel = getPrimaryActionLabel(entityName, isEditing);
  const fieldIdPrefix = initialData?.id ? `expense-${initialData.id}` : 'expense-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;
  const isTourSimulationSession = Boolean(tourSimulationStepId);

  const detectTourSimulationStep = () => {
      if (typeof document === 'undefined') return null;
      const steps = ['fixed-expenses', 'variable-expenses', 'personal-expenses'];
      for (const step of steps) {
          if (document.querySelector(`[data-tour-overlay="true"][data-tour-step="${step}"]`)) {
              return step;
          }
      }
      return null;
  };

  const categoryOptions = useMemo(() => {
      const options = [] as { value: string; label: string; disabled?: boolean }[];
      if (category && !categories.includes(category)) {
          options.push({ value: category, label: category });
      }
      if (categories.length === 0) {
          options.push({ value: '', label: 'Sem categorias, crie uma', disabled: true });
      }
      categories.forEach((cat) => options.push({ value: cat, label: cat }));
      return options;
  }, [category, categories]);

  const paymentMethodOptions = useMemo(
      () => [
          { value: 'Débito', label: 'Débito' },
          { value: 'Crédito', label: 'Crédito' },
          { value: 'PIX', label: 'PIX' },
          { value: 'Boleto', label: 'Boleto' },
          { value: 'Transferência', label: 'Transferência' },
          { value: 'Dinheiro', label: 'Dinheiro' }
      ],
      []
  );

  const paymentAccountOptions = useMemo(() => {
      if (isCredit) {
          if (creditCards.length === 0) {
              return [{ value: '', label: 'Nenhum cartão cadastrado', disabled: true }];
          }
          return creditCards.map((card) => ({
              value: card.id,
              label: card.name,
              color: getCardColor(card)
          }));
      }
      if (availableAccounts.length === 0) {
          return [{ value: '', label: 'Nenhuma conta disponível', disabled: true }];
      }
      return availableAccounts.map((acc) => ({
          value: acc.id,
          label: acc.name,
          color: getAccountColor(acc)
      }));
  }, [availableAccounts, creditCards, isCredit]);

  const clampToMinDate = (value: string) => {
      if (!value) return minDate;
      return value < minDate ? minDate : value;
  };

  useEffect(() => {
    if (!isOpen) {
        hasInitializedRef.current = false;
        lastInitialIdRef.current = initialData?.id ?? null;
        setIsManagingCategories(false);
        setNewCategoryName('');
        setIsInstallmentModalOpen(false);
        setIsNotesModalOpen(false);
        setTourSimulationStepId(null);
        setReceiptPreviewUrl('');
        setReceiptScanMessage('');
        setReceiptScanError('');
        setIsScanningReceipt(false);
        return;
    }

    setTourSimulationStepId(detectTourSimulationStep());

    const currentInitialId = initialData?.id ?? null;
    const shouldInit = !hasInitializedRef.current || lastInitialIdRef.current !== currentInitialId;
    if (!shouldInit) return;

    hasInitializedRef.current = true;
    lastInitialIdRef.current = currentInitialId;

    if (initialData) {
        const initialCardId = resolveExpenseCardId(initialData as Expense & { creditCardId?: string });
        const normalizedPaymentMethod = isCreditPaymentMethod(initialData.paymentMethod)
            ? 'Crédito'
            : (initialData.paymentMethod || '');
        setDescription(initialData.description);
        setAmount(initialData.amount.toString());
        setCategory(initialData.category);
        setDate(clampToMinDate(initialData.date));
        setDueDate(clampToMinDate(initialData.dueDate));
        setPaymentMethod(normalizedPaymentMethod);
        setSelectedAccountId(initialData.accountId || '');
        setSelectedCardId(initialCardId || '');
        setStatus(initialData.status);
        setNotes(initialData.notes || '');
        setTaxStatus(initialData.taxStatus || '');
        setIsInstallment(false);
        setApplyScope('single');
        return;
    }

    // Reset form
    setDescription('');
    setAmount('');
    setCategory('');

    // Logic to set default date:
    // If defaultDate (viewDate) is provided, and is DIFFERENT month/year than real today, use it.
    // Otherwise use real today.
    const now = new Date();
    let initialDateStr = now.toISOString().split('T')[0];

    if (defaultDate) {
        const isSameMonth = defaultDate.getMonth() === now.getMonth() && defaultDate.getFullYear() === now.getFullYear();
        if (!isSameMonth) {
            // Use the 1st of the view month (or whatever defaultDate is)
            // We need to ensure timezone doesn't shift it back
            const d = new Date(defaultDate);
            // Add a few hours to ensure we stay in the day/month
            d.setHours(12);
            initialDateStr = d.toISOString().split('T')[0];
        }
    }

    const clamped = clampToMinDate(initialDateStr);
    setDate(clamped);
    setDueDate(clampToMinDate(initialDateStr));
    setPaymentMethod('');
    // Automatic status for Debit is 'paid'
    setStatus('paid');
    setSelectedAccountId('');
    setSelectedCardId('');
    setNotes('');
    setTaxStatus('');
    setIsInstallment(false);
    setInstallmentCount(2);
    setInstallmentValueType('parcel');
    setApplyScope('single');
  }, [isOpen, initialData, defaultDate, minDate]);

  useEffect(() => {
    if (!isOpen || !isTourSimulationSession) return;
    const handleTourEnd = () => onClose();
    window.addEventListener('mm:first-access-tour-ended', handleTourEnd);
    return () => window.removeEventListener('mm:first-access-tour-ended', handleTourEnd);
  }, [isOpen, isTourSimulationSession, onClose]);

  useEffect(() => {
    if (!isInline && isOpen) {
      requestAnimationFrame(() => {
        modalRootRef.current?.focus();
      });
    }
  }, [isInline, isOpen]);

  const isTypeMissing = allowTypeSelection && requireTypeSelection && !expenseType;
  const effectiveTypeOptions = useMemo(() => {
    const base = expenseTypeOptions && expenseTypeOptions.length > 0
      ? expenseTypeOptions
          : [
          { id: 'fixed', label: 'Fixa', enabled: true, nature: 'PJ', color: '#f59e0b' },
          { id: 'variable', label: 'Variável', enabled: true, nature: 'PJ', color: '#ef4444' },
          { id: 'personal', label: 'Pessoal', enabled: true, nature: 'PF', color: '#22d3ee' }
        ];
    return base;
  }, [expenseTypeOptions]);

  useEffect(() => {
    if (!allowTypeSelection || isEditing) return;
    if (!expenseType) return;
    const match = effectiveTypeOptions.find(option => option.id === expenseType);
    if (match?.nature) {
      setTaxStatus(match.nature);
    }
  }, [allowTypeSelection, expenseType, isEditing, effectiveTypeOptions]);

  useEffect(() => {
    if (!isManagingTypes) return;
    setTypeDrafts(effectiveTypeOptions.map(option => ({ ...option })));
    setTypeError('');
  }, [isManagingTypes, effectiveTypeOptions]);

  const enabledTypeOptions = useMemo(
    () => effectiveTypeOptions.filter(option => option.enabled),
    [effectiveTypeOptions]
  );

  const currentTypeOption = useMemo(
    () => effectiveTypeOptions.find(option => option.id === expenseType),
    [effectiveTypeOptions, expenseType]
  );

  useEffect(() => {
    if (!allowTypeSelection) return;
    if (!onExpenseTypeChange) return;
    if (expenseType && effectiveTypeOptions.some(option => option.id === expenseType && option.enabled)) {
      return;
    }
    const fallback = enabledTypeOptions[0]?.id;
    if (fallback) {
      onExpenseTypeChange(fallback);
    }
  }, [allowTypeSelection, onExpenseTypeChange, expenseType, enabledTypeOptions, effectiveTypeOptions]);

  // ... (rest of the component logic remains unchanged) ...
  // --- Auto-Calculate Due Date for Credit Cards (FIXED LOGIC) ---
  useEffect(() => {
      if (isCredit && selectedCardId && date) {
          const card = creditCards.find(c => c.id === selectedCardId);
          if (card) {
              const launchDate = new Date(date + 'T12:00:00'); 
              const closingDay = card.closingDay;
              const dueDay = card.dueDay;
              
              const launchDay = launchDate.getDate();
              
              // Começa com o mês da compra
              let targetMonth = new Date(launchDate);

              // 1. Verificar Ciclo de Fechamento
              // Se comprou no dia do fechamento ou depois, entra na fatura do mês seguinte
              if (launchDay >= closingDay) {
                  targetMonth.setMonth(targetMonth.getMonth() + 1);
              }

              // 2. Verificar Calendário de Vencimento
              // Se o dia do vencimento é MENOR que o dia do fechamento (ex: Fecha 25, Vence 05),
              // então o vencimento ocorre no mês SEGUINTE ao mês da fatura.
              if (dueDay < closingDay) {
                  targetMonth.setMonth(targetMonth.getMonth() + 1);
              }

              // Define o dia do vencimento correto
              targetMonth.setDate(dueDay);
              
              // Format Manually to avoid UTC shifts
              const y = targetMonth.getFullYear();
              const m = String(targetMonth.getMonth() + 1).padStart(2, '0');
              const d = String(targetMonth.getDate()).padStart(2, '0');
              
              setDueDate(`${y}-${m}-${d}`);
              
              // Credit always pending
              setStatus('pending'); 
          }
      }
  }, [isCredit, selectedCardId, date, creditCards]);

  // --- Calculate Installment Dates Summary ---
  useEffect(() => {
      if (isInstallment && installmentCount > 0 && dueDate) {
          const firstDate = new Date(dueDate + 'T12:00:00');
          const lastDate = new Date(firstDate);
          lastDate.setMonth(lastDate.getMonth() + (installmentCount - 1));

          setFirstInstallmentDate(firstDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
          setLastInstallmentDate(lastDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
      } else {
          setFirstInstallmentDate('');
          setLastInstallmentDate('');
      }
  }, [isInstallment, installmentCount, dueDate]);

  // --- Handle Payment Method Change with Auto-Status Logic ---
  const handlePaymentMethodSelect = (newMethod: string) => {
      setPaymentMethod(newMethod);

      // AUTOMATIC STATUS LOGIC
      if (isCreditPaymentMethod(newMethod) || newMethod === 'Boleto') {
          setStatus('pending');
      } else {
          setStatus('paid');
      }
  };
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
      handlePaymentMethodSelect(e.target.value);

  const applyReceiptDraft = (draft: ExpenseReceiptDraft) => {
    if (draft.description) {
      setDescription(draft.description);
    }

    if (typeof draft.amount === 'number' && Number.isFinite(draft.amount) && draft.amount > 0) {
      setAmount(String(Number(draft.amount.toFixed(2))));
    }

    if (draft.category) {
      setCategory(draft.category);
    }

    if (draft.date) {
      const normalizedLaunchDate = clampToMinDate(draft.date);
      setDate(normalizedLaunchDate);
      if (!dueDate || dueDate === date) {
        setDueDate(normalizedLaunchDate);
      }
    }

    if (draft.dueDate) {
      setDueDate(clampToMinDate(draft.dueDate));
    }

    if (draft.paymentMethod) {
      handlePaymentMethodSelect(draft.paymentMethod);
    }

    if (draft.taxStatus) {
      setTaxStatus(draft.taxStatus);
    }

    if (draft.notes) {
      setNotes(prev => (prev ? `${prev}\n${draft.notes}` : draft.notes || ''));
    }
  };

  const handleReceiptCaptureClick = () => {
    if (isScanningReceipt) return;
    setReceiptScanError('');
    receiptInputRef.current?.click();
  };

  const handleReceiptFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';
    setReceiptScanError('');
    setReceiptScanMessage('Processando imagem...');
    setIsScanningReceipt(true);

    try {
      const rawDataUrl = await fileToDataUrl(file);
      const compactDataUrl =
        file.size > 1_500_000
          ? await downscaleImageDataUrl(rawDataUrl, { maxSide: 1600, quality: 0.84 })
          : rawDataUrl;
      setReceiptPreviewUrl(compactDataUrl);

      const scanResult = await scanExpenseReceiptImage(compactDataUrl);
      if (!scanResult.ok || !scanResult.data) {
        throw new Error(scanResult.message || 'Não foi possível ler o comprovante.');
      }

      applyReceiptDraft(scanResult.data);

      const confidenceText =
        typeof scanResult.data.confidence === 'number'
          ? `Confiabilidade ${(scanResult.data.confidence * 100).toFixed(0)}%.`
          : 'Confira e ajuste os dados, se necessário.';
      setReceiptScanMessage(`Comprovante lido com sucesso. ${confidenceText}`);
    } catch (error: any) {
      setReceiptScanMessage('');
      setReceiptScanError(error?.message || 'Falha ao ler comprovante.');
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const handleAddCategory = () => {
    const rawName = newCategoryName;
    const normalizedName = categoryService.normalizeCategoryName(newCategoryName);
    const uid = authUser?.uid || '';
    const email = authUser?.email || '';
    console.info('[categories] UI_add_click', {
        screen: 'NewExpenseModal',
        rawName,
        normalizedName,
        userId,
        type: categoryType,
        uid,
        email
    });
    if (!userId) {
        console.warn('[categories] UI_add_blocked', {
            reason: 'user_missing',
            rawName,
            userId,
            type: categoryType,
            uid,
            email
        });
        return;
    }
    if (!normalizedName) {
        console.warn('[categories] UI_add_blocked', {
            reason: 'empty_name',
            rawName,
            userId,
            type: categoryType,
            uid,
            email
        });
        setCategoryError('Informe um nome para a categoria.');
        setNewCategoryName('');
        return;
    }
    const exists = categories.some(
        (cat) => categoryService.normalizeCategoryName(cat).toLowerCase() === normalizedName.toLowerCase()
    );
    if (exists) {
        console.warn('[categories] UI_add_blocked', {
            reason: 'duplicate',
            rawName,
            userId,
            type: categoryType,
            uid,
            email
        });
        setCategoryError('Categoria já existe.');
        setNewCategoryName('');
        return;
    }
    if (categories.length >= 20) {
        setCategoryError('Limite de categorias atingido.');
        setNewCategoryName('');
        return;
    }
    Promise.resolve(onAddCategory(normalizedName))
        .then(() => {
            setCategory(normalizedName);
            setNewCategoryName('');
            setCategoryError('');
        })
        .catch((error: any) => {
            setCategoryError(error?.message || 'Falha ao salvar categoria.');
        });
  };

  const handleDeleteCategory = (catToDelete: string) => {
    const rawName = catToDelete;
    const normalizedName = categoryService.normalizeCategoryName(catToDelete);
    const uid = authUser?.uid || '';
    const email = authUser?.email || '';
    console.info('[categories] UI_remove_click', {
        type: categoryType,
        rawName,
        normalized: normalizedName,
        userId,
        uid,
        email
    });
    if (!userId) {
        console.warn('[categories] UI_remove_blocked', {
            reason: 'user_missing',
            rawName,
            userId,
            type: categoryType,
            uid,
            email
        });
        return;
    }
    if (!normalizedName) {
        console.warn('[categories] UI_remove_blocked', {
            reason: 'empty_name',
            rawName,
            userId,
            type: categoryType,
            uid,
            email
        });
        return;
    }
    Promise.resolve(onRemoveCategory(catToDelete))
        .then(() => {
            if (category === catToDelete) {
                setCategory(categories.filter(c => c !== catToDelete)[0] || '');
            }
        })
        .catch((error: any) => {
            setCategoryError(error?.message || 'Falha ao remover categoria.');
        });
  };

  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat]
    );
  };

  const handleBulkDeleteCategories = async () => {
    if (selectedCategories.length === 0) return;
    try {
      await Promise.all(selectedCategories.map((cat) => Promise.resolve(onRemoveCategory(cat))));
      if (selectedCategories.includes(category)) {
        setCategory(categories.filter(c => !selectedCategories.includes(c))[0] || '');
      }
      setSelectedCategories([]);
    } catch (error: any) {
      setCategoryError(error?.message || 'Falha ao remover categorias selecionadas.');
    }
  };

  const handleResetCategories = async () => {
    if (!onResetCategories) return;
    if (!userId) {
        console.warn('[categories] UI_reset_blocked', { reason: 'user_missing', type: categoryType });
        return;
    }
    const confirmed = window.confirm('Tem certeza que deseja zerar todas as categorias? Esta ação é irreversível.');
    if (!confirmed) return;
    try {
        await onResetCategories();
        setCategory('');
    } catch (error: any) {
        alert(error?.message || 'Falha ao zerar categorias.');
    }
  };

  useEffect(() => {
    if (!isManagingCategories) {
      setSelectedCategories([]);
      setCategoryError('');
    }
  }, [isManagingCategories]);

  const handleTypeToggle = (id: ExpenseType, enabled: boolean) => {
    setTypeDrafts(prev =>
      prev.map(option =>
        option.id === id ? { ...option, enabled } : option
      )
    );
  };

  const handleTypeLabelChange = (id: ExpenseType, label: string) => {
    setTypeDrafts(prev =>
      prev.map(option =>
        option.id === id ? { ...option, label } : option
      )
    );
  };

  const handleTypeNatureChange = (id: ExpenseType, nature: 'PJ' | 'PF') => {
    setTypeDrafts(prev =>
      prev.map(option =>
        option.id === id ? { ...option, nature } : option
      )
    );
  };

  const handleSaveTypeChanges = () => {
    if (!onUpdateExpenseTypes) {
      setIsManagingTypes(false);
      return;
    }
    const sanitized = typeDrafts.map(option => ({
      ...option,
      label: option.label.trim() || option.label,
      color: option.color?.trim() || PREMIUM_COLOR_PRESETS[0] || '#ef4444'
    }));
    if (!sanitized.some(option => option.enabled)) {
      setTypeError('Selecione pelo menos um tipo.');
      return;
    }
    if (sanitized.some(option => !option.color)) {
      setTypeError('Selecione uma cor para todos os tipos.');
      return;
    }
    onUpdateExpenseTypes(sanitized);
    const fallback = sanitized.find(option => option.enabled)?.id;
    if (fallback && onExpenseTypeChange) {
      onExpenseTypeChange(fallback);
    }
    setIsManagingTypes(false);
  };

  if (!isOpen) return null;

  // DEFINIÇÃO CHAVE: Parcelamento disponível para Crédito E Boleto
  const supportsInstallments = isCredit || paymentMethod === 'Boleto';
  const selectedAccount = availableAccounts.find(a => a.id === selectedAccountId);
  
  // Logic to lock status (e.g. Credit Card is always pending initially, installments are pending)
  const isStatusDisabled = isCredit || (isInstallment && paymentMethod === 'Boleto');

  // --- Installment Logic ---
  const numericAmount = parseFloat(amount.replace(',', '.')) || 0;
  const safeInstallmentCount =
      Number.isFinite(installmentCount) && installmentCount > 0 ? installmentCount : 0;
  let finalTotal = 0;
  let installmentValue = 0;
  const shouldPreviewInstallments = isInstallment || isInstallmentModalOpen;

  if (shouldPreviewInstallments && safeInstallmentCount > 0) {
      if (installmentValueType === 'parcel') {
          installmentValue = numericAmount;
          finalTotal = numericAmount * safeInstallmentCount;
      } else {
          finalTotal = numericAmount;
          installmentValue = numericAmount / safeInstallmentCount;
      }
  }

  const handleSave = () => {
      if (isTypeMissing) {
          alert('Selecione o tipo da despesa antes de continuar.');
          return;
      }
      const normalizedDescription = description.trim().replace(/\s+/g, ' ');
      const normalizedCategory = category.trim().replace(/\s+/g, ' ');
      const normalizedNotes = notes.trim();
      if (!normalizedDescription || !amount || !date) return;
      if (date < minDate) {
          alert('A data da despesa não pode ser anterior ao mês de abertura da empresa.');
          return;
      }
      const targetDue = dueDate || date;
      if (targetDue < minDate) {
          alert('A data de vencimento não pode ser anterior ao mês de abertura da empresa.');
          return;
      }
      if (!normalizedCategory) {
          alert('Selecione ou crie uma categoria antes de salvar.');
          return;
      }

      const resolvedTaxStatus = currentTypeOption?.nature || taxStatus || 'PJ';
      const descriptionUpper = normalizedDescription.toUpperCase();
      const categoryUpper = normalizedCategory.toUpperCase();
      const notesUpper = normalizedNotes ? normalizedNotes.toUpperCase() : '';
      const currentCardId = initialData
          ? resolveExpenseCardId(initialData as Expense & { creditCardId?: string })
          : undefined;
      const resolvedCardId = isCredit ? (selectedCardId || currentCardId || undefined) : undefined;
      if (isCredit && !resolvedCardId) {
          alert('Selecione um cartão de crédito antes de salvar.');
          return;
      }
      const resolvedAccountId = !isCredit
          ? (selectedAccountId || initialData?.accountId || undefined)
          : undefined;
      const baseExpense = {
          id: initialData?.id,
          description: descriptionUpper,
          category: categoryUpper,
          date,
          type: expenseType || undefined,
          paymentMethod,
          accountId: resolvedAccountId,
          cardId: resolvedCardId,
          status,
          notes: notesUpper,
          taxStatus: resolvedTaxStatus
      };

      console.info('[form-save]', { entityName, isEditing, primaryLabel });

      const activeTourStep = tourSimulationStepId || detectTourSimulationStep();
      if (activeTourStep) {
          if (typeof window !== 'undefined') {
              window.dispatchEvent(
                  new CustomEvent('mm:tour-expense-simulated', {
                      detail: { stepId: activeTourStep }
                  })
              );
          }
          onClose();
          return;
      }

      // LOGIC: Check supportsInstallments instead of just isCredit
      if (supportsInstallments && isInstallment && !initialData) {
          // GENERATE MULTIPLE EXPENSES
          const groupId = Math.random().toString(36).substr(2, 9);
          const expensesToSave = [];
          
          for (let i = 0; i < installmentCount; i++) {
              // Calculate Due Date based on the Initial Due Date (manual or calculated)
              const baseDue = new Date(dueDate + 'T12:00:00');
              baseDue.setMonth(baseDue.getMonth() + i);
              const specificDueDate = baseDue.toISOString().split('T')[0];

              expensesToSave.push({
                  ...baseExpense,
                  id: Math.random().toString(36).substr(2, 9), 
                  amount: installmentValue,
                  dueDate: specificDueDate,
                  installments: true,
                  installmentNumber: i + 1,
                  totalInstallments: installmentCount,
                  installmentGroupId: groupId,
                  description: `${descriptionUpper} (${i+1}/${installmentCount})`,
                  // Force Pending for future installments
                  status: 'pending' 
              });
          }
          onSave(expensesToSave); 
      } else {
          const effectiveApplyScope =
              showApplyScope && applyScope === 'series' && !hasExplicitGroupId ? 'single' : applyScope;
          const payload = {
              ...baseExpense,
              amount: parseFloat(amount.replace(',', '.')),
              dueDate: (isCredit || paymentMethod === 'Boleto') ? targetDue : date, 
          } as any;
          if (showApplyScope) {
              payload.applyScope = effectiveApplyScope;
          }
          onSave(payload);
      }
      onClose();
  };

  useEffect(() => {
    if (!onPrimaryActionRef) return;
    onPrimaryActionRef(handleSave);
  }, [handleSave, onPrimaryActionRef]);

  const headerIcon = React.isValidElement(config.icon)
    ? React.cloneElement(config.icon, { className: 'text-white' })
    : config.icon;
  const saveButtonLabel = isTourSimulationSession ? 'Salvar' : primaryLabel;

  const amountTextClass = config.colorClass.split(' ')[0];
  const formContent = (
    <>
      {!isInline && !isDock && (
        <div className={`flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 bg-gradient-to-r ${config.headerGradient}`}>
          <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
            {headerIcon}
            {initialData ? 'Editar Despesa' : config.title}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] text-zinc-400 dark:text-zinc-400">
              ESC fecha
            </span>
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className={`${contentPadding} ${contentSpacing}`}>

        {allowTypeSelection && (
        <div className="space-y-0.5 mt-0.5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>
                Tipo de despesa
              </label>
              {onUpdateExpenseTypes && (
                <button
                  type="button"
                  onClick={() => setIsManagingTypes(true)}
                  className={`text-[10px] font-semibold flex items-center gap-1 transition-colors ${config.colorClass.split(' ')[0]}`}
                >
                  <Edit2 size={10} /> Editar
                </button>
              )}
            </div>
            <SelectDropdown
              value={expenseType || ''}
              onChange={(value) => onExpenseTypeChange?.(value as ExpenseType)}
              options={[
                ...(expenseType && !enabledTypeOptions.some(option => option.id === expenseType) && currentTypeOption
                  ? [{ value: currentTypeOption.id, label: currentTypeOption.label }]
                  : []),
                ...enabledTypeOptions.map(option => ({ value: option.id, label: option.label }))
              ]}
              placeholder="Selecione"
              buttonClassName={selectBaseClass}
              listClassName="max-h-56"
              placeholderClassName="text-[11px] font-normal text-zinc-400"
            />
            {isTypeMissing && (
              <p className="text-[11px] text-rose-500">
                Selecione um tipo para continuar.
              </p>
            )}
          </div>
        )}

        {isMobile && !isEditing && (
          <div className="space-y-1">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptFileChange}
            />
            <button
              type="button"
              onClick={handleReceiptCaptureClick}
              disabled={isScanningReceipt}
              className={`${selectBaseClass} flex items-center justify-center gap-2 w-full`}
            >
              {isScanningReceipt ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Lendo comprovante...
                </>
              ) : (
                <>
                  <Camera size={14} />
                  Fotografar comprovante
                </>
              )}
            </button>
            {receiptPreviewUrl && (
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40 p-2">
                <img
                  src={receiptPreviewUrl}
                  alt="Prévia do comprovante"
                  className="h-24 w-full rounded-lg object-cover"
                />
              </div>
            )}
            {receiptScanMessage && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Sparkles size={12} />
                {receiptScanMessage}
              </p>
            )}
            {receiptScanError && (
              <p className="text-[11px] text-rose-500">{receiptScanError}</p>
            )}
          </div>
        )}
        
        <div className="space-y-0.5">
          <label htmlFor={fieldId('description')} className={labelClass}>
            Descrição / Origem
          </label>
          <input 
            id={fieldId('description')}
            name="description"
            type="text" 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-preserve-case="true"
            placeholder="Ex.: Aluguel, supermercado, Netflix..."
            className={inputBaseClass}
          />
        </div>

        <div className="space-y-0.5">
            <label htmlFor={fieldId('amount')} className={labelClass}>
              Valor (R$)
            </label>
            <input 
                id={fieldId('amount')}
                name="amount"
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex.: R$ 0,00"
                className={`${inputBaseClass} font-bold ${amountTextClass}`}
            />
        </div>

        <div className="space-y-0.5 relative">
            <div className="flex justify-between items-center min-h-[10px] mb-0.5">
                <label htmlFor={fieldId('category')} className={labelClass}>
                  Categoria
                </label>
                <button 
                    type="button"
                    onClick={() => setIsManagingCategories(true)}
                    className={`text-[10px] font-semibold flex items-center gap-1 transition-colors ${config.colorClass.split(' ')[0]}`}
                >
                    <Edit2 size={10} /> Editar
                </button>
            </div>
            
            {isManagingCategories ? (
                <div className="fixed inset-0 z-[1300]">
                    <button
                        type="button"
                        onClick={() => setIsManagingCategories(false)}
                        className="absolute inset-0 bg-black/40"
                        aria-label="Fechar categorias"
                    />
                    <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col">
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Categorias</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Gerencie e crie novas.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsManagingCategories(false)}
                                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                                aria-label="Fechar categorias"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="pt-3 flex-1 overflow-hidden px-0.5">
                            <div className="flex gap-2 mb-3">
                                <input 
                                    id={fieldId('category-new')}
                                    name="categoryNew"
                                    autoFocus
                                    type="text" 
                                    placeholder={categoryError || 'Nova categoria...'}
                                    value={newCategoryName}
                                    onChange={(e) => {
                                      setNewCategoryName(e.target.value);
                                      setCategoryError('');
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                    className={`${inputBaseClass} flex-1 w-auto ${categoryError ? 'border-red-500 focus:border-red-500 focus:ring-red-500 placeholder:text-red-500' : ''}`}
                                    aria-label="Nova categoria"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddCategory}
                                    aria-label="Adicionar categoria"
                                    className={`text-white px-3 py-2 rounded-md ${config.btnClass}`}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <div className="custom-scrollbar space-y-0.5">
                                {categories.length === 0 ? (
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
                                        Sem categorias, crie uma
                                    </div>
                                ) : (
                                    categories.map(cat => (
                                        <div key={cat} className="flex justify-between items-center px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={selectedCategories.includes(cat)}
                                                onChange={() => toggleCategorySelection(cat)}
                                                className={`h-3.5 w-3.5 ${config.accentClass}`}
                                                aria-label={`Selecionar categoria ${cat}`}
                                              />
                                              <span className="text-sm text-zinc-700 dark:text-zinc-300">{cat}</span>
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteCategory(cat)}
                                              aria-label={`Remover categoria ${cat}`}
                                              className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className={`mt-2 ${selectedCategories.length > 0 ? 'grid grid-cols-2 gap-2' : ''}`}>
                              {selectedCategories.length > 0 && (
                                  <button
                                      type="button"
                                      onClick={handleBulkDeleteCategories}
                                      className="w-full rounded-md border border-red-200 text-red-600 text-xs font-semibold py-2 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                                  >
                                      Excluir selecionadas ({selectedCategories.length})
                                  </button>
                              )}
                              {onResetCategories && (
                                  <button
                                      type="button"
                                      onClick={handleResetCategories}
                                      className={`${selectedCategories.length > 0 ? '' : 'w-full'} rounded-md border border-red-200 text-red-600 text-xs font-semibold py-2 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
                                  >
                                      Zerar categorias
                                  </button>
                              )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <SelectDropdown
                    value={category}
                    onChange={setCategory}
                    options={[
                        ...(category && !categories.includes(category) ? [{ value: category, label: category }] : []),
                        ...categories.map(cat => ({ value: cat, label: cat }))
                    ]}
                    placeholder={categories.length === 0 ? 'Sem categorias, crie uma' : 'Selecione'}
                    disabled={categories.length === 0}
                    buttonClassName={selectBaseClass}
                    listClassName="max-h-56"
                    placeholderClassName="text-[11px] font-normal text-zinc-400"
                />
            )}
        </div>

        <div className="space-y-0.5">
            <label htmlFor={fieldId('date')} className={labelClass}>
              Data de lançamento
            </label>
            <WheelDatePicker
                value={date}
                onChange={setDate}
                minDate={minDate}
                defaultDate={defaultDate}
                buttonClassName={inputBaseClass}
                ariaLabel="Selecionar data de lançamento"
            />
        </div>

        <div className="space-y-0.5">
            <label htmlFor={fieldId('payment-method')} className={labelClass}>
              Forma de Pagamento
            </label>
            <SelectDropdown
                value={paymentMethod}
                onChange={handlePaymentMethodSelect}
                options={paymentMethodOptions}
                placeholder="Selecione"
                buttonClassName={selectBaseClass}
                listClassName="max-h-56"
            />
        </div>

        <div className="space-y-0.5">
            <label htmlFor={fieldId('payment-account')} className={labelClass}>
              Conta de Pagamento
            </label>
            <SelectDropdown
                value={isCredit ? selectedCardId : selectedAccountId}
                onChange={(value) => isCredit ? setSelectedCardId(value) : setSelectedAccountId(value)}
                options={paymentAccountOptions.filter(option => !option.disabled).map(option => ({
                    value: option.value,
                    label: option.label
                }))}
                placeholder={
                    paymentAccountOptions.length === 1 && paymentAccountOptions[0].disabled
                        ? paymentAccountOptions[0].label
                        : 'Selecione'
                }
                disabled={paymentAccountOptions.length === 0 || paymentAccountOptions.every(option => option.disabled)}
                buttonClassName={selectBaseClass}
                listClassName="max-h-56"
            />
            {isCredit && selectedCardId && (
                <div className="mt-1">
                    <CardTag card={creditCards.find(c => c.id === selectedCardId)} />
                </div>
            )}
            {!isCredit && selectedAccount && (
                <div className="mt-1">
                    <CardTag label={selectedAccount.name} color={getAccountColor(selectedAccount)} />
                </div>
            )}
        </div>

        <div className="space-y-0.5">
            <label htmlFor={fieldId('dueDate')} className={labelClass}>
              Data de Vencimento
            </label>
            <WheelDatePicker
                value={dueDate}
                onChange={setDueDate}
                minDate={minDate}
                defaultDate={defaultDate}
                disabled={isCredit}
                buttonClassName={`${inputBaseClass} ${isCredit ? 'opacity-50' : ''}`}
                ariaLabel="Selecionar data de vencimento"
            />
        </div>

        <div className="space-y-0.5">
          <label className={labelClass}>Status</label>
          <div className={`grid grid-cols-2 gap-1.5 w-full ${isStatusDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
              type="button"
              onClick={() => setStatus('paid')}
              className={`${selectBaseClass} flex items-center justify-center gap-2 w-full`}
              aria-pressed={status === 'paid'}
            >
              <span className={`h-2.5 w-2.5 rounded-full border ${status === 'paid' ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-400'}`} />
              <span className={status === 'paid' ? 'text-emerald-500' : ''}>Pago</span>
            </button>
            <button
              type="button"
              onClick={() => setStatus('pending')}
              className={`${selectBaseClass} flex items-center justify-center gap-2 w-full`}
              aria-pressed={status === 'pending'}
            >
              <span className={`h-2.5 w-2.5 rounded-full border ${status === 'pending' ? 'bg-amber-500 border-amber-500' : 'border-zinc-400'}`} />
              <span className={status === 'pending' ? 'text-amber-500' : ''}>Pendente</span>
            </button>
          </div>
          {supportsInstallments && !initialData && (
            <button
              type="button"
              onClick={() => setIsInstallmentModalOpen(true)}
              className={`${selectBaseClass} flex items-center justify-between w-full`}
            >
              Despesa Parcelada
              <span className="text-[10px]">Adicionar</span>
            </button>
          )}
        </div>

        {showApplyScope && (
            <div className="space-y-1">
                <label className={labelClass}>Aplicar alterações</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${applyScope === 'single' ? 'border-zinc-400 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                        <input
                            type="radio"
                            id={fieldId('edit-scope-single')}
                            name={fieldId('edit-scope')}
                            value="single"
                            checked={applyScope === 'single'}
                            onChange={() => setApplyScope('single')}
                            className="text-zinc-600 focus:ring-zinc-500"
                        />
                        Apenas este item
                    </label>
                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${applyScope === 'series' ? 'border-zinc-400 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                        <input
                            type="radio"
                            id={fieldId('edit-scope-series')}
                            name={fieldId('edit-scope')}
                            value="series"
                            checked={applyScope === 'series'}
                            onChange={() => setApplyScope('series')}
                            className="text-zinc-600 focus:ring-zinc-500"
                        />
                        Este e próximos
                    </label>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Atualiza as parcelas futuras da mesma série.
                </p>
                {!hasExplicitGroupId && applyScope === 'series' && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Não foi possível identificar a série com segurança. Esta alteração será aplicada apenas a este item.
                    </p>
                )}
            </div>
        )}

        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={() => setIsNotesModalOpen(true)}
            className={`${selectBaseClass} flex items-center justify-between w-full`}
          >
            Observações
            <span className="text-[10px]">Adicionar</span>
          </button>
        </div>

        {isManagingTypes && (
          <div className="fixed inset-0 z-[1300]">
            <button
              type="button"
              onClick={() => setIsManagingTypes(false)}
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar tipos"
            />
            <div
              className={
                isMobile
                  ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                  : 'absolute left-1/2 bottom-6 w-full max-w-2xl -translate-x-1/2 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 max-h-[80vh] flex flex-col'
              }
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Tipos de despesa</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Ative, desative e renomeie.</p>
                  <p className="text-[11px] text-amber-500 mt-1">
                    Ao renomear um tipo, todas as despesas já lançadas passarão a usar o novo nome.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsManagingTypes(false)}
                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                  aria-label="Fechar tipos"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="pt-3 flex-1 overflow-hidden px-0.5 space-y-2">
                {typeDrafts.map(option => (
                  <div key={option.id} className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={option.enabled}
                        onChange={(event) => handleTypeToggle(option.id, event.target.checked)}
                        className={`h-3.5 w-3.5 ${config.accentClass}`}
                        aria-label={`Ativar ${option.label}`}
                      />
                      <input
                        type="text"
                        value={option.label}
                        onChange={(event) => handleTypeLabelChange(option.id, event.target.value)}
                        className={`${inputBaseClass} flex-1`}
                        aria-label={`Nome do tipo ${option.label}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500">Natureza</label>
                        <SelectDropdown
                          value={option.nature}
                          onChange={(value) => handleTypeNatureChange(option.id, value as 'PJ' | 'PF')}
                          options={[
                            { value: 'PJ', label: 'PJ' },
                            { value: 'PF', label: 'PF' }
                          ]}
                          placeholder="Selecione"
                          buttonClassName={compactSelectClass}
                          listClassName="max-h-40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500">Cor da tag</label>
                        <div className="grid grid-cols-6 gap-1">
                          {PREMIUM_COLOR_PRESETS.slice(0, 18).map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setTypeDrafts(prev => prev.map(item => item.id === option.id ? { ...item, color } : item))}
                              className={`h-5 w-5 rounded-full border ${option.color === color ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'border-white/20'}`}
                              style={{ backgroundColor: color }}
                              aria-label={`Selecionar cor ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {typeError && (
                  <p className="text-[11px] text-rose-500">{typeError}</p>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsManagingTypes(false)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTypeChanges}
                  className={`rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white transition ${config.btnClass}`}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {isInstallmentModalOpen && (
          <div className="fixed inset-0 z-[1300]">
            <button
              type="button"
              onClick={() => setIsInstallmentModalOpen(false)}
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar parcelamento"
            />
            <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-3 max-h-[60dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Despesa Parcelada</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Defina as parcelas da despesa.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInstallmentModalOpen(false)}
                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                  aria-label="Fechar parcelamento"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3">
                <label htmlFor={fieldId('installment-count')} className={labelClass}>
                  Quantidade de parcelas
                </label>
                <input
                  id={fieldId('installment-count')}
                  name="installmentCount"
                  type="number"
                  min="2"
                  max="99"
                  value={installmentCount}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setInstallmentCount(Number.isFinite(parsed) && parsed > 0 ? parsed : 2);
                  }}
                  className={inputBaseClass}
                />
                <div className="space-y-2">
                  <label className={labelClass}>O valor informado acima é:</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="radio"
                        id={fieldId('value-total')}
                        name={fieldId('value-type')}
                        checked={installmentValueType === 'total'}
                        onChange={() => setInstallmentValueType('total')}
                        className="text-zinc-600 focus:ring-zinc-500"
                      />
                      Valor Total (será dividido)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="radio"
                        id={fieldId('value-parcel')}
                        name={fieldId('value-type')}
                        checked={installmentValueType === 'parcel'}
                        onChange={() => setInstallmentValueType('parcel')}
                        className="text-zinc-600 focus:ring-zinc-500"
                      />
                      Valor da Parcela
                    </label>
                  </div>
                </div>
                <div className="rounded-lg bg-white/80 dark:bg-[#1a1a1a] p-3 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1">Resumo</p>
                  <p className="text-base font-bold text-zinc-900 dark:text-white">
                    {installmentCount}x de R$ {installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-zinc-500 mb-2">
                    Valor Total: R$ {finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  {firstInstallmentDate && lastInstallmentDate && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                      {firstInstallmentDate} - {lastInstallmentDate}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsInstallment(false);
                    setIsInstallmentModalOpen(false);
                  }}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                >
                  Desativar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsInstallment(true);
                    setIsInstallmentModalOpen(false);
                  }}
                  className={`rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white transition ${config.btnClass}`}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {isNotesModalOpen && (
          <div className="fixed inset-0 z-[1300]">
            <button
              type="button"
              onClick={() => setIsNotesModalOpen(false)}
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar observações"
            />
            <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Observações</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Anote detalhes adicionais.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNotesModalOpen(false)}
                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                  aria-label="Fechar observações"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-4">
                <textarea
                  id={fieldId('notes')}
                  name="notes"
                  rows={4}
                  placeholder="DETALHES ADICIONAIS..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-preserve-case="true"
                  className={textareaBaseClass}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsNotesModalOpen(false)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setIsNotesModalOpen(false)}
                  className={`rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white transition ${config.btnClass}`}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {!hideFooter && (
        <div className={`${footerPadding} border-t border-white/10 bg-white/70 dark:bg-black/20`}>
          <div className={isDockDesktop ? 'grid grid-cols-2 gap-3 w-full' : 'flex justify-end gap-3'}>
            <button
              onClick={onClose}
              className={`h-10 sm:h-11 px-5 sm:px-6 rounded-lg sm:rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm sm:text-base text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                isDockDesktop ? 'w-full' : ''
              }`}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              data-tour-action={isTourSimulationSession ? 'tour-expense-save' : undefined}
              disabled={isTypeMissing}
              className={`h-10 sm:h-11 px-5 sm:px-6 rounded-lg sm:rounded-xl text-sm sm:text-base text-white font-bold transition-all active:scale-95 ${config.btnClass} ${
                isTypeMissing ? 'opacity-60 cursor-not-allowed' : ''
              } ${isDockDesktop ? 'w-full' : ''}`}
            >
              {saveButtonLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isInline) {
    if (isMobile) {
      return (
        <div className="w-full bg-transparent">
          {formContent}
        </div>
      );
    }

    return (
      <div
        className="fixed bottom-4 left-1/2 z-[900] w-[min(100%-32px,960px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0b0b10] text-zinc-900 dark:text-white shadow-2xl"
      >
        {formContent}
      </div>
    );
  }

  if (isDock) {
    if (!isOpen) return null;
    return (
      <div
        className="fixed inset-0 z-[1200]"
        data-modal-root="true"
        data-tour-anchor={isOpen ? 'expenses-new-expense-modal' : undefined}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
          aria-label="Fechar despesa"
        />
        <div
          className={
            isMobile
              ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
              : 'absolute left-1/2 -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]'
          }
          style={
            isMobile
              ? undefined
              : {
                  bottom: 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 10px)',
                  maxHeight:
                    'max(320px, calc(var(--mm-content-available-height, 720px) - 20px))'
                }
          }
        >
          {isDockDesktop && (
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{initialData ? 'Editar Despesa' : config.title}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Preencha os dados da despesa.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                aria-label="Fechar despesa"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          <div className={isDockDesktop ? 'pt-3 flex-1 overflow-auto' : ''}>{formContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div data-tour-anchor={isOpen ? 'expenses-new-expense-modal' : undefined}>
      <div
        className="fixed inset-0 z-[1200]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        tabIndex={-1}
        data-modal-root="true"
        ref={modalRootRef}
      >
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
        <div className="relative flex h-full w-full items-stretch justify-center px-4 sm:px-6 lg:px-10">
          <div className="relative w-full h-full max-w-5xl bg-white dark:bg-[#0d0d10] text-left shadow-2xl transition-all border border-white/10 dark:border-zinc-800/60 overflow-y-auto">
            {formContent}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewExpenseModal;
