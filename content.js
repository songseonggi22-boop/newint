'use strict';

// ── 개강일 목록 ──────────────────────────────────────────────
const GAGANG_DATES = [
  '2025-12-10','2026-01-12','2026-02-10','2026-03-16',
  '2026-04-13','2026-05-13','2026-06-11','2026-07-14',
  '2026-08-12','2026-09-14','2026-10-19','2026-11-17',
  '2026-12-15','2027-01-14','2027-02-15','2027-03-16',
  '2027-04-13','2027-05-17','2027-06-14',
];

// ── Shadow DOM 패널 CSS ───────────────────────────────────────
const PANEL_CSS = `
*, *::before, *::after { box-sizing: border-box; font-family: 'Noto Sans KR', sans-serif; }
#btn {
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  width: 48px; height: 48px; border-radius: 50%;
  background: #4f46e5; color: #fff; border: none;
  font-size: 22px; cursor: pointer; line-height: 48px;
  text-align: center; padding: 0;
  box-shadow: 0 4px 16px rgba(79,70,229,.4);
  touch-action: none; user-select: none;
}
#panel {
  position: fixed; bottom: 84px; right: 24px; z-index: 9998;
  width: 320px; max-height: calc(100vh - 120px);
  background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,.15);
  display: none; flex-direction: column; overflow: hidden;
  font-size: 13px; color: #111;
}
#panel.open { display: flex; }
#tabs { display: flex; flex-direction: row; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
.tab {
  flex: 1; padding: 9px 4px; background: none; border: none;
  border-bottom: 2px solid transparent; cursor: pointer;
  font-size: 12px; color: #6b7280; font-weight: 500;
}
.tab.on { color: #4f46e5; border-bottom-color: #4f46e5; font-weight: 700; }
.pane { display: none; padding: 12px 14px; overflow-y: auto; flex: 1; }
.pane.on { display: block; }
label { display: block; font-size: 11px; color: #6b7280; margin: 6px 0 3px; }
input[type=text], input[type=date], input[type=month], input[type=password] {
  width: 100%; padding: 6px 8px; border: 1px solid #d1d5db;
  border-radius: 7px; font-size: 13px;
}
.row { display: flex; flex-direction: row; gap: 6px; align-items: center; margin-bottom: 2px; }
.row input { flex: 1; }
.primary { width: 100%; padding: 8px; background: #4f46e5; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; }
.sm { padding: 6px 10px; background: #6b7280; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-size: 12px; white-space: nowrap; }
.sm.g { background: #059669; }
.result { margin-top: 8px; font-size: 12px; color: #374151; line-height: 1.6; }
.desc { font-size: 11px; color: #9ca3af; margin: 0 0 6px; line-height: 1.5; }
.hint { color: #9ca3af; font-size: 10px; }
.sep { border-top: 1px solid #f3f4f6; margin: 10px 0; }
#gagang-grid { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.gg-btn {
  padding: 4px 8px; background: #ede9fe; color: #4f46e5;
  border: 1px solid #c4b5fd; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
}
.gg-btn:hover, .gg-btn.sel { background: #4f46e5; color: #fff; }
.gg-btn.past { opacity: .5; }
.chip { display: inline-block; margin: 2px; padding: 3px 9px; background: #f3f4f6; border-radius: 10px; font-size: 12px; }
.bd-chip { display: inline-block; margin: 2px; background: #ede9fe; color: #4f46e5; padding: 1px 6px; border-radius: 8px; font-size: 10px; }
`;

// ── 초기화 ───────────────────────────────────────────────────
let S = null; // Shadow root
// ponytail: 인트라넷 팝업창(?popup=1)은 패널·뱃지가 필요 없고 오류만 남김 → 아예 실행 안 함
if (!/[?&]popup=1/.test(location.search)) chrome.storage.local.get(['holidays','myName','pendingContact','stuMarks','btnPos','bulkOK'], data => {
  window._kihBO = !!data.bulkOK;            // 🔒 일괄 탭 잠금 해제 여부
  window._kihSD = data.stuMarks      || null; // 저장된 내 수강생 표시
  window._kihBP = data.btnPos        || null; // 🏢 버튼 위치
  window._kihH  = data.holidays      || {};
  window._kihMe = data.myName        || '';
  window._kihPC = data.pendingContact || null;

  if (window === window.top) buildPanel(); // 패널은 최상위 프레임에만, 뱃지는 모든 프레임
  applyMyRow();
  applyBadges();
  observe();
  if (window._kihPC && window === window.top) setTimeout(runPending, 1200);
});

