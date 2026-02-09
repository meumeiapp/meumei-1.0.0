import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  reauthenticateWithPopup,
  type User,
  type UserCredential
} from 'firebase/auth';
import { auth } from '../../services/firebase';

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
];

export const buildSheetsProvider = () => {
  const provider = new GoogleAuthProvider();
  SHEETS_SCOPES.forEach(scope => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent' });
  return provider;
};

export const hasGoogleProvider = (user: User | null) => {
  if (!user) return false;
  return user.providerData.some(item => item.providerId === 'google.com');
};

const extractAccessToken = (result: UserCredential | null) => {
  if (!result) return { token: null, expiresAt: null };
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken ?? null;
  const expiresAt = (credential as any)?.expirationTime ?? null;
  return { token, expiresAt };
};

const parsePopupFeature = (features: string | undefined, key: string) => {
  if (!features) return undefined;
  const match = features.match(new RegExp(`${key}=([0-9]+)`));
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const withCenteredPopup = async <T>(fn: () => Promise<T>, anchor?: DOMRect | null) => {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    return fn();
  }
  const originalOpen = window.open.bind(window);
  let preopened: Window | null = null;
  let preferredLeft = 0;
  let preferredTop = 0;
  let preferredWidth = 500;
  let preferredHeight = 600;

  const buildCenteredFeatures = (features?: string) => {
    let nextFeatures = features || '';
    try {
      const width = parsePopupFeature(nextFeatures, 'width') ?? 500;
      const height = parsePopupFeature(nextFeatures, 'height') ?? 600;
      const screenLeft = (window as any).screenLeft ?? window.screenX ?? 0;
      const screenTop = (window as any).screenTop ?? window.screenY ?? 0;
      const outerWidth = window.outerWidth || document.documentElement.clientWidth || screen.width;
      const outerHeight = window.outerHeight || document.documentElement.clientHeight || screen.height;
      let left = Math.round(screenLeft + (outerWidth - width) / 2);
      let top = Math.round(screenTop + (outerHeight - height) / 2);
      if (anchor) {
        left = Math.round(screenLeft + anchor.left + (anchor.width - width) / 2);
        top = Math.round(screenTop + anchor.top + anchor.height + 12);
        const maxLeft = screenLeft + Math.max(0, outerWidth - width);
        const maxTop = screenTop + Math.max(0, outerHeight - height);
        left = Math.max(screenLeft, Math.min(left, maxLeft));
        top = Math.max(screenTop, Math.min(top, maxTop));
      }
      preferredLeft = left;
      preferredTop = top;
      preferredWidth = width;
      preferredHeight = height;
      if (!/width=/.test(nextFeatures)) nextFeatures += `,width=${width}`;
      if (!/height=/.test(nextFeatures)) nextFeatures += `,height=${height}`;
      if (!/left=/.test(nextFeatures)) nextFeatures += `,left=${left}`;
      if (!/top=/.test(nextFeatures)) nextFeatures += `,top=${top}`;
    } catch {
      // fallback to default features
    }
    return nextFeatures;
  };

  try {
    const initialFeatures = buildCenteredFeatures();
    preopened = window.open('', 'meumei-google-auth', initialFeatures);
    if (preopened) {
      try {
        preopened.moveTo(preferredLeft, preferredTop);
        preopened.resizeTo(preferredWidth, preferredHeight);
      } catch {
        // ignore
      }
    }
  } catch {
    preopened = null;
  }

  window.open = (url?: string | URL, target?: string, features?: string) => {
    if (preopened && !preopened.closed) {
      try {
        if (url) {
          preopened.location.href = url.toString();
        }
        preopened.focus();
        setTimeout(() => {
          try {
            preopened?.moveTo(preferredLeft, preferredTop);
            preopened?.resizeTo(preferredWidth, preferredHeight);
          } catch {
            // ignore
          }
        }, 80);
      } catch {
        // ignore
      }
      return preopened;
    }
    const nextFeatures = buildCenteredFeatures(features);
    const popup = originalOpen(url as any, target, nextFeatures);
    if (popup) {
      try {
        popup.moveTo(preferredLeft, preferredTop);
        popup.resizeTo(preferredWidth, preferredHeight);
        setTimeout(() => {
          try {
            popup.moveTo(preferredLeft, preferredTop);
            popup.resizeTo(preferredWidth, preferredHeight);
          } catch {
            // ignore
          }
        }, 80);
      } catch {
        // ignore positioning errors
      }
    }
    return popup;
  };
  try {
    return await fn();
  } finally {
    window.open = originalOpen;
  }
};

export const consumeRedirectToken = async () => {
  const result = await getRedirectResult(auth);
  return {
    result,
    ...extractAccessToken(result)
  };
};

export const requestSheetsAccess = async (mode: 'link' | 'reauth', anchor?: DOMRect | null) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }
  const provider = buildSheetsProvider();
  try {
    const result = mode === 'link'
      ? await withCenteredPopup(() => linkWithPopup(user, provider), anchor)
      : await withCenteredPopup(() => reauthenticateWithPopup(user, provider), anchor);
    const { token, expiresAt } = extractAccessToken(result);
    return { token, expiresAt, method: 'popup' as const };
  } catch (error: any) {
    const code = error?.code || '';
    if (code.includes('popup')) {
      const message = code.includes('blocked')
        ? 'Popup bloqueado. Habilite popups para concluir o login com o Google.'
        : 'Popup foi fechado antes de concluir o login.';
      const popupError = new Error(message) as Error & { code?: string };
      popupError.code = code;
      throw popupError;
    }
    throw error;
  }
};
