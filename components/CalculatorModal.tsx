import React, { useState, useEffect } from 'react';
import { X, Calculator, Delete } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import MobileModalShell from './mobile/MobileModalShell';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Operator = '+' | '-' | '×' | '÷';

const buttons: Array<{ label: string; action: 'number' | 'operator' | 'extra' }> = [
  { label: 'AC', action: 'extra' },
  { label: '+/-', action: 'extra' },
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
  { label: '0', action: 'number' },
  { label: '.', action: 'number' },
  { label: '⌫', action: 'extra' },
  { label: '=', action: 'extra' }
];

const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const isMobile = useIsMobile();
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);

  useEffect(() => {
      if (!isOpen) {
          setDisplay('0');
          setPreviousValue(null);
          setOperator(null);
          setWaitingForNewValue(false);
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const inputDigit = (digit: string) => {
      if (waitingForNewValue) {
          setDisplay(digit === '.' ? '0.' : digit);
          setWaitingForNewValue(false);
          return;
      }

      if (digit === '.') {
          if (!display.includes('.')) {
              setDisplay(display + '.');
          }
          return;
      }

      setDisplay(display === '0' ? digit : display + digit);
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

  const handleAction = (btn: string) => {
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

  const calculatorBody = (
    <>
      <div className="px-2 pt-2 pb-4 text-right">
        <p className="text-xs text-white/40 uppercase tracking-[0.3em] mb-2">Resultado</p>
        <p className="text-5xl font-bold text-white tabular-nums break-all">{display}</p>
      </div>

      <div className="grid grid-cols-4 gap-3 bg-[#090909]">
        {buttons.map(btn => {
          const isOperator = btn.action === 'operator';
          const isSpecial = ['AC', '+/-', '%', '⌫'].includes(btn.label);
          const isEquals = btn.label === '=';
          const colSpan = btn.label === '0' ? 'col-span-2' : 'col-span-1';
          return (
            <button
              key={btn.label}
              onClick={() => handleAction(btn.label)}
              className={`
                ${colSpan} h-14 rounded-2xl text-lg font-semibold transition-all active:scale-95
                ${isOperator ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-900/40' : ''}
                ${isSpecial ? 'bg-white/5 text-white/70 border border-white/10' : ''}
                ${btn.label === '0' && 'text-left pl-6'}
                ${btn.label === '.' && 'text-3xl leading-none'}
                ${btn.label === '⌫' && 'flex items-center justify-center gap-2'}
                ${isEquals ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : ''}
                ${!isOperator && !isSpecial && !isEquals ? 'bg-[#141414] text-white' : ''}
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
        <div className="rounded-2xl bg-gradient-to-b from-[#111] to-[#050505] border border-white/10 shadow-2xl overflow-hidden p-4">
          {calculatorBody}
        </div>
      </MobileModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#111] to-[#050505] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2 text-white/80 text-sm uppercase tracking-widest">
            <Calculator size={16} />
            Calculadora
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pt-8 pb-6 text-right">
          <p className="text-xs text-white/40 uppercase tracking-[0.3em] mb-2">Resultado</p>
          <p className="text-5xl font-bold text-white tabular-nums break-all">{display}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 p-6 bg-[#090909]">
          {buttons.map(btn => {
            const isOperator = btn.action === 'operator';
            const isSpecial = ['AC', '+/-', '%', '⌫'].includes(btn.label);
            const isEquals = btn.label === '=';
            const colSpan = btn.label === '0' ? 'col-span-2' : 'col-span-1';
            return (
              <button
                key={btn.label}
                onClick={() => handleAction(btn.label)}
                className={`
                  ${colSpan} h-14 rounded-2xl text-lg font-semibold transition-all active:scale-95
                  ${isOperator ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-900/40' : ''}
                  ${isSpecial ? 'bg-white/5 text-white/70 border border-white/10' : ''}
                  ${btn.label === '0' && 'text-left pl-6'}
                  ${btn.label === '.' && 'text-3xl leading-none'}
                  ${btn.label === '⌫' && 'flex items-center justify-center gap-2'}
                  ${isEquals ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : ''}
                  ${!isOperator && !isSpecial && !isEquals ? 'bg-[#141414] text-white' : ''}
                `}
              >
                {btn.label === '⌫' ? <Delete size={18} /> : btn.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalculatorModal;
