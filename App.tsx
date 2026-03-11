import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import AccountsView from './components/AccountsView';
import ExpensesView from './components/ExpensesView';
import IncomesView from './components/IncomesView';
import LaunchesView from './components/LaunchesView';
import YieldsView from './components/YieldsView'; 
import InvoicesView from './components/InvoicesView'; 
import ReportsView from './components/ReportsView';
import DasView from './components/DasView';
import AgendaView from './components/AgendaView';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import GlobalHeader from './components/GlobalHeader';
import CompanyDetailsView from './components/CompanyDetailsView';
import CompanyDetailsSheet from './components/CompanyDetailsSheet';
import CalculatorModal from './components/CalculatorModal';
import AuditLogModal from './components/AuditLogModal';
import MasterControlPanel from './components/MasterControlPanel';
import FaturasErrorBoundary from './components/FaturasErrorBoundary';
import InstallAppModal from './components/InstallAppModal';
import TourDecisionModal from './components/TourDecisionModal';
import MobileQuickAccessFooter from './components/mobile/MobileQuickAccessFooter';
import DesktopQuickAccessFooter from './components/desktop/DesktopQuickAccessFooter';
import DesktopFirstAccessTour from './components/DesktopFirstAccessTour';
import Landing from './Pages/Landing';
import Termos from './Pages/Termos';
import Privacidade from './Pages/Privacidade';
import Reembolso from './Pages/Reembolso';
import { ViewState, CompanyInfo, Account, CreditCard, Expense, Income, LicenseRecord, ThemePreference, ExpenseType, ExpenseTypeOption, AgendaItem, Transfer } from './types';
import { COMPANY_DATA, DEFAULT_COMPANY_INFO, DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_TYPES, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_EXPENSE_TYPES } from './constants';
import { dataService } from './services/dataService';
import { seedDevAnnualCoverage, seedDevUserData } from './services/devSeedService';
import { categoryService, CategoryType } from './services/categoryService';
import NewExpenseModal from './components/NewExpenseModal';
import { auditService, AuditLogInput } from './services/auditService';
import { yieldsService, YieldRecord } from './services/yieldsService';
import { computeRealBalances, RealBalanceResult } from './services/realBalanceEngine';
import { onboardingService, OnboardingSettings } from './services/onboardingService';
import { GlobalActionsProvider, useGlobalActions, NavigatePayload } from './contexts/GlobalActionsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
 
