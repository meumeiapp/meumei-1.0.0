const CRYPTO_SALT = (import.meta.env.VITE_CRYPTO_SALT || '').trim();

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map<string, CryptoKey>();
let loggedProtection = false;
let loggedMissingSalt = false;

export type CryptoStatus =
  | { ready: true }
  | { ready: false; reason: 'missing_salt' | 'crypto_unavailable' };

const ensureCrypto = (): CryptoStatus => {
  if (!CRYPTO_SALT) {
    if (!loggedMissingSalt) {
      loggedMissingSalt = true;
      console.warn('[crypto][warn] VITE_CRYPTO_SALT missing');
    }
    return { ready: false, reason: 'missing_salt' };
  }
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    return { ready: false, reason: 'crypto_unavailable' };
  }
  return { ready: true };
};

const logProtectionOnce = () => {
  if (loggedProtection) return;
  loggedProtection = true;
  console.info('[lgpd] sensitive value protected');
};

const deriveKey = async (licenseId: string): Promise<CryptoKey | null> => {
  const status = ensureCrypto();
  if (!status.ready) {
    return null;
  }
  if (keyCache.has(licenseId)) {
    return keyCache.get(licenseId)!;
  }
  const seed = `${licenseId}:${CRYPTO_SALT}`;
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(seed)
  );
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  keyCache.set(licenseId, key);
  return key;
};

const bufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const cryptoService = {
  async encryptNumber(
    licenseId: string,
    value: number,
    fieldName: string
  ): Promise<{ ok: true; value: string } | { ok: false; reason: CryptoStatus['reason'] }> {
    logProtectionOnce();
    try {
      const status = ensureCrypto();
      if (!status.ready) {
        return { ok: false, reason: status.reason };
      }
      console.info(`[crypto] encrypt field=${fieldName}`);
      const key = await deriveKey(licenseId);
      if (!key) {
        return { ok: false, reason: 'crypto_unavailable' };
      }
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const payload = encoder.encode(JSON.stringify(value));
      const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        payload
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      return { ok: true, value: bufferToBase64(combined.buffer) };
    } catch (error) {
      console.error(`[crypto][error] encrypt failed field=${fieldName}`);
      return { ok: false, reason: 'crypto_unavailable' };
    }
  },

  async decryptNumber(
    licenseId: string,
    encrypted: string,
    fieldName: string
  ): Promise<{ ok: true; value: number } | { ok: false; reason: 'decrypt_failed' }> {
    logProtectionOnce();
    try {
      const status = ensureCrypto();
      if (!status.ready) {
        console.error(`[crypto][error] decrypt failed field=${fieldName}`);
        return { ok: false, reason: 'decrypt_failed' };
      }
      const key = await deriveKey(licenseId);
      if (!key) {
        console.error(`[crypto][error] decrypt failed field=${fieldName}`);
        return { ok: false, reason: 'decrypt_failed' };
      }
      const bytes = base64ToBytes(encrypted);
      const iv = bytes.slice(0, 12);
      const cipher = bytes.slice(12);
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipher
      );
      const raw = decoder.decode(decrypted);
      const parsed = JSON.parse(raw);
      const value = Number(parsed);
      if (!Number.isFinite(value)) {
        console.error(`[crypto][error] decrypt failed field=${fieldName}`);
        return { ok: false, reason: 'decrypt_failed' };
      }
      console.info(`[crypto] decrypt success field=${fieldName}`);
      return { ok: true, value };
    } catch (error) {
      console.error(`[crypto][error] decrypt failed field=${fieldName}`);
      return { ok: false, reason: 'decrypt_failed' };
    }
  }
};

export const getCryptoStatus = () => ensureCrypto();
