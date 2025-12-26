
import React, { useState, useEffect } from 'react';
import { X, Calendar, Plus, Edit2, Trash2, ArrowUpCircle, Briefcase } from 'lucide-react';
import { Income, Account } from '../types';
import { categoryService } from '../services/categoryService';
import { useAuth } from '../contexts/AuthContext';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface NewIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (income: any) => void;
  initialData?: Income | null;
  variant?: 'modal' | 'inline';
  accounts: Account[];
  categories: string[];
  licenseId?: string | null;
  categoryType: 'incomes';
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  defaultDate?: Date; // New prop
  minDate: string;
}

const NewIncomeModal: React.FC<NewIncomeModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData,
  variant = 'modal',
  accounts,
  categories,
  licenseId,
  categoryType,
  onAddCategory,
  onRemoveCategory,
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
  const [paymentMethod, setPaymentMethod] = useState('Pix'); // Novo campo com default
  const [notes, setNotes] = useState('');
  const [taxStatus, setTaxStatus] = useState<'PJ' | 'PF'>('PJ');
  const { user: authUser } = useAuth();
  const availableAccounts = accounts.filter(acc => !acc.locked);
  const isInline = variant === 'inline';
  const contentPadding = isInline ? 'p-4' : 'p-6';
  const footerPadding = isInline ? 'p-4' : 'p-6';
  const isEditing = Boolean(initialData);
  const entityName = 'Entrada';
  const primaryLabel = getPrimaryActionLabel(entityName, isEditing);

  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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
            setCompetenceDate(clampToMinDate(initialData.competenceDate || initialData.date));
            setSelectedAccountId(initialData.accountId);
            setStatus(initialData.status);
            setPaymentMethod(initialData.paymentMethod || 'Pix');
            setNotes(initialData.notes || '');
            setTaxStatus(initialData.taxStatus || 'PJ');
            setIsInstallment(false);
            setApplyScope('single');
        } else {
            // Reset form
            setDescription('');
            setAmount('');
            setCategory(categories.length > 0 ? categories[0] : '');
            
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
            setSelectedAccountId(availableAccounts.length > 0 ? availableAccounts[0].id : '');
            setStatus('received');
            setPaymentMethod('Pix'); // Default para novas entradas
            setNotes('');
            setTaxStatus('PJ'); // Padrão é PJ
            setIsInstallment(false);
            setInstallmentCount(2);
            setInstallmentValueType('total');
            setApplyScope('single');
        }
    } else {
        setIsManagingCategories(false);
        setNewCategoryName('');
    }
  }, [isOpen, initialData, accounts, categories, defaultDate, minDate]);

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
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMethod = e.target.value;
      setPaymentMethod(newMethod);

      if (newMethod === 'Crédito' || newMethod === 'Boleto') {
          setStatus('pending');
      } else {
          setStatus('received');
      }
  };

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
        licenseId,
        type: categoryType,
        uid,
        email
    });
    if (!licenseId) {
        console.warn('[categories] UI_add_blocked', {
            reason: 'license_missing',
            rawName,
            licenseId,
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
            licenseId,
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
            licenseId,
            type: categoryType,
            uid,
            email
        });
        alert('Categoria já existe.');
        return;
    }
    try {
        await onAddCategory(normalizedName);
        setCategory(normalizedName);
        setNewCategoryName('');
    } catch (error: any) {
        alert(error?.message || 'Falha ao salvar categoria.');
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
        licenseId,
        uid,
        email
    });
    if (!licenseId) {
        console.warn('[categories] UI_remove_blocked', {
            reason: 'license_missing',
            rawName,
            licenseId,
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
            licenseId,
            type: categoryType,
            uid,
            email
        });
        return;
    }
    if (categories.length <= 1) {
        console.warn('[categories] UI_remove_blocked', {
            reason: 'minimum_one_category',
            rawName,
            licenseId,
            type: categoryType,
            uid,
            email
        });
        alert("É necessário ter pelo menos uma categoria.");
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
    if (!description || !amount || !date || !selectedAccountId) return;
    if (date < minDate) {
        alert('A data da entrada não pode ser anterior ao mês de abertura da empresa.');
        return;
    }
    if (competenceDate && competenceDate < minDate) {
        alert('A data de competência não pode ser anterior ao mês de abertura da empresa.');
        return;
    }

    const baseIncome = {
        id: initialData?.id,
        description,
        category,
        date, 
        competenceDate: competenceDate || date,
        accountId: selectedAccountId,
        status, 
        paymentMethod,
        notes,
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
                description: `${description} (${i+1}/${installmentCount})`,
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

  const formContent = (
    <>
      {!isInline && (
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <ArrowUpCircle className="text-emerald-500" />
              {initialData ? 'Editar Entrada' : 'Nova Entrada'}
          </h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X size={20} />
          </button>
        </div>
      )}

      <div className={`${contentPadding} space-y-6`}>
        
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Descrição / Origem</label>
          <input 
            type="text" 
            placeholder="Ex: Pagamento Cliente X, Venda Loja"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Valor (R$)</label>
                <input 
                    type="number" 
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-emerald-600 dark:text-emerald-400"
                />
            </div>
            
            {/* NATUREZA FISCAL - Posicionado logo após Categoria/Valor conforme solicitado */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                    <Briefcase size={12} /> Natureza Fiscal
                </label>
                <select 
                    value={taxStatus}
                    onChange={(e) => setTaxStatus(e.target.value as 'PJ' | 'PF')}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                >
                    <option value="PJ">PJ (Empresarial/MEI)</option>
                    <option value="PF">PF (Pessoal)</option>
                </select>
            </div>
        </div>

        {/* Dynamic Category Section */}
        <div className="space-y-2 relative">
            <div className="flex justify-between items-center h-4 mb-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Categoria</label>
                <button 
                    type="button"
                    onClick={() => setIsManagingCategories(!isManagingCategories)}
                    className="text-[10px] font-bold flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                    {isManagingCategories ? 'Fechar Edição' : <><Edit2 size={10} /> Editar / <Plus size={10} /> Nova</>}
                </button>
            </div>
            
            {isManagingCategories ? (
                    <div className="absolute top-8 left-0 right-0 z-[60] bg-zinc-50 dark:bg-[#202020] border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 shadow-lg">
                    <div className="flex gap-2 mb-3">
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Nova categoria..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                            className="flex-1 bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <button
                            type="button"
                            onClick={handleAddCategory}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-md"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                        {categories.map(cat => (
                            <div key={cat} className="flex justify-between items-center px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                <span className="text-sm text-zinc-700 dark:text-zinc-300">{cat}</span>
                                <button type="button" onClick={() => handleDeleteCategory(cat)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                    </div>
            ) : (
                <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
            )}
        </div>

        {/* Data de Competência */}
        <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Data de Competência (Realização do Serviço)</label>
            <div className="relative">
                <input 
                    type="date" 
                    value={competenceDate}
                    onChange={(e) => setCompetenceDate(e.target.value)}
                    min={minDate}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all [color-scheme:dark]"
                />
                <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={20} />
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* NOVO CAMPO: Forma de Pagamento */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Forma de Pagamento</label>
                <select 
                    value={paymentMethod}
                    onChange={handlePaymentMethodChange}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                >
                    <option>Pix</option>
                    <option>Dinheiro</option>
                    <option>Transferência</option>
                    <option>Boleto</option>
                    <option>Crédito</option>
                    <option>Débito</option>
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Conta de Destino</label>
                <select 
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                >
                    {availableAccounts.length === 0 && <option value="">Nenhuma conta disponível</option>}
                    {availableAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                    {isInstallment ? 'Data da 1ª Parcela (Caixa)' : 'Data de Recebimento (Caixa)'}
                </label>
                <div className="relative">
                    <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        min={minDate}
                        className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all [color-scheme:dark]"
                    />
                    <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={20} />
                </div>
            </div>

            {/* Status (Automático mas editável) */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Status</label>
                <div className="flex gap-2">
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${status === 'received' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 dark:border-emerald-500/50' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                        <input 
                            type="radio" 
                            name="status" 
                            value="received" 
                            checked={status === 'received'}
                            onChange={() => setStatus('received')}
                            className="hidden"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${status === 'received' ? 'border-emerald-500' : 'border-zinc-400'}`}>
                            {status === 'received' && <div className="w-2 h-2 rounded-full bg-emerald-500"></div>}
                        </div>
                        <span className={`text-sm font-medium ${status === 'received' ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'}`}>Recebido</span>
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-500/50' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                        <input 
                            type="radio" 
                            name="status" 
                            value="pending" 
                            checked={status === 'pending'}
                            onChange={() => setStatus('pending')}
                            className="hidden"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${status === 'pending' ? 'border-amber-500' : 'border-zinc-400'}`}>
                            {status === 'pending' && <div className="w-2 h-2 rounded-full bg-amber-500"></div>}
                        </div>
                        <span className={`text-sm font-medium ${status === 'pending' ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500'}`}>Pendente</span>
                    </label>
                </div>
            </div>
        </div>

        {/* Installment / Boleto Section */}
        {!initialData && (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="installments_income" 
                        checked={isInstallment} 
                        onChange={(e) => setIsInstallment(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-600 bg-transparent text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="installments_income" className="text-sm font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                        Entrada Parcelada / Boleto Parcelado
                    </label>
                </div>

                {isInstallment && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Quantidade de parcelas</label>
                            <input 
                                type="number" 
                                min="2"
                                max="60"
                                value={installmentCount}
                                onChange={(e) => setInstallmentCount(parseInt(e.target.value))}
                                className="w-full bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">O valor informado acima é:</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id="val_total_inc" 
                                        name="val_type_inc"
                                        checked={installmentValueType === 'total'}
                                        onChange={() => setInstallmentValueType('total')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor="val_total_inc" className="text-sm text-zinc-700 dark:text-zinc-300">Valor Total (será dividido)</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        id="val_parcel_inc" 
                                        name="val_type_inc"
                                        checked={installmentValueType === 'parcel'}
                                        onChange={() => setInstallmentValueType('parcel')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor="val_parcel_inc" className="text-sm text-zinc-700 dark:text-zinc-300">Valor da Parcela</label>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
                            <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Resumo do parcelamento:</p>
                            <p className="text-lg font-bold text-zinc-900 dark:text-white">
                                {installmentCount}x de R$ {installmentValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </p>
                            <p className="text-sm text-zinc-500 mb-2">
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
            </div>
        )}

        {showApplyScope && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Aplicar alterações</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${applyScope === 'single' ? 'border-zinc-400 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                <input
                  type="radio"
                  name="edit_scope_income"
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
                  name="edit_scope_income"
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
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Observações</label>
          <textarea 
            rows={3}
            placeholder="Detalhes adicionais..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-zinc-400 resize-none"
          />
        </div>

      </div>

      <div className={`${footerPadding} border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-white dark:bg-[#1a1a1a] rounded-b-2xl`}>
          <button onClick={onClose} className="px-6 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Cancelar
          </button>
          <button onClick={handleSave} className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95">
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

export default NewIncomeModal;
