import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
import { MemberPermissions, MemberRecord, MemberRole } from '../types';
import { buildDefaultPermissionsForRole, normalizeMemberPermissions, normalizeMemberRole } from '../utils/memberAccess';

type MembersResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  message?: string;
};

const readTimestampMs = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === 'function') return candidate.toMillis();
    if (typeof candidate.seconds === 'number') return candidate.seconds * 1000;
  }
  return null;
};

const normalizeMemberRecord = (value: unknown, fallbackUid = ''): MemberRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const role = normalizeMemberRole(raw.role, 'employee');
  const uid = String(raw.uid || fallbackUid || '').trim();
  const licenseId = String(raw.licenseId || '').trim();
  if (!uid || !licenseId) return null;
  return {
    uid,
    licenseId,
    name: String(raw.name || '').trim() || 'Membro',
    email: String(raw.email || '').trim().toLowerCase(),
    photoDataUrl: raw.photoDataUrl ? String(raw.photoDataUrl) : null,
    role,
    active: raw.active !== false,
    permissions: normalizeMemberPermissions(raw.permissions, role),
    createdAtMs: readTimestampMs(raw.createdAtMs) || readTimestampMs(raw.createdAt),
    updatedAtMs: readTimestampMs(raw.updatedAtMs) || readTimestampMs(raw.updatedAt),
    createdByUid: raw.createdByUid ? String(raw.createdByUid) : null,
    createdByEmail: raw.createdByEmail ? String(raw.createdByEmail) : null,
    disabledAtMs: readTimestampMs(raw.disabledAtMs) || readTimestampMs(raw.disabledAt),
    lastLoginAtMs: readTimestampMs(raw.lastLoginAtMs) || readTimestampMs(raw.lastLoginAt)
  };
};

const request = async <T>(
  path: string,
  payload: Record<string, unknown> | null,
  withAuth = true
): Promise<MembersResponse<T>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth && auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || 'request_failed',
      message: data?.message || 'Não foi possível completar a solicitação.'
    };
  }
  return { ok: true, status: response.status, data };
};

