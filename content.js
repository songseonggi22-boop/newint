// 인트라넷 도우미 v5
// - 시간표관리: 개강일 버튼 → 드롭다운 자동 선택 + 조회
// - 컨택 조회: 도메인별문의DB로 이동 + 날짜·담당자 필터 자동 적용
'use strict';

const GAGANG_DATES = [
  '2025-12-10','2026-01-12','2026-02-10','2026-03-16',
  '2026-04-13','2026-05-13','2026-06-11','2026-07-14',
  '2026-08-12','2026-09-14','2026-10-19','2026-11-17',
  '2026-12-15','2027-01-14','2027-02-15','2027-03-16',
  '2027-04-13','2027-05-17','2027-06-14',
];

// ── 페이지 로드 후 초기화 ────────────────────────────────────
chrome.storage.local.get(['holidays','myName','pendingContact'], data => {
  window._kihHolidays      = data.holidays       || {};
  window._kihMyName        = data.myName          || '';
  window._kihPendingContact = data.pendingContact || null;

  applyStatusBadges();
  applyMyNameHighlight();
  detectPageAndInit();
  observeMutations();

  // 이전 페이지에서 요청한 컨택 조회가 있으면 실행
  if (window._kihPendingContact) {
    setTimeout(executePendingContact, 1000);
  }
});

// ── 현재 페이지 감지 후 해당 기능 주입 ──────────────────────
function detectPageAndInit() {
  const url   = location.href;
  const title = document.title;
  const bodyText = document.body?.innerText || '';

  // 시간표관리 페이지 감지
  const isSchedule = /시간표관리|timetable|schedule/i.test(url + title + bodyText.slice(0,500));
  // 문의DB 도메인별 페이지 감지
  const isContactDB = /도메인별문의|문의db|contactdb/i.test(url + title + bodyText.slice(0,500));
  // 문의DB 멘토별 페이지 감지
  const isMentorDB  = /멘토별문의|mentoDb/i.test(url + title + bodyText.slice(0,500));

  // 항상 표시: 플로팅 컨트롤 패널
  injectFloatingPanel(isSchedule, isContactDB || isMentorDB);

  if (isSchedule) {
    injectScheduleQuickBtns();
  }
}

