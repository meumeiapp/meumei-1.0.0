import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  KeyRound,
  Copy,
  Users,
  ShieldCheck,
  Wallet,
  RefreshCw,
  MessageSquare,
  Check,
  CheckCheck,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { betaKeysService, type BetaKeyRecord, type AdminEntitlementPlan } from '../services/betaKeysService';
import { masterMetricsService, type MasterMetrics } from '../services/masterMetricsService';
import { masterEntitlementsService, type EntitlementRecord } from '../services/masterEntitlementsService';
import { masterFeedbackService, type UserFeedbackRecord } from '../services/masterFeedbackService';

type MasterControlPanelProps = {
  onBack: () => void;
  initialMode?: PanelModeId | null;
  onInitialModeHandled?: () => void;
};

type PanelModeId = 'entitlements' | 'rollback' | 'search' | 'audit' | 'beta' | 'feedback';
type GrowthScope = 'monthly' | 'annual';
type GrowthSeriesPoint = {
  periodKey: string;
  label: string;
  newUsers: number;
  cumulativeUsers: number;
};

const formatCurrency = (valueCents?: number | null) => {
  if (valueCents === null || valueCents === undefined) return '—';
  const value = valueCents / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDate = (value?: number | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const formatCount = (value: number) => value.toLocaleString('pt-BR');

const getEntitlementBadge = (entry: EntitlementRecord) => {
  const planType = String(entry.planType || '').trim().toLowerCase();
  const hasExplicitPlan = Boolean(planType);
  const expiresAtMs = entry.subscriptionCurrentPeriodEndMs ?? entry.expiresAtMs ?? null;
  if (planType === 'lifetime' || (!hasExplicitPlan && entry.lifetime)) {
    return { label: 'Vitalício', tone: 'lifetime' as const };
  }
  if (planType === 'annual') {
    return { label: 'Anual', tone: 'annual' as const };
  }
  if (planType === 'monthly') {
    return { label: 'Mensal', tone: 'monthly' as const };
  }
  if (planType === 'custom_days' || planType === 'days') {
    const manualDays =
      typeof entry.manualPlanDays === 'number' && Number.isFinite(entry.manualPlanDays)
        ? Math.max(0, Math.floor(entry.manualPlanDays))
        : null;
    const daysFromExpiry =
      expiresAtMs && expiresAtMs > Date.now()
        ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000)))
        : 0;
    const daysValue = manualDays ?? daysFromExpiry;
    return { label: `${daysValue} dia(s)`, tone: 'days' as const };
  }
  return null;
};

const PLAN_LABELS: Record<AdminEntitlementPlan, string> = {
  lifetime: 'vitalício',
  annual: 'anual',
  monthly: 'mensal',
  days: 'dias personalizados'
};

