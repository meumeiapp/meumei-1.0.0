import * as functions from 'firebase-functions';

const deprecatedStub = (name: string) =>
  functions.region('us-central1').https.onRequest((req, res) => {
    console.warn('[deprecated_stub]', { function: name });
    res.status(410).json({ ok: false, code: 'deprecated_stub', function: name });
  });

export const createMpPixPayment = deprecatedStub('createMpPixPayment');
export const createMpPreference = deprecatedStub('createMpPreference');
export const getMpPaymentStatus = deprecatedStub('getMpPaymentStatus');
export const migrateLegacyLicensesToEntitlements = deprecatedStub(
  'migrateLegacyLicensesToEntitlements'
);
export const mpCheckStatus = deprecatedStub('mpCheckStatus');
export const mpWebhook = deprecatedStub('mpWebhook');
export const testEmailFn = deprecatedStub('testEmailFn');
export const ensureAuthUserForInvite = deprecatedStub('ensureAuthUserForInvite');
export const ensureMembershipForUser = deprecatedStub('ensureMembershipForUser');
