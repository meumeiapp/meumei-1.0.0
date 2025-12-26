import React from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import type { InstallPromptMode } from '../hooks/usePwaInstallPrompt';

interface InstallAppModalProps {
  isOpen: boolean;
  isInstalled: boolean;
  mode: InstallPromptMode;
  onInstall: () => void;
  onClose: () => void;
}

const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  isInstalled,
  mode,
  onInstall,
  onClose
}) => {
  if (!isOpen) return null;

  const isInstallable = mode === 'installable';
  const isIos = mode === 'ios';
  const primaryLabel = isInstallable ? 'Instalar' : isIos ? 'Como instalar' : 'Instalacao indisponivel';
  const primaryDisabled = isInstalled || mode === 'unavailable';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#121214] shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
              {isIos ? <Smartphone size={22} /> : <Download size={22} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Instale seu app</h2>
              <p className="text-sm text-zinc-400">Tenha acesso rapido direto da sua tela inicial.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-full border border-transparent p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isInstalled && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              App ja instalado neste dispositivo.
            </div>
          )}

          {mode === 'ios' && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Como instalar no iOS</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>No Safari, toque em Compartilhar.</li>
                <li>Selecione "Adicionar a Tela de Inicio".</li>
                <li>Confirme em "Adicionar".</li>
              </ul>
            </div>
          )}

          {mode === 'unavailable' && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
              Instalacao nao disponivel neste navegador.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-800 px-6 py-5">
          <button
            type="button"
            onClick={onInstall}
            disabled={primaryDisabled}
            className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
              primaryDisabled
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                : 'bg-emerald-500 text-zinc-900 hover:bg-emerald-400'
            }`}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/60"
          >
            Agora nao
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppModal;