// ── 패널 빌드 (Shadow DOM) ───────────────────────────────────
function buildPanel() {
  if (document.getElementById('kih-host')) return;
  const host = document.createElement('div');
  host.id = 'kih-host';
  host.style.cssText = 'all:initial;position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);
  S = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  S.appendChild(style);

  const today = toISO(new Date());
  const nowYM  = today.slice(0,7);

  S.innerHTML += `
    <button id="btn" style="pointer-events:all;">🏢</button>
    <div id="panel" style="pointer-events:all;">
      <div id="tabs">
        <button class="tab on" data-p="contact">📞 컨택조회</button>
        <button class="tab"    data-p="schedule">📅 시간표</button>
        <button class="tab"    data-p="settings">⚙️ 설정</button>
        <button class="tab"    data-p="bulk">🔒 일괄</button>
      </div>
      <div id="pane-contact" class="pane on">
        <p class="desc">날짜·담당자 → 문의DB 필터 자동 적용</p>
        <label>날짜</label>
        <div class="row">
          <input id="i-date" type="date" value="${today}"/>
          <button class="sm g" id="btn-today">오늘</button>
        </div>
        <label>담당자 <span class="hint">(비우면 전체)</span></label>
        <input id="i-mentor" type="text" placeholder="예: 송성기" value="${window._kihMe}"/>
        <button class="primary" id="btn-contact" style="margin-top:8px;">🔍 조회</button>
        <div id="r-contact" class="result"></div>
      </div>
      <div id="pane-schedule" class="pane">
        <p class="desc">개강일 클릭 → 시간표 날짜 자동 설정</p>
        <div id="gagang-grid"></div>
        <div class="sep"></div>
        <label>공휴일 <span class="hint">(쉼표 구분)</span></label>
        <input id="i-ym" type="month" value="${nowYM}" style="margin-bottom:6px;"/>
        <input id="i-hol" type="text" placeholder="예: 3,9,10"/>
        <div class="row" style="margin-top:6px;">
          <button class="primary" id="btn-biz" style="flex:1;">✅ 영업일만 체크</button>
          <button class="sm g"   id="btn-all">전체</button>
          <button class="sm"     id="btn-none" style="background:#6b7280">해제</button>
        </div>
        <div id="r-schedule" class="result"></div>
        <div id="biz-list"></div>
        <div class="sep"></div>
        <label>담당자 <span class="hint">(새 수업·인원 바뀐 수업만 확인)</span></label>
        <div class="row">
          <input id="i-mystu" type="text" placeholder="예: 송성기2" value="${window._kihMe}"/>
          <button class="sm g" id="btn-mystu">👥 내 수강생 보기</button>
          <button class="sm" id="btn-mystu-all" title="저장된 표시를 지우고 전부 다시 확인">↻ 전체</button>
        </div>
        <div id="r-mystu" class="result"></div>
      </div>
      <div id="pane-settings" class="pane">
        <label>내 이름 <span class="hint">(내 담당 행 굵게)</span></label>
        <div class="row">
          <input id="i-name" type="text" placeholder="예: 송성기" value="${window._kihMe}"/>
          <button class="sm g" id="btn-save">저장</button>
        </div>
        <div id="r-settings" class="result"></div>
        <div class="sep"></div>
        <div class="desc"><b>단축키</b><br>Alt+K: 열기/닫기</div>
      </div>
      <div id="pane-bulk" class="pane">
        <div id="bulk-lock">
          <p class="desc">비밀번호를 넣어야 쓸 수 있는 기능입니다.</p>
          <div class="row">
            <input id="i-pw" type="password" placeholder="비밀번호"/>
            <button class="sm g" id="btn-pw">열기</button>
          </div>
          <div id="r-pw" class="result"></div>
        </div>
        <div id="bulk-body" style="display:none;">
          <p class="desc">다음컨택일 일괄 넘기기<br>① 문의DB 목록에서 넘길 DB 체크 → ② 불러오기 → ③ 목록 다시 확인 → ④ 넘기기</p>
          <button class="primary" id="btn-bulk-load">📋 체크한 DB 불러오기</button>
          <div id="bulk-list" class="result"></div>
          <label>넘길 날짜</label>
          <input id="i-bulk-date" type="date" value="${addDays(today, 1)}"/>
          <label>결과메모 <span class="hint">(비우면 안 적음)</span></label>
          <input id="i-bulk-memo" type="text" value="${isoToMD(addDays(today, 1))}"/>
          <label>상담내용 <span class="hint">(저장 후 수정 불가)</span></label>
          <input id="i-bulk-text" type="text" value="다음컨택일 ${isoToMD(addDays(today, 1))}로 이동"/>
          <button class="primary" id="btn-bulk-run" style="margin-top:8px;background:#dc2626;">🚚 넘기기</button>
          <div id="r-bulk" class="result"></div>
        </div>
      </div>
    </div>`;

  // 탭 전환
  S.getElementById('tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (!t) return;
    S.querySelectorAll('.tab,.pane').forEach(el => el.classList.remove('on'));
    t.classList.add('on');
    S.getElementById(`pane-${t.dataset.p}`).classList.add('on');
  });

  makeDraggable();
  S.getElementById('btn-today').addEventListener('click', () => { S.getElementById('i-date').value = toISO(new Date()); });
  S.getElementById('btn-contact').addEventListener('click', doContact);
  S.getElementById('btn-biz').addEventListener('click', doBizCheck);
  S.getElementById('btn-all').addEventListener('click', () => toggleCB(true));
  S.getElementById('btn-none').addEventListener('click', () => toggleCB(false));
  S.getElementById('btn-save').addEventListener('click', saveName);
  S.getElementById('btn-mystu').addEventListener('click', () => doMyStudents(false));
  S.getElementById('btn-mystu-all').addEventListener('click', () => doMyStudents(true));
  S.getElementById('i-ym').addEventListener('change', e => loadHol(e.target.value));
  S.getElementById('btn-pw').addEventListener('click', unlockBulk);
  S.getElementById('i-pw').addEventListener('keydown', e => { if (e.key === 'Enter') unlockBulk(); });
  S.getElementById('btn-bulk-load').addEventListener('click', loadBulk);
  S.getElementById('btn-bulk-run').addEventListener('click', runBulk);
  S.getElementById('i-bulk-date').addEventListener('change', e => {
    const md = isoToMD(e.target.value);
    S.getElementById('i-bulk-memo').value = md;
    S.getElementById('i-bulk-text').value = `다음컨택일 ${md}로 이동`;
  });
  if (window._kihBO) showBulk();

  loadHol(nowYM);
  buildGagangGrid();
  document.addEventListener('keydown', e => { if (e.altKey && e.key==='k') S.getElementById('panel').classList.toggle('open'); });
}

