import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeEmail } from '../utils/normalizeEmail';
import { ThemePreference } from '../types';
import { logPermissionDenied } from '../utils/firestoreLogger';

const getLegacyPreferencesRef = (emailKey: string) =>
  doc(db, 'userPreferences', emailKey);

const getTenantPreferencesRef = (licenseId: string, emailKey: string) =>
  doc(db, 'licenses', licenseId, 'userPreferences', emailKey);

const resolveEmailKey = (email?: string | null) => {
  if (!email) return null;
  try {
    return normalizeEmail(email);
  } catch {
    return email.trim().toLowerCase().replace(/\s+/g, '');
  }
};

const resolveRawKey = (email?: string | null) => {
  if (!email) return null;
  const raw = email.trim();
  return raw ? raw : null;
};

export const preferencesService = {
  async ensurePrefsDoc(
    licenseId: string | null | undefined,
    email: string | null | undefined
  ): Promise<Record<string, any>> {
    if (!licenseId) {
      console.error('[prefs] error', { step: 'load-start', message: 'missing_licenseId' });
      return {};
    }
    const normalizedEmail = resolveEmailKey(email);
    if (!normalizedEmail) {
      console.error('[prefs] error', { step: 'load-start', message: 'missing_email' });
      return {};
    }
    console.info('[prefs] load-start', { licenseId, email, normalizedEmail });
    const newRef = getTenantPreferencesRef(licenseId, normalizedEmail);
    try {
      const newSnap = await getDoc(newRef);
      console.info('[prefs] read-new', { path: newRef.path, exists: newSnap.exists() });
      if (newSnap.exists()) {
        console.info('[prefs] loaded from licenses/{licenseId}/userPreferences', { path: newRef.path });
        return newSnap.data() || {};
      }
    } catch (error: any) {
      logPermissionDenied({
        step: 'preferences_read_new',
        path: newRef.path,
        operation: 'getDoc',
        error,
        licenseId
      });
      console.error('[prefs] error', { step: 'read-new', message: error?.message });
      return {};
    }

    const legacyKeys: string[] = [];
    const rawKey = resolveRawKey(email);
    if (normalizedEmail) legacyKeys.push(normalizedEmail);
    if (rawKey && rawKey !== normalizedEmail) legacyKeys.push(rawKey);

    let legacyData: Record<string, any> | null = null;
    let legacyRefPath = '';

    for (const key of legacyKeys) {
      const legacyRef = getLegacyPreferencesRef(key);
      try {
        const legacySnap = await getDoc(legacyRef);
        console.info('[prefs] read-legacy', { path: legacyRef.path, exists: legacySnap.exists() });
        if (legacySnap.exists()) {
          legacyData = legacySnap.data() || {};
          legacyRefPath = legacyRef.path;
          break;
        }
      } catch (error: any) {
        logPermissionDenied({
          step: 'preferences_read_legacy',
          path: legacyRef.path,
          operation: 'getDoc',
          error,
          licenseId
        });
        console.error('[prefs] error', { step: 'read-legacy', message: error?.message });
      }
    }

    if (!legacyData) {
      const payload: Record<string, any> = {
        email: normalizedEmail,
        licenseId,
        theme: 'dark',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      try {
        await setDoc(newRef, payload, { merge: true });
        console.info('[prefs] save', { path: newRef.path, patchKeys: Object.keys(payload) });
        console.info('[prefs] loaded from licenses/{licenseId}/userPreferences', { path: newRef.path });
        return payload;
      } catch (error: any) {
        logPermissionDenied({
          step: 'preferences_seed',
          path: newRef.path,
          operation: 'setDoc',
          error,
          licenseId
        });
        console.error('[prefs] error', { step: 'seed', message: error?.message });
        return {};
      }
    }

    const payload: Record<string, any> = {
      ...legacyData,
      email: normalizedEmail,
      licenseId,
      updatedAt: serverTimestamp(),
      createdAt: legacyData.createdAt || serverTimestamp()
    };

    try {
      await setDoc(newRef, payload, { merge: true });
      console.info('[prefs] migrated', { from: legacyRefPath, to: newRef.path });
      console.info('[prefs] loaded from licenses/{licenseId}/userPreferences', { path: newRef.path });
      return payload;
    } catch (error: any) {
      logPermissionDenied({
        step: 'preferences_migrate',
        path: newRef.path,
        operation: 'setDoc',
        error,
        licenseId
      });
      console.error('[prefs] error', { step: 'migrate', message: error?.message });
      return {};
    }
  },

  async getPreferences(
    email: string | null | undefined,
    licenseId: string | null | undefined
  ): Promise<{ theme?: ThemePreference }> {
    try {
      const prefs = await this.ensurePrefsDoc(licenseId, email);
      const theme = prefs?.theme as ThemePreference | undefined;
      return theme ? { theme } : {};
    } catch (error: any) {
      logPermissionDenied({
        step: 'preferences_get',
        path: 'licenses/{licenseId}/userPreferences/{email}',
        operation: 'ensurePrefsDoc',
        error,
        licenseId: licenseId || null
      });
      console.error('[prefs] error', { step: 'get', message: error?.message });
      return {};
    }
  },

  async setTheme(
    email: string | null | undefined,
    theme: ThemePreference,
    licenseId: string | null | undefined
  ): Promise<void> {
    const emailKey = resolveEmailKey(email);
    if (!emailKey) {
      console.error('[prefs] error', { step: 'save', message: 'missing_email' });
      return;
    }
    if (!licenseId) {
      console.error('[prefs] error', { step: 'save', message: 'missing_licenseId' });
      return;
    }
    const existing = await this.ensurePrefsDoc(licenseId, email);
    const payload: Record<string, any> = {
      email: emailKey,
      theme,
      licenseId,
      updatedAt: serverTimestamp()
    };
    if (!Object.prototype.hasOwnProperty.call(existing, 'createdAt')) {
      payload.createdAt = serverTimestamp();
    }
    const ref = getTenantPreferencesRef(licenseId, emailKey);
    try {
      await setDoc(
        ref,
        payload,
        { merge: true }
      );
      console.info('[prefs] save', { path: ref.path, patchKeys: Object.keys(payload) });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_theme',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: licenseId || null
      });
      console.error('[prefs] error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  }
};
