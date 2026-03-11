import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { ExpenseTypeOption, ThemePreference } from '../types';
import { logPermissionDenied } from '../utils/firestoreLogger';
import { guardUserPath } from '../utils/pathGuard';

const getUserPreferencesRef = (uid: string) =>
  doc(db, 'users', uid, 'preferences', 'app');

export const preferencesService = {
  async getPreferences(
    uid: string | null | undefined
  ): Promise<{
    theme?: ThemePreference;
    tipsEnabled?: boolean;
    mobileDashboardSubHeader?: number;
    accountTypes?: string[];
    expenseTypeOptions?: ExpenseTypeOption[];
  }> {
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
      const tipsEnabled =
        typeof data?.tipsEnabled === 'boolean' ? (data.tipsEnabled as boolean) : undefined;
      const mobileDashboardSubHeader =
        typeof data?.mobileDashboardSubHeader === 'number'
          ? (data.mobileDashboardSubHeader as number)
          : undefined;
      const accountTypes = Array.isArray(data?.accountTypes)
        ? (data.accountTypes as string[])
        : undefined;
      const expenseTypeOptions = Array.isArray(data?.expenseTypeOptions)
        ? (data.expenseTypeOptions as ExpenseTypeOption[])
        : undefined;
      return {
        ...(theme ? { theme } : {}),
        ...(typeof tipsEnabled === 'boolean' ? { tipsEnabled } : {}),
        ...(typeof mobileDashboardSubHeader === 'number' ? { mobileDashboardSubHeader } : {}),
        ...(Array.isArray(accountTypes) ? { accountTypes } : {}),
        ...(Array.isArray(expenseTypeOptions) ? { expenseTypeOptions } : {})
      };
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

  async getDashboardLayout(uid: string | null | undefined): Promise<{
    order?: string[];
    hidden?: string[];
  } | null> {
    if (!uid) {
      console.info('[prefs] layout_load_skipped', { reason: 'missing_uid' });
      return null;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_layout_get')) return null;
    try {
      const snap = await getDoc(ref);
      console.info('[prefs] layout_read', { path: ref.path, exists: snap.exists() });
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      const layout = data?.dashboardLayout as { order?: string[]; hidden?: string[] } | undefined;
      return layout || null;
    } catch (error: any) {
      logPermissionDenied({
        step: 'preferences_get_layout',
        path: ref.path,
        operation: 'getDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] layout_error', { step: 'get', message: error?.message });
      return null;
    }
  },

  async setDashboardLayout(
    uid: string | null | undefined,
    layout: { order: string[]; hidden: string[] }
  ): Promise<void> {
    if (!uid) {
      console.error('[prefs] layout_error', { step: 'save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_layout_set')) return;
    try {
      await setDoc(
        ref,
        { dashboardLayout: layout, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] layout_save', { path: ref.path });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_layout',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] layout_error', { step: 'save', message: (error as any)?.message });
      throw error;
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
  },
  async setTipsEnabled(uid: string | null | undefined, tipsEnabled: boolean): Promise<void> {
    if (!uid) {
      console.error('[prefs] error', { step: 'tips_save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_tips_set')) return;
    try {
      await setDoc(
        ref,
        { tipsEnabled, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] tips_save', { path: ref.path, enabled: tipsEnabled });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_tips',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] tips_error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  },
  async setMobileDashboardSubHeader(uid: string | null | undefined, index: number): Promise<void> {
    if (!uid) {
      console.error('[prefs] error', { step: 'mobile_subheader_save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_mobile_subheader_set')) return;
    try {
      await setDoc(
        ref,
        { mobileDashboardSubHeader: index, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] mobile_subheader_save', { path: ref.path, index });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_mobile_subheader',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] mobile_subheader_error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  },
  async setExpenseTypeOptions(
    uid: string | null | undefined,
    expenseTypeOptions: ExpenseTypeOption[]
  ): Promise<void> {
    if (!uid) {
      console.error('[prefs] error', { step: 'expense_types_save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_expense_types_set')) return;
    try {
      await setDoc(
        ref,
        { expenseTypeOptions, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] expense_types_save', { path: ref.path, count: expenseTypeOptions.length });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_expense_types',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] expense_types_error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  },
  async setAccountTypes(
    uid: string | null | undefined,
    accountTypes: string[]
  ): Promise<void> {
    if (!uid) {
      console.error('[prefs] error', { step: 'account_types_save', message: 'missing_uid' });
      return;
    }
    const ref = getUserPreferencesRef(uid);
    const path = `users/${uid}/preferences/app`;
    if (!guardUserPath(uid, path, 'prefs_account_types_set')) return;
    try {
      await setDoc(
        ref,
        { accountTypes, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[prefs] account_types_save', { path: ref.path, count: accountTypes.length });
    } catch (error) {
      logPermissionDenied({
        step: 'preferences_set_account_types',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[prefs] account_types_error', { step: 'save', message: (error as any)?.message });
      throw error;
    }
  }
};
