import React from 'react';
import { Check, Copy, ExternalLink, FileText, Home } from 'lucide-react';
import type { CompanyInfo } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';

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
  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const paidTaxTotal = Number((company as any)?.dasPaidTotal ?? (company as any)?.taxPaidTotal ?? 0) || 0;

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
    const cnpjStatus = cnpj ? 'OK' : 'Pendente';
    const mobileHeader = (
      <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable">
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

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">CNPJ</p>
            <p className={`text-[12px] font-semibold ${cnpj ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {cnpjStatus}
            </p>
          </div>
          <div className="rounded-xl mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">PGMEI</p>
            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">Pronto</p>
          </div>
        </div>

        <div className={`grid ${cnpj ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          <button
            type="button"
            onClick={handleOpenPgmei}
            data-tour-anchor="das-open"
            className="flex items-center justify-center gap-2 mm-mobile-primary-cta rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-300 hover:border-teal-200 dark:hover:border-teal-700 transition"
          >
            <ExternalLink size={14} />
            Abrir PGMEI
          </button>
          {cnpj && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 mm-mobile-primary-cta rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar CNPJ'}
            </button>
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
        <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
          {headerFill.height > 0 && (
            <div
              className="fixed left-0 right-0 z-20 bg-white dark:bg-[#151517] backdrop-blur-xl"
              style={{ top: headerFill.top, height: headerFill.height }}
            />
          )}
          <div className="fixed left-0 right-0 z-30" style={{ top: 'var(--mm-mobile-top, 0px)' }}>
            <div
              ref={subHeaderRef}
              className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
            >
              <div className="mm-mobile-subheader-pad">
                {mobileHeader}
              </div>
            </div>
          </div>
          <div
            className="h-full overflow-y-auto mm-mobile-content-pad pb-[calc(env(safe-area-inset-bottom)+88px)]"
            style={{
              paddingTop: subHeaderHeight
                ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px + 2px)`
                : 'calc(var(--mm-mobile-top, 0px) + 2px)'
            }}
          >
            <div className="space-y-0">
              <MobileFullWidthSection contentClassName="mm-mobile-section-pad">
                <div className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Passo a passo</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">1) Copie o CNPJ abaixo.</div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">2) Abra o PGMEI.</div>
                    <button
                      type="button"
                      onClick={handleOpenPgmei}
                      data-tour-anchor="das-open"
                      className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full bg-teal-600 text-white hover:bg-teal-500"
                    >
                      Abrir PGMEI
                    </button>
                  </div>
                </div>
              </MobileFullWidthSection>

              <MobileFullWidthSection
                contentClassName="mm-mobile-section-pad"
                withDivider={false}
                backgroundClassName="bg-zinc-50 dark:bg-zinc-900/40"
              >
                <div className="flex flex-col gap-3">
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
              </MobileFullWidthSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cnpjStatus = cnpj ? 'OK' : 'Pendente';
  const desktopSummarySection = (
    <div className="w-full px-4 sm:px-6 pt-6 relative z-10">
      <div className="mm-subheader w-full rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
        <div className="space-y-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <div className="h-8 w-8" aria-hidden="true" />
            <div className="min-w-0 text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Emissão DAS</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">PGMEI</p>
            </div>
            <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">CNPJ</p>
              <p className={`text-[12px] font-semibold ${cnpj ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                {cnpjStatus}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Imposto pago</p>
              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                R$ {formatCurrency(paidTaxTotal)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center pt-0.5">
            <button
              type="button"
              onClick={handleOpenPgmei}
              data-tour-anchor="das-open"
              className="mm-btn-base mm-btn-primary mm-btn-primary-teal min-w-[220px] px-5"
            >
              <ExternalLink size={15} />
              Abrir PGMEI
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter flex flex-col overflow-hidden">
      {desktopSummarySection}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-[var(--mm-content-gap)] flex-1 min-h-0 pb-0">
        <div className="bg-white dark:bg-[#151517] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 h-full min-h-0 flex flex-col">
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

          <div className="grid gap-3 text-sm text-zinc-500 dark:text-zinc-400 mt-6">
            <div>1) Copie o CNPJ acima.</div>
            <div>2) Abra o PGMEI e cole o CNPJ para continuar.</div>
            <div>3) Selecione o ano-calendário e gere a guia DAS.</div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DasView;
