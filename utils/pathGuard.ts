type GuardPayload = {
  attemptedPath: string;
  uid: string | null | undefined;
  action?: string;
};

export const guardUserPath = (
  uid: string | null | undefined,
  path: string,
  action?: string
): boolean => {
  const allowedPrefixes = uid ? [`users/${uid}`, `userGoals/${uid}`] : [];
  if (!uid || !allowedPrefixes.some(prefix => path.startsWith(prefix))) {
    const payload: GuardPayload = {
      attemptedPath: path,
      uid,
      action
    };
    console.error('[path-guard] blocked legacy path', payload);
    return false;
  }
  return true;
};
