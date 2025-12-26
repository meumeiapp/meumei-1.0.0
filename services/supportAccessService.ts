import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { normalizeEmail } from '../utils/normalizeEmail';
import { auditService } from './auditService';

export type SupportAccessStatus = 'granted' | 'denied' | 'expired' | 'error' | 'owner';

type SupportAccessState = {
  active: boolean;
  status: SupportAccessStatus;
  checkedAt: number;
  expiresAtMs?: number | null;
};

const CACHE_TTL_MS = 60_000;
const supportAccessCache = new Map<string, SupportAccessState>();

const normalizeValue = (value: string) => {
  try {
    return normalizeEmail(value);
  } catch {
    return value.trim().toLowerCase().replace(/\s+/g, '');
  }
};

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
};

const logSupportStatus = (status: SupportAccessStatus, payload: Record<string, unknown>) => {
  if (status === 'granted') {
    console.info('[support] access granted', payload);
    return;
  }
  if (status === 'expired') {
    console.info('[support] access expired', payload);
    return;
  }
  if (status === 'denied') {
    console.info('[support] access denied', payload);
    return;
  }
};

export const supportAccessService = {
  async checkAccess(licenseId: string): Promise<SupportAccessState> {
    const now = Date.now();
    const currentEmail = auth.currentUser?.email || '';
    if (!licenseId || !currentEmail) {
      const state = { active: false, status: 'denied', checkedAt: now, expiresAtMs: null };
      return state;
    }
    const normalizedEmail = normalizeValue(currentEmail);
    const normalizedLicenseId = normalizeValue(licenseId);
    if (normalizedEmail === normalizedLicenseId) {
      return { active: false, status: 'owner', checkedAt: now, expiresAtMs: null };
    }

    const cacheKey = `${licenseId}:${normalizedEmail}`;
    const cached = supportAccessCache.get(cacheKey);
    if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
      return cached;
    }

    const ref = doc(db, 'licenses', licenseId, 'supportAccess', normalizedEmail);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const state = { active: false, status: 'denied', checkedAt: now, expiresAtMs: null };
        supportAccessCache.set(cacheKey, state);
        logSupportStatus('denied', { licenseId, email: normalizedEmail });
        return state;
      }

      const data = snap.data() as Record<string, unknown>;
      const allowed = data.allowed === true;
      const expiresAtMs = toMillis(data.expiresAt);
      if (!allowed) {
        const state = { active: false, status: 'denied', checkedAt: now, expiresAtMs };
        supportAccessCache.set(cacheKey, state);
        logSupportStatus('denied', { licenseId, email: normalizedEmail });
        return state;
      }
      if (!expiresAtMs || expiresAtMs <= now) {
        const state = { active: false, status: 'expired', checkedAt: now, expiresAtMs };
        supportAccessCache.set(cacheKey, state);
        logSupportStatus('expired', { licenseId, email: normalizedEmail, expiresAtMs });
        return state;
      }

      const state = { active: true, status: 'granted', checkedAt: now, expiresAtMs };
      supportAccessCache.set(cacheKey, state);
      logSupportStatus('granted', { licenseId, email: normalizedEmail, expiresAtMs });
      return state;
    } catch (error: any) {
      console.error('[support] access denied', { licenseId, email: normalizedEmail, message: error?.message });
      const state = { active: false, status: 'error', checkedAt: now, expiresAtMs: null };
      supportAccessCache.set(cacheKey, state);
      return state;
    }
  },

  async logSupportRead(licenseId: string, payload: { collection: string; count: number }) {
    try {
      const access = await this.checkAccess(licenseId);
      if (!access.active) return;
      await auditService.addLog(licenseId, {
        actionType: 'support_read',
        description: `Suporte leu ${payload.collection} (${payload.count} registros).`,
        entityType: 'system',
        entityId: null,
        userEmail: auth.currentUser?.email ?? null,
        metadata: {
          collection: payload.collection,
          count: payload.count
        }
      });
    } catch (error) {
      console.error('[support] access denied', { licenseId, message: (error as any)?.message });
    }
  }
};
