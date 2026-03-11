import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// registerSW is imported dynamically only in production to avoid virtual module errors when PWA plugin is disabled in dev

const THEME_STORAGE_KEY = 'meumei_theme';

const resolveInitialTheme = () => {
  let source = 'default';
  let theme: 'light' | 'dark' = 'dark';
  try {
    const path = window.location.pathname;
    const isLanding = path === '/';
    if (!isLanding) {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        theme = stored;
        source = 'localStorage';
      }
    } else {
      source = 'landing';
    }
  } catch {
    theme = 'dark';
    source = 'fallback';
  }
  return { theme, source };
};

const applyThemeClass = (theme: 'light' | 'dark') => {
  const root = window.document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
};

const updateAppViewportMetrics = () => {
  if (typeof window === 'undefined') return;
  const width =
    window.visualViewport?.width ||
    window.innerWidth ||
    document.documentElement.clientWidth;
  const height =
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.documentElement.style.setProperty('--app-width', `${width}px`);
  const minSide = Math.min(width, height);
  document.documentElement.classList.toggle('is-mobile', minSide <= 767);
};

const getScrollableAncestor = (el: Element | null) => {
  if (!el || typeof window === 'undefined') return null;
  let node: HTMLElement | null = el as HTMLElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const isScrollable =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight;
    if (isScrollable) return node;
    if (node === document.body) break;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) || document.body;
};

const setupMobileScrollLock = () => {
  if (typeof window === 'undefined') return;
  let startX = 0;
  let startY = 0;

  const onTouchStart = (event: TouchEvent) => {
    if (!document.documentElement.classList.contains('is-mobile')) return;
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!document.documentElement.classList.contains('is-mobile')) return;
    if (!event.cancelable) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dy = touch.clientY - startY;
    const dx = touch.clientX - startX;
    if (Math.abs(dy) < Math.abs(dx)) return;
    if (dy <= 0) return;
    const target = event.target as Element | null;
    const scrollParent = getScrollableAncestor(target);
    if (!scrollParent) {
      event.preventDefault();
      return;
    }
    if (scrollParent.scrollTop <= 0) {
      event.preventDefault();
    }
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
};

const initialTheme = resolveInitialTheme();
applyThemeClass(initialTheme.theme);
console.info('[theme] init', { theme: initialTheme.theme, source: initialTheme.source });

updateAppViewportMetrics();
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateAppViewportMetrics);
  window.addEventListener('orientationchange', updateAppViewportMetrics);
  window.visualViewport?.addEventListener('resize', updateAppViewportMetrics);
}
setupMobileScrollLock();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const pwaMode = { DEV: import.meta.env.DEV, PROD: import.meta.env.PROD };
console.info('[pwa] mode', pwaMode);
const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
console.info('[pwa] sw supported', { supported: swSupported });

if (swSupported) {
  if (import.meta.env.PROD) {
    // Production: dynamically import the virtual register function and register the SW
    const channelName = 'meumei_sw';
    const clientId = Math.random().toString(36).slice(2);
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : null;
    const broadcast = (type: string, payload?: Record<string, unknown>) => {
      if (!channel) return;
      channel.postMessage({ type, source: clientId, ...(payload || {}) });
    };
    const updateReadyEventName = 'meumei:pwa-update-ready';
    const notifyUpdateReady = (reason: string) => {
      console.info('[pwa][sw] update_ready', { reason });
      try {
        sessionStorage.setItem('meumei_sw_update_ready', '1');
        sessionStorage.setItem('meumei_sw_update_reason', reason);
      } catch {}
      window.dispatchEvent(new CustomEvent(updateReadyEventName, { detail: { reason } }));
    };
    let registration: ServiceWorkerRegistration | undefined;
    let updateListenerAttached = false;

    const checkForUpdate = async (reason: string) => {
      if (!registration) return;
      try {
        console.info('[pwa][sw] update_check', { reason });
        await registration.update();
      } catch (error) {
        console.warn('[pwa][sw] update_check_failed', { reason, message: (error as Error)?.message || error });
      }
    };

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onRegisteredSW(swUrl, reg) {
            registration = reg;
            console.info('[pwa][sw] registered', { swUrl });
            if (reg && !updateListenerAttached) {
              updateListenerAttached = true;
              reg.addEventListener('updatefound', () => {
                try {
                  console.info('[pwa] updatefound');
                  const installing = reg.installing;
                  if (!installing) return;
                  const onStateChange = () => {
                    if (installing.state === 'installed') {
                      console.info('[pwa] installed', { hasWaiting: Boolean(reg.waiting) });
                    }
                  };
                  installing.addEventListener('statechange', onStateChange);
                } catch (error) {
                  console.warn('[pwa] updatefound_log_failed', error);
                }
              });
            }
            void checkForUpdate('registration');
            window.setInterval(() => void checkForUpdate('interval'), 60_000);
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') {
                void checkForUpdate('visibility');
              }
            });
            window.addEventListener('focus', () => void checkForUpdate('focus'));
          },
          onRegisterError(error) {
            console.error('[pwa][sw] register_error', error);
          },
          onOfflineReady() {
            console.info('[pwa][sw] offline_ready');
          },
          onNeedRefresh() {
            console.info('[pwa][sw] update_available');
            notifyUpdateReady('update_available');
            broadcast('update_ready', { reason: 'update_available' });
          }
        });
      })
      .catch((err) => console.warn('[pwa] register import failed', err));

    navigator.serviceWorker.ready
      .then((reg) => {
        registration = reg;
      })
      .catch((error) => {
        console.warn('[pwa][sw] ready_failed', { message: (error as Error)?.message || error });
      });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.info('[pwa] controllerchange');
      notifyUpdateReady('controller_change');
      broadcast('update_ready', { reason: 'controller_change' });
    });

    if (channel) {
      channel.onmessage = (event) => {
        const payload = event.data as { type?: string; source?: string; reason?: string } | null;
        if (!payload?.type || payload.source === clientId) return;
        if (
          payload.type === 'update_ready' ||
          payload.type === 'please_reload' ||
          payload.type === 'update_applied'
        ) {
          notifyUpdateReady(payload.reason || `broadcast_${payload.type}`);
        }
      };
    }
  } else {
    // DEV: explicitly disable PWA registration and cleanup any existing SW/caches
    console.info('[pwa] disabled in dev');
    (async () => {
      try {
        console.info('[pwa] dev cleanup: unregistering service workers...');
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) {
            console.info('[pwa] dev cleanup: deleting cache', key);
            // eslint-disable-next-line no-await-in-loop
            await caches.delete(key);
          }
        }
        console.info('[pwa] dev cleanup: done');
      } catch (err) {
        console.warn('[pwa] dev cleanup failed', err);
      }
    })();
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
