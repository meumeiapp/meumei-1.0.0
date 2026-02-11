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
  type?: 'curiosity' | 'tip';
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
  type: 'curiosity' | 'tip';
  ctaId?: string;
  ctaLabel?: string;
};

const STORAGE_KEY = 'meumei.helper';
const RECENT_IDS_KEY = 'helper_recent_ids';
const SEEN_COUNT_KEY = 'helper_seen_count';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const COOLDOWN_SHORT = DAY_MS;
const COOLDOWN_LONG = 3 * DAY_MS;
const COOLDOWN_COMPLETE = 7 * DAY_MS;
const RECENT_LIMIT = 5;

let frequencyDecision: boolean | null = null;

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

const loadRecentIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const saveRecentIds = (ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECENT_IDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

const loadSeenCount = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(SEEN_COUNT_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const saveSeenCount = (count: number) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SEEN_COUNT_KEY, String(count));
  } catch {
    // ignore
  }
};

const shouldShowByFrequency = () => {
  if (frequencyDecision !== null) return frequencyDecision;
  const seenCount = loadSeenCount();
  let chance = 1;
  if (seenCount >= 10 && seenCount < 30) chance = 0.7;
  else if (seenCount >= 30 && seenCount < 80) chance = 0.4;
  else if (seenCount >= 80) chance = 0.2;

  if (chance < 1 && Math.random() > chance) {
    console.log('[helper] skipped by frequency', { seenCount, chance });
    frequencyDecision = false;
    return false;
  }

  frequencyDecision = true;
  return true;
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

export const getContextScore = (itemId: string, appState: HelperSignals) => {
  const baseWeight = 1;
  const hasMonthData = appState.hasIncomes || appState.hasExpenses;
  if (!appState.hasAccounts && itemId === 'contas-bancarias') return 5;
  if (!appState.hasIncomes && itemId === 'entradas') return 5;
  if (!appState.hasExpenses && itemId === 'despesas-variaveis') return 5;
  if (hasMonthData && itemId === 'relatorios') return 5;
  if (appState.isLoggedIn && itemId === 'emissao-das') return 3;
  return baseWeight;
};

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
        type: resolveTipType(track.id, step),
        ctaId: step.ctaId,
        ctaLabel: step.ctaLabel
      });
    });
  });
  return tips;
};

export const pickHelperTip = (signals: HelperSignals): HelperTip | null => {
  if (!shouldShowByFrequency()) {
    return null;
  }

  const fallback: HelperTip = {
    id: 'helper_default',
    title: 'Ajudante do meumei',
    body: 'Você pode perguntar qualquer dúvida sobre o app por aqui.',
    trackId: 'helper_default',
    type: 'curiosity'
  };

  const candidates = helperTracks.flatMap((track) =>
    getEligibleSteps(track, signals).map((step) => ({
      trackId: track.id,
      step,
      weight: getContextScore(step.id, signals)
    }))
  );

  if (!candidates.length) return fallback;

  const recentIds = loadRecentIds();
  let filteredCandidates = candidates;
  if (recentIds.length) {
    const filtered = candidates.filter((candidate) => !recentIds.includes(candidate.step.id));
    if (filtered.length === 0) {
      console.log('[helper] blocked by recent memory', { recentIds, remaining: 0, fallback: true });
    } else if (filtered.length !== candidates.length) {
      console.log('[helper] blocked by recent memory', { recentIds, remaining: filtered.length });
      filteredCandidates = filtered;
    }
  }

  const totalWeight = filteredCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = Math.random() * totalWeight;
  let selected = filteredCandidates[filteredCandidates.length - 1];
  for (const candidate of filteredCandidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      selected = candidate;
      break;
    }
  }

  const tip = {
    id: selected.step.id,
    title: selected.step.title,
    body: selected.step.body,
    trackId: selected.trackId,
    type: resolveTipType(selected.trackId, selected.step),
    ctaId: selected.step.ctaId,
    ctaLabel: selected.step.ctaLabel
  };

  console.log('[helper] pick', { id: tip.id, type: tip.type, weight: selected.weight });

  const nextRecent = [tip.id, ...recentIds.filter((id) => id !== tip.id)].slice(0, RECENT_LIMIT);
  saveRecentIds(nextRecent);
  saveSeenCount(loadSeenCount() + 1);

  return tip;
};