// 🏢 버튼을 끌어서 원하는 위치로 이동 (위치 저장). 살짝 끈 건 클릭으로 처리
function makeDraggable() {
  const btn = S.getElementById('btn'), panel = S.getElementById('panel');
  let pos = window._kihBP || { x: innerWidth - 72, y: innerHeight - 72 }; // 버튼 왼쪽 위 좌표
  const place = () => {
    pos.x = Math.min(Math.max(0, pos.x), innerWidth - 48); // 화면 밖으로 안 나가게
    pos.y = Math.min(Math.max(0, pos.y), innerHeight - 48);
    Object.assign(btn.style, { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' });
    // 패널은 버튼 기준 화면 넓은 쪽으로 펼침
    const up = pos.y > innerHeight / 2, toLeft = pos.x > innerWidth / 2;
    Object.assign(panel.style, {
      top: up ? 'auto' : pos.y + 60 + 'px', bottom: up ? innerHeight - pos.y + 12 + 'px' : 'auto',
      left: toLeft ? 'auto' : pos.x + 'px', right: toLeft ? innerWidth - pos.x - 48 + 'px' : 'auto',
      maxHeight: (up ? pos.y - 12 : innerHeight - pos.y - 60) - 12 + 'px',
    });
  };
  let drag = null, moved = false;
  btn.addEventListener('pointerdown', e => {
    drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY };
    moved = false;
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', e => {
    if (!drag || (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5)) return;
    moved = true;
    pos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy };
    place();
  });
  btn.addEventListener('pointerup', () => { if (drag && moved) chrome.storage.local.set({ btnPos: pos }); drag = null; });
  btn.addEventListener('click', () => { if (moved) moved = false; else panel.classList.toggle('open'); });
  addEventListener('resize', place);
  place();
}

// ── 컨택 조회 ────────────────────────────────────────────────
function doContact() {
  const isoDate = S.getElementById('i-date').value;
  const mentor  = S.getElementById('i-mentor').value.trim();
  const out     = S.getElementById('r-contact');
  if (!isoDate) { out.textContent = '날짜를 선택해주세요.'; return; }

  // 메뉴 글자 말고, 실제 검색구분 셀렉트가 있는지로 판단
  const onContactPage = q('.ant-select-selection-item')
    .some(el => ['문의자','결과메모'].includes(labelOf(el)));
  if (onContactPage) {
    out.textContent = '⏳ 필터 적용 중…';
    applyFilters(isoDate, mentor, out);
  } else {
    out.textContent = '⏳ 문의DB로 이동 중…';
    chrome.storage.local.set({ pendingContact: { date: isoDate, mentor } });
    navigateTo(['사업관리','문의DB','멘토별문의DB']);
  }
}

// 단계 사이 대기(ms). 인트라넷 반영이 늦으면 이 값만 올리면 됨
const STEP = 800;

function applyFilters(isoDate, mentor, out) {
  // ① 문의자 → 결과메모
  selectChange('문의자', '결과메모', () => {
    // ② 메인담당 → 메인+서브
    selectChange('메인담당', '메인+서브', () => {
      setTimeout(() => {
        // ③ 검색어에 날짜 (MM.DD 형식)
        const si = q('input[placeholder="검색어를 입력해 주세요"]')[0];
        if (si) typeInto(si, isoToMD(isoDate));

        // ④ 멘토선택
        if (mentor) {
          const mi = q('input[placeholder="멘토선택"]')[0];
          if (mi) typeInto(mi, mentor);
        }

        // ⑤ 조회
        setTimeout(() => {
          const btn = findBtn(['조회','검색']);
          if (!btn) { out.textContent = '✅ 필터 적용됨 — 조회 버튼을 눌러주세요'; return; }
          btn.click();
          out.textContent = '⏳ 조회 중…';
          // ponytail: 셀렉트 변경 시 인트라넷이 자동 검색을 쏴서 결과가 덮어써짐 → 앞 요청이 끝난 뒤 한 번 더 조회
          setTimeout(() => { btn.click(); out.textContent = `✅ ${isoToMD(isoDate)} 조회 완료`; }, STEP * 2);
        }, STEP);
      }, STEP);
    });
  });
}

