export const normalizeEmail = (email: string | null | undefined): string => {
  const raw = typeof email === 'string' ? email.trim() : '';
  if (!raw) {
    throw new Error('E-mail inválido para entitlement.');
  }
  return raw.toLowerCase();
};
