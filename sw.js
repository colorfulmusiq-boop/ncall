const CACHE_NAME = 'ncall-v26';

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
  // Firebase 및 외부 API는 항상 네트워크 직접 요청 (캐시 안 함)
  const url = e.request.url;
  if (url.includes('firebasedatabase.app') || 
      url.includes('googleapis.com') || 
      url.includes('firebase') ||
      url.includes('gstatic')) {
    e.respondWith(fetch(e.request));
    return;
  }
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
    data: { url: data.url || '/waiter.html' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow((e.notification && e.notification.data && e.notification.data.url) || '/waiter.html'));
});
