
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Edit2, PiggyBank, Plus, Trash2, X } from 'lucide-react';
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
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
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
        setEditingType(null);
        setEditingTypeName('');
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
    if (editingType === typeToDelete) {
      setEditingType(null);
      setEditingTypeName('');
    }
    setTypeManagerError('');
  };

  const handleAddType = () => {
    const normalized = newTypeInputValue.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      setTypeManagerError('Informe um nome para o tipo.');
      return;
    }
    if (resolvedAccountTypes.length >= 20) {
      setTypeManagerError('Limite de 20 tipos atingido.');
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

  const handleStartTypeEditing = (type: string) => {
    setEditingType(type);
    setEditingTypeName(type);
    setTypeManagerError('');
  };

  const handleCancelTypeEditing = () => {
    setEditingType(null);
    setEditingTypeName('');
    setTypeManagerError('');
  };

  const handleSaveTypeEditing = (originalType: string) => {
    const normalizedName = editingTypeName.trim().replace(/\s+/g, ' ');
    const originalComparable = originalType.toLowerCase();
    const nextComparable = normalizedName.toLowerCase();
    if (!normalizedName) {
      setTypeManagerError('Informe um nome para o tipo.');
      return;
    }
    if (nextComparable === originalComparable) {
      handleCancelTypeEditing();
      return;
    }
    const alreadyExists = resolvedAccountTypes.some((type) => {
      const comparable = type.toLowerCase();
      return comparable !== originalComparable && comparable === nextComparable;
    });
    if (alreadyExists) {
      setTypeManagerError('Tipo já existe.');
      return;
    }
    const updatedTypes = resolvedAccountTypes.map((type) => (type === originalType ? normalizedName : type));
    if (isTourSimulationSession) {
      setTourAccountTypes(updatedTypes);
    } else {
      onUpdateAccountTypes(updatedTypes);
    }
    if (selectedType === originalType) {
      setSelectedType(normalizedName);
    }
    handleCancelTypeEditing();
  };

  const closeTypeManager = () => {
    setIsTypeManagerOpen(false);
    setEditingType(null);
    setEditingTypeName('');
    setTypeManagerError('');
  };

  useEffect(() => {
    if (isTypeManagerOpen) return;
    setEditingType(null);
    setEditingTypeName('');
    setTypeManagerError('');
    setNewTypeInputValue('');
  }, [isTypeManagerOpen]);

  useEffect(() => {
    if (!editingType) return;
    if (resolvedAccountTypes.includes(editingType)) return;
    setEditingType(null);
    setEditingTypeName('');
  }, [editingType, resolvedAccountTypes]);

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
    : 'w-full min-h-[38px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] leading-5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
  const dockTextareaClass = `${dockFieldClass} min-h-[90px] resize-none`;
  const labelClass = isMobile ? 'text-[10px] uppercase tracking-[0.12em] font-semibold text-white/65' : modalLabelClass;
  const modalBodyClass = isMobile ? 'px-3 py-2.5 space-y-2' : 'px-4 sm:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6';
  const dockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const dockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const dockMaxHeight =
    'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';
  const saveButtonLabel = isTourSimulationSession ? 'Salvar' : primaryLabel;
  const canSave = Boolean(accountName && selectedType && accountNature && (!hasYield || yieldRate));
  const modalSupportText = isTourSimulationSession
    ? 'Modo teste do guia: os dados preenchidos serão descartados ao final.'
    : 'Ajuste os dados principais da conta e a cor para facilitar a leitura.';

  const modalBody = (
      <div className={modalBodyClass}>
            
            {/* Account Name */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-5 items-start">
              <div className="space-y-0.5 md:col-span-1">
                <div className="flex items-center min-h-[18px]">
                  <label htmlFor={fieldId('name')} className={labelClass}>
                    Nome da Conta
                  </label>
                </div>
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
                className="space-y-0.5 md:col-span-1"
                data-tour-anchor={isTourSimulationSession ? 'accounts-field-nature' : undefined}
              >
                <div className="flex items-center min-h-[18px]">
                  <label className={labelClass}>Natureza fiscal</label>
                </div>
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
              <div className="space-y-0.5 md:col-span-1">
                <div className="flex items-center justify-between min-h-[18px]">
                  <label className={labelClass}>Tipo de conta</label>
                  {!isMobile && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {resolvedAccountTypes.length}/20
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTypeManagerError('');
                    setIsTypeManagerOpen(true);
                  }}
                  data-tour-anchor={isTourSimulationSession ? 'accounts-field-type' : undefined}
                  className={`${dockFieldClass} flex items-center justify-between text-left`}
                >
                  <span className={selectedType ? 'text-zinc-900 dark:text-white' : 'text-[11px] font-normal text-zinc-400'}>
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
          {/*
            Dock desktop segue o mesmo padrão full-width do seletor de categorias.
            Fora do dock (ex.: onboarding), mantemos modal centralizado.
          */}
          <button
              type="button"
              onClick={closeTypeManager}
              className={
                  isMobile
                      ? 'absolute inset-0 bg-black/60'
                      : variant === 'dock' || forceDock
                          ? 'absolute left-0 right-0 bg-black/70 backdrop-blur-sm'
                          : 'absolute inset-0 bg-black/60'
              }
              style={
                  isMobile
                      ? undefined
                      : variant === 'dock' || forceDock
                          ? { top: dockTopOffset, bottom: dockBottomOffset }
                          : undefined
              }
              aria-label="Fechar tipos de conta"
          />
          <div
              className={
                  isMobile
                      ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                      : variant === 'dock' || forceDock
                          ? 'absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl'
                          : 'absolute left-1/2 -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 flex flex-col w-[min(920px,calc(100%-48px))] max-w-[min(920px,calc(100%-48px))]'
              }
              style={
                  isMobile
                      ? undefined
                      : variant === 'dock' || forceDock
                          ? {
                                bottom: dockBottomOffset,
                                maxHeight: `max(320px, ${dockMaxHeight})`
                            }
                          : {
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                                maxHeight: 'min(80dvh, 820px)'
                            }
              }
          >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Tipos de Conta</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Selecione, adicione, edite ou exclua (até 20).
                      </p>
                  </div>
                  <button
                      type="button"
                      onClick={closeTypeManager}
                      className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar tipos de conta"
                  >
                      <X size={16} />
                  </button>
              </div>

              <div className="pt-3 flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto overscroll-contain pr-0.5">
                      {resolvedAccountTypes.length === 0 ? (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
                              Nenhum tipo cadastrado.
                          </div>
                      ) : (
                          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-8'} gap-2`}>
                              {resolvedAccountTypes.map((type) => {
                                  const isSelected = selectedType === type;
                                  const canDelete = resolvedAccountTypes.length > 1;
                                  const isEditingCard = editingType === type;
                                  return (
                                      <div
                                          key={type}
                                          className={`h-20 rounded-lg border p-2 transition ${
                                              isSelected
                                                  ? 'border-indigo-400/60 bg-indigo-500/10'
                                                  : 'border-zinc-200/70 dark:border-zinc-800 bg-transparent'
                                          }`}
                                      >
                                          {isEditingCard ? (
                                              <div className="h-full flex flex-col gap-1.5">
                                                  <input
                                                      type="text"
                                                      value={editingTypeName}
                                                      onChange={(event) => {
                                                          setEditingTypeName(event.target.value);
                                                          setTypeManagerError('');
                                                      }}
                                                      onKeyDown={(event) => {
                                                          if (event.key === 'Enter') handleSaveTypeEditing(type);
                                                          if (event.key === 'Escape') handleCancelTypeEditing();
                                                      }}
                                                      className={`${dockFieldClass} h-8 text-[11px]`}
                                                      aria-label={`Editar tipo ${type}`}
                                                  />
                                                  <div className="grid grid-cols-2 gap-1.5 h-8">
                                                      <button
                                                          type="button"
                                                          onClick={() => handleSaveTypeEditing(type)}
                                                          className="rounded-md border border-indigo-500/40 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10"
                                                      >
                                                          Salvar
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={handleCancelTypeEditing}
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
                                                          setSelectedType(type);
                                                          closeTypeManager();
                                                      }}
                                                      className="absolute inset-0 rounded-md text-left px-1 py-1.5 pr-16 text-[12px] font-semibold leading-tight break-words line-clamp-2 hover:text-zinc-900 dark:hover:text-white"
                                                  >
                                                      {type}
                                                  </button>
                                                  <div className="absolute right-0 bottom-0 flex items-center justify-end gap-1.5 z-10">
                                                      <button
                                                          type="button"
                                                          onClick={(event) => {
                                                              event.stopPropagation();
                                                              handleStartTypeEditing(type);
                                                          }}
                                                          className="h-7 w-7 rounded-md border border-zinc-300/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 flex items-center justify-center"
                                                          aria-label={`Editar tipo ${type}`}
                                                      >
                                                          <Edit2 size={12} />
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={(event) => {
                                                              event.stopPropagation();
                                                              if (!canDelete) return;
                                                              const confirmed = window.confirm(`Excluir o tipo "${type}"?`);
                                                              if (confirmed) handleDeleteType(type);
                                                          }}
                                                          disabled={!canDelete}
                                                          className={`h-7 w-7 rounded-md border flex items-center justify-center ${
                                                              canDelete
                                                                  ? 'border-red-400/40 text-red-500 hover:bg-red-500/10'
                                                                  : 'border-zinc-300/60 dark:border-zinc-700 text-zinc-400 cursor-not-allowed opacity-50'
                                                          }`}
                                                          aria-label={`Excluir tipo ${type}`}
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
                      {typeManagerError && (
                          <p className="text-[11px] text-rose-500 px-0.5 mb-1.5">{typeManagerError}</p>
                      )}
                      <div className={isMobile ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-12 gap-2 items-center'}>
                          <input
                              id={fieldId('type-new')}
                              name="accountTypeNew"
                              type="text"
                              placeholder={resolvedAccountTypes.length >= 20 ? 'Limite de 20 tipos atingido.' : 'Novo tipo...'}
                              value={newTypeInputValue}
                              onChange={(e) => {
                                  setNewTypeInputValue(e.target.value);
                                  setTypeManagerError('');
                              }}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddType();
                              }}
                              className={`${dockFieldClass} ${isMobile ? '' : 'col-span-9'} ${
                                  typeManagerError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                              }`}
                          />
                          <button
                              type="button"
                              onClick={handleAddType}
                              className={`${isMobile ? '' : 'col-span-3'} h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-500/30 flex items-center justify-center gap-1.5`}
                          >
                              <Plus size={14} />
                              Adicionar
                          </button>
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
                      className="absolute left-0 right-0 bg-black/70 backdrop-blur-sm"
                      style={isMobile ? undefined : { top: dockTopOffset, bottom: dockBottomOffset }}
                      aria-label="Fechar conta"
                  />
                  <div
                      data-tour-anchor="accounts-new-account-modal"
                      className={
                          isMobile
                              ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
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
                      <div className="pt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">{modalBody}</div>
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
