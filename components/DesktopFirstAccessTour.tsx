import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MousePointer2, Pause, Play, X } from 'lucide-react';
import { ViewState } from '../types';

type StepPlacement = 'auto' | 'top' | 'bottom' | 'center';

type TourStep = {
  id: string;
  title: string;
  body: string;
  view: ViewState;
  anchor?: string;
  placement?: StepPlacement;
  demoAction?:
    | 'accounts-preview'
    | 'incomes-preview'
    | 'fixed-expenses-preview'
    | 'variable-expenses-preview'
    | 'personal-expenses-preview'
    | 'yields-preview'
    | 'invoices-preview'
    | 'agenda-preview';
};

type DesktopFirstAccessTourProps = {
  scopeId?: string | null;
  enabled?: boolean;
  restartToken?: number;
  currentView: ViewState;
  onSetView: (view: ViewState) => void;
};

type CursorPoint = {
  x: number;
  y: number;
};

type Metrics = {
  viewportWidth: number;
  viewportHeight: number;
  headerHeight: number;
  dockHeight: number;
  subheaderHeight: number;
  contentAvailableHeight: number;
};

type PanelLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom' | 'center';
  safeTop: number;
  safeBottom: number;
};

const TOUR_STORAGE_PREFIX = 'meumei_desktop_first_access_tour_v3';

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard-summary',
    title: 'Início — Resumo do painel',
    body:
      'O dashboard concentra saldo atual, entradas e saídas do mês, saúde da empresa e a busca global. Use este bloco como visão rápida para decidir a próxima ação financeira.',
    view: ViewState.DASHBOARD,
    anchor: 'dashboard-summary',
    placement: 'bottom'
  },
  {
    id: 'dashboard-spend-ranking',
    title: 'Início — Onde foi parar seu dinheiro?',
    body:
      'Este ranking compara categorias de gasto fixas, variáveis e pessoais para revelar vazamentos do mês. Ele mostra para onde o caixa está indo e quais frentes precisam de ajuste.',
    view: ViewState.DASHBOARD,
    anchor: 'dashboard-spend-ranking',
    placement: 'top'
  },
  {
    id: 'desktop-dock',
    title: 'Dock — Atalhos principais',
    body:
      'No dock você acessa Contas, Entradas, Despesas Fixas, Variáveis, Pessoais, Rendimentos, Faturas, Relatórios, Emissão DAS e Agenda. Dica: use "/" para abrir a busca rapidamente.',
    view: ViewState.DASHBOARD,
    anchor: 'desktop-dock',
    placement: 'top'
  },
  {
    id: 'accounts',
    title: 'Contas',
    body:
      'Contas é a base de todo o fluxo. Aqui entram nome da conta, natureza fiscal PJ/PF, tipo de conta, saldo inicial, opção de rendimento e cor da tag para leitura visual.',
    view: ViewState.ACCOUNTS,
    anchor: 'accounts-new',
    placement: 'bottom',
    demoAction: 'accounts-preview'
  },
  {
    id: 'incomes',
    title: 'Entradas',
    body:
      'Entradas registra receitas. Os campos principais são descrição/origem, valor, natureza, categoria, datas de venda e recebimento, forma de pagamento, conta de destino, status e parcelamento.',
    view: ViewState.INCOMES,
    anchor: 'incomes-new',
    placement: 'bottom',
    demoAction: 'incomes-preview'
  },
  {
    id: 'fixed-expenses',
    title: 'Despesas Fixas',
    body:
      'Despesas Fixas cobre gastos recorrentes. Campos: descrição, valor, categoria, data de lançamento, forma de pagamento, conta pagadora, vencimento, status e observações.',
    view: ViewState.FIXED_EXPENSES,
    anchor: 'expenses-fixed-new',
    placement: 'bottom',
    demoAction: 'fixed-expenses-preview'
  },
  {
    id: 'variable-expenses',
    title: 'Despesas Variáveis',
    body:
      'Despesas Variáveis recebe gastos sazonais ou pontuais, como mercado e combustível. Os campos seguem a mesma estrutura de despesas fixas para padronizar análise.',
    view: ViewState.VARIABLE_EXPENSES,
    anchor: 'expenses-variable-new',
    placement: 'bottom',
    demoAction: 'variable-expenses-preview'
  },
  {
    id: 'personal-expenses',
    title: 'Despesas Pessoais',
    body:
      'Despesas Pessoais mantém a separação PF x PJ. Aqui você registra gastos pessoais com os mesmos campos das despesas para evitar mistura com a operação da empresa.',
    view: ViewState.PERSONAL_EXPENSES,
    anchor: 'expenses-personal-new',
    placement: 'bottom',
    demoAction: 'personal-expenses-preview'
  },
  {
    id: 'yields',
    title: 'Rendimentos',
    body:
      'Rendimentos exibe patrimônio, rendimento do mês e variação, além da calculadora de juros compostos. No formulário você lança data, conta, valor rendido e observações.',
    view: ViewState.YIELDS,
    anchor: 'yields-summary',
    placement: 'bottom',
    demoAction: 'yields-preview'
  },
  {
    id: 'invoices',
    title: 'Faturas (Cartão)',
    body:
      'Faturas controla cartões e pagamentos em aberto. No cadastro: instituição, limite, bandeira, fechamento, vencimento, natureza e cor. Depois você acompanha e paga faturas.',
    view: ViewState.INVOICES,
    anchor: 'cards-new',
    placement: 'bottom',
    demoAction: 'invoices-preview'
  },
  {
    id: 'reports',
    title: 'Relatórios',
    body:
      'Relatórios oferece filtros (Tudo, PJ, PF, Caixa e Competência) e modos Mapa Financeiro, Mapa de Eventos e Resumo, incluindo Diagnóstico MEI e botão Exportar.',
    view: ViewState.REPORTS,
    anchor: 'reports-map',
    placement: 'bottom'
  },
  {
    id: 'das',
    title: 'Emissão DAS',
    body:
      'Na Emissão DAS você copia o CNPJ, acessa o PGMEI e gera a guia mensal do MEI para manter as obrigações fiscais em dia.',
    view: ViewState.DAS,
    anchor: 'das-open',
    placement: 'bottom'
  },
  {
    id: 'agenda',
    title: 'Agenda',
    body:
      'Agenda mostra contadores de hoje, próximos 7 dias e total, calendário mensal e formulário de agendamento com atividade, data, horário, lembrete e observações.',
    view: ViewState.AGENDA,
    anchor: 'agenda-new',
    placement: 'bottom',
    demoAction: 'agenda-preview'
  },
  {
    id: 'finish',
    title: 'Encerramento',
    body:
      'Parabéns. Seu ambiente está pronto. Próximo passo: cadastrar a primeira conta e lançar a primeira entrada para iniciar o fluxo real da empresa.',
    view: ViewState.AGENDA,
    placement: 'center'
  }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const TOUR_ANCHOR_TIMEOUT_MS = 1000;
