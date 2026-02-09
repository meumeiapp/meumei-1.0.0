import React, { useMemo, useState, useEffect } from 'react';
import { X, Info, Sparkles, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

type Tip = {
  id: string;
  title: string;
  message: string;
  ctaLabel?: string;
  onClick?: () => void;
};

interface TipsBalloonsProps {
  onOpenInstall?: () => void;
  onOpenSettings?: () => void;
}

const STORAGE_KEY = 'meumei_tips_dismissed_v1';

const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const writeDismissed = (ids: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
};

const TipsBalloons: React.FC<TipsBalloonsProps> = ({ onOpenInstall, onOpenSettings }) => {
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

  const tips = useMemo<Tip[]>(
    () => [
      {
        id: 'security_firebase_platform',
        title: 'Curiosidade',
        message: 'O Meumei utiliza a infraestrutura Google Cloud para armazenar seus dados com segurança e escalabilidade.'
      },
      {
        id: 'security_encryption_at_rest',
        title: 'Curiosidade',
        message: 'Seus dados trafegam com criptografia (HTTPS) e ficam protegidos com criptografia em repouso na Google Cloud.'
      },
      {
        id: 'security_client_encryption',
        title: 'Curiosidade',
        message: 'Alguns valores sensíveis são criptografados antes de serem salvos, reforçando a proteção das informações.'
      },
      {
        id: 'security_access_controls',
        title: 'Curiosidade',
        message: 'As regras de segurança isolam os dados por usuário, garantindo acesso apenas à própria conta.'
      },
      {
        id: 'security_settings_toggle',
        title: 'Curiosidade',
        message: 'Você pode ativar ou desativar estas curiosidades nas Configurações.',
        ctaLabel: 'Abrir configurações',
        onClick: onOpenSettings
      },
      {
        id: 'security_maps_hint',
        title: 'Curiosidade',
        message: 'Nos mapas em tela cheia você pode navegar livremente (financeiro) ou apenas na horizontal (eventos).'
      }
    ],
    [onOpenSettings]
  );

  const visibleTips = tips.filter((tip) => !dismissed.includes(tip.id));
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= visibleTips.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visibleTips.length]);

  const handleDismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  if (visibleTips.length === 0) return null;

  const visibleTip = visibleTips[activeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + visibleTips.length) % visibleTips.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % visibleTips.length);
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-indigo-200/70 bg-white px-5 py-4 text-indigo-950 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-950/70 dark:text-indigo-50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
            {visibleTip.id === 'security_settings_toggle' ? (
              <SlidersHorizontal size={18} />
            ) : visibleTip.id.startsWith('security_') ? (
              <Sparkles size={18} />
            ) : (
              <Info size={18} />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm font-semibold">{visibleTip.title}</p>
            </div>
            <p className="mt-1 text-sm text-indigo-900/70 dark:text-indigo-100/70">{visibleTip.message}</p>
            <div className="mt-3 flex flex-wrap items-center gap-[5px] text-xs text-indigo-600/80 dark:text-indigo-200/70">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white p-1 text-indigo-600 hover:border-indigo-300 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
                  aria-label="Dica anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{activeIndex + 1} / {visibleTips.length}</span>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-white p-1 text-indigo-600 hover:border-indigo-300 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
                  aria-label="Próxima dica"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              {visibleTip.ctaLabel && visibleTip.onClick && (
                <button
                  type="button"
                  onClick={visibleTip.onClick}
                  className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                >
                  {visibleTip.ctaLabel}
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleDismiss(visibleTip.id)}
          className="text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-200"
          aria-label="Dispensar dica"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default TipsBalloons;
