import { auth } from './firebase';

export type MasterMetrics = {
  totalSales: number;
  revenueEstimateCents: number | null;
  companies: number;
  activeUsersThisMonth: number;
  entitlementsActive: number;
  entitlementsExpired: number;
  betaKeysCreated: number;
  betaKeysUsed: number;
  stripeAnnualCount: number;
  stripeMonthlyCount: number;
  userGrowthMonthly?: Array<{
    periodKey: string;
    label: string;
    newUsers: number;
    cumulativeUsers: number;
  }>;
  userGrowthAnnual?: Array<{
    periodKey: string;
    label: string;
    newUsers: number;
    cumulativeUsers: number;
  }>;
  growthCurrentMonthKey?: string;
  growthCurrentYearKey?: string;
  lastUpdatedAtMs?: number | null;
};

type MetricsResponse = {
  ok: boolean;
  metrics?: MasterMetrics;
  message?: string;
};

export const masterMetricsService = {
  async getMetrics(): Promise<{ ok: boolean; metrics?: MasterMetrics; message?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/masterMetrics', {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    const data: MetricsResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return { ok: false, message: data?.message || 'Não foi possível carregar métricas.' };
    }
    return { ok: true, metrics: data.metrics };
  }
};
