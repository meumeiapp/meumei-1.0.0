
// BUGFIX 2024-05-26: A tela de Configurações quebrava porque o usuário/licença ainda
// não estavam carregados quando o componente renderizava. Chamadas como
// resolvedCurrentUser.username disparavam ReferenceError. Agora
// resolvemos o usuário de forma defensiva via helper e só renderizamos a UI
// completa quando os dados essenciais estão prontos.
import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  AlertTriangle,
  Building2,
  Save,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  AlertOctagon,
  Calendar,
  Download
} from 'lucide-react';
import { CompanyInfo } from '../types';
import { debugLog } from '../utils/debug';
import { dataService } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { normalizeEmail } from '../utils/normalizeEmail';

type ConfigErrorStage = 'entitlement' | 'company' | 'timeout';

type ConfigErrorState = {
  stage: ConfigErrorStage;
  error: Error;
};

const createFriendlyError = (value: unknown, fallback: string): Error => {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  return new Error(fallback);
};

const LOADING_TIMEOUT_MS = 12_000;
const TIMEOUT_FALLBACK = 'Aguardamos demais e o carregamento expirou. Abra o console e copie os logs settings:* antes de recarregar.';

const getConfigErrorCopy = (state: ConfigErrorState) => {
  const code = (state.error as any)?.code;
  const message = state.error.message || 'Erro ao carregar o conteúdo.';

  if (state.stage === 'entitlement') {
    return {
      title: 'Entitlement não encontrado',
      description: 'Entitlement não localizado ou inválido. Verifique a compra e o email logado.',
      details: message
    };
  }

  if (state.stage === 'timeout') {
    return {
      title: 'Tempo limite atingido',
      description: 'Abra o console e copie os logs settings:* antes de recarregar.',
      details: message
    };
  }

  return {
    title: 'Não foi possível carregar as configurações.',
    description: 'Atualize a página para tentar novamente.',
    details: message
  };
};

interface SettingsProps {
  onBack: () => void;
  userId?: string;
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => Promise<void> | void;
  onSystemReset?: () => Promise<void> | void;
  onOpenInstall: () => void;
  isAppInstalled?: boolean;
}

