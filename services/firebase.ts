
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const buildFirebaseConfig = () => {
  const env = import.meta.env;
  const config = {
    apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: (env.VITE_FIREBASE_APP_ID || '').trim()
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `Firebase config faltando em import.meta.env: ${missing.join(
        ', '
      )}. Verifique .env.local com prefixo VITE_.`
    );
  }

  return config;
};

const firebaseConfig = buildFirebaseConfig();
const functionsRegion = (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || '').trim();
const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
const isLocalhost =
  origin.includes('localhost') || origin.includes('127.0.0.1');
const isWebApp = origin.includes('.web.app');
const apiKeyPrefix = firebaseConfig.apiKey.slice(0, 6);

export const firebaseDebugInfo = {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  functionsRegion: functionsRegion || null,
  apiKeyPrefix,
  origin,
  isLocalhost,
  isWebApp
};

console.info('[firebase] config_loaded', firebaseDebugInfo);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = functionsRegion
  ? getFunctions(app, functionsRegion)
  : getFunctions(app);
export const firebaseApp = app;