import { auth, db, firebaseDebugInfo } from './services/firebase';
import { preferencesService } from './services/preferencesService';
import { betaKeysService } from './services/betaKeysService';
import { masterFeedbackService } from './services/masterFeedbackService';
import {
  ArrowUpCircle,
  ArrowDownUp,
  CalendarDays,
  Calculator,
  CreditCard as CreditCardIcon,
  FileText,
  History,
  Home,
  Loader2,
  LogOut,
  ExternalLink,
  Eye,
  EyeOff,
  Repeat,
  ShieldOff,
  ShoppingCart,
  TrendingUp,
  Shield,
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
import useIsCompactHeight from './hooks/useIsCompactHeight';
import useMobileTopOffset from './hooks/useMobileTopOffset';
import useIsMobileLandscape from './hooks/useIsMobileLandscape';
import APP_VERSION from './appVersion';
import type { AuditEntityType } from './services/auditService';
import { APP_VERSION as LOGIN_APP_VERSION, BUILD_TIME } from './version';
import { BUILD_ID } from './utils/buildInfo';

const roundToCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeText = (value?: string | null) => String(value || '').trim();

const hasExpenseCoreChanges = (previous: Expense, next: Expense) => {
  const numberDiff = (a: number, b: number) => Math.abs(roundToCents(a) - roundToCents(b)) > 0.009;
  if (numberDiff(Number(previous.amount || 0), Number(next.amount || 0))) return true;
  if (normalizeText(previous.description) !== normalizeText(next.description)) return true;
  if (normalizeText(previous.category) !== normalizeText(next.category)) return true;
  if (normalizeText(previous.date) !== normalizeText(next.date)) return true;
  if (normalizeText(previous.dueDate) !== normalizeText(next.dueDate)) return true;
  if (normalizeText(previous.paymentMethod) !== normalizeText(next.paymentMethod)) return true;
  if (normalizeText(previous.accountId) !== normalizeText(next.accountId)) return true;
  if (normalizeText(previous.cardId) !== normalizeText(next.cardId)) return true;
  if (normalizeText(previous.status) !== normalizeText(next.status)) return true;
  if (normalizeText(previous.type) !== normalizeText(next.type)) return true;
  if (normalizeText(previous.notes) !== normalizeText(next.notes)) return true;
  return false;
};

const hasIncomeCoreChanges = (previous: Income, next: Income) => {
  const numberDiff = (a: number, b: number) => Math.abs(roundToCents(a) - roundToCents(b)) > 0.009;
  if (numberDiff(Number(previous.amount || 0), Number(next.amount || 0))) return true;
  if (normalizeText(previous.description) !== normalizeText(next.description)) return true;
  if (normalizeText(previous.category) !== normalizeText(next.category)) return true;
  if (normalizeText(previous.date) !== normalizeText(next.date)) return true;
  if (normalizeText(previous.competenceDate) !== normalizeText(next.competenceDate)) return true;
  if (normalizeText(previous.paymentMethod) !== normalizeText(next.paymentMethod)) return true;
  if (normalizeText(previous.accountId) !== normalizeText(next.accountId)) return true;
  if (normalizeText(previous.status) !== normalizeText(next.status)) return true;
  if (normalizeText(previous.notes) !== normalizeText(next.notes)) return true;
  return false;
};

interface LayoutOffenderEntry {
  selector: string;
  clientHeight: number;
  scrollHeight: number;
}

interface LayoutMetricsSnapshot {
  viewportWidth: number;
  viewportHeight: number;
  headerHeight: number;
  dockHeight: number;
  subheaderHeight: number;
  contentAvailableHeight: number;
  mainClientHeight: number;
  mainScrollHeight: number;
  offenders: LayoutOffenderEntry[];
}

const PURCHASE_URL = 'https://meumeiapp.web.app/';
const BETA_LANDING_URL = 'https://meumei-d88be.web.app';
const MASTER_UID = 'ZbrLdQuqn4MlOK16MjBOr6GZM3l1';
const MASTER_EMAIL = 'meumeiaplicativo@gmail.com';
const LIFETIME_UIDS = new Set([
  'ZbrLdQuqn4MlOK16MjBOr6GZM3l1',
  '9nenft1OJpadIE8064wHq4KEefq2'
]);
const RESOLVE_TIMEOUT_MS = 12_000;
const LEGACY_ACCOUNT_TYPES_STORAGE_KEY = 'meumei_account_types';
const getScopedAccountTypesStorageKey = (uid: string) => `meumei_account_types:${uid}`;
const FIRST_ACCESS_INSTALL_DECISION_PREFIX = 'meumei_first_access_install_decision_v1';
const FIRST_ACCESS_TOUR_DECISION_PREFIX = 'meumei_first_access_tour_decision_v1';
const getScopedFirstAccessKey = (prefix: string, scopeId?: string | null) =>
  `${prefix}:${String(scopeId || 'default').trim() || 'default'}`;

const ReportsBarsIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    role="img"
    aria-hidden="true"
  >
    <rect x="5" y="13" width="4" height="10" rx="1" fill="#22c55e" />
    <rect x="12" y="7" width="4" height="16" rx="1" fill="#ef4444" />
    <rect x="19" y="10" width="4" height="13" rx="1" fill="#10b981" />
  </svg>
);

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
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [resolvedLicenseId, setResolvedLicenseId] = useState<string | null>(null);
  const [licenseReason, setLicenseReason] = useState<LicenseAccessReason | null>(null);
  const [licenseRetryToken, setLicenseRetryToken] = useState(0);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const [hasLoggedOut, setHasLoggedOut] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerAcceptedTerms, setRegisterAcceptedTerms] = useState(false);
  const [registerTermsError, setRegisterTermsError] = useState('');
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
  const [betaKeyOpen, setBetaKeyOpen] = useState(false);
  const [betaKeyCode, setBetaKeyCode] = useState('');
  const [betaKeyStatus, setBetaKeyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [betaKeyMessage, setBetaKeyMessage] = useState('');
  const [betaFlowActive, setBetaFlowActive] = useState(false);
  const betaAutoRedeemRef = useRef(false);
  const [authTimeoutHit, setAuthTimeoutHit] = useState(false);
  const [licenseBlockedDetail, setLicenseBlockedDetail] = useState('');
  const [licenseResolveState, setLicenseResolveState] = useState<'idle' | 'loading' | 'ready' | 'blocked'>('idle');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [onboardingSettings, setOnboardingSettings] = useState<OnboardingSettings | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const firstAccessScopeId = useMemo(() => {
      const uid = authUser?.uid?.trim();
      if (uid) return uid;
      const email = authUser?.email?.trim().toLowerCase();
      return email || null;
  }, [authUser?.email, authUser?.uid]);
  const [installDecisionCompleted, setInstallDecisionCompleted] = useState(false);
  const [tourDecision, setTourDecision] = useState<'pending' | 'accepted' | 'declined'>('pending');
  const [isTourDecisionOpen, setIsTourDecisionOpen] = useState(false);
  const [tourRestartToken, setTourRestartToken] = useState(0);
  const [currentPath, setCurrentPath] = useState(
      typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [currentSearch, setCurrentSearch] = useState(
      typeof window !== 'undefined' ? window.location.search : ''
  );
  const [layoutMetrics, setLayoutMetrics] = useState<LayoutMetricsSnapshot | null>(null);
  const debugLayoutEnabled = useMemo(() => {
      const params = new URLSearchParams(currentSearch || '');
      const queryEnabled = params.get('debugLayout') === '1';
      const envEnabled = import.meta.env.VITE_DEBUG_LAYOUT === 'true';
      return queryEnabled || envEnabled;
  }, [currentSearch]);
  const [entitlementStatus, setEntitlementStatus] = useState<'idle' | 'loading' | 'active' | 'none' | 'error'>('idle');
  const [entitlementRetryToken, setEntitlementRetryToken] = useState(0);
  const [entitlementError, setEntitlementError] = useState<{ code?: string; message?: string } | null>(null);
  const [entitlementMeta, setEntitlementMeta] = useState<{
    expiresAtMs: number | null;
    source?: string | null;
    planType?: string | null;
    subscriptionCurrentPeriodEndMs?: number | null;
    stripeCheckoutSessionCreated?: number | null;
  } | null>(null);
  const [trialNotice, setTrialNotice] = useState<{ daysLeft: number } | null>(null);
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
  const [bugNotificationCount, setBugNotificationCount] = useState(0);
  const [masterInitialMode, setMasterInitialMode] = useState<'feedback' | null>(null);

  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pwaInstalledFlag, setPwaInstalledFlag] = useState(false);
  const [deferredPromptEvent, setDeferredPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const isMobileLandscape = useIsMobileLandscape();
  useMobileTopOffset();
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  const [quickExpenseType, setQuickExpenseType] = useState<ExpenseType>('variable');
  const [autoOpenIncome, setAutoOpenIncome] = useState(false);
  const [autoOpenIncomeEditId, setAutoOpenIncomeEditId] = useState<string | null>(null);
  const [autoOpenExpenseEditId, setAutoOpenExpenseEditId] = useState<string | null>(null);
  const [autoOpenExpense, setAutoOpenExpense] = useState(false);
  const [mobileExpensesScope, setMobileExpensesScope] = useState<ExpenseType | 'all'>('all');
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
  const isUpgradeRoute = currentPath === '/upgrade';
  const isLoginRoute = currentPath === '/login';
  const isTermsRoute = currentPath === '/termos';
  const isPrivacyRoute = currentPath === '/privacidade';
  const isRefundRoute = currentPath === '/reembolso';
  const isPublicRoute = isLandingRoute || isUpgradeRoute || isLoginRoute || isTermsRoute || isPrivacyRoute || isRefundRoute;
  const shouldUseAppShellLayout =
      !isLandingRoute &&
      !isUpgradeRoute &&
      !isLoginRoute &&
      !isTermsRoute &&
      !isPrivacyRoute &&
      !isRefundRoute;
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const mobileSwipeGestureRef = useRef<{
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      startedAt: number;
      isHorizontal: boolean;
  } | null>(null);
  const mobileSwipeVisualResetTimerRef = useRef<number | null>(null);
  const [mobileSwipeVisualOffset, setMobileSwipeVisualOffset] = useState(0);
  const [mobileSwipeVisualTransitionMs, setMobileSwipeVisualTransitionMs] = useState(0);
  const [mobileSwipeVisualActive, setMobileSwipeVisualActive] = useState(false);
  const layoutMetricsSignatureRef = useRef('');
  useEffect(() => {
      if (typeof document === 'undefined') return;
      document.body.dataset.appShell = shouldUseAppShellLayout ? 'true' : 'false';
  }, [shouldUseAppShellLayout]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const root = document.documentElement;
      const mainNode = mainContentRef.current;
      if (isMobile || !mainNode || !shouldUseAppShellLayout) {
          if (mainNode) {
              mainNode.style.overflowY = '';
              mainNode.removeAttribute('data-mm-scroll-needed');
          }
          root.style.setProperty('--mm-ui-scale', '1');
          setLayoutMetrics(null);
          return;
      }

      const describeNode = (node: Element) => {
          const idPart = node.id ? `#${node.id}` : '';
          const classPart =
              node instanceof HTMLElement && node.className
                  ? `.${node.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')}`
                  : '';
          return `${node.tagName.toLowerCase()}${idPart}${classPart}`;
      };

      const findVisibleSubheader = () => {
          const mainNode = mainContentRef.current;
          if (!mainNode) return null;
          const nodes = Array.from(mainNode.querySelectorAll('.mm-subheader')) as HTMLElement[];
          return (
              nodes.find(node => {
                  const rect = node.getBoundingClientRect();
              return rect.height > 0 && rect.width > 0;
          }) || null
      );
      };

      const buildSelector = (node: HTMLElement) => {
          const anchor = node.getAttribute('data-tour-anchor');
          if (anchor) return `[data-tour-anchor="${anchor}"]`;
          const modalRoot = node.getAttribute('data-modal-root');
          if (modalRoot !== null) return '[data-modal-root]';
          const dockItem = node.getAttribute('data-dock-item-id');
          if (dockItem) return `[data-dock-item-id="${dockItem}"]`;
          return describeNode(node);
      };

      const collectLayoutOffenders = (mainNode: HTMLElement | null) => {
          if (!mainNode) return [] as LayoutOffenderEntry[];
          return Array.from(mainNode.querySelectorAll('*'))
              .filter(node => node instanceof HTMLElement)
              .map(node => node as HTMLElement)
              .filter(node => node !== mainNode)
              .filter(node => node.clientHeight > 0 && node.scrollHeight - node.clientHeight > 4)
              .slice(0, 10)
              .map(node => ({
                  selector: buildSelector(node),
                  clientHeight: Math.round(node.clientHeight),
                  scrollHeight: Math.round(node.scrollHeight)
              }));
      };

      const updateMetrics = () => {
          const viewportWidth = Math.round(window.innerWidth);
          const viewportHeight = Math.round(window.innerHeight);
          const headerNode = document.querySelector('[data-mm-global-header="true"]') as HTMLElement | null;
          const dockNode = document.querySelector('[data-mm-desktop-dock-shell="true"]') as HTMLElement | null;
          const subheaderNode = findVisibleSubheader();
          const mainNode = mainContentRef.current;

          // Mantém escala 1 no shell desktop para evitar recorte visual global
          // causado por zoom < 1 no #root.
          const uiScale = 1;
          root.style.setProperty('--mm-ui-scale', uiScale.toFixed(3));

          const headerRect = headerNode?.getBoundingClientRect() || null;
          const monthSelectorNode = headerNode?.querySelector('#month-selector-bar') as HTMLElement | null;
          const monthSelectorRect = monthSelectorNode?.getBoundingClientRect() || null;
          const headerVisualBottom = Math.max(
              headerRect?.bottom || 0,
              monthSelectorRect?.bottom || 0
          );
          const headerVisualTop = headerRect?.top || 0;
          // O seletor de mês é absoluto e pode ultrapassar o rodapé do header.
          // Consideramos esse overhang na altura visual para evitar conteúdo "por trás".
          const headerHeightVisual = Math.max(0, Math.round(headerVisualBottom - headerVisualTop));
          const dockBarNode = dockNode?.querySelector('.mm-dock-bar') as HTMLElement | null;
          const dockBarOffsetVisual = dockBarNode
              ? Math.round(window.innerHeight - dockBarNode.getBoundingClientRect().top)
              : Math.round(
                    Number.parseFloat(root.style.getPropertyValue('--mm-desktop-dock-bar-offset')) || 0
                );
          const dockShellHeightVisual = Math.round(
              dockNode?.getBoundingClientRect().height ||
              Number.parseFloat(root.style.getPropertyValue('--mm-dock-shell-height')) ||
              Number.parseFloat(root.style.getPropertyValue('--mm-desktop-dock-height')) ||
              0
          );
          const dockShellTopVisual = Math.round(
              dockNode?.getBoundingClientRect().top || viewportHeight
          );
          const dockHeightVisual = Math.max(0, dockBarOffsetVisual, dockShellHeightVisual);
          const subheaderHeightVisual = Math.max(0, Math.round(subheaderNode?.getBoundingClientRect().height || 0));
          const mainTopVisual = Math.round(
              mainNode?.getBoundingClientRect().top || headerVisualBottom
          );

          const headerHeight = Math.max(0, headerHeightVisual);
          const dockHeight = Math.max(0, dockHeightVisual);
          const subheaderHeight = Math.max(0, subheaderHeightVisual);
          const cssScaleFactor = uiScale > 0 ? 1 / uiScale : 1;
          const viewportHeightCss = Math.max(0, Math.round(viewportHeight * cssScaleFactor));
          const headerHeightCss = Math.max(0, Math.round(headerHeight * cssScaleFactor));
          const dockHeightCss = Math.max(0, Math.round(dockHeight * cssScaleFactor));
          const subheaderHeightCss = Math.max(0, Math.round(subheaderHeight * cssScaleFactor));
          // A altura útil deve terminar exatamente no topo visual do shell da dock.
          // Isso evita "corte" entre conteúdo e dock em qualquer resolução.
          const contentAvailableHeightVisual = Math.max(
              0,
              dockShellTopVisual - mainTopVisual
          );
          const contentAvailableHeight = Math.max(
              0,
              Math.round(contentAvailableHeightVisual * cssScaleFactor)
          );
          const contentScrollHeight = contentAvailableHeight;
          const mainClientHeight = Math.max(0, Math.round(mainNode?.clientHeight || 0));
          const mainScrollHeight = Math.max(0, Math.round(mainNode?.scrollHeight || 0));
          const mainComputedStyle = mainNode ? window.getComputedStyle(mainNode) : null;
          const mainPaddingBottom = Math.max(0, Math.round(Number.parseFloat(mainComputedStyle?.paddingBottom || '0') || 0));
          const mainPaddingTop = Math.max(0, Math.round(Number.parseFloat(mainComputedStyle?.paddingTop || '0') || 0));
          const mainContentHeight = Math.max(0, mainScrollHeight - mainPaddingBottom - mainPaddingTop);
          const visibleContentHeight = Math.max(
              0,
              mainClientHeight - mainPaddingTop - mainPaddingBottom
          );
          const offenders = collectLayoutOffenders(mainNode);
          // Usa overflow real como fonte principal para evitar falso negativo em telas menores.
          const hasRealOverflow = mainScrollHeight - mainClientHeight > 1;
          const scrollNeeded = hasRealOverflow || mainContentHeight - visibleContentHeight > 2;
          // Folga mínima apenas para não "colar" no limite inferior.
          const dockReserveVisual = 6;
          const dockReserve = Math.max(4, Math.round(dockReserveVisual * cssScaleFactor));

          if (mainNode) {
              if (mainNode.style.overflowY !== 'auto') {
                  mainNode.style.overflowY = 'auto';
              }
              mainNode.setAttribute('data-mm-scroll-needed', scrollNeeded ? 'true' : 'false');
          }

          root.style.setProperty('--mm-header-height', `${headerHeightCss}px`);
          root.style.setProperty('--mm-dock-height', `${dockHeightCss}px`);
          root.style.setProperty('--mm-desktop-dock-height', `${dockHeightCss}px`);
          root.style.setProperty('--mm-subheader-height', `${subheaderHeightCss}px`);
          root.style.setProperty('--mm-content-available-height', `${contentAvailableHeight}px`);
          root.style.setProperty('--mm-content-scroll-height', `${contentScrollHeight}px`);
          root.style.setProperty('--mm-content-dock-clearance', `${dockReserve}px`);
          appRootRef.current?.style.setProperty('--mm-content-available-height', `${contentAvailableHeight}px`);
          appRootRef.current?.style.setProperty('--mm-content-scroll-height', `${contentScrollHeight}px`);
          appRootRef.current?.style.setProperty('--mm-content-dock-clearance', `${dockReserve}px`);
          appRootRef.current?.style.setProperty('--mm-dock-height', `${dockHeightCss}px`);
          const signature = [
              viewportWidth,
              viewportHeight,
              uiScale,
              headerHeight,
              dockHeight,
              subheaderHeight,
              contentAvailableHeight,
              mainClientHeight,
              mainScrollHeight,
              mainContentHeight,
              visibleContentHeight,
              scrollNeeded ? 1 : 0,
              offenders.map(offender => `${offender.selector}:${offender.clientHeight}/${offender.scrollHeight}`).join('|')
          ].join(':');
          if (layoutMetricsSignatureRef.current === signature) return;
          layoutMetricsSignatureRef.current = signature;

          setLayoutMetrics({
              viewportWidth,
              viewportHeight,
              headerHeight,
              dockHeight,
              subheaderHeight,
              contentAvailableHeight,
              mainClientHeight,
              mainScrollHeight,
              offenders
          });

          console.info(`[layout] viewport ${viewportWidth}x${viewportHeight} scale=${uiScale.toFixed(3)}`);
          console.info(`[layout] header=${headerHeight} dock=${dockHeight} subheader=${subheaderHeight}`);
          console.info(`[layout] contentAvail=${contentAvailableHeight} visible=${visibleContentHeight}`);
          console.info(
              `[layout] main client=${mainClientHeight} scroll=${mainScrollHeight} content=${mainContentHeight} needScroll=${scrollNeeded}`
          );
          console.info(
              `[layout] offenders: ${
                  offenders.length
                      ? offenders
                            .map(offender => `${offender.selector}(${offender.clientHeight}/${offender.scrollHeight})`)
                            .join(' | ')
                      : 'none'
              }`
          );
      };

      updateMetrics();

      const onResize = () => window.requestAnimationFrame(updateMetrics);
      window.addEventListener('resize', onResize);
      window.visualViewport?.addEventListener('resize', onResize);

      const resizeObserver =
          typeof ResizeObserver !== 'undefined'
              ? new ResizeObserver(() => window.requestAnimationFrame(updateMetrics))
              : null;
      const headerNode = document.querySelector('[data-mm-global-header="true"]') as HTMLElement | null;
      const dockNode = document.querySelector('[data-mm-desktop-dock-shell="true"]') as HTMLElement | null;
      if (headerNode) resizeObserver?.observe(headerNode);
      if (dockNode) resizeObserver?.observe(dockNode);
      if (mainContentRef.current) resizeObserver?.observe(mainContentRef.current);
      const subheaderNode = findVisibleSubheader();
      if (subheaderNode) resizeObserver?.observe(subheaderNode);

      const mutationObserver =
          typeof MutationObserver !== 'undefined'
              ? new MutationObserver(() => window.requestAnimationFrame(updateMetrics))
              : null;
      if (mainContentRef.current && mutationObserver) {
          mutationObserver.observe(mainContentRef.current, {
              childList: true,
              subtree: true,
              attributes: true
          });
      }

      return () => {
          window.removeEventListener('resize', onResize);
          window.visualViewport?.removeEventListener('resize', onResize);
          resizeObserver?.disconnect();
          mutationObserver?.disconnect();
          const mainNode = mainContentRef.current;
          if (mainNode) {
              mainNode.style.overflowY = '';
              mainNode.removeAttribute('data-mm-scroll-needed');
          }
      };
  }, [currentView, isCompactHeight, isMobile, shouldUseAppShellLayout]);
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
      transfers: null as null | (() => void),
      creditCards: null as null | (() => void),
      yields: null as null | (() => void),
      agenda: null as null | (() => void)
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
      if (typeof window === 'undefined') return;
      const enableUppercase =
        Boolean(authUser) &&
        !isLandingRoute &&
        !isTermsRoute &&
        !isPrivacyRoute &&
        !isRefundRoute;
      document.body.dataset.uppercase = enableUppercase ? 'on' : 'off';
      return () => {
        delete document.body.dataset.uppercase;
      };
  }, [authUser, isLandingRoute, isTermsRoute, isPrivacyRoute, isRefundRoute]);

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
  const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRIAL_NOTICE_KEY = 'meumei_trial_notice_last_shown';

  const renewalInfo = useMemo(() => {
      if (!entitlementMeta) return null;
      const planType = String(entitlementMeta.planType || '').toLowerCase();
      let renewalAtMs = entitlementMeta.expiresAtMs || null;
      if (!renewalAtMs && entitlementMeta.subscriptionCurrentPeriodEndMs) {
        renewalAtMs = entitlementMeta.subscriptionCurrentPeriodEndMs;
      }
      if (!renewalAtMs && planType === 'annual' && entitlementMeta.stripeCheckoutSessionCreated) {
        renewalAtMs = entitlementMeta.stripeCheckoutSessionCreated * 1000 + 365 * DAY_MS;
      }
      if (!renewalAtMs) return null;
      const daysLeft = Math.max(0, Math.ceil((renewalAtMs - Date.now()) / DAY_MS));
      const dateLabel = new Date(renewalAtMs).toLocaleDateString('pt-BR');
      return {
        label: planType === 'trial' ? 'Teste encerra em' : 'Renova em',
        dateLabel,
        daysLeft,
        planType: planType || 'annual',
        ctaLabel: planType === 'trial' ? 'Assinar' : 'Renovar'
      };
  }, [entitlementMeta, DAY_MS]);

  const entitlementBadge = useMemo(() => {
      const planType = String(entitlementMeta?.planType || '').toLowerCase();
      if (planType === 'lifetime') {
        return { label: 'Vitalício' };
      }
      return null;
  }, [entitlementMeta]);

  const handleRenew = () => {
      if (typeof window === 'undefined') return;
      const url = new URL('/upgrade', landingUrl);
      const plan = renewalInfo?.planType === 'monthly' ? 'monthly' : 'annual';
      url.searchParams.set('plan', plan);
      url.searchParams.set('upgrade', '1');
      if (authUser?.email) {
        url.searchParams.set('email', authUser.email);
      }
      window.location.href = url.toString();
  };

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

  const setDismissedNow = () => {
    try {
      localStorage.setItem(PWA_DISMISSED_AT_KEY, String(Date.now()));
    } catch {}
  };

  const readFirstAccessInstallDecision = (scopeId?: string | null) => {
    try {
      return localStorage.getItem(getScopedFirstAccessKey(FIRST_ACCESS_INSTALL_DECISION_PREFIX, scopeId)) === '1';
    } catch {
      return false;
    }
  };

  const persistFirstAccessInstallDecision = (scopeId?: string | null) => {
    try {
      localStorage.setItem(getScopedFirstAccessKey(FIRST_ACCESS_INSTALL_DECISION_PREFIX, scopeId), '1');
    } catch {
      // no-op
    }
  };

  const readFirstAccessTourDecision = (scopeId?: string | null) => {
    try {
      const raw = localStorage.getItem(getScopedFirstAccessKey(FIRST_ACCESS_TOUR_DECISION_PREFIX, scopeId));
      if (raw === 'accepted' || raw === 'declined') return raw;
      return 'pending';
    } catch {
      return 'pending';
    }
  };

  const persistFirstAccessTourDecision = (
    value: 'accepted' | 'declined',
    scopeId?: string | null
  ) => {
    try {
      localStorage.setItem(getScopedFirstAccessKey(FIRST_ACCESS_TOUR_DECISION_PREFIX, scopeId), value);
    } catch {
      // no-op
    }
  };

  const completeInstallDecisionStep = (reason: string) => {
    if (installDecisionCompleted) return;
    setInstallDecisionCompleted(true);
    persistFirstAccessInstallDecision(firstAccessScopeId);
    console.log('[first-access]', {
      step: 'install',
      status: 'completed',
      reason,
      scopeId: firstAccessScopeId || 'default'
    });
  };

  const applyTourDecision = (value: 'accepted' | 'declined', reason: string) => {
    setTourDecision(value);
    persistFirstAccessTourDecision(value, firstAccessScopeId);
    setIsTourDecisionOpen(false);
    console.log('[first-access]', {
      step: 'tour_decision',
      status: value,
      reason,
      scopeId: firstAccessScopeId || 'default'
    });
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
        const hasAuth = Boolean(authUser);
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
            if (isLoginRoute && !hasAuth) {
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

  const resolveEntitlementExpiry = (data: any) => {
    const raw = data?.expiresAt;
    if (!raw) return null;
    if (typeof raw.toMillis === 'function') {
      return raw.toMillis();
    }
    if (typeof raw.seconds === 'number') {
      return raw.seconds * 1000;
    }
    if (raw instanceof Date) {
      return raw.getTime();
    }
    return null;
  };

  const isEntitlementExpired = (data: any) => {
    const expiryMs = resolveEntitlementExpiry(data);
    if (!expiryMs) return false;
    return expiryMs <= Date.now();
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
          if (data?.status === 'active' && !isEntitlementExpired(data)) {
            return true;
          }
        }
      } catch (error) {
        console.error('[auth] signup_precheck_error', error);
      }
    }
    return false;
  };

  const handleRedeemBetaKey = async () => {
    const email = loginEmail.trim();
    const code = betaKeyCode.trim();
    if (!email) {
      setBetaKeyStatus('error');
      setBetaKeyMessage('Informe seu e-mail antes de validar a chave.');
      return;
    }
    if (!code) {
      setBetaKeyStatus('error');
      setBetaKeyMessage('Informe a chave beta.');
      return;
    }
    setBetaKeyStatus('loading');
    setBetaKeyMessage('');
    try {
      const result = await betaKeysService.redeemBetaKey({ code, email });
      if (!result.ok) {
        setBetaKeyStatus('error');
        setBetaKeyMessage(result.message || 'Não foi possível validar a chave.');
        return;
      }
      const expiresAtMs = result.data?.expiresAtMs || null;
      const daysLeft =
        expiresAtMs && Number.isFinite(expiresAtMs)
          ? Math.max(1, Math.ceil((expiresAtMs - Date.now()) / DAY_MS))
          : null;
      const daysCopy = daysLeft ? `por ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}` : 'por tempo limitado';
      setBetaKeyStatus('success');
      setBetaKeyMessage(`Chave validada. Seu acesso foi liberado ${daysCopy}. Agora crie sua senha e clique em Criar conta.`);
      setCheckoutStatus({
        tone: 'success',
        message: 'Chave validada. Você tem acesso temporário ao meumei.'
      });
      if (authMode !== 'register') {
        setAuthMode('register');
        setRegisterConfirmPassword('');
        setRegisterAcceptedTerms(false);
        setRegisterTermsError('');
        setLoginError('');
        setLoginErrorCode('');
      }
      setBetaFlowActive(true);
    } catch (error) {
      setBetaKeyStatus('error');
      setBetaKeyMessage('Não foi possível validar a chave.');
    }
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
    if (uid && LIFETIME_UIDS.has(uid)) {
      if (checkId !== entitlementCheckRef.current) return 'idle';
      setEntitlementStatus('active');
      setEntitlementError(null);
      setEntitlementMeta({
        expiresAtMs: null,
        source: 'lifetime',
        planType: 'lifetime',
        subscriptionCurrentPeriodEndMs: null,
        stripeCheckoutSessionCreated: null
      });
      console.log('[entitlement] lifetime_access', { uid, trigger });
      if (authUser) {
        updateFlowState('post_checkout_done', { reason: 'lifetime_access', trigger });
      }
      if (authUser && isLoginRoute) {
        updateRoute('/app', '');
      }
      return 'active';
    }
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
        const expired = exists && status === 'active' ? isEntitlementExpired(data) : false;
        console.log('[entitlement] result', { exists, status, data });
        if (exists && data) {
          const subscriptionPeriodRaw = data?.subscriptionCurrentPeriodEnd ?? data?.subscriptionCurrentPeriodEndMs ?? null;
          const subscriptionPeriodMs =
            subscriptionPeriodRaw && typeof subscriptionPeriodRaw.toMillis === 'function'
              ? subscriptionPeriodRaw.toMillis()
              : typeof subscriptionPeriodRaw === 'number'
              ? subscriptionPeriodRaw
              : null;
          setEntitlementMeta({
            expiresAtMs: resolveEntitlementExpiry(data),
            source: data?.source || null,
            planType: data?.planType || null,
            subscriptionCurrentPeriodEndMs: subscriptionPeriodMs,
            stripeCheckoutSessionCreated: typeof data?.stripeCheckoutSessionCreated === 'number' ? data.stripeCheckoutSessionCreated : null
          });
        }
        if (exists && status === 'active' && !expired) {
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
        if (expired) {
          console.log('[entitlement] expired', { docId });
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
    setEntitlementMeta(null);
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
              if (!isPublicRoute) {
                  if (email) {
                      console.log('[routing-check] choosing route', { route: '/criar-conta', reason: 'email_present', email });
                      updateRoute('/criar-conta', `?email=${encodeURIComponent(email)}`);
                  } else {
                      console.log('[routing-check] choosing route', { route: '/login', reason: 'no_email' });
                      updateRoute('/login', '');
                  }
              }
          } catch (err) {
              if (!isPublicRoute) {
                  updateRoute('/login', '');
              }
          }
          return;
      }
      if (isLandingRoute) {
        updateRoute('/app', '');
      }
  }, [authUser, isLandingRoute, isLoginRoute, isOnboardingRoute, currentSearch]);

  useEffect(() => {
      if (!isStandalone || !isBetaHost) return;
      if (!isLandingRoute) return;
      if (isUpgradeRoute) return;
      const target = authUser ? '/app' : '/login';
      if (currentPath === target) return;
      console.log('[pwa] detected standalone', {
        standalone: true,
        path: currentPath,
        target
      });
      updateRoute(target, '');
  }, [authUser, currentPath, currentSearch, isBetaHost, isLandingRoute, isUpgradeRoute, isStandalone]);

  useEffect(() => {
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
          void verifyCheckoutSession(sessionId).then(async (email) => {
              if (!email) {
                  clearCheckoutParamsFromUrl();
                  return;
              }
              const ok = await grantEntitlement(sessionId, 'register');
              if (!ok) {
                  clearCheckoutParamsFromUrl(email || undefined);
                  return;
              }
              void checkEntitlement('post-login');
          });
      }
  }, [authUser, currentSearch]);

  const betaPrefillRef = useRef(false);
  useEffect(() => {
      if (!isLoginRoute) {
          betaPrefillRef.current = false;
          return;
      }
      if (betaPrefillRef.current) return;
      const params = new URLSearchParams(currentSearch);
      const beta = params.get('beta') || params.get('chave') || params.get('key');
      const emailParam = params.get('email') || '';
      if (emailParam && !loginEmail) {
          setLoginEmail(emailParam);
      }
      if (beta) {
          setBetaKeyCode(beta.trim().toUpperCase());
          setBetaKeyOpen(true);
          setBetaFlowActive(true);
          setAuthMode('register');
          setRegisterConfirmPassword('');
          setRegisterAcceptedTerms(false);
          setRegisterTermsError('');
          setLoginError('');
          setLoginErrorCode('');
      }
      betaPrefillRef.current = true;
  }, [currentSearch, isLoginRoute, loginEmail]);

  useEffect(() => {
      if (!isLoginRoute) return;
      if (!betaFlowActive) return;
      if (betaAutoRedeemRef.current) return;
      if (!betaKeyCode.trim() || !loginEmail.trim()) return;
      betaAutoRedeemRef.current = true;
      void handleRedeemBetaKey();
  }, [betaFlowActive, betaKeyCode, isLoginRoute, loginEmail]);

  useEffect(() => {
      if (authUser) return;
      if (!isOnboardingRoute) return;
      updateRoute('/login', '');
  }, [authUser, isOnboardingRoute]);

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
      if (!completed && currentPath !== '/onboarding' && currentPath !== '/upgrade') {
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
  const isMasterUser =
    authUser?.uid === MASTER_UID ||
    (authUser?.email ? authUser.email.trim().toLowerCase() === MASTER_EMAIL : false);

  useEffect(() => {
    if (!authUser || !isMasterUser) {
      setBugNotificationCount(0);
      return;
    }
    let cancelled = false;
    const loadBugNotifications = async () => {
      try {
        const result = await masterFeedbackService.listUserFeedback({
          status: 'new',
          type: 'all',
          limit: 200
        });
        if (!cancelled && result.ok) {
          const total = typeof result.total === 'number' ? result.total : result.items?.length || 0;
          setBugNotificationCount(Math.max(0, total));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[feedback] header_badge_load_failed', error);
        }
      }
    };

    void loadBugNotifications();
    const intervalId = window.setInterval(() => {
      void loadBugNotifications();
    }, 30_000);
    const onFocus = () => {
      void loadBugNotifications();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [authUser, isMasterUser]);
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
    completeInstallDecisionStep('banner_primary');
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
    completeInstallDecisionStep('banner_dismiss');
    setDismissedNow();
    setInstallBannerVisible(false);
    console.log('[pwa] install_banner_hidden', { reason: 'dismissed' });
  };

  const handleInstallStepInstall = async () => {
    completeInstallDecisionStep('modal_install');
    if (pwaInstallMode !== 'installable') {
      closePwaModal();
      return;
    }
    try {
      await triggerInstall();
    } catch (error) {
      console.error('[pwa] install_modal_error', error);
      closePwaModal();
    }
  };

  const handleInstallStepClose = () => {
    completeInstallDecisionStep('modal_skip');
    closePwaModal();
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
  const accountsRef = useRef<Account[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesRevision, setExpensesRevision] = useState(0);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [yields, setYields] = useState<YieldRecord[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const agendaNotifyPatchedRef = useRef<Set<string>>(new Set());
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [auditModalState, setAuditModalState] = useState<{
    isOpen: boolean;
    entityTypes?: AuditEntityType[] | null;
  }>({ isOpen: false, entityTypes: null });
  const openAuditPanel = useCallback((entityTypes: AuditEntityType[] | null = null) => {
    setAuditModalState({ isOpen: true, entityTypes });
    setCurrentView(ViewState.AUDIT);
  }, [setCurrentView]);
  const [licenseMeta, setLicenseMeta] = useState<LicenseRecord | null>(null);
  const [licenseCryptoEpoch, setLicenseCryptoEpoch] = useState<number | null>(null);
  const balanceRepairInFlightRef = useRef(false);

  const applyExpenses = (next: Expense[] | ((prev: Expense[]) => Expense[])) => {
    setExpenses(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return [...resolved];
    });
    setExpensesRevision(prev => prev + 1);
  };

  const applyAccounts = useCallback((next: Account[] | ((prev: Account[]) => Account[])) => {
    setAccounts(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const normalized = [...resolved];
      accountsRef.current = normalized;
      return normalized;
    });
  }, []);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
  
  const normalizeAccountTypes = (raw?: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    const result: string[] = [];
    const seen = new Set<string>();
    raw.forEach((item) => {
      const value = String(item ?? '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      if (result.length >= 20) return;
      seen.add(key);
      result.push(value);
    });
    return result;
  };

  const isLegacyDefaultAccountTypes = (items: string[]): boolean => {
    const defaultTypes = normalizeAccountTypes(DEFAULT_ACCOUNT_TYPES);
    if (items.length !== defaultTypes.length) return false;
    const currentSignature = [...items].map((item) => item.toLowerCase()).sort().join('|');
    const defaultSignature = [...defaultTypes].map((item) => item.toLowerCase()).sort().join('|');
    return currentSignature === defaultSignature;
  };

  // Local settings per user (novos usuários iniciam vazio)
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const accountTypesRef = useRef<string[]>([]);
  const tourAccountTypesSnapshotRef = useRef<string[] | null>(null);

  useEffect(() => {
    accountTypesRef.current = accountTypes;
  }, [accountTypes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTourStarted = () => {
      if (tourAccountTypesSnapshotRef.current !== null) return;
      tourAccountTypesSnapshotRef.current = [...accountTypesRef.current];
    };

    const restoreTourAccountTypes = () => {
      if (tourAccountTypesSnapshotRef.current === null) return;
      const snapshot = [...tourAccountTypesSnapshotRef.current];
      tourAccountTypesSnapshotRef.current = null;
      setAccountTypes(snapshot);
    };

    window.addEventListener('mm:first-access-tour-started', handleTourStarted as EventListener);
    window.addEventListener('mm:first-access-tour-clear-data', restoreTourAccountTypes as EventListener);
    window.addEventListener('mm:first-access-tour-ended', restoreTourAccountTypes as EventListener);
    window.addEventListener('mm:first-access-tour-restart', restoreTourAccountTypes as EventListener);

    return () => {
      window.removeEventListener('mm:first-access-tour-started', handleTourStarted as EventListener);
      window.removeEventListener('mm:first-access-tour-clear-data', restoreTourAccountTypes as EventListener);
      window.removeEventListener('mm:first-access-tour-ended', restoreTourAccountTypes as EventListener);
      window.removeEventListener('mm:first-access-tour-restart', restoreTourAccountTypes as EventListener);
    };
  }, []);

  const [expenseCategories, setExpenseCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState<string[]>(DEFAULT_INCOME_CATEGORIES);
  const normalizeExpenseTypeOptions = (raw?: unknown): ExpenseTypeOption[] => {
    try {
      const byId = new Map<ExpenseTypeOption['id'], ExpenseTypeOption>();
      DEFAULT_EXPENSE_TYPES.forEach((option) => {
        byId.set(option.id, { ...option });
      });
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const id = (item as ExpenseTypeOption).id as ExpenseTypeOption['id'];
          if (!byId.has(id)) return;
          const current = byId.get(id);
          if (!current) return;
          byId.set(id, {
            ...current,
            label:
              typeof (item as ExpenseTypeOption).label === 'string' && (item as ExpenseTypeOption).label.trim()
                ? (item as ExpenseTypeOption).label.trim()
                : current.label,
            enabled: typeof (item as ExpenseTypeOption).enabled === 'boolean' ? (item as ExpenseTypeOption).enabled : current.enabled,
            nature:
              (item as ExpenseTypeOption).nature === 'PF' || (item as ExpenseTypeOption).nature === 'PJ'
                ? (item as ExpenseTypeOption).nature
                : current.nature,
            color:
              typeof (item as ExpenseTypeOption).color === 'string' && (item as ExpenseTypeOption).color.trim()
                ? (item as ExpenseTypeOption).color.trim()
                : current.color
          });
        });
      }
      const merged = DEFAULT_EXPENSE_TYPES.map((option) => byId.get(option.id) || option);
      const normalized = merged.map((option) => {
        if (option.id === 'variable' && option.color?.toLowerCase() === '#ec4899') {
          return { ...option, color: '#ef4444' };
        }
        return option;
      });
      if (!normalized.some((option) => option.enabled)) {
        normalized[0] = { ...normalized[0], enabled: true };
      }
      return normalized;
    } catch {
      return DEFAULT_EXPENSE_TYPES;
    }
  };
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<ExpenseTypeOption[]>(() => {
    try {
      const saved = localStorage.getItem('meumei_expense_types');
      const parsed = saved ? JSON.parse(saved) : undefined;
      return normalizeExpenseTypeOptions(parsed);
    } catch {
      return DEFAULT_EXPENSE_TYPES;
    }
  });

  const expenseTypeColorById = useMemo(() => {
    const map = new Map<ExpenseType, string>();
    expenseTypeOptions.forEach(option => {
      if (option?.id && option?.color) map.set(option.id, option.color);
    });
    return map;
  }, [expenseTypeOptions]);
  const expenseTypeLabelById = useMemo(() => {
    const map = new Map<ExpenseType, string>();
    expenseTypeOptions.forEach(option => {
      if (option?.id && option?.label) map.set(option.id, option.label);
    });
    return map;
  }, [expenseTypeOptions]);
  const resolveExpenseColor = (type: ExpenseType) => expenseTypeColorById.get(type) || '#ef4444';
  const resolveExpenseLabel = (type: ExpenseType, fallback: string) => expenseTypeLabelById.get(type) || fallback;
  const fixedExpenseLabel = resolveExpenseLabel('fixed', 'Fixas');
  const variableExpenseLabel = resolveExpenseLabel('variable', 'Variáveis');
  const personalExpenseLabel = resolveExpenseLabel('personal', 'Pessoais');

  const viewAccent = useMemo(() => {
    switch (currentView) {
      case ViewState.DASHBOARD:
        return '#6366f1';
      case ViewState.ACCOUNTS:
        return '#3b82f6';
      case ViewState.INCOMES:
        return '#10b981';
      case ViewState.LAUNCHES:
        return '#06b6d4';
      case ViewState.FIXED_EXPENSES:
        return resolveExpenseColor('fixed');
      case ViewState.VARIABLE_EXPENSES:
        return resolveExpenseColor('variable');
      case ViewState.PERSONAL_EXPENSES:
        return resolveExpenseColor('personal');
      case ViewState.YIELDS:
        return '#8b5cf6';
      case ViewState.INVOICES:
        return '#f43f5e';
      case ViewState.REPORTS:
        return '#64748b';
      case ViewState.AUDIT:
        return '#94a3b8';
      case ViewState.DAS:
        return '#14b8a6';
      case ViewState.AGENDA:
        return '#38bdf8';
      case ViewState.MASTER:
        return '#f59e0b';
      default:
        return '#6366f1';
    }
  }, [currentView, resolveExpenseColor]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--mm-view-accent', viewAccent);
    root.style.setProperty('--mm-view-accent-strong', viewAccent);
  }, [viewAccent]);

  const desktopDockNavigationOrder = useMemo<ViewState[]>(
    () => [
      ViewState.DASHBOARD,
      ViewState.ACCOUNTS,
      ViewState.INCOMES,
      ViewState.FIXED_EXPENSES,
      ViewState.VARIABLE_EXPENSES,
      ViewState.PERSONAL_EXPENSES,
      ViewState.YIELDS,
      ViewState.INVOICES,
      ViewState.REPORTS,
      ViewState.AUDIT,
      ViewState.DAS,
      ViewState.AGENDA
    ],
    []
  );

  const mobileDockNavigationOrder = useMemo<ViewState[]>(
    () => [
      ViewState.DASHBOARD,
      ViewState.LAUNCHES,
      ViewState.ACCOUNTS,
      ViewState.YIELDS,
      ViewState.INVOICES,
      ViewState.REPORTS,
      ViewState.AGENDA
    ],
    []
  );

  const navigateDockByDirection = useCallback(
    (
      direction: 1 | -1,
      options?: { wrap?: boolean; source?: 'keyboard' | 'swipe' }
    ) => {
      if (currentView === ViewState.LOGIN) return false;
      const dockOrder = isMobile ? mobileDockNavigationOrder : desktopDockNavigationOrder;
      const currentIndex = dockOrder.indexOf(currentView);
      if (currentIndex === -1) return false;

      let nextIndex = currentIndex + direction;
      if (options?.wrap) {
        nextIndex = (nextIndex + dockOrder.length) % dockOrder.length;
      } else if (nextIndex < 0 || nextIndex >= dockOrder.length) {
        return false;
      }

      const nextView = dockOrder[nextIndex];
      if (!nextView || nextView === currentView) return false;

      if (auditModalState.isOpen) {
        setAuditModalState(prev => ({ ...prev, isOpen: false }));
      }
      if (isMobile && options?.source === 'swipe' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mm:mobile-dock-click'));
      }

      setCurrentView(nextView);
      return true;
    },
    [
      currentView,
      isMobile,
      mobileDockNavigationOrder,
      desktopDockNavigationOrder,
      auditModalState.isOpen,
      setAuditModalState,
      setCurrentView
    ]
  );

  const canAccessSettings = Boolean(currentUser);
  const mobileQuickAccessItems = useMemo(
    () => [
      {
        id: 'home',
        label: 'Início',
        shortLabel: 'Início',
        icon: <Home size={18} className="text-indigo-500 dark:text-indigo-400" />,
        onClick: () => setCurrentView(ViewState.DASHBOARD),
        isActive: currentView === ViewState.DASHBOARD
      },
      {
        id: 'launches',
        label: 'Lançamentos',
        shortLabel: 'Lanç.',
        icon: <ArrowDownUp size={18} className="text-cyan-500 dark:text-cyan-400" />,
        onClick: () => setCurrentView(ViewState.LAUNCHES),
        isActive: currentView === ViewState.LAUNCHES
      },
      {
        id: 'accounts',
        label: 'Contas Bancárias',
        shortLabel: 'Contas',
        icon: <Wallet size={18} className="text-blue-500 dark:text-blue-400" />,
        onClick: () => setCurrentView(ViewState.ACCOUNTS),
        isActive: currentView === ViewState.ACCOUNTS
      },
      {
        id: 'yields',
        label: 'Rendimentos',
        shortLabel: 'Rend.',
        icon: <TrendingUp size={18} className="text-violet-500 dark:text-violet-400" />,
        onClick: () => setCurrentView(ViewState.YIELDS),
        isActive: currentView === ViewState.YIELDS
      },
      {
        id: 'invoices',
        label: 'Faturas',
        shortLabel: 'Faturas',
        icon: <CreditCardIcon size={18} className="text-rose-500 dark:text-rose-400" />,
        onClick: () => setCurrentView(ViewState.INVOICES),
        isActive: currentView === ViewState.INVOICES
      },
      {
        id: 'reports',
        label: 'Relatórios',
        shortLabel: 'Relatórios',
        icon: <ReportsBarsIcon size={18} />,
        onClick: () => setCurrentView(ViewState.REPORTS),
        isActive: currentView === ViewState.REPORTS
      },
      {
        id: 'agenda',
        label: 'Agenda',
        shortLabel: 'Agenda',
        icon: <CalendarDays size={18} className="text-sky-500 dark:text-sky-400" />,
        onClick: () => setCurrentView(ViewState.AGENDA),
        isActive: currentView === ViewState.AGENDA
      }
    ],
    [currentView, setCurrentView, resolveExpenseColor, fixedExpenseLabel, variableExpenseLabel, personalExpenseLabel]
  );

  const desktopQuickAccessItems = useMemo(
    () => [
      {
        id: 'home',
        label: 'Início',
        shortLabel: 'Início',
        icon: <Home size={28} className="text-indigo-500 dark:text-indigo-400" />,
        onClick: () => setCurrentView(ViewState.DASHBOARD),
        showWhen: true,
        isActive: currentView === ViewState.DASHBOARD
      },
      {
        id: 'accounts',
        label: 'Contas Bancárias',
        shortLabel: 'Contas',
        icon: <Wallet size={28} className="text-blue-500 dark:text-blue-400" />,
        onClick: () => setCurrentView(ViewState.ACCOUNTS),
        isActive: currentView === ViewState.ACCOUNTS
      },
      {
        id: 'incomes',
        label: 'Entradas',
        shortLabel: 'Entradas',
        icon: <ArrowUpCircle size={28} className="text-emerald-500 dark:text-emerald-400" />,
        onClick: () => setCurrentView(ViewState.INCOMES),
        isActive: currentView === ViewState.INCOMES
      },
      {
        id: 'fixed_expenses',
        label: `Despesas ${fixedExpenseLabel}`,
        shortLabel: fixedExpenseLabel,
        icon: <Repeat size={28} style={{ color: resolveExpenseColor('fixed') }} />,
        onClick: () => setCurrentView(ViewState.FIXED_EXPENSES),
        isActive: currentView === ViewState.FIXED_EXPENSES
      },
      {
        id: 'variable_expenses',
        label: `Despesas ${variableExpenseLabel}`,
        shortLabel: variableExpenseLabel,
        icon: <ShoppingCart size={28} style={{ color: resolveExpenseColor('variable') }} />,
        onClick: () => setCurrentView(ViewState.VARIABLE_EXPENSES),
        isActive: currentView === ViewState.VARIABLE_EXPENSES
      },
      {
        id: 'personal_expenses',
        label: `Despesas ${personalExpenseLabel}`,
        shortLabel: personalExpenseLabel,
        icon: <User size={28} style={{ color: resolveExpenseColor('personal') }} />,
        onClick: () => setCurrentView(ViewState.PERSONAL_EXPENSES),
        isActive: currentView === ViewState.PERSONAL_EXPENSES
      },
      {
        id: 'yields',
        label: 'Rendimentos',
        shortLabel: 'Rend.',
        icon: <TrendingUp size={28} className="text-violet-500 dark:text-violet-400" />,
        onClick: () => setCurrentView(ViewState.YIELDS),
        isActive: currentView === ViewState.YIELDS
      },
      {
        id: 'invoices',
        label: 'Faturas',
        shortLabel: 'Faturas',
        icon: <CreditCardIcon size={28} className="text-rose-500 dark:text-rose-400" />,
        onClick: () => setCurrentView(ViewState.INVOICES),
        isActive: currentView === ViewState.INVOICES
      },
      {
        id: 'reports',
        label: 'Relatórios',
        shortLabel: 'Relatórios',
        icon: <ReportsBarsIcon size={28} />,
        onClick: () => setCurrentView(ViewState.REPORTS),
        isActive: currentView === ViewState.REPORTS
      },
      {
        id: 'das',
        label: 'Emissão DAS',
        shortLabel: 'DAS',
        icon: <FileText size={28} className="text-teal-500 dark:text-teal-400" />,
        onClick: () => setCurrentView(ViewState.DAS),
        isActive: currentView === ViewState.DAS
      },
      {
        id: 'agenda',
        label: 'Agenda',
        shortLabel: 'Agenda',
        icon: <CalendarDays size={28} className="text-sky-500 dark:text-sky-400" />,
        onClick: () => setCurrentView(ViewState.AGENDA),
        isActive: currentView === ViewState.AGENDA
      },
      {
        id: 'master',
        label: 'Painel de Controle',
        shortLabel: 'Controle',
        icon: <Shield size={28} className="text-amber-500 dark:text-amber-400" />,
        onClick: () => {
          setMasterInitialMode(null);
          setCurrentView(ViewState.MASTER);
        },
        isActive: currentView === ViewState.MASTER,
        showWhen: isMasterUser
      },
      {
        id: 'audit',
        label: 'Auditoria',
        shortLabel: 'Auditoria',
        icon: <History size={28} className="text-zinc-500 dark:text-zinc-400" />,
        onClick: () => openAuditPanel(null),
        isActive: currentView === ViewState.AUDIT
      },
      {
        id: 'calculator',
        label: 'Calculadora',
        shortLabel: 'Calc.',
        icon: <Calculator size={28} className="text-zinc-500 dark:text-zinc-400" />,
        onClick: () => setIsCalculatorOpen(true),
        isActive: isCalculatorOpen
      }
    ],
    [currentView, setCurrentView, resolveExpenseColor, openAuditPanel, isCalculatorOpen, setIsCalculatorOpen, isMasterUser]
  );

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const resolveInitialTheme = (): ThemePreference => {
      if (typeof window === 'undefined') return 'dark';
      try {
          const stored = localStorage.getItem('meumei_theme');
          if (stored === 'light' || stored === 'dark') {
              return stored;
          }
      } catch {}
      return 'dark';
  };
  const [theme, setTheme] = useState<'dark' | 'light'>(() => resolveInitialTheme());
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [assistantHidden, setAssistantHidden] = useState(false);
  const { registerHandlers, setHighlightTarget } = useGlobalActions();
  const onboardingCompleted = onboardingSettings?.onboardingCompleted === true;
  const viewHistoryRef = useRef<ViewState[]>([]);
  const prevViewRef = useRef<ViewState | null>(null);
  const {
    isOpen: isPwaInstallOpen,
    isInstalled: isPwaInstalled,
    mode: pwaInstallMode,
    openModalManual,
    closePwaModal,
    triggerInstall
  } = usePwaInstallPrompt();
  const isInstallStepModalVisible =
    isPwaInstallOpen &&
    onboardingCompleted &&
    !isTourDecisionOpen &&
    !isLoginRoute &&
    !isOnboardingRoute;

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
    if (currentView === ViewState.AUDIT) return;
    if (!auditModalState.isOpen) return;
    setAuditModalState(prev => ({ ...prev, isOpen: false }));
  }, [auditModalState.isOpen, currentView]);

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
        if (currentView === ViewState.AUDIT) {
          const previous = viewHistoryRef.current.pop();
          setCurrentView(previous || ViewState.DASHBOARD);
        }
        return;
      }
      if (installHelpOpen) {
        setInstallHelpOpen(false);
        return;
      }
      if (isInstallStepModalVisible) {
        handleInstallStepClose();
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
    currentView,
    handleInstallStepClose,
    installHelpOpen,
    auditModalState.isOpen,
    isInstallStepModalVisible,
    isCalculatorOpen
  ]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if (currentView === ViewState.LOGIN) return;
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const navigated = navigateDockByDirection(direction, {
        wrap: true,
        source: 'keyboard'
      });
      if (!navigated) return;
      event.preventDefault();
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [currentView, navigateDockByDirection]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLandingRoute && !authUser) {
      if (theme !== 'dark') {
        setTheme('dark');
      }
      return;
    }
    try {
      const stored = localStorage.getItem('meumei_theme');
      if (stored === 'light' || stored === 'dark') {
        if (stored !== theme) {
          setTheme(stored);
        }
      }
    } catch {}
  }, [authUser, isLandingRoute, theme]);

  useEffect(() => {
    if (!firstAccessScopeId) {
      setInstallDecisionCompleted(false);
      setTourDecision('pending');
      setIsTourDecisionOpen(false);
      setTourRestartToken(0);
      return;
    }
    const installDone = readFirstAccessInstallDecision(firstAccessScopeId);
    const storedTourDecision = readFirstAccessTourDecision(firstAccessScopeId);
    setInstallDecisionCompleted(installDone);
    setTourDecision(storedTourDecision);
    setIsTourDecisionOpen(false);
    console.log('[first-access]', {
      step: 'hydrate',
      scopeId: firstAccessScopeId,
      installDone,
      tourDecision: storedTourDecision
    });
  }, [firstAccessScopeId]);

  useEffect(() => {
    if (!authUser) return;
    if (!onboardingCompleted) return;
    if (installDecisionCompleted) return;
    if (!firstAccessScopeId) return;
    if (isPwaInstalled || isStandalone || readInstalledFlag()) {
      completeInstallDecisionStep('already_installed');
    }
  }, [
    authUser,
    firstAccessScopeId,
    installDecisionCompleted,
    isPwaInstalled,
    isStandalone,
    onboardingCompleted
  ]);

  useEffect(() => {
    if (!authUser) return;
    if (!onboardingCompleted) return;
    if (installDecisionCompleted) return;
    if (isOnboardingRoute || isLoginRoute || isUpgradeRoute || isTermsRoute || isPrivacyRoute || isRefundRoute) {
      return;
    }
    if (isPwaInstallOpen) return;
    console.log('[first-access]', {
      step: 'install',
      status: 'request_open',
      path: currentPath
    });
    const timer = window.setTimeout(() => {
      openModalManual();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    authUser,
    currentPath,
    installDecisionCompleted,
    isLoginRoute,
    isOnboardingRoute,
    isPrivacyRoute,
    isPwaInstallOpen,
    isRefundRoute,
    isTermsRoute,
    isUpgradeRoute,
    onboardingCompleted,
    openModalManual
  ]);

  useEffect(() => {
    if (isMobile) {
      setIsTourDecisionOpen(false);
      return;
    }
    if (!authUser || !onboardingCompleted) {
      setIsTourDecisionOpen(false);
      return;
    }
    if (!installDecisionCompleted) {
      setIsTourDecisionOpen(false);
      return;
    }
    if (tourDecision !== 'pending') {
      setIsTourDecisionOpen(false);
      return;
    }
    if (isInstallStepModalVisible) {
      setIsTourDecisionOpen(false);
      return;
    }
    if (isOnboardingRoute || isLoginRoute || isUpgradeRoute || isTermsRoute || isPrivacyRoute || isRefundRoute) {
      setIsTourDecisionOpen(false);
      return;
    }
    setIsTourDecisionOpen(true);
    console.log('[first-access]', {
      step: 'tour_decision',
      status: 'open',
      company: companyInfo?.name || null
    });
  }, [
    authUser,
    companyInfo?.name,
    installDecisionCompleted,
    isLoginRoute,
    isInstallStepModalVisible,
    isMobile,
    isOnboardingRoute,
    isPrivacyRoute,
    isRefundRoute,
    isTermsRoute,
    isUpgradeRoute,
    onboardingCompleted,
    tourDecision
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTourRestart = () => {
      if (!authUser || !onboardingCompleted || isMobile) return;
      if (!installDecisionCompleted) {
        completeInstallDecisionStep('tour_restart');
      }
      setIsTourDecisionOpen(false);
      setTourDecision('accepted');
      persistFirstAccessTourDecision('accepted', firstAccessScopeId);
      setCurrentView(ViewState.DASHBOARD);
      setTourRestartToken(prev => prev + 1);
      console.log('[first-access]', {
        step: 'tour_restart',
        status: 'forced_start',
        scopeId: firstAccessScopeId || 'default'
      });
    };

    window.addEventListener('mm:first-access-tour-restart', handleTourRestart as EventListener);
    return () => {
      window.removeEventListener('mm:first-access-tour-restart', handleTourRestart as EventListener);
    };
  }, [
    authUser,
    firstAccessScopeId,
    installDecisionCompleted,
    isMobile,
    onboardingCompleted
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
    if (onboardingCompleted && !installDecisionCompleted) {
      if (installBannerVisible) {
        console.log('[pwa] install_banner_hidden', {
          reason: 'first_access_install_step_active',
          path: currentPath
        });
      }
      setInstallBannerVisible(false);
      setInstallHelpOpen(false);
      return;
    }
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
    installDecisionCompleted,
    installBannerVisible,
    isBetaHost,
    isLandingRoute,
    isLoginRoute,
    isStandalone,
    onboardingCompleted,
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
    stop('transfers');
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
      applyAccounts([]);
      applyExpenses([]);
      setIncomes([]);
      setTransfers([]);
      setCreditCards([]);
      setCompanyInfo(DEFAULT_COMPANY_INFO);
      setLicenseMeta(null);
      setLicenseCryptoEpoch(null);
      setAccountTypes([]);
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
          setPreferencesReady(false);
          return;
      }
      setPreferencesLoading(true);
      setPreferencesReady(false);
      try {
          const pref = await preferencesService.getPreferences(uid);
          const scopedAccountTypesKey = getScopedAccountTypesStorageKey(uid);
          let resolvedAccountTypes: string[] | null = null;

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
          if (pref.expenseTypeOptions && pref.expenseTypeOptions.length > 0) {
              setExpenseTypeOptions(normalizeExpenseTypeOptions(pref.expenseTypeOptions));
          }

          if (Array.isArray(pref.accountTypes)) {
              resolvedAccountTypes = normalizeAccountTypes(pref.accountTypes);
          }

          if (resolvedAccountTypes === null) {
              try {
                  const scopedRaw = localStorage.getItem(scopedAccountTypesKey);
                  if (scopedRaw) {
                      resolvedAccountTypes = normalizeAccountTypes(JSON.parse(scopedRaw));
                  }
              } catch (error) {
                  console.error('[prefs] account_types_scoped_parse_error', {
                      message: (error as any)?.message || error
                  });
              }
          }

          if (resolvedAccountTypes === null) {
              try {
                  const legacyRaw = localStorage.getItem(LEGACY_ACCOUNT_TYPES_STORAGE_KEY);
                  if (legacyRaw) {
                      const migrated = normalizeAccountTypes(JSON.parse(legacyRaw));
                      const shouldMigrate = migrated.length > 0 && !isLegacyDefaultAccountTypes(migrated);
                      if (shouldMigrate) {
                          resolvedAccountTypes = migrated;
                          localStorage.setItem(scopedAccountTypesKey, JSON.stringify(migrated));
                          preferencesService
                              .setAccountTypes(uid, migrated)
                              .catch((error) => {
                                  console.error('[prefs] account_types_migration_save_error', {
                                      message: (error as any)?.message || error
                                  });
                              });
                      } else {
                          resolvedAccountTypes = [];
                      }
                  }
              } catch (error) {
                  console.error('[prefs] account_types_legacy_parse_error', {
                      message: (error as any)?.message || error
                  });
              }
          }

          setAccountTypes(resolvedAccountTypes ?? []);
      } catch (error) {
          console.error('[prefs] error', { step: 'load-apply', message: (error as any)?.message });
      } finally {
          setPreferencesLoading(false);
          setPreferencesReady(true);
      }
  };

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid) return;
      if (!onboardingSettings || onboardingSettings.onboardingCompleted) return;
      if (accounts.length > 0) return;
      if (!isLegacyDefaultAccountTypes(accountTypes)) return;
      setAccountTypes([]);
  }, [accountTypes, accounts.length, authUser?.uid, onboardingSettings]);

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
          setPreferencesReady(false);
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
          try {
              const pingKey = `meumei_last_active_ping:${uid}`;
              const now = Date.now();
              const lastPing = Number(localStorage.getItem(pingKey) || 0);
              const SIX_HOURS = 6 * 60 * 60 * 1000;
              if (!Number.isFinite(lastPing) || now - lastPing > SIX_HOURS) {
                  localStorage.setItem(pingKey, String(now));
                  void dataService.updateLastActive(uid);
              }
          } catch {
              void dataService.updateLastActive(uid);
          }
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

  useEffect(() => {
      if (typeof window === 'undefined') return;
      if (isPublicRoute) return;
      if (!authUser) return;
      if (!entitlementMeta?.expiresAtMs) return;
      if (String(entitlementMeta.source || '') !== 'trial') return;
      const daysLeft = Math.ceil((entitlementMeta.expiresAtMs - Date.now()) / DAY_MS);
      if (daysLeft > 3 || daysLeft <= 0) return;
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(TRIAL_NOTICE_KEY) === today) return;
      localStorage.setItem(TRIAL_NOTICE_KEY, today);
      setTrialNotice({ daysLeft });
  }, [authUser, entitlementMeta, isPublicRoute]);

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
      const trialExpired =
        Boolean(entitlementMeta?.expiresAtMs) &&
        String(entitlementMeta?.source || '') === 'trial' &&
        (entitlementMeta?.expiresAtMs || 0) <= Date.now();
      const title = hasEntitlementError
        ? 'Falha ao verificar acesso'
        : trialExpired
          ? 'Seu teste expirou'
          : 'Seu acesso está pendente';
      const description = hasEntitlementError
        ? 'Nao foi possivel validar o entitlement agora. Veja o detalhe abaixo.'
        : trialExpired
          ? 'Seu teste grátis terminou. Para continuar e manter seus dados, finalize sua assinatura.'
          : 'Assim que o pagamento for confirmado, liberamos o acesso automaticamente.';
      const handleReturnToPurchase = () => {
          if (typeof window === 'undefined') return;
          const url = new URL('/upgrade', landingUrl);
          url.searchParams.set('upgrade', '1');
          if (authUser?.email || loginEmail) {
            url.searchParams.set('email', (authUser?.email || loginEmail || '').trim());
          }
          window.location.href = url.toString();
      };
      const pendingEmail = authUser?.email || loginEmail || '';
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
                          <h2 className="text-xl font-semibold text-white/90">Entrar na sua conta</h2>
                      </div>
                      <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm text-slate-200">
                          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
                              {trialExpired ? 'Teste encerrado' : 'Aguardando liberação'}
                          </div>
                          <div className="mt-2 text-base font-semibold text-white/90">{title}</div>
                          <div className="mt-1 text-sm text-slate-200/90">{description}</div>
                      </div>
                      {hasEntitlementError && (
                          <div className="text-[11px] text-amber-200/80 border border-amber-200/20 bg-amber-400/10 rounded-xl px-3 py-2">
                              [debug] Firestore error {errorCode}: {errorMessage}
                          </div>
                      )}
                      <div className="space-y-4 text-left">
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.2em] ml-1 block">Email</label>
                              <input
                                  type="email"
                                  value={pendingEmail}
                                  readOnly
                                  className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60"
                                  placeholder="seuemail@dominio.com"
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.2em] ml-1 block">Senha</label>
                              <input
                                  type="password"
                                  value={loginPassword ? '********' : ''}
                                  readOnly
                                  className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60"
                                  placeholder="Sua senha"
                              />
                          </div>
                      </div>
                      <div className="flex flex-col gap-3 pt-2">
                          <button
                              type="button"
                              onClick={handleReturnToPurchase}
                              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 hover:from-cyan-300 hover:via-indigo-400 hover:to-fuchsia-400 text-white font-semibold px-4 py-3.5 rounded-full transition shadow-[0_18px_45px_rgba(59,130,246,0.35)]"
                          >
                              Retornar para compra
                          </button>
                          {!trialExpired && (
                              <button
                                  type="button"
                                  onClick={handleEntitlementRetry}
                                  className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-4 py-3 rounded-full transition"
                              >
                                  Verificar liberação
                              </button>
                          )}
                      </div>
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
              const normalizedStartDate = companySource.startDate || COMPANY_DATA.monthStartISO;
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

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid) return;
      if (!import.meta.env.DEV) return;
      if (uid !== 'ZbrLdQuqn4MlOK16MjBOr6GZM3l1') return;
      if (cryptoStatus !== 'ready' || !licenseCryptoEpoch) return;
      if (typeof window === 'undefined') return;
      const seedKey = `dev-seed:${uid}:v4`;
      if (window.localStorage.getItem(seedKey) === 'done') return;
      let cancelled = false;
      (async () => {
          try {
              await seedDevUserData({ uid, licenseEpoch: licenseCryptoEpoch });
              if (!cancelled) {
                  window.localStorage.setItem(seedKey, 'done');
              }
          } catch (error) {
              console.error('[dev-seed] failed', error);
          }
      })();
      return () => {
          cancelled = true;
      };
  }, [authUser?.uid, cryptoStatus, licenseCryptoEpoch]);

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid) return;
      if (!import.meta.env.DEV) return;
      if (uid !== 'ZbrLdQuqn4MlOK16MjBOr6GZM3l1') return;
      if (cryptoStatus !== 'ready' || !licenseCryptoEpoch) return;
      if (typeof window === 'undefined') return;
      const year = new Date().getFullYear();
      const seedKey = `dev-seed-year:${uid}:${year}:v2`;
      if (window.localStorage.getItem(seedKey) === 'done') return;
      let cancelled = false;
      (async () => {
          try {
              await seedDevAnnualCoverage({ uid, licenseEpoch: licenseCryptoEpoch, year });
              if (!cancelled) {
                  window.localStorage.setItem(seedKey, 'done');
              }
          } catch (error) {
              console.error('[dev-seed] annual coverage failed', error);
          }
      })();
      return () => {
          cancelled = true;
      };
  }, [authUser?.uid, cryptoStatus, licenseCryptoEpoch]);

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid) return;
      if (!import.meta.env.DEV) return;
      if (uid !== 'ZbrLdQuqn4MlOK16MjBOr6GZM3l1') return;
      if (typeof window === 'undefined') return;
      const bootstrapKey = `dev-seed:bootstrap:${uid}:v2`;
      if (window.localStorage.getItem(bootstrapKey) === 'done') return;
      const run = async () => {
          try {
              if (!companyInfo?.name) {
                  const fallbackCompany: CompanyInfo = {
                      name: 'Meumei Testes LTDA',
                      cnpj: '12.345.678/0001-90',
                      startDate: new Date().toISOString().slice(0, 10),
                      address: 'Av. Principal, 123 - Centro, São Paulo/SP',
                      zipCode: '01000-000',
                      phone: '(11) 99999-9999',
                      email: 'meumei.testes@example.com',
                      website: 'https://meumei.testes'
                  };
                  await dataService.saveCompany(fallbackCompany, uid);
                  setCompanyInfo(fallbackCompany);
              }
              if (!onboardingSettings?.onboardingCompleted) {
                  await onboardingService.saveStatus(uid, {
                      onboardingCompleted: true,
                      onboardingCompletedAt: new Date().toISOString(),
                      onboardingVersion: 1
                  });
                  setOnboardingSettings(prev => ({
                      ...(prev || {}),
                      onboardingCompleted: true,
                      onboardingCompletedAt: new Date().toISOString(),
                      onboardingVersion: 1
                  }));
              }
              window.localStorage.setItem(bootstrapKey, 'done');
          } catch (error) {
              console.error('[dev-seed] bootstrap_failed', error);
          }
      };
      void run();
  }, [authUser?.uid, companyInfo?.name, onboardingSettings?.onboardingCompleted]);

  const isExpenseView = [
      ViewState.VARIABLE_EXPENSES,
      ViewState.FIXED_EXPENSES,
      ViewState.PERSONAL_EXPENSES
  ].includes(currentView);
  const needsAccounts =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.ACCOUNTS ||
      currentView === ViewState.INCOMES ||
      currentView === ViewState.LAUNCHES ||
      currentView === ViewState.INVOICES ||
      currentView === ViewState.YIELDS ||
      isExpenseView;
  const needsExpenses =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.INVOICES ||
      currentView === ViewState.REPORTS ||
      currentView === ViewState.LAUNCHES ||
      isExpenseView;
  const needsIncomes =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.INCOMES ||
      currentView === ViewState.REPORTS ||
      currentView === ViewState.LAUNCHES;
  const needsTransfers =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.ACCOUNTS ||
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
  const needsAgenda =
      currentView === ViewState.DASHBOARD ||
      currentView === ViewState.AGENDA;

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !licenseCryptoEpoch || !needsAccounts) return;
      console.info('[realtime][accounts] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeAccounts(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][accounts] snapshot', { count: items.length });
              applyAccounts(items);
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
      if (!licenseId || !licenseCryptoEpoch || !needsTransfers) return;
      console.info('[realtime][transfers] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeTransfers(
          licenseId,
          { licenseEpoch: licenseCryptoEpoch },
          (items) => {
              console.info('[realtime][transfers] snapshot', { count: items.length });
              setTransfers(items);
          },
          (error) => {
              console.error('[realtime][transfers] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      realtimeUnsubRef.current.transfers = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.transfers === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.transfers = null;
              unsubscribe();
          }
          console.info('[realtime][transfers] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, licenseCryptoEpoch, needsTransfers, currentView]);

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
      const licenseId = currentUser?.licenseId;
      if (!licenseId || !needsAgenda) return;
      console.info('[realtime][agenda] subscribe_start', { licenseId, view: currentView });
      const unsubscribe = dataService.subscribeAgenda(
          licenseId,
          (items) => {
              console.info('[realtime][agenda] snapshot', { count: items.length });
              setAgendaItems(items);
          },
          (error) => {
              console.error('[realtime][agenda] error', {
                  licenseId,
                  message: (error as Error)?.message || error
              });
          }
      );
      realtimeUnsubRef.current.agenda = unsubscribe;
      return () => {
          const shouldUnsub = realtimeUnsubRef.current.agenda === unsubscribe;
          if (shouldUnsub) {
              realtimeUnsubRef.current.agenda = null;
              unsubscribe();
          }
          console.info('[realtime][agenda] unsubscribe', { licenseId, view: currentView });
      };
  }, [currentUser?.licenseId, needsAgenda, currentView]);

  useEffect(() => {
      const licenseId = currentUser?.licenseId;
      if (!licenseId || agendaItems.length === 0) return;
      const pendingPatch = agendaItems.filter(
          (item) =>
              typeof item.notifyAtMs !== 'number' &&
              item.notifyBeforeMinutes !== null &&
              !agendaNotifyPatchedRef.current.has(item.id)
      );
      if (pendingPatch.length === 0) return;
      pendingPatch.forEach((item) => {
          agendaNotifyPatchedRef.current.add(item.id);
          void dataService.upsertAgendaItem(item, licenseId);
      });
  }, [agendaItems, currentUser?.licenseId]);

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
      const uid = authUser?.uid;
      if (!uid || !preferencesReady) return;
      const scopedKey = getScopedAccountTypesStorageKey(uid);
      try {
          localStorage.setItem(scopedKey, JSON.stringify(accountTypes));
          localStorage.removeItem(LEGACY_ACCOUNT_TYPES_STORAGE_KEY);
      } catch (error) {
          if (isStandalone) {
              console.error('[pwa][boot]', error);
          }
      }
  }, [accountTypes, authUser?.uid, isStandalone, preferencesReady]);

  useEffect(() => {
      const uid = authUser?.uid;
      if (!uid || !preferencesReady) return;
      preferencesService
          .setAccountTypes(uid, accountTypes)
          .catch((error) => {
              console.error('[prefs] account_types_save_error', {
                  message: (error as any)?.message || error
              });
          });
  }, [accountTypes, authUser?.uid, preferencesReady]);

  useEffect(() => {
      try {
          localStorage.setItem('meumei_expense_types', JSON.stringify(expenseTypeOptions));
      } catch (error) {
          if (isStandalone) {
              console.error('[pwa][boot]', error);
          }
      }
  }, [expenseTypeOptions, isStandalone]);

  useEffect(() => {
      const uid = authUser?.uid || null;
      if (!uid || !preferencesReady) return;
      preferencesService
          .setExpenseTypeOptions(uid, expenseTypeOptions)
          .catch((error) => {
              console.error('[prefs] expense_types_save_error', {
                  message: (error as any)?.message || error
              });
          });
  }, [authUser?.uid, expenseTypeOptions, preferencesReady]);

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

  const agendaTodayKey = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const agendaTodayItems = useMemo(
    () => agendaItems.filter(item => item.date === agendaTodayKey),
    [agendaItems, agendaTodayKey]
  );
  const agendaNoticeKey = `mm_agenda_notice_${agendaTodayKey}`;
  const [agendaNoticeDismissed, setAgendaNoticeDismissed] = useState(false);

  useEffect(() => {
    try {
      setAgendaNoticeDismissed(localStorage.getItem(agendaNoticeKey) === '1');
    } catch {
      setAgendaNoticeDismissed(false);
    }
  }, [agendaNoticeKey]);

  const dismissAgendaNotice = () => {
    try {
      localStorage.setItem(agendaNoticeKey, '1');
    } catch {
      // ignore
    }
    setAgendaNoticeDismissed(true);
  };

  useEffect(() => {
      if (!canAccessSettings && currentView === ViewState.SETTINGS) {
          setCurrentView(ViewState.DASHBOARD);
      }
  }, [canAccessSettings, currentView]);

  useEffect(() => {
      if (!isMasterUser && currentView === ViewState.MASTER) {
          setCurrentView(ViewState.DASHBOARD);
      }
  }, [isMasterUser, currentView]);

  useEffect(() => {
      const hasQuickType = expenseTypeOptions.some((option) => option.id === quickExpenseType && option.enabled);
      if (!hasQuickType) {
          const fallback = expenseTypeOptions.find((option) => option.enabled)?.id;
          if (fallback) {
              setQuickExpenseType(fallback);
          }
      }
  }, [expenseTypeOptions, quickExpenseType]);

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
      applyAccounts([]);
      applyExpenses([]);
      setIncomes([]);
      setTransfers([]);
      setCurrentView(ViewState.LOGIN);
      updateRoute('/login', '');
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

  const handleOpenCompanySheet = async () => {
      const uid = authUser?.uid || null;
      if (uid) {
          try {
              const latest = await dataService.getCompany(uid);
              if (latest) {
                  setCompanyInfo(latest);
              }
          } catch (error) {
              console.warn('[company] refresh_failed', error);
          }
      }
      setCompanySheetOpen(true);
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
      const baseAccounts = accountsRef.current;
      const nextAccounts: Account[] = [];
      const updatedById = new Map(updated.map(account => [account.id, account]));
      baseAccounts.forEach(existing => {
          if (existing.locked) {
              nextAccounts.push(existing);
              return;
          }
          const next = updatedById.get(existing.id);
          nextAccounts.push(next ?? existing);
      });
      updated.forEach(account => {
          if (!baseAccounts.some(existing => existing.id === account.id)) {
              nextAccounts.push(account);
          }
      });
      applyAccounts(nextAccounts);
      try {
          const toPersist = nextAccounts.filter(account => !account.locked);
          await dataService.upsertAccounts(toPersist, currentUser.licenseId, cryptoEpoch);
      } catch (err) {
          console.error('Failed to persist accounts', err);
      }
  };

  const handleCreateTransfer = async (
      payload: {
          fromAccountId: string;
          toAccountId: string;
          amount: number;
          date: string;
          notes?: string;
          status?: Transfer['status'];
      }
  ) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      const fromAccountId = String(payload.fromAccountId || '').trim();
      const toAccountId = String(payload.toAccountId || '').trim();
      const amount = roundToCents(Number(payload.amount || 0));
      const date = String(payload.date || '').trim() || new Date().toISOString().slice(0, 10);
      const status: Transfer['status'] = payload.status === 'pending' || payload.status === 'canceled' ? payload.status : 'completed';
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || amount <= 0) return;

      const baseAccounts = accountsRef.current;
      const fromAccount = baseAccounts.find(account => account.id === fromAccountId);
      const toAccount = baseAccounts.find(account => account.id === toAccountId);
      if (!fromAccount || !toAccount || fromAccount.locked || toAccount.locked) return;

      const transfer: Transfer = {
          id: Math.random().toString(36).slice(2, 11),
          fromAccountId,
          toAccountId,
          amount,
          date,
          status,
          notes: (payload.notes || '').trim(),
          createdBy: currentUser.email || authUser?.email || undefined
      };

      setTransfers(prev => [transfer, ...prev]);

      let changedAccounts: Account[] = [];
      if (status === 'completed') {
          const updatedAccounts = baseAccounts.map(account => {
              if (account.id === fromAccountId) {
                  return {
                      ...account,
                      currentBalance: roundToCents(account.currentBalance - amount)
                  };
              }
              if (account.id === toAccountId) {
                  return {
                      ...account,
                      currentBalance: roundToCents(account.currentBalance + amount)
                  };
              }
              return account;
          });
          changedAccounts = updatedAccounts.filter(account => account.id === fromAccountId || account.id === toAccountId);
          applyAccounts(updatedAccounts);
      }

      handleAuditLog({
          actionType: 'transfer_created',
          description: `Transferência de ${formatCurrency(amount)} de ${fromAccount.name} para ${toAccount.name}.`,
          entityType: 'account',
          entityId: transfer.id,
          metadata: {
              fromAccountId,
              fromAccountName: fromAccount.name,
              toAccountId,
              toAccountName: toAccount.name,
              amount,
              date,
              status,
              notes: transfer.notes || ''
          }
      });

      try {
          await dataService.upsertTransfer(transfer, currentUser.licenseId, cryptoEpoch);
          if (changedAccounts.length) {
              await dataService.upsertAccounts(changedAccounts, currentUser.licenseId, cryptoEpoch);
          }
      } catch (error) {
          console.error('[transfer] create_failed', {
              transferId: transfer.id,
              message: (error as Error)?.message || error
          });
      }
  };

  const handleDeleteTransfer = async (id: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      const transfer = transfers.find(item => item.id === id);
      if (!transfer) return;
      if (transfer.locked) return;

      const fromAccount = accountsRef.current.find(account => account.id === transfer.fromAccountId);
      const toAccount = accountsRef.current.find(account => account.id === transfer.toAccountId);
      setTransfers(prev => prev.filter(item => item.id !== id));

      let changedAccounts: Account[] = [];
      if (
          transfer.status === 'completed' &&
          fromAccount &&
          toAccount &&
          !fromAccount.locked &&
          !toAccount.locked
      ) {
          const amount = roundToCents(Number(transfer.amount || 0));
          if (amount > 0) {
              const updatedAccounts = accountsRef.current.map(account => {
                  if (account.id === transfer.fromAccountId) {
                      return {
                          ...account,
                          currentBalance: roundToCents(account.currentBalance + amount)
                      };
                  }
                  if (account.id === transfer.toAccountId) {
                      return {
                          ...account,
                          currentBalance: roundToCents(account.currentBalance - amount)
                      };
                  }
                  return account;
              });
              changedAccounts = updatedAccounts.filter(
                  account => account.id === transfer.fromAccountId || account.id === transfer.toAccountId
              );
              applyAccounts(updatedAccounts);
          }
      }

      handleAuditLog({
          actionType: 'transfer_deleted',
          description: `Transferência removida: ${formatCurrency(transfer.amount)} de ${fromAccount?.name || 'Conta origem'} para ${toAccount?.name || 'Conta destino'}.`,
          entityType: 'account',
          entityId: transfer.id,
          metadata: {
              fromAccountId: transfer.fromAccountId,
              fromAccountName: fromAccount?.name || null,
              toAccountId: transfer.toAccountId,
              toAccountName: toAccount?.name || null,
              amount: transfer.amount,
              date: transfer.date,
              status: transfer.status
          }
      });

      try {
          await dataService.deleteTransfer(id, currentUser.licenseId);
          if (changedAccounts.length) {
              await dataService.upsertAccounts(changedAccounts, currentUser.licenseId, cryptoEpoch);
          }
      } catch (error) {
          console.error('[transfer] delete_failed', {
              transferId: id,
              message: (error as Error)?.message || error
          });
      }
  };

  const handleDeleteAccount = (id: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      const currentAccounts = accountsRef.current;
      const account = currentAccounts.find(acc => acc.id === id);
      if (account?.locked) {
          return;
      }
      const incomesToDelete = incomes.filter(inc => inc.accountId === id);
      const expensesToDelete = expenses.filter(exp => exp.accountId === id);
      const transfersToDelete = transfers.filter(
          transfer => transfer.fromAccountId === id || transfer.toAccountId === id
      );
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
      if (transfersToDelete.length) {
          setTransfers(prev =>
              prev.filter(transfer => transfer.fromAccountId !== id && transfer.toAccountId !== id)
          );
      }

      let nextAccounts = currentAccounts.filter(a => a.id !== id);
      if (transfersToDelete.length) {
          transfersToDelete.forEach((transfer) => {
              if (transfer.status !== 'completed') return;
              const amount = roundToCents(Number(transfer.amount || 0));
              if (amount <= 0) return;

              if (transfer.fromAccountId === id && transfer.toAccountId !== id) {
                  nextAccounts = nextAccounts.map(acc =>
                      acc.id === transfer.toAccountId
                          ? { ...acc, currentBalance: roundToCents(acc.currentBalance - amount) }
                          : acc
                  );
                  return;
              }

              if (transfer.toAccountId === id && transfer.fromAccountId !== id) {
                  nextAccounts = nextAccounts.map(acc =>
                      acc.id === transfer.fromAccountId
                          ? { ...acc, currentBalance: roundToCents(acc.currentBalance + amount) }
                          : acc
                  );
              }
          });
      }
      applyAccounts(nextAccounts);

      const counterpartAccountIds = new Set(
          transfersToDelete.flatMap(transfer => {
              if (transfer.status !== 'completed') return [];
              if (transfer.fromAccountId === id && transfer.toAccountId !== id) return [transfer.toAccountId];
              if (transfer.toAccountId === id && transfer.fromAccountId !== id) return [transfer.fromAccountId];
              return [];
          })
      );
      const counterpartAccounts = nextAccounts.filter(account => counterpartAccountIds.has(account.id) && !account.locked);
      const deleteOps: Promise<void>[] = [
          dataService.deleteAccount(id, currentUser.licenseId),
          ...incomesToDelete.map(inc => dataService.deleteIncome(inc.id, currentUser.licenseId)),
          ...expensesToDelete.map(exp => dataService.deleteExpense(exp.id, currentUser.licenseId)),
          ...transfersToDelete.map(transfer => dataService.deleteTransfer(transfer.id, currentUser.licenseId))
      ];
      if (counterpartAccounts.length) {
          deleteOps.push(dataService.upsertAccounts(counterpartAccounts, currentUser.licenseId, cryptoEpoch));
      }
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
      const previousById = new Map(expenses.map(exp => [exp.id, exp]));
      const created: Expense[] = [];
      const edited: Expense[] = [];
      updated.forEach((exp) => {
          if (exp.locked) return;
          const previous = previousById.get(exp.id);
          if (!previous) {
              created.push(exp);
              return;
          }
          if (hasExpenseCoreChanges(previous, exp)) {
              edited.push(exp);
          }
      });
      applyExpenses(updated);
      // Batch save for efficiency in UI, but simple service call here
      dataService.upsertExpenses(updated.filter(exp => !exp.locked), currentUser.licenseId, cryptoEpoch);

      created.forEach((exp) => {
          handleAuditLog({
              actionType: 'expense_created',
              description: `Despesa "${exp.description}" criada (${formatCurrency(exp.amount)}).`,
              entityType: 'expense',
              entityId: exp.id,
              metadata: {
                  description: exp.description,
                  amount: exp.amount,
                  category: exp.category,
                  dueDate: exp.dueDate,
                  status: exp.status
              }
          });
      });

      edited.forEach((exp) => {
          handleAuditLog({
              actionType: 'expense_edited',
              description: `Despesa "${exp.description}" atualizada (${formatCurrency(exp.amount)}).`,
              entityType: 'expense',
              entityId: exp.id,
              metadata: {
                  description: exp.description,
                  amount: exp.amount,
                  category: exp.category,
                  dueDate: exp.dueDate,
                  status: exp.status
              }
          });
      });
  };

  const generateExpenseId = () => Math.random().toString(36).substr(2, 9);

  const handleQuickExpenseSave = (payload: any) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;
      const items = Array.isArray(payload) ? payload : [payload];
      const normalized = items.map((item: any) => ({
          ...item,
          id: item?.id || generateExpenseId(),
          type: item?.type || quickExpenseType
      })) as Expense[];
      const nextExpenses = [...expenses, ...normalized];
      let updatedAccounts = [...accountsRef.current];
      let accountsChanged = false;
      const changedAccountIds = new Set<string>();
      normalized.forEach((item) => {
          if (!item.accountId || item.status !== 'paid') return;
          const accIndex = updatedAccounts.findIndex(a => a.id === item.accountId);
          if (accIndex < 0 || updatedAccounts[accIndex].locked) return;
          const mutationId = `expense:new:${item.id}:${item.accountId}:${item.amount}:${item.status}`;
          const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
              source: 'app',
              action: 'create_paid',
              accountId: item.accountId,
              entityId: item.id,
              amount: item.amount,
              status: item.status
          });
          if (shouldApply) {
              updatedAccounts[accIndex] = {
                  ...updatedAccounts[accIndex],
                  currentBalance: updatedAccounts[accIndex].currentBalance - item.amount
              };
              accountsChanged = true;
              changedAccountIds.add(item.accountId);
          }
      });
      if (accountsChanged) {
          const changedAccounts = updatedAccounts.filter(account => changedAccountIds.has(account.id));
          if (changedAccounts.length) {
              void handleUpdateAccounts(changedAccounts);
          }
      }
      handleUpdateExpenses(nextExpenses);
      setIsQuickExpenseOpen(false);
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
          const baseAccounts = accountsRef.current;
          const accIndex = baseAccounts.findIndex(a => a.id === exp.accountId);
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
                  const newAccounts = [...baseAccounts];
                  newAccounts[accIndex].currentBalance += Number(exp.amount);
                  applyAccounts(newAccounts);
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
      const previousById = new Map(incomes.map(inc => [inc.id, inc]));
      const created: Income[] = [];
      const edited: Income[] = [];
      updated.forEach((inc) => {
          if (inc.locked) return;
          const previous = previousById.get(inc.id);
          if (!previous) {
              created.push(inc);
              return;
          }
          if (hasIncomeCoreChanges(previous, inc)) {
              edited.push(inc);
          }
      });
      setIncomes(updated);
      dataService.upsertIncomes(updated.filter(inc => !inc.locked), currentUser.licenseId, cryptoEpoch);

      created.forEach((inc) => {
          handleAuditLog({
              actionType: 'income_created',
              description: `Receita "${inc.description}" criada (${formatCurrency(inc.amount)}).`,
              entityType: 'income',
              entityId: inc.id,
              metadata: {
                  description: inc.description,
                  amount: inc.amount,
                  category: inc.category,
                  date: inc.date,
                  status: inc.status
              }
          });
      });

      edited.forEach((inc) => {
          handleAuditLog({
              actionType: 'income_edited',
              description: `Receita "${inc.description}" atualizada (${formatCurrency(inc.amount)}).`,
              entityType: 'income',
              entityId: inc.id,
              metadata: {
                  description: inc.description,
                  amount: inc.amount,
                  category: inc.category,
                  date: inc.date,
                  status: inc.status
              }
          });
      });
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
          const baseAccounts = accountsRef.current;
          const accIndex = baseAccounts.findIndex(a => a.id === inc.accountId);
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
                  const newAccounts = [...baseAccounts];
                  newAccounts[accIndex].currentBalance -= Number(inc.amount);
                  applyAccounts(newAccounts);
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

  const handleUpsertAgendaItem = async (item: AgendaItem) => {
      if (!currentUser?.licenseId) return;
      try {
          await dataService.upsertAgendaItem(item, currentUser.licenseId);
      } catch (error) {
          console.error('[agenda] upsert_failed', {
              message: (error as Error)?.message || error
          });
      }
  };

  const handleDeleteAgendaItem = async (id: string) => {
      if (!currentUser?.licenseId) return;
      try {
          await dataService.deleteAgendaItem(id, currentUser.licenseId);
      } catch (error) {
          console.error('[agenda] delete_failed', {
              message: (error as Error)?.message || error
          });
      }
  };

  const handlePayInvoice = (expenseIds: string[], sourceAccountId: string, totalAmount: number, paymentDate?: string) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      // 1. Mark Expenses Paid + Debit Account (per item)
      const paidAt = paymentDate || new Date().toISOString().split('T')[0];
      const updatedAccounts = [...accountsRef.current];
      const changedExpenseIds = new Set(expenseIds);
      const expenseKey = expenseIds.length > 0 ? [...expenseIds].sort().join('|') : 'none';
      let accountsChanged = false;
      const debitTotals = new Map<string, number>();
      const selectedExpenses = expenses.filter(exp => changedExpenseIds.has(exp.id));
      const resolvedTotal = roundToCents(
          selectedExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0) || Number(totalAmount || 0)
      );
      const cardId = selectedExpenses.find(exp => exp.cardId)?.cardId;
      const invoiceMonthKey = selectedExpenses.length > 0
          ? `${new Date((selectedExpenses[0].dueDate || selectedExpenses[0].date) + 'T12:00:00').getFullYear()}-${String(new Date((selectedExpenses[0].dueDate || selectedExpenses[0].date) + 'T12:00:00').getMonth() + 1).padStart(2, '0')}`
          : undefined;
      const cardName = cardId ? creditCards.find(card => card.id === cardId)?.name : undefined;
      const existingPayment = cardId && invoiceMonthKey
          ? expenses.find(exp => exp.origin === 'invoice_payment' && exp.invoiceCardId === cardId && exp.invoiceMonthKey === invoiceMonthKey && exp.status === 'paid')
          : undefined;
      const paymentExpenseId = existingPayment?.id || `invpay_${cardId || 'card'}_${invoiceMonthKey || paidAt}_${Date.now().toString(36)}`;

      console.info('[invoice] pay start', {
          cardId: cardId || null,
          invoiceMonthKey: invoiceMonthKey || null,
          total: resolvedTotal,
          accountId: sourceAccountId
      });

      const updatedExpenses = expenses.map(exp => {
          if (!changedExpenseIds.has(exp.id)) return exp;
          const next = {
              ...exp,
              status: 'paid' as const,
              accountId: sourceAccountId,
              paidAt,
              invoicePaymentId: paymentExpenseId
          };
          if (sourceAccountId) {
              const prev = debitTotals.get(sourceAccountId) || 0;
              debitTotals.set(sourceAccountId, prev + Number(next.amount));
          }
          return next;
      });

      const shouldCreatePaymentLedger = !existingPayment && sourceAccountId && resolvedTotal > 0;
      if (shouldCreatePaymentLedger) {
          updatedExpenses.push({
              id: paymentExpenseId,
              description: `Pagamento de fatura${cardName ? ` ${cardName}` : ''}`,
              amount: resolvedTotal,
              category: 'Pagamento de fatura',
              date: paidAt,
              dueDate: paidAt,
              paidAt,
              paymentMethod: 'Fatura',
              accountId: sourceAccountId,
              status: 'paid',
              type: 'variable',
              notes: invoiceMonthKey ? `Fatura ${invoiceMonthKey}` : undefined,
              origin: 'invoice_payment',
              invoiceCardId: cardId,
              invoiceMonthKey
          });
          console.info('[invoice] pay created ledger', {
              ledgerId: paymentExpenseId,
              cardId: cardId || null,
              invoiceMonthKey: invoiceMonthKey || null
          });
      }

      if (debitTotals.size === 0 && sourceAccountId && Number.isFinite(totalAmount) && totalAmount > 0) {
          debitTotals.set(sourceAccountId, roundToCents(totalAmount));
      }

      debitTotals.forEach((amount, accountId) => {
          const accIdx = updatedAccounts.findIndex(a => a.id === accountId);
          if (accIdx < 0 || updatedAccounts[accIdx].locked) return;
          const normalizedAmount = roundToCents(amount);
          const mutationId = `invoice:pay:${accountId}:${expenseKey}:${amount}:${paidAt}`;
          const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
              source: 'app',
              action: 'invoice_pay',
              accountId,
              entityId: accountId,
              amount: normalizedAmount,
              status: 'paid'
          });
          if (!shouldApply) return;
          const prevBalance = Number(updatedAccounts[accIdx].currentBalance || 0);
          const nextBalance = roundToCents(prevBalance - normalizedAmount);
          let nextHistory = updatedAccounts[accIdx].balanceHistory ? [...updatedAccounts[accIdx].balanceHistory] : [];
          const historyEntry = {
              date: paidAt,
              value: nextBalance,
              previousValue: prevBalance,
              newValue: nextBalance,
              delta: -normalizedAmount,
              source: 'invoice_pay'
          };
          const existingIndex = nextHistory.findIndex(entry => entry.date === paidAt);
          if (existingIndex >= 0) {
              nextHistory[existingIndex] = {
                  ...nextHistory[existingIndex],
                  ...historyEntry
              };
          } else {
              nextHistory = [...nextHistory, historyEntry];
          }
          updatedAccounts[accIdx] = {
              ...updatedAccounts[accIdx],
              currentBalance: nextBalance,
              balanceHistory: nextHistory
          };
          accountsChanged = true;
      });

      console.info('[invoice] pay done', {
          cardId: cardId || null,
          invoiceMonthKey: invoiceMonthKey || null,
          total: resolvedTotal,
          accountsChanged
      });
      console.info('[balances] recompute start', {
          month: viewDate ? `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}` : null
      });

      applyExpenses(updatedExpenses);
      handleAuditLog({
          actionType: 'invoice_paid',
          description: `Fatura paga${cardName ? ` (${cardName})` : ''} no valor de ${formatCurrency(resolvedTotal)}.`,
          entityType: 'expense',
          entityId: paymentExpenseId,
          metadata: {
              cardName: cardName || null,
              amount: resolvedTotal,
              date: paidAt,
              expenseCount: changedExpenseIds.size,
              accountId: sourceAccountId || null
          }
      });
      const changedExpenses = updatedExpenses.filter(e => changedExpenseIds.has(e.id));
      const ledgerExpenses = updatedExpenses.filter(exp => exp.origin === 'invoice_payment' && exp.id === paymentExpenseId);
      const expensesToPersist = [...changedExpenses, ...ledgerExpenses].filter(exp => !exp.locked);
      dataService.upsertExpenses(expensesToPersist, currentUser.licenseId, cryptoEpoch);

      if (accountsChanged) {
          const changedAccounts = updatedAccounts.filter(account => debitTotals.has(account.id));
          if (changedAccounts.length) {
              void handleUpdateAccounts(changedAccounts);
          }
      }
      console.info('[balances] ui refreshed');
  };

  const handleReopenInvoice = (expenseIds: string[]) => {
      if (!currentUser?.licenseId) return;
      const cryptoEpoch = resolveCryptoEpoch();
      if (!cryptoEpoch) return;

      const updatedAccounts = [...accountsRef.current];
      const changedExpenseIds = new Set(expenseIds);
      const expenseKey = expenseIds.length > 0 ? [...expenseIds].sort().join('|') : 'none';
      let accountsChanged = false;
      const refundTotals = new Map<string, number>();
      const reopenedExpenses = expenses.filter(exp => changedExpenseIds.has(exp.id));
      const reopenCardId = reopenedExpenses.find(exp => exp.cardId)?.cardId;
      const reopenMonthKey = reopenedExpenses.length > 0
          ? `${new Date((reopenedExpenses[0].dueDate || reopenedExpenses[0].date) + 'T12:00:00').getFullYear()}-${String(new Date((reopenedExpenses[0].dueDate || reopenedExpenses[0].date) + 'T12:00:00').getMonth() + 1).padStart(2, '0')}`
          : undefined;
      const paymentLedger = reopenCardId && reopenMonthKey
          ? expenses.find(exp => exp.origin === 'invoice_payment' && exp.invoiceCardId === reopenCardId && exp.invoiceMonthKey === reopenMonthKey && exp.status === 'paid')
          : undefined;

      console.info('[invoice] reopen start', {
          cardId: reopenCardId || null,
          invoiceMonthKey: reopenMonthKey || null
      });

      const updatedExpenses = expenses.map(exp => {
          if (!changedExpenseIds.has(exp.id)) return exp;
          if (exp.status !== 'paid') return exp;
          if (exp.accountId) {
              const previous = refundTotals.get(exp.accountId) || 0;
              refundTotals.set(exp.accountId, previous + Number(exp.amount));
          }
          return { ...exp, status: 'pending' as const, paidAt: undefined, invoicePaymentId: undefined };
      });

      const today = new Date().toISOString().split('T')[0];
      if (paymentLedger && paymentLedger.accountId) {
          const previous = refundTotals.get(paymentLedger.accountId) || 0;
          refundTotals.set(paymentLedger.accountId, previous + Number(paymentLedger.amount));
      }
      refundTotals.forEach((amount, accountId) => {
          const accIdx = updatedAccounts.findIndex(a => a.id === accountId);
          if (accIdx < 0 || updatedAccounts[accIdx].locked) return;
          const normalizedAmount = roundToCents(amount);
          const mutationId = `invoice:reopen:${accountId}:${expenseKey}:${amount}:${today}`;
          const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
              source: 'app',
              action: 'invoice_reopen',
              accountId,
              entityId: accountId,
              amount: normalizedAmount,
              status: 'pending'
          });
          if (!shouldApply) return;
          const prevBalance = Number(updatedAccounts[accIdx].currentBalance || 0);
          const nextBalance = roundToCents(prevBalance + normalizedAmount);
          let nextHistory = updatedAccounts[accIdx].balanceHistory ? [...updatedAccounts[accIdx].balanceHistory] : [];
          const historyEntry = {
              date: today,
              value: nextBalance,
              previousValue: prevBalance,
              newValue: nextBalance,
              delta: normalizedAmount,
              source: 'invoice_reopen'
          };
          const existingIndex = nextHistory.findIndex(entry => entry.date === today);
          if (existingIndex >= 0) {
              nextHistory[existingIndex] = {
                  ...nextHistory[existingIndex],
                  ...historyEntry
              };
          } else {
              nextHistory = [...nextHistory, historyEntry];
          }
          updatedAccounts[accIdx] = {
              ...updatedAccounts[accIdx],
              currentBalance: nextBalance,
              balanceHistory: nextHistory
          };
          accountsChanged = true;
      });

      if (paymentLedger) {
          const paymentIndex = updatedExpenses.findIndex(exp => exp.id === paymentLedger.id);
          if (paymentIndex >= 0) {
              updatedExpenses[paymentIndex] = {
                  ...updatedExpenses[paymentIndex],
                  status: 'pending',
                  paidAt: undefined
              };
          }
      }

      console.info('[invoice] reopen reversed', {
          ledgerId: paymentLedger?.id || null,
          cardId: reopenCardId || null,
          invoiceMonthKey: reopenMonthKey || null
      });
      console.info('[balances] recompute start', {
          month: viewDate ? `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}` : null
      });

      applyExpenses(updatedExpenses);
      handleAuditLog({
          actionType: 'invoice_reopened',
          description: `Fatura reaberta${reopenCardId ? ' para novo pagamento' : ''}.`,
          entityType: 'expense',
          entityId: paymentLedger?.id || reopenedExpenses[0]?.id || null,
          metadata: {
              cardId: reopenCardId || null,
              invoiceMonthKey: reopenMonthKey || null,
              expenseCount: changedExpenseIds.size,
              date: today
          }
      });
      const changedExpenses = updatedExpenses.filter(e => changedExpenseIds.has(e.id));
      const ledgerUpdates = paymentLedger
          ? updatedExpenses.filter(exp => exp.id === paymentLedger.id)
          : [];
      const expensesToPersist = [...changedExpenses, ...ledgerUpdates].filter(exp => !exp.locked);
      dataService.upsertExpenses(expensesToPersist, currentUser.licenseId, cryptoEpoch);

      if (accountsChanged) {
          const changedAccounts = updatedAccounts.filter(account => refundTotals.has(account.id));
          if (changedAccounts.length) {
              void handleUpdateAccounts(changedAccounts);
          }
      }
      console.info('[balances] ui refreshed');
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
          transfers,
          yields,
          viewDate,
          options: { includeUpToEndOfMonth: true, debug: balanceDebugEnabled }
      });
  }, [accounts, incomes, expenses, transfers, yields, viewDate, balanceDebugEnabled]);

  const realBalances: RealBalanceResult = useMemo(() => {
      if (balanceDebugEnabled) return baseRealBalances;
      const hasDiff = Object.values(baseRealBalances.diffs).some(diff => Math.abs(diff) > 0.01);
      if (!hasDiff) return baseRealBalances;
      return computeRealBalances({
          accounts,
          incomes,
          expenses,
          transfers,
          yields,
          viewDate,
          options: { includeUpToEndOfMonth: true, debug: true }
      });
  }, [accounts, incomes, expenses, transfers, yields, viewDate, balanceDebugEnabled, baseRealBalances]);

  const totalBalanceDiff = Math.abs((realBalances.total || 0) - legacyTotalBalance);
  const totalBalance = totalBalanceDiff > 0.01 ? legacyTotalBalance : realBalances.total;
  useEffect(() => {
      if (totalBalanceDiff <= 0.01) return;
      console.warn('[balances] dashboard_balance_fallback', {
          auditedTotal: Number(realBalances.total.toFixed(2)),
          accountsTotal: Number(legacyTotalBalance.toFixed(2)),
          diff: Number(totalBalanceDiff.toFixed(2))
      });
  }, [legacyTotalBalance, realBalances.total, totalBalanceDiff]);
  const balanceSnapshot = useMemo(() => ({
      byAccountId: realBalances.byAccountId,
      diffs: realBalances.diffs,
      total: realBalances.total,
      legacyTotal: legacyTotalBalance,
      cutoff: realBalances.stats.cutoff,
      debug: realBalances.debug
  }), [legacyTotalBalance, realBalances]);
  useEffect(() => {
      if (!currentUser?.licenseId || !licenseCryptoEpoch) return;
      if (balanceRepairInFlightRef.current) return;

      const repairable = accounts
          .filter(account => !account.locked)
          .map(account => {
              const targetBalance = roundToCents(Number(realBalances.byAccountId[account.id] || 0));
              const currentBalance = roundToCents(Number(account.currentBalance || 0));
              const diff = roundToCents(targetBalance - currentBalance);
              return { account, targetBalance, diff };
          })
          .filter(item => Math.abs(item.diff) > 0.01);

      if (repairable.length === 0) return;

      balanceRepairInFlightRef.current = true;
      const reconciledAccounts = accounts.map(account => {
          const candidate = repairable.find(item => item.account.id === account.id);
          if (!candidate) return account;
          return {
              ...account,
              currentBalance: candidate.targetBalance
          };
      });
      const changedAccounts = reconciledAccounts.filter(account =>
          repairable.some(item => item.account.id === account.id)
      );

      console.warn('[balances] auto_repair', {
          count: changedAccounts.length,
          diffs: repairable.reduce<Record<string, number>>((acc, item) => {
              acc[item.account.id] = item.diff;
              return acc;
          }, {})
      });

      applyAccounts(reconciledAccounts);
      dataService
          .upsertAccounts(changedAccounts, currentUser.licenseId, licenseCryptoEpoch)
          .catch((error) => {
              console.error('[balances] auto_repair_failed', {
                  message: (error as Error)?.message || error
              });
          })
          .finally(() => {
              balanceRepairInFlightRef.current = false;
          });
  }, [
      accounts,
      applyAccounts,
      currentUser?.licenseId,
      licenseCryptoEpoch,
      realBalances.byAccountId
  ]);
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
          transfers: realBalances.stats.transfers,
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
          incomes.some(inc => inc.lockedReason === 'epoch_mismatch') ||
          transfers.some(transfer => transfer.lockedReason === 'epoch_mismatch')
      );
  }, [accounts, expenses, incomes, transfers]);

  useEffect(() => {
      if (hasEpochLocked && !recoveryLoggedRef.current) {
          console.info('[ui][state] recovery mode active');
          recoveryLoggedRef.current = true;
      }
  }, [hasEpochLocked]);

  // Uppercase input transformation removed to avoid truncating user input.
  const clearMobileSwipeVisualTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (mobileSwipeVisualResetTimerRef.current === null) return;
    window.clearTimeout(mobileSwipeVisualResetTimerRef.current);
    mobileSwipeVisualResetTimerRef.current = null;
  }, []);

  const settleMobileSwipeVisual = useCallback((duration = 190) => {
    clearMobileSwipeVisualTimer();
    setMobileSwipeVisualActive(true);
    setMobileSwipeVisualTransitionMs(duration);
    setMobileSwipeVisualOffset(0);
    if (typeof window === 'undefined') {
      setMobileSwipeVisualTransitionMs(0);
      setMobileSwipeVisualActive(false);
      return;
    }
    mobileSwipeVisualResetTimerRef.current = window.setTimeout(() => {
      setMobileSwipeVisualTransitionMs(0);
      setMobileSwipeVisualActive(false);
      mobileSwipeVisualResetTimerRef.current = null;
    }, duration + 24);
  }, [clearMobileSwipeVisualTimer]);

  useEffect(() => {
    return () => clearMobileSwipeVisualTimer();
  }, [clearMobileSwipeVisualTimer]);

  const isSwipeBlockedByTarget = useCallback((target: HTMLElement | null) => {
    if (!target || typeof window === 'undefined') return true;
    if (
      target.closest(
        'input, textarea, select, [contenteditable="true"], [data-no-swipe-nav="true"], [data-modal-root="true"], .mobile-quick-access-footer'
      )
    ) {
      return true;
    }

    const stopNode = mainContentRef.current;
    let node: HTMLElement | null = target;
    while (node && node !== stopNode) {
      const style = window.getComputedStyle(node);
      const overflowX = style.overflowX;
      const canScrollX = node.scrollWidth - node.clientWidth > 12;
      if ((overflowX === 'auto' || overflowX === 'scroll') && canScrollX) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }, []);

  const handleMobileSwipeStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || currentView === ViewState.LOGIN || event.touches.length !== 1) return;
    if (typeof document !== 'undefined' && document.querySelector('[data-modal-root="true"]')) return;
    clearMobileSwipeVisualTimer();
    setMobileSwipeVisualTransitionMs(0);
    setMobileSwipeVisualOffset(0);
    setMobileSwipeVisualActive(false);

    const touch = event.touches[0];
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    if (viewportWidth > 0 && (touch.clientX < 12 || touch.clientX > viewportWidth - 12)) {
      mobileSwipeGestureRef.current = null;
      return;
    }

    const target = event.target as HTMLElement | null;
    if (isSwipeBlockedByTarget(target)) {
      mobileSwipeGestureRef.current = null;
      return;
    }

    mobileSwipeGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startedAt: Date.now(),
      isHorizontal: false
    };
  }, [isMobile, currentView, isSwipeBlockedByTarget, clearMobileSwipeVisualTimer]);

  const handleMobileSwipeMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = mobileSwipeGestureRef.current;
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!gesture.isHorizontal) {
      if (absX < 8 && absY < 8) return;
      if (absX <= absY * 0.85) return;
      gesture.isHorizontal = true;
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 420;
    const maxOffset = Math.max(96, Math.min(viewportWidth * 0.88, 340));
    const resistanceStart = viewportWidth * 0.72;
    let easedOffset = deltaX;
    if (absX > resistanceStart) {
      const extra = absX - resistanceStart;
      easedOffset = Math.sign(deltaX) * (resistanceStart + extra * 0.38);
    }
    easedOffset = Math.max(-maxOffset, Math.min(maxOffset, easedOffset));
    setMobileSwipeVisualActive(true);
    setMobileSwipeVisualTransitionMs(0);
    setMobileSwipeVisualOffset(easedOffset);

    if (event.cancelable && absX > 18 && absX > absY * 1.2) {
      event.preventDefault();
    }
  }, []);

  const handleMobileSwipeEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = mobileSwipeGestureRef.current;
    mobileSwipeGestureRef.current = null;
    if (!gesture || !isMobile) {
      settleMobileSwipeVisual(150);
      return;
    }
    if (typeof document !== 'undefined' && document.querySelector('[data-modal-root="true"]')) {
      settleMobileSwipeVisual(150);
      return;
    }

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;
    const elapsedMs = Date.now() - gesture.startedAt;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 420;
    const distanceThreshold = Math.min(96, Math.max(52, viewportWidth * 0.16));
    const velocityX = absX / Math.max(elapsedMs, 1);
    const isFastFlick = velocityX > 0.42 && absX > 20;
    const isMostlyHorizontal = absY <= 120 && absX >= absY * 0.82;

    if (!isMostlyHorizontal || (!isFastFlick && absX < distanceThreshold)) {
      settleMobileSwipeVisual(220);
      return;
    }

    const direction: 1 | -1 = deltaX < 0 ? -1 : 1;
    const navigated = navigateDockByDirection(direction, {
      wrap: true,
      source: 'swipe'
    });
    settleMobileSwipeVisual(navigated ? 165 : 220);
    if (navigated && event.cancelable) {
      event.preventDefault();
    }
  }, [isMobile, navigateDockByDirection, settleMobileSwipeVisual]);

  const handleMobileSwipeCancel = useCallback(() => {
    mobileSwipeGestureRef.current = null;
    settleMobileSwipeVisual(150);
  }, [settleMobileSwipeVisual]);

