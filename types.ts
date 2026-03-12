
import type { Timestamp } from 'firebase/firestore';

export type ThemePreference = 'light' | 'dark';

export type LicenseStatus = 'active' | 'inactive' | 'trial' | 'suspended';
export type EntitlementStatus = 'active' | 'inactive' | 'canceled';
export type EntitlementSource = 'stripe' | 'manual';

export interface Entitlement {
  email: string;
  status: EntitlementStatus;
  plan: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  source: EntitlementSource;
  licenseId?: string;
  migratedFromLicenseId?: string;
  tenantId?: string;
  appVersionCreated: '1.0.2-beta' | string;
}

export interface TenantRecord {
  tenantId: string;
  licenseId: string;
  status?: 'active' | 'pending' | 'archived';
  source?: string;
  dataRoot?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LicenseRecord {
  licenseId: string;
  purchasedVersion?: string;
  currentAppVersion?: string;
  licenseStatus?: LicenseStatus;
  isConfigured?: boolean;
  startDate?: string;
  ownerUsername?: string;
  companyInfo?: CompanyInfo;
  createdAt?: string;
  updatedAt?: string;
  allowCloudReset?: boolean;
  cryptoEpoch?: number;
  cryptoEpochSetAt?: Timestamp;
}

export interface User {
  username: string;
  name: string;
  password?: string;
  licenseId?: string; // Link to the company
  createdAt?: string;
  lastLoginAt?: string;
  isActive?: boolean;
}

export interface CompanyInfo {
  name: string;
  cnpj: string;
  startDate: string;
  address: string;
  zipCode?: string;
  phone: string;
  email: string;
  website: string;
  logoDataUrl?: string | null;
  licenseId?: string; // Primary Key for Tenant
}

export interface AgendaItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  notes?: string;
  notifyBeforeMinutes?: number | null;
  notifyAtMs?: number;
  notifyStatus?: 'pending' | 'sent' | 'failed' | 'skipped';
  createdAt?: string;
  updatedAt?: string;
}

export enum ViewState {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  AGENDA = 'AGENDA',
  DAS = 'DAS',
  SETTINGS = 'SETTINGS',
  ACCOUNTS = 'ACCOUNTS',
  COMPANY_DETAILS = 'COMPANY_DETAILS',
  VARIABLE_EXPENSES = 'VARIABLE_EXPENSES',
  FIXED_EXPENSES = 'FIXED_EXPENSES',
  PERSONAL_EXPENSES = 'PERSONAL_EXPENSES',
  INCOMES = 'INCOMES',
  LAUNCHES = 'LAUNCHES',
  YIELDS = 'YIELDS',
  INVOICES = 'INVOICES',
  REPORTS = 'REPORTS',
  AUDIT = 'AUDIT',
  MASTER = 'MASTER'
}

export type MemberRole = 'owner' | 'admin' | 'employee';

export const MEMBER_PERMISSION_KEYS = [
  'dashboard',
  'launches',
  'accounts',
  'incomes',
  'expenses',
  'yields',
  'invoices',
  'reports',
  'das',
  'agenda',
  'audit',
  'settings'
] as const;

export type MemberPermissionKey = typeof MEMBER_PERMISSION_KEYS[number];
export type MemberPermissions = Record<MemberPermissionKey, boolean>;

export interface MemberRecord {
  uid: string;
  licenseId: string;
  name: string;
  email: string;
  photoDataUrl?: string | null;
  role: MemberRole;
  active: boolean;
  permissions: MemberPermissions;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  createdByUid?: string | null;
  createdByEmail?: string | null;
  disabledAtMs?: number | null;
  lastLoginAtMs?: number | null;
}

export type LockedReason = 'decrypt_failed' | 'missing_salt' | 'epoch_mismatch';

export interface Account {
  id: string;
  name: string;
  type: string;
  initialBalance: number;
  currentBalance: number;
  initialBalanceEncrypted?: string;
  currentBalanceEncrypted?: string;
  yieldRate?: number;
  yieldIndex?: 'CDI' | 'Selic';
  balanceHistory?: {
    date: string;
    value: number;
    previousValue?: number;
    newValue?: number;
    delta?: number;
    valueEncrypted?: string;
    previousValueEncrypted?: string;
    newValueEncrypted?: string;
    deltaEncrypted?: string;
    source?: string;
  }[];
  yieldHistory?: { date: string; amount: number; notes?: string }[];
  lastYield?: number;
  lastYieldDate?: string;
  lastYieldNote?: string;
  notes?: string;
  licenseId?: string;
  color?: string;
  nature?: 'PJ' | 'PF';
  cryptoEpoch?: number;
  locked?: boolean;
  decryptError?: boolean;
  lockedReason?: LockedReason;
}

export interface CreditCard {
  id: string;
  name: string;
  brand: string;
  closingDay: number;
  dueDay: number;
  limit?: number; 
  licenseId?: string;
  cardColor?: string;
  nature?: 'PJ' | 'PF';
}

export type ExpenseType = 'variable' | 'fixed' | 'personal';

export interface ExpenseTypeOption {
  id: ExpenseType;
  label: string;
  enabled: boolean;
  nature: 'PJ' | 'PF';
  color: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  amountEncrypted?: string;
  category: string;
  date: string; // ISO Date String YYYY-MM-DD
  dueDate: string;
  paymentMethod: string;
  accountId?: string;
  cardId?: string;
  status: 'pending' | 'paid';
  type: ExpenseType;
  notes?: string;
  paidAt?: string;
  origin?: 'invoice_payment' | 'invoice_reversal';
  invoiceCardId?: string;
  invoiceMonthKey?: string;
  invoicePaymentId?: string;
  taxStatus?: 'PJ' | 'PF';
  createdBy?: string;
  licenseId?: string;
  cryptoEpoch?: number;
  locked?: boolean;
  lockedReason?: LockedReason;
  
  // Installment Info
  installments?: boolean; 
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
}

export interface Income {
  id: string;
  description: string;
  amount: number;
  amountEncrypted?: string;
  category: string;
  date: string;
  competenceDate?: string;
  accountId: string;
  status: 'pending' | 'received';
  paymentMethod?: string;
  notes?: string;
  taxStatus?: 'PJ' | 'PF';
  createdBy?: string;
  licenseId?: string;
  cryptoEpoch?: number;
  locked?: boolean;
  lockedReason?: LockedReason;

  installments?: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
}

export type TransferStatus = 'pending' | 'completed' | 'canceled';

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  amountEncrypted?: string;
  date: string;
  status: TransferStatus;
  notes?: string;
  createdBy?: string;
  licenseId?: string;
  cryptoEpoch?: number;
  locked?: boolean;
  lockedReason?: LockedReason;
}
