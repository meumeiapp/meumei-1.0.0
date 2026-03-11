
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
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
import {
  estimateDailyRate,
  loadAccounts,
  loadRecentYieldsByAccount
} from '../services/projectionService';

const MILLION_TARGET_DEFAULT = 1_000_000;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(value))}`;

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const toRgba = (hexColor: string | undefined, alpha: number) => {
  if (!hexColor || !hexColor.startsWith('#')) return `rgba(99,102,241,${alpha})`;
  const normalized = hexColor.slice(1);
  const parse = (value: string) => Number.parseInt(value, 16);
  if (normalized.length === 3) {
      const r = parse(`${normalized[0]}${normalized[0]}`);
      const g = parse(`${normalized[1]}${normalized[1]}`);
      const b = parse(`${normalized[2]}${normalized[2]}`);
      if ([r, g, b].some(Number.isNaN)) return `rgba(99,102,241,${alpha})`;
      return `rgba(${r},${g},${b},${alpha})`;
  }
  if (normalized.length === 6) {
      const r = parse(normalized.slice(0, 2));
      const g = parse(normalized.slice(2, 4));
      const b = parse(normalized.slice(4, 6));
      if ([r, g, b].some(Number.isNaN)) return `rgba(99,102,241,${alpha})`;
      return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(99,102,241,${alpha})`;
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
  onOpenNewAccount?: () => void;
}