// Ant Design Select 값 변경 (currentLabel → targetLabel)
function selectChange(currentLabel, targetLabel, cb) {
  const items = q('.ant-select-selection-item');
  const span = items.find(el => labelOf(el) === currentLabel);

  if (!span) {
    // 이미 바뀌어 있으면 정상 — 그냥 다음 단계로
    if (!items.some(el => labelOf(el) === targetLabel))
      console.warn('[KIH] 셀렉트 못 찾음:', currentLabel, '/ 보이는 셀렉트:', items.map(labelOf));
    cb?.(); return;
  }
  const wrap = span.closest('.ant-select');
  if (!wrap) { cb?.(); return; }
  const doc = wrap.ownerDocument; // iframe 안이면 그 문서

  // antd Select는 click이 아니라 mousedown에 열림
  const sel = wrap.querySelector('.ant-select-selector') || wrap;
  sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  let n = 0;
  const t = setInterval(() => {
    // 닫힌 드롭다운(hidden)은 제외하고 열린 것에서만 옵션 탐색
    const opt = Array.from(doc.querySelectorAll(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'))
      .find(el => (el.getAttribute('title') || el.textContent).trim() === targetLabel);
    if (opt) { clearInterval(t); opt.click(); setTimeout(cb, STEP); }
    else if (++n > 20) { clearInterval(t); console.warn('[KIH] 옵션 못 찾음:', targetLabel); cb?.(); }
  }, 100);
}

function runPending() {
  const p = window._kihPC;
  if (!p) return;
  chrome.storage.local.remove('pendingContact');
  window._kihPC = null;
  if (!S) return;
  S.getElementById('panel').classList.add('open');
  if (p.date)   S.getElementById('i-date').value = p.date;
  if (p.mentor) S.getElementById('i-mentor').value = p.mentor;
  const out = S.getElementById('r-contact');
  out.textContent = '⏳ 필터 적용 중…';
  setTimeout(() => applyFilters(p.date, p.mentor, out), 600);
}

// ── 시간표 ───────────────────────────────────────────────────
function buildGagangGrid() {
  const grid = S?.getElementById('gagang-grid');
  if (!grid) return;
  const today = new Date();
  const list = GAGANG_DATES.filter(d => {
    const dt = new Date(d);
    return dt >= new Date(today.getFullYear(), today.getMonth()-3, 1) &&
           dt <= new Date(today.getFullYear(), today.getMonth()+6, 1);
  });
  grid.innerHTML = list.map(d => {
    const dt = new Date(d);
    const lbl = `${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
    return `<button class="gg-btn${dt < today ? ' past' : ''}" data-d="${d}">${lbl}</button>`;
  }).join('');
  grid.addEventListener('click', e => {
    const b = e.target.closest('.gg-btn');
    if (!b) return;
    grid.querySelectorAll('.gg-btn').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    pickGagang(b.dataset.d);
  });
}

function pickGagang(d) {
  const next = GAGANG_DATES.find(x => x > d) || d;
  const end  = next === d ? d : addDays(next, -1);
  const si   = document.querySelector('input[date-range="start"]');
  const ei   = document.querySelector('input[date-range="end"]');
  const out  = S?.getElementById('r-schedule');
  if (si && ei) {
    setAntDate(si, d);
    setTimeout(() => {
      setAntDate(ei, end);
      if (out) out.innerHTML = `✅ ${fmt(d)} ~ ${fmt(end)}`;
      setTimeout(() => { const b = findBtn(['조회','검색']); if (b) b.click(); }, 400);
    }, 350);
  } else {
    if (out) out.textContent = '시간표관리 페이지에서 실행해주세요.';
  }
}

function doBizCheck() {
  const ym  = S.getElementById('i-ym').value;
  const out = S.getElementById('r-schedule');
  if (!ym) { out.textContent = '연월을 선택해주세요.'; return; }
  const hols = (S.getElementById('i-hol').value || '').split(',')
    .map(s => parseInt(s)).filter(n => !isNaN(n) && n >= 1 && n <= 31);
  window._kihH[ym] = hols;
  chrome.storage.local.set({ holidays: window._kihH });
  const [y,m] = ym.split('-').map(Number);
  const biz   = bizDays(y, m, hols);
  let f=0,c=0;
  document.querySelectorAll('input[type=checkbox]').forEach(cb => {
    const d = dayFromLabel(cbLabel(cb), m);
    if (d === null) return;
    f++;
    const ok = biz.includes(d);
    if (cb.checked !== ok) cb.click();
    if (ok) c++;
  });
  out.innerHTML = f > 0 ? `✅ ${f}개 중 <b>${c}개</b> 영업일 체크` : `<span style="color:#ef4444">체크박스 없음</span>`;
  const el = S.getElementById('biz-list');
  if (el) el.innerHTML = `<div style="font-size:11px;margin-top:6px;"><b>${m}월 영업일 ${biz.length}일</b><br>${biz.map((d,i)=>`<span class="bd-chip">${i+1}영업일=${d}일</span>`).join('')}</div>`;
}

function toggleCB(v) {
  document.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked !== v) cb.click(); });
}

function loadHol(ym) {
  const el = S?.getElementById('i-hol');
  if (el) el.value = (window._kihH[ym] || []).join(',');
}

// ── 내 수강생 보기 (시간표 수업마다 수강생 팝업을 열어 담당 멘토 확인) ──
// ponytail: 인트라넷 API를 모르니 사람이 하는 클릭을 그대로 반복. 수업 1개당 약 2~3초
let _stuRun = false;
let _dbg = ''; // 0명일 때 패널에 띄울 첫 실패 원인
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  for (let t = 0; t < ms; t += 150) { const v = fn(); if (v) return v; await sleep(150); }
  return null;
}
const openPopover = () => Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)'))
  .find(p => p.textContent.includes('수강생 보기'));
const openStuModal = () => Array.from(document.querySelectorAll('.ant-modal-wrap'))
  .find(w => w.style.display !== 'none' && w.querySelector('.ant-modal-title')?.textContent.trim() === '수강생');

// 저장 구조: { me, classes: { 수업키: { cnt: 배정인원, names: [내 학생] } } } → chrome.storage 'stuMarks'
const stuDB = () => (window._kihSD ||= { me: '', classes: {} });
const saveStuDB = () => chrome.storage.local.set({ stuMarks: stuDB() });
const cntOf = ev => ev.querySelector('.sch-cnt')?.textContent.trim() || '0';
// ponytail: "송성기"로 넣어도 "송성기2" 매칭
const mentorRe = me => new RegExp('^' + me.replace(/\d+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\d*$');

// full=false: 처음 보는 수업 + 배정인원이 바뀐 수업만 확인 / full=true: 전부 다시
async function doMyStudents(full) {
  const btn = S.getElementById('btn-mystu');
  const out = S.getElementById('r-mystu');
  if (_stuRun) { _stuRun = false; return; } // 진행 중에 다시 누르면 중지
  const me = S.getElementById('i-mystu').value.trim();
  if (!me) { out.textContent = '담당자 이름을 입력해주세요.'; return; }
  const all = Array.from(document.querySelectorAll('.rs-event'));
  if (!all.length) { out.textContent = '시간표관리 화면에서 실행해주세요.'; return; }

  const db = stuDB();
  if (full || db.me !== me) { db.me = me; db.classes = {}; }
  const todo = all.filter(ev => {
    const key = eventKey(ev), cnt = cntOf(ev);
    if (cnt === '0') { db.classes[key] = { cnt, names: [] }; return false; } // 배정 0명은 열 필요 없음
    return db.classes[key]?.cnt !== cnt;
  });
  saveStuDB();
  if (!todo.length) { applyStuMarks(); out.textContent = '✅ 바뀐 수업 없음 — 저장된 표시 그대로'; return; }

  _stuRun = true; btn.textContent = '⏹ 중지';
  const re = mentorRe(me);
  let fail = 0;
  _dbg = '';
  for (let i = 0; i < todo.length && _stuRun; i++) {
    const ev = todo[i];
    const title = ev.querySelector('.sch-title')?.textContent.trim() || '';
    out.textContent = `⏳ ${i + 1}/${todo.length} ${title} …`;
    try {
      ev.scrollIntoView({ block: 'center', inline: 'center' });
      ev.click();
      const pop = await waitFor(openPopover, 3000);
      if (!pop) { _dbg ||= `수업 눌러도 팝업 안 뜸 ("${title}")`; fail++; continue; }
      Array.from(pop.querySelectorAll('button')).find(b => b.textContent.trim() === '수강생 보기')?.click();
      const modal = await waitFor(() => readyModal(title), 6000);
      if (!modal) {
        const m = openStuModal();
        _dbg ||= m ? `창 과목명 불일치: 창="${(m.querySelector('.HybridTable td')?.textContent || '').slice(0, 25)}" / 칸="${title}"` : '수강생 창을 못 찾음';
      }
      const names = modal && await collectRows(modal, re);
      if (names) saveClass(eventKey(ev), cntOf(ev), names); else fail++;
      modal?.querySelector('.ant-modal-close')?.click();
      await waitFor(() => !openStuModal(), 2000);
      const p2 = openPopover();
      if (p2) Array.from(p2.querySelectorAll('button')).find(b => b.textContent.trim() === '확인')?.click();
      await sleep(250);
    } catch (e) { console.warn('[KIH] 수강생 확인 실패:', title, e); }
  }
  const stopped = !_stuRun;
  _stuRun = false; btn.textContent = '👥 내 수강생 보기';
  const marked = Object.values(db.classes).filter(c => c.names.length);
  out.textContent = `${stopped ? '⏹ 중지됨' : '✅ 완료'} — ${todo.length}개 수업 확인 · ${marked.length}개 수업에 ${marked.reduce((n, c) => n + c.names.length, 0)}명`
    + (fail ? ` · ⚠️ ${fail}개 수업 못 읽음` : '')
    + (!marked.length && _dbg ? ` · 🔎 진단: ${_dbg} · 담당자칸="${me}"` : '');
  if (_dbg) console.log('[KIH] 진단:', _dbg, '담당자:', me);
  applyStuMarks();
}

// 열린 수강생 창이 해당 수업 것이고 로딩이 끝났으면 반환
function readyModal(title) {
  const m = openStuModal();
  const subj = m?.querySelector('.HybridTable td')?.textContent || '';
  return m && subj.startsWith(title) && !m.querySelector('.ant-spin-spinning') ? m : null;
}

// 수업 칸 구분용 키: 과목|강의실|강사 + 개강일
function eventKey(ev) {
  return (ev.getAttribute('aria-label') || '') + '|' + (ev.querySelector('.sch-row .val')?.textContent.trim() || '');
}

// 시간표 각 수업 칸 맨 위에 "👤 내 학생 이름" 표시 (인트라넷 요소는 안 건드리고 추가만)
function applyStuMarks() {
  const classes = window._kihSD?.classes;
  if (!classes) return;
  document.querySelectorAll('.rs-event').forEach(ev => {
    const names = classes[eventKey(ev)]?.names || [];
    let tag = ev.querySelector('.__kihstu');
    const text = names.length ? `👤 ${names.join(', ')}` : '';
    if (!text) { tag?.remove(); return; }
    if (tag?.textContent === text) return;
    if (!tag) {
      tag = document.createElement('div');
      tag.className = '__kihstu';
      tag.style.cssText = 'margin:0 0 4px;padding:2px 6px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;white-space:normal;line-height:1.4;';
      ev.prepend(tag);
    }
    tag.textContent = text;
  });
}

// 한 번 확인된 학생은 지우지 않고 합쳐서 저장 (빼려면 "↻ 전체")
// ponytail: 수강 취소된 학생도 남음 — "↻ 전체"가 초기화 경로
function saveClass(key, cnt, names) {
  if (!names) return; // 목록을 못 읽었으면 기존 표시 유지
  const old = stuDB().classes[key]?.names || [];
  stuDB().classes[key] = { cnt, names: [...new Set([...old, ...names])] };
  saveStuDB(); applyStuMarks();
}

// 수강생 창에서 담당 멘토가 나인 학생 이름 목록 (처음에 잘 되던 읽기 방식 그대로)
async function collectRows(modal, re) {
  const col = {}; // 헤더 제목 → 열 번호
  modal.querySelectorAll('th[aria-colindex]').forEach(th => {
    const t = th.querySelector('.k-column-title')?.textContent.trim();
    if (t) col[t] = th.getAttribute('aria-colindex');
  });
  const cell = (tr, name) => tr.querySelector(`td[aria-colindex="${col[name]}"]`);
  const scroller = modal.querySelector('.k-grid-content');
  const names = new Set(), mentors = new Set();
  let rows = 0;
  // 가상 스크롤이라 화면에 보이는 행만 있음 → 끝까지 내리며 수집
  for (let k = 0; k < 30; k++) {
    modal.querySelectorAll('tr.k-master-row').forEach(tr => {
      rows++;
      // 멘토 칸이 "송성기2 | 1-1팀" 형식 → "|" 앞 이름만
      const mentor = (cell(tr, '담당 멘토')?.textContent || '').split('|')[0].trim();
      mentors.add(mentor || '(빈칸)');
      if (!re.test(mentor)) return;
      const name = cell(tr, '수강생')?.querySelectorAll('.b080108-link')[0]?.textContent.trim();
      if (name) names.add(name);
    });
    if (!scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
    scroller.scrollTop += scroller.clientHeight;
    await sleep(300);
  }
  if (!rows) { // 0명으로 저장하지 않음
    _dbg ||= `수강생 창은 열렸는데 목록 줄 0개 (표 칸: ${Object.keys(col).join(',') || '없음'})`;
    return null;
  }
  if (!names.size) _dbg ||= `목록 ${rows}줄 · 담당 멘토 칸 값 예: ${[...mentors].slice(0, 4).join(', ')} · 표 칸: ${Object.keys(col).join(',')}`;
  return [...names];
}

// ── 내 이름 / 행 강조 ────────────────────────────────────────
function saveName() {
  const name = S.getElementById('i-name').value.trim();
  window._kihMe = name;
  chrome.storage.local.set({ myName: name });
  applyMyRow();
  S.getElementById('r-settings').textContent = `✅ "${name}" 저장됨`;
}

function applyMyRow() {
  if (!window._kihMe) return;
  document.querySelectorAll(ROW).forEach(row => {
    if (row.textContent.includes(window._kihMe)) {
      row.querySelectorAll(CELL).forEach(td => td.style.setProperty('font-weight', '700', 'important'));
    }
  });
}

// ── 상태 뱃지 + 재컨택요망 배경 ──────────────────────────────
const BADGE = {
  '배정완료':   ['#d1fae5','#065f46'],
  '미배정':     ['#fee2e2','#991b1b'],
  '내사예약':   ['#dbeafe','#1e40af'],
  '상담예정':   ['#dbeafe','#1e40af'],
  '컨택':       ['#fef3c7','#92400e'],
  '컨택완료':   ['#fef3c7','#92400e'],
  '전화안받음': ['#f3e8ff','#6b21a8'],
  '상담완료':   ['#dcfce7','#14532d'],
  '재컨택요망': ['#fef9c3','#854d0e'],
};

// <table>과 div 그리드(role=gridcell) 둘 다 대응
const CELL = 'td, [role="gridcell"], [role="cell"]';
const ROW  = 'tr, [role="row"]';

function applyBadges() {
  // DB 목록 그리드(.k-grid) 안에서만. 상세화면 입력칸은 건드리면 인트라넷이 에러남
  document.querySelectorAll('.k-grid td').forEach(cell => {
    if (cell.children.length && !cell.querySelector('.__kih')) return; // 버튼·입력 등 요소가 든 칸은 제외
    const raw = (cell.textContent || '').trim();
    // 띄어쓰기 무시 + 인트라넷 표기 "컨텍"을 "컨택"으로 통일
    const txt = raw.replace(/\s+/g, '').replace(/텍/g, '택');
    if (!txt) return;

    if (txt === '완납' || txt === 'COD') {
      cell.style.setProperty('font-weight', '700', 'important');
      return;
    }

    const key = txt.startsWith('재컨택') ? '재컨택요망' : txt;
    const color = BADGE[key];
    if (!color) return;

    // 작은 타원형 뱃지
    if (!cell.querySelector('.__kih')) {
      cell.innerHTML = `<span class="__kih" style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;background:${color[0]};color:${color[1]};">${raw}</span>`;
    }
  });
}

// ── 🔒 다음컨택일 일괄 넘기기 (비밀번호 잠금) ──────────────────
// ponytail: 확장 코드는 누구나 열어볼 수 있어 실수 방지용 잠금. 원문 대신 SHA-256 해시만 둠
const BULK_PW = '9dc6abc967dad3e2d115d25bdcb5b998f06ebda87c5f784800698d7cc1b2273d';
let _bulk = [], _bulkRun = false;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function unlockBulk() {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(S.getElementById('i-pw').value));
  const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (h !== BULK_PW) { S.getElementById('r-pw').textContent = '❌ 비밀번호가 틀렸습니다.'; return; }
  chrome.storage.local.set({ bulkOK: true }); // 이 PC에서는 다음부터 안 물어봄
  showBulk();
}
function showBulk() {
  S.getElementById('bulk-lock').style.display = 'none';
  S.getElementById('bulk-body').style.display = '';
}

