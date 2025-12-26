import React from 'react';
import { 
  ArrowLeft, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Calendar, 
  FileText,
  Copy,
  Check
} from 'lucide-react';
import { CompanyInfo } from '../types';

interface CompanyDetailsViewProps {
  onBack: () => void;
  company: CompanyInfo;
}

const CompanyDetailsView: React.FC<CompanyDetailsViewProps> = ({ onBack, company }) => {
  
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const InfoRow = ({ icon, label, value, fieldName }: { icon: React.ReactNode, label: string, value: string, fieldName: string }) => (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-colors group">
          <div className="flex items-center gap-4 mb-2 sm:mb-0">
              <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-500 transition-colors">
                  {icon}
              </div>
              <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white break-all">
                      {value || <span className="text-zinc-500 italic">Não informado</span>}
                  </p>
              </div>
          </div>
          
          {value && (
            <button 
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
        
        {/* Header Spacer for global header overlap */}
        <div className="pt-8 max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
            <button 
                onClick={onBack}
                className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={16} /> Voltar
            </button>

            <div className="bg-white dark:bg-[#151517] rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
                
                {/* Visual Header */}
                <div className="h-32 bg-gradient-to-r from-slate-900 to-slate-800 relative">
                    <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                </div>

                {/* Content */}
                <div className="px-8 pb-8 -mt-12 relative z-10">
                    
                    {/* Company Icon */}
                    <div className="w-24 h-24 bg-white dark:bg-[#151517] rounded-2xl shadow-2xl p-2 mb-6">
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white">
                            <Building2 size={40} />
                        </div>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{company.name}</h1>
                        <p className="text-zinc-500 dark:text-zinc-400">Dados cadastrais da empresa</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <InfoRow 
                            icon={<FileText size={20} />} 
                            label="CNPJ / Documento" 
                            value={company.cnpj}
                            fieldName="cnpj"
                        />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoRow 
                                icon={<MapPin size={20} />} 
                                label="Endereço" 
                                value={company.address}
                                fieldName="address"
                            />
                            <InfoRow 
                                icon={<Calendar size={20} />} 
                                label="Data de Abertura" 
                                value={new Date(company.startDate).toLocaleDateString('pt-BR')}
                                fieldName="startDate"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoRow 
                                icon={<Phone size={20} />} 
                                label="Telefone / WhatsApp" 
                                value={company.phone}
                                fieldName="phone"
                            />
                            <InfoRow 
                                icon={<Mail size={20} />} 
                                label="E-mail" 
                                value={company.email}
                                fieldName="email"
                            />
                        </div>

                        <InfoRow 
                            icon={<Globe size={20} />} 
                            label="Website" 
                            value={company.website}
                            fieldName="website"
                        />
                    </div>

                </div>
            </div>
        </div>
    </div>
  );
};

export default CompanyDetailsView;