import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sparkles, Send } from 'lucide-react';
import type { HelperSignals } from '../helpers/meumeiHelperEngine';
import { getHelperTips, trackHelperEvent } from '../helpers/meumeiHelperEngine';
import { askMeumeiAssistant } from '../services/assistantService';

type HelperActionMap = Record<string, (() => void) | undefined>;

type SearchHelperBarProps = {
  variant?: 'desktop' | 'mobile';
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

const TIP_ROTATE_MS = 25000;

const SearchHelperBar: React.FC<SearchHelperBarProps> = ({
  variant = 'desktop',
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
  const [tipIndex, setTipIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isDesktop = variant === 'desktop';
  const containerPadding = isDesktop ? 'px-6 py-3' : 'px-4 py-2.5';
  const textSize = isDesktop ? 'text-sm sm:text-base' : 'text-sm';

  const tips = useMemo(() => {
    const eligible = getHelperTips(signals);
    if (eligible.length) return eligible;
    return [
      {
        id: 'helper_default',
        title: 'Ajudante do meumei',
        body: 'Você pode perguntar qualquer dúvida sobre o app por aqui.',
        trackId: 'helper_default'
      }
    ];
  }, [signals]);

  const currentTip = tips[tipIndex % tips.length];
  const showTips = typeof tipsEnabled === 'boolean' ? tipsEnabled : true;

  useEffect(() => {
    if (!showTips || tips.length <= 1) return;
    const timer = window.setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, TIP_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [showTips, tips.length]);

  useEffect(() => {
    if (mode !== 'assistant') return;
    inputRef.current?.focus();
  }, [mode]);

  const handleModeChange = (next: 'search' | 'assistant') => {
    setMode(next);
    setIsSearchActive(next === 'search');
    if (next === 'assistant') {
      setAssistantError('');
      setAssistantAnswer('');
      setAssistantSuggestions([]);
    }
  };

  const handleInputChange = (value: string) => {
    if (mode === 'assistant') {
      setAssistantQuery(value);
      return;
    }
    setSearchQuery(value);
    setActiveSearchIndex(0);
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
    if (mode === 'assistant') {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submitAssistantQuestion();
      }
      return;
    }
    onSearchKeyDown(event);
  };

  const inputValue = mode === 'assistant' ? assistantQuery : searchQuery;

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
          className={`flex items-center gap-3 rounded-full border border-white/15 bg-white/10 ${containerPadding} ${textSize} font-semibold text-white/90 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur focus-within:ring-2 focus-within:ring-white/20`}
        >
          <Search size={18} className="text-white/70" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsSearchActive(mode === 'search')}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'assistant'
                ? 'Me diz sua dúvida sobre o meumei…'
                : 'Pesquisar despesas, entradas, contas e cartões...'
            }
            aria-label="Pesquisar ou perguntar ao Ajudante do meumei"
            className="flex-1 bg-transparent text-sm sm:text-base text-white/90 placeholder:text-white/40 outline-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full bg-white/10 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleModeChange('search')}
                className={`rounded-full px-3 py-1 font-semibold transition ${
                  mode === 'search'
                    ? 'bg-white/20 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('assistant')}
                className={`flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition ${
                  mode === 'assistant'
                    ? 'bg-gradient-to-r from-indigo-500/80 via-sky-500/80 to-fuchsia-500/80 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Sparkles size={12} />
                Ajudante
              </button>
            </div>
            {mode === 'assistant' && (
              <button
                type="button"
                onClick={submitAssistantQuestion}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 transition hover:bg-white/25"
                aria-label="Enviar pergunta ao Ajudante"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
        {results}
      </div>

      {showTips && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/60">
              Dica
            </span>
            <div>
              <p className="text-sm font-semibold text-white/90">{currentTip.title}</p>
              <p className="text-xs text-white/60">{currentTip.body}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentTip.ctaLabel && actions[currentTip.ctaId || ''] && (
              <button
                type="button"
                onClick={handleTipAction}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/80 hover:border-white/30 hover:text-white"
              >
                {currentTip.ctaLabel}
              </button>
            )}
            {tips.length > 1 && (
              <button
                type="button"
                onClick={() => setTipIndex((prev) => (prev + 1) % tips.length)}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/60 hover:border-white/30 hover:text-white"
              >
                Próxima dica
              </button>
            )}
          </div>
        </div>
      )}

      {mode === 'assistant' && (assistantLoading || assistantError || assistantAnswer) && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          {assistantLoading && <p className="text-xs text-white/60">Pensando...</p>}
          {assistantError && <p className="text-xs text-red-300/80">{assistantError}</p>}
          {assistantAnswer && <p className="whitespace-pre-line">{assistantAnswer}</p>}
          {assistantSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {assistantSuggestions.slice(0, 3).map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchHelperBar;