const Settings: React.FC<SettingsProps> = ({ 
    onBack, 
    userId,
    companyInfo, 
    onUpdateCompany,
    onSystemReset,
    onOpenInstall,
    isAppInstalled
}) => {
  
  // Local state for editing company info
  const [editedInfo, setEditedInfo] = useState<CompanyInfo>(companyInfo);
  const [isSaved, setIsSaved] = useState(false);
  const companyFieldId = (suffix: string) => `settings-company-${suffix}`;
  const resetConfirmId = 'settings-reset-confirm';


  // System Reset State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const { user: firebaseUser } = useAuth();
  const normalizedSessionEmail = (() => {
      if (!firebaseUser?.email) return null;
      try {
          return normalizeEmail(firebaseUser.email);
      } catch (error) {
          console.warn('[Settings] normalizedSessionEmail failure', error);
          return null;
      }
  })();
  const [configErrorState, setConfigErrorState] = useState<ConfigErrorState | null>(null);
  const [isFetchingConfig, setIsFetchingConfig] = useState(false);

  const timeoutRef = useRef<number | null>(null);

  // Sync with prop if it changes externally (rare but safe)
  useEffect(() => {
      setEditedInfo(companyInfo);
  }, [companyInfo]);

  const reportConfigError = (stage: ConfigErrorStage, error: unknown) => {
      const fallback = stage === 'entitlement'
          ? 'Entitlement não encontrado para este usuário.'
          : 'Erro ao carregar os dados de configuração.';
      const normalizedError = createFriendlyError(error, fallback);
      console.error('[settings] load_error', {
          stage,
          message: normalizedError.message,
          code: (normalizedError as any)?.code || 'unknown'
      });
      setConfigErrorState({
          stage,
          error: normalizedError
      });
      if (stage === 'entitlement') {
          debugLog('settings:licenseid-missing', {
              email: normalizedSessionEmail,
              message: normalizedError.message
          });
      }
  };

useEffect(() => {
    if (!userId) {
        reportConfigError('entitlement', new Error('Usuário não informado. Aguarde o login.'));
        return;
    }

    let isActive = true;

    const clearLoadingTimeout = () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const startLoadingTimeout = () => {
        clearLoadingTimeout();
        timeoutRef.current = window.setTimeout(() => {
            setConfigErrorState(prev => {
                if (prev) return prev;
                return {
                    stage: 'timeout',
                    error: new Error(TIMEOUT_FALLBACK)
                };
            });
            debugLog('settings:licenseid-missing', {
                email: normalizedSessionEmail,
                reason: 'timeout'
            });
            setIsFetchingConfig(false);
        }, LOADING_TIMEOUT_MS);
    };

    const loadConfigFlow = async () => {
        setIsFetchingConfig(true);
        setConfigErrorState(null);
        startLoadingTimeout();
        debugLog('settings:loading-config', { userId });
        try {
            const latest = await dataService.getCompany(userId);
            if (!isActive) return;
            if (latest) {
                setEditedInfo(prev => ({
                    ...prev,
                    ...latest,
                    startDate: latest.startDate || prev.startDate
                }));
                setIsSaved(false);
            }
        } catch (companyError) {
            reportConfigError('company', companyError);
            return;
        }

        if (!isActive) return;
        clearLoadingTimeout();
        setIsFetchingConfig(false);
    };

    void loadConfigFlow();

    return () => {
        isActive = false;
        clearLoadingTimeout();
    };
}, [userId]);

  const attemptReload = () => {
      if (typeof window !== 'undefined') {
          window.location.reload();
      }
  };

  const renderErrorFallback = (state: ConfigErrorState) => {
      const copy = getConfigErrorCopy(state);
      return (
          <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter flex items-center justify-center px-4">
              <div className="max-w-3xl w-full rounded-3xl bg-white dark:bg-[#131315] border border-red-200 dark:border-red-700 shadow-lg p-8 space-y-4 text-center">
                  <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                      {copy.title}
                  </h1>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{copy.description}</p>
                  {copy.details && (
                      <p className="text-[0.8rem] text-zinc-500 dark:text-zinc-400 font-mono break-words">
                          {copy.details}
                      </p>
                  )}
                  <button
                      onClick={attemptReload}
                      className="mt-2 inline-flex items-center justify-center w-full rounded-xl border border-transparent bg-purple-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 focus:outline-none focus-visible:ring focus-visible:ring-purple-500/70"
                  >
                      Recarregar
                  </button>
                  <button
                      onClick={onBack}
                      className="inline-flex items-center justify-center w-full rounded-xl border border-zinc-300 bg-white/80 px-6 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring focus-visible:ring-purple-500/70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  >
                      Voltar
                  </button>
              </div>
          </div>
      );
  };

  if (configErrorState) {
      return renderErrorFallback(configErrorState);
  }

  const handleInputChange = (field: keyof CompanyInfo, value: string) => {
      setEditedInfo(prev => ({ ...prev, [field]: value }));
      setIsSaved(false); // Reset saved state on edit
  };

  const handleSaveCompany = async () => {
    if (!editedInfo.name.trim()) return;
    try {
        await onUpdateCompany(editedInfo);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
        console.error('Erro ao salvar dados da empresa', err);
    }
  };

  // --- System Reset Handlers ---
  const handleConfirmReset = async () => {
    const confirmation = resetConfirmText.trim().toUpperCase();
    if (confirmation !== 'RESET') {
        setResetError('Digite RESET para confirmar.');
        return;
    }
    if (!onSystemReset) return;
    setResetError('');
    setIsResetting(true);
    try {
        await onSystemReset();
        setIsResetModalOpen(false);
        setResetConfirmText('');
    } catch (error: any) {
        console.error('[reset] failed', { message: error?.message || error });
        setResetError('Falha ao resetar o sistema. Verifique o console.');
    } finally {
        setIsResetting(false);
    }
  };

  const openResetModal = () => {
    setResetConfirmText('');
    setResetError('');
    setIsResetModalOpen(true);
  };

  const canConfirmReset = resetConfirmText.trim().toUpperCase() === 'RESET';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2.5 rounded-xl bg-white dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors border border-zinc-200 dark:border-zinc-700/50 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Gerencie as preferências e dados do sistema</p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {isFetchingConfig && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-white/5 p-3 text-xs text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-widest">
                Carregando configurações em segundo plano...
            </div>
        )}
        {/* --- SECTION 2: ADMINISTRATION (Restricted) --- */}
        <div>
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider mb-4 ml-1 flex items-center gap-2">
                Administração
            </h3>

            <div className="space-y-6">
                    
                    {/* Company Management Card */}
                    <section className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm relative overflow-hidden">
                        {/* ... (Company Details Form Content same as before) ... */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 relative z-10 gap-4">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-500 shadow-inner">
                                    <Building2 size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Gestão da Empresa</h2>
                                    <p className="text-sm text-zinc-500">Dados cadastrais e informações do negócio.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                {isSaved && (
                                    <span className="text-emerald-500 font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-right-4 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                                        <CheckCircle2 size={18} fill="currentColor" className="text-emerald-500" /> 
                                        <span className="text-emerald-600 dark:text-emerald-400">Salvo!</span>
                                    </span>
                                )}
                                <button 
                                    onClick={handleSaveCompany}
                                    className={`px-5 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 shadow-lg w-full sm:w-auto justify-center ${isSaved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-700 hover:bg-zinc-800 dark:hover:bg-zinc-600'}`}
                                >
                                    <Save size={18} />
                                    <span>Salvar Alterações</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
                            {/* Company Form Fields */}
                            <div className="md:col-span-7 space-y-2">
                                <label htmlFor={companyFieldId('name')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <Building2 size={12} /> Nome da Empresa
                                </label>
                                <input 
                                    id={companyFieldId('name')}
                                    name="companyName"
                                    type="text" 
                                    value={editedInfo.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                            
                            <div className="md:col-span-5 space-y-2">
                                <label htmlFor={companyFieldId('start-date')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <Calendar size={12} /> Data de Abertura / Início
                                </label>
                                <div className="relative">
                                    <input 
                                        id={companyFieldId('start-date')}
                                        name="startDate"
                                        type="date" 
                                        value={editedInfo.startDate}
                                        readOnly
                                        disabled
                                        className="w-full bg-zinc-100 dark:bg-[#1f1f1f] border border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 cursor-not-allowed [color-scheme:dark]"
                                    />
                                    <Calendar className="absolute right-4 top-3 text-zinc-400 pointer-events-none" size={16} />
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                                    Definida automaticamente no primeiro acesso com a chave. Só é alterada ao resetar o sistema.
                                </p>
                            </div>

                             <div className="md:col-span-5 space-y-2">
                                <label htmlFor={companyFieldId('cnpj')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <FileText size={12} /> CNPJ / Documento
                                </label>
                                <input 
                                    id={companyFieldId('cnpj')}
                                    name="cnpj"
                                    type="text" 
                                    value={editedInfo.cnpj}
                                    onChange={(e) => handleInputChange('cnpj', e.target.value)}
                                    placeholder="00.000.000/0000-00"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                            <div className="md:col-span-7 space-y-2">
                                <label htmlFor={companyFieldId('address')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <MapPin size={12} /> Endereço Completo
                                </label>
                                <input 
                                    id={companyFieldId('address')}
                                    name="address"
                                    type="text" 
                                    value={editedInfo.address}
                                    onChange={(e) => handleInputChange('address', e.target.value)}
                                    placeholder="Rua Exemplo, 123 - Bairro - Cidade/UF"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                            <div className="md:col-span-4 space-y-2">
                                <label htmlFor={companyFieldId('zip')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <MapPin size={12} /> CEP
                                </label>
                                <input 
                                    id={companyFieldId('zip')}
                                    name="zipCode"
                                    type="text" 
                                    value={editedInfo.zipCode || ''}
                                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                                    placeholder="00000-000"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                            <div className="md:col-span-4 space-y-2">
                                <label htmlFor={companyFieldId('phone')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <Phone size={12} /> Telefone / WhatsApp
                                </label>
                                <input 
                                    id={companyFieldId('phone')}
                                    name="phone"
                                    type="text" 
                                    value={editedInfo.phone}
                                    onChange={(e) => handleInputChange('phone', e.target.value)}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                             <div className="md:col-span-4 space-y-2">
                                <label htmlFor={companyFieldId('email')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <Mail size={12} /> E-mail
                                </label>
                                <input 
                                    id={companyFieldId('email')}
                                    name="email"
                                    type="email" 
                                    value={editedInfo.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                    placeholder="contato@empresa.com"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                             <div className="md:col-span-12 space-y-2">
                                <label htmlFor={companyFieldId('website')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                                    <Globe size={12} /> Website
                                </label>
                                <input 
                                    id={companyFieldId('website')}
                                    name="website"
                                    type="text" 
                                    value={editedInfo.website}
                                    onChange={(e) => handleInputChange('website', e.target.value)}
                                    placeholder="www.site.com.br"
                                    className="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-zinc-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm relative overflow-hidden">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                                <Download size={22} />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Instalar app</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Tenha acesso rápido direto da sua tela inicial.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    console.info('[pwa][ui] install_click');
                                    onOpenInstall();
                                }}
                                disabled={isAppInstalled}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                                    isAppInstalled
                                        ? 'cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                                        : 'bg-emerald-500 text-zinc-900 hover:bg-emerald-400'
                                }`}
                            >
                                <Download size={16} />
                                Instalar
                            </button>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-6">
                        <section className="bg-white dark:bg-[#151517] rounded-2xl border border-red-100 dark:border-red-900/30 p-6 shadow-sm relative overflow-hidden flex flex-col">
                             <div className="absolute inset-y-0 right-0 w-24 opacity-5 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,#ef4444_8px,#ef4444_16px)] pointer-events-none"></div>
                            <div className="relative z-10 space-y-3 flex-1">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-red-100 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
                                        <AlertTriangle size={20} />
                                    </div>
                                    <h2 className="text-base font-bold text-red-700 dark:text-red-400">Zona de Perigo</h2>
                                </div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    Essa ação apagará <strong>TODOS</strong> os dados do sistema e não poderá ser desfeita.
                                </p>
                            </div>
                            <div className="relative z-10 flex justify-end mt-4">
                                <button 
                                    onClick={openResetModal}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                >
                                    <Trash2 size={16} /> Resetar Sistema
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
        </div>

      </main>

      {/* --- SYSTEM RESET SECURITY MODAL --- */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
             <div className="w-full max-w-md bg-[#1a1a1a] rounded-2xl shadow-2xl border border-red-900/50 p-0 overflow-hidden">
                {/* ... existing reset content ... */}
                <div className="bg-red-900/20 p-6 flex flex-col items-center justify-center text-center border-b border-red-900/30">
                     <div className="p-4 bg-red-500/10 rounded-full mb-3 animate-pulse">
                        <AlertOctagon size={48} className="text-red-500" />
                     </div>
                     <h2 className="text-2xl font-black text-red-500 uppercase tracking-tight">Zona de Perigo</h2>
                     <p className="text-red-300/70 text-sm mt-1">Esta ação é irreversível.</p>
                </div>

                <div className="p-6">
                    <div className="bg-red-950/30 rounded-lg p-4 mb-6 border border-red-900/30">
                        <p className="text-sm text-zinc-300">
                            Essa ação apagará <strong>TODOS</strong> os dados do sistema e não poderá ser desfeita.
                        </p>
                    </div>

                    <div className="space-y-2 mb-6">
                        <label htmlFor={resetConfirmId} className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                          Digite RESET para confirmar
                        </label>
                        <input
                            id={resetConfirmId}
                            name="resetConfirm"
                            type="text"
                            value={resetConfirmText}
                            onChange={(e) => setResetConfirmText(e.target.value)}
                            placeholder="RESET"
                            className="w-full bg-[#121212] border border-zinc-800 rounded-lg px-3 py-2.5 text-white focus:ring-1 focus:ring-red-500 outline-none"
                        />
                    </div>

                    {resetError && (
                        <div className="mb-4 text-center text-xs font-bold text-red-500 bg-red-950/50 py-2 rounded-lg border border-red-900/50">
                            {resetError}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsResetModalOpen(false)}
                            className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirmReset}
                            disabled={!canConfirmReset || isResetting}
                            className={`flex-[2] py-3 rounded-xl font-bold text-white transition-colors shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 text-sm ${
                                !canConfirmReset || isResetting
                                    ? 'bg-red-900/40 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            <Trash2 size={16} /> {isResetting ? 'RESETANDO...' : 'DELETAR TUDO AGORA'}
                        </button>
                    </div>
                </div>
             </div>
        </div>
      )}

    </div>
  );
};

export default Settings;