const MANUAL_AUTOPLAY_COOLDOWN_MS = 30_000;

const getStorageKey = (scopeId?: string | null) =>
  `${TOUR_STORAGE_PREFIX}:${String(scopeId || 'default').trim() || 'default'}`;

const readTourDone = (scopeId?: string | null) => {
  try {
    return localStorage.getItem(getStorageKey(scopeId)) === '1';
  } catch {
    return false;
  }
};

const persistTourDone = (scopeId?: string | null) => {
  try {
    localStorage.setItem(getStorageKey(scopeId), '1');
  } catch {
    // noop
  }
};

const clearTourDone = (scopeId?: string | null) => {
  try {
    localStorage.removeItem(getStorageKey(scopeId));
  } catch {
    // noop
  }
};

const readCssPxVar = (varName: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const value = parseFloat(raw || '');
  return Number.isFinite(value) ? value : fallback;
};

const getMetrics = (viewportWidth: number, viewportHeight: number): Metrics => {
  const headerHeight = readCssPxVar('--mm-header-height', 96);
  const dockHeight = readCssPxVar('--mm-dock-height', readCssPxVar('--mm-desktop-dock-height', 84));
  const subheaderHeight = readCssPxVar('--mm-subheader-height', 0);
  const contentAvailableHeightRaw = readCssPxVar(
    '--mm-content-available-height',
    viewportHeight - headerHeight - dockHeight
  );
  const contentAvailableHeight = Math.max(220, contentAvailableHeightRaw);

  return {
    viewportWidth,
    viewportHeight,
    headerHeight,
    dockHeight,
    subheaderHeight,
    contentAvailableHeight
  };
};

