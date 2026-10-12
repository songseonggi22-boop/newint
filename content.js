// 인트라넷 도우미 v2 - content script
'use strict';

// ── 개강일 목록 (하드코딩, 변경 시 수정) ────────────────────
const GAGANG_DATES = [
  '2025-12-10','2026-01-12','2026-02-10','2026-03-16',
  '2026-04-13','2026-05-13','2026-06-11','2026-07-14',
  '2026-08-12','2026-09-14','2026-10-19','2026-11-17',
  '2026-12-15','2027-01-14','2027-02-15','2027-03-16',
  '2027-04-13','2027-05-17','2027-06-14',
];

// ── 초기화 ───────────────────────────────────────────────────
chrome.storage.local.get(['holidays'], data => {
  window._kihHolidays = data.holidays || {};
  initUI();
});

function initUI() {
  applyStatusBadges();
  injectContactPanel();
  injectBizDayPanel();
  observeMutations();
  // 페이지 조회 버튼 클릭 감지 → 조회 후 영업일 오버레이 자동 실행
  detectSearchTrigger();
}

// ── Feature 3: 상태 뱃지 ─────────────────────────────────────
const STATUS_MAP = {
  '배정완료':'kih-badge-assigned','미배정':'kih-badge-unassigned',
  '상담예정':'kih-badge-scheduled','컨택':'kih-badge-contact',
  '컨택완료':'kih-badge-contact','내사예약':'kih-badge-scheduled',
};
function applyStatusBadges() {
  document.querySelectorAll('td').forEach(td => {
    const txt = td.textContent.trim();
    const cls = STATUS_MAP[txt];
    if (cls && !td.querySelector('.kih-badge')) {
      td.innerHTML = `<span class="kih-badge ${cls}">${txt}</span>`;
    }
  });
}

