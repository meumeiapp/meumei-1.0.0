
import React, { useMemo, useState, useEffect } from 'react';
import { X, TrendingUp, ChevronDown } from 'lucide-react';
import { Account } from '../types';
import { useAuth } from '../contexts/AuthContext';
import useIsMobile from '../hooks/useIsMobile';
import SelectDropdown from './common/SelectDropdown';
import WheelDatePicker from './common/WheelDatePicker';
import { getPrimaryActionLabel } from '../utils/formLabels';
import {
  modalInputClass,
  modalLabelClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
  modalTextareaClass
} from './ui/PremiumModal';

interface NewYieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { accountId: string, amount: number, date: string, notes: string }) => Promise<void> | void;
  accounts: Account[];
  licenseId?: string | null;
  initialData?: { accountId: string; amount: number; date: string; notes: string } | null;
  variant?: 'modal' | 'inline' | 'dock';
}

const NewYieldModal: React.FC<NewYieldModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  accounts,
  licenseId,
  initialData = null,
  variant = 'modal'
}) => {
  const isMobile = useIsMobile();
  const isDock = variant === 'dock';
  const isDockDesktop = isDock && !isMobile;
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const { user: authUser } = useAuth();

  // Filtra apenas contas de investimento/rendimento
  const investmentAccounts = accounts.filter(acc => {
      const isYieldType = acc.type.toLowerCase().includes('rendimento') || acc.type.toLowerCase().includes('investimento');
      return (isYieldType || (acc.yieldRate !== undefined && acc.yieldRate > 0)) && !acc.locked;
  });

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            setAccountId(initialData.accountId);
            setAmount(initialData.amount.toString());
            setDate(initialData.date);
            setNotes(initialData.notes);
        } else {
            setAccountId('');
            setAmount('');
            
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            const today = now.toISOString().split('T')[0];

            setDate(today);
            setNotes('');
        }
    }
  }, [isOpen, accounts, initialData]);

  const isEditing = Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Rendimento', isEditing);
  const fieldIdPrefix = initialData?.date ? `yield-${initialData.date}` : 'yield-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;
  const dockFieldClass =
    'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2';
  const labelClass = isDockDesktop
    ? modalLabelClass
    : isMobile
      ? 'text-[10px] uppercase tracking-wide font-bold text-white'
      : modalLabelClass;
  const inputBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-indigo-500/40`
    : `${modalInputClass} ${isMobile ? 'pr-8 placeholder:uppercase placeholder:font-light placeholder:text-[10px]' : ''}`;
  const selectBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-indigo-500/40 text-left`
    : `${modalInputClass} text-left`;
  const textareaBaseClass = isDockDesktop
    ? `${dockFieldClass} focus:ring-indigo-500/40 min-h-[80px] resize-none`
    : `${modalTextareaClass} ${isMobile ? 'placeholder:uppercase placeholder:font-light placeholder:text-[10px]' : ''}`;

  const handleSave = async () => {
    const uid = authUser?.uid || '';
    const email = authUser?.email || '';
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    console.info('[yields] UI_add_click', {
        accountId,
        amount: parsedAmount,
        date,
        notes,
        licenseId,
        uid,
        email
    });
    if (!licenseId) {
        console.warn('[yields] UI_add_blocked', {
            reason: 'license_missing',
            accountId,
            amount: parsedAmount,
            date,
            notes,
            licenseId,
            uid,
            email
        });
        return;
    }
    if (!accountId) {
        console.warn('[yields] UI_add_blocked', {
            reason: 'account_missing',
            accountId,
            amount: parsedAmount,
            date,
            notes,
            licenseId,
            uid,
            email
        });
        return;
    }
    if (!amount || Number.isNaN(parsedAmount)) {
        console.warn('[yields] UI_add_blocked', {
            reason: 'amount_missing',
            accountId,
            amount: parsedAmount,
            date,
            notes,
            licenseId,
            uid,
            email
        });
        return;
    }
    if (!date) {
        console.warn('[yields] UI_add_blocked', {
            reason: 'date_missing',
            accountId,
            amount: parsedAmount,
            date,
            notes,
            licenseId,
            uid,
            email
        });
        return;
    }

    console.info('[form-save]', { entityName: 'Rendimento', isEditing, primaryLabel });

    await onSave({
        accountId,
        amount: parsedAmount,
        date,
        notes
    });
  };

  const selectedAccount = investmentAccounts.find(a => a.id === accountId);
  const accountOptions = useMemo(
    () =>
      investmentAccounts.map((acc) => ({
        value: acc.id,
        label: acc.name
      })),
    [investmentAccounts]
  );

  if (!isOpen) return null;

  const formFields = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <label htmlFor={fieldId('date')} className={labelClass}>
            Data do Rendimento
          </label>
          <WheelDatePicker
            value={date}
            onChange={setDate}
            buttonClassName={inputBaseClass}
            disabled={isEditing}
            ariaLabel="Selecionar data do rendimento"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={fieldId('account')} className={labelClass}>
            Conta
          </label>
          <SelectDropdown
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            placeholder="SELECIONE"
            disabled={isEditing}
            buttonClassName={`${selectBaseClass} ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
            listClassName="max-h-56"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={fieldId('amount')} className={labelClass}>
          Valor Rendido (R$)
        </label>
        <div className="relative">
          <input
            id={fieldId('amount')}
            name="amount"
            type="number"
            placeholder="R$ 0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputBaseClass} pr-4 sm:pr-5 font-bold`}
          />
        </div>
        {selectedAccount && !selectedAccount.locked && (
          <p className="text-[10px] text-zinc-400 text-right">
            Saldo Atual: R$ {selectedAccount.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={fieldId('notes')} className={labelClass}>
          Observações
        </label>
        <textarea
          id={fieldId('notes')}
          name="notes"
          rows={3}
          placeholder="INFORMAÇÕES ADICIONAIS..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={textareaBaseClass}
        />
      </div>
    </>
  );

  const footerActions = (
    <div
      className={`border-t border-zinc-100 dark:border-zinc-800 pt-4 ${isDockDesktop ? '' : ''} ${
        isDockDesktop ? '' : `flex ${isMobile ? 'flex-col' : 'justify-end'} gap-3`
      }`}
    >
      {isDockDesktop ? (
        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className={`${modalSecondaryButtonClass} w-full`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`${modalPrimaryButtonClass} w-full`}
          >
            {primaryLabel}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onClose}
            className={`${modalSecondaryButtonClass} ${isMobile ? 'w-full' : ''}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`${modalPrimaryButtonClass} ${isMobile ? 'w-full' : ''}`}
          >
            {primaryLabel}
          </button>
        </>
      )}
    </div>
  );

  if (isMobile) {
    const headerTitle = isEditing ? 'Editar Rendimento' : 'Novo Rendimento';
    return (
      <div className="fixed inset-0 z-[1200]">
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/70"
          aria-label="Fechar rendimento"
        />
        <div
          className="absolute left-0 right-0 bottom-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
          style={{ top: 0 }}
        >
          <div className="px-3 pt-2 pb-2 bg-gradient-to-r from-indigo-500/80 via-indigo-500/35 to-black">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-white" />
                  <p className="text-sm font-semibold text-white truncate">{headerTitle}</p>
                </div>
                <p className="text-[10px] text-white/70">Preencha os dados para registrar o rendimento.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                aria-label="Fechar rendimento"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden px-2 pt-1 pb-16">
            {formFields}
          </div>
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isDock) {
    return (
      <div className="fixed inset-0 z-[1200]">
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
          aria-label="Fechar rendimento"
        />
        <div
          className="absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{isEditing ? 'Editar Rendimento' : 'Novo Rendimento'}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Preencha os dados para registrar o rendimento.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
              aria-label="Fechar rendimento"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="pt-3 flex-1 overflow-auto space-y-4">{formFields}</div>
          {footerActions}
        </div>
      </div>
    );
  }

  const formContent = (
    <>
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="text-indigo-600 dark:text-indigo-400" />
          {isEditing ? 'Editar Rendimento' : 'Novo Rendimento'}
        </h2>
        <button
          onClick={onClose}
          aria-label="Fechar modal"
          className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-5 sm:p-6 space-y-5 sm:space-y-6">
        {formFields}
      </div>

      <div className="p-5 sm:p-6 bg-white dark:bg-[#1a1a1a] rounded-b-2xl">
        {footerActions}
      </div>
    </>
  );

  if (variant === 'inline') {
    return (
      <div className="w-full rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 space-y-5 sm:space-y-6">
          {formFields}
        </div>
        <div className="p-5 sm:p-6 bg-white dark:bg-[#1a1a1a] border-t border-zinc-100 dark:border-zinc-800">
          {footerActions}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1200]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full items-stretch justify-center px-0">
        <div className="relative w-full h-full max-w-none bg-white dark:bg-[#0d0d10] text-left shadow-2xl transition-all border border-white/10 dark:border-zinc-800/60 overflow-y-auto rounded-none">
          {formContent}
        </div>
      </div>
    </div>
  );
};

export default NewYieldModal;
