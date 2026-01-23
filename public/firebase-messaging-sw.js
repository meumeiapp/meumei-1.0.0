/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const initFirebase = () => {
  try {
    if (self.firebase && self.firebase.apps && self.firebase.apps.length > 0) {
      return true;
    }
    if (self.__FIREBASE_CONFIG__ && self.firebase?.initializeApp) {
      self.firebase.initializeApp(self.__FIREBASE_CONFIG__);
      return true;
    }
  } catch (error) {
    console.warn('[messaging-sw] firebase init failed', error);
  }
  return false;
};

try {
  importScripts('/__/firebase/init.js');
} catch (error) {
  console.info('[messaging-sw] firebase init.js not available');
}

const ready = initFirebase();
if (ready && self.firebase?.messaging) {
  const messaging = self.firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notification = payload?.notification || {};
    const data = payload?.data || {};
    const title = notification.title || data.title || 'meumei';
    const body = notification.body || data.body || '';
    const icon = notification.icon || data.icon || '/pwa-192x192.png';
    const tag = payload?.fcmMessageId || data?.message_id || data?.tag || 'meumei';
    self.registration.showNotification(title, {
      body,
      icon,
      data,
      tag,
      renotify: false
    });
  });
}

if (!ready || !self.firebase?.messaging) {
  self.addEventListener('push', (event) => {
    let payload = {};
    if (event.data) {
      try {
        payload = event.data.json();
      } catch (error) {
        payload = { notification: { body: event.data.text() } };
      }
    }
    const notification = payload.notification || payload.webpush?.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || 'meumei';
    const body = notification.body || data.body || '';
    const icon = notification.icon || data.icon || '/pwa-192x192.png';
    const tag = payload.fcmMessageId || data.message_id || data.tag || 'meumei';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon,
        data,
        tag,
        renotify: false
      })
    );
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    })
  );
});
