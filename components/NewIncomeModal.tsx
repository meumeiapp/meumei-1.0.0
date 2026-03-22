
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, ArrowUpCircle, ChevronDown } from 'lucide-react';
import { Income, Account } from '../types';
import { categoryService } from '../services/categoryService';
import { useAuth } from '../contexts/AuthContext';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import SelectDropdown from './common/SelectDropdown';
import WheelDatePicker from './common/WheelDatePicker';
import { modalInputClass, modalLabelClass, modalTextareaClass } from './ui/PremiumModal';
import { TOUR_SIMULATED_ACCOUNT_PREFIX } from '../services/tourSimulationService';
import {
  INCOME_FISCAL_NATURE_OPTIONS,
  type IncomeFiscalNature,
  resolveIncomeFiscalNature
} from '../utils/incomeFiscalNature';

interface NewIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (income: any) => void;
  initialData?: Income | null;
  variant?: 'modal' | 'inline' | 'dock';
  hideFooter?: boolean;
  onPrimaryActionRef?: (handler: () => void) => void;
  accounts: Account[];
  categories: string[];
  userId?: string | null;
  categoryType: 'incomes';
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  onResetCategories?: () => Promise<void> | void;
  defaultDate?: Date; // New prop
  minDate: string;
}

type TourIncomeAutofillStage =
  | 'description'
  | 'amount'
  | 'tax-status'
  | 'category-manager'
  | 'category-name'
  | 'category-add'
  | 'competence-date'
  | 'payment-method'
  | 'account'
  | 'received-date'
  | 'installment-open'
  | 'installment-count'
  | 'installment-value-parcel'
  | 'notes-open'
  | 'notes-write'
  | 'notes-save'
  | 'save';

