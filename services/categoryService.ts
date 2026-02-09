import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { normalizeEmail } from '../utils/normalizeEmail';
import { guardUserPath } from '../utils/pathGuard';

export type CategoryType = 'incomes' | 'expenses';

const MAX_CATEGORIES = 20;

const buildCategoryRef = (uid: string, type: CategoryType) =>
  doc(db, 'users', uid, 'categories', type);

const normalizeCategoryName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toUpperCase();

const normalizeCategoryKey = (name: string): string =>
  normalizeCategoryName(name).toLowerCase();

const sanitizeCategoryList = (items: unknown[]): { items: string[]; limited: boolean } => {
  const result: string[] = [];
  const seen = new Set<string>();
  let limited = false;

  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeCategoryName(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    if (result.length >= MAX_CATEGORIES) {
      limited = true;
      break;
    }
    seen.add(key);
    result.push(normalized);
  }

  return { items: result, limited };
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

export const categoryService = {
  normalizeCategoryName,
  sanitizeCategoryList,
  async getUserCategories(uid: string): Promise<{ incomes: string[]; expenses: string[] }> {
    const { emailNormalized } = getActorInfo();
    const incomesPath = `users/${uid}/categories/incomes`;
    const expensesPath = `users/${uid}/categories/expenses`;
    if (!guardUserPath(uid, incomesPath, 'categories_load_incomes')) return { incomes: [], expenses: [] };
    if (!guardUserPath(uid, expensesPath, 'categories_load_expenses')) return { incomes: [], expenses: [] };
    const incomesRef = buildCategoryRef(uid, 'incomes');
    const expensesRef = buildCategoryRef(uid, 'expenses');
    try {
      const [incomesSnap, expensesSnap] = await Promise.all([
        getDoc(incomesRef),
        getDoc(expensesRef)
      ]);
      const incomesRaw = incomesSnap.exists() ? ((incomesSnap.data()?.items as unknown[]) || []) : [];
      const expensesRaw = expensesSnap.exists() ? ((expensesSnap.data()?.items as unknown[]) || []) : [];
      const incomes = sanitizeCategoryList(incomesRaw).items;
      const expenses = sanitizeCategoryList(expensesRaw).items;
      console.info('[categories] load', {
        uid,
        pathIncomes: incomesRef.path,
        pathExpenses: expensesRef.path,
        incomesLen: incomes.length,
        expensesLen: expenses.length,
        emailNormalized
      });
      return { incomes, expenses };
    } catch (error: any) {
      console.error('[categories] error', {
        uid,
        action: 'load',
        error,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async setUserCategories(uid: string, incomes: string[], expenses: string[]) {
    const { emailNormalized } = getActorInfo();
    const incomesPath = `users/${uid}/categories/incomes`;
    const expensesPath = `users/${uid}/categories/expenses`;
    if (!guardUserPath(uid, incomesPath, 'categories_save_incomes')) return;
    if (!guardUserPath(uid, expensesPath, 'categories_save_expenses')) return;
    const incomesRef = buildCategoryRef(uid, 'incomes');
    const expensesRef = buildCategoryRef(uid, 'expenses');
    const incomePayload = {
      type: 'incomes' as const,
      items: sanitizeCategoryList(incomes).items,
      updatedAt: serverTimestamp(),
      updatedByUid: uid || null,
      updatedByEmailNormalized: emailNormalized || null
    };
    const expensePayload = {
      type: 'expenses' as const,
      items: sanitizeCategoryList(expenses).items,
      updatedAt: serverTimestamp(),
      updatedByUid: uid || null,
      updatedByEmailNormalized: emailNormalized || null
    };
    try {
      await Promise.all([
        setDoc(incomesRef, incomePayload, { merge: true }),
        setDoc(expensesRef, expensePayload, { merge: true })
      ]);
      console.info('[categories] save', {
        uid,
        incomesLen: incomePayload.items.length,
        expensesLen: expensePayload.items.length
      });
    } catch (error: any) {
      console.error('[categories] error', {
        uid,
        action: 'save',
        error,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async resetUserCategories(uid: string) {
    const incomesRef = buildCategoryRef(uid, 'incomes');
    const expensesRef = buildCategoryRef(uid, 'expenses');
    const incomesPath = `users/${uid}/categories/incomes`;
    const expensesPath = `users/${uid}/categories/expenses`;
    console.info('[categories] reset:start', { uid });
    try {
      if (!guardUserPath(uid, incomesPath, 'categories_reset_incomes')) return;
      if (!guardUserPath(uid, expensesPath, 'categories_reset_expenses')) return;
      await Promise.all([deleteDoc(incomesRef), deleteDoc(expensesRef)]);
      console.info('[categories] reset:done', { uid, incomesLen: 0, expensesLen: 0 });
    } catch (error: any) {
      console.error('[categories] error', {
        uid,
        action: 'reset',
        error,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async addCategory(uid: string, type: CategoryType, name: string) {
    const normalized = normalizeCategoryName(name);
    if (!uid || !type) {
      console.warn('[categories] add_blocked', { reason: 'uid_or_type_missing', uid, type });
      return;
    }
    if (!normalized) {
      console.warn('[categories] add_blocked', { reason: 'empty_name', uid, type });
      return;
    }
    const current = await categoryService.getUserCategories(uid);
    const target = type === 'incomes' ? current.incomes : current.expenses;
    const key = normalizeCategoryKey(normalized);
    if (target.some(item => normalizeCategoryKey(item) === key)) {
      console.info('[categories] add_ok', { uid, type, skipped: 'duplicate' });
      return;
    }
    if (target.length >= MAX_CATEGORIES) {
      console.warn('[categories] add_err', { uid, type, reason: 'limit_reached' });
      throw new Error('Limite de categorias atingido.');
    }
    const next = [...target, normalized];
    const nextIncomes = type === 'incomes' ? next : current.incomes;
    const nextExpenses = type === 'expenses' ? next : current.expenses;
    await categoryService.setUserCategories(uid, nextIncomes, nextExpenses);
  },

  async removeCategory(uid: string, type: CategoryType, name: string) {
    const normalized = normalizeCategoryName(name);
    if (!uid || !type) {
      console.warn('[categories] remove_blocked', { reason: 'uid_or_type_missing', uid, type });
      return;
    }
    if (!normalized) {
      console.warn('[categories] remove_blocked', { reason: 'empty_name', uid, type });
      return;
    }
    const current = await categoryService.getUserCategories(uid);
    const target = type === 'incomes' ? current.incomes : current.expenses;
    const key = normalizeCategoryKey(normalized);
    const next = target.filter(item => normalizeCategoryKey(item) !== key);
    const nextIncomes = type === 'incomes' ? next : current.incomes;
    const nextExpenses = type === 'expenses' ? next : current.expenses;
    await categoryService.setUserCategories(uid, nextIncomes, nextExpenses);
  }
};
