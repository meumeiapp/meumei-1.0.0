import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import QRCode from 'qrcode';
import { profilePhotoCaptureService } from '../services/profilePhotoCaptureService';
import {
  buildMobilePhotoCaptureLink,
  canCapturePhotoOnThisDevice,
  processProfileImageFile
} from '../utils/profileImage';

type ProfileEditorModalProps = {
  isOpen: boolean;
  username: string;
  initialPhotoDataUrl?: string | null;
  profileMode?: 'person' | 'company';
  saving?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSave: (payload: { name: string; photoDataUrl: string | null }) => Promise<boolean | void> | boolean | void;
};

const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  isOpen,
  username,
  initialPhotoDataUrl,
  profileMode = 'person',
  saving = false,
  errorMessage,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(username);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialPhotoDataUrl || null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cameraChecking, setCameraChecking] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localInfo, setLocalInfo] = useState('');
  const [showMobileCaptureHelp, setShowMobileCaptureHelp] = useState(false);
  const [mobileCaptureLink, setMobileCaptureLink] = useState('');
  const [mobileCaptureQrDataUrl, setMobileCaptureQrDataUrl] = useState('');
  const [activeCaptureSession, setActiveCaptureSession] = useState<{
    sessionId: string;
    sessionToken: string;
  } | null>(null);
  const [remoteCaptureSaving, setRemoteCaptureSaving] = useState(false);
  const [liveCameraOpen, setLiveCameraOpen] = useState(false);
  const [liveCameraBusy, setLiveCameraBusy] = useState(false);
  const [liveCameraStream, setLiveCameraStream] = useState<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCameraStreamRef = useRef<MediaStream | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const processingRemoteCaptureRef = useRef(false);
  const isCompanyProfile = profileMode === 'company';
  const titleText = isCompanyProfile ? 'Perfil da empresa' : 'Meu perfil';
  const subtitleText = isCompanyProfile
    ? 'Atualize a logomarca e o nome da empresa.'
    : 'Atualize sua foto e nome de exibição.';
  const uploadLabel = isCompanyProfile ? 'Enviar logomarca' : 'Enviar foto';
  const removeLabel = isCompanyProfile ? 'Remover logomarca' : 'Remover';
  const nameLabel = isCompanyProfile ? 'Nome da empresa' : 'Nome';
  const namePlaceholder = isCompanyProfile ? 'Nome da empresa' : 'Seu nome';
  const avatarAlt = isCompanyProfile ? 'Logomarca da empresa' : 'Foto de perfil';
  const clearCapturePolling = () => {
    if (pollingTimerRef.current !== null) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const stopLiveCamera = () => {
    if (liveCameraStreamRef.current) {
      liveCameraStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    liveCameraStreamRef.current = null;
    setLiveCameraStream(null);
    setLiveCameraOpen(false);
    setLiveCameraBusy(false);
  };

  const supportsLiveCameraCapture = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return false;
    return (
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  };

  useEffect(() => {
    if (!isOpen) {
      clearCapturePolling();
      processingRemoteCaptureRef.current = false;
      stopLiveCamera();
      return;
    }
    clearCapturePolling();
    processingRemoteCaptureRef.current = false;
    setName(username || '');
    setPhotoDataUrl(initialPhotoDataUrl || null);
    setProcessingPhoto(false);
    setCameraChecking(false);
    setLocalError('');
    setLocalInfo('');
    setShowMobileCaptureHelp(false);
    setMobileCaptureLink('');
    setMobileCaptureQrDataUrl('');
    setActiveCaptureSession(null);
    setRemoteCaptureSaving(false);
    stopLiveCamera();
  }, [isOpen, username, initialPhotoDataUrl, isCompanyProfile]);

  useEffect(() => {
    liveCameraStreamRef.current = liveCameraStream;
  }, [liveCameraStream]);

  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  useEffect(() => {
    if (!liveCameraOpen || !liveCameraStream || !liveVideoRef.current) return;
    const video = liveVideoRef.current;
    video.srcObject = liveCameraStream;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // some browsers only start after explicit user gesture
      });
    }
  }, [liveCameraOpen, liveCameraStream]);

  useEffect(() => {
    if (!isOpen || !activeCaptureSession?.sessionId || !showMobileCaptureHelp || isCompanyProfile) return;
    let cancelled = false;
    const sessionId = activeCaptureSession.sessionId;

    const handleCapturedPhoto = async (capturedPhotoDataUrl: string) => {
      if (cancelled || processingRemoteCaptureRef.current) return;
      processingRemoteCaptureRef.current = true;
      clearCapturePolling();
      setRemoteCaptureSaving(true);
      setPhotoDataUrl(capturedPhotoDataUrl);
      setLocalError('');
      setLocalInfo('Foto recebida do celular. Salvando perfil no desktop...');

      const trimmedName = String(name || '').trim();
      const resolvedName = trimmedName.length >= 2 ? trimmedName : String(username || '').trim();
      const saveResult = await onSave({
        name: resolvedName || 'Usuário',
        photoDataUrl: capturedPhotoDataUrl
      });
      const saved = saveResult !== false;

      if (saved) {
        void profilePhotoCaptureService.consumeSession(sessionId);
      } else if (!cancelled) {
        setLocalError('A foto chegou, mas não foi possível salvar o perfil. Tente novamente.');
      }

      if (!cancelled) {
        setRemoteCaptureSaving(false);
      }
    };

    const pollCaptureSession = async () => {
      if (cancelled || processingRemoteCaptureRef.current) return;
      const response = await profilePhotoCaptureService.getSession(sessionId);
      if (!response.ok || !response.data?.session) return;
      const session = response.data.session;
      if (session.status === 'expired') {
        clearCapturePolling();
        if (!cancelled) {
          setActiveCaptureSession(null);
          setShowMobileCaptureHelp(false);
          setMobileCaptureLink('');
          setMobileCaptureQrDataUrl('');
          setLocalError('QR Code expirado. Clique em Tirar Foto para gerar um novo.');
        }
        return;
      }
      if (session.status === 'captured' && session.photoDataUrl) {
        await handleCapturedPhoto(session.photoDataUrl);
      }
    };

    void pollCaptureSession();
    const timerId = window.setInterval(() => {
      void pollCaptureSession();
    }, 1700);
    pollingTimerRef.current = timerId;

    return () => {
      cancelled = true;
      if (pollingTimerRef.current === timerId) {
        clearCapturePolling();
      } else {
        window.clearInterval(timerId);
      }
    };
  }, [activeCaptureSession?.sessionId, isCompanyProfile, isOpen, name, onSave, showMobileCaptureHelp, username]);

  useEffect(() => {
    if (!showMobileCaptureHelp || !mobileCaptureLink) {
      setMobileCaptureQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(mobileCaptureLink, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then((qrDataUrl) => {
        if (cancelled) return;
        setMobileCaptureQrDataUrl(qrDataUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setMobileCaptureQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [showMobileCaptureHelp, mobileCaptureLink]);

  if (!isOpen) return null;

  const processPhotoFile = async (file: File | null | undefined) => {
    if (!file) return;
    setProcessingPhoto(true);
    setLocalError('');
    try {
      const processed = await processProfileImageFile(file);
      setPhotoDataUrl(processed);
    } catch (error: any) {
      setLocalError(error?.message || 'Não foi possível processar a imagem.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handlePhotoFile = async (files: FileList | null) => {
    const file = files?.[0];
    await processPhotoFile(file);
  };

  const handleSave = async () => {
    const trimmedName = String(name || '').trim();
    if (trimmedName.length < 2) {
      setLocalError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    setLocalError('');
    setLocalInfo('');
    await onSave({ name: trimmedName, photoDataUrl: photoDataUrl || null });
  };

  const handleCameraClick = async () => {
    if (processingPhoto || saving || cameraChecking || liveCameraBusy) return;
    if (isCompanyProfile) return;
    setCameraChecking(true);
    setLocalError('');
    setLocalInfo('');
    try {
      const cameraAvailable = await canCapturePhotoOnThisDevice();
      if (cameraAvailable) {
        if (supportsLiveCameraCapture()) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false
            });
            clearCapturePolling();
            processingRemoteCaptureRef.current = false;
            setActiveCaptureSession(null);
            setShowMobileCaptureHelp(false);
            setMobileCaptureLink('');
            setMobileCaptureQrDataUrl('');
            setLiveCameraStream(stream);
            setLiveCameraOpen(true);
            setLocalInfo('Câmera pronta. Centralize o rosto e clique em Capturar.');
            return;
          } catch {
            setLocalInfo('Não foi possível abrir a câmera diretamente. Escolha uma foto ou use outro navegador.');
          }
        }
        cameraInputRef.current?.click();
        return;
      }

      const sessionResponse = await profilePhotoCaptureService.createSession(name || username);
      if (!sessionResponse.ok || !sessionResponse.data?.session) {
        setLocalError(sessionResponse.message || 'Não foi possível iniciar a captura no celular.');
        return;
      }

      const session = sessionResponse.data.session;
      if (!session.sessionId || !session.sessionToken) {
        setLocalError('Sessão de captura inválida. Tente novamente.');
        return;
      }

      const mobileLink = buildMobilePhotoCaptureLink({
        sessionId: session.sessionId,
        sessionToken: session.sessionToken
      });
      if (!mobileLink) {
        setLocalError('Não foi possível preparar o acesso mobile para captura da imagem.');
        return;
      }

      clearCapturePolling();
      processingRemoteCaptureRef.current = false;
      setActiveCaptureSession({
        sessionId: session.sessionId,
        sessionToken: session.sessionToken
      });
      setShowMobileCaptureHelp(true);
      setMobileCaptureLink(mobileLink);
      setLocalInfo('Sem câmera neste dispositivo. Escaneie o QR Code para tirar a foto no celular.');
    } catch {
      setLocalError('Não foi possível verificar a câmera deste dispositivo.');
    } finally {
      setCameraChecking(false);
    }
  };

  const handleCaptureFromLiveCamera = async () => {
    if (!liveVideoRef.current || !liveCameraOpen || liveCameraBusy || saving || processingPhoto) return;
    const video = liveVideoRef.current;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 720;
    if (width <= 0 || height <= 0) {
      setLocalError('A câmera ainda não está pronta. Aguarde e tente novamente.');
      return;
    }

    setLiveCameraBusy(true);
    setLocalError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível capturar a imagem.');
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      if (!blob) throw new Error('Falha ao capturar a imagem da câmera.');

      const capturedFile = new File([blob], `profile-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await processPhotoFile(capturedFile);
      stopLiveCamera();
      setLocalInfo('Foto capturada com sucesso.');
    } catch (error: any) {
      setLocalError(error?.message || 'Não foi possível capturar a foto da câmera.');
    } finally {
      setLiveCameraBusy(false);
    }
  };

  const displayInitial = (name || 'U').trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111216] shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{titleText}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitleText}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || remoteCaptureSaving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2.5">
            <div
              className={`h-14 w-14 overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/70 flex items-center justify-center ${
                isCompanyProfile ? 'rounded-xl' : 'rounded-full'
              }`}
            >
              {photoDataUrl ? (
                <img src={photoDataUrl} alt={avatarAlt} className="h-full w-full object-cover" />
              ) : (
                <span className="text-base font-bold text-zinc-500 dark:text-zinc-300">{displayInitial}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isCompanyProfile && (
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) => {
                    void handlePhotoFile(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              )}
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void handlePhotoFile(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
              {!isCompanyProfile && (
                <button
                  type="button"
                  onClick={() => void handleCameraClick()}
                  disabled={processingPhoto || saving || remoteCaptureSaving || cameraChecking || liveCameraBusy}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera size={12} />
                  {cameraChecking ? 'Verificando...' : 'Tirar Foto'}
                </button>
              )}
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                disabled={processingPhoto || saving || remoteCaptureSaving}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload size={12} /> {uploadLabel}
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(null)}
                  disabled={processingPhoto || saving || remoteCaptureSaving}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-900/60 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X size={12} /> {removeLabel}
                </button>
              )}
            </div>
          </div>

          {!isCompanyProfile && liveCameraOpen && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 p-2.5">
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black">
                <video ref={liveVideoRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCaptureFromLiveCamera()}
                  disabled={liveCameraBusy || saving || processingPhoto}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/60 dark:border-cyan-700/60 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera size={12} />
                  {liveCameraBusy ? 'Capturando...' : 'Capturar'}
                </button>
                <button
                  type="button"
                  onClick={() => stopLiveCamera()}
                  disabled={liveCameraBusy}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar câmera
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">{nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={namePlaceholder}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>

          {localInfo && (
            <div className="rounded-lg border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
              {localInfo}
            </div>
          )}

          {showMobileCaptureHelp && mobileCaptureLink && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 p-2.5 space-y-2">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Escaneie para tirar foto no celular
              </p>
              <div className="flex justify-center">
                {mobileCaptureQrDataUrl ? (
                  <img
                    src={mobileCaptureQrDataUrl}
                    alt="QR Code para abrir no celular"
                    className="h-36 w-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white p-1"
                  />
                ) : (
                  <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/40 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Gerando QR Code...
                  </div>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Aponte a câmera do celular para o QR Code. Quando enviar, o desktop salva automaticamente.
              </p>
            </div>
          )}

          {(localError || errorMessage) && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {localError || errorMessage}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || remoteCaptureSaving}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || processingPhoto || remoteCaptureSaving}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving || remoteCaptureSaving ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditorModal;
