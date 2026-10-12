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
input[type=text], input[type=date], input[type=month] {
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
chrome.storage.local.get(['holidays','myName','pendingContact'], data => {
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
    </div>`;

  // 탭 전환
  S.getElementById('tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (!t) return;
    S.querySelectorAll('.tab,.pane').forEach(el => el.classList.remove('on'));
    t.classList.add('on');
    S.getElementById(`pane-${t.dataset.p}`).classList.add('on');
  });

  S.getElementById('btn').addEventListener('click', () => S.getElementById('panel').classList.toggle('open'));
  S.getElementById('btn-today').addEventListener('click', () => { S.getElementById('i-date').value = toISO(new Date()); });
  S.getElementById('btn-contact').addEventListener('click', doContact);
  S.getElementById('btn-biz').addEventListener('click', doBizCheck);
  S.getElementById('btn-all').addEventListener('click', () => toggleCB(true));
  S.getElementById('btn-none').addEventListener('click', () => toggleCB(false));
  S.getElementById('btn-save').addEventListener('click', saveName);
  S.getElementById('i-ym').addEventListener('change', e => loadHol(e.target.value));

  loadHol(nowYM);
  buildGagangGrid();
  document.addEventListener('keydown', e => { if (e.altKey && e.key==='k') S.getElementById('panel').classList.toggle('open'); });
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

// ── MutationObserver ─────────────────────────────────────────
let _t;
function observe() {
  new MutationObserver(() => {
    clearTimeout(_t);
    _t = setTimeout(() => { applyMyRow(); applyBadges(); }, 600); // 뱃지가 마지막 → 재컨택 노랑이 초록에 안 가려짐
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
  try { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); } catch(_) { el.value=v; }
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
