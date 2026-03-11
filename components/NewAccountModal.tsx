
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, PiggyBank } from 'lucide-react';
import { Account } from '../types';
import { getAccountColor } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import {
  TOUR_SIMULATED_ACCOUNT_PREFIX,
  upsertTourSimulatedAccount
} from '../services/tourSimulationService';
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

type TourAccountAutofillStage =
  | 'name'
  | 'nature'
  | 'type-open'
  | 'type-select'
  | 'initial-balance'
  | 'yield-no'
  | 'color'
  | 'save';

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
  const [hasYield, setHasYield] = useState(false);
  const [accountColor, setAccountColor] = useState('#0ea5e9');
  const [tourAccountTypes, setTourAccountTypes] = useState<string[] | null>(null);
  
  // UI States
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [newTypeInputValue, setNewTypeInputValue] = useState('');
  const [pendingDeleteType, setPendingDeleteType] = useState<string | null>(null);
  const [typeManagerError, setTypeManagerError] = useState('');
  const [isTourSimulationSession, setIsTourSimulationSession] = useState(false);
  const tourAutoFillTimersRef = useRef<number[]>([]);
  const hasTourAutoFilledRef = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});

  const detectTourSimulationMode = () => {
    if (typeof document === 'undefined') return false;
    if (source !== 'accounts') return false;
    return (
      Boolean(document.querySelector('[data-tour-overlay="true"][data-tour-step="accounts"]')) ||
      document.documentElement.classList.contains('mm-tour-active')
    );
  };

  const normalizeTypeLabel = (value: string) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const isYieldTypeByLabel = (type: string) => {
    const normalized = normalizeTypeLabel(type);
    return (
      normalized.includes('rendimento') ||
      normalized.includes('investimento') ||
      normalized.includes('aplica') ||
      normalized.includes('cdi') ||
      normalized.includes('selic') ||
      normalized.includes('yield')
    );
  };

  const resolvedAccountTypes = isTourSimulationSession ? (tourAccountTypes ?? accountTypes) : accountTypes;

  const emitTourAutofillStage = (stage: TourAccountAutofillStage) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('mm:tour-account-autofill-stage', {
        detail: { stage }
      })
    );
  };

  const clearTourAutoFillTimers = () => {
    if (typeof window === 'undefined') return;
    tourAutoFillTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    tourAutoFillTimersRef.current = [];
  };

  // Reset or Populate state
  useEffect(() => {
    if (isOpen) {
        const tourMode = detectTourSimulationMode();
        setIsTourSimulationSession(tourMode);
        if (tourMode && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mm:first-access-tour-started'));
        }
        if (initialData) {
            setAccountName(initialData.name);
            setInitialBalance(initialData.initialBalance.toString());
            setCurrentBalance(initialData.currentBalance?.toString() || '');
            setSelectedType(initialData.type);
            setYieldRate(initialData.yieldRate ? initialData.yieldRate.toString() : '');
            setHasYield(
              Number.isFinite(Number(initialData.yieldRate)) && Number(initialData.yieldRate) > 0
                ? true
                : isYieldTypeByLabel(initialData.type || '')
            );
            setAccountColor(getAccountColor(initialData));
            setNotes(initialData.notes || '');
            setAccountNature(initialData.nature || defaultNature);
        } else {
            setAccountName('');
            setInitialBalance('');
            setCurrentBalance('');
            setSelectedType('');
            setYieldRate('');
            setHasYield(false);
            setAccountColor('#0ea5e9');
            setNotes('');
            setAccountNature(defaultNature);
        }
        setTourAccountTypes(tourMode ? [...accountTypes] : null);
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
        setHasYield(false);
        setTourAccountTypes(null);
        setIsTourSimulationSession(false);
        clearTourAutoFillTimers();
        hasTourAutoFilledRef.current = false;
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

  useEffect(() => {
    if (!isOpen || source !== 'accounts') return;
    const handleTourEnd = () => onClose();
    window.addEventListener('mm:first-access-tour-ended', handleTourEnd as EventListener);
    window.addEventListener('mm:first-access-tour-clear-data', handleTourEnd as EventListener);
    window.addEventListener('mm:first-access-tour-restart', handleTourEnd as EventListener);
    return () => {
      window.removeEventListener('mm:first-access-tour-ended', handleTourEnd as EventListener);
      window.removeEventListener('mm:first-access-tour-clear-data', handleTourEnd as EventListener);
      window.removeEventListener('mm:first-access-tour-restart', handleTourEnd as EventListener);
    };
  }, [isOpen, onClose, source]);

  const handleDeleteType = (typeToDelete: string) => {
    if (resolvedAccountTypes.length <= 1) return;
    const newTypes = resolvedAccountTypes.filter(t => t !== typeToDelete);
    if (isTourSimulationSession) {
      setTourAccountTypes(newTypes);
    } else {
      onUpdateAccountTypes(newTypes);
    }
    
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
    if (resolvedAccountTypes.length >= 20) {
      setTypeManagerError('Limite de categorias atingido.');
      return;
    }
    if (resolvedAccountTypes.some((type) => type.toLowerCase() === normalized.toLowerCase())) {
      setTypeManagerError('Tipo já existe.');
      return;
    }
    if (isTourSimulationSession) {
      setTourAccountTypes([...(tourAccountTypes ?? accountTypes), normalized]);
    } else {
      onUpdateAccountTypes([...accountTypes, normalized]);
    }
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
    if (hasYield && !yieldRate) return;

    if (mode === 'edit' && !initialData) {
      return;
    }

    const parsedInitialBalance = parseFloat(initialBalance.replace(',', '.')) || 0;
    const parsedCurrentBalance = parseFloat(currentBalance.replace(',', '.'));
    const resolvedCurrentBalance = isEditMode
      ? (Number.isFinite(parsedCurrentBalance) ? parsedCurrentBalance : (initialData?.currentBalance ?? parsedInitialBalance))
      : parsedInitialBalance;
    const accountPayload = {
      id: initialData?.id,
      name: accountName,
      balance: parsedInitialBalance,
      currentBalance: resolvedCurrentBalance,
      notes: notes.trim(),
      type: selectedType,
      color: accountColor,
      nature: accountNature,
      yieldRate: hasYield && yieldRate ? parseFloat(yieldRate) : undefined,
      yieldIndex: hasYield && yieldRate ? 'CDI' : undefined
    };

    console.debug('[ui-modal] save', {
      modal: 'account',
      nature: accountNature,
      type: selectedType,
      color: accountColor
    });

    const shouldSimulateOnly = isTourSimulationSession || detectTourSimulationMode();
    if (shouldSimulateOnly) {
      const incomingId = accountPayload.id ? String(accountPayload.id) : '';
      const simulatedId =
        incomingId && incomingId.startsWith(TOUR_SIMULATED_ACCOUNT_PREFIX)
          ? incomingId
          : `${TOUR_SIMULATED_ACCOUNT_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const simulatedAccountPayload = {
        ...accountPayload,
        id: simulatedId
      };
      upsertTourSimulatedAccount(simulatedAccountPayload as Account);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('mm:tour-new-account-simulated', {
            detail: { account: simulatedAccountPayload }
          })
        );
      }
      onClose();
      return;
    }

    onSave(accountPayload);
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
      stage: TourAccountAutofillStage,
      value: string,
      setter: (next: string) => void,
      stepMs = 168,
      pauseAfterMs = 1480
    ) => {
      schedule(() => emitTourAutofillStage(stage), Math.max(340, cursor - 420));
      schedule(() => setter(''), Math.max(220, cursor - 220));
      for (let i = 1; i <= value.length; i += 1) {
        schedule(() => setter(value.slice(0, i)), cursor + i * stepMs);
      }
      cursor += value.length * stepMs + pauseAfterMs;
    };

    const clickStep = (
      stage: TourAccountAutofillStage,
      apply: () => void,
      clickDelayMs = 1180,
      settleDelayMs = 1420
    ) => {
      schedule(() => emitTourAutofillStage(stage), cursor);
      schedule(apply, cursor + clickDelayMs);
      cursor += clickDelayMs + settleDelayMs;
    };

    const baseTypes = tourAccountTypes ?? accountTypes;
    const preferredType =
      baseTypes.find((type) => normalizeTypeLabel(type).includes('banc')) ||
      baseTypes.find((type) => normalizeTypeLabel(type).includes('corrente')) ||
      baseTypes[0] ||
      'Conta Bancária';
    const preferredColor = PREMIUM_COLOR_PRESETS.includes('#3b82f6')
      ? '#3b82f6'
      : (PREMIUM_COLOR_PRESETS[0] || '#0ea5e9');

    schedule(() => setIsTypeManagerOpen(false), 0);
    schedule(() => setHasYield(false), 0);

    typeIn('name', 'Conta Principal', setAccountName, 172, 1420);
    clickStep('nature', () => setAccountNature('PJ'), 1240, 1520);
    clickStep('type-open', () => setIsTypeManagerOpen(true), 1220, 1240);
    clickStep(
      'type-select',
      () => {
        setSelectedType(preferredType);
        setIsTypeManagerOpen(false);
      },
      1260,
      1540
    );
    typeIn('initial-balance', '1000', setInitialBalance, 176, 1560);
    clickStep('yield-no', () => setHasYield(false), 1080, 1320);
    clickStep('color', () => setAccountColor(preferredColor), 1120, 1420);
    schedule(() => emitTourAutofillStage('save'), cursor);
    schedule(() => handleSaveRef.current(), cursor + 1320);

    return () => clearTourAutoFillTimers();
  }, [accountTypes, initialData, isOpen, isTourSimulationSession, tourAccountTypes]);

  const dockFieldClass = isMobile
    ? 'w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500'
    : 'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
  const dockTextareaClass = `${dockFieldClass} min-h-[90px] resize-none`;
  const labelClass = isMobile ? 'text-[10px] uppercase tracking-[0.12em] font-semibold text-white/65' : modalLabelClass;
  const modalBodyClass = isMobile ? 'px-3 py-2.5 space-y-2' : 'px-4 sm:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6';
  const saveButtonLabel = isTourSimulationSession ? 'Salvar' : primaryLabel;
  const canSave = Boolean(accountName && selectedType && accountNature && (!hasYield || yieldRate));
  const modalSupportText = isTourSimulationSession
    ? 'Modo teste do guia: os dados preenchidos serão descartados ao final.'
    : 'Ajuste os dados principais da conta e a cor para facilitar a leitura.';

  const modalBody = (
      <div className={modalBodyClass}>
            
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
                  data-tour-anchor={isTourSimulationSession ? 'accounts-field-name' : undefined}
                  className={dockFieldClass}
                />
              </div>
              <div
                className="space-y-2 md:col-span-1"
                data-tour-anchor={isTourSimulationSession ? 'accounts-field-nature' : undefined}
              >
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
                  data-tour-anchor={isTourSimulationSession ? 'accounts-field-type' : undefined}
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
                  placeholder="Ex.: R$ 0,00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isEditMode}
                  data-tour-anchor={isTourSimulationSession ? 'accounts-field-initial-balance' : undefined}
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
                    placeholder="Ex.: R$ 0,00"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    className={dockFieldClass}
                  />
                </div>
              ) : null}
            </div>

            <div className={`grid grid-cols-1 ${isEditMode ? 'md:grid-cols-2' : ''} gap-2 sm:gap-5 items-start`}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-white/70">
                  <label className={labelClass}>Conta com rendimento?</label>
                  <PiggyBank size={12} className="text-emerald-300/60" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHasYield(false)}
                    data-tour-anchor={isTourSimulationSession ? 'accounts-field-yield-no' : undefined}
                    className={`h-7 min-w-[62px] px-2.5 rounded-md border text-[11px] font-medium transition ${
                      !hasYield
                        ? 'border-cyan-300/70 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/15 bg-transparent text-white/60 hover:text-white/85 hover:border-white/30'
                    }`}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasYield(true)}
                    className={`h-7 min-w-[62px] px-2.5 rounded-md border text-[11px] font-medium transition ${
                      hasYield
                        ? 'border-cyan-300/70 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/15 bg-transparent text-white/60 hover:text-white/85 hover:border-white/30'
                    }`}
                  >
                    Sim
                  </button>
                  {hasYield ? (
                    <div className="flex items-center gap-1.5 ml-1">
                      <label
                        htmlFor={fieldId('yieldRate')}
                        className="text-[10px] uppercase tracking-[0.12em] text-white/55"
                      >
                        Taxa %
                      </label>
                      <input
                        id={fieldId('yieldRate')}
                        name="yieldRate"
                        type="number"
                        placeholder="100"
                        value={yieldRate}
                        onChange={(e) => setYieldRate(e.target.value)}
                        className="h-7 w-[88px] rounded-md border border-white/15 bg-transparent px-2 text-[11px] text-white outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 placeholder:text-white/35"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
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

            <div
              className="space-y-2"
              data-tour-anchor={isTourSimulationSession ? 'accounts-field-color' : undefined}
            >
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

          </div>
  );

  const modalFooter = (
      <PremiumModalFooter fullScreen>
          <div className="grid grid-cols-2 gap-3 w-full">
              <button
                  onClick={onClose}
                  disabled={isTourSimulationSession}
                  className={`${modalSecondaryButtonClass} ${
                      isTourSimulationSession
                          ? 'opacity-45 cursor-not-allowed pointer-events-none'
                          : 'hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
              >
                  Cancelar
              </button>
              <button
                  onClick={handleSave}
                  data-tour-action={isTourSimulationSession ? 'tour-account-save' : undefined}
                  data-tour-anchor={isTourSimulationSession ? 'accounts-field-save' : undefined}
                  disabled={!canSave}
                  className={`${modalPrimaryButtonClass} shadow-none ${!canSave ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                  {saveButtonLabel}
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
                          {resolvedAccountTypes.map((type) => {
                              const isPending = pendingDeleteType === type;
                              const canDelete = resolvedAccountTypes.length > 1;
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
                          {!resolvedAccountTypes.length && (
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
              <div className="fixed inset-0 z-[1300]" data-modal-root="true">
                  <button
                      type="button"
                      onClick={onClose}
                      className="absolute inset-0 bg-black/60"
                      aria-label="Fechar conta"
                  />
                  <div
                      data-tour-anchor="accounts-new-account-modal"
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
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                          <div className="min-w-0">
                              <p className={`${isMobile ? 'text-[15px]' : 'text-sm'} font-semibold truncate`}>
                                  {isEditMode ? 'Editar Conta' : 'Nova Conta'}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {modalSupportText}
                              </p>
                          </div>
                          <button
                              type="button"
                              onClick={onClose}
                              className={`h-8 w-8 ${isMobile ? 'rounded-xl' : 'rounded-full'} bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center`}
                              aria-label="Fechar conta"
                              data-tour-anchor={isTourSimulationSession && isEditMode ? 'accounts-edit-close' : undefined}
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
          <div data-tour-anchor={isOpen ? 'accounts-new-account-modal' : undefined}>
              <PremiumModalShell
                  isOpen={isOpen}
                  onClose={onClose}
                  zIndexClass="z-[1200]"
                  fullScreen
              >
                  <PremiumModalHeader
                      eyebrow="Contas Financeiras"
                      title={isEditMode ? 'Editar Conta' : 'Nova Conta Financeira'}
                      subtitle={modalSupportText}
                      onClose={onClose}
                      fullScreen
                  />
                  {modalBody}
                  {modalFooter}
              </PremiumModalShell>
          </div>
          {typeManagerModal}
      </>
  );
};

export default NewAccountModal;
