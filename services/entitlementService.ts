import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Entitlement } from '../types';
import { normalizeEmail } from '../utils/normalizeEmail';
import { logPermissionDenied } from '../utils/firestoreLogger';

const normalizeStatus = (value: unknown): Entitlement['status'] => {
  if (typeof value === 'string') {
    const trimmed = value.toLowerCase();
    if (['active', 'inactive', 'canceled'].includes(trimmed)) {
      return trimmed as Entitlement['status'];
    }
  }
  return 'inactive';
};

export const entitlementService = {
  async getEntitlementByEmail(email: string | null | undefined): Promise<Entitlement | null> {
    if (!email) return null;
    const normalized = normalizeEmail(email);
    const entitlementRef = doc(db, 'entitlements', normalized);
    let snap;
    try {
      snap = await getDoc(entitlementRef);
    } catch (error) {
      logPermissionDenied({
        step: 'entitlement_get',
        path: entitlementRef.path,
        operation: 'getDoc',
        error
      });
      throw error;
    }
    if (!snap.exists()) return null;

    const data = snap.data() as Partial<Entitlement>;
    const status = normalizeStatus(data.status);
    const tenantId = (data.tenantId || data.licenseId || data.migratedFromLicenseId || normalized).trim();

    return {
      ...(data as Entitlement),
      status,
      tenantId,
      email: data.email || normalized
    };
  },

  async resolveLicenseIdByEmail(email: string | null | undefined): Promise<string> {
    if (!email) {
      throw new Error('Email do usuário ausente.');
    }
    const entitlement = await this.getEntitlementByEmail(email);
    if (entitlement?.licenseId) return entitlement.licenseId;
    if (entitlement?.tenantId) return entitlement.tenantId;
    throw new Error('Entitlement inválido: licenseId ausente.');
  }
};
