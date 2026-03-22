
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc, 
    getDoc,
    getDocFromServer,
    onSnapshot,
    writeBatch,
    limit,
    deleteField,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Account, Expense, Income, CreditCard, CompanyInfo, LicenseRecord, LockedReason, AgendaItem, Transfer } from '../types';
import { normalizeExpenseStatus, normalizeIncomeStatus } from '../utils/statusUtils';
import {
    inferIncomeFiscalNature,
    normalizeIncomeFiscalNature,
    resolveIncomeFiscalNature
} from '../utils/incomeFiscalNature';
import { logPermissionDenied } from '../utils/firestoreLogger';
import { guardUserPath } from '../utils/pathGuard';
import { supportAccessService } from './supportAccessService';
import { cryptoService, getCryptoStatus } from './cryptoService';

// Nome das coleções no Firestore
const COLLECTIONS = {
    LICENSES: 'users',
    ACCOUNTS: 'accounts',
    EXPENSES: 'expenses',
    INCOMES: 'incomes',
    TRANSFERS: 'transfers',
    CREDIT_CARDS: 'credit_cards',
    INVOICES: 'invoices',
    AGENDA: 'agenda',
    FEEDBACK_MESSAGES: 'feedback_messages'
};

type BalanceHistoryEntry = NonNullable<Account['balanceHistory']>[number];

const isPlainObject = (value: unknown): value is Record<string, any> => {
    return Object.prototype.toString.call(value) === '[object Object]';
};

const logUsingPath = (path: string, reason: 'primary' | 'fallback_legacy') => {
    console.info('[data] using_path', { path, reason });
};

const logReadOk = (collection: string, count: number) => {
    console.info('[data] read_ok', { collection, count });
};

const logReadFailed = (collection: string, message: string) => {
    console.warn('[data] read_failed', { collection, message });
};

const logEpochMismatch = (payload: { entity: string; id: string; itemEpoch: number; licenseEpoch: number }) => {
    console.info('[crypto][locked] epoch_mismatch', payload);
};

const sanitizeData = <T>(data: T): T => {
    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item)) as T;
    }

    if (isPlainObject(data)) {
        const cleaned: Record<string, any> = {};
        Object.entries(data).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }
            if (Array.isArray(value) || isPlainObject(value)) {
                cleaned[key] = sanitizeData(value);
            } else {
                cleaned[key] = value;
            }
        });
        return cleaned as T;
    }

    return data;
};

const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeTransferStatus = (value: unknown): Transfer['status'] => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pending') return 'pending';
    if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
    return 'completed';
};

const decryptNumberSafe = async (licenseId: string, encrypted: string, fieldName: string) => {
    const status = getCryptoStatus();
    if (!status.ready) {
        return { ok: false, value: 0, reason: status.reason === 'missing_salt' ? 'missing_salt' : 'decrypt_failed' };
    }
    const result = await cryptoService.decryptNumber(licenseId, encrypted, fieldName);
    if (!result.ok) {
        return { ok: false, value: 0, reason: 'decrypt_failed' };
    }
    return { ok: true, value: result.value };
};

const encryptNumberSafe = async (licenseId: string, value: number, fieldName: string) => {
    const result = await cryptoService.encryptNumber(licenseId, value, fieldName);
    if (!result.ok) {
        return { ok: false, reason: result.reason };
    }
    return { ok: true, value: result.value };
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatLocalDateISO = (date: Date) => {
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const normalizeCompanyStartDate = (value: unknown): string => {
    if (!value) return '';
    if (value instanceof Date) return formatLocalDateISO(value);
    if (typeof value === 'object') {
        const maybeTimestamp = value as { toDate?: () => Date };
        if (typeof maybeTimestamp.toDate === 'function') {
            return formatLocalDateISO(maybeTimestamp.toDate());
        }
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const isoParts = trimmed.split('T');
        if (isoParts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(isoParts[0])) {
            const parsed = new Date(trimmed);
            const localIso = formatLocalDateISO(parsed);
            return localIso || isoParts[0];
        }
        const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brMatch) {
            return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
        }
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return formatLocalDateISO(parsed);
        }
        return trimmed;
    }
    return '';
};

export const getLicenseDocRef = (licenseId: string) => doc(db, COLLECTIONS.LICENSES, licenseId);
export const getUserDocRef = (uid: string) => doc(db, 'users', uid);

export const getAccountsCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.ACCOUNTS);

export const getExpensesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.EXPENSES);

export const getIncomesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.INCOMES);

export const getTransfersCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.TRANSFERS);

export const getAgendaCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.AGENDA);

export const getInvoicesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.INVOICES);

export const getCreditCardsCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.CREDIT_CARDS);

export const getFeedbackMessagesCollectionRef = (uid: string) =>
    collection(db, COLLECTIONS.LICENSES, uid, COLLECTIONS.FEEDBACK_MESSAGES);

const licenseCollectionDoc = (licenseId: string, collectionName: string, docId: string) => {
    return doc(db, COLLECTIONS.LICENSES, licenseId, collectionName, docId);
};

const decryptAccountHistoryEntry = async (licenseId: string, entry: Record<string, any>) => {
    const plainEntry: Record<string, any> = { ...entry };
    const encryptedEntry: Record<string, any> = { ...entry };
    let needsMigration = false;
    let decryptFailed = false;
    let failReason: LockedReason | undefined;

    const handleField = async (field: string, encryptedField: string) => {
        const encryptedValue = typeof entry[encryptedField] === 'string' ? entry[encryptedField] : null;
        const plainValue = toNumber(entry[field]);
        if (encryptedValue) {
            const result = await decryptNumberSafe(licenseId, encryptedValue, `balanceHistory.${field}`);
            if (!result.ok) {
                decryptFailed = true;
                failReason = failReason ?? result.reason;
                plainEntry[field] = 0;
                delete plainEntry[encryptedField];
                return;
            } else {
                plainEntry[field] = result.value;
            }
            delete plainEntry[encryptedField];
            if (entry[field] !== undefined) {
                delete encryptedEntry[field];
                needsMigration = true;
            }
            return;
        }
        if (plainValue !== null) {
            const encryptedResult = await encryptNumberSafe(licenseId, plainValue, `balanceHistory.${field}`);
            if (!encryptedResult.ok) {
                decryptFailed = true;
                failReason = failReason ?? 'decrypt_failed';
                plainEntry[field] = 0;
                return;
            }
            plainEntry[field] = plainValue;
            encryptedEntry[encryptedField] = encryptedResult.value;
            delete encryptedEntry[field];
            delete plainEntry[encryptedField];
            needsMigration = true;
        }
    };

    await handleField('value', 'valueEncrypted');
    await handleField('previousValue', 'previousValueEncrypted');
    await handleField('newValue', 'newValueEncrypted');
    await handleField('delta', 'deltaEncrypted');

    if (plainEntry.value === undefined || plainEntry.value === null) {
        plainEntry.value = 0;
    }

    return { plainEntry, encryptedEntry, needsMigration, decryptFailed, failReason };
};

