import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { preferencesService } from '../services/preferencesService';

export type DashboardBlockId =
  | 'quick_access'
  | 'mei_limit'
  | 'financial_xray'
  | 'credit_cards'
  | 'expense_breakdown';

export type DashboardLayout = {
  order: DashboardBlockId[];
  hidden: DashboardBlockId[];
};

const DEFAULT_ORDER: DashboardBlockId[] = [
  'quick_access',
  'mei_limit',
  'financial_xray',
  'credit_cards',
  'expense_breakdown'
];

const DEFAULT_LAYOUT: DashboardLayout = {
  order: DEFAULT_ORDER,
  hidden: []
};

const normalizeLayout = (raw: Partial<DashboardLayout> | null | undefined): DashboardLayout => {
  const orderInput = Array.isArray(raw?.order) ? raw!.order : [];
  const order = orderInput.filter((id): id is DashboardBlockId =>
    DEFAULT_ORDER.includes(id as DashboardBlockId)
  );
  DEFAULT_ORDER.forEach(id => {
    if (!order.includes(id)) order.push(id);
  });
  const hiddenInput = Array.isArray(raw?.hidden) ? raw!.hidden : [];
  const hidden = hiddenInput.filter((id): id is DashboardBlockId =>
    DEFAULT_ORDER.includes(id as DashboardBlockId)
  );
  return { order, hidden };
};

export const useDashboardLayout = () => {
  const { user } = useAuth();
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    if (!uid) {
      setLayout(DEFAULT_LAYOUT);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    preferencesService
      .getDashboardLayout(uid)
      .then((stored) => {
        if (!active) return;
        setLayout(normalizeLayout(stored || undefined));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLayout(DEFAULT_LAYOUT);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const persistLayout = useCallback(
    async (next: DashboardLayout) => {
      setLayout(next);
      const uid = user?.uid;
      if (!uid) return;
      try {
        await preferencesService.setDashboardLayout(uid, next);
      } catch {}
    },
    [user?.uid]
  );

  const moveBlock = useCallback(
    (id: DashboardBlockId, direction: 'up' | 'down') => {
      const currentIndex = layout.order.indexOf(id);
      if (currentIndex === -1) return;
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= layout.order.length) return;
      const nextOrder = [...layout.order];
      const [moved] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(nextIndex, 0, moved);
      void persistLayout({ ...layout, order: nextOrder });
    },
    [layout, persistLayout]
  );

  const toggleHidden = useCallback(
    (id: DashboardBlockId) => {
      const hidden = new Set(layout.hidden);
      if (hidden.has(id)) {
        hidden.delete(id);
      } else {
        hidden.add(id);
      }
      void persistLayout({ ...layout, hidden: Array.from(hidden) });
    },
    [layout, persistLayout]
  );

  const resetLayout = useCallback(() => {
    void persistLayout(DEFAULT_LAYOUT);
  }, [persistLayout]);

  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);

  return {
    layout,
    loading,
    hiddenSet,
    moveUp: (id: DashboardBlockId) => moveBlock(id, 'up'),
    moveDown: (id: DashboardBlockId) => moveBlock(id, 'down'),
    setOrder: (order: DashboardBlockId[]) => {
      const normalized = normalizeLayout({ order, hidden: layout.hidden });
      void persistLayout(normalized);
    },
    toggleHidden,
    resetLayout
  };
};
