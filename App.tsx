
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import AccountsView from './components/AccountsView';
import ExpensesView from './components/ExpensesView';
import IncomesView from './components/IncomesView';
import YieldsView from './components/YieldsView'; 
import InvoicesView from './components/InvoicesView'; 
import ReportsView from './components/ReportsView';
import GlobalHeader from './components/GlobalHeader';
import CompanyDetailsView from './components/CompanyDetailsView';
import CalculatorModal from './components/CalculatorModal';
import AuditLogModal from './components/AuditLogModal';
import FaturasErrorBoundary from './components/FaturasErrorBoundary';
import InstallAppModal from './components/InstallAppModal';
import { ViewState, CompanyInfo, Account, CreditCard, Expense, Income, LicenseRecord, ThemePreference } from './types';
import { COMPANY_DATA, DEFAULT_COMPANY_INFO, DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_TYPES, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES } from './constants';
import { dataService } from './services/dataService';
import { categoryService, CategoryType } from './services/categoryService';
import { auditService, AuditLogInput } from './services/auditService';
import { GlobalActionsProvider, useGlobalActions, NavigatePayload } from './contexts/GlobalActionsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
 
import { auth, db, firebaseDebugInfo } from './services/firebase';
import { preferencesService } from './services/preferencesService';
import { Loader2, ShieldOff, LogOut, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { normalizeEmail } from './utils/normalizeEmail';
import { resetTenantData } from './services/resetService';
import { getCryptoStatus } from './services/cryptoService';
import { usePwaInstallPrompt } from './hooks/usePwaInstallPrompt';
import useIsMobile from './hooks/useIsMobile';
import useMobileTopOffset from './hooks/useMobileTopOffset';
import useIsMobileLandscape from './hooks/useIsMobileLandscape';
import APP_VERSION from './appVersion';

const PURCHASE_URL = 'https://meumeiapp.web.app/';
const RESOLVE_TIMEOUT_MS = 12_000;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
type LicenseAccessReason =
  | 'not_authorized'
  | 'not_found'
  | 'inactive'
  | 'permission_denied'
  | 'timeout'
  | 'unexpected_error';

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('timeout'));
    }, ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
type CurrentUserState = {
  username: string;
  licenseId: string;
  tenantId: string;
  email?: string;
};

const useRecoveryMode = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('reset') !== '1') return;
    setActive(true);

    const run = async () => {
      console.info('[recovery] start');
      try {
        localStorage.clear();
      } catch (error) {
        console.error('[recovery] error', error);
      }
      try {
        sessionStorage.clear();
      } catch (error) {
        console.error('[recovery] error', error);
      }
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        } catch (error) {
          console.error('[recovery] error', error);
        }
      }
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(reg => reg.unregister()));
        } catch (error) {
          console.error('[recovery] error', error);
        }
      }
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('reset');
        window.location.replace(cleanUrl.toString());
        window.setTimeout(() => window.location.reload(), 50);
      } catch (error) {
        console.error('[recovery] error', error);
      }
    };

    void run();
  }, []);

  return active;
};

const RecoveryGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isRecoveryActive = useRecoveryMode();
  if (isRecoveryActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter">
        Reiniciando...
      </div>
    );
  }
  return <>{children}</>;
};

