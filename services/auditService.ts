import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { guardUserPath } from '../utils/pathGuard';

export type AuditEntityType = 'account' | 'yield' | 'expense' | 'income' | 'system';

export type AuditLogInput = {
  actionType: string;
  description: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  userEmail?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditLog = AuditLogInput & {
  id: string;
  timestamp?: any;
  dateKey?: string;
};

const sortAuditLogs = (items: AuditLog[]) =>
  [...items].sort((a, b) => {
    const aTime = a.timestamp?.toMillis?.() ?? 0;
    const bTime = b.timestamp?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

const mergeAuditLogs = (...groups: AuditLog[][]) => {
  const byId = new Map<string, AuditLog>();
  groups.forEach((items) => {
    items.forEach((item) => {
      if (!item?.id) return;
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    });
  });
  return Array.from(byId.values());
};

const buildDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sanitizeAuditMetadataValue = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAuditMetadataValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === 'function') {
      return value;
    }
    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      const normalized = sanitizeAuditMetadataValue(nested);
      if (normalized !== undefined) sanitized[key] = normalized;
    });
    return Object.keys(sanitized).length ? sanitized : undefined;
  }
  return String(value);
};

export const auditService = {
  async addLog(licenseId: string, entry: AuditLogInput) {
    if (!licenseId) return;
    const normalizedMetadata = sanitizeAuditMetadataValue(entry.metadata);
    const metadata =
      normalizedMetadata && typeof normalizedMetadata === 'object' && !Array.isArray(normalizedMetadata)
        ? (normalizedMetadata as Record<string, unknown>)
        : null;
    const dateKey = buildDateKey(new Date());
    const payload = {
      actionType: String(entry.actionType || '').trim() || 'system_action',
      description: String(entry.description || '').trim() || 'Ação registrada.',
      entityType: entry.entityType || 'system',
      entityId: entry.entityId ?? null,
      userEmail: entry.userEmail ?? null,
      timestamp: serverTimestamp(),
      metadata,
      dateKey
    };
    const path = `users/${licenseId}/auditLogs`;
    if (!guardUserPath(licenseId, path, 'audit_add')) return;
    try {
      await addDoc(collection(db, 'users', licenseId, 'auditLogs'), payload);
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (payload.metadata && /unsupported field value/i.test(message)) {
        await addDoc(collection(db, 'users', licenseId, 'auditLogs'), {
          ...payload,
          metadata: null
        });
        return;
      }
      throw error;
    }
  },

  async loadLogsForDate(licenseId: string, date: Date): Promise<AuditLog[]> {
    if (!licenseId) return [];
    const path = `users/${licenseId}/auditLogs`;
    if (!guardUserPath(licenseId, path, 'audit_load')) return [];
    const ref = collection(db, 'users', licenseId, 'auditLogs');

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const dateKey = buildDateKey(date);

    let timestampItems: AuditLog[] = [];
    try {
      const snap = await getDocs(
        query(ref, where('timestamp', '>=', start), where('timestamp', '<=', end))
      );
      timestampItems = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as AuditLog)
      }));
    } catch (error) {
      timestampItems = [];
    }

    let dateKeyItems: AuditLog[] = [];
    try {
      const snap = await getDocs(query(ref, where('dateKey', '==', dateKey)));
      dateKeyItems = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as AuditLog)
      }));
    } catch (error) {
      dateKeyItems = [];
    }

    return sortAuditLogs(mergeAuditLogs(timestampItems, dateKeyItems));
  },

  async loadLogsForRecentDays(licenseId: string, days: number): Promise<AuditLog[]> {
    if (!licenseId) return [];
    const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(31, Math.floor(days))) : 7;
    const path = `users/${licenseId}/auditLogs`;
    if (!guardUserPath(licenseId, path, 'audit_load_recent')) return [];
    const ref = collection(db, 'users', licenseId, 'auditLogs');

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (safeDays - 1));

    let timestampItems: AuditLog[] = [];
    try {
      const snap = await getDocs(query(ref, where('timestamp', '>=', start)));
      timestampItems = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as AuditLog)
      }));
    } catch (error) {
      timestampItems = [];
    }

    const keys = Array.from({ length: safeDays }, (_, index) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - index);
      return buildDateKey(d);
    });
    const all: AuditLog[] = [];
    const snapshots = await Promise.all(keys.map((key) => getDocs(query(ref, where('dateKey', '==', key)))));
    snapshots.forEach((snap) => {
      snap.docs.forEach(docSnap => {
        all.push({
          id: docSnap.id,
          ...(docSnap.data() as AuditLog)
        });
      });
    });
    return sortAuditLogs(mergeAuditLogs(timestampItems, all));
  }
};
