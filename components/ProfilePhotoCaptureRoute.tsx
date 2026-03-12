import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react';
import { processProfileImageFile } from '../utils/profileImage';
import { profilePhotoCaptureService } from '../services/profilePhotoCaptureService';

type ProfilePhotoCaptureRouteProps = {
  sessionId: string;
  sessionToken: string;
};

const ProfilePhotoCaptureRoute: React.FC<ProfilePhotoCaptureRouteProps> = ({ sessionId, sessionToken }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState(
    'A câmera frontal será usada para tirar sua foto e enviar direto para o computador.'
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [autoOpenTried, setAutoOpenTried] = useState(false);

  useEffect(() => {
    if (autoOpenTried) return;
    setAutoOpenTried(true);
    const timer = window.setTimeout(() => {
      inputRef.current?.click();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [autoOpenTried]);

  const handleCapture = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setStatus('idle');
    setMessage('Processando foto...');
    try {
      const processed = await processProfileImageFile(file);
      setPreview(processed);
      setMessage('Enviando foto para o desktop...');
      const response = await profilePhotoCaptureService.submitCapturedPhoto({
        sessionId,
        sessionToken,
        photoDataUrl: processed
      });
      if (!response.ok) {
        throw new Error(response.message || 'Não foi possível enviar a foto.');
      }
      setStatus('success');
      setMessage('Foto enviada com sucesso. Volte ao computador para continuar.');
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || 'Não foi possível processar/enviar a foto.');
    } finally {
      setBusy(false);
    }
  };

  const invalidSession = !sessionId || !sessionToken;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#04070f] via-[#0b1836] to-[#1a0d35] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/25 bg-white/10 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">meumei</h1>
          <p className="text-sm text-slate-200/80">Captura de foto do perfil</p>
        </div>

        {invalidSession ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            Link inválido. Gere um novo QR Code no computador.
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(event) => {
                void handleCapture(event.target.files);
                event.currentTarget.value = '';
              }}
            />

            <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-slate-200/90">
              {message}
            </div>

            {preview && (
              <div className="mt-4 flex justify-center">
                <img
                  src={preview}
                  alt="Pré-visualização da foto"
                  className="h-36 w-36 rounded-full border border-white/30 object-cover"
                />
              </div>
            )}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {busy ? 'Aguarde...' : 'Tirar Foto'}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCcw size={14} />
                Tentar novamente
              </button>
            </div>

            {status === 'success' && (
              <div className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
                <CheckCircle2 size={16} /> Enviado para o desktop
              </div>
            )}
            {status === 'error' && (
              <div className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
                <XCircle size={16} /> Falha ao enviar
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePhotoCaptureRoute;

