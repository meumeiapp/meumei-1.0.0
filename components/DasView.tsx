import React from 'react';
import { ArrowLeft, Check, Copy, ExternalLink, FileText, Home } from 'lucide-react';
import type { CompanyInfo } from '../types';
import useIsMobile from '../hooks/useIsMobile';

interface DasViewProps {
  onBack: () => void;
  company: CompanyInfo;
  onOpenCompany?: () => void;
}

const PGMEI_URL =
  'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao';

const DasView: React.FC<DasViewProps> = ({ onBack, company, onOpenCompany }) => {
  const isMobile = useIsMobile();
  const [copied, setCopied] = React.useState(false);
  const cnpj = (company.cnpj || '').trim();
  const subHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = React.useState(0);
  const [headerFill, setHeaderFill] = React.useState({ top: 0, height: 0 });

  const handleCopy = async () => {
    if (!cnpj) return;
    try {
      await navigator.clipboard.writeText(cnpj);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenPgmei = () => {
    if (typeof window === 'undefined') return;
    window.open(PGMEI_URL, '_blank', 'noopener,noreferrer');
  };

  React.useEffect(() => {
    if (!isMobile) return;
    const node = subHeaderRef.current;
    if (!node) return;

    const updateMetrics = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.round(rect.height);
      setSubHeaderHeight(prev => (prev === height ? prev : height));
      const fillHeight = Math.max(0, Math.round(rect.top));
      setHeaderFill(prev => (prev.top === 0 && prev.height === fillHeight ? prev : { top: 0, height: fillHeight }));
    };

    updateMetrics();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMetrics) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateMetrics);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [isMobile]);

  if (isMobile) {
    const mobileHeader = (
      <div className="space-y-2">
        <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            aria-label="Voltar para o início"
          >
            <Home size={16} />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Emissão DAS</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">PGMEI pronto para emissão</p>
          </div>
          <div className="min-w-[32px]" />
        </div>
      </div>
    );

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
        <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
          {headerFill.height > 0 && (
            <div
              className="fixed left-0 right-0 z-20 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl"
              style={{ top: headerFill.top, height: headerFill.height }}
            />
          )}
          <div className="fixed left-0 right-0 z-30" style={{ top: 'var(--mm-mobile-top, 0px)' }}>
            <div
              ref={subHeaderRef}
              className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl shadow-sm"
            >
              <div className="px-4 pb-3 pt-2">
                {mobileHeader}
              </div>
            </div>
          </div>
          <div
            className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+128px)]"
            style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 28 : undefined }}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Passo a passo</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">1) Copie o CNPJ abaixo.</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">2) Abra o PGMEI.</div>
                  <button
                    type="button"
                    onClick={handleOpenPgmei}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full bg-teal-600 text-white hover:bg-teal-500"
                  >
                    Abrir PGMEI
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 flex flex-col gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">CNPJ</div>
                {cnpj ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-white break-all">{cnpj}</div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                    >
                      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      {copied ? 'Copiado' : 'Copiar CNPJ'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-rose-500">
                    <p>CNPJ não informado.</p>
                    {onOpenCompany && (
                      <button
                        type="button"
                        onClick={onOpenCompany}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        Preencher na gestão da empresa
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="bg-white dark:bg-[#151517] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileText size={20} className="text-teal-500" />
              Emissão DAS
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Abra o PGMEI com o CNPJ já pronto para copiar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenPgmei}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full bg-teal-600 text-white hover:bg-teal-500"
          >
            Abrir PGMEI <ExternalLink size={14} />
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">CNPJ</div>
          {cnpj ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-lg font-semibold text-zinc-900 dark:text-white break-all">{cnpj}</div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar CNPJ'}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-rose-500">
              <p>CNPJ não informado.</p>
              {onOpenCompany && (
                <button
                  type="button"
                  onClick={onOpenCompany}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Preencher na gestão da empresa
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <div>1) Copie o CNPJ acima.</div>
          <div>2) Abra o PGMEI e cole o CNPJ para continuar.</div>
          <div>3) Selecione o ano-calendário e gere a guia DAS.</div>
        </div>
      </div>
    </div>
  );
};

export default DasView;