const AppInner: React.FC = () => {
  console.info('[app] AppInner render start');
  // --- STATE ---
  const [isLoading, setIsLoading] = useState(false);
  const {
    user: authUser,
    loading: authLoading,
    login: authLogin,
    logout: authLogout,
    register: authRegister,
    resetPassword: authResetPassword
  } = useAuth();
  const [currentUser, setCurrentUser] = useState<CurrentUserState | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [resolvedLicenseId, setResolvedLicenseId] = useState<string | null>(null);
  const [licenseReason, setLicenseReason] = useState<LicenseAccessReason | null>(null);
  const [licenseRetryToken, setLicenseRetryToken] = useState(0);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const [hasLoggedOut, setHasLoggedOut] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginErrorCode, setLoginErrorCode] = useState('');
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(null);
  const [authTimeoutHit, setAuthTimeoutHit] = useState(false);
  const [licenseBlockedDetail, setLicenseBlockedDetail] = useState('');
  const [licenseResolveState, setLicenseResolveState] = useState<'idle' | 'loading' | 'ready' | 'blocked'>('idle');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const isMobile = useIsMobile();
  const isMobileLandscape = useIsMobileLandscape();
  useMobileTopOffset();
  const [cryptoStatus, setCryptoStatus] = useState<'ready' | 'missing' | 'error'>('ready');
  const cryptoGuardLogged = useRef(false);
  const recoveryLoggedRef = useRef(false);
  const gateRunRef = useRef<string | null>(null);
  const metricsSnapshotRef = useRef({
      accounts: null as number | null,
      expenses: null as number | null,
      incomes: null as number | null,
      logged: false
  });
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);
  const debugAuthEnabled =
    import.meta.env.DEV || import.meta.env.VITE_DEBUG_AUTH === 'true';
  const normalizeIdentity = (value: string) => {
    try {
      return normalizeEmail(value);
    } catch {
      return value.trim().toLowerCase();
    }
  };
  const authEmailNormalized = authUser?.email ? normalizeIdentity(authUser.email) : '';
  const licenseIdNormalized = currentUser?.licenseId ? normalizeIdentity(currentUser.licenseId) : '';
  const isMaster = Boolean(authEmailNormalized && licenseIdNormalized && authEmailNormalized === licenseIdNormalized);
  useEffect(() => {
      gateRunRef.current = null;
  }, [authUser?.uid]);

  useEffect(() => {
    console.info('[app][boot]', {
      standalone: isStandalone,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
    console.info('[app][version]', { version: APP_VERSION });
  }, [isStandalone]);

  useEffect(() => {
    const run = () => {
      const status = getCryptoStatus();
      console.info('[crypto][status]', {
        ready: status.ready,
        reason: status.ready ? undefined : status.reason,
        mode: import.meta.env.DEV ? 'dev' : 'prod'
      });
      console.info('[app][env]', {
        DEV: import.meta.env.DEV,
        PROD: import.meta.env.PROD,
        baseUrl: import.meta.env.BASE_URL
      });
      if (status.ready) {
        setCryptoStatus('ready');
        return;
      }
      setCryptoStatus(status.reason === 'missing_salt' ? 'missing' : 'error');
      if (!cryptoGuardLogged.current) {
        console.info('[app][guard] crypto disabled by environment');
        console.info('[ui][state] protected mode active');
        cryptoGuardLogged.current = true;
      }
    };
    if (isStandalone) {
      try {
        run();
      } catch (error) {
        console.error('[pwa][boot]', error);
      }
      return;
    }
    run();
  }, [isStandalone]);

  useEffect(() => {
    console.info('[rules] sensitive data protected');
  }, []);

  useEffect(() => {
    console.info('[app] currentView ready', { currentView });
  }, [currentView]);

  useEffect(() => {
    if (currentView !== ViewState.DASHBOARD) return;
    console.info('[dashboard] auth', {
      email: authUser?.email ?? null,
      licenseId: currentUser?.licenseId ?? null,
      isMaster
    });
  }, [currentView, authUser?.email, currentUser?.licenseId, isMaster]);

  const handleLicenseRetry = () => {
    console.log('[license-resolve] retry requested');
    setLicenseResolveState('loading');
    setLicenseBlockedDetail('');
    setLicenseReason(null);
    setResolvedLicenseId(null);
    setCurrentUser(null);
    setLicenseCryptoEpoch(null);
    setLicenseRetryToken(prev => prev + 1);
  };

  useEffect(() => {
    if (currentView !== ViewState.LOGIN) return;
    const expectedProjectId = 'meumei-d88be';
    const { projectId, authDomain } = firebaseDebugInfo;
    if (!projectId || !authDomain || projectId !== expectedProjectId) {
      console.warn('[firebase] config_mismatch', {
        expectedProjectId,
        projectId: projectId || null,
        authDomain: authDomain || null,
        origin: firebaseDebugInfo.origin,
        apiKeyPrefix: firebaseDebugInfo.apiKeyPrefix
      });
    }
  }, [currentView]);

  // DATA STATE
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [licenseMeta, setLicenseMeta] = useState<LicenseRecord | null>(null);
  const [licenseCryptoEpoch, setLicenseCryptoEpoch] = useState<number | null>(null);
  
  // Local Settings (kept in LS for simplicity as they are preference-based)
  const [accountTypes, setAccountTypes] = useState<string[]>(() => {
    try {
        const saved = localStorage.getItem('meumei_account_types');
        return saved ? JSON.parse(saved) : DEFAULT_ACCOUNT_TYPES;
    } catch { return DEFAULT_ACCOUNT_TYPES; }
  });

  const [expenseCategories, setExpenseCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState<string[]>(DEFAULT_INCOME_CATEGORIES);

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { registerHandlers, setHighlightTarget } = useGlobalActions();
  const canAccessSettings = Boolean(currentUser);
  const {
    isOpen: isPwaInstallOpen,
    isInstalled: isPwaInstalled,
    mode: pwaInstallMode,
    openModalAutoIfEligible,
    openModalManual,
    closePwaModal,
    triggerInstall
  } = usePwaInstallPrompt();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      openModalAutoIfEligible();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openModalAutoIfEligible]);

  const handleSystemReset = async (): Promise<void> => {
    const licenseId = currentUser?.licenseId;
    if (!licenseId) {
      console.warn('[reset] license_missing');
      return;
    }
    setIsLoading(true);
    try {
      console.info('[reset-cloud] start', { licenseId });
      const result = await resetTenantData(licenseId);
      console.info('[reset-cloud] done', { summary: result });
      setAccounts([]);
      setExpenses([]);
      setIncomes([]);
      setLicenseCryptoEpoch(null);
      setCreditCards([]);
      setAccountTypes(DEFAULT_ACCOUNT_TYPES);
      setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
      setIncomeCategories(DEFAULT_INCOME_CATEGORIES);
      setViewDate(new Date());
      setCurrentView(ViewState.DASHBOARD);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('[reset-cloud] error', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
      const run = () => {
          if (!authLoading) {
              setAuthTimeoutHit(false);
              return;
          }
          setAuthTimeoutHit(false);
          const timer = window.setTimeout(() => {
              console.warn('[auth] login loading timeout reached');
              setAuthTimeoutHit(true);
          }, 10_000);
          return () => clearTimeout(timer);
      };
      if (isStandalone) {
          try {
              return run();
          } catch (error) {
              console.error('[pwa][boot]', error);
              return;
          }
      }
      return run();
  }, [authLoading, isStandalone]);

  useEffect(() => {
      const opts = auth.app.options as any;
      const projectId = opts?.projectId || 'unknown';
      const authDomain = opts?.authDomain || 'unknown';
      console.info('[auth] firebase config', { projectId, authDomain });
  }, []);

  const loadPreferencesFor = async (licenseId: string, targetEmail: string) => {
      if (!targetEmail || !licenseId) return;
      setPreferencesLoading(true);
      try {
          const pref = await preferencesService.getPreferences(targetEmail, licenseId);
          if (pref.theme) {
              setTheme(pref.theme as ThemePreference);
          }
      } catch (error) {
          console.error('[prefs] error', { step: 'load-apply', message: (error as any)?.message });
      } finally {
          setPreferencesLoading(false);
      }
  };

  useEffect(() => {
      let isActive = true;
      const emailFromAuth = authUser?.email || '';
      const uid = authUser?.uid || '';
      const emailRawInput = loginEmail;
      let normalizedEmail = '';
      try {
          normalizedEmail = normalizeEmail(emailFromAuth);
      } catch {
          normalizedEmail = emailFromAuth.trim().toLowerCase();
      }
      if (!emailFromAuth || !uid || !normalizedEmail) {
          setCurrentUser(null);
          setCurrentView(ViewState.LOGIN);
          setLicenseResolveState('idle');
          setResolvedLicenseId(null);
          setLicenseReason(null);
          setLicenseBlockedDetail('');
          return;
      }

      const setupUser = (licenseId: string) => {
          if (!isActive) return;
          let normalizedLicenseId = licenseId;
          try {
              normalizedLicenseId = normalizeEmail(licenseId);
          } catch {
              // keep original license id
          }
          setCurrentUser({
              username: authUser?.displayName || authUser?.email || authUser?.uid || 'Usuário',
              licenseId: normalizedLicenseId,
              tenantId: normalizedLicenseId,
              email: normalizedEmail
          });
          setCurrentView(prev => prev === ViewState.LOGIN ? ViewState.DASHBOARD : prev);
          setResolvedLicenseId(normalizedLicenseId);
          setLicenseResolveState('ready');
          setLicenseReason(null);
          setLicenseBlockedDetail('');
      };

      const blockAccess = (reason: LicenseAccessReason, detail?: string) => {
          if (!isActive) return;
          setLicenseResolveState('blocked');
          setLicenseReason(reason);
          setLicenseBlockedDetail(detail || '');
          setCurrentUser(null);
          setResolvedLicenseId(null);
          console.warn('[gate] validate_blocked', { reason, detail });
      };

      const ensureAccess = async () => {
          const gateKey = `${uid}:${licenseRetryToken}`;
          if (gateRunRef.current === gateKey) {
              return;
          }
          gateRunRef.current = gateKey;
          console.info('[gate] identity', {
              emailFromAuth,
              emailNormalized: normalizedEmail,
              uid
          });
          setLicenseResolveState('loading');
          setLicenseReason(null);
          setLicenseBlockedDetail('');
          const licenseId = normalizedEmail;
          console.info('[gate] resolve_license_ok', { licenseId });
          let licenseSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
          try {
              licenseSnap = await withTimeout(
                  getDoc(doc(db, 'licenses', licenseId)),
                  RESOLVE_TIMEOUT_MS
              );
              console.info('[gate] license_doc', { path: `licenses/${licenseId}`, exists: licenseSnap.exists() });
          } catch (error: any) {
              const message = String(error?.message || '');
              console.warn('[gate] license_doc_error', { path: `licenses/${licenseId}`, message });
          }

          if (licenseSnap?.exists()) {
              const statusRaw = String(licenseSnap.data()?.licenseStatus || licenseSnap.data()?.status || 'active');
              const statusNormalized = statusRaw.trim().toLowerCase();
              if (statusNormalized && statusNormalized !== 'active') {
                  blockAccess('inactive', statusRaw);
                  return;
              }
              setupUser(licenseId);
              console.info('[gate] resolved', { email: normalizedEmail, licenseId, ok: true });
              await loadPreferencesFor(licenseId, normalizedEmail);
              console.info('[gate] validate_ok', { licenseId, via: 'owner' });
              return;
          }
          blockAccess('not_found', 'Assinatura não encontrada');
      };

      if (isStandalone) {
          void ensureAccess().catch(error => console.error('[pwa][boot]', error));
      } else {
          void ensureAccess();
      }

      return () => {
          isActive = false;
      };
  }, [authUser?.email, authUser?.uid, licenseRetryToken, isStandalone]);

  const licenseBlockedCopy = (reason?: LicenseAccessReason) => {
      switch (reason) {
          case 'inactive':
              return {
                  title: 'Assinatura inativa',
                  description:
                      'Seu acesso foi desativado para esta licença. Solicite ao responsável a reativação.',
                  cta: 'Fechar'
              };
          case 'not_authorized':
          case 'not_found':
              return {
                  title: 'Usuário não autorizado',
                  description:
                      'Seu e-mail não está autorizado para acessar esta licença. Solicite acesso ao administrador.',
                  cta: 'Fechar'
              };
          case 'permission_denied':
              return {
                  title: 'Acesso negado',
                  description:
                      'Você não tem permissão para ler os dados desta licença. Solicite ao responsável que ajuste as regras ou papéis no Firebase.',
                  cta: 'Entendi'
              };
          case 'timeout':
              return {
                  title: 'Tempo limite atingido',
                  description:
                      'Demorou demais para validar sua licença. Pode ser falha de rede ou de permissão. Tente novamente.',
                  cta: 'Tentar novamente'
              };
          default:
              return {
                  title: 'Erro ao validar acesso',
                  description:
                      'Ocorreu um erro inesperado ao verificar sua licença. Tente sair e entrar novamente ou entre em contato com o suporte.',
                  cta: 'Fechar',
                  code: 'ACCESS_CHECK_FAILED'
              };
      }
  };

  const renderAuthLoading = () => (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
          <div className="flex items-center gap-3 text-lg font-semibold">
              <Loader2 className="animate-spin" /> Carregando sessão segura...
          </div>
      </div>
  );

  const renderAuthExpired = () => (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md w-full space-y-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Sessão expirada</p>
              <h1 className="text-2xl font-bold">Faça login novamente</h1>
              <p className="text-sm text-slate-200">
                  O carregamento da sessão demorou demais. Limpe a sessão e entre novamente para continuar.
              </p>
              <button
                  onClick={() => {
                      setCurrentView(ViewState.LOGIN);
                      window.location.href = '/login';
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-3 rounded-xl transition"
              >
                  Ir para o login
              </button>
          </div>
      </div>
  );

  const renderLicenseLoading = () => (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
          <div className="flex items-center gap-3 text-lg font-semibold">
              <Loader2 className="animate-spin" /> Validando licença...
          </div>
      </div>
  );

  const renderLicenseBlocked = () => {
      const copy = licenseBlockedCopy(licenseReason);
      return (
          <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white px-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full space-y-5 text-center">
                  <div className="flex justify-center">
                      <ShieldOff size={40} className="text-amber-300" />
                  </div>
                  <h1 className="text-2xl font-bold">{copy.title}</h1>
                  <p className="text-slate-200 text-sm">{copy.description}</p>
                  {copy.code && (
                    <p className="text-[11px] text-slate-400 font-mono">Código interno: {copy.code}</p>
                  )}
                  {licenseBlockedDetail && (
                    <p className="text-[11px] text-slate-400 font-mono break-words">{licenseBlockedDetail}</p>
                  )}
                  <div className="text-xs text-slate-400">
                      E-mail autenticado: <strong>{authUser?.email || 'desconhecido'}</strong>
                  </div>
                  <div className="flex flex-col gap-3">
                      <button
                          onClick={handleLicenseRetry}
                          className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-3 rounded-xl transition"
                      >
                          Tentar novamente
                      </button>
                      <a
                          href={PURCHASE_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full inline-flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold px-4 py-3 rounded-xl transition hover:bg-slate-100"
                      >
                          <ExternalLink size={16} /> Entrar em contato
                      </a>
                      <button
                          onClick={() => authLogout()}
                          className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-4 py-3 rounded-xl transition"
                      >
                          <LogOut size={16} /> Sair
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  const minTransactionDate = useMemo(() => {
      const baseDate = companyInfo.startDate ? new Date(companyInfo.startDate + 'T12:00:00') : new Date();
      return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-01`;
  }, [companyInfo.startDate]);

  const minViewDate = useMemo(() => {
      const base = new Date(minTransactionDate + 'T12:00:00');
      base.setHours(0, 0, 0, 0);
      return base;
  }, [minTransactionDate]);

  const resolveActiveLicenseId = () => {
      if (currentUser?.licenseId) return currentUser.licenseId;
      return null;
  };

  const resolveCryptoEpoch = () => {
      if (cryptoStatus !== 'ready') {
          console.warn('[crypto][warn] write blocked', { reason: cryptoStatus });
          return null;
      }
      if (!licenseCryptoEpoch) {
          console.warn('[crypto][warn] write blocked', { reason: 'epoch_missing' });
          return null;
      }
      return licenseCryptoEpoch;
  };

  useEffect(() => {
      metricsSnapshotRef.current = {
          accounts: null,
          expenses: null,
          incomes: null,
          logged: false
      };
  }, [currentUser?.licenseId]);

  const updateAdminMetricsIfReady = (
      licenseId: string,
      partial: Partial<{ accounts: number; expenses: number; incomes: number }>
  ) => {
      const snapshot = metricsSnapshotRef.current;
      if (partial.accounts !== undefined) snapshot.accounts = partial.accounts;
      if (partial.expenses !== undefined) snapshot.expenses = partial.expenses;
      if (partial.incomes !== undefined) snapshot.incomes = partial.incomes;
      if (snapshot.logged) return;
      if (snapshot.accounts === null || snapshot.expenses === null || snapshot.incomes === null) return;
      snapshot.logged = true;
      void dataService.updateAdminMetrics(licenseId, {
          accountsCount: snapshot.accounts,
          expensesCount: snapshot.expenses,
          incomesCount: snapshot.incomes
      });
  };

  const applyRemoteCategories = (type: CategoryType, items: string[]) => {
      if (type === 'incomes') {
          setIncomeCategories(items);
      } else {
          setExpenseCategories(items);
      }
  };

  const reloadCategories = async (licenseId: string, type: CategoryType) => {
      const items = await categoryService.loadCategories(licenseId, type);
      if (items.length > 0) {
          applyRemoteCategories(type, items);
          return items;
      }
      return [];
  };

  const handleAddCategory = async (type: CategoryType, name: string) => {
      const licenseId = resolveActiveLicenseId();
      if (!licenseId) {
          console.warn('[categories] add_skipped', { type, reason: 'license_missing' });
          throw new Error('Licença não resolvida.');
      }
      await categoryService.addCategory(licenseId, type, name);
      const reloaded = await reloadCategories(licenseId, type);
      if (reloaded.length === 0) {
          console.warn('[categories] fallback_local', { licenseId, type, reason: 'empty_after_add' });
      }
  };

  const handleRemoveCategory = async (type: CategoryType, name: string) => {
      const licenseId = resolveActiveLicenseId();
      if (!licenseId) {
          console.warn('[categories] remove_skipped', { type, reason: 'license_missing' });
          throw new Error('Licença não resolvida.');
      }
      await categoryService.removeCategory(licenseId, type, name);
      const reloaded = await reloadCategories(licenseId, type);
      if (reloaded.length === 0) {
          console.warn('[categories] fallback_local', { licenseId, type, reason: 'empty_after_remove' });
      }
  };

  const loadData = async (licenseId: string) => {
      setIsLoading(true);
      try {
          const cryptoEpoch = await dataService.ensureCryptoEpoch(licenseId);
          setLicenseCryptoEpoch(cryptoEpoch);
          console.info('[crypto][epoch] ready', { licenseId, cryptoEpoch });
          const licenseRecord = await dataService.getLicenseRecord(licenseId);
          setLicenseMeta(licenseRecord || null);
          const companySource = licenseRecord?.companyInfo || (await dataService.getCompany(licenseId));
          if (companySource) {
              const normalizedStartDate = companySource.startDate
                  ? (companySource.startDate > COMPANY_DATA.monthStartISO ? COMPANY_DATA.monthStartISO : companySource.startDate)
                  : COMPANY_DATA.monthStartISO;
              const companyWithAdjustedStart = { ...companySource, startDate: normalizedStartDate };
              setCompanyInfo(companyWithAdjustedStart);
              if (companyWithAdjustedStart.startDate) {
                  const parts = companyWithAdjustedStart.startDate.split('-');
                  if (parts.length === 3) {
                      const today = new Date();
                      const start = new Date(parseInt(parts[0]), parseInt(parts[1])-1, 1);
                  }
              }
          }
      } catch (error) {
          console.error("Failed to load data", error);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      if (!currentUser?.licenseId) return;
      const run = () => {
          loadData(currentUser.licenseId);
      };
      if (isStandalone) {
          try {
              run();
          } catch (error) {
              console.error('[pwa][boot]', error);
          }
          return;
      }
      run();
  }, [currentUser, isStandalone]);

  const isExpenseView = [
      ViewState.VARIABLE_EXPENSES,
      ViewState.FIXED_EXPENSES,
      ViewState.PERSONAL_EXPENSES
  ].includes(currentView);
  const needsAccounts =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.ACCOUNTS ||
      currentView === ViewState.INCOMES ||
      currentView === ViewState.INVOICES ||
      currentView === ViewState.YIELDS ||
      isExpenseView;
  const needsExpenses =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.INVOICES ||
      currentView === ViewState.REPORTS ||
      isExpenseView;
  const needsIncomes =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.INCOMES ||
      currentView === ViewState.REPORTS;
  const needsCreditCards =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.INVOICES ||
      currentView === ViewState.REPORTS ||
      isExpenseView;

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !licenseCryptoEpoch || !needsAccounts) return;
      console.info('[realtime][accounts] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeAccounts(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][accounts] snapshot', { count: items.length });
              setAccounts(items);
              updateAdminMetricsIfReady(licenseId, { accounts: items.length });
          },
          (error) => {
              console.error('[realtime][accounts] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      return () => {
          unsubscribe();
          console.info('[realtime][accounts] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, licenseCryptoEpoch, needsAccounts, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !licenseCryptoEpoch || !needsExpenses) return;
      console.info('[realtime][expenses] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeExpenses(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][expenses] snapshot', { count: items.length });
              setExpenses(items);
              updateAdminMetricsIfReady(licenseId, { expenses: items.length });
          },
          (error) => {
              console.error('[realtime][expenses] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      return () => {
          unsubscribe();
          console.info('[realtime][expenses] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, licenseCryptoEpoch, needsExpenses, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !licenseCryptoEpoch || !needsIncomes) return;
      console.info('[realtime][incomes] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeIncomes(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][incomes] snapshot', { count: items.length });
              setIncomes(items);
              updateAdminMetricsIfReady(licenseId, { incomes: items.length });
          },
          (error) => {
              console.error('[realtime][incomes] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      return () => {
          unsubscribe();
          console.info('[realtime][incomes] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, licenseCryptoEpoch, needsIncomes, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !needsCreditCards) return;
      console.info('[realtime][credit_cards] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeCreditCards(
          licenseId,
          {},
          (items) => {
              console.info('[realtime][credit_cards] snapshot', { count: items.length });
              setCreditCards(items);
          },
          (error) => {
              console.error('[realtime][credit_cards] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      return () => {
          unsubscribe();
          console.info('[realtime][credit_cards] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, needsCreditCards, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId) return;
      let isActive = true;
      const loadCategories = async () => {
          const loadAndEnsure = async (type: CategoryType, defaults: string[]) => {
              try {
                  const initial = await categoryService.loadCategories(licenseId, type);
                  if (initial.length > 0) {
                      if (isActive) applyRemoteCategories(type, initial);
                      return;
                  }
                  if (defaults.length > 0) {
                      await categoryService.ensureDefaultCategories(licenseId, type, defaults);
                      const reloaded = await categoryService.loadCategories(licenseId, type);
                      if (reloaded.length > 0) {
                          if (isActive) applyRemoteCategories(type, reloaded);
                          return;
                      }
                  }
                  console.warn('[categories] fallback_local', { licenseId, type, reason: 'no_doc' });
                  if (isActive) applyRemoteCategories(type, defaults);
              } catch (error) {
                  console.warn('[categories] fallback_local', { licenseId, type, reason: 'load_failed' });
                  if (isActive) applyRemoteCategories(type, defaults);
              }
          };

          await loadAndEnsure('incomes', DEFAULT_INCOME_CATEGORIES);
          await loadAndEnsure('expenses', DEFAULT_EXPENSE_CATEGORIES);
      };

      const run = async () => {
          await loadCategories();
      };

      if (isStandalone) {
          void run().catch(error => console.error('[pwa][boot]', error));
      } else {
          void run();
      }

      return () => {
          isActive = false;
      };
  }, [currentUser?.licenseId, isStandalone]);

  useEffect(() => {
      try {
          localStorage.setItem('meumei_account_types', JSON.stringify(accountTypes));
      } catch (error) {
          if (isStandalone) {
              console.error('[pwa][boot]', error);
          }
      }
  }, [accountTypes, isStandalone]);

  useEffect(() => {
    try {
      const root = window.document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(theme);
    } catch (error) {
      if (isStandalone) {
        console.error('[pwa][boot]', error);
      }
    }
  }, [theme, isStandalone]);

  useEffect(() => {
      if (!canAccessSettings && currentView === ViewState.SETTINGS) {
          setCurrentView(ViewState.DASHBOARD);
      }
  }, [canAccessSettings, currentView]);

  const resolveViewForPayload = (payload: NavigatePayload): ViewState | null => {
      if (payload.view) return payload.view;
      switch (payload.entity) {
          case 'expense':
              if (payload.subtype === 'personal') return ViewState.PERSONAL_EXPENSES;
              if (payload.subtype === 'fixed') return ViewState.FIXED_EXPENSES;
              return ViewState.VARIABLE_EXPENSES;
          case 'income':
              return ViewState.INCOMES;
          case 'account':
              return ViewState.ACCOUNTS;
          case 'card':
              return ViewState.INVOICES;
          case 'earning':
              return ViewState.YIELDS;
          default:
              return null;
      }
  };

  useEffect(() => {
      const unregister = registerHandlers({
          navigateToResult: (payload) => {
              const targetView = resolveViewForPayload(payload);
              if (targetView) {
                  setHighlightTarget(payload);
                  setCurrentView(targetView);
              }
          }
      });
      return unregister;
  }, [registerHandlers, setHighlightTarget]);

  const handleThemeChange = (newTheme: ThemePreference) => {
      setTheme(newTheme);
      const licenseId = currentUser?.licenseId || currentUser?.tenantId || null;
      const email = authUser?.email || authUser?.uid || null;
      if (!licenseId || !email) {
          console.error('[prefs] error', { step: 'save', message: 'missing_license_or_email' });
          return;
      }
      preferencesService
        .setTheme(
          email,
          newTheme,
          licenseId
        )
        .catch(() => {
          // persist silently
        });
  };

  // --- ACTIONS ---

  const handleLogout = async () => {
      if (logoutInProgress) return;
      console.log('[auth] logout start');
      setLogoutInProgress(true);
      setHasLoggedOut(true);
      setCurrentUser(null);
      setAccounts([]);
      setExpenses([]);
      setIncomes([]);
      setCurrentView(ViewState.LOGIN);
      setLicenseResolveState('idle');
      setResolvedLicenseId(null);
      setLicenseReason(null);
      setLogoutMessage('Você foi desconectado. Faça login novamente.');
      try {
          await authLogout();
          console.log('[auth] logout success');
      } catch (error) {
          console.error('[auth] logout failure', error);
      } finally {
          setLogoutInProgress(false);
      }
  };

  // --- DATA MODIFIERS (Optimistic UI + Firebase) ---

  const handleUpdateCompany = async (newInfo: CompanyInfo) => {
      const activeLicenseId = resolveActiveLicenseId();
      if (!activeLicenseId) {
          console.warn('Licença ativa não encontrada ao salvar dados da empresa.');
          return;
      }
      setCompanyInfo(newInfo);
      try {
          await dataService.saveCompany(newInfo, activeLicenseId);
          const refreshed = await dataService.getLicenseRecord(activeLicenseId);
          if (refreshed?.companyInfo) {
              setCompanyInfo(refreshed.companyInfo);
          }
          setLicenseMeta(refreshed || null);
      } catch (err) {
          console.error('Falha ao salvar dados da empresa', err);
      }
  };

  const handleAuditLog = async (entry: AuditLogInput) => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId) return;
      const userEmail = entry.userEmail || currentUser?.email || authUser?.email || null;
      try {
          await auditService.addLog(licenseId, { ...entry, userEmail });
      } catch (error) {
          console.error('[audit] add_failed', error);
      }
  };

  const handleUpdateAccounts = async (updated: Account[]) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      const nextAccounts: Account[] = [];
      const updatedById = new Map(updated.map(account => [account.id, account]));
      accounts.forEach(existing => {
          if (existing.locked) {
              nextAccounts.push(existing);
              return;
          }
          const next = updatedById.get(existing.id);
          nextAccounts.push(next ?? existing);
      });
      updated.forEach(account => {
          if (!accounts.some(existing => existing.id === account.id)) {
              nextAccounts.push(account);
          }
      });
      setAccounts(nextAccounts);
      try {
          const toPersist = nextAccounts.filter(account => !account.locked);
          await dataService.upsertAccounts(toPersist, currentUser.licenseId, cryptoEpoch);
      } catch (err) {
          console.error('Failed to persist accounts', err);
      }
  };

  const handleDeleteAccount = (id: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      const account = accounts.find(acc => acc.id === id);
      if (account?.locked) {
          return;
      }
      if (account) {
          handleAuditLog({
              actionType: 'account_deleted',
              description: `Conta ${account.name} excluída.`,
              entityType: 'account',
              entityId: account.id,
              metadata: {
                  name: account.name,
                  type: account.type,
                  currentBalance: account.currentBalance
              }
          });
      }
      setAccounts(prev => prev.filter(a => a.id !== id));
      dataService.deleteAccount(id, currentUser.licenseId);
  };

  const handleUpdateExpenses = (updated: Expense[]) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      setExpenses(updated);
      // Batch save for efficiency in UI, but simple service call here
      dataService.upsertExpenses(updated.filter(exp => !exp.locked), currentUser.licenseId, cryptoEpoch);
  };

  const handleDeleteExpense = (id: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      
      // Handle Balance Reversal Logic locally first
      const exp = expenses.find(e => e.id === id);
      if (exp) {
          handleAuditLog({
              actionType: 'expense_deleted',
              description: `Despesa "${exp.description}" excluída (${formatCurrency(exp.amount)}).`,
              entityType: 'expense',
              entityId: exp.id,
              metadata: {
                  description: exp.description,
                  amount: exp.amount,
                  category: exp.category,
                  dueDate: exp.dueDate
              }
          });
      }
      if (exp && exp.status === 'paid' && exp.accountId) {
          const accIndex = accounts.findIndex(a => a.id === exp.accountId);
          if (accIndex > -1) {
              const newAccounts = [...accounts];
              newAccounts[accIndex].currentBalance += Number(exp.amount);
              setAccounts(newAccounts);
              if (!newAccounts[accIndex].locked) {
                  dataService.upsertAccount(newAccounts[accIndex], currentUser.licenseId, cryptoEpoch);
              }
          }
      }

      setExpenses(prev => prev.filter(e => e.id !== id));
      dataService.deleteExpense(id, currentUser.licenseId);
  };

  const handleUpdateIncomes = (updated: Income[]) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      setIncomes(updated);
      dataService.upsertIncomes(updated.filter(inc => !inc.locked), currentUser.licenseId, cryptoEpoch);
  };

  const handleDeleteIncome = (id: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      const inc = incomes.find(i => i.id === id);
      if (inc) {
          handleAuditLog({
              actionType: 'income_deleted',
              description: `Receita "${inc.description}" excluída (${formatCurrency(inc.amount)}).`,
              entityType: 'income',
              entityId: inc.id,
              metadata: {
                  description: inc.description,
                  amount: inc.amount,
                  category: inc.category,
                  date: inc.date
              }
          });
      }
      if (inc && inc.status === 'received' && inc.accountId) {
          const accIndex = accounts.findIndex(a => a.id === inc.accountId);
          if (accIndex > -1) {
              const newAccounts = [...accounts];
              newAccounts[accIndex].currentBalance -= Number(inc.amount);
              setAccounts(newAccounts);
              if (!newAccounts[accIndex].locked) {
                  dataService.upsertAccount(newAccounts[accIndex], currentUser.licenseId, cryptoEpoch);
              }
          }
      }

      setIncomes(prev => prev.filter(i => i.id !== id));
      dataService.deleteIncome(id, currentUser.licenseId);
  };

  const handleUpdateCreditCards = (cards: CreditCard[]) => {
      if (!currentUser?.licenseId) return;
      const previous = creditCards;
      setCreditCards(cards);

      const removedCards = previous.filter(prev => !cards.some(c => c.id === prev.id));
      removedCards.forEach(card => {
          dataService.deleteCreditCard(card.id, currentUser.licenseId);
      });

      cards.forEach(c => dataService.upsertCreditCard(c, currentUser.licenseId));
  };

  const handlePayInvoice = (expenseIds: string[], sourceAccountId: string, totalAmount: number) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      // 1. Debit Account
      const newAccounts = [...accounts];
      const accIdx = newAccounts.findIndex(a => a.id === sourceAccountId);
      if (accIdx > -1) {
          newAccounts[accIdx].currentBalance -= Number(totalAmount);
          setAccounts(newAccounts);
          if (!newAccounts[accIdx].locked) {
              dataService.upsertAccount(newAccounts[accIdx], currentUser.licenseId, cryptoEpoch);
          }
      }

      // 2. Mark Expenses Paid
      const newExpenses = expenses.map(exp => {
          if (expenseIds.includes(exp.id)) {
              return { ...exp, status: 'paid' as const };
          }
          return exp;
      });
      setExpenses(newExpenses);
      
      const changed = newExpenses.filter(e => expenseIds.includes(e.id));
      dataService.upsertExpenses(changed.filter(exp => !exp.locked), currentUser.licenseId, cryptoEpoch);
  };

  // --- DATE LOGIC ---
  const handleMonthChange = (increment: number) => {
      const newDate = new Date(viewDate);
      newDate.setMonth(newDate.getMonth() + increment);
      newDate.setHours(0, 0, 0, 0);

      if (newDate < minViewDate) {
          setViewDate(new Date(minViewDate));
          return;
      }

      setViewDate(newDate);
  };

  useEffect(() => {
      if (viewDate < minViewDate) {
          setViewDate(new Date(minViewDate));
      }
  }, [minViewDate, viewDate]);

  // --- RENDER HELPERS ---
  
  const currentMonthIncomes = incomes.filter(i => {
      const d = new Date(i.date + 'T12:00:00');
      return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
  });
  
  const currentMonthExpenses = expenses.filter(e => {
      const d = new Date(e.dueDate + 'T12:00:00');
      return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
  });

  const expenseBreakdown = {
      fixed: currentMonthExpenses.filter(e => e.type === 'fixed').reduce((acc, curr) => acc + curr.amount, 0),
      variable: currentMonthExpenses.filter(e => e.type === 'variable').reduce((acc, curr) => acc + curr.amount, 0),
      personal: currentMonthExpenses.filter(e => e.type === 'personal').reduce((acc, curr) => acc + curr.amount, 0),
  };

  const totalBalance = accounts.reduce((acc, curr) => acc + curr.currentBalance, 0);
  const totalIncome = currentMonthIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpenses = currentMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const pendingIncome = currentMonthIncomes.filter(i => i.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  const pendingExpenses = currentMonthExpenses.filter(e => e.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  
  // PJ Annual Revenue (MEI Limit Check)
  const annualMeiRevenue = incomes
      .filter(inc => {
          const d = new Date(inc.date + 'T12:00:00');
          return d.getFullYear() === viewDate.getFullYear() && inc.taxStatus !== 'PF';
      })
      .reduce((acc, curr) => acc + curr.amount, 0);

  const hasEpochLocked = useMemo(() => {
      return (
          accounts.some(acc => acc.lockedReason === 'epoch_mismatch') ||
          expenses.some(exp => exp.lockedReason === 'epoch_mismatch') ||
          incomes.some(inc => inc.lockedReason === 'epoch_mismatch')
      );
  }, [accounts, expenses, incomes]);

  useEffect(() => {
      if (hasEpochLocked && !recoveryLoggedRef.current) {
          console.info('[ui][state] recovery mode active');
          recoveryLoggedRef.current = true;
      }
  }, [hasEpochLocked]);

const renderLayout = (content: React.ReactNode, options?: { skipMobileOffset?: boolean }) => {
    const shouldOffset = isMobile && !options?.skipMobileOffset;
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 pb-20">
            <GlobalHeader 
                companyName={companyInfo.name}
                username={currentUser?.email || ''}
                viewDate={viewDate}
                onMonthChange={handleMonthChange}
                canGoBack={true}
                theme={theme}
                onThemeChange={handleThemeChange}
                onOpenSettings={() => canAccessSettings && setCurrentView(ViewState.SETTINGS)}
                onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                onLogout={handleLogout}
                onCompanyClick={() => setCurrentView(ViewState.COMPANY_DETAILS)}
                onOpenCalculator={() => setIsCalculatorOpen(true)}
                onOpenAudit={() => setIsAuditModalOpen(true)}
                canAccessSettings={canAccessSettings}
            />
            <div style={shouldOffset ? { paddingTop: 'var(--mm-mobile-top, 92px)' } : undefined}>
                {cryptoStatus !== 'ready' && (
                    <div className="mx-auto mt-4 max-w-5xl px-4">
                        <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-900/10 px-4 py-3 text-amber-700 dark:text-amber-300 text-sm">
                            Configuração de segurança pendente: defina <span className="font-semibold">VITE_CRYPTO_SALT</span>. Modo protegido ativo (somente leitura).
                        </div>
                    </div>
                )}
                {hasEpochLocked && (
                    <div className="mx-auto mt-4 max-w-5xl px-4">
                        <div className="rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/80 dark:bg-blue-900/10 px-4 py-3 text-blue-700 dark:text-blue-300 text-sm">
                            Dados anteriores arquivados por atualização de segurança. Itens históricos permanecem visíveis, mas não podem ser editados.
                        </div>
                    </div>
                )}
                {content}
            </div>
        </div>
    );
};

 

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (loginLoading) return;
      if (!loginEmail.trim()) {
          setLoginError('Informe o e-mail.');
          return;
      }
      setLoginError('');
      setLoginErrorCode('');
      setResetPasswordMessage(null);
      setLoginLoading(true);
      try {
          const emailKey = loginEmail.trim().toLowerCase();
          console.info('[auth] signIn_start', {
              email_normalized: emailKey,
              projectId: firebaseDebugInfo.projectId
          });
          if (!loginPassword) {
              setLoginError('Informe sua senha para entrar.');
              return;
          }
          await authLogin(emailKey, loginPassword);
          console.info('[auth] signIn_result', { ok: true, email: emailKey, uid: auth.currentUser?.uid });
      } catch (error: any) {
          const code = error?.code || 'unknown';
          const httpStatus =
            error?.customData?._tokenResponse?.error?.code ||
            error?.customData?._tokenResponse?.error?.status ||
            error?.status ||
            error?.statusCode ||
            null;
          console.error('[auth] signIn_error', {
            code,
            message: error?.message,
            httpStatus,
            origin: firebaseDebugInfo.origin,
            projectId: firebaseDebugInfo.projectId,
            authDomain: firebaseDebugInfo.authDomain,
            apiKeyPrefix: firebaseDebugInfo.apiKeyPrefix
          });
          setLoginErrorCode(code);
          switch (code) {
              case 'auth/wrong-password':
                  setLoginError('Senha incorreta. Tente novamente.');
                  break;
              case 'auth/user-not-found':
                  setLoginError('Conta não encontrada para este e-mail.');
                  break;
              case 'auth/too-many-requests':
                  setLoginError('Muitas tentativas. Tente novamente mais tarde.');
                  break;
              case 'auth/network-request-failed':
                  setLoginError('Falha de rede. Verifique sua conexão.');
                  break;
              case 'auth/invalid-credential':
              case 'auth/invalid-login-credentials':
                  setLoginError('Credenciais inválidas. Tente novamente.');
                  break;
              default:
                  setLoginError('Credenciais inválidas. Tente novamente.');
                  break;
          }
      } finally {
          setLoginLoading(false);
      }
  };

  useEffect(() => {
      if (authUser) {
          setHasLoggedOut(false);
          setLogoutMessage(null);
          setLoginError('');
          setLoginErrorCode('');
          setLoginEmail('');
          setLoginPassword('');
          setResetPasswordMessage(null);
      }
  }, [authUser]);

  const handleResetPassword = async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setResetPasswordMessage(null);
      if (!loginEmail.trim()) {
          setLoginError('Informe o e-mail para redefinir a senha.');
          return;
      }
      const emailKey = loginEmail.trim().toLowerCase();
      try {
          console.info('[auth] action=reset_password', { email_raw: loginEmail, email_normalized: emailKey });
          await authResetPassword(emailKey);
          setResetPasswordMessage('Enviamos um e-mail para redefinir sua senha.');
          console.info('[auth] reset_password_requested=success');
      } catch (error: any) {
          const code = error?.code || 'unknown';
          console.error('[auth] reset_password_requested=error', { code, error });
          switch (code) {
              case 'auth/user-not-found':
                  setResetPasswordMessage('Não encontramos uma conta com esse e-mail.');
                  break;
              case 'auth/invalid-email':
                  setResetPasswordMessage('E-mail inválido.');
                  break;
              default:
                  setResetPasswordMessage('Não foi possível enviar o e-mail agora. Tente novamente.');
                  break;
          }
      }
  };


  const renderLoggedOutFallback = () => {
      console.info('[login] render', { emailPresent: Boolean(loginEmail) });
      return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md w-full space-y-4 text-center">
              {(() => {
                  const showLogoutCopy = hasLoggedOut;
                  if (showLogoutCopy) {
                      return (
                          <>
                              <p className="text-emerald-300 text-xs uppercase tracking-[0.3em]">Sessão encerrada</p>
                              <h1 className="text-2xl font-bold">Você foi desconectado.</h1>
                              {logoutMessage && (
                                  <p className="text-sm text-slate-200">
                                      {logoutMessage}
                                  </p>
                              )}
                              <p className="text-xs text-slate-400">
                                  Use as credenciais abaixo para entrar novamente.
                              </p>
                          </>
                      );
                  }
                  return (
                      <>
                          <p className="text-emerald-300 text-xs uppercase tracking-[0.3em]">Acesse sua conta</p>
                          <h1 className="text-2xl font-bold">Acesse sua conta</h1>
                          <p className="text-sm text-slate-200">
                              Entre com seu e-mail e senha
                          </p>
                      </>
                  );
              })()}

              <form onSubmit={handleLoginSubmit} className="space-y-3">
                  <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1 block text-left">Email</label>
                      <input
                          type="email"
                          value={loginEmail}
                          onChange={(event) => setLoginEmail(event.target.value)}
                          className="mt-1 w-full bg-slate-900 border border-slate-700 focus:border-slate-500 focus:ring-slate-500 rounded-xl px-4 py-3 text-sm text-white"
                          placeholder="admin@empresa.com"
                      />
                  </div>
                  <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1 block text-left">Senha</label>
                      <div className="mt-1 relative">
                          <input
                              type={isPasswordVisible ? 'text' : 'password'}
                              value={loginPassword}
                              onChange={(event) => setLoginPassword(event.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 focus:border-slate-500 focus:ring-slate-500 rounded-xl px-4 py-3 pr-10 text-sm text-white"
                              placeholder="Senha segura"
                          />
                          <button
                              type="button"
                              onClick={() => setIsPasswordVisible((prev) => !prev)}
                              aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400/70 hover:text-slate-200 transition"
                          >
                              {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                      </div>
                  </div>
                  {loginError && (
                      <div className="text-xs text-red-400 text-left">
                          <div>{loginError}</div>
                          {debugAuthEnabled && loginErrorCode && (
                              <div className="mt-1 text-[10px] text-slate-400 font-mono">
                                  Código interno: AUTH_SIGNIN_FAILED ({loginErrorCode})
                              </div>
                          )}
                      </div>
                  )}
                  {resetPasswordMessage && (
                      <div className="text-xs text-amber-200 text-left">{resetPasswordMessage}</div>
                  )}
                  <div className="flex items-center justify-end text-xs text-slate-300">
                      <button
                          type="button"
                          onClick={handleResetPassword}
                          className="underline hover:text-white"
                      >
                          Esqueci minha senha
                      </button>
                  </div>
                  <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-3 rounded-xl transition"
                      disabled={loginLoading}
                  >
                      {loginLoading ? 'Entrando...' : 'Entrar'}
                  </button>
              </form>
          </div>
      </div>
      );
  };

  if (authLoading && !authTimeoutHit) {
      return renderAuthLoading();
  }

  if (authLoading && authTimeoutHit) {
      return renderAuthExpired();
  }

  if (authUser && (licenseResolveState === 'idle' || licenseResolveState === 'loading')) {
      return renderLicenseLoading();
  }

  if (authUser && (licenseResolveState === 'blocked' || !resolvedLicenseId)) {
      return renderLicenseBlocked();
  }

  if (!authUser || !currentUser) {
      return renderLoggedOutFallback();
  }

  return (
      <>
        {currentView === ViewState.DASHBOARD && renderLayout(
            <Dashboard 
                onOpenAccounts={() => setCurrentView(ViewState.ACCOUNTS)}
                onOpenVariableExpenses={() => setCurrentView(ViewState.VARIABLE_EXPENSES)}
                onOpenFixedExpenses={() => setCurrentView(ViewState.FIXED_EXPENSES)}
                onOpenPersonalExpenses={() => setCurrentView(ViewState.PERSONAL_EXPENSES)}
                onOpenIncomes={() => setCurrentView(ViewState.INCOMES)}
                onOpenYields={() => setCurrentView(ViewState.YIELDS)}
                onOpenInvoices={() => setCurrentView(ViewState.INVOICES)}
                onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                financialData={{
                    balance: totalBalance,
                    income: totalIncome,
                    expenses: totalExpenses,
                    pendingExpenses,
                    pendingIncome,
                    annualMeiRevenue
                }}
                creditCards={creditCards}
                expenseBreakdown={expenseBreakdown} 
                expenses={expenses}
                incomes={incomes}
                accounts={accounts}
                viewDate={viewDate}
                minDate={minTransactionDate}
                onOpenInstall={openModalManual}
                isAppInstalled={isPwaInstalled}
            />,
            { skipMobileOffset: true }
        )}

      {currentView === ViewState.REPORTS && renderLayout(
          <ReportsView 
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
             incomes={incomes}
             expenses={expenses}
             viewDate={viewDate}
             companyName={companyInfo.name}
             creditCards={creditCards}
             licenseId={currentUser?.licenseId}
          />
      )}

      {currentView === ViewState.ACCOUNTS && renderLayout(
          <AccountsView 
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
             onDeleteAccount={handleDeleteAccount}
             accountTypes={accountTypes}
             onUpdateAccountTypes={setAccountTypes}
             onAuditLog={handleAuditLog}
             onOpenAudit={() => setIsAuditModalOpen(true)}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.INCOMES && renderLayout(
          <IncomesView 
             incomes={incomes}
             onUpdateIncomes={handleUpdateIncomes}
             onDeleteIncome={handleDeleteIncome}
              accounts={accounts}
              onUpdateAccounts={handleUpdateAccounts}
              viewDate={viewDate}
              minDate={minTransactionDate}
              categories={incomeCategories}
              licenseId={currentUser?.licenseId || null}
             onAddCategory={(name) => handleAddCategory('incomes', name)}
             onRemoveCategory={(name) => handleRemoveCategory('incomes', name)}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.YIELDS && renderLayout(
          <YieldsView 
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
             viewDate={viewDate}
             licenseId={currentUser?.licenseId || null}
             licenseCryptoEpoch={licenseCryptoEpoch}
             onAuditLog={handleAuditLog}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.INVOICES && renderLayout(
          <FaturasErrorBoundary>
              <InvoicesView 
                 onBack={() => setCurrentView(ViewState.DASHBOARD)}
                 expenses={expenses}
                 creditCards={creditCards}
                 accounts={accounts}
                 onPayInvoice={handlePayInvoice}
                 onUpdateExpenses={handleUpdateExpenses}
                 onUpdateCreditCards={handleUpdateCreditCards}
                 categories={expenseCategories}
                 onUpdateCategories={(next) => {
                     if (next.length > 0) {
                         setExpenseCategories(next);
                     }
                 }}
                 onAddCategory={(name) => handleAddCategory('expenses', name)}
              />
          </FaturasErrorBoundary>,
          { skipMobileOffset: true }
      )}

      {/* Expense Views */}
      {currentView === ViewState.VARIABLE_EXPENSES && renderLayout(
          <ExpensesView 
             title="Despesas Variáveis"
             subtitle="Gerencie seus gastos"
             expenseType="variable"
             themeColor="pink"
             expenses={expenses}
             onUpdateExpenses={handleUpdateExpenses}
             onDeleteExpense={handleDeleteExpense}
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
              creditCards={creditCards}
              viewDate={viewDate}
              minDate={minTransactionDate}
              categories={expenseCategories}
              licenseId={currentUser?.licenseId || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.FIXED_EXPENSES && renderLayout(
          <ExpensesView 
             title="Despesas Fixas"
             subtitle="Contas recorrentes"
             expenseType="fixed"
             themeColor="amber"
             expenses={expenses}
             onUpdateExpenses={handleUpdateExpenses}
             onDeleteExpense={handleDeleteExpense}
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
              creditCards={creditCards}
              viewDate={viewDate}
              minDate={minTransactionDate}
              categories={expenseCategories}
              licenseId={currentUser?.licenseId || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.PERSONAL_EXPENSES && renderLayout(
          <ExpensesView 
             title="Despesas Pessoais"
             subtitle="Retiradas pessoais"
             expenseType="personal"
             themeColor="cyan"
             expenses={expenses}
             onUpdateExpenses={handleUpdateExpenses}
             onDeleteExpense={handleDeleteExpense}
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
              creditCards={creditCards}
              viewDate={viewDate}
              minDate={minTransactionDate}
              categories={expenseCategories}
              licenseId={currentUser?.licenseId || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.COMPANY_DETAILS && renderLayout(
          <CompanyDetailsView
              company={companyInfo}
              onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
      )}

        {currentView === ViewState.SETTINGS && canAccessSettings && (
          <Settings 
            onBack={() => setCurrentView(ViewState.DASHBOARD)}
            licenseId={currentUser?.licenseId}
          companyInfo={companyInfo}
          onUpdateCompany={handleUpdateCompany}
          onSystemReset={handleSystemReset}
          onOpenInstall={openModalManual}
          isAppInstalled={isPwaInstalled}
        />
      )}
      <CalculatorModal 
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
      />
      <AuditLogModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          licenseId={currentUser?.licenseId || null}
      />
      <InstallAppModal
          isOpen={isPwaInstallOpen}
          isInstalled={isPwaInstalled}
          mode={pwaInstallMode}
          onInstall={triggerInstall}
          onClose={closePwaModal}
      />
      {isMobileLandscape && (
          <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#111114] border border-white/10 dark:border-zinc-800 shadow-2xl px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Use em modo retrato</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Esta experiência é otimizada para telas na vertical.
                  </p>
              </div>
          </div>
      )}
      </>
  );
};

const App: React.FC = () => (
  <RecoveryGate>
    <AuthProvider>
      <GlobalActionsProvider>
        <AppInner />
      </GlobalActionsProvider>
    </AuthProvider>
  </RecoveryGate>
);

export default App;
