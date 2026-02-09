
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
  const [isNotesOpen, setIsNotesOpen] = useState(true);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const hasInitializedRef = useRef(false);
  const lastInitialIdRef = useRef<string | null>(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const { user: authUser } = useAuth();
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const availableAccounts = accounts.filter(acc => !acc.locked);
  const isMobile = useIsMobile();
  const isInline = variant === 'inline';
  const isDock = variant === 'dock';
  const isDockDesktop = isDock && !isMobile;
  const contentPadding = isInline
    ? 'p-2'
    : isMobile
      ? 'px-2.5 py-2'
      : isDockDesktop
        ? 'px-4 py-4'
        : 'px-8 py-8';
  const footerPadding = isInline
    ? 'p-2'
    : isMobile
      ? 'px-2.5 py-1.5'
      : isDockDesktop
        ? 'pt-3'
        : 'px-8 py-6';
  const contentSpacing = isInline
    ? 'space-y-1'
    : isMobile
      ? 'space-y-1'
      : isDockDesktop
        ? 'space-y-4'
        : 'space-y-6';
  const isEditing = Boolean(initialData);
  const entityName = 'Entrada';
  const primaryLabel = getPrimaryActionLabel(entityName, isEditing);
  const fieldIdPrefix = initialData?.id ? `income-${initialData.id}` : 'income-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;

  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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
          { value: 'Pix', label: 'Pix' },
          { value: 'Dinheiro', label: 'Dinheiro' },
          { value: 'Transferência', label: 'Transferência' },
          { value: 'Boleto', label: 'Boleto' },
          { value: 'Crédito', label: 'Crédito' },
          { value: 'Débito', label: 'Débito' }
      ],
      []
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
        return;
    }

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
    setIsNotesOpen(false);
    setIsInstallment(false);
    setInstallmentCount(2);
    setInstallmentValueType('total');
    setApplyScope('single');
  }, [isOpen, initialData, defaultDate, minDate]);

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

      if (newMethod === 'Crédito' || newMethod === 'Boleto') {
          setStatus('pending');
      } else {
          setStatus('received');
      }
  };
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
      handlePaymentMethodSelect(e.target.value);

  if (!isOpen) return null;

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
    if (categories.length >= 20) {
        setCategoryError('Limite de categorias atingido.');
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
        if (category === catToDelete) {
            setCategory(categories.filter(c => c !== catToDelete)[0] || '');
        }
    } catch (error: any) {
        alert(error?.message || 'Falha ao remover categoria.');
    }
  };

  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat]
    );
  };

  const handleBulkDeleteCategories = async () => {
    if (selectedCategories.length === 0) return;
    try {
      await Promise.all(selectedCategories.map((cat) => onRemoveCategory(cat)));
      if (selectedCategories.includes(category)) {
        setCategory('');
      }
      setSelectedCategories([]);
    } catch (error: any) {
      alert(error?.message || 'Falha ao remover categorias selecionadas.');
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
    if (!normalizedDescription || !amount || !date || !selectedAccountId) return;
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

    const descriptionUpper = normalizedDescription.toUpperCase();
    const categoryUpper = normalizedCategory.toUpperCase();
    const notesUpper = normalizedNotes ? normalizedNotes.toUpperCase() : '';
    const baseIncome = {
        id: initialData?.id,
        description: descriptionUpper,
        category: categoryUpper,
        date, 
        competenceDate: competenceDate || date,
        accountId: selectedAccountId,
        status, 
        paymentMethod,
        notes: notesUpper,
        taxStatus // Salvar natureza fiscal
    };

    console.info('[form-save]', { entityName, isEditing, primaryLabel });

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
                description: `${descriptionUpper} (${i+1}/${installmentCount})`,
                status: 'pending' // Parcelas futuras geralmente iniciam como pendentes
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
    if (!onPrimaryActionRef) return;
    onPrimaryActionRef(handleSave);
  }, [handleSave, onPrimaryActionRef]);

  const dockFieldClass =
    'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2';
  const inputBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 pr-8 placeholder:uppercase placeholder:font-light placeholder:text-[10px]`
    : `${modalInputClass} focus:ring-emerald-500 pr-8 placeholder:uppercase placeholder:font-light placeholder:text-[10px]`;
  const selectBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 text-left`
    : `${modalInputClass} focus:ring-emerald-500 text-left`;
  const textareaBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-emerald-500/40 placeholder:uppercase placeholder:font-light placeholder:text-[10px] min-h-[80px] resize-none`
    : `${modalTextareaClass} focus:ring-emerald-500 placeholder:uppercase placeholder:font-light placeholder:text-[10px]`;
  const compactLabelClass = 'text-[10px] uppercase tracking-wide font-bold text-white';
  const labelClass = isDockDesktop ? modalLabelClass : compactLabelClass;

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
        
        <div className="space-y-1">
          <label htmlFor={fieldId('description')} className={labelClass}>
            Descrição / Origem
          </label>
          <input 
            id={fieldId('description')}
            name="description"
            type="text" 
            placeholder="EX: PAGAMENTO CLIENTE X, VENDA LOJA"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputBaseClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-1 sm:gap-4 items-end">
            <div className="space-y-1">
                <label htmlFor={fieldId('amount')} className={labelClass}>
                  Valor (R$)
                </label>
                <input 
                    id={fieldId('amount')}
                    name="amount"
                    type="number" 
                    placeholder="EX: R$0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${inputBaseClass} font-bold text-emerald-600 dark:text-emerald-400`}
                />
            </div>
            
            {/* NATUREZA FISCAL - Posicionado logo após Categoria/Valor conforme solicitado */}
            <div className="space-y-1">
                <label htmlFor={fieldId('taxStatus')} className={labelClass}>
                    Natureza Fiscal
                </label>
                <SelectDropdown
                    value={taxStatus}
                    onChange={(value) => setTaxStatus(value as 'PJ' | 'PF')}
                    options={[
                        { value: 'PJ', label: 'PJ (Empresarial/MEI)' },
                        { value: 'PF', label: 'PF (Pessoal)' }
                    ]}
                    placeholder="SELECIONE"
                    buttonClassName={selectBaseClass}
                    listClassName="max-h-56"
                />
            </div>
        </div>

        <div className="grid grid-cols-1 gap-1 sm:gap-4 items-end">
            {/* Dynamic Category Section */}
            <div className="space-y-1 relative">
                <div className="flex justify-between items-center min-h-[12px] mb-1">
                    <label htmlFor={fieldId('category')} className={`${labelClass} leading-none`}>
                      Categoria
                    </label>
                    <button 
                        type="button"
                        onClick={() => setIsManagingCategories(true)}
                        className="text-[10px] font-bold flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors"
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
                                placeholder={categoryError || 'NOVA CATEGORIA...'}
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
                                      className="flex justify-between items-center px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                                    >
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={selectedCategories.includes(cat)}
                                            onChange={() => toggleCategorySelection(cat)}
                                            className="h-3.5 w-3.5 accent-emerald-500"
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
                        placeholder={categories.length === 0 ? 'SEM CATEGORIAS, CRIE UMA' : 'SELECIONE'}
                        disabled={categories.length === 0}
                        buttonClassName={selectBaseClass}
                        listClassName="max-h-56"
                    />
                )}
            </div>

            {/* Data de Competência */}
            <div className="space-y-1">
                <label htmlFor={fieldId('competenceDate')} className={`${labelClass} leading-none`}>
                  DATA DA VENDA / SERVIÇO
                </label>
                <WheelDatePicker
                    value={competenceDate}
                    onChange={setCompetenceDate}
                    minDate={minDate}
                    defaultDate={defaultDate}
                    buttonClassName={inputBaseClass}
                    ariaLabel="Selecionar data da venda ou serviço"
                />
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-4">
             {/* NOVO CAMPO: Forma de Pagamento */}
            <div className="space-y-1">
                <label htmlFor={fieldId('payment-method')} className={labelClass}>
                  Forma de Pagamento
                </label>
                <SelectDropdown
                    value={paymentMethod}
                    onChange={handlePaymentMethodSelect}
                    options={paymentMethodOptions}
                    placeholder="SELECIONE"
                    buttonClassName={selectBaseClass}
                    listClassName="max-h-56"
                />
            </div>
        </div>

        <div className="space-y-1">
            <div className="space-y-1">
                <label htmlFor={fieldId('account')} className={labelClass}>
                  Conta de Destino
                </label>
                <SelectDropdown
                    value={selectedAccountId}
                    onChange={setSelectedAccountId}
                    options={accountOptions}
                    placeholder={availableAccounts.length === 0 ? 'NENHUMA CONTA DISPONÍVEL' : 'SELECIONE'}
                    disabled={availableAccounts.length === 0}
                    buttonClassName={selectBaseClass}
                    listClassName="max-h-56"
                />
            </div>
            <div className="space-y-1">
                <label htmlFor={fieldId('date')} className={labelClass}>
                    {isInstallment ? 'Data da 1ª Parcela (Caixa)' : 'Data de Recebimento (Caixa)'}
                </label>
                <WheelDatePicker
                    value={date}
                    onChange={setDate}
                    minDate={minDate}
                    defaultDate={defaultDate}
                    buttonClassName={inputBaseClass}
                    ariaLabel="Selecionar data de recebimento"
                />
            </div>

            {/* Status (Automático mas editável) */}
            <div className="space-y-1 col-span-2">
                <label className={labelClass}>Status</label>
                <div className="grid grid-cols-2 gap-2 w-full justify-items-stretch">
                    <button
                        type="button"
                        onClick={() => setStatus('received')}
                        className={`${selectBaseClass} flex items-center justify-center gap-2 w-full`}
                        aria-pressed={status === 'received'}
                    >
                        <span className={`h-2.5 w-2.5 rounded-full border ${status === 'received' ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-400'}`} />
                        <span className={status === 'received' ? 'text-emerald-500' : ''}>Recebido</span>
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
                {!initialData && (
                  <button
                    type="button"
                    onClick={() => setIsInstallmentModalOpen(true)}
                    className={`${selectBaseClass} flex items-center justify-between w-full col-span-2`}
                  >
                    Entrada Parcelada
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
            </div>
        </div>

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
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar parcelamento"
            />
            <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-3 max-h-[60dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
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
              <div className="mt-3 space-y-3">
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
              className={`h-10 sm:h-11 px-5 sm:px-6 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm sm:text-base text-white font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95 ${
                isDockDesktop ? 'w-full' : ''
              }`}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isInline) {
    return <div className="w-full bg-transparent">{formContent}</div>;
  }

  if (isDock) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-[1200]">
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
          aria-label="Fechar entrada"
        />
        <div
          className={
            isMobile
              ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
              : 'absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]'
          }
        >
          {isDockDesktop && (
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
          )}
          <div className={isDockDesktop ? 'pt-3 flex-1 overflow-auto' : ''}>{formContent}</div>
        </div>
      </div>
    );
  }

  return (
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
  );
};

export default NewIncomeModal;
