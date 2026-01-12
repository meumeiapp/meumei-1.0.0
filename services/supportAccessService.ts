import { auth } from './firebase';
import { auditService } from './auditService';

export type SupportAccessStatus = 'granted' | 'denied' | 'expired' | 'error' | 'owner';

type SupportAccessState = {
  active: boolean;
  status: SupportAccessStatus;
  checkedAt: number;
  expiresAtMs?: number | null;
};

export const supportAccessService = {
  async checkAccess(userId: string): Promise<SupportAccessState> {
    const now = Date.now();
    const uid = auth.currentUser?.uid || '';
    if (!uid || !userId) {
      return { active: false, status: 'denied', checkedAt: now, expiresAtMs: null };
    }
    if (uid === userId) {
      return { active: false, status: 'owner', checkedAt: now, expiresAtMs: null };
    }
    return { active: false, status: 'denied', checkedAt: now, expiresAtMs: null };
  },

  async logSupportRead(userId: string, payload: { collection: string; count: number }) {
    try {
      const access = await this.checkAccess(userId);
      if (!access.active) return;
      await auditService.addLog(userId, {
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
      console.error('[support] access denied', { userId, message: (error as any)?.message });
    }
  }
};
