
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  X,
  ArrowLeft, 
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp, 
  Calendar,
  PlayCircle,
  ShieldCheck,
  LineChart,
  Sparkles,
  Target,
  Compass,
  Award
} from 'lucide-react';
import { Account } from '../types';
import { yieldsService, YieldRecord } from '../services/yieldsService';
import { AuditLogInput } from '../services/auditService';
import NewYieldModal from './NewYieldModal';
import CompoundInterestCalculatorModal, { CompoundCalculatorDefaults, CompoundCalculatorResult } from './CompoundInterestCalculatorModal';
import useIsMobile from '../hooks/useIsMobile';
import YieldsMobileV2 from './YieldsMobileV2';
import MobileModalShell from './mobile/MobileModalShell';
import { db } from '../services/firebase';
import { logPermissionDenied } from '../utils/firestoreLogger';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';

const MILLION_TARGET_DEFAULT = 1_000_000;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(value))}`;

const getProgressMessage = (percent: number) => {
  if (percent >= 50) return 'Você está mais perto do milhão do que da largada. Proteja e acelere.';
  if (percent >= 5) return 'Seu dinheiro já está trabalhando por você. Continue alimentando a máquina.';
  return 'Toda grande jornada começa assim mesmo. Consistência transforma centavos em liberdade.';
};

const formatTimeline = (months: number) => {
  if (months < 12) {
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${rest} ${rest === 1 ? 'mês' : 'meses'}`;
};

const parseHistoryDate = (value: string) => new Date(`${value}T12:00:00`);

const getAccountValueAtDate = (account: Account, targetDate: Date) => {
  if (!account.balanceHistory || account.balanceHistory.length === 0) {
    return account.currentBalance;
  }
  const sortedHistory = [...account.balanceHistory].sort((a, b) => parseHistoryDate(a.date).getTime() - parseHistoryDate(b.date).getTime());
  const lastPoint = sortedHistory[sortedHistory.length - 1];
  const lastDate = parseHistoryDate(lastPoint.date);
  if (targetDate.getTime() >= lastDate.getTime()) {
    return account.currentBalance ?? lastPoint.value;
  }
  for (let i = sortedHistory.length - 1; i >= 0; i -= 1) {
    const pointDate = parseHistoryDate(sortedHistory[i].date);
    if (pointDate.getTime() <= targetDate.getTime()) {
      return sortedHistory[i].value;
    }
  }
  return sortedHistory[0].value;
};

const getStrokeColor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('nati')) return '#ec4899';
  if (n.includes('ale')) return '#8b5cf6';
  if (n.includes('dk')) return '#06b6d4';
  if (n.includes('cora')) return '#0ea5e9';
  if (n.includes('nubank')) return '#a855f7';
  return '#71717a';
};

interface YieldsViewProps {
  onBack: () => void;
  accounts: Account[];
  onUpdateAccounts: (accounts: Account[]) => void;
  viewDate: Date;
  licenseId?: string | null;
  licenseCryptoEpoch?: number | null;
  onAuditLog?: (entry: AuditLogInput) => void;
  onOpenAudit?: () => void;
}

