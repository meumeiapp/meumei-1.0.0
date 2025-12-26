import { auth } from '../services/firebase';

type PermissionDeniedPayload = {
  step: string;
  path: string;
  operation: 'getDoc' | 'getDocs' | 'query' | 'setDoc' | 'updateDoc' | 'deleteDoc';
  error: unknown;
  licenseId?: string | null;
};

const isPermissionDenied = (code: string, message: string) => {
  const loweredCode = code.toLowerCase();
  const loweredMessage = message.toLowerCase();
  return loweredCode.includes('permission') || loweredMessage.includes('permission');
};

export const logPermissionDenied = ({
  step,
  path,
  operation,
  error,
  licenseId
}: PermissionDeniedPayload) => {
  const code = String((error as any)?.code || 'unknown');
  const message = String((error as any)?.message || error || '');
  if (!isPermissionDenied(code, message)) return;
  const current = auth.currentUser;
  console.error('[firestore] permission_denied', {
    step,
    path,
    operation,
    code,
    message,
    email: current?.email || null,
    uid: current?.uid || null,
    licenseId: licenseId || null
  });
};