// 문의DB 표(다음컨택일 칸이 있는 Kendo 그리드)에서 체크된 행 읽기
function loadBulk() {
  const out = S.getElementById('bulk-list');
  const g = q('.k-grid').find(g => [...g.querySelectorAll('.k-column-title')].some(t => t.textContent.trim() === '다음컨택일'));
  if (!g) { out.textContent = '도메인별/멘토별문의DB 목록 화면에서 눌러주세요.'; return; }
  const col = {};
  g.querySelectorAll('th[aria-colindex]').forEach(th => {
    const t = th.querySelector('.k-column-title')?.textContent.trim();
    if (t) col[t] = th.getAttribute('aria-colindex');
  });
  const cell = (tr, name) => tr.querySelector(`td[aria-colindex="${col[name]}"]`)?.textContent.trim() || '';
  _bulk = [...g.querySelectorAll('tr.k-master-row')]
    .filter(tr => tr.classList.contains('k-selected') || tr.querySelector('input.k-checkbox')?.getAttribute('aria-checked') === 'true')
    .map(tr => { const who = cell(tr, '문의자'); return { who, no: (who.match(/\((\d+)\)$/) || [])[1], status: cell(tr, '상담구분'), next: cell(tr, '다음컨택일') }; })
    .filter(r => r.no);
  if (!_bulk.length) { out.textContent = '체크된 DB가 없습니다. 목록 왼쪽 체크박스를 먼저 체크하세요.'; return; }
  out.innerHTML = `<b>${_bulk.length}건</b> <span class="hint">(뺄 DB는 체크 해제)</span>` + _bulk.map((r, i) =>
    `<div style="display:flex;gap:6px;align-items:center;margin:3px 0;"><input type="checkbox" data-i="${i}" checked/>${esc(r.who)} · ${esc(r.status)} · ${esc(r.next)}</div>`).join('');
}

