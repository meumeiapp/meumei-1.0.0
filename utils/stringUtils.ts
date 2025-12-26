export const getInitial = (value?: string | null): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return '?';
  }
  return normalized.charAt(0).toUpperCase();
};
