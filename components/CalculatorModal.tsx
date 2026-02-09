import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Calculator, Delete, ArrowLeftRight, Check } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import MobileModalShell from './mobile/MobileModalShell';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Operator = '+' | '-' | '×' | '÷' | '^';
type CalculatorMode = 'standard' | 'scientific' | 'currency';
type AngleMode = 'deg' | 'rad';

const formatRateDate = (dateString?: string | null) => {
  if (!dateString) {
    return new Date().toLocaleDateString('pt-BR');
  }
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('pt-BR');
};

const buttons: Array<{ label: string; action: 'number' | 'operator' | 'extra' }> = [
  { label: '⌫', action: 'extra' },
  { label: 'AC', action: 'extra' },
  { label: '%', action: 'extra' },
  { label: '÷', action: 'operator' },
  { label: '7', action: 'number' },
  { label: '8', action: 'number' },
  { label: '9', action: 'number' },
  { label: '×', action: 'operator' },
  { label: '4', action: 'number' },
  { label: '5', action: 'number' },
  { label: '6', action: 'number' },
  { label: '-', action: 'operator' },
  { label: '1', action: 'number' },
  { label: '2', action: 'number' },
  { label: '3', action: 'number' },
  { label: '+', action: 'operator' },
  { label: '+/-', action: 'extra' },
  { label: '0', action: 'number' },
  { label: ',', action: 'number' },
  { label: '=', action: 'extra' }
];

const scientificButtons: Array<{ label: string; action: 'unary' | 'operator' | 'const' }> = [
  { label: 'sin', action: 'unary' },
  { label: 'cos', action: 'unary' },
  { label: 'tan', action: 'unary' },
  { label: '√', action: 'unary' },
  { label: 'x²', action: 'unary' },
  { label: 'x³', action: 'unary' },
  { label: 'xʸ', action: 'operator' },
  { label: '1/x', action: 'unary' },
  { label: 'ln', action: 'unary' },
  { label: 'log', action: 'unary' },
  { label: 'π', action: 'const' },
  { label: 'e', action: 'const' }
];

const fallbackCurrencyOptions = ['BRL', 'USD', 'EUR', 'GBP', 'JPY'];

