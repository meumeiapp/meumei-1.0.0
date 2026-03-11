import { Account } from '../types';

export const TOUR_SIMULATED_ACCOUNT_PREFIX = '__tour_sim_account__';
const TOUR_SIMULATED_ACCOUNTS_STORAGE_KEY = 'meumei:tour:simulated_accounts:v1';

const safeParseAccounts = (raw: string | null): Account[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string');
  } catch {
    return [];
  }
};

export const readTourSimulatedAccounts = (): Account[] => {
  if (typeof window === 'undefined') return [];
  try {
    return safeParseAccounts(window.localStorage.getItem(TOUR_SIMULATED_ACCOUNTS_STORAGE_KEY));
  } catch {
    return [];
  }
};

export const upsertTourSimulatedAccount = (account: Account): Account[] => {
  const current = readTourSimulatedAccounts();
  const index = current.findIndex((item) => item.id === account.id);
  const next =
    index >= 0
      ? current.map((item, idx) => (idx === index ? { ...item, ...account } : item))
      : [account, ...current];

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(TOUR_SIMULATED_ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // no-op
    }
  }
  return next;
};

export const clearTourSimulatedAccounts = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOUR_SIMULATED_ACCOUNTS_STORAGE_KEY);
  } catch {
    // no-op
  }
};

