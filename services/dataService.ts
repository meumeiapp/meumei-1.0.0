
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc, 
    getDoc,
    onSnapshot,
    writeBatch,
    limit,
    deleteField,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Account, Expense, Income, CreditCard, CompanyInfo, LicenseRecord, LockedReason } from '../types';
import { normalizeEmail } from '../utils/normalizeEmail';
import { logPermissionDenied } from '../utils/firestoreLogger';
import { supportAccessService } from './supportAccessService';
import { cryptoService, getCryptoStatus } from './cryptoService';

// Nome das coleções no Firestore
const COLLECTIONS = {
    LICENSES: 'licenses',
    ACCOUNTS: 'accounts',
    EXPENSES: 'expenses',
    INCOMES: 'incomes',
    CREDIT_CARDS: 'credit_cards',
    INVOICES: 'invoices'
};

type BalanceHistoryEntry = NonNullable<Account['balanceHistory']>[number];

const isPlainObject = (value: unknown): value is Record<string, any> => {
    return Object.prototype.toString.call(value) === '[object Object]';
};

const safeNormalizeLicenseId = (licenseId: string) => {
    try {
        return normalizeEmail(licenseId);
    } catch {
        return licenseId;
    }
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

export const getLicenseDocRef = (licenseId: string) => doc(db, COLLECTIONS.LICENSES, licenseId);

export const getAccountsCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.ACCOUNTS);

export const getExpensesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.EXPENSES);

export const getIncomesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.INCOMES);

export const getInvoicesCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.INVOICES);

