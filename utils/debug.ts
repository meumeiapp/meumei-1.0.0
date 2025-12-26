export const debugLog = (tag: string, payload?: unknown) => {
  if (import.meta.env.DEV) {
    console.debug(`[debug:${tag}]`, payload ?? {});
  }
};
