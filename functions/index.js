// ncall — 손님 호출 시 웨이터 폰으로 FCM 푸시 발송
// 트리거: RTDB  notifs/{wid}/{pushId}  생성
// 동작: fcmTokens/{wid} 의 모든 토큰에 data 메시지 발송 → 죽은 토큰은 정리

const { onValueCreated } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// RTDB 인스턴스/리전 — databaseURL 의 nightcall-47430-default-rtdb.asia-southeast1 기준
const DB_INSTANCE = 'nightcall-47430-default-rtdb';
const REGION = 'asia-southeast1';
const APP_URL = 'https://ncall.kr/waiter.html';

// 호출 타입 → 알림 제목 (waiter.html in-app 알림과 동일하게 맞춤)
function buildNotif(n) {
  const table = n.tableLabel || n.guestMsg || '손님';
  switch (n.type) {
    case 'call':
      return { title: '🙋 웨이터 호출', body: `${table} — 호출` };
    case 'booking':
      return { title: '🔔 부킹 요청', body: `${table} — 부킹 요청` };
    case 'beer':
      return { title: '🍾 맥주 추가', body: `${table} — 맥주 ${n.beerQty || ''}병`.trim() };
    case 'message':
      return { title: '💬 메시지', body: `${table}: ${n.msgText || ''}`.trim() };
    case 'checkout_req':
      return { title: '🧾 계산 요청', body: `${table} — 계산 요청` };
    default:
      return { title: '🔔 CALL', body: `${table} — 호출` };
  }
}

exports.sendCallPush = onValueCreated(
  {
    ref: '/notifs/{wid}/{pushId}',
    instance: DB_INSTANCE,
    region: REGION,
  },
  async (event) => {
    const notif = event.data.val();
    if (!notif) return;

    const { wid, pushId } = event.params;

    // 웨이터의 등록 토큰 조회
    const snap = await getDatabase().ref(`fcmTokens/${wid}`).get();
    const tokensObj = snap.val() || {};
    const tokens = Object.keys(tokensObj);
    if (tokens.length === 0) {
      logger.info(`no tokens for waiter ${wid}, skip`);
      return;
    }

    const { title, body } = buildNotif(notif);

    // data-only 메시지 — firebase-messaging-sw.js 의 onBackgroundMessage 가 직접 알림 표시
    const message = {
      tokens,
      data: {
        title,
        body,
        type: String(notif.type || 'call'),
        ts: String(pushId),
      },
      android: { priority: 'high' },
      webpush: {
        headers: { Urgency: 'high', TTL: '600' },
        fcmOptions: { link: APP_URL },
      },
    };

    const resp = await getMessaging().sendEachForMulticast(message);
    logger.info(`waiter ${wid}: sent ${resp.successCount}/${tokens.length}`);

    // 무효/만료 토큰 정리
    const removals = {};
    resp.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        removals[`fcmTokens/${wid}/${tokens[i]}`] = null;
      } else if (r.error) {
        logger.warn(`token ${i} failed: ${code || r.error.message}`);
      }
    });
    if (Object.keys(removals).length) {
      await getDatabase().ref().update(removals);
      logger.info(`removed ${Object.keys(removals).length} dead tokens for ${wid}`);
    }
  }
);
