'use strict';
/* ===================== التخزين =====================
   لاحقاً: استبدل محتوى كائن repo بـ Supabase (نفس الدوال) ولا تغيّر باقي الكود. */
const K_W = 'abuali:workers', K_E = 'abuali:entries';
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const wr = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const upsert = (k, item) => { const a = rd(k), i = a.findIndex((x) => x.id === item.id); if (i < 0) a.push(item); else a[i] = item; wr(k, a); };
const repo = {
  async workers() { return rd(K_W); },
  async entries() { return rd(K_E); },
  async saveWorker(w) { upsert(K_W, w); },
  async delWorker(id) { wr(K_W, rd(K_W).filter((w) => w.id !== id)); wr(K_E, rd(K_E).filter((e) => e.workerId !== id)); },
  async saveEntry(e) { upsert(K_E, e); },
  async delEntry(id) { wr(K_E, rd(K_E).filter((e) => e.id !== id)); },
};

/* ===================== أدوات وحسابات ===================== */
const JOBS = ['طوبار', 'حداد', 'طراش', 'عامل'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = (v) => Math.max(0, Number(v) || 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const cls = (n) => (n < 0 ? 'neg' : 'pos');
const sum = (es, k) => es.reduce((s, e) => s + (Number(e[k]) || 0), 0);
const net = (e) => (Number(e.wage) || 0) - (Number(e.food) || 0) - (Number(e.smoke) || 0) - (Number(e.advance) || 0);

function withBal(entries) {
  let c = 0;
  return [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((e) => { const n = net(e); c += n; return { ...e, net: n, bal: c }; });
}
function stats(es) {
  const rows = withBal(es);
  const food = sum(es, 'food'), smoke = sum(es, 'smoke'), advance = sum(es, 'advance');
  return { rows, days: rows.length, hours: sum(es, 'hours'), wage: sum(es, 'wage'), food, smoke, advance,
    paid: food + smoke + advance, rem: rows.length ? rows[rows.length - 1].bal : 0 };
}
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// الأسبوع من السبت إلى الجمعة
const weekStart = (s) => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 1) % 7));
function groupRows(rows, mode) {
  const map = new Map();
  for (const r of rows) {
    const key = mode === 'week' ? weekStart(r.date) : r.date.slice(0, 7);
    let g = map.get(key);
    if (!g) {
      const label = mode === 'week' ? `أسبوع من ${key} إلى ${addDays(key, 6)}`
        : new Date(key + '-01T00:00:00Z').toLocaleDateString('ar-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      g = { key, label, rows: [], net: 0, bal: 0 };
      map.set(key, g);
    }
    g.rows.push(r); g.net += r.net; g.bal = r.bal;
  }
  return [...map.values()];
}

/* ===================== واجهة المستخدم ===================== */
const S = { workers: [], entries: [], sel: null, mode: 'all', editId: null, q: '' };
const curWorker = () => S.workers.find((w) => w.id === S.sel);
const curStats = () => stats(S.entries.filter((e) => e.workerId === S.sel));

function skeleton() {
  $('#app').innerHTML = `<div class="shell" id="shell">
  <aside class="side">
    <div class="top"><div><b>المقاول أبو علي</b><small>حسابات العمال</small></div><button data-act="logout">خروج</button></div>
    <div class="tools"><button class="btn primary block" data-act="newW">+ عامل جديد</button>
      <input id="q" type="search" placeholder="ابحث بالاسم أو رقم السكنة"></div>
    <div class="list" id="list"></div>
    <div class="foot"><button class="btn sm" data-act="bk">نسخة احتياطية</button><button class="btn sm" data-act="rs">استرجاع</button>
      <input type="file" id="file" accept=".json,application/json" hidden></div>
  </aside>
  <main class="main" id="main"></main></div><div id="modal"></div>`;
}

function renderSide() {
  const q = S.q.trim();
  const list = S.workers.filter((w) => (w.name + (w.sukneh || '') + w.job).includes(q));
  $('#list').innerHTML = list.length ? list.map((w) => {
    const b = stats(S.entries.filter((e) => e.workerId === w.id)).rem;
    return `<button class="wcard${w.id === S.sel ? ' on' : ''}" data-act="sel" data-id="${esc(w.id)}">
      <span class="r1"><b>${esc(w.name)}</b><span class="bal ${cls(b)}">${fmt(b)} ₪</span></span>
      <span class="r2">سكنة ${esc(w.sukneh || '-')} · ${esc(w.job)}</span></button>`;
  }).join('') : '<p class="empty">لا يوجد عمال</p>';
}

function renderMain() {
  const w = curWorker();
  if (!w) { $('#main').innerHTML = '<div class="ph0">اختر عاملاً من القائمة أو أضف عاملاً جديداً</div>'; return; }
  $('#main').innerHTML = `<div class="wrap">
    <div class="whead"><button class="btn back" data-act="back">رجوع</button>
      <div class="grow"><h1>${esc(w.name)}</h1><p>سكنة ${esc(w.sukneh || '-')} · ${esc(w.job)}</p></div>
      <button class="btn" data-act="print">طباعة كشف</button><button class="btn" data-act="editW">تعديل العامل</button></div>
    <div class="cards" id="cards"></div>
    <section class="box" id="formbox"></section>
    <div class="seg" id="seg"></div>
    <div class="tblwrap" id="tbl"></div>
    <div class="final" id="final"></div></div>`;
  renderForm(); renderSeg(); refresh();
}
function refresh() { renderSide(); if (!curWorker()) return; renderCards(); renderTable(); renderFinal(); }

function renderCards() {
  const st = curStats();
  const c = (t, v, k = '') => `<div class="card"><small>${t}</small><b class="${k}">${v}</b></div>`;
  $('#cards').innerHTML = c('عدد الأيام', st.days) + c('عدد الساعات', fmt(st.hours)) + c('إجمالي المدفوع', fmt(st.paid) + ' ₪') + c('المتبقي النهائي', fmt(st.rem) + ' ₪', cls(st.rem));
}
function renderFinal() {
  const st = curStats();
  const el = $('#final'); el.className = 'final ' + (st.rem < 0 ? 'neg' : '');
  el.innerHTML = `<div>الحساب النهائي المتبقي للعامل</div><b>${fmt(st.rem)} شيكل</b>`;
}
function renderSeg() {
  $('#seg').innerHTML = [['week', 'أسبوعي'], ['month', 'شهري'], ['all', 'الكل']]
    .map(([m, l]) => `<button data-act="mode" data-mode="${m}" class="${S.mode === m ? 'on' : ''}">${l}</button>`).join('');
}

function renderForm(d = { date: today() }, editing = false) {
  $('#formbox').innerHTML = `<div class="ftitle">${editing ? 'تعديل يوم' : 'إضافة يوم'}</div>
  <div class="fgrid"><label class="fdate">التاريخ<input type="date" id="f-date" value="${esc(d.date)}"></label>
  ${[['hours', 'عدد الساعات'], ['wage', 'اليومية'], ['food', 'الأكل'], ['smoke', 'الدخان'], ['advance', 'سلفة (سحبة كاش)']]
    .map(([k, l]) => `<label>${l}<input type="number" inputmode="decimal" min="0" step="any" placeholder="0" id="f-${k}" value="${d[k] ? esc(d[k]) : ''}"></label>`).join('')}</div>
  <div class="frow"><button class="btn primary" data-act="save">${editing ? 'حفظ التعديل' : 'حفظ'}</button>
  ${editing ? '<button class="btn" data-act="cancel">إلغاء</button>' : ''}<span>صافي اليوم: <b id="fnet"></b></span></div>`;
  liveNet();
}
const readForm = () => ({ date: $('#f-date').value, hours: num($('#f-hours').value), wage: num($('#f-wage').value),
  food: num($('#f-food').value), smoke: num($('#f-smoke').value), advance: num($('#f-advance').value) });
function liveNet() {
  const f = readForm(), n = f.wage - f.food - f.smoke - f.advance, el = $('#fnet');
  el.textContent = fmt(n) + ' ₪'; el.className = cls(n);
}

const trHtml = (r) => `<tr><td>${esc(r.date)}</td><td>${r.hours ? fmt(r.hours) : '-'}</td><td>${fmt(r.wage)}</td><td>${fmt(r.food)}</td>
  <td>${fmt(r.smoke)}</td><td>${fmt(r.advance)}</td><td class="b ${cls(r.net)}">${fmt(r.net)}</td><td class="b ${cls(r.bal)}">${fmt(r.bal)}</td>
  <td class="act"><button class="lnk" data-act="edit" data-id="${esc(r.id)}">تعديل</button><button class="lnk red" data-act="del" data-id="${esc(r.id)}">حذف</button></td></tr>`;

function renderTable() {
  const st = curStats();
  let body;
  if (!st.rows.length) body = '<tr><td colspan="9" class="empty">لا يوجد أيام مسجلة بعد</td></tr>';
  else if (S.mode === 'all') body = st.rows.map(trHtml).join('');
  else body = groupRows(st.rows, S.mode).map((g) => `<tr class="grp"><td colspan="9">${esc(g.label)} — الساعات: ${fmt(sum(g.rows, 'hours'))}
    — المجموع: <span class="${cls(g.net)}">${fmt(g.net)} ₪</span> — المتبقي حتى نهايته: <span class="${cls(g.bal)}">${fmt(g.bal)} ₪</span></td></tr>`
    + g.rows.map(trHtml).join('')).join('');
  const heads = ['التاريخ', 'الساعات', 'اليومية', 'أكل', 'دخان', 'سلفة', 'صافي اليوم', 'الرصيد التراكمي', 'تعديل/حذف'];
  $('#tbl').innerHTML = `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderPrint() {
  const w = curWorker(), st = curStats(), g = S.mode === 'all' ? null : groupRows(st.rows, S.mode);
  const tr = (r) => `<tr><td>${esc(r.date)}</td><td>${r.hours ? fmt(r.hours) : '-'}</td><td>${fmt(r.wage)}</td><td>${fmt(r.food)}</td><td>${fmt(r.smoke)}</td><td>${fmt(r.advance)}</td><td>${fmt(r.net)}</td><td>${fmt(r.bal)}</td></tr>`;
  const body = g ? g.map((x) => `<tr class="pg"><td colspan="8">${esc(x.label)} — الساعات: ${fmt(sum(x.rows, 'hours'))} — المجموع: ${fmt(x.net)} — المتبقي: ${fmt(x.bal)}</td></tr>` + x.rows.map(tr).join('')).join('')
    : st.rows.map(tr).join('');
  const heads = ['التاريخ', 'الساعات', 'اليومية', 'أكل', 'دخان', 'سلفة', 'صافي اليوم', 'الرصيد'];
  $('#print').innerHTML = `<div class="ph"><div><div class="ptitle">المقاول أبو علي</div><div>كشف حساب عامل</div></div>
    <div>تاريخ الكشف: ${new Date().toLocaleDateString('en-GB')}</div></div>
  <div class="pinfo"><div><b>الاسم:</b> ${esc(w.name)}</div><div><b>رقم السكنة:</b> ${esc(w.sukneh || '-')}</div><div><b>المهنة:</b> ${esc(w.job)}</div></div>
  <table class="ptable"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}
  <tr class="ptot"><td>المجموع (${st.days} يوم)</td><td>${fmt(st.hours)}</td><td>${fmt(st.wage)}</td><td>${fmt(st.food)}</td><td>${fmt(st.smoke)}</td><td>${fmt(st.advance)}</td><td>${fmt(st.rem)}</td><td>${fmt(st.rem)}</td></tr></tbody></table>
  <div class="pfinal"><div>الحساب النهائي المتبقي للعامل</div><b>${fmt(st.rem)} شيكل</b></div>
  <div class="psig"><div>توقيع العامل</div><div>توقيع المقاول</div></div>`;
}

function openWorker(w) {
  const x = w || { name: '', sukneh: '', job: 'عامل' };
  $('#modal').innerHTML = `<div class="ov"><form class="dlg" id="wf" data-id="${esc(w ? w.id : '')}">
    <h2>${w ? 'تعديل بيانات العامل' : 'عامل جديد'}</h2>
    <label>الاسم<input id="w-name" value="${esc(x.name)}" required></label>
    <label>رقم السكنة<input id="w-suk" inputmode="numeric" value="${esc(x.sukneh)}"></label>
    <label>المهنة<select id="w-job">${JOBS.map((j) => `<option${j === x.job ? ' selected' : ''}>${j}</option>`).join('')}</select></label>
    <div class="frow"><button class="btn primary grow">حفظ</button><button type="button" class="btn" data-act="closeM">إلغاء</button>
    ${w ? '<button type="button" class="btn danger" data-act="delW">حذف</button>' : ''}</div></form></div>`;
  $('#w-name').focus();
}
const closeM = () => { $('#modal').innerHTML = ''; };

function select(id) {
  S.sel = id; S.mode = 'all'; S.editId = null;
  $('#shell').classList.toggle('detail', !!id);
  renderSide(); renderMain();
}
async function load() { S.workers = await repo.workers(); S.entries = await repo.entries(); }

async function saveEntry() {
  const f = readForm();
  if (!f.date) return alert('اختر التاريخ');
  if (!f.wage && !f.food && !f.smoke && !f.advance) return alert('اكتب مبلغاً واحداً على الأقل');
  await repo.saveEntry({ id: S.editId || uid(), workerId: S.sel, ...f });
  S.editId = null; S.entries = await repo.entries();
  renderForm({ date: f.date }); refresh();
}

async function backup() {
  const d = { version: 1, exportedAt: new Date().toISOString(), workers: await repo.workers(), entries: await repo.entries() };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
  a.download = 'abu-ali-backup-' + today() + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function restore(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.workers) || !Array.isArray(d.entries)) throw new Error('bad');
    for (const w of d.workers) if (w && w.id && w.name) await repo.saveWorker({ id: String(w.id), name: String(w.name), sukneh: String(w.sukneh || ''), job: JOBS.includes(w.job) ? w.job : 'عامل' });
    for (const e of d.entries) if (e && e.id && e.workerId && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) await repo.saveEntry({ id: String(e.id), workerId: String(e.workerId), date: e.date, hours: num(e.hours), wage: num(e.wage), food: num(e.food), smoke: num(e.smoke), advance: num(e.advance) });
    await load(); renderSide(); renderMain(); alert('تم استرجاع الحسابات');
  } catch { alert('الملف غير صحيح'); }
}

/* ===================== الأحداث ===================== */
document.addEventListener('click', async (ev) => {
  if (ev.target.classList.contains('ov')) return closeM();
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'newW': openWorker(); break;
    case 'logout': try { await fetch('/api/logout', { method: 'POST' }); } catch {} location.href = '/login'; break;
    case 'bk': backup(); break;
    case 'rs': $('#file').click(); break;
    case 'sel': select(id); break;
    case 'back': select(null); break;
    case 'print': renderPrint(); window.print(); break;
    case 'editW': openWorker(curWorker()); break;
    case 'closeM': closeM(); break;
    case 'delW': {
      const w = curWorker();
      if (w && confirm(`حذف ${w.name} وكل حساباته؟ لا يمكن التراجع.`)) { await repo.delWorker(w.id); await load(); closeM(); select(null); }
      break;
    }
    case 'save': await saveEntry(); break;
    case 'cancel': S.editId = null; renderForm(); break;
    case 'mode': S.mode = t.dataset.mode; renderSeg(); renderTable(); break;
    case 'edit': {
      const e = S.entries.find((x) => x.id === id); if (!e) break;
      S.editId = id; renderForm(e, true); $('#formbox').scrollIntoView({ behavior: 'smooth' }); break;
    }
    case 'del':
      if (confirm('حذف هذا اليوم؟')) { await repo.delEntry(id); S.entries = await repo.entries(); refresh(); }
      break;
  }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') { S.q = ev.target.value; renderSide(); }
  else if (ev.target.closest && ev.target.closest('#formbox')) liveNet();
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'file' && ev.target.files[0]) { restore(ev.target.files[0]); ev.target.value = ''; }
});
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'wf') return;
  ev.preventDefault();
  const name = $('#w-name').value.trim(); if (!name) return;
  const id = ev.target.dataset.id || uid();
  await repo.saveWorker({ id, name, sukneh: $('#w-suk').value.trim(), job: $('#w-job').value });
  await load(); closeM(); select(id);
});

(async function init() { skeleton(); await load(); renderSide(); renderMain(); })();
