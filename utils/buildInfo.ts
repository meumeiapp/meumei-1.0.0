const extractBuildId = (url: string) => {
  const match = url.match(/assets\/index-([a-zA-Z0-9_-]+)\.js/);
  if (match?.[1]) return match[1];
  return null;
};

const resolveBuildId = () => {
  const envId = import.meta.env.VITE_BUILD_ID;
  if (envId) return envId;

  const metaUrl = typeof import.meta !== 'undefined' ? import.meta.url : '';
  const metaMatch = extractBuildId(metaUrl);
  if (metaMatch) return metaMatch;

  if (typeof document !== 'undefined') {
    const script = document.querySelector('script[src*="assets/index-"]') as HTMLScriptElement | null;
    if (script?.src) {
      const scriptMatch = extractBuildId(script.src);
      if (scriptMatch) return scriptMatch;
    }
  }

  if (metaUrl.includes('/src/') || metaUrl.includes('localhost')) return 'dev';
  return 'unknown';
};

export const BUILD_ID = resolveBuildId();