async function runBulk() {
  const out = S.getElementById('r-bulk'), btn = S.getElementById('btn-bulk-run');
  if (_bulkRun) { _bulkRun = false; btn.textContent = '⏹ 중지 중…'; return; }
  const iso  = S.getElementById('i-bulk-date').value;
  const memo = S.getElementById('i-bulk-memo').value.trim();
  const text = S.getElementById('i-bulk-text').value.trim();
  const list = _bulk.filter((_, i) => S.querySelector(`#bulk-list input[data-i="${i}"]`)?.checked);
  if (!list.length) { out.textContent = '먼저 "체크한 DB 불러오기"를 누르세요.'; return; }
  if (!iso || !text) { out.textContent = '넘길 날짜와 상담내용을 입력하세요.'; return; }
  if (!confirm(`${list.length}건의 다음컨택일을 ${fmt(iso)}로 넘깁니다.\n건마다 상담메모가 새로 저장되고, 저장 후에는 수정할 수 없습니다.\n\n${list.map(r => `${r.who} (${r.status})`).join('\n')}\n\n진행할까요?`)) return;

  _bulkRun = true; btn.textContent = '⏹ 중지';
  const done = [];
  let err = '';
  for (const r of list) {
    if (!_bulkRun) { err = '중지함'; break; }
    out.textContent = `⏳ ${done.length + 1}/${list.length} ${r.who} 처리 중… (화면 건드리지 말기)`;
    err = await moveOne(r, iso, memo, text);
    await closeDrawers();
    if (err) { err = `${r.who}: ${err}`; break; } // ponytail: 한 건이라도 실패하면 멈춤 — 같은 원인으로 나머지도 틀어질 수 있음
    done.push(r.who);
  }
  _bulkRun = false; btn.textContent = '🚚 넘기기';
  out.innerHTML = `✅ ${done.length}건 완료` + (done.length ? `<br>${done.map(esc).join(', ')}` : '')
    + (err ? `<br>❌ 멈춤 — ${esc(err)}<br>남은 DB는 다시 체크 → 불러오기 후 진행하세요.` : '');
}

