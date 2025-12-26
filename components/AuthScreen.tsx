import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, LogIn, Mail, UserPlus, RotateCw, Shield } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'login' | 'register' | 'reset';

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

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.25),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.2),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(236,72,153,0.15),transparent_30%)]" />
      <div className="w-full max-w-[460px] bg-[#0c0d12]/90 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/10 relative z-10">
        <div className="bg-gradient-to-br from-indigo-600/30 via-purple-600/20 to-cyan-500/20 p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Logo size="5xl" className="text-white drop-shadow-md" />
            <div>
              <p className="text-2xl font-bold">{title}</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
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
              <label className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                <Mail size={14} /> E-mail
              </label>
              <div className="relative">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-slate-400"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            {showPasswordField && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                  <Lock size={14} /> Senha
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-slate-400"
                    placeholder="********"
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
                <label className="text-xs font-bold text-indigo-100/70 uppercase flex items-center gap-2">
                  <Shield size={14} /> Confirmar senha
                </label>
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-slate-400"
                  placeholder="Repita a senha"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2"
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
                className="hover:text-white underline underline-offset-4"
                onClick={() => {
                  setMode('reset');
                  setError('');
                  clearAuthError();
                  setInfo('');
                }}
              >
                Esqueci a senha
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
