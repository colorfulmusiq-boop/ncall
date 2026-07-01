/**
 * 일회성 마이그레이션 — VIP 단골의 phone/memo를 guests → dangolInfo로 이동
 *
 *   guests/{wid}/{guestKey}/{phone,memo}  →  dangolInfo/{wid}/{guestKey}/{phone,memo}
 *   그리고 guests 쪽 phone/memo 는 삭제(null)
 *
 * 규칙:
 *  - guests 항목에 phone 또는 memo 필드가 "존재"하면 이전 대상.
 *  - dangolInfo 쪽에 이미 값이 있으면 그 값을 신뢰(덮어쓰지 않음). 비어있는 필드만 guests 값으로 채움.
 *  - 항상 guests 쪽 phone/memo 를 삭제.
 *  - 여러 번 실행해도 안전(idempotent).
 *
 * 안전장치:
 *  - 기본은 dry-run(미리보기만). 실제 반영은 --commit 플래그가 있을 때만.
 *
 * 인증(둘 중 하나 필요):
 *  (A) 서비스 계정 키:  set GOOGLE_APPLICATION_CREDENTIALS=경로\serviceAccount.json   (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="경로")
 *  (B) gcloud ADC:      gcloud auth application-default login
 *
 * 실행:
 *   node functions/migrate-dangol.js            # 미리보기(dry-run)
 *   node functions/migrate-dangol.js --commit   # 실제 반영
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const DATABASE_URL =
  'https://nightcall-47430-default-rtdb.asia-southeast1.firebasedatabase.app';

const COMMIT = process.argv.includes('--commit');

function isNonEmpty(v) {
  return typeof v === 'string' ? v.trim() !== '' : v != null;
}

async function main() {
  initializeApp({ credential: applicationDefault(), databaseURL: DATABASE_URL });
  const db = getDatabase();

  const [guestsSnap, dangolInfoSnap] = await Promise.all([
    db.ref('guests').get(),
    db.ref('dangolInfo').get(),
  ]);

  const guests = guestsSnap.val() || {};
  const dangolInfo = dangolInfoSnap.val() || {};

  const updates = {};       // multi-location update payload
  const plan = [];          // 사람이 읽을 미리보기용
  let scanned = 0;

  for (const [wid, guestMap] of Object.entries(guests)) {
    if (!guestMap || typeof guestMap !== 'object') continue;
    for (const [gkey, g] of Object.entries(guestMap)) {
      if (!g || typeof g !== 'object') continue;
      scanned++;

      const hasPhone = Object.prototype.hasOwnProperty.call(g, 'phone');
      const hasMemo = Object.prototype.hasOwnProperty.call(g, 'memo');
      if (!hasPhone && !hasMemo) continue; // 옮길 것 없음

      const existing = (dangolInfo[wid] && dangolInfo[wid][gkey]) || {};

      // dangolInfo 값 우선, 비어있으면 guests 값으로 채움
      const phone = isNonEmpty(existing.phone) ? existing.phone : (g.phone ?? '');
      const memo = isNonEmpty(existing.memo) ? existing.memo : (g.memo ?? '');

      // dangolInfo 기록(값이 하나라도 있을 때만)
      const infoWrite = {};
      if (isNonEmpty(phone)) infoWrite.phone = phone;
      if (isNonEmpty(memo)) infoWrite.memo = memo;
      if (Object.keys(infoWrite).length) {
        updates[`dangolInfo/${wid}/${gkey}`] = { ...existing, ...infoWrite };
      }

      // guests 쪽 phone/memo 삭제
      if (hasPhone) updates[`guests/${wid}/${gkey}/phone`] = null;
      if (hasMemo) updates[`guests/${wid}/${gkey}/memo`] = null;

      plan.push({
        wid,
        gkey,
        label: g.label || '(이름없음)',
        movedPhone: isNonEmpty(g.phone) ? g.phone : '',
        movedMemo: isNonEmpty(g.memo) ? g.memo : '',
        infoKept: isNonEmpty(existing.phone) || isNonEmpty(existing.memo),
      });
    }
  }

  console.log(`\n스캔한 손님 항목: ${scanned}개`);
  console.log(`이전 대상(phone/memo 보유): ${plan.length}개\n`);

  plan.forEach((p, i) => {
    const parts = [];
    if (p.movedPhone) parts.push(`phone="${p.movedPhone}"`);
    if (p.movedMemo) parts.push(`memo="${p.movedMemo}"`);
    const note = p.infoKept ? '  [dangolInfo 기존값 유지, guests에서만 삭제]' : '';
    console.log(
      `${String(i + 1).padStart(3)}. ${p.wid}/${p.gkey}  «${p.label}»  ${parts.join(', ') || '(빈 값 — 삭제만)'}${note}`
    );
  });

  if (plan.length === 0) {
    console.log('옮길 데이터가 없습니다. 이미 마이그레이션 완료 상태입니다.\n');
    process.exit(0);
  }

  if (!COMMIT) {
    console.log('\n── DRY-RUN (미리보기) ── DB에 아무 변경도 하지 않았습니다.');
    console.log('실제 반영하려면:  node functions/migrate-dangol.js --commit\n');
    process.exit(0);
  }

  console.log(`\n── COMMIT ── ${Object.keys(updates).length}개 경로를 원자적으로 업데이트합니다...`);
  await db.ref().update(updates);
  console.log('✓ 완료. guests의 phone/memo가 dangolInfo로 이동되었습니다.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n마이그레이션 실패:', e && e.message ? e.message : e);
  console.error('인증(GOOGLE_APPLICATION_CREDENTIALS 또는 gcloud ADC)이 설정됐는지 확인하세요.\n');
  process.exit(1);
});