const openDrawers = () => q('.ant-drawer-open');
// 문의자 클릭 → 문의DB 상세 → 상담일지 → 상담결과(지금 그대로)·날짜·결과메모·상담내용 → 저장
async function moveOne(r, iso, memo, text) {
  const link = q('.linkBtn').find(b => b.textContent.trim().endsWith(`(${r.no})`));
  if (!link) return '목록에서 행을 못 찾음 (페이지가 바뀌었나요?)';
  link.click();
  // 이름을 누르면 상담메모 작성 창이 바로 뜸 (화면에 따라 문의DB 상세창이 먼저 뜨면 상담일지 버튼으로)
  const memoOpen = () => openDrawers().find(x => x.textContent.includes('상담메모 작성') && x.textContent.includes(`(${r.no})`));
  let d = await waitFor(() => memoOpen() || openDrawers().find(x => x.querySelector('#inquiry_no')?.value === r.no));
  if (d && !memoOpen()) {
    [...d.querySelectorAll('.ant-drawer-footer button')].find(b => b.textContent.trim() === '상담일지')?.click();
    d = await waitFor(memoOpen);
  }
  if (!d) return '상담메모 작성 창이 안 열림';

  // 상담구분은 상담메모 내역의 최신(등록일시 가장 늦은) 기록 그대로
  const e1 = await pickAntOption(d.querySelector('#result')?.closest('.ant-select'), latestStatus(d) || r.status);
  if (e1) return e1;
  const date = d.querySelector('#reservation_date');
  if (!date) return '날짜 칸을 못 찾음';
  await clickAntDate(date, iso);
  if (date.value !== iso) return `날짜 선택 실패 (칸 값: "${date.value}")`;
  if (memo) setReactVal(d.querySelector('#result_memo'), memo);
  setReactVal(d.querySelector('#counsel_memo'), text);
  await sleep(300);

  // 저장 버튼 = 오른쪽 아래 "상담일지 저장" (창 안에 없으면 화면 전체에서)
  const save = [...d.querySelectorAll('button'), ...q('button')].find(b => b.textContent.replace(/\s+/g, ' ').trim() === '상담일지 저장')
    || [...d.querySelectorAll('.ant-drawer-footer button')].find(b => b.textContent.trim() === '저장');
  if (!save) return '저장 버튼을 못 찾음';
  save.click();
  // "저장하시겠습니까?" 같은 확인창이 뜨면 확인
  (await waitFor(() => q('.ant-modal-confirm .ant-btn-primary, .ant-popconfirm:not(.ant-popover-hidden) .ant-btn-primary')[0], 1500))?.click();
  const res = await waitFor(() => {
    const e = d.querySelector('.ant-form-item-explain-error') || q('.ant-message-error')[0];
    if (e) return { e: e.textContent.trim() || '저장 오류' };
    if (!d.classList.contains('ant-drawer-open') || q('.ant-message-success')[0]) return { ok: 1 };
  }, 8000);
  if (!res) return '저장 후 반응 없음 — 이 DB가 저장됐는지 직접 확인해주세요';
  return res.e || '';
}

// 상담메모 내역 중 "[상담메모 등록일시: …]"가 가장 늦은 기록의 상담구분
function latestStatus(d) {
  let best = '', bestAt = '';
  d.querySelectorAll('div').forEach(el => {
    const m = el.children.length === 0 && el.textContent.match(/상담메모 등록일시:\s*([\d\-: ]+)/);
    if (!m || m[1] <= bestAt) return;
    const th = [...(el.nextElementSibling?.querySelectorAll('th') || [])].find(t => t.textContent.trim() === '상담구분');
    const v = th?.nextElementSibling?.textContent.trim();
    if (v) { best = v; bestAt = m[1]; }
  });
  return best;
}

