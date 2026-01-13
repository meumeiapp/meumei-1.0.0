import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// registerSW is imported dynamically only in production to avoid virtual module errors when PWA plugin is disabled in dev

const THEME_STORAGE_KEY = 'meumei_theme';

const resolveInitialTheme = () => {
  let source = 'system';
  let theme: 'light' | 'dark' = 'light';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
      source = 'localStorage';
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
      source = 'system';
    }
  } catch {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
      source = 'system';
    }
  }
  return { theme, source };
};

const applyThemeClass = (theme: 'light' | 'dark') => {
  const root = window.document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
};

const initialTheme = resolveInitialTheme();
applyThemeClass(initialTheme.theme);
console.info('[theme] init', { theme: initialTheme.theme, source: initialTheme.source });

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
    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    let updateListenerAttached = false;

    const reloadOnce = (reason: string) => {
      if (reloading) return;
      reloading = true;
      if (reason !== 'controller_change') {
        console.info('[pwa][sw] reload', { reason });
      }
      window.location.reload();
    };

    const checkForUpdate = async (reason: string) => {
      if (!registration) return;
      try {
        console.info('[pwa][sw] update_check', { reason });
        await registration.update();
      } catch (error) {
        console.warn('[pwa][sw] update_check_failed', { reason, message: (error as Error)?.message || error });
      }
    };

    let updateSW: any = () => {};
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateSW = registerSW({
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
            broadcast('please_reload', { reason: 'update_available' });
            updateSW(true);
            if (registration?.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
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
      broadcast('update_applied');
      reloadOnce('controller_change');
    });

    if (channel) {
      channel.onmessage = (event) => {
        const payload = event.data as { type?: string; source?: string } | null;
        if (!payload?.type || payload.source === clientId) return;
        if (payload.type === 'please_reload' || payload.type === 'update_applied') {
          console.info('[pwa][sw] broadcast_reload', { type: payload.type });
          reloadOnce(`broadcast_${payload.type}`);
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