const decryptAccountDoc = async (
    licenseId: string,
    licenseEpoch: number,
    docSnap: Awaited<ReturnType<typeof getDocs>>['docs'][number]
): Promise<Account> => {
    const data = docSnap.data() as Record<string, any>;
    const ref = docSnap.ref;
    const updates: Record<string, any> = {};
    const itemEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : 0;
    const { currentBalanceEncrypted: _cbe, initialBalanceEncrypted: _ibe, ...rest } = data;

    if (itemEpoch !== licenseEpoch) {
        logEpochMismatch({ entity: 'account', id: docSnap.id, itemEpoch, licenseEpoch });
        return {
            id: docSnap.id,
            ...(rest as Account),
            currentBalance: 0,
            initialBalance: 0,
            balanceHistory: [],
            locked: true,
            lockedReason: 'epoch_mismatch'
        };
    }

    const currentBalanceEncrypted = typeof data.currentBalanceEncrypted === 'string' ? data.currentBalanceEncrypted : null;
    const initialBalanceEncrypted = typeof data.initialBalanceEncrypted === 'string' ? data.initialBalanceEncrypted : null;
    const currentBalancePlain = toNumber(data.currentBalance);
    const initialBalancePlain = toNumber(data.initialBalance);
    let decryptFailed = false;
    let lockedReason: LockedReason | undefined;

    let currentBalance = 0;
    if (currentBalanceEncrypted) {
        const result = await decryptNumberSafe(licenseId, currentBalanceEncrypted, 'accounts.currentBalance');
        if (!result.ok) {
            decryptFailed = true;
            lockedReason = lockedReason ?? result.reason;
            currentBalance = 0;
        } else {
            currentBalance = result.value;
            if (data.currentBalance !== undefined) {
                updates.currentBalance = deleteField();
            }
        }
    } else if (currentBalancePlain !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, currentBalancePlain, 'accounts.currentBalance');
        if (!encryptedResult.ok) {
            decryptFailed = true;
            lockedReason = lockedReason ?? 'decrypt_failed';
            currentBalance = 0;
        } else {
            currentBalance = currentBalancePlain;
            updates.currentBalanceEncrypted = encryptedResult.value;
            updates.currentBalance = deleteField();
        }
    }

    let initialBalance = 0;
    if (initialBalanceEncrypted) {
        const result = await decryptNumberSafe(licenseId, initialBalanceEncrypted, 'accounts.initialBalance');
        if (!result.ok) {
            decryptFailed = true;
            lockedReason = lockedReason ?? result.reason;
            initialBalance = 0;
        } else {
            initialBalance = result.value;
            if (data.initialBalance !== undefined) {
                updates.initialBalance = deleteField();
            }
        }
    } else if (initialBalancePlain !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, initialBalancePlain, 'accounts.initialBalance');
        if (!encryptedResult.ok) {
            decryptFailed = true;
            lockedReason = lockedReason ?? 'decrypt_failed';
            initialBalance = 0;
        } else {
            initialBalance = initialBalancePlain;
            updates.initialBalanceEncrypted = encryptedResult.value;
            updates.initialBalance = deleteField();
        }
    }

    let balanceHistory: Account['balanceHistory'] | undefined = undefined;
    if (Array.isArray(data.balanceHistory)) {
        const nextHistory: BalanceHistoryEntry[] = [];
        const encryptedHistory: Record<string, any>[] = [];
        let historyNeedsMigration = false;
        for (const entry of data.balanceHistory) {
            const { plainEntry, encryptedEntry, needsMigration, decryptFailed: entryFailed, failReason } = await decryptAccountHistoryEntry(
                licenseId,
                entry || {}
            );
            nextHistory.push(plainEntry as BalanceHistoryEntry);
            encryptedHistory.push(needsMigration ? encryptedEntry : entry);
            if (needsMigration) {
                historyNeedsMigration = true;
            }
            if (entryFailed) {
                decryptFailed = true;
                lockedReason = lockedReason ?? failReason ?? 'decrypt_failed';
            }
        }
        balanceHistory = nextHistory;
        if (historyNeedsMigration) {
            updates.balanceHistory = encryptedHistory;
        }
    }

    if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await setDoc(ref, sanitizeData(updates), { merge: true });
        console.info('[crypto][migrate]', { path: ref.path, fields: Object.keys(updates) });
    }

    if (decryptFailed) {
        return {
            id: docSnap.id,
            ...(rest as Account),
            currentBalance: 0,
            initialBalance: 0,
            balanceHistory: [],
            locked: true,
            decryptError: true,
            lockedReason: lockedReason ?? 'decrypt_failed'
        };
    }

    return {
        id: docSnap.id,
        ...(rest as Account),
        currentBalance,
        initialBalance,
        balanceHistory
    };
};

