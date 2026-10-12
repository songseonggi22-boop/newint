// 인트라넷 도우미 v4
'use strict';

// ── 개강일 목록 ──────────────────────────────────────────────
const GAGANG_DATES = [
  '2025-12-10','2026-01-12','2026-02-10','2026-03-16',
  '2026-04-13','2026-05-13','2026-06-11','2026-07-14',
  '2026-08-12','2026-09-14','2026-10-19','2026-11-17',
  '2026-12-15','2027-01-14','2027-02-15','2027-03-16',
  '2027-04-13','2027-05-17','2027-06-14',
];

// ── 초기화 ───────────────────────────────────────────────────
chrome.storage.local.get(['holidays', 'myName'], data => {
  window._kihHolidays = data.holidays || {};
  window._kihMyName   = data.myName   || '';
  applyStatusBadges();
  applyMyNameHighlight();
  injectContactPanel();
  injectBizDayPanel();
  observeMutations();
});

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

// ── Feature 4: 내 담당자 행 강조 ─────────────────────────────
function applyMyNameHighlight() {
  if (!window._kihMyName) return;
  document.querySelectorAll('table tbody tr').forEach(row => {
    if (row.textContent.includes(window._kihMyName)) {
      row.classList.add('kih-my-row');
    } else {
      row.classList.remove('kih-my-row');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Feature 2: 컨택일 전체 조회 패널
// ═══════════════════════════════════════════════════════════════
function injectContactPanel() {
  if (document.getElementById('kih-contact-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'kih-contact-panel';
  panel.className = 'collapsed';

  const todayISO = toISO(new Date());

  panel.innerHTML = `
    <button id="kih-panel-tab">컨택조회</button>
    <div id="kih-panel-body">
      <h4>📞 컨택일 전체 조회</h4>
      <p class="kih-desc">날짜 선택 → 그 날 컨택 예정인<br>모든 담당자 DB 한 번에 조회</p>

      <label>조회 날짜</label>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <input id="kih-date-input" type="date" value="${todayISO}" style="flex:1;" />
        <button id="kih-today-btn" style="padding:5px 10px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">오늘</button>
      </div>

      <button id="kih-panel-search">🔍 전체 담당자 조회</button>

      <div style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:8px;">
        <label>내 이름 설정 (내 행 강조)</label>
        <div style="display:flex;gap:6px;">
          <input id="kih-myname-input" type="text" placeholder="예: 송성기"
            value="${window._kihMyName}"
            style="flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
          <button id="kih-myname-save" style="padding:5px 10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">저장</button>
        </div>
      </div>

      <div id="kih-panel-result" style="margin-top:8px;"></div>

      <div class="kih-desc" style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:8px;">
        Alt+S: 패널 열기/닫기
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('kih-panel-tab').addEventListener('click', () =>
    panel.classList.toggle('collapsed'));

  document.getElementById('kih-panel-search').addEventListener('click', runContactSearch);

  document.getElementById('kih-today-btn').addEventListener('click', () => {
    document.getElementById('kih-date-input').value = toISO(new Date());
    runContactSearch();
  });

  document.getElementById('kih-myname-save').addEventListener('click', () => {
    const name = document.getElementById('kih-myname-input').value.trim();
    window._kihMyName = name;
    chrome.storage.local.set({ myName: name });
    applyMyNameHighlight();
    document.getElementById('kih-panel-result').textContent = `✅ "${name}" 저장됨 — 내 행이 초록으로 표시됩니다`;
  });

  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 's') panel.classList.toggle('collapsed');
  });
}

function runContactSearch() {
  const isoDate = document.getElementById('kih-date-input').value;
  const result  = document.getElementById('kih-panel-result');
  if (!isoDate) { result.textContent = '날짜를 선택해주세요.'; return; }

  clearMentorField();
  fillContactDateField(isoDate);

  const searchBtn = findBtn(['조회', '검색']);
  if (searchBtn) {
    searchBtn.click();
    result.innerHTML = `🔄 ${formatDate(isoDate)} 컨택 예정 조회 중…`;
    setTimeout(() => {
      summarizeByMentor(result, isoDate);
      applyMyNameHighlight();
    }, 1200);
  } else {
    result.innerHTML = scanTableForDate(isoDate);
  }
}

function clearMentorField() {
  document.querySelectorAll('input[type="text"]').forEach(inp => {
    const label = getLabelFor(inp).replace(/\s/g,'');
    if (/멘토|담당자|mentor/i.test(label) || /멘토|담당자/i.test(inp.placeholder||'')) {
      setVal(inp, '');
    }
  });
}

function fillContactDateField(isoDate) {
  let filled = 0;
  document.querySelectorAll('input[type="date"]').forEach(inp => {
    const label = getLabelFor(inp).replace(/\s/g,'');
    if (/상담예정|컨택일|예정일|다음연락|상담일/i.test(label) ||
        /상담예정|컨택|contact/i.test(inp.name||'') ||
        /상담예정|컨택|contact/i.test(inp.id||'')) {
      setVal(inp, isoDate); filled++;
    }
  });
  if (filled === 0) {
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
    if (dateInputs.length >= 2) {
      setVal(dateInputs[0], isoDate); setVal(dateInputs[1], isoDate); filled=2;
    } else if (dateInputs.length === 1) {
      setVal(dateInputs[0], isoDate); filled=1;
    }
  }
  return filled;
}

function summarizeByMentor(resultEl, isoDate) {
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  if (rows.length === 0) {
    resultEl.innerHTML = `<span style="color:#ef4444">결과 없음 — 테이블 스캔으로 재시도</span><br>` + scanTableForDate(isoDate);
    return;
  }
  const headers = Array.from(document.querySelectorAll('table thead th, table tr:first-child th'));
  const mentorIdx = headers.findIndex(th => /멘토|담당자/i.test(th.textContent));
  const summary = {};
  rows.forEach(row => {
    const mentor = mentorIdx >= 0 ? (row.cells[mentorIdx]?.textContent.trim()||'미상') : '전체';
    summary[mentor] = (summary[mentor]||0) + 1;
    row.style.backgroundColor = '#fef3c7';
  });
  const lines = Object.entries(summary).sort((a,b)=>b[1]-a[1])
    .map(([m,c])=>`<span class="kih-mentor-chip">${m} <b>${c}건</b></span>`).join('');
  resultEl.innerHTML = `<div style="font-size:12px;margin-bottom:6px;"><b>${formatDate(isoDate)} 컨택 예정 총 ${rows.length}건</b></div>${lines}`;
  applyMyNameHighlight(); // 내 행 초록으로 덮어씌움
}

function scanTableForDate(isoDate) {
  const variants = buildDateVariants(isoDate);
  let found = 0;
  document.querySelectorAll('table tbody tr').forEach(row => {
    if (variants.some(v=>row.textContent.includes(v))) {
      row.style.backgroundColor = '#fef3c7';
      row.style.fontWeight = '600';
      found++;
    } else {
      row.style.opacity = '0.3';
    }
  });
  return found > 0 ? `<b>${found}건</b> 찾음` : `<span style="color:#ef4444">찾지 못했습니다.</span>`;
}

// ═══════════════════════════════════════════════════════════════
// Feature 1: 시간표 영업일 패널 + 개강일 빠른 선택
// ═══════════════════════════════════════════════════════════════
function injectBizDayPanel() {
  if (document.getElementById('kih-bizday-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'kih-bizday-btn';
  btn.className = 'kih-bizday-toggle';
  btn.textContent = '📅 시간표 영업일';
  btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'kih-bizday-panel';
  panel.style.cssText = `
    position:fixed;bottom:130px;right:16px;z-index:99999;
    background:#fff;border:1px solid #d1d5db;border-radius:10px;
    padding:14px;width:340px;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;
  `;

  // 개강일 버튼 목록 생성
  const today = new Date();
  const gagangBtns = GAGANG_DATES
    .filter(d => new Date(d) >= new Date(today.getFullYear(), today.getMonth()-1, 1))
    .slice(0, 8)
    .map(d => {
      const dt = new Date(d);
      const label = `${dt.getMonth()+1}/${dt.getDate()}`;
      return `<button class="kih-gagang-btn" data-date="${d}">${label} 개강</button>`;
    }).join('');

  panel.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">📅 시간표 영업일 자동 체크</div>

    <div style="margin-bottom:10px;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">▼ 개강일 클릭 → 시간표 드롭다운 자동 선택 + 조회</div>
      <div id="kih-gagang-btns" style="display:flex;flex-wrap:wrap;gap:4px;">
        ${gagangBtns}
      </div>
    </div>

    <div style="border-top:1px solid #f3f4f6;padding-top:10px;margin-bottom:8px;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">▼ 체크박스 영업일 자동 설정</div>
      <label style="font-size:12px;color:#6b7280;">연월</label>
      <input id="kih-ym-input" type="month"
        style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:6px;" />
      <label style="font-size:12px;color:#6b7280;">공휴일·휴강일 (쉼표, 토·일 자동제외)</label>
      <input id="kih-holiday-input" type="text" placeholder="예: 3,9,10"
        style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;" />
      <div style="display:flex;gap:6px;">
        <button id="kih-auto-check" style="flex:1;padding:6px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">✅ 영업일만 체크</button>
        <button id="kih-check-all"   style="padding:6px 8px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">전체체크</button>
        <button id="kih-uncheck-all" style="padding:6px 8px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">전체해제</button>
      </div>
    </div>

    <div id="kih-bizday-result" style="font-size:12px;"></div>
    <div id="kih-bizday-list" style="margin-top:6px;font-size:11px;max-height:140px;overflow-y:auto;"></div>
  `;
  document.body.appendChild(panel);

  // 현재 달 기본값
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('kih-ym-input').value = defaultYM;

  btn.addEventListener('click', () => {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) loadHolidayInput(document.getElementById('kih-ym-input').value);
  });

  document.getElementById('kih-ym-input').addEventListener('change', e => loadHolidayInput(e.target.value));
  document.getElementById('kih-auto-check').addEventListener('click', autoCheckBizDays);
  document.getElementById('kih-check-all').addEventListener('click', () => toggleAllCheckboxes(true));
  document.getElementById('kih-uncheck-all').addEventListener('click', () => toggleAllCheckboxes(false));

  // 개강일 버튼 클릭 → 시간표 드롭다운 자동 선택
  document.getElementById('kih-gagang-btns').addEventListener('click', e => {
    const btn = e.target.closest('.kih-gagang-btn');
    if (!btn) return;
    selectGagangAndSearch(btn.dataset.date);
  });

  document.addEventListener('keydown', e => { if (e.altKey && e.key === 'b') btn.click(); });
}

// 개강일 버튼 클릭 → 드롭다운 자동 선택 + 조회
function selectGagangAndSearch(dateStr) {
  const resultEl = document.getElementById('kih-bizday-result');

  // select 드롭다운에서 일치하는 option 찾기
  const selects = Array.from(document.querySelectorAll('select'));
  let found = false;

  for (const sel of selects) {
    const match = Array.from(sel.options).find(opt =>
      opt.value === dateStr ||
      opt.value.includes(dateStr) ||
      opt.textContent.includes(dateStr) ||
      opt.textContent.includes(dateStr.replace(/-/g,'.')) ||
      opt.textContent.includes(dateStr.replace(/-0?/g,'월 ').replace(/-0?/g,'일'))
    );
    if (match) {
      sel.value = match.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      found = true;

      // 조회 버튼 클릭
      setTimeout(() => {
        const searchBtn = findBtn(['조회', '검색']);
        if (searchBtn) {
          searchBtn.click();
          resultEl.innerHTML = `✅ ${dateStr} 개강일 시간표 조회 중…`;
        } else {
          resultEl.innerHTML = `✅ ${dateStr} 선택됨 (조회 버튼을 직접 눌러주세요)`;
        }
        // 조회 후 영업일 뱃지 오버레이
        setTimeout(() => {
          const d = new Date(dateStr);
          const yr = d.getFullYear(), mn = d.getMonth()+1;
          const ym = `${yr}-${String(mn).padStart(2,'0')}`;
          const holidays = window._kihHolidays[ym] || [];
          const bizDays  = calcBizDays(yr, mn, holidays);
          applyBizDayOverlay(yr, mn, bizDays);
        }, 900);
      }, 200);
      break;
    }
  }

  if (!found) {
    resultEl.innerHTML = `<span style="color:#ef4444">드롭다운에서 ${dateStr}을 찾지 못했습니다.<br>시간표관리 페이지에서 실행해주세요.</span>`;
  }
}

function loadHolidayInput(ym) {
  const saved = (window._kihHolidays[ym]||[]).join(',');
  document.getElementById('kih-holiday-input').value = saved;
}

function autoCheckBizDays() {
  const ym = document.getElementById('kih-ym-input').value;
  if (!ym) { document.getElementById('kih-bizday-result').textContent = '연월을 선택해주세요.'; return; }
  const val      = document.getElementById('kih-holiday-input').value;
  const holidays = val.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)&&n>=1&&n<=31);
  window._kihHolidays[ym] = holidays;
  chrome.storage.local.set({ holidays: window._kihHolidays });

  const [year, mon] = ym.split('-').map(Number);
  const bizDays    = calcBizDays(year, mon, holidays);
  const result     = applyCheckboxes(bizDays, mon);
  renderBizDayList(mon, bizDays);
  document.getElementById('kih-bizday-result').innerHTML =
    result.found > 0
      ? `✅ ${result.found}개 체크박스 중 <b>${result.checked}개</b> 영업일 체크 완료`
      : `<span style="color:#ef4444">체크박스를 찾지 못했습니다.<br>시간표관리 페이지에서 실행해주세요.</span>`;
}

function applyCheckboxes(bizDays, mon) {
  let found=0, checked=0;
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const labelTxt = getCheckboxLabel(cb);
    const day = parseDayFromLabel(labelTxt, mon);
    if (day===null) return;
    found++;
    const shouldCheck = bizDays.includes(day);
    if (cb.checked !== shouldCheck) cb.click();
    if (shouldCheck) checked++;
  });
  return { found, checked };
}

function getCheckboxLabel(cb) {
  if (cb.id) {
    const lbl = document.querySelector(`label[for="${cb.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  let node = cb.nextSibling;
  while (node) {
    if (node.nodeType===Node.TEXT_NODE && node.textContent.trim()) return node.textContent.trim();
    if (node.nodeType===Node.ELEMENT_NODE) return node.textContent.trim();
    node = node.nextSibling;
  }
  const td = cb.closest('td,th,li,div');
  return td ? td.textContent.trim() : '';
}

function parseDayFromLabel(txt, mon) {
  const m1 = txt.match(/^(\d{1,2})일?$/);
  if (m1) return parseInt(m1[1]);
  const m2 = txt.match(/^(\d{1,2})[\/\.](\d{1,2})$/);
  if (m2 && parseInt(m2[1])===mon) return parseInt(m2[2]);
  const m3 = txt.match(/\d{4}-\d{2}-(\d{2})/);
  if (m3) return parseInt(m3[1]);
  return null;
}

function toggleAllCheckboxes(check) {
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked !== check) cb.click();
  });
}

// 날짜 셀에 영업일 뱃지 삽입
function applyBizDayOverlay(year, mon, bizDays) {
  document.querySelectorAll('.kih-bizday-badge').forEach(b=>b.remove());
  document.querySelectorAll('td,th').forEach(cell => {
    const day = extractDay(cell.textContent.trim(), year, mon);
    if (day===null) return;
    const idx = bizDays.indexOf(day);
    if (idx !== -1) {
      const badge = document.createElement('span');
      badge.className = 'kih-bizday-badge';
      badge.textContent = `${idx+1}영업일`;
      cell.appendChild(badge);
    }
  });
}

function extractDay(txt, year, mon) {
  const m1 = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1 && parseInt(m1[1])===year && parseInt(m1[2])===mon) return parseInt(m1[3]);
  const m2 = txt.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2 && parseInt(m2[1])===mon) return parseInt(m2[2]);
  const m3 = txt.match(/^(\d{1,2})일?$/);
  if (m3) { const d=parseInt(m3[1]); if(d>=1&&d<=31) return d; }
  const m4 = txt.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m4 && parseInt(m4[1])===mon) return parseInt(m4[2]);
  return null;
}

function calcBizDays(year, mon, holidays) {
  const total = new Date(year, mon, 0).getDate();
  const days  = [];
  for (let d=1; d<=total; d++) {
    const dow = new Date(year, mon-1, d).getDay();
    if (dow!==0 && dow!==6 && !holidays.includes(d)) days.push(d);
  }
  return days;
}

function renderBizDayList(mon, bizDays) {
  document.getElementById('kih-bizday-list').innerHTML =
    `<b>${mon}월 영업일 ${bizDays.length}일</b><br>` +
    bizDays.map((d,i)=>
      `<span style="display:inline-block;margin:2px;background:#ede9fe;color:#4f46e5;
        padding:1px 6px;border-radius:8px;">${i+1}영업일=${d}일</span>`
    ).join('');
}

// ── 공용 유틸 ────────────────────────────────────────────────
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatDate(iso) {
  const [,m,d] = iso.split('-');
  return `${parseInt(m)}월 ${parseInt(d)}일`;
}
function buildDateVariants(iso) {
  const [y,m,d] = iso.split('-');
  const my=parseInt(m), dy=parseInt(d);
  return [
    iso, `${y}.${m}.${d}`, `${y}/${m}/${d}`,
    `${my}/${dy}`, `${my}.${dy}`,
    `${my}월 ${dy}일`, `${my}월${dy}일`,
    `${String(my).padStart(2,'0')}/${String(dy).padStart(2,'0')}`,
  ];
}
function getLabelFor(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent;
  }
  const td = el.closest('td,th');
  return td?.previousElementSibling?.textContent || '';
}
function findBtn(labels) {
  return Array.from(document.querySelectorAll('button,input[type="button"]'))
    .find(b => labels.some(l=>b.textContent.trim().includes(l)));
}
function setVal(el, value) {
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    desc.set.call(el, value);
  } catch(_) { el.value = value; }
  el.dispatchEvent(new Event('input',  { bubbles:true }));
  el.dispatchEvent(new Event('change', { bubbles:true }));
}

// ── MutationObserver ─────────────────────────────────────────
let _deb;
function observeMutations() {
  new MutationObserver(() => {
    clearTimeout(_deb);
    _deb = setTimeout(() => {
      applyStatusBadges();
      applyMyNameHighlight();
    }, 500);
  }).observe(document.body, { childList:true, subtree:true });
}