const renderLayout = (content: React.ReactNode, options?: { skipMobileOffset?: boolean }) => {
    const shouldOffset = isMobile && !options?.skipMobileOffset;
    const compactMode = !isPublicRoute && isCompactHeight;
    const mobileShellClass = isMobile ? 'mm-mobile-shell' : '';
    const desktopShellClass = isMobile ? 'min-h-screen' : '';
    const swipeVisualDirection = mobileSwipeVisualOffset < -8 ? 1 : mobileSwipeVisualOffset > 8 ? -1 : 0;
    const swipeNavigationDirection: 1 | -1 | 0 = swipeVisualDirection === 1 ? -1 : swipeVisualDirection === -1 ? 1 : 0;
    const swipeProgress = Math.min(1, Math.abs(mobileSwipeVisualOffset) / 120);
    const mobileSwipeStyle = isMobile
      ? {
          transform: `translate3d(${mobileSwipeVisualOffset}px, 0, 0)`,
          transition: mobileSwipeVisualTransitionMs > 0
            ? `transform ${mobileSwipeVisualTransitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
            : undefined,
          willChange: mobileSwipeVisualActive ? ('transform' as const) : undefined
        }
      : undefined;
    const swipeNeighborView = (() => {
      if (!isMobile || swipeNavigationDirection === 0) return null;
      const currentIndex = mobileDockNavigationOrder.indexOf(currentView);
      if (currentIndex === -1) return null;
      const total = mobileDockNavigationOrder.length;
      if (total === 0) return null;
      const nextIndex = (currentIndex + swipeNavigationDirection + total) % total;
      return mobileDockNavigationOrder[nextIndex];
    })();
    const swipeNeighborMeta = (() => {
      if (!swipeNeighborView) return null;
      switch (swipeNeighborView) {
        case ViewState.DASHBOARD:
          return { title: 'Início', subtitle: 'Resumo do mês', accent: '#6366f1' };
        case ViewState.LAUNCHES:
          return { title: 'Lançamentos', subtitle: 'Entradas e saídas', accent: '#06b6d4' };
        case ViewState.ACCOUNTS:
          return { title: 'Contas', subtitle: 'Saldos por conta', accent: '#3b82f6' };
        case ViewState.YIELDS:
          return { title: 'Rendimentos', subtitle: 'Evolução dos rendimentos', accent: '#8b5cf6' };
        case ViewState.INVOICES:
          return { title: 'Faturas', subtitle: 'Controle de cartões', accent: '#f43f5e' };
        case ViewState.REPORTS:
          return { title: 'Relatórios', subtitle: 'Análises financeiras', accent: '#10b981' };
        case ViewState.AGENDA:
          return { title: 'Agenda', subtitle: 'Próximos compromissos', accent: '#0ea5e9' };
        default:
          return { title: 'Próxima tela', subtitle: 'Arraste para navegar', accent: '#6366f1' };
      }
    })();
    const underlayShift = Math.max(0, 34 - Math.min(34, Math.abs(mobileSwipeVisualOffset) * 0.18));

    return (
        <div className={`relative overflow-x-hidden ${mobileShellClass} ${desktopShellClass} bg-zinc-100 dark:bg-[#09090b]`}>
            {isMobile && swipeNeighborMeta && (
                <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(120% 80% at ${swipeVisualDirection === 1 ? '100%' : '0%'} 24%, ${swipeNeighborMeta.accent}2b, transparent 65%), linear-gradient(180deg, rgba(9,9,11,0.95), rgba(6,8,16,0.98))`
                        }}
                    />
                    <div
                        className={`absolute top-[calc(var(--mm-mobile-top,92px)+14px)] ${swipeVisualDirection === 1 ? 'right-3 text-right' : 'left-3 text-left'} rounded-2xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md`}
                        style={{
                            opacity: Math.min(0.98, 0.25 + swipeProgress * 0.95),
                            transform: `translateX(${swipeVisualDirection === 1 ? underlayShift : -underlayShift}px)`
                        }}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/95">{swipeNeighborMeta.title}</p>
                        <p className="text-[10px] text-white/70">{swipeNeighborMeta.subtitle}</p>
                    </div>
                    <div
                        className={`absolute ${swipeVisualDirection === 1 ? 'right-3' : 'left-3'} bottom-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px)+14px)] w-[min(74vw,280px)] rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md`}
                        style={{
                            opacity: Math.min(0.9, 0.18 + swipeProgress * 0.92),
                            transform: `translateX(${swipeVisualDirection === 1 ? underlayShift * 0.75 : -underlayShift * 0.75}px)`
                        }}
                    >
                        <div className="h-2.5 w-24 rounded-full bg-white/25" />
                        <div className="mt-2 h-2 w-full rounded-full bg-white/15" />
                        <div className="mt-1.5 h-2 w-4/5 rounded-full bg-white/10" />
                        <div className="mt-1.5 h-2 w-3/5 rounded-full bg-white/10" />
                    </div>
                </div>
            )}
            <div
                ref={appRootRef}
                className={`mm-app-root relative overflow-x-hidden ${mobileShellClass} ${desktopShellClass} bg-zinc-100 dark:bg-[#09090b] text-zinc-950 dark:text-white font-inter transition-colors duration-300 ${compactMode ? 'mm-compact' : ''}`}
                data-compact={compactMode ? 'true' : undefined}
                style={mobileSwipeStyle}
                onTouchStart={isMobile ? handleMobileSwipeStart : undefined}
                onTouchMove={isMobile ? handleMobileSwipeMove : undefined}
                onTouchEnd={isMobile ? handleMobileSwipeEnd : undefined}
                onTouchCancel={isMobile ? handleMobileSwipeCancel : undefined}
            >
                {isMobile && swipeVisualDirection !== 0 && (
                    <>
                        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-[9]">
                            <div
                                className={`absolute inset-y-0 ${swipeVisualDirection === 1 ? 'right-0' : 'left-0'} w-16`}
                                style={{
                                    opacity: Math.min(0.2, swipeProgress * 0.24),
                                    background: swipeVisualDirection === 1
                                        ? 'linear-gradient(90deg, rgba(99,102,241,0), rgba(99,102,241,0.4))'
                                        : 'linear-gradient(270deg, rgba(99,102,241,0), rgba(99,102,241,0.4))'
                                }}
                            />
                        </div>
                    </>
                )}
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
                    onOpenFeedback={() => {
                      if (!isMasterUser) return;
                      setMasterInitialMode('feedback');
                      setCurrentView(ViewState.MASTER);
                    }}
                    onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                    onOpenAgenda={() => setCurrentView(ViewState.AGENDA)}
                    onLogout={handleLogout}
                    onCompanyClick={handleOpenCompanySheet}
                    onOpenCalculator={() => setIsCalculatorOpen(true)}
                    onOpenAudit={isMobile ? () => {} : () => openAuditPanel(null)}
                    canAccessSettings={canAccessSettings}
                    versionLabel={APP_VERSION}
                    entitlementBadge={entitlementBadge}
                    renewalInfo={renewalInfo}
                    onRenew={renewalInfo ? handleRenew : undefined}
                    assistantHidden={assistantHidden}
                    onOpenAssistant={() => setAssistantHidden(false)}
                    isMasterUser={isMasterUser}
                    bugNotificationCount={isMasterUser ? bugNotificationCount : 0}
                />
                <div
                    className={isMobile ? '' : 'flex-1 min-h-0'}
                    style={shouldOffset ? { paddingTop: 'var(--mm-mobile-top, 92px)' } : undefined}
                >
                    <div
                        ref={mainContentRef}
                        className={`mm-content ${compactMode ? 'mm-content--compact scrollbar-hide' : ''} ${isMobile ? '' : 'mm-content--desktop'}`}
                    >
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
                        {!agendaNoticeDismissed && agendaTodayItems.length > 0 && (
                            <div className="mx-auto mt-4 max-w-5xl px-4">
                                <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/10 px-4 py-3 text-emerald-800 dark:text-emerald-200 text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold">Agenda de hoje</p>
                                            <p className="text-[12px] text-emerald-700 dark:text-emerald-200/80">
                                                {agendaTodayItems.length} compromisso(s) marcado(s) para hoje.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setCurrentView(ViewState.AGENDA)}
                                                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                                            >
                                                Ver agenda
                                            </button>
                                            <button
                                                type="button"
                                                onClick={dismissAgendaNotice}
                                                className="rounded-full border border-emerald-300/70 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/60 dark:text-emerald-100 dark:hover:bg-emerald-800/40"
                                            >
                                                Dispensar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {content}
                    </div>
                    {!isMobile && companySheetOpen && (
                        <div
                            className="fixed inset-x-0 z-[120] px-4 sm:px-6"
                            style={{ bottom: 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 10px)' }}
                            data-modal-root="true"
                        >
                            <div className="mx-auto w-full max-w-5xl">
                                <CompanyDetailsSheet company={companyInfo} onClose={() => setCompanySheetOpen(false)} />
                            </div>
                        </div>
                    )}
                </div>
                {debugLayoutEnabled && !isMobile && layoutMetrics && (
                    <div className="pointer-events-none fixed left-3 top-3 z-[2500] max-w-[360px] rounded-xl border border-cyan-300/30 bg-black/80 px-3 py-2 text-[11px] leading-4 text-cyan-100 shadow-2xl backdrop-blur-md">
                        <p className="font-semibold tracking-wide text-cyan-200">Layout Debug HUD</p>
                        <p>viewport: {layoutMetrics.viewportWidth}x{layoutMetrics.viewportHeight}</p>
                        <p>header/dock/sub: {layoutMetrics.headerHeight}/{layoutMetrics.dockHeight}/{layoutMetrics.subheaderHeight}</p>
                        <p>contentAvail: {layoutMetrics.contentAvailableHeight}</p>
                        <p>main c/s: {layoutMetrics.mainClientHeight}/{layoutMetrics.mainScrollHeight}</p>
                        <p className="mt-1 font-semibold text-cyan-300">offenders:</p>
                        <ul className="max-h-36 overflow-y-auto pr-1">
                            {layoutMetrics.offenders.length === 0 ? (
                                <li className="text-cyan-200/80">none</li>
                            ) : (
                                layoutMetrics.offenders.map((offender, index) => (
                                    <li key={`${offender.selector}-${index}`} className="break-all text-cyan-100/90">
                                        {offender.selector} ({offender.clientHeight}/{offender.scrollHeight})
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
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
          const shouldSuggestRegister = betaKeyStatus === 'success' && authMode === 'login';
          switch (code) {
              case 'auth/wrong-password':
                  setLoginError('Senha incorreta. Tente novamente.');
                  break;
              case 'auth/user-not-found':
                  setLoginError(
                    shouldSuggestRegister
                      ? 'Conta não encontrada. Crie sua conta para usar a chave beta.'
                      : 'Conta não encontrada para este e-mail.'
                  );
                  break;
              case 'auth/too-many-requests':
                  setLoginError('Muitas tentativas. Tente novamente mais tarde.');
                  break;
              case 'auth/network-request-failed':
                  setLoginError('Falha de rede. Verifique sua conexão.');
                  break;
              case 'auth/invalid-credential':
              case 'auth/invalid-login-credentials':
                  setLoginError(
                    shouldSuggestRegister
                      ? 'Conta não encontrada. Crie sua conta para usar a chave beta.'
                      : 'Credenciais inválidas. Tente novamente.'
                  );
                  break;
              default:
                  setLoginError(
                    shouldSuggestRegister
                      ? 'Conta não encontrada. Crie sua conta para usar a chave beta.'
                      : 'Credenciais inválidas. Tente novamente.'
                  );
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
      if (!registerAcceptedTerms) {
          setRegisterTermsError('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
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
      setRegisterTermsError('');
      setLoginLoading(true);
      const sessionId = checkoutSessionId;
      try {
          const emailKey = loginEmail.trim().toLowerCase();
          if (!sessionId && betaKeyStatus !== 'success') {
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
          setRegisterAcceptedTerms(false);
          setRegisterTermsError('');
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

  const startRegisterFlow = (source: 'login') => {
      console.info('[beta-auth] create_account_click', { source });
      setAuthMode('register');
      setRegisterConfirmPassword('');
      setRegisterAcceptedTerms(false);
      setRegisterTermsError('');
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
      <div className="h-screen text-white font-sans selection:bg-teal-500/30 overflow-x-hidden overflow-y-auto landing-scroll-surface flex flex-col relative bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f]">
          <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
          <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[160px]" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[180px]" />
          <header className="sticky top-0 z-[60] border-b border-white/10 bg-black/70 supports-[backdrop-filter]:bg-black/40 backdrop-blur-xl h-20 min-h-20 max-h-20 flex items-center shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
              <div className="w-full max-w-[1200px] mx-auto px-6 flex items-center justify-between">
                  <button
                      onClick={() => updateRoute('/', '')}
                      className="hover:opacity-90 transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 rounded-lg px-2 py-1"
                      aria-label="Ir para o início"
                  >
                      <span className="text-2xl font-bold tracking-tighter text-white">meumei</span>
                  </button>

                  <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-200">
                      <button
                          type="button"
                          onClick={() => updateRoute('/', '')}
                          className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 to-fuchsia-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_34px_rgba(59,130,246,0.35)] transition hover:from-sky-400 hover:to-fuchsia-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
                      >
                          Início
                      </button>
                  </nav>
              </div>
          </header>
          <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-xl">
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
              {betaFlowActive && (
                  <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-3 text-left text-sm text-emerald-100">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Guia rápido do teste</div>
                      <div className="mt-2 space-y-1 text-xs text-emerald-100/90">
                          <div>1) Confirme o e-mail abaixo.</div>
                          <div>2) Crie sua senha.</div>
                          <div>3) Clique em <strong>Criar conta</strong>.</div>
                      </div>
                      <button
                          type="button"
                          onClick={() => {
                              setBetaFlowActive(false);
                              setAuthMode('login');
                          }}
                          className="mt-3 text-xs font-semibold text-emerald-200 underline underline-offset-4 hover:text-emerald-100"
                      >
                          Já tenho conta, quero entrar
                      </button>
                  </div>
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
                              className={`w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60 ${
                                betaFlowActive ? 'ring-2 ring-emerald-300/40' : ''
                              }`}
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
                              className={`w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 pr-10 text-sm text-white placeholder:text-slate-300/60 ${
                                betaFlowActive ? 'ring-2 ring-emerald-300/40' : ''
                              }`}
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
                              className={`w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-300/60 ${
                                betaFlowActive ? 'ring-2 ring-emerald-300/40' : ''
                              }`}
                              placeholder="Confirme sua senha"
                          />
                      </div>
                  )}
                  {authMode === 'register' && (
                      <div className="space-y-2 text-left">
                          <label className="flex items-start gap-3 text-xs text-slate-200/80">
                              <input
                                  type="checkbox"
                                  checked={registerAcceptedTerms}
                                  onChange={(event) => {
                                      setRegisterAcceptedTerms(event.target.checked);
                                      if (event.target.checked) {
                                          setRegisterTermsError('');
                                      }
                                  }}
                                  className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 text-cyan-300 focus:ring-cyan-300/60"
                              />
                              <span>
                                  Li e concordo com os{' '}
                                  <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                                      Termos de Uso
                                  </a>{' '}
                                  e a{' '}
                                  <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                                      Política de Privacidade
                                  </a>
                                  .
                              </span>
                          </label>
                          {registerTermsError && (
                              <div className="text-xs text-rose-300">{registerTermsError}</div>
                          )}
                      </div>
                  )}
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                      <button
                          type="button"
                          onClick={() => setBetaKeyOpen((prev) => !prev)}
                          className="w-full flex items-center justify-between text-xs font-semibold text-slate-200/80"
                      >
                          <span>Tenho chave beta</span>
                          <span className="text-slate-300/60">{betaKeyOpen ? 'Ocultar' : 'Usar chave'}</span>
                      </button>
                      {betaKeyOpen && (
                          <div className="mt-3 space-y-2">
                              <input
                                  type="text"
                                  value={betaKeyCode}
                                  onChange={(event) => setBetaKeyCode(event.target.value)}
                                  className="w-full bg-white/10 border border-white/15 focus:border-cyan-200/70 focus:ring-cyan-200/40 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-300/60"
                                  placeholder="Ex: MEUMEI-TESTE-123"
                              />
                              <button
                                  type="button"
                                  onClick={handleRedeemBetaKey}
                                  disabled={betaKeyStatus === 'loading'}
                                  className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-3 py-2 rounded-xl text-xs transition"
                              >
                                  {betaKeyStatus === 'loading' ? 'Validando...' : 'Validar chave beta'}
                              </button>
                              {betaKeyMessage && (
                                  <div
                                      className={`text-[11px] ${
                                          betaKeyStatus === 'success' ? 'text-emerald-200/90' : 'text-amber-200/90'
                                      }`}
                                  >
                                      {betaKeyMessage}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
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
                              onClick={() => {
                                  setAuthMode('login');
                                  setBetaFlowActive(false);
                              }}
                              className="text-slate-300/70 hover:text-white underline underline-offset-4"
                          >
                              Já tenho conta
                          </button>
                      ) : (
                          <button
                              type="button"
                              onClick={() => {
                                  setBetaFlowActive(false);
                                  startRegisterFlow('login');
                              }}
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
      </div>
      );
  };

  if (isTermsRoute) {
      return <Termos />;
  }

  if (isPrivacyRoute) {
      return <Privacidade />;
  }

  if (isRefundRoute) {
      return <Reembolso />;
  }

  if (isUpgradeRoute) {
      return <Landing />;
  }

  if (isLandingRoute && !authUser) {
      return <Landing />;
  }

  if (isUpgradeRoute) {
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

  if (isBetaHost && !isUpgradeRoute) {
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
            <div data-tour-anchor="tour-view-dashboard" data-tour-screen="dashboard">
            <Dashboard 
                onOpenAccounts={() => setCurrentView(ViewState.ACCOUNTS)}
                onOpenVariableExpenses={() => {
                    setMobileExpensesScope('variable');
                    setAutoOpenExpense(true);
                    setCurrentView(ViewState.VARIABLE_EXPENSES);
                }}
                onOpenFixedExpenses={() => {
                    setMobileExpensesScope('fixed');
                    setAutoOpenExpense(true);
                    setCurrentView(ViewState.FIXED_EXPENSES);
                }}
                onOpenPersonalExpenses={() => {
                    setMobileExpensesScope('personal');
                    setAutoOpenExpense(true);
                    setCurrentView(ViewState.PERSONAL_EXPENSES);
                }}
                onOpenIncomes={() => {
                    if (isMobile) {
                        setAutoOpenIncome(true);
                    }
                    setCurrentView(ViewState.INCOMES);
                }}
                onOpenYields={() => setCurrentView(ViewState.YIELDS)}
                onOpenInvoices={() => setCurrentView(ViewState.INVOICES)}
                onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                onOpenLaunches={() => setCurrentView(ViewState.LAUNCHES)}
                onOpenExpenseAll={() => {
                    setMobileExpensesScope('all');
                    setAutoOpenExpense(true);
                    setCurrentView(ViewState.VARIABLE_EXPENSES);
                }}
                onOpenDas={() => setCurrentView(ViewState.DAS)}
                assistantHidden={assistantHidden}
                onCloseAssistant={() => setAssistantHidden(true)}
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
            />
            </div>,
            { skipMobileOffset: true }
        )}

      {currentView === ViewState.REPORTS && renderLayout(
          <div data-tour-anchor="tour-view-reports" data-tour-screen="reports">
          <ReportsView 
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
             incomes={incomes}
             expenses={expenses}
             viewDate={viewDate}
             companyName={companyInfo.name}
             creditCards={creditCards}
             licenseId={currentUser?.licenseId}
             expenseTypeOptions={expenseTypeOptions}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.AUDIT && renderLayout(
          <div data-tour-anchor="tour-view-audit" data-tour-screen="audit">
          <AuditLogModal
             isOpen={currentView === ViewState.AUDIT}
             onClose={() => {
                 const previous = viewHistoryRef.current.pop();
                 setCurrentView(previous || ViewState.DASHBOARD);
             }}
             licenseId={currentUser?.licenseId || null}
             entityTypes={auditModalState.entityTypes ?? undefined}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.AGENDA && renderLayout(
          <div data-tour-anchor="tour-view-agenda" data-tour-screen="agenda">
          <AgendaView
            items={agendaItems}
            onSave={handleUpsertAgendaItem}
            onDelete={handleDeleteAgendaItem}
            onBack={() => setCurrentView(ViewState.DASHBOARD)}
            viewDate={viewDate}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.DAS && renderLayout(
          <div data-tour-anchor="tour-view-das" data-tour-screen="das">
          <DasView
              onBack={() => setCurrentView(ViewState.DASHBOARD)}
              company={companyInfo}
              onOpenCompany={() => setCurrentView(ViewState.SETTINGS)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.ACCOUNTS && renderLayout(
          <div data-tour-anchor="tour-view-accounts" data-tour-screen="accounts">
          <AccountsView 
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
             onDeleteAccount={handleDeleteAccount}
             incomes={incomes}
             expenses={expenses}
             transfers={transfers}
             onCreateTransfer={handleCreateTransfer}
             onDeleteTransfer={handleDeleteTransfer}
             accountTypes={accountTypes}
             onUpdateAccountTypes={setAccountTypes}
             onAuditLog={handleAuditLog}
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['account'])}
             balanceSnapshot={balanceSnapshot}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.INCOMES && renderLayout(
          <div data-tour-anchor="tour-view-incomes" data-tour-screen="incomes">
          <IncomesView 
             incomes={incomes}
             autoOpenNew={autoOpenIncome}
             onAutoOpenHandled={() => setAutoOpenIncome(false)}
             autoOpenEditId={autoOpenIncomeEditId}
             onAutoOpenEditHandled={() => setAutoOpenIncomeEditId(null)}
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
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['income'])}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.LAUNCHES && renderLayout(
          <LaunchesView
              onBack={() => setCurrentView(ViewState.DASHBOARD)}
              incomes={incomes}
              expenses={expenses}
              accounts={accounts}
              creditCards={creditCards}
              expenseTypeOptions={expenseTypeOptions}
              viewDate={viewDate}
              onCreateIncome={() => {
                  if (isMobile) {
                      setAutoOpenIncome(true);
                  }
                  setCurrentView(ViewState.INCOMES);
              }}
              onCreateExpense={() => {
                  setMobileExpensesScope('all');
                  setAutoOpenExpense(true);
                  setCurrentView(ViewState.VARIABLE_EXPENSES);
              }}
              onDeleteIncome={handleDeleteIncome}
              onDeleteExpense={handleDeleteExpense}
              onEditIncome={(id) => {
                  setAutoOpenIncomeEditId(id);
                  setCurrentView(ViewState.INCOMES);
              }}
              onEditExpense={(id, subtype) => {
                  setAutoOpenExpenseEditId(id);
                  setMobileExpensesScope('all');
                  if (subtype === 'fixed') {
                      setCurrentView(ViewState.FIXED_EXPENSES);
                      return;
                  }
                  if (subtype === 'personal') {
                      setCurrentView(ViewState.PERSONAL_EXPENSES);
                      return;
                  }
                  setCurrentView(ViewState.VARIABLE_EXPENSES);
              }}
          />,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.YIELDS && renderLayout(
          <div data-tour-anchor="tour-view-yields" data-tour-screen="yields">
          <YieldsView 
             accounts={accounts}
             onUpdateAccounts={handleUpdateAccounts}
             viewDate={viewDate}
             licenseId={currentUser?.licenseId || null}
             licenseCryptoEpoch={licenseCryptoEpoch}
             onAuditLog={handleAuditLog}
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['yield'])}
             onOpenNewAccount={() => {
                 setCurrentView(ViewState.ACCOUNTS);
                 if (typeof window !== 'undefined') {
                     window.setTimeout(() => {
                         window.dispatchEvent(new CustomEvent('mm:tour-open-account-modal'));
                     }, 60);
                 }
             }}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.INVOICES && renderLayout(
          <div data-tour-anchor="tour-view-invoices" data-tour-screen="invoices">
          <FaturasErrorBoundary>
              <InvoicesView 
                 onBack={() => setCurrentView(ViewState.DASHBOARD)}
                 onOpenAudit={isMobile ? undefined : () => openAuditPanel(['expense'])}
                 expenses={expenses}
                 creditCards={creditCards}
                 accounts={accounts}
                 viewDate={viewDate}
                 onPayInvoice={handlePayInvoice}
                 onReopenInvoice={handleReopenInvoice}
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
          </FaturasErrorBoundary>
          </div>,
          { skipMobileOffset: true }
      )}

      {/* Expense Views */}
      {currentView === ViewState.VARIABLE_EXPENSES && renderLayout(
         <div data-tour-anchor="tour-view-variable-expenses" data-tour-screen="variable_expenses">
         <ExpensesView 
             title={`Despesas ${variableExpenseLabel}`}
             subtitle="Gerencie seus gastos"
             expenseType="variable"
             themeColor="pink"
             autoOpenNew={autoOpenExpense}
             onAutoOpenHandled={() => setAutoOpenExpense(false)}
             autoOpenEditId={autoOpenExpenseEditId}
             onAutoOpenEditHandled={() => setAutoOpenExpenseEditId(null)}
             expenseTypeOptions={expenseTypeOptions}
             onUpdateExpenseTypes={setExpenseTypeOptions}
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
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['expense'])}
             mobileScope={mobileExpensesScope}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.FIXED_EXPENSES && renderLayout(
         <div data-tour-anchor="tour-view-fixed-expenses" data-tour-screen="fixed_expenses">
         <ExpensesView 
             title={`Despesas ${fixedExpenseLabel}`}
             subtitle="Contas recorrentes"
             expenseType="fixed"
             themeColor="amber"
             autoOpenNew={autoOpenExpense}
             onAutoOpenHandled={() => setAutoOpenExpense(false)}
             autoOpenEditId={autoOpenExpenseEditId}
             onAutoOpenEditHandled={() => setAutoOpenExpenseEditId(null)}
             expenseTypeOptions={expenseTypeOptions}
             onUpdateExpenseTypes={setExpenseTypeOptions}
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
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['expense'])}
             mobileScope={mobileExpensesScope}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.PERSONAL_EXPENSES && renderLayout(
         <div data-tour-anchor="tour-view-personal-expenses" data-tour-screen="personal_expenses">
         <ExpensesView 
             title={`Despesas ${personalExpenseLabel}`}
             subtitle="Retiradas pessoais"
             expenseType="personal"
             themeColor="cyan"
             autoOpenNew={autoOpenExpense}
             onAutoOpenHandled={() => setAutoOpenExpense(false)}
             autoOpenEditId={autoOpenExpenseEditId}
             onAutoOpenEditHandled={() => setAutoOpenExpenseEditId(null)}
             expenseTypeOptions={expenseTypeOptions}
             onUpdateExpenseTypes={setExpenseTypeOptions}
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
             onOpenAudit={isMobile ? undefined : () => openAuditPanel(['expense'])}
             mobileScope={mobileExpensesScope}
             onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
          </div>,
          { skipMobileOffset: true }
      )}

      {currentView === ViewState.COMPANY_DETAILS && renderLayout(
          <CompanyDetailsView
              company={companyInfo}
              onBack={() => setCurrentView(ViewState.DASHBOARD)}
          />
      )}

      {currentView === ViewState.MASTER && isMasterUser && renderLayout(
          <MasterControlPanel
              onBack={() => {
                setMasterInitialMode(null);
                setCurrentView(ViewState.DASHBOARD);
              }}
              initialMode={masterInitialMode}
              onInitialModeHandled={() => setMasterInitialMode(null)}
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
            isMasterUser={isMasterUser}
            tipsEnabled={tipsEnabled}
            onUpdateTipsEnabled={handleTipsEnabledChange}
            appVersion={APP_VERSION}
        />
      )}
      <CalculatorModal 
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
      />
      {isMobile && isQuickExpenseOpen && (
          <NewExpenseModal
              isOpen
              onClose={() => setIsQuickExpenseOpen(false)}
              onSave={handleQuickExpenseSave}
              initialData={null}
              accounts={accounts}
              creditCards={creditCards}
              categories={expenseCategories}
              userId={authUser?.uid || null}
              categoryType="expenses"
              onAddCategory={(name) => handleAddCategory('expenses', name)}
              onRemoveCategory={(name) => handleRemoveCategory('expenses', name)}
              onResetCategories={handleResetCategories}
              expenseType={quickExpenseType}
              allowTypeSelection
              onExpenseTypeChange={setQuickExpenseType}
              expenseTypeOptions={expenseTypeOptions}
              onUpdateExpenseTypes={setExpenseTypeOptions}
              themeColor={
                  quickExpenseType === 'fixed'
                      ? 'amber'
                      : quickExpenseType === 'personal'
                        ? 'cyan'
                        : 'pink'
              }
              defaultDate={viewDate}
              minDate={minTransactionDate}
          />
      )}
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
      {trialNotice && !isPublicRoute && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 py-10">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121214] px-5 py-4 text-white shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                      <div>
                          <h3 className="text-base font-semibold">
                              Seu teste termina em {trialNotice.daysLeft} {trialNotice.daysLeft === 1 ? 'dia' : 'dias'}
                          </h3>
                          <p className="mt-1 text-xs text-slate-300">
                              Para não perder seus dados e continuar usando o Meumei, finalize sua assinatura.
                          </p>
                      </div>
                      <button
                          type="button"
                          onClick={() => setTrialNotice(null)}
                          className="text-slate-400 hover:text-white"
                      >
                          Fechar
                      </button>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                      <button
                          type="button"
                          onClick={() => {
                              setTrialNotice(null);
                              window.location.href = landingUrl;
                          }}
                          className="w-full rounded-xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(59,130,246,0.35)]"
                      >
                          Quero continuar
                      </button>
                      <button
                          type="button"
                          onClick={() => setTrialNotice(null)}
                          className="w-full rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                      >
                          Lembrar depois
                      </button>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-400">
                      Assinatura com reembolso integral garantido em até 7 dias.
                  </p>
              </div>
          </div>
      )}
      <InstallAppModal
          isOpen={isInstallStepModalVisible}
          isInstalled={isPwaInstalled}
          mode={pwaInstallMode}
          onInstall={handleInstallStepInstall}
          onClose={handleInstallStepClose}
      />
      <TourDecisionModal
          isOpen={isTourDecisionOpen}
          companyName={companyInfo?.name || ''}
          onAccept={() => applyTourDecision('accepted', 'manual_accept')}
          onDecline={() => applyTourDecision('declined', 'manual_decline')}
      />
      {!isMobile && (
          <DesktopFirstAccessTour
              scopeId={authUser?.uid || undefined}
              enabled={onboardingCompleted && installDecisionCompleted && tourDecision === 'accepted'}
              restartToken={tourRestartToken}
              currentView={currentView}
              onSetView={setCurrentView}
          />
      )}
      {isMobile && (
          <MobileQuickAccessFooter items={mobileQuickAccessItems} />
      )}
      {!isMobile && (
          <DesktopQuickAccessFooter items={desktopQuickAccessItems} />
      )}
      {isMobileLandscape && !isPublicRoute && (
          <div className="mobile-landscape-overlay fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
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