const decryptExpenseDoc = async (
    licenseId: string,
    licenseEpoch: number,
    docSnap: Awaited<ReturnType<typeof getDocs>>['docs'][number]
): Promise<Expense> => {
    const data = docSnap.data() as Record<string, any>;
    const ref = docSnap.ref;
    const itemEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : 0;
    if (itemEpoch !== licenseEpoch) {
        logEpochMismatch({ entity: 'expense', id: docSnap.id, itemEpoch, licenseEpoch });
        const { amountEncrypted: _ae, ...rest } = data;
        const normalizedStatus = normalizeExpenseStatus(rest.status);
        return {
            id: docSnap.id,
            ...(rest as Expense),
            status: normalizedStatus,
            amount: 0,
            locked: true,
            lockedReason: 'epoch_mismatch'
        };
    }
    const amountEncrypted = typeof data.amountEncrypted === 'string' ? data.amountEncrypted : null;
    const amountPlain = toNumber(data.amount);
    let amount = 0;
    let lockedReason: LockedReason | undefined;

    if (amountEncrypted) {
        const result = await decryptNumberSafe(licenseId, amountEncrypted, 'expenses.amount');
        if (!result.ok) {
            amount = 0;
            lockedReason = result.reason;
        } else {
            amount = result.value;
            if (data.amount !== undefined) {
                await setDoc(ref, { amount: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
                console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
            }
        }
    } else if (amountPlain !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amountPlain, 'expenses.amount');
        if (!encryptedResult.ok) {
            amount = 0;
            lockedReason = 'decrypt_failed';
        } else {
            amount = amountPlain;
            await setDoc(
                ref,
                { amountEncrypted: encryptedResult.value, amount: deleteField(), updatedAt: serverTimestamp(), cryptoEpoch: licenseEpoch },
                { merge: true }
            );
            console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
        }
    }

    const { amountEncrypted: _ae, ...rest } = data;
    const normalizedStatus = normalizeExpenseStatus(rest.status);
    if (lockedReason) {
        return {
            id: docSnap.id,
            ...(rest as Expense),
            status: normalizedStatus,
            amount,
            locked: true,
            lockedReason
        };
    }
    return { id: docSnap.id, ...(rest as Expense), status: normalizedStatus, amount };
};

const decryptIncomeDoc = async (
    licenseId: string,
    licenseEpoch: number,
    docSnap: Awaited<ReturnType<typeof getDocs>>['docs'][number]
): Promise<Income> => {
    const data = docSnap.data() as Record<string, any>;
    const ref = docSnap.ref;
    const itemEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : 0;
    if (itemEpoch !== licenseEpoch) {
        logEpochMismatch({ entity: 'income', id: docSnap.id, itemEpoch, licenseEpoch });
        const { amountEncrypted: _ae, ...rest } = data;
        const normalizedStatus = normalizeIncomeStatus(rest.status);
        const naturezaFiscal = resolveIncomeFiscalNature({
            naturezaFiscal: rest.naturezaFiscal,
            description: typeof rest.description === 'string' ? rest.description : '',
            category: typeof rest.category === 'string' ? rest.category : ''
        });
        return {
            id: docSnap.id,
            ...(rest as Income),
            status: normalizedStatus,
            naturezaFiscal,
            amount: 0,
            locked: true,
            lockedReason: 'epoch_mismatch'
        };
    }
    const amountEncrypted = typeof data.amountEncrypted === 'string' ? data.amountEncrypted : null;
    const amountPlain = toNumber(data.amount);
    let amount = 0;
    let lockedReason: LockedReason | undefined;

    if (amountEncrypted) {
        const result = await decryptNumberSafe(licenseId, amountEncrypted, 'incomes.amount');
        if (!result.ok) {
            amount = 0;
            lockedReason = result.reason;
        } else {
            amount = result.value;
            if (data.amount !== undefined) {
                await setDoc(ref, { amount: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
                console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
            }
        }
    } else if (amountPlain !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amountPlain, 'incomes.amount');
        if (!encryptedResult.ok) {
            amount = 0;
            lockedReason = 'decrypt_failed';
        } else {
            amount = amountPlain;
            await setDoc(
                ref,
                { amountEncrypted: encryptedResult.value, amount: deleteField(), updatedAt: serverTimestamp(), cryptoEpoch: licenseEpoch },
                { merge: true }
            );
            console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
        }
    }

    const { amountEncrypted: _ae, ...rest } = data;
    const normalizedStatus = normalizeIncomeStatus(rest.status);
    const naturezaFiscal = resolveIncomeFiscalNature({
        naturezaFiscal: rest.naturezaFiscal,
        description: typeof rest.description === 'string' ? rest.description : '',
        category: typeof rest.category === 'string' ? rest.category : ''
    });
    if (lockedReason) {
        return {
            id: docSnap.id,
            ...(rest as Income),
            status: normalizedStatus,
            naturezaFiscal,
            amount,
            locked: true,
            lockedReason
        };
    }
    return { id: docSnap.id, ...(rest as Income), status: normalizedStatus, naturezaFiscal, amount };
};

const decryptTransferDoc = async (
    licenseId: string,
    licenseEpoch: number,
    docSnap: Awaited<ReturnType<typeof getDocs>>['docs'][number]
): Promise<Transfer> => {
    const data = docSnap.data() as Record<string, any>;
    const ref = docSnap.ref;
    const itemEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : 0;
    if (itemEpoch !== licenseEpoch) {
        logEpochMismatch({ entity: 'transfer', id: docSnap.id, itemEpoch, licenseEpoch });
        const { amountEncrypted: _ae, ...rest } = data;
        return {
            id: docSnap.id,
            ...(rest as Transfer),
            fromAccountId:
                typeof data.fromAccountId === 'string'
                    ? data.fromAccountId
                    : (typeof data.sourceAccountId === 'string' ? data.sourceAccountId : ''),
            toAccountId:
                typeof data.toAccountId === 'string'
                    ? data.toAccountId
                    : (typeof data.destinationAccountId === 'string' ? data.destinationAccountId : ''),
            status: normalizeTransferStatus(rest.status),
            amount: 0,
            locked: true,
            lockedReason: 'epoch_mismatch'
        };
    }

    const amountEncrypted = typeof data.amountEncrypted === 'string' ? data.amountEncrypted : null;
    const amountPlain = toNumber(data.amount);
    let amount = 0;
    let lockedReason: LockedReason | undefined;

    if (amountEncrypted) {
        const result = await decryptNumberSafe(licenseId, amountEncrypted, 'transfers.amount');
        if (!result.ok) {
            amount = 0;
            lockedReason = result.reason;
        } else {
            amount = result.value;
            if (data.amount !== undefined) {
                await setDoc(ref, { amount: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
                console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
            }
        }
    } else if (amountPlain !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amountPlain, 'transfers.amount');
        if (!encryptedResult.ok) {
            amount = 0;
            lockedReason = 'decrypt_failed';
        } else {
            amount = amountPlain;
            await setDoc(
                ref,
                { amountEncrypted: encryptedResult.value, amount: deleteField(), updatedAt: serverTimestamp(), cryptoEpoch: licenseEpoch },
                { merge: true }
            );
            console.info('[crypto][migrate]', { path: ref.path, field: 'amount' });
        }
    }

    const { amountEncrypted: _ae, ...rest } = data;
    const normalized: Transfer = {
        id: docSnap.id,
        ...(rest as Transfer),
        fromAccountId:
            typeof data.fromAccountId === 'string'
                ? data.fromAccountId
                : (typeof data.sourceAccountId === 'string' ? data.sourceAccountId : ''),
        toAccountId:
            typeof data.toAccountId === 'string'
                ? data.toAccountId
                : (typeof data.destinationAccountId === 'string' ? data.destinationAccountId : ''),
        status: normalizeTransferStatus(rest.status),
        amount
    };

    if (lockedReason) {
        return {
            ...normalized,
            locked: true,
            lockedReason
        };
    }

    return normalized;
};

const buildAccountPayload = async (licenseId: string, licenseEpoch: number, acc: Account) => {
    const payload: Record<string, any> = { ...acc, licenseId };
    delete payload.locked;
    delete payload.decryptError;
    delete payload.lockedReason;
    delete payload.currentBalanceEncrypted;
    delete payload.initialBalanceEncrypted;
    payload.cryptoEpoch = licenseEpoch;
    const currentBalance = toNumber(acc.currentBalance);
    if (currentBalance !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, currentBalance, 'accounts.currentBalance');
        if (!encryptedResult.ok) {
            return null;
        }
        payload.currentBalanceEncrypted = encryptedResult.value;
        delete payload.currentBalance;
    }
    const initialBalance = toNumber(acc.initialBalance);
    if (initialBalance !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, initialBalance, 'accounts.initialBalance');
        if (!encryptedResult.ok) {
            return null;
        }
        payload.initialBalanceEncrypted = encryptedResult.value;
        delete payload.initialBalance;
    }
    if (Array.isArray(acc.balanceHistory)) {
        const encryptedHistory: Record<string, any>[] = [];
        for (const entry of acc.balanceHistory) {
            const encryptedEntry: Record<string, any> = { ...entry };
            const value = toNumber(entry.value);
            if (value !== null) {
                const encryptedResult = await encryptNumberSafe(licenseId, value, 'balanceHistory.value');
                if (!encryptedResult.ok) {
                    return null;
                }
                encryptedEntry.valueEncrypted = encryptedResult.value;
                delete encryptedEntry.value;
            }
            const previousValue = toNumber(entry.previousValue);
            if (previousValue !== null) {
                const encryptedResult = await encryptNumberSafe(licenseId, previousValue, 'balanceHistory.previousValue');
                if (!encryptedResult.ok) {
                    return null;
                }
                encryptedEntry.previousValueEncrypted = encryptedResult.value;
                delete encryptedEntry.previousValue;
            }
            const newValue = toNumber(entry.newValue);
            if (newValue !== null) {
                const encryptedResult = await encryptNumberSafe(licenseId, newValue, 'balanceHistory.newValue');
                if (!encryptedResult.ok) {
                    return null;
                }
                encryptedEntry.newValueEncrypted = encryptedResult.value;
                delete encryptedEntry.newValue;
            }
            const delta = toNumber(entry.delta);
            if (delta !== null) {
                const encryptedResult = await encryptNumberSafe(licenseId, delta, 'balanceHistory.delta');
                if (!encryptedResult.ok) {
                    return null;
                }
                encryptedEntry.deltaEncrypted = encryptedResult.value;
                delete encryptedEntry.delta;
            }
            encryptedHistory.push(encryptedEntry);
        }
        payload.balanceHistory = encryptedHistory;
    }
    return sanitizeData(payload);
};

const buildExpensePayload = async (licenseId: string, licenseEpoch: number, exp: Expense) => {
    const payload: Record<string, any> = { ...exp, licenseId };
    delete payload.locked;
    delete payload.lockedReason;
    payload.cryptoEpoch = licenseEpoch;
    payload.status = normalizeExpenseStatus(exp.status);
    const amount = toNumber(exp.amount);
    if (amount !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amount, 'expenses.amount');
        if (!encryptedResult.ok) {
            return null;
        }
        payload.amountEncrypted = encryptedResult.value;
        delete payload.amount;
    }
    return sanitizeData(payload);
};

