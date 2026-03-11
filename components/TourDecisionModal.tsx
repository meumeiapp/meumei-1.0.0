import React from 'react';
import { Compass, X } from 'lucide-react';

interface TourDecisionModalProps {
  isOpen: boolean;
  companyName: string;
  onAccept: () => void;
  onDecline: () => void;
}

const TourDecisionModal: React.FC<TourDecisionModalProps> = ({
  isOpen,
  companyName,
  onAccept,
  onDecline
}) => {
  if (!isOpen) return null;

  const resolvedCompanyName = companyName.trim() || 'Sua empresa';

  return (
    <div className="fixed inset-0 z-[91] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#121214] shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
              <Compass size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tour guiado inicial</h2>
              <p className="text-sm text-zinc-400">Vamos apresentar o fluxo principal do meumei.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onDecline}
            className="rounded-full border border-transparent p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Confirmação</p>
            <p>
              <span className="font-semibold text-white">{resolvedCompanyName}</span>, deseja iniciar o tour guiado agora?
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            O tour apresenta o fluxo essencial do app e você pode encerrar a qualquer momento.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-800 px-6 py-5">
          <button
            type="button"
            onClick={onAccept}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Sim, iniciar tour
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/60"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
};

export default TourDecisionModal;
