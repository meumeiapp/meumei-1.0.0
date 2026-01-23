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
    id: 'mobile_exclusivas',
    label: 'Dicas do mobile',
    steps: [
      {
        id: 'mobile_quick_access',
        title: 'Acesso rápido no rodapé',
        body: 'Deslize os botões do rodapé para o lado e descubra mais atalhos.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      },
      {
        id: 'mobile_expand_lists',
        title: 'Listas inteligentes',
        body: 'Quando a lista ficar longa, toque em “expandir” para ver tudo e “recolher” para voltar.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      },
      {
        id: 'mobile_tap_details',
        title: 'Toque para detalhes',
        body: 'Em contas, entradas e saídas, toque no item para abrir detalhes e ações.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      },
      {
        id: 'mobile_search',
        title: 'Busca rápida',
        body: 'Use a busca no topo para achar despesas, entradas, contas e cartões em segundos.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      },
      {
        id: 'mobile_home',
        title: 'Voltar para a Home',
        body: 'Ao sair do painel, o botão de casa aparece no rodapé para voltar rápido.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      },
      {
        id: 'mobile_tips_settings',
        title: 'Dicas no controle',
        body: 'Se quiser, você pode desativar as dicas nas Configurações.',
        onlyMobile: true,
        showWhen: (s) => s.isLoggedIn && s.isMobile
      }
    ]
  },
  {
    id: 'primeiros_passos',
    label: 'Primeiros passos',
    steps: [
      {
        id: 'contas',
        title: 'Cadastre suas contas',
        body: 'Comece criando suas contas (banco, caixa, carteira). Isso desbloqueia o controle de saldo e movimentações.',
        ctaId: 'accounts',
        ctaLabel: 'Ir para Contas',
        showWhen: (s) => !s.hasAccounts
      },
      {
        id: 'entradas',
        title: 'Registre sua primeira entrada',
        body: 'Entradas são vendas, serviços e recebimentos. Categorize bem para entender o que mais rende.',
        ctaId: 'incomes',
        ctaLabel: 'Ir para Entradas',
        showWhen: (s) => s.hasAccounts && !s.hasIncomes
      },
      {
        id: 'despesas',
        title: 'Organize suas despesas',
        body: 'Lance despesas fixas e variáveis. Dica: anote na hora para não perder nada.',
        ctaId: 'expenses',
        ctaLabel: 'Ir para Despesas',
        showWhen: (s) => s.hasAccounts && !s.hasExpenses
      },
      {
        id: 'categorias',
        title: 'Categorias deixam tudo mais claro',
        body: 'Categorias bem feitas viram relatórios melhores. Revise todo mês e corte vazamentos.',
        ctaId: 'categories',
        ctaLabel: 'Ver Categorias',
        showWhen: (s) => (s.hasIncomes || s.hasExpenses) && !s.hasCategories
      },
      {
        id: 'relatorios',
        title: 'Confira os Relatórios semanalmente',
        body: 'Olhar o resumo do mês toda semana ajuda a corrigir a rota rápido, antes de virar problema.',
        ctaId: 'reports',
        ctaLabel: 'Abrir Relatórios',
        showWhen: (s) => s.hasAccounts && (s.hasIncomes || s.hasExpenses)
      }
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    steps: [
      {
        id: 'dicas_config',
        title: 'Dicas sob controle',
        body: 'Se preferir, você pode desativar as dicas nas Configurações.',
        showWhen: (s) => s.isLoggedIn
      }
    ]
  },
  {
    id: 'atalhos',
    label: 'Atalhos do teclado',
    steps: [
      {
        id: 'atalhos_1_9',
        title: 'Atalhos do Acesso Rápido',
        body: 'Use as teclas 1 a 9 para abrir os botões do Acesso Rápido quando não estiver digitando.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'atalho_esc',
        title: 'Volte ou feche rápido',
        body: 'Pressione ESC para fechar modais e voltar para a tela anterior.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'atalho_busca',
        title: 'Navegue na busca',
        body: 'Com resultados abertos, use as setas para cima/baixo e Enter para abrir o item.',
        showWhen: (s) => s.isLoggedIn
      },
      {
        id: 'atalho_ajudante_enter',
        title: 'Pergunte ao Ajudante',
        body: 'No modo Ajudante, pressione Enter para enviar a pergunta.',
        showWhen: (s) => s.isLoggedIn
      }
    ]
  },
  {
    id: 'pwa',
    label: 'Dica de PWA',
    steps: [
      {
        id: 'instalar_app',
        title: 'Instale o meumei',
        body: 'Você pode instalar o meumei e ter acesso direto na sua área de trabalho, como um app.',
        ctaId: 'pwa_install',
        ctaLabel: 'Instalar app',
        showWhen: (s) => s.isPwaInstallable && !s.isStandalone
      }
    ]
  },
  {
    id: 'higiene_financeira',
    label: 'Higiene financeira',
    steps: [
      {
        id: 'pessoal',
        title: 'Separe o pessoal do MEI',
        body: 'Use despesas pessoais para não misturar gastos. Isso evita confusão e facilita decisões.',
        ctaId: 'personal_expenses',
        ctaLabel: 'Ir para Despesas Pessoais',
        showWhen: (s) => s.hasAccounts && (s.hasIncomes || s.hasExpenses)
      },
      {
        id: 'faturas',
        title: 'Faturas sob controle',
        body: 'Revise a fatura antes de fechar para não perder lançamentos. Cartão sem controle vira surpresa.',
        ctaId: 'invoices',
        ctaLabel: 'Abrir Faturas',
        showWhen: (s) => s.hasAccounts
      }
    ]
  }
];

export const selectHelperTrack = (signals: HelperSignals, state: HelperState): HelperSelection | null => {
  if (!signals.isLoggedIn) return null;
  const priority = ['mobile_exclusivas', 'pwa', 'primeiros_passos', 'higiene_financeira'];
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