// ── Feature 2: 컨택 검색 패널 ────────────────────────────────
// 접근법: 페이지 필터 건드리지 않고 테이블 행을 클라이언트에서 직접 스캔·하이라이트
function injectContactPanel() {
  if (document.getElementById('kih-contact-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'kih-contact-panel';
  panel.className = 'collapsed';
  panel.innerHTML = `
    <button id="kih-panel-tab">컨택검색</button>
    <div id="kih-panel-body">
      <h4>🔍 컨택일·담당자 검색</h4>
      <label>컨택 날짜</label>
      <input id="kih-date-input" type="date" />
      <label>담당자명 (비워도 됨)</label>
      <input id="kih-mentor-input" type="text" placeholder="예: 송성기" />
      <button id="kih-panel-search">테이블에서 찾기</button>
      <button id="kih-panel-reset" style="margin-left:4px;background:#6b7280;">초기화</button>
      <div id="kih-panel-result"></div>
      <div class="tip" style="margin-top:8px;">
        결과메모에 해당 날짜가 포함된 행을 하이라이트합니다.<br>
        Alt+S: 패널 열기/닫기
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('kih-panel-tab').addEventListener('click', () =>
    panel.classList.toggle('collapsed'));
  document.getElementById('kih-panel-search').addEventListener('click', runContactSearch);
  document.getElementById('kih-panel-reset').addEventListener('click', resetContactSearch);
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 's') panel.classList.toggle('collapsed');
  });
}

function runContactSearch() {
  const rawDate = document.getElementById('kih-date-input').value; // YYYY-MM-DD
  const mentor  = document.getElementById('kih-mentor-input').value.trim();
  const result  = document.getElementById('kih-panel-result');

  if (!rawDate && !mentor) {
    result.textContent = '날짜 또는 담당자를 입력해주세요.';
    return;
  }

  // 날짜를 여러 포맷으로 변환해 텍스트 매칭에 사용
  const dateVariants = rawDate ? buildDateVariants(rawDate) : [];

  let found = 0, total = 0;
  document.querySelectorAll('table tbody tr, table tr').forEach(row => {
    if (row.querySelectorAll('th').length === row.cells.length) return; // 헤더행 skip
    total++;
    const text = row.textContent;

    const dateMatch  = dateVariants.length === 0 || dateVariants.some(v => text.includes(v));
    const mentorMatch = !mentor || text.includes(mentor);

    if (dateMatch && mentorMatch) {
      row.style.backgroundColor = '#fef3c7'; // 하이라이트
      row.style.fontWeight = '600';
      row.dataset.kihMatch = '1';
      found++;
    } else {
      row.style.opacity = '0.35';
      row.dataset.kihMatch = '0';
    }
  });

  result.innerHTML = `<b>${found}건</b> 찾음 (전체 ${total}행)`;
  if (found === 0) result.innerHTML += '<br><span style="color:#ef4444">날짜 포맷을 확인해보세요.</span>';
}

function resetContactSearch() {
  document.querySelectorAll('table tbody tr, table tr').forEach(row => {
    row.style.backgroundColor = '';
    row.style.fontWeight = '';
    row.style.opacity = '';
    delete row.dataset.kihMatch;
  });
  document.getElementById('kih-panel-result').textContent = '';
}

// YYYY-MM-DD → 여러 표기 변환
function buildDateVariants(iso) {
  const [y, m, d] = iso.split('-');
  const my = parseInt(m), dy = parseInt(d);
  return [
    iso,                                    // 2026-10-12
    `${y}.${m}.${d}`,                       // 2026.10.12
    `${y}/${m}/${d}`,                       // 2026/10/12
    `${my}/${dy}`,                          // 10/12
    `${my}.${dy}`,                          // 10.12
    `${my}월 ${dy}일`, `${my}월${dy}일`,    // 10월 12일
    `${dy}일`,                              // 12일 (같은 월 화면에서)
  ];
}

// ── Feature 1: 영업일 패널 ────────────────────────────────────
function injectBizDayPanel() {
  if (document.getElementById('kih-bizday-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'kih-bizday-btn';
  btn.className = 'kih-bizday-toggle';
  btn.textContent = '📅 영업일';
  btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'kih-bizday-panel';
  panel.style.cssText = `
    position:fixed;bottom:120px;right:16px;z-index:99999;
    background:#fff;border:1px solid #d1d5db;border-radius:10px;
    padding:14px;width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;
  `;
  panel.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:8px;">📅 영업일 설정</div>
    <label style="font-size:12px;color:#6b7280;">
      이번 달 <b>공휴일·휴강일 날짜</b>를 쉼표로 입력 (토·일 자동 제외)
    </label>
    <div style="display:flex;gap:6px;margin:6px 0;">
      <input id="kih-ym-input" type="month" style="flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
    </div>
    <input id="kih-holiday-input" type="text" placeholder="예: 3,9,10"
      style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;" />
    <div style="display:flex;gap:6px;">
      <button id="kih-save-biz" style="flex:1;padding:6px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">저장 및 오버레이</button>
      <button id="kih-clear-overlay" style="padding:6px 10px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">지우기</button>
    </div>
    <div id="kih-bizday-list" style="margin-top:10px;font-size:12px;max-height:200px;overflow-y:auto;"></div>
  `;
  document.body.appendChild(panel);

  btn.addEventListener('click', () => {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) {
      // 현재 달로 초기화
      const now = new Date();
      const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      document.getElementById('kih-ym-input').value = ym;
      loadHolidayInput(ym);
    }
  });

  document.getElementById('kih-ym-input').addEventListener('change', e => {
    loadHolidayInput(e.target.value);
  });

  document.getElementById('kih-save-biz').addEventListener('click', saveBizDays);
  document.getElementById('kih-clear-overlay').addEventListener('click', clearBizOverlay);
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'b') btn.click();
  });
}

function loadHolidayInput(ym) {
  const saved = (window._kihHolidays[ym] || []).join(',');
  document.getElementById('kih-holiday-input').value = saved;
}

function saveBizDays() {
  const ym  = document.getElementById('kih-ym-input').value;       // YYYY-MM
  if (!ym) return;
  const val = document.getElementById('kih-holiday-input').value;
  const holidays = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 31);
  window._kihHolidays[ym] = holidays;
  chrome.storage.local.set({ holidays: window._kihHolidays });

  const [year, mon] = ym.split('-').map(Number);
  const bizDays = calcBizDays(year, mon, holidays);
  renderBizDayList(mon, bizDays);
  applyBizDayOverlay(year, mon, bizDays);
}

function clearBizOverlay() {
  document.querySelectorAll('.kih-bizday-badge').forEach(b => b.remove());
  document.getElementById('kih-bizday-list').innerHTML = '';
}