const buildIncomePayload = async (licenseId: string, licenseEpoch: number, inc: Income) => {
    const payload: Record<string, any> = { ...inc, licenseId };
    delete payload.locked;
    delete payload.lockedReason;
    payload.cryptoEpoch = licenseEpoch;
    payload.status = normalizeIncomeStatus(inc.status);
    payload.naturezaFiscal = resolveIncomeFiscalNature({
        naturezaFiscal: inc.naturezaFiscal,
        description: inc.description,
        category: inc.category
    });
    const amount = toNumber(inc.amount);
    if (amount !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amount, 'incomes.amount');
        if (!encryptedResult.ok) {
            return null;
        }
        payload.amountEncrypted = encryptedResult.value;
        delete payload.amount;
    }
    return sanitizeData(payload);
};

const buildTransferPayload = async (licenseId: string, licenseEpoch: number, transfer: Transfer) => {
    const payload: Record<string, any> = { ...transfer, licenseId };
    delete payload.locked;
    delete payload.lockedReason;
    payload.cryptoEpoch = licenseEpoch;
    payload.status = normalizeTransferStatus(transfer.status);
    payload.fromAccountId = String(transfer.fromAccountId || '').trim();
    payload.toAccountId = String(transfer.toAccountId || '').trim();
    const amount = toNumber(transfer.amount);
    if (amount !== null) {
        const encryptedResult = await encryptNumberSafe(licenseId, amount, 'transfers.amount');
        if (!encryptedResult.ok) {
            return null;
        }
        payload.amountEncrypted = encryptedResult.value;
        delete payload.amount;
    }
    return sanitizeData(payload);
};

