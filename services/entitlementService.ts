export const entitlementService = {
  async getEntitlementByEmail(_email: string | null | undefined) {
    console.info('[entitlement] skipped', { reason: 'single_user' });
    return null;
  },

  async resolveLicenseIdByEmail(_email: string | null | undefined): Promise<string> {
    throw new Error('Entitlement desativado no modo single-user.');
  }
};
