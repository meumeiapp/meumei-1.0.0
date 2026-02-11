
import React, { useMemo, useState } from 'react';
import { X, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { Account, CreditCard } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import SelectDropdown from './common/SelectDropdown';
import WheelDatePicker from './common/WheelDatePicker';
import { modalInputClass, modalLabelClass } from './ui/PremiumModal';

interface PayInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  selectedCount: number;
  accounts: Account[];
  selectedCard: CreditCard | null;
  onConfirmPayment: (accountId: string, paymentDate: string) => void;
}

const PayInvoiceModal: React.FC<PayInvoiceModalProps> = ({
  isOpen,
  onClose,
  totalAmount,
  selectedCount,
  accounts,
  selectedCard,
  onConfirmPayment
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const isMobile = useIsMobile();
  const availableAccounts = accounts.filter(acc => !acc.locked);
  const fieldIdPrefix = selectedCard?.id ? `invoice-pay-${selectedCard.id}` : 'invoice-pay';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;
  const accountOptions = useMemo(
    () => [
      { value: '', label: 'Selecione a conta...', disabled: true },
      ...availableAccounts.map((acc) => ({
        value: acc.id,
        label: acc.name,
        description: `R$ ${acc.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      }))
    ],
    [availableAccounts]
  );

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedAccountId) {
      setError('Selecione uma conta para debitar o pagamento.');
      return;
    }
    if (!paymentDate) {
        setError('Informe a data do pagamento.');
        return;
    }
    onConfirmPayment(selectedAccountId, paymentDate);
  };

  const selectedAccount = availableAccounts.find(a => a.id === selectedAccountId);
  const labelClass = isMobile ? 'text-[10px] uppercase tracking-wide font-bold text-white' : modalLabelClass;
  const inputBaseClass = `${modalInputClass} focus:ring-rose-500 ${isMobile ? 'pr-8 placeholder:uppercase placeholder:font-light placeholder:text-[10px]' : ''}`;
  const selectBaseClass = `${modalInputClass} focus:ring-rose-500 text-left`;

  const formFields = (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={fieldId('account')} className={`${labelClass} flex items-center gap-1`}>
          <Wallet size={12} /> Debitar da Conta
        </label>
        <SelectDropdown
          value={selectedAccountId}
          onChange={(value) => {
            setSelectedAccountId(value);
            setError('');
          }}
          options={accountOptions.filter(option => !option.disabled).map(option => ({
            value: option.value,
            label: option.label
          }))}
          placeholder={availableAccounts.length === 0 ? 'NENHUMA CONTA DISPONÍVEL' : 'SELECIONE'}
          disabled={availableAccounts.length === 0}
          buttonClassName={selectBaseClass}
          listClassName="max-h-56"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={fieldId('payment-date')} className={labelClass}>
          Data do Pagamento
        </label>
        <WheelDatePicker
          value={paymentDate}
          onChange={(value) => {
            setPaymentDate(value);
            setError('');
          }}
          buttonClassName={inputBaseClass}
          ariaLabel="Selecionar data do pagamento"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 p-3 rounded-lg">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
    return (
      <div className="fixed inset-0 z-[1200]">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-0 right-0 top-0 bg-black/70"
          style={{ bottom: dockOffset }}
          aria-label="Fechar pagamento de fatura"
        />
        <div
          className="absolute left-0 right-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
          style={{ top: 0, bottom: dockOffset }}
        >
          <div className="px-3 pt-2 pb-2 bg-[#0b0b10] border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-white" />
                  <p className="text-[13px] font-semibold text-white truncate">Pagar Fatura</p>
                </div>
                <p className="text-[9px] text-white/70">Cartão: {selectedCard?.name}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-none bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                aria-label="Fechar pagamento de fatura"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden px-3 pt-1 pb-16">
            <div className="bg-white/5 border border-white/10 rounded-none px-3 py-2 mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase font-bold text-white/60">Itens Selecionados</span>
                <span className="text-xs font-semibold text-white">{selectedCount} transações</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-white/10">
                <span className="text-[10px] uppercase font-bold text-white/60">Total a Pagar</span>
                <span className="text-base font-bold text-rose-400">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            {formFields}
          </div>
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-none border border-rose-400/50 bg-rose-950/30 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-900/40 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-none border border-rose-500/40 py-3 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 relative">
        <button 
            onClick={onClose}
            aria-label="Fechar modal"
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
        >
            <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mb-4">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-4 text-rose-600 dark:text-rose-500">
                <CheckCircle2 size={24} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-1">Pagar Fatura</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Cartão: <strong>{selectedCard?.name}</strong>
            </p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-3 sm:p-4 mb-4 border border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-500 uppercase font-bold">Itens Selecionados</span>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{selectedCount} transações</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 uppercase font-bold">Total a Pagar</span>
                <span className="text-xl font-bold text-rose-600 dark:text-rose-500">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>

        {formFields}

        <button 
            onClick={handleConfirm}
            className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl text-sm sm:text-base font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all active:scale-95 mt-4"
        >
            Confirmar Pagamento
        </button>
      </div>
    </div>
  );
};

export default PayInvoiceModal;