const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const isMobile = useIsMobile();
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [mode, setMode] = useState<CalculatorMode>('standard');
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');
  const [currencyFrom, setCurrencyFrom] = useState('BRL');
  const [currencyTo, setCurrencyTo] = useState('USD');
  const [currencyRate, setCurrencyRate] = useState('');
  const [currencyStatus, setCurrencyStatus] = useState<{ loading: boolean; error: string | null; updatedAt?: string }>({
    loading: false,
    error: null
  });
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(fallbackCurrencyOptions);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rateRequestRef = useRef<AbortController | null>(null);
  const listRequestRef = useRef<AbortController | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const positionRef = useRef(position);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const ghostTimeoutRef = useRef<number | null>(null);
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pendingX: 0,
    pendingY: 0,
    rafId: 0
  });
  const positionInitializedRef = useRef(false);
  const getViewportMetrics = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      return { width, height };
  };

  useEffect(() => {
      if (!isOpen) {
          setDisplay('0');
          setPreviousValue(null);
          setOperator(null);
          setWaitingForNewValue(false);
          setActiveKey(null);
          return;
      }
      setMode('standard');
  }, [isOpen]);

  useEffect(() => {
      return () => {
          if (ghostTimeoutRef.current) {
              window.clearTimeout(ghostTimeoutRef.current);
          }
      };
  }, []);

  useEffect(() => {
      if (!isModeMenuOpen) return;
      const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as Node;
          if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
              return;
          }
          setIsModeMenuOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeMenuOpen]);

  useEffect(() => {
      if (!isOpen || mode !== 'currency') return;
      rateRequestRef.current?.abort();
      listRequestRef.current?.abort();
      const controller = new AbortController();
      listRequestRef.current = controller;
      fetch('https://api.frankfurter.dev/v1/currencies', { signal: controller.signal })
          .then(resp => {
              if (!resp.ok) throw new Error('Falha ao carregar moedas.');
              return resp.json();
          })
          .then((data: Record<string, string>) => {
              const options = Object.keys(data || {}).sort();
              if (options.length > 0) {
                  setCurrencyOptions(options);
                  setCurrencyFrom(prev => (options.includes(prev) ? prev : options[0]));
                  setCurrencyTo(prev => (options.includes(prev) ? prev : options[0]));
              }
          })
          .catch(err => {
              if (err?.name === 'AbortError') return;
              setCurrencyOptions(fallbackCurrencyOptions);
          });
      return () => controller.abort();
  }, [isOpen, mode]);

  useEffect(() => {
      positionRef.current = position;
  }, [position]);

  useEffect(() => {
      if (!isOpen || isMobile) return;
      if (positionInitializedRef.current) return;
      const panel = panelRef.current;
      const padding = 24;
      const { width: viewportWidth, height: viewportHeight } = getViewportMetrics();
      const width = panel?.offsetWidth || 320;
      const height = panel?.offsetHeight || 480;
      const rootStyles = window.getComputedStyle(document.documentElement);
      const dockOffsetRaw = rootStyles.getPropertyValue('--mm-desktop-dock-bar-offset');
      const dockHeightRaw = rootStyles.getPropertyValue('--mm-desktop-dock-height');
      const dockOffset = Number.parseFloat(dockOffsetRaw) || Number.parseFloat(dockHeightRaw) || 84;
      const x = Math.max(padding, viewportWidth - width - padding);
      const y = Math.max(padding, viewportHeight - dockOffset - height - padding);
      positionInitializedRef.current = true;
      setPosition({ x, y });
  }, [isOpen, isMobile]);

  useEffect(() => {
      if (!isOpen || isMobile) return;
      const handleResize = () => {
          const panel = panelRef.current;
          if (!panel) return;
          const rect = panel.getBoundingClientRect();
          const padding = 12;
          const { width: viewportWidth, height: viewportHeight } = getViewportMetrics();
          const maxX = Math.max(padding, viewportWidth - rect.width - padding);
          const maxY = Math.max(padding, viewportHeight - rect.height - padding);
          const nextX = Math.min(Math.max(positionRef.current.x, padding), maxX);
          const nextY = Math.min(Math.max(positionRef.current.y, padding), maxY);
          if (nextX !== positionRef.current.x || nextY !== positionRef.current.y) {
              setPosition({ x: nextX, y: nextY });
          }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, isMobile]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMobile) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-no-drag="true"]') || target?.closest('button')) {
          return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      dragRef.current = {
          dragging: true,
          startX: event.clientX,
          startY: event.clientY,
          originX: positionRef.current.x,
          originY: positionRef.current.y,
          pendingX: positionRef.current.x,
          pendingY: positionRef.current.y,
          rafId: 0
      };
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current.dragging || !panelRef.current) return;
          const deltaX = moveEvent.clientX - dragRef.current.startX;
          const deltaY = moveEvent.clientY - dragRef.current.startY;
          const rect = panelRef.current.getBoundingClientRect();
          const padding = 12;
          const { width: viewportWidth, height: viewportHeight } = getViewportMetrics();
          const maxX = Math.max(padding, viewportWidth - rect.width - padding);
          const maxY = Math.max(padding, viewportHeight - rect.height - padding);
          const nextX = Math.min(Math.max(dragRef.current.originX + deltaX, padding), maxX);
          const nextY = Math.min(Math.max(dragRef.current.originY + deltaY, padding), maxY);
          dragRef.current.pendingX = nextX;
          dragRef.current.pendingY = nextY;
          panelRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      };

      const handlePointerUp = () => {
          dragRef.current.dragging = false;
          setIsDragging(false);
          if (panelRef.current) {
              panelRef.current.style.willChange = '';
          }
          setPosition({
              x: dragRef.current.pendingX,
              y: dragRef.current.pendingY
          });
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
      };

      setIsDragging(true);
      if (panelRef.current) {
          panelRef.current.style.willChange = 'transform';
      }
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
  };

  const inputDigit = (digit: string) => {
      const normalizedDigit = digit === ',' ? '.' : digit;
      if (waitingForNewValue) {
          setDisplay(normalizedDigit === '.' ? '0.' : normalizedDigit);
          setWaitingForNewValue(false);
          return;
      }

      if (normalizedDigit === '.') {
          if (!display.includes('.')) {
              setDisplay(display + '.');
          }
          return;
      }

      setDisplay(display === '0' ? normalizedDigit : display + normalizedDigit);
  };

  const handleOperator = (nextOperator: Operator) => {
      const inputValue = parseFloat(display);

      if (previousValue === null) {
          setPreviousValue(inputValue);
      } else if (operator && !waitingForNewValue) {
          const result = performCalculation(previousValue, inputValue, operator);
          setPreviousValue(result);
          setDisplay(String(result));
      }

      setWaitingForNewValue(true);
      setOperator(nextOperator);
  };

  const performCalculation = (first: number, second: number, currentOperator: Operator) => {
      switch (currentOperator) {
          case '+': return first + second;
          case '-': return first - second;
          case '×': return first * second;
          case '÷': return second === 0 ? 0 : first / second;
          case '^': return Math.pow(first, second);
          default: return second;
      }
  };

  const handleEquals = () => {
      if (operator === null || previousValue === null || waitingForNewValue) return;
      const inputValue = parseFloat(display);
      const result = performCalculation(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForNewValue(true);
  };

  const handlePercent = () => {
      const value = parseFloat(display);
      setDisplay(String(value / 100));
  };

  const handleSignToggle = () => {
      if (display === '0') return;
      setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
  };

  const handleBackspace = () => {
      if (waitingForNewValue) return;
      if (display.length === 1 || (display.length === 2 && display.startsWith('-'))) {
          setDisplay('0');
      } else {
          setDisplay(display.slice(0, -1));
      }
  };

  const triggerGhost = (label: string) => {
      setActiveKey(label);
      if (ghostTimeoutRef.current) {
          window.clearTimeout(ghostTimeoutRef.current);
      }
      ghostTimeoutRef.current = window.setTimeout(() => {
          setActiveKey(null);
      }, 140);
  };

  const handleAction = (btn: string) => {
      triggerGhost(btn);
      switch (btn) {
          case 'AC':
              setDisplay('0');
              setPreviousValue(null);
              setOperator(null);
              setWaitingForNewValue(false);
              break;
          case '+/-':
              handleSignToggle();
              break;
          case '%':
              handlePercent();
              break;
          case '÷':
          case '×':
          case '-':
          case '+':
              handleOperator(btn as Operator);
              break;
          case '=':
              handleEquals();
              break;
          case '⌫':
              handleBackspace();
              break;
          default:
              inputDigit(btn);
      }
  };

  const formatResult = (value: number) => {
      if (!Number.isFinite(value)) return '0';
      const rounded = Math.round(value * 1e10) / 1e10;
      return String(rounded);
  };

  const fetchRate = (from: string, to: string) => {
      if (!from || !to) return;
      if (from === to) {
          setCurrencyRate('1');
          const todayIso = new Date().toISOString().slice(0, 10);
          setCurrencyStatus({ loading: false, error: null, updatedAt: formatRateDate(todayIso) });
          return;
      }
      rateRequestRef.current?.abort();
      const controller = new AbortController();
      rateRequestRef.current = controller;
      setCurrencyStatus(prev => ({ ...prev, loading: true, error: null }));
      fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`, {
          signal: controller.signal
      })
          .then(resp => {
              if (!resp.ok) throw new Error('Falha ao carregar cotação.');
              return resp.json();
          })
          .then((data: { rates?: Record<string, number>; date?: string }) => {
              const rate = data?.rates?.[to];
              if (!Number.isFinite(rate)) {
                  throw new Error('Cotação indisponível para esta moeda.');
              }
              setCurrencyRate(formatResult(rate));
              setCurrencyStatus({ loading: false, error: null, updatedAt: formatRateDate(data?.date) });
              try {
                  localStorage.setItem(
                      `mm:fx:${from}:${to}`,
                      JSON.stringify({ rate, date: data?.date || null })
                  );
              } catch {
                  // ignore cache errors
              }
          })
          .catch(err => {
              if (err?.name === 'AbortError') return;
              setCurrencyStatus({ loading: false, error: err?.message || 'Falha ao carregar cotação.' });
          });
  };

  useEffect(() => {
      if (!isOpen || mode !== 'currency') return;
      try {
          const cached = localStorage.getItem(`mm:fx:${currencyFrom}:${currencyTo}`);
          if (cached) {
              const payload = JSON.parse(cached);
              if (payload?.rate) {
                  setCurrencyRate(formatResult(payload.rate));
                  setCurrencyStatus(prev => ({
                      ...prev,
                      updatedAt: formatRateDate(payload?.date)
                  }));
              }
          }
      } catch {
          // ignore cache errors
      }
      fetchRate(currencyFrom, currencyTo);
  }, [isOpen, mode, currencyFrom, currencyTo]);

  useEffect(() => {
      if (!isOpen) return;
      const mapKeyToButton = (key: string) => {
          if (/^\d$/.test(key)) return key;
          if (key === '.' || key === ',') return ',';
          if (key === '+' || key === '-') return key;
          if (key === '*' || key.toLowerCase() === 'x') return '×';
          if (key === '/') return '÷';
          if (key === 'Enter' || key === '=') return '=';
          if (key === 'Backspace') return '⌫';
          if (key === 'Delete') return 'AC';
          if (key === '%') return '%';
          return null;
      };
      const handleKeyDown = (event: KeyboardEvent) => {
          if (event.defaultPrevented || event.repeat) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const target = event.target as HTMLElement | null;
          if (target) {
              const tagName = target.tagName;
              if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
                  return;
              }
          }
          const button = mapKeyToButton(event.key);
          if (!button) return;
          event.preventDefault();
          handleAction(button);
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleAction]);

  const handleScientific = (label: string) => {
      const value = parseFloat(display);
      if (Number.isNaN(value) && label !== 'π' && label !== 'e') return;

      const toRadians = (input: number) => (angleMode === 'deg' ? (input * Math.PI) / 180 : input);
      let result = value;

      switch (label) {
          case 'sin':
              result = Math.sin(toRadians(value));
              break;
          case 'cos':
              result = Math.cos(toRadians(value));
              break;
          case 'tan':
              result = Math.tan(toRadians(value));
              break;
          case '√':
              result = Math.sqrt(value);
              break;
          case 'x²':
              result = Math.pow(value, 2);
              break;
          case 'x³':
              result = Math.pow(value, 3);
              break;
          case '1/x':
              result = value === 0 ? 0 : 1 / value;
              break;
          case 'ln':
              result = Math.log(value);
              break;
          case 'log':
              result = Math.log10(value);
              break;
          case 'π':
              setDisplay(formatResult(Math.PI));
              setWaitingForNewValue(true);
              return;
          case 'e':
              setDisplay(formatResult(Math.E));
              setWaitingForNewValue(true);
              return;
          case 'xʸ':
              handleOperator('^');
              return;
          default:
              break;
      }

      setDisplay(formatResult(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForNewValue(true);
  };

  const parsedCurrencyAmount = parseFloat(display.replace(',', '.'));
  const parsedCurrencyRate = parseFloat(currencyRate.replace(',', '.'));
  const currencyResult =
      Number.isFinite(parsedCurrencyAmount) && Number.isFinite(parsedCurrencyRate)
          ? parsedCurrencyAmount * parsedCurrencyRate
          : 0;
  const displayValue = display.replace('.', ',');
  const expressionText = useMemo(() => {
      if (!operator || previousValue === null) return '';
      const left = String(previousValue).replace('.', ',');
      if (waitingForNewValue) {
          return `${left} ${operator}`;
      }
      return `${left} ${operator} ${displayValue}`;
  }, [operator, previousValue, waitingForNewValue, displayValue]);

  if (!isOpen) return null;

  const calculatorBody = (
    <>
      {mode === 'currency' ? (
        <div className="px-4 pt-4 pb-2 space-y-2">
        {expressionText && (
          <div className="text-[10px] text-white/50 text-right">{expressionText}</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 text-right text-4xl font-semibold text-white tabular-nums break-all">
            {displayValue}
          </div>
            <select
              value={currencyFrom}
              onChange={(event) => setCurrencyFrom(event.target.value)}
              className="rounded-full bg-[#2b2b2b] px-3 py-1 text-[11px] font-semibold text-white/80"
            >
              {currencyOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setCurrencyFrom(currencyTo);
                setCurrencyTo(currencyFrom);
                if (Number.isFinite(parsedCurrencyRate) && parsedCurrencyRate !== 0) {
                  setCurrencyRate(formatResult(1 / parsedCurrencyRate));
                }
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-[#2b2b2b] p-1 text-white/70 hover:bg-[#3a3a3a]"
              aria-label="Trocar moedas"
            >
              <ArrowLeftRight size={12} />
            </button>
            <div className="h-px w-full bg-white/10 ml-7" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-right text-3xl font-semibold text-white/70 tabular-nums">
              {currencyResult.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <select
              value={currencyTo}
              onChange={(event) => setCurrencyTo(event.target.value)}
              className="rounded-full bg-[#2b2b2b] px-3 py-1 text-[11px] font-semibold text-white/80"
            >
              {currencyOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/50">
            <span>
              {currencyStatus.loading
                ? 'Atualizando cotação diária...'
                : currencyStatus.updatedAt
                  ? `Cotação diária: ${currencyStatus.updatedAt}`
                  : 'Sem cotação diária'}
            </span>
          </div>
          {currencyStatus.error && (
            <div className="text-[10px] text-rose-400">{currencyStatus.error}</div>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 pt-4 pb-2 text-right">
            {expressionText && (
              <div className="text-[10px] text-white/50 mb-1">{expressionText}</div>
            )}
            <div className="text-4xl font-semibold text-white tabular-nums break-all">{displayValue}</div>
          </div>
          {mode === 'scientific' && (
            <div className="grid grid-cols-4 gap-2 px-4 pb-2">
              {scientificButtons.map(btn => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => handleScientific(btn.label)}
                  className="h-7 rounded-full bg-[#2e2e2e] text-[10px] font-semibold text-white/80 hover:bg-[#3a3a3a] transition"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        {buttons.map(btn => {
          const isOperator = btn.action === 'operator';
          const isSpecial = ['AC', '+/-', '%', '⌫'].includes(btn.label);
          const isEquals = btn.label === '=';
          const isGhostActive = activeKey === btn.label;
          return (
            <button
              key={btn.label}
              onClick={() => handleAction(btn.label)}
              className={`
                ${isMobile ? 'h-12 text-lg' : 'h-11 text-[15px]'} rounded-full font-semibold transition-all active:scale-95 aspect-square
                ${isOperator || isEquals ? 'bg-[#ff9f0a] text-white shadow-lg shadow-orange-900/30' : ''}
                ${isSpecial ? 'bg-[#b6b6b6] text-[#1c1c1c]' : ''}
                ${btn.label === ',' && 'text-2xl leading-none'}
                ${btn.label === '⌫' && 'flex items-center justify-center gap-2'}
                ${!isOperator && !isSpecial && !isEquals ? 'bg-[#3a3a3a] text-white' : ''}
                ${isGhostActive ? 'ring-2 ring-white/50 brightness-125' : ''}
              `}
            >
              {btn.label === '⌫' ? <Delete size={18} /> : btn.label}
            </button>
          );
        })}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <MobileModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Calculadora"
        subtitle="Operações rápidas no dia a dia."
        modalName="calculator"
      >
        <div className="rounded-3xl bg-[#1c1c1c] border border-white/10 shadow-2xl overflow-hidden text-white">
          {calculatorBody}
        </div>
      </MobileModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none">
      <div
        ref={panelRef}
        className={`pointer-events-auto w-full max-w-[268px] bg-[#1c1c1c] rounded-[26px] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-200 text-white ${isDragging ? 'transition-none' : ''}`}
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      >
        <div
          className="relative flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#222] cursor-move select-none"
          onPointerDown={(event) => {
            event.preventDefault();
            handlePointerDown(event);
          }}
        >
          <button
            onClick={onClose}
            aria-label="Fechar calculadora"
            title="Fechar"
            data-no-drag="true"
            onPointerDown={(event) => event.stopPropagation()}
            className="p-1 rounded-full hover:bg-white/10 text-white/70 transition-colors"
          >
            <X size={16} />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setIsModeMenuOpen(prev => !prev)}
            data-no-drag="true"
            onPointerDown={(event) => event.stopPropagation()}
            title="Alterar modo da Calculadora"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2b2b2b] text-white/90 hover:bg-[#3a3a3a]"
          >
            <Calculator size={12} />
          </button>

          {isModeMenuOpen && (
            <div
              ref={menuRef}
              className="absolute right-3 top-10 z-10 w-40 rounded-xl border border-white/10 bg-[#1f1f1f] p-1 text-[11px] text-white/80 shadow-xl"
            >
              {[
                { label: 'Básica', value: 'standard' },
                { label: 'Científica', value: 'scientific' },
                { label: 'Conversão', value: 'currency' }
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value as CalculatorMode);
                    setIsModeMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/10"
                >
                  <span>{option.label}</span>
                  {mode === option.value && <Check size={12} className="text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {calculatorBody}
      </div>
    </div>
  );
};

export default CalculatorModal;
