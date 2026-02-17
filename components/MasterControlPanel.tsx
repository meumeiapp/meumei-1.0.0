import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  KeyRound,
  Copy,
  Users,
  ShieldCheck,
  Wallet,
  RefreshCw
} from 'lucide-react';
import { betaKeysService, type BetaKeyRecord } from '../services/betaKeysService';
import { masterMetricsService, type MasterMetrics } from '../services/masterMetricsService';
import { masterEntitlementsService, type EntitlementRecord } from '../services/masterEntitlementsService';

type MasterControlPanelProps = {
  onBack: () => void;
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

const MasterControlPanel: React.FC<MasterControlPanelProps> = ({ onBack }) => {
  const [metrics, setMetrics] = useState<MasterMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState('');

  const [betaKeys, setBetaKeys] = useState<BetaKeyRecord[]>([]);
  const [betaListLoading, setBetaListLoading] = useState(false);
  const [betaListError, setBetaListError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [lifetimeEmailByKey, setLifetimeEmailByKey] = useState<Record<string, string>>({});
  const [lifetimeBusyId, setLifetimeBusyId] = useState<string | null>(null);
  const [betaCreateStatus, setBetaCreateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [betaCreateMessage, setBetaCreateMessage] = useState('');
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState('');

  const actionButtonBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition h-10 w-full sm:w-48 whitespace-nowrap';

  const stats = useMemo(() => {
    return [
      { label: 'Vendas (Stripe)', value: metrics ? metrics.totalSales : '—', icon: <Wallet size={18} /> },
      { label: 'Receita estimada', value: formatCurrency(metrics?.revenueEstimateCents ?? null), icon: <BarChart3 size={18} /> },
      { label: 'Empresas (tenants)', value: metrics ? metrics.companies : '—', icon: <Users size={18} /> },
      { label: 'Usuários ativos (mês)', value: metrics ? metrics.activeUsersThisMonth : '—', icon: <Users size={18} /> },
      { label: 'Entitlements ativos', value: metrics ? metrics.entitlementsActive : '—', icon: <ShieldCheck size={18} /> },
      { label: 'Entitlements expirados', value: metrics ? metrics.entitlementsExpired : '—', icon: <ShieldCheck size={18} /> },
      { label: 'Chaves beta criadas', value: metrics ? metrics.betaKeysCreated : '—', icon: <KeyRound size={18} /> },
      { label: 'Chaves beta usadas', value: metrics ? metrics.betaKeysUsed : '—', icon: <KeyRound size={18} /> }
    ];
  }, [metrics]);

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

  useEffect(() => {
    void loadMetrics();
    void loadBetaKeys();
    void loadEntitlements();
  }, []);

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
      await loadBetaKeys();
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

  const handleGrantLifetimeAccess = async (key: BetaKeyRecord) => {
    const emailCandidate =
      lifetimeEmailByKey[key.id] || key.lifetimeGrantedEmail || key.requestedEmail || '';
    const email = emailCandidate.trim();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Informe um e-mail válido para liberar acesso vitalício.');
      return;
    }
    setLifetimeBusyId(key.id);
    setBetaCreateStatus('loading');
    setBetaCreateMessage('');
    try {
      const result = await betaKeysService.grantLifetimeAccess({
        email,
        keyId: key.id,
        code: key.code
      });
      if (!result.ok) {
        setBetaCreateStatus('error');
        setBetaCreateMessage(result.message || 'Não foi possível liberar o acesso vitalício.');
        return;
      }
      setBetaCreateStatus('success');
      const emailSent = result.data?.emailSent;
      setBetaCreateMessage(
        emailSent === false
          ? `Acesso vitalício liberado para ${email}, mas o e-mail não pôde ser enviado.`
          : `Acesso vitalício liberado para ${email}.`
      );
      await loadBetaKeys();
      await loadEntitlements();
    } catch (error) {
      setBetaCreateStatus('error');
      setBetaCreateMessage('Não foi possível liberar o acesso vitalício.');
    } finally {
      setLifetimeBusyId(null);
    }
  };

  return (
    <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-24 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2.5 rounded-xl bg-white dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors border border-zinc-200 dark:border-zinc-700/50 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Visão geral do sistema, vendas e beta testers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadMetrics();
            void loadBetaKeys();
            void loadEntitlements();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-white/70"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Resumo do negócio</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Indicadores principais do meumei.
              </p>
            </div>
            <span className="text-xs text-zinc-400">
              Atualizado em {formatDate(metrics?.lastUpdatedAtMs || null)}
            </span>
          </div>
          {metricsLoading && (
            <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Carregando métricas...</div>
          )}
          {metricsError && (
            <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
              {metricsError}
            </div>
          )}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3"
              >
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                  {stat.icon}
                  {stat.label}
                </div>
                <p className="mt-2 text-xl font-semibold text-zinc-900 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-300">
              <ShieldCheck size={22} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Acessos liberados</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Usuários com acesso ativo, incluindo quem não veio por beta.
              </p>
            </div>
          </div>
          {entitlementsLoading && (
            <div className="mt-4 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              Carregando acessos...
            </div>
          )}
          {entitlementsError && (
            <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-900/20 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
              {entitlementsError}
            </div>
          )}
          {!entitlementsLoading && !entitlementsError && entitlements.length === 0 && (
            <div className="mt-4 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              Nenhum acesso listado ainda.
            </div>
          )}
          {!entitlementsLoading && !entitlementsError && entitlements.length > 0 && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {entitlements.map((entry) => {
                const planType = (entry.planType || '').toLowerCase();
                const isLifetime = Boolean(entry.lifetime) || planType === 'lifetime';
                const expiryMs = entry.subscriptionCurrentPeriodEndMs ?? entry.expiresAtMs ?? null;
                const expiryLabel = expiryMs ? formatDate(expiryMs) : 'Sem expiração';
                const cardClass = isLifetime
                  ? 'rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-900/20 px-4 py-3'
                  : 'rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3';
                return (
                  <div key={entry.id} className={cardClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{entry.email}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {entry.status || '—'} • {entry.planType || '—'} • {entry.source || '—'}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Expira em {expiryLabel} • Atualizado em {formatDate(entry.updatedAtMs)}
                        </p>
                      </div>
                      {isLifetime && (
                        <span className="rounded-full border border-emerald-200 dark:border-emerald-900/40 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-200">
                          Vitalício
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-sky-100 dark:bg-sky-900/20 rounded-xl text-sky-600 dark:text-sky-300">
              <KeyRound size={22} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Beta testers</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Chaves de teste geradas automaticamente na landing.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={loadBetaKeys}
              disabled={betaListLoading}
              className={`${actionButtonBase} bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${
                betaListLoading ? 'cursor-not-allowed opacity-70' : ''
              }`}
            >
              Atualizar lista
            </button>
          </div>
          {betaCreateMessage && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                betaCreateStatus === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : betaCreateStatus === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-white/5 dark:text-zinc-400'
              }`}
            >
              {betaCreateMessage}
            </div>
          )}
          <div className="mt-6 space-y-3">
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
            {!betaListLoading && !betaListError && betaKeys.length === 0 && (
              <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Nenhuma chave criada ainda.
              </div>
            )}
            {betaKeys.map((key) => {
              const isLifetimeKey = Boolean(key.lifetimeGrantedEmail);
              const cardClass = isLifetimeKey
                ? 'rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-3 flex flex-col gap-3'
                : 'rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3 flex flex-col gap-3';
              return (
              <div
                key={key.id}
                className={cardClass}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{key.code}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {key.uses}/{key.maxUses} usos • {key.durationDays} dias • {key.isActive ? 'Ativa' : 'Revogada'} • {key.source || 'manual'}
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
                    {key.uses === 0 && (
                      <p className="text-[11px] text-amber-300 mt-1">Sem uso até agora.</p>
                    )}
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
                        onClick={() => handleRevokeBetaKey(key.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300"
                      >
                        Revogar
                      </button>
                    )}
                    {pendingDeleteId === key.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDeleteBetaKey(key.id, true)}
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
                        onClick={() => handleDeleteBetaKey(key.id)}
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
                    placeholder="E-mail para liberar vitalício"
                    className="flex-1 min-w-[220px] rounded-lg border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs text-zinc-700 dark:text-white/80 outline-none focus:ring-2 focus:ring-emerald-300/40"
                  />
                  <button
                    type="button"
                    onClick={() => handleGrantLifetimeAccess(key)}
                    disabled={lifetimeBusyId === key.id}
                    className={`inline-flex items-center justify-center rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 ${
                      lifetimeBusyId === key.id ? 'cursor-not-allowed opacity-70' : ''
                    }`}
                  >
                    {lifetimeBusyId === key.id ? 'Liberando...' : 'Liberar vitalício'}
                  </button>
                </div>
              </div>
            )})}
          </div>
        </section>
      </main>
    </div>
  );
};

export default MasterControlPanel;