export const getCreditCardsCollectionRef = (licenseId: string) =>
    collection(db, COLLECTIONS.LICENSES, licenseId, COLLECTIONS.CREDIT_CARDS);

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
        return {
            id: docSnap.id,
            ...(rest as Expense),
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
    if (lockedReason) {
        return {
            id: docSnap.id,
            ...(rest as Expense),
            amount,
            locked: true,
            lockedReason
        };
    }
    return { id: docSnap.id, ...(rest as Expense), amount };
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
        return {
            id: docSnap.id,
            ...(rest as Income),
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
    if (lockedReason) {
        return {
            id: docSnap.id,
            ...(rest as Income),
            amount,
            locked: true,
            lockedReason
        };
    }
    return { id: docSnap.id, ...(rest as Income), amount };
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

export const dataService = {
    
    // --- AUTH & COMPANY ---

    async getLicenseRecord(licenseId: string): Promise<LicenseRecord | null> {
        let currentPath = `licenses/${licenseId}`;
        try {
            const normalizedId = safeNormalizeLicenseId(licenseId);
            logUsingPath(currentPath, 'primary');
            let docRef = getLicenseDocRef(licenseId);
            let docSnap = await getDoc(docRef);
            if (!docSnap.exists() && normalizedId !== licenseId) {
                currentPath = `licenses/${normalizedId}`;
                logUsingPath(currentPath, 'fallback_legacy');
                docRef = getLicenseDocRef(normalizedId);
                docSnap = await getDoc(docRef);
            }
            logReadOk('licenses', docSnap.exists() ? 1 : 0);
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
            logReadFailed('licenses', (error as any)?.message || 'Erro ao buscar licença');
            return null;
        }
    },

    async ensureCryptoEpoch(licenseId: string): Promise<number> {
        const defaultEpoch = 1;
        try {
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
                path: `licenses/${licenseId}`,
                operation: 'getDoc',
                error,
                licenseId
            });
            console.warn('[crypto][epoch] fallback', { licenseId, cryptoEpoch: defaultEpoch });
            return defaultEpoch;
        }
    },

    async getCompany(licenseId: string): Promise<CompanyInfo | null> {
        try {
            const license = await this.getLicenseRecord(licenseId);
            return license?.companyInfo ?? null;
        } catch (error) {
            console.error("Erro ao buscar empresa:", error);
            return null;
        }
    },

    async saveCompany(info: CompanyInfo, licenseId: string): Promise<void> {
        try {
            await setDoc(
                getLicenseDocRef(licenseId),
                sanitizeData({
                    licenseId,
                    companyInfo: { ...info },
                    updatedAt: new Date().toISOString()
                }),
                { merge: true }
            );
        } catch (error) {
            console.error("Erro ao salvar empresa:", error);
            throw error;
        }
    },

    // --- REALTIME SUBSCRIPTIONS ---

    subscribeAccounts(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (accounts: Account[]) => void,
        onError?: (error: unknown) => void
    ) {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let hasSwitched = false;
        let hasLoggedSupport = false;
        let activeUnsub: (() => void) | null = null;

        const start = (targetLicenseId: string, reason: 'primary' | 'fallback_legacy') => {
            logUsingPath(`licenses/${targetLicenseId}/${COLLECTIONS.ACCOUNTS}`, reason);
            const q = query(getAccountsCollectionRef(targetLicenseId));
            const unsubscribe = onSnapshot(
                q,
                async (snapshot) => {
                    if (!hasSwitched && snapshot.empty && normalizedId !== licenseId) {
                        hasSwitched = true;
                        unsubscribe();
                        start(normalizedId, 'fallback_legacy');
                        return;
                    }
                    try {
                        const items = await Promise.all(
                            snapshot.docs.map(docSnap => decryptAccountDoc(targetLicenseId, params.licenseEpoch, docSnap))
                        );
                        onData(items);
                        if (!hasLoggedSupport) {
                            hasLoggedSupport = true;
                            void supportAccessService.logSupportRead(targetLicenseId, {
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
                        path: `licenses/${targetLicenseId}/${COLLECTIONS.ACCOUNTS}`,
                        operation: 'query',
                        error,
                        licenseId: targetLicenseId
                    });
                    logReadFailed(COLLECTIONS.ACCOUNTS, (error as any)?.message || 'Erro ao assinar contas');
                    onError?.(error);
                }
            );
            activeUnsub = unsubscribe;
            return unsubscribe;
        };

        start(licenseId, 'primary');
        return () => {
            activeUnsub?.();
        };
    },

    subscribeExpenses(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (expenses: Expense[]) => void,
        onError?: (error: unknown) => void
    ) {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let hasSwitched = false;
        let hasLoggedSupport = false;
        let activeUnsub: (() => void) | null = null;

        const start = (targetLicenseId: string, reason: 'primary' | 'fallback_legacy') => {
            logUsingPath(`licenses/${targetLicenseId}/${COLLECTIONS.EXPENSES}`, reason);
            const q = query(getExpensesCollectionRef(targetLicenseId));
            const unsubscribe = onSnapshot(
                q,
                async (snapshot) => {
                    if (!hasSwitched && snapshot.empty && normalizedId !== licenseId) {
                        hasSwitched = true;
                        unsubscribe();
                        start(normalizedId, 'fallback_legacy');
                        return;
                    }
                    try {
                        const items = await Promise.all(
                            snapshot.docs.map(docSnap => decryptExpenseDoc(targetLicenseId, params.licenseEpoch, docSnap))
                        );
                        onData(items);
                        if (!hasLoggedSupport) {
                            hasLoggedSupport = true;
                            void supportAccessService.logSupportRead(targetLicenseId, {
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
                        path: `licenses/${targetLicenseId}/${COLLECTIONS.EXPENSES}`,
                        operation: 'query',
                        error,
                        licenseId: targetLicenseId
                    });
                    logReadFailed(COLLECTIONS.EXPENSES, (error as any)?.message || 'Erro ao assinar despesas');
                    onError?.(error);
                }
            );
            activeUnsub = unsubscribe;
            return unsubscribe;
        };

        start(licenseId, 'primary');
        return () => {
            activeUnsub?.();
        };
    },

    subscribeIncomes(
        licenseId: string,
        params: { licenseEpoch: number },
        onData: (incomes: Income[]) => void,
        onError?: (error: unknown) => void
    ) {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let hasSwitched = false;
        let hasLoggedSupport = false;
        let activeUnsub: (() => void) | null = null;

        const start = (targetLicenseId: string, reason: 'primary' | 'fallback_legacy') => {
            logUsingPath(`licenses/${targetLicenseId}/${COLLECTIONS.INCOMES}`, reason);
            const q = query(getIncomesCollectionRef(targetLicenseId));
            const unsubscribe = onSnapshot(
                q,
                async (snapshot) => {
                    if (!hasSwitched && snapshot.empty && normalizedId !== licenseId) {
                        hasSwitched = true;
                        unsubscribe();
                        start(normalizedId, 'fallback_legacy');
                        return;
                    }
                    try {
                        const items = await Promise.all(
                            snapshot.docs.map(docSnap => decryptIncomeDoc(targetLicenseId, params.licenseEpoch, docSnap))
                        );
                        onData(items);
                        if (!hasLoggedSupport) {
                            hasLoggedSupport = true;
                            void supportAccessService.logSupportRead(targetLicenseId, {
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
                        path: `licenses/${targetLicenseId}/${COLLECTIONS.INCOMES}`,
                        operation: 'query',
                        error,
                        licenseId: targetLicenseId
                    });
                    logReadFailed(COLLECTIONS.INCOMES, (error as any)?.message || 'Erro ao assinar receitas');
                    onError?.(error);
                }
            );
            activeUnsub = unsubscribe;
            return unsubscribe;
        };

        start(licenseId, 'primary');
        return () => {
            activeUnsub?.();
        };
    },

    subscribeCreditCards(
        licenseId: string,
        _params: Record<string, never>,
        onData: (cards: CreditCard[]) => void,
        onError?: (error: unknown) => void
    ) {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let hasSwitched = false;
        let hasLoggedSupport = false;
        let activeUnsub: (() => void) | null = null;

        const start = (targetLicenseId: string, reason: 'primary' | 'fallback_legacy') => {
            logUsingPath(`licenses/${targetLicenseId}/${COLLECTIONS.CREDIT_CARDS}`, reason);
            const q = query(getCreditCardsCollectionRef(targetLicenseId));
            const unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    if (!hasSwitched && snapshot.empty && normalizedId !== licenseId) {
                        hasSwitched = true;
                        unsubscribe();
                        start(normalizedId, 'fallback_legacy');
                        return;
                    }
                    try {
                        const items = snapshot.docs.map(docSnap => ({
                            id: docSnap.id,
                            ...(docSnap.data() as CreditCard)
                        }));
                        onData(items);
                        if (!hasLoggedSupport) {
                            hasLoggedSupport = true;
                            void supportAccessService.logSupportRead(targetLicenseId, {
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
                        path: `licenses/${targetLicenseId}/${COLLECTIONS.CREDIT_CARDS}`,
                        operation: 'query',
                        error,
                        licenseId: targetLicenseId
                    });
                    logReadFailed(COLLECTIONS.CREDIT_CARDS, (error as any)?.message || 'Erro ao assinar cartões');
                    onError?.(error);
                }
            );
            activeUnsub = unsubscribe;
            return unsubscribe;
        };

        start(licenseId, 'primary');
        return () => {
            activeUnsub?.();
        };
    },

    // --- ACCOUNTS ---

    async getAccounts(licenseId: string, licenseEpoch: number): Promise<Account[]> {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let resolvedLicenseId = licenseId;
        let snapshot;
        try {
            logUsingPath(`licenses/${licenseId}/${COLLECTIONS.ACCOUNTS}`, 'primary');
            snapshot = await getDocs(getAccountsCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'accounts_get',
                path: `licenses/${licenseId}/${COLLECTIONS.ACCOUNTS}`,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.ACCOUNTS, error?.message || 'Erro ao ler contas');
        }
        if ((!snapshot || snapshot.empty) && normalizedId !== licenseId) {
            try {
                logUsingPath(`licenses/${normalizedId}/${COLLECTIONS.ACCOUNTS}`, 'fallback_legacy');
                snapshot = await getDocs(getAccountsCollectionRef(normalizedId));
                resolvedLicenseId = normalizedId;
            } catch (error: any) {
                logPermissionDenied({
                    step: 'accounts_get',
                    path: `licenses/${normalizedId}/${COLLECTIONS.ACCOUNTS}`,
                    operation: 'getDocs',
                    error,
                    licenseId: normalizedId
                });
                logReadFailed(COLLECTIONS.ACCOUNTS, error?.message || 'Erro ao ler contas');
            }
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.ACCOUNTS, docs.length);
        void supportAccessService.logSupportRead(resolvedLicenseId, { collection: COLLECTIONS.ACCOUNTS, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptAccountDoc(resolvedLicenseId, licenseEpoch, docSnap)));
    },

    async upsertAccount(acc: Account, licenseId: string, licenseEpoch: number): Promise<void> {
        if (acc.locked) return;
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
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.ACCOUNTS, id));
        console.info('[sync][write] account ok', { id, licenseId, action: 'delete' });
    },

    // --- EXPENSES ---

    async getExpenses(licenseId: string, licenseEpoch: number): Promise<Expense[]> {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let resolvedLicenseId = licenseId;
        let snapshot;
        try {
            logUsingPath(`licenses/${licenseId}/${COLLECTIONS.EXPENSES}`, 'primary');
            snapshot = await getDocs(getExpensesCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'expenses_get',
                path: `licenses/${licenseId}/${COLLECTIONS.EXPENSES}`,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.EXPENSES, error?.message || 'Erro ao ler despesas');
        }
        if ((!snapshot || snapshot.empty) && normalizedId !== licenseId) {
            try {
                logUsingPath(`licenses/${normalizedId}/${COLLECTIONS.EXPENSES}`, 'fallback_legacy');
                snapshot = await getDocs(getExpensesCollectionRef(normalizedId));
                resolvedLicenseId = normalizedId;
            } catch (error: any) {
                logPermissionDenied({
                    step: 'expenses_get',
                    path: `licenses/${normalizedId}/${COLLECTIONS.EXPENSES}`,
                    operation: 'getDocs',
                    error,
                    licenseId: normalizedId
                });
                logReadFailed(COLLECTIONS.EXPENSES, error?.message || 'Erro ao ler despesas');
            }
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.EXPENSES, docs.length);
        void supportAccessService.logSupportRead(resolvedLicenseId, { collection: COLLECTIONS.EXPENSES, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptExpenseDoc(resolvedLicenseId, licenseEpoch, docSnap)));
    },

    async upsertExpense(exp: Expense, licenseId: string, licenseEpoch: number): Promise<void> {
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
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.EXPENSES, id));
        console.info('[sync][write] expense ok', { id, licenseId, action: 'delete' });
    },

    // --- INCOMES ---

    async getIncomes(licenseId: string, licenseEpoch: number): Promise<Income[]> {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let resolvedLicenseId = licenseId;
        let snapshot;
        try {
            logUsingPath(`licenses/${licenseId}/${COLLECTIONS.INCOMES}`, 'primary');
            snapshot = await getDocs(getIncomesCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'incomes_get',
                path: `licenses/${licenseId}/${COLLECTIONS.INCOMES}`,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.INCOMES, error?.message || 'Erro ao ler receitas');
        }
        if ((!snapshot || snapshot.empty) && normalizedId !== licenseId) {
            try {
                logUsingPath(`licenses/${normalizedId}/${COLLECTIONS.INCOMES}`, 'fallback_legacy');
                snapshot = await getDocs(getIncomesCollectionRef(normalizedId));
                resolvedLicenseId = normalizedId;
            } catch (error: any) {
                logPermissionDenied({
                    step: 'incomes_get',
                    path: `licenses/${normalizedId}/${COLLECTIONS.INCOMES}`,
                    operation: 'getDocs',
                    error,
                    licenseId: normalizedId
                });
                logReadFailed(COLLECTIONS.INCOMES, error?.message || 'Erro ao ler receitas');
            }
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.INCOMES, docs.length);
        void supportAccessService.logSupportRead(resolvedLicenseId, { collection: COLLECTIONS.INCOMES, count: docs.length });
        return Promise.all(docs.map(docSnap => decryptIncomeDoc(resolvedLicenseId, licenseEpoch, docSnap)));
    },

    async upsertIncome(inc: Income, licenseId: string, licenseEpoch: number): Promise<void> {
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
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.INCOMES, id));
        console.info('[sync][write] income ok', { id, licenseId, action: 'delete' });
    },

    // --- CREDIT CARDS ---

    async getCreditCards(licenseId: string): Promise<CreditCard[]> {
        const normalizedId = safeNormalizeLicenseId(licenseId);
        let snapshot;
        try {
            logUsingPath(`licenses/${licenseId}/${COLLECTIONS.CREDIT_CARDS}`, 'primary');
            snapshot = await getDocs(getCreditCardsCollectionRef(licenseId));
        } catch (error: any) {
            logPermissionDenied({
                step: 'credit_cards_get',
                path: `licenses/${licenseId}/${COLLECTIONS.CREDIT_CARDS}`,
                operation: 'getDocs',
                error,
                licenseId
            });
            logReadFailed(COLLECTIONS.CREDIT_CARDS, error?.message || 'Erro ao ler cartões');
        }
        if ((!snapshot || snapshot.empty) && normalizedId !== licenseId) {
            try {
                logUsingPath(`licenses/${normalizedId}/${COLLECTIONS.CREDIT_CARDS}`, 'fallback_legacy');
                snapshot = await getDocs(getCreditCardsCollectionRef(normalizedId));
            } catch (error: any) {
                logPermissionDenied({
                    step: 'credit_cards_get',
                    path: `licenses/${normalizedId}/${COLLECTIONS.CREDIT_CARDS}`,
                    operation: 'getDocs',
                    error,
                    licenseId: normalizedId
                });
                logReadFailed(COLLECTIONS.CREDIT_CARDS, error?.message || 'Erro ao ler cartões');
            }
        }
        const docs = snapshot?.docs ?? [];
        logReadOk(COLLECTIONS.CREDIT_CARDS, docs.length);
        void supportAccessService.logSupportRead(licenseId, { collection: COLLECTIONS.CREDIT_CARDS, count: docs.length });
        return docs.map(d => ({ id: d.id, ...(d.data() as CreditCard) }));
    },

    async updateAdminMetrics(licenseId: string, metrics: { accountsCount: number; expensesCount: number; incomesCount: number }) {
        if (!licenseId) return;
        console.info('[metrics] write', {
            licenseId,
            accountsCount: metrics.accountsCount,
            expensesCount: metrics.expensesCount,
            incomesCount: metrics.incomesCount
        });
        const ref = doc(db, 'adminMetrics', licenseId);
        await setDoc(
            ref,
            sanitizeData({
                ...metrics,
                lastActivityAt: serverTimestamp()
            }),
            { merge: true }
        );
    },

    async upsertCreditCard(card: CreditCard, licenseId: string): Promise<void> {
        await setDoc(
            licenseCollectionDoc(licenseId, COLLECTIONS.CREDIT_CARDS, card.id),
            sanitizeData({ ...card, licenseId })
        );
        console.info('[sync][write] credit_card ok', { id: card.id, licenseId });
    },

    async deleteCreditCard(id: string, licenseId: string): Promise<void> {
        await deleteDoc(licenseCollectionDoc(licenseId, COLLECTIONS.CREDIT_CARDS, id));
        console.info('[sync][write] credit_card ok', { id, licenseId, action: 'delete' });
    }
};
