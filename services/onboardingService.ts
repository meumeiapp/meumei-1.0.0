import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { guardUserPath } from '../utils/pathGuard';
import { logPermissionDenied } from '../utils/firestoreLogger';

export type OnboardingSettings = {
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
  onboardingVersion?: number;
  initialTotalBalance?: number;
};

const getOnboardingRef = (uid: string) => doc(db, 'users', uid, 'settings', 'onboarding');

export const onboardingService = {
  async getStatus(uid: string | null | undefined): Promise<OnboardingSettings | null> {
    if (!uid) {
      console.info('[onboarding] load_skipped', { reason: 'missing_uid' });
      return null;
    }
    const ref = getOnboardingRef(uid);
    const path = `users/${uid}/settings/onboarding`;
    if (!guardUserPath(uid, path, 'onboarding_get')) return null;
    try {
      const snap = await getDoc(ref);
      console.info('[onboarding] load', { path: ref.path, exists: snap.exists() });
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      return {
        onboardingCompleted: Boolean(data?.onboardingCompleted),
        onboardingCompletedAt: (data?.onboardingCompletedAt as string | undefined) || undefined,
        onboardingVersion: (data?.onboardingVersion as number | undefined) || undefined,
        initialTotalBalance: (data?.initialTotalBalance as number | undefined) || undefined
      };
    } catch (error) {
      logPermissionDenied({
        step: 'onboarding_get',
        path: ref.path,
        operation: 'getDoc',
        error,
        licenseId: uid
      });
      console.error('[onboarding] load_error', { message: (error as any)?.message });
      return null;
    }
  },

  async saveStatus(uid: string | null | undefined, patch: OnboardingSettings): Promise<void> {
    if (!uid) {
      console.error('[onboarding] save_skipped', { reason: 'missing_uid' });
      return;
    }
    const ref = getOnboardingRef(uid);
    const path = `users/${uid}/settings/onboarding`;
    if (!guardUserPath(uid, path, 'onboarding_set')) return;
    try {
      await setDoc(
        ref,
        { ...patch, updatedAt: serverTimestamp() },
        { merge: true }
      );
      console.info('[onboarding] save', { path: ref.path, keys: Object.keys(patch) });
    } catch (error) {
      logPermissionDenied({
        step: 'onboarding_set',
        path: ref.path,
        operation: 'setDoc',
        error,
        licenseId: uid
      });
      console.error('[onboarding] save_error', { message: (error as any)?.message });
      throw error;
    }
  }
};
