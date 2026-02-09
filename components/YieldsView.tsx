
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
  Award,
  Home,
  History,
  ChevronDown
} from 'lucide-react';
import { Account } from '../types';
import { yieldsService, YieldRecord } from '../services/yieldsService';
import { AuditLogInput } from '../services/auditService';
import NewYieldModal from './NewYieldModal';
import CompoundInterestCalculatorModal, { CompoundCalculatorDefaults, CompoundCalculatorResult } from './CompoundInterestCalculatorModal';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
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
  const isCompactHeight = useIsCompactHeight();

  useEffect(() => {
      if (isMobile) return;
      const previousBodyOverflow = document.body.style.overflow;
      const previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
          document.body.style.overflow = previousBodyOverflow;
          document.documentElement.style.overflow = previousHtmlOverflow;
      };
  }, [isMobile]);

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

  const todayLabel = new Date().toLocaleDateString('pt-BR');
  const selectedYear = viewDate.getFullYear();
  const selectedMonthIndex = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('pt-BR', { month: 'long' });
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}/${selectedYear}`;
  const currentMonthKey = `${selectedYear}-${selectedMonthIndex}`;
  const previousMonthKey =
      selectedMonthIndex === 0
          ? `${selectedYear - 1}-11`
          : `${selectedYear}-${selectedMonthIndex - 1}`;

  const activeAccountIds = useMemo(
      () => new Set(investmentAccounts.map((account) => account.id)),
      [investmentAccounts]
  );

  const activeYieldEntries = useMemo(
      () => yieldEntries.filter((entry) => activeAccountIds.has(entry.accountId)),
      [yieldEntries, activeAccountIds]
  );

  useEffect(() => {
      console.info('[yields-monthly] month', {
          year: selectedYear,
          monthIndex: selectedMonthIndex,
          monthLabel
      });
  }, [selectedYear, selectedMonthIndex, monthLabel]);

  const monthlyYieldTotalsByAccount = useMemo(() => {
      const totals: Record<string, number> = {};
      activeYieldEntries.forEach(entry => {
          const date = new Date(`${entry.date}T12:00:00`);
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          if (key === currentMonthKey) {
              totals[entry.accountId] = (totals[entry.accountId] || 0) + entry.amount;
          }
      });
      return totals;
  }, [activeYieldEntries, currentMonthKey]);

  interface MonthlySummaryItem {
      account: Account;
      total: number;
      count: number;
      entries: YieldEntry[];
      color: string;
  }

  const monthlySummary = useMemo<MonthlySummaryItem[]>(() => {
      const entriesByAccount = new Map<string, YieldEntry[]>();
      activeYieldEntries.forEach(entry => {
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
  }, [activeYieldEntries, investmentAccounts, selectedYear, selectedMonthIndex]);

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
  const summaryCountLabel = `${monthlyEntriesCount} ${monthlyEntriesCount === 1 ? 'registro' : 'registros'}`;
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

  const closeMonthlyDrawer = () => {
      setDetailAccount(null);
  };

  const monthlyTotalYield = useMemo(() => Object.values(monthlyYieldTotalsByAccount).reduce((sum, value) => sum + value, 0), [monthlyYieldTotalsByAccount]);
  const previousMonthYieldTotal = useMemo(() => {
      let total = 0;
      activeYieldEntries.forEach(entry => {
          const date = new Date(`${entry.date}T12:00:00`);
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          if (key === previousMonthKey) {
              total += entry.amount;
          }
      });
      return total;
  }, [activeYieldEntries, previousMonthKey]);
  const monthlyDelta = monthlyTotalYield - previousMonthYieldTotal;
  const monthlyDeltaPercent = previousMonthYieldTotal > 0 ? (monthlyDelta / previousMonthYieldTotal) * 100 : null;
  const monthlyDeltaText = `${monthlyDelta >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(monthlyDelta))} vs mês anterior`;
  const daysInMonth = useMemo(() => new Date(selectedYear, selectedMonthIndex + 1, 0).getDate(), [selectedYear, selectedMonthIndex]);
  const dailyTotals = useMemo(() => {
      const totals = new Map<number, number>();
      activeYieldEntries.forEach(entry => {
          const date = parseHistoryDate(entry.date);
          if (date.getFullYear() !== selectedYear || date.getMonth() !== selectedMonthIndex) return;
          const day = date.getDate();
          totals.set(day, (totals.get(day) || 0) + entry.amount);
      });
      return totals;
  }, [activeYieldEntries, selectedYear, selectedMonthIndex]);
  const sparklinePoints = useMemo(() => {
      const bucketCount = 12;
      const buckets = Array.from({ length: bucketCount }, () => 0);
      const daysPerBucket = Math.max(Math.ceil(daysInMonth / bucketCount), 1);

      for (let day = 1; day <= daysInMonth; day += 1) {
          const bucketIndex = Math.min(Math.floor((day - 1) / daysPerBucket), bucketCount - 1);
          buckets[bucketIndex] += dailyTotals.get(day) || 0;
      }

      const cumulative: number[] = [];
      buckets.reduce((acc, value, index) => {
          const next = acc + value;
          cumulative[index] = next;
          return next;
      }, 0);

      const max = Math.max(...cumulative, 1);
      return {
          points: cumulative,
          max
      };
  }, [dailyTotals, daysInMonth]);
  const sparklineBars = useMemo(() => {
      const max = sparklinePoints.max || 1;
      return sparklinePoints.points.map(value => value / max);
  }, [sparklinePoints]);
  const isCurrentMonth =
      selectedYear === new Date().getFullYear() && selectedMonthIndex === new Date().getMonth();
  const daysElapsed = isCurrentMonth ? Math.max(new Date().getDate(), 1) : daysInMonth;
  const averageDailyYield = monthlyTotalYield / Math.max(daysElapsed, 1);
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

  const [hiddenLineSeries, setHiddenLineSeries] = useState<string[]>([]);

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
      const isDarkMode = typeof document !== 'undefined'
          ? document.documentElement.classList.contains('dark')
          : true;
      const chartColors = isDarkMode
          ? {
                grid: '#1f1f23',
                gridStrong: '#27272a',
                axis: '#3f3f46',
                label: '#a1a1aa',
                tooltipBg: 'rgba(24,24,27,0.95)',
                tooltipBorder: '#3f3f46',
                tooltipText: '#f4f4f5',
                tooltipSub: '#d4d4d8'
            }
          : {
                grid: '#e5e7eb',
                gridStrong: '#d1d5db',
                axis: '#9ca3af',
                label: '#6b7280',
                tooltipBg: 'rgba(255,255,255,0.98)',
                tooltipBorder: '#e5e7eb',
                tooltipText: '#111827',
                tooltipSub: '#6b7280'
            };

      const chartHeight = 170;
      if (!monthlyLineData.series.length) {
          return (
              <div className="relative h-[170px] flex items-center justify-center text-zinc-500 text-sm">
                  Cadastre rendimentos para visualizar a evolução.
              </div>
          );
      }

      const visibleSeries = monthlyLineData.series.filter(line => !hiddenLineSeries.includes(line.accountId));
      const sourceSeries = visibleSeries.length ? visibleSeries : monthlyLineData.series;
      const hasVisibleData = visibleSeries.some(line => line.points.some(point => point.value !== 0));

      const width = 720;
      const height = chartHeight;
      const paddingX = 64;
      const paddingY = 32;
      const maxValue = sourceSeries.reduce((max, line) => {
          const lineMax = line.points.reduce((linePeak, point) => Math.max(linePeak, point.value), 0);
          return Math.max(max, lineMax);
      }, 0);
      const minValue = sourceSeries.reduce((min, line) => {
          const lineMin = line.points.reduce((lineFloor, point) => Math.min(lineFloor, point.value), 0);
          return Math.min(min, lineMin);
      }, 0);
      const valueRange = maxValue - minValue || 1;
      const dayCount = monthlyLineData.daysInMonth;

      const getX = (day: number) => {
          if (dayCount <= 1) return paddingX;
          return paddingX + ((width - paddingX * 2) * ((day - 1) / (dayCount - 1)));
      };

      const getY = (value: number) => {
          return height - paddingY - ((value - minValue) / valueRange) * (height - paddingY * 2);
      };

      const dayTicks: number[] = Array.from({ length: dayCount }, (_, index) => index + 1);

      const valueTicks: number[] = [];
      for (let i = 0; i <= 4; i += 1) {
          valueTicks.push(minValue + ((maxValue - minValue) * i) / 4);
      }

      return (
          <div className="relative">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                  {dayTicks.map(day => (
                      <line
                          key={`v-${day}`}
                          x1={getX(day)}
                          y1={paddingY}
                          x2={getX(day)}
                          y2={height - paddingY}
                          stroke={chartColors.grid}
                          strokeWidth="1"
                          strokeDasharray="4"
                      />
                  ))}
                  {[0.25, 0.5, 0.75, 1].map(ratio => {
                      const y = paddingY + (height - paddingY * 2) * ratio;
                      return (
                          <line
                              key={ratio}
                              x1={paddingX}
                              y1={y}
                              x2={width - paddingX}
                              y2={y}
                              stroke={chartColors.gridStrong}
                              strokeWidth="1"
                              strokeDasharray="4"
                          />
                      );
                  })}
                  <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke={chartColors.axis} strokeWidth="1.5" />
                  <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke={chartColors.axis} strokeWidth="1.5" />

                  {visibleSeries.map(line => (
                      <polyline
                          key={line.accountId}
                          points={line.points.map(point => `${getX(point.day)},${getY(point.value)}`).join(' ')}
                          fill="none"
                          stroke={line.color}
                          strokeWidth="0.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                      />
                  ))}

                  {visibleSeries.map(line =>
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
                      <text key={day} x={getX(day)} y={height - paddingY + 16} textAnchor="middle" className="text-[10px]" fill={chartColors.label}>
                          {day.toString().padStart(2, '0')}
                      </text>
                  ))}
                  {valueTicks.map((tick, index) => (
                      <text key={index} x={paddingX - 12} y={getY(tick)} textAnchor="end" className="text-[10px]" fill={chartColors.label}>
                          {formatCurrency(tick)}
                      </text>
                  ))}
              </svg>

              {!hasVisibleData && (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm pointer-events-none">
                      Nenhuma linha selecionada.
                  </div>
              )}

              {lineTooltip && (
                  <div
                      className="absolute text-xs px-3 py-2 rounded-xl shadow-2xl"
                      style={{
                          background: chartColors.tooltipBg,
                          borderColor: chartColors.tooltipBorder,
                          borderWidth: 1,
                          left: lineTooltip.x - 60,
                          top: lineTooltip.y - 70
                      }}
                  >
                      <p className="font-semibold" style={{ color: chartColors.tooltipText }}>{lineTooltip.accountName}</p>
                      <p style={{ color: chartColors.tooltipSub }}>Dia {lineTooltip.day.toString().padStart(2, '0')}</p>
                      <p style={{ color: chartColors.tooltipSub }}>Acumulado: {formatCurrency(lineTooltip.value)}</p>
                  </div>
              )}

              <div className="flex flex-wrap justify-center gap-3 mt-2 text-[11px] text-zinc-500">
                  {monthlyLineData.series.map(line => {
                      const isHidden = hiddenLineSeries.includes(line.accountId);
                      return (
                          <button
                              key={line.accountId}
                              type="button"
                              onClick={() => {
                                  setLineTooltip(null);
                                  setHiddenLineSeries(prev =>
                                      prev.includes(line.accountId)
                                          ? prev.filter(id => id !== line.accountId)
                                          : [...prev, line.accountId]
                                  );
                              }}
                              className="flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800/60 bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-200 transition hover:border-zinc-300 dark:hover:border-zinc-600"
                              aria-pressed={!isHidden}
                          >
                              <span
                                  className={`h-5 w-5 rounded-[7px] border ${
                                      isHidden
                                          ? 'border-zinc-400/70 dark:border-zinc-600/70 bg-transparent'
                                          : isDarkMode
                                              ? 'border-white/40'
                                              : 'border-zinc-300'
                                  }`}
                                  style={{ backgroundColor: isHidden ? 'transparent' : line.color }}
                              />
                              {line.accountName}
                          </button>
                      );
                  })}
              </div>
          </div>
      );
  };

  const yieldModals = (
      <>
          {isMobile && (
              <NewYieldModal 
                  isOpen={isModalOpen}
                  onClose={closeYieldModal}
                  onSave={handleSaveYield}
                  accounts={investmentAccounts}
                  licenseId={licenseId}
                  initialData={editingYield}
              />
          )}
          {!isMobile && (
              <NewYieldModal
                  isOpen={isModalOpen}
                  onClose={closeYieldModal}
                  onSave={handleSaveYield}
                  accounts={investmentAccounts}
                  licenseId={licenseId}
                  initialData={editingYield}
                  variant="dock"
              />
          )}

          <CompoundInterestCalculatorModal
              isOpen={isCalculatorOpen}
              onClose={() => setIsCalculatorOpen(false)}
              defaults={calculatorDefaults}
              onResult={handleCalculatorResult}
              variant={isMobile ? 'default' : 'dock'}
          />

          {detailAccount && (
              isMobile ? (
                  <MobileModalShell
                      isOpen={!!detailAccount}
                      onClose={closeMonthlyDrawer}
                      title={`Rendimentos • ${detailAccount.name}`}
                      subtitle="Lançamentos do mês selecionado"
                      modalName="yield_month_entries"
                  >
                      <div className="space-y-3">
                          {accountMonthlyEntries.length === 0 ? (
                              <p className="text-sm text-zinc-500">Nenhum lançamento neste mês.</p>
                          ) : (
                              <div className="space-y-2">
                                  {accountMonthlyEntries.map((entry) => (
                                      <div
                                          key={entry.id}
                                          className="flex items-center justify-between rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#141417]/90 px-4 py-3"
                                      >
                                          <div>
                                              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                  {parseHistoryDate(entry.date).toLocaleDateString('pt-BR')}
                                              </p>
                                              {entry.notes && (
                                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{entry.notes}</p>
                                              )}
                                          </div>
                                          <p className="text-sm font-semibold text-emerald-500">{formatCurrency(entry.amount)}</p>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  </MobileModalShell>
              ) : (
                  <div className="fixed inset-0 z-[1200]">
                      <button
                          type="button"
                          onClick={closeMonthlyDrawer}
                          className="absolute inset-0 bg-black/60"
                          aria-label="Fechar lançamentos"
                      />
                      <div className="absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]">
                          <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                              <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{detailAccount.name}</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Lançamentos do mês selecionado</p>
                              </div>
                              <button
                                  type="button"
                                  onClick={closeMonthlyDrawer}
                                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                                  aria-label="Fechar lançamentos"
                              >
                                  <ChevronDown size={16} />
                              </button>
                          </div>
                          <div className="pt-3 flex-1 overflow-auto">
                              {accountMonthlyEntries.length === 0 ? (
                                  <p className="text-sm text-zinc-500">Nenhum lançamento neste mês.</p>
                              ) : (
                                  <div className="space-y-2">
                                      {accountMonthlyEntries.map((entry) => (
                                          <div
                                              key={entry.id}
                                              className="flex items-center justify-between rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#141417]/90 px-4 py-3"
                                          >
                                              <div className="min-w-0">
                                                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                      {parseHistoryDate(entry.date).toLocaleDateString('pt-BR')}
                                                  </p>
                                                  {entry.notes && (
                                                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{entry.notes}</p>
                                                  )}
                                              </div>
                                              <p className="text-sm font-semibold text-emerald-500">{formatCurrency(entry.amount)}</p>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              )
          )}
          
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
                  <div className="fixed inset-0 z-[1200]">
                      <button
                          type="button"
                          onClick={() => setIsGoalModalOpen(false)}
                          className="absolute inset-0 bg-black/60"
                          aria-label="Fechar meta"
                      />
                      <div className="absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]">
                          <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                              <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">Definir meta de patrimônio</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Ajuste o valor alvo da sua carteira.</p>
                              </div>
                              <button
                                  type="button"
                                  onClick={() => setIsGoalModalOpen(false)}
                                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                                  aria-label="Fechar meta"
                              >
                                  <ChevronDown size={16} />
                              </button>
                          </div>
                          <div className="pt-3 flex-1 overflow-auto">
                              <div className="space-y-2">
                                  <label htmlFor={goalInputIdDesktop} className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                                    Valor alvo (R$)
                                  </label>
                                  <input
                                      id={goalInputIdDesktop}
                                      name="goalAmount"
                                      type="number"
                                      value={goalInput}
                                      onChange={(e) => setGoalInput(e.target.value)}
                                      placeholder="1.000.000,00"
                                      className="w-full bg-white/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Você pode ajustar esta meta sempre que quiser.</p>
                              </div>
                          </div>
                          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 mt-3 pt-3 grid grid-cols-2 gap-2">
                              <button
                                  onClick={() => setIsGoalModalOpen(false)}
                                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
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
                                  className="rounded-lg py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition"
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
    <div className={`min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-6 transition-colors duration-300 ${isCompactHeight ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 relative z-10">
        <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
          <div className="space-y-2">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                aria-label="Voltar para o início"
              >
                <Home size={16} />
              </button>
              <div className="min-w-0 text-center">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Rendimentos</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                  {monthLabel} • {summaryCountLabel}
                </p>
              </div>
              <div className="min-w-[32px]" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Patrimônio</p>
                <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                  {formatCurrency(totalInvested)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Mês</p>
                <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                  {formatCurrency(monthlyTotalYield)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Variação</p>
                <p
                  className={`text-[12px] font-semibold truncate ${
                    monthlyDelta > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : monthlyDelta < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                  title={monthlyDeltaText}
                >
                  {formatCurrency(monthlyDelta)}
                </p>
              </div>
            </div>

            <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {onOpenAudit && (
                <button
                  type="button"
                  onClick={onOpenAudit}
                  className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
                >
                  <History size={14} />
                  Auditoria
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenYieldModal}
                className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
              >
                Novo Rendimento
              </button>
            </div>

          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-3 sm:px-5 mt-[var(--mm-content-gap)] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="yield-density rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 backdrop-blur-xl shadow-sm p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Rendimentos</p>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{monthLabel} • {summaryCountLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                      {goalSavedAt && (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Meta atualizada em {new Date(goalSavedAt).toLocaleDateString('pt-BR')}</span>
                      )}
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-2.5">
                  <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-1.5">
                          <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Patrimônio em aplicações</p>
                              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{formatCurrency(totalInvested)}</h2>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className={`font-semibold ${monthlyDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                      {monthlyDeltaText}
                                      {monthlyDeltaPercent !== null && (
                                          <span className="ml-2 text-[10px]">({monthlyDeltaPercent >= 0 ? '+' : ''}{monthlyDeltaPercent.toFixed(1)}%)</span>
                                      )}
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wide bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full text-zinc-500 dark:text-zinc-400">Baseado nos rendimentos lançados</span>
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{rankingMessage}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                              <Calendar size={12} className="inline-block mr-1" /> {todayLabel}
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1">
                              <p className="uppercase tracking-[0.2em] text-[9px] text-zinc-500 dark:text-zinc-400">Rend. mês</p>
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{formatCurrency(monthlyTotalYield)}</p>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1">
                              <p className="uppercase tracking-[0.2em] text-[9px] text-zinc-500 dark:text-zinc-400">Registros</p>
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{monthlyEntriesCount}</p>
                          </div>
                          <div className="col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1">
                              <p className="uppercase tracking-[0.2em] text-[9px] text-zinc-500 dark:text-zinc-400">Tendência do mês</p>
                              <div className="mt-1 h-5">
                                  <svg viewBox="0 0 120 24" className="w-full h-5">
                                      {sparklineBars.map((ratio, index) => {
                                          const barWidth = 8;
                                          const gap = 2;
                                          const x = index * (barWidth + gap);
                                          const height = Math.max(3, ratio * 20);
                                          const y = 22 - height;
                                          return (
                                              <rect
                                                  key={`bar-${index}`}
                                                  x={x}
                                                  y={y}
                                                  width={barWidth}
                                                  height={height}
                                                  rx={2}
                                                  fill="rgba(99,102,241,0.9)"
                                              />
                                          );
                                      })}
                                  </svg>
                              </div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1">
                              <p className="uppercase tracking-[0.2em] text-[9px] text-zinc-500 dark:text-zinc-400">Média diária</p>
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{formatCurrency(averageDailyYield)}</p>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1">
                              <p className="uppercase tracking-[0.2em] text-[9px] text-zinc-500 dark:text-zinc-400">Top conta</p>
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">{topAccount?.name || '—'}</p>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-1.5">
                          <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Calculadora de Juros Compostos</p>
                              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Simule o crescimento dos seus investimentos</p>
                              <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-indigo-500 mt-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                                  <Target size={12} /> {progressLabel}
                              </span>
                          </div>
                          <button
                              onClick={() => {
                                  setGoalInput(metaGoal.toString());
                                  setIsGoalModalOpen(true);
                              }}
                              className="text-[10px] font-semibold px-2 py-1 rounded-full border border-indigo-500/40 text-indigo-500 hover:bg-indigo-500/10 transition"
                          >
                              Definir meta
                          </button>
                      </div>

                      <div>
                          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-violet-500 transition-all duration-700" style={{ width: `${progressPercent}%` }}></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                              <span>Meta: {formatCurrency(metaGoal)}</span>
                              <span>Proj.: {formatCurrency(projectedAmount)}</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                          <div>
                              <p className="text-[10px] uppercase text-zinc-500 font-semibold">Meta atual</p>
                              <p className="text-sm font-bold text-zinc-900 dark:text-white">{formatCurrency(metaGoal)}</p>
                          </div>
                          <div>
                              <p className="text-[10px] uppercase text-zinc-500 font-semibold">Você já acumulou</p>
                              <p className="text-sm font-bold text-zinc-900 dark:text-white">{formatCurrency(totalInvested)}</p>
                          </div>
                      </div>

                      <div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{calculatorSummaryText}</p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{calculatorSummarySubtext}</p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{projectionText}</p>
                      </div>

                      <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Planeje seus aportes e compare cenários.</span>
                          <button
                              onClick={() => setIsCalculatorOpen(true)}
                              className="px-3 py-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                          >
                              Abrir calculadora
                          </button>
                      </div>
                  </div>
              </div>

              <div className="border-t border-zinc-200/70 dark:border-zinc-800/70 pt-3 space-y-2.5">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                          <div>
                              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Curva de crescimento</h3>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Evolução diária do mês.</p>
                          </div>
                      </div>
                      <div className="w-full">{renderLineChart()}</div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] p-2.5">
                      <div className="flex items-center justify-between">
                          <div>
                              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Resumo do mês</h3>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Total por conta no mês.</p>
                          </div>
                          <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{summaryCountLabel}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                          {investmentAccounts.slice(0, 8).length === 0 && (
                              <p className="col-span-4 text-sm text-zinc-500">Nenhum rendimento registrado no mês selecionado.</p>
                          )}
                          {investmentAccounts.slice(0, 8).map(account => {
                              const displayYield = account.lastYield || 0;
                              const monthYield = monthlyYieldTotalsByAccount[account.id] || 0;
                              const launchCount = monthlySummaryMap.get(account.id)?.count || 0;
                              return (
                                  <button
                                      key={account.id}
                                      type="button"
                                      onClick={() => openMonthlyDrawer(account)}
                                      className="text-left rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] px-2 py-2 hover:shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  >
                                      <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-semibold text-zinc-900 dark:text-white truncate">{account.name}</span>
                                          <span className="text-[9px] text-zinc-500 dark:text-zinc-400">{launchCount} lanç.</span>
                                      </div>
                                      <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-1">{formatCurrency(monthYield)}</p>
                                      <p className="text-[9px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                          Último: <span className={displayYield >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{formatSignedCurrency(displayYield)}</span>
                                      </p>
                                      <div className="mt-1 h-0.5 w-full rounded-full" style={{ backgroundColor: account.color || '#7c3aed' }} />
                                  </button>
                              );
                          })}
                      </div>
                  </div>
              </div>
          </section>
      </main>
      {yieldModals}
    </div>
  );
};

export default YieldsView;
