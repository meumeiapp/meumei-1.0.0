import React from 'react';
import {
  Building2,
  Calendar,
  Check,
  Copy,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  X
} from 'lucide-react';
import type { CompanyInfo } from '../types';

interface CompanyDetailsSheetProps {
  company: CompanyInfo;
  onClose: () => void;
}

const CompanyDetailsSheet: React.FC<CompanyDetailsSheetProps> = ({ company, onClose }) => {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const formatISODate = (value: string) => {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    const cleanDay = day.split('T')[0];
    return `${cleanDay}/${month}/${year}`;
  };

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const InfoRow = ({
    icon,
    label,
    value,
    fieldName
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    fieldName: string;
  }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-white break-all">
            {value || <span className="text-zinc-500 italic">Não informado</span>}
          </p>
        </div>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => handleCopy(value, fieldName)}
          className="self-end sm:self-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-50 dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5"
        >
          {copiedField === fieldName ? (
            <>
              <Check size={14} className="text-emerald-500" />
              <span className="text-emerald-500">Copiado</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              Copiar
            </>
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/95 dark:bg-[#151517]/95 shadow-2xl backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 dark:border-zinc-800/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-indigo-600/10 text-indigo-500 flex items-center justify-center">
            <Building2 size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{company.name}</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Dados da empresa</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <InfoRow icon={<FileText size={18} />} label="CNPJ / Documento" value={company.cnpj} fieldName="cnpj" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoRow icon={<MapPin size={18} />} label="Endereço" value={company.address} fieldName="address" />
          <InfoRow
            icon={<Calendar size={18} />}
            label="Data de Abertura"
            value={formatISODate(company.startDate)}
            fieldName="startDate"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoRow icon={<Phone size={18} />} label="Telefone" value={company.phone} fieldName="phone" />
          <InfoRow icon={<Mail size={18} />} label="E-mail" value={company.email} fieldName="email" />
        </div>
        <InfoRow icon={<Globe size={18} />} label="Website" value={company.website} fieldName="website" />
      </div>
    </div>
  );
};

export default CompanyDetailsSheet;
