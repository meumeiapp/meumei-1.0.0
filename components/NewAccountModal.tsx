
import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Plus, Trash2, TrendingUp } from 'lucide-react';
import { Account } from '../types';
import { ACCOUNT_COLOR_SUGGESTIONS, getAccountColor, withAlpha } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: any) => void;
  initialData?: Account | null;
  mode?: 'create' | 'edit';
  accountTypes: string[];
  onUpdateAccountTypes: (types: string[]) => void;
}

const NewAccountModal: React.FC<NewAccountModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  mode,
  accountTypes, 
  onUpdateAccountTypes 
}) => {
  const isEditMode = mode === 'edit' || Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Conta', isEditMode);
  const [accountName, setAccountName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [notes, setNotes] = useState('');
  
  // Account Types now come from props
  const [selectedType, setSelectedType] = useState('');
  
  // Yield Fields
  const [yieldRate, setYieldRate] = useState('');
  const [accountColor, setAccountColor] = useState('#0ea5e9');
  
  // UI States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isManagingTypes, setIsManagingTypes] = useState(false);
  const [newTypeInputValue, setNewTypeInputValue] = useState('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset or Populate state
  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            setAccountName(initialData.name);
            setInitialBalance(initialData.initialBalance.toString());
            setCurrentBalance(initialData.currentBalance?.toString() || '');
            setSelectedType(initialData.type);
            setYieldRate(initialData.yieldRate ? initialData.yieldRate.toString() : '');
            setAccountColor(getAccountColor(initialData));
            setNotes(initialData.notes || '');
        } else {
            setAccountName('');
            setInitialBalance('');
            setCurrentBalance('');
            setSelectedType('');
            setYieldRate('');
            setAccountColor('#0ea5e9');
            setNotes('');
        }
    } else {
        setIsManagingTypes(false);
        setIsDropdownOpen(false);
        setNewTypeInputValue('');
        setYieldRate('');
    }
  }, [isOpen, initialData]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Helper to detect investment types
  const isInvestmentType = (type: string) => {
      const lower = type.toLowerCase();
      return lower.includes('rendimento') || lower.includes('investimento') || lower.includes('aplicação');
  };

  const handleDeleteType = (typeToDelete: string) => {
    if (accountTypes.length <= 1) {
      alert("É necessário ter pelo menos um tipo de conta.");
      return;
    }
    const newTypes = accountTypes.filter(t => t !== typeToDelete);
    onUpdateAccountTypes(newTypes);
    
    if (selectedType === typeToDelete) {
      setSelectedType('');
    }
  };

  const handleAddType = () => {
    if (newTypeInputValue.trim()) {
      const newType = newTypeInputValue.trim();
      if (!accountTypes.includes(newType)) {
          onUpdateAccountTypes([...accountTypes, newType]);
          setNewTypeInputValue('');
      }
    }
  };

  const handleSave = () => {
    if (!accountName || !selectedType) return;

    if (mode === 'edit' && !initialData) {
      console.warn('[accounts] edit_without_initial');
      return;
    }

    console.info('[form-save]', { entityName: 'Conta', isEditing: isEditMode, primaryLabel });

    const isInvest = isInvestmentType(selectedType);
    const parsedInitialBalance = parseFloat(initialBalance.replace(',', '.')) || 0;
    const parsedCurrentBalance = parseFloat(currentBalance.replace(',', '.'));
    const resolvedCurrentBalance = isEditMode
      ? (Number.isFinite(parsedCurrentBalance) ? parsedCurrentBalance : (initialData?.currentBalance ?? parsedInitialBalance))
      : parsedInitialBalance;

    onSave({
      id: initialData?.id, // Pass ID if editing
      name: accountName,
      balance: parsedInitialBalance,
      currentBalance: resolvedCurrentBalance,
      notes: notes.trim(),
      type: selectedType,
      color: accountColor,
      // Save Yield Rate if investment type
      yieldRate: isInvest && yieldRate ? parseFloat(yieldRate) : undefined,
      yieldIndex: isInvest && yieldRate ? 'CDI' : undefined // Defaulting to CDI for simplicity as per requirements
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />

        {/* Modal Panel */}
        <div className="relative w-full max-w-3xl transform rounded-[28px] bg-white dark:bg-[#0d0d10] text-left shadow-2xl transition-all sm:my-10 border border-white/10 dark:border-zinc-800/60 overflow-visible">
          
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 rounded-t-[28px] relative z-20">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-400/80 mb-2">Contas Financeiras</p>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
                {isEditMode ? 'Editar Conta' : 'Nova Conta Financeira'}
              </h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-8 py-8 space-y-8 relative z-30">
            
            {/* Account Name */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Nome da Conta</label>
              <input 
                type="text" 
                placeholder="Conta PJ Banco Inter, Caixa MEI..."
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-lg text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-400"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Initial Balance */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {isEditMode ? 'Saldo Inicial (somente leitura)' : 'Saldo Inicial (R$)'}
                </label>
                <input 
                  type="number" 
                  placeholder="0,00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isEditMode}
                  className={`w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-400 ${isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Account Type Section */}
              <div className="space-y-3 relative">
                  <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Tipo de Conta</label>
                      <button
                          type="button"
                          onClick={() => setIsManagingTypes(!isManagingTypes)}
                          className={`text-[10px] font-bold px-3 py-1 rounded-full transition-colors ${
                              isManagingTypes
                              ? 'border border-blue-500 text-blue-200 hover:bg-blue-500/10'
                              : 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                          }`}
                      >
                          {isManagingTypes ? 'Concluir Edição' : 'Editar / + Nova'}
                      </button>
                  </div>

                  {isManagingTypes ? (
                      // Management UI
                      <div className="absolute top-10 left-0 right-0 z-[60] bg-[#05060c]/95 border border-blue-500/20 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex gap-3 mb-4">
                              <input
                                  autoFocus
                                  type="text"
                                  placeholder="Digite nova opção..."
                                  value={newTypeInputValue}
                                  onChange={(e) => setNewTypeInputValue(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                                  className="flex-1 bg-zinc-900/60 border border-zinc-700 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500"
                              />
                              <button
                                  onClick={handleAddType}
                                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-2xl font-semibold text-sm flex items-center gap-1 transition-colors"
                              >
                                  <Plus size={16} /> Add
                              </button>
                          </div>
                          
                          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                               {accountTypes.map(type => (
                                  <div key={type} className="flex items-center justify-between bg-white/5 border border-white/10 p-2.5 rounded-xl group hover:border-blue-400/40 transition-colors">
                                      <span className="text-sm font-medium text-white/90">{type}</span>
                                      <button
                                          onClick={() => handleDeleteType(type)}
                                          className="bg-red-500/10 text-red-300 p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                                          title="Excluir"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  </div>
                               ))}
                          </div>
                      </div>
                  ) : (
                      // Standard Dropdown (Select Mode)
                      <div className="relative" ref={dropdownRef}>
                          <button 
                              type="button"
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-left"
                          >
                              <span className={selectedType ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'}>
                                  {selectedType || 'Selecione...'}
                              </span>
                              <ChevronDown size={20} className={`text-zinc-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {isDropdownOpen && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-3 bg-[#090a10] border border-white/10 rounded-3xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                                  {accountTypes.map((type) => (
                                      <button
                                          key={type}
                                          type="button"
                                          onClick={() => {
                                              setSelectedType(type);
                                              setIsDropdownOpen(false);
                                          }}
                                          className="w-full text-left px-5 py-3 text-white/90 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                      >
                                          {type}
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                  )}
              </div>
            </div>

            {isEditMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Saldo Atual (R$)</label>
                  <input
                    type="number"
                    placeholder="0,00"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Observações</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Observações internas da conta..."
                    className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-400 resize-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Cor da Conta</label>
                    <input 
                        type="color"
                        value={accountColor}
                        onChange={(e) => setAccountColor(e.target.value)}
                        className="w-12 h-12 rounded-2xl border border-white/20 bg-transparent cursor-pointer"
                    />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {ACCOUNT_COLOR_SUGGESTIONS.map(option => (
                        <button
                            type="button"
                            key={option.value}
                            onClick={() => setAccountColor(option.value)}
                            className={`rounded-2xl h-14 px-3 py-2 border transition-all flex flex-col justify-between ${accountColor === option.value ? 'border-white/80 shadow-[0_10px_25px_-12px_rgba(139,92,246,0.8)]' : 'border-white/10 hover:border-white/40'}`}
                            style={{ background: option.value }}
                        >
                            <span className="text-[11px] uppercase tracking-wide text-white/80">{option.label}</span>
                            <span className="text-xs text-white/90">{option.value.toUpperCase()}</span>
                        </button>
                    ))}
                </div>
                <div 
                    className="rounded-[28px] p-6 mt-3 text-white border border-white/10 shadow-2xl"
                    style={{ backgroundImage: `linear-gradient(135deg, ${accountColor}, ${withAlpha(accountColor, 0.25)})` }}
                >
                    <p className="text-xs uppercase tracking-[0.4em] text-white/70 mb-2">Prévia</p>
                    <p className="text-2xl font-semibold">{accountName || 'Nome da Conta'}</p>
                    <p className="text-sm text-white/70">{selectedType || 'Tipo da Conta'}</p>
                </div>
            </div>

            {/* CONDITIONAL YIELD FIELD */}
            {isInvestmentType(selectedType) && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-4 text-emerald-200">
                        <TrendingUp size={18} />
                        <h3 className="text-sm font-semibold uppercase tracking-wide">Configuração de Rendimento</h3>
                    </div>
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-emerald-50">Taxa de Rendimento (% do CDI)</label>
                        <input 
                            type="number" 
                            placeholder="Ex: 100"
                            value={yieldRate}
                            onChange={(e) => setYieldRate(e.target.value)}
                            className="w-full bg-white/10 border border-white/15 text-white rounded-2xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all placeholder:text-white/60"
                        />
                        <p className="text-xs text-white/80">
                            Informe a porcentagem do CDI que esta conta rende (ex: 100% do CDI).
                        </p>
                    </div>
                </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-white/10 flex justify-end gap-4 rounded-b-[28px] bg-white/70 dark:bg-black/20 relative z-20">
              <button 
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl border border-white/20 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
              >
                  Cancelar
              </button>
              <button 
                  onClick={handleSave}
                  className="px-8 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all"
              >
                  {primaryLabel}
              </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default NewAccountModal;
