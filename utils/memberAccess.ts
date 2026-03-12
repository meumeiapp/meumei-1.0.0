import {
  MEMBER_PERMISSION_KEYS,
  MemberPermissionKey,
  MemberPermissions,
  MemberRole,
  ViewState
} from '../types';

export type MemberPermissionMeta = {
  key: MemberPermissionKey;
  label: string;
  description: string;
};

export const MEMBER_PERMISSION_META: MemberPermissionMeta[] = [
  { key: 'dashboard', label: 'Início', description: 'Visão geral e indicadores do sistema.' },
  { key: 'launches', label: 'Lançamentos', description: 'Lista consolidada de entradas e saídas.' },
  { key: 'accounts', label: 'Contas', description: 'Contas bancárias e transferências entre contas.' },
  { key: 'incomes', label: 'Entradas', description: 'Cadastro e gestão de receitas.' },
  { key: 'expenses', label: 'Saídas', description: 'Cadastro e gestão de despesas.' },
  { key: 'yields', label: 'Rendimentos', description: 'Rendimentos e projeções financeiras.' },
  { key: 'invoices', label: 'Faturas', description: 'Faturas e pagamentos de cartão.' },
  { key: 'reports', label: 'Relatórios', description: 'Análises, gráficos e comparativos.' },
  { key: 'das', label: 'DAS', description: 'Emissão e gestão do DAS.' },
  { key: 'agenda', label: 'Agenda', description: 'Compromissos e lembretes.' },
  { key: 'audit', label: 'Auditoria', description: 'Registro de alterações no sistema.' },
  { key: 'settings', label: 'Configurações', description: 'Configurações administrativas e preferências.' }
];

const EMPLOYEE_DEFAULT_KEYS: MemberPermissionKey[] = [
  'dashboard',
  'launches',
  'incomes',
  'expenses',
  'reports',
  'agenda'
];

const VIEW_PERMISSION_MAP: Partial<Record<ViewState, MemberPermissionKey>> = {
  [ViewState.DASHBOARD]: 'dashboard',
  [ViewState.LAUNCHES]: 'launches',
  [ViewState.ACCOUNTS]: 'accounts',
  [ViewState.INCOMES]: 'incomes',
  [ViewState.VARIABLE_EXPENSES]: 'expenses',
  [ViewState.FIXED_EXPENSES]: 'expenses',
  [ViewState.PERSONAL_EXPENSES]: 'expenses',
  [ViewState.YIELDS]: 'yields',
  [ViewState.INVOICES]: 'invoices',
  [ViewState.REPORTS]: 'reports',
  [ViewState.DAS]: 'das',
  [ViewState.AGENDA]: 'agenda',
  [ViewState.AUDIT]: 'audit',
  [ViewState.SETTINGS]: 'settings'
};

export const createAllMemberPermissions = (value = true): MemberPermissions => {
  const permissions = {} as MemberPermissions;
  MEMBER_PERMISSION_KEYS.forEach((key) => {
    permissions[key] = value;
  });
  return permissions;
};

export const buildDefaultPermissionsForRole = (role: MemberRole): MemberPermissions => {
  if (role === 'owner' || role === 'admin') {
    return createAllMemberPermissions(true);
  }
  const base = createAllMemberPermissions(false);
  EMPLOYEE_DEFAULT_KEYS.forEach((key) => {
    base[key] = true;
  });
  return base;
};

export const normalizeMemberRole = (value: unknown, fallback: MemberRole = 'employee'): MemberRole => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'employee') {
    return normalized;
  }
  return fallback;
};

export const normalizeMemberPermissions = (
  value: unknown,
  role: MemberRole = 'employee'
): MemberPermissions => {
  if (role === 'owner' || role === 'admin') {
    return createAllMemberPermissions(true);
  }

  const fallback = buildDefaultPermissionsForRole(role);
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const source = value as Partial<Record<MemberPermissionKey, unknown>>;
  const normalized = {} as MemberPermissions;
  MEMBER_PERMISSION_KEYS.forEach((key) => {
    normalized[key] = source[key] === true;
  });
  return normalized;
};

export const canManageMembers = (role: MemberRole) => role === 'owner';
export const canManageCompany = (role: MemberRole) => role === 'owner';

export const canAccessView = (
  view: ViewState,
  role: MemberRole,
  permissions: MemberPermissions | null | undefined
) => {
  if (view === ViewState.LOGIN) return true;
  if (view === ViewState.MASTER) return role === 'owner';
  if (role === 'owner' || role === 'admin') return true;
  const permissionKey = VIEW_PERMISSION_MAP[view];
  if (!permissionKey) return true;
  return Boolean(permissions?.[permissionKey]);
};
