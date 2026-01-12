import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
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

export const consumeRedirectToken = async () => {
  const result = await getRedirectResult(auth);
  return {
    result,
    ...extractAccessToken(result)
  };
};

export const requestSheetsAccess = async (mode: 'link' | 'reauth') => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }
  const provider = buildSheetsProvider();
  try {
    const result = mode === 'link'
      ? await linkWithPopup(user, provider)
      : await reauthenticateWithPopup(user, provider);
    const { token, expiresAt } = extractAccessToken(result);
    return { token, expiresAt, method: 'popup' as const };
  } catch (error: any) {
    const code = error?.code || '';
    if (code.includes('popup')) {
      if (mode === 'link') {
        await linkWithRedirect(user, provider);
      } else {
        await reauthenticateWithRedirect(user, provider);
      }
      return { token: null, expiresAt: null, method: 'redirect' as const };
    }
    throw error;
  }
};
