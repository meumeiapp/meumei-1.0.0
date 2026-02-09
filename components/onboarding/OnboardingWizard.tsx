import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, CreditCard, Info, Plus, Wallet } from 'lucide-react';
import { Account, CompanyInfo, CreditCard as CreditCardType } from '../../types';
import NewAccountModal from '../NewAccountModal';
import NewCreditCardModal from '../NewCreditCardModal';
import type { OnboardingSettings } from '../../services/onboardingService';
import useIsMobile from '../../hooks/useIsMobile';
import SelectDropdown from '../common/SelectDropdown';

interface OnboardingWizardProps {
  companyInfo: CompanyInfo;
  accounts: Account[];
  creditCards: CreditCardType[];
  accountTypes: string[];
  initialTotalBalance?: number | null;
  onUpdateCompany: (info: CompanyInfo) => Promise<void> | void;
  onUpdateAccounts: (accounts: Account[]) => Promise<void> | void;
  onUpdateAccountTypes: (types: string[]) => void;
  onUpdateCreditCards: (cards: CreditCardType[]) => void;
  onPersistOnboarding: (patch: OnboardingSettings) => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  isBusy?: boolean;
}

const TOTAL_STEPS = 2;
const DEFAULT_NATURE: Account['nature'] = 'PJ';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const roundToCents = (value: number) => Math.round(value * 100) / 100;

