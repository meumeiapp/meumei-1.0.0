import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../services/firebase';

type AuthContextValue = {
  user: FirebaseUser | null;
  loading: boolean;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isDev = import.meta.env.DEV;

const mapAuthError = (error: any): { message: string; code: string | null; storageRelated?: boolean } => {
  const code = (error?.code as string | undefined) ?? null;
  const messageLower = (error?.message || '').toLowerCase();

  if (code === 'auth/unauthorized-domain') {
    return { code, message: 'Domínio não autorizado no Firebase Auth. Verifique domínios permitidos.' };
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return { code, message: 'Login cancelado.' };
  }
  if (code === 'auth/network-request-failed') {
    return { code, message: 'Falha de rede. Verifique sua conexão.' };
  }
  if (code === 'auth/operation-not-allowed') {
    return { code, message: 'Provedor não habilitado no Firebase Auth.' };
  }

  const storageRelated =
    code?.includes('storage') ||
    messageLower.includes('storage') ||
    messageLower.includes('cookie') ||
    messageLower.includes('third') ||
    messageLower.includes('browser');

  if (storageRelated) {
    return {
      code: code ?? 'auth/storage-error',
      message: 'Não foi possível salvar a sessão. Permita cookies para o domínio do Firebase e tente novamente.',
      storageRelated: true
    };
  }

  return { code, message: 'Não foi possível autenticar. Tente novamente.' };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    const init = async () => {
      if (isDev) console.info('[Auth] init');
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err: any) {
        if (isDev) console.error('[Auth] Failed to set persistence:', err);
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        console.info('[auth] onAuthStateChanged', firebaseUser?.email || null);
        setUser(firebaseUser);
        setLoading(false);
        if (firebaseUser) {
          setAuthError(null);
          setAuthErrorCode(null);
        }
        if (isDev) console.info('[Auth] loading false');
      });
    };

    if (isDev) {
      console.info('[Auth] Domínios autorizados esperados: localhost, 127.0.0.1, meumei-beta-102.web.app, meumeiapp.web.app, meumei-d88be.web.app, meumei-d88be.firebaseapp.com');
    }

    void init();
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    const normalizedEmail = email.trim().toLowerCase();
    await signInWithEmailAndPassword(auth, normalizedEmail, password);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setAuthError(null);
    setAuthErrorCode(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    await sendPasswordResetEmail(auth, email);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorCode(null);
  }, []);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      loading,
      authError,
      authErrorCode,
      clearAuthError,
      login,
      register,
      logout,
      resetPassword
    }),
    [
      user,
      loading,
      authError,
      authErrorCode,
      clearAuthError,
      login,
      register,
      logout,
      resetPassword
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