const waitForFrames = async (count = 2) => {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

const waitForAnchorElement = async (anchor: string, timeoutMs = TOUR_ANCHOR_TIMEOUT_MS): Promise<HTMLElement | null> => {
  if (typeof document === 'undefined') return null;

  const selector = `[data-tour-anchor="${anchor}"]`;
  const findAnchor = () => {
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return node;
  };

  const immediate = findAnchor();
  if (immediate) return immediate;

  return new Promise(resolve => {
    const startedAt = performance.now();
    let rafId = 0;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };

    const check = () => {
      const found = findAnchor();
      if (found) {
        cleanup();
        resolve(found);
        return;
      }
      if (performance.now() - startedAt >= timeoutMs) {
        cleanup();
        resolve(null);
        return;
      }
      rafId = requestAnimationFrame(check);
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-tour-anchor']
    });

    rafId = requestAnimationFrame(check);
  });
};

const computePanelLayout = (
  step: TourStep,
  metrics: Metrics,
  panelHeight: number,
  anchorRect: DOMRect | null
): PanelLayout => {
  const safeMargin = 12;
  const safeTop = metrics.headerHeight + metrics.subheaderHeight + safeMargin;
  const safeBottom = metrics.viewportHeight - metrics.dockHeight - safeMargin;
  const safeHeight = Math.max(220, safeBottom - safeTop);
  const panelWidth = clamp(
    Math.round(metrics.viewportWidth * 0.52),
    360,
    Math.min(860, metrics.viewportWidth - 24)
  );
  const panelMaxHeight = clamp(Math.round(metrics.contentAvailableHeight * 0.7), 260, 520);
  const effectivePanelHeight = Math.min(panelHeight, panelMaxHeight, safeHeight);

  if (!anchorRect || step.placement === 'center') {
    return {
      top: clamp(safeTop + (safeHeight - effectivePanelHeight) / 2, safeTop, safeBottom - effectivePanelHeight),
      left: clamp((metrics.viewportWidth - panelWidth) / 2, 12, metrics.viewportWidth - panelWidth - 12),
      width: panelWidth,
      maxHeight: panelMaxHeight,
      placement: 'center',
      safeTop,
      safeBottom
    };
  }

  const preferredPlacement = step.placement === 'top' ? 'top' : step.placement === 'bottom' ? 'bottom' : 'bottom';
  const spaceAbove = anchorRect.top - safeTop;
  const spaceBelow = safeBottom - anchorRect.bottom;
  const minSpace = Math.min(260, effectivePanelHeight + 14);

  let placement: 'top' | 'bottom' | 'center' = preferredPlacement;
  if (preferredPlacement === 'bottom') {
    if (spaceBelow < minSpace && spaceAbove >= minSpace) placement = 'top';
    if (spaceBelow < minSpace && spaceAbove < minSpace) placement = 'center';
  } else {
    if (spaceAbove < minSpace && spaceBelow >= minSpace) placement = 'bottom';
    if (spaceAbove < minSpace && spaceBelow < minSpace) placement = 'center';
  }

  if (placement === 'center') {
    return {
      top: clamp(safeTop + (safeHeight - effectivePanelHeight) / 2, safeTop, safeBottom - effectivePanelHeight),
      left: clamp((metrics.viewportWidth - panelWidth) / 2, 12, metrics.viewportWidth - panelWidth - 12),
      width: panelWidth,
      maxHeight: panelMaxHeight,
      placement: 'center',
      safeTop,
      safeBottom
    };
  }

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const left = clamp(anchorCenterX - panelWidth / 2, 12, metrics.viewportWidth - panelWidth - 12);
  const gap = 12;
  const topRaw = placement === 'bottom' ? anchorRect.bottom + gap : anchorRect.top - effectivePanelHeight - gap;
  const top = clamp(topRaw, safeTop, safeBottom - effectivePanelHeight);

  return {
    top,
    left,
    width: panelWidth,
    maxHeight: panelMaxHeight,
    placement,
    safeTop,
    safeBottom
  };
};

const resolveStepDuration = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(words * 400, 5000, 12000);
};