const clampIndex = (value: number, max: number) =>
  Math.min(Math.max(value, 0), Math.max(max, 0));

const resolveTipType = (trackId: string, step?: HelperStep) => {
  if (step?.type) return step.type;
  return trackId === 'dicas' ? 'tip' : 'curiosity';
};

const HELPER_ITEMS = [
  {
    id: 'infraestrutura-segura',
    title: 'Infraestrutura segura',
    description: 'Seus dados ficam guardados em servidores profissionais, com estabilidade e segurança 24 horas por dia.',
    type: 'curiosity'
  },
  {
    id: 'contas-bancarias',
    title: 'Contas Bancárias',
    description:
      'Cadastre banco, caixa ou carteira. Assim você enxerga exatamente quanto dinheiro tem hoje. Dica: mantenha uma conta "Dinheiro" para pequenos gastos do dia a dia. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'dados-protegidos',
    title: 'Dados protegidos',
    description: 'Tudo o que você envia é protegido por criptografia, como um cadeado digital invisível durante o trajeto.',
    type: 'curiosity'
  },
  {
    id: 'entradas',
    title: 'Entradas',
    description:
      'Registre tudo o que entra, mesmo valores pequenos. Dica: categorize bem para descobrir de onde vem seu lucro de verdade. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'camadas-extras',
    title: 'Camadas extras',
    description: 'Algumas informações sensíveis recebem proteção adicional antes mesmo de serem salvas.',
    type: 'curiosity'
  },
  {
    id: 'despesas-fixas',
    title: 'Despesas Fixas',
    description:
      'Aluguel, internet e assinaturas voltam todo mês. Dica: revise sempre, pequenos cortes viram grande economia no ano. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'acesso-isolado',
    title: 'Acesso isolado',
    description: 'Cada conta enxerga só o próprio negócio. Seus números são só seus.',
    type: 'curiosity'
  },
  {
    id: 'despesas-variaveis',
    title: 'Despesas Variáveis',
    description:
      'Gastos que mudam toda semana, como mercado e combustível. Dica: lance na hora para não depender da memória. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'separacao-pessoal',
    title: 'Despesas Pessoais',
    description:
      'Separe sua vida pessoal da empresa. Dica: misturar tudo confunde seus resultados e suas decisões. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'rendimentos',
    title: 'Rendimentos',
    description:
      'Controle juros, investimentos e retornos extras. Dica: registrar datas ajuda a enxergar crescimento ao longo do tempo. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'faturas',
    title: 'Faturas',
    description:
      'Acompanhe seus cartões antes do fechamento. Dica: revisar com calma evita surpresas no fim do mês. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    description:
      'Aqui você vê o retrato do seu mês. Dica: olhe toda semana, não só no final, para ajustar a rota cedo. Atalho: use ←/→ para navegar pelo Acesso Rápido.',
    type: 'tip'
  },
  {
    id: 'emissao-das',
    title: 'Emissão DAS',
    description:
      'O imposto do MEI sai por aqui. Dica: pague em dia e evite multas que só drenam seu caixa.',
    type: 'tip'
  }
];

const buildHelperSteps = (type: 'curiosity' | 'tip'): HelperStep[] =>
  HELPER_ITEMS.filter((item) => item.type === type).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.description,
    type: item.type,
    showWhen: (s) => s.isLoggedIn
  }));

export const helperTracks: HelperTrack[] = [
  {
    id: 'curiosidades',
    label: 'Curiosidades',
    steps: buildHelperSteps('curiosity')
  },
  {
    id: 'dicas',
    label: 'Dicas',
    steps: buildHelperSteps('tip')
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
