const now  = new Date();
const year = now.getFullYear();
const mon  = now.getMonth() + 1;
const key  = `${year}-${String(mon).padStart(2, '0')}`;

chrome.storage.local.get(['holidays'], data => {
  const holidays = data.holidays || {};
  document.getElementById('holiday-input').value = (holidays[key] || []).join(',');
});

document.getElementById('save-btn').addEventListener('click', () => {
  const val  = document.getElementById('holiday-input').value;
  const days = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 31);

  chrome.storage.local.get(['holidays'], data => {
    const holidays = data.holidays || {};
    holidays[key] = days;
    chrome.storage.local.set({ holidays }, () => {
      document.getElementById('status').textContent = `✅ ${mon}월 휴일 저장 완료`;
      setTimeout(() => document.getElementById('status').textContent = '', 2000);
    });
  });
});
