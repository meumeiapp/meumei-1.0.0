import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  HelperSignals,
  HelperState,
  HelperSelection,
  applyDismiss,
  applyDoNotShow,
  applySnooze,
  applyStepView,
  applyTrackComplete,
  loadHelperState,
  resetDismissals,
  saveHelperState,
  selectHelperTrack,
  shouldRenderHelper,
  trackHelperEvent
} from '../helpers/meumeiHelperEngine';
import { auth } from '../services/firebase';

type HelperActionMap = Record<string, (() => void) | undefined>;

type MeumeiHelperProps = {
  signals: HelperSignals;
  actions?: HelperActionMap;
  tipsEnabled?: boolean;
};

const MAX_BODY_CHARS = 140;

const MeumeiHelper: React.FC<MeumeiHelperProps> = ({ signals, actions = {}, tipsEnabled }) => {
  const [helperState, setHelperState] = useState(loadHelperState);
  const [stepIndex, setStepIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [askError, setAskError] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const shownKeyRef = useRef('');

  const tipsActive = typeof tipsEnabled === 'boolean' ? tipsEnabled : true;
  const autoVisible = tipsActive && shouldRenderHelper(helperState);
  const shouldShowHelper = signals.isLoggedIn && (manualOpen || autoVisible);

  const selection = useMemo<HelperSelection | null>(() => {
    if (!shouldShowHelper) return null;
    return selectHelperTrack(signals, helperState);
  }, [helperState, signals, shouldShowHelper]);

  const fallbackTrack = useMemo(
    () => ({
      id: 'helper_manual',
      label: 'Ajudante do meumei',
      steps: [
        {
          id: 'helper_manual_intro',
          title: 'Precisa de ajuda?',
          body: 'Use o botão Perguntar para tirar dúvidas rápidas sobre o meumei.',
          showWhen: () => true
        }
      ]
    }),
    []
  );

  useEffect(() => {
    if (!selection) {
      setStepIndex(0);
      setExpanded(false);
      return;
    }
    setStepIndex(selection.stepIndex);
    setExpanded(false);
  }, [selection?.track.id, selection?.steps.length]);

  useEffect(() => {
    if (!shouldShowHelper) return;
    const trackId = selection?.track.id || fallbackTrack.id;
    const key = `${trackId}:${stepIndex}`;
    if (shownKeyRef.current !== key) {
      trackHelperEvent('helper_shown', { trackId, stepIndex });
      shownKeyRef.current = key;
    }
    if (!selection) return;
    setHelperState((prev) => {
      const next = applyStepView(prev, trackId, stepIndex);
      if (next === prev) return prev;
      saveHelperState(next);
      return next;
    });
  }, [selection, stepIndex, shouldShowHelper, fallbackTrack.id]);

  if (!shouldShowHelper) {
    return (
      <button
        type="button"
        onClick={() => {
          const nextState = {
            ...helperState,
            dismissedCount: 0,
            cooldownUntil: 0,
            snoozeUntil: 0,
            doNotShow: false
          };
          setHelperState(nextState);
          saveHelperState(nextState);
          setManualOpen(true);
          trackHelperEvent('helper_manual_open');
        }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 shadow-lg backdrop-blur hover:border-emerald-400 hover:bg-emerald-500/20"
        aria-label="Abrir Ajudante do meumei"
      >
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
          Dicas
        </span>
        <span>Ajudante</span>
      </button>
    );
  }

  const track = selection?.track || fallbackTrack;
  const steps = selection?.steps || fallbackTrack.steps;
  const currentStep = steps[stepIndex];
  if (!currentStep) return null;

  const totalSteps = steps.length;
  const progressValue = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const helperLabel = `${track.label} (${stepIndex + 1}/${totalSteps})`;
  const fullBody = `${currentStep.title}. ${currentStep.body}`;
  const bodyTooLong = fullBody.length > MAX_BODY_CHARS;
  const bodyStyle = expanded
    ? undefined
    : {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden'
      };

  const updateState = (updater: (prev: HelperState) => HelperState) => {
    setHelperState((prev) => {
      const next = updater(prev);
      saveHelperState(next);
      return next;
    });
  };

  const handleDismiss = () => {
    updateState((prev) => applyDismiss(prev));
    trackHelperEvent('helper_dismiss', { trackId: track.id, stepIndex });
    setManualOpen(false);
  };

  const handleSnooze = () => {
    updateState((prev) => applySnooze(prev));
    trackHelperEvent('helper_snooze', { trackId: track.id, stepIndex });
    setManualOpen(false);
  };

  const handleDoNotShow = () => {
    updateState((prev) => applyDoNotShow(prev));
    trackHelperEvent('helper_do_not_show', { trackId: track.id, stepIndex });
    setManualOpen(false);
  };

  const handlePrev = () => {
    if (stepIndex === 0) return;
    trackHelperEvent('helper_prev', { trackId: track.id, stepIndex });
    setStepIndex((prev) => Math.max(prev - 1, 0));
    setExpanded(false);
  };

  const finishTrack = () => {
    updateState((prev) => applyTrackComplete(prev, track.id));
    trackHelperEvent('helper_next', { trackId: track.id, stepIndex, completed: true });
    setManualOpen(false);
  };

  const handleNext = () => {
    if (stepIndex >= totalSteps - 1) {
      finishTrack();
      return;
    }
    trackHelperEvent('helper_next', { trackId: track.id, stepIndex });
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    setExpanded(false);
  };

  const handleSkip = () => {
    if (stepIndex >= totalSteps - 1) {
      finishTrack();
      return;
    }
    trackHelperEvent('helper_next', { trackId: track.id, stepIndex, action: 'skip' });
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    setExpanded(false);
  };

  const handleCta = () => {
    if (!currentStep.ctaId) return;
    const action = actions[currentStep.ctaId];
    if (!action) return;
    trackHelperEvent('helper_cta_click', {
      trackId: track.id,
      stepIndex,
      ctaId: currentStep.ctaId
    });
    updateState((prev) => resetDismissals(prev));
    action();
  };

  const submitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setAskError('Digite uma pergunta antes de enviar.');
      return;
    }
    setAskError('');
    setAskLoading(true);
    setAnswer('');
    setSuggestions([]);
    const payload = {
      question: trimmed,
      signals: {
        hasAccounts: signals.hasAccounts,
        hasIncomes: signals.hasIncomes,
        hasExpenses: signals.hasExpenses,
        hasCategories: signals.hasCategories
      }
    };
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setAskError('Faça login para usar o Conselheiro do meumei.');
        return;
      }
      let authHeader: string | undefined;
      try {
        const token = await currentUser.getIdToken(true);
        authHeader = `Bearer ${token}`;
        if (import.meta.env.DEV) {
          console.log('[helper-ai] authUser', {
            uid: currentUser.uid,
            email: currentUser.email || null,
            hasToken: Boolean(token),
            tokenLen: token?.length || 0
          });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.log('[helper-ai] authUser', {
            uid: currentUser.uid,
            email: currentUser.email || null,
            hasToken: false,
            tokenLen: 0
          });
        }
        setAskError('Não foi possível validar sua sessão. Tente novamente.');
        return;
      }
      if (import.meta.env.DEV) {
        console.log('[helper-ai] ask', payload);
      }
      const response = await fetch('/api/askMeumeiHelper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (import.meta.env.DEV) {
        console.log('[helper-ai] response', { status: response.status, data });
      }
      if (!response.ok) {
        const message =
          data?.message ||
          (data?.error ? `Não foi possível responder agora (${data.error}).` : '') ||
          (response.status === 429
            ? 'Você atingiu o limite de perguntas por hora. Tente novamente mais tarde.'
            : 'Não foi possível responder agora. Tente novamente.');
        setAskError(message);
        return;
      }
      setAnswer(typeof data?.answer === 'string' ? data.answer : '');
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (error) {
      console.error('[helper-ai] error', error);
      setAskError('Não foi possível responder agora. Tente novamente.');
    } finally {
      setAskLoading(false);
    }
  };

  const handleQuestionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitQuestion();
  };

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/80 px-4 py-3 text-zinc-900 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-[#151517] dark:text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
            Ajudante do meumei
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{helperLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          X
        </button>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-200" style={bodyStyle as React.CSSProperties}>
          <span className="font-semibold text-zinc-900 dark:text-white">{currentStep.title}. </span>
          {currentStep.body}
        </p>
        {currentStep.ctaLabel && actions[currentStep.ctaId || ''] && (
          <button
            type="button"
            onClick={handleCta}
            className="flex shrink-0 items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400"
          >
            {currentStep.ctaLabel}
          </button>
        )}
      </div>
      {bodyTooLong && (
        <button
          type="button"
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            trackHelperEvent('helper_expand', { trackId: track.id, stepIndex, expanded: next });
          }}
          className="mt-1 text-[11px] font-semibold text-emerald-500 hover:text-emerald-400"
        >
          {expanded ? 'Ver menos' : 'Ver mais'}
        </button>
      )}

      <div className="mt-2 h-1 w-full rounded-full bg-emerald-100/40 dark:bg-emerald-900/40">
        <div
          className="h-1 rounded-full bg-emerald-500 transition-all"
          style={{ width: `${progressValue}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
              stepIndex === 0
                ? 'cursor-not-allowed text-zinc-300 dark:text-zinc-600'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
            }`}
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-zinc-900 hover:text-emerald-500 dark:text-white dark:hover:text-emerald-400"
          >
            Próximo
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAskOpen((prev) => !prev)}
            className="text-[11px] font-semibold text-emerald-500 hover:text-emerald-400"
          >
            Perguntar
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
          >
            Pular
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
          >
            Lembrar depois
          </button>
          <button
            type="button"
            onClick={handleDoNotShow}
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
          >
            Não mostrar
          </button>
        </div>
      </div>

      {askOpen && (
        <form className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3" onSubmit={handleQuestionSubmit}>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pergunte sobre como usar o meumei..."
              className="w-full rounded-lg border border-emerald-500/30 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:border-emerald-500/30 dark:bg-[#0f1111] dark:text-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={askLoading}
                className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {askLoading ? 'Carregando...' : 'Enviar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuestion('');
                  setAnswer('');
                  setSuggestions([]);
                  setAskError('');
                }}
                className="rounded-full border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-400 hover:border-emerald-400"
              >
                Limpar
              </button>
            </div>
            {askError && (
              <p className="text-[11px] font-semibold text-amber-500">{askError}</p>
            )}
            {answer && (
              <div className="rounded-lg border border-emerald-500/20 bg-[#0b1412] px-3 py-2 text-xs text-emerald-100 whitespace-pre-line">
                {answer}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 3).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

export default MeumeiHelper;