const resolveTodayISO = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseCurrency = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized = trimmed.replace(/[R$\s]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatBalanceInput = (value: number | undefined) => {
  if (!Number.isFinite(value)) return '';
  return Number(value).toFixed(2).replace('.', ',');
};

const buildAccountId = () => Math.random().toString(36).slice(2, 10);

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  companyInfo,
  accounts,
  creditCards,
  accountTypes,
  initialTotalBalance,
  onUpdateCompany,
  onUpdateAccounts,
  onUpdateAccountTypes,
  onUpdateCreditCards,
  onPersistOnboarding,
  onComplete,
  isBusy
}) => {
  const [step, setStep] = useState(1);
  const todayISO = useMemo(() => resolveTodayISO(), []);
  const [companyName, setCompanyName] = useState(companyInfo.name || '');
  const [companyCnpj, setCompanyCnpj] = useState(companyInfo.cnpj || '');
  const [companyAddress, setCompanyAddress] = useState(companyInfo.address || '');
  const [companyZip, setCompanyZip] = useState(companyInfo.zipCode || '');
  const [companyPhone, setCompanyPhone] = useState(companyInfo.phone || '');
  const [companyEmail, setCompanyEmail] = useState(companyInfo.email || '');
  const [companyWebsite, setCompanyWebsite] = useState(companyInfo.website || '');
  const [startDate, setStartDate] = useState(todayISO);
  const [totalBalanceInput, setTotalBalanceInput] = useState(
    initialTotalBalance !== null && initialTotalBalance !== undefined
      ? formatBalanceInput(initialTotalBalance)
      : ''
  );
  const [totalBalance, setTotalBalance] = useState<number>(initialTotalBalance || 0);
  const [draftAccounts, setDraftAccounts] = useState<Account[]>([]);
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});
  const [usesCreditCard, setUsesCreditCard] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const touchedAccountsRef = useRef(false);
  const isMobile = useIsMobile();
  const natureOptions = useMemo(
    () => [
      { value: 'PJ', label: 'PJ' },
      { value: 'PF', label: 'PF' }
    ],
    []
  );

  useEffect(() => {
    console.info('[onboarding] step', { step });
  }, [step]);

  useEffect(() => {
    if (touchedAccountsRef.current) return;
    const seeded = accounts.map(acc => ({
      ...acc,
      nature: acc.nature || DEFAULT_NATURE
    }));
    setDraftAccounts(seeded);
  }, [accounts]);

  useEffect(() => {
    setBalanceDrafts(prev => {
      const next = { ...prev };
      draftAccounts.forEach(account => {
        if (next[account.id] === undefined) {
          next[account.id] = formatBalanceInput(account.initialBalance);
        }
      });
      return next;
    });
  }, [draftAccounts]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const progressPercent = Math.min(100, Math.max(0, (step / TOTAL_STEPS) * 100));

  const distributedTotal = useMemo(() => {
    return roundToCents(
      draftAccounts.reduce((acc, item) => acc + (Number(item.initialBalance) || 0), 0)
    );
  }, [draftAccounts]);

  const currentTotalForDistribution = useMemo(() => {
    const parsed = parseCurrency(totalBalanceInput);
    if (parsed !== null) {
      return roundToCents(parsed);
    }
    return totalBalance;
  }, [totalBalanceInput, totalBalance]);

  const remainingTotal = useMemo(() => {
    return roundToCents(currentTotalForDistribution - distributedTotal);
  }, [currentTotalForDistribution, distributedTotal]);

  const canProceedStep1 =
    Boolean(companyName.trim()) &&
    Boolean(startDate) &&
    Boolean(companyCnpj.trim()) &&
    Boolean(companyAddress.trim()) &&
    Boolean(companyPhone.trim()) &&
    Boolean(companyEmail.trim());
  const canProceedStep2 =
    parseCurrency(totalBalanceInput) !== null &&
    Math.abs(remainingTotal) <= 0.01 &&
    (usesCreditCard === 'no' || (usesCreditCard === 'yes' && creditCards.length > 0));

  const handleNext = async () => {
    setError(null);
    if (step === 1) {
      if (!canProceedStep1) {
        setError('Preencha os dados da empresa para continuar.');
        console.info('[onboarding] validation', { step, valid: false, reason: 'company_fields' });
        return;
      }
      if (startDate !== todayISO) {
        setError('O controle financeiro começa a partir de hoje. Lançamentos retroativos não são permitidos.');
        console.info('[onboarding] validation', { step, valid: false, reason: 'start_date' });
        setStartDate(todayISO);
        return;
      }
      const nextCompany: CompanyInfo = {
        ...companyInfo,
        name: companyName.trim(),
        startDate,
        cnpj: companyCnpj.trim(),
        address: companyAddress.trim(),
        zipCode: companyZip.trim(),
        phone: companyPhone.trim(),
        email: companyEmail.trim(),
        website: companyWebsite.trim()
      };
      console.info('[onboarding] company_save', { name: nextCompany.name, startDate: nextCompany.startDate });
      await onUpdateCompany(nextCompany);
      setStep(2);
      return;
    }
    if (step === 2) {
      const parsed = parseCurrency(totalBalanceInput);
      if (parsed === null || parsed < 0) {
        setError('Informe o saldo total da empresa.');
        console.info('[onboarding] validation', { step, valid: false, reason: 'total_balance' });
        return;
      }
      const rounded = roundToCents(parsed);
      const remaining = roundToCents(rounded - distributedTotal);
      if (Math.abs(remaining) > 0.01) {
        setError('Ajuste os saldos para distribuir todo o valor informado.');
        console.info('[onboarding] validation', { step, valid: false, remaining });
        return;
      }
      setTotalBalance(rounded);
      console.info('[onboarding] total_balance', { total: rounded });
      await onPersistOnboarding({ initialTotalBalance: rounded });
      const normalized = draftAccounts.map(account => {
        const initialBalance = roundToCents(Number(account.initialBalance) || 0);
        return {
          ...account,
          initialBalance,
          currentBalance: roundToCents(Number(account.currentBalance) || initialBalance),
          nature: account.nature || DEFAULT_NATURE
        };
      });
      console.info('[onboarding] totals', {
        total: rounded,
        distributed: distributedTotal,
        remaining
      });
      await onUpdateAccounts(normalized);
      if (usesCreditCard === 'yes' && creditCards.length === 0) {
        setError('Cadastre pelo menos um cartão ou selecione "Não uso".');
        console.info('[onboarding] validation', { step, valid: false, reason: 'cards_required' });
        return;
      }
      console.info('[onboarding] complete');
      await onComplete();
    }
  };

  const handleBack = () => {
    if (step === 1) return;
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleAccountBalanceChange = (accountId: string, rawValue: string) => {
    touchedAccountsRef.current = true;
    setBalanceDrafts(prev => ({ ...prev, [accountId]: rawValue }));
    const parsed = parseCurrency(rawValue);
    const nextValue = roundToCents(parsed ?? 0);
    setDraftAccounts(prev =>
      prev.map(acc =>
        acc.id === accountId
          ? { ...acc, initialBalance: nextValue, currentBalance: nextValue }
          : acc
      )
    );
  };

  const handleAccountNatureChange = (accountId: string, nature: 'PJ' | 'PF') => {
    touchedAccountsRef.current = true;
    setDraftAccounts(prev =>
      prev.map(acc => (acc.id === accountId ? { ...acc, nature } : acc))
    );
  };

  const handleAccountSave = (payload: any) => {
    touchedAccountsRef.current = true;
    const parsedInitial = roundToCents(parseCurrency(String(payload.balance ?? '')) || 0);
    const parsedCurrent = roundToCents(
      Number.isFinite(payload.currentBalance) ? Number(payload.currentBalance) : parsedInitial
    );
    setDraftAccounts(prev => {
      const existingIndex = prev.findIndex(acc => acc.id === payload.id);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const updated: Account = {
          ...existing,
          name: payload.name,
          type: payload.type,
          color: payload.color,
          notes: payload.notes,
          yieldRate: payload.yieldRate,
          yieldIndex: payload.yieldIndex,
          nature: payload.nature || existing.nature || DEFAULT_NATURE,
          initialBalance: parsedInitial || existing.initialBalance,
          currentBalance: parsedCurrent || existing.currentBalance
        };
        const next = [...prev];
        next[existingIndex] = updated;
        setBalanceDrafts(drafts => ({
          ...drafts,
          [updated.id]: formatBalanceInput(updated.initialBalance)
        }));
        return next;
      }
      const newAccount: Account = {
        id: payload.id || buildAccountId(),
        name: payload.name,
        type: payload.type,
        color: payload.color,
        notes: payload.notes,
        yieldRate: payload.yieldRate,
        yieldIndex: payload.yieldIndex,
        initialBalance: parsedInitial,
        currentBalance: parsedCurrent,
        nature: payload.nature || DEFAULT_NATURE
      };
      setBalanceDrafts(drafts => ({
        ...drafts,
        [newAccount.id]: formatBalanceInput(newAccount.initialBalance)
      }));
      return [...prev, newAccount];
    });
    setIsAccountModalOpen(false);
    setEditingAccount(null);
  };

  const handleCardSave = (payload: CreditCardType) => {
    const next = payload.id
      ? creditCards.map(card => (card.id === payload.id ? payload : card))
      : [...creditCards, { ...payload, id: buildAccountId() }];
    onUpdateCreditCards(next);
    setIsCardModalOpen(false);
  };

  const stepTitle = () => {
    switch (step) {
      case 1:
        return 'Gestão da empresa';
      case 2:
        return 'Saldo, contas e cartões';
      default:
        return '';
    }
  };

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="space-y-4 sm:space-y-6">
          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 p-4 flex gap-3 text-sm text-indigo-700 dark:text-indigo-200">
            <Info size={18} className="mt-0.5" />
            <p>
              Isso define o início do controle e organiza seus relatórios. Você pode atualizar outros dados depois.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Building2 size={12} /> Nome da empresa (fantasia)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Studio MEI, Doces da Maria"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Wallet size={12} /> Data de início
              </label>
              <input
                type="date"
                value={startDate}
                min={todayISO}
                max={todayISO}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (nextValue !== todayISO) {
                    setStartDate(todayISO);
                    setError('O controle financeiro começa a partir de hoje. Lançamentos retroativos não são permitidos.');
                    return;
                  }
                  setStartDate(nextValue);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Tab') return;
                  event.preventDefault();
                  setStartDate(todayISO);
                  setError('O controle financeiro começa a partir de hoje. Lançamentos retroativos não são permitidos.');
                }}
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-[#16161b] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark] cursor-not-allowed"
                readOnly
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                O controle financeiro começa a partir de hoje. Lançamentos retroativos não são permitidos.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-100 dark:border-sky-500/30 bg-sky-50/70 dark:bg-sky-500/10 p-4 flex gap-3 text-sm text-sky-700 dark:text-sky-200">
            <Info size={18} className="mt-0.5" />
            <p>Esses dados saem da gestão da empresa e ajudam a emitir a DAS no futuro.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                CNPJ
              </label>
              <input
                type="text"
                value={companyCnpj}
                onChange={(e) => setCompanyCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                E-mail
              </label>
              <input
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="contato@empresa.com"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Telefone
              </label>
              <input
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Site (opcional)
              </label>
              <input
                type="text"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="www.suaempresa.com.br"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Endereço
              </label>
              <input
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                CEP (opcional)
              </label>
              <input
                type="text"
                value={companyZip}
                onChange={(e) => setCompanyZip(e.target.value)}
                placeholder="00000-000"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-4 sm:space-y-6">
          <div className="rounded-2xl border border-emerald-100 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-4 flex gap-3 text-sm text-emerald-700 dark:text-emerald-200">
            <Info size={18} className="mt-0.5" />
            <p>
              Informe o saldo total, distribua nas contas e indique se usa cartões.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Saldo total da empresa agora
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={totalBalanceInput}
                onChange={(e) => setTotalBalanceInput(e.target.value)}
                      placeholder="R$ 0,00"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] pl-12 pr-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-blue-100 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-500/10 p-4 flex gap-3 text-sm text-blue-700 dark:text-blue-200">
            <Info size={18} className="mt-0.5" />
            <p>
              Cadastre suas contas PJ e PF e distribua o saldo total. O valor precisa fechar para continuar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Saldo total informado</p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-white">{formatCurrency(totalBalance)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Distribuído</p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-white">{formatCurrency(distributedTotal)}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${Math.abs(remainingTotal) <= 0.01 ? 'border-emerald-300 bg-emerald-50/70 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10' : 'border-amber-200 bg-amber-50/60 text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10'}`}>
              <p className="text-[11px] uppercase tracking-wide">Falta distribuir</p>
              <p className="text-lg font-semibold">{formatCurrency(remainingTotal)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Suas contas</h3>
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null);
                setIsAccountModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition"
            >
              <Plus size={14} /> Adicionar conta
            </button>
          </div>

          {draftAccounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-[#101014] p-6 text-center text-sm text-zinc-500">
              Nenhuma conta cadastrada. Adicione pelo menos uma conta para distribuir o saldo.
            </div>
          ) : (
            <div className="space-y-3">
              {draftAccounts.map(account => (
                <div key={account.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-center">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">{account.name}</p>
                    <p className="text-xs text-zinc-500">{account.type}</p>
                  </div>
                  <div className="flex flex-col gap-2 md:items-center text-center">
                    <label className="text-[10px] uppercase tracking-wide text-zinc-400">Natureza</label>
                    <SelectDropdown
                      value={account.nature || ''}
                      onChange={(value) => handleAccountNatureChange(account.id, value as 'PJ' | 'PF')}
                      options={[
                        { value: 'PJ', label: 'PJ' },
                        { value: 'PF', label: 'PF' }
                      ]}
                      placeholder="Selecione"
                      buttonClassName="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#121216] px-3 py-2 text-xs text-zinc-700 dark:text-zinc-100 text-center focus:ring-indigo-500"
                      listClassName="max-h-40"
                    />
                  </div>
                  <div className="flex flex-col gap-2 md:items-center text-center">
                    <label className="text-[10px] uppercase tracking-wide text-zinc-400">Saldo inicial</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={balanceDrafts[account.id] ?? ''}
                      onChange={(e) => handleAccountBalanceChange(account.id, e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-32 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#121216] px-3 py-2 text-sm text-zinc-700 dark:text-zinc-100 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAccount(account);
                        setIsAccountModalOpen(true);
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200 underline underline-offset-4"
                    >
                      Editar detalhes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-purple-100 dark:border-purple-500/30 bg-purple-50/70 dark:bg-purple-500/10 p-4 flex gap-3 text-sm text-purple-700 dark:text-purple-200">
            <Info size={18} className="mt-0.5" />
            <p>
              Cartões ajudam a acompanhar despesas e faturas do MEI. Se você não usa, pode seguir sem cadastrar.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <button
              type="button"
              onClick={() => setUsesCreditCard('yes')}
              className={`flex-1 rounded-2xl border px-4 py-4 text-sm font-semibold transition ${usesCreditCard === 'yes' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:border-indigo-300'}`}
            >
              Sim, uso
            </button>
            <button
              type="button"
              onClick={() => setUsesCreditCard('no')}
              className={`flex-1 rounded-2xl border px-4 py-4 text-sm font-semibold transition ${usesCreditCard === 'no' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:border-emerald-300'}`}
            >
              Não uso
            </button>
          </div>

          {usesCreditCard === 'yes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Cartões cadastrados</h3>
                <button
                  type="button"
                  onClick={() => setIsCardModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition"
                >
                  <Plus size={14} /> Adicionar cartão
                </button>
              </div>
              {creditCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-[#101014] p-6 text-center text-sm text-zinc-500">
                  Nenhum cartão cadastrado. Adicione ao menos um para continuar.
                </div>
              ) : (
                <div className="space-y-3">
                  {creditCards.map(card => (
                    <div key={card.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#101014] p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-white">{card.name}</p>
                        <p className="text-xs text-zinc-500">{card.brand} • Fecha {card.closingDay} • Vence {card.dueDay}</p>
                      </div>
                      <CreditCard className="text-indigo-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canProceedStep2 && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10 p-4 flex gap-3 text-sm text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 size={18} className="mt-0.5" />
              <p>Base pronta! Você pode começar a usar o painel.</p>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center px-3 sm:px-4 py-4 sm:py-10 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white dark:bg-[#0f0f13] rounded-[28px] border border-white/10 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[calc(var(--app-height,100vh)-32px)]">
        <div className="px-4 sm:px-10 py-4 sm:py-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-500/80">Primeiros passos</p>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">{stepTitle()}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Passo {step} de {TOTAL_STEPS}</p>
            </div>
            <div className="w-full sm:w-64">
              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-10 py-5 sm:py-8 space-y-4 sm:space-y-6 overflow-y-auto">
          {renderStepContent()}
          {error && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-10 py-4 sm:py-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${step === 1 ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-white dark:bg-[#1a1a1d] text-zinc-600 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:border-indigo-400'}`}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2) || isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {step === 2 ? 'Ir para o painel' : 'Continuar'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <NewAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          setEditingAccount(null);
        }}
        onSave={handleAccountSave}
        initialData={editingAccount}
        mode={editingAccount ? 'edit' : 'create'}
        accountTypes={accountTypes}
        onUpdateAccountTypes={onUpdateAccountTypes}
        defaultNature={editingAccount?.nature || 'PJ'}
        source="onboarding"
      />

      <NewCreditCardModal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        onSave={handleCardSave}
        source="onboarding"
      />
    </div>
  );
};

export default OnboardingWizard;
