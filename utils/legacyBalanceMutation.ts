type LegacyMutationContext = {
  source: string;
  action: string;
  accountId?: string | null;
  entityId?: string | null;
  amount?: number;
  status?: string;
};

const TTL_MS = 1000;
const appliedMutations = new Map<string, number>();
const debugEnabled = import.meta.env.VITE_DEBUG_BALANCE === 'true';

const prune = () => {
  const now = Date.now();
  for (const [id, timestamp] of appliedMutations.entries()) {
    if (now - timestamp > TTL_MS) {
      appliedMutations.delete(id);
    }
  }
};

export const isBalanceDebugEnabled = () => debugEnabled;

export const shouldApplyLegacyBalanceMutation = (id: string, context: LegacyMutationContext) => {
  prune();
  if (appliedMutations.has(id)) {
    if (debugEnabled) {
      console.info('[legacy-balance-mutation] skip', { id, ...context });
    }
    return false;
  }
  appliedMutations.set(id, Date.now());
  if (debugEnabled) {
    console.info('[legacy-balance-mutation] apply', { id, ...context });
  }
  return true;
};

export const logLegacyBalanceMutation = (context: LegacyMutationContext) => {
  if (!debugEnabled) return;
  console.info('[legacy-balance-mutation]', context);
};
