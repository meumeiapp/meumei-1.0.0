
// BUGFIX 2024-05-26: A tela de Configurações quebrava porque o usuário/licença ainda
// não estavam carregados quando o componente renderizava. Chamadas como
// resolvedCurrentUser.username disparavam ReferenceError. Agora
// resolvemos o usuário de forma defensiva via helper e só renderizamos a UI
// completa quando os dados essenciais estão prontos.
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronDown,
  Download,
  Lightbulb,
  Sprout,
  Keyboard,
  Bell,
  Bug
} from 'lucide-react';
import { CompanyInfo } from '../types';
import { debugLog } from '../utils/debug';
import { dataService } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { normalizeEmail } from '../utils/normalizeEmail';
import useIsMobile from '../hooks/useIsMobile';
import { notificationsService } from '../services/notificationsService';

type ConfigErrorStage = 'entitlement' | 'company' | 'timeout';

type ConfigErrorState = {
  stage: ConfigErrorStage;
  error: Error;
};

type SettingsSectionId =
  | 'company'
  | 'install'
  | 'feedback'
  | 'notifications'
  | 'tips'
  | 'shortcuts'
  | 'danger';

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

const SettingsSection: React.FC<{
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
  collapsible?: boolean;
}> = ({ label, collapsed, onToggle, className, children, collapsible = true }) => {
  const isCollapsed = collapsible && collapsed;
  const toggleLabel = isCollapsed ? `Expandir ${label}` : `Recolher ${label}`;
  return (
    <section
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-6 shadow-sm relative overflow-hidden ${className || ''}`}
    >
      {collapsible && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-md transition hover:bg-indigo-500 hover:border-indigo-300 dark:border-indigo-400/40 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
          >
            <ChevronDown size={16} className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          className="w-full rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/80 dark:bg-white/5 px-4 py-3 text-left transition hover:border-indigo-200 dark:hover:border-indigo-500/40"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-400">Recolhido</p>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Clique para expandir</span>
          </div>
        </button>
      ) : (
        children
      )}
    </section>
  );
};

interface SettingsProps {
  onBack: () => void;
  userId?: string;
  isMasterUser?: boolean;
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => Promise<void> | void;
  onSystemReset?: () => Promise<{ deletedDocsCount: number } | null> | void;
  onOpenInstall: () => void;
  isAppInstalled?: boolean;
  tipsEnabled?: boolean;
  onUpdateTipsEnabled?: (enabled: boolean) => void;
  appVersion?: string;
}

const Settings: React.FC<SettingsProps> = ({ 
    onBack, 
    userId,
    isMasterUser = false,
    companyInfo, 
    onUpdateCompany,
    onSystemReset,
    onOpenInstall,
    isAppInstalled,
    tipsEnabled,
    onUpdateTipsEnabled,
    appVersion
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
  const [resetKeyTurned, setResetKeyTurned] = useState(false);
  const [resetTermsAccepted, setResetTermsAccepted] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const [resetEstimatedDeleted, setResetEstimatedDeleted] = useState(0);
  const [resetDeletedCount, setResetDeletedCount] = useState<number | null>(null);
  const [resetPhase, setResetPhase] = useState<'idle' | 'countdown' | 'matrix' | 'result'>('idle');
  const [matrixStartedAt, setMatrixStartedAt] = useState<number | null>(null);
  const [matrixText, setMatrixText] = useState('');
  const [matrixFlashActive, setMatrixFlashActive] = useState(false);
  const [boomActive, setBoomActive] = useState(false);
  const matrixAudioRef = useRef<{
      ctx: AudioContext;
      osc: OscillatorNode;
      gain: GainNode;
      clickTimer?: number;
  } | null>(null);
  const boomPlayedRef = useRef(false);

  const { user: firebaseUser, logout } = useAuth();
  const isMobile = useIsMobile();
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
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<SettingsSectionId, boolean>>>(() => ({
      company: true,
      install: true,
      feedback: true,
      notifications: true,
      tips: true,
      shortcuts: true,
      danger: true
  }));
  const [notificationsEnabled, setNotificationsEnabled] = useState(
      notificationsService.getLocalEnabled()
  );
  const [notificationsPermission, setNotificationsPermission] = useState<
      NotificationPermission | 'unsupported'
  >('unsupported');
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [testNotificationStatus, setTestNotificationStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [feedbackType, setFeedbackType] = useState<'bug' | 'improvement'>('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{
      tone: 'idle' | 'success' | 'error';
      message: string;
  }>({ tone: 'idle', message: '' });
  const resolvedTipsEnabled = typeof tipsEnabled === 'boolean' ? tipsEnabled : true;
  const actionButtonBase =
      'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition h-10 w-full sm:w-48 whitespace-nowrap';
  const shortcutGroups = useMemo(() => {
      const quickAccessLabel = 'Navegar pelos botões do Acesso Rápido (do Início até Agenda, em ciclo).';

      return [
          {
              id: 'quick_access',
              title: 'Acesso Rápido (← / →)',
              description: 'Funciona quando nenhum campo de texto estiver ativo.',
              layout: 'list',
              items: [
                  { key: '← / →', label: quickAccessLabel }
              ]
          },
          {
              id: 'navigation',
              title: 'Busca e navegação',
              description: 'Atalhos gerais para navegar mais rápido.',
              layout: 'list',
              items: [
                  { key: 'Setas ↑/↓', label: 'Navegar pelos resultados da busca.' },
                  { key: 'Enter', label: 'Abrir o item selecionado na busca.' },
                  { key: 'ESC', label: 'Fechar modais e voltar para a tela anterior.' },
                  { key: 'Enter (Ajudante)', label: 'Enviar pergunta no modo Ajudante.' }
              ]
          }
      ];
  }, [isMobile]);
  const isSectionCollapsed = (id: SettingsSectionId) => Boolean(collapsedSections[id]);
  const toggleSection = (id: SettingsSectionId) => {
      setCollapsedSections((prev) => ({
          ...prev,
          [id]: !prev[id]
      }));
  };
  const timeoutRef = useRef<number | null>(null);
  const matrixCharset = useMemo(() => '01MEUMEI-SYSTEM-REBOOT::', []);
  const setupMatrixAudio = () => {
      if (typeof window === 'undefined') return;
      if (matrixAudioRef.current) return;
      try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = 420;
          gain.gain.value = 0.02;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          ctx.resume?.();
          matrixAudioRef.current = { ctx, osc, gain };
      } catch (error) {
          console.warn('[matrix] audio_unavailable');
      }
  };

  const playBoomSound = () => {
      if (typeof window === 'undefined') return;
      try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(70, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(18, ctx.currentTime + 1.6);
          gain.gain.setValueAtTime(0.0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.95, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();

          const bufferSize = Math.floor(ctx.sampleRate * 1.8);
          const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i += 1) {
              data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
          }
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;
          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.0, ctx.currentTime);
          noiseGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.03);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.2);
          noise.connect(noiseGain);
          noiseGain.connect(ctx.destination);
          noise.start();

          ctx.resume?.();
          window.setTimeout(() => {
              try {
                  osc.stop();
                  noise.stop();
                  ctx.close();
              } catch {
                  // ignore
              }
          }, 3000);
      } catch {
          console.warn('[matrix] boom_unavailable');
      }
  };

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

  useEffect(() => {
      if (!isMobile) return;
      if (typeof window === 'undefined' || !('Notification' in window)) {
          setNotificationsPermission('unsupported');
          return;
      }
      setNotificationsPermission(Notification.permission);
  }, [isMobile]);

  useEffect(() => {
      if (!isMobile || !userId) return;
      let active = true;
      notificationsService
          .getSettings(userId)
          .then((settings) => {
              if (!active) return;
              if (typeof settings.enabled === 'boolean') {
                  setNotificationsEnabled(settings.enabled);
              }
          })
          .catch((error) => {
              console.warn('[push] settings load failed', error);
          });
      return () => {
          active = false;
      };
  }, [isMobile, userId]);

  const attemptReload = () => {
      if (typeof window !== 'undefined') {
          window.location.reload();
      }
  };

  const renderErrorFallback = (state: ConfigErrorState) => {
      const copy = getConfigErrorCopy(state);
      return (
          <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter flex items-center justify-center px-4">
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

  const handleEnableNotifications = async () => {
    if (!userId) return;
    setNotificationsBusy(true);
    setNotificationsError('');
    setTestNotificationStatus('idle');
    try {
        await notificationsService.enable(userId);
        setNotificationsEnabled(true);
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotificationsPermission(Notification.permission);
        }
    } catch (error: any) {
        setNotificationsError(error?.message || 'Falha ao ativar notificações.');
    } finally {
        setNotificationsBusy(false);
    }
  };

  const handleDisableNotifications = async () => {
    if (!userId) return;
    setNotificationsBusy(true);
    setNotificationsError('');
    setTestNotificationStatus('idle');
    try {
        await notificationsService.disable(userId);
        setNotificationsEnabled(false);
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotificationsPermission(Notification.permission);
        }
    } catch (error: any) {
        setNotificationsError(error?.message || 'Falha ao desativar notificações.');
    } finally {
        setNotificationsBusy(false);
    }
  };

  const handleSendTestNotification = async () => {
    setTestNotificationStatus('sending');
    setNotificationsError('');
    try {
        await notificationsService.sendTestNotification();
        setTestNotificationStatus('sent');
    } catch (error: any) {
        setTestNotificationStatus('error');
        setNotificationsError(error?.message || 'Falha ao enviar notificação de teste.');
    }
  };

  const handleSubmitFeedback = async () => {
      const trimmed = feedbackMessage.trim();
      if (!userId) {
          setFeedbackStatus({
              tone: 'error',
              message: 'Usuário não identificado. Entre novamente para enviar.'
          });
          return;
      }
      if (!trimmed) {
          setFeedbackStatus({
              tone: 'error',
              message: 'Descreva o bug ou melhoria antes de enviar.'
          });
          return;
      }

      setFeedbackBusy(true);
      setFeedbackStatus({ tone: 'idle', message: '' });
      try {
          const feedbackId = await dataService.submitUserFeedback(userId, {
              type: feedbackType,
              message: trimmed,
              platform: isMobile ? 'mobile' : 'desktop',
              appVersion: appVersion || '',
              reporterEmail: firebaseUser?.email || null,
              companyName: companyInfo.name || null
          });
          if (!feedbackId) {
              setFeedbackStatus({
                  tone: 'error',
                  message: 'Não foi possível enviar agora. Tente novamente.'
              });
              return;
          }
          setFeedbackMessage('');
          setFeedbackStatus({
              tone: 'success',
              message: 'Mensagem enviada ao painel de controle.'
          });
      } catch (error: any) {
          setFeedbackStatus({
              tone: 'error',
              message: error?.message || 'Falha ao enviar mensagem.'
          });
      } finally {
          setFeedbackBusy(false);
      }
  };

  // --- System Reset Handlers ---
  const handleConfirmReset = async () => {
    if (isMobile) return;
    const confirmation = resetConfirmText.trim().toUpperCase();
    const ready = resetKeyTurned && resetTermsAccepted && resetArmed && confirmation === 'RESET';
    if (!ready) {
        setResetError('Complete o protocolo de lançamento antes de continuar.');
        return;
    }
    if (!onSystemReset) return;
    setResetError('');
    setIsResetting(true);
    setResetCountdown(10);
    setResetEstimatedDeleted(Math.floor(1200 + Math.random() * 2600));
    setResetDeletedCount(null);
    setResetPhase('countdown');
    setMatrixStartedAt(null);
    boomPlayedRef.current = false;
    setBoomActive(false);
    try {
        const result = await onSystemReset();
        if (result && typeof result.deletedDocsCount === 'number') {
            setResetDeletedCount(result.deletedDocsCount);
        }
        setResetConfirmText('');
    } catch (error: any) {
        console.error('[reset] failed', { message: error?.message || error });
        setResetError('Falha ao resetar o sistema. Verifique o console.');
    } finally {
        setIsResetting(false);
    }
  };

  const openResetModal = () => {
    if (isMobile) return;
    setResetConfirmText('');
    setResetError('');
    setResetKeyTurned(false);
    setResetTermsAccepted(false);
    setResetArmed(false);
    setResetCountdown(null);
    setResetEstimatedDeleted(0);
    setResetDeletedCount(null);
    setResetPhase('idle');
    setMatrixStartedAt(null);
    boomPlayedRef.current = false;
    setBoomActive(false);
    setIsResetModalOpen(true);
  };

  const canConfirmReset = resetConfirmText.trim().toUpperCase() === 'RESET';

  useEffect(() => {
      if (resetPhase !== 'countdown' || resetCountdown === null) return;
      if (resetCountdown <= 1) {
          setResetCountdown(1);
          if (!boomPlayedRef.current) {
              playBoomSound();
              boomPlayedRef.current = true;
              setBoomActive(true);
              window.setTimeout(() => setBoomActive(false), 1200);
          }
          setResetPhase('matrix');
          setMatrixStartedAt(Date.now());
          return;
      }
      const timer = window.setTimeout(() => {
          setResetCountdown(prev => (prev === null ? prev : Math.max(prev - 1, 1)));
      }, 1000);
      return () => window.clearTimeout(timer);
  }, [resetCountdown, resetPhase]);

  useEffect(() => {
      if (resetPhase !== 'matrix') return;
      const startedAt = matrixStartedAt ?? Date.now();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(3000 - elapsed, 0);
      const timer = window.setTimeout(() => {
          setResetPhase('result');
      }, remaining);
      return () => window.clearTimeout(timer);
  }, [matrixStartedAt, resetPhase]);

  useEffect(() => {
      if (resetPhase !== 'matrix') return;
      setMatrixFlashActive(true);
      const flashTimer = window.setTimeout(() => {
          setMatrixFlashActive(false);
      }, 1600);
      let active = true;
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const height = typeof window !== 'undefined' ? window.innerHeight : 800;
      const lineLength = Math.max(60, Math.floor(width / 10));
      const maxLines = Math.max(24, Math.floor(height / 14));
      const buildLine = () =>
          Array.from({ length: lineLength }, () => matrixCharset[Math.floor(Math.random() * matrixCharset.length)]).join('');
      let line = '';
      let lines: string[] = Array.from({ length: Math.floor(maxLines / 2) }, buildLine);

      const tick = () => {
          if (!active) return;
          const char = matrixCharset[Math.floor(Math.random() * matrixCharset.length)];
          line += char;
          if (line.length >= lineLength) {
              lines.push(line);
              line = '';
          }
          const visible = lines.slice(-maxLines);
          const paddedLine = line.padEnd(lineLength, ' ');
          setMatrixText([...visible, paddedLine].join('\n'));
      };

      const interval = window.setInterval(tick, 28);
      return () => {
          active = false;
          window.clearInterval(interval);
          setMatrixText('');
          window.clearTimeout(flashTimer);
          setMatrixFlashActive(false);
      };
  }, [matrixCharset, resetPhase]);

  useEffect(() => {
      if (resetPhase !== 'matrix') return;
      if (typeof window === 'undefined') return;
      return () => {
          const currentAudio = matrixAudioRef.current;
          if (!currentAudio) return;
          if (currentAudio.clickTimer) {
              window.clearInterval(currentAudio.clickTimer);
          }
          try {
              const { ctx, gain, osc } = currentAudio;
              gain.gain.cancelScheduledValues(ctx.currentTime);
              gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
              window.setTimeout(() => {
                  try {
                      osc.stop();
                      ctx.close();
                  } catch {
                      // ignore
                  }
                  matrixAudioRef.current = null;
              }, 200);
          } catch {
              matrixAudioRef.current = null;
          }
      };
  }, [resetPhase]);

  return (
    <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      
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
        <div>
            <div className="space-y-6">
                    
                    {/* Company Management Card */}
                    {!isMobile && (
                    <SettingsSection
                        label="Gestão da Empresa"
                        collapsed={isSectionCollapsed('company')}
                        onToggle={() => toggleSection('company')}
                    >
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
                                    className={`${actionButtonBase} ${
                                        isSaved
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                            : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600'
                                    }`}
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
                    </SettingsSection>
                    )}

                    <SettingsSection
                        label="Instalar app"
                        collapsed={isMobile ? false : isSectionCollapsed('install')}
                        onToggle={() => toggleSection('install')}
                        collapsible={!isMobile}
                    >
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
                                className={`${actionButtonBase} ${
                                    isAppInstalled
                                        ? 'cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                                        : 'bg-emerald-500 text-zinc-900 hover:bg-emerald-400'
                                }`}
                            >
                                <Download size={16} />
                                Instalar
                            </button>
                        </div>
                    </SettingsSection>

                    {!isMasterUser && (
                    <SettingsSection
                        label="Reportar bug ou melhoria"
                        collapsed={isMobile ? false : isSectionCollapsed('feedback')}
                        onToggle={() => toggleSection('feedback')}
                        collapsible={!isMobile}
                    >
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-sky-100 dark:bg-sky-900/20 rounded-xl text-sky-600 dark:text-sky-300">
                                {feedbackType === 'bug' ? <Bug size={22} /> : <Lightbulb size={22} />}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                                    Reportar bug ou melhoria
                                </h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Sua mensagem será analisada pela nossa equipe.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setFeedbackType('bug')}
                                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                                    feedbackType === 'bug'
                                        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
                                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                                }`}
                            >
                                Bug
                            </button>
                            <button
                                type="button"
                                onClick={() => setFeedbackType('improvement')}
                                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                                    feedbackType === 'improvement'
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
                                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                                }`}
                            >
                                Melhoria
                            </button>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Até 2000 caracteres
                            </span>
                        </div>
                        <div className="mt-3">
                            <textarea
                                value={feedbackMessage}
                                onChange={(event) => setFeedbackMessage(event.target.value.slice(0, 2000))}
                                placeholder={
                                    feedbackType === 'bug'
                                        ? 'Descreva o problema, onde aconteceu e como reproduzir.'
                                        : 'Descreva a melhoria e o impacto esperado.'
                                }
                                className="w-full min-h-[120px] resize-y rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#1a1a1a] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                            />
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {feedbackMessage.length}/2000
                                </span>
                                <button
                                    type="button"
                                    onClick={handleSubmitFeedback}
                                    disabled={feedbackBusy}
                                    className={`${actionButtonBase} ${
                                        feedbackType === 'bug'
                                            ? 'bg-rose-600 text-white hover:bg-rose-500'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                    } ${feedbackBusy ? 'cursor-not-allowed opacity-70' : ''}`}
                                >
                                    {feedbackBusy ? 'Enviando...' : 'Enviar mensagem'}
                                </button>
                            </div>
                            {feedbackStatus.message && (
                                <div
                                    className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
                                        feedbackStatus.tone === 'success'
                                            ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                            : 'border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                                    }`}
                                >
                                    {feedbackStatus.message}
                                </div>
                            )}
                        </div>
                    </SettingsSection>
                    )}

                    {isMobile && (
                        <SettingsSection
                            label="Notificações"
                            collapsed={false}
                            onToggle={() => toggleSection('notifications')}
                            collapsible={false}
                        >
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-violet-100 dark:bg-violet-900/20 rounded-xl text-violet-600 dark:text-violet-300">
                                    <Bell size={22} />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                                        Notificações no celular
                                    </h2>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                        Receba avisos importantes diretamente na tela do seu dispositivo.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 space-y-3 text-xs text-zinc-500 dark:text-zinc-400">
                                {notificationsError && (
                                    <div className="rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">
                                        {notificationsError}
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (notificationsBusy) return;
                                        if (notificationsEnabled) return;
                                        if (notificationsPermission === 'denied' || notificationsPermission === 'unsupported') {
                                            return;
                                        }
                                        handleEnableNotifications();
                                    }}
                                    disabled={
                                        notificationsBusy ||
                                        notificationsPermission === 'denied' ||
                                        notificationsPermission === 'unsupported'
                                    }
                                    className={`${actionButtonBase} ${
                                        notificationsBusy
                                            ? 'bg-zinc-500 text-white'
                                            : notificationsEnabled
                                            ? 'bg-emerald-600 text-white'
                                            : notificationsPermission === 'default'
                                            ? 'bg-amber-500 text-zinc-900'
                                            : notificationsPermission === 'denied'
                                            ? 'bg-rose-600 text-white'
                                            : notificationsPermission === 'unsupported'
                                            ? 'bg-zinc-400 text-white'
                                            : 'bg-rose-600 text-white'
                                    } ${
                                        notificationsPermission === 'denied' ||
                                        notificationsPermission === 'unsupported'
                                            ? 'cursor-not-allowed opacity-70'
                                            : ''
                                    }`}
                                >
                                    {notificationsBusy
                                        ? 'Processando...'
                                        : notificationsEnabled
                                        ? 'Notificações ativas'
                                        : notificationsPermission === 'default'
                                        ? 'Permissão pendente'
                                        : notificationsPermission === 'denied'
                                        ? 'Permissão bloqueada'
                                        : notificationsPermission === 'unsupported'
                                        ? 'Notificações indisponíveis'
                                        : 'Notificações desligadas'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDisableNotifications}
                                    disabled={notificationsBusy || !notificationsEnabled}
                                    className={`${actionButtonBase} bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${
                                        !notificationsEnabled ? 'cursor-not-allowed opacity-60' : ''
                                    }`}
                                >
                                    {notificationsBusy ? 'Processando...' : 'Desativar'}
                                </button>
                            </div>
                            <div className="mt-3 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={handleSendTestNotification}
                                    disabled={!notificationsEnabled || notificationsBusy}
                                    className={`${actionButtonBase} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 ${
                                        !notificationsEnabled ? 'cursor-not-allowed opacity-60' : ''
                                    }`}
                                >
                                    {testNotificationStatus === 'sending'
                                        ? 'Enviando...'
                                        : testNotificationStatus === 'sent'
                                        ? 'Notificação enviada'
                                        : 'Testar notificação'}
                                </button>
                            </div>
                        </SettingsSection>
                    )}

                    {!isMobile && (
                    <SettingsSection
                        label="Dicas do meumei"
                        collapsed={isSectionCollapsed('tips')}
                        onToggle={() => toggleSection('tips')}
                    >
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-300">
                                <Lightbulb size={22} />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Dicas do meumei</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Ative ou desative os balões de dicas que aparecem no dashboard.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                {resolvedTipsEnabled ? 'Dicas ativas' : 'Dicas desativadas'}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!onUpdateTipsEnabled) return;
                                    const next = !resolvedTipsEnabled;
                                    console.info('[tips] toggle', { enabled: next });
                                    onUpdateTipsEnabled(next);
                                }}
                                disabled={!onUpdateTipsEnabled}
                                className={`${actionButtonBase} ${
                                    resolvedTipsEnabled
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                                } ${!onUpdateTipsEnabled ? 'cursor-not-allowed opacity-70' : ''}`}
                                aria-pressed={resolvedTipsEnabled}
                            >
                                {resolvedTipsEnabled ? 'Desativar dicas' : 'Ativar dicas'}
                            </button>
                        </div>
                    </SettingsSection>
                    )}

                    {!isMobile && (
                    <SettingsSection
                        label="Atalhos do teclado"
                        collapsed={isSectionCollapsed('shortcuts')}
                        onToggle={() => toggleSection('shortcuts')}
                    >
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-sky-100 dark:bg-sky-900/20 rounded-xl text-sky-600 dark:text-sky-300">
                                <Keyboard size={22} />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Atalhos do teclado</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Use atalhos para navegar mais rápido sem tirar as mãos do teclado.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {shortcutGroups.map((group) => (
                                <div
                                    key={group.id}
                                    className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4"
                                >
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{group.title}</p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{group.description}</p>
                                    </div>
                                    <div
                                        className={`mt-3 ${
                                            group.layout === 'grid'
                                                ? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
                                                : 'space-y-2'
                                        }`}
                                    >
                                        {group.items.map((item) => (
                                            <div
                                                key={`${group.id}-${item.key}`}
                                                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2"
                                            >
                                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                                    {item.key}
                                                </span>
                                                <span className="text-xs text-zinc-600 dark:text-zinc-300 text-right">
                                                    {item.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsSection>
                    )}

                    {!isMobile && (
                        <div className="grid grid-cols-1 gap-6">
                            <SettingsSection
                                label="Zona de Perigo"
                                collapsed={isSectionCollapsed('danger')}
                                onToggle={() => toggleSection('danger')}
                                className="border-red-100 dark:border-red-900/30 flex flex-col"
                                collapsible
                            >
                                <div className="absolute inset-y-0 right-0 w-24 opacity-5 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,#ef4444_8px,#ef4444_16px)] pointer-events-none"></div>
                                <div className="relative z-10 space-y-3 flex-1">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-red-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                                        <AlertTriangle size={12} />
                                        Ação Irreversível
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-red-100 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
                                            <AlertTriangle size={20} />
                                        </div>
                                        <h2 className="text-base font-bold text-red-700 dark:text-red-400">Zona de Perigo</h2>
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                        Essa ação apagará <strong>TODOS</strong> os dados do sistema e não poderá ser desfeita.
                                    </p>
                                    <p className="text-xs font-semibold text-red-600 dark:text-red-300">
                                        Só continue se tiver certeza absoluta e estiver preparado para perder todas as informações.
                                    </p>
                                </div>
                                <div className="relative z-10 flex justify-end mt-4">
                                    <button
                                        onClick={openResetModal}
                                        className={`${actionButtonBase} bg-red-600 text-white hover:bg-red-500`}
                                    >
                                        <Trash2 size={16} /> Resetar Sistema
                                    </button>
                                </div>
                            </SettingsSection>
                        </div>
                    )}
                </div>
        </div>

      </main>

      {/* --- SYSTEM RESET SECURITY MODAL --- */}
      {!isMobile && isResetModalOpen && (
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

                    <div className="space-y-4 mb-6">
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2">
                            <div>
                                <p className="text-xs font-semibold text-red-200">Girar chave de segurança</p>
                                <p className="text-[11px] text-red-300/70">Ative para iniciar o protocolo.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setResetKeyTurned((prev) => !prev)}
                                className={`h-9 w-20 rounded-full border text-xs font-bold transition ${
                                    resetKeyTurned
                                        ? 'border-amber-300 bg-amber-400 text-zinc-900'
                                        : 'border-red-900/60 bg-transparent text-red-200'
                                }`}
                            >
                                {resetKeyTurned ? 'CHAVE ON' : 'CHAVE OFF'}
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor={resetConfirmId} className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                              Código de lançamento
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

                        <label className="flex items-center gap-3 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                            <input
                                type="checkbox"
                                checked={resetTermsAccepted}
                                onChange={(e) => setResetTermsAccepted(e.target.checked)}
                                className="h-4 w-4 rounded border-red-900/40 bg-transparent text-red-500 focus:ring-red-500"
                            />
                            Eu entendo que esta ação é irreversível e aceito os termos.
                        </label>

                        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2">
                            <div>
                                <p className="text-xs font-semibold text-red-200">Armar lançamento</p>
                                <p className="text-[11px] text-red-300/70">Obrigatório antes de lançar.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setResetArmed((prev) => !prev)}
                                className={`h-9 w-20 rounded-full border text-xs font-bold transition ${
                                    resetArmed
                                        ? 'border-emerald-400 bg-emerald-500 text-white'
                                        : 'border-red-900/60 bg-transparent text-red-200'
                                }`}
                            >
                                {resetArmed ? 'ARMADO' : 'DESARM'}
                            </button>
                        </div>
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
                            disabled={isResetting || resetCountdown !== null}
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirmReset}
                            disabled={!canConfirmReset || isResetting || !resetKeyTurned || !resetTermsAccepted || !resetArmed}
                            className={`flex-[2] py-3 rounded-xl font-bold text-white transition-colors shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 text-sm ${
                                !canConfirmReset || isResetting || !resetKeyTurned || !resetTermsAccepted || !resetArmed
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

      {!isMobile && resetPhase !== 'idle' && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center text-white">
            {resetPhase === 'countdown' && (
                <div className="flex h-full w-full flex-col items-center justify-center bg-black">
                    <div className="text-[140px] font-black text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]">
                        {resetCountdown}
                    </div>
                </div>
            )}
            {resetPhase === 'matrix' && (
                <div
                    className={`relative h-full w-full overflow-hidden bg-black ${
                        boomActive ? 'animate-[mm-shake_0.6s_ease-in-out]' : ''
                    }`}
                >
                    {matrixFlashActive && (
                        <div className="absolute inset-0">
                            <style>
                                {`@keyframes mm-matrix-flash {0%{opacity:1;}70%{opacity:0.55;}100%{opacity:0;}}
                                   @keyframes mm-shake {0%{transform:translate(0);}15%{transform:translate(-6px,4px);}30%{transform:translate(6px,-4px);}45%{transform:translate(-4px,6px);}60%{transform:translate(4px,-6px);}75%{transform:translate(-3px,3px);}100%{transform:translate(0);}}`}
                            </style>
                            <div className="absolute inset-0 bg-white animate-[mm-matrix-flash_1.6s_ease-out_forwards]" />
                            <div className="absolute inset-0 bg-red-600/45 mix-blend-screen animate-[mm-matrix-flash_1.2s_ease-out_forwards]" />
                        </div>
                    )}
                    <div className="absolute inset-0 opacity-85 flex items-center justify-center">
                        <pre className="w-full h-full text-center text-emerald-400/80 font-mono text-[10px] sm:text-xs leading-4 tracking-[0.12em] whitespace-pre">
                            {matrixText}
                        </pre>
                    </div>
                    <div className="relative z-10 flex h-full w-full items-center justify-center">
                        <p className="text-lg sm:text-2xl font-semibold text-emerald-400 tracking-[0.35em] uppercase">
                            Reiniciando o Sistema
                        </p>
                    </div>
                </div>
            )}
            {resetPhase === 'result' && (
                <div className="flex h-full w-full flex-col items-center justify-center bg-black">
                    <div className="text-5xl font-black text-emerald-400">
                        {resetDeletedCount ?? resetEstimatedDeleted}
                    </div>
                    <p className="mt-2 text-sm text-emerald-200">
                        Número de Arquivos Mortos
                    </p>
                    <button
                        type="button"
                        onClick={async () => {
                            setIsResetModalOpen(false);
                            setResetPhase('idle');
                            try {
                                await logout();
                            } finally {
                                window.location.href = '/login';
                            }
                        }}
                        className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                    >
                        <Sprout size={16} /> Recomeçar
                    </button>
                </div>
            )}
        </div>
      )}

    </div>
  );
};

export default Settings;
