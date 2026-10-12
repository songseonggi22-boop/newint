// 인트라넷 도우미 - content script
// Feature 1: 영업일 시간표 보조
// Feature 2: 컨택일·담당자 빠른 검색
// Feature 3: UI 가독성 개선 (style.css 적용 + JS 뱃지)

(function () {
  'use strict';

  // ── 초기화 ──────────────────────────────────────────────
  chrome.storage.local.get(['holidays', 'bizDayMode'], function (data) {
    window._kihHolidays = data.holidays || {};    // { 'YYYY-MM': [날짜배열] }
    window._kihBizMode  = data.bizDayMode || false;
    initAll();
  });

  function initAll() {
    applyStatusBadges();
    injectContactPanel();
    injectBizDayPanel();
    observeMutations();
  }

  // ── Feature 3: 상태 텍스트 → 뱃지 변환 ─────────────────
  const STATUS_MAP = {
    '배정완료':  'kih-badge-assigned',
    '미배정':    'kih-badge-unassigned',
    '상담예정':  'kih-badge-scheduled',
    '컨택':      'kih-badge-contact',
    '컨택완료':  'kih-badge-contact',
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

  // ── Feature 2: 컨택 검색 패널 ───────────────────────────
  function injectContactPanel() {
    if (document.getElementById('kih-contact-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'kih-contact-panel';
    panel.innerHTML = `
      <button id="kih-panel-tab">컨택검색</button>
      <div id="kih-panel-body">
        <h4>🔍 컨택일·담당자 검색</h4>
        <label>날짜 (YYYY-MM-DD)</label>
        <input id="kih-date-input" type="date" />
        <label>담당자명</label>
        <input id="kih-mentor-input" type="text" placeholder="예: 송성기" />
        <button id="kih-panel-search">검색 적용</button>
        <div id="kih-panel-result"></div>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('kih-panel-tab').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
    panel.classList.add('collapsed'); // 기본 접힘

    document.getElementById('kih-panel-search').addEventListener('click', applyContactSearch);
    document.addEventListener('keydown', e => {
      if (e.altKey && e.key === 's') panel.classList.toggle('collapsed');
    });
  }

  function applyContactSearch() {
    const date   = document.getElementById('kih-date-input').value;   // YYYY-MM-DD
    const mentor = document.getElementById('kih-mentor-input').value.trim();

    // 현재 페이지에 멘토 검색 필드가 있으면 자동 채움
    tryFillField(['멘토명', '멘토', 'mentor', 'mentorName'], mentor);
    // 날짜 필드 자동 채움
    if (date) {
      tryFillField(['상담일', '컨택일', 'contactDate', 'consultDate'], date);
      tryFillDateRange(date);
    }

    // 조회 버튼 자동 클릭
    const searchBtn = findButton(['조회', '검색', 'search']);
    if (searchBtn) {
      searchBtn.click();
      document.getElementById('kih-panel-result').textContent = `✅ "${mentor}" / ${date} 검색 실행됨`;
    } else {
      document.getElementById('kih-panel-result').textContent = '현재 페이지에서 검색 필드를 찾을 수 없습니다.';
    }
  }

  function tryFillField(keywords, value) {
    if (!value) return;
    const inputs = document.querySelectorAll('input[type="text"], input[type="date"], input');
    inputs.forEach(inp => {
      const label = getLabelText(inp);
      if (keywords.some(k => label.includes(k) || (inp.placeholder || '').includes(k) || (inp.name || '').includes(k))) {
        setNativeValue(inp, value);
      }
    });
  }

  function tryFillDateRange(date) {
    // 시작일/종료일 모두 같은 날로 세팅 (당일 검색)
    const allInputs = Array.from(document.querySelectorAll('input[type="date"]'));
    if (allInputs.length >= 2) {
      setNativeValue(allInputs[0], date);
      setNativeValue(allInputs[1], date);
    } else if (allInputs.length === 1) {
      setNativeValue(allInputs[0], date);
    }
  }

  function getLabelText(el) {
    // label[for] → label text / 가장 가까운 부모 td 텍스트
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.textContent;
    }
    const td = el.closest('td');
    if (td && td.previousElementSibling) return td.previousElementSibling.textContent;
    return '';
  }

  function findButton(labels) {
    return Array.from(document.querySelectorAll('button, input[type="button"], a.btn'))
      .find(b => labels.some(l => b.textContent.trim().includes(l)));
  }

  // React/Vue controlled input 대응
  function setNativeValue(el, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (nativeSetter) nativeSetter.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Feature 1: 영업일 패널 ──────────────────────────────
  function injectBizDayPanel() {
    if (document.getElementById('kih-bizday-panel')) return;

    const btn = document.createElement('button');
    btn.id = 'kih-bizday-toggle';
    btn.className = 'kih-bizday-toggle';
    btn.textContent = '📅 영업일 보기';
    btn.title = 'Alt+B';
    btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;';
    document.body.appendChild(btn);

    // 영업일 설정 패널
    const panel = document.createElement('div');
    panel.id = 'kih-bizday-panel';
    panel.style.cssText = `
      position:fixed;bottom:120px;right:16px;z-index:99999;
      background:#fff;border:1px solid #d1d5db;border-radius:10px;
      padding:14px;width:300px;box-shadow:0 4px 16px rgba(0,0,0,0.15);
      display:none;
    `;
    panel.innerHTML = `
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;">📅 영업일 설정</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">
        해당 월의 <b>공휴일·휴강일 날짜</b>를 쉼표로 입력하세요.<br>
        (예: 3,9,10 → 3일,9일,10일 제외)
      </div>
      <div id="kih-month-display" style="font-size:12px;font-weight:600;color:#4f46e5;margin-bottom:6px;"></div>
      <input id="kih-holiday-input" type="text" placeholder="예: 3,9,10"
        style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;" />
      <button id="kih-save-holidays" style="padding:5px 12px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">저장 및 적용</button>
      <div id="kih-bizday-list" style="margin-top:10px;font-size:12px;max-height:180px;overflow-y:auto;"></div>
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => {
      const show = panel.style.display === 'none';
      panel.style.display = show ? 'block' : 'none';
      if (show) renderBizDayPanel();
    });

    document.addEventListener('keydown', e => {
      if (e.altKey && e.key === 'b') btn.click();
    });

    document.getElementById('kih-save-holidays').addEventListener('click', saveBizDays);
  }

  function renderBizDayPanel() {
    const now  = new Date();
    const year = now.getFullYear();
    const mon  = now.getMonth() + 1;
    const key  = `${year}-${String(mon).padStart(2, '0')}`;

    document.getElementById('kih-month-display').textContent = `${year}년 ${mon}월`;
    const saved = (window._kihHolidays[key] || []).join(',');
    document.getElementById('kih-holiday-input').value = saved;

    showBizDayList(year, mon, window._kihHolidays[key] || []);
  }

  function saveBizDays() {
    const now  = new Date();
    const year = now.getFullYear();
    const mon  = now.getMonth() + 1;
    const key  = `${year}-${String(mon).padStart(2, '0')}`;

    const val = document.getElementById('kih-holiday-input').value;
    const days = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 31);
    window._kihHolidays[key] = days;
    chrome.storage.local.set({ holidays: window._kihHolidays });

    showBizDayList(year, mon, days);
    highlightBizDaysOnPage(year, mon, days);
  }

  function showBizDayList(year, mon, holidays) {
    const daysInMonth = new Date(year, mon, 0).getDate();
    const bizDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, mon - 1, d).getDay(); // 0=일,6=토
      if (dow !== 0 && dow !== 6 && !holidays.includes(d)) {
        bizDays.push(d);
      }
    }

    const list = document.getElementById('kih-bizday-list');
    list.innerHTML = '<b>영업일 목록:</b><br>' + bizDays.map((d, i) =>
      `<span style="display:inline-block;margin:2px;background:#ede9fe;color:#4f46e5;padding:2px 7px;border-radius:8px;font-size:11px;">${i+1}영업일 = ${mon}/${d}</span>`
    ).join('');

    // 페이지의 날짜 셀에도 영업일 번호 오버레이
    highlightBizDaysOnPage(year, mon, holidays, bizDays);
  }

  function highlightBizDaysOnPage(year, mon, holidays, bizDays) {
    if (!bizDays) {
      const daysInMonth = new Date(year, mon, 0).getDate();
      bizDays = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, mon - 1, d).getDay();
        if (dow !== 0 && dow !== 6 && !holidays.includes(d)) bizDays.push(d);
      }
    }

    // 페이지에서 날짜처럼 보이는 셀을 찾아 영업일 뱃지 삽입
    document.querySelectorAll('td, th').forEach(cell => {
      const txt = cell.textContent.trim();
      // "10/7", "10-07", "7", "07" 등 패턴
      const m1 = txt.match(/^(\d{1,2})\/(\d{1,2})$/);  // 10/7
      const m2 = txt.match(/^\d{4}-(\d{2})-(\d{2})$/); // 2026-10-07
      const m3 = txt.match(/^(\d{1,2})일?$/);           // 7 또는 7일

      let day = null;
      if (m1 && parseInt(m1[1]) === mon) day = parseInt(m1[2]);
      if (m2 && parseInt(m2[1]) === mon) day = parseInt(m2[2]);
      if (m3) day = parseInt(m3[1]);

      if (day !== null && day >= 1 && day <= 31) {
        cell.querySelectorAll('.kih-bizday-badge').forEach(b => b.remove());
        const idx = bizDays.indexOf(day);
        if (idx !== -1) {
          const badge = document.createElement('span');
          badge.className = 'kih-bizday-badge';
          badge.textContent = `${idx+1}영업일`;
          cell.appendChild(badge);
        }
      }
    });
  }

  // ── Mutation Observer: SPA 페이지 전환 대응 ──────────────
  let _debounce;
  function observeMutations() {
    const observer = new MutationObserver(() => {
      clearTimeout(_debounce);
      _debounce = setTimeout(() => {
        applyStatusBadges();
      }, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
