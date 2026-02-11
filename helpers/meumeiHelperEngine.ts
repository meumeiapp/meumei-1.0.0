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
        type: resolveTipType(track.id, step),
        ctaId: step.ctaId,
        ctaLabel: step.ctaLabel
      });
    });
  });
  return tips;
};

export const pickHelperTip = (signals: HelperSignals): HelperTip => {
  const fallback: HelperTip = {
    id: 'helper_default',
    title: 'Ajudante do meumei',
    body: 'Você pode perguntar qualquer dúvida sobre o app por aqui.',
    trackId: 'helper_default',
    type: 'curiosity'
  };

  const tracksById = helperTracks.reduce<Record<string, HelperTrack>>((acc, track) => {
    acc[track.id] = track;
    return acc;
  }, {});

  const curiosidades = tracksById.curiosidades;
  const dicas = tracksById.dicas;
  const pickTrackId = Math.random() < 0.5 ? 'curiosidades' : 'dicas';
  const primaryTrack = pickTrackId === 'dicas' ? dicas : curiosidades;
  const secondaryTrack = pickTrackId === 'dicas' ? curiosidades : dicas;

  const pickFromTrack = (track?: HelperTrack) => {
    if (!track) return null;
    const steps = getEligibleSteps(track, signals);
    if (!steps.length) return null;
    const step = steps[Math.floor(Math.random() * steps.length)];
    const type = resolveTipType(track.id, step);
    const tip = {
      id: step.id,
      title: step.title,
      body: step.body,
      trackId: track.id,
      type,
      ctaId: step.ctaId,
      ctaLabel: step.ctaLabel
    };
    console.log('[helper] pick', { trackId: track.id, id: step.id, type });
    return tip;
  };

  return pickFromTrack(primaryTrack) || pickFromTrack(secondaryTrack) || fallback;
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