// 날짜 칸을 열어 달력에서 그 날짜를 눌러 선택 (다른 달이면 다음/이전 달로 넘김). 안 되면 직접 입력
async function clickAntDate(input, iso) {
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  input.click(); input.focus();
  const dd = await waitFor(() => q('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)').pop(), 2000);
  for (let k = 0; dd && k < 24; k++) {
    const cell = dd.querySelector(`td.ant-picker-cell-in-view[title="${iso}"]`);
    if (cell) { (cell.querySelector('.ant-picker-cell-inner') || cell).click(); await sleep(300); break; }
    const shown = dd.querySelector(`td.ant-picker-cell-in-view[title]`)?.getAttribute('title') || '';
    dd.querySelector(shown.slice(0, 7) < iso.slice(0, 7) ? '.ant-picker-header-next-btn' : '.ant-picker-header-prev-btn')?.click();
    await sleep(200);
  }
  if (input.value !== iso) { setAntDate(input, iso); await sleep(300); }
}

// antd 셀렉트에서 항목 고르기 (가상 목록이라 안 보이면 내려가며 찾음)
async function pickAntOption(wrap, label) {
  if (!wrap) return '상담결과 칸을 못 찾음';
  (wrap.querySelector('.ant-select-selector') || wrap).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const dd = await waitFor(() => q('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').pop(), 2000);
  if (!dd) return '상담결과 목록이 안 열림';
  const seen = new Set();
  for (let k = 0; k < 15; k++) {
    const opts = [...dd.querySelectorAll('.ant-select-item-option')];
    opts.forEach(o => seen.add(labelOf(o)));
    const o = opts.find(o => labelOf(o) === label);
    if (o) { o.click(); await sleep(300); return ''; }
    const h = dd.querySelector('.rc-virtual-list-holder');
    if (!h) break;
    h.scrollTop += 150;
    await sleep(150);
  }
  return `상담결과 "${label}" 항목이 없음 (목록: ${[...seen].join(', ')})`;
}

async function closeDrawers() {
  for (let k = 0; k < 3; k++) {
    const d = openDrawers().pop();
    if (!d) return;
    d.querySelector('.ant-drawer-close')?.click();
    await sleep(500);
  }
}

// ── MutationObserver ─────────────────────────────────────────
let _t;
function observe() {
  new MutationObserver(() => {
    clearTimeout(_t);
    _t = setTimeout(() => { applyMyRow(); applyBadges(); applyStuMarks(); }, 600); // 뱃지가 마지막 → 재컨택 노랑이 초록에 안 가려짐
  }).observe(document.body, { childList: true, subtree: true });
}

// ── 메뉴 네비게이션 ──────────────────────────────────────────
function navigateTo(labels, i=0) {
  if (i >= labels.length) return;
  const el = Array.from(document.querySelectorAll('a,button,li,span,[role=menuitem]'))
    .find(e => e.textContent.trim() === labels[i] || e.textContent.trim().includes(labels[i]));
  if (!el) return;
  el.click();
  setTimeout(() => navigateTo(labels, i+1), 400);
}

// ── 유틸 ─────────────────────────────────────────────────────
function setReactVal(el, v) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  try { Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); } catch(_) { el.value=v; }
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}

// 사람처럼 입력: 클릭·포커스 → 값 → 키 입력 → blur (인트라넷이 포커스/blur 때 값을 저장함)
function typeInto(el, v) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.click();
  el.focus();
  setReactVal(el, v);
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: v.slice(-1) }));
  el.blur();
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function setAntDate(input, iso) {
  input.focus(); input.click();
  setReactVal(input, iso);
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
  input.blur();
}

function findBtn(labels) {
  const btns = q('button,input[type=button]');
  for (const l of labels) {
    const b = btns.find(b => b.textContent.trim().includes(l));
    if (b) return b;
  }
}

// 최상위 문서 + 같은 출처 iframe 문서 전체에서 검색
function q(sel) {
  const docs = [document];
  document.querySelectorAll('iframe').forEach(f => { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (_) {} });
  return docs.flatMap(d => Array.from(d.querySelectorAll(sel)));
}
function labelOf(el) { return (el.getAttribute('title') || el.textContent || '').trim(); }

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmt(iso) { const [,m,d]=iso.split('-'); return `${+m}월 ${+d}일`; }
function isoToMD(iso) { const [,m,d]=iso.split('-'); return `${parseInt(m)}.${parseInt(d)}`; }
function addDays(iso, n) { const d=new Date(iso); d.setDate(d.getDate()+n); return toISO(d); }

function bizDays(y,m,hols) {
  const days=[];
  const total=new Date(y,m,0).getDate();
  for(let d=1;d<=total;d++){
    const dow=new Date(y,m-1,d).getDay();
    if(dow!==0&&dow!==6&&!hols.includes(d)) days.push(d);
  }
  return days;
}
function cbLabel(cb) {
  if(cb.id){const l=document.querySelector(`label[for="${cb.id}"]`);if(l)return l.textContent.trim();}
  let n=cb.nextSibling;
  while(n){if(n.nodeType===3&&n.textContent.trim())return n.textContent.trim();if(n.nodeType===1)return n.textContent.trim();n=n.nextSibling;}
  return cb.closest('td,th,li,div')?.textContent.trim()||'';
}
function dayFromLabel(txt,m) {
  let r;
  r=txt.match(/^(\d{1,2})일?$/); if(r)return+r[1];
  r=txt.match(/^(\d{1,2})[\/.](\d{1,2})$/); if(r&&+r[1]===m)return+r[2];
  r=txt.match(/\d{4}-\d{2}-(\d{2})/); if(r)return+r[1];
  return null;
}