export const dataService = {
    
    // --- AUTH & COMPANY ---

    async getLicenseRecord(licenseId: string): Promise<LicenseRecord | null> {
        let currentPath = `users/${licenseId}`;
        try {
            if (!guardUserPath(licenseId, currentPath, 'license_record')) return null;
            logUsingPath(currentPath, 'primary');
            const docRef = getLicenseDocRef(licenseId);
            const docSnap = await getDoc(docRef);
            logReadOk('users', docSnap.exists() ? 1 : 0);
            if (!docSnap.exists()) return null;

            const resolvedLicenseId = docRef.id;
            const data = { licenseId: resolvedLicenseId, ...(docSnap.data() as Record<string, unknown>) } as LicenseRecord;
            const updates: Partial<LicenseRecord> = {};
            if (!data.licenseStatus) updates.licenseStatus = 'active';
            if (!data.purchasedVersion) updates.purchasedVersion = '1.0.1';
            if (!data.currentAppVersion) updates.currentAppVersion = '1.0.1';
            if (!data.startDate) updates.startDate = new Date().toISOString().split('T')[0];
            if (Object.keys(updates).length) {
                updates.updatedAt = new Date().toISOString();
                await setDoc(docRef, updates, { merge: true });
                Object.assign(data, updates);
            }
            return data;
        } catch (error) {
            logPermissionDenied({
                step: 'license_get',
                path: currentPath,
                operation: 'getDoc',
                error,
                licenseId
            });
            logReadFailed('users', (error as any)?.message || 'Erro ao buscar usuário');
            return null;
        }
    },

    async ensureCryptoEpoch(licenseId: string): Promise<number> {
        const defaultEpoch = 1;
        const path = `users/${licenseId}`;
        try {
            if (!guardUserPath(licenseId, path, 'crypto_epoch')) return defaultEpoch;
            const ref = getLicenseDocRef(licenseId);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                return defaultEpoch;
            }
            const data = snap.data() as Record<string, any>;
            const currentEpoch = typeof data.cryptoEpoch === 'number' ? data.cryptoEpoch : null;
            if (currentEpoch !== null) {
                return currentEpoch;
            }
            await setDoc(
                ref,
                sanitizeData({
                    cryptoEpoch: defaultEpoch,
                    cryptoEpochSetAt: serverTimestamp()
                }),
                { merge: true }
            );
            console.info('[crypto][epoch] initialized', { licenseId, cryptoEpoch: defaultEpoch });
            return defaultEpoch;
        } catch (error) {
            logPermissionDenied({
                step: 'crypto_epoch_get',
                path: `users/${licenseId}`,
                operation: 'getDoc',
                error,
                licenseId
            });
            console.warn('[crypto][epoch] fallback', { licenseId, cryptoEpoch: defaultEpoch });
            return defaultEpoch;
        }
    },

    async getCompany(uid: string): Promise<CompanyInfo | null> {
        try {
            if (!uid) return null;
            const path = `users/${uid}`;
            if (!guardUserPath(uid, path, 'company_get')) return null;
            const docRef = getUserDocRef(uid);
            let snap;
            try {
                snap = await getDocFromServer(docRef);
            } catch (serverError) {
                console.warn('[company] server_fetch_failed, using cache', serverError);
                snap = await getDoc(docRef);
            }
            if (!snap.exists()) return null;
            const data = snap.data() as Record<string, any>;
            const companyInfo = data?.companyInfo ?? null;
            if (!companyInfo) return null;
            return {
                ...companyInfo,
                startDate: normalizeCompanyStartDate(companyInfo.startDate)
            };
        } catch (error) {
            console.error("Erro ao buscar empresa:", error);
            return null;
        }
    },

    async saveCompany(info: CompanyInfo, uid: string): Promise<void> {
        try {
            if (!uid) throw new Error('uid ausente');
            const path = `users/${uid}`;
            if (!guardUserPath(uid, path, 'company_save')) return;
            await setDoc(
                getUserDocRef(uid),
                sanitizeData({
                    companyInfo: { ...info, startDate: normalizeCompanyStartDate(info.startDate) },
                    updatedAt: new Date().toISOString()
                }),
                { merge: true }
            );
        } catch (error) {
            console.error("Erro ao salvar empresa:", error);
            throw error;
        }
    },

    async submitUserFeedback(
        uid: string,
        payload: {
            type: 'bug' | 'improvement';
            message: string;
            platform?: 'mobile' | 'desktop';
            appVersion?: string;
            reporterEmail?: string | null;
            companyName?: string | null;
        }
    ): Promise<string | null> {
        if (!uid) return null;
        const path = `users/${uid}/${COLLECTIONS.FEEDBACK_MESSAGES}`;
        if (!guardUserPath(uid, path, 'feedback_submit')) return null;

        const feedbackRef = doc(getFeedbackMessagesCollectionRef(uid));
        const trimmedMessage = String(payload.message || '').trim();
        if (!trimmedMessage) return null;

        const type = payload.type === 'bug' ? 'bug' : 'improvement';
        await setDoc(
            feedbackRef,
            sanitizeData({
                type,
                message: trimmedMessage.slice(0, 2000),
                status: 'new',
                platform: payload.platform || null,
                appVersion: payload.appVersion || null,
                reporterEmail: payload.reporterEmail || null,
                companyName: payload.companyName || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdAtClientMs: Date.now()
            }),
            { merge: false }
        );
        return feedbackRef.id;
    },

    // --- REALTIME SUBSCRIPTIONS ---

    subscribeAccounts(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (accounts: Account[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.ACCOUNTS}`;
        if (!guardUserPath(licenseId, path, 'accounts_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getAccountsCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                try {
                    const items = await Promise.all(
                        snapshot.docs.map(docSnap => decryptAccountDoc(licenseId, params.licenseEpoch, docSnap))
                    );
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.ACCOUNTS,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'accounts_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.ACCOUNTS, (error as any)?.message || 'Erro ao assinar contas');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    subscribeExpenses(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (expenses: Expense[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.EXPENSES}`;
        if (!guardUserPath(licenseId, path, 'expenses_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getExpensesCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                try {
                    const items = await Promise.all(
                        snapshot.docs.map(docSnap => decryptExpenseDoc(licenseId, params.licenseEpoch, docSnap))
                    );
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.EXPENSES,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'expenses_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.EXPENSES, (error as any)?.message || 'Erro ao assinar despesas');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    subscribeIncomes(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (incomes: Income[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}`;
        if (!guardUserPath(licenseId, path, 'incomes_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getIncomesCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                try {
                    const items = await Promise.all(
                        snapshot.docs.map(docSnap => decryptIncomeDoc(licenseId, params.licenseEpoch, docSnap))
                    );
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.INCOMES,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'incomes_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.INCOMES, (error as any)?.message || 'Erro ao assinar receitas');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    subscribeTransfers(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (transfers: Transfer[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.TRANSFERS}`;
        if (!guardUserPath(licenseId, path, 'transfers_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getTransfersCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                try {
                    const items = await Promise.all(
                        snapshot.docs.map(docSnap => decryptTransferDoc(licenseId, params.licenseEpoch, docSnap))
                    );
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.TRANSFERS,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'transfers_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.TRANSFERS, (error as any)?.message || 'Erro ao assinar transferências');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    subscribeCreditCards(
        licenseId: string,
        _params: Record<string, never>,
        onData: (cards: CreditCard[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.CREDIT_CARDS}`;
        if (!guardUserPath(licenseId, path, 'credit_cards_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getCreditCardsCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                try {
                    const items = snapshot.docs.map(docSnap => ({
                        id: docSnap.id,
                        ...(docSnap.data() as CreditCard)
                    }));
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.CREDIT_CARDS,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'credit_cards_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.CREDIT_CARDS, (error as any)?.message || 'Erro ao assinar cartões');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    subscribeAgenda(
        licenseId: string,
        onData: (items: AgendaItem[]) => void,
        onError?: (error: unknown) => void
    ) {
        let hasLoggedSupport = false;
        const path = `users/${licenseId}/${COLLECTIONS.AGENDA}`;
        if (!guardUserPath(licenseId, path, 'agenda_subscribe')) {
            onData([]);
            return () => {};
        }
        logUsingPath(path, 'primary');
        const q = query(getAgendaCollectionRef(licenseId));
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                try {
                    const items = snapshot.docs.map(docSnap => ({
                        id: docSnap.id,
                        ...(docSnap.data() as Omit<AgendaItem, 'id'>)
                    }));
                    onData(items);
                    if (!hasLoggedSupport) {
                        hasLoggedSupport = true;
                        void supportAccessService.logSupportRead(licenseId, {
                            collection: COLLECTIONS.AGENDA,
                            count: items.length
                        });
                    }
                } catch (error) {
                    onError?.(error);
                }
            },
            (error) => {
                logPermissionDenied({
                    step: 'agenda_subscribe',
                    path,
                    operation: 'query',
                    error,
                    licenseId
                });
                logReadFailed(COLLECTIONS.AGENDA, (error as any)?.message || 'Erro ao assinar agenda');
                onError?.(error);
            }
        );
        return () => {
            unsubscribe();
        };
    },

    async upsertAgendaItem(item: AgendaItem, licenseId: string) {
        const path = `users/${licenseId}/${COLLECTIONS.AGENDA}`;
        if (!guardUserPath(licenseId, path, 'agenda_upsert')) return null;
        const docRef = doc(getAgendaCollectionRef(licenseId), item.id || doc(getAgendaCollectionRef(licenseId)).id);
        const resolveNotifyAtMs = (
            dateValue?: string,
            timeValue?: string,
            notifyBeforeMinutes?: number | null
        ) => {
            if (!dateValue) return undefined;
            if (notifyBeforeMinutes === null) return undefined;
            const safeTimeRaw = typeof timeValue === 'string' && timeValue.trim()
                ? timeValue.trim()
                : '08:00';
            const [rawHours, rawMinutes] = safeTimeRaw.split(':');
            const hours = String(rawHours || '00').padStart(2, '0');
            const minutes = String(rawMinutes || '00').padStart(2, '0');
            const iso = `${dateValue}T${hours}:${minutes}`;
            const parsed = new Date(iso);
            if (Number.isNaN(parsed.getTime())) return undefined;
            const offset = typeof notifyBeforeMinutes === 'number' ? notifyBeforeMinutes : 0;
            return parsed.getTime() - offset * 60 * 1000;
        };
        const nextNotifyAtMs = resolveNotifyAtMs(item.date, item.time, item.notifyBeforeMinutes);
        const shouldNotify = typeof nextNotifyAtMs === 'number';
        const sameNotifyAt =
            shouldNotify &&
            typeof item.notifyAtMs === 'number' &&
            item.notifyAtMs === nextNotifyAtMs;
        const nextNotifyStatus = shouldNotify
            ? (sameNotifyAt ? item.notifyStatus || 'pending' : 'pending')
            : 'skipped';
        const payload = sanitizeData({
            ...item,
            id: docRef.id,
            createdAt: item.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
            notifyAtMs: nextNotifyAtMs,
            notifyStatus: nextNotifyStatus
        });
        await setDoc(docRef, payload, { merge: true });
        return docRef.id;
    },

    async deleteAgendaItem(id: string, licenseId: string) {
        const path = `users/${licenseId}/${COLLECTIONS.AGENDA}`;
        if (!guardUserPath(licenseId, path, 'agenda_delete')) return;
        const docRef = doc(getAgendaCollectionRef(licenseId), id);
        await deleteDoc(docRef);
    },

    // --- ACCOUNTS ---

    async getAccounts(licenseId: string, licenseEpoch: number): Promise<Account[]> {
        let snapshot;
        const path = `users/${licenseId}/${COLLECTIONS.ACCOUNTS}`;
        if (!guardUserPath(licenseId, path, 'accounts_get')) return [];
        try {
            logUsingPath(path, 'primary');
            snapshot = await getDocs(getAccountsCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'accounts_get',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.ACCOUNTS, error?.message || 'Erro ao ler contas');
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.ACCOUNTS, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.ACCOUNTS, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptAccountDoc(licenseId, licenseEpoch, docSnap)));
    },

    async upsertAccount(acc: Account, licenseId: string, licenseEpoch: number): Promise<void> {
        if (acc.locked) return;
        const path = `users/${licenseId}/${COLLECTIONS.ACCOUNTS}/${acc.id}`;
        if (!guardUserPath(licenseId, path, 'account_upsert')) return;
        const payload = await buildAccountPayload(licenseId, licenseEpoch, acc);
        if (!payload) {
            console.warn('[crypto][warn] write blocked', { entity: 'account', id: acc.id });
            return;
        }
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.ACCOUNTS, acc.id),
            payload
        );
        console.info('[sync][write] account ok', { id: acc.id, licenseId });
    },

    async upsertAccounts(accs: Account[], licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.ACCOUNTS}`;
        if (!guardUserPath(licenseId, path, 'accounts_upsert_batch')) return;
        const batch = writeBatch(db);
        for (const acc of accs) {
            if (acc.locked) continue;
            const ref = licenseCollectionDoc(licenseId, COLLECTIONS.ACCOUNTS, acc.id);
            const payload = await buildAccountPayload(licenseId, licenseEpoch, acc);
            if (!payload) {
                console.warn('[crypto][warn] write blocked', { entity: 'account', id: acc.id });
                continue;
            }
            batch.set(ref, payload);
        }
        await batch.commit();
        console.info('[sync][write] account ok', { count: accs.length, licenseId, mode: 'batch' });
    },

    async deleteAccount(id: string, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.ACCOUNTS}/${id}`;
        if (!guardUserPath(licenseId, path, 'account_delete')) return;
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.ACCOUNTS, id));
        console.info('[sync][write] account ok', { id, licenseId, action: 'delete' });
    },

    // --- EXPENSES ---

    async getExpenses(licenseId: string, licenseEpoch: number): Promise<Expense[]> {
        let snapshot;
        const path = `users/${licenseId}/${COLLECTIONS.EXPENSES}`;
        if (!guardUserPath(licenseId, path, 'expenses_get')) return [];
        try {
            logUsingPath(path, 'primary');
            snapshot = await getDocs(getExpensesCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'expenses_get',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.EXPENSES, error?.message || 'Erro ao ler despesas');
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.EXPENSES, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.EXPENSES, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptExpenseDoc(licenseId, licenseEpoch, docSnap)));
    },

    async upsertExpense(exp: Expense, licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.EXPENSES}/${exp.id}`;
        if (!guardUserPath(licenseId, path, 'expense_upsert')) return;
        const payload = await buildExpensePayload(licenseId, licenseEpoch, exp);
        if (!payload) {
            console.warn('[crypto][warn] write blocked', { entity: 'expense', id: exp.id });
            return;
        }
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.EXPENSES, exp.id),
            payload
        );
        console.info('[sync][write] expense ok', { id: exp.id, licenseId });
    },

    async upsertExpenses(exps: Expense[], licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.EXPENSES}`;
        if (!guardUserPath(licenseId, path, 'expenses_upsert_batch')) return;
        const batch = writeBatch(db);
        for (const exp of exps) {
            const ref = licenseCollectionDoc(licenseId, COLLECTIONS.EXPENSES, exp.id);
            const payload = await buildExpensePayload(licenseId, licenseEpoch, exp);
            if (!payload) {
                console.warn('[crypto][warn] write blocked', { entity: 'expense', id: exp.id });
                continue;
            }
            batch.set(ref, payload);
        }
        await batch.commit();
        console.info('[sync][write] expense ok', { count: exps.length, licenseId, mode: 'batch' });
    },

    async deleteExpense(id: string, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.EXPENSES}/${id}`;
        if (!guardUserPath(licenseId, path, 'expense_delete')) return;
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.EXPENSES, id));
        console.info('[sync][write] expense ok', { id, licenseId, action: 'delete' });
    },

    // --- INCOMES ---

    async getIncomes(licenseId: string, licenseEpoch: number): Promise<Income[]> {
        let snapshot;
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}`;
        if (!guardUserPath(licenseId, path, 'incomes_get')) return [];
        try {
            logUsingPath(path, 'primary');
            snapshot = await getDocs(getIncomesCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'incomes_get',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.INCOMES, error?.message || 'Erro ao ler receitas');
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.INCOMES, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.INCOMES, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptIncomeDoc(licenseId, licenseEpoch, docSnap)));
    },

    async migrateIncomeFiscalNature(licenseId: string): Promise<number> {
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}`;
        if (!guardUserPath(licenseId, path, 'incomes_migrate_fiscal_nature')) return 0;
        let snapshot;
        try {
            snapshot = await getDocs(getIncomesCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'incomes_migrate_fiscal_nature',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            return 0;
        }

        const batch = writeBatch(db);
        let updates = 0;
        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, any>;
            if (normalizeIncomeFiscalNature(data?.naturezaFiscal)) return;
            const inferred = inferIncomeFiscalNature({
                description: typeof data?.description === 'string' ? data.description : '',
                category: typeof data?.category === 'string' ? data.category : ''
            });
            batch.set(
                docSnap.ref,
                sanitizeData({
                    naturezaFiscal: inferred,
                    updatedAt: serverTimestamp()
                }),
                { merge: true }
            );
            updates += 1;
        });

        if (updates === 0) return 0;
        await batch.commit();
        return updates;
    },

    async upsertIncome(inc: Income, licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}/${inc.id}`;
        if (!guardUserPath(licenseId, path, 'income_upsert')) return;
        const payload = await buildIncomePayload(licenseId, licenseEpoch, inc);
        if (!payload) {
            console.warn('[crypto][warn] write blocked', { entity: 'income', id: inc.id });
            return;
        }
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.INCOMES, inc.id),
            payload
        );
        console.info('[sync][write] income ok', { id: inc.id, licenseId });
    },

    async upsertIncomes(incs: Income[], licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}`;
        if (!guardUserPath(licenseId, path, 'incomes_upsert_batch')) return;
        const batch = writeBatch(db);
        for (const inc of incs) {
            const ref = licenseCollectionDoc(licenseId, COLLECTIONS.INCOMES, inc.id);
            const payload = await buildIncomePayload(licenseId, licenseEpoch, inc);
            if (!payload) {
                console.warn('[crypto][warn] write blocked', { entity: 'income', id: inc.id });
                continue;
            }
            batch.set(ref, payload);
        }
        await batch.commit();
        console.info('[sync][write] income ok', { count: incs.length, licenseId, mode: 'batch' });
    },

    async deleteIncome(id: string, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.INCOMES}/${id}`;
        if (!guardUserPath(licenseId, path, 'income_delete')) return;
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.INCOMES, id));
        console.info('[sync][write] income ok', { id, licenseId, action: 'delete' });
    },

    // --- TRANSFERS ---

    async getTransfers(licenseId: string, licenseEpoch: number): Promise<Transfer[]> {
        let snapshot;
        const path = `users/${licenseId}/${COLLECTIONS.TRANSFERS}`;
        if (!guardUserPath(licenseId, path, 'transfers_get')) return [];
        try {
            logUsingPath(path, 'primary');
            snapshot = await getDocs(getTransfersCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'transfers_get',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.TRANSFERS, error?.message || 'Erro ao ler transferências');
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.TRANSFERS, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.TRANSFERS, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptTransferDoc(licenseId, licenseEpoch, docSnap)));
    },

    async upsertTransfer(transfer: Transfer, licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.TRANSFERS}/${transfer.id}`;
        if (!guardUserPath(licenseId, path, 'transfer_upsert')) return;
        const payload = await buildTransferPayload(licenseId, licenseEpoch, transfer);
        if (!payload) {
            console.warn('[crypto][warn] write blocked', { entity: 'transfer', id: transfer.id });
            return;
        }
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.TRANSFERS, transfer.id),
            payload
        );
        console.info('[sync][write] transfer ok', { id: transfer.id, licenseId });
    },

    async upsertTransfers(transfers: Transfer[], licenseId: string, licenseEpoch: number): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.TRANSFERS}`;
        if (!guardUserPath(licenseId, path, 'transfers_upsert_batch')) return;
        const batch = writeBatch(db);
        for (const transfer of transfers) {
            const ref = licenseCollectionDoc(licenseId, COLLECTIONS.TRANSFERS, transfer.id);
            const payload = await buildTransferPayload(licenseId, licenseEpoch, transfer);
            if (!payload) {
                console.warn('[crypto][warn] write blocked', { entity: 'transfer', id: transfer.id });
                continue;
            }
            batch.set(ref, payload);
        }
        await batch.commit();
        console.info('[sync][write] transfer ok', { count: transfers.length, licenseId, mode: 'batch' });
    },

    async deleteTransfer(id: string, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.TRANSFERS}/${id}`;
        if (!guardUserPath(licenseId, path, 'transfer_delete')) return;
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.TRANSFERS, id));
        console.info('[sync][write] transfer ok', { id, licenseId, action: 'delete' });
    },

    // --- CREDIT CARDS ---

    async getCreditCards(licenseId: string): Promise<CreditCard[]> {
        let snapshot;
        const path = `users/${licenseId}/${COLLECTIONS.CREDIT_CARDS}`;
        if (!guardUserPath(licenseId, path, 'credit_cards_get')) return [];
        try {
            logUsingPath(path, 'primary');
            snapshot = await getDocs(getCreditCardsCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'credit_cards_get',
                path,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.CREDIT_CARDS, error?.message || 'Erro ao ler cartões');
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.CREDIT_CARDS, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.CREDIT_CARDS, count: docs.length });
        return docs.map(d => ({ id: d.id, ...(d.data() as CreditCard) }));
    },

    async updateAdminMetrics(licenseId: string, metrics: { accountsCount: number; expensesCount: number; incomesCount: number }) {
        if (!licenseId) return;
        console.info('[metrics] skipped', {
            licenseId,
            accountsCount: metrics.accountsCount,
            expensesCount: metrics.expensesCount,
            incomesCount: metrics.incomesCount,
            reason: 'single_user'
        });
    },

    async updateLastActive(licenseId: string): Promise<void> {
        if (!licenseId) return;
        const path = `users/${licenseId}`;
        if (!guardUserPath(licenseId, path, 'last_active')) return;
        try {
            await setDoc(
                getUserDocRef(licenseId),
                sanitizeData({ lastActiveAt: serverTimestamp() }),
                { merge: true }
            );
        } catch (error) {
            console.warn('[metrics] last_active_failed', { licenseId, error });
        }
    },

    async upsertCreditCard(card: CreditCard, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.CREDIT_CARDS}/${card.id}`;
        if (!guardUserPath(licenseId, path, 'credit_card_upsert')) return;
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.CREDIT_CARDS, card.id),
            sanitizeData({ ...card, licenseId })
        );
        console.info('[sync][write] credit_card ok', { id: card.id, licenseId });
    },

    async deleteCreditCard(id: string, licenseId: string): Promise<void> {
        const path = `users/${licenseId}/${COLLECTIONS.CREDIT_CARDS}/${id}`;
        if (!guardUserPath(licenseId, path, 'credit_card_delete')) return;
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.CREDIT_CARDS, id));
        console.info('[sync][write] credit_card ok', { id, licenseId, action: 'delete' });
    }
};