const NewIncomeModal: React.FC<NewIncomeModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData,
  variant = 'modal',
  hideFooter = false,
  onPrimaryActionRef,
  accounts,
  categories,
  userId,
  categoryType,
  onAddCategory,
  onRemoveCategory,
  onResetCategories,
  defaultDate,
  minDate
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  
  // Date Fields
  const [date, setDate] = useState(''); // Data de Recebimento (Caixa)
  const [competenceDate, setCompetenceDate] = useState(''); // Data de Competência (Serviço realizado)
  
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [status, setStatus] = useState<'pending' | 'received'>('received');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [taxStatus, setTaxStatus] = useState<'PJ' | 'PF' | ''>('');
  const [naturezaFiscal, setNaturezaFiscal] = useState<IncomeFiscalNature>('RECEITA_OPERACIONAL');
  const [naturezaFiscalTouched, setNaturezaFiscalTouched] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(true);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [isNaturezaFiscalPickerOpen, setIsNaturezaFiscalPickerOpen] = useState(false);
  const [isPaymentMethodPickerOpen, setIsPaymentMethodPickerOpen] = useState(false);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isTourSimulationSession, setIsTourSimulationSession] = useState(false);
  const tourAutoFillTimersRef = useRef<number[]>([]);
  const hasTourAutoFilledRef = useRef(false);
  const hasTourEditAutoFilledRef = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});
  const hasInitializedRef = useRef(false);
  const lastInitialIdRef = useRef<string | null>(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const { user: authUser } = useAuth();
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const availableAccounts = useMemo(
    () => accounts.filter(acc => !acc.locked),
    [accounts]
  );
  const isMobile = useIsMobile();
  const isInline = variant === 'inline';
  const isDock = variant === 'dock';
  const isDockDesktop = isDock && !isMobile;
  const selectListClassName = isDockDesktop ? '' : 'max-h-56';
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
      ? 'px-2.5 py-1.5'
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
  const isEditing = Boolean(initialData);
  const entityName = 'Entrada';
  const primaryLabel = getPrimaryActionLabel(entityName, isEditing);
  const fieldIdPrefix = initialData?.id ? `income-${initialData.id}` : 'income-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;

  const detectTourSimulationMode = () => {
      if (typeof document === 'undefined') return false;
      return Boolean(document.querySelector('[data-tour-overlay="true"][data-tour-step="incomes"]'));
  };

  const emitTourAutofillStage = (stage: TourIncomeAutofillStage) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(
          new CustomEvent('mm:tour-income-autofill-stage', {
              detail: { stage }
          })
      );
  };

  const clearTourAutoFillTimers = () => {
      if (typeof window === 'undefined') return;
      tourAutoFillTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      tourAutoFillTimersRef.current = [];
  };

  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  // Installment (Boleto Parcelado) State
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentValueType, setInstallmentValueType] = useState<'parcel' | 'total'>('total'); 
  const [applyScope, setApplyScope] = useState<'single' | 'series'>('single');
  const showApplyScope =
      isEditing &&
      Boolean(initialData?.installments) &&
      Boolean((initialData?.totalInstallments ?? 0) > 1);
  
  // Installment Dates Summary
  const [lastInstallmentDate, setLastInstallmentDate] = useState('');

  const taxStatusOptions = useMemo(
      () => [
          { value: 'PJ', label: 'PJ (Empresarial/MEI)' },
          { value: 'PF', label: 'PF (Pessoal)' }
      ],
      []
  );

  const paymentMethodOptions = useMemo(
      () => [
          { value: 'Pix', label: 'Pix' },
          { value: 'Dinheiro', label: 'Dinheiro' },
          { value: 'Transferência', label: 'Transferência' },
          { value: 'Boleto', label: 'Boleto' },
          { value: 'Crédito', label: 'Crédito' },
          { value: 'Débito', label: 'Débito' }
      ],
      []
  );
  const selectedNaturezaFiscalLabel = useMemo(
      () => INCOME_FISCAL_NATURE_OPTIONS.find(option => option.value === naturezaFiscal)?.label || '',
      [naturezaFiscal]
  );
  const selectedPaymentMethodLabel = useMemo(
      () => paymentMethodOptions.find(option => option.value === paymentMethod)?.label || '',
      [paymentMethodOptions, paymentMethod]
  );

  const accountOptions = useMemo(
      () => {
          if (availableAccounts.length === 0) {
              return [{ value: '', label: 'Nenhuma conta disponível', disabled: true }];
          }
          return availableAccounts.map((acc) => ({ value: acc.id, label: acc.name }));
      },
      [availableAccounts]
  );
  const selectableAccountOptions = useMemo(
      () => accountOptions.filter(option => !option.disabled),
      [accountOptions]
  );
  const selectedAccountLabel = useMemo(
      () => selectableAccountOptions.find(option => option.value === selectedAccountId)?.label || '',
      [selectableAccountOptions, selectedAccountId]
  );
  const accountPlaceholder =
      accountOptions.length === 1 && accountOptions[0].disabled
          ? accountOptions[0].label
          : 'Selecione';

  const clampToMinDate = (value: string) => {
      if (!value) return minDate;
      return value < minDate ? minDate : value;
  };

  useEffect(() => {
    if (!isOpen) {
        clearTourAutoFillTimers();
        hasTourAutoFilledRef.current = false;
        hasTourEditAutoFilledRef.current = false;
        hasInitializedRef.current = false;
        lastInitialIdRef.current = initialData?.id ?? null;
        setIsNaturezaFiscalPickerOpen(false);
        setIsPaymentMethodPickerOpen(false);
        setIsAccountPickerOpen(false);
        setIsCategoryPickerOpen(false);
        setIsManagingCategories(false);
        setNewCategoryName('');
        setIsTourSimulationSession(false);
        return;
    }

    setIsTourSimulationSession(detectTourSimulationMode());

    const currentInitialId = initialData?.id ?? null;
    const shouldInit = !hasInitializedRef.current || lastInitialIdRef.current !== currentInitialId;
    if (!shouldInit) return;

    hasInitializedRef.current = true;
    lastInitialIdRef.current = currentInitialId;

    if (initialData) {
        setDescription(initialData.description);
        setAmount(initialData.amount.toString());
        setCategory(initialData.category);
        setDate(clampToMinDate(initialData.date));
        setCompetenceDate(clampToMinDate(initialData.competenceDate || initialData.date));
        setSelectedAccountId(initialData.accountId);
        setStatus(initialData.status);
        setPaymentMethod(initialData.paymentMethod || '');
        setNotes(initialData.notes || '');
        setTaxStatus(initialData.taxStatus || '');
        const normalizedNaturezaFiscal = resolveIncomeFiscalNature({
            naturezaFiscal: initialData.naturezaFiscal,
            description: initialData.description,
            category: initialData.category
        });
        setNaturezaFiscal(normalizedNaturezaFiscal);
        setNaturezaFiscalTouched(Boolean(initialData.naturezaFiscal));
        setIsNotesOpen(false);
        setIsInstallment(false);
        setApplyScope('single');
        return;
    }

    // Reset form
    setDescription('');
    setAmount('');
    setCategory('');
    
    // Logic to set default date similar to Expenses
    const now = new Date();
    let initialDateStr = now.toISOString().split('T')[0];

    if (defaultDate) {
        const isSameMonth = defaultDate.getMonth() === now.getMonth() && defaultDate.getFullYear() === now.getFullYear();
        if (!isSameMonth) {
            const d = new Date(defaultDate);
            d.setHours(12);
            initialDateStr = d.toISOString().split('T')[0];
        }
    }

    const clamped = clampToMinDate(initialDateStr);
    setDate(clamped);
    setCompetenceDate(clampToMinDate(initialDateStr));
    setSelectedAccountId('');
    setStatus('received');
    setPaymentMethod('');
    setNotes('');
    setTaxStatus('');
    setNaturezaFiscal('RECEITA_OPERACIONAL');
    setNaturezaFiscalTouched(false);
    setIsNotesOpen(false);
    setIsInstallment(false);
    setInstallmentCount(2);
    setInstallmentValueType('total');
    setApplyScope('single');
  }, [isOpen, initialData, defaultDate, minDate]);

  useEffect(() => {
    if (!isOpen) return;
    if (naturezaFiscalTouched) return;
    setNaturezaFiscal(
      resolveIncomeFiscalNature({
        naturezaFiscal: undefined,
        description,
        category
      })
    );
  }, [isOpen, naturezaFiscalTouched, description, category]);

  useEffect(() => {
    if (!isOpen || !isTourSimulationSession) return;
    const handleTourEnd = () => onClose();
    window.addEventListener('mm:first-access-tour-ended', handleTourEnd);
    return () => window.removeEventListener('mm:first-access-tour-ended', handleTourEnd);
  }, [isOpen, isTourSimulationSession, onClose]);

  useEffect(() => {
    return () => clearTourAutoFillTimers();
  }, []);

  useEffect(() => {
    if (!isInline && isOpen) {
      requestAnimationFrame(() => {
        modalRootRef.current?.focus();
      });
    }
  }, [isInline, isOpen]);

  // Calculate Last Installment Date for preview
  useEffect(() => {
    if (isInstallment && installmentCount > 0 && date) {
        const firstDate = new Date(date + 'T12:00:00');
        const lastDate = new Date(firstDate);
        lastDate.setMonth(lastDate.getMonth() + (installmentCount - 1));
        setLastInstallmentDate(lastDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    } else {
        setLastInstallmentDate('');
    }
  }, [isInstallment, installmentCount, date]);

  // --- LÓGICA DE STATUS AUTOMÁTICO ---
  const handlePaymentMethodSelect = (newMethod: string) => {
      setPaymentMethod(newMethod);
      setIsPaymentMethodPickerOpen(false);

      if (newMethod === 'Crédito' || newMethod === 'Boleto') {
          setStatus('pending');
      } else {
          setStatus('received');
      }
  };

  const handleAddCategory = async () => {
    const rawName = newCategoryName;
    const normalizedName = categoryService.normalizeCategoryName(newCategoryName);
    const uid = authUser?.uid || '';
    const email = authUser?.email || '';
    console.info('[categories] UI_add_click', {
        screen: 'NewIncomeModal',
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
    if (categories.length >= 40) {
        setCategoryError('Limite de 40 categorias atingido.');
        setNewCategoryName('');
        return;
    }
    try {
        await onAddCategory(normalizedName);
        setCategory(normalizedName);
        setNewCategoryName('');
        setCategoryError('');
    } catch (error: any) {
        setCategoryError(error?.message || 'Falha ao salvar categoria.');
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
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
    try {
      await onRemoveCategory(catToDelete);
      if (editingCategory === catToDelete) {
        setEditingCategory(null);
        setEditingCategoryName('');
      }
      if (category === catToDelete) {
        setCategory(categories.filter(c => c !== catToDelete)[0] || '');
      }
      setCategoryError('');
    } catch (error: any) {
      setCategoryError(error?.message || 'Falha ao remover categoria.');
    }
  };

  const handleStartCategoryEditing = (cat: string) => {
    setEditingCategory(cat);
    setEditingCategoryName(cat);
    setCategoryError('');
  };

  const handleCancelCategoryEditing = () => {
    setEditingCategory(null);
    setEditingCategoryName('');
    setCategoryError('');
  };

  const handleSaveCategoryEdit = async (originalCategory: string) => {
    const normalizedOriginal = categoryService.normalizeCategoryName(originalCategory);
    const normalizedName = categoryService.normalizeCategoryName(editingCategoryName);
    if (!normalizedName) {
      setCategoryError('Informe um nome para a categoria.');
      return;
    }
    if (normalizedName.toLowerCase() === normalizedOriginal.toLowerCase()) {
      handleCancelCategoryEditing();
      return;
    }
    const alreadyExists = categories.some((cat) => {
      const normalizedCategory = categoryService.normalizeCategoryName(cat).toLowerCase();
      return (
        normalizedCategory !== normalizedOriginal.toLowerCase() &&
        normalizedCategory === normalizedName.toLowerCase()
      );
    });
    if (alreadyExists) {
      setCategoryError('Categoria já existe.');
      return;
    }
    let removedOriginal = false;
    try {
      await Promise.resolve(onRemoveCategory(originalCategory));
      removedOriginal = true;
      await Promise.resolve(onAddCategory(normalizedName));
      if (categoryService.normalizeCategoryName(category).toLowerCase() === normalizedOriginal.toLowerCase()) {
        setCategory(normalizedName);
      }
      handleCancelCategoryEditing();
      setCategoryError('');
    } catch (error: any) {
      if (removedOriginal) {
        try {
          await Promise.resolve(onAddCategory(normalizedOriginal));
        } catch {
          // Ignore rollback failure; original error will be shown.
        }
      }
      setCategoryError(error?.message || 'Falha ao editar categoria.');
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
      setCategoryError('');
      setNewCategoryName('');
      setEditingCategory(null);
      setEditingCategoryName('');
    }
  }, [isManagingCategories]);

  useEffect(() => {
    if (isCategoryPickerOpen || isManagingCategories) return;
    setCategoryError('');
    setNewCategoryName('');
    setEditingCategory(null);
    setEditingCategoryName('');
  }, [isCategoryPickerOpen, isManagingCategories]);

  useEffect(() => {
    if (editingCategory && !categories.includes(editingCategory)) {
      setEditingCategory(null);
      setEditingCategoryName('');
    }
  }, [categories, editingCategory]);


  const numericAmount = parseFloat(amount.replace(',', '.')) || 0;
  let installmentValue = 0;
  let finalTotal = 0;

  if (isInstallment) {
      if (installmentValueType === 'total') {
          finalTotal = numericAmount;
          installmentValue = numericAmount / installmentCount;
      } else {
          installmentValue = numericAmount;
          finalTotal = numericAmount * installmentCount;
      }
  }

  const handleSave = () => {
    const normalizedDescription = description.trim().replace(/\s+/g, ' ');
    const normalizedCategory = category.trim().replace(/\s+/g, ' ');
    const normalizedNotes = notes.trim();
    const shouldSimulateOnly = isTourSimulationSession || detectTourSimulationMode();
    const effectiveAccountId = selectedAccountId || (shouldSimulateOnly ? '__tour_account_virtual__' : '');
    if (!normalizedDescription || !amount || !date || !effectiveAccountId) return;
    if (date < minDate) {
        alert('A data da entrada não pode ser anterior ao mês de abertura da empresa.');
        return;
    }
    if (competenceDate && competenceDate < minDate) {
        alert('A data de competência não pode ser anterior ao mês de abertura da empresa.');
        return;
    }
    if (!normalizedCategory) {
        alert('Selecione ou crie uma categoria antes de salvar.');
        return;
    }

    const descriptionText = normalizedDescription;
    const categoryText = normalizedCategory;
    const notesText = normalizedNotes;
    const baseIncome = {
        id: initialData?.id,
        description: descriptionText,
        category: categoryText,
        date, 
        competenceDate: competenceDate || date,
        accountId: effectiveAccountId,
        status, 
        paymentMethod,
        notes: notesText,
        taxStatus,
        naturezaFiscal: resolveIncomeFiscalNature({
            naturezaFiscal,
            description: descriptionText,
            category: categoryText
        })
    };

    console.info('[form-save]', { entityName, isEditing, primaryLabel });

    if (shouldSimulateOnly) {
        const numericAmount = parseFloat(amount.replace(',', '.')) || 0;
        let simulatedAmount = numericAmount;
        let simulatedDescription = descriptionText;
        let simulatedInstallmentPayload: Partial<Income> = {};

        if (isInstallment && !initialData) {
            simulatedAmount = installmentValueType === 'total'
                ? (numericAmount / installmentCount)
                : numericAmount;
            simulatedDescription = `${descriptionText} (1/${installmentCount})`;
            simulatedInstallmentPayload = {
                installments: true,
                installmentNumber: 1,
                totalInstallments: installmentCount,
                installmentGroupId: `tour-income-group-${Date.now()}`
            };
        }

        if (typeof window !== 'undefined') {
            const simulatedIncomePayload = {
                ...baseIncome,
                ...simulatedInstallmentPayload,
                description: simulatedDescription,
                amount: simulatedAmount
            };
            window.dispatchEvent(
                new CustomEvent('mm:tour-income-simulated', {
                    detail: { income: simulatedIncomePayload }
                })
            );
        }
        onClose();
        return;
    }

    if (isInstallment && !initialData) {
        const groupId = Math.random().toString(36).substr(2, 9);
        const incomesToSave = [];

        for (let i = 0; i < installmentCount; i++) {
            const currentDate = new Date(date + 'T12:00:00');
            currentDate.setMonth(currentDate.getMonth() + i);
            const specificDate = currentDate.toISOString().split('T')[0];

            incomesToSave.push({
                ...baseIncome,
                id: Math.random().toString(36).substr(2, 9),
                amount: installmentValue,
                date: specificDate,
                installments: true,
                installmentNumber: i + 1,
                totalInstallments: installmentCount,
                installmentGroupId: groupId,
                description: `${descriptionText} (${i + 1}/${installmentCount})`,
                status: 'pending'
            });
        }
        onSave(incomesToSave);
    } else {
        const payload = {
            ...baseIncome,
            amount: parseFloat(amount.replace(',', '.')),
        } as any;
        if (showApplyScope) {
            payload.applyScope = applyScope;
        }
        onSave(payload);
    }
    onClose();
  };

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    if (!isOpen || !isTourSimulationSession || Boolean(initialData)) return;
    if (hasTourAutoFilledRef.current) return;

    hasTourAutoFilledRef.current = true;
    clearTourAutoFillTimers();

    const schedule = (fn: () => void, delay: number) => {
      const id = window.setTimeout(fn, delay);
      tourAutoFillTimersRef.current.push(id);
    };

    let cursor = 1850;
    const typeIn = (
      stage: TourIncomeAutofillStage,
      value: string,
      setter: (next: string) => void,
      stepMs = 160,
      pauseAfterMs = 1500
    ) => {
      schedule(() => emitTourAutofillStage(stage), Math.max(360, cursor - 420));
      schedule(() => setter(''), Math.max(220, cursor - 220));
      for (let i = 1; i <= value.length; i += 1) {
        schedule(() => setter(value.slice(0, i)), cursor + i * stepMs);
      }
      cursor += value.length * stepMs + pauseAfterMs;
    };

    const clickStep = (
      stage: TourIncomeAutofillStage,
      apply: () => void,
      clickDelayMs = 1100,
      settleDelayMs = 1300
    ) => {
      schedule(() => emitTourAutofillStage(stage), cursor);
      schedule(apply, cursor + clickDelayMs);
      cursor += clickDelayMs + settleDelayMs;
    };

    const demoDescription = 'PAGAMENTO CLIENTE GUIA';
    const demoAmount = '625.00';
    const demoCategory = 'SERVIÇOS GUIA';
    const demoNotes = 'ENTRADA DEMONSTRATIVA DO TOUR EM 4 PARCELAS.';
    const simulatedTourAccount =
      availableAccounts.find((account) => account.id.startsWith(TOUR_SIMULATED_ACCOUNT_PREFIX)) ||
      availableAccounts[0];
    const demoAccountId = simulatedTourAccount?.id || '__tour_account_virtual__';
    const baseDemoDate = clampToMinDate(new Date().toISOString().split('T')[0]);

    schedule(() => setIsInstallmentModalOpen(false), 0);
    schedule(() => setIsNotesModalOpen(false), 0);
    schedule(() => setIsManagingCategories(false), 0);

    typeIn('description', demoDescription, setDescription, 154, 1500);
    typeIn('amount', demoAmount, setAmount, 168, 1550);
    clickStep('tax-status', () => {}, 980, 780);
    clickStep('tax-status', () => setNaturezaFiscal('RECEITA_OPERACIONAL'), 1120, 1320);

    clickStep('category-manager', () => {
      setIsManagingCategories(true);
      setCategoryError('');
    });
    typeIn('category-name', demoCategory, setNewCategoryName, 150, 1300);
    clickStep(
      'category-add',
      () => {
        setCategory(demoCategory);
        setIsManagingCategories(false);
        setNewCategoryName('');
        setCategoryError('');
      },
      1140,
      1420
    );

    clickStep('competence-date', () => setCompetenceDate(baseDemoDate), 1140, 1320);
    clickStep('payment-method', () => {}, 980, 780);
    clickStep('payment-method', () => handlePaymentMethodSelect('Crédito'), 1120, 1340);
    clickStep('account', () => {}, 980, 780);
    clickStep('account', () => setSelectedAccountId(demoAccountId), 1120, 1340);
    clickStep('received-date', () => setDate(baseDemoDate), 1140, 1320);
    clickStep('installment-open', () => setIsInstallmentModalOpen(true), 1120, 1260);
    clickStep('installment-count', () => setInstallmentCount(4), 1140, 1380);
    clickStep(
      'installment-value-parcel',
      () => {
        setIsInstallment(true);
        setInstallmentValueType('parcel');
        setIsInstallmentModalOpen(false);
      },
      1140,
      1460
    );
    clickStep('notes-open', () => setIsNotesModalOpen(true), 1080, 1260);
    typeIn('notes-write', demoNotes, setNotes, 112, 1320);
    clickStep('notes-save', () => setIsNotesModalOpen(false), 1040, 1280);
    schedule(() => emitTourAutofillStage('save'), cursor);
    schedule(() => handleSaveRef.current(), cursor + 1320);

    return () => clearTourAutoFillTimers();
  }, [initialData, isOpen, isTourSimulationSession, availableAccounts, minDate]);

  useEffect(() => {
    if (!isOpen || !isTourSimulationSession || !initialData) return;
    if (hasTourEditAutoFilledRef.current) return;

    hasTourEditAutoFilledRef.current = true;
    clearTourAutoFillTimers();

    const schedule = (fn: () => void, delay: number) => {
      const id = window.setTimeout(fn, delay);
      tourAutoFillTimersRef.current.push(id);
    };

    let cursor = 1600;
    const typeIn = (
      stage: TourIncomeAutofillStage,
      value: string,
      setter: (next: string) => void,
      stepMs = 142,
      pauseAfterMs = 1280
    ) => {
      schedule(() => emitTourAutofillStage(stage), Math.max(320, cursor - 360));
      schedule(() => setter(''), Math.max(200, cursor - 200));
      for (let i = 1; i <= value.length; i += 1) {
        schedule(() => setter(value.slice(0, i)), cursor + i * stepMs);
      }
      cursor += value.length * stepMs + pauseAfterMs;
    };

    const clickStep = (
      stage: TourIncomeAutofillStage,
      apply: () => void,
      clickDelayMs = 980,
      settleDelayMs = 1180
    ) => {
      schedule(() => emitTourAutofillStage(stage), cursor);
      schedule(apply, cursor + clickDelayMs);
      cursor += clickDelayMs + settleDelayMs;
    };

    const normalizedDescription = `${(initialData.description || 'ENTRADA GUIA').replace(/\s*-\s*AJUSTE GUIA$/i, '')} - AJUSTE GUIA`;
    const normalizedNotes = initialData.notes
      ? `${initialData.notes.replace(/\s*-\s*AJUSTE GUIA$/i, '')} - AJUSTE GUIA`
      : 'OBSERVAÇÃO AJUSTADA NO GUIA.';

    typeIn('description', normalizedDescription, setDescription, 140, 1200);
    clickStep('notes-open', () => setIsNotesModalOpen(true), 980, 1120);
    typeIn('notes-write', normalizedNotes, setNotes, 104, 1080);
    clickStep('notes-save', () => setIsNotesModalOpen(false), 920, 1180);
    schedule(() => emitTourAutofillStage('save'), cursor);
    schedule(() => handleSaveRef.current(), cursor + 1180);

    return () => clearTourAutoFillTimers();
  }, [initialData, isOpen, isTourSimulationSession]);

  useEffect(() => {
    if (!onPrimaryActionRef) return;
    onPrimaryActionRef(handleSave);
  }, [handleSave, onPrimaryActionRef]);

  const dockFieldClass =
    'w-full min-h-[38px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] leading-5 text-zinc-900 dark:text-white outline-none focus:ring-2';
  const mobileInlineInputClass =
    'w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500';
  const mobileModalInputClass = isMobile
    ? (isMobileInline ? mobileInlineInputClass : 'w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500')
    : modalInputClass;
  const mobileModalTextareaClass = isMobile ? `${mobileModalInputClass} resize-none` : modalTextareaClass;
  const inputBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 pr-8 placeholder:uppercase placeholder:font-light`
    : `${mobileModalInputClass} pr-8`;
  const selectBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 text-left`
    : `${mobileModalInputClass} pr-8 text-left`;
  const desktopStatusChipClass =
    'inline-flex items-center justify-center gap-2 h-9 min-w-[140px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-4 text-[13px] leading-none text-zinc-300 outline-none focus:ring-2 focus:ring-emerald-500/40';
  const textareaBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 placeholder:uppercase placeholder:font-light min-h-[64px] resize-none`
    : `${mobileModalTextareaClass} min-h-[84px]`;
  const compactLabelClass = 'text-[10px] uppercase tracking-[0.12em] font-semibold text-white/65';
  const labelClass = isDockDesktop ? modalLabelClass : compactLabelClass;
  const saveButtonLabel = 'Salvar';
  const dockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const dockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const dockMaxHeight =
    'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';
  const closeDockPickers = () => {
    setIsNaturezaFiscalPickerOpen(false);
    setIsPaymentMethodPickerOpen(false);
    setIsAccountPickerOpen(false);
    setIsCategoryPickerOpen(false);
  };
  const renderDockPickerModal = (
    open: boolean,
    onClose: () => void,
    title: string,
    subtitle: string,
    content: React.ReactNode
  ) => {
    if (!isDockDesktop || !open) return null;
    return (
      <div className="fixed inset-0 z-[1300]">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-0 right-0 bg-black/70 backdrop-blur-sm"
          style={{ top: dockTopOffset, bottom: dockBottomOffset }}
          aria-label={`Fechar ${title}`}
        />
        <div
          className="absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl"
          style={{
            bottom: dockBottomOffset,
            maxHeight: `max(320px, ${dockMaxHeight})`
          }}
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{title}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
              aria-label={`Fechar ${title}`}
            >
              <X size={16} />
            </button>
          </div>
          <div className="pt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {content}
          </div>
        </div>
      </div>
    );
  };

  const formContent = (
    <>
      {!isInline && !isDock && (
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 bg-gradient-to-r from-emerald-500/80 via-emerald-500/35 to-black">
          <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
              <ArrowUpCircle className="text-white" />
              {initialData ? 'Editar Entrada' : 'Nova Entrada'}
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
        <div className={isDockDesktop ? 'grid grid-cols-12 gap-3' : 'space-y-2'}>
        <div
          className={isDockDesktop ? 'space-y-0.5 col-span-8' : 'space-y-0.5'}
          data-tour-anchor={isTourSimulationSession ? 'incomes-field-description' : undefined}
        >
          <label htmlFor={fieldId('description')} className={labelClass}>
            Descrição / Origem
          </label>
          <input 
            id={fieldId('description')}
            name="description"
            type="text" 
            placeholder="Ex.: Pagamento cliente X, venda loja"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-preserve-case="true"
            className={inputBaseClass}
          />
        </div>

        <div className={isDockDesktop ? 'grid grid-cols-1 gap-3 items-end col-span-4' : 'grid grid-cols-1 gap-0.5 sm:gap-3 items-end'}>
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-amount' : undefined}
            >
                <label htmlFor={fieldId('amount')} className={labelClass}>
                  Valor (R$)
                </label>
                <input 
                    id={fieldId('amount')}
                    name="amount"
                    type="number" 
                    placeholder="Ex.: R$ 0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${inputBaseClass} font-bold text-emerald-600 dark:text-emerald-400`}
                />
            </div>
            
            {/* NATUREZA FISCAL DA ENTRADA */}
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-tax-status' : undefined}
            >
                <label htmlFor={fieldId('naturezaFiscal')} className={labelClass}>
                    Natureza Fiscal
                </label>
                {isDockDesktop ? (
                  <button
                    id={fieldId('naturezaFiscal')}
                    type="button"
                    onClick={() => {
                      closeDockPickers();
                      setIsNaturezaFiscalPickerOpen(true);
                    }}
                    className={`${selectBaseClass} flex items-center justify-between w-full`}
                  >
                    <span className={selectedNaturezaFiscalLabel ? '' : 'text-[11px] font-normal text-zinc-400'}>
                      {selectedNaturezaFiscalLabel || 'Selecione'}
                    </span>
                    <ChevronDown size={14} className="text-zinc-400" />
                  </button>
                ) : (
                  <SelectDropdown
                      value={naturezaFiscal}
                      onChange={(value) => {
                          setNaturezaFiscal(value as IncomeFiscalNature);
                          setNaturezaFiscalTouched(true);
                      }}
                      options={INCOME_FISCAL_NATURE_OPTIONS}
                      placeholder="Selecione"
                      buttonClassName={selectBaseClass}
                      listClassName={selectListClassName}
                  />
                )}
            </div>
        </div>

        <div className={isDockDesktop ? 'grid grid-cols-1 gap-3 items-end col-span-8' : 'grid grid-cols-1 gap-0.5 sm:gap-3 items-end'}>
            {/* Dynamic Category Section */}
            <div
                className="space-y-0.5 relative"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-category' : undefined}
            >
                <div className={isDockDesktop ? 'flex items-center min-h-[18px] mb-0.5' : 'flex items-center'}>
                    <label htmlFor={fieldId('category')} className={`${labelClass} leading-none`}>
                      Categoria
                    </label>
                </div>
                
                {isManagingCategories ? (
                  <div className="fixed inset-0 z-[1300]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManagingCategories(false);
                        setIsCategoryPickerOpen(false);
                      }}
                      className={isDockDesktop ? 'absolute left-0 right-0 bg-black/70 backdrop-blur-sm' : 'absolute inset-0 bg-black/40'}
                      style={isDockDesktop ? { top: dockTopOffset, bottom: dockBottomOffset } : undefined}
                      aria-label="Fechar categorias"
                    />
                    <div
                      className={
                        isMobile
                          ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                          : isDockDesktop
                            ? 'absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl'
                            : 'absolute left-1/2 -translate-x-1/2 w-[min(760px,calc(100%-24px))] bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 max-h-[75dvh] flex flex-col'
                      }
                      style={
                        isMobile
                          ? undefined
                          : isDockDesktop
                            ? {
                                bottom: dockBottomOffset,
                                maxHeight: `max(320px, ${dockMaxHeight})`
                              }
                            : { bottom: dockBottomOffset }
                      }
                    >
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">Categorias</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Gerencie e crie novas.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsManagingCategories(false);
                            setIsCategoryPickerOpen(false);
                          }}
                          className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                          aria-label="Fechar categorias"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className={`pt-3 ${isDockDesktop ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : 'flex-1 overflow-hidden'} px-0.5`}>
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
                            data-tour-anchor={isTourSimulationSession ? 'incomes-field-category-new' : undefined}
                            className={`${inputBaseClass} flex-1 w-auto ${categoryError ? 'border-red-500 focus:border-red-500 focus:ring-red-500 placeholder:text-red-500' : ''}`}
                            aria-label="Nova categoria"
                          />
                          <button
                            type="button"
                            onClick={handleAddCategory}
                            data-tour-anchor={isTourSimulationSession ? 'incomes-field-category-add' : undefined}
                            aria-label="Adicionar categoria"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-md"
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
                              <div
                                key={cat}
                                className={`rounded-lg border px-2 py-1.5 ${
                                  categoryService.normalizeCategoryName(category).toLowerCase() ===
                                  categoryService.normalizeCategoryName(cat).toLowerCase()
                                    ? 'border-emerald-400/60 bg-emerald-500/10'
                                    : 'border-zinc-200/70 dark:border-zinc-800 bg-transparent'
                                }`}
                              >
                                {editingCategory === cat ? (
                                  <div className="space-y-1.5">
                                    <input
                                      type="text"
                                      value={editingCategoryName}
                                      onChange={(e) => {
                                        setEditingCategoryName(e.target.value);
                                        setCategoryError('');
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCategoryEdit(cat);
                                        if (e.key === 'Escape') handleCancelCategoryEditing();
                                      }}
                                      className={`${inputBaseClass} h-8 text-[11px]`}
                                      aria-label={`Editar categoria ${cat}`}
                                    />
                                    <div className="grid grid-cols-2 gap-1.5 h-8">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveCategoryEdit(cat)}
                                        className="rounded-md border border-emerald-500/40 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10"
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelCategoryEditing}
                                        className="rounded-md border border-zinc-300 dark:border-zinc-700 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setCategory(cat)}
                                      className="min-w-0 flex-1 text-left text-sm text-zinc-700 dark:text-zinc-300 truncate"
                                      aria-label={`Selecionar categoria ${cat}`}
                                    >
                                      {cat}
                                    </button>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleStartCategoryEditing(cat)}
                                        className="h-7 w-7 rounded-md border border-zinc-300/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 flex items-center justify-center"
                                        aria-label={`Editar categoria ${cat}`}
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCategory(cat)}
                                        aria-label={`Remover categoria ${cat}`}
                                        className="h-7 w-7 rounded-md border border-red-400/40 text-red-500 hover:bg-red-500/10 flex items-center justify-center"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="mt-2">
                          {onResetCategories && (
                            <button
                              type="button"
                              onClick={handleResetCategories}
                              className="w-full rounded-md border border-red-200 text-red-600 text-xs font-semibold py-2 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              Zerar categorias
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isDockDesktop ? (
                  <button
                    id={fieldId('category')}
                    type="button"
                    onClick={() => {
                      closeDockPickers();
                      setIsCategoryPickerOpen(true);
                    }}
                    className={`${selectBaseClass} flex items-center justify-between w-full`}
                  >
                    <span className={category ? '' : 'text-[11px] font-normal text-zinc-400'}>
                      {category || (categories.length === 0 ? 'Sem categorias, crie uma' : 'Selecione')}
                    </span>
                    <ChevronDown size={14} className="text-zinc-400" />
                  </button>
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
                    listClassName={selectListClassName}
                  />
                )}
            </div>

            {/* Data de Competência */}
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-competence-date' : undefined}
            >
                <label htmlFor={fieldId('competenceDate')} className={`${labelClass} leading-none`}>
                  DATA DA VENDA / SERVIÇO
                </label>
                <WheelDatePicker
                    value={competenceDate}
                    onChange={setCompetenceDate}
                    minDate={minDate}
                    defaultDate={defaultDate}
                    desktopMode={isDockDesktop ? 'modal' : 'native'}
                    buttonClassName={inputBaseClass}
                    ariaLabel="Selecionar data da venda ou serviço"
                />
            </div>
        </div>

        <div className={isDockDesktop ? 'grid grid-cols-1 gap-3 col-span-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-0.5 sm:gap-3'}>
             {/* Forma de Pagamento */}
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-payment-method' : undefined}
            >
                <label htmlFor={fieldId('payment-method')} className={labelClass}>
                  Forma de Pagamento
                </label>
                {isDockDesktop ? (
                  <button
                    id={fieldId('payment-method')}
                    type="button"
                    onClick={() => {
                      closeDockPickers();
                      setIsPaymentMethodPickerOpen(true);
                    }}
                    className={`${selectBaseClass} flex items-center justify-between w-full`}
                  >
                    <span className={selectedPaymentMethodLabel ? '' : 'text-[11px] font-normal text-zinc-400'}>
                      {selectedPaymentMethodLabel || 'Selecione'}
                    </span>
                    <ChevronDown size={14} className="text-zinc-400" />
                  </button>
                ) : (
                  <SelectDropdown
                      value={paymentMethod}
                      onChange={handlePaymentMethodSelect}
                      options={paymentMethodOptions}
                      placeholder="Selecione"
                      buttonClassName={selectBaseClass}
                      listClassName={selectListClassName}
                  />
                )}
            </div>
            <div className="space-y-0.5">
                <label htmlFor={fieldId('taxStatus')} className={labelClass}>
                  Regime (PJ/PF)
                </label>
                <SelectDropdown
                    value={taxStatus}
                    onChange={(value) => setTaxStatus(value as 'PJ' | 'PF')}
                    options={taxStatusOptions}
                    placeholder="Selecione"
                    buttonClassName={selectBaseClass}
                    listClassName={selectListClassName}
                />
            </div>
        </div>

        <div className={isDockDesktop ? 'grid grid-cols-2 gap-3 col-span-12 items-start' : 'space-y-0.5'}>
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-account' : undefined}
            >
                <label htmlFor={fieldId('account')} className={labelClass}>
                  Conta de Destino
                </label>
                {isDockDesktop ? (
                  <button
                    id={fieldId('account')}
                    type="button"
                    onClick={() => {
                      if (selectableAccountOptions.length === 0) return;
                      closeDockPickers();
                      setIsAccountPickerOpen(true);
                    }}
                    disabled={selectableAccountOptions.length === 0}
                    className={`${selectBaseClass} flex items-center justify-between w-full ${
                      selectableAccountOptions.length === 0 ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    <span className={selectedAccountLabel ? '' : 'text-[11px] font-normal text-zinc-400'}>
                      {selectedAccountLabel || accountPlaceholder}
                    </span>
                    <ChevronDown size={14} className="text-zinc-400" />
                  </button>
                ) : (
                  <SelectDropdown
                      value={selectedAccountId}
                      onChange={setSelectedAccountId}
                      options={accountOptions}
                      placeholder={availableAccounts.length === 0 ? 'Nenhuma conta disponível' : 'Selecione'}
                      disabled={availableAccounts.length === 0}
                      buttonClassName={selectBaseClass}
                      listClassName={selectListClassName}
                  />
                )}
            </div>
            <div
                className="space-y-0.5"
                data-tour-anchor={isTourSimulationSession ? 'incomes-field-date' : undefined}
            >
                <label htmlFor={fieldId('date')} className={labelClass}>
                    {isInstallment ? 'Data da 1ª Parcela (Caixa)' : 'Data de Recebimento (Caixa)'}
                </label>
                <WheelDatePicker
                    value={date}
                    onChange={setDate}
                    minDate={minDate}
                    defaultDate={defaultDate}
                    desktopMode={isDockDesktop ? 'modal' : 'native'}
                    buttonClassName={inputBaseClass}
                    ariaLabel="Selecionar data de recebimento"
                />
            </div>

            {/* Status (Automático mas editável) */}
            <div className={isDockDesktop ? 'space-y-0.5 col-span-2' : 'space-y-0.5'}>
                <label className={labelClass}>Status</label>
                <div className={isDockDesktop ? 'flex items-center gap-2' : 'grid grid-cols-2 gap-1.5 w-full justify-items-stretch'}>
                    <button
                        type="button"
                        onClick={() => setStatus('received')}
                        className={isDockDesktop ? desktopStatusChipClass : `${selectBaseClass} flex items-center justify-center gap-2 w-full`}
                        aria-pressed={status === 'received'}
                    >
                        <span className={`h-2.5 w-2.5 rounded-full border ${status === 'received' ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-400'}`} />
                        <span className={status === 'received' ? 'text-emerald-500' : ''}>Recebido</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatus('pending')}
                        className={isDockDesktop ? desktopStatusChipClass : `${selectBaseClass} flex items-center justify-center gap-2 w-full`}
                        aria-pressed={status === 'pending'}
                    >
                        <span className={`h-2.5 w-2.5 rounded-full border ${status === 'pending' ? 'bg-amber-500 border-amber-500' : 'border-zinc-400'}`} />
                        <span className={status === 'pending' ? 'text-amber-500' : ''}>Pendente</span>
                    </button>
                </div>
                {!initialData && (
                  <button
                    type="button"
                    onClick={() => setIsInstallmentModalOpen(true)}
                    data-tour-anchor={isTourSimulationSession ? 'incomes-field-installment-open' : undefined}
                    className={`${selectBaseClass} flex items-center justify-between w-full col-span-2`}
                  >
                    Entrada Parcelada
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
            </div>
        </div>
        </div>

        {renderDockPickerModal(
          isNaturezaFiscalPickerOpen,
          () => setIsNaturezaFiscalPickerOpen(false),
          'Selecionar Natureza Fiscal',
          'Toque para selecionar e voltar.',
          <div className="grid grid-cols-6 gap-2">
            {INCOME_FISCAL_NATURE_OPTIONS.map((option) => {
              const isActive = option.value === naturezaFiscal;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setNaturezaFiscal(option.value);
                    setNaturezaFiscalTouched(true);
                    setIsNaturezaFiscalPickerOpen(false);
                  }}
                  className={`h-16 rounded-lg border px-3 py-2 text-[12px] font-semibold leading-tight text-left break-words transition ${
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-500/10 text-zinc-900 dark:text-white'
                      : 'border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {renderDockPickerModal(
          isCategoryPickerOpen && !isManagingCategories,
          () => {
            setIsCategoryPickerOpen(false);
            setCategoryError('');
            setNewCategoryName('');
            setEditingCategory(null);
            setEditingCategoryName('');
          },
          'Categorias',
          'Selecione, adicione, edite ou exclua.',
          <div className="pt-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto overscroll-contain pr-0.5">
              {categories.length === 0 ? (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
                  Sem categorias, crie uma.
                </div>
              ) : (
                <div className="grid grid-cols-8 gap-2">
                  {categories.map((cat) => {
                    const isEditingCard = editingCategory === cat;
                    const isActive =
                      categoryService.normalizeCategoryName(category).toLowerCase() ===
                      categoryService.normalizeCategoryName(cat).toLowerCase();
                    return (
                      <div
                        key={cat}
                        className={`h-20 rounded-lg border p-2 transition ${
                          isActive
                            ? 'border-emerald-400/60 bg-emerald-500/10'
                            : 'border-zinc-200/70 dark:border-zinc-800 bg-transparent'
                        }`}
                      >
                        {isEditingCard ? (
                          <div className="h-full flex flex-col gap-1.5">
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={(e) => {
                                setEditingCategoryName(e.target.value);
                                setCategoryError('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveCategoryEdit(cat);
                                if (e.key === 'Escape') handleCancelCategoryEditing();
                              }}
                              className={`${inputBaseClass} h-8 text-[11px]`}
                              aria-label={`Editar categoria ${cat}`}
                            />
                            <div className="grid grid-cols-2 gap-1.5 h-8">
                              <button
                                type="button"
                                onClick={() => handleSaveCategoryEdit(cat)}
                                className="rounded-md border border-emerald-500/40 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelCategoryEditing}
                                className="rounded-md border border-zinc-300 dark:border-zinc-700 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full relative">
                            <button
                              type="button"
                              onClick={() => {
                                setCategory(cat);
                                setIsCategoryPickerOpen(false);
                              }}
                              className="absolute inset-0 rounded-md text-left px-1 py-1.5 pr-16 text-[12px] font-semibold leading-tight break-words line-clamp-2 hover:text-zinc-900 dark:hover:text-white"
                            >
                              {cat}
                            </button>
                            <div className="absolute right-0 bottom-0 flex items-center justify-end gap-1.5 z-10">
                              <button
                                type="button"
                                onClick={() => handleStartCategoryEditing(cat)}
                                className="h-7 w-7 rounded-md border border-zinc-300/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 flex items-center justify-center"
                                aria-label={`Editar categoria ${cat}`}
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                className="h-7 w-7 rounded-md border border-red-400/40 text-red-500 hover:bg-red-500/10 flex items-center justify-center"
                                aria-label={`Excluir categoria ${cat}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
              {categoryError && (
                <p className="text-[11px] text-red-500 px-0.5 mb-1.5">{categoryError}</p>
              )}
              <div className="grid grid-cols-12 gap-2 items-center">
                <input
                  id={fieldId('category-new')}
                  name="categoryNew"
                  autoFocus
                  type="text"
                  placeholder={categories.length >= 40 ? 'Limite de 40 categorias atingido.' : 'Nova categoria...'}
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setCategoryError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  className={`${inputBaseClass} col-span-9 ${
                    categoryError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                  }`}
                  aria-label="Nova categoria"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  aria-label="Adicionar categoria"
                  className="col-span-3 text-white px-3 py-2 rounded-md text-xs font-semibold h-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus size={14} />
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )}

        {renderDockPickerModal(
          isPaymentMethodPickerOpen,
          () => setIsPaymentMethodPickerOpen(false),
          'Selecionar Forma de Pagamento',
          'Toque para selecionar e voltar.',
          <div className="grid grid-cols-6 gap-2">
            {paymentMethodOptions.map((option) => {
              const isActive = option.value === paymentMethod;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePaymentMethodSelect(option.value)}
                  className={`h-16 rounded-lg border px-3 py-2 text-[12px] font-semibold leading-tight text-left break-words transition ${
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-500/10 text-zinc-900 dark:text-white'
                      : 'border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {renderDockPickerModal(
          isAccountPickerOpen,
          () => setIsAccountPickerOpen(false),
          'Selecionar Conta de Destino',
          'Toque para selecionar e voltar.',
          selectableAccountOptions.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
              Nenhuma conta disponível.
            </div>
          ) : (
            <div className="grid grid-cols-8 gap-2">
              {selectableAccountOptions.map((option) => {
                const isActive = option.value === selectedAccountId;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(option.value);
                      setIsAccountPickerOpen(false);
                    }}
                    className={`h-16 rounded-lg border px-3 py-2 text-[12px] font-semibold leading-tight text-left break-words transition ${
                      isActive
                        ? 'border-emerald-400/60 bg-emerald-500/10 text-zinc-900 dark:text-white'
                        : 'border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* Installment / Boleto Section */}
        {!initialData && isInstallment && isInstallmentModalOpen === false && (
            <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10 p-2 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                            <label htmlFor={fieldId('installment-count')} className={labelClass}>
                      Quantidade de parcelas
                            </label>
                            <input 
                                id={fieldId('installment-count')}
                                name="installmentCount"
                                type="number" 
                                min="2"
                                max="60"
                                value={installmentCount}
                                onChange={(e) => setInstallmentCount(parseInt(e.target.value))}
                                className={inputBaseClass}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={labelClass}>O valor informado acima é:</label>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id={fieldId('value-total')}
                                        name={fieldId('value-type')}
                                        checked={installmentValueType === 'total'}
                                        onChange={() => setInstallmentValueType('total')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor={fieldId('value-total')} className="text-sm text-zinc-700 dark:text-zinc-300">Valor Total (será dividido)</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id={fieldId('value-parcel')}
                                        name={fieldId('value-type')}
                                        checked={installmentValueType === 'parcel'}
                                        onChange={() => setInstallmentValueType('parcel')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor={fieldId('value-parcel')} className="text-sm text-zinc-700 dark:text-zinc-300">Valor da Parcela</label>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1">Resumo</p>
                            <p className="text-base font-bold text-zinc-900 dark:text-white">
                                {installmentCount}x de R$ {installmentValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </p>
                            <p className="text-xs text-zinc-500 mb-2">
                                Valor Total da Venda: R$ {finalTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </p>
                            {date && lastInstallmentDate && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                    Última parcela em: {lastInstallmentDate}
                                </p>
                            )}
                        </div>
            </div>
        )}

        {showApplyScope && (
          <div className="space-y-2">
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
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setIsNotesModalOpen(true)}
            data-tour-anchor={isTourSimulationSession ? 'incomes-field-notes-open' : undefined}
            className={`${selectBaseClass} flex items-center justify-between w-full`}
          >
            Observações
            <span className="text-[10px]">Adicionar</span>
          </button>
        </div>

        {isInstallmentModalOpen && (
          <div className="fixed inset-0 z-[1300]">
            <button
              type="button"
              onClick={() => setIsInstallmentModalOpen(false)}
              className={isMobile ? 'absolute inset-0 bg-black/40' : 'absolute left-0 right-0 bg-black/70 backdrop-blur-sm'}
              style={isMobile ? undefined : { top: dockTopOffset, bottom: dockBottomOffset }}
              aria-label="Fechar parcelamento"
            />
            <div
              className={
                isMobile
                  ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-3 max-h-[60dvh] overflow-y-auto'
                  : 'absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl'
              }
              style={
                isMobile
                  ? undefined
                  : {
                      bottom: dockBottomOffset,
                      maxHeight: `max(320px, ${dockMaxHeight})`
                    }
              }
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Entrada Parcelada</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Defina as parcelas da entrada.</p>
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
              <div className={`mt-3 ${isMobile ? 'space-y-3' : 'space-y-3 flex-1 overflow-y-auto overscroll-contain'}`}>
                  <label htmlFor={fieldId('installment-count')} className={labelClass}>
                  Quantidade de parcelas
                </label>
                <input
                  id={fieldId('installment-count')}
                  name="installmentCount"
                  type="number"
                  min="2"
                  max="60"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(parseInt(e.target.value))}
                  data-tour-anchor={isTourSimulationSession ? 'incomes-field-installment-count' : undefined}
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
                        className="text-emerald-600 focus:ring-emerald-500"
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
                        data-tour-anchor={isTourSimulationSession ? 'incomes-field-installment-value-parcel' : undefined}
                        className="text-emerald-600 focus:ring-emerald-500"
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
                  {date && lastInstallmentDate && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Última parcela em: {lastInstallmentDate}
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
                  className="rounded-xl border border-emerald-500/40 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
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
            <div
              className={
                isMobile
                  ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4'
                  : 'absolute left-1/2 -translate-x-1/2 w-[min(680px,calc(100%-24px))] bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5'
              }
              style={isMobile ? undefined : { bottom: dockBottomOffset }}
            >
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
                  data-tour-anchor={isTourSimulationSession ? 'incomes-field-notes-textarea' : undefined}
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
                  data-tour-anchor={isTourSimulationSession ? 'incomes-field-notes-save' : undefined}
                  className="rounded-xl border border-emerald-500/40 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
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
              data-tour-action={isTourSimulationSession ? 'tour-income-save' : undefined}
              data-tour-anchor={isTourSimulationSession ? 'incomes-field-save' : undefined}
              className={`h-10 sm:h-11 px-5 sm:px-6 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm sm:text-base text-white font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95 ${
                isDockDesktop ? 'w-full' : ''
              }`}
            >
              {saveButtonLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (!isOpen) return null;

  if (isInline) {
    return <div className="w-full bg-transparent">{formContent}</div>;
  }

  if (isDock) {
    if (!isOpen) return null;
    if (!isMobile) {
      return (
        <div
          className="fixed inset-0 z-[1200]"
          data-modal-root="true"
          data-tour-anchor={isOpen ? 'incomes-new-income-modal' : undefined}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute left-0 right-0 bg-black/70 backdrop-blur-sm"
            style={{ top: dockTopOffset, bottom: dockBottomOffset }}
            aria-label="Fechar entrada"
          />
          <div
            className="absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-200"
            style={{
              bottom: dockBottomOffset,
              maxHeight: `max(320px, ${dockMaxHeight})`
            }}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{initialData ? 'Editar Entrada' : 'Nova Entrada'}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Preencha os dados da entrada.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                aria-label="Fechar entrada"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="pt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">{formContent}</div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="fixed inset-0 z-[1200]"
        data-modal-root="true"
        data-tour-anchor={isOpen ? 'incomes-new-income-modal' : undefined}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
          aria-label="Fechar entrada"
        />
        <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col">
          <div>{formContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div data-tour-anchor={isOpen ? 'incomes-new-income-modal' : undefined}>
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

export default NewIncomeModal;
