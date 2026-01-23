import React, { useEffect, useState } from 'react';
import {
  Clock,
  FilePlus,
  Pencil,
  Trash2,
  TrendingUp,
  ShieldCheck,
  CircleDollarSign,
  X
} from 'lucide-react';
import { auditService, AuditLog, AuditEntityType } from '../services/auditService';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseId?: string | null;
  entityTypes?: AuditEntityType[];
}

const actionIconMap: Record<string, React.ElementType> = {
  account_created: FilePlus,
  account_edited: Pencil,
  balance_adjustment: CircleDollarSign,
  account_deleted: Trash2,
  expense_deleted: Trash2,
  income_deleted: Trash2,
  yield_added: TrendingUp,
  system_action: ShieldCheck
};

const getTimeLabel = (log: AuditLog) => {
  const timestamp = (log as any).timestamp;
  const date: Date | null = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const getDateLabel = () => {
  const today = new Date();
  return today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, onClose, licenseId, entityTypes }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filteredLogs = entityTypes?.length
    ? logs.filter(log => entityTypes.includes(log.entityType))
    : logs;

  useEffect(() => {
    if (!isOpen || !licenseId) return;
    let active = true;
    setLoading(true);
    setError(null);
    auditService
      .loadLogsForDate(licenseId, new Date())
      .then(items => {
        if (!active) return;
        setLogs(items);
      })
      .catch(err => {
        if (!active) return;
        setError((err as Error)?.message || 'Falha ao carregar auditoria.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, licenseId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111114] rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500/80 mb-2">Auditoria</p>
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">Ações do dia</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{getDateLabel()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Fechar auditoria"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="text-sm text-zinc-500">Carregando auditoria...</div>
          )}

          {!loading && error && (
            <div className="text-sm text-red-500">{error}</div>
          )}

          {!loading && !error && filteredLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center text-zinc-500 py-10">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Clock size={20} className="text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Nenhuma ação registrada hoje.</p>
              <p className="text-xs text-zinc-400 mt-1">As ações relevantes aparecerão aqui automaticamente.</p>
            </div>
          )}

          {!loading && !error && filteredLogs.map(log => {
            const Icon = actionIconMap[log.actionType] || Clock;
            return (
              <div key={log.id} className="flex items-start gap-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-indigo-500 shrink-0">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{log.description}</p>
                    <span className="text-xs text-zinc-400">{getTimeLabel(log)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-2">
                    <span className="uppercase tracking-wide">{log.entityType}</span>
                    {log.userEmail && (
                      <span className="text-zinc-400">• {log.userEmail}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AuditLogModal;
