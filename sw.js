const CACHE_NAME = 'ncall-v7';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'CALL';
  const options = {
    body: data.body || '새 알림이 왔어요',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: data.type === 'booking' ? [200,100,200,100,400] : [150,80,150],
    tag: data.type,
    renotify: true,
    data: { url: '/waiter.html' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/waiter.html'));
});
