import { auth } from './firebase';

export type BetaKeyRecord = {
  id: string;
  code: string;
  durationDays: number;
  maxUses: number;
  uses: number;
  isActive: boolean;
  source?: string;
  requestedEmail?: string | null;
  createdAtMs?: number | null;
  expiresAtMs?: number | null;
  lastUsedAtMs?: number | null;
  lastRequestedAtMs?: number | null;
  revokedAtMs?: number | null;
  lifetimeGrantedEmail?: string | null;
  lifetimeGrantedAtMs?: number | null;
};

export type AdminEntitlementPlan = 'lifetime' | 'annual' | 'monthly' | 'days';
export type AdminBulkAction = 'assign_plan' | 'revoke_access';

type BetaKeyResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  message?: string;
};

const request = async <T>(
  path: string,
  payload: Record<string, unknown> | null,
  withAuth: boolean
): Promise<BetaKeyResponse<T>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth && auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: payload ? JSON.stringify(payload) : '{}'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || 'request_failed',
      message: data?.message || 'Não foi possível completar a solicitação.'
    };
  }
  return {
    ok: true,
    status: response.status,
    data
  };
};

export const betaKeysService = {
  async createBetaKey(payload: { durationDays: number; maxUses: number }) {
    return request<{ key: BetaKeyRecord }>(
      '/api/createBetaKey',
      payload,
      true
    );
  },

  async listBetaKeys() {
    return request<{ keys: BetaKeyRecord[] }>('/api/listBetaKeys', null, true);
  },

  async revokeBetaKey(payload: { keyId: string }) {
    return request<{ ok: true }>('/api/revokeBetaKey', payload, true);
  },

  async deleteBetaKey(payload: { keyId: string }) {
    return request<{ ok: true }>('/api/deleteBetaKey', payload, true);
  },

  async grantLifetimeAccess(payload: { email: string; keyId: string; code?: string }) {
    return request<{ email: string; keyId?: string | null; code?: string | null; deletedBetaKeys?: number; emailSent?: boolean }>(
      '/api/grantLifetimeAccess',
      payload,
      true
    );
  },

  async assignEntitlementPlan(payload: {
    email: string;
    plan: AdminEntitlementPlan;
    durationDays?: number;
    keyId?: string;
    code?: string;
  }) {
    return request<{
      email: string;
      planType: string;
      durationDays?: number | null;
      expiresAtMs?: number | null;
      deletedBetaKeys?: number;
      emailSent?: boolean | null;
      matchedBetaKeys?: number;
      betaKeyIds?: string[];
      auditId?: string | null;
    }>(
      '/api/assignEntitlementPlan',
      payload,
      true
    );
  },

  async previewEntitlementPlan(payload: {
    email: string;
    plan: AdminEntitlementPlan;
    durationDays?: number;
    keyId?: string;
    code?: string;
  }) {
    return request<{
      preview?: {
        email: string;
        planType: string;
        durationDays?: number | null;
        expiresAtMs?: number | null;
        beforeState?: Record<string, unknown> | null;
        afterState?: Record<string, unknown> | null;
        cleanup?: {
          matchedBetaKeys: number;
          betaKeyIds: string[];
          betaKeys: Array<Record<string, unknown>>;
        };
      };
    }>(
      '/api/previewEntitlementPlan',
      payload,
      true
    );
  },

  async bulkManageEntitlements(payload: {
    action: AdminBulkAction;
    emails: string[];
    dryRun?: boolean;
    plan?: AdminEntitlementPlan;
    durationDays?: number;
    sendLifetimeEmail?: boolean;
  }) {
    return request<{
      dryRun: boolean;
      action: AdminBulkAction;
      batchId?: string | null;
      total: number;
      successCount: number;
      failCount: number;
      totalMatchedBetaKeys: number;
      totalDeletedBetaKeys: number;
      results: Array<Record<string, unknown>>;
    }>(
      '/api/bulkManageEntitlements',
      payload,
      true
    );
  },

  async listEntitlementAdminAudit(payload?: { email?: string; limit?: number }) {
    return request<{ items: Array<Record<string, unknown>> }>(
      '/api/listEntitlementAdminAudit',
      payload || {},
      true
    );
  },

  async rollbackLastEntitlementAction(payload: { email?: string; actionId?: string }) {
    return request<{
      targetEmail?: string;
      rolledBackActionId?: string;
      rollbackAuditId?: string;
      restoredBetaKeys?: number;
      beforeState?: Record<string, unknown> | null;
      afterState?: Record<string, unknown> | null;
    }>(
      '/api/rollbackLastEntitlementAction',
      payload,
      true
    );
  },

  async searchAdminRecords(payload: { query: string }) {
    return request<{
      query: string;
      result?: {
        users?: Array<Record<string, unknown>>;
        entitlements?: Array<Record<string, unknown>>;
        betaKeys?: Array<Record<string, unknown>>;
        audit?: Array<Record<string, unknown>>;
      };
    }>(
      '/api/searchAdminRecords',
      payload,
      true
    );
  },

  async redeemBetaKey(payload: { code: string; email: string }) {
    return request<{ expiresAtMs: number }>(
      '/api/redeemBetaKey',
      payload,
      Boolean(auth.currentUser)
    );
  },

  async requestTrialKey(payload: { email: string; origin?: string }) {
    return request<{ code?: string; loginUrl?: string; message?: string; status?: string }>(
      '/api/requestTrialKey',
      payload,
      false
    );
  }
};
