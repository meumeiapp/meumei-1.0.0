import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

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

const buildDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const auditService = {
  async addLog(licenseId: string, entry: AuditLogInput) {
    if (!licenseId) return;
    const dateKey = buildDateKey(new Date());
    const payload = {
      actionType: entry.actionType,
      description: entry.description,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      userEmail: entry.userEmail ?? null,
      timestamp: serverTimestamp(),
      metadata: entry.metadata ?? null,
      dateKey
    };
    await addDoc(collection(db, 'licenses', licenseId, 'auditLogs'), payload);
  },

  async loadLogsForDate(licenseId: string, date: Date): Promise<AuditLog[]> {
    if (!licenseId) return [];
    const dateKey = buildDateKey(date);
    const ref = collection(db, 'licenses', licenseId, 'auditLogs');
    const snap = await getDocs(query(ref, where('dateKey', '==', dateKey)));
    const items = snap.docs
      .map(docSnap => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          ...(data as AuditLog)
        };
      });

    return items.sort((a, b) => {
      const aTime = a.timestamp?.toMillis?.() ?? 0;
      const bTime = b.timestamp?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
  }
};
