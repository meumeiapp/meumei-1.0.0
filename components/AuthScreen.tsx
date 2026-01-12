import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, LogIn, Mail, UserPlus, RotateCw, Shield } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, BUILD_TIME } from '../version';

type Mode = 'login' | 'register' | 'reset';
const LOGIN_BADGE = (() => {
  const [appVersion, uiTag] = APP_VERSION.split('+');
  return `meumei ${appVersion} | ${uiTag || APP_VERSION}`;
})();

const AuthScreen: React.FC = () => {
  const { login, register, resetPassword, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fieldId = (suffix: string) => `auth-${suffix}`;
  const versionLoggedRef = useRef(false);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  useEffect(() => {
    if (versionLoggedRef.current) return;
    versionLoggedRef.current = true;
    console.info('[auth-ui] version', { version: APP_VERSION, build: BUILD_TIME });
  }, []);

  const title = useMemo(() => {
    if (mode === 'register') return 'Criar conta';
    if (mode === 'reset') return 'Recuperar acesso';
    return 'Entrar';
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearAuthError();
    setInfo('');

    try {
      setLoading(true);
      if (mode === 'login') {
        await login(email.trim(), password);
        return;
      }
      if (mode === 'register') {
        if (password !== confirmPassword) {
          throw new Error('As senhas não conferem.');
        }
        await register(email.trim(), password);
        return;
      }
      await resetPassword(email.trim());
      setInfo('Se o e-mail existir, você receberá o link para redefinir a senha.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível completar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const showPasswordField = mode !== 'reset';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f] text-white p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
      <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[160px]" />
      <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[180px]" />
      <div className="w-full max-w-[540px] bg-white/10 backdrop-blur-[28px] rounded-[38px] shadow-[0_40px_140px_rgba(6,10,26,0.75)] overflow-hidden border border-white/25 relative z-10">
        <div className="bg-gradient-to-br from-cyan-500/25 via-indigo-500/20 to-fuchsia-500/25 px-10 pt-10 pb-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <Logo size="5xl" className="text-white drop-shadow-xl" />
            <div className="space-y-2">
              <h1 className="text-5xl font-semibold tracking-tight">meumei</h1>
              <p className="text-base text-indigo-100/75">
                Controle financeiro simples, do seu jeito.
              </p>
              <p className="text-xl font-bold">{title}</p>
            </div>
          </div>
        </div>

        <div className="px-10 pt-8 pb-10 space-y-6">
          {error && (
            <div className="text-red-200 text-sm bg-red-500/10 p-3 rounded-lg flex gap-2 items-start">
              <AlertCircle size={16} className="mt-0.5" /> {error}
            </div>
          )}

          {info && (
            <div className="text-emerald-100 text-sm bg-emerald-500/10 p-3 rounded-lg flex gap-2 items-start">
              <CheckCircle2 size={16} className="mt-0.5" /> {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={fieldId('email')} className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                <Mail size={14} /> E-mail
              </label>
              <div className="relative">
                <input
                  id={fieldId('email')}
                  name="email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/12 border border-white/15 rounded-2xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-cyan-300 outline-none placeholder:text-slate-300/70"
                  placeholder="seuemail@dominio.com"
                />
              </div>
            </div>

            {showPasswordField && (
              <div className="space-y-2">
                <label htmlFor={fieldId('password')} className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                  <Lock size={14} /> Senha
                </label>
                <div className="relative">
                  <input
                    id={fieldId('password')}
                    name="password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/12 border border-white/15 rounded-2xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-cyan-300 outline-none placeholder:text-slate-300/70"
                    placeholder="Sua senha"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-2">
                <label htmlFor={fieldId('confirm-password')} className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                  <Shield size={14} /> Confirmar senha
                </label>
                <input
                  id={fieldId('confirm-password')}
                  name="confirmPassword"
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/12 border border-white/15 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-cyan-300 outline-none placeholder:text-slate-300/70"
                  placeholder="Repita a senha"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 hover:from-cyan-300 hover:via-indigo-400 hover:to-fuchsia-400 text-white font-semibold py-3 rounded-full transition-all shadow-[0_18px_45px_rgba(59,130,246,0.45)] flex justify-center items-center gap-2"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : mode === 'register' ? (
                <>
                  <UserPlus size={18} /> Criar conta
                </>
              ) : mode === 'reset' ? (
                <>
                  <RotateCw size={18} /> Enviar recuperação
                </>
              ) : (
                <>
                  <LogIn size={18} /> Entrar
                </>
              )}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-200/80">
            {mode !== 'login' && (
              <button
                className="hover:text-white underline underline-offset-4"
                onClick={() => {
                  setMode('login');
                  setError('');
                  clearAuthError();
                  setInfo('');
                }}
              >
                Voltar para login
              </button>
            )}
            {mode === 'login' && (
              <button
                className="hover:text-white underline underline-offset-4"
                onClick={() => {
                  setMode('register');
                  setError('');
                  clearAuthError();
                  setInfo('');
                }}
              >
                Criar conta
              </button>
            )}
            {mode === 'login' && (
              <button
                className="text-xs text-slate-300/70 hover:text-white underline underline-offset-4"
                onClick={() => {
                  setMode('reset');
                  setError('');
                  clearAuthError();
                  setInfo('');
                }}
              >
                Esqueci minha senha
              </button>
            )}
          </div>
          <div className="flex justify-end">
            <span className="text-[10px] text-slate-200/85 px-2.5 py-1 rounded-full bg-white/15 border border-white/20">
              {LOGIN_BADGE}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
