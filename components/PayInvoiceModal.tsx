
import React, { useMemo, useState } from 'react';
import { X, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { Account, CreditCard } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import MobileSelect from './mobile/MobileSelect';

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 relative">
        <button 
            onClick={onClose}
            aria-label="Fechar modal"
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
        >
            <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-4 text-rose-600 dark:text-rose-500">
                <CheckCircle2 size={24} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Pagar Fatura</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Cartão: <strong>{selectedCard?.name}</strong>
            </p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 mb-6 border border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-500 uppercase font-bold">Itens Selecionados</span>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{selectedCount} transações</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 uppercase font-bold">Total a Pagar</span>
                <span className="text-xl font-bold text-rose-600 dark:text-rose-500">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>

        <div className="space-y-4">
            <div className="space-y-2">
                <label htmlFor={fieldId('account')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                    <Wallet size={12} /> Debitar da Conta
                </label>
                {isMobile ? (
                    <MobileSelect
                        id={fieldId('account')}
                        name="accountId"
                        value={selectedAccountId}
                        options={accountOptions}
                        onChange={(value) => {
                          setSelectedAccountId(value);
                          setError('');
                        }}
                        disabled={availableAccounts.length === 0}
                        buttonClassName="bg-gray-50 dark:bg-[#121212] border-zinc-200 dark:border-zinc-700 focus:ring-rose-500"
                    />
                ) : (
                    <select 
                        id={fieldId('account')}
                        name="accountId"
                        value={selectedAccountId}
                        onChange={(e) => { setSelectedAccountId(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all appearance-none"
                    >
                        <option value="">Selecione a conta...</option>
                        {availableAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                                {acc.name} (R$ {acc.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div className="space-y-2">
                <label htmlFor={fieldId('payment-date')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  Data do Pagamento
                </label>
                <input 
                    id={fieldId('payment-date')}
                    name="paymentDate"
                    type="date" 
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all [color-scheme:dark]"
                />
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 p-3 rounded-lg">
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            <button 
                onClick={handleConfirm}
                className="w-full h-11 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all active:scale-95"
            >
                Confirmar Pagamento
            </button>
        </div>

      </div>
    </div>
  );
};

export default PayInvoiceModal;
