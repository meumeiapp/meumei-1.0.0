const PROFILE_IMAGE_DATA_URL_REGEX = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const DEFAULT_MAX_DIMENSION = 320;
const DEFAULT_MAX_LENGTH = 280_000;
const MOBILE_UA_REGEX = /android|iphone|ipad|ipod|iemobile|mobile/i;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
    image.src = src;
  });

const toJpegDataUrl = (
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number
) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível processar a imagem.');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', Math.max(0.45, Math.min(0.92, quality)));
};

export const isProfileImageDataUrl = (value: string | null | undefined) => {
  if (!value) return false;
  return PROFILE_IMAGE_DATA_URL_REGEX.test(String(value).trim());
};

export const normalizeProfileImageDataUrl = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!isProfileImageDataUrl(raw)) return null;
  return raw;
};

export const processProfileImageFile = async (
  file: File,
  options?: {
    maxDimension?: number;
    maxLength?: number;
  }
) => {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Selecione uma imagem válida.');
  }

  const maxDimension = options?.maxDimension || DEFAULT_MAX_DIMENSION;
  const maxLength = options?.maxLength || DEFAULT_MAX_LENGTH;
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  let targetWidth = Math.max(1, Math.round(image.width * scale));
  let targetHeight = Math.max(1, Math.round(image.height * scale));
  let quality = 0.86;
  let result = toJpegDataUrl(image, targetWidth, targetHeight, quality);

  while (result.length > maxLength && quality > 0.5) {
    quality -= 0.08;
    result = toJpegDataUrl(image, targetWidth, targetHeight, quality);
  }

  while (result.length > maxLength && Math.max(targetWidth, targetHeight) > 128) {
    targetWidth = Math.round(targetWidth * 0.88);
    targetHeight = Math.round(targetHeight * 0.88);
    result = toJpegDataUrl(image, targetWidth, targetHeight, quality);
  }

  if (!isProfileImageDataUrl(result)) {
    throw new Error('Falha ao processar a imagem.');
  }

  if (result.length > maxLength) {
    throw new Error('A imagem ficou muito grande. Use uma foto menor.');
  }

  return result;
};

export const isLikelyMobileDevice = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  if (MOBILE_UA_REGEX.test(userAgent)) return true;
  return navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 1024px)').matches;
};

export const hasAvailableCameraDevice = async () => {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
    return false;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'videoinput');
  } catch {
    return false;
  }
};

export const canCapturePhotoOnThisDevice = async () => {
  if (isLikelyMobileDevice()) return true;
  return hasAvailableCameraDevice();
};

export const buildMobilePhotoCaptureLink = (options?: {
  sessionId?: string;
  sessionToken?: string;
}) => {
  if (typeof window === 'undefined') return '';
  const sessionId = String(options?.sessionId || '').trim();
  const sessionToken = String(options?.sessionToken || '').trim();
  if (sessionId && sessionToken) {
    const url = new URL('/photo-capture', window.location.origin);
    url.searchParams.set('photoCapture', '1');
    url.searchParams.set('session', sessionId);
    url.searchParams.set('token', sessionToken);
    return url.toString();
  }
  const url = new URL('/login', window.location.origin);
  url.searchParams.set('photoCapture', '1');
  url.searchParams.set('source', 'desktop');
  return url.toString();
};

export const copyTextToClipboard = async (value: string) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
