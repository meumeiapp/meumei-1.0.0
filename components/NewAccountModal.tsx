
import React, { useState, useEffect } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { Account } from '../types';
import { getAccountColor } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import {
  PremiumModalShell,
  PremiumModalHeader,
  PremiumModalFooter,
  modalLabelClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass
} from './ui/PremiumModal';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';
import SelectDropdown from './common/SelectDropdown';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: any) => void;
  initialData?: Account | null;
  mode?: 'create' | 'edit';
  accountTypes: string[];
  onUpdateAccountTypes: (types: string[]) => void;
  defaultNature?: 'PJ' | 'PF' | '';
  source?: string;
  variant?: 'default' | 'dock';
  forceDock?: boolean;
}

const NewAccountModal: React.FC<NewAccountModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  mode,
  accountTypes, 
  onUpdateAccountTypes,
  defaultNature = '',
  source,
  variant = 'default',
  forceDock = false
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
  const [accountNature, setAccountNature] = useState<'PJ' | 'PF' | ''>(defaultNature);
  
  // Account Types now come from props
  const [selectedType, setSelectedType] = useState('');
  
  // Yield Fields
  const [yieldRate, setYieldRate] = useState('');
  const [accountColor, setAccountColor] = useState('#0ea5e9');
  
  // UI States
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [newTypeInputValue, setNewTypeInputValue] = useState('');
  const [pendingDeleteType, setPendingDeleteType] = useState<string | null>(null);
  const [typeManagerError, setTypeManagerError] = useState('');

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
        setIsTypeManagerOpen(false);
        setNewTypeInputValue('');
        setPendingDeleteType(null);
        setTypeManagerError('');
        setYieldRate('');
    }
  }, [isOpen, initialData, defaultNature, source, isEditMode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTypeManagerOpen) {
        setIsTypeManagerOpen(false);
        return;
      }
      setPendingDeleteType(null);
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTypeManagerOpen, onClose]);

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
    const normalized = newTypeInputValue.trim();
    if (!normalized) {
      setTypeManagerError('Informe um nome para o tipo.');
      return;
    }
    if (accountTypes.length >= 20) {
      setTypeManagerError('Limite de categorias atingido.');
      return;
    }
    if (accountTypes.some((type) => type.toLowerCase() === normalized.toLowerCase())) {
      setTypeManagerError('Tipo já existe.');
      return;
    }
    onUpdateAccountTypes([...accountTypes, normalized]);
    setNewTypeInputValue('');
    setTypeManagerError('');
  };

  const closeTypeManager = () => {
    setIsTypeManagerOpen(false);
    setPendingDeleteType(null);
    setTypeManagerError('');
  };

  const handleSave = () => {
    if (!accountName || !selectedType || !accountNature) return;

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

  const dockFieldClass = isMobile
    ? 'w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2 py-1 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:font-light placeholder:text-zinc-400'
    : 'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
  const dockTextareaClass = `${dockFieldClass} min-h-[80px] resize-none`;
  const labelClass = isMobile ? 'text-sm uppercase tracking-wide font-light text-white/70' : modalLabelClass;

  const modalBody = (
      <div className="px-4 sm:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
            
            {/* Account Name */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-5 items-start">
              <div className="space-y-2 md:col-span-1">
                <label htmlFor={fieldId('name')} className={labelClass}>
                  Nome da Conta
                </label>
                <input 
                  id={fieldId('name')}
                  name="accountName"
                  type="text" 
                  placeholder="Ex: Banco Inter PJ, Nubank PF"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className={dockFieldClass}
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className={labelClass}>Natureza fiscal</label>
                <SelectDropdown
                  value={accountNature}
                  onChange={(value) => setAccountNature(value as 'PJ' | 'PF')}
                  options={[
                    { label: 'Pessoa Jurídica', value: 'PJ' },
                    { label: 'Pessoa Física', value: 'PF' }
                  ]}
                  placeholder="Selecione"
                  buttonClassName={dockFieldClass}
                  listClassName="max-h-56"
                  placeholderClassName="text-sm font-light"
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className={labelClass}>Tipo de conta</label>
                <button
                  type="button"
                  onClick={() => {
                    setTypeManagerError('');
                    setIsTypeManagerOpen(true);
                  }}
                  className={`${dockFieldClass} flex items-center justify-between text-left`}
                >
                  <span className={selectedType ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'}>
                    {selectedType || 'Selecione'}
                  </span>
                  <ChevronDown size={16} className="text-zinc-400" />
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${isEditMode ? 'md:grid-cols-2' : ''} gap-2 sm:gap-5 items-start`}>
              <div className="space-y-2">
                <label className={labelClass}>
                  {isEditMode ? 'Saldo Inicial (somente leitura)' : 'Saldo Inicial (R$)'}
                </label>
                <input
                  id={fieldId('initial-balance')}
                  name="initialBalance"
                  type="number"
                  placeholder="Ex: R$0,00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isEditMode}
                  className={`${dockFieldClass} ${isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              {isEditMode ? (
                <div className="space-y-2">
                  <label className={labelClass}>Saldo Atual (R$)</label>
                  <input
                    id={fieldId('current-balance')}
                    name="currentBalance"
                    type="number"
                    placeholder="Ex: R$0,00"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    className={dockFieldClass}
                  />
                </div>
              ) : null}
            </div>

            {isEditMode && (
              <div className="space-y-2">
                <label htmlFor={fieldId('notes')} className={labelClass}>
                  Observações
                </label>
                <textarea
                  id={fieldId('notes')}
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Observações internas da conta..."
                  className={dockTextareaClass}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className={labelClass}>Cor da tag</label>
              <div className="flex flex-wrap gap-2">
                {PREMIUM_COLOR_PRESETS.map((color) => {
                  const isActive = accountColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccountColor(color)}
                      className={`h-7 w-7 rounded-full border transition ${isActive ? 'border-white/90 shadow-[0_0_0_2px_rgba(255,255,255,0.3)]' : 'border-white/20'}`}
                      aria-label={`Selecionar cor ${color}`}
                    >
                      <span className="block h-full w-full rounded-full" style={{ backgroundColor: color }} />
                    </button>
                  );
                })}
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
  );

  const modalFooter = (
      <PremiumModalFooter fullScreen>
          <div className="grid grid-cols-2 gap-3 w-full">
              <button onClick={onClose} className={`${modalSecondaryButtonClass} hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600`}>
                  Cancelar
              </button>
              <button
                  onClick={handleSave}
                  disabled={!accountName || !selectedType || !accountNature}
                  className={`${modalPrimaryButtonClass} shadow-none ${!accountName || !selectedType || !accountNature ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                  Salvar
              </button>
          </div>
      </PremiumModalFooter>
  );

  const typeManagerModal = isTypeManagerOpen ? (
      <div className="fixed inset-0 z-[1400]">
          <button
              type="button"
              onClick={closeTypeManager}
              className="absolute inset-0 bg-black/60"
              aria-label="Fechar tipos de conta"
          />
          <div
              className={
                  isMobile
                      ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                      : 'absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]'
              }
          >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Tipos de Conta</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Gerencie e personalize os tipos das contas (até 20).
                      </p>
                  </div>
                  <button
                      type="button"
                      onClick={closeTypeManager}
                      className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar tipos de conta"
                  >
                      <ChevronDown size={16} />
                  </button>
              </div>

              <div className="pt-3 flex-1 overflow-auto space-y-4">
                  <div className="space-y-2">
                      <label htmlFor={fieldId('type-new')} className={labelClass}>
                          Novo tipo
                      </label>
                      <div className="flex items-center gap-2">
                          <input
                              id={fieldId('type-new')}
                              name="accountTypeNew"
                              type="text"
                              placeholder="Ex: Conta corrente"
                              value={newTypeInputValue}
                              onChange={(e) => setNewTypeInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddType();
                              }}
                              className={dockFieldClass}
                          />
                          <button
                              type="button"
                              onClick={handleAddType}
                              className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-500/30"
                          >
                              Adicionar
                          </button>
                      </div>
                      {typeManagerError && (
                          <p className="text-[11px] text-rose-500">{typeManagerError}</p>
                      )}
                  </div>

                  <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-400">Tipos cadastrados</p>
                      <div className="space-y-2">
                          {accountTypes.map((type) => {
                              const isPending = pendingDeleteType === type;
                              const canDelete = accountTypes.length > 1;
                              const isSelected = selectedType === type;
                              return (
                                  <div key={type} className={`flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                                      isSelected ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-zinc-200/80 dark:border-white/10 bg-white/60 dark:bg-black/20'
                                  }`}>
                                      <button
                                          type="button"
                                          onClick={() => {
                                              setSelectedType(type);
                                              closeTypeManager();
                                          }}
                                          className="text-left flex-1 text-sm font-medium text-zinc-800 dark:text-white/90"
                                      >
                                          {type}
                                      </button>
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
                          {!accountTypes.length && (
                              <p className="text-xs text-zinc-500">Nenhum tipo cadastrado.</p>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      </div>
  ) : null;

  if (variant === 'dock') {
      if (!isOpen) return null;
      return (
          <>
              <div className="fixed inset-0 z-[1300]">
                  <button
                      type="button"
                      onClick={onClose}
                      className="absolute inset-0 bg-black/60"
                      aria-label="Fechar conta"
                  />
                  <div
                      className={
                          isMobile
                              ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                              : 'absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]'
                      }
                  >
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                          <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{isEditMode ? 'Editar Conta' : 'Nova Conta'}</p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  Ajuste os dados principais da conta e a cor para facilitar a leitura.
                              </p>
                          </div>
                          <button
                              type="button"
                              onClick={onClose}
                              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                              aria-label="Fechar conta"
                          >
                              <ChevronDown size={16} />
                          </button>
                      </div>
                      <div className="pt-3 flex-1 overflow-auto">{modalBody}</div>
                      {modalFooter}
                  </div>
              </div>
              {typeManagerModal}
          </>
      );
  }

  return (
      <>
          <PremiumModalShell
              isOpen={isOpen}
              onClose={onClose}
              zIndexClass="z-[1200]"
              fullScreen
          >
              <PremiumModalHeader
                  eyebrow="Contas Financeiras"
                  title={isEditMode ? 'Editar Conta' : 'Nova Conta Financeira'}
                  subtitle="Ajuste os dados principais da conta e a cor para facilitar a leitura."
                  onClose={onClose}
                  fullScreen
              />
              {modalBody}
              {modalFooter}
          </PremiumModalShell>
          {typeManagerModal}
      </>
  );
};

export default NewAccountModal;
