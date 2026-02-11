import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, ChevronDown, ChevronUp, Search, Sparkles, Send } from 'lucide-react';
import type { HelperSignals } from '../helpers/meumeiHelperEngine';
import { pickHelperTip, trackHelperEvent } from '../helpers/meumeiHelperEngine';
import { askMeumeiAssistant } from '../services/assistantService';

type HelperActionMap = Record<string, (() => void) | undefined>;

type SearchHelperBarProps = {
  variant?: 'desktop' | 'mobile';
  appearance?: 'default' | 'subheader';
  modeToggle?: 'tabs' | 'button' | 'none';
  assistantButtonLabel?: string;
  assistantBackLabel?: string;
  assistantPlacement?: 'inline' | 'floating';
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  setActiveSearchIndex: (value: number) => void;
  setIsSearchActive: (value: boolean) => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  signals: HelperSignals;
  actions?: HelperActionMap;
  tipsEnabled?: boolean;
  results?: React.ReactNode;
};

const TIP_ROTATE_MS = 10000;

const SearchHelperBar: React.FC<SearchHelperBarProps> = ({
  variant = 'desktop',
  appearance = 'default',
  modeToggle = 'tabs',
  assistantButtonLabel = 'Ajudante do meumei',
  assistantBackLabel = 'Voltar para busca',
  assistantPlacement = 'inline',
  searchQuery,
  setSearchQuery,
  setActiveSearchIndex,
  setIsSearchActive,
  onSearchKeyDown,
  signals,
  actions = {},
  tipsEnabled,
  results
}) => {
  const [mode, setMode] = useState<'search' | 'assistant'>('search');
  const [assistantQuery, setAssistantQuery] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [assistantError, setAssistantError] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSuggestions, setAssistantSuggestions] = useState<string[]>([]);
  const [currentTip, setCurrentTip] = useState(() => pickHelperTip(signals));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);

  const isDesktop = variant === 'desktop';
  const isSubheader = appearance === 'subheader';
  const isFloatingAssistant = assistantPlacement === 'floating' && isDesktop;
  const desktopFooterOffset = '0px';
  const effectiveMode = isFloatingAssistant ? 'search' : mode;
  const showModeTabs = !isFloatingAssistant && modeToggle === 'tabs';
  const showAssistantButton = !isFloatingAssistant && modeToggle === 'button';
  const showTrailingActionButton = showModeTabs ? effectiveMode === 'assistant' : modeToggle === 'button';
  const assistantActive = !isFloatingAssistant && effectiveMode === 'assistant';
  const containerPadding = isSubheader
    ? isDesktop
      ? 'px-4 py-1.5'
      : 'px-2.5 py-1.5'
    : isDesktop
      ? 'px-6 py-3'
      : 'px-4 py-2';
  const containerGap = isSubheader
    ? isDesktop
      ? 'gap-2'
      : 'gap-1.5'
    : isDesktop
      ? 'gap-3'
      : 'gap-2';
  const textSize = isSubheader ? 'text-sm' : isDesktop ? 'text-sm sm:text-base' : 'text-sm';
  const inputTextSize = isSubheader ? (isDesktop ? 'text-sm' : 'text-[16px]') : isDesktop ? 'text-sm sm:text-base' : 'text-[16px]';
  const actionsGap = isSubheader ? (isDesktop ? 'gap-2' : 'gap-1') : isDesktop ? 'gap-2' : 'gap-1';
  const modePillText = isSubheader ? 'text-[11px]' : isDesktop ? 'text-[11px]' : 'text-[10px]';
  const modeButtonPadding = isSubheader ? (isDesktop ? 'px-2.5 py-1' : 'px-2 py-1') : isDesktop ? 'px-3 py-1' : 'px-2 py-1';
  const modeButtonIconSize = isSubheader ? 12 : isDesktop ? 12 : 10;
  const containerShape = isSubheader ? 'rounded-xl' : isDesktop ? 'rounded-full' : 'rounded-none';
  const pillShape = isSubheader ? 'rounded-lg' : isDesktop ? 'rounded-full' : 'rounded-md';
  const mobileContainerStyle = isSubheader
    ? 'border-zinc-200/70 dark:border-white/10 bg-white/95 dark:bg-[#0c0c10]/85 shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl'
    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] shadow-sm';
  const mobilePillStyle = isSubheader ? 'bg-zinc-100/80 dark:bg-white/10' : 'bg-zinc-100 dark:bg-white/10';
  const assistantButtonClasses = isSubheader
    ? 'rounded-xl px-2.5 py-1.5 text-[10px]'
    : 'rounded-2xl px-4 py-2 text-[11px]';

  const tipLabel = currentTip.type === 'tip' ? 'Dica' : 'Curiosidade';
  const showTips = typeof tipsEnabled === 'boolean' ? tipsEnabled : true;

  useEffect(() => {
    setCurrentTip(pickHelperTip(signals));
  }, [signals]);

  useEffect(() => {
    if (!showTips) return;
    const timer = window.setInterval(() => {
      setCurrentTip(pickHelperTip(signals));
    }, TIP_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [showTips, signals]);

  useEffect(() => {
    if (!isFloatingAssistant) return;
    if (mode !== 'search') {
      setMode('search');
    }
  }, [isFloatingAssistant, mode]);

  useEffect(() => {
    if (effectiveMode !== 'assistant') return;
    inputRef.current?.focus();
  }, [effectiveMode]);

  const handleModeChange = (next: 'search' | 'assistant') => {
    if (isFloatingAssistant) return;
    setMode(next);
    setIsSearchActive(next === 'search');
    if (next === 'assistant') {
      setAssistantError('');
      setAssistantAnswer('');
      setAssistantSuggestions([]);
    }
  };

  const handleInputChange = (value: string) => {
    if (effectiveMode === 'assistant') {
      setAssistantQuery(value);
      return;
    }
    setSearchQuery(value);
    setActiveSearchIndex(0);
    if (variant === 'desktop') {
      setIsSearchActive(value.trim().length > 0);
    }
  };

  const submitAssistantQuestion = async () => {
    const trimmed = assistantQuery.trim();
    if (!trimmed) {
      setAssistantError('Digite uma pergunta antes de enviar.');
      return;
    }
    setAssistantLoading(true);
    setAssistantError('');
    setAssistantAnswer('');
    setAssistantSuggestions([]);
    try {
      const result = await askMeumeiAssistant(trimmed, {
        hasAccounts: signals.hasAccounts,
        hasIncomes: signals.hasIncomes,
        hasExpenses: signals.hasExpenses,
        hasCategories: signals.hasCategories
      });
      if (!result.ok) {
        setAssistantError(result.message || 'Não foi possível responder agora.');
        return;
      }
      setAssistantAnswer(result.answer || '');
      setAssistantSuggestions(result.suggestions || []);
      trackHelperEvent('helper_cta_click', { trackId: 'assistant', stepIndex: 0, ctaId: 'ask' });
    } catch {
      setAssistantError('Não foi possível responder agora.');
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (effectiveMode === 'assistant') {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submitAssistantQuestion();
      }
      return;
    }
    onSearchKeyDown(event);
  };

  const inputValue = effectiveMode === 'assistant' ? assistantQuery : searchQuery;
  const inputPlaceholder =
    effectiveMode === 'assistant'
      ? 'Pergunte ao Ajudante do meumei...'
      : 'Pesquisar despesas, entradas, contas e cartões...';

  const handleTipAction = () => {
    if (!currentTip?.ctaId) return;
    const action = actions[currentTip.ctaId];
    if (!action) return;
    action();
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          className={`flex items-center ${containerGap} ${containerShape} w-full border ${isDesktop ? 'border-zinc-200/80 dark:border-white/15 bg-white/85 dark:bg-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur' : mobileContainerStyle} ${containerPadding} ${textSize} font-semibold text-zinc-900 dark:text-white/90 focus-within:ring-2 focus-within:ring-zinc-300/60 dark:focus-within:ring-white/20`}
        >
          <Search size={18} className="text-zinc-500 dark:text-white/70" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsSearchActive(effectiveMode === 'search')}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            aria-label="Pesquisar ou perguntar ao Ajudante do meumei"
            data-preserve-case="true"
            className={`flex-1 bg-transparent ${inputTextSize} text-zinc-900 dark:text-white/90 placeholder:text-zinc-400 dark:placeholder:text-white/40 outline-none ${isDesktop ? '' : 'min-w-0'}`}
          />
          <div className={`flex items-center ${actionsGap}`}>
            {showModeTabs && (
              <div className={`flex items-center ${pillShape} ${mobilePillStyle} p-0.5 ${modePillText}`}>
                <button
                  type="button"
                  onClick={() => handleModeChange('search')}
                  className={`${pillShape} ${modeButtonPadding} font-semibold transition ${
                    effectiveMode === 'search'
                      ? 'bg-zinc-900 text-white dark:bg-white/20 dark:text-white'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  Buscar
                </button>
                {!isFloatingAssistant && (
                  <button
                    type="button"
                    onClick={() => handleModeChange('assistant')}
                    className={`flex items-center gap-1 ${pillShape} ${modeButtonPadding} font-semibold transition ${
                      effectiveMode === 'assistant'
                        ? 'bg-gradient-to-r from-indigo-500/80 via-sky-500/80 to-fuchsia-500/80 text-white'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-white/60 dark:hover:text-white'
                    }`}
                  >
                    <Sparkles size={modeButtonIconSize} />
                    Ajudante
                  </button>
                )}
              </div>
            )}
            {!showModeTabs && showTrailingActionButton && (
              <button
                type="button"
                onClick={() => {
                  if (effectiveMode === 'assistant') {
                    void submitAssistantQuestion();
                  } else {
                    inputRef.current?.focus();
                  }
                }}
                disabled={effectiveMode !== 'assistant'}
                className={`flex h-8 w-8 items-center justify-center ${pillShape} bg-zinc-900 text-white transition hover:bg-zinc-800 dark:bg-white/15 dark:text-white/90 dark:hover:bg-white/25 ${
                  effectiveMode === 'assistant' ? '' : 'opacity-40'
                }`}
                aria-label={effectiveMode === 'assistant' ? 'Enviar pergunta ao Ajudante' : 'Enviar indisponível'}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
        {results}
      </div>

      {showAssistantButton && (
        <button
          type="button"
          onClick={() => handleModeChange(effectiveMode === 'assistant' ? 'search' : 'assistant')}
          className={`w-full border border-zinc-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 font-semibold ${assistantButtonClasses} ${
            effectiveMode === 'assistant'
              ? 'text-indigo-600 dark:text-indigo-300'
              : 'text-zinc-600 dark:text-white/70'
          }`}
        >
          {effectiveMode === 'assistant' ? assistantBackLabel : assistantButtonLabel}
        </button>
      )}

      {!isFloatingAssistant && showTips && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3 text-xs text-zinc-600 dark:text-white/70">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-white/60">
              {tipLabel}
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white/90">{currentTip.title}</p>
              <p className="text-xs text-zinc-600 dark:text-white/60">{currentTip.body}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentTip.ctaLabel && actions[currentTip.ctaId || ''] && (
              <button
                type="button"
                onClick={handleTipAction}
                className="rounded-full border border-zinc-300 dark:border-white/15 px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:border-zinc-400 dark:text-white/80 dark:hover:border-white/30 dark:hover:text-white"
              >
                {currentTip.ctaLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {!isFloatingAssistant && assistantActive && (assistantLoading || assistantError || assistantAnswer) && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 px-4 py-3 text-sm text-zinc-800 dark:text-white/85">
          {assistantLoading && <p className="text-xs text-zinc-500 dark:text-white/60">Pensando...</p>}
          {assistantError && <p className="text-xs text-red-300/80">{assistantError}</p>}
          {assistantAnswer && <p className="whitespace-pre-line">{assistantAnswer}</p>}
          {assistantSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {assistantSuggestions.slice(0, 3).map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-200 dark:border-white/15 bg-white/80 dark:bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:text-white/70"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {isFloatingAssistant &&
        (typeof document !== 'undefined'
          ? createPortal(
              <div
                className="fixed right-6 z-[1100] w-[min(92vw,360px)]"
                style={{ bottom: desktopFooterOffset }}
              >
                {assistantCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setAssistantCollapsed(false)}
                    className="w-full rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white/95 dark:bg-[#0f0f12] px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-white/80 shadow-2xl flex items-center justify-between"
                    aria-label="Abrir ajudante"
                  >
                    <span className="flex items-center gap-2">
                      <Bot size={14} />
                      Ajudante
                    </span>
                    <ChevronUp size={14} />
                  </button>
                ) : (
                  <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white/95 dark:bg-[#0f0f12] px-4 py-3 text-sm text-zinc-800 dark:text-white/85 shadow-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-white/60 uppercase tracking-[0.2em]">
                        <Bot size={14} className="text-zinc-500 dark:text-white/60" />
                        Ajudante
                      </div>
                      <button
                        type="button"
                        onClick={() => setAssistantCollapsed(true)}
                        className="h-7 w-7 rounded-full border border-zinc-200/70 dark:border-white/10 text-zinc-500 dark:text-white/70 flex items-center justify-center hover:text-zinc-800 dark:hover:text-white"
                        aria-label="Recolher ajudante"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    {showTips && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-white/5 px-3 py-2 text-xs text-zinc-600 dark:text-white/70">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 inline-flex rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-white/60">
                            {tipLabel}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white/90">{currentTip.title}</p>
                            <p className="text-xs text-zinc-600 dark:text-white/60">{currentTip.body}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentTip.ctaLabel && actions[currentTip.ctaId || ''] && (
                            <button
                              type="button"
                              onClick={handleTipAction}
                              className="rounded-full border border-zinc-300 dark:border-white/15 px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:border-zinc-400 dark:text-white/80 dark:hover:border-white/30 dark:hover:text-white"
                            >
                              {currentTip.ctaLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          value={assistantQuery}
                          onChange={(event) => setAssistantQuery(event.target.value)}
                          placeholder="Pergunte ao meumei..."
                          className="flex-1 rounded-full border border-zinc-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 px-3 py-2 text-sm outline-none"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void submitAssistantQuestion();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void submitAssistantQuestion()}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800 dark:bg-white/15 dark:text-white/90 dark:hover:bg-white/25"
                          aria-label="Enviar pergunta ao Ajudante"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                      {(assistantLoading || assistantError || assistantAnswer) && (
                        <div className="mt-3 text-xs text-zinc-600 dark:text-white/70">
                          {assistantLoading && <p>Pensando...</p>}
                          {assistantError && <p className="text-red-300/80">{assistantError}</p>}
                          {assistantAnswer && <p className="whitespace-pre-line">{assistantAnswer}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>,
              document.body
            )
          : null)}
    </div>
  );
};

export default SearchHelperBar;
