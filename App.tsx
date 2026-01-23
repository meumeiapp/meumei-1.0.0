import React, { useState, useEffect, useMemo, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import AccountsView from './components/AccountsView';
import ExpensesView from './components/ExpensesView';
import IncomesView from './components/IncomesView';
import YieldsView from './components/YieldsView'; 
import InvoicesView from './components/InvoicesView'; 
import ReportsView from './components/ReportsView';
import DasView from './components/DasView';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import GlobalHeader from './components/GlobalHeader';
import CompanyDetailsView from './components/CompanyDetailsView';
import CalculatorModal from './components/CalculatorModal';
import AuditLogModal from './components/AuditLogModal';
import FaturasErrorBoundary from './components/FaturasErrorBoundary';
import InstallAppModal from './components/InstallAppModal';
import MobileQuickAccessFooter from './components/mobile/MobileQuickAccessFooter';
import DesktopQuickAccessFooter from './components/desktop/DesktopQuickAccessFooter';
import Landing from './Pages/Landing';
import { ViewState, CompanyInfo, Account, CreditCard, Expense, Income, LicenseRecord, ThemePreference } from './types';
import { COMPANY_DATA, DEFAULT_COMPANY_INFO, DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_TYPES, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES } from './constants';
import { dataService } from './services/dataService';
import { categoryService, CategoryType } from './services/categoryService';
import { auditService, AuditLogInput } from './services/auditService';
import { yieldsService, YieldRecord } from './services/yieldsService';
import { computeRealBalances, RealBalanceResult } from './services/realBalanceEngine';
import { onboardingService, OnboardingSettings } from './services/onboardingService';
import { GlobalActionsProvider, useGlobalActions, NavigatePayload } from './contexts/GlobalActionsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
 
import { auth, db, firebaseDebugInfo } from './services/firebase';
import { preferencesService } from './services/preferencesService';
import {
  ArrowUpCircle,
  BarChart3,
  CreditCard as CreditCardIcon,
  FileText,
  Home,
  Loader2,
  LogOut,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldOff,
  ShoppingCart,
  TrendingUp,
  User,
  Wallet
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { normalizeEmail } from './utils/normalizeEmail';
import { resetCurrentSession } from './services/resetService';
import { getCryptoStatus } from './services/cryptoService';
import { getMonthExpenses } from './utils/expenseMonthFilter';
import { isBalanceDebugEnabled, shouldApplyLegacyBalanceMutation } from './utils/legacyBalanceMutation';
import { usePwaInstallPrompt } from './hooks/usePwaInstallPrompt';
import useIsMobile from './hooks/useIsMobile';
import useMobileTopOffset from './hooks/useMobileTopOffset';
import useIsMobileLandscape from './hooks/useIsMobileLandscape';
import APP_VERSION from './appVersion';
import type { AuditEntityType } from './services/auditService';
import { APP_VERSION as LOGIN_APP_VERSION, BUILD_TIME } from './version';
import { BUILD_ID } from './utils/buildInfo';

const PURCHASE_URL = 'https://meumeiapp.web.app/';
const BETA_LANDING_URL = 'https://meumei-d88be.web.app';
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' | 'unknown' }>;
}

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
      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        try {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs
              .map(dbInfo => dbInfo.name)
              .filter((name): name is string => Boolean(name))
              .map(name => new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              }))
          );
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
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const ACCESS_BLOCKED_MESSAGE =
    'Seu acesso ainda não está liberado. Conclua o pagamento para criar sua conta.';
  const [checkoutStatus, setCheckoutStatus] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState('');
  const [checkoutVerifiedEmail, setCheckoutVerifiedEmail] = useState('');
  const [checkoutVerifyLoading, setCheckoutVerifyLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginErrorCode, setLoginErrorCode] = useState('');
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(null);
  const [authTimeoutHit, setAuthTimeoutHit] = useState(false);
  const [licenseBlockedDetail, setLicenseBlockedDetail] = useState('');
  const [licenseResolveState, setLicenseResolveState] = useState<'idle' | 'loading' | 'ready' | 'blocked'>('idle');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [onboardingSettings, setOnboardingSettings] = useState<OnboardingSettings | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(
      typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [currentSearch, setCurrentSearch] = useState(
      typeof window !== 'undefined' ? window.location.search : ''
  );
  const [entitlementStatus, setEntitlementStatus] = useState<'idle' | 'loading' | 'active' | 'none' | 'error'>('idle');
  const [entitlementRetryToken, setEntitlementRetryToken] = useState(0);
  const [entitlementError, setEntitlementError] = useState<{ code?: string; message?: string } | null>(null);
  const [accessFlowState, setAccessFlowState] = useState<
    | 'idle'
    | 'post_checkout_verifying'
    | 'post_checkout_needs_auth'
    | 'post_checkout_granting'
    | 'post_checkout_done'
    | 'pending'
    | 'error'
  >('idle');
  const [installBannerVisible, setInstallBannerVisible] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pwaInstalledFlag, setPwaInstalledFlag] = useState(false);
  const [deferredPromptEvent, setDeferredPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const isMobile = useIsMobile();
  const isMobileLandscape = useIsMobileLandscape();
  useMobileTopOffset();
  const mobileQuickAccessItems = useMemo(
    () => [
      {
        id: 'home',
        label: 'Início',
        shortLabel: 'Início',
        icon: <Home size={18} className="text-indigo-500 dark:text-indigo-400" />,
        onClick: () => setCurrentView(ViewState.DASHBOARD),
        showWhen: currentView !== ViewState.DASHBOARD
      },
      {
        id: 'accounts',
        label: 'Contas Bancárias',
        shortLabel: 'Contas',
        icon: <Wallet size={18} className="text-blue-500 dark:text-blue-400" />,
        onClick: () => setCurrentView(ViewState.ACCOUNTS)
      },
      {
        id: 'incomes',
        label: 'Entradas',
        shortLabel: 'Entradas',
        icon: <ArrowUpCircle size={18} className="text-emerald-500 dark:text-emerald-400" />,
        onClick: () => setCurrentView(ViewState.INCOMES)
      },
      {
        id: 'fixed_expenses',
        label: 'Despesas Fixas',
        shortLabel: 'Fixas',
        icon: <Home size={18} className="text-amber-500 dark:text-amber-400" />,
        onClick: () => setCurrentView(ViewState.FIXED_EXPENSES)
      },
      {
        id: 'variable_expenses',
        label: 'Despesas Variáveis',
        shortLabel: 'Variáveis',
        icon: <ShoppingCart size={18} className="text-pink-500 dark:text-pink-400" />,
        onClick: () => setCurrentView(ViewState.VARIABLE_EXPENSES)
      },
      {
        id: 'personal_expenses',
        label: 'Despesas Pessoais',
        shortLabel: 'Pessoais',
        icon: <User size={18} className="text-cyan-500 dark:text-cyan-400" />,
        onClick: () => setCurrentView(ViewState.PERSONAL_EXPENSES)
      },
      {
        id: 'yields',
        label: 'Rendimentos',
        shortLabel: 'Rend.',
        icon: <TrendingUp size={18} className="text-violet-500 dark:text-violet-400" />,
        onClick: () => setCurrentView(ViewState.YIELDS)
      },
      {
        id: 'invoices',
        label: 'Faturas',
        shortLabel: 'Faturas',
        icon: <CreditCardIcon size={18} className="text-rose-500 dark:text-rose-400" />,
        onClick: () => setCurrentView(ViewState.INVOICES)
      },
      {
        id: 'reports',
        label: 'Relatórios',
        shortLabel: 'Relatórios',
        icon: <BarChart3 size={18} className="text-zinc-500 dark:text-zinc-400" />,
        onClick: () => setCurrentView(ViewState.REPORTS)
      },
      {
        id: 'das',
        label: 'Emissão DAS',
        shortLabel: 'DAS',
        icon: <FileText size={18} className="text-teal-500 dark:text-teal-400" />,
        onClick: () => setCurrentView(ViewState.DAS)
      }
    ],
    [currentView, setCurrentView]
  );
  const desktopQuickAccessItems = useMemo(
    () => mobileQuickAccessItems.map(item => (
      item.id === 'home' ? { ...item, showWhen: true } : item
    )),
    [mobileQuickAccessItems]
  );
  const isBetaHost = useMemo(() => {
      if (typeof window === 'undefined') return false;
      const host = window.location.hostname;
      return (
        host === 'meumei-beta.web.app' ||
        host === 'meumei-beta.firebaseapp.com' ||
        host === 'meumei-d88be.web.app' ||
        host === 'meumei-d88be.firebaseapp.com' ||
        host === 'meumeiapp.web.app' ||
        host === 'meumeiapp.firebaseapp.com' ||
        host === 'meumeiapp.com.br' ||
        host === 'www.meumeiapp.com.br' ||
        host.includes('meumei-beta') ||
        host.includes('meumei-d88be')
      );
  }, []);
  const landingUrl = useMemo(() => {
      if (!isBetaHost) return PURCHASE_URL;
      if (typeof window === 'undefined') return BETA_LANDING_URL;
      return window.location.origin;
  }, [isBetaHost]);
    // Onboarding should be available on all hosts (production and beta).
    const isOnboardingRoute = currentPath === '/onboarding';
  const isLandingRoute = currentPath === '/';
  const isLoginRoute = currentPath === '/login';
  const [cryptoStatus, setCryptoStatus] = useState<'ready' | 'missing' | 'error'>('ready');
  const cryptoGuardLogged = useRef(false);
  const checkoutTriggeredRef = useRef(false);
  const checkoutSessionHandledRef = useRef('');
  const checkoutGrantHandledRef = useRef('');
  const entitlementCheckRef = useRef(0);
  const currentPathRef = useRef(currentPath);
  const bannerReasonRef = useRef('');
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const hostLogRef = useRef(false);
  const recoveryLoggedRef = useRef(false);
  const gateRunRef = useRef<string | null>(null);
  const authBootLogRef = useRef({ pendingLogged: false, readyUid: '' });
  const loginUiLoggedRef = useRef(false);
  const onboardingMpLoggedRef = useRef(false);
  const metricsSnapshotRef = useRef({
      accounts: null as number | null,
      expenses: null as number | null,
      incomes: null as number | null,
      logged: false
  });
  const realtimeUnsubRef = useRef({
      accounts: null as null | (() => void),
      expenses: null as null | (() => void),
      incomes: null as null | (() => void),
      creditCards: null as null | (() => void),
      yields: null as null | (() => void)
  });
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);
  const debugAuthEnabled =
    import.meta.env.DEV || import.meta.env.VITE_DEBUG_AUTH === 'true';
  const balanceDebugEnabled = isBalanceDebugEnabled();

  useEffect(() => {
    if (hostLogRef.current) return;
    if (typeof window === 'undefined') return;
    hostLogRef.current = true;
    console.log('[host]', {
      origin: window.location.origin,
      hostname: window.location.hostname,
      isStandalone,
      isBetaHost,
      currentPath
    });
  }, [currentPath, isBetaHost, isStandalone]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleRouteChange = () => {
          setCurrentPath(window.location.pathname);
          setCurrentSearch(window.location.search);
      };
      window.addEventListener('popstate', handleRouteChange);
      return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
      currentPathRef.current = currentPath;
  }, [currentPath]);

  const updateRoute = (path: string, search = '') => {
      if (typeof window === 'undefined') return;
      const nextUrl = `${path}${search}`;
      window.history.replaceState({}, '', nextUrl);
      setCurrentPath(path);
      setCurrentSearch(search);
  };

  const stripeCheckoutEndpointOverride = (import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || '').trim();
  const stripeFunctionsBaseUrl = (import.meta.env.VITE_FUNCTIONS_BASE_URL || '').trim();
  const stripeFunctionsRegion =
    (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1').trim() || 'us-central1';
  const stripeProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();

  const resolveStripeEndpoint = (functionName: string) => {
    if (functionName === 'createCheckoutSessionV2' && stripeCheckoutEndpointOverride) {
      return stripeCheckoutEndpointOverride;
    }
    if (stripeFunctionsBaseUrl) {
      return `${stripeFunctionsBaseUrl.replace(/\/+$/, '')}/${functionName}`;
    }
    if (!stripeProjectId) return '';
    return `https://${stripeFunctionsRegion}-${stripeProjectId}.cloudfunctions.net/${functionName}`;
  };

  const maskToken = (value: string) => {
    if (!value) return '';
    if (value.length <= 10) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  };

  const PWA_INSTALL_FLAG_KEY = 'pwa_installed';
  const PWA_DISMISSED_AT_KEY = 'pwa_install_dismissed_at';
  const PWA_LEGACY_DISMISS_KEY = 'pwa_install_dismissed_v1';
  const PWA_POST_ONBOARDING_KEY = 'pwa_install_post_onboarding_shown';
  const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

  const readInstalledFlag = () => {
    try {
      return localStorage.getItem(PWA_INSTALL_FLAG_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const setInstalledFlag = () => {
    try {
      localStorage.setItem(PWA_INSTALL_FLAG_KEY, 'true');
    } catch {}
    setPwaInstalledFlag(true);
  };

  const readDismissedAt = () => {
    try {
      const value = localStorage.getItem(PWA_DISMISSED_AT_KEY);
      return value ? Number(value) : 0;
    } catch {
      return 0;
    }
  };

  const readPostOnboardingShown = () => {
    try {
      return localStorage.getItem(PWA_POST_ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  };

  const setPostOnboardingShown = () => {
    try {
      localStorage.setItem(PWA_POST_ONBOARDING_KEY, '1');
    } catch {}
  };

  const setDismissedNow = () => {
    try {
      localStorage.setItem(PWA_DISMISSED_AT_KEY, String(Date.now()));
    } catch {}
  };

  const updateFlowState = (
    next: typeof accessFlowState,
    meta?: Record<string, unknown>
  ) => {
    setAccessFlowState(next);
    console.log('[flow]', { state: next, ...(meta || {}) });
  };

  const getCheckoutParams = (search = currentSearch) => {
    const params = new URLSearchParams(search || '');
    return {
      checkout: params.get('checkout') || '',
      sessionId: params.get('session_id') || ''
    };
  };

  const isPostCheckout = (search = currentSearch) => {
    const { checkout, sessionId } = getCheckoutParams(search);
    return checkout === 'success' && Boolean(sessionId);
  };

  const markSessionHandled = (sessionId: string) => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(`checkoutHandled:${sessionId}`, '1');
    } catch {}
  };

  const isSessionHandled = (sessionId: string) => {
    if (!sessionId) return false;
    try {
      return sessionStorage.getItem(`checkoutHandled:${sessionId}`) === '1';
    } catch {
      return false;
    }
  };

  const clearCheckoutParamsFromUrl = (emailOverride?: string) => {
    if (typeof window === 'undefined') return;
        // Preserve explicit email in the URL (or the verified email from verify flow)
        // and send the user to the create-account route when we were on the login page.
        // Log full location and chosen route to help debugging Stripe return flow.
        try {
            console.log('[checkout-cleanup] location.href', window.location.href);
            const url = new URL(window.location.href);
            const params = Array.from(url.searchParams.entries()).reduce<Record<string,string>>((acc, [k,v]) => {
                acc[k] = v; return acc;
            }, {});
            console.log('[checkout-cleanup] query_params', params);
            const emailFromParam = url.searchParams.get('email') || '';
            const email = (emailFromParam || emailOverride || checkoutVerifiedEmail || loginEmail || '').trim();
            if (isLoginRoute) {
                if (email) {
                    console.log('[checkout-cleanup] choosing route', { route: '/criar-conta', reason: 'email_present', email });
                    const search = `?email=${encodeURIComponent(email)}`;
                    window.history.replaceState({}, '', `/criar-conta${search}`);
                    setCurrentPath('/criar-conta');
                    setCurrentSearch(search);
                    return;
                }
                console.log('[checkout-cleanup] choosing route', { route: '/login', reason: 'no_email' });
                window.history.replaceState({}, '', '/login');
                setCurrentPath('/login');
                setCurrentSearch('');
                return;
            }
            console.log('[checkout-cleanup] choosing route', { route: '/app', reason: 'not_login_route' });
            window.history.replaceState({}, '', '/app');
            setCurrentPath('/app');
            setCurrentSearch('');
        } catch (err) {
            console.error('[checkout-cleanup] failed to parse URL', err);
            const nextPath = isLoginRoute ? '/login' : '/app';
            window.history.replaceState({}, '', nextPath);
            setCurrentPath(nextPath);
            setCurrentSearch('');
        }
  };

  const buildEntitlementDocIds = (emailRaw: string) => {
    const trimmed = emailRaw.trim();
    const normalized = trimmed.toLowerCase();
    let legacy = '';
    try {
      legacy = normalizeEmail(emailRaw);
    } catch {
      legacy = '';
    }
    const docIds = [normalized].filter(Boolean);
    if (legacy && legacy !== normalized && !docIds.includes(legacy)) {
      docIds.push(legacy);
    }
    if (trimmed && trimmed !== normalized && !docIds.includes(trimmed)) {
      docIds.push(trimmed);
    }
    return { rawEmail: trimmed, normalizedEmail: normalized, docIds };
  };

  const canRegisterWithEntitlement = async (email: string) => {
    if (!email) return false;
    const { docIds } = buildEntitlementDocIds(email);
    for (const docId of docIds) {
      try {
        const ref = doc(db, 'entitlements', docId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.status === 'active') {
            return true;
          }
        }
      } catch (error) {
        console.error('[auth] signup_precheck_error', error);
      }
    }
    return false;
  };

  const checkEntitlement = async (
    trigger: 'auth' | 'retry' | 'checkout-success' | 'post-login',
    emailOverride?: string
  ) => {
    const checkId = entitlementCheckRef.current + 1;
    entitlementCheckRef.current = checkId;
    const rawEmail = (emailOverride || authUser?.email || '').trim();
    const uid = authUser?.uid || null;
    console.log('[entitlement] firebase', {
      projectId: firebaseDebugInfo.projectId,
      authDomain: firebaseDebugInfo.authDomain
    });
    console.log('[entitlement] auth', {
      uid,
      email: rawEmail || null,
      currentUserUid: currentUser?.tenantId || null,
      currentUserEmail: currentUser?.email || null
    });
    if (!rawEmail) {
      if (checkId !== entitlementCheckRef.current) return 'idle';
      setEntitlementStatus('idle');
      setEntitlementError(null);
      return 'idle';
    }
    if (checkId !== entitlementCheckRef.current) return 'idle';
    setEntitlementStatus('loading');
    setEntitlementError(null);

    const { rawEmail: trimmed, normalizedEmail, docIds } = buildEntitlementDocIds(rawEmail);
    for (const docId of docIds) {
      const path = `entitlements/${docId}`;
      console.log('[entitlement] lookup', {
        rawEmail: trimmed,
        normalizedEmail,
        docId,
        path,
        trigger
      });
      try {
        const ref = doc(db, 'entitlements', docId);
        const snap = await getDoc(ref);
        if (checkId !== entitlementCheckRef.current) return 'idle';
        const exists = snap.exists();
        const data = exists ? (snap.data() as any) : null;
        const status = data?.status || null;
        console.log('[entitlement] result', { exists, status, data });
        if (exists && status === 'active') {
          setEntitlementStatus('active');
          setEntitlementError(null);
          console.log('[entitlement] active -> unlocking', { docId, trigger });
          if (authUser) {
            updateFlowState('post_checkout_done', { reason: 'entitlement_active', trigger });
          }
          if (authUser && isLoginRoute) {
            updateRoute('/app', '');
          }
          return 'active';
        }
      } catch (error: any) {
        if (checkId !== entitlementCheckRef.current) return 'idle';
        const code = error?.code || 'unknown';
        const message = error?.message || 'unknown_error';
        console.error('[entitlement] error', {
          code,
          message,
          stack: error?.stack || null
        });
        setEntitlementStatus('error');
        setEntitlementError({ code, message });
        if (authUser) {
          updateFlowState('error', { reason: 'entitlement_error', trigger });
        }
        return 'error';
      }
    }
    console.log('[entitlement] result', {
      exists: false,
      status: 'none',
      data: null
    });
    if (authUser) {
      updateFlowState('pending', { reason: 'entitlement_none', trigger });
    }
    if (checkId !== entitlementCheckRef.current) return 'idle';
    setEntitlementStatus('none');
    setEntitlementError(null);
    return 'none';
  };

  const startCheckout = async (source: 'post-login') => {
      if (typeof window === 'undefined') return;
      const postCheckout = isPostCheckout();
      const shouldBlock =
        postCheckout ||
        (accessFlowState.startsWith('post_checkout_') &&
          accessFlowState !== 'post_checkout_done');
      console.log('[landing-pay] startCheckout called', {
        reason: source,
        path: currentPath,
        isPostCheckout: postCheckout,
        state: accessFlowState,
        stack: new Error().stack
      });
      if (shouldBlock && isBetaHost) {
        console.log('[landing-pay] blocked checkout attempt during post-checkout', {
          reason: source,
          path: currentPath,
          state: accessFlowState
        });
        return;
      }
      try {
          const checkoutEndpoint = resolveStripeEndpoint('createCheckoutSessionV2');
          if (!checkoutEndpoint) {
            throw new Error('missing_checkout_endpoint');
          }
          const payload = {
            data: {
              email: authUser?.email || undefined,
              success_url: `${window.location.origin}/login?checkout=success`,
              cancel_url: `${window.location.origin}/login?checkout=cancel`,
              source
            }
          };
          const response = await fetch(checkoutEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          let body: any = null;
          try {
            body = await response.json();
          } catch {}
          if (!response.ok || body?.error) {
            throw new Error(body?.error?.message || `HTTP_${response.status}`);
          }
          const checkoutUrl = body?.url || body?.data?.url || body?.result?.url;
          if (!checkoutUrl) {
            throw new Error('checkout_url_missing');
          }
          try {
            localStorage.setItem('meumei_last_checkout_url', checkoutUrl);
          } catch {}
          window.location.href = checkoutUrl;
      } catch (error) {
          console.error('[checkout] start_failed', { source, error });
      }
  };

    const verifyCheckoutSession = async (sessionId: string): Promise<string> => {
            const endpoint = resolveStripeEndpoint('verifyCheckoutSessionV2');
            if (!endpoint) {
                    setCheckoutStatus({
                        tone: 'error',
                        message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
                    });
                    console.log('[landing-pay] verify result', { ok: false, reason: 'missing_endpoint' });
                    updateFlowState('error', { reason: 'verify_missing_endpoint' });
                    return '';
            }
            if (checkoutVerifyLoading) return '';
            setCheckoutVerifyLoading(true);
            updateFlowState('post_checkout_verifying', { reason: 'verify_start' });
            console.log('[landing-pay] verify start', { session: maskToken(sessionId) });
            try {
                    const payload = { data: { session_id: sessionId } };
                    const response = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                    });
                    let body: any = null;
                    try {
                            body = await response.json();
                    } catch {}
                    if (!response.ok || body?.error) {
                            const reason =
                                body?.error?.message ||
                                body?.error?.code ||
                                body?.error ||
                                `HTTP_${response.status}`;
                            console.log('[landing-pay] verify result', { ok: false, reason });
                            updateFlowState('error', { reason: 'verify_failed' });
                            setCheckoutStatus({
                                tone: 'error',
                                message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
                            });
                            return '';
                    }
                    if (!body?.ok) {
                            const reason = body?.reason || 'verify_failed';
                            console.log('[landing-pay] verify result', { ok: false, reason });
                            updateFlowState('error', { reason: 'verify_not_ok' });
                            setCheckoutStatus({
                                tone: 'error',
                                message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
                            });
                            return '';
                    }
                    const email = typeof body?.email === 'string' ? body.email.trim() : '';
                    if (!email) {
                            console.log('[landing-pay] verify result', { ok: false, reason: 'email_missing' });
                            updateFlowState('error', { reason: 'verify_email_missing' });
                            setCheckoutStatus({
                                tone: 'error',
                                message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
                            });
                            return '';
                    }
                    setCheckoutVerifiedEmail(email);
                    setLoginEmail(email);
                    updateFlowState('post_checkout_needs_auth', { reason: 'verify_ok' });
                    void checkEntitlement('checkout-success', email);
                    console.log('[landing-pay] verify result', { ok: true, email });
                    return email;
            } catch (error) {
                    console.log('[landing-pay] verify result', { ok: false, reason: 'network_error' });
                    updateFlowState('error', { reason: 'verify_network_error' });
                    setCheckoutStatus({
                        tone: 'error',
                        message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
                    });
                    return '';
            } finally {
                    setCheckoutVerifyLoading(false);
            }
    };

  const grantEntitlement = async (sessionId: string, source: 'login' | 'register') => {
      if (!sessionId) return false;
      if (checkoutGrantHandledRef.current === sessionId) return true;
      const endpoint = resolveStripeEndpoint('grantEntitlementV2');
      if (!endpoint) {
          console.log('[landing-pay] grant entitlement error', { source, reason: 'missing_endpoint' });
          updateFlowState('error', { reason: 'grant_missing_endpoint' });
          return false;
      }
      updateFlowState('post_checkout_granting', { reason: 'grant_start', source });
      checkoutGrantHandledRef.current = sessionId;
      try {
          const payload = { data: { session_id: sessionId } };
          const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          let body: any = null;
          try {
              body = await response.json();
          } catch {}
          if (!response.ok || body?.error || body?.ok === false) {
              const reason =
                body?.error?.message ||
                body?.error?.code ||
                body?.reason ||
                `HTTP_${response.status}`;
              console.log('[landing-pay] grant entitlement error', { source, reason });
              updateFlowState('error', { reason: 'grant_failed', source });
              checkoutGrantHandledRef.current = '';
              return false;
          }
          markSessionHandled(sessionId);
          clearCheckoutParamsFromUrl();
          updateFlowState('post_checkout_done', { reason: 'grant_ok', source });
          setEntitlementRetryToken(prev => prev + 1);
          return true;
      } catch (error) {
          console.log('[landing-pay] grant entitlement error', { source, reason: 'network_error' });
          updateFlowState('error', { reason: 'grant_network_error', source });
          checkoutGrantHandledRef.current = '';
          return false;
      }
  };

  useEffect(() => {
      checkoutTriggeredRef.current = false;
  }, [authUser?.uid]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      if (!authUser) return;
      if (checkoutTriggeredRef.current) return;
      let action: string | null = null;
      try {
          action = localStorage.getItem('postLoginAction');
      } catch {
          action = null;
      }
      if (action !== 'subscribe') return;
      checkoutTriggeredRef.current = true;
      try {
          localStorage.removeItem('postLoginAction');
      } catch {}
      console.log('[landing-pay] blocked checkout auto-start', {
        reason: 'post-login',
        path: currentPath,
        isPostCheckout: isPostCheckout(),
        state: accessFlowState,
        stack: new Error().stack
      });
  }, [authUser?.uid]);

  useEffect(() => {
      console.info('[routing]', {
          path: currentPath,
          authUser: Boolean(authUser),
          isLandingRoute
      });
  }, [currentPath, authUser?.uid, isLandingRoute]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      if (!authUser) {
          // When returning from Stripe there may be an email in the URL or
          // stored in localStorage from the checkout flow. If an email exists,
          // prefer sending the user to create-account instead of forcing /login.
          try {
              const href = window.location.href;
              console.log('[routing-check] location.href', href);
              const url = new URL(href);
              const paramsObj = Array.from(url.searchParams.entries()).reduce<Record<string,string>>((acc, [k,v]) => { acc[k]=v; return acc; }, {});
              console.log('[routing-check] query_params', paramsObj);
              let emailFromParam = url.searchParams.get('email') || '';
              if (!emailFromParam) {
                  try {
                      const last = localStorage.getItem('meumei_last_checkout_url') || '';
                      if (last) {
                          const lastUrl = new URL(last, window.location.origin);
                          emailFromParam = lastUrl.searchParams.get('email') || '';
                      }
                  } catch {}
              }
              const email = (emailFromParam || checkoutVerifiedEmail || loginEmail || '').trim();
              if (!isLandingRoute && !isLoginRoute && !isOnboardingRoute) {
                  if (email) {
                      console.log('[routing-check] choosing route', { route: '/criar-conta', reason: 'email_present', email });
                      updateRoute('/criar-conta', `?email=${encodeURIComponent(email)}`);
                  } else {
                      console.log('[routing-check] choosing route', { route: '/login', reason: 'no_email' });
                      updateRoute('/login', '');
                  }
              }
          } catch (err) {
              if (!isLandingRoute && !isLoginRoute && !isOnboardingRoute) {
                  updateRoute('/login', '');
              }
          }
          return;
      }
      if (isLandingRoute) {
          updateRoute('/app', '');
      }
  }, [authUser, isLandingRoute, isLoginRoute, isOnboardingRoute]);

  useEffect(() => {
      if (!isStandalone || !isBetaHost) return;
      if (!isLandingRoute) return;
      const target = authUser ? '/app' : '/login';
      if (currentPath === target) return;
      console.log('[pwa] detected standalone', {
        standalone: true,
        path: currentPath,
        target
      });
      updateRoute(target, '');
  }, [authUser, currentPath, isBetaHost, isLandingRoute, isStandalone]);

  useEffect(() => {
      if (!isLoginRoute) return;
      const { checkout, sessionId } = getCheckoutParams(currentSearch);
      if (!checkout) return;
      if (checkout === 'cancel') {
          console.log('[landing-pay] detected checkout cancel');
          setCheckoutSessionId('');
          setCheckoutVerifiedEmail('');
          setCheckoutStatus({
            tone: 'warning',
            message: 'Pagamento nao concluido, voce pode tentar novamente.'
          });
          updateFlowState('idle', { reason: 'checkout_cancel' });
          clearCheckoutParamsFromUrl();
          return;
      }
      if (checkout !== 'success') return;
      console.log('[landing-pay] detected checkout success params', {
        hasSessionId: Boolean(sessionId)
      });
      if (!sessionId) {
          setCheckoutStatus({
            tone: 'error',
            message: 'Nao foi possivel confirmar o pagamento. Tente novamente.'
          });
          updateFlowState('error', { reason: 'missing_session_id' });
          clearCheckoutParamsFromUrl();
          return;
      }
      if (checkoutSessionHandledRef.current === sessionId) return;
      checkoutSessionHandledRef.current = sessionId;
      const handled = isSessionHandled(sessionId);
      setCheckoutSessionId(sessionId);
      setCheckoutVerifiedEmail('');
      setCheckoutStatus({
        tone: 'success',
        message: 'Pagamento confirmado. Crie sua conta para acessar.'
      });
      setAuthMode('register');
      setLoginError('');
      setLoginErrorCode('');
      setResetPasswordMessage(null);
      setRegisterConfirmPassword('');
      if (handled) {
          updateFlowState('post_checkout_done', { reason: 'session_handled' });
          clearCheckoutParamsFromUrl();
          void checkEntitlement('post-login');
          return;
      }
      if (authUser) {
          updateFlowState('post_checkout_granting', { reason: 'auth_present' });
          void grantEntitlement(sessionId, 'login').then((ok) => {
              if (!ok) {
                  setCheckoutStatus({
                    tone: 'warning',
                    message: 'Pagamento confirmado, mas falhou ao liberar o acesso. Tente novamente.'
                  });
                  clearCheckoutParamsFromUrl();
                  return;
              }
              void checkEntitlement('post-login');
          });
      } else {
          updateFlowState('post_checkout_verifying', { reason: 'no_auth' });
          void verifyCheckoutSession(sessionId).then((email) => {
              clearCheckoutParamsFromUrl(email || undefined);
          });
      }
  }, [authUser, currentSearch, isLoginRoute]);

  const mpStatus = useMemo(() => {
      if (!isOnboardingRoute) return null;
      const params = new URLSearchParams(currentSearch);
      return params.get('mp');
  }, [currentSearch, isOnboardingRoute]);

  useEffect(() => {
      if (!isOnboardingRoute || onboardingMpLoggedRef.current) return;
      console.info('[beta-onboarding] mp_param', { value: mpStatus || 'none' });
      onboardingMpLoggedRef.current = true;
  }, [isOnboardingRoute, mpStatus]);

  useEffect(() => {
      if (!isOnboardingRoute || !authUser) return;
      // Only leave the onboarding route automatically when onboarding is complete.
      if (onboardingSettings?.onboardingCompleted) {
        updateRoute('/', '');
      }
  }, [authUser, isOnboardingRoute]);

  // Ensure authenticated users who haven't completed onboarding are routed
  // to the onboarding path so they see the 4-step company setup.
  useEffect(() => {
      if (!authUser) return;
      if (onboardingLoading) return;
      const completed = onboardingSettings?.onboardingCompleted === true;
      if (!completed && currentPath !== '/onboarding') {
          console.log('[onboarding-route] directing new user to onboarding', { currentPath });
          updateRoute('/onboarding', '');
      }
  }, [authUser, onboardingLoading, onboardingSettings, currentPath]);
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
  const buildLogRef = useRef(false);
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
    if (typeof window === 'undefined') return;
    if (!buildLogRef.current) {
      try {
        console.info('[build]', {
          buildId: BUILD_ID,
          url: window.location.href,
          userAgent: navigator.userAgent
        });
      } catch (error) {
        console.warn('[build] log_failed', error);
      }
      buildLogRef.current = true;
    }

    const onError = (event: ErrorEvent) => {
      try {
        const err = event.error as Error | undefined;
        console.error('[global-error]', {
          message: event.message,
          name: err?.name || 'Error',
          stack: err?.stack || null,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      } catch (error) {
        console.error('[global-error] handler_failed', error);
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const stack =
          reason && typeof reason === 'object' && 'stack' in reason
            ? (reason as { stack?: string }).stack || null
            : null;
        console.error('[global-rejection]', { reason, stack });
      } catch (error) {
        console.error('[global-rejection] handler_failed', error);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

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

  const handleEntitlementRetry = async () => {
    console.info('[entitlement] retry_click');
    if (checkoutSessionId) {
      updateFlowState('post_checkout_granting', { reason: 'retry_grant' });
      const grantOk = await grantEntitlement(checkoutSessionId, 'login');
      if (grantOk) {
        void checkEntitlement('post-login');
        return;
      }
      setCheckoutStatus({
        tone: 'error',
        message: 'Nao foi possivel liberar o acesso automaticamente. Tente novamente.'
      });
    }
    setEntitlementRetryToken(prev => prev + 1);
    void checkEntitlement('retry');
  };

  const handleInstallBannerPrimary = async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      setInstallHelpOpen(true);
      return;
    }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      const outcome = choice?.outcome || 'unknown';
      console.log('[pwa] install_prompt_result', { outcome });
      deferredPromptRef.current = null;
      setDeferredPromptEvent(null);
      if (outcome === 'accepted') {
        setInstalledFlag();
        setInstallBannerVisible(false);
        console.log('[pwa] install_banner_hidden', { reason: 'installed' });
        return;
      }
      setDismissedNow();
      setInstallBannerVisible(false);
      console.log('[pwa] install_banner_hidden', { reason: 'prompt_dismissed' });
    } catch {
      console.log('[pwa] install_prompt_result', { outcome: 'unknown' });
    }
  };

  const handleInstallBannerDismiss = () => {
    setDismissedNow();
    setInstallBannerVisible(false);
    console.log('[pwa] install_banner_hidden', { reason: 'dismissed' });
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
  const [expensesRevision, setExpensesRevision] = useState(0);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [yields, setYields] = useState<YieldRecord[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [auditModalState, setAuditModalState] = useState<{
    isOpen: boolean;
    entityTypes?: AuditEntityType[] | null;
  }>({ isOpen: false, entityTypes: null });
  const [licenseMeta, setLicenseMeta] = useState<LicenseRecord | null>(null);
  const [licenseCryptoEpoch, setLicenseCryptoEpoch] = useState<number | null>(null);

  const applyExpenses = (next: Expense[] | ((prev: Expense[]) => Expense[])) => {
    setExpenses(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return [...resolved];
    });
    setExpensesRevision(prev => prev + 1);
  };
  
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
  const resolveInitialTheme = (): ThemePreference => {
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
          return 'dark';
      }
      return 'light';
  };
  const [theme, setTheme] = useState<'dark' | 'light'>(() => resolveInitialTheme());
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const { registerHandlers, setHighlightTarget } = useGlobalActions();
  const canAccessSettings = Boolean(currentUser);
  const onboardingCompleted = onboardingSettings?.onboardingCompleted === true;
  const viewHistoryRef = useRef<ViewState[]>([]);
  const prevViewRef = useRef<ViewState | null>(null);
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
    const prev = prevViewRef.current;
    if (!prev) {
      prevViewRef.current = currentView;
      return;
    }
    if (prev === currentView) return;
    if (currentView === ViewState.LOGIN) {
      viewHistoryRef.current = [];
    } else if (prev !== ViewState.LOGIN) {
      viewHistoryRef.current.push(prev);
    }
    prevViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      if (isCalculatorOpen) {
        setIsCalculatorOpen(false);
        return;
      }
      if (auditModalState.isOpen) {
        setAuditModalState(prev => ({ ...prev, isOpen: false }));
        return;
      }
      if (installHelpOpen) {
        setInstallHelpOpen(false);
        return;
      }
      if (isPwaInstallOpen) {
        closePwaModal();
        return;
      }
      if (document.querySelector('[data-modal-root="true"]')) {
        return;
      }
      if (currentView !== ViewState.DASHBOARD && currentView !== ViewState.LOGIN) {
        const previous = viewHistoryRef.current.pop();
        setCurrentView(previous || ViewState.DASHBOARD);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    closePwaModal,
    currentView,
    installHelpOpen,
    auditModalState.isOpen,
    isCalculatorOpen,
    isPwaInstallOpen
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => setTheme(media.matches ? 'dark' : 'light');
    applyTheme();
    if (media.addEventListener) {
      media.addEventListener('change', applyTheme);
    } else {
      media.addListener(applyTheme);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', applyTheme);
      } else {
        media.removeListener(applyTheme);
      }
    };
  }, []);

  useEffect(() => {
    if (isBetaHost) {
      console.log('[pwa] auto_modal_skipped', { reason: 'banner_enabled', path: currentPath });
      return;
    }
    const isAppRoute = currentPath.startsWith('/app');
    const eligible = !isLandingRoute && (isLoginRoute || isAppRoute);
    if (!eligible) {
      console.log('[pwa] install_prompt_blocked', { path: currentPath });
      return;
    }
    if (isLoginRoute && authUser) {
      console.log('[pwa] install_prompt_blocked', {
        path: currentPath,
        reason: 'login_with_auth'
      });
      return;
    }
    if (!onboardingCompleted) {
      console.log('[pwa] auto_modal_skipped', { reason: 'onboarding_incomplete', path: currentPath });
      return;
    }
    if (readPostOnboardingShown()) {
      console.log('[pwa] auto_modal_skipped', { reason: 'post_onboarding_shown', path: currentPath });
      return;
    }
    setPostOnboardingShown();
    console.log('[pwa] install_prompt_eligible', {
      path: currentPath,
      auth: Boolean(authUser)
    });
    const timer = window.setTimeout(() => {
      openModalAutoIfEligible();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    authUser,
    currentPath,
    isBetaHost,
    isLandingRoute,
    isLoginRoute,
    onboardingCompleted,
    openModalAutoIfEligible
  ]);

  const isIosDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }, []);

  useEffect(() => {
    if (!isBetaHost) return;
    try {
      localStorage.setItem(PWA_LEGACY_DISMISS_KEY, '1');
    } catch {}
  }, [isBetaHost]);

  useEffect(() => {
    if (!isBetaHost) return;
    const installed = readInstalledFlag();
    if (installed) {
      setPwaInstalledFlag(true);
      return;
    }
    if (isStandalone) {
      setInstalledFlag();
    }
  }, [isBetaHost, isStandalone]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isBetaHost) return;
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      setDeferredPromptEvent(promptEvent);
      console.log('[pwa] install_event_available', {
        path: currentPathRef.current,
        hasPrompt: true
      });
    };

    const handleAppInstalled = () => {
      console.log('[pwa] appinstalled');
      deferredPromptRef.current = null;
      setDeferredPromptEvent(null);
      setInstalledFlag();
      setInstallBannerVisible(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isBetaHost]);

  useEffect(() => {
    if (!isBetaHost) {
      if (installBannerVisible) {
        setInstallBannerVisible(false);
        console.log('[pwa] install_banner_hidden', { reason: 'not_beta', path: currentPath });
      }
      return;
    }
    const isAppRoute = currentPath.startsWith('/app');
    const eligibleRoute = !isLandingRoute && (isLoginRoute || isAppRoute);
    const installed = pwaInstalledFlag || readInstalledFlag();
    const standaloneMode = isStandalone || installed;
    const dismissedAt = readDismissedAt();
    const dismissedRecent = dismissedAt > 0 && Date.now() - dismissedAt < PWA_DISMISS_MS;
    const hasPrompt = Boolean(deferredPromptEvent);
    let shouldShow = false;
    let reason = 'eligible';

    if (standaloneMode) {
      reason = 'standalone';
    } else if (isLandingRoute) {
      reason = 'landing';
    } else if (!eligibleRoute) {
      reason = 'route_not_eligible';
    } else if (installed) {
      reason = 'installed_flag';
    } else if (dismissedRecent) {
      reason = 'dismissed_recently';
    } else {
      shouldShow = true;
    }

    if (shouldShow) {
      if (!installBannerVisible || bannerReasonRef.current !== reason) {
        console.log('[pwa] install_event_available', { path: currentPath, hasPrompt });
        console.log('[pwa] install_banner_shown', { path: currentPath, reason });
      }
    } else if (installBannerVisible || bannerReasonRef.current !== reason) {
      console.log('[pwa] install_banner_hidden', { reason, path: currentPath });
    }

    bannerReasonRef.current = reason;
    setInstallBannerVisible(shouldShow);
    if (!shouldShow) {
      setInstallHelpOpen(false);
    }
  }, [
    currentPath,
    deferredPromptEvent,
    installBannerVisible,
    isBetaHost,
    isLandingRoute,
    isLoginRoute,
    isStandalone,
    pwaInstalledFlag
  ]);

  const clearClientStorage = async () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.clear();
    } catch (error) {
      console.error('[reset] localStorage_clear_err', error);
    }
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('[reset] sessionStorage_clear_err', error);
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      } catch (error) {
        console.error('[reset] cache_clear_err', error);
      }
    }
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        const dbs = await indexedDB.databases();
        await Promise.all(
          dbs
            .map(dbInfo => dbInfo.name)
            .filter((name): name is string => Boolean(name))
            .map(name => new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }))
        );
      } catch (error) {
        console.error('[reset] indexeddb_clear_err', error);
      }
    }
  };

  const stopRealtimeSubscriptions = () => {
    const refs = realtimeUnsubRef.current;
    let stopped = 0;
    const stop = (key: keyof typeof refs) => {
      const fn = refs[key];
      if (typeof fn === 'function') {
        fn();
        refs[key] = null;
        stopped += 1;
      }
    };
    stop('accounts');
    stop('expenses');
    stop('incomes');
    stop('creditCards');
    stop('yields');
    console.info('[reset] unsubscribe:done', { stopped });
  };

  const handleSystemReset = async (): Promise<{ deletedDocsCount: number } | null> => {
    const uid = authUser?.uid || null;
    if (!uid) {
      console.warn('[reset] uid_missing');
      return null;
    }
    const licenseId = currentUser?.licenseId || null;
    const allowTenantReset = !licenseId || licenseId === uid;
    if (licenseId && !allowTenantReset) {
      console.info('[reset] tenant', { uid, licenseId, status: 'blocked', reason: 'tenant_not_owned' });
    }
    setIsLoading(true);
    try {
      stopRealtimeSubscriptions();
      const summary = await resetCurrentSession({ uid, licenseId, allowTenantReset });
      console.info('[reset] firestore:done', {
        uid,
        ms: summary.userSummary.durationMs,
        totals: {
          deletedDocsCount: summary.userSummary.deletedDocsCount,
          deletedCollectionsCount: summary.userSummary.deletedCollectionsCount,
          perCollection: summary.userSummary.perCollection
        }
      });
      await clearClientStorage();
      console.info('[reset] storage:cleared', { uid });
      setAccounts([]);
      applyExpenses([]);
      setIncomes([]);
      setCreditCards([]);
      setCompanyInfo(DEFAULT_COMPANY_INFO);
      setLicenseMeta(null);
      setLicenseCryptoEpoch(null);
      setAccountTypes(DEFAULT_ACCOUNT_TYPES);
      setExpenseCategories([]);
      setIncomeCategories([]);
      setViewDate(new Date());
      return { deletedDocsCount: summary.userSummary.deletedDocsCount };
    } catch (error) {
      console.error('[reset] error', {
        step: 'reset_flow',
        path: null,
        message: (error as any)?.message || error
      });
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

  useEffect(() => {
      if (authLoading && !authBootLogRef.current.pendingLogged) {
          console.info('[boot] auth:pending');
          authBootLogRef.current.pendingLogged = true;
          return;
      }
      if (!authLoading && authUser?.uid && authBootLogRef.current.readyUid !== authUser.uid) {
          console.info('[boot] auth:ready', { uid: authUser.uid });
          authBootLogRef.current.readyUid = authUser.uid;
          authBootLogRef.current.pendingLogged = false;
      }
  }, [authLoading, authUser?.uid]);

  const loadPreferencesFor = async (uid: string | null) => {
      if (!uid) {
          console.info('[load] skipped:no-auth', { scope: 'preferences' });
          return;
      }
      setPreferencesLoading(true);
      try {
          const pref = await preferencesService.getPreferences(uid);
          if (pref.theme) {
              setTheme(pref.theme as ThemePreference);
              try {
                  localStorage.setItem('meumei_theme', pref.theme);
                  console.info('[theme] persisted', { key: 'meumei_theme', value: pref.theme, source: 'prefs' });
              } catch (error) {
                  console.error('[theme] persisted', { key: 'meumei_theme', error });
              }
          }
          if (typeof pref.tipsEnabled === 'boolean') {
              setTipsEnabled(pref.tipsEnabled);
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
      let normalizedEmail = '';
      try {
          normalizedEmail = normalizeEmail(emailFromAuth);
      } catch {
          normalizedEmail = emailFromAuth.trim().toLowerCase();
      }
      if (!uid) {
          setCurrentUser(null);
          setCurrentView(ViewState.LOGIN);
          setLicenseResolveState('idle');
          setResolvedLicenseId(null);
          setLicenseReason(null);
          setLicenseBlockedDetail('');
          console.info('[load] skipped:no-auth', { scope: 'auth_gate' });
          return;
      }

      const setupUser = () => {
          if (!isActive) return;
          setCurrentUser({
              username: authUser?.displayName || authUser?.email || authUser?.uid || 'Usuário',
              licenseId: uid,
              tenantId: uid,
              email: normalizedEmail
          });
          setCurrentView(prev => prev === ViewState.LOGIN ? ViewState.DASHBOARD : prev);
          setResolvedLicenseId(uid);
          setLicenseResolveState('ready');
          setLicenseReason(null);
          setLicenseBlockedDetail('');
      };

      const run = async () => {
          console.info('[auth] ready', { uid });
          console.info('[auth] uid', { uid });
          setupUser();
          await loadPreferencesFor(uid);
      };

      if (isStandalone) {
          void run().catch(error => console.error('[pwa][boot]', error));
      } else {
          void run();
      }

      return () => {
          isActive = false;
      };
  }, [authUser?.email, authUser?.uid, licenseRetryToken, isStandalone]);

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid) {
          setOnboardingSettings(null);
          setOnboardingLoading(false);
          return;
      }
      let isActive = true;
      setOnboardingLoading(true);
      onboardingService
          .getStatus(uid)
          .then((status) => {
              if (!isActive) return;
              setOnboardingSettings(status ?? { onboardingCompleted: false });
          })
          .finally(() => {
              if (isActive) {
                  setOnboardingLoading(false);
              }
          });
      return () => {
          isActive = false;
      };
  }, [authUser?.uid]);

  useEffect(() => {
      if (!isBetaHost) {
          setEntitlementStatus('idle');
          setEntitlementError(null);
          return;
      }
      const email = authUser?.email || '';
      if (!email) {
          setEntitlementStatus('idle');
          setEntitlementError(null);
          return;
      }
      void checkEntitlement('auth');
  }, [authUser?.email, authUser?.uid, entitlementRetryToken, isBetaHost]);

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

  const renderOnboardingLoading = () => (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
          <div className="flex items-center gap-3 text-lg font-semibold">
              <Loader2 className="animate-spin" /> Preparando onboarding...
          </div>
      </div>
  );

  const renderBetaMpOnboarding = () => {
      const status = (mpStatus || 'unknown').toLowerCase();
      const copy = {
          success: 'Pagamento confirmado. Vamos criar sua conta para liberar o acesso.',
          pending: 'Pagamento em processamento. Você já pode criar sua conta, e liberamos o acesso assim que confirmar.',
          failure: 'Pagamento não concluído. Você pode tentar novamente pela landing.',
          unknown: 'Vamos criar sua conta para liberar o acesso.'
      };
      const message = copy[status as keyof typeof copy] || copy.unknown;
      return (
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f] text-white px-4 py-12 relative overflow-hidden">
              <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
              <div className="relative z-10 w-full max-w-xl">
                  <div className="bg-white/8 border border-white/18 rounded-[32px] shadow-[0_30px_120px_rgba(5,10,24,0.7)] backdrop-blur-[32px] px-8 py-10 space-y-6 text-center">
                      <p className="text-xs uppercase tracking-[0.3em] text-indigo-200/70">meumei beta</p>
                      <h1 className="text-2xl font-semibold">Quase lá</h1>
                      <p className="text-sm text-indigo-100/80">{message}</p>
                      <div className="flex flex-col gap-3 pt-4">
                          <button
                              type="button"
                              onClick={() => startRegisterFlow('onboarding')}
                              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 hover:from-cyan-300 hover:via-indigo-400 hover:to-fuchsia-400 text-white font-semibold px-4 py-3.5 rounded-full transition shadow-[0_18px_45px_rgba(59,130,246,0.35)]"
                          >
                              Criar minha conta
                          </button>
                          <a
                              href={landingUrl}
                              className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-4 py-3.5 rounded-full transition"
                          >
                              Voltar para a landing
                          </a>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const renderEntitlementLoading = () => (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
          <div className="flex items-center gap-3 text-lg font-semibold">
              <Loader2 className="animate-spin" /> Verificando liberação...
          </div>
      </div>
  );

  const renderEntitlementPending = () => {
      const hasEntitlementError = Boolean(entitlementError);
      const errorCode = entitlementError?.code || 'unknown';
      const errorMessage = entitlementError?.message || 'Erro desconhecido';
      const title = hasEntitlementError
        ? 'Falha ao verificar acesso'
        : 'Seu acesso está pendente';
      const description = hasEntitlementError
        ? 'Nao foi possivel validar o entitlement agora. Veja o detalhe abaixo.'
        : 'Assim que o pagamento for confirmado, liberamos o acesso automaticamente.';
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md w-full space-y-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Aguardando liberação</p>
                  <h1 className="text-2xl font-bold">{title}</h1>
                  <p className="text-sm text-slate-200">
                      {description}
                  </p>
                  {hasEntitlementError && (
                      <div className="text-[11px] text-amber-200/80 border border-amber-200/20 bg-amber-400/10 rounded-xl px-3 py-2">
                          [debug] Firestore error {errorCode}: {errorMessage}
                      </div>
                  )}
                  <div className="flex flex-col gap-3 pt-2">
                      <button
                          onClick={handleEntitlementRetry}
                          className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-3 rounded-xl transition"
                      >
                          Tentar novamente
                      </button>
                      <a
                          href={landingUrl}
                          className="w-full inline-flex items-center justify-center gap-2 bg-white text-slate-900 font-semibold px-4 py-3 rounded-xl transition hover:bg-slate-100"
                      >
                          Voltar para a landing
                      </a>
                  </div>
              </div>
          </div>
      );
  };

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
                          href={landingUrl}
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

  const applyUserCategories = (payload: { incomes: string[]; expenses: string[] }) => {
      setIncomeCategories(payload.incomes);
      setExpenseCategories(payload.expenses);
  };

  const reloadUserCategories = async (uid: string) => {
      const data = await categoryService.getUserCategories(uid);
      applyUserCategories(data);
      return data;
  };

  const handleAddCategory = async (type: CategoryType, name: string) => {
      const uid = authUser?.uid || null;
      if (!uid) {
          console.warn('[categories] add_skipped', { type, reason: 'uid_missing' });
          throw new Error('Usuário não resolvido.');
      }
      await categoryService.addCategory(uid, type, name);
      await reloadUserCategories(uid);
  };

  const handleRemoveCategory = async (type: CategoryType, name: string) => {
      const uid = authUser?.uid || null;
      if (!uid) {
          console.warn('[categories] remove_skipped', { type, reason: 'uid_missing' });
          throw new Error('Usuário não resolvido.');
      }
      await categoryService.removeCategory(uid, type, name);
      await reloadUserCategories(uid);
  };

  const handleResetCategories = async () => {
      const uid = authUser?.uid || null;
      if (!uid) {
          console.warn('[categories] reset_skipped', { reason: 'uid_missing' });
          throw new Error('Usuário não resolvido.');
      }
      await categoryService.resetUserCategories(uid);
      applyUserCategories({ incomes: [], expenses: [] });
  };

  const loadData = async (licenseId: string) => {
      setIsLoading(true);
      try {
          const cryptoEpoch = await dataService.ensureCryptoEpoch(licenseId);
          setLicenseCryptoEpoch(cryptoEpoch);
          console.info('[crypto][epoch] ready', { licenseId, cryptoEpoch });
          const licenseRecord = await dataService.getLicenseRecord(licenseId);
          setLicenseMeta(licenseRecord || null);
          const companySource = authUser?.uid ? await dataService.getCompany(authUser.uid) : null;
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
  const needsYields =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.ACCOUNTS ||
      currentView === ViewState.REPORTS ||
      currentView === ViewState.YIELDS;

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
      realtimeUnsubRef.current.accounts = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.accounts === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.accounts = null;
              unsubscribe();
          }
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
              applyExpenses(items);
              updateAdminMetricsIfReady(licenseId, { expenses: items.length });
          },
          (error) => {
              console.error('[realtime][expenses] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      realtimeUnsubRef.current.expenses = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.expenses === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.expenses = null;
              unsubscribe();
          }
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
      realtimeUnsubRef.current.incomes = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.incomes === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.incomes = null;
              unsubscribe();
          }
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
      realtimeUnsubRef.current.creditCards = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.creditCards === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.creditCards = null;
              unsubscribe();
          }
          console.info('[realtime][credit_cards] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, needsCreditCards, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !licenseCryptoEpoch || !needsYields) return;
      console.info('[realtime][yields] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = yieldsService.subscribeYields(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][yields] snapshot', { count: items.length });
              setYields(items);
          },
          (error) => {
              console.error('[realtime][yields] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      realtimeUnsubRef.current.yields = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.yields === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.yields = null;
              unsubscribe();
          }
          console.info('[realtime][yields] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, licenseCryptoEpoch, needsYields, currentView]);

  useEffect(() => {
      const uid = authUser?.uid;
      if (!uid) {
          console.info('[load] skipped:no-auth', { scope: 'categories' });
          return;
      }
      let isActive = true;
      const run = async () => {
          const data = await categoryService.getUserCategories(uid);
          if (isActive) applyUserCategories(data);
      };
      if (isStandalone) {
          void run().catch(error => console.error('[pwa][boot]', error));
      } else {
          void run();
      }
      return () => {
          isActive = false;
      };
  }, [authUser?.uid, isStandalone]);

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
      console.info('[theme] toggle', { from: theme, to: newTheme });
      setTheme(newTheme);
      try {
          localStorage.setItem('meumei_theme', newTheme);
          console.info('[theme] persisted', { key: 'meumei_theme', value: newTheme });
      } catch (error) {
          console.error('[theme] persisted', { key: 'meumei_theme', error });
      }
      const uid = authUser?.uid || null;
      if (!uid) {
          console.error('[prefs] error', { step: 'save', message: 'missing_uid' });
          return;
      }
      preferencesService
        .setTheme(uid, newTheme)
        .catch(() => {
          // persist silently
        });
  };

  const handleTipsEnabledChange = (nextEnabled: boolean) => {
      setTipsEnabled(nextEnabled);
      const uid = authUser?.uid || null;
      if (!uid) {
          console.error('[prefs] error', { step: 'tips_save', message: 'missing_uid' });
          return;
      }
      preferencesService
        .setTipsEnabled(uid, nextEnabled)
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
      stopRealtimeSubscriptions();
      setCurrentUser(null);
      setAccounts([]);
      applyExpenses([]);
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
      const uid = authUser?.uid || null;
      if (!uid) {
          console.warn('Usuário não encontrado ao salvar dados da empresa.');
          return;
      }
      setCompanyInfo(newInfo);
      try {
          await dataService.saveCompany(newInfo, uid);
          const refreshed = await dataService.getCompany(uid);
          if (refreshed) {
              setCompanyInfo(refreshed);
          }
      } catch (err) {
          console.error('Falha ao salvar dados da empresa', err);
      }
  };

  const persistOnboarding = async (patch: OnboardingSettings) => {
      const uid = authUser?.uid || null;
      if (!uid) {
          console.warn('[onboarding] persist_skipped', { reason: 'uid_missing' });
          return;
      }
      try {
          await onboardingService.saveStatus(uid, patch);
          setOnboardingSettings(prev => ({ ...(prev || {}), ...patch }));
      } catch (error) {
          console.error('[onboarding] persist_error', { message: (error as any)?.message });
      }
  };

  const handleOnboardingComplete = async () => {
      await persistOnboarding({
          onboardingCompleted: true,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingVersion: 1
      });
      setCurrentView(ViewState.DASHBOARD);
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
      const incomesToDelete = incomes.filter(inc => inc.accountId === id);
      const expensesToDelete = expenses.filter(exp => exp.accountId === id);
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
      if (incomesToDelete.length) {
          setIncomes(prev => prev.filter(inc => inc.accountId !== id));
      }
      if (expensesToDelete.length) {
          applyExpenses(prev => prev.filter(exp => exp.accountId !== id));
      }
      setAccounts(prev => prev.filter(a => a.id !== id));
      const deleteOps: Promise<void>[] = [
          dataService.deleteAccount(id, currentUser.licenseId),
          ...incomesToDelete.map(inc => dataService.deleteIncome(inc.id, currentUser.licenseId)),
          ...expensesToDelete.map(exp => dataService.deleteExpense(exp.id, currentUser.licenseId))
      ];
      Promise.all(deleteOps).catch((error) => {
          console.error('[accounts][delete] cascade_failed', {
              accountId: id,
              message: (error as Error)?.message || error
          });
      });
  };

  const handleUpdateExpenses = (updated: Expense[]) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      applyExpenses(updated);
      // Batch save for efficiency in UI, but simple service call here
      dataService.upsertExpenses(updated.filter(exp => !exp.locked), currentUser.licenseId, cryptoEpoch);
  };

  const handleRefreshExpenses = async () => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      try {
          const items = await dataService.getExpenses(currentUser.licenseId, cryptoEpoch);
          applyExpenses(items);
      } catch (error) {
          console.error('[category-totals] refresh_failed', {
              licenseId: currentUser.licenseId,
              message: (error as Error)?.message || error
          });
      }
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
              const mutationId = `expense:delete:${exp.id}:${exp.accountId}:${exp.amount}:${exp.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'app',
                  action: 'expense_delete',
                  accountId: exp.accountId,
                  entityId: exp.id,
                  amount: exp.amount,
                  status: exp.status
              });
              if (shouldApply) {
                  const newAccounts = [...accounts];
                  newAccounts[accIndex].currentBalance += Number(exp.amount);
                  setAccounts(newAccounts);
                  if (!newAccounts[accIndex].locked) {
                      dataService.upsertAccount(newAccounts[accIndex], currentUser.licenseId, cryptoEpoch);
                  }
              }
          }
      }

      applyExpenses(prev => prev.filter(e => e.id !== id));
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
              const mutationId = `income:delete:${inc.id}:${inc.accountId}:${inc.amount}:${inc.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'app',
                  action: 'income_delete',
                  accountId: inc.accountId,
                  entityId: inc.id,
                  amount: inc.amount,
                  status: inc.status
              });
              if (shouldApply) {
                  const newAccounts = [...accounts];
                  newAccounts[accIndex].currentBalance -= Number(inc.amount);
                  setAccounts(newAccounts);
                  if (!newAccounts[accIndex].locked) {
                      dataService.upsertAccount(newAccounts[accIndex], currentUser.licenseId, cryptoEpoch);
                  }
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
          const mutationId = `invoice:pay:${sourceAccountId}:${totalAmount}:${expenseIds.join(',')}`;
          const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
              source: 'app',
              action: 'invoice_pay',
              accountId: sourceAccountId,
              amount: totalAmount,
              status: 'paid'
          });
          if (shouldApply) {
              newAccounts[accIdx].currentBalance -= Number(totalAmount);
              setAccounts(newAccounts);
              if (!newAccounts[accIdx].locked) {
                  dataService.upsertAccount(newAccounts[accIdx], currentUser.licenseId, cryptoEpoch);
              }
          }
      }

      // 2. Mark Expenses Paid
      const newExpenses = expenses.map(exp => {
          if (expenseIds.includes(exp.id)) {
              return { ...exp, status: 'paid' as const };
          }
          return exp;
      });
      applyExpenses(newExpenses);
      
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
  
  const monthExpenseData = useMemo(
      () =>
          getMonthExpenses(expenses, {
              viewDate,
              source: 'dashboard',
              variant: 'summary'
          }),
      [expenses, viewDate]
  );

  const currentMonthExpenses = monthExpenseData.monthExpensesAll;

  const expenseBreakdown = {
      fixed: currentMonthExpenses.filter(e => e.type === 'fixed').reduce((acc, curr) => acc + curr.amount, 0),
      variable: currentMonthExpenses.filter(e => e.type === 'variable').reduce((acc, curr) => acc + curr.amount, 0),
      personal: currentMonthExpenses.filter(e => e.type === 'personal').reduce((acc, curr) => acc + curr.amount, 0),
  };

  const legacyTotalBalance = accounts.reduce((acc, curr) => acc + curr.currentBalance, 0);
  const baseRealBalances = useMemo(() => {
      return computeRealBalances({
          accounts,
          incomes,
          expenses,
          yields,
          viewDate,
          options: { includeUpToEndOfMonth: true, debug: balanceDebugEnabled }
      });
  }, [accounts, incomes, expenses, yields, viewDate, balanceDebugEnabled]);

  const realBalances: RealBalanceResult = useMemo(() => {
      if (balanceDebugEnabled) return baseRealBalances;
      const hasDiff = Object.values(baseRealBalances.diffs).some(diff => Math.abs(diff) > 0.01);
      if (!hasDiff) return baseRealBalances;
      return computeRealBalances({
          accounts,
          incomes,
          expenses,
          yields,
          viewDate,
          options: { includeUpToEndOfMonth: true, debug: true }
      });
  }, [accounts, incomes, expenses, yields, viewDate, balanceDebugEnabled, baseRealBalances]);

  const totalBalance = realBalances.total;
  const balanceSnapshot = useMemo(() => ({
      byAccountId: realBalances.byAccountId,
      diffs: realBalances.diffs,
      total: realBalances.total,
      legacyTotal: legacyTotalBalance,
      cutoff: realBalances.stats.cutoff,
      debug: realBalances.debug
  }), [legacyTotalBalance, realBalances]);
  const totalIncome = currentMonthIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpenses = monthExpenseData.totalAll;
  const pendingIncome = currentMonthIncomes.filter(i => i.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  const pendingExpenses = monthExpenseData.totalPending;
  const headerSummary = useMemo(
      () => ({
          income: totalIncome,
          expenses: totalExpenses,
          available: totalIncome - totalExpenses
      }),
      [totalIncome, totalExpenses]
  );
  
  // PJ Annual Revenue (MEI Limit Check)
  const annualMeiRevenue = incomes
      .filter(inc => {
          const d = new Date(inc.date + 'T12:00:00');
          return d.getFullYear() === viewDate.getFullYear() && inc.taxStatus !== 'PF';
      })
      .reduce((acc, curr) => acc + curr.amount, 0);

  useEffect(() => {
      if (!realBalances) return;
      const diffs = Object.entries(realBalances.diffs).filter(([, diff]) => Math.abs(diff) > 0.01);
      if (!balanceDebugEnabled && diffs.length === 0) return;
      console.info('[real-balance] cutoff', {
          cutoff: realBalances.stats.cutoff,
          incomes: realBalances.stats.incomes,
          expenses: realBalances.stats.expenses,
          yields: realBalances.stats.yields
      });
      if (diffs.length > 0) {
          const diffPayload = diffs.reduce<Record<string, number>>((acc, [id, diff]) => {
              acc[id] = diff;
              return acc;
          }, {});
          console.info('[real-balance] diffs', { diffs: diffPayload });
      }
      if (!realBalances.debug) return;
      const shouldAudit = (account: Account) => {
          const name = (account.name || '').toLowerCase();
          return name.includes('cora') || diffs.some(([id]) => id === account.id);
      };
      accounts.forEach(account => {
          if (!shouldAudit(account)) return;
          const trails = realBalances.debug?.trailsByAccountId?.[account.id] || [];
          let sumIncomes = 0;
          let sumExpenses = 0;
          let sumYields = 0;
          trails.forEach(entry => {
              if (entry.type === 'income') sumIncomes += entry.amount;
              if (entry.type === 'expense') sumExpenses += entry.amount;
              if (entry.type === 'yield') sumYields += entry.amount;
          });
          console.info('[real-balance] audit', {
              accountName: account.name,
              initialBalance: account.initialBalance,
              sumIncomes: Number(sumIncomes.toFixed(2)),
              sumExpenses: Number(sumExpenses.toFixed(2)),
              sumYields: Number(sumYields.toFixed(2)),
              computed: realBalances.byAccountId[account.id],
              legacy: account.currentBalance,
              diff: realBalances.diffs[account.id]
          });
      });
  }, [accounts, balanceDebugEnabled, realBalances]);

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
    const layoutPaddingClass = isMobile ? 'pb-20' : 'pb-28';
    return (
        <div className={`min-h-screen bg-zinc-100 dark:bg-[#09090b] text-zinc-950 dark:text-white font-inter transition-colors duration-300 ${layoutPaddingClass}`}>
            <GlobalHeader 
                companyName={companyInfo.name}
                username={currentUser?.email || ''}
                viewDate={viewDate}
                summary={headerSummary}
                onMonthChange={handleMonthChange}
                canGoBack={true}
                theme={theme}
                onThemeChange={handleThemeChange}
                onOpenSettings={() => canAccessSettings && setCurrentView(ViewState.SETTINGS)}
                onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                onLogout={handleLogout}
                onCompanyClick={() => setCurrentView(ViewState.COMPANY_DETAILS)}
                onOpenCalculator={() => setIsCalculatorOpen(true)}
                onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: null })}
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
      const sessionId = checkoutSessionId;
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
          if (sessionId) {
              const grantOk = await grantEntitlement(sessionId, 'login');
              if (!grantOk) {
                  setCheckoutStatus({
                    tone: 'warning',
                    message: 'Pagamento confirmado, mas nao foi possivel liberar o acesso automaticamente.'
                  });
              }
          }
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

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (loginLoading) return;
      if (!loginEmail.trim()) {
          setLoginError('Informe o e-mail.');
          return;
      }
      if (!loginPassword) {
          setLoginError('Informe uma senha para criar sua conta.');
          return;
      }
      if (!registerConfirmPassword) {
          setLoginError('Confirme sua senha.');
          return;
      }
      if (loginPassword !== registerConfirmPassword) {
          setLoginError('As senhas nao conferem.');
          return;
      }
      setLoginError('');
      setLoginErrorCode('');
      setResetPasswordMessage(null);
      setLoginLoading(true);
      const sessionId = checkoutSessionId;
      try {
          const emailKey = loginEmail.trim().toLowerCase();
          if (!sessionId) {
              const entitlementOk = await canRegisterWithEntitlement(emailKey);
              if (!entitlementOk) {
                  setLoginError(ACCESS_BLOCKED_MESSAGE);
                  setLoginLoading(false);
                  return;
              }
          }
          console.info('[beta-auth] register_start', { email_present: Boolean(emailKey) });
          await authRegister(emailKey, loginPassword);
          console.info('[beta-auth] register_result', { ok: true });
          if (sessionId) {
              const grantOk = await grantEntitlement(sessionId, 'register');
              if (!grantOk) {
                  setCheckoutStatus({
                    tone: 'warning',
                    message: 'Pagamento confirmado, mas nao foi possivel liberar o acesso automaticamente.'
                  });
              }
          }
      } catch (error: any) {
          const code = error?.code || 'unknown';
          console.info('[beta-auth] register_result', { ok: false, code });
          switch (code) {
              case 'auth/email-already-in-use':
                  setLoginError('Este e-mail já está cadastrado. Faça login.');
                  break;
              case 'auth/weak-password':
                  setLoginError('Senha muito fraca. Use pelo menos 6 caracteres.');
                  break;
              case 'auth/invalid-email':
                  setLoginError('E-mail inválido.');
                  break;
              case 'auth/network-request-failed':
                  setLoginError('Falha de rede. Verifique sua conexão.');
                  break;
              default:
                  setLoginError('Não foi possível criar sua conta. Tente novamente.');
                  break;
          }
      } finally {
          setLoginLoading(false);
      }
  };

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      if (authMode === 'register') {
          void handleRegisterSubmit(event);
          return;
      }
      void handleLoginSubmit(event);
  };

  useEffect(() => {
      if (authUser) {
          setHasLoggedOut(false);
          setLogoutMessage(null);
          setLoginError('');
          setLoginErrorCode('');
          setLoginEmail('');
          setLoginPassword('');
          setRegisterConfirmPassword('');
          setCheckoutStatus(null);
          setCheckoutSessionId('');
          setCheckoutVerifiedEmail('');
          setCheckoutVerifyLoading(false);
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

  const startRegisterFlow = (source: 'login' | 'onboarding') => {
      console.info('[beta-auth] create_account_click', { source });
      setAuthMode('register');
      setRegisterConfirmPassword('');
      updateRoute('/login', '');
  };


  const renderLoggedOutFallback = () => {
      if (!loginUiLoggedRef.current) {
          loginUiLoggedRef.current = true;
          console.info('[login-ui] rendered', { file: 'App.tsx', version: LOGIN_APP_VERSION, build: BUILD_TIME });
          console.info('[auth-ui] version', { version: LOGIN_APP_VERSION, build: BUILD_TIME });
      }
      const [appVersion] = LOGIN_APP_VERSION.split('+');
      const loginVersion = appVersion || LOGIN_APP_VERSION;
      const isEmailLocked = authMode === 'register' && Boolean(checkoutVerifiedEmail);
      const checkoutToneClasses = checkoutStatus
        ? checkoutStatus.tone === 'success'
          ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100'
          : checkoutStatus.tone === 'warning'
            ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
            : 'border-rose-300/40 bg-rose-400/10 text-rose-100'
        : '';
      console.info('[login] render', { emailPresent: Boolean(loginEmail) });
      return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f] text-white px-4 py-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
          <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[160px]" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[180px]" />
          <div className="relative z-10 w-full max-w-xl">
              <div className="bg-white/8 border border-white/18 rounded-[38px] shadow-[0_30px_120px_rgba(5,10,24,0.7)] backdrop-blur-[32px] px-10 pt-12 pb-10 space-y-7 text-center">
                  <div className="space-y-2">
                      <h1 className="text-5xl font-semibold tracking-tight">meumei</h1>
                      <p className="text-sm text-indigo-100/70">
                          Controle financeiro simples, do seu jeito.
                      </p>
                      <h2 className="text-xl font-semibold text-white/90">
                          {authMode === 'register' ? 'Criar sua conta' : 'Entrar na sua conta'}
                      </h2>
                  </div>
              {(() => {
                  const showLogoutCopy = hasLoggedOut;
                  if (showLogoutCopy) {
                      return (
                          <>
                              <p className="text-emerald-300 text-xs uppercase tracking-[0.3em]">Sessão encerrada</p>
                              <h2 className="text-lg font-semibold text-white/90">Você foi desconectado.</h2>
                              {logoutMessage && (
                                  <p className="text-sm text-slate-200">
                                      {logoutMessage}
                                  </p>
                              )}
                          </>
                      );
                  }
                  return (
                      <>
                      </>
                  );
              })()}

              {checkoutStatus && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${checkoutToneClasses}`}>
                      {checkoutStatus.message}
                  </div>
              )}
              {checkoutVerifyLoading && (
                  <div className="text-xs text-slate-200/80">Verificando pagamento...</div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div className="space-y-2 text-left">
                      <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.2em] ml-1 block">Email</label>
                      <input
                          type="email"
                          value={loginEmail}
                          readOnly={isEmailLocked}
                          onChange={(event) => {
                              if (isEmailLocked) return;
                              setLoginEmail(event.target.value);
                          }}
                          className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60"
                          placeholder="seuemail@dominio.com"
                      />
                      {isEmailLocked && (
                          <div className="text-[10px] text-emerald-200/80 mt-1">
                              E-mail confirmado no pagamento.
                          </div>
                      )}
                  </div>
                  <div className="space-y-2 text-left">
                      <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.2em] ml-1 block">Senha</label>
                      <div className="relative">
                          <input
                              type={isPasswordVisible ? 'text' : 'password'}
                              value={loginPassword}
                              onChange={(event) => setLoginPassword(event.target.value)}
                              className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 pr-10 text-sm text-white placeholder:text-slate-300/60"
                              placeholder="Sua senha"
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
                  {authMode === 'register' && (
                      <div className="space-y-2 text-left">
                          <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.2em] ml-1 block">Confirmar senha</label>
                          <input
                              type={isPasswordVisible ? 'text' : 'password'}
                              value={registerConfirmPassword}
                              onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                              className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60"
                              placeholder="Confirme sua senha"
                          />
                      </div>
                  )}
                  {loginError && (
                      loginError === ACCESS_BLOCKED_MESSAGE ? (
                          <button
                              type="button"
                              onClick={() => updateRoute('/', '')}
                              className="w-full text-xs text-amber-200 text-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3 hover:border-amber-300/60 hover:text-amber-100 transition"
                          >
                              <div className="font-semibold">{loginError}</div>
                              <div className="mt-1 text-[10px] text-slate-200/70">
                                  Clique para voltar e concluir o pagamento.
                              </div>
                          </button>
                      ) : (
                          <div className="text-xs text-red-400 text-left">
                              <div>{loginError}</div>
                              {debugAuthEnabled && loginErrorCode && (
                                  <div className="mt-1 text-[10px] text-slate-400 font-mono">
                                      Código interno: AUTH_SIGNIN_FAILED ({loginErrorCode})
                                  </div>
                              )}
                          </div>
                      )
                  )}
                  {resetPasswordMessage && (
                      <div className="text-xs text-amber-200 text-left">{resetPasswordMessage}</div>
                  )}
                  {authMode === 'login' && (
                      <div className="flex items-center justify-end text-xs text-slate-300">
                          <button
                              type="button"
                              onClick={handleResetPassword}
                              className="text-slate-300/60 hover:text-white underline underline-offset-4"
                          >
                              Esqueci minha senha
                          </button>
                      </div>
                  )}
                  <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 hover:from-cyan-300 hover:via-indigo-400 hover:to-fuchsia-400 text-white font-semibold px-4 py-3.5 rounded-full transition shadow-[0_18px_45px_rgba(59,130,246,0.35)]"
                      disabled={loginLoading}
                  >
                      {authMode === 'register'
                          ? (loginLoading ? 'Criando...' : 'Criar conta')
                          : (loginLoading ? 'Entrando...' : 'Entrar')}
                  </button>
                  <div className="flex items-center justify-center text-xs text-slate-300">
                      {authMode === 'register' ? (
                          <button
                              type="button"
                              onClick={() => setAuthMode('login')}
                              className="text-slate-300/70 hover:text-white underline underline-offset-4"
                          >
                              Já tenho conta
                          </button>
                      ) : (
                          <button
                              type="button"
                              onClick={() => startRegisterFlow('login')}
                              className="text-slate-300/70 hover:text-white underline underline-offset-4"
                          >
                              Não tenho conta • Criar conta
                          </button>
                      )}
                  </div>
              </form>
              <div className="flex justify-center pt-1">
                  <span className="text-[10px] text-slate-200/55">
                      Versão {loginVersion}
                  </span>
              </div>
          </div>
      </div>
      </div>
      );
  };

  if (isOnboardingRoute && !authUser) {
      return renderBetaMpOnboarding();
  }

  if (isLandingRoute && !authUser) {
      return <Landing />;
  }

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

  if (isBetaHost) {
      if (entitlementStatus === 'loading' || entitlementStatus === 'idle') {
          return renderEntitlementLoading();
      }
      if (entitlementStatus !== 'active') {
          return renderEntitlementPending();
      }
  }

  if (onboardingLoading) {
      return renderOnboardingLoading();
  }

  const shouldShowOnboarding = !onboardingCompleted;
  if (shouldShowOnboarding) {
      return (
          <OnboardingWizard
              companyInfo={companyInfo}
              accounts={accounts}
              creditCards={creditCards}
              accountTypes={accountTypes}
              initialTotalBalance={onboardingSettings?.initialTotalBalance}
              onUpdateCompany={handleUpdateCompany}
              onUpdateAccounts={handleUpdateAccounts}
              onUpdateAccountTypes={setAccountTypes}
              onUpdateCreditCards={handleUpdateCreditCards}
              onPersistOnboarding={persistOnboarding}
              onComplete={handleOnboardingComplete}
              isBusy={isLoading}
          />
      );
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
                onOpenDas={() => setCurrentView(ViewState.DAS)}
                financialData={{
                    balance: totalBalance,
                    legacyBalance: legacyTotalBalance,
                    income: totalIncome,
                    expenses: totalExpenses,
                    pendingExpenses,
                    pendingIncome,
                    annualMeiRevenue
                }}
                creditCards={creditCards}
                expenseBreakdown={expenseBreakdown} 
                expenses={expenses}
                expensesRevision={expensesRevision}
                onRefreshExpenses={handleRefreshExpenses}
                incomes={incomes}
                accounts={accounts}
                viewDate={viewDate}
                minDate={minTransactionDate}
                onOpenInstall={openModalManual}
                isAppInstalled={isPwaInstalled}
                tipsEnabled={tipsEnabled && onboardingCompleted}
                onOpenSettings={() => canAccessSettings && setCurrentView(ViewState.SETTINGS)}
                categoriesCount={expenseCategories.length + incomeCategories.length}
                isPwaInstallable={pwaInstallMode === 'installable'}
                isStandalone={isStandalone}
                onInstallApp={triggerInstall}
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

      {currentView === ViewState.DAS && renderLayout(
          <DasView
              onBack={() => setCurrentView(ViewState.DASHBOARD)}
              company={companyInfo}
              onOpenCompany={() => setCurrentView(ViewState.SETTINGS)}
          />
      )}

      {currentView === ViewState.ACCOUNTS && renderLayout(
          <AccountsView 
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
             onDeleteAccount={handleDeleteAccount}
             incomes={incomes}
             expenses={expenses}
             accountTypes={accountTypes}
             onUpdateAccountTypes={setAccountTypes}
             onAuditLog={handleAuditLog}
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['account'] })}
             balanceSnapshot={balanceSnapshot}
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
              userId={authUser?.uid || null}
             onAddCategory={(name) => handleAddCategory('incomes', name)}
             onRemoveCategory={(name) => handleRemoveCategory('incomes', name)}
             onResetCategories={handleResetCategories}
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['income'] })}
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
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['yield'] })}
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
              userId={authUser?.uid || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onResetCategories={handleResetCategories}
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['expense'] })}
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
              userId={authUser?.uid || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onResetCategories={handleResetCategories}
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['expense'] })}
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
              userId={authUser?.uid || null}
             onAddCategory={(name) => handleAddCategory('expenses', name)}
             onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
             onResetCategories={handleResetCategories}
             onOpenAudit={() => setAuditModalState({ isOpen: true, entityTypes: ['expense'] })}
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
            userId={authUser?.uid}
          companyInfo={companyInfo}
          onUpdateCompany={handleUpdateCompany}
          onSystemReset={handleSystemReset}
          onOpenInstall={openModalManual}
          isAppInstalled={isPwaInstalled}
          tipsEnabled={tipsEnabled}
          onUpdateTipsEnabled={handleTipsEnabledChange}
        />
      )}
      <CalculatorModal 
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
      />
      <AuditLogModal
          isOpen={auditModalState.isOpen}
          onClose={() => setAuditModalState(prev => ({ ...prev, isOpen: false }))}
          licenseId={currentUser?.licenseId || null}
          entityTypes={auditModalState.entityTypes ?? undefined}
      />
      {installBannerVisible && (
          <div className="fixed bottom-4 left-4 right-4 z-[85] md:left-auto md:right-6">
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-white shadow-2xl md:flex-row md:items-center">
                  <div className="flex-1 text-sm text-slate-200">
                      Instale o meumei para abrir mais rapido e usar como app.
                  </div>
                  <div className="flex flex-wrap gap-2">
                      <button
                          type="button"
                          onClick={handleInstallBannerPrimary}
                          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 transition"
                      >
                          {deferredPromptEvent ? 'Instalar' : 'Como instalar'}
                      </button>
                      <button
                          type="button"
                          onClick={handleInstallBannerDismiss}
                          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 transition"
                      >
                          Agora nao
                      </button>
                  </div>
              </div>
          </div>
      )}
      {installHelpOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-10">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121214] px-5 py-4 text-white shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                      <div>
                          <h3 className="text-base font-semibold">Como instalar</h3>
                          <p className="text-xs text-slate-400">Siga os passos abaixo no seu dispositivo.</p>
                      </div>
                      <button
                          type="button"
                          onClick={() => setInstallHelpOpen(false)}
                          className="text-slate-400 hover:text-white"
                      >
                          Fechar
                      </button>
                  </div>
                  <div className="mt-4 text-sm text-slate-200 space-y-2">
                      {isIosDevice ? (
                          <>
                              <p>1) No Safari, toque em Compartilhar.</p>
                              <p>2) Selecione "Adicionar a Tela de Inicio".</p>
                              <p>3) Confirme em "Adicionar".</p>
                          </>
                      ) : (
                          <>
                              <p>1) No Chrome, abra o menu do navegador.</p>
                              <p>2) Toque em "Instalar app" ou "Adicionar a tela inicial".</p>
                          </>
                      )}
                  </div>
                  <button
                      type="button"
                      onClick={() => setInstallHelpOpen(false)}
                      className="mt-4 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 transition"
                  >
                      Entendi
                  </button>
              </div>
          </div>
      )}
      <InstallAppModal
          isOpen={isPwaInstallOpen}
          isInstalled={isPwaInstalled}
          mode={pwaInstallMode}
          onInstall={triggerInstall}
          onClose={closePwaModal}
      />
      {isMobile && (
          <MobileQuickAccessFooter items={mobileQuickAccessItems} />
      )}
      {!isMobile && (
          <DesktopQuickAccessFooter items={desktopQuickAccessItems} />
      )}
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
