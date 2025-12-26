import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode, command }) => {
    const env = loadEnv(mode, '.', '');
    if (command === 'build') {
      const salt = (env.VITE_CRYPTO_SALT || process.env.VITE_CRYPTO_SALT || '').trim();
      if (!salt) {
        throw new Error(
          'VITE_CRYPTO_SALT missing. Set it in .env.production.local (or build env) before running the production build.'
        );
      }
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          devOptions: {
            enabled: mode === 'development',
            type: 'module'
          },
          includeAssets: [
            'pwa-192x192.png',
            'pwa-512x512.png',
            'pwa-512x512-maskable.png',
            'apple-touch-icon.png',
            'favicon-32x32.png'
          ],
          manifest: {
            name: 'meumei',
            short_name: 'meumei',
            description: 'Controle financeiro com foco em clareza e consistencia.',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'portrait',
            theme_color: '#0b0b10',
            background_color: '#09090b',
            icons: [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: '/pwa-512x512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: '/apple-touch-icon.png',
                sizes: '180x180',
                type: 'image/png'
              }
            ]
          },
          workbox: {
            clientsClaim: true,
            skipWaiting: true,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
            navigateFallback: '/index.html',
            runtimeCaching: [
              {
                urlPattern: ({ request }) => request.mode === 'navigate',
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'pages',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24 * 7
                  }
                }
              },
              {
                urlPattern: ({ request }) =>
                  request.destination === 'script' ||
                  request.destination === 'style' ||
                  request.destination === 'worker',
                handler: 'CacheFirst',
                options: {
                  cacheName: 'assets',
                  expiration: {
                    maxEntries: 80,
                    maxAgeSeconds: 60 * 60 * 24 * 30
                  }
                }
              },
              {
                urlPattern: ({ request }) => request.destination === 'image',
                handler: 'CacheFirst',
                options: {
                  cacheName: 'images',
                  expiration: {
                    maxEntries: 60,
                    maxAgeSeconds: 60 * 60 * 24 * 30
                  }
                }
              },
              {
                urlPattern: /^https:\/\/firestore\.googleapis\.com\//,
                handler: 'NetworkOnly'
              },
              {
                urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\//,
                handler: 'NetworkOnly'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