const DesktopFirstAccessTour: React.FC<DesktopFirstAccessTourProps> = ({
  scopeId,
  enabled = true,
  restartToken = 0,
  currentView,
  onSetView
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [anchorFound, setAnchorFound] = useState(false);
  const [stepReady, setStepReady] = useState(false);
  const [panelHeight, setPanelHeight] = useState(360);
  const [manualPauseUntil, setManualPauseUntil] = useState(0);
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  }));
  const [cursorPoint, setCursorPoint] = useState<CursorPoint>({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 480,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 320
  });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const restartTokenRef = useRef(restartToken);
  const lastStepLoggedRef = useRef<string | null>(null);
  const demoPlayedRef = useRef<Set<string>>(new Set());

  const currentStep = TOUR_STEPS[stepIndex] ?? null;
  const metrics = useMemo(
    () => getMetrics(viewport.width, viewport.height),
    [viewport.height, viewport.width]
  );

  const panelLayout = useMemo(() => {
    if (!currentStep) {
      return {
        top: 48,
        left: 24,
        width: 560,
        maxHeight: 420,
        placement: 'center' as const,
        safeTop: 48,
        safeBottom: viewport.height - 48
      };
    }
    return computePanelLayout(currentStep, metrics, panelHeight, anchorRect);
  }, [anchorRect, currentStep, metrics, panelHeight, viewport.height]);

  const moveCursorToRect = (rect?: DOMRect | null) => {
    if (!rect) return;
    setCursorPoint({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
  };

  const moveCursorToElement = (element: HTMLElement | null) => {
    if (!element) return;
    moveCursorToRect(element.getBoundingClientRect());
  };

  const closeTour = (reason: 'manual' | 'escape' | 'finish') => {
    if (!isOpen) return;
    setIsOpen(false);
    setStepReady(false);
    setAnchorRect(null);
    setAnchorFound(false);
    setStepIndex(0);
    setManualPauseUntil(0);
    setIsAutoPlayPaused(false);
    persistTourDone(scopeId);
    document.documentElement.classList.remove('mm-tour-active');
    window.dispatchEvent(new CustomEvent('mm:tour-helper-restore'));
    window.dispatchEvent(new CustomEvent('mm:first-access-tour-clear-data'));
    window.dispatchEvent(new CustomEvent('mm:first-access-tour-ended'));
    if (reason === 'finish') {
      console.log('[onboarding] finished');
    }
  };

  const openTour = (forced = false) => {
    if (!enabled) return;
    if (!forced && readTourDone(scopeId)) return;
    setIsOpen(true);
    setStepIndex(0);
    setStepReady(false);
    setAnchorRect(null);
    setAnchorFound(false);
    setManualPauseUntil(0);
    setIsAutoPlayPaused(false);
    demoPlayedRef.current.clear();
    lastStepLoggedRef.current = null;
    document.documentElement.classList.add('mm-tour-active');
    window.dispatchEvent(new CustomEvent('mm:tour-helper-collapse'));
    window.dispatchEvent(new CustomEvent('mm:first-access-tour-clear-data'));
    window.dispatchEvent(new CustomEvent('mm:first-access-tour-started'));
  };

  const goToNextStep = (mode: 'auto' | 'manual') => {
    if (!isOpen || !currentStep) return;
    console.log('[onboarding] step_complete', `id=${currentStep.id}`);

    if (stepIndex >= TOUR_STEPS.length - 1) {
      if (mode === 'manual') {
        closeTour('finish');
      }
      return;
    }

    if (mode === 'manual') {
      setManualPauseUntil(Date.now() + MANUAL_AUTOPLAY_COOLDOWN_MS);
    }

    setStepIndex(prev => clamp(prev + 1, 0, TOUR_STEPS.length - 1));
  };

  const goToPrevStep = () => {
    if (!isOpen) return;
    setManualPauseUntil(Date.now() + MANUAL_AUTOPLAY_COOLDOWN_MS);
    setStepIndex(prev => clamp(prev - 1, 0, TOUR_STEPS.length - 1));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    const handleScroll = () => {
      if (!isOpen || !currentStep?.anchor) return;
      const anchorElement = document.querySelector(`[data-tour-anchor="${currentStep.anchor}"]`) as HTMLElement | null;
      if (!anchorElement) return;
      setAnchorRect(anchorElement.getBoundingClientRect());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [currentStep?.anchor, isOpen]);

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      return;
    }

    const tokenChanged = restartTokenRef.current !== restartToken;
    if (tokenChanged) {
      restartTokenRef.current = restartToken;
      clearTourDone(scopeId);
      openTour(true);
      return;
    }

    if (!isOpen && !readTourDone(scopeId)) {
      openTour(false);
    }
  }, [enabled, isOpen, restartToken, scopeId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour('escape');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('mm-tour-active');
      window.dispatchEvent(new CustomEvent('mm:tour-helper-restore'));
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let cancelled = false;

    const run = async () => {
      setStepReady(false);
      setAnchorRect(null);
      setAnchorFound(false);

      if (currentView !== currentStep.view) {
        onSetView(currentStep.view);
      }

      if (lastStepLoggedRef.current !== currentStep.id) {
        console.log('[onboarding] step_start', `id=${currentStep.id}`);
        lastStepLoggedRef.current = currentStep.id;
      }

      await waitForFrames(3);
      if (cancelled) return;

      if (!currentStep.anchor) {
        setStepReady(true);
        setAnchorFound(false);
        setAnchorRect(null);
        return;
      }

      const anchorElement = await waitForAnchorElement(currentStep.anchor, TOUR_ANCHOR_TIMEOUT_MS);
      if (cancelled) return;

      if (!anchorElement) {
        console.log('[onboarding] anchor_missing', `id=${currentStep.id}`, `step=${currentStep.anchor}`);
        setAnchorFound(false);
        setAnchorRect(null);
        setStepReady(true);
        return;
      }

      const rect = anchorElement.getBoundingClientRect();
      console.log(
        '[onboarding] anchor_found',
        `id=${currentStep.id}`,
        `rect=${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`
      );
      setAnchorFound(true);
      setAnchorRect(rect);
      setStepReady(true);
      moveCursorToRect(rect);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [currentStep, currentView, isOpen, onSetView]);

  useEffect(() => {
    if (!isOpen || !stepReady || !currentStep?.demoAction) return;
    if (demoPlayedRef.current.has(currentStep.id)) return;
    demoPlayedRef.current.add(currentStep.id);

    const triggerDemo = () => {
      if (currentStep.demoAction === 'accounts-preview') {
        window.dispatchEvent(new CustomEvent('mm:tour-open-account-modal', { detail: { preview: true } }));
      } else if (currentStep.demoAction === 'incomes-preview') {
        window.dispatchEvent(new CustomEvent('mm:tour-open-income-modal', { detail: { preview: true } }));
      } else if (currentStep.demoAction === 'fixed-expenses-preview') {
        window.dispatchEvent(
          new CustomEvent('mm:tour-open-expense-modal', { detail: { expenseType: 'fixed', preview: true } })
        );
      } else if (currentStep.demoAction === 'variable-expenses-preview') {
        window.dispatchEvent(
          new CustomEvent('mm:tour-open-expense-modal', { detail: { expenseType: 'variable', preview: true } })
        );
      } else if (currentStep.demoAction === 'personal-expenses-preview') {
        window.dispatchEvent(
          new CustomEvent('mm:tour-open-expense-modal', { detail: { expenseType: 'personal', preview: true } })
        );
      } else if (currentStep.demoAction === 'yields-preview') {
        window.dispatchEvent(new CustomEvent('mm:tour-open-yield-modal', { detail: { preview: true } }));
      } else if (currentStep.demoAction === 'invoices-preview') {
        window.dispatchEvent(new CustomEvent('mm:tour-open-card-modal', { detail: { preview: true } }));
      } else if (currentStep.demoAction === 'agenda-preview') {
        window.dispatchEvent(new CustomEvent('mm:tour-open-agenda-form', { detail: { preview: true } }));
      }
    };

    const timer = window.setTimeout(triggerDemo, 480);
    return () => window.clearTimeout(timer);
  }, [currentStep, isOpen, stepReady]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    panelRef.current.focus({ preventScroll: true });
  }, [isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const nextHeight = Math.round(panelRef.current.getBoundingClientRect().height);
    if (Math.abs(nextHeight - panelHeight) > 4) {
      setPanelHeight(nextHeight);
    }
  }, [isOpen, panelHeight, stepIndex, stepReady, viewport.height, viewport.width]);

  useEffect(() => {
    if (!isOpen || !currentStep || !stepReady) return;
    if (stepIndex >= TOUR_STEPS.length - 1) return;
    if (isAutoPlayPaused) return;

    let moveTimer: number | undefined;
    let advanceTimer: number | undefined;
    let pauseTimer: number | undefined;

    const now = Date.now();
    const delayFromPause = manualPauseUntil > now ? manualPauseUntil - now : 0;
    if (delayFromPause > 0) {
      pauseTimer = window.setTimeout(() => {
        setManualPauseUntil(0);
      }, delayFromPause + 10);
      return () => {
        if (pauseTimer) window.clearTimeout(pauseTimer);
      };
    }

    const duration = resolveStepDuration(`${currentStep.title} ${currentStep.body}`);
    const moveAt = Math.max(duration - 850, 650);

    moveTimer = window.setTimeout(() => {
      moveCursorToElement(nextButtonRef.current);
    }, moveAt);

    advanceTimer = window.setTimeout(() => {
      goToNextStep('auto');
    }, duration);

    return () => {
      if (moveTimer) window.clearTimeout(moveTimer);
      if (advanceTimer) window.clearTimeout(advanceTimer);
      if (pauseTimer) window.clearTimeout(pauseTimer);
    };
  }, [currentStep, isAutoPlayPaused, isOpen, manualPauseUntil, stepIndex, stepReady]);

  useEffect(() => {
    if (!isOpen || !currentStep?.anchor || !anchorRect) return;

    const refreshAnchorRect = () => {
      const anchorElement = document.querySelector(`[data-tour-anchor="${currentStep.anchor}"]`) as HTMLElement | null;
      if (!anchorElement) return;
      setAnchorRect(anchorElement.getBoundingClientRect());
    };

    const raf = requestAnimationFrame(refreshAnchorRect);
    return () => cancelAnimationFrame(raf);
  }, [currentStep?.anchor, anchorRect, isOpen, stepIndex]);

  if (!enabled || !isOpen || !currentStep) {
    return null;
  }

  const progressLabel = `${stepIndex + 1}/${TOUR_STEPS.length}`;
  const progressRatio = ((stepIndex + 1) / TOUR_STEPS.length) * 100;
  const isLastStep = stepIndex >= TOUR_STEPS.length - 1;
  const shouldShowAnchorHighlight = anchorFound && anchorRect;
  const highlightRect = (() => {
    if (!shouldShowAnchorHighlight || !anchorRect) return null;
    const safePadding = 8;
    const safeTop = metrics.headerHeight + metrics.subheaderHeight + safePadding;
    const safeBottom = metrics.viewportHeight - metrics.dockHeight - safePadding;

    const rawLeft = anchorRect.left - 6;
    const rawRight = anchorRect.right + 6;
    const rawTop = anchorRect.top - 6;
    const rawBottom = anchorRect.bottom + 6;

    const left = clamp(rawLeft, 6, Math.max(6, metrics.viewportWidth - 22));
    const right = clamp(rawRight, left + 20, Math.max(left + 20, metrics.viewportWidth - 6));
    const top = clamp(rawTop, safeTop, Math.max(safeTop, safeBottom - 22));
    const bottom = clamp(rawBottom, top + 20, Math.max(top + 20, safeBottom));

    return {
      left,
      top,
      width: Math.max(20, right - left),
      height: Math.max(20, bottom - top)
    };
  })();

  const handleLaunchAction = (target: 'accounts' | 'incomes') => {
    closeTour('finish');
    const openEventName = target === 'accounts' ? 'mm:tour-open-account-modal' : 'mm:tour-open-income-modal';
    const viewTarget = target === 'accounts' ? ViewState.ACCOUNTS : ViewState.INCOMES;
    requestAnimationFrame(() => {
      onSetView(viewTarget);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(openEventName));
      }, 320);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1850] pointer-events-none"
      data-tour-overlay="true"
      data-tour-step={currentStep.id}
    >
      {highlightRect ? (
        <>
          <div
            className="absolute bg-black/72 backdrop-blur-[4px]"
            style={{
              left: 0,
              top: 0,
              width: '100%',
              height: Math.max(0, highlightRect.top)
            }}
          />
          <div
            className="absolute bg-black/72 backdrop-blur-[4px]"
            style={{
              left: 0,
              top: highlightRect.top,
              width: Math.max(0, highlightRect.left),
              height: highlightRect.height
            }}
          />
          <div
            className="absolute bg-black/72 backdrop-blur-[4px]"
            style={{
              left: highlightRect.left + highlightRect.width,
              top: highlightRect.top,
              width: Math.max(
                0,
                metrics.viewportWidth - (highlightRect.left + highlightRect.width)
              ),
              height: highlightRect.height
            }}
          />
          <div
            className="absolute bg-black/72 backdrop-blur-[4px]"
            style={{
              left: 0,
              top: highlightRect.top + highlightRect.height,
              width: '100%',
              height: Math.max(
                0,
                metrics.viewportHeight - (highlightRect.top + highlightRect.height)
              )
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/78 backdrop-blur-[4px]" />
      )}

      {highlightRect && (
        <div
          className="absolute rounded-2xl border border-cyan-300/80 shadow-[0_0_0_2px_rgba(34,211,238,0.35),0_0_36px_rgba(34,211,238,0.45)]"
          style={{
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height
          }}
        />
      )}

      <div
        className="absolute h-5 w-5 rounded-full border border-cyan-200/90 bg-cyan-400/90 shadow-[0_0_12px_rgba(34,211,238,0.75)] transition-all duration-700 ease-out"
        style={{
          left: `${cursorPoint.x}px`,
          top: `${cursorPoint.y}px`,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <MousePointer2 size={11} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-950" />
      </div>

      <div
        ref={panelRef}
        className="absolute pointer-events-auto rounded-3xl border border-cyan-400/50 bg-slate-950/92 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.58)]"
        style={{
          left: panelLayout.left,
          top: panelLayout.top,
          width: panelLayout.width,
          maxHeight: panelLayout.maxHeight,
          overflowY: 'auto'
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tour-title-${currentStep.id}`}
        aria-describedby={`tour-body-${currentStep.id}`}
        tabIndex={0}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">Guia de primeiro acesso</p>
            <h3 id={`tour-title-${currentStep.id}`} className="mt-1 text-xl font-bold text-white">
              {currentStep.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => closeTour('manual')}
            className="rounded-full border border-white/20 p-1.5 text-zinc-300 transition hover:border-white/40 hover:text-white"
            aria-label="Encerrar guia"
          >
            <X size={16} />
          </button>
        </div>

        <div aria-live="polite">
          <p id={`tour-body-${currentStep.id}`} className="text-sm leading-relaxed text-slate-50">
            {currentStep.body}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-500"
              style={{ width: `${progressRatio}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {TOUR_STEPS.map((step, idx) => (
                <span
                  key={step.id}
                  className={`h-2 w-2 rounded-full ${
                    idx < stepIndex ? 'bg-cyan-300' : idx === stepIndex ? 'bg-cyan-400' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-cyan-200">
              Passo {progressLabel} • Faltam {Math.max(0, TOUR_STEPS.length - (stepIndex + 1))}
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-cyan-200">
          Esc encerra imediatamente
        </div>

        {isLastStep && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleLaunchAction('accounts')}
              className="rounded-xl border border-cyan-300/45 bg-cyan-400/15 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/25"
            >
              Cadastrar primeira conta
            </button>
            <button
              type="button"
              onClick={() => handleLaunchAction('incomes')}
              className="rounded-xl border border-indigo-300/45 bg-indigo-400/15 px-3 py-2 text-xs font-bold text-indigo-100 hover:bg-indigo-400/25"
            >
              Lançar primeira entrada
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPrevStep}
              disabled={stepIndex === 0}
              className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed hover:border-white/40"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => closeTour('manual')}
              className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-white/40"
            >
              Encerrar guia
            </button>
            {!isLastStep && (
              <button
                type="button"
                onClick={() => setIsAutoPlayPaused(prev => !prev)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-white/40"
              >
                {isAutoPlayPaused ? <Play size={12} /> : <Pause size={12} />}
                {isAutoPlayPaused ? 'Retomar' : 'Pausar'}
              </button>
            )}
          </div>

          <button
            ref={nextButtonRef}
            type="button"
            onClick={() => (isLastStep ? closeTour('finish') : goToNextStep('manual'))}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.45)] hover:bg-cyan-300"
          >
            {isLastStep ? (
              <span className="inline-flex items-center gap-1">
                <Check size={13} />
                Concluir guia
              </span>
            ) : (
              'Avançar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesktopFirstAccessTour;