const YieldsView: React.FC<YieldsViewProps> = ({ 
  onBack, 
  accounts,
  onUpdateAccounts,
  viewDate,
  licenseId,
  licenseCryptoEpoch,
  onAuditLog,
  onOpenAudit,
  onOpenNewAccount
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingYield, setEditingYield] = useState<{ accountId: string; amount: number; date: string; notes: string } | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const goalInputIdMobile = 'yield-goal-input-mobile';
  const goalInputIdDesktop = 'yield-goal-input-desktop';
  const [targetGoal, setTargetGoal] = useState(MILLION_TARGET_DEFAULT);
  const [firestoreYields, setFirestoreYields] = useState<YieldRecord[]>([]);
  const [lineTooltip, setLineTooltip] = useState<{
      x: number;
      y: number;
      day: number;
      accountName: string;
      value: number;
      color: string;
  } | null>(null);
  const chartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [chartCanvasWidth, setChartCanvasWidth] = useState(0);
  const [chartCanvasHeight, setChartCanvasHeight] = useState(0);
  const [isSummaryDockOpen, setIsSummaryDockOpen] = useState(false);
  const recoveryLoggedRef = useRef(false);
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const projectionHistoryWindowDays = 30;
  const projectionMinRecords = 7;
  const [projectionSelection, setProjectionSelection] = useState<string>('all');
  const selectChangedAccounts = (baseAccounts: Account[], nextAccounts: Account[]) => {
      const baseById = new Map(baseAccounts.map(account => [account.id, account]));
      return nextAccounts.filter(account => {
          const previous = baseById.get(account.id);
          if (!previous) return true;
          const previousBalance = Number(previous.currentBalance || 0);
          const nextBalance = Number(account.currentBalance || 0);
          if (Math.abs(previousBalance - nextBalance) > 0.009) return true;
          const previousYieldCount = Array.isArray(previous.yieldHistory) ? previous.yieldHistory.length : 0;
          const nextYieldCount = Array.isArray(account.yieldHistory) ? account.yieldHistory.length : 0;
          return previousYieldCount !== nextYieldCount;
      });
  };

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

  useEffect(() => {
      if (!isMobile || typeof window === 'undefined') return;
      const handleDockClick = () => {
          setIsModalOpen(false);
          setIsGoalModalOpen(false);
          setEditingYield(null);
      };
      window.addEventListener('mm:mobile-dock-click', handleDockClick);
      return () => window.removeEventListener('mm:mobile-dock-click', handleDockClick);
  }, [isMobile]);

  useEffect(() => {
      if (isMobile) return;
      const node = chartSurfaceRef.current;
      if (!node) return;

      const measure = () => {
          const rect = node.getBoundingClientRect();
          const parentRect = node.parentElement?.getBoundingClientRect();
          const nextWidth = Math.max(Math.floor(parentRect?.width || rect.width), 320);
          const nextHeight = Math.max(Math.floor(rect.height), 280);
          setChartCanvasWidth((prev) => (prev === nextWidth ? prev : nextWidth));
          setChartCanvasHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      };

      measure();
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      observer?.observe(node);
      window.addEventListener('resize', measure);

      return () => {
          observer?.disconnect();
          window.removeEventListener('resize', measure);
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

  useEffect(() => {
      if (!licenseId) {
          setTargetGoal(MILLION_TARGET_DEFAULT);
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
                  console.info('[goals] fallback default', { path, reason: 'missing_doc' });
                  return;
              }
              const data = snap.data() as Record<string, unknown>;
              const goalValue = typeof data.patrimonyGoal === 'number' ? data.patrimonyGoal : MILLION_TARGET_DEFAULT;
              setTargetGoal(goalValue);
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

      const changedAccounts = selectChangedAccounts(accounts, updatedAccounts);
      if (changedAccounts.length) {
          onUpdateAccounts(changedAccounts);
      }
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

  const selectedYear = viewYear;
  const selectedMonthIndex = viewMonth;
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
  const monthlyDeltaText = `${monthlyDelta >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(monthlyDelta))} vs mês anterior`;
  const daysInMonth = useMemo(() => new Date(selectedYear, selectedMonthIndex + 1, 0).getDate(), [selectedYear, selectedMonthIndex]);
  const accountYieldDaysMap = useMemo(() => {
      const map = new Map<string, Map<number, number>>();
      activeYieldEntries.forEach(entry => {
          const date = parseHistoryDate(entry.date);
          if (date.getFullYear() !== selectedYear || date.getMonth() !== selectedMonthIndex) return;
          const day = date.getDate();
          const accountMap = map.get(entry.accountId) ?? new Map<number, number>();
          accountMap.set(day, (accountMap.get(day) || 0) + entry.amount);
          map.set(entry.accountId, accountMap);
      });
      return map;
  }, [activeYieldEntries, selectedMonthIndex, selectedYear]);
  const monthStartOffset = useMemo(() => {
      const firstDay = new Date(selectedYear, selectedMonthIndex, 1).getDay();
      return (firstDay + 6) % 7;
  }, [selectedMonthIndex, selectedYear]);
  const monthlyCalendarCells = useMemo(
      () => [
          ...Array.from({ length: monthStartOffset }, () => null as number | null),
          ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
      ],
      [daysInMonth, monthStartOffset]
  );
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
          // Curva de crescimento não considera quedas por valor negativo neste contexto.
          const dayYield = Math.max(Number(entry.amount) || 0, 0);
          series.values[date.getDate() - 1] += dayYield;
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

      const allDailyValues = Array.from({ length: daysInMonth }, (_, dayIndex) =>
          Array.from(seriesMap.values()).reduce((sum, item) => sum + item.values[dayIndex], 0)
      );
      let runningAll = 0;
      const allPoints: LineSeriesPoint[] = allDailyValues.map((dayYield, index) => {
          runningAll += dayYield;
          return { day: index + 1, value: runningAll };
      });
      const allSeries: LineSeries = {
          accountId: 'all',
          accountName: 'Todos',
          color: '#6366f1',
          points: allPoints
      };

      const maxValue = [...series, allSeries].reduce((max, line) => {
          const lineMax = line.points.reduce((linePeak, point) => Math.max(linePeak, point.value), 0);
          return Math.max(max, lineMax);
      }, 0);

      return {
          daysInMonth,
          series,
          allSeries,
          allDailyValues,
          maxValue
      };
  }, [investmentAccounts, yieldEntries, selectedMonthIndex, selectedYear]);

  useEffect(() => {
      const selectedSeriesList =
          projectionSelection === 'all'
              ? monthlyLineData.series
              : monthlyLineData.series.filter(line => line.accountId === projectionSelection);

      if (!selectedSeriesList.length) {
          console.info('[growthCurve] empty_series', {
              selectedScope: projectionSelection
          });
          return;
      }

      selectedSeriesList.forEach(selectedSeries => {
          const dayYields = selectedSeries.points.map((point, index) => {
              const previous = index > 0 ? selectedSeries.points[index - 1].value : 0;
              return Math.max(Number((point.value - previous).toFixed(2)), 0);
          });
          const decreasingDays: number[] = [];
          selectedSeries.points.forEach((point, index) => {
              if (index === 0) return;
              const previous = selectedSeries.points[index - 1].value;
              if (point.value + 1e-9 < previous) {
                  decreasingDays.push(point.day);
              }
          });
          const finalAccumulated = selectedSeries.points.length
              ? Number((selectedSeries.points[selectedSeries.points.length - 1].value || 0).toFixed(2))
              : 0;
          const minAccumulated = selectedSeries.points.reduce((min, point) => Math.min(min, point.value), 0);

          console.info('[growthCurve] series', {
              selectedScope: projectionSelection,
              accountId: selectedSeries.accountId,
              accountName: selectedSeries.accountName,
              dailyYields: dayYields,
              finalAccumulated,
              minAccumulated: Number(minAccumulated.toFixed(2)),
              monotonicNonDecreasing: decreasingDays.length === 0
          });

          if (decreasingDays.length > 0) {
              console.warn('[growthCurve] decreasing_detected', {
                  selectedScope: projectionSelection,
                  accountId: selectedSeries.accountId,
                  accountName: selectedSeries.accountName,
                  days: decreasingDays
              });
          }
      });
  }, [projectionSelection, monthlyLineData]);

  const projectionAccounts = useMemo(
      () => loadAccounts(investmentAccounts),
      [investmentAccounts]
  );
  const projectionSelectableAccounts = useMemo(
      () => projectionAccounts.slice(0, 3),
      [projectionAccounts]
  );
  const projectionSelectorButtons = useMemo(
      () => [
          ...projectionSelectableAccounts.map(account => ({
              id: account.id,
              label: account.name
          })),
          { id: 'all', label: 'Todos' }
      ],
      [projectionSelectableAccounts]
  );
  const projectionSelectorColorMap = useMemo(() => {
      const map = new Map<string, string>();
      projectionSelectableAccounts.forEach(account => {
          map.set(account.id, account.color || getStrokeColor(account.name));
      });
      map.set('all', '#6366f1');
      return map;
  }, [projectionSelectableAccounts]);

  const projectionAnchorDate = useMemo(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }, [activeYieldEntries.length]);

  const projectionHistoryWindow = useMemo(() => {
      const windowEnd = projectionAnchorDate;
      const windowStart = new Date(windowEnd.getTime());
      windowStart.setDate(windowStart.getDate() - (projectionHistoryWindowDays - 1));
      return {
          windowStart,
          windowEnd
      };
  }, [projectionAnchorDate, projectionHistoryWindowDays]);

  const projectionWindowYields = useMemo(() => {
      return loadRecentYieldsByAccount({
          yields: activeYieldEntries
              .filter(item => Number.isFinite(item.amount) && item.amount > 0)
              .map(item => ({
                  id: item.id,
                  accountId: item.accountId,
                  amount: item.amount,
                  date: item.date,
                  notes: item.notes
              })),
          accountIds: projectionAccounts.map(account => account.id),
          windowStart: projectionHistoryWindow.windowStart,
          windowEnd: projectionHistoryWindow.windowEnd
      });
  }, [activeYieldEntries, projectionAccounts, projectionHistoryWindow]);

  const projectionRateEstimates = useMemo(() => {
      return projectionAccounts.map(account => estimateDailyRate({
          account,
          yields: projectionWindowYields.byAccount.get(account.id) ?? []
      }));
  }, [projectionAccounts, projectionWindowYields.byAccount]);

  const projectionDaysRemainingInMonth = useMemo(() => {
      const monthEnd = new Date(
          projectionAnchorDate.getFullYear(),
          projectionAnchorDate.getMonth() + 1,
          0,
          12,
          0,
          0,
          0
      );
      const diffMs = monthEnd.getTime() - projectionAnchorDate.getTime();
      return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1, 1);
  }, [projectionAnchorDate]);

  const projectionRateMap = useMemo(() => {
      const map = new Map<string, { recordCount: number; dailyRate: number }>();
      projectionRateEstimates.forEach(item => {
          map.set(item.accountId, {
              recordCount: item.recordCount,
              dailyRate: item.dailyRate
          });
      });
      return map;
  }, [projectionRateEstimates]);

  type ProjectionAccountEstimate = {
      accountId: string;
      accountName: string;
      hasBase: boolean;
      balance: number;
      dailyRate: number;
      recordCount: number;
      estimatedDailyYield: number;
      estimatedPeriodYield: number;
  };

  const projectionAccountEstimates = useMemo<ProjectionAccountEstimate[]>(() => {
      return projectionAccounts.map(account => {
          const item = projectionRateMap.get(account.id);
          const hasBase = Boolean(item && item.recordCount >= projectionMinRecords);
          const balance = Math.max(account.currentBalance, 0);
          const dailyRate = item?.dailyRate || 0;
          const estimatedDailyYield = hasBase ? balance * dailyRate : 0;
          const estimatedPeriodYield = estimatedDailyYield * projectionDaysRemainingInMonth;
          return {
              accountId: account.id,
              accountName: account.name,
              hasBase,
              balance,
              dailyRate,
              recordCount: item?.recordCount || 0,
              estimatedDailyYield: Number(estimatedDailyYield.toFixed(2)),
              estimatedPeriodYield: Number(estimatedPeriodYield.toFixed(2))
          };
      });
  }, [projectionAccounts, projectionRateMap, projectionMinRecords, projectionDaysRemainingInMonth]);

  useEffect(() => {
      if (projectionSelection === 'all') return;
      const existsInSelector = projectionSelectableAccounts.some(account => account.id === projectionSelection);
      if (!existsInSelector) {
          setProjectionSelection('all');
      }
  }, [projectionSelection, projectionSelectableAccounts]);

  const projectionEligibleEstimates = useMemo(
      () => projectionAccountEstimates.filter(item => item.hasBase),
      [projectionAccountEstimates]
  );

  const projectionEstimatedValue = useMemo(
      () => Number(projectionEligibleEstimates.reduce((sum, item) => sum + item.estimatedPeriodYield, 0).toFixed(2)),
      [projectionEligibleEstimates]
  );

  type ProjectionEmptyReason =
      | 'no_accounts'
      | 'insufficient_records'
      | 'zero_yield'
      | null;

  const projectionEmptyReason: ProjectionEmptyReason = useMemo(() => {
      if (!projectionAccounts.length) return 'no_accounts';
      if (!projectionEligibleEstimates.length) return 'insufficient_records';
      if (projectionEstimatedValue <= 0) return 'zero_yield';
      return null;
  }, [
      projectionAccounts.length,
      projectionEligibleEstimates.length,
      projectionEstimatedValue
  ]);

  const projectionAccountSummaryText = useMemo(() => {
      const parts = projectionAccountEstimates.map(item => {
          if (!item.hasBase) {
              return `${item.accountName}: sem base`;
          }
          return `${item.accountName}: ${formatCurrency(item.estimatedPeriodYield)}`;
      });
      const visible = parts.slice(0, 3);
      const hiddenCount = Math.max(parts.length - visible.length, 0);
      if (!visible.length) return '';
      return hiddenCount > 0 ? `${visible.join(' | ')} | +${hiddenCount} contas` : visible.join(' | ');
  }, [projectionAccountEstimates]);

  const projectionSelectedEstimate = useMemo(() => {
      if (projectionSelection === 'all') return projectionEstimatedValue;
      const selected = projectionAccountEstimates.find(item => item.accountId === projectionSelection);
      if (!selected || !selected.hasBase) return 0;
      return selected.estimatedPeriodYield;
  }, [projectionSelection, projectionEstimatedValue, projectionAccountEstimates]);

  const projectionDisplayEmptyReason: ProjectionEmptyReason = useMemo(() => {
      if (projectionSelection === 'all') return projectionEmptyReason;
      if (!projectionAccounts.length) return 'no_accounts';
      return null;
  }, [projectionEmptyReason, projectionSelection, projectionAccounts.length]);

  const projectionDisplaySummaryText = useMemo(() => {
      if (projectionSelection === 'all') return projectionAccountSummaryText;
      const selected = projectionAccountEstimates.find(item => item.accountId === projectionSelection);
      if (!selected) return '';
      if (!selected.hasBase) return `${selected.accountName}: ${formatCurrency(0)}`;
      return `${selected.accountName}: ${formatCurrency(selected.estimatedPeriodYield)}`;
  }, [projectionSelection, projectionAccountSummaryText, projectionAccountEstimates]);

  useEffect(() => {
      console.info('[projection] accounts_loaded', {
          count: projectionAccounts.length,
          accounts: projectionAccounts.map(account => ({
              id: account.id,
              name: account.name,
              baseBalance: account.currentBalance
          }))
      });
  }, [projectionAccounts]);

  useEffect(() => {
      console.info('[projection] yields_window', {
          windowStart: formatDateInput(projectionHistoryWindow.windowStart),
          windowEnd: formatDateInput(projectionHistoryWindow.windowEnd),
          totalRecords: projectionWindowYields.totalRecords,
          perAccount: projectionAccounts.map(account => ({
              accountId: account.id,
              accountName: account.name,
              records: (projectionWindowYields.byAccount.get(account.id) || []).length
          }))
      });
  }, [projectionHistoryWindow, projectionWindowYields, projectionAccounts]);

  useEffect(() => {
      projectionRateEstimates.forEach(item => {
          console.info('[projection] rate_estimate', {
              accountId: item.accountId,
              accountName: item.accountName,
              preClampDailyRate: item.dailyRateRaw,
              postClampDailyRate: item.dailyRate,
              recordCount: item.recordCount,
              daysWithYield: item.daysWithYield,
              clampedMin: item.clampedMin,
              clampedMax: item.clampedMax
          });
          if (item.clampedMax) {
              console.warn('[projection] rate_clamped_max', {
                  accountId: item.accountId,
                  accountName: item.accountName,
                  value: item.dailyRateRaw,
                  clampedTo: item.dailyRate
              });
          }
      });
  }, [projectionRateEstimates]);

  useEffect(() => {
      if (projectionDisplayEmptyReason) {
          console.info('[projection] empty_state', {
              reason: projectionDisplayEmptyReason,
              totalRecords: projectionWindowYields.totalRecords,
              daysRemainingInMonth: projectionDaysRemainingInMonth,
              estimatedValue: projectionEstimatedValue,
              selectedScope: projectionSelection
          });
          return;
      }
      console.info('[projection] estimation_summary', {
          daysRemainingInMonth: projectionDaysRemainingInMonth,
          estimatedValue: projectionEstimatedValue,
          displayedEstimatedValue: projectionSelectedEstimate,
          selectedScope: projectionSelection,
          perAccount: projectionAccountEstimates.map(item => ({
              accountId: item.accountId,
              accountName: item.accountName,
              balance: item.balance,
              dailyRate: item.dailyRate,
              estimatedDailyYield: item.estimatedDailyYield,
              estimatedPeriodYield: item.estimatedPeriodYield,
              hasBase: item.hasBase
          }))
      });
  }, [
      projectionDisplayEmptyReason,
      projectionWindowYields.totalRecords,
      projectionDaysRemainingInMonth,
      projectionEstimatedValue,
      projectionSelectedEstimate,
      projectionSelection,
      projectionAccountEstimates
  ]);

  const metaGoal = targetGoal || MILLION_TARGET_DEFAULT;
  const projectedAmount = calculatorSummary?.finalAmount ?? totalInvested;
  const progressPercent = Math.min((projectedAmount / metaGoal) * 100, 100);
  const progressLabel = `${progressPercent.toFixed(1)}% da meta`;
  const remainingToGoal = Math.max(metaGoal - totalInvested, 0);
  const monthsToGoal = monthlyTotalYield > 0 ? Math.ceil(remainingToGoal / monthlyTotalYield) : null;
  const calculatorProjectionText = calculatorSummary
      ? `${formatCurrency(projectedAmount)} em ${formatTimeline(calculatorSummary.periodMonths)}`
      : 'Sem simulação recente';
  const paceProjectionText = monthsToGoal
      ? `No ritmo atual, meta em ${formatTimeline(monthsToGoal)}.`
      : 'Sem ritmo suficiente para projetar prazo.';

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
  const handleOpenNewAccountFromSummary = () => {
      if (onOpenNewAccount) {
          onOpenNewAccount();
          return;
      }
      onBack();
  };
  const weekLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  const summarySlotCount = 4;
  const hasSummaryOverflow = investmentAccounts.length > summarySlotCount;
  const visibleSummaryAccounts = hasSummaryOverflow
      ? investmentAccounts.slice(0, summarySlotCount - 1)
      : investmentAccounts.slice(0, summarySlotCount);
  const hiddenSummaryAccounts = hasSummaryOverflow
      ? investmentAccounts.slice(summarySlotCount - 1)
      : [];
  const missingSummarySlots = hasSummaryOverflow
      ? 0
      : Math.max(summarySlotCount - visibleSummaryAccounts.length, 0);
  const summaryGridColumns = summarySlotCount;

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
                tooltipSub: '#d4d4d8',
                rightRulerBg: 'rgba(24,24,27,0.88)',
                rightRulerBorder: 'rgba(161,161,170,0.45)',
                rightRulerText: '#e4e4e7'
            }
          : {
                grid: '#e5e7eb',
                gridStrong: '#d1d5db',
                axis: '#9ca3af',
                label: '#6b7280',
                tooltipBg: 'rgba(255,255,255,0.98)',
                tooltipBorder: '#e5e7eb',
                tooltipText: '#111827',
                tooltipSub: '#6b7280',
                rightRulerBg: 'rgba(255,255,255,0.94)',
                rightRulerBorder: 'rgba(113,113,122,0.3)',
                rightRulerText: '#27272a'
            };

      const chartHeight = chartCanvasHeight > 0 ? Math.max(220, chartCanvasHeight - 8) : 258;
      const width = chartCanvasWidth > 0 ? chartCanvasWidth : 860;
      const height = chartHeight;
      const paddingLeft = 86;
      const paddingRight = 144;
      const paddingTop = 24;
      const paddingBottom = 44;
      const dayCount = monthlyLineData.daysInMonth;
      const dayTicks: number[] = Array.from({ length: dayCount }, (_, index) => index + 1);
      const dayLabelStep = dayCount > 24 ? 2 : 1;
      const dayLabelTicks = dayTicks.filter(day => day === 1 || day === dayCount || day % dayLabelStep === 0);

      if (!monthlyLineData.series.length) {
          return (
              <div ref={chartSurfaceRef} className="relative h-full min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
                  Cadastre rendimentos para visualizar a evolução.
              </div>
          );
      }

      const visibleSeries = projectionSelection === 'all'
          ? monthlyLineData.series
          : monthlyLineData.series.filter(line => line.accountId === projectionSelection);
      const sourceSeries = visibleSeries.length
          ? visibleSeries
          : monthlyLineData.series;
      const lineTotals = visibleSeries.map(line => ({
          key: line.accountId,
          value: line.points[line.points.length - 1]?.value ?? 0,
          color: line.color
      }));
      const allVisibleTotal = lineTotals.reduce((sum, line) => sum + line.value, 0);
      const hasVisibleData = visibleSeries.some(line => line.points.some(point => point.value !== 0));
      const seriesMaxValue = sourceSeries.reduce((max, line) => {
          const lineMax = line.points.reduce((linePeak, point) => Math.max(linePeak, point.value), 0);
          return Math.max(max, lineMax);
      }, 0);
      const axisRawMax = Math.max(seriesMaxValue, allVisibleTotal, 0);
      const buildYieldAxisScale = (rawMax: number) => {
          const baseMax = 50;
          if (rawMax <= baseMax) {
              return {
                  min: 0,
                  max: baseMax,
                  ticks: [0, 10, 20, 30, 40, 50]
              };
          }

          const desiredIntervals = 5;
          const roughStep = rawMax / desiredIntervals;
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1e-6))));
          const multipliers = [1, 2, 2.5, 5, 10];
          const stepMultiplier =
              multipliers.find(multiplier => roughStep <= multiplier * magnitude) ?? 10;
          const step = stepMultiplier * magnitude;
          const max = Math.ceil(rawMax / step) * step;
          const tickCount = Math.max(2, Math.round(max / step) + 1);
          const ticks = Array.from({ length: tickCount }, (_, index) =>
              Number((index * step).toFixed(6))
          );
          return {
              min: 0,
              max,
              ticks
          };
      };
      const axisScale = buildYieldAxisScale(axisRawMax);
      const minValue = axisScale.min;
      const maxValue = axisScale.max;
      const valueRange = maxValue - minValue || 1;
      const plotWidth = Math.max(width - paddingLeft - paddingRight, 1);
      const plotHeight = Math.max(height - paddingTop - paddingBottom, 1);
      const rightRulerX = width - paddingRight;
      const formatAxisValue = (value: number) =>
          Math.abs(value) >= 100
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
              : formatCurrency(value);

      const getX = (day: number) => {
          if (dayCount <= 1) return paddingLeft;
          return paddingLeft + (plotWidth * (day - 1)) / (dayCount - 1);
      };

      const getY = (value: number) => {
          return paddingTop + (1 - (value - minValue) / valueRange) * plotHeight;
      };

      const valueTicks: number[] = axisScale.ticks;

      const tooltipWidth = 190;
      const tooltipLeft = lineTooltip ? Math.min(Math.max(lineTooltip.x + 12, 8), width - tooltipWidth - 8) : 0;
      const tooltipTop = lineTooltip ? Math.min(Math.max(lineTooltip.y - 72, 8), height - 74) : 0;
      const rightRulerEntriesBase = projectionSelection === 'all'
          ? [{ key: 'total-geral', value: allVisibleTotal, color: '#a1a1aa', y: getY(allVisibleTotal) }]
          : lineTotals.map(line => ({ key: `total-${line.key}`, value: line.value, color: line.color, y: getY(line.value) }));
      const rightRulerEntries = [...rightRulerEntriesBase]
          .sort((a, b) => a.y - b.y)
          .map(entry => ({ ...entry, yAdjusted: entry.y }));
      const minRightRulerGap = 18;
      const minRightRulerY = paddingTop + 8;
      const maxRightRulerY = height - paddingBottom - 8;
      for (let index = 0; index < rightRulerEntries.length; index += 1) {
          if (index === 0) {
              rightRulerEntries[index].yAdjusted = Math.max(rightRulerEntries[index].yAdjusted, minRightRulerY);
              continue;
          }
          const previous = rightRulerEntries[index - 1];
          const current = rightRulerEntries[index];
          current.yAdjusted = Math.max(current.yAdjusted, previous.yAdjusted + minRightRulerGap);
      }
      for (let index = rightRulerEntries.length - 1; index >= 0; index -= 1) {
          if (index === rightRulerEntries.length - 1) {
              rightRulerEntries[index].yAdjusted = Math.min(rightRulerEntries[index].yAdjusted, maxRightRulerY);
              continue;
          }
          const next = rightRulerEntries[index + 1];
          const current = rightRulerEntries[index];
          current.yAdjusted = Math.min(current.yAdjusted, next.yAdjusted - minRightRulerGap);
          current.yAdjusted = Math.max(current.yAdjusted, minRightRulerY);
      }
      const shouldShowYieldPointLabels = projectionSelection !== 'all' && visibleSeries.length === 1;
      const yieldPointLabels = (() => {
          if (!shouldShowYieldPointLabels) return [] as Array<{
              day: number;
              x: number;
              y: number;
              label: string;
              bubbleX: number;
              bubbleY: number;
              bubbleWidth: number;
              bubbleHeight: number;
          }>;
          const series = visibleSeries[0];
          const placed: Array<{
              day: number;
              x: number;
              y: number;
              label: string;
              bubbleX: number;
              bubbleY: number;
              bubbleWidth: number;
              bubbleHeight: number;
          }> = [];
          const minBubbleGap = 4;
          const topLimit = paddingTop + 2;
          const bottomLimit = height - paddingBottom - 2;

          series.points.forEach((point, index) => {
              const previous = index > 0 ? series.points[index - 1].value : 0;
              const yielded = Math.max(Number((point.value - previous).toFixed(2)), 0);
              if (yielded <= 0) return;

              const label = formatCurrency(yielded);
              const x = getX(point.day);
              const y = getY(point.value);
              const bubbleHeight = 16;
              const approxCharWidth = 5.2;
              const bubbleWidth = Math.max(76, label.length * approxCharWidth + 12);
              const bubbleX = Math.min(
                  Math.max(x - bubbleWidth / 2, paddingLeft + 2),
                  width - paddingRight - bubbleWidth - 2
              );

              let bubbleY = y - bubbleHeight - 8;
              if (bubbleY < topLimit) {
                  bubbleY = y + 8;
              }

              let safety = 0;
              while (safety < 16) {
                  const hasOverlap = placed.some(existing => {
                      const horizontalOverlap =
                          bubbleX < existing.bubbleX + existing.bubbleWidth + minBubbleGap &&
                          bubbleX + bubbleWidth + minBubbleGap > existing.bubbleX;
                      const verticalOverlap =
                          bubbleY < existing.bubbleY + existing.bubbleHeight + minBubbleGap &&
                          bubbleY + bubbleHeight + minBubbleGap > existing.bubbleY;
                      return horizontalOverlap && verticalOverlap;
                  });
                  if (!hasOverlap) break;

                  if (bubbleY >= y) {
                      bubbleY += bubbleHeight + minBubbleGap;
                      if (bubbleY + bubbleHeight > bottomLimit) {
                          bubbleY = y - bubbleHeight - 8;
                      }
                  } else {
                      bubbleY -= bubbleHeight + minBubbleGap;
                      if (bubbleY < topLimit) {
                          bubbleY = y + 8;
                      }
                  }
                  safety += 1;
              }

              bubbleY = Math.min(Math.max(bubbleY, topLimit), bottomLimit - bubbleHeight);
              placed.push({
                  day: point.day,
                  x,
                  y,
                  label,
                  bubbleX,
                  bubbleY,
                  bubbleWidth,
                  bubbleHeight
              });
          });

          return placed;
      })();

      return (
          <div ref={chartSurfaceRef} className="relative w-full h-full min-h-[220px]">
              <svg width={width} height={height} className="block w-full">
                  {dayTicks.map(day => (
                      <line
                          key={`v-${day}`}
                          x1={getX(day)}
                          y1={paddingTop}
                          x2={getX(day)}
                          y2={height - paddingBottom}
                          stroke={chartColors.grid}
                          strokeWidth="1"
                          strokeDasharray="4 6"
                      />
                  ))}
                  {valueTicks.map((tick, index) => (
                      <line
                          key={`h-${index}`}
                          x1={paddingLeft}
                          y1={getY(tick)}
                          x2={rightRulerX}
                          y2={getY(tick)}
                          stroke={index === 0 ? chartColors.gridStrong : chartColors.grid}
                          strokeWidth={index === 0 ? '1.4' : '1'}
                          strokeDasharray={index === 0 ? undefined : '4 6'}
                      />
                  ))}
                  <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke={chartColors.axis} strokeWidth="1.3" />
                  <line x1={paddingLeft} y1={height - paddingBottom} x2={rightRulerX} y2={height - paddingBottom} stroke={chartColors.axis} strokeWidth="1.3" />
                  <line x1={rightRulerX} y1={paddingTop} x2={rightRulerX} y2={height - paddingBottom} stroke={chartColors.axis} strokeWidth="1.3" />
                  <text
                      x={rightRulerX + 10}
                      y={paddingTop - 8}
                      textAnchor="start"
                      style={{ fontSize: '10px', fontWeight: 700, fill: chartColors.label }}
                  >
                      Total
                  </text>

                  {visibleSeries.map(line => (
                      <polyline
                          key={line.accountId}
                          points={line.points.map(point => `${getX(point.day)},${getY(point.value)}`).join(' ')}
                          fill="none"
                          stroke={line.color}
                          strokeWidth="2.4"
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
                                  r={2.8}
                                  fill={line.color}
                                  opacity={point.day === dayCount ? 1 : 0.92}
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

                  {yieldPointLabels.map(item => (
                      <g key={`yield-point-label-${item.day}`}>
                          <line
                              x1={item.x}
                              y1={item.y}
                              x2={item.bubbleX + item.bubbleWidth / 2}
                              y2={item.bubbleY + item.bubbleHeight / 2}
                              stroke={chartColors.tooltipBorder}
                              strokeWidth="1"
                              strokeDasharray="2 2"
                          />
                          <rect
                              x={item.bubbleX}
                              y={item.bubbleY}
                              width={item.bubbleWidth}
                              height={item.bubbleHeight}
                              rx="6"
                              fill={chartColors.tooltipBg}
                              stroke={chartColors.tooltipBorder}
                              strokeWidth="1"
                          />
                          <text
                              x={item.bubbleX + item.bubbleWidth / 2}
                              y={item.bubbleY + item.bubbleHeight / 2 + 3}
                              textAnchor="middle"
                              style={{ fontSize: '9px', fontWeight: 700, fill: chartColors.tooltipText }}
                          >
                              {item.label}
                          </text>
                      </g>
                  ))}

                  {rightRulerEntries.map(entry => {
                      const valueLabel = formatCurrency(entry.value);
                      const dotX = rightRulerX + 8;
                      const textX = dotX + 9;
                      const maxBubbleWidth = width - textX - 6;
                      const approxCharWidth = 5.3;
                      const desiredBubbleWidth = Math.max(78, valueLabel.length * approxCharWidth + 12);
                      const bubbleWidth = Math.min(desiredBubbleWidth, Math.max(maxBubbleWidth, 78));
                      const bubbleHeight = 16;
                      const bubbleY = Math.max(Math.min(entry.yAdjusted - bubbleHeight / 2, maxRightRulerY - bubbleHeight / 2), minRightRulerY - bubbleHeight / 2);
                      const bubbleCenterY = bubbleY + bubbleHeight / 2;
                      return (
                          <g key={`yield-right-ruler-total-${entry.key}`}>
                              <line
                                  x1={rightRulerX}
                                  y1={entry.y}
                                  x2={dotX}
                                  y2={entry.y}
                                  stroke={entry.color}
                                  strokeWidth="1"
                                  strokeOpacity="0.8"
                              />
                              {Math.abs(bubbleCenterY - entry.y) > 1 && (
                                  <line
                                      x1={dotX}
                                      y1={entry.y}
                                      x2={textX}
                                      y2={bubbleCenterY}
                                      stroke={chartColors.rightRulerBorder}
                                      strokeWidth="1"
                                      strokeDasharray="2 2"
                                  />
                              )}
                              <circle cx={dotX} cy={entry.y} r={3} fill={entry.color} />
                              <rect
                                  x={textX}
                                  y={bubbleY}
                                  width={bubbleWidth}
                                  height={bubbleHeight}
                                  rx="6"
                                  fill={chartColors.rightRulerBg}
                                  stroke={chartColors.rightRulerBorder}
                                  strokeWidth="1"
                              />
                              <text
                                  x={textX + 6}
                                  y={bubbleY + bubbleHeight / 2 + 3}
                                  textAnchor="start"
                                  style={{ fontSize: '9px', fontWeight: 700, fill: chartColors.rightRulerText }}
                              >
                                  {valueLabel}
                              </text>
                          </g>
                      );
                  })}

                  {dayLabelTicks.map(day => (
                      <text
                          key={`label-${day}`}
                          x={getX(day)}
                          y={height - paddingBottom + 24}
                          textAnchor="middle"
                          style={{ fontSize: '11px', fill: chartColors.label }}
                      >
                          {day.toString().padStart(2, '0')}
                      </text>
                  ))}
                  {valueTicks.map((tick, index) => (
                      <text
                          key={`tick-${index}`}
                          x={paddingLeft - 12}
                          y={getY(tick) + 4}
                          textAnchor="end"
                          style={{ fontSize: '11px', fill: chartColors.label }}
                      >
                          {formatAxisValue(tick)}
                      </text>
                  ))}
              </svg>

              {!hasVisibleData && (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm pointer-events-none">
                      Sem rendimentos no período.
                  </div>
              )}

              {lineTooltip && (
                  <div
                      className="absolute text-xs px-3 py-2 rounded-xl shadow-2xl pointer-events-none"
                      style={{
                          background: chartColors.tooltipBg,
                          borderColor: chartColors.tooltipBorder,
                          borderWidth: 1,
                          left: tooltipLeft,
                          top: tooltipTop,
                          width: tooltipWidth
                      }}
                  >
                      <p className="font-semibold" style={{ color: chartColors.tooltipText }}>{lineTooltip.accountName}</p>
                      <p style={{ color: chartColors.tooltipSub }}>Dia {lineTooltip.day.toString().padStart(2, '0')}</p>
                      <p style={{ color: chartColors.tooltipSub }}>Acumulado: {formatCurrency(lineTooltip.value)}</p>
                  </div>
              )}
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

  const blockLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400';
  const blockValueClass = 'text-[12px] font-semibold text-zinc-900 dark:text-white';
  const topBlockTitleClass = 'text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400';
  const blockMetaClass = 'text-[10px] font-semibold text-zinc-300';
  const calculatorActionButtonClass =
      'inline-flex items-center justify-center h-8 w-[136px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold shadow-lg shadow-indigo-900/20 transition';

  return (
    <div className="min-h-full mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-6 relative z-10">
        <div
            className="mm-subheader w-full rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4"
            data-tour-anchor="yields-summary"
        >
          <div className="space-y-2">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />
              <div className="min-w-0 text-center">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Rendimentos</p>
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

            <div className="flex flex-wrap items-center justify-center gap-2">
              {onOpenAudit && (
                <button
                  type="button"
                  onClick={onOpenAudit}
                  className="mm-btn-base mm-btn-secondary mm-btn-secondary-indigo min-w-[168px] px-6"
                >
                  <History size={14} />
                  Auditoria
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenYieldModal}
                className={`${isMobile ? 'w-full' : 'inline-flex min-w-[220px] px-8'} mm-btn-base mm-btn-primary mm-btn-primary-indigo`}
              >
                Novo Rendimento
              </button>
            </div>

          </div>
        </div>
      </div>
      <main
          className="max-w-7xl mx-auto w-full px-3 sm:px-5 mt-[var(--mm-content-gap)] animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 min-h-0"
      >
          <section className="yield-density rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 backdrop-blur-xl shadow-sm p-3 gap-3 flex flex-col">
              <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-2">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-1.5 min-h-[78px] flex flex-col justify-center">
                      <p className={topBlockTitleClass}>Patrimônio em aplicações</p>
                      <div className="relative mt-0.5">
                          <span className={`absolute left-0 top-0 ${blockLabelClass}`}>R$</span>
                          <h2 className="pl-6 text-xl font-bold leading-tight text-zinc-900 dark:text-white">
                              {formatCurrency(totalInvested).replace('R$', '').trim()}
                          </h2>
                      </div>
                  </div>

                  <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-1.5 space-y-1 min-h-[78px]">
                      <button
                          onClick={() => {
                              setGoalInput(metaGoal.toString());
                              setIsGoalModalOpen(true);
                          }}
                          className={`absolute top-1 right-1 ${calculatorActionButtonClass}`}
                      >
                          Definir meta
                      </button>
                      <div className="flex items-center justify-between gap-2 pr-[146px]">
                          <p className={topBlockTitleClass}>Calculadora de Juros Compostos</p>
                          <span className="text-[10px] font-semibold text-indigo-500 whitespace-nowrap">{progressLabel}</span>
                      </div>

                      <div>
                          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-violet-500 transition-all duration-700" style={{ width: `${progressPercent}%` }}></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-medium text-zinc-500 mt-1">
                              <span>Meta estipulada: {formatCurrency(metaGoal)}</span>
                              <span>Restante: {formatCurrency(remainingToGoal)}</span>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 min-h-[52px] flex flex-col justify-center">
                      <p className={blockLabelClass}>Média diária</p>
                      <p className={blockValueClass}>{formatCurrency(averageDailyYield)}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 min-h-[52px] flex flex-col justify-center">
                      <p className={blockLabelClass}>Top conta</p>
                      <p className={`${blockValueClass} truncate`}>{topAccount?.name || '—'}</p>
                  </div>
                  <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 min-h-[52px] flex flex-col justify-center">
                      <button
                          onClick={() => setIsCalculatorOpen(true)}
                          className={`absolute top-1 right-1 ${calculatorActionButtonClass}`}
                      >
                          Abrir calculadora
                      </button>
                      <p className={`${blockLabelClass} pr-[146px]`}>Última simulação</p>
                      <p className={`${blockValueClass} truncate pr-[146px]`} title={paceProjectionText}>
                          {calculatorProjectionText}
                      </p>
                  </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#1a1a1a] px-3 py-3.5 min-h-[368px]">
                  <div className="relative flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                          <span className={`${blockMetaClass} whitespace-nowrap`}>{monthLabel} • {summaryCountLabel}</span>
                          <span className={`text-[10px] font-semibold whitespace-nowrap ${monthlyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {monthlyDeltaText}
                          </span>
                      </div>
                      <h3 className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-white">Resumo do mês</h3>
                      <div className="text-right shrink-0">
                          <p className={blockLabelClass}>Total do mês</p>
                          <p className="text-sm font-semibold text-emerald-400">{formatCurrency(monthlyTotalYield)}</p>
                      </div>
                  </div>
                  <div
                      className="mt-3 grid gap-3 max-w-[1560px] mx-auto"
                      style={{ gridTemplateColumns: `repeat(${summaryGridColumns}, minmax(0, 1fr))` }}
                  >
                      {visibleSummaryAccounts.map(account => {
                              const displayYield = account.lastYield || 0;
                              const monthYield = monthlyYieldTotalsByAccount[account.id] || 0;
                              const launchCount = monthlySummaryMap.get(account.id)?.count || 0;
                              const accent = account.color || getStrokeColor(account.name);
                              const dayTotals = accountYieldDaysMap.get(account.id);
                              return (
                                  <div key={account.id} className="h-[276px] flex flex-col">
                                      <div className="mb-1.5 px-0.5 flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                              <p className="text-[11px] font-bold text-white truncate">{account.name}</p>
                                              <p className="text-sm font-semibold text-white">{formatCurrency(monthYield)}</p>
                                              <p className="text-[10px] text-zinc-400">
                                                  Último: <span className={displayYield >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatSignedCurrency(displayYield)}</span>
                                              </p>
                                          </div>
                                          <span className="text-[11px] font-bold text-white shrink-0">{launchCount}</span>
                                      </div>
                                      <article className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] px-1.5 py-1.5 flex-1 min-h-0 h-full">
                                          <div className="grid h-full grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-0.5">
                                              {weekLabels.map(label => (
                                                  <span key={`${account.id}-w-${label}`} className="text-[8px] font-semibold text-center text-zinc-500 leading-none">
                                                      {label.slice(0, 1)}
                                                  </span>
                                              ))}
                                              {monthlyCalendarCells.map((day, index) => {
                                                  if (!day) {
                                                      return <span key={`${account.id}-empty-${index}`} className="rounded-md" />;
                                                  }
                                                  const amount = dayTotals?.get(day) || 0;
                                                  const hasYield = amount > 0;
                                                  return (
                                                      <span
                                                          key={`${account.id}-day-${day}`}
                                                          title={hasYield ? `Dia ${String(day).padStart(2, '0')}: ${formatCurrency(amount)}` : `Dia ${String(day).padStart(2, '0')}`}
                                                          className={`rounded-md border flex items-center justify-center text-[9px] font-semibold min-h-0 ${
                                                              hasYield
                                                                  ? 'text-white'
                                                                  : 'border-zinc-700 text-zinc-500'
                                                          }`}
                                                          style={
                                                              hasYield
                                                                  ? {
                                                                        borderColor: toRgba(accent, 0.7),
                                                                        backgroundColor: toRgba(accent, 0.28)
                                                                    }
                                                                  : undefined
                                                          }
                                                      >
                                                          {day}
                                                      </span>
                                                  );
                                              })}
                                          </div>
                                      </article>
                                  </div>
                              );
                      })}

                      {hasSummaryOverflow && (
                          <button
                              type="button"
                              onClick={() => setIsSummaryDockOpen(true)}
                              className="relative rounded-lg border border-dashed border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/55 transition min-h-[276px] flex items-center justify-center"
                              aria-label="Abrir contas adicionais no dock"
                          >
                              <span className="text-3xl font-bold text-white/90">+</span>
                              <span className="absolute top-2 right-2 text-[11px] font-bold text-white">+{hiddenSummaryAccounts.length}</span>
                              <span className="absolute bottom-2 text-[10px] text-zinc-300">Abrir no dock</span>
                          </button>
                      )}

                      {!hasSummaryOverflow && visibleSummaryAccounts.length === 0 && (
                          <button
                              type="button"
                              onClick={handleOpenNewAccountFromSummary}
                              className="relative rounded-lg border border-dashed border-zinc-500 bg-zinc-900/30 hover:bg-zinc-900/45 transition min-h-[276px] flex items-center justify-center col-span-4"
                              aria-label="Adicionar conta"
                          >
                              <div className="flex flex-col items-center gap-2">
                                  <span className="text-3xl font-bold text-white/90">+</span>
                                  <span className="text-[11px] font-semibold text-zinc-200">Adicionar conta</span>
                              </div>
                          </button>
                      )}

                      {!hasSummaryOverflow && visibleSummaryAccounts.length > 0 && Array.from({ length: missingSummarySlots }).map((_, index) => (
                          <button
                              key={`summary-add-${index}`}
                              type="button"
                              onClick={handleOpenNewAccountFromSummary}
                              className="relative rounded-lg border border-dashed border-zinc-500 bg-zinc-900/30 hover:bg-zinc-900/45 transition min-h-[276px] flex items-center justify-center"
                              aria-label="Adicionar conta"
                          >
                              <div className="flex flex-col items-center gap-2">
                                  <span className="text-3xl font-bold text-white/90">+</span>
                                  <span className="text-[11px] font-semibold text-zinc-200">Adicionar conta</span>
                              </div>
                          </button>
                      ))}
                  </div>
              </div>

              <div className="mt-2 flex flex-col lg:flex-row gap-2">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] px-3 pt-3 pb-4 flex flex-col min-h-0 lg:flex-1 lg:min-w-0">
                      <div className="relative flex items-center justify-between mb-1.5">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Evolução diária acumulada no mês.</p>
                          <h3 className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-white">Curva de crescimento</h3>
                          <div className="text-right">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Média diária</p>
                              <p className="text-sm font-semibold text-white">{formatCurrency(averageDailyYield)}</p>
                          </div>
                      </div>
                      <div className="flex-1 min-h-0">{renderLineChart()}</div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] px-2.5 pt-3 pb-3 flex flex-col min-h-0 lg:flex-none lg:w-[220px]">
                      <h3 className="text-base font-bold text-white text-center">Contas</h3>
                      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
                          {projectionSelectorButtons.map(option => {
                              const isActive = projectionSelection === option.id;
                              const selectorColor = projectionSelectorColorMap.get(option.id) || '#6366f1';
                              return (
                                  <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => setProjectionSelection(option.id)}
                                      className="h-9 rounded-lg border px-2 text-[11px] font-semibold truncate transition"
                                      style={{
                                          borderColor: isActive ? toRgba(selectorColor, 0.9) : toRgba(selectorColor, 0.45),
                                          backgroundColor: isActive ? toRgba(selectorColor, 0.82) : toRgba(selectorColor, 0.16),
                                          color: '#fff',
                                          boxShadow: isActive ? `0 0 0 1px ${toRgba(selectorColor, 0.35)} inset` : undefined
                                      }}
                                      title={option.label}
                                  >
                                      {option.label}
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1a1a1a] px-3 pt-3 pb-4 flex flex-col min-h-0 lg:flex-none lg:w-fit lg:min-w-[430px]">
                      <div className="mb-2">
                          <h3 className="text-base font-bold text-white text-center">Quanto deve render</h3>
                      </div>
                      {projectionDisplayEmptyReason ? (
                          <div className="flex-1 min-h-[200px] rounded-xl border border-dashed border-zinc-300/70 dark:border-zinc-700/70 flex flex-col items-center justify-center px-4">
                              <span className="inline-grid">
                                  <span className="invisible col-start-1 row-start-1 text-[44px] leading-none font-black whitespace-nowrap">R$ 580.000.752,00</span>
                                  <span className="col-start-1 row-start-1 text-[44px] leading-none font-black text-zinc-500 dark:text-zinc-400 whitespace-nowrap">—</span>
                              </span>
                              <p className="mt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-center whitespace-nowrap">
                                  Sem rendimento.
                              </p>
                          </div>
                      ) : (
                          <div className="flex-1 flex flex-col justify-center">
                              <div className="text-center py-2">
                                  <span className="inline-grid">
                                      <span className="invisible col-start-1 row-start-1 text-[44px] leading-none font-black whitespace-nowrap">R$ 580.000.752,00</span>
                                      <span className="col-start-1 row-start-1 text-[44px] leading-none font-black text-emerald-400 whitespace-nowrap">{formatCurrency(projectionSelectedEstimate)}</span>
                                  </span>
                                  <p className="mt-2 text-sm font-medium text-zinc-400">Se continuar como nos últimos dias</p>
                              </div>
                              <p className="text-center text-sm font-semibold text-zinc-300">Até o fim do mês</p>
                              {projectionDisplaySummaryText && (
                                  <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[420px] mx-auto">
                                      {projectionDisplaySummaryText}
                                  </p>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </section>
      </main>
      {isSummaryDockOpen && (
          <div className="fixed inset-0 z-[1200]">
              <button
                  type="button"
                  onClick={() => setIsSummaryDockOpen(false)}
                  className="absolute inset-0 bg-black/65"
                  aria-label="Fechar contas adicionais"
              />
              <div className="absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 w-[min(1180px,calc(100%-32px))] rounded-[24px] border border-black/10 dark:border-white/20 bg-white/90 dark:bg-[#121214]/95 backdrop-blur-2xl shadow-[0_10px_24px_rgba(0,0,0,0.35)] p-4">
                  <div className="flex items-center justify-between mb-3">
                      <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">Contas adicionais</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Itens além do limite de 4 cards no resumo</p>
                      </div>
                      <button
                          type="button"
                          onClick={() => setIsSummaryDockOpen(false)}
                          className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                          aria-label="Fechar contas adicionais"
                      >
                          <ChevronDown size={16} />
                      </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {hiddenSummaryAccounts.map(account => {
                          const displayYield = account.lastYield || 0;
                          const monthYield = monthlyYieldTotalsByAccount[account.id] || 0;
                          const launchCount = monthlySummaryMap.get(account.id)?.count || 0;
                          const accent = account.color || getStrokeColor(account.name);
                          const dayTotals = accountYieldDaysMap.get(account.id);
                          return (
                              <article
                                  key={`dock-${account.id}`}
                                  className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] px-2.5 py-2 min-h-[106px]"
                              >
                                  <span className="absolute top-1.5 right-2 text-[11px] font-bold text-white">{launchCount}</span>
                                  <div className="flex items-start justify-between gap-2 h-full">
                                      <div className="min-w-0 flex-1 pr-2">
                                          <p className="text-[10px] font-bold text-white truncate">{account.name}</p>
                                          <p className="text-xs font-semibold text-white mt-1">{formatCurrency(monthYield)}</p>
                                          <p className="text-[9px] text-zinc-400 mt-1">
                                              Último: <span className={displayYield >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatSignedCurrency(displayYield)}</span>
                                          </p>
                                      </div>
                                      <div className="w-[148px] shrink-0">
                                          <div className="grid grid-cols-7 gap-0.5">
                                              {weekLabels.map(label => (
                                                  <span key={`dock-${account.id}-w-${label}`} className="text-[7px] text-center text-zinc-500">
                                                      {label.slice(0, 1)}
                                                  </span>
                                              ))}
                                              {monthlyCalendarCells.map((day, index) => {
                                                  if (!day) {
                                                      return <span key={`dock-${account.id}-empty-${index}`} className="h-3.5 rounded" />;
                                                  }
                                                  const amount = dayTotals?.get(day) || 0;
                                                  const hasYield = amount > 0;
                                                  return (
                                                      <span
                                                          key={`dock-${account.id}-day-${day}`}
                                                          className={`h-3.5 rounded border flex items-center justify-center text-[7px] font-semibold ${
                                                              hasYield
                                                                  ? 'text-white'
                                                                  : 'border-zinc-700 text-zinc-500'
                                                          }`}
                                                          style={
                                                              hasYield
                                                                  ? {
                                                                        borderColor: toRgba(accent, 0.7),
                                                                        backgroundColor: toRgba(accent, 0.28)
                                                                    }
                                                                  : undefined
                                                          }
                                                      >
                                                          {day}
                                                      </span>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  </div>
                              </article>
                          );
                      })}
                  </div>
              </div>
          </div>
      )}
      {yieldModals}
    </div>
  );
};

export default YieldsView;
