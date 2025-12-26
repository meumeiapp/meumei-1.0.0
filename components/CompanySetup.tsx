
import React, { useState } from 'react';
import { Calendar, Info, ArrowRight, AlertCircle, Building2 } from 'lucide-react';
import { COMPANY_DATA } from '../constants';

interface CompanySetupProps {
  onConfirm: (data: { companyName: string; startDate: string }) => void;
}

const CompanySetup: React.FC<CompanySetupProps> = ({ onConfirm }) => {
  // Default to the 1st of the month so the user can track the whole month
  const [startDate, setStartDate] = useState(COMPANY_DATA.monthStartISO);
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setStartDate(newDate);
    
    // Simple validation
    if (newDate < COMPANY_DATA.monthStartISO) {
        setError('A data não pode ser anterior ao mês atual.');
    } else {
        setError('');
    }
  };

  const handleSubmit = () => {
      if (!companyName.trim()) {
          setError('Por favor, insira o nome da empresa.');
          return;
      }
      if (startDate < COMPANY_DATA.monthStartISO) {
          setError('Selecione uma data igual ou posterior a 01/11/2025.');
          return;
      }
      onConfirm({ companyName, startDate });
  };

  const isFormValid = companyName.trim().length > 0 && !error;

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-white p-4">
      <div className="w-full max-w-[550px] bg-[#1a1a1a] rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 animate-in fade-in zoom-in duration-300">
        
        {/* Header Section */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
            <div className="relative z-10 flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm shadow-inner">
                    <Calendar className="text-white" size={28} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Configuração Inicial</h2>
                    <p className="text-indigo-100 text-sm font-medium opacity-90">
                        Vamos configurar os dados do seu negócio
                    </p>
                </div>
            </div>
        </div>

        {/* Content Section */}
        <div className="p-8 space-y-8">
            
            {/* Info Alert */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 flex gap-4">
                <Info className="text-blue-400 shrink-0 mt-0.5" size={20} />
                <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-blue-400">Mês de Referência: Novembro</h3>
                    <p className="text-sm text-blue-200/80 leading-relaxed">
                        Como o mês já iniciou, sugerimos definir a data de abertura como <strong>01/11/2025</strong>. 
                        Assim você poderá registrar todas as movimentações financeiras que já ocorreram neste mês.
                    </p>
                </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
                
                {/* Company Name Input */}
                <div className="space-y-3">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide ml-1 flex items-center gap-2">
                        <Building2 size={14} />
                        Nome da Empresa
                    </label>
                    <input
                        type="text"
                        placeholder="Ex: Consultoria Silva, Doces da Maria..."
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-[#121212] text-zinc-200 border border-zinc-700 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-zinc-600 transition-all duration-200"
                    />
                </div>

                {/* Date Input */}
                <div className="space-y-3">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide ml-1">
                        Data de Abertura / Início dos Lançamentos
                    </label>
                    <div className="relative group">
                        <input
                            type="date"
                            value={startDate}
                            min={COMPANY_DATA.monthStartISO}
                            max={COMPANY_DATA.monthEndISO}
                            onChange={handleDateChange}
                            // [color-scheme:dark] ensures the native browser picker is dark
                            className="w-full bg-[#121212] text-zinc-200 border border-zinc-700 rounded-lg px-4 py-4 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-zinc-600 transition-all duration-200 [color-scheme:dark]"
                        />
                    </div>
                    {error ? (
                         <div className="flex items-center gap-2 text-red-400 text-xs ml-1 font-medium mt-2 animate-pulse">
                            <AlertCircle size={12} />
                            {error}
                         </div>
                    ) : (
                        <p className="text-xs text-zinc-500 ml-1 font-medium">
                            Selecione uma data a partir de 01/11/2025
                        </p>
                    )}
                </div>
            </div>

            {/* Footer Action */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSubmit}
                    disabled={!isFormValid}
                    className={`bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 shadow-lg shadow-purple-900/30 flex items-center gap-2 text-sm transform ${!isFormValid ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] active:scale-[0.98]'}`}
                >
                    Confirmar e Continuar
                    <ArrowRight size={16} />
                </button>
            </div>

        </div>
      </div>
    </div>
  );
};

export default CompanySetup;