// ═══════════════════════════════════════════════════════════════
// 플로팅 컨트롤 패널 (모든 페이지에 항상 표시)
// ═══════════════════════════════════════════════════════════════
function injectFloatingPanel(isSchedule, isContactPage) {
  if (document.getElementById('kih-main-panel')) return;

  const todayISO = toISO(new Date());

  const panel = document.createElement('div');
  panel.id = 'kih-main-panel';
  panel.innerHTML = `
    <div id="kih-tab-bar">
      <button class="kih-tab active" data-tab="contact">📞 컨택조회</button>
      <button class="kih-tab"        data-tab="schedule">📅 시간표</button>
      <button class="kih-tab"        data-tab="settings">⚙️ 설정</button>
    </div>

    <!-- ── 컨택 조회 탭 ── -->
    <div id="kih-tab-contact" class="kih-tab-content active">
      <p class="kih-desc">날짜·담당자 선택 → 도메인별문의DB에서<br>컨택 예정 DB 자동 조회</p>
      <label>날짜</label>
      <div class="kih-row">
        <input id="kih-date-input" type="date" value="${todayISO}" />
        <button id="kih-today-btn" class="kih-btn-sm kih-green">오늘</button>
      </div>
      <label>담당자명 <span class="kih-hint">(비우면 전체)</span></label>
      <input id="kih-mentor-input" type="text" placeholder="예: 송성기"
             value="${window._kihMyName}" />
      <button id="kih-go-contact" class="kih-btn-primary" style="margin-top:8px;">
        🔍 문의DB 이동 후 조회
      </button>
      <div id="kih-contact-result" class="kih-result"></div>
    </div>

    <!-- ── 시간표 탭 ── -->
    <div id="kih-tab-schedule" class="kih-tab-content">
      <p class="kih-desc">개강일 클릭 → 시간표관리 페이지에서<br>자동 선택 + 조회</p>
      <div id="kih-gagang-grid"></div>
      <div style="border-top:1px solid #f3f4f6;margin:10px 0;"></div>
      <label>공휴일·휴강일 <span class="kih-hint">(쉼표 구분)</span></label>
      <input id="kih-ym-input" type="month" style="margin-bottom:6px;" />
      <input id="kih-holiday-input" type="text" placeholder="예: 3,9,10" />
      <div class="kih-row" style="margin-top:6px;">
        <button id="kih-auto-check"  class="kih-btn-primary" style="flex:1;">✅ 영업일만 체크</button>
        <button id="kih-check-all"   class="kih-btn-sm kih-green">전체</button>
        <button id="kih-uncheck-all" class="kih-btn-sm" style="background:#6b7280;">해제</button>
      </div>
      <div id="kih-schedule-result" class="kih-result"></div>
      <div id="kih-bizday-list"></div>
    </div>

    <!-- ── 설정 탭 ── -->
    <div id="kih-tab-settings" class="kih-tab-content">
      <label>내 이름 <span class="kih-hint">(내 행 초록 강조)</span></label>
      <div class="kih-row">
        <input id="kih-myname-input" type="text" placeholder="예: 송성기"
               value="${window._kihMyName}" />
        <button id="kih-myname-save" class="kih-btn-sm kih-green">저장</button>
      </div>
      <div id="kih-settings-result" class="kih-result"></div>
      <div style="border-top:1px solid #f3f4f6;margin:10px 0;"></div>
      <div class="kih-desc">
        <b>단축키</b><br>
        Alt+K: 패널 열기/닫기<br>
        Alt+S: 컨택 조회 탭<br>
        Alt+B: 시간표 탭
      </div>
    </div>
  `;

  // 토글 버튼
  const toggle = document.createElement('button');
  toggle.id = 'kih-toggle-btn';
  toggle.textContent = '🏢';
  toggle.title = '인트라넷 도우미 (Alt+K)';
  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  // 개강일 버튼 렌더
  renderGagangGrid();

  // 탭 전환
  panel.querySelectorAll('.kih-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.kih-tab,.kih-tab-content').forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`kih-tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // 이벤트
  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('kih-today-btn').addEventListener('click', () => {
    document.getElementById('kih-date-input').value = toISO(new Date());
  });
  document.getElementById('kih-go-contact').addEventListener('click', goToContactDB);
  document.getElementById('kih-auto-check').addEventListener('click', autoCheckBizDays);
  document.getElementById('kih-check-all').addEventListener('click', () => toggleAllCheckboxes(true));
  document.getElementById('kih-uncheck-all').addEventListener('click', () => toggleAllCheckboxes(false));
  document.getElementById('kih-myname-save').addEventListener('click', saveMyName);
  document.getElementById('kih-ym-input').addEventListener('change', e => loadHolidayInput(e.target.value));

  // 현재 달 기본값
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('kih-ym-input').value = defaultYM;
  loadHolidayInput(defaultYM);

  // 단축키
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'k') panel.classList.toggle('open');
    if (e.altKey && e.key === 's') { panel.classList.add('open'); switchTab('contact'); }
    if (e.altKey && e.key === 'b') { panel.classList.add('open'); switchTab('schedule'); }
  });
}

function switchTab(name) {
  document.querySelectorAll('.kih-tab,.kih-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelector(`.kih-tab[data-tab="${name}"]`)?.classList.add('active');
  document.getElementById(`kih-tab-${name}`)?.classList.add('active');
}

// ─── 개강일 버튼 그리드 ─────────────────────────────────────
function renderGagangGrid() {
  const grid = document.getElementById('kih-gagang-grid');
  if (!grid) return;
  const today = new Date();
  const recent = GAGANG_DATES
    .filter(d => {
      const dt = new Date(d);
      // 3달 전부터 6달 후까지 표시
      return dt >= new Date(today.getFullYear(), today.getMonth()-3, 1) &&
             dt <= new Date(today.getFullYear(), today.getMonth()+6, 1);
    });
  grid.innerHTML = recent.map(d => {
    const dt  = new Date(d);
    const lbl = `${dt.getFullYear().toString().slice(2)}.${dt.getMonth()+1}.${dt.getDate()}`;
    const isPast = dt < today;
    return `<button class="kih-gagang-btn${isPast?' kih-past':''}" data-date="${d}">${lbl}</button>`;
  }).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.kih-gagang-btn');
    if (!btn) return;
    grid.querySelectorAll('.kih-gagang-btn').forEach(b => b.classList.remove('kih-selected'));
    btn.classList.add('kih-selected');
    selectGagangDate(btn.dataset.date);
  });
}

// ─── 개강일 선택 → 시간표 DatePicker 자동 설정 ─────────────
// 시작일 = 선택한 개강일, 종료일 = 다음 개강일 전날
function selectGagangDate(dateStr) {
  const resultEl = document.getElementById('kih-schedule-result');

  // 다음 개강일 계산
  const nextGagang = GAGANG_DATES.find(d => d > dateStr) || dateStr;
  const endDate    = nextGagang === dateStr
    ? dateStr
    : addDays(nextGagang, -1); // 다음 개강일 전날

  const startInput = document.querySelector('input[date-range="start"]');
  const endInput   = document.querySelector('input[date-range="end"]');

  if (startInput && endInput) {
    // Ant Design DatePicker에 직접 입력
    setAntDate(startInput, dateStr);
    setTimeout(() => {
      setAntDate(endInput, endDate);
      resultEl.innerHTML = `✅ ${formatDate(dateStr)} ~ ${formatDate(endDate)}`;
      // 조회 버튼 자동 클릭
      setTimeout(() => {
        const qBtn = findBtn(['조회','검색']);
        if (qBtn) { qBtn.click(); resultEl.innerHTML += ' — 조회 실행됨'; }
        // 조회 결과에 영업일 뱃지
        setTimeout(() => overlayBizDayBadges(dateStr), 1000);
      }, 400);
    }, 350);
  } else {
    // DatePicker 없음 → 메뉴 이동 시도
    resultEl.innerHTML = '⏳ 시간표관리 메뉴로 이동 중…';
    chrome.storage.local.set({ pendingSchedule: dateStr });
    const ok = navigateByMenu(['운영관리','시간표관리','시간표관리']);
    if (!ok) resultEl.innerHTML = `<span style="color:#ef4444">시간표관리 페이지로 먼저 이동해주세요.</span>`;
  }
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function overlayBizDayBadges(dateStr) {
  const d   = new Date(dateStr);
  const yr  = d.getFullYear(), mn = d.getMonth()+1;
  const ym  = `${yr}-${String(mn).padStart(2,'0')}`;
  const holidays = window._kihHolidays[ym] || [];
  const bizDays  = calcBizDays(yr, mn, holidays);
  document.querySelectorAll('.kih-bizday-badge').forEach(b => b.remove());
  document.querySelectorAll('td,th').forEach(cell => {
    const day = extractDay(cell.textContent.trim(), yr, mn);
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

// ═══════════════════════════════════════════════════════════════
// 컨택 조회 → 도메인별문의DB 페이지 이동 후 필터 적용
// ═══════════════════════════════════════════════════════════════
function goToContactDB() {
  const isoDate = document.getElementById('kih-date-input').value;
  const mentor  = document.getElementById('kih-mentor-input').value.trim();
  const resultEl = document.getElementById('kih-contact-result');
  if (!isoDate) { resultEl.textContent = '날짜를 선택해주세요.'; return; }

  // 이미 문의DB 페이지면 바로 필터 적용
  const isContactPage = /도메인별문의|문의.*db|contactdb/i.test(
    location.href + document.title + document.body.innerText.slice(0,400)
  );

  if (isContactPage) {
    applyContactFilters(isoDate, mentor, resultEl);
    return;
  }

  // 다른 페이지면: 요청 저장 후 메뉴 클릭으로 이동
  resultEl.innerHTML = '⏳ 도메인별문의DB로 이동 중…';
  chrome.storage.local.set({
    pendingContact: { date: isoDate, mentor }
  });
  // 메뉴 클릭으로 이동 시도
  const navSuccess = navigateByMenu(['사업관리','문의DB','도메인별문의DB']);
  if (!navSuccess) {
    resultEl.innerHTML = `
      <span style="color:#ef4444">메뉴를 자동으로 찾지 못했습니다.</span><br>
      <b>수동으로 이동해주세요:</b><br>
      사업관리 → 문의DB → 도메인별문의DB<br>
      <br>이동 후 패널에서 다시 <b>🔍 문의DB 이동 후 조회</b>를 누르면<br>
      자동으로 필터가 적용됩니다.`;
    // 이동 후 자동 적용될 수 있도록 저장은 유지
  }
}

// 문의DB 페이지에서 필터 적용 + 조회
// - DatePicker는 건드리지 않음
// - 문의자 → 결과메모 전환
// - 검색어 input에 날짜, 멘토선택 input에 담당자 이름
function applyContactFilters(isoDate, mentor, resultEl) {
  // ① 문의자 → 결과메모 전환
  switchSearchType('결과메모');
  // 메인담당 → 메인+서브 전환
  switchAntSelect('메인담당', '메인+서브');

  // ② 전환 후 검색어 input에 날짜, 멘토 입력
  setTimeout(() => {
    const searchInput = document.querySelector('input[placeholder="검색어를 입력해 주세요"]');
    if (searchInput) setVal(searchInput, isoToMD(isoDate)); // MM.DD 형식

    // ③ 멘토선택 input에 담당자 이름
    if (mentor) {
      const mentorInput = document.querySelector('input[placeholder="멘토선택"]');
      if (mentorInput) setVal(mentorInput, mentor);
    }

    finishContactSearch(isoDate, mentor, resultEl);
  }, 350); // 드롭다운 전환 후 input이 바뀔 수 있으므로 대기
}

// Ant Design Select 전환 (클릭 → 옵션 선택)
function switchAntSelect(currentText, targetText) {
  // title 속성 또는 textContent로 현재 선택 항목 찾기
  const item = Array.from(document.querySelectorAll('.ant-select-selection-item'))
    .find(el => el.textContent.trim() === currentText || el.getAttribute('title') === currentText);
  if (!item) return;

  const wrap = item.closest('.ant-select');
  if (!wrap) return;

  // 드롭다운 열기 — selector 안쪽 클릭
  const selector = wrap.querySelector('.ant-select-selector');
  (selector || wrap).click();

  // 옵션이 DOM에 렌더될 때까지 polling (최대 1초)
  let attempts = 0;
  const pick = setInterval(() => {
    attempts++;
    const opts = document.querySelectorAll('.ant-select-item-option-content');
    const opt  = Array.from(opts).find(el => el.textContent.trim() === targetText);
    if (opt) {
      opt.click();
      clearInterval(pick);
    } else if (attempts > 10) {
      clearInterval(pick); // 타임아웃
    }
  }, 100);
}

function switchSearchType(targetText) {
  switchAntSelect('문의자', targetText);
}

// Ant Design DatePicker에 날짜 입력 (클릭 → 값 지정 → Enter)
function setAntDate(input, isoDate) {
  // 포맷: YYYY-MM-DD → YYYY-MM-DD (picker가 받는 그대로)
  input.focus();
  input.click();

  // 기존 값 지우고 새 값 입력
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  nativeSetter.set.call(input, isoDate);
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Enter로 확정
  input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keyup',   { key:'Enter', keyCode:13, bubbles:true }));
  input.blur();
}

function finishContactSearch(isoDate, mentor, resultEl) {
  // 조회 버튼 클릭
  const qBtn = findBtn(['조회','검색']);
  if (qBtn) {
    qBtn.click();
    resultEl.innerHTML = `🔄 ${formatDate(isoDate)} ${mentor ? `"${mentor}"` : '전체'} 조회 중…`;
    setTimeout(() => {
      highlightContactRows(isoDate, mentor, resultEl);
      applyMyNameHighlight();
      chrome.storage.local.remove('pendingContact');
    }, 1500);
  } else {
    resultEl.innerHTML = `✅ 필터 적용됨 — 조회 버튼을 눌러주세요`;
  }
}

// 조회 결과 행 하이라이트 + 요약
function highlightContactRows(isoDate, mentor, resultEl) {
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  if (rows.length === 0) {
    resultEl.textContent = '조회 결과가 없습니다.';
    return;
  }

  const variants = buildDateVariants(isoDate);
  const headers  = Array.from(document.querySelectorAll('table thead th, table tr:first-child th'));
  const mentorIdx = headers.findIndex(th => /멘토|담당자/i.test(th.textContent));

  const summary = {};
  let matched = 0;
  rows.forEach(row => {
    const txt = row.textContent;
    const dateMatch   = variants.some(v => txt.includes(v));
    const mentorMatch = !mentor || txt.includes(mentor);

    if (dateMatch && mentorMatch) {
      row.classList.add('kih-contact-match');
      matched++;
      const m = mentorIdx >= 0 ? (row.cells[mentorIdx]?.textContent.trim() || '미상') : (mentor || '전체');
      summary[m] = (summary[m]||0) + 1;
    } else {
      row.style.opacity = '0.35';
    }
  });

  const chips = Object.entries(summary)
    .sort((a,b)=>b[1]-a[1])
    .map(([m,c])=>`<span class="kih-mentor-chip">${m} <b>${c}건</b></span>`)
    .join('');

  resultEl.innerHTML = matched > 0
    ? `<div class="kih-summary-title">${formatDate(isoDate)} 컨택 예정 <b>${matched}건</b></div>${chips}`
    : `<span style="color:#ef4444">조회된 행에서 날짜를 찾지 못했습니다.<br>필터가 서버에서 처리됐을 수 있습니다.</span>`;
}

// 페이지 로드 시 대기 중인 컨택 조회 실행
function executePendingContact() {
  const p = window._kihPendingContact;
  if (!p) return;
  chrome.storage.local.remove('pendingContact');
  window._kihPendingContact = null;

  // 패널 열고 컨택 탭으로 이동
  document.getElementById('kih-main-panel')?.classList.add('open');
  switchTab('contact');
  if (p.date)   setVal(document.getElementById('kih-date-input'),   p.date);
  if (p.mentor) setVal(document.getElementById('kih-mentor-input'), p.mentor);

  const resultEl = document.getElementById('kih-contact-result');
  resultEl.textContent = '⏳ 필터 적용 중…';
  setTimeout(() => applyContactFilters(p.date, p.mentor, resultEl), 800);
}

// ─── 메뉴 클릭 네비게이션 ───────────────────────────────────
// labels: ['사업관리','문의DB','도메인별문의DB'] 순서대로 클릭
function navigateByMenu(labels) {
  function clickNext(idx) {
    if (idx >= labels.length) return true;
    const target = labels[idx];
    // 링크, 버튼, 메뉴 항목 중 텍스트 일치하는 것 탐색
    const el = Array.from(document.querySelectorAll('a,button,li,span,[role="menuitem"]'))
      .find(e => e.textContent.trim() === target || e.textContent.trim().includes(target));
    if (!el) return false;
    el.click();
    // 서브메뉴가 DOM에 나타날 때까지 대기
    setTimeout(() => clickNext(idx + 1), 400);
    return true;
  }
  return clickNext(0);
}

// ─── 시간표관리 페이지 직접 개강일 버튼 주입 ────────────────
function injectScheduleQuickBtns() {
  if (document.getElementById('kih-schedule-inline')) return;

  // 드롭다운 select 찾기
  const sel = findGagangSelect();
  if (!sel) return;

  const container = document.createElement('div');
  container.id = 'kih-schedule-inline';

  const today = new Date();
  const btns = GAGANG_DATES
    .filter(d => {
      const dt = new Date(d);
      return dt >= new Date(today.getFullYear(), today.getMonth()-2, 1) &&
             dt <= new Date(today.getFullYear(), today.getMonth()+6, 1);
    })
    .map(d => {
      const dt  = new Date(d);
      const lbl = `${dt.getMonth()+1}/${dt.getDate()}`;
      return `<button class="kih-gagang-btn kih-inline-btn" data-date="${d}">${lbl}</button>`;
    }).join('');

  container.innerHTML = `<span style="font-size:12px;color:#6b7280;margin-right:6px;">개강일 빠른 선택:</span>${btns}`;

  // 드롭다운 바로 위에 삽입
  sel.parentNode.insertBefore(container, sel);

  container.addEventListener('click', e => {
    const btn = e.target.closest('.kih-gagang-btn');
    if (!btn) return;
    container.querySelectorAll('.kih-gagang-btn').forEach(b => b.classList.remove('kih-selected'));
    btn.classList.add('kih-selected');
    selectGagangDate(btn.dataset.date);
  });
}

// ─── 영업일 체크박스 ─────────────────────────────────────────
function autoCheckBizDays() {
  const ym  = document.getElementById('kih-ym-input').value;
  const resultEl = document.getElementById('kih-schedule-result');
  if (!ym) { resultEl.textContent = '연월을 선택해주세요.'; return; }

  const val      = document.getElementById('kih-holiday-input').value;
  const holidays = val.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)&&n>=1&&n<=31);
  window._kihHolidays[ym] = holidays;
  chrome.storage.local.set({ holidays: window._kihHolidays });

  const [year, mon] = ym.split('-').map(Number);
  const bizDays    = calcBizDays(year, mon, holidays);
  const result     = applyCheckboxes(bizDays, mon);
  renderBizDayList(mon, bizDays);

  resultEl.innerHTML = result.found > 0
    ? `✅ ${result.found}개 중 <b>${result.checked}개</b> 영업일 체크`
    : `<span style="color:#ef4444">체크박스 없음 — 시간표관리 페이지에서 실행해주세요</span>`;
}

function applyCheckboxes(bizDays, mon) {
  let found=0, checked=0;
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const day = parseDayFromLabel(getCheckboxLabel(cb), mon);
    if (day === null) return;
    found++;
    const should = bizDays.includes(day);
    if (cb.checked !== should) cb.click();
    if (should) checked++;
  });
  return { found, checked };
}

function toggleAllCheckboxes(check) {
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked !== check) cb.click();
  });
}

function loadHolidayInput(ym) {
  const el = document.getElementById('kih-holiday-input');
  if (el) el.value = (window._kihHolidays[ym]||[]).join(',');
}

function renderBizDayList(mon, bizDays) {
  const el = document.getElementById('kih-bizday-list');
  if (!el) return;
  el.innerHTML = `<div style="font-size:11px;margin-top:6px;"><b>${mon}월 영업일 ${bizDays.length}일</b><br>` +
    bizDays.map((d,i)=>`<span class="kih-bizday-chip">${i+1}영업일=${d}일</span>`).join('') + '</div>';
}

// ─── 내 이름 설정 ────────────────────────────────────────────
function saveMyName() {
  const name = document.getElementById('kih-myname-input').value.trim();
  window._kihMyName = name;
  chrome.storage.local.set({ myName: name });
  applyMyNameHighlight();
  document.getElementById('kih-settings-result').textContent = `✅ "${name}" 저장됨`;
}

// ─── 상태 뱃지 ──────────────────────────────────────────────
const STATUS_MAP = {
  // 배정 상태
  '배정완료':    'kih-badge-assigned',
  '미배정':      'kih-badge-unassigned',
  '내사예약':    'kih-badge-scheduled',
  '컨택':        'kih-badge-contact',
  '컨택완료':    'kih-badge-contact',
  // 상담구분
  '전화안받음':  'kih-badge-noanswer',
  '상담예정':    'kih-badge-scheduled',
  '상담완료':    'kih-badge-done',
  '재컨택요망':  'kih-badge-recontact',
};
function applyStatusBadges() {
  document.querySelectorAll('td').forEach(td => {
    const txt = td.textContent.trim();

    // 완납 / COD → 굵은 폰트
    if (txt === '완납' || txt === 'COD') {
      td.style.fontWeight = '700';
      return;
    }

    // 상태 뱃지
    const cls = STATUS_MAP[txt];
    if (cls && !td.querySelector('.kih-badge')) {
      td.innerHTML = `<span class="kih-badge ${cls}">${txt}</span>`;
      // 재컨택요망이면 행 전체 td에 노란 배경 직접 주입
      if (txt === '재컨택요망') {
        const tr = td.closest('tr');
        if (tr) {
          tr.querySelectorAll('td').forEach(cell => {
            cell.style.setProperty('background-color', '#fef9c3', 'important');
          });
        }
      }
    }
  });
}

function applyMyNameHighlight() {
  if (!window._kihMyName) return;
  document.querySelectorAll('table tbody tr').forEach(row => {
    if (row.textContent.includes(window._kihMyName)) {
      row.classList.add('kih-my-row');
    }
  });
}

// ─── 유틸 ───────────────────────────────────────────────────
function calcBizDays(year, mon, holidays) {
  const total = new Date(year, mon, 0).getDate();
  const days  = [];
  for (let d=1; d<=total; d++) {
    const dow = new Date(year, mon-1, d).getDay();
    if (dow!==0 && dow!==6 && !holidays.includes(d)) days.push(d);
  }
  return days;
}

function extractDay(txt, year, mon) {
  let m;
  m = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && +m[1]===year && +m[2]===mon) return +m[3];
  m = txt.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && +m[1]===mon) return +m[2];
  m = txt.match(/^(\d{1,2})일?$/);
  if (m) { const d=+m[1]; if(d>=1&&d<=31) return d; }
  m = txt.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m && +m[1]===mon) return +m[2];
  return null;
}

function getCheckboxLabel(cb) {
  if (cb.id) {
    const lbl = document.querySelector(`label[for="${cb.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  let node = cb.nextSibling;
  while (node) {
    if (node.nodeType===3 && node.textContent.trim()) return node.textContent.trim();
    if (node.nodeType===1) return node.textContent.trim();
    node = node.nextSibling;
  }
  return cb.closest('td,th,li,div')?.textContent.trim() || '';
}

function parseDayFromLabel(txt, mon) {
  let m;
  m = txt.match(/^(\d{1,2})일?$/);
  if (m) return +m[1];
  m = txt.match(/^(\d{1,2})[\/\.](\d{1,2})$/);
  if (m && +m[1]===mon) return +m[2];
  m = txt.match(/\d{4}-\d{2}-(\d{2})/);
  if (m) return +m[1];
  return null;
}

// YYYY-MM-DD → MM.DD (예: 2026-10-12 → 10.12)
function isoToMD(iso) {
  const [,m,d] = iso.split('-');
  return `${parseInt(m)}.${parseInt(d)}`;
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatDate(iso) {
  const [,m,d]=iso.split('-'); return `${+m}월 ${+d}일`;
}
function buildDateVariants(iso) {
  const [y,m,d]=iso.split('-'); const my=+m,dy=+d;
  return [iso,`${y}.${m}.${d}`,`${y}/${m}/${d}`,
    `${my}/${dy}`,`${my}.${dy}`,`${my}월 ${dy}일`,`${my}월${dy}일`,
    `${String(my).padStart(2,'0')}/${String(dy).padStart(2,'0')}`];
}
function getLabelFor(el) {
  if (el.id) { const l=document.querySelector(`label[for="${el.id}"]`); if(l) return l.textContent; }
  return el.closest('td,th')?.previousElementSibling?.textContent||'';
}
function findBtn(labels) {
  return Array.from(document.querySelectorAll('button,input[type="button"]'))
    .find(b=>labels.some(l=>b.textContent.trim().includes(l)));
}
function setVal(el, value) {
  if (!el) return;
  try { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value); }
  catch(_) { el.value=value; }
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}

// ─── MutationObserver ────────────────────────────────────────
let _deb;
function observeMutations() {
  new MutationObserver(()=>{
    clearTimeout(_deb);
    _deb=setTimeout(()=>{
      applyStatusBadges();
      applyMyNameHighlight();
      // 시간표 페이지에서 드롭다운이 뒤늦게 렌더되면 개강일 버튼 재주입
      if (!document.getElementById('kih-schedule-inline')) injectScheduleQuickBtns();
    },600);
  }).observe(document.body,{childList:true,subtree:true});
}
