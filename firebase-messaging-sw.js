// firebase-messaging-sw.js — FCM 백그라운드 푸시 수신 전용 서비스워커
// (앱 캐시용 /sw.js 와는 별개. FCM SDK가 이 파일을 등록한다)
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDpToFo3_0q35eRxpZ6iIWC5nUZqZKGZqw',
  authDomain: 'nightcall-47430.firebaseapp.com',
  projectId: 'nightcall-47430',
  storageBucket: 'nightcall-47430.firebasestorage.app',
  messagingSenderId: '522787869614',
  appId: '1:522787869614:web:785a75ed1219ed078f2e3f'
});

const messaging = firebase.messaging();

// 데이터 전용 메시지 → 직접 알림 표시 (Cloud Function이 data-only로 보냄)
messaging.onBackgroundMessage(function(payload) {
  const d = payload.data || {};
  const title = d.title || 'CALL';
  const options = {
    body: d.body || '새 호출이 왔어요',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: (d.type === 'booking' || d.type === 'call') ? [200, 100, 200, 100, 400] : [150, 80, 150],
    tag: (d.type || 'call') + '_' + (d.ts || ''),
    renotify: true,
    requireInteraction: false,
    data: { url: '/waiter.html' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('/waiter.html'));
});
