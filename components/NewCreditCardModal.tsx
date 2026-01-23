
import React, { useMemo, useState, useEffect } from 'react';
import { CreditCard, ChevronDown } from 'lucide-react';
import { CreditCard as CreditCardType } from '../types';
import { getCardColor, getCardGradient } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import MobileSelect from './mobile/MobileSelect';
import {
  PremiumModalShell,
  PremiumModalHeader,
  PremiumModalFooter,
  modalInputClass,
  modalLabelClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
  modalSelectClass
} from './ui/PremiumModal';
import ColorPickerPopover from './ui/ColorPickerPopover';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';

interface NewCreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: CreditCardType) => void;
  initialData?: CreditCardType | null;
  source?: string;
}

const CARD_BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outros'];

const NewCreditCardModal: React.FC<NewCreditCardModalProps> = ({ isOpen, onClose, onSave, initialData, source }) => {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('Visa');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [limit, setLimit] = useState('');
  const [cardColor, setCardColor] = useState('#7c3aed');
  const [isPreviewOpen, setIsPreviewOpen] = useState(!isMobile);
  const isEditing = Boolean(initialData);
  const primaryLabel = getPrimaryActionLabel('Cartão', isEditing);
  const fieldIdPrefix = initialData?.id ? `card-${initialData.id}` : 'card-new';
  const fieldId = (suffix: string) => `${fieldIdPrefix}-${suffix}`;

  useEffect(() => {
    if (isOpen) {
      console.debug('[ui-modal] open', {
        modal: 'credit-card',
        source: source || 'unknown',
        mode: isEditing ? 'edit' : 'create'
      });
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
  }, [isOpen, initialData, isEditing, source]);

  useEffect(() => {
    if (!isOpen) return;
    setIsPreviewOpen(!isMobile);
  }, [isMobile, isOpen]);

  const handleSave = () => {
    if (!name || !closingDay || !dueDay) return;
    const payloadColor = cardColor || getCardColor({ name, brand });
    console.debug('[ui-modal] save', {
      modal: 'credit-card',
      brand,
      closingDay,
      dueDay,
      limitDefined: Boolean(limit),
      color: payloadColor
    });
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
  const brandOptions = useMemo(
    () => CARD_BRANDS.map((cardBrand) => ({ value: cardBrand, label: cardBrand })),
    []
  );

  return (
    <PremiumModalShell isOpen={isOpen} onClose={onClose} zIndexClass="z-[80]" maxWidthClass="max-w-3xl">
      <PremiumModalHeader
        eyebrow="Cartões de Crédito"
        title={initialData ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito'}
        subtitle="Defina os dados principais e escolha a cor para identificar rapidamente."
        icon={<CreditCard size={20} />}
        onClose={onClose}
      />

      <div className="px-8 py-8 space-y-7">
            <div className="space-y-3">
              <label htmlFor={fieldId('name')} className={modalLabelClass}>
                Nome do Cartão / Instituição
              </label>
              <input 
                id={fieldId('name')}
                name="name"
                type="text" 
                placeholder="Nubank Ultravioleta, Sicredi PJ..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={modalInputClass}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label htmlFor={fieldId('brand')} className={modalLabelClass}>
                    Bandeira
                  </label>
                  <div className="relative">
                    {isMobile ? (
                      <MobileSelect
                        id={fieldId('brand')}
                        name="brand"
                        value={brand}
                        options={brandOptions}
                        onChange={setBrand}
                        buttonClassName={`${modalSelectClass} pr-10`}
                      />
                    ) : (
                      <>
                        <select
                          id={fieldId('brand')}
                          name="brand"
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          className={modalSelectClass}
                        >
                          {CARD_BRANDS.map(b => (
                              <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <label htmlFor={fieldId('limit')} className={modalLabelClass}>
                    Limite (opcional)
                  </label>
                  <input 
                    id={fieldId('limit')}
                    name="limit"
                    type="number" 
                    placeholder="R$ 10.000,00"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className={modalInputClass}
                  />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-3">
                <label htmlFor={fieldId('closing-day')} className={modalLabelClass}>
                  Dia de Fechamento
                </label>
                <input 
                  id={fieldId('closing-day')}
                  name="closingDay"
                  type="number" 
                  min="1"
                  max="31"
                  placeholder="28"
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                  className={modalInputClass}
                />
              </div>
              <div className="space-y-3">
                <label htmlFor={fieldId('due-day')} className={modalLabelClass}>
                  Dia de Vencimento
                </label>
                <input 
                  id={fieldId('due-day')}
                  name="dueDay"
                  type="number" 
                  min="1"
                  max="31"
                  placeholder="13"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className={modalInputClass}
                />
              </div>
              <div className="space-y-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 px-5 py-4 text-sm text-indigo-200">
                <p className="font-semibold text-indigo-100">Ciclo do Cartão</p>
                <p className="text-xs text-indigo-100/80">
                  Fechamento define o período da fatura; vencimento é a data limite para pagamento.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <ColorPickerPopover
                label="Cor do cartão"
                value={cardColor}
                onChange={setCardColor}
                presets={PREMIUM_COLOR_PRESETS}
              />
              {isMobile ? (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-[#101014]/70 p-4">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-zinc-700 dark:text-zinc-200"
                  >
                    <span>Prévia</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-md transition hover:bg-indigo-500 hover:border-indigo-300 dark:border-indigo-400/40 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400">
                      <ChevronDown size={16} className={`transition-transform ${isPreviewOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${isPreviewOpen ? 'max-h-40 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    <div
                      className="rounded-2xl p-5 text-white border border-white/10 shadow-sm transition-all duration-200 ease-out"
                      style={{ backgroundImage: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})` }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.4em] text-white/70 mb-2">Prévia</p>
                      <div className="flex items-end justify-between">
                        <div>
                          <h4 className="text-xl font-semibold">{name || 'Seu Cartão'}</h4>
                          <p className="text-xs text-white/70">{brand}</p>
                        </div>
                        <div className="text-right text-xs text-white/70">
                          <p>Fechamento {closingDay || '--'}</p>
                          <p>Vencimento {dueDay || '--'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5 text-white border border-white/10 shadow-sm transition-all duration-200 ease-out"
                  style={{ backgroundImage: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.4em] text-white/70 mb-2">Prévia</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <h4 className="text-xl font-semibold">{name || 'Seu Cartão'}</h4>
                      <p className="text-xs text-white/70">{brand}</p>
                    </div>
                    <div className="text-right text-xs text-white/70">
                      <p>Fechamento {closingDay || '--'}</p>
                      <p>Vencimento {dueDay || '--'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
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

export default NewCreditCardModal;
