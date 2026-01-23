
import React, { useMemo, useState, useEffect } from 'react';
import { X, Calendar, TrendingUp } from 'lucide-react';
import { Account } from '../types';
import { useAuth } from '../contexts/AuthContext';
import useIsMobile from '../hooks/useIsMobile';
import MobileModalShell from './mobile/MobileModalShell';
import MobileSelect from './mobile/MobileSelect';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface NewYieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { accountId: string, amount: number, date: string, notes: string }) => Promise<void> | void;
  accounts: Account[];
  licenseId?: string | null;
  initialData?: { accountId: string; amount: number; date: string; notes: string } | null;
}

const NewYieldModal: React.FC<NewYieldModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  accounts,
  licenseId,
  initialData = null
}) => {
  const isMobile = useIsMobile();
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
            setAccountId(investmentAccounts.length > 0 ? investmentAccounts[0].id : '');
            setAmount('');
            
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            const today = now.toISOString().split('T')[0];

            setDate(today);
            setNotes('');
        }
    }
  }, [isOpen, accounts, initialData]);

  if (!isOpen) return null;

  const isEditing = Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Rendimento', isEditing);
  const fieldIdPrefix = initialData?.date ? `yield-${initialData.date}` : 'yield-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;

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

  const formFields = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor={fieldId('date')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Data do Rendimento
          </label>
          <div className="relative">
            <input
              id={fieldId('date')}
              name="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isEditing}
              className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all [color-scheme:dark]"
            />
            <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={20} />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={fieldId('account')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Conta
          </label>
          {isMobile ? (
            <MobileSelect
              id={fieldId('account')}
              name="accountId"
              value={accountId}
              options={accountOptions}
              onChange={setAccountId}
              disabled={isEditing}
              buttonClassName={`bg-gray-50 dark:bg-[#121212] border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          ) : (
            <select
              id={fieldId('account')}
              name="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={isEditing}
              className={`w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {investmentAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={fieldId('amount')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
          Valor Rendido (R$)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-3 text-emerald-500 font-bold">R$</span>
          <input
            id={fieldId('amount')}
            name="amount"
            type="number"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-lg"
          />
        </div>
        {selectedAccount && !selectedAccount.locked && (
          <p className="text-[10px] text-zinc-400 text-right">
            Saldo Atual: R$ {selectedAccount.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

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
          className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400 resize-none"
        />
      </div>
    </>
  );

  const footerActions = (
    <div className={`border-t border-zinc-100 dark:border-zinc-800 pt-4 flex ${isMobile ? 'flex-col' : 'justify-end'} gap-3`}>
      <button
        type="button"
        onClick={onClose}
        className="h-11 px-6 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleSave}
        className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
      >
        {primaryLabel}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Editar Rendimento' : 'Novo Rendimento'}
        subtitle="Preencha os dados para registrar o rendimento."
        modalName="yield_form"
      >
        <div className="space-y-6">
          {formFields}
          {footerActions}
        </div>
      </MobileModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />

        <div className="relative w-full max-w-lg transform rounded-2xl bg-white dark:bg-[#1a1a1a] text-left shadow-xl transition-all sm:my-8 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
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

          <div className="p-6 space-y-6">
            {formFields}
          </div>

          <div className="p-6 bg-white dark:bg-[#1a1a1a] rounded-b-2xl">
            {footerActions}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewYieldModal;
