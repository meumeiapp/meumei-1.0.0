
import React, { useState, useEffect } from 'react';
import { X, Calendar, Edit2, Plus, CreditCard, Home, ShoppingCart, User, Barcode, Briefcase, Trash2 } from 'lucide-react';
import { Expense, Account, CreditCard as CreditCardType, ExpenseType } from '../types';
import CardTag from './CardTag';
import { getAccountColor } from '../services/cardColorUtils';
import { categoryService } from '../services/categoryService';
import { useAuth } from '../contexts/AuthContext';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: any) => void;
  initialData?: Expense | null;
  variant?: 'modal' | 'inline';
  accounts: Account[];
  creditCards: CreditCardType[];
  categories: string[]; 
  userId?: string | null;
  categoryType: 'expenses';
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  onResetCategories?: () => Promise<void> | void;
  expenseType: ExpenseType; 
  themeColor?: 'indigo' | 'amber' | 'cyan' | 'pink';
  defaultDate?: Date; // New prop
  minDate: string;
}

const NewExpenseModal: React.FC<NewExpenseModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData,
  variant = 'modal',
  accounts, 
  creditCards,
  categories,
  userId,
  categoryType,
  onAddCategory,
  onRemoveCategory,
  onResetCategories,
  expenseType,
  themeColor = 'indigo',
  defaultDate,
  minDate
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Débito');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [notes, setNotes] = useState('');
  const [taxStatus, setTaxStatus] = useState<'PJ' | 'PF'>('PJ');
  const { user: authUser } = useAuth();
  const availableAccounts = accounts.filter(acc => !acc.locked);
  const isInline = variant === 'inline';
  const contentPadding = isInline ? 'p-4' : 'p-6';
  const footerPadding = isInline ? 'p-4' : 'p-6';
  
  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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

  // Helper for dynamic UI based on type
  const getModalConfig = () => {
      switch(expenseType) {
          case 'fixed': 
              return { 
                  title: 'Nova Despesa Fixa', 
                  icon: <Home className="text-amber-600 dark:text-amber-400" />,
                  colorClass: 'text-amber-600 focus:ring-amber-500',
                  btnClass: 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20'
              };
          case 'personal': 
              return { 
                  title: 'Nova Despesa Pessoal', 
                  icon: <User className="text-cyan-600 dark:text-cyan-400" />,
                  colorClass: 'text-cyan-600 focus:ring-cyan-500',
                  btnClass: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-900/20'
              };
          case 'variable':
          default: 
              return { 
                  title: 'Nova Despesa Variável', 
                  icon: <ShoppingCart className="text-pink-600 dark:text-pink-400" />,
                  colorClass: 'text-pink-600 focus:ring-pink-500',
                  btnClass: 'bg-pink-600 hover:bg-pink-700 shadow-pink-900/20'
              };
      }
  };
  
  const config = getModalConfig();
  const entityName = config.title.replace(/^Nova\s+/i, '').trim();
  const primaryLabel = getPrimaryActionLabel(entityName, isEditing);
  const fieldIdPrefix = initialData?.id ? `expense-${initialData.id}` : 'expense-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;

  const clampToMinDate = (value: string) => {
      if (!value) return minDate;
      return value < minDate ? minDate : value;
  };

  useEffect(() => {
    if (isOpen) {
        // Set default category if none selected
        if (!category && categories.length > 0) {
            setCategory(categories[0]);
        }

        if (initialData) {
            setDescription(initialData.description);
            setAmount(initialData.amount.toString());
            setCategory(initialData.category);
            setDate(clampToMinDate(initialData.date));
            setDueDate(clampToMinDate(initialData.dueDate));
            setPaymentMethod(initialData.paymentMethod);
            setSelectedAccountId(initialData.accountId || '');
            setSelectedCardId(initialData.cardId || '');
            setStatus(initialData.status);
            setNotes(initialData.notes || '');
            setTaxStatus(initialData.taxStatus || 'PJ');
            setIsInstallment(false);
            setApplyScope('single');
        } else {
            // Reset form
            setDescription('');
            setAmount('');
            setCategory(categories.length > 0 ? categories[0] : '');
            
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
            setPaymentMethod('Débito');
            // Automatic status for Debit is 'paid'
            setStatus('paid');
            setSelectedAccountId(availableAccounts.length > 0 ? availableAccounts[0].id : '');
            setSelectedCardId(creditCards.length > 0 ? creditCards[0].id : '');
            setNotes('');
            // Se for despesa pessoal, padrão é PF, senão PJ
            setTaxStatus(expenseType === 'personal' ? 'PF' : 'PJ');
            setIsInstallment(false);
            setInstallmentCount(2);
            setInstallmentValueType('parcel');
            setApplyScope('single');
        }
    } else {
        setIsManagingCategories(false);
        setNewCategoryName('');
    }
  }, [isOpen, initialData, accounts, creditCards, expenseType, categories, defaultDate]);

  // ... (rest of the component logic remains unchanged) ...
  // --- Auto-Calculate Due Date for Credit Cards (FIXED LOGIC) ---
  useEffect(() => {
      if (paymentMethod === 'Crédito' && selectedCardId && date) {
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
  }, [paymentMethod, selectedCardId, date, creditCards]);

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
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMethod = e.target.value;
      setPaymentMethod(newMethod);

      // AUTOMATIC STATUS LOGIC
      if (newMethod === 'Crédito' || newMethod === 'Boleto') {
          setStatus('pending');
      } else {
          setStatus('paid');
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
        alert('Categoria já existe.');
        return;
    }
    Promise.resolve(onAddCategory(normalizedName))
        .then(() => {
            setCategory(normalizedName);
            setNewCategoryName('');
        })
        .catch((error: any) => {
            alert(error?.message || 'Falha ao salvar categoria.');
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
            alert(error?.message || 'Falha ao remover categoria.');
        });
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

  if (!isOpen) return null;

  const isCredit = paymentMethod === 'Crédito';
  // DEFINIÇÃO CHAVE: Parcelamento disponível para Crédito E Boleto
  const supportsInstallments = isCredit || paymentMethod === 'Boleto';
  const selectedAccount = availableAccounts.find(a => a.id === selectedAccountId);
  
  // Logic to lock status (e.g. Credit Card is always pending initially, installments are pending)
  const isStatusDisabled = isCredit || (isInstallment && paymentMethod === 'Boleto');

  // --- Installment Logic ---
  const numericAmount = parseFloat(amount.replace(',', '.')) || 0;
  let finalTotal = 0;
  let installmentValue = 0;

  if (isInstallment) {
      if (installmentValueType === 'parcel') {
          installmentValue = numericAmount;
          finalTotal = numericAmount * installmentCount;
      } else {
          finalTotal = numericAmount;
          installmentValue = numericAmount / installmentCount;
      }
  }

  const handleSave = () => {
      if (!description || !amount || !date) return;
      if (date < minDate) {
          alert('A data da despesa não pode ser anterior ao mês de abertura da empresa.');
          return;
      }
      const targetDue = dueDate || date;
      if (targetDue < minDate) {
          alert('A data de vencimento não pode ser anterior ao mês de abertura da empresa.');
          return;
      }
      if (!category) {
          alert('Selecione ou crie uma categoria antes de salvar.');
          return;
      }

      const baseExpense = {
          id: initialData?.id,
          description,
          category,
          date,
          paymentMethod,
          accountId: !isCredit ? selectedAccountId : undefined,
          cardId: isCredit ? selectedCardId : undefined,
          status,
          notes,
          taxStatus // Salvar natureza fiscal
      };

      console.info('[form-save]', { entityName, isEditing, primaryLabel });

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
                  description: `${description} (${i+1}/${installmentCount})`,
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

  const formContent = (
    <>
      {!isInline && (
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className={`text-xl font-bold flex items-center gap-2 ${config.colorClass.split(' ')[0]} dark:text-white`}>
            {config.icon}
            {initialData ? 'Editar Despesa' : config.title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}

      <div className={`${contentPadding} space-y-6`}>
        
        <div className="space-y-2">
          <label htmlFor={fieldId('description')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Fornecedor / Nome
          </label>
          <input 
            id={fieldId('description')}
            name="description"
            type="text" 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Aluguel, Supermercado, Netflix..."
            className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label htmlFor={fieldId('amount')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Valor (R$)
                </label>
                <input 
                    id={fieldId('amount')}
                    name="amount"
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all`}
                />
            </div>
            
            {/* CATEGORIA - Com Gerenciamento Dinâmico */}
            <div className="space-y-2 relative">
                <div className="flex justify-between items-center h-4 mb-2">
                    <label htmlFor={fieldId('category')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                      Categoria
                    </label>
                    <button 
                        type="button"
                        onClick={() => setIsManagingCategories(!isManagingCategories)}
                        className={`text-[10px] font-bold flex items-center gap-1 hover:underline transition-colors ${config.colorClass.split(' ')[0]}`}
                    >
                        {isManagingCategories ? 'Fechar Edição' : <><Edit2 size={10} /> Editar / <Plus size={10} /> Nova</>}
                    </button>
                </div>
                
                {isManagingCategories ? (
                    <div className="absolute top-8 left-0 right-0 z-[60] bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 shadow-lg">
                        <div className="flex gap-2 mb-3">
                            <input 
                                id={fieldId('category-new')}
                                name="categoryNew"
                                autoFocus
                                type="text" 
                                placeholder="Nova categoria..."
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                className="flex-1 bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                        <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                            {categories.length === 0 ? (
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
                                    Sem categorias, crie uma
                                </div>
                            ) : (
                                categories.map(cat => (
                                    <div key={cat} className="flex justify-between items-center px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                        <span className="text-sm text-zinc-700 dark:text-zinc-300">{cat}</span>
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
                        {onResetCategories && (
                            <button
                                type="button"
                                onClick={handleResetCategories}
                                className="mt-3 w-full rounded-md border border-red-200 text-red-600 text-xs font-semibold py-2 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                                Zerar categorias
                            </button>
                        )}
                    </div>
                ) : (
                    <select 
                        id={fieldId('category')}
                        name="category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={categories.length === 0}
                        className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all appearance-none`}
                    >
                        {category && !categories.includes(category) && (
                            <option value={category}>{category}</option>
                        )}
                        {categories.length === 0 && (
                            <option value="" disabled>Sem categorias, crie uma</option>
                        )}
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NATUREZA FISCAL */}
            <div className="space-y-2">
                <label htmlFor={fieldId('taxStatus')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                    <Briefcase size={12} /> Natureza Fiscal
                </label>
                <select 
                    id={fieldId('taxStatus')}
                    name="taxStatus"
                    value={taxStatus}
                    onChange={(e) => setTaxStatus(e.target.value as 'PJ' | 'PF')}
                    className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all appearance-none`}
                >
                    <option value="PJ">PJ (Empresarial/MEI)</option>
                    <option value="PF">PF (Pessoal)</option>
                </select>
            </div>

            <div className="space-y-2">
                <label htmlFor={fieldId('date')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Data de lançamento
                </label>
                <div className="relative">
                    <input 
                        id={fieldId('date')}
                        name="date"
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        min={minDate}
                        className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all [color-scheme:dark]`}
                    />
                    <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={20} />
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label htmlFor={fieldId('payment-account')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Conta de Pagamento
                </label>
                <select 
                    id={fieldId('payment-account')}
                    name="paymentAccount"
                    value={isCredit ? selectedCardId : selectedAccountId}
                    onChange={(e) => isCredit ? setSelectedCardId(e.target.value) : setSelectedAccountId(e.target.value)}
                    className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all appearance-none`}
                >
                    {isCredit ? (
                        creditCards.length > 0 ? (
                            creditCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)
                        ) : (
                            <option value="">Nenhum cartão cadastrado</option>
                        )
                    ) : (
                        availableAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)
                    )}
                </select>
                {isCredit && selectedCardId && (
                    <div className="mt-2">
                        <CardTag card={creditCards.find(c => c.id === selectedCardId)} />
                    </div>
                )}
                {!isCredit && selectedAccount && (
                    <div className="mt-2">
                        <CardTag label={selectedAccount.name} color={getAccountColor(selectedAccount)} />
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <label htmlFor={fieldId('payment-method')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Forma de Pagamento
                </label>
                <select 
                    id={fieldId('payment-method')}
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={handlePaymentMethodChange}
                    className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all appearance-none`}
                >
                    <option>Débito</option>
                    <option>Crédito</option>
                    <option>PIX</option>
                    <option>Boleto</option>
                    <option>Transferência</option>
                    <option>Dinheiro</option>
                </select>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Status</label>
                <div className={`flex gap-2 ${isStatusDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    {/* Opção PAGO */}
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 dark:border-emerald-500/50' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                        <input 
                            type="radio" 
                            id={fieldId('status-paid')}
                            name={fieldId('status')} 
                            value="paid" 
                            checked={status === 'paid'}
                            onChange={() => setStatus('paid')}
                            disabled={isStatusDisabled}
                            className="hidden"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${status === 'paid' ? 'border-emerald-500' : 'border-zinc-400'}`}>
                            {status === 'paid' && <div className="w-2 h-2 rounded-full bg-emerald-500"></div>}
                        </div>
                        <span className={`text-sm font-medium ${status === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'}`}>Pago</span>
                    </label>

                    {/* Opção PENDENTE */}
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-500/50' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                        <input 
                            type="radio" 
                            id={fieldId('status-pending')}
                            name={fieldId('status')} 
                            value="pending" 
                            checked={status === 'pending'}
                            onChange={() => setStatus('pending')}
                            disabled={isStatusDisabled}
                            className="hidden"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${status === 'pending' ? 'border-amber-500' : 'border-zinc-400'}`}>
                            {status === 'pending' && <div className="w-2 h-2 rounded-full bg-amber-500"></div>}
                        </div>
                        <span className={`text-sm font-medium ${status === 'pending' ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500'}`}>Pendente</span>
                    </label>
                </div>
            </div>
            
            <div className="space-y-2">
                <label htmlFor={fieldId('dueDate')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Data de Vencimento
                </label>
                <div className="relative">
                    <input 
                        id={fieldId('dueDate')}
                        name="dueDate"
                        type="date" 
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        // Disabled ONLY for Credit (calculated automatically)
                        disabled={isCredit} 
                        min={minDate}
                        className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all [color-scheme:dark] disabled:opacity-50`}
                    />
                    <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={20} />
                </div>
            </div>
        </div>

        {/* SEÇÃO DE PARCELAMENTO - Agora visível para Crédito OU Boleto */}
        {supportsInstallments && (
            <div className={`${isCredit ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100' : 'bg-gray-100 dark:bg-zinc-800 border-zinc-200'} border rounded-xl p-4 space-y-4`}>
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id={fieldId('installments')}
                        name="installments"
                        checked={isInstallment} 
                        onChange={(e) => setIsInstallment(e.target.checked)}
                        className={`w-4 h-4 rounded border-zinc-600 bg-transparent focus:ring-2 ${isCredit ? 'text-blue-600 focus:ring-blue-500' : 'text-zinc-600 focus:ring-zinc-500'}`}
                    />
                    <label htmlFor={fieldId('installments')} className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                        {isCredit ? 'Compra parcelada?' : 'Boleto Parcelado?'}
                        {paymentMethod === 'Boleto' && <Barcode size={16} />}
                    </label>
                </div>

                {isInstallment && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <label htmlFor={fieldId('installment-count')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                              Número de parcelas
                            </label>
                            <input 
                                id={fieldId('installment-count')}
                                name="installmentCount"
                                type="number" 
                                min="2"
                                max="99"
                                value={installmentCount}
                                onChange={(e) => setInstallmentCount(parseInt(e.target.value))}
                                className="w-full bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Valor informado é:</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id={fieldId('value-parcel')}
                                        name={fieldId('value-type')}
                                        checked={installmentValueType === 'parcel'}
                                        onChange={() => setInstallmentValueType('parcel')}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor={fieldId('value-parcel')} className="text-sm text-zinc-700 dark:text-zinc-300">Valor da parcela</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id={fieldId('value-total')}
                                        name={fieldId('value-type')}
                                        checked={installmentValueType === 'total'}
                                        onChange={() => setInstallmentValueType('total')}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor={fieldId('value-total')} className="text-sm text-zinc-700 dark:text-zinc-300">Valor total</label>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                            <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Resumo do parcelamento:</p>
                            <p className="text-lg font-bold text-zinc-900 dark:text-white">
                                {installmentCount}x de R$ {installmentValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </p>
                            <p className="text-sm text-zinc-500 mb-2">
                                Valor total: R$ {finalTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </p>
                            {firstInstallmentDate && lastInstallmentDate && (
                                <div className={`flex justify-between text-xs font-medium p-2 rounded ${isCredit ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                    <span>1ª: {firstInstallmentDate}</span>
                                    <span>...</span>
                                    <span>{installmentCount}ª: {lastInstallmentDate}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {showApplyScope && (
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Aplicar alterações</label>
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

        <div className="space-y-2">
          <label htmlFor={fieldId('notes')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Observações
          </label>
          <textarea 
            id={fieldId('notes')}
            name="notes"
            rows={3}
            placeholder="Informações adicionais..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 ${config.colorClass} transition-all placeholder:text-zinc-400 resize-none`}
          />
        </div>

      </div>

      <div className={`${footerPadding} border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-white dark:bg-[#1a1a1a] rounded-b-2xl`}>
          <button onClick={onClose} className="px-6 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Cancelar
          </button>
          <button onClick={handleSave} className={`px-6 py-3 rounded-lg text-white font-bold transition-all active:scale-95 ${config.btnClass}`}>
              {primaryLabel}
          </button>
      </div>
    </>
  );

  if (isInline) {
    return (
      <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden">
        {formContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-2xl transform rounded-2xl bg-white dark:bg-[#1a1a1a] text-left shadow-xl transition-all sm:my-8 border border-zinc-200 dark:border-zinc-800">
          {formContent}
        </div>
      </div>
    </div>
  );
};

export default NewExpenseModal;