const YieldsView: React.FC<YieldsViewProps> = ({ 
  onBack, 
  accounts,
  onUpdateAccounts,
  viewDate,
  licenseId,
  licenseCryptoEpoch,
  onAuditLog,
  onOpenAudit
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingYield, setEditingYield] = useState<{ accountId: string; amount: number; date: string; notes: string } | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const goalInputIdMobile = 'yield-goal-input-mobile';
  const goalInputIdDesktop = 'yield-goal-input-desktop';
  const [targetGoal, setTargetGoal] = useState(MILLION_TARGET_DEFAULT);
  const [goalSavedAt, setGoalSavedAt] = useState<string | null>(null);
  const [firestoreYields, setFirestoreYields] = useState<YieldRecord[]>([]);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [lineTooltip, setLineTooltip] = useState<{
      x: number;
      y: number;
      day: number;
      accountName: string;
      value: number;
      color: string;
  } | null>(null);
  const recoveryLoggedRef = useRef(false);
  const isMobile = useIsMobile();

  // Filtra apenas contas de investimento (tratando contas sem tipo definido)
  const investmentAccounts = accounts.filter(acc => {
      const normalizedType = acc.type ? acc.type.toLowerCase() : '';
      const isYieldType = normalizedType.includes('rendimento') || normalizedType.includes('investimento');
      return isYieldType || (acc.yieldRate !== undefined && acc.yieldRate > 0);
  });

  const totalInvested = investmentAccounts.reduce((acc, curr) => acc + curr.currentBalance, 0);

  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const calculatorDefaults: CompoundCalculatorDefaults = useMemo(() => ({
      initialInvestment: 0,
      monthlyContribution: 0,
      rate: 0,
      ratePeriod: 'year',
      duration: 1,
      durationUnit: 'years'
  }), []);
  const [calculatorSummary, setCalculatorSummary] = useState<CompoundCalculatorResult | null>(null);
  const toIsoString = (value: unknown): string | null => {
      if (!value) return null;
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') return value;
      if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
          return (value as { toDate: () => Date }).toDate().toISOString();
      }
      return null;
  };

  useEffect(() => {
      if (!licenseId) {
          setTargetGoal(MILLION_TARGET_DEFAULT);
          setGoalSavedAt(null);
          console.info('[goals] fallback default', { reason: 'missing_uid' });
          return;
      }
      let cancelled = false;
      const loadGoal = async () => {
          const ref = doc(db, 'userGoals', licenseId);
          const path = `userGoals/${licenseId}`;
          try {
              const snap = await getDoc(ref);
              if (cancelled) return;
              if (!snap.exists()) {
                  setTargetGoal(MILLION_TARGET_DEFAULT);
                  setGoalSavedAt(null);
                  console.info('[goals] fallback default', { path, reason: 'missing_doc' });
                  return;
              }
              const data = snap.data() as Record<string, unknown>;
              const goalValue = typeof data.patrimonyGoal === 'number' ? data.patrimonyGoal : MILLION_TARGET_DEFAULT;
              setTargetGoal(goalValue);
              setGoalSavedAt(toIsoString(data.updatedAt));
              if (typeof data.patrimonyGoal !== 'number') {
                  console.info('[goals] fallback default', { path, reason: 'invalid_value' });
              } else {
                  console.info('[goals] loaded', { path, value: goalValue });
              }
          } catch (error) {
              logPermissionDenied({
                  step: 'goals_load',
                  path,
                  operation: 'getDoc',
                  error,
                  licenseId
              });
              console.error('[goals] error', { step: 'load', message: (error as Error)?.message || error });
              setTargetGoal(MILLION_TARGET_DEFAULT);
              setGoalSavedAt(null);
              console.info('[goals] fallback default', { path, reason: 'error' });
          }
      };
      void loadGoal();
      return () => {
          cancelled = true;
      };
  }, [licenseId]);

  useEffect(() => {
      if (!licenseId || !licenseCryptoEpoch) {
          setFirestoreYields([]);
          return;
      }
      console.info('[realtime][yields] subscribe_start', { licenseId });
      const unsubscribe = yieldsService.subscribeYields(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][yields] snapshot', { count: items.length });
              setFirestoreYields(items);
          },
          (error) => {
              console.error('[realtime][yields] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
              setFirestoreYields([]);
          }
      );
      return () => {
          unsubscribe();
          console.info('[realtime][yields] unsubscribe', { licenseId });
      };
  }, [licenseId, licenseCryptoEpoch]);

  useEffect(() => {
      if (firestoreYields.some(item => item.lockedReason === 'epoch_mismatch') && !recoveryLoggedRef.current) {
          console.info('[ui][state] recovery mode active');
          recoveryLoggedRef.current = true;
      }
  }, [firestoreYields]);

  const persistGoal = async (value: number) => {
      setTargetGoal(value);
      const updatedAt = new Date().toISOString();
      setGoalSavedAt(updatedAt);
      if (!licenseId) {
          console.error('[goals] error', { step: 'save', message: 'missing_uid' });
          return;
      }
      const ref = doc(db, 'userGoals', licenseId);
      const path = `userGoals/${licenseId}`;
      try {
          await setDoc(
              ref,
              { patrimonyGoal: value, updatedAt: serverTimestamp() },
              { merge: true }
          );
          console.info('[goals] saved', { path, value });
      } catch (error) {
          logPermissionDenied({
              step: 'goals_save',
              path,
              operation: 'setDoc',
              error,
              licenseId
          });
          console.error('[goals] error', { step: 'save', message: (error as Error)?.message || error });
      }
  };

  useEffect(() => {
      setGoalInput((targetGoal || MILLION_TARGET_DEFAULT).toString());
  }, [targetGoal]);

  type YieldEntry = {
      id?: string;
      accountId: string;
      accountName: string;
      date: string;
      amount: number;
      notes?: string;
      color?: string;
      source: 'firestore' | 'legacy';
      locked?: boolean;
      lockedReason?: 'decrypt_failed' | 'missing_salt' | 'epoch_mismatch';
  };

  const normalizeNotes = (value?: string) =>
      yieldsService.normalizeNotes(value).toLowerCase();

  const buildEntryKey = (entry: { accountId: string; date: string; amount: number; notes?: string; id?: string; lockedReason?: string }) => {
      if (entry.lockedReason === 'epoch_mismatch' && entry.id) {
          return `locked:${entry.id}`;
      }
      const amountKey = Math.round((entry.amount || 0) * 100);
      return `${entry.accountId}|${entry.date}|${amountKey}|${normalizeNotes(entry.notes)}`;
  };

  const legacyYieldEntries = useMemo<YieldEntry[]>(() => {
      const entries: YieldEntry[] = [];
      investmentAccounts.forEach(account => {
          const history = account.yieldHistory ?? [];
          history.forEach(item => {
              if (!item.date) return;
              entries.push({
                  accountId: account.id,
                  accountName: account.name,
                  date: item.date,
                  amount: item.amount,
                  notes: item.notes,
                  color: account.color,
                  source: 'legacy'
              });
          });

          if (account.lastYieldDate && account.lastYield !== undefined) {
              const exists = history.some(item => item.date === account.lastYieldDate);
              if (!exists) {
                  entries.push({
                      accountId: account.id,
                      accountName: account.name,
                      date: account.lastYieldDate,
                      amount: account.lastYield,
                      notes: account.lastYieldNote,
                      color: account.color,
                      source: 'legacy'
                  });
              }
          }
      });

      return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [investmentAccounts]);

  const firestoreYieldEntries = useMemo<YieldEntry[]>(() => {
      if (!firestoreYields.length) return [];
      return firestoreYields
          .map(item => {
              if (!item.date) return null;
              const account = investmentAccounts.find(acc => acc.id === item.accountId);
              return {
                  id: item.id,
                  accountId: item.accountId,
                  accountName: account?.name || 'Conta removida',
                  date: item.date,
                  amount: item.amount,
                  notes: item.notes || undefined,
                  color: account?.color,
                  source: 'firestore' as const,
                  locked: item.locked,
                  lockedReason: item.lockedReason
              };
          })
          .filter((entry): entry is YieldEntry => Boolean(entry));
  }, [firestoreYields, investmentAccounts]);

  useEffect(() => {
      if (!licenseId) return;
      const preview = legacyYieldEntries.slice(0, 5).map(item => ({
          accountId: item.accountId,
          date: item.date,
          amount: item.amount,
          notes: item.notes || null
      }));
      console.info('[yields] legacy_preview', {
          licenseId,
          count: legacyYieldEntries.length,
          itemsPreview: preview,
          source: 'legacy'
      });
  }, [legacyYieldEntries, licenseId]);

  const mergedYieldEntries = useMemo<YieldEntry[]>(() => {
      const merged = new Map<string, YieldEntry>();
      firestoreYieldEntries.forEach(entry => {
          merged.set(buildEntryKey(entry), entry);
      });
      legacyYieldEntries.forEach(entry => {
          const key = buildEntryKey(entry);
          if (!merged.has(key)) {
              merged.set(key, entry);
          }
      });
      return Array.from(merged.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [firestoreYieldEntries, legacyYieldEntries]);

  useEffect(() => {
      if (!licenseId) return;
      const preview = mergedYieldEntries.slice(0, 5).map(item => ({
          accountId: item.accountId,
          date: item.date,
          amount: item.amount,
          notes: item.notes || null,
          source: item.source
      }));
      console.info('[yields] merged_ok', {
          licenseId,
          countMerged: mergedYieldEntries.length,
          previewMerged: preview
      });
  }, [mergedYieldEntries, licenseId]);

  const yieldEntries = mergedYieldEntries;

  // Calcula o total rendido "Hoje"
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysEntries = yieldEntries.filter(entry => entry.date === todayStr);
  const totalCount = yieldEntries.length;

  const closeYieldModal = () => {
      setIsModalOpen(false);
      setEditingYield(null);
  };

  const closeDetailPanel = () => {
      setDetailAccount(null);
  };

  const handleSaveYield = async (data: { accountId: string, amount: number, date: string, notes: string }) => {
      const isEditing = Boolean(editingYield);
      const yieldId = yieldsService.buildYieldId(data.accountId, data.date);
      const targetAccount = accounts.find(acc => acc.id === data.accountId);
      if (targetAccount?.locked) {
          return;
      }
      const mutationId = isEditing
          ? `yield:edit:${data.accountId}:${editingYield?.date}:${editingYield?.amount}->${data.amount}`
          : `yield:add:${data.accountId}:${data.date}:${data.amount}`;
      const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
          source: 'yields_view',
          action: isEditing ? 'edit' : 'add',
          accountId: data.accountId,
          entityId: yieldId,
          amount: data.amount,
          status: 'applied'
      });
      const updatedAccounts = accounts.map(acc => {
          if (acc.id !== data.accountId) {
              return acc;
          }
          if (!shouldApply) {
              return acc;
          }

          const yieldHistory = acc.yieldHistory ? [...acc.yieldHistory] : [];
          const yieldIndex = yieldHistory.findIndex(entry => entry.date === data.date);

          if (editingYield) {
              const diff = data.amount - editingYield.amount;
              const newBalance = acc.currentBalance + diff;
              const history = acc.balanceHistory ? [...acc.balanceHistory] : [];
              const entryIndex = history.findIndex(h => h.date === editingYield.date);
              if (entryIndex >= 0) {
                  history[entryIndex] = { ...history[entryIndex], value: history[entryIndex].value + diff };
              }

              if (yieldIndex >= 0) {
                  yieldHistory[yieldIndex] = { ...yieldHistory[yieldIndex], amount: data.amount, notes: data.notes };
              } else {
                  yieldHistory.push({ date: data.date, amount: data.amount, notes: data.notes });
              }

              return {
                  ...acc,
                  currentBalance: newBalance,
                  lastYield: data.amount,
                  lastYieldDate: data.date,
                  lastYieldNote: data.notes,
                  balanceHistory: history,
                  yieldHistory
              };
          }

          const newBalance = acc.currentBalance + data.amount;
          const history = acc.balanceHistory ? [...acc.balanceHistory] : [];
          const entryIndex = history.findIndex(h => h.date === data.date);
          if (entryIndex >= 0) {
              history[entryIndex].value += data.amount; 
          } else {
              history.push({ date: data.date, value: newBalance });
              history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          }

          if (yieldIndex >= 0) {
              yieldHistory[yieldIndex] = { ...yieldHistory[yieldIndex], amount: data.amount, notes: data.notes };
          } else {
              yieldHistory.push({ date: data.date, amount: data.amount, notes: data.notes });
          }

          return {
              ...acc,
              currentBalance: newBalance,
              lastYield: data.amount,
              lastYieldDate: data.date,
              lastYieldNote: data.notes,
              balanceHistory: history,
              yieldHistory
          };
      });

      onUpdateAccounts(updatedAccounts);
      closeYieldModal();

      if (licenseId && licenseCryptoEpoch) {
          try {
              await yieldsService.addYield(licenseId, {
                  accountId: data.accountId,
                  amount: data.amount,
                  date: data.date,
                  notes: data.notes
              }, licenseCryptoEpoch);
              if (isEditing && isMobile) {
                  console.info('[yields][mobile] edit_save_ok', {
                      accountId: data.accountId,
                      yieldId
                  });
              }
              if (onAuditLog) {
                  const account = investmentAccounts.find(acc => acc.id === data.accountId);
                  const accountName = account?.name || 'Conta';
                  onAuditLog({
                      actionType: 'yield_added',
                      description: `Rendimento lançado em ${accountName}: ${formatCurrency(data.amount)} (${new Date(`${data.date}T12:00:00`).toLocaleDateString('pt-BR')}).`,
                      entityType: 'yield',
                      entityId: yieldId,
                      metadata: {
                          accountId: data.accountId,
                          accountName,
                          amount: data.amount,
                          date: data.date,
                          notes: data.notes || ''
                      }
                  });
              }
          } catch (error) {
              if (isEditing && isMobile) {
                  console.error('[yields][mobile] edit_save_fail', {
                      accountId: data.accountId,
                      yieldId,
                      message: (error as Error)?.message || error
                  });
              }
              console.error('[yields] add_failed', {
                  licenseId,
                  accountId: data.accountId,
                  date: data.date,
                  message: (error as Error)?.message || error
              });
          }
      } else {
          console.warn('[yields] add_blocked', { reason: 'epoch_missing', licenseId });
          if (isEditing && isMobile) {
              console.error('[yields][mobile] edit_save_fail', {
                  accountId: data.accountId,
                  yieldId,
                  reason: 'epoch_missing_or_license_missing'
              });
          }
      }
  };

  const handleCalculatorResult = (summary: CompoundCalculatorResult) => {
      setCalculatorSummary(summary);
  };

  const startOfMonth = useMemo(() => {
      return new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  }, [viewDate]);

  const previousMonthEnd = useMemo(() => {
      const prev = new Date(startOfMonth);
      prev.setDate(0);
      prev.setHours(23, 59, 59, 999);
      return prev;
  }, [startOfMonth]);

  const previousMonthTotal = useMemo(() => {
      return investmentAccounts.reduce((sum, account) => sum + getAccountValueAtDate(account, previousMonthEnd), 0);
  }, [investmentAccounts, previousMonthEnd]);

  const monthlyDelta = totalInvested - previousMonthTotal;
  const monthlyDeltaText = `${monthlyDelta >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(monthlyDelta))} vs mês anterior`;
  const todayLabel = new Date().toLocaleDateString('pt-BR');
  const selectedYear = viewDate.getFullYear();
  const selectedMonthIndex = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('pt-BR', { month: 'long' });
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}/${selectedYear}`;
  const currentMonthKey = `${selectedYear}-${selectedMonthIndex}`;

  useEffect(() => {
      console.info('[yields-monthly] month', {
          year: selectedYear,
          monthIndex: selectedMonthIndex,
          monthLabel
      });
  }, [selectedYear, selectedMonthIndex, monthLabel]);

  const monthlyYieldTotalsByAccount = useMemo(() => {
      const totals: Record<string, number> = {};
      yieldEntries.forEach(entry => {
          const date = new Date(`${entry.date}T12:00:00`);
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          if (key === currentMonthKey) {
              totals[entry.accountId] = (totals[entry.accountId] || 0) + entry.amount;
          }
      });
      return totals;
  }, [yieldEntries, currentMonthKey]);

  interface MonthlySummaryItem {
      account: Account;
      total: number;
      count: number;
      entries: YieldEntry[];
      color: string;
  }

  const monthlySummary = useMemo<MonthlySummaryItem[]>(() => {
      const entriesByAccount = new Map<string, YieldEntry[]>();
      yieldEntries.forEach(entry => {
          const date = parseHistoryDate(entry.date);
          if (date.getFullYear() !== selectedYear || date.getMonth() !== selectedMonthIndex) {
              return;
          }
          const list = entriesByAccount.get(entry.accountId);
          if (list) {
              list.push(entry);
          } else {
              entriesByAccount.set(entry.accountId, [entry]);
          }
      });
      entriesByAccount.forEach(list => {
          list.sort((a, b) => parseHistoryDate(b.date).getTime() - parseHistoryDate(a.date).getTime());
      });
      return investmentAccounts.map(account => {
          const entries = entriesByAccount.get(account.id) ?? [];
          const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
          return {
              account,
              total,
              count: entries.length,
              entries,
              color: account.color || getStrokeColor(account.name)
          };
      });
  }, [yieldEntries, investmentAccounts, selectedYear, selectedMonthIndex]);

  const monthlySummaryMap = useMemo(() => {
      const map = new Map<string, MonthlySummaryItem>();
      monthlySummary.forEach(item => {
          map.set(item.account.id, item);
      });
      return map;
  }, [monthlySummary]);

  const monthlyEntriesCount = useMemo(
      () => monthlySummary.reduce((sum, item) => sum + item.count, 0),
      [monthlySummary]
  );

  useEffect(() => {
      monthlySummary.forEach(item => {
          console.info('[yields-monthly] perAccount', {
              accountId: item.account.id,
              accountName: item.account.name,
              color: item.color,
              total: item.total,
              count: item.count
          });
      });
  }, [monthlySummary]);

  const accountMonthlyEntries = useMemo(() => {
      if (!detailAccount) return [];
      return monthlySummaryMap.get(detailAccount.id)?.entries ?? [];
  }, [detailAccount, monthlySummaryMap]);

  const openMonthlyDrawer = (account: Account) => {
      const summary = monthlySummaryMap.get(account.id);
      const count = summary?.count ?? 0;
      console.info('[yields-monthly] openDrawer', {
          accountId: account.id,
          accountName: account.name,
          items: count
      });
      setDetailAccount(account);
  };

  const monthlyTotalYield = useMemo(() => Object.values(monthlyYieldTotalsByAccount).reduce((sum, value) => sum + value, 0), [monthlyYieldTotalsByAccount]);
  const topAccountId = useMemo(() => {
      const entries = Object.entries(monthlyYieldTotalsByAccount);
      if (!entries.length) return null;
      return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [monthlyYieldTotalsByAccount]);
  const topAccount = investmentAccounts.find(account => account.id === topAccountId);
  const performance = monthlyDelta > 0
      ? { icon: ArrowUpRight, text: 'Mês positivo', color: 'text-emerald-400' }
      : monthlyDelta < 0
          ? { icon: ArrowDownRight, text: 'Mês em queda', color: 'text-rose-400' }
          : { icon: Minus, text: 'Equilíbrio', color: 'text-zinc-400' };
  const motivationalInsight = useMemo(() => {
      if (!totalCount) return 'Comece registrando seus primeiros rendimentos para liberar os insights.';
      if (todaysEntries.length === 0) return 'Um dia sem rendimentos não define a jornada. Continue consistente.';
      if (monthlyTotalYield > 0) return 'Você teve consistência este mês. Excelente disciplina.';
      return 'Ajuste o plano de aportes para manter o capital em crescimento.';
  }, [totalCount, todaysEntries.length, monthlyTotalYield]);

  const rankingMessage = topAccount
      ? `${topAccount.name} teve o maior rendimento do mês.`
      : 'Cadastre rendimentos para descobrirmos quem está liderando.';

  interface LineSeriesPoint {
      day: number;
      value: number;
  }

  interface LineSeries {
      accountId: string;
      accountName: string;
      color: string;
      points: LineSeriesPoint[];
  }

  const monthlyLineData = useMemo(() => {
      const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
      const seriesMap = new Map<string, { account: Account; color: string; values: number[] }>();

      investmentAccounts.forEach(account => {
          seriesMap.set(account.id, {
              account,
              color: account.color || getStrokeColor(account.name),
              values: Array(daysInMonth).fill(0)
          });
      });

      yieldEntries.forEach(entry => {
          const date = parseHistoryDate(entry.date);
          if (date.getFullYear() !== selectedYear || date.getMonth() !== selectedMonthIndex) {
              return;
          }
          const series = seriesMap.get(entry.accountId);
          if (!series) return;
          series.values[date.getDate() - 1] += entry.amount;
      });

      const series: LineSeries[] = Array.from(seriesMap.values()).map(item => {
          let running = 0;
          const points = item.values.map((value, index) => {
              running += value;
              return { day: index + 1, value: running };
          });
          return {
              accountId: item.account.id,
              accountName: item.account.name,
              color: item.color,
              points
          };
      });

      const maxValue = series.reduce((max, line) => {
          const lineMax = line.points.reduce((linePeak, point) => Math.max(linePeak, point.value), 0);
          return Math.max(max, lineMax);
      }, 0);

      return {
          daysInMonth,
          series,
          maxValue
      };
  }, [investmentAccounts, yieldEntries, selectedMonthIndex, selectedYear]);
  const metaGoal = targetGoal || MILLION_TARGET_DEFAULT;
  const projectedAmount = calculatorSummary?.finalAmount ?? totalInvested;
  const progressPercent = Math.min((projectedAmount / metaGoal) * 100, 100);
  const progressLabel = `${progressPercent.toFixed(1)}% da meta`;
  const calculatorSummaryText = calculatorSummary
      ? `Último cálculo: ${formatCurrency(projectedAmount)} em ${formatTimeline(calculatorSummary.periodMonths)}.`
      : getProgressMessage((totalInvested / metaGoal) * 100);
  const calculatorSummarySubtext = calculatorSummary
      ? 'Resultados baseados no cenário mais recente.'
      : 'Abra a calculadora para desenhar seu plano.';
  const remainingToGoal = Math.max(metaGoal - totalInvested, 0);
  const monthsToGoal = monthlyTotalYield > 0 ? Math.ceil(remainingToGoal / monthlyTotalYield) : null;
  const projectionText = monthsToGoal
      ? `Mantendo o ritmo atual (${formatCurrency(monthlyTotalYield)} este mês) você chega à meta em ${formatTimeline(monthsToGoal)}.`
      : 'Alimente a carteira para gerar projeções mais precisas.';
  const projectionBoostText = monthsToGoal
      ? 'Um aporte extra de R$ 100 mensais antecipa aproximadamente 2 meses da jornada.'
      : 'Use a calculadora para planejar aportes regulares.';

  const handleOpenYieldModal = () => {
      setEditingYield(null);
      setIsModalOpen(true);
  };

  const handleEditYield = (entry: YieldEntry) => {
      setEditingYield({
          accountId: entry.accountId,
          amount: entry.amount,
          date: entry.date,
          notes: entry.notes || ''
      });
      setIsModalOpen(true);
  };

  const handleOpenGoal = () => {
      setGoalInput(metaGoal.toString());
      setIsGoalModalOpen(true);
  };

  const renderLineChart = () => {
      if (!monthlyLineData.series.length) {
          return (
              <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
                  Cadastre rendimentos para visualizar a evolução.
              </div>
          );
      }

      const hasData = monthlyLineData.series.some(line => line.points.some(point => point.value !== 0));
      if (!hasData) {
          return (
              <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
                  Sem rendimentos registrados no mês selecionado.
              </div>
          );
      }

      const width = 720;
      const height = 260;
      const padding = 48;
      const maxValue = monthlyLineData.maxValue;
      const minValue = monthlyLineData.series.reduce((min, line) => {
          const lineMin = line.points.reduce((lineFloor, point) => Math.min(lineFloor, point.value), 0);
          return Math.min(min, lineMin);
      }, 0);
      const valueRange = maxValue - minValue || 1;
      const dayCount = monthlyLineData.daysInMonth;

      const getX = (day: number) => {
          if (dayCount <= 1) return padding;
          return padding + ((width - padding * 2) * ((day - 1) / (dayCount - 1)));
      };

      const getY = (value: number) => {
          return height - padding - ((value - minValue) / valueRange) * (height - padding * 2);
      };

      const tickStep = Math.max(1, Math.ceil(dayCount / 6));
      const dayTicks: number[] = [];
      for (let day = 1; day <= dayCount; day += tickStep) {
          dayTicks.push(day);
      }
      if (dayTicks[dayTicks.length - 1] !== dayCount) {
          dayTicks.push(dayCount);
      }

      const valueTicks: number[] = [];
      for (let i = 0; i <= 4; i += 1) {
          valueTicks.push(minValue + ((maxValue - minValue) * i) / 4);
      }

      return (
          <div className="relative">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                  {[0.25, 0.5, 0.75, 1].map(ratio => {
                      const y = padding + (height - padding * 2) * ratio;
                      return (
                          <line
                              key={ratio}
                              x1={padding}
                              y1={y}
                              x2={width - padding}
                              y2={y}
                              stroke="#27272a"
                              strokeWidth="1"
                              strokeDasharray="4"
                          />
                      );
                  })}
                  <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#3f3f46" strokeWidth="1.5" />
                  <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#3f3f46" strokeWidth="1.5" />

                  {monthlyLineData.series.map(line => (
                      <polyline
                          key={line.accountId}
                          points={line.points.map(point => `${getX(point.day)},${getY(point.value)}`).join(' ')}
                          fill="none"
                          stroke={line.color}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                      />
                  ))}

                  {monthlyLineData.series.map(line =>
                      line.points.map(point => {
                          const x = getX(point.day);
                          const y = getY(point.value);
                          return (
                              <circle
                                  key={`${line.accountId}-${point.day}`}
                                  cx={x}
                                  cy={y}
                                  r={4}
                                  fill={line.color}
                                  opacity={point.day === dayCount ? 1 : 0.85}
                                  onMouseEnter={() => setLineTooltip({
                                      x,
                                      y,
                                      day: point.day,
                                      accountName: line.accountName,
                                      value: point.value,
                                      color: line.color
                                  })}
                                  onMouseLeave={() => setLineTooltip(null)}
                              />
                          );
                      })
                  )}

                  {dayTicks.map(day => (
                      <text key={day} x={getX(day)} y={height - padding + 16} textAnchor="middle" className="text-[10px] fill-zinc-500">
                          {day.toString().padStart(2, '0')}
                      </text>
                  ))}
                  {valueTicks.map((tick, index) => (
                      <text key={index} x={padding - 8} y={getY(tick)} textAnchor="end" className="text-[10px] fill-zinc-500">
                          {formatCurrency(tick)}
                      </text>
                  ))}
              </svg>

              {lineTooltip && (
                  <div
                      className="absolute bg-zinc-900/90 border border-zinc-700 text-xs text-white px-3 py-2 rounded-xl shadow-2xl"
                      style={{ left: lineTooltip.x - 60, top: lineTooltip.y - 70 }}
                  >
                      <p className="font-semibold">{lineTooltip.accountName}</p>
                      <p className="text-zinc-300">Dia {lineTooltip.day.toString().padStart(2, '0')}</p>
                      <p className="text-zinc-300">Acumulado: {formatCurrency(lineTooltip.value)}</p>
                  </div>
              )}

              <div className="flex flex-wrap justify-center gap-4 mt-4 text-[11px] text-zinc-500">
                  {monthlyLineData.series.map(line => (
                      <span key={line.accountId} className="flex items-center gap-2">
                          <span className="w-3 h-1 rounded-full" style={{ background: line.color }}></span>
                          {line.accountName}
                      </span>
                  ))}
              </div>
          </div>
      );
  };

  const yieldModals = (
      <>
          <NewYieldModal 
              isOpen={isModalOpen}
              onClose={closeYieldModal}
              onSave={handleSaveYield}
              accounts={investmentAccounts}
              licenseId={licenseId}
              initialData={editingYield}
          />

          <CompoundInterestCalculatorModal
              isOpen={isCalculatorOpen}
              onClose={() => setIsCalculatorOpen(false)}
              defaults={calculatorDefaults}
              onResult={handleCalculatorResult}
          />
          
          {isGoalModalOpen &&
              (isMobile ? (
                  <MobileModalShell
                      isOpen={isGoalModalOpen}
                      onClose={() => setIsGoalModalOpen(false)}
                      title="Definir meta de patrimônio"
                      subtitle="Ajuste o valor alvo da sua carteira."
                      modalName="yield_goal"
                  >
                      <div className="space-y-4">
                          <div className="space-y-2">
                              <label htmlFor={goalInputIdMobile} className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                Valor alvo (R$)
                              </label>
                              <input
                                  id={goalInputIdMobile}
                                  name="goalAmount"
                                  type="number"
                                  value={goalInput}
                                  onChange={(e) => setGoalInput(e.target.value)}
                                  placeholder="1.000.000,00"
                                  className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 rounded-2xl px-5 py-4 text-lg font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Você pode ajustar esta meta sempre que quiser.</p>
                          </div>
                          <div className="flex flex-col gap-3">
                              <button
                                  onClick={() => setIsGoalModalOpen(false)}
                                  className="px-5 py-3 rounded-2xl border border-white/20 text-sm font-semibold text-zinc-500 dark:text-zinc-200 hover:bg-white/50 dark:hover:bg-white/10"
                              >
                                  Cancelar
                              </button>
                              <button
                                  onClick={() => {
                                      const parsed = parseFloat(goalInput.replace(',', '.'));
                                      if (!Number.isNaN(parsed) && parsed > 0) {
                                          void persistGoal(parsed);
                                          setIsGoalModalOpen(false);
                                      }
                                  }}
                                  className="px-6 py-3 rounded-2xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/40"
                              >
                                  Salvar meta
                              </button>
                          </div>
                      </div>
                  </MobileModalShell>
              ) : (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsGoalModalOpen(false)}></div>
                      <div className="relative w-full max-w-lg bg-white dark:bg-[#0f0f13] rounded-[28px] border border-white/10 shadow-2xl p-8 space-y-6">
                          <div className="flex items-center justify-between">
                              <div>
                                  <p className="text-xs uppercase tracking-[0.3em] text-indigo-500/80 mb-2">Meta</p>
                                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">Definir meta de patrimônio</h2>
                              </div>
                              <button
                                onClick={() => setIsGoalModalOpen(false)}
                                aria-label="Fechar modal"
                                className="p-2 rounded-full hover:bg-white/10 text-zinc-400"
                              >
                                  <X size={18} />
                              </button>
                          </div>
                          <div className="space-y-2">
                              <label htmlFor={goalInputIdDesktop} className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                Valor alvo (R$)
                              </label>
                              <input
                                  id={goalInputIdDesktop}
                                  name="goalAmount"
                                  type="number"
                                  value={goalInput}
                                  onChange={(e) => setGoalInput(e.target.value)}
                                  placeholder="1.000.000,00"
                                  className="w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 rounded-2xl px-5 py-4 text-lg font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Você pode ajustar esta meta sempre que quiser.</p>
                          </div>
                          <div className="flex items-center justify-end gap-3">
                              <button
                                  onClick={() => setIsGoalModalOpen(false)}
                                  className="px-5 py-3 rounded-2xl border border-white/20 text-sm font-semibold text-zinc-500 dark:text-zinc-200 hover:bg-white/50 dark:hover:bg-white/10"
                              >
                                  Cancelar
                              </button>
                              <button
                                  onClick={() => {
                                      const parsed = parseFloat(goalInput.replace(',', '.'));
                                      if (!Number.isNaN(parsed) && parsed > 0) {
                                          void persistGoal(parsed);
                                          setIsGoalModalOpen(false);
                                      }
                                  }}
                                  className="px-6 py-3 rounded-2xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/40"
                              >
                                  Salvar meta
                              </button>
                          </div>
                      </div>
                  </div>
              ))}
      </>
  );

  if (isMobile) {
      return (
          <>
              <YieldsMobileV2
                  onBack={onBack}
                  investmentAccounts={investmentAccounts}
                  viewDate={viewDate}
                  totalInvested={totalInvested}
                  monthlyDelta={monthlyDelta}
                  monthlyDeltaText={monthlyDeltaText}
                  monthlySummary={monthlySummary}
                  monthlyLineData={monthlyLineData}
                  onAddYield={handleOpenYieldModal}
                  onEditYield={handleEditYield}
                  onOpenCalculator={() => setIsCalculatorOpen(true)}
                  onOpenGoal={handleOpenGoal}
                  onOpenAudit={onOpenAudit}
              />
              {yieldModals}
          </>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      
      {/* Header Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 relative z-10 -mt-2">
          <button 
             onClick={onBack}
             className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
              <ArrowLeft size={16} /> Voltar ao Dashboard
          </button>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
              <div>
                  <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
                      <TrendingUp className="text-purple-600 dark:text-purple-500" />
                      Carteira de Rendimentos
                  </h1>
                  <p className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <ShieldCheck size={14} className="text-emerald-500" />
                      Acompanhamento dos seus investimentos e da jornada rumo ao primeiro milhão.
                  </p>
              </div>
              <div className="flex items-center gap-3">
                  {goalSavedAt && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Meta atualizada em {new Date(goalSavedAt).toLocaleDateString('pt-BR')}
                      </span>
                  )}
              </div>
          </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Wealth + Goal Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-violet-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-900/30">
                  <div className="absolute inset-0 opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle at top right, rgba(255,255,255,0.4), transparent 60%)' }}></div>
                  <div className="relative z-10 space-y-6">
                      <div className="flex items-start justify-between gap-4">
                          <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-indigo-100 font-semibold">Patrimônio em Aplicações</p>
                              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mt-2">
                                  {formatCurrency(totalInvested)}
                              </h2>
                              <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                                  <span className={`${monthlyDelta >= 0 ? 'text-emerald-200' : 'text-rose-200'} font-semibold`}>
                                      {monthlyDeltaText}
                                  </span>
                                  <span className="text-[11px] uppercase tracking-wide bg-white/10 px-3 py-1 rounded-full text-indigo-50 border border-white/20">
                                      Baseado nos rendimentos lançados
                                  </span>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 ${performance.color}`}>
                                      <performance.icon size={16} />
                                      {performance.text}
                                  </span>
                                  <span className="text-indigo-50/80">{rankingMessage}</span>
                              </div>
                          </div>
                          <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
                              <LineChart size={28} className="text-indigo-100" />
                          </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2 text-indigo-100 text-sm">
                              <Calendar size={16} />
                              <span>Hoje, {todayLabel}</span>
                          </div>
                          <button 
                            onClick={() => {
                                setEditingYield(null);
                                setIsModalOpen(true);
                            }}
                            className="w-full sm:w-auto bg-white text-indigo-900 hover:bg-indigo-50 font-bold py-3 px-6 rounded-2xl shadow-lg shadow-indigo-900/30 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                          >
                            <PlayCircle size={18} fill="currentColor" className="text-indigo-900" />
                            Adicionar Rendimento Diário
                          </button>
                      </div>
                      <p className="text-sm text-indigo-100/80 leading-relaxed">{motivationalInsight}</p>
                  </div>
              </div>

              <div className="bg-white dark:bg-[#151517] rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(123,97,255,0.4), transparent 60%)' }}></div>
                  <div className="relative z-10 space-y-5">
                      <div className="flex items-start justify-between gap-4">
                          <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-semibold">Calculadora de Juros Compostos</p>
                              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">Simule o crescimento dos seus investimentos</h3>
                              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide font-bold text-indigo-500 mt-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 px-3 py-1 rounded-full">
                                  <Target size={14} /> {progressLabel}
                              </span>
                          </div>
                          <div className="flex flex-col items-end gap-3">
                              <button
                                  onClick={() => {
                                      setGoalInput(metaGoal.toString());
                                      setIsGoalModalOpen(true);
                                  }}
                                  className="text-xs font-semibold px-3 py-1 rounded-full border border-indigo-500/40 text-indigo-500 hover:bg-indigo-500/10 transition"
                              >
                                  Definir meta
                              </button>
                              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
                                  <Target size={28} className="text-indigo-500" />
                              </div>
                          </div>
                      </div>

                      <div>
                          <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-violet-500 transition-all duration-700" style={{ width: `${progressPercent}%` }}></div>
                          </div>
                          <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
                              <span>Meta: {formatCurrency(metaGoal)}</span>
                              <span>Projeção: {formatCurrency(projectedAmount)}</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <p className="text-xs uppercase text-zinc-500 font-semibold">Meta atual</p>
                              <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">{formatCurrency(metaGoal)}</p>
                          </div>
                          <div>
                              <p className="text-xs uppercase text-zinc-500 font-semibold">Você já acumulou</p>
                              <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">{formatCurrency(totalInvested)}</p>
                          </div>
                      </div>

                      <div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{calculatorSummaryText}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                              <Sparkles size={14} className="text-amber-500" />
                              {calculatorSummarySubtext}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                              <Compass size={14} className="text-cyan-400" />
                              {projectionText}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                              <Award size={14} className="text-emerald-400" />
                              {projectionBoostText}
                          </p>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Planeje seus aportes e compare cenários.</span>
                          <button
                            onClick={() => setIsCalculatorOpen(true)}
                            className="px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                          >
                              Abrir Calculadora
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          <section className="bg-white dark:bg-[#151517] rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Resumo do mês</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">Total de rendimentos por conta no mês selecionado.</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full">
                      {monthLabel}
                  </span>
              </div>
              <div className="space-y-3">
                  {monthlyEntriesCount === 0 && (
                      <p className="text-sm text-zinc-500">Nenhum rendimento registrado no mês selecionado.</p>
                  )}
                  {monthlySummary.map(item => {
                      const countLabel = item.count === 1 ? '1 lançamento no mês' : `${item.count} lançamentos no mês`;
                      const isArchived = item.account.locked && item.account.lockedReason === 'epoch_mismatch';
                      return (
                          <button
                              key={item.account.id}
                              type="button"
                              onClick={() => openMonthlyDrawer(item.account)}
                              className="w-full text-left bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              style={{ borderLeftWidth: '4px', borderLeftColor: item.color }}
                          >
                              <div className="flex items-center gap-3">
                                  <span className="inline-flex w-3 h-3 rounded-full" style={{ background: item.color }}></span>
                                  <div>
                                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{item.account.name}</p>
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                          {item.count > 0 ? countLabel : 'Sem lançamentos neste mês'}
                                      </p>
                                  </div>
                              </div>
                              {isArchived && (
                                  <span className="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                      Arquivado
                                  </span>
                              )}
                              <div className="text-right">
                                  <p className={`text-lg font-bold ${item.total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                      {formatCurrency(item.total)}
                                  </p>
                              </div>
                          </button>
                      );
                  })}
              </div>
          </section>

          {/* Chart Section */}
          <div className="bg-white dark:bg-[#151517] rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
               <div className="flex items-center justify-between mb-6">
                   <div>
                       <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Curva de Crescimento</h3>
                       <p className="text-sm text-zinc-500 dark:text-zinc-400">Evolução diária do rendimento acumulado no mês.</p>
                   </div>
                   <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full">
                       {monthLabel}
                   </span>
               </div>
               <div className="w-full">
                  {renderLineChart()}
               </div>
          </div>

          {/* Individual Accounts Grid */}
          <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 ml-1">Detalhamento por Conta</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {investmentAccounts.map(account => {
                      const displayYield = account.lastYield || 0;
                      
                      return (
                      <div 
                          key={account.id} 
                          role="button"
                          tabIndex={0}
                          onClick={() => openMonthlyDrawer(account)}
                          onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openMonthlyDrawer(account);
                              }
                          }}
                          className="bg-white dark:bg-[#1a1a1a] rounded-[24px] p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                          <div className="absolute inset-0 opacity-5" style={{ background: `linear-gradient(135deg, ${account.color || '#7c3aed'}, transparent)` }}></div>
                          <div className="relative z-10 space-y-4">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <h4 className="font-bold text-zinc-900 dark:text-white text-lg">{account.name}</h4>
                                      <div className="flex items-center gap-1.5 mt-1">
                                          <span className="text-[10px] font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-md border border-violet-200 dark:border-violet-800">
                                              {account.yieldRate}% do CDI
                                          </span>
                                          {account.lockedReason === 'epoch_mismatch' && (
                                              <span className="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                                  Arquivado
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              </div>
                              <div>
                                  <p className="text-xs text-zinc-500 uppercase font-semibold">Saldo Atual</p>
                                  <p className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
                                      R$ {account.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </p>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                  <div>
                                      <p className="text-xs text-zinc-500 uppercase">Último rendimento</p>
                                      <p className="text-sm font-semibold text-emerald-500">
                                          {formatSignedCurrency(displayYield)}
                                      </p>
                                  </div>
                                  <div className="text-right text-xs text-zinc-500">
                                      <p>{account.lastYieldDate ? new Date(account.lastYieldDate).toLocaleDateString('pt-BR') : 'Sem data'}</p>
                                      {account.lastYieldNote && <p className="text-[11px] text-zinc-400">{account.lastYieldNote}</p>}
                                  </div>
                              </div>
                          </div>
                      </div>
                  )})}
              </div>
          </div>

          {detailAccount && (
              <div className="fixed inset-0 z-[70]">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDetailPanel}></div>
                  <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-[#111114] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col">
                      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
                          <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400 font-semibold">Conta</p>
                              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{detailAccount.name}</h3>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{detailAccount.type || 'Conta'}</p>
                              <p className="text-[11px] text-zinc-400 mt-2">Rendimentos de {monthLabel}</p>
                          </div>
                          <button
                              type="button"
                              onClick={closeDetailPanel}
                              className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                              aria-label="Fechar detalhes"
                          >
                              <X size={18} />
                          </button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                          {accountMonthlyEntries.length === 0 && (
                              <p className="text-sm text-zinc-500">Nenhum rendimento registrado para esta conta no mês selecionado.</p>
                          )}
                          {accountMonthlyEntries.map(entry => (
                              <div key={`${entry.accountId}-${entry.date}-${entry.amount}-${entry.source}`} className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-900/60">
                                  <div className="flex items-center justify-between">
                                      <div>
                                          <div className="flex items-center gap-2">
                                              <span className="inline-flex w-2.5 h-2.5 rounded-full" style={{ background: entry.color || detailAccount.color || getStrokeColor(detailAccount.name) }}></span>
                                              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                  {new Date(`${entry.date}T12:00:00`).toLocaleDateString('pt-BR')}
                                              </p>
                                              {entry.lockedReason === 'epoch_mismatch' && (
                                                  <span className="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                                      Arquivado
                                                  </span>
                                              )}
                                          </div>
                                          {entry.notes && (
                                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{entry.notes}</p>
                                          )}
                                      </div>
                                      <div className="text-right">
                                          <p className="text-sm font-bold text-emerald-500">{formatCurrency(entry.amount)}</p>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}
          
          {yieldModals}

      </main>
    </div>
  );
};

export default YieldsView;
