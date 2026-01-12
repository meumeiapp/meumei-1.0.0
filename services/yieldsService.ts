import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  deleteField,
  setDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { normalizeEmail } from '../utils/normalizeEmail';
import { supportAccessService } from './supportAccessService';
import { cryptoService, getCryptoStatus } from './cryptoService';
import type { LockedReason } from '../types';
import { guardUserPath } from '../utils/pathGuard';

export type YieldRecord = {
  id: string;
  accountId: string;
  amount: number;
  amountEncrypted?: string;
  date: string;
  notes?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdByUid?: string | null;
  createdByEmailNormalized?: string | null;
  updatedByUid?: string | null;
  updatedByEmailNormalized?: string | null;
  source?: string;
  cryptoEpoch?: number;
  locked?: boolean;
  lockedReason?: LockedReason;
};

type YieldDocSnap = Awaited<ReturnType<typeof getDocs>>['docs'][number];

const normalizeNotes = (value?: string | null) =>
  (value ?? '').toString().trim().replace(/\s+/g, ' ');

const sanitizeDocId = (value: string) => value.replace(/\//g, '_');

const buildYieldId = (accountId: string, date: string) =>
  `${sanitizeDocId(accountId)}_${date}`;

const buildYieldRef = (licenseId: string, yieldId: string) =>
  doc(db, 'users', licenseId, 'yields', yieldId);

const resolveDecryptReason = (): LockedReason => {
  const status = getCryptoStatus();
  if (!status.ready) {
    return status.reason === 'missing_salt' ? 'missing_salt' : 'decrypt_failed';
  }
  return 'decrypt_failed';
};

const decryptAmountSafe = async (licenseId: string, encrypted: string): Promise<{ ok: true; value: number } | { ok: false; reason: LockedReason }> => {
  const status = getCryptoStatus();
  if (!status.ready) {
    return { ok: false, reason: status.reason === 'missing_salt' ? 'missing_salt' : 'decrypt_failed' };
  }
  const result = await cryptoService.decryptNumber(licenseId, encrypted, 'yields.amount');
  if (!result.ok) {
    return { ok: false, reason: 'decrypt_failed' };
  }
  return { ok: true, value: result.value };
};

const getActorInfo = () => {
  const current = auth.currentUser;
  let emailNormalized = '';
  if (current?.email) {
    try {
      emailNormalized = normalizeEmail(current.email);
    } catch {
      emailNormalized = current.email.trim().toLowerCase();
    }
  }
  return {
    uid: current?.uid || '',
    emailNormalized
  };
};

const buildYieldRecord = async (
  licenseId: string,
  cryptoEpoch: number,
  docSnap: YieldDocSnap
): Promise<YieldRecord> => {
  const data = docSnap.data() as Record<string, unknown>;
  const itemEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : 0;
  if (itemEpoch !== cryptoEpoch) {
    console.info('[crypto][locked] epoch_mismatch', {
      entity: 'yield',
      id: docSnap.id,
      itemEpoch,
      licenseEpoch: cryptoEpoch
    });
    return {
      id: docSnap.id,
      accountId: String(data.accountId || ''),
      amount: 0,
      amountEncrypted: typeof data.amountEncrypted === 'string' ? data.amountEncrypted : undefined,
      date: String(data.date || ''),
      notes: (data.notes as string | null) || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      createdByUid: (data.createdByUid as string | null) || null,
      createdByEmailNormalized: (data.createdByEmailNormalized as string | null) || null,
      updatedByUid: (data.updatedByUid as string | null) || null,
      updatedByEmailNormalized: (data.updatedByEmailNormalized as string | null) || null,
      source: (data.source as string | null) || 'manual',
      cryptoEpoch: itemEpoch,
      locked: true,
      lockedReason: 'epoch_mismatch'
    };
  }
  const amountEncrypted = typeof data.amountEncrypted === 'string' ? data.amountEncrypted : null;
  const amountPlain = typeof data.amount === 'number' ? data.amount : Number(data.amount || 0);
  let amount = 0;
  let lockedReason: LockedReason | undefined;
  if (amountEncrypted) {
    const result = await decryptAmountSafe(licenseId, amountEncrypted);
    if (!result.ok) {
      amount = 0;
      lockedReason = result.reason;
    } else {
      amount = result.value;
      if (data.amount !== undefined) {
        await setDoc(docSnap.ref, { amount: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
        console.info('[crypto][migrate]', { path: docSnap.ref.path, field: 'amount' });
      }
    }
  } else if (Number.isFinite(amountPlain)) {
    amount = Number(amountPlain);
    const encryptedResult = await cryptoService.encryptNumber(licenseId, amount, 'yields.amount');
    if (encryptedResult.ok) {
      await setDoc(
        docSnap.ref,
        { amountEncrypted: encryptedResult.value, amount: deleteField(), updatedAt: serverTimestamp(), cryptoEpoch },
        { merge: true }
      );
      console.info('[crypto][migrate]', { path: docSnap.ref.path, field: 'amount' });
    } else {
      amount = 0;
      lockedReason = resolveDecryptReason();
    }
  }
  const baseRecord: YieldRecord = {
    id: docSnap.id,
    accountId: String(data.accountId || ''),
    amount,
    amountEncrypted: amountEncrypted || undefined,
    date: String(data.date || ''),
    notes: (data.notes as string | null) || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUid: (data.createdByUid as string | null) || null,
    createdByEmailNormalized: (data.createdByEmailNormalized as string | null) || null,
    updatedByUid: (data.updatedByUid as string | null) || null,
    updatedByEmailNormalized: (data.updatedByEmailNormalized as string | null) || null,
    source: (data.source as string | null) || 'manual',
    cryptoEpoch
  };
  if (lockedReason) {
    return {
      ...baseRecord,
      locked: true,
      lockedReason
    };
  }
  return baseRecord;
};

export const yieldsService = {
  buildYieldId,
  normalizeNotes,

  async addYield(
    licenseId: string,
    payload: { accountId: string; amount: number; date: string; notes?: string },
    cryptoEpoch: number
  ) {
    const { uid, emailNormalized } = getActorInfo();
    if (!licenseId) {
      console.warn('[yields] add_blocked', { reason: 'license_missing', licenseId, uid, emailNormalized });
      return;
    }
    if (!Number.isFinite(cryptoEpoch)) {
      console.warn('[yields] add_blocked', { reason: 'epoch_missing', licenseId, uid, emailNormalized });
      return;
    }
    if (!payload?.accountId) {
      console.warn('[yields] add_blocked', { reason: 'account_missing', licenseId, uid, emailNormalized });
      return;
    }
    if (!payload?.date) {
      console.warn('[yields] add_blocked', { reason: 'date_missing', licenseId, uid, emailNormalized });
      return;
    }
    if (!Number.isFinite(payload.amount)) {
      console.warn('[yields] add_blocked', { reason: 'amount_invalid', licenseId, uid, emailNormalized });
      return;
    }

    const notes = normalizeNotes(payload.notes);
    const yieldId = buildYieldId(payload.accountId, payload.date);
    const ref = buildYieldRef(licenseId, yieldId);
    const path = ref.path;
    if (!guardUserPath(licenseId, path, 'yields_add')) return;
    const amountEncryptedResult = await cryptoService.encryptNumber(licenseId, payload.amount, 'yields.amount');
    if (!amountEncryptedResult.ok) {
      console.warn('[crypto][warn] write blocked', {
        entity: 'yield',
        licenseId,
        accountId: payload.accountId,
        date: payload.date
      });
      console.warn('[yields] add_blocked', {
        reason: amountEncryptedResult.reason,
        licenseId,
        accountId: payload.accountId,
        date: payload.date
      });
      return;
    }
    const amountEncrypted = amountEncryptedResult.value;

    console.info('[yields] add_start', {
      licenseId,
      path,
      yieldId,
      accountId: payload.accountId,
      amount: payload.amount,
      date: payload.date,
      cryptoEpoch,
      uid,
      emailNormalized
    });

    try {
      const snap = await getDoc(ref);
      const nowFields = {
        updatedAt: serverTimestamp(),
        updatedByUid: uid || null,
        updatedByEmailNormalized: emailNormalized || null
      };
      const baseFields = snap.exists()
        ? {}
        : {
            createdAt: serverTimestamp(),
            createdByUid: uid || null,
            createdByEmailNormalized: emailNormalized || null
          };

      await setDoc(
        ref,
        {
          accountId: payload.accountId,
          amountEncrypted,
          cryptoEpoch,
          date: payload.date,
          notes: notes || null,
          source: 'manual',
          ...baseFields,
          ...nowFields
        },
        { merge: true }
      );

      console.info('[yields] add_ok', {
        licenseId,
        path,
        yieldId,
        accountId: payload.accountId
      });
      console.info('[sync][write] yield ok', { licenseId, yieldId, accountId: payload.accountId });
    } catch (error: any) {
      console.error('[yields] add_err', {
        licenseId,
        path,
        yieldId,
        code: error?.code,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async loadYields(licenseId: string, cryptoEpoch: number): Promise<YieldRecord[]> {
    const { uid, emailNormalized } = getActorInfo();
    if (!Number.isFinite(cryptoEpoch)) {
      console.warn('[yields] load_blocked', { licenseId, reason: 'epoch_missing' });
      return [];
    }
    const ref = collection(db, 'users', licenseId, 'yields');
    const path = `users/${licenseId}/yields`;
    if (!guardUserPath(licenseId, path, 'yields_load')) return [];
    console.info('[yields] load_start', { licenseId, path, uid, emailNormalized });
    try {
      const snap = await getDocs(ref);
      const items = await Promise.all(
        snap.docs.map(docSnap => buildYieldRecord(licenseId, cryptoEpoch, docSnap))
      );
      const preview = items.slice(0, 5).map(item => ({
        id: item.id,
        accountId: item.accountId,
        amount: item.amount,
        date: item.date,
        notes: item.notes || null
      }));
      console.info('[yields] load_ok', { licenseId, count: items.length, itemsPreview: preview, source: 'firestore' });
      void supportAccessService.logSupportRead(licenseId, { collection: 'yields', count: items.length });
      return items;
    } catch (error: any) {
      console.error('[yields] load_err', { licenseId, path, code: error?.code, message: error?.message || error, stack: error?.stack });
      throw error;
    }
  },

  subscribeYields(
    licenseId: string,
    params: { licenseEpoch: number },
    onData: (items: YieldRecord[]) => void,
    onError?: (error: unknown) => void
  ) {
    if (!Number.isFinite(params.licenseEpoch)) {
      console.warn('[yields] subscribe_blocked', { licenseId, reason: 'epoch_missing' });
      onData([]);
      return () => {};
    }
    const ref = collection(db, 'users', licenseId, 'yields');
    const path = `users/${licenseId}/yields`;
    if (!guardUserPath(licenseId, path, 'yields_subscribe')) {
      onData([]);
      return () => {};
    }
    const q = query(ref);
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(docSnap => buildYieldRecord(licenseId, params.licenseEpoch, docSnap))
          );
          onData(items);
        } catch (error) {
          onError?.(error);
        }
      },
      (error) => {
        onError?.(error);
      }
    );
    return unsubscribe;
  }
};
