import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging
} from 'firebase/messaging';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { auth, db, firebaseApp, firebaseDebugInfo } from './firebase';
import { guardUserPath } from '../utils/pathGuard';

type NotificationSettings = {
  enabled?: boolean;
};

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
const FUNCTIONS_ORIGIN = (import.meta.env.VITE_FIREBASE_FUNCTIONS_ORIGIN || '').trim();
const FUNCTIONS_REGION = (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || '').trim() || 'us-central1';
const STORAGE_TOKEN_KEY = 'meumei_push_token_v1';
const STORAGE_ENABLED_KEY = 'meumei_push_enabled_v1';
const STORAGE_DEVICE_ID_KEY = 'meumei_push_device_id_v1';
let foregroundUnsub: (() => void) | null = null;

const encodeTokenId = (token: string) => token.replace(/[^a-zA-Z0-9_-]/g, '_');

const getSettingsRef = (uid: string) =>
  doc(db, 'users', uid, 'settings', 'notifications');

const getTokenRef = (uid: string, token: string) =>
  doc(db, 'users', uid, 'pushTokens', encodeTokenId(token));

const getDeviceId = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    let deviceId = localStorage.getItem(STORAGE_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(STORAGE_DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

const resolveMessaging = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;
  if (!('serviceWorker' in navigator)) return null;
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(firebaseApp);
};

const resolveServiceWorkerRegistration = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) return registration;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
};

const storeLocalToken = (token: string | null) => {
  try {
    if (!token) {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      return;
    }
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  } catch (error) {
    console.warn('[push] local token save failed', error);
  }
};

const getLocalToken = () => {
  try {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
};

const setLocalEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? '1' : '0');
  } catch (error) {
    console.warn('[push] local enabled save failed', error);
  }
};

const getLocalEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

const showForegroundNotification = (payload: MessagePayload) => {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const data = payload?.data || {};
  const title = payload?.notification?.title || data?.title || 'meumei';
  const body = payload?.notification?.body || data?.body || '';
  const icon = payload?.notification?.icon || data?.icon || '/pwa-192x192.png';
  try {
    const notification = new Notification(title, { body, icon, data });
    notification.onclick = () => {
      const url = typeof data?.url === 'string' ? data.url : '/';
      window.focus();
      window.location.assign(url);
    };
  } catch (error) {
    console.warn('[push] foreground notification failed', error);
  }
};

export const notificationsService = {
  async getSettings(uid: string | null | undefined): Promise<NotificationSettings> {
    if (!uid) return {};
    const ref = getSettingsRef(uid);
    if (!guardUserPath(uid, ref.path, 'notifications_get')) return {};
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return {};
      const data = snap.data() as NotificationSettings;
      return {
        enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined
      };
    } catch (error) {
      console.warn('[push] settings read failed', error);
      return {};
    }
  },

  getLocalEnabled,

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.requestPermission();
  },

  async enable(uid: string | null | undefined): Promise<string> {
    if (!uid) {
      throw new Error('Usuário não identificado.');
    }
    if (!VAPID_KEY) {
      throw new Error('VAPID key ausente. Configure VITE_FIREBASE_VAPID_KEY.');
    }
    const messaging = await resolveMessaging();
    if (!messaging) {
      throw new Error('Notificações não suportadas neste navegador.');
    }
    const permission = await notificationsService.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permissão de notificação negada.');
    }
    const registration = await resolveServiceWorkerRegistration();
    if (!registration) {
      throw new Error('Service worker indisponível. Instale o app primeiro.');
    }
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) {
      throw new Error('Não foi possível gerar o token de notificação.');
    }
    const deviceId = getDeviceId();
    const ref = getTokenRef(uid, token);
    if (!guardUserPath(uid, ref.path, 'notifications_token_set')) {
      throw new Error('Path de notificação bloqueado.');
    }
    await setDoc(
      ref,
      {
        token,
        deviceId,
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'pushTokens'));
      await Promise.all(
        snap.docs.map(async (docSnap) => {
          if (docSnap.id === ref.id) return;
          if (docSnap.get('deviceId') !== deviceId) return;
          if (!guardUserPath(uid, docSnap.ref.path, 'notifications_token_cleanup')) return;
          await deleteDoc(docSnap.ref);
        })
      );
    } catch (error) {
      console.warn('[push] token cleanup failed', error);
    }
    await setDoc(
      getSettingsRef(uid),
      { enabled: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
    storeLocalToken(token);
    setLocalEnabled(true);
    if (!foregroundUnsub) {
      foregroundUnsub = onMessage(messaging, showForegroundNotification);
    }
    return token;
  },

  async disable(uid: string | null | undefined): Promise<void> {
    if (!uid) return;
    const messaging = await resolveMessaging();
    if (!messaging) return;
    const registration = await resolveServiceWorkerRegistration();
    let token = getLocalToken();
    if (!token) {
      try {
        if (registration) {
          token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
          });
        }
      } catch (error) {
        console.warn('[push] token fetch failed', error);
      }
    }
    try {
      await deleteToken(messaging);
    } catch (error) {
      console.warn('[push] delete token failed', error);
    }
    if (token) {
      const ref = getTokenRef(uid, token);
      if (guardUserPath(uid, ref.path, 'notifications_token_delete')) {
        await deleteDoc(ref).catch((error) =>
          console.warn('[push] token delete failed', error)
        );
      }
    }
    await setDoc(
      getSettingsRef(uid),
      { enabled: false, updatedAt: serverTimestamp() },
      { merge: true }
    );
    storeLocalToken(null);
    setLocalEnabled(false);
    if (foregroundUnsub) {
      foregroundUnsub();
      foregroundUnsub = null;
    }
  },

  async sendTestNotification(message?: { title?: string; body?: string; url?: string }) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Faça login para enviar uma notificação.');
    }
    const token = await currentUser.getIdToken(true);
    const payload = {
      title: message?.title || 'meumei',
      body: message?.body || 'Notificação de teste do meumei.',
      url: message?.url || '/'
    };

    const uid = currentUser.uid;
    const ref = doc(db, 'users', uid);
    if (guardUserPath(uid, ref.path, 'notifications_request_create')) {
      try {
        await addDoc(collection(db, 'users', uid, 'pushRequests'), {
          ...payload,
          source: 'client',
          createdAt: serverTimestamp()
        });
        return { ok: true, queued: true };
      } catch (error) {
        console.warn('[push] queue failed', error);
      }
    }

    const projectId = firebaseDebugInfo.projectId;
    const baseOrigin =
      FUNCTIONS_ORIGIN ||
      (projectId ? `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net` : '');
    const endpoints = [
      '/api/sendPushNotification',
      baseOrigin ? `${baseOrigin}/sendPushNotification` : ''
    ].filter(Boolean);
    let lastError: Error | null = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          cache: 'no-store',
          body: JSON.stringify(payload)
        });
        const text = await response.text();
        const data = text
          ? (() => {
              try {
                return JSON.parse(text);
              } catch {
                return { message: text };
              }
            })()
          : {};
        if (!response.ok) {
          throw new Error(data?.message || 'Falha ao enviar notificação.');
        }
        return data;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error('Falha ao enviar notificação.');
      }
    }
    throw lastError || new Error('Falha ao enviar notificação.');
  }
};