// 영업일 계산: 토·일 + holidays 제외
function calcBizDays(year, mon, holidays) {
  const total = new Date(year, mon, 0).getDate();
  const days  = [];
  for (let d = 1; d <= total; d++) {
    const dow = new Date(year, mon - 1, d).getDay();
    if (dow !== 0 && dow !== 6 && !holidays.includes(d)) days.push(d);
  }
  return days;
}

function renderBizDayList(mon, bizDays) {
  document.getElementById('kih-bizday-list').innerHTML =
    '<b style="font-size:11px;">영업일 목록</b><br>' +
    bizDays.map((d, i) =>
      `<span style="display:inline-block;margin:2px;background:#ede9fe;color:#4f46e5;
        padding:2px 7px;border-radius:8px;font-size:11px;">${i+1}영업일=${mon}/${d}</span>`
    ).join('');
}

// 페이지 테이블 날짜 셀에 영업일 뱃지 삽입
function applyBizDayOverlay(year, mon, bizDays) {
  clearBizOverlay();
  document.querySelectorAll('td, th').forEach(cell => {
    const day = extractDay(cell.textContent.trim(), year, mon);
    if (day === null) return;
    const idx = bizDays.indexOf(day);
    if (idx !== -1) {
      const badge = document.createElement('span');
      badge.className = 'kih-bizday-badge';
      badge.textContent = `${idx+1}영업일`;
      cell.appendChild(badge);
    }
  });
}

// 셀 텍스트에서 날짜(일) 추출 - 여러 포맷 지원
function extractDay(txt, year, mon) {
  // "2026-10-07"
  const m1 = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1 && parseInt(m1[1]) === year && parseInt(m1[2]) === mon) return parseInt(m1[3]);
  // "10/7" or "10/07"
  const m2 = txt.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2 && parseInt(m2[1]) === mon) return parseInt(m2[2]);
  // "7일" or "07"
  const m3 = txt.match(/^(\d{1,2})일?$/);
  if (m3) { const d = parseInt(m3[1]); if (d >= 1 && d <= 31) return d; }
  // "10.7"
  const m4 = txt.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m4 && parseInt(m4[1]) === mon) return parseInt(m4[2]);
  return null;
}

// ── 조회 버튼 클릭 감지 → 영업일 자동 오버레이 ──────────────
function detectSearchTrigger() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('button, input[type="button"]');
    if (!btn) return;
    if (/조회|검색|search/i.test(btn.textContent)) {
      // 개강일 선택 드롭다운 값 읽기
      const gagangSel = findGagangSelect();
      if (!gagangSel) return;
      const val = gagangSel.value || gagangSel.options[gagangSel.selectedIndex]?.value;
      if (!val) return;
      // 개강일 날짜 파싱 → 해당 월 영업일 오버레이 (조회 결과 로드 후)
      setTimeout(() => {
        const d = new Date(val);
        if (isNaN(d)) return;
        const year = d.getFullYear(), mon = d.getMonth() + 1;
        const ym  = `${year}-${String(mon).padStart(2,'0')}`;
        const holidays = window._kihHolidays[ym] || [];
        const bizDays  = calcBizDays(year, mon, holidays);
        applyBizDayOverlay(year, mon, bizDays);
        renderBizDayList(mon, bizDays);
        // 패널도 해당 월로 업데이트
        const ymInput = document.getElementById('kih-ym-input');
        if (ymInput) { ymInput.value = ym; loadHolidayInput(ym); }
      }, 800);
    }
  });
}

// 개강일 select 엘리먼트 찾기
function findGagangSelect() {
  // option 값이 GAGANG_DATES 목록에 포함된 select 탐색
  return Array.from(document.querySelectorAll('select')).find(sel =>
    Array.from(sel.options).some(opt => GAGANG_DATES.includes(opt.value))
  ) || Array.from(document.querySelectorAll('select')).find(sel =>
    // 또는 label/id에 개강일 관련 텍스트가 있는 경우
    /개강일/i.test(getLabelFor(sel))
  );
}

function getLabelFor(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent;
  }
  const td = el.closest('td, th');
  if (td?.previousElementSibling) return td.previousElementSibling.textContent;
  return '';
}

// ── MutationObserver: SPA 페이지 전환 대응 ──────────────────
let _debounce;
function observeMutations() {
  new MutationObserver(() => {
    clearTimeout(_debounce);
    _debounce = setTimeout(applyStatusBadges, 500);
  }).observe(document.body, { childList: true, subtree: true });
}
