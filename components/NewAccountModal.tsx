
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, TrendingUp } from 'lucide-react';
import { Account } from '../types';
import { getAccountColor, withAlpha } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import {
  PremiumModalShell,
  PremiumModalHeader,
  PremiumModalFooter,
  modalHelperTextClass,
  modalInputClass,
  modalLabelClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
  modalTextareaClass
} from './ui/PremiumModal';
import ColorPickerPopover from './ui/ColorPickerPopover';
import SegmentedControl from './ui/SegmentedControl';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: any) => void;
  initialData?: Account | null;
  mode?: 'create' | 'edit';
  accountTypes: string[];
  onUpdateAccountTypes: (types: string[]) => void;
  defaultNature?: 'PJ' | 'PF';
  source?: string;
}

const NewAccountModal: React.FC<NewAccountModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  mode,
  accountTypes, 
  onUpdateAccountTypes,
  defaultNature = 'PJ',
  source
}) => {
  const isEditMode = mode === 'edit' || Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Conta', isEditMode);
  const fieldIdPrefix = initialData?.id ? `account-${initialData.id}` : 'account-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;
  const isMobile = useIsMobile();
  const [accountName, setAccountName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [accountNature, setAccountNature] = useState<'PJ' | 'PF'>(defaultNature);
  
  // Account Types now come from props
  const [selectedType, setSelectedType] = useState('');
  
  // Yield Fields
  const [yieldRate, setYieldRate] = useState('');
  const [accountColor, setAccountColor] = useState('#0ea5e9');
  
  // UI States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddTypeOpen, setIsAddTypeOpen] = useState(false);
  const [isManageTypesOpen, setIsManageTypesOpen] = useState(false);
  const [newTypeInputValue, setNewTypeInputValue] = useState('');
  const [pendingDeleteType, setPendingDeleteType] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(!isMobile);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addTypePopoverRef = useRef<HTMLDivElement>(null);
  const manageTypesRef = useRef<HTMLDivElement>(null);

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
            setAccountNature(initialData.nature || defaultNature);
        } else {
            setAccountName('');
            setInitialBalance('');
            setCurrentBalance('');
            setSelectedType('');
            setYieldRate('');
            setAccountColor('#0ea5e9');
            setNotes('');
            setAccountNature(defaultNature);
        }
        console.debug('[ui-modal] open', {
            modal: 'account',
            source: source || 'unknown',
            mode: isEditMode ? 'edit' : 'create'
        });
    } else {
        setIsDropdownOpen(false);
        setIsAddTypeOpen(false);
        setIsManageTypesOpen(false);
        setNewTypeInputValue('');
        setPendingDeleteType(null);
        setYieldRate('');
    }
  }, [isOpen, initialData, defaultNature, source, isEditMode]);

  useEffect(() => {
    if (!isOpen) return;
    setIsPreviewOpen(!isMobile);
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsDropdownOpen(false);
      setIsAddTypeOpen(false);
      setIsManageTypesOpen(false);
      setPendingDeleteType(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      if (addTypePopoverRef.current && addTypePopoverRef.current.contains(target)) return;
      if (manageTypesRef.current && manageTypesRef.current.contains(target)) return;
      setIsDropdownOpen(false);
      setIsAddTypeOpen(false);
      setIsManageTypesOpen(false);
      setPendingDeleteType(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper to detect investment types
  const isInvestmentType = (type: string) => {
      const lower = type.toLowerCase();
      return lower.includes('rendimento') || lower.includes('investimento') || lower.includes('aplicação');
  };

  const handleDeleteType = (typeToDelete: string) => {
    if (accountTypes.length <= 1) return;
    const newTypes = accountTypes.filter(t => t !== typeToDelete);
    onUpdateAccountTypes(newTypes);
    
    if (selectedType === typeToDelete) {
      setSelectedType('');
    }
    setPendingDeleteType(null);
  };

  const handleAddType = () => {
    if (newTypeInputValue.trim()) {
      const newType = newTypeInputValue.trim();
      if (!accountTypes.includes(newType)) {
          onUpdateAccountTypes([...accountTypes, newType]);
          setNewTypeInputValue('');
          setIsAddTypeOpen(false);
      }
    }
  };

  const handleSave = () => {
    if (!accountName || !selectedType) return;

    if (mode === 'edit' && !initialData) {
      return;
    }

    const isInvest = isInvestmentType(selectedType);
    const parsedInitialBalance = parseFloat(initialBalance.replace(',', '.')) || 0;
    const parsedCurrentBalance = parseFloat(currentBalance.replace(',', '.'));
    const resolvedCurrentBalance = isEditMode
      ? (Number.isFinite(parsedCurrentBalance) ? parsedCurrentBalance : (initialData?.currentBalance ?? parsedInitialBalance))
      : parsedInitialBalance;

    console.debug('[ui-modal] save', {
      modal: 'account',
      nature: accountNature,
      type: selectedType,
      color: accountColor
    });

    onSave({
      id: initialData?.id, // Pass ID if editing
      name: accountName,
      balance: parsedInitialBalance,
      currentBalance: resolvedCurrentBalance,
      notes: notes.trim(),
      type: selectedType,
      color: accountColor,
      nature: accountNature,
      // Save Yield Rate if investment type
      yieldRate: isInvest && yieldRate ? parseFloat(yieldRate) : undefined,
      yieldIndex: isInvest && yieldRate ? 'CDI' : undefined // Defaulting to CDI for simplicity as per requirements
    });
    onClose();
  };

  return (
    <PremiumModalShell isOpen={isOpen} onClose={onClose} zIndexClass="z-[60]" maxWidthClass="max-w-3xl">
      <PremiumModalHeader
        eyebrow="Contas Financeiras"
        title={isEditMode ? 'Editar Conta' : 'Nova Conta Financeira'}
        subtitle="Ajuste os dados principais da conta e a cor para facilitar a leitura."
        onClose={onClose}
      />
      <div className="px-8 py-8 space-y-7 relative z-30">
            
            {/* Account Name */}
            <div className="space-y-2">
              <label htmlFor={fieldId('name')} className={modalLabelClass}>
                Nome da Conta
              </label>
              <input 
                id={fieldId('name')}
                name="accountName"
                type="text" 
                placeholder="Conta PJ Banco Inter, Caixa MEI..."
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className={modalInputClass}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Initial Balance */}
              <div className="space-y-2 text-center">
                <label className={modalLabelClass}>
                  {isEditMode ? 'Saldo Inicial (somente leitura)' : 'Saldo Inicial (R$)'}
                </label>
                <input 
                  id={fieldId('initial-balance')}
                  name="initialBalance"
                  type="number" 
                  placeholder="0,00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isEditMode}
                  className={`${modalInputClass} text-center ${isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Account Type Section */}
              <div className="space-y-4 relative text-center">
                  <div className="space-y-2">
                      <label className={modalLabelClass}>Natureza da conta</label>
                      <div className="flex justify-center">
                        <SegmentedControl
                          value={accountNature}
                          options={[
                            { label: 'PJ', value: 'PJ' },
                            { label: 'PF', value: 'PF' }
                          ]}
                          onChange={setAccountNature}
                          ariaLabel="Natureza da conta"
                        />
                      </div>
                      <p className={modalHelperTextClass}>
                        Use PJ para contas do negócio e PF para pessoais.
                      </p>
                  </div>

                  <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <label id={fieldId('type-label')} className={modalLabelClass}>
                        Tipo de Conta
                      </label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <div className="relative" ref={addTypePopoverRef}>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddTypeOpen((prev) => !prev);
                              setIsManageTypesOpen(false);
                              setIsDropdownOpen(false);
                              setPendingDeleteType(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 dark:border-zinc-700 bg-white/80 dark:bg-[#111114] px-3 py-1.5 font-semibold text-zinc-600 dark:text-zinc-200 hover:border-indigo-400/60 hover:text-indigo-600 transition"
                          >
                            <Plus size={12} /> Adicionar tipo
                          </button>
                          {isAddTypeOpen && (
                            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0f1014]/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                              <label htmlFor={fieldId('type-new')} className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Novo tipo
                              </label>
                              <input
                                id={fieldId('type-new')}
                                name="accountTypeNew"
                                autoFocus
                                type="text"
                                placeholder="Ex: Conta corrente"
                                value={newTypeInputValue}
                                onChange={(e) => setNewTypeInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddType();
                                }}
                                className={`${modalInputClass} mt-2 px-4 py-2.5 text-sm`}
                              />
                              <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsAddTypeOpen(false)}
                                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-white transition"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAddType}
                                  className="px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition shadow-sm shadow-indigo-500/20"
                                >
                                  Salvar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsManageTypesOpen((prev) => !prev);
                            setIsAddTypeOpen(false);
                            setIsDropdownOpen(false);
                            setPendingDeleteType(null);
                          }}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-indigo-500 transition"
                        >
                          {isManageTypesOpen ? 'Fechar tipos' : 'Gerenciar tipos'}
                        </button>
                      </div>
                  </div>

                  <div className="relative" ref={dropdownRef}>
                      <button 
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(!isDropdownOpen);
                            setIsAddTypeOpen(false);
                            setIsManageTypesOpen(false);
                            setPendingDeleteType(null);
                          }}
                          aria-label="Selecionar tipo de conta"
                          aria-labelledby={fieldId('type-label')}
                          aria-haspopup="listbox"
                          aria-expanded={isDropdownOpen}
                          className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-3.5 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-left"
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

                  {isManageTypesOpen && (
                    <div ref={manageTypesRef} className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-[#101114]/90 p-3 shadow-lg">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-400 mb-3">Tipos cadastrados</p>
                      <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                        {accountTypes.map(type => {
                          const isPending = pendingDeleteType === type;
                          const canDelete = accountTypes.length > 1;
                          return (
                            <div key={type} className="flex items-center justify-between bg-zinc-50 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 p-2.5 rounded-xl">
                              <span className="text-sm font-medium text-zinc-800 dark:text-white/90">{type}</span>
                              {isPending ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-zinc-400">Excluir?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteType(type)}
                                    disabled={!canDelete}
                                    className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    Excluir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteType(null)}
                                    className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteType(type)}
                                  disabled={!canDelete}
                                  className="text-[11px] font-semibold text-zinc-400 hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!accountTypes.length && (
                        <p className="text-xs text-zinc-500">Nenhum tipo cadastrado.</p>
                      )}
                    </div>
                  )}
                  </div>
              </div>
            </div>

            {isEditMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className={modalLabelClass}>Saldo Atual (R$)</label>
                  <input
                    id={fieldId('current-balance')}
                    name="currentBalance"
                    type="number"
                    placeholder="0,00"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    className={modalInputClass}
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor={fieldId('notes')} className={modalLabelClass}>
                    Observações
                  </label>
                  <textarea
                    id={fieldId('notes')}
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Observações internas da conta..."
                    className={modalTextareaClass}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
                <ColorPickerPopover
                  label="Cor da conta"
                  value={accountColor}
                  onChange={setAccountColor}
                  presets={PREMIUM_COLOR_PRESETS}
                  onOpenChange={(open) => {
                    if (!open) return;
                    setIsDropdownOpen(false);
                    setIsAddTypeOpen(false);
                    setIsManageTypesOpen(false);
                    setPendingDeleteType(null);
                  }}
                />
                {isMobile ? (
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-[#101014]/70 p-4">
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen((prev) => !prev)}
                      className="w-full flex items-center justify-between text-sm font-semibold text-zinc-700 dark:text-zinc-200"
                    >
                      Prévia
                      <ChevronDown size={16} className={`transition-transform ${isPreviewOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${isPreviewOpen ? 'max-h-40 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                      <div
                        className="rounded-2xl p-5 border border-white/10 shadow-sm transition-all duration-200 ease-out"
                        style={{ backgroundImage: `linear-gradient(135deg, ${accountColor}, ${withAlpha(accountColor, 0.25)})` }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.4em] text-white/70 mb-2">Prévia</p>
                        <p className="text-xl font-semibold text-white">{accountName || 'Nome da Conta'}</p>
                        <p className="text-xs text-white/70">{selectedType || 'Tipo da Conta'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                      className="rounded-2xl p-5 border border-white/10 shadow-sm transition-all duration-200 ease-out"
                      style={{ backgroundImage: `linear-gradient(135deg, ${accountColor}, ${withAlpha(accountColor, 0.25)})` }}
                  >
                      <p className="text-[10px] uppercase tracking-[0.4em] text-white/70 mb-2">Prévia</p>
                      <p className="text-xl font-semibold text-white">{accountName || 'Nome da Conta'}</p>
                      <p className="text-xs text-white/70">{selectedType || 'Tipo da Conta'}</p>
                  </div>
                )}
            </div>

            {/* CONDITIONAL YIELD FIELD */}
            {isInvestmentType(selectedType) && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-4 text-emerald-200">
                        <TrendingUp size={18} />
                        <h3 className="text-sm font-semibold uppercase tracking-wide">Configuração de Rendimento</h3>
                    </div>
                    <div className="space-y-3">
                        <label htmlFor={fieldId('yieldRate')} className="text-sm font-medium text-emerald-50">
                          Taxa de Rendimento (% do CDI)
                        </label>
                        <input 
                            id={fieldId('yieldRate')}
                            name="yieldRate"
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

      <PremiumModalFooter>
        <button onClick={onClose} className={modalSecondaryButtonClass}>
          Cancelar
        </button>
        <button onClick={handleSave} className={modalPrimaryButtonClass}>
          {primaryLabel}
        </button>
      </PremiumModalFooter>
    </PremiumModalShell>
  );
};

export default NewAccountModal;
