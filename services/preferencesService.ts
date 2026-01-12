import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { ThemePreference } from '../types';
import { logPermissionDenied } from '../utils/firestoreLogger';
import { guardUserPath } from '../utils/pathGuard';

const getUserPreferencesRef = (uid: string) =>
  doc(db, 'users', uid, 'preferences', 'app');

export const preferencesService = {
  async getPreferences(uid: string | null | undefined): Promise<{ theme?: ThemePreference }> {
    if (!uid) {
      console.info('[prefs] load_skipped', { reason: 'missing_uid' });
      return {};
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_get')) return {};
    try {
      const snap = await getDoc(ref);
      console.info('[prefs] read', { path: ref.path, exists: snap.exists() });
      if (!snap.exists()) return {};
      const data = snap.data() as Record<string, unknown>;
      const theme = data?.theme as ThemePreference | undefined;
      return theme ? { theme } : {};
    } catch (error: any) {
      logPermissionDenied({
        step: 'preferences_get',
        path: ref.path,
        operation: 'getDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] error', { step: 'get', message: error?.message });
      return {};
    }
  },

  async setTheme(uid: string | null | undefined, theme: ThemePreference): Promise<void> {
    if (!uid) {
      console.error('[prefs] error', { step: 'save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_set')) return;
    try {
      await setDoc(
        ref,
        { theme, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] save', { path: ref.path, patchKeys: ['theme', 'updatedAt'] });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_theme',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  }
};