export const membersService = {
  async listMembers() {
    const response = await request<{ members?: unknown[] }>('/api/listMembers', null, true);
    if (!response.ok) return response as MembersResponse<{ members: MemberRecord[] }>;
    const rawMembers = Array.isArray(response.data?.members) ? response.data?.members : [];
    const members = rawMembers
      .map((item) => normalizeMemberRecord(item))
      .filter((item): item is MemberRecord => Boolean(item));
    return {
      ...response,
      data: { members }
    } as MembersResponse<{ members: MemberRecord[] }>;
  },

  async createMemberAccount(payload: {
    name: string;
    email: string;
    password: string;
    role: MemberRole;
    permissions: MemberPermissions;
    photoDataUrl?: string | null;
  }) {
    const response = await request<{ member?: unknown }>('/api/createMemberAccount', payload, true);
    if (!response.ok) return response as MembersResponse<{ member: MemberRecord | null }>;
    return {
      ...response,
      data: {
        member: normalizeMemberRecord(response.data?.member)
      }
    } as MembersResponse<{ member: MemberRecord | null }>;
  },

  async updateMemberAccess(payload: {
    memberUid: string;
    role: MemberRole;
    permissions: MemberPermissions;
    active: boolean;
    name?: string;
    email?: string;
    password?: string;
    photoDataUrl?: string | null;
  }) {
    const response = await request<{ member?: unknown }>('/api/updateMemberAccess', payload, true);
    if (!response.ok) return response as MembersResponse<{ member: MemberRecord | null }>;
    return {
      ...response,
      data: {
        member: normalizeMemberRecord(response.data?.member)
      }
    } as MembersResponse<{ member: MemberRecord | null }>;
  },

  async deleteMemberAccount(payload: { memberUid: string }) {
    const response = await request<{ deletedUid?: string }>('/api/deleteMemberAccount', payload, true);
    return response as MembersResponse<{ deletedUid?: string }>;
  },

  async updateMyProfile(payload: { name: string; photoDataUrl?: string | null }) {
    const response = await request<{ member?: unknown }>('/api/updateMyMemberProfile', payload, true);
    if (!response.ok) return response as MembersResponse<{ member: MemberRecord | null }>;
    return {
      ...response,
      data: {
        member: normalizeMemberRecord(response.data?.member)
      }
    } as MembersResponse<{ member: MemberRecord | null }>;
  },

  async getMyMembership(uid: string) {
    if (!uid) return null;
    try {
      const ref = doc(db, 'memberships', uid);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch (serverError) {
        console.warn('[members] membership_server_read_failed', serverError);
        snap = await getDoc(ref);
      }
      if (!snap.exists()) return null;
      const member = normalizeMemberRecord({ uid, ...(snap.data() || {}) }, uid);
      return member;
    } catch (error) {
      console.warn('[members] membership_read_failed', error);
      return null;
    }
  },

  async getMyAccessFromClaims(
    uid: string,
    email: string | null | undefined,
    name: string | null | undefined
  ): Promise<MemberRecord | null> {
    if (!uid) return null;
    const authUser = auth.currentUser;
    if (!authUser || authUser.uid !== uid) return null;
    try {
      const tokenResult = await authUser.getIdTokenResult(true);
      const claims = tokenResult?.claims || {};
      const licenseId = String((claims as Record<string, unknown>).licenseId || '')
        .trim();
      if (!licenseId) return null;

      const roleFallback: MemberRole = licenseId === uid ? 'owner' : 'employee';
      const role = normalizeMemberRole((claims as Record<string, unknown>).role, roleFallback);
      const normalizedEmail = String(email || authUser.email || '').trim().toLowerCase();
      const resolvedName = String(name || authUser.displayName || '').trim() || normalizedEmail || 'Membro';

      return {
        uid,
        licenseId,
        name: resolvedName,
        email: normalizedEmail,
        photoDataUrl: null,
        role,
        active: true,
        permissions: buildDefaultPermissionsForRole(role),
        createdAtMs: null,
        updatedAtMs: null,
        createdByUid: null,
        createdByEmail: null,
        disabledAtMs: null,
        lastLoginAtMs: null
      };
    } catch (error) {
      console.warn('[members] claims_read_failed', error);
      return null;
    }
  },

  async canUseOwnerFallback(uid: string, email: string | null | undefined): Promise<boolean> {
    if (!uid) return false;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (normalizedEmail) {
      try {
        const entitlementRef = doc(db, 'entitlements', normalizedEmail);
        let entitlementSnap;
        try {
          entitlementSnap = await getDocFromServer(entitlementRef);
        } catch {
          entitlementSnap = await getDoc(entitlementRef);
        }
        if (entitlementSnap.exists()) {
          const entitlement = entitlementSnap.data() as Record<string, unknown>;
          const status = String(entitlement?.status || '').trim().toLowerCase();
          if (!status || status === 'active' || status === 'trial') {
            return true;
          }
        }
      } catch (error) {
        console.warn('[members] owner_fallback_entitlement_check_failed', error);
      }
    }

    try {
      const userRef = doc(db, 'users', uid);
      let userSnap;
      try {
        userSnap = await getDocFromServer(userRef);
      } catch {
        userSnap = await getDoc(userRef);
      }
      if (!userSnap.exists()) return false;
      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      const hasCompanyIdentity =
        String(userData.name || '').trim().length > 0 ||
        String(userData.companyName || '').trim().length > 0 ||
        String(userData.cnpj || '').trim().length > 0 ||
        String(userData.startDate || '').trim().length > 0 ||
        userData.isConfigured === true;
      return hasCompanyIdentity;
    } catch (error) {
      console.warn('[members] owner_fallback_user_check_failed', error);
      return false;
    }
  },

  buildOwnerAccess(uid: string, email: string | null | undefined, name: string | null | undefined): MemberRecord {
    return {
      uid,
      licenseId: uid,
      name: String(name || '').trim() || 'Administrador',
      email: String(email || '').trim().toLowerCase(),
      photoDataUrl: null,
      role: 'owner',
      active: true,
      permissions: buildDefaultPermissionsForRole('owner'),
      createdAtMs: null,
      updatedAtMs: null,
      createdByUid: uid,
      createdByEmail: String(email || '').trim().toLowerCase() || null,
      disabledAtMs: null,
      lastLoginAtMs: null
    };
  }
};
