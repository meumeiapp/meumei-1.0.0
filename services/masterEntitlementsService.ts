import { auth } from './firebase';

export type EntitlementRecord = {
  id: string;
  email: string;
  status?: string | null;
  planType?: string | null;
  source?: string | null;
  expiresAtMs?: number | null;
  subscriptionCurrentPeriodEndMs?: number | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  manualPlanDays?: number | null;
  lifetime?: boolean;
};

type EntitlementsResponse = {
  ok: boolean;
  entitlements?: EntitlementRecord[];
  message?: string;
};

export const masterEntitlementsService = {
  async listEntitlements(): Promise<{ ok: boolean; entitlements?: EntitlementRecord[]; message?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/listEntitlements', {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    const data: EntitlementsResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return { ok: false, message: data?.message || 'Não foi possível carregar acessos.' };
    }
    return { ok: true, entitlements: data.entitlements || [] };
  }
};
