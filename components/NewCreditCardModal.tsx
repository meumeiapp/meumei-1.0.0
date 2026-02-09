
import React, { useMemo, useState, useEffect } from 'react';
import { CreditCard, ChevronDown } from 'lucide-react';
import { CreditCard as CreditCardType } from '../types';
import { getCardColor, withAlpha } from '../services/cardColorUtils';
import { getPrimaryActionLabel } from '../utils/formLabels';
import useIsMobile from '../hooks/useIsMobile';
import SelectDropdown from './common/SelectDropdown';
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
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';

interface NewCreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: CreditCardType) => void;
  initialData?: CreditCardType | null;
  source?: string;
  variant?: 'default' | 'dock';
}

const CARD_BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outros'];

const NewCreditCardModal: React.FC<NewCreditCardModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  source,
  variant = 'default'
}) => {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [limit, setLimit] = useState('');
  const [nature, setNature] = useState<'PJ' | 'PF' | ''>('');
  const [cardColor, setCardColor] = useState('#7c3aed');
  const [formError, setFormError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [tagSelected, setTagSelected] = useState(false);
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
        setBrand(initialData.brand || '');
        setClosingDay(initialData.closingDay.toString());
        setDueDay(initialData.dueDay.toString());
        setLimit(initialData.limit ? initialData.limit.toString() : '');
        setCardColor(getCardColor(initialData));
        setNature(initialData.nature || '');
        setFormError('');
        setShowErrors(false);
        setTagSelected(Boolean(initialData.cardColor || initialData.color));
      } else {
        setName('');
        setBrand('');
        setClosingDay('');
        setDueDay('');
        setLimit('');
        setCardColor(getCardColor({ name: 'Visa', brand: 'Visa' } as CreditCardType));
        setNature('');
        setFormError('');
        setShowErrors(false);
        setTagSelected(false);
      }
    }
  }, [isOpen, initialData, isEditing, source]);

  const hasName = Boolean(name.trim());
  const hasBrand = Boolean(brand);
  const hasLimit = Boolean(limit);
  const hasClosing = Boolean(closingDay);
  const hasDue = Boolean(dueDay);
  const hasNature = Boolean(nature);
  const hasTag = Boolean(tagSelected);
  const canSave = hasName && hasBrand && hasLimit && hasClosing && hasDue && hasNature && hasTag;

  const handleSave = () => {
    if (!canSave) {
      setShowErrors(true);
      setFormError('Preencha os campos obrigatórios para salvar.');
      return;
    }
    const payloadColor = cardColor || getCardColor({ name, brand });
    console.debug('[ui-modal] save', {
      modal: 'credit-card',
      brand,
      closingDay,
      dueDay,
      limitDefined: Boolean(limit),
      color: payloadColor,
      nature
    });
    onSave({
      id: initialData?.id || '',
      name,
      brand,
      closingDay: parseInt(closingDay),
      dueDay: parseInt(dueDay),
      limit: parseFloat(limit) || 0,
      cardColor: payloadColor,
      nature
    });
  };

  const brandOptions = useMemo(
    () => CARD_BRANDS.map((cardBrand) => ({ value: cardBrand, label: cardBrand })),
    []
  );

  const modalBody = (
      <div className="px-4 sm:px-8 py-4 sm:py-8 space-y-4 sm:space-y-7">
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
                className={`w-full rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                  showErrors && !hasName ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                }`}
                style={{ ['--tw-ring-color' as any]: withAlpha(cardColor, 0.4) }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
                <div className="space-y-3">
                  <label htmlFor={fieldId('brand')} className={modalLabelClass}>
                    Bandeira
                  </label>
                  <SelectDropdown
                    value={brand}
                    onChange={setBrand}
                    options={CARD_BRANDS.map(b => ({ value: b, label: b }))}
                    placeholder="Selecione"
                    buttonClassName={`rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                      showErrors && !hasBrand ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                    listClassName="max-h-56"
                    placeholderClassName="text-[12px] font-light"
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor={fieldId('limit')} className={modalLabelClass}>
                    Limite
                  </label>
                  <input 
                    id={fieldId('limit')}
                    name="limit"
                    type="number" 
                    placeholder="Ex: R$0,00"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className={`w-full rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                      showErrors && !hasLimit ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                    style={{ ['--tw-ring-color' as any]: withAlpha(cardColor, 0.4) }}
                  />
                </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-xs text-zinc-900 dark:text-indigo-100">
                <p className="font-semibold text-zinc-900 dark:text-indigo-100">Ciclo do Cartão</p>
                <p className="text-[11px] text-zinc-800 dark:text-indigo-100/80">
                  Fechamento define o período da fatura; vencimento é a data limite para pagamento.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
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
                    placeholder="Selecione o dia"
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    className={`w-full rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                      showErrors && !hasClosing ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                    style={{ ['--tw-ring-color' as any]: withAlpha(cardColor, 0.4) }}
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
                    placeholder="Selecione o dia"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className={`w-full rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                      showErrors && !hasDue ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                    style={{ ['--tw-ring-color' as any]: withAlpha(cardColor, 0.4) }}
                  />
                </div>
                <div className="space-y-3">
                  <label className={modalLabelClass}>Natureza</label>
                  <SelectDropdown
                    value={nature}
                    onChange={(value) => {
                      setNature(value as 'PJ' | 'PF');
                      setFormError('');
                    }}
                    options={[
                      { value: 'PJ', label: 'PJ' },
                      { value: 'PF', label: 'PF' }
                    ]}
                    placeholder="Selecione"
                    buttonClassName={`rounded-lg border bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 ${
                      showErrors && !hasNature ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                    listClassName="max-h-40"
                    placeholderClassName="text-[12px] font-light"
                  />
                  {formError && !nature && (
                    <p className="text-[11px] text-red-400">{formError}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className={modalLabelClass}>Cor da tag</label>
              <div
                className={`flex items-center gap-1 flex-nowrap rounded-lg px-1 py-1 ${
                  showErrors && !hasTag ? 'ring-2 ring-red-500' : ''
                }`}
              >
                {PREMIUM_COLOR_PRESETS.slice(0, 18).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setCardColor(color);
                      setTagSelected(true);
                    }}
                    className={`h-5 w-5 rounded-full border ${cardColor === color ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'border-white/20'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Selecionar cor ${color}`}
                  />
                ))}
              </div>
              {showErrors && !hasTag && (
                <p className="text-[11px] text-red-400">Selecione uma cor da tag.</p>
              )}
            </div>
          </div>
  );

  const modalFooter = (
      <PremiumModalFooter>
        <div className="grid grid-cols-2 gap-3 w-full">
          <button onClick={onClose} className={`${modalSecondaryButtonClass} hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600`}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className={`${modalPrimaryButtonClass} shadow-none ${!canSave ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={!canSave}
            style={{ background: 'var(--mm-view-accent)' as any }}
          >
            {primaryLabel === 'Salvar alterações' ? 'Salvar' : primaryLabel}
          </button>
        </div>
      </PremiumModalFooter>
  );

  if (variant === 'dock') {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-[1300]">
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
          aria-label="Fechar cartão"
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
              <p className="text-sm font-semibold truncate">{initialData ? 'Editar cartão de crédito' : 'Novo cartão de crédito'}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Defina os dados principais e a cor para identificação rápida.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
              aria-label="Fechar cartão"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="pt-3 flex-1 overflow-auto">{modalBody}</div>
          {modalFooter}
        </div>
      </div>
    );
  }

  return (
    <PremiumModalShell isOpen={isOpen} onClose={onClose} zIndexClass="z-[80]" maxWidthClass="max-w-3xl">
      <PremiumModalHeader
        eyebrow="Cartões de Crédito"
        title={initialData ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito'}
        subtitle="Defina os dados principais e escolha a cor para identificar rapidamente."
        icon={<CreditCard size={20} />}
        onClose={onClose}
      />

      {modalBody}

      {modalFooter}
    </PremiumModalShell>
  );
};

export default NewCreditCardModal;
