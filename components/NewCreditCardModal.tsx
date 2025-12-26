

import React, { useState, useEffect } from 'react';
import { X, CreditCard, ChevronDown } from 'lucide-react';
import { CreditCard as CreditCardType } from '../types';
import { CARD_COLOR_SUGGESTIONS, getCardColor, getCardGradient } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface NewCreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: CreditCardType) => void;
  initialData?: CreditCardType | null;
}

const CARD_BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outros'];

const NewCreditCardModal: React.FC<NewCreditCardModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('Visa');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [limit, setLimit] = useState('');
  const [cardColor, setCardColor] = useState('#7c3aed');
  const isEditing = Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Cartão', isEditing);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setBrand(initialData.brand || 'Visa');
        setClosingDay(initialData.closingDay.toString());
        setDueDay(initialData.dueDay.toString());
        setLimit(initialData.limit ? initialData.limit.toString() : '');
        setCardColor(getCardColor(initialData));
      } else {
        setName('');
        setBrand('Visa');
        setClosingDay('');
        setDueDay('');
        setLimit('');
        setCardColor(getCardColor({ name: 'Visa', brand: 'Visa' } as CreditCardType));
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name || !closingDay || !dueDay) return;
    const payloadColor = cardColor || getCardColor({ name, brand });
    console.info('[form-save]', { entityName: 'Cartão', isEditing, primaryLabel });
    onSave({
      id: initialData?.id || '',
      name,
      brand,
      closingDay: parseInt(closingDay),
      dueDay: parseInt(dueDay),
      limit: parseFloat(limit) || 0,
      cardColor: payloadColor
    });
  };

  const gradient = getCardGradient({ cardColor, name, brand } as CreditCardType);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />

        <div className="relative w-full max-w-3xl transform rounded-[28px] bg-white dark:bg-[#0e0e11] text-left shadow-2xl transition-all sm:my-10 border border-white/10 dark:border-zinc-800/60">
          
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-500/70 mb-2">Cartões de Crédito</p>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <CreditCard className="text-indigo-500" />
                {initialData ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito'}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="px-8 py-8 space-y-7">
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Nome do Cartão / Instituição</label>
              <input 
                type="text" 
                placeholder="Nubank Ultravioleta, Sicredi PJ..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-lg text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Bandeira</label>
                  <div className="relative">
                    <select
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
                    >
                      {CARD_BRANDS.map(b => (
                          <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Limite (Opcional)</label>
                  <input 
                    type="number" 
                    placeholder="R$ 10.000,00"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400"
                  />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Dia de Fechamento</label>
                <input 
                  type="number" 
                  min="1"
                  max="31"
                  placeholder="28"
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                  className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Dia de Vencimento</label>
                <input 
                  type="number" 
                  min="1"
                  max="31"
                  placeholder="13"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 px-5 py-4 text-sm text-indigo-200">
                <p className="font-semibold text-indigo-100">Ciclo do Cartão</p>
                <p>Fechamento determina o período da fatura; vencimento indica a data limite para pagamento.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Paleta de cores</label>
                <input 
                    type="color" 
                    value={cardColor}
                    onChange={(e) => setCardColor(e.target.value)}
                    className="w-12 h-12 rounded-2xl border border-white/20 bg-transparent cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {CARD_COLOR_SUGGESTIONS.map(color => (
                    <button
                        key={color.value}
                        type="button"
                        onClick={() => setCardColor(color.value)}
                        className={`rounded-2xl h-14 px-3 py-2 border transition-all flex flex-col justify-between ${cardColor === color.value ? 'border-white/80 shadow-[0_10px_30px_-12px_rgba(79,70,229,0.8)]' : 'border-white/10 hover:border-white/40'}`}
                        style={{ background: `linear-gradient(135deg, ${color.value}, ${color.value}CC)` }}
                    >
                        <span className="text-[11px] uppercase tracking-wide text-white/80">{color.label}</span>
                        <span className="text-xs text-white/90">{color.value.toUpperCase()}</span>
                    </button>
                ))}
              </div>
            </div>

            <div 
                className="rounded-[28px] p-6 text-white border border-white/10 shadow-2xl space-y-3"
                style={{ backgroundImage: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})` }}
            >
                <p className="text-xs uppercase tracking-[0.4em] text-white/70">Pré-visualização</p>
                <div className="flex items-end justify-between">
                    <div>
                        <h4 className="text-2xl font-semibold">{name || 'Seu Cartão'}</h4>
                        <p className="text-sm text-white/70">{brand}</p>
                    </div>
                    <div className="text-right text-white/70 text-sm">
                        <p>Fechamento {closingDay || '--'}</p>
                        <p>Vencimento {dueDay || '--'}</p>
                    </div>
                </div>
            </div>
          </div>

          <div className="px-8 py-6 border-t border-white/10 flex justify-end gap-4 bg-white/70 dark:bg-black/20 rounded-b-[28px]">
              <button onClick={onClose} className="px-6 py-3 rounded-2xl border border-white/20 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                  Cancelar
              </button>
              <button onClick={handleSave} className="px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all">
                  {primaryLabel}
              </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default NewCreditCardModal;
