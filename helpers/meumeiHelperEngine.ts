export type HelperSignals = {
  isLoggedIn: boolean;
  hasAccounts: boolean;
  hasIncomes: boolean;
  hasExpenses: boolean;
  hasCategories: boolean;
  isPwaInstallable: boolean;
  isStandalone: boolean;
  isMobile: boolean;
};

export type HelperStep = {
  id: string;
  title: string;
  body: string;
  ctaId?: string;
  ctaLabel?: string;
  onlyMobile?: boolean;
  showWhen: (signals: HelperSignals) => boolean;
};

export type HelperTrack = {
  id: string;
  label: string;
  steps: HelperStep[];
};

export type HelperState = {
  dismissedCount: number;
  cooldownUntil: number;
  snoozeUntil: number;
  doNotShow: boolean;
  lastTrackId: string;
  lastStepIndex: number;
  seenSteps: Record<string, number[]>;
  completedTracks: Record<string, number>;
};

export type HelperSelection = {
  track: HelperTrack;
  steps: HelperStep[];
  stepIndex: number;
};

export type HelperTip = {
  id: string;
  title: string;
  body: string;
  trackId: string;
  ctaId?: string;
  ctaLabel?: string;
};

const STORAGE_KEY = 'meumei.helper';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const COOLDOWN_SHORT = DAY_MS;
const COOLDOWN_LONG = 3 * DAY_MS;
const COOLDOWN_COMPLETE = 7 * DAY_MS;

const DEFAULT_STATE: HelperState = {
  dismissedCount: 0,
  cooldownUntil: 0,
  snoozeUntil: 0,
  doNotShow: false,
  lastTrackId: '',
  lastStepIndex: 0,
  seenSteps: {},
  completedTracks: {}
};

export const trackHelperEvent = (eventName: string, payload: Record<string, unknown> = {}) => {
  console.log('[helper]', eventName, payload);
};

export const loadHelperState = (): HelperState => {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<HelperState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      seenSteps: parsed.seenSteps || {},
      completedTracks: parsed.completedTracks || {}
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
};

export const saveHelperState = (state: HelperState) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

export const shouldRenderHelper = (state: HelperState, now = Date.now()) => {
  if (state.doNotShow) return false;
  if (state.snoozeUntil && now < state.snoozeUntil) return false;
  if (state.cooldownUntil && now < state.cooldownUntil) return false;
  return true;
};

const isStepVisible = (step: HelperStep, signals: HelperSignals) => {
  if (signals.isMobile) {
    if (!step.onlyMobile) return false;
  } else if (step.onlyMobile) {
    return false;
  }
  return step.showWhen(signals);
};

const getEligibleSteps = (track: HelperTrack, signals: HelperSignals) =>
  track.steps.filter((step) => isStepVisible(step, signals));

export const getHelperTips = (signals: HelperSignals): HelperTip[] => {
  const tips: HelperTip[] = [];
  helperTracks.forEach((track) => {
    track.steps.forEach((step) => {
      if (!isStepVisible(step, signals)) return;
      tips.push({
        id: step.id,
        title: step.title,
        body: step.body,
        trackId: track.id,
        ctaId: step.ctaId,
        ctaLabel: step.ctaLabel
      });
    });
  });
  return tips;
};

const clampIndex = (value: number, max: number) =>
  Math.min(Math.max(value, 0), Math.max(max, 0));

export const helperTracks: HelperTrack[] = [
  {
    id: 'curiosidades',
    label: 'Curiosidades',
    steps: [
      {
        id: 'curiosidade_firebase',
        title: 'Infraestrutura segura',
        body: 'O Meumei utiliza a infraestrutura Google Cloud para armazenar seus dados com seguranca e escalabilidade.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'curiosidade_criptografia',
        title: 'Dados protegidos',
        body: 'As informacoes trafegam com criptografia (HTTPS) e ficam criptografadas em repouso na Google Cloud.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'curiosidade_camadas',
        title: 'Camadas extras',
        body: 'Alguns valores sensiveis sao criptografados antes de serem salvos, reforcando a protecao.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'curiosidade_isolamento',
        title: 'Acesso isolado',
        body: 'As regras de seguranca isolam os dados por usuario, garantindo acesso apenas a propria conta.',
        showWhen: (s) => s.isLoggedIn
      }
    ]
  }
];

export const selectHelperTrack = (signals: HelperSignals, state: HelperState): HelperSelection | null => {
  if (!signals.isLoggedIn) return null;
  const priority = ['curiosidades'];
  for (const trackId of priority) {
    const track = helperTracks.find((item) => item.id === trackId);
    if (!track) continue;
    const steps = getEligibleSteps(track, signals);
    if (!steps.length) continue;
    const initialIndex =
      state.lastTrackId === track.id
        ? clampIndex(state.lastStepIndex, steps.length - 1)
        : 0;
    return { track, steps, stepIndex: initialIndex };
  }
  return null;
};

export const applyStepView = (
  state: HelperState,
  trackId: string,
  stepIndex: number
): HelperState => {
  const seen = state.seenSteps[trackId] || [];
  if (state.lastTrackId === trackId && state.lastStepIndex === stepIndex && seen.includes(stepIndex)) {
    return state;
  }
  const nextSeen = seen.includes(stepIndex) ? seen : [...seen, stepIndex];
  return {
    ...state,
    lastTrackId: trackId,
    lastStepIndex: stepIndex,
    seenSteps: { ...state.seenSteps, [trackId]: nextSeen }
  };
};

export const applyDismiss = (state: HelperState, now = Date.now()): HelperState => {
  const dismissedCount = state.dismissedCount + 1;
  const cooldownUntil = now + (dismissedCount >= 2 ? COOLDOWN_LONG : COOLDOWN_SHORT);
  return {
    ...state,
    dismissedCount,
    cooldownUntil
  };
};

export const applySnooze = (state: HelperState, now = Date.now()): HelperState => ({
  ...state,
  snoozeUntil: now + DAY_MS
});

export const applyDoNotShow = (state: HelperState): HelperState => ({
  ...state,
  doNotShow: true
});

export const resetDismissals = (state: HelperState): HelperState => ({
  ...state,
  dismissedCount: 0,
  cooldownUntil: 0
});

export const applyTrackComplete = (state: HelperState, trackId: string, now = Date.now()): HelperState => ({
  ...state,
  dismissedCount: 0,
  cooldownUntil: now + COOLDOWN_COMPLETE,
  completedTracks: { ...state.completedTracks, [trackId]: now }
});