const MasterControlPanel: React.FC<MasterControlPanelProps> = ({
  onBack: _onBack,
  initialMode = null,
  onInitialModeHandled
}) => {
  const [metrics, setMetrics] = useState<MasterMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState('');

  const [betaKeys, setBetaKeys] = useState<BetaKeyRecord[]>([]);
  const [betaListLoading, setBetaListLoading] = useState(false);
  const [betaListError, setBetaListError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [lifetimeEmailByKey, setLifetimeEmailByKey] = useState<Record<string, string>>({});
  const [planByKey, setPlanByKey] = useState<Record<string, AdminEntitlementPlan>>({});
  const [daysByKey, setDaysByKey] = useState<Record<string, string>>({});
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [manualPlanEmail, setManualPlanEmail] = useState('');
  const [manualPlanType, setManualPlanType] = useState<AdminEntitlementPlan>('lifetime');
  const [manualPlanDays, setManualPlanDays] = useState('30');
  const [manualPlanBusy, setManualPlanBusy] = useState(false);
  const [manualPlanPreview, setManualPlanPreview] = useState<{
    matchedBetaKeys: number;
    betaKeyIds: string[];
    planType: string;
    expiresAtMs?: number | null;
  } | null>(null);
  const [manualPlanPreviewBusy, setManualPlanPreviewBusy] = useState(false);

  const [bulkAction, setBulkAction] = useState<'assign_plan' | 'revoke_access'>('assign_plan');
  const [bulkPlanType, setBulkPlanType] = useState<AdminEntitlementPlan>('lifetime');
  const [bulkPlanDays, setBulkPlanDays] = useState('30');
  const [bulkEmailsRaw, setBulkEmailsRaw] = useState('');
  const [bulkPreviewBusy, setBulkPreviewBusy] = useState(false);
  const [bulkApplyBusy, setBulkApplyBusy] = useState(false);
  const [bulkPreviewResult, setBulkPreviewResult] = useState<{
    total: number;
    successCount: number;
    failCount: number;
    totalMatchedBetaKeys: number;
    results: Array<Record<string, unknown>>;
  } | null>(null);
  const [bulkApplyResult, setBulkApplyResult] = useState<{
    batchId?: string | null;
    total: number;
    successCount: number;
    failCount: number;
    totalDeletedBetaKeys: number;
  } | null>(null);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditItems, setAuditItems] = useState<Array<Record<string, unknown>>>([]);
  const [localAuditItems, setLocalAuditItems] = useState<Array<Record<string, unknown>>>([]);
  const [auditFilterEmail, setAuditFilterEmail] = useState('');
  const [auditError, setAuditError] = useState('');

  const [rollbackEmail, setRollbackEmail] = useState('');
  const [rollbackBusy, setRollbackBusy] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    users: Array<Record<string, unknown>>;
    entitlements: Array<Record<string, unknown>>;
    betaKeys: Array<Record<string, unknown>>;
    audit: Array<Record<string, unknown>>;
  } | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<UserFeedbackRecord[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackActionBusyId, setFeedbackActionBusyId] = useState<string | null>(null);
  const [feedbackQuery, setFeedbackQuery] = useState('');
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<'all' | 'bug' | 'improvement'>('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<
    'all' | 'new' | 'reviewed' | 'resolved'
  >('all');
  const [betaCreateStatus, setBetaCreateStatus] = useState<
    'idle' | 'loading' | 'success' | 'error' | 'info'
  >('idle');
  const [betaCreateMessage, setBetaCreateMessage] = useState('');
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState('');
  const [selectedEntitlementEmails, setSelectedEntitlementEmails] = useState<string[]>([]);
  const [selectedBatchAction, setSelectedBatchAction] = useState<'assign_plan' | 'revoke_access'>('assign_plan');
  const [selectedBatchPlanType, setSelectedBatchPlanType] = useState<AdminEntitlementPlan>('annual');
  const [selectedBatchPlanDays, setSelectedBatchPlanDays] = useState('30');
  const [selectedBatchBusy, setSelectedBatchBusy] = useState(false);
  const [activeMode, setActiveMode] = useState<PanelModeId | null>(null);
  const [growthScope, setGrowthScope] = useState<GrowthScope>('monthly');

  const actionButtonBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition h-10 w-full sm:w-48 whitespace-nowrap';
  const summarySectionClass =
    'mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4';

  const stats = useMemo(() => {
    return [
      { label: 'Vendas (Stripe)', value: metrics ? metrics.totalSales : '—', icon: <Wallet size={14} /> },
      { label: 'Receita estimada', value: formatCurrency(metrics?.revenueEstimateCents ?? null), icon: <BarChart3 size={14} /> },
      { label: 'Empresas', value: metrics ? metrics.companies : '—', icon: <Users size={14} /> },
      { label: 'Usuários ativos (mês)', value: metrics ? metrics.activeUsersThisMonth : '—', icon: <Users size={14} /> },
      { label: 'Entitlements ativos', value: metrics ? metrics.entitlementsActive : '—', icon: <ShieldCheck size={14} /> },
      { label: 'Entitlements expirados', value: metrics ? metrics.entitlementsExpired : '—', icon: <ShieldCheck size={14} /> },
      { label: 'Chaves beta criadas', value: metrics ? metrics.betaKeysCreated : '—', icon: <KeyRound size={14} /> },
      { label: 'Chaves beta usadas', value: metrics ? metrics.betaKeysUsed : '—', icon: <KeyRound size={14} /> }
    ];
  }, [metrics]);

  const growthSeries = useMemo<GrowthSeriesPoint[]>(() => {
    const source =
      growthScope === 'monthly' ? metrics?.userGrowthMonthly ?? [] : metrics?.userGrowthAnnual ?? [];
    if (!Array.isArray(source)) return [];
    return source
      .map((item) => ({
        periodKey: String(item.periodKey || ''),
        label: String(item.label || ''),
        newUsers: Math.max(0, Number(item.newUsers || 0)),
        cumulativeUsers: Math.max(0, Number(item.cumulativeUsers || 0))
      }))
      .filter((item) => item.periodKey && item.label);
  }, [growthScope, metrics]);

  const growthSeriesTotals = useMemo(() => {
    const totalNewUsers = growthSeries.reduce((sum, item) => sum + item.newUsers, 0);
    const latest = growthSeries.length > 0 ? growthSeries[growthSeries.length - 1] : null;
    return {
      totalNewUsers,
      latest
    };
  }, [growthSeries]);

  const growthSelectedKey =
    growthScope === 'monthly' ? metrics?.growthCurrentMonthKey || '' : metrics?.growthCurrentYearKey || '';

  const growthChartData = useMemo(() => {
    if (growthSeries.length === 0) return null;
    const width = 980;
    const height = 240;
    const padLeft = 46;
    const padRight = 26;
    const padTop = 20;
    const padBottom = 42;
    const innerWidth = Math.max(1, width - padLeft - padRight);
    const innerHeight = Math.max(1, height - padTop - padBottom);
    const maxNewUsers = Math.max(1, ...growthSeries.map((item) => item.newUsers));
    const maxCumulativeUsers = Math.max(1, ...growthSeries.map((item) => item.cumulativeUsers));
    const points = growthSeries.map((item, index) => {
      const x =
        growthSeries.length === 1
          ? padLeft + innerWidth / 2
          : padLeft + (innerWidth * index) / (growthSeries.length - 1);
      const yNew = padTop + innerHeight - (item.newUsers / maxNewUsers) * innerHeight;
      const yCumulative =
        padTop + innerHeight - (item.cumulativeUsers / maxCumulativeUsers) * innerHeight;
      return {
        ...item,
        index,
        x,
        yNew,
        yCumulative
      };
    });
    const toPath = (key: 'yNew' | 'yCumulative') =>
      points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point[key].toFixed(2)}`)
        .join(' ');
    const fillPath =
      points.length > 0
        ? `${toPath('yNew')} L ${points[points.length - 1].x.toFixed(2)},${(padTop + innerHeight).toFixed(2)} L ${points[0].x.toFixed(2)},${(padTop + innerHeight).toFixed(2)} Z`
        : '';
    const selectedIndexRaw = points.findIndex((point) => point.periodKey === growthSelectedKey);
    const selectedIndex = selectedIndexRaw >= 0 ? selectedIndexRaw : points.length - 1;
    const yGuides = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      ratio,
      y: padTop + innerHeight - ratio * innerHeight
    }));
    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerHeight,
      maxNewUsers,
      maxCumulativeUsers,
      points,
      selectedIndex,
      yGuides,
      newPath: toPath('yNew'),
      cumulativePath: toPath('yCumulative'),
      fillPath
    };
  }, [growthSelectedKey, growthSeries]);

  const activeLifetimeEntitlementEmails = useMemo(() => {
    const emails = new Set<string>();
    entitlements.forEach((entry) => {
      const planType = String(entry.planType || '').toLowerCase();
      const status = String(entry.status || '').toLowerCase();
      const isActive = status === '' || status === 'active';
      const isLifetime = planType === 'lifetime' || (!planType && Boolean(entry.lifetime));
      const email = String(entry.email || '').trim().toLowerCase();
      if (isActive && isLifetime && email) {
        emails.add(email);
      }
    });
    return emails;
  }, [entitlements]);

  const betaKeysVisible = useMemo(() => {
    return betaKeys.filter((key) => {
      const lifetimeEmail = String(key.lifetimeGrantedEmail || '')
        .trim()
        .toLowerCase();
      if (!lifetimeEmail) return true;
      return !activeLifetimeEntitlementEmails.has(lifetimeEmail);
    });
  }, [betaKeys, activeLifetimeEntitlementEmails]);

  const betaKeysHiddenByLifetime = Math.max(0, betaKeys.length - betaKeysVisible.length);
  const entitlementEmails = useMemo(() => {
    return Array.from(
      new Set(
        entitlements
          .map((entry) => String(entry.email || '').trim().toLowerCase())
          .filter((email) => email.includes('@') && email.includes('.'))
      )
    );
  }, [entitlements]);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError('');
    try {
      const result = await masterMetricsService.getMetrics();
      if (!result.ok || !result.metrics) {
        setMetricsError(result.message || 'Não foi possível carregar métricas.');
        setMetrics(null);
        return;
      }
      setMetrics(result.metrics);
    } catch (error) {
      setMetricsError('Não foi possível carregar métricas.');
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadBetaKeys = async () => {
    setBetaListLoading(true);
    setBetaListError('');
    try {
      const result = await betaKeysService.listBetaKeys();
      if (!result.ok) {
        setBetaListError(result.message || 'Não foi possível carregar as chaves.');
        setBetaKeys([]);
        return;
      }
      setBetaKeys(result.data?.keys || []);
    } catch (error) {
      setBetaListError('Não foi possível carregar as chaves.');
      setBetaKeys([]);
    } finally {
      setBetaListLoading(false);
    }
  };

  const loadEntitlements = async () => {
    setEntitlementsLoading(true);
    setEntitlementsError('');
    try {
      const result = await masterEntitlementsService.listEntitlements();
      if (!result.ok) {
        setEntitlementsError(result.message || 'Não foi possível carregar acessos.');
        setEntitlements([]);
        return;
      }
      setEntitlements(result.entitlements || []);
    } catch (error) {
      setEntitlementsError('Não foi possível carregar acessos.');
      setEntitlements([]);
    } finally {
      setEntitlementsLoading(false);
    }
  };

  const loadAudit = async (email?: string) => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const result = await betaKeysService.listEntitlementAdminAudit({
        email: email?.trim() || undefined,
        limit: 60
      });
      if (!result.ok) {
        setAuditError(result.message || 'Auditoria remota indisponível. Exibindo registros locais.');
        const local = email
          ? localAuditItems.filter(
              (item) =>
                String(item.targetEmail || '')
                  .trim()
                  .toLowerCase() === email.trim().toLowerCase()
            )
          : localAuditItems;
        setAuditItems(local);
        return;
      }
      const remote = Array.isArray(result.data?.items) ? result.data?.items : [];
      const merged = [...remote, ...localAuditItems].slice(0, 80);
      setAuditItems(merged);
    } catch {
      setAuditError('Auditoria remota indisponível. Exibindo registros locais.');
      const local = email
        ? localAuditItems.filter(
            (item) =>
              String(item.targetEmail || '')
                .trim()
                .toLowerCase() === email.trim().toLowerCase()
          )
        : localAuditItems;
      setAuditItems(local);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadFeedback = async (params?: {
    query?: string;
    type?: 'all' | 'bug' | 'improvement';
    status?: 'all' | 'new' | 'reviewed' | 'resolved';
  }) => {
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      const result = await masterFeedbackService.listUserFeedback({
        limit: 120,
        query: params?.query ?? feedbackQuery,
        type: params?.type ?? feedbackTypeFilter,
        status: params?.status ?? feedbackStatusFilter
      });
      if (!result.ok) {
        setFeedbackItems([]);
        setFeedbackError(result.message || 'Não foi possível carregar feedbacks.');
        return;
      }
      setFeedbackItems(result.items || []);
    } catch (error) {
      setFeedbackItems([]);
      setFeedbackError('Não foi possível carregar feedbacks.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleFeedbackStatusChange = async (
    item: UserFeedbackRecord,
    status: 'new' | 'reviewed' | 'resolved'
  ) => {
    const busyId = `${item.userId}:${item.id}`;
    setFeedbackActionBusyId(busyId);
    try {
      const result = await masterFeedbackService.updateUserFeedbackStatus({
        userId: item.userId,
        feedbackId: item.id,
        status
      });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível atualizar o status.');
        return;
      }
      setBetaCreateStatus('success');
      setBetaCreateMessage(
        status === 'reviewed'
          ? 'Mensagem marcada como lida.'
          : status === 'resolved'
          ? 'Mensagem marcada como resolvida.'
          : 'Mensagem marcada como nova.'
      );
      await loadFeedback();
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível atualizar o status.');
    } finally {
      setFeedbackActionBusyId(null);
    }
  };

  const handleDeleteUserFeedback = async (item: UserFeedbackRecord) => {
    const confirmed = window.confirm('Deseja excluir esta mensagem de feedback?');
    if (!confirmed) return;

    const busyId = `${item.userId}:${item.id}`;
    setFeedbackActionBusyId(busyId);
    try {
      const result = await masterFeedbackService.deleteUserFeedback({
        userId: item.userId,
        feedbackId: item.id
      });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível excluir a mensagem.');
        return;
      }
      setBetaCreateStatus('success');
      setBetaCreateMessage('Mensagem excluída.');
      await loadFeedback();
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível excluir a mensagem.');
    } finally {
      setFeedbackActionBusyId(null);
    }
  };

  useEffect(() => {
    void loadMetrics();
    void loadBetaKeys();
    void loadEntitlements();
    void loadAudit();
    void loadFeedback();
  }, []);

  useEffect(() => {
    if (!initialMode) return;
    setActiveMode(initialMode);
    onInitialModeHandled?.();
  }, [initialMode, onInitialModeHandled]);

  useEffect(() => {
    if (entitlementEmails.length === 0) {
      setSelectedEntitlementEmails([]);
      return;
    }
    const allowed = new Set(entitlementEmails);
    setSelectedEntitlementEmails((prev) => prev.filter((email) => allowed.has(email)));
  }, [entitlementEmails]);

  useEffect(() => {
    if (!activeMode) return;
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMode(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscClose);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscClose);
    };
  }, [activeMode]);

  const handleRevokeBetaKey = async (keyId: string) => {
    setBetaCreateStatus('loading');
    setBetaCreateMessage('');
    try {
      const result = await betaKeysService.revokeBetaKey({ keyId });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível revogar a chave.');
        return;
      }
      setBetaCreateStatus('success');
      setBetaCreateMessage('Chave revogada.');
      await loadBetaKeys();
    } catch (error) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível revogar a chave.');
    }
  };

  const handleDeleteBetaKey = async (keyId: string, confirmed = false) => {
    if (!confirmed) {
      setPendingDeleteId(keyId);
      return;
    }
    setPendingDeleteId(null);
    setBetaCreateStatus('loading');
    setBetaCreateMessage('');
    try {
      const result = await betaKeysService.deleteBetaKey({ keyId });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível excluir a chave.');
        return;
      }
      setBetaCreateStatus('success');
      setBetaCreateMessage('Chave excluída.');
      await Promise.all([loadBetaKeys(), loadEntitlements(), loadMetrics()]);
    } catch (error) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível excluir a chave.');
    }
  };

  const handleCopyBetaKey = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setBetaCreateStatus('success');
      setBetaCreateMessage('Chave copiada.');
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível copiar. Copie manualmente.');
    }
  };

  const handleCopyEmail = async (email: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
      setBetaCreateStatus('success');
      setBetaCreateMessage(`E-mail copiado: ${normalized}`);
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível copiar o e-mail.');
    }
  };

  const handleExecuteSelectedEntitlementBatch = async () => {
    if (selectedEntitlementEmails.length === 0) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Selecione ao menos um e-mail para executar em massa.');
      return;
    }
    const payload: {
      action: 'assign_plan' | 'revoke_access';
      emails: string[];
      dryRun: boolean;
      plan?: AdminEntitlementPlan;
      durationDays?: number;
    } = {
      action: selectedBatchAction,
      emails: selectedEntitlementEmails,
      dryRun: false
    };
    if (selectedBatchAction === 'assign_plan') {
      payload.plan = selectedBatchPlanType;
      if (selectedBatchPlanType === 'days') {
        const parsedDays = parseDaysValue(selectedBatchPlanDays);
        if (!parsedDays) {
          setBetaCreateStatus('error');
          setBetaCreateMessage('Informe uma quantidade válida de dias para executar em massa.');
          return;
        }
        payload.durationDays = parsedDays;
      }
    }

    setSelectedBatchBusy(true);
    try {
      const result = await betaKeysService.bulkManageEntitlements(payload);
      if (!result.ok || !result.data) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível executar a ação em massa.');
        return;
      }
      setLocalAuditItems((prev) => [
        {
          id: String(result.data.batchId || `local-list-bulk-${Date.now()}`),
          actionType: selectedBatchAction === 'assign_plan' ? 'bulk_assign_plan' : 'bulk_revoke_access',
          targetEmail: 'batch',
          actorEmail: 'local_admin',
          requestedPlan: selectedBatchAction === 'assign_plan' ? selectedBatchPlanType : null,
          cleanupSummary: {
            matchedBetaKeys: Number(result.data.totalMatchedBetaKeys || 0),
            deletedBetaKeys: Number(result.data.totalDeletedBetaKeys || 0)
          },
          createdAtMs: Date.now()
        },
        ...prev
      ]);
      setSelectedEntitlementEmails([]);
      setBetaCreateStatus('success');
      setBetaCreateMessage(
        `Ação em massa concluída: ${result.data.successCount || 0}/${result.data.total || 0} processados. ${result.data.totalDeletedBetaKeys || 0} chave(s) beta removida(s).`
      );
      await Promise.all([loadBetaKeys(), loadEntitlements(), loadMetrics(), loadAudit()]);
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível executar a ação em massa.');
    } finally {
      setSelectedBatchBusy(false);
    }
  };

  const parseDaysValue = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  };

  const applyEntitlementPlan = async (params: {
    email: string;
    plan: AdminEntitlementPlan;
    daysText?: string;
    key?: BetaKeyRecord;
  }) => {
    const { email, plan, daysText, key } = params;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe um e-mail válido.');
      return false;
    }

    let durationDays: number | undefined;
    if (plan === 'days') {
      const parsedDays = parseDaysValue(daysText || '');
      if (!parsedDays) {
        setBetaCreateStatus('error');
        setBetaCreateMessage('Informe uma quantidade válida de dias.');
        return false;
      }
      durationDays = parsedDays;
    }

    setBetaCreateStatus('loading');
    setBetaCreateMessage('');
    const result = await betaKeysService.assignEntitlementPlan({
      email: normalizedEmail,
      plan,
      durationDays,
      keyId: key?.id,
      code: key?.code
    });

    if (!result.ok) {
      setBetaCreateStatus('error');
      setBetaCreateMessage(result.message || 'Não foi possível atualizar o plano.');
      return false;
    }

    const deletedBetaKeys = Number(result.data?.deletedBetaKeys || 0);
    const matchedBetaKeys = Number(result.data?.matchedBetaKeys || 0);
    const planLabel = plan === 'days' ? `${durationDays} dias` : PLAN_LABELS[plan];
    const cleanupLabel =
      deletedBetaKeys > 0
        ? `${deletedBetaKeys} chave(s) beta removida(s) de ${matchedBetaKeys || deletedBetaKeys} encontrada(s).`
        : 'Nenhuma chave beta vinculada foi encontrada para limpeza.';
    const lifetimeEmailLabel =
      plan === 'lifetime' && result.data?.emailSent === false
        ? ' Acesso atualizado, mas o e-mail de confirmação não pôde ser enviado.'
        : '';
    setBetaCreateStatus('success');
    setBetaCreateMessage(`Plano ${planLabel} aplicado para ${normalizedEmail}. ${cleanupLabel}${lifetimeEmailLabel}`);
    setLocalAuditItems((prev) => [
      {
        id: String(result.data?.auditId || `local-${Date.now()}`),
        actionType: 'assign_plan',
        targetEmail: normalizedEmail,
        actorEmail: 'local_admin',
        requestedPlan: plan === 'days' ? 'custom_days' : plan,
        cleanupSummary: {
          matchedBetaKeys,
          deletedBetaKeys
        },
        createdAtMs: Date.now()
      },
      ...prev
    ]);
    setManualPlanPreview(null);
    await Promise.all([loadBetaKeys(), loadEntitlements(), loadMetrics(), loadAudit()]);
    return true;
  };

  const handleApplyPlanForKey = async (key: BetaKeyRecord) => {
    const emailCandidate =
      lifetimeEmailByKey[key.id] || key.lifetimeGrantedEmail || key.requestedEmail || '';
    const plan = planByKey[key.id] || 'lifetime';
    setPlanBusyId(key.id);
    try {
      const ok = await applyEntitlementPlan({
        email: emailCandidate,
        plan,
        daysText: daysByKey[key.id] || String(key.durationDays || 30),
        key
      });
      if (ok) {
        setLifetimeEmailByKey((prev) => ({ ...prev, [key.id]: '' }));
        setPlanByKey((prev) => ({ ...prev, [key.id]: 'lifetime' }));
        setDaysByKey((prev) => ({ ...prev, [key.id]: '' }));
      }
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível atualizar o plano.');
    } finally {
      setPlanBusyId(null);
    }
  };

  const handleApplyManualPlan = async () => {
    setManualPlanBusy(true);
    try {
      const ok = await applyEntitlementPlan({
        email: manualPlanEmail,
        plan: manualPlanType,
        daysText: manualPlanDays
      });
      if (ok) {
        setManualPlanEmail('');
        setManualPlanType('lifetime');
        setManualPlanDays('30');
      }
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível atualizar o plano.');
    } finally {
      setManualPlanBusy(false);
    }
  };

  const handlePreviewManualPlan = async () => {
    const email = manualPlanEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe um e-mail válido para simular.');
      return;
    }
    let durationDays: number | undefined;
    if (manualPlanType === 'days') {
      const parsedDays = parseDaysValue(manualPlanDays);
      if (!parsedDays) {
        setBetaCreateStatus('error');
        setBetaCreateMessage('Informe uma quantidade válida de dias para simular.');
        return;
      }
      durationDays = parsedDays;
    }
    setManualPlanPreviewBusy(true);
    try {
      const result = await betaKeysService.previewEntitlementPlan({
        email,
        plan: manualPlanType,
        durationDays
      });
      if (!result.ok || !result.data?.preview) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível simular o plano.');
        return;
      }
      const cleanup = result.data.preview.cleanup || {
        matchedBetaKeys: 0,
        betaKeyIds: []
      };
      setManualPlanPreview({
        matchedBetaKeys: Number(cleanup.matchedBetaKeys || 0),
        betaKeyIds: Array.isArray(cleanup.betaKeyIds) ? (cleanup.betaKeyIds as string[]) : [],
        planType: String(result.data.preview.planType || ''),
        expiresAtMs: result.data.preview.expiresAtMs ?? null
      });
      setBetaCreateStatus('success');
      setBetaCreateMessage(
        `Simulação: ${cleanup.matchedBetaKeys || 0} chave(s) beta seriam removidas para ${email}.`
      );
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível simular o plano.');
    } finally {
      setManualPlanPreviewBusy(false);
    }
  };

  const parseBulkEmails = () => {
    return Array.from(
      new Set(
        bulkEmailsRaw
          .split(/[\n,; ]+/g)
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.includes('@') && item.includes('.'))
      )
    );
  };

  const handlePreviewBulk = async () => {
    const emails = parseBulkEmails();
    if (emails.length === 0) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe pelo menos um e-mail válido para simular o lote.');
      return;
    }
    const payload: {
      action: 'assign_plan' | 'revoke_access';
      emails: string[];
      dryRun: boolean;
      plan?: AdminEntitlementPlan;
      durationDays?: number;
    } = {
      action: bulkAction,
      emails,
      dryRun: true
    };
    if (bulkAction === 'assign_plan') {
      payload.plan = bulkPlanType;
      if (bulkPlanType === 'days') {
        const parsedDays = parseDaysValue(bulkPlanDays);
        if (!parsedDays) {
          setBetaCreateStatus('error');
          setBetaCreateMessage('Informe dias válidos para simular o lote.');
          return;
        }
        payload.durationDays = parsedDays;
      }
    }
    setBulkPreviewBusy(true);
    try {
      const result = await betaKeysService.bulkManageEntitlements(payload);
      if (!result.ok || !result.data) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível simular o lote.');
        return;
      }
      setBulkPreviewResult({
        total: Number(result.data.total || 0),
        successCount: Number(result.data.successCount || 0),
        failCount: Number(result.data.failCount || 0),
        totalMatchedBetaKeys: Number(result.data.totalMatchedBetaKeys || 0),
        results: Array.isArray(result.data.results) ? result.data.results : []
      });
      setBetaCreateStatus('success');
      setBetaCreateMessage(
        `Simulação de lote concluída: ${result.data.totalMatchedBetaKeys || 0} chave(s) beta seriam removidas.`
      );
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível simular o lote.');
    } finally {
      setBulkPreviewBusy(false);
    }
  };

  const handleApplyBulk = async () => {
    const emails = parseBulkEmails();
    if (emails.length === 0) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe pelo menos um e-mail válido para executar o lote.');
      return;
    }
    const payload: {
      action: 'assign_plan' | 'revoke_access';
      emails: string[];
      dryRun: boolean;
      plan?: AdminEntitlementPlan;
      durationDays?: number;
    } = {
      action: bulkAction,
      emails,
      dryRun: false
    };
    if (bulkAction === 'assign_plan') {
      payload.plan = bulkPlanType;
      if (bulkPlanType === 'days') {
        const parsedDays = parseDaysValue(bulkPlanDays);
        if (!parsedDays) {
          setBetaCreateStatus('error');
          setBetaCreateMessage('Informe dias válidos para executar o lote.');
          return;
        }
        payload.durationDays = parsedDays;
      }
    }
    setBulkApplyBusy(true);
    try {
      const result = await betaKeysService.bulkManageEntitlements(payload);
      if (!result.ok || !result.data) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível executar o lote.');
        return;
      }
      setBulkApplyResult({
        batchId: (result.data.batchId as string | null) || null,
        total: Number(result.data.total || 0),
        successCount: Number(result.data.successCount || 0),
        failCount: Number(result.data.failCount || 0),
        totalDeletedBetaKeys: Number(result.data.totalDeletedBetaKeys || 0)
      });
      setLocalAuditItems((prev) => [
        {
          id: String(result.data.batchId || `local-bulk-${Date.now()}`),
          actionType: bulkAction === 'assign_plan' ? 'bulk_assign_plan' : 'bulk_revoke_access',
          targetEmail: 'batch',
          actorEmail: 'local_admin',
          requestedPlan: bulkAction === 'assign_plan' ? bulkPlanType : null,
          cleanupSummary: {
            matchedBetaKeys: Number(result.data.totalMatchedBetaKeys || 0),
            deletedBetaKeys: Number(result.data.totalDeletedBetaKeys || 0)
          },
          createdAtMs: Date.now()
        },
        ...prev
      ]);
      setBulkPreviewResult(null);
      setBulkEmailsRaw('');
      setBetaCreateStatus('success');
      setBetaCreateMessage(
        `Lote executado: ${result.data.successCount || 0}/${result.data.total || 0} concluídos. ${result.data.totalDeletedBetaKeys || 0} chave(s) beta removida(s).`
      );
      await Promise.all([loadBetaKeys(), loadEntitlements(), loadMetrics(), loadAudit()]);
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível executar o lote.');
    } finally {
      setBulkApplyBusy(false);
    }
  };

  const handleRollbackLastAction = async () => {
    const email = rollbackEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe um e-mail válido para rollback.');
      return;
    }
    setRollbackBusy(true);
    try {
      const result = await betaKeysService.rollbackLastEntitlementAction({ email });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível executar rollback.');
        return;
      }
      setLocalAuditItems((prev) => [
        {
          id: String(result.data?.rollbackAuditId || `local-rollback-${Date.now()}`),
          actionType: 'rollback',
          targetEmail: email,
          actorEmail: 'local_admin',
          cleanupSummary: {
            restoredBetaKeys: Number(result.data?.restoredBetaKeys || 0)
          },
          createdAtMs: Date.now()
        },
        ...prev
      ]);
      setBetaCreateStatus('success');
      setBetaCreateMessage(`Rollback concluído para ${email}.`);
      await Promise.all([loadBetaKeys(), loadEntitlements(), loadMetrics(), loadAudit(email)]);
    } catch {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível executar rollback.');
    } finally {
      setRollbackBusy(false);
    }
  };

  const handleAuditFilter = async () => {
    await loadAudit(auditFilterEmail);
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResult(null);
      return;
    }
    setSearchBusy(true);
    try {
      const result = await betaKeysService.searchAdminRecords({ query });
      if (!result.ok || !result.data?.result) {
        const q = query.toLowerCase();
        const fallbackEntitlements = entitlements.filter((entry) =>
          [entry.email, entry.status, entry.planType, entry.source]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
            .includes(q)
        );
        const fallbackBeta = betaKeys.filter((entry) =>
          [entry.id, entry.code, entry.requestedEmail, entry.lifetimeGrantedEmail]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
            .includes(q)
        );
        const fallbackAudit = localAuditItems.filter((entry) =>
          [entry.actionType, entry.targetEmail, entry.actorEmail, entry.requestedPlan]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
            .includes(q)
        );
        setSearchResult({
          users: [],
          entitlements: fallbackEntitlements as Array<Record<string, unknown>>,
          betaKeys: fallbackBeta as Array<Record<string, unknown>>,
          audit: fallbackAudit
        });
        setBetaCreateStatus('info');
        setBetaCreateMessage(
          result.message || 'Busca global remota indisponível. Exibindo resultado local.'
        );
        return;
      }
      setSearchResult({
        users: Array.isArray(result.data.result.users) ? result.data.result.users : [],
        entitlements: Array.isArray(result.data.result.entitlements)
          ? result.data.result.entitlements
          : [],
        betaKeys: Array.isArray(result.data.result.betaKeys) ? result.data.result.betaKeys : [],
        audit: Array.isArray(result.data.result.audit) ? result.data.result.audit : []
      });
    } catch {
      const q = query.toLowerCase();
      const fallbackEntitlements = entitlements.filter((entry) =>
        [entry.email, entry.status, entry.planType, entry.source]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
          .includes(q)
      );
      const fallbackBeta = betaKeys.filter((entry) =>
        [entry.id, entry.code, entry.requestedEmail, entry.lifetimeGrantedEmail]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
          .includes(q)
      );
      const fallbackAudit = localAuditItems.filter((entry) =>
        [entry.actionType, entry.targetEmail, entry.actorEmail, entry.requestedPlan]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
          .includes(q)
      );
      setSearchResult({
        users: [],
        entitlements: fallbackEntitlements as Array<Record<string, unknown>>,
        betaKeys: fallbackBeta as Array<Record<string, unknown>>,
        audit: fallbackAudit
      });
      setBetaCreateStatus('info');
      setBetaCreateMessage('Busca global remota indisponível. Exibindo resultado local.');
    } finally {
      setSearchBusy(false);
    }
  };

  const modeCards: Array<{
    id: PanelModeId;
    title: string;
    description: string;
    statLabel: string;
    tone: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'entitlements',
      title: 'Acessos liberados',
      description: 'Planos e selos por usuário.',
      statLabel: `${entitlements.length} registro(s)`,
      tone: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
      icon: <ShieldCheck size={20} />
    },
    {
      id: 'rollback',
      title: 'Rollback rápido',
      description: 'Reversão da última ação por e-mail.',
      statLabel: rollbackEmail ? 'E-mail preenchido' : 'Aguardando e-mail',
      tone: 'from-amber-500/20 via-amber-500/5 to-transparent',
      icon: <RefreshCw size={20} />
    },
    {
      id: 'search',
      title: 'Busca global',
      description: 'Busca por e-mail, UID, chave e Stripe.',
      statLabel: searchResult
        ? `${searchResult.users.length + searchResult.entitlements.length + searchResult.betaKeys.length + searchResult.audit.length} resultado(s)`
        : 'Sem busca ativa',
      tone: 'from-violet-500/20 via-violet-500/5 to-transparent',
      icon: <BarChart3 size={20} />
    },
    {
      id: 'audit',
      title: 'Histórico administrativo',
      description: 'Registro de ações e limpezas.',
      statLabel: `${auditItems.length} registro(s)`,
      tone: 'from-rose-500/20 via-rose-500/5 to-transparent',
      icon: <ShieldCheck size={20} />
    },
    {
      id: 'beta',
      title: 'Beta testers',
      description: 'Gestão de chaves e plano por chave.',
      statLabel: `${betaKeysVisible.length} chave(s) visíveis`,
      tone: 'from-sky-500/20 via-sky-500/5 to-transparent',
      icon: <KeyRound size={20} />
    },
    {
      id: 'feedback',
      title: 'Bugs e melhorias',
      description: 'Mensagens enviadas pelos usuários.',
      statLabel: `${feedbackItems.length} recebida(s)`,
      tone: 'from-cyan-500/20 via-cyan-500/5 to-transparent',
      icon: <MessageSquare size={20} />
    }
  ];

  const activeModeMeta = modeCards.find((card) => card.id === activeMode) || null;
  const dockSafePadding =
    'calc(var(--mm-desktop-dock-bar-offset, var(--mm-desktop-dock-height, 84px)) + 42px + env(safe-area-inset-bottom))';
  const fieldClass =
    'rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs text-zinc-700 dark:text-white/80 outline-none focus:ring-2 focus:ring-white/20';

  const renderGlobalStatus = () => {
    if (!betaCreateMessage) return null;
    const statusClass =
      betaCreateStatus === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
        : betaCreateStatus === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'
        : betaCreateStatus === 'info'
        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300'
        : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-white/5 dark:text-zinc-300';
    return <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${statusClass}`}>{betaCreateMessage}</div>;
  };

  const renderEntitlementsMode = () => {
    const allSelected = entitlementEmails.length > 0 && selectedEntitlementEmails.length === entitlementEmails.length;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Comando administrativo de plano
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={manualPlanEmail}
              onChange={(event) => setManualPlanEmail(event.target.value)}
              placeholder="email@empresa.com"
              className={`flex-1 min-w-[220px] ${fieldClass}`}
            />
            <select
              value={manualPlanType}
              onChange={(event) => setManualPlanType(event.target.value as AdminEntitlementPlan)}
              className={fieldClass}
            >
              <option value="lifetime">Vitalício</option>
              <option value="annual">Anual</option>
              <option value="monthly">Mensal</option>
              <option value="days">Dias</option>
            </select>
            {manualPlanType === 'days' && (
              <input
                type="number"
                min={1}
                step={1}
                value={manualPlanDays}
                onChange={(event) => setManualPlanDays(event.target.value)}
                placeholder="Dias"
                className={`w-24 ${fieldClass}`}
              />
            )}
            <button
              type="button"
              onClick={handlePreviewManualPlan}
              disabled={manualPlanPreviewBusy}
              className={`inline-flex items-center justify-center rounded-lg border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-[11px] font-semibold text-sky-600 dark:text-sky-300 ${
                manualPlanPreviewBusy ? 'cursor-not-allowed opacity-70' : ''
              }`}
            >
              {manualPlanPreviewBusy ? 'Simulando...' : 'Simular'}
            </button>
            <button
              type="button"
              onClick={handleApplyManualPlan}
              disabled={manualPlanBusy}
              className={`inline-flex items-center justify-center rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 ${
                manualPlanBusy ? 'cursor-not-allowed opacity-70' : ''
              }`}
            >
              {manualPlanBusy ? 'Aplicando...' : 'Aplicar plano'}
            </button>
          </div>
          {manualPlanPreview && (
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-300">
              Preview: {manualPlanPreview.matchedBetaKeys} chave(s) beta vinculada(s) para limpeza
              {manualPlanPreview.betaKeyIds.length > 0 ? ` (${manualPlanPreview.betaKeyIds.join(', ')})` : ''}.
            </p>
          )}
        </div>

        {!entitlementsLoading && !entitlementsError && entitlementEmails.length > 0 && (
          <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    setSelectedEntitlementEmails(event.target.checked ? entitlementEmails : [])
                  }
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
                Selecionar todos ({entitlementEmails.length})
              </label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Selecionados: {selectedEntitlementEmails.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedEntitlementEmails.length === 0) return;
                  void navigator.clipboard
                    .writeText(selectedEntitlementEmails.join('\n'))
                    .then(() => {
                      setBetaCreateStatus('success');
                      setBetaCreateMessage(`${selectedEntitlementEmails.length} e-mail(s) copiado(s).`);
                    })
                    .catch(() => {
                      setBetaCreateStatus('error');
                      setBetaCreateMessage('Não foi possível copiar os e-mails selecionados.');
                    });
                }}
                disabled={selectedEntitlementEmails.length === 0}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 ${
                  selectedEntitlementEmails.length === 0 ? 'cursor-not-allowed opacity-60' : ''
                }`}
              >
                <Copy size={13} />
                Copiar selecionados
              </button>
              <select
                value={selectedBatchAction}
                onChange={(event) => setSelectedBatchAction(event.target.value as 'assign_plan' | 'revoke_access')}
                className={fieldClass}
              >
                <option value="assign_plan">Aplicar plano</option>
                <option value="revoke_access">Revogar acesso</option>
              </select>
              {selectedBatchAction === 'assign_plan' && (
                <>
                  <select
                    value={selectedBatchPlanType}
                    onChange={(event) => setSelectedBatchPlanType(event.target.value as AdminEntitlementPlan)}
                    className={fieldClass}
                  >
                    <option value="lifetime">Vitalício</option>
                    <option value="annual">Anual</option>
                    <option value="monthly">Mensal</option>
                    <option value="days">Dias</option>
                  </select>
                  {selectedBatchPlanType === 'days' && (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={selectedBatchPlanDays}
                      onChange={(event) => setSelectedBatchPlanDays(event.target.value)}
                      className={`w-24 ${fieldClass}`}
                    />
                  )}
                </>
              )}
              <button
                type="button"
                onClick={handleExecuteSelectedEntitlementBatch}
                disabled={selectedBatchBusy || selectedEntitlementEmails.length === 0}
                className={`inline-flex items-center justify-center rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 ${
                  selectedBatchBusy || selectedEntitlementEmails.length === 0
                    ? 'cursor-not-allowed opacity-70'
                    : ''
                }`}
              >
                {selectedBatchBusy ? 'Executando...' : 'Executar seleção'}
              </button>
            </div>
          </div>
        )}

        {entitlementsLoading && (
          <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            Carregando acessos...
          </div>
        )}
        {entitlementsError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-900/20 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
            {entitlementsError}
          </div>
        )}
        {!entitlementsLoading && !entitlementsError && entitlements.length === 0 && (
          <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            Nenhum acesso listado ainda.
          </div>
        )}
        {!entitlementsLoading && !entitlementsError && entitlements.length > 0 && (
          <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/85 dark:bg-white/5 overflow-hidden">
            <div className="grid grid-cols-[auto,1fr,auto] gap-3 px-3 py-2 border-b border-zinc-200/70 dark:border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              <span>Sel</span>
              <span>E-mail / Plano</span>
              <span>Ações</span>
            </div>
            <div className="divide-y divide-zinc-200/70 dark:divide-white/10">
              {entitlements.map((entry) => {
                const badge = getEntitlementBadge(entry);
                const email = String(entry.email || '').trim().toLowerCase();
                const checked = selectedEntitlementEmails.includes(email);
                const expiryMs = entry.subscriptionCurrentPeriodEndMs ?? entry.expiresAtMs ?? null;
                const expiryLabel = expiryMs ? formatDate(expiryMs) : 'Sem expiração';
                const sourceText = String(entry.source || '').toLowerCase();
                const statusText = String(entry.status || '').toLowerCase();
                const planText = String(entry.planType || '').toLowerCase();
                const isDeveloper =
                  sourceText.includes('developer') ||
                  statusText.includes('developer') ||
                  planText.includes('developer');
                const badgeBaseClass =
                  'inline-flex items-center justify-center h-6 w-[116px] rounded-full text-[10px] font-semibold uppercase tracking-[0.16em]';
                return (
                  <div key={entry.id} className="grid grid-cols-[auto,1fr,auto] gap-3 px-3 py-2 items-start">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedEntitlementEmails((prev) =>
                          event.target.checked ? [...prev, email] : prev.filter((item) => item !== email)
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{entry.email}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {entry.status || '—'} • {entry.planType || '—'} • {entry.source || '—'}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        Expira em {expiryLabel} • Atualizado em {formatDate(entry.updatedAtMs)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {badge && (
                        <span
                          className={`${badgeBaseClass} ${
                            badge.tone === 'lifetime'
                              ? 'border border-emerald-200 dark:border-emerald-900/40 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-200'
                              : badge.tone === 'annual'
                              ? 'border border-sky-200 dark:border-sky-900/40 bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-200'
                              : badge.tone === 'monthly'
                              ? 'border border-amber-200 dark:border-amber-900/40 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-200'
                              : 'border border-fuchsia-200 dark:border-fuchsia-900/40 bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-200'
                          }`}
                        >
                          {badge.label}
                        </span>
                      )}
                      {isDeveloper && (
                        <span
                          className={`${badgeBaseClass} border border-indigo-200 dark:border-indigo-900/40 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-200`}
                        >
                          Desenvolvedor
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopyEmail(email)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200"
                      >
                        <Copy size={12} />
                        Copiar e-mail
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRollbackMode = () => (
    <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
        Reverte a última ação administrativa reversível de um e-mail.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={rollbackEmail}
          onChange={(event) => setRollbackEmail(event.target.value)}
          placeholder="email@empresa.com"
          className={`flex-1 min-w-[220px] ${fieldClass}`}
        />
        <button
          type="button"
          onClick={handleRollbackLastAction}
          disabled={rollbackBusy}
          className={`inline-flex items-center justify-center rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] font-semibold text-amber-600 dark:text-amber-300 ${
            rollbackBusy ? 'cursor-not-allowed opacity-70' : ''
          }`}
        >
          {rollbackBusy ? 'Revertendo...' : 'Rollback último'}
        </button>
      </div>
    </div>
  );

  const renderSearchMode = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Email, UID, código beta ou IDs Stripe em uma visão única.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ex.: pauloedu1985b@gmail.com, MEUMEI-ZU47-HJ60, cus_xxx"
            className={`flex-1 min-w-[220px] ${fieldClass}`}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searchBusy}
            className={`inline-flex items-center justify-center rounded-lg border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-900/20 px-3 py-2 text-[11px] font-semibold text-violet-600 dark:text-violet-300 ${
              searchBusy ? 'cursor-not-allowed opacity-70' : ''
            }`}
          >
            {searchBusy ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>
      {searchResult && (
        <div className="space-y-2 text-[11px] text-zinc-500 dark:text-zinc-300">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">Usuários: {searchResult.users.length}</div>
            <div className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">Entitlements: {searchResult.entitlements.length}</div>
            <div className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">Beta keys: {searchResult.betaKeys.length}</div>
            <div className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">Auditoria: {searchResult.audit.length}</div>
          </div>
          {searchResult.entitlements.slice(0, 6).map((entry) => {
            const email = String(entry.email || '—');
            const status = String(entry.status || '—');
            const planType = String(entry.planType || '—');
            const source = String(entry.source || '—');
            return (
              <div key={`search-ent-${email}-${status}-${planType}`} className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">
                entitlement: {email} • {status} • {planType} • {source}
              </div>
            );
          })}
          {searchResult.betaKeys.slice(0, 6).map((entry) => {
            const id = String(entry.id || '—');
            const code = String(entry.code || '—');
            const requestedEmail = String(entry.requestedEmail || '—');
            return (
              <div key={`search-beta-${id}`} className="rounded-lg border border-zinc-200/70 dark:border-white/10 px-3 py-2">
                beta key: {code} • {id} • requestedEmail {requestedEmail}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAuditMode = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Timeline de alterações de plano, limpeza de chaves e rollbacks.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={auditFilterEmail}
            onChange={(event) => setAuditFilterEmail(event.target.value)}
            placeholder="Filtrar por e-mail (opcional)"
            className={`flex-1 min-w-[220px] ${fieldClass}`}
          />
          <button
            type="button"
            onClick={handleAuditFilter}
            disabled={auditLoading}
            className={`inline-flex items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300 ${
              auditLoading ? 'cursor-not-allowed opacity-70' : ''
            }`}
          >
            {auditLoading ? 'Carregando...' : 'Atualizar histórico'}
          </button>
        </div>
      </div>
      {auditError && <p className="text-[11px] text-rose-600 dark:text-rose-300">{auditError}</p>}
      {!auditLoading && !auditError && auditItems.length === 0 && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-300">Sem registros no momento.</p>
      )}
      {!auditLoading && !auditError && auditItems.length > 0 && (
        <div className="space-y-2">
          {auditItems.slice(0, 40).map((item) => {
            const id = String(item.id || '');
            const actionType = String(item.actionType || '—');
            const targetEmail = String(item.targetEmail || '—');
            const actorEmail = String(item.actorEmail || item.actorUid || '—');
            const createdAtMs = Number(item.createdAtMs || 0);
            const when = createdAtMs ? new Date(createdAtMs).toLocaleString('pt-BR') : '—';
            const cleanup = item.cleanupSummary as { deletedBetaKeys?: number } | null;
            const deletedBetaKeys = Number(cleanup?.deletedBetaKeys || 0);
            return (
              <div
                key={id}
                className="rounded-lg border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300"
              >
                {actionType} • {targetEmail} • por {actorEmail} • {when}
                {deletedBetaKeys > 0 ? ` • ${deletedBetaKeys} beta key(s) removidas` : ''}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderBetaMode = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            void loadBetaKeys();
          }}
          disabled={betaListLoading}
          className={`${actionButtonBase} bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${
            betaListLoading ? 'cursor-not-allowed opacity-70' : ''
          }`}
        >
          Atualizar lista
        </button>
      </div>
      {betaListLoading && (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          Carregando chaves...
        </div>
      )}
      {betaListError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-900/20 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
          {betaListError}
        </div>
      )}
      {!betaListLoading && !betaListError && betaKeysHiddenByLifetime > 0 && (
        <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
          {betaKeysHiddenByLifetime} registro(s) oculto(s) por já terem acesso vitalício em “Acessos liberados”.
        </div>
      )}
      {!betaListLoading && !betaListError && betaKeysVisible.length === 0 && (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          Nenhuma chave criada ainda.
        </div>
      )}
      {betaKeysVisible.map((key) => {
        const isLifetimeKey = Boolean(key.lifetimeGrantedEmail);
        const cardClass = isLifetimeKey
          ? 'rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-3 flex flex-col gap-3'
          : 'rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3 flex flex-col gap-3';
        return (
          <div key={key.id} className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{key.code}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {key.uses}/{key.maxUses} usos • {key.durationDays} dias • {key.isActive ? 'Ativa' : 'Revogada'} •{' '}
                  {key.source || 'manual'}
                </p>
                <p className="text-[11px] text-zinc-400">
                  Criada em {formatDate(key.createdAtMs)} • Último uso {formatDate(key.lastUsedAtMs)}
                  {key.requestedEmail ? ` • ${key.requestedEmail}` : ''}
                </p>
                {key.lifetimeGrantedEmail && (
                  <p className="text-[11px] text-emerald-500 dark:text-emerald-300 mt-1">
                    Vitalício para {key.lifetimeGrantedEmail} • {formatDate(key.lifetimeGrantedAtMs)}
                  </p>
                )}
                {key.uses === 0 && <p className="text-[11px] text-amber-300 mt-1">Sem uso até agora.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyBetaKey(key.code)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 dark:text-white/80 dark:hover:border-white/30"
                >
                  <Copy size={14} />
                  Copiar
                </button>
                {key.isActive && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleRevokeBetaKey(key.id);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300"
                  >
                    Revogar
                  </button>
                )}
                {pendingDeleteId === key.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteBetaKey(key.id, true);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 dark:text-white/80 dark:hover:border-white/30"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteBetaKey(key.id);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 dark:text-white/80 dark:hover:border-white/30"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/70 dark:border-white/10 pt-3">
              <input
                type="email"
                value={lifetimeEmailByKey[key.id] ?? key.lifetimeGrantedEmail ?? key.requestedEmail ?? ''}
                onChange={(event) =>
                  setLifetimeEmailByKey((prev) => ({
                    ...prev,
                    [key.id]: event.target.value
                  }))
                }
                placeholder="E-mail para aplicar plano"
                className={`flex-1 min-w-[220px] ${fieldClass}`}
              />
              <select
                value={planByKey[key.id] || 'lifetime'}
                onChange={(event) =>
                  setPlanByKey((prev) => ({
                    ...prev,
                    [key.id]: event.target.value as AdminEntitlementPlan
                  }))
                }
                className={fieldClass}
              >
                <option value="lifetime">Vitalício</option>
                <option value="annual">Anual</option>
                <option value="monthly">Mensal</option>
                <option value="days">Dias</option>
              </select>
              {(planByKey[key.id] || 'lifetime') === 'days' && (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={daysByKey[key.id] ?? String(key.durationDays || 30)}
                  onChange={(event) =>
                    setDaysByKey((prev) => ({
                      ...prev,
                      [key.id]: event.target.value
                    }))
                  }
                  placeholder="Dias"
                  className={`w-24 ${fieldClass}`}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  void handleApplyPlanForKey(key);
                }}
                disabled={planBusyId === key.id}
                className={`inline-flex items-center justify-center rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 ${
                  planBusyId === key.id ? 'cursor-not-allowed opacity-70' : ''
                }`}
              >
                {planBusyId === key.id ? 'Aplicando...' : 'Aplicar plano'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderFeedbackMode = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Caixa de entrada de bugs e sugestões enviados pelas Configurações.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={feedbackQuery}
            onChange={(event) => setFeedbackQuery(event.target.value)}
            placeholder="Buscar por e-mail, empresa ou texto"
            className={`flex-1 min-w-[220px] ${fieldClass}`}
          />
          <select
            value={feedbackTypeFilter}
            onChange={(event) =>
              setFeedbackTypeFilter(event.target.value as 'all' | 'bug' | 'improvement')
            }
            className={fieldClass}
          >
            <option value="all">Todos os tipos</option>
            <option value="bug">Somente bugs</option>
            <option value="improvement">Somente melhorias</option>
          </select>
          <select
            value={feedbackStatusFilter}
            onChange={(event) =>
              setFeedbackStatusFilter(event.target.value as 'all' | 'new' | 'reviewed' | 'resolved')
            }
            className={fieldClass}
          >
            <option value="all">Todos os status</option>
            <option value="new">Novos</option>
            <option value="reviewed">Em análise</option>
            <option value="resolved">Resolvidos</option>
          </select>
          <button
            type="button"
            onClick={() =>
              void loadFeedback({
                query: feedbackQuery,
                type: feedbackTypeFilter,
                status: feedbackStatusFilter
              })
            }
            disabled={feedbackLoading}
            className={`inline-flex items-center justify-center rounded-lg border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 ${
              feedbackLoading ? 'cursor-not-allowed opacity-70' : ''
            }`}
          >
            {feedbackLoading ? 'Atualizando...' : 'Atualizar caixa'}
          </button>
        </div>
      </div>

      {feedbackError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-900/20 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
          {feedbackError}
        </div>
      )}

      {!feedbackLoading && !feedbackError && feedbackItems.length === 0 && (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          Nenhuma mensagem encontrada com os filtros atuais.
        </div>
      )}

      {!feedbackLoading && !feedbackError && feedbackItems.length > 0 && (
        <div className="space-y-2">
          {feedbackItems.map((item) => {
            const typeLabel = item.type === 'bug' ? 'Bug' : 'Melhoria';
            const statusText = String(item.status || 'new').toLowerCase();
            const statusLabel =
              statusText === 'resolved'
                ? 'Resolvido'
                : statusText === 'reviewed'
                ? 'Em análise'
                : 'Novo';
            const when = item.createdAtMs
              ? new Date(item.createdAtMs).toLocaleString('pt-BR')
              : '—';
            const itemActionId = `${item.userId}:${item.id}`;
            const actionBusy = feedbackActionBusyId === itemActionId;
            return (
              <div
                key={`${item.userId}-${item.id}`}
                className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        item.type === 'bug'
                          ? 'border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                          : 'border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {typeLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-200">
                      {statusLabel}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{when}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap">
                  {item.message}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Empresa: {item.companyName || '—'}</span>
                  <span>•</span>
                  <span>Email: {item.reporterEmail || '—'}</span>
                  <span>•</span>
                  <span>UID: {item.userId}</span>
                  <span>•</span>
                  <span>Plataforma: {item.platform || '—'}</span>
                  <span>•</span>
                  <span>Versão: {item.appVersion || '—'}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleFeedbackStatusChange(item, 'reviewed')}
                    disabled={actionBusy || statusText === 'reviewed'}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${
                      actionBusy || statusText === 'reviewed'
                        ? 'cursor-not-allowed opacity-60'
                        : ''
                    } border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300`}
                  >
                    <Check size={12} />
                    Marcar como lida
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFeedbackStatusChange(item, 'resolved')}
                    disabled={actionBusy || statusText === 'resolved'}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${
                      actionBusy || statusText === 'resolved'
                        ? 'cursor-not-allowed opacity-60'
                        : ''
                    } border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300`}
                  >
                    <CheckCheck size={12} />
                    Resolver
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFeedbackStatusChange(item, 'new')}
                    disabled={actionBusy || statusText === 'new'}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${
                      actionBusy || statusText === 'new'
                        ? 'cursor-not-allowed opacity-60'
                        : ''
                    } border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300`}
                  >
                    <RotateCcw size={12} />
                    Reabrir
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUserFeedback(item)}
                    disabled={actionBusy}
                    className={`inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 ${
                      actionBusy ? 'cursor-not-allowed opacity-60' : ''
                    }`}
                  >
                    <Trash2 size={12} />
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderActiveMode = () => {
    if (activeMode === 'entitlements') return renderEntitlementsMode();
    if (activeMode === 'rollback') return renderRollbackMode();
    if (activeMode === 'search') return renderSearchMode();
    if (activeMode === 'audit') return renderAuditMode();
    if (activeMode === 'beta') return renderBetaMode();
    if (activeMode === 'feedback') return renderFeedbackMode();
    return null;
  };

  return (
    <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-24 transition-colors duration-300 flex flex-col">
      <main
        className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 flex-1 animate-in fade-in slide-in-from-bottom-16 duration-500"
        style={{ paddingBottom: dockSafePadding }}
      >
        <section className={summarySectionClass}>
          <div className="space-y-2">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />
              <div className="min-w-0 text-center">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Painel de controle</p>
              </div>
              <div className="min-w-[32px]" />
            </div>

            <div className="grid grid-cols-4 gap-[5px]">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Vendas</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.totalSales : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Receita</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : formatCurrency(metrics?.revenueEstimateCents ?? null)}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Empresas</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.companies : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Usuários mês</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.activeUsersThisMonth : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Entitlements ativos</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.entitlementsActive : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Entitlements expir.</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.entitlementsExpired : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Chaves criadas</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.betaKeysCreated : '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Chaves usadas</p>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{metricsLoading ? '...' : metrics ? metrics.betaKeysUsed : '—'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-[var(--mm-content-gap)] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Modos operacionais</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Abra o modo desejado para executar ações administrativas.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {modeCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveMode(card.id)}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-white/20"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tone} opacity-80 group-hover:opacity-100`} />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-black/20 p-2 text-zinc-700 dark:text-zinc-200">
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{card.title}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-300">{card.statLabel}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{card.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-[var(--mm-content-gap)] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Crescimento do app</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Novos meumeis por período e curva acumulada.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/80 dark:border-white/10 bg-zinc-100/80 dark:bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setGrowthScope('monthly')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                  growthScope === 'monthly'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setGrowthScope('annual')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                  growthScope === 'annual'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Anual
              </button>
            </div>
          </div>

          {metricsLoading && (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Carregando curva de crescimento...
            </div>
          )}

          {!metricsLoading && !growthChartData && (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Série histórica indisponível no momento.
            </div>
          )}

          {!metricsLoading && growthChartData && (
            <>
              <div className="mt-4 rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 p-3">
                <svg
                  viewBox={`0 0 ${growthChartData.width} ${growthChartData.height}`}
                  className="h-52 w-full"
                  role="img"
                  aria-label="Gráfico de crescimento de usuários"
                >
                  {growthChartData.yGuides.map((guide) => (
                    <line
                      key={`growth-guide-${guide.ratio}`}
                      x1={growthChartData.padLeft}
                      x2={growthChartData.width - growthChartData.padRight}
                      y1={guide.y}
                      y2={guide.y}
                      stroke="currentColor"
                      className="text-zinc-200 dark:text-zinc-700/70"
                      strokeDasharray={guide.ratio === 0 ? '0' : '3 5'}
                      strokeWidth={guide.ratio === 0 ? 1.2 : 1}
                    />
                  ))}

                  <path
                    d={growthChartData.fillPath}
                    fill="url(#growthNewFill)"
                    opacity={0.22}
                  />
                  <path
                    d={growthChartData.cumulativePath}
                    fill="none"
                    stroke="url(#growthCumulativeLine)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={growthChartData.newPath}
                    fill="none"
                    stroke="url(#growthNewLine)"
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {growthChartData.points.map((point, index) => {
                    const isSelected = index === growthChartData.selectedIndex;
                    const showLabel =
                      growthChartData.points.length <= 6 ||
                      index % 2 === 0 ||
                      index === growthChartData.points.length - 1;
                    return (
                      <g key={`growth-point-${point.periodKey}`}>
                        <circle
                          cx={point.x}
                          cy={point.yCumulative}
                          r={isSelected ? 4.6 : 3.4}
                          fill="#34d399"
                          stroke="#0a0a0b"
                          strokeWidth={1}
                          opacity={0.92}
                        />
                        <circle
                          cx={point.x}
                          cy={point.yNew}
                          r={isSelected ? 4.8 : 3.2}
                          fill="#22d3ee"
                          stroke="#0a0a0b"
                          strokeWidth={1}
                        />
                        {showLabel && (
                          <text
                            x={point.x}
                            y={growthChartData.height - 12}
                            textAnchor="middle"
                            className="fill-zinc-500 dark:fill-zinc-400 text-[9px]"
                          >
                            {point.label}
                          </text>
                        )}
                        {isSelected && (
                          <text
                            x={point.x}
                            y={point.yNew - 10}
                            textAnchor="middle"
                            className="fill-cyan-500 dark:fill-cyan-300 text-[10px] font-semibold"
                          >
                            +{formatCount(point.newUsers)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <defs>
                    <linearGradient id="growthNewLine" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                    <linearGradient id="growthCumulativeLine" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                    <linearGradient id="growthNewFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Novos usuários
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Curva acumulada
                    </span>
                  </div>
                  <span>{growthScope === 'monthly' ? 'Últimos 12 meses' : 'Últimos 6 anos'}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Novos no período</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {formatCount(growthSeriesTotals.totalNewUsers)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Último período</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {growthSeriesTotals.latest ? `+${formatCount(growthSeriesTotals.latest.newUsers)}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Base acumulada</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {growthSeriesTotals.latest
                      ? formatCount(growthSeriesTotals.latest.cumulativeUsers)
                      : metrics
                      ? formatCount(metrics.companies)
                      : '—'}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {activeMode && activeModeMeta && (
        <div className="fixed inset-0 z-[1200]">
          <button
            type="button"
            aria-label="Fechar janela"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveMode(null)}
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-none border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] overflow-y-auto md:left-1/2 md:right-auto md:bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] md:w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] md:max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] md:-translate-x-1/2 md:rounded-[26px] md:border md:border-black/10 md:dark:border-white/20 md:bg-white/80 md:dark:bg-white/5 md:backdrop-blur-2xl md:shadow-[0_10px_24px_rgba(0,0,0,0.35)] md:p-5 md:max-h-[80vh] md:flex md:flex-col">
            <div className="md:pb-3 md:border-b md:border-zinc-200/60 md:dark:border-zinc-800/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{activeModeMeta.title}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{activeModeMeta.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMode(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-200"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {modeCards.map((mode) => (
                  <button
                    key={`switch-${mode.id}`}
                    type="button"
                    onClick={() => setActiveMode(mode.id)}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                      mode.id === activeMode
                        ? 'border-zinc-800 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {mode.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-4 md:pt-3 md:flex-1 md:min-h-0 md:overflow-auto space-y-4 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-1">
              {renderGlobalStatus()}
              {renderActiveMode()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterControlPanel;
