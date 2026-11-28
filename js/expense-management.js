'use strict';
// js/expense-management.js - Simplified Head-Only Expense Management (owner + staff)
//
// Tabs: 1 Expense Heads & Advised-by · 2 Expenses Due · 3 Expenses Paid · 4 Ledger
// The server decides what each login may do (GET /expense/me); this page only
// shows what the server allows. Every dynamic string is escaped before it is
// put into HTML, and clicks go through one delegated handler (data-act).

var EXP = API_BASE_URL + '/expense';

var S = {
  me: null,
  headsAll: [], advisorsAll: [],
  heads: [], advisors: [],
  headBalances: {},
  payType: 'paid',
  pendingAttachment: null,
  ent: { page: 1, pages: 1, total: 0 },
  entRows: [], preset: 'today', entInit: false,
  ledView: 'head', ledData: null,
  dueMonth: '', dueRows: [], dueSchedules: [], dueTotals: null,
  entReq: 0, dueReq: 0, ledReq: 0
};

/* ───────────────────────── tiny helpers ───────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
var NF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
function num(n) { return NF.format(Number(n) || 0); }
function inr(n) { n = Number(n) || 0; return (n < 0 ? '−' : '') + '₹' + NF.format(Math.abs(n)); }
function istShift(d) { return new Date(new Date(d).getTime() + 330 * 60000); }
function ymd(d) { return istShift(d).toISOString().slice(0, 10); }
function todayYmd() { return ymd(new Date()); }
function thisMonth() { return todayYmd().slice(0, 7); }
function fmtD(d) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }); }
function fmtT(d) { return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }); }
function fmtDT(d) { return fmtD(d) + ', ' + fmtT(d); }
function monthLabel(m) {
  var p = String(m).split('-');
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][Number(p[1]) - 1] + ' ' + p[0];
}
function money(v) {
  var n = Number(String(v === undefined || v === null ? '' : v).replace(/[,\s₹]/g, ''));
  return isFinite(n) ? n : NaN;
}
function parseDueDayInput(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  var d = parseInt(String(v).trim(), 10);
  if (isNaN(d) || d < 1 || d > 31) throw new Error('Due date must be between 1 and 31');
  return d;
}
function ordinal(n) { var v = n % 100, sfx = ['th', 'st', 'nd', 'rd']; return n + (sfx[(v - 20) % 100] || sfx[v] || sfx[0]); }
function byId(list, id) { for (var i = 0; i < list.length; i++) if (String(list[i]._id) === String(id)) return list[i]; return null; }

var toastTimer;
function toast(msg, type) {
  var t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type === 'error' ? 'error ' : '') + 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, type === 'error' ? 5000 : 3000);
}
function errMsg(e) { return (e && e.message) ? e.message : 'Something went wrong'; }

function setBtnLoading(btn, on, text) {
  if (!btn) return;
  if (on) {
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin" style="border-color:rgba(128,128,128,.28);border-top-color:currentColor"></span>' + esc(text || 'Saving…');
  } else {
    btn.disabled = false;
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
}

/* ───────────────────────── API wrappers ───────────────────────── */
function qs(params) {
  var out = [];
  Object.keys(params || {}).forEach(function (k) {
    var v = params[k];
    if (v !== undefined && v !== null && v !== '') out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return out.length ? '?' + out.join('&') : '';
}
function aGet(path, params) { return apiGet(EXP + path + qs(params), true); }
function aPost(path, body, code) {
  var payload = Object.assign({}, body || {});
  if (code) payload.deleteCode = code;
  return apiPost(EXP + path, payload, true);
}
function aPut(path, body, code) {
  var payload = Object.assign({}, body || {});
  if (code) payload.deleteCode = code;
  return apiPut(EXP + path, payload, true);
}
function aDel(path, code) {
  return apiDelete(EXP + path + (code ? qs({ deleteCode: code }) : ''), true);
}

/* ──────────────────── delete-code (shared with Fee) ──────────────────── */
var _code = undefined, _codeAt = 0, CODE_MS = 15 * 60 * 1000;
function getDeleteCode() {
  if (!S.me || !S.me.deleteProtection) return Promise.resolve(null);
  if (_code !== undefined && Date.now() - _codeAt < CODE_MS) return Promise.resolve(_code);
  return new Promise(function (resolve, reject) {
    var ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML = '<div class="md" role="dialog" aria-modal="true" aria-labelledby="dc-t" style="max-width:380px">' +
      '<h3 id="dc-t">🔒 Edit / delete protection</h3>' +
      '<p class="sub">Enter your code to change or reverse this entry.</p>' +
      '<input class="in" id="dc-in" type="password" autocomplete="off" aria-label="Protection code">' +
      '<div class="acts" style="margin-top:16px"><button class="btn ghost" type="button" id="dc-no">Cancel</button><button class="btn" type="button" id="dc-ok">Confirm</button></div></div>';
    document.body.appendChild(ov);
    var inp = ov.querySelector('#dc-in');
    setTimeout(function () { inp.focus(); }, 30);
    function done() { document.body.removeChild(ov); }
    ov.querySelector('#dc-no').onclick = function () { done(); reject(new Error('Cancelled')); };
    ov.querySelector('#dc-ok').onclick = function () {
      var v = inp.value.trim(); if (!v) { inp.focus(); return; }
      _code = v; _codeAt = Date.now(); done(); resolve(v);
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ov.querySelector('#dc-ok').click(); if (e.key === 'Escape') ov.querySelector('#dc-no').click(); });
  });
}
function codeFailed(e) {
  var m = (e && e.message) ? String(e.message) : '';
  if (
    /incorrect code|delete_code_required|protection code|too many incorrect/i.test(m) ||
    (e && (e.status === 428 || e.status === 429 || e.code === 'DELETE_CODE_REQUIRED'))
  ) {
    _code = undefined;
  }
}

/* ───────────────────────── generic form modal ───────────────────────── */
function openForm(title, sub, fields, saveLabel, onSave) {
  return new Promise(function (resolve) {
    var ov = document.createElement('div');
    ov.className = 'ov';
    var html = '<form class="md" role="dialog" aria-modal="true" aria-labelledby="fm-t" novalidate><h3 id="fm-t">' + esc(title) + '</h3>' +
      (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '<div class="stack">';
    fields.forEach(function (f) {
      var id = 'ff-' + f.key, val = f.value === undefined || f.value === null ? '' : f.value;
      html += '<label class="fld" for="' + id + '">' + esc(f.label);
      if (f.type === 'select') {
        html += '<select class="in" id="' + id + '">' + f.options.map(function (o) {
          return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(val) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'textarea') {
        html += '<textarea class="in" id="' + id + '" rows="3" maxlength="500">' + esc(val) + '</textarea>';
      } else if (f.type === 'checkbox') {
        html += '<span style="display:flex;align-items:center;gap:8px;margin-top:2px;font-weight:500;cursor:pointer">' +
          '<input id="' + id + '" type="checkbox"' + (val ? ' checked' : '') + ' style="width:16px;height:16px;margin:0">' +
          '<span>' + esc(f.text || '') + '</span></span>';
      } else {
        html += '<input class="in" id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' +
          (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') +
          (f.min !== undefined ? ' min="' + esc(f.min) + '"' : '') +
          (f.max !== undefined ? ' max="' + esc(f.max) + '"' : '') +
          (f.type === 'text' || !f.type ? ' maxlength="200"' : '') + '>';
      }
      if (f.hint) html += '<span class="hint">' + esc(f.hint) + '</span>';
      html += '</label>';
    });
    html += '</div><div class="hint" id="fm-err" style="color:var(--red);font-weight:700;min-height:18px" role="alert"></div>' +
      '<div class="acts"><button class="btn ghost" type="button" id="fm-no">Cancel</button><button class="btn" type="submit" id="fm-ok">' + esc(saveLabel || 'Save') + '</button></div></form>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    var form = ov.firstChild, first = ov.querySelector('input,select,textarea');
    var saving = false, noBtn = ov.querySelector('#fm-no');
    function setModalBusy(on) {
      saving = on;
      noBtn.disabled = on;
      ov.querySelectorAll('input,select,textarea').forEach(function (el) { el.disabled = on; });
    }
    if (first) setTimeout(function () { first.focus(); }, 30);
    function close() { if (ov.parentNode) document.body.removeChild(ov); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape' && !saving) { close(); resolve(false); } }
    document.addEventListener('keydown', onKey);
    noBtn.onclick = function () { if (!saving) { close(); resolve(false); } };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = ov.querySelector('#fm-ok'), er = ov.querySelector('#fm-err');
      if (ok.disabled || saving) return;
      var vals = {};
      fields.forEach(function (f) {
        var el = ov.querySelector('#ff-' + f.key);
        vals[f.key] = f.type === 'checkbox' ? el.checked : el.value;
      });
      setModalBusy(true);
      setBtnLoading(ok, true, 'Saving…');
      er.textContent = '';
      Promise.resolve().then(function () { return onSave(vals); }).then(function () { close(); resolve(true); })
        .catch(function (err) {
          er.textContent = (err && err.message === 'Cancelled') ? '' : errMsg(err);
          setModalBusy(false);
          setBtnLoading(ok, false);
        });
    });
  });
}

function openInfo(title, bodyHtml) {
  var ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = '<div class="md" role="dialog" aria-modal="true" aria-labelledby="in-t"><h3 id="in-t">' + esc(title) + '</h3>' + bodyHtml +
    '<div class="acts" style="margin-top:14px"><button class="btn" type="button" id="in-ok">Close</button></div></div>';
  document.body.appendChild(ov);
  function close() { if (ov.parentNode) document.body.removeChild(ov); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  ov.querySelector('#in-ok').onclick = close;
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  setTimeout(function () { ov.querySelector('#in-ok').focus(); }, 30);
}

function askConfirm(title, text, okLabel, cancelLabel) {
  return new Promise(function (resolve) {
    var ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML = '<div class="md" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" style="max-width:420px"><h3 id="cf-t">' + esc(title) + '</h3><p class="sub">' + esc(text) + '</p>' +
      '<div class="acts"><button class="btn ghost" type="button" id="cf-no">' + esc(cancelLabel || 'Cancel') + '</button><button class="btn" type="button" id="cf-ok">' + esc(okLabel || 'Yes, continue') + '</button></div></div>';
    document.body.appendChild(ov);
    function close(v) { if (ov.parentNode) document.body.removeChild(ov); resolve(v); }
    ov.querySelector('#cf-no').onclick = function () { close(false); };
    ov.querySelector('#cf-ok').onclick = function () { close(true); };
    setTimeout(function () { ov.querySelector('#cf-ok').focus(); }, 30);
  });
}

/* ───────────────────────── tabs + boot ───────────────────────── */
var TAB_LOADERS = {};
function switchTab(n) {
  [1, 2, 3, 4].forEach(function (i) {
    var on = i === n, btn = $('tab' + i + '-btn'), panel = $('tab' + i);
    if (btn) btn.setAttribute('aria-selected', on ? 'true' : 'false');
    if (panel) panel.hidden = !on;
  });
  if (TAB_LOADERS[n]) TAB_LOADERS[n]();
}

function allowedTabs() {
  var p = (S.me && S.me.perms) || {};
  return [1, 2, 3, 4].filter(function (i) { return !!p['tab' + i]; });
}

function showDenied(msg) {
  $('loading').hidden = true;
  $('tabs').hidden = true;
  $('denied').hidden = false;
  if (msg) $('denied-msg').textContent = msg;
}

function deriveActive() {
  S.heads = S.headsAll.filter(function (h) { return h.isActive; });
  S.advisors = S.advisorsAll.filter(function (a) { return a.isActive; });
}

function loadLookups() {
  return Promise.all([
    aGet('/heads', { includeInactive: 'true' }).then(function (r) { S.headsAll = r.data || []; }),
    aGet('/advisors', { includeInactive: 'true' }).then(function (r) { S.advisorsAll = r.data || []; })
  ]).then(deriveActive);
}

function loadLookupsOnce() {
  if (S.preloaded) { S.preloaded = false; return Promise.resolve(); }
  return loadLookups();
}

function refreshHeadBalances() {
  if (!can(2) && !can(4)) return Promise.resolve();
  var req = can(2)
    ? aGet('/due-summary', { month: thisMonth() }).then(function (r) {
        var map = {};
        ((r.data && r.data.rows) || []).forEach(function (row) {
          map[String(row.headId)] = Number(row.currentBalance) || 0;
        });
        S.headBalances = map;
      })
    : aGet('/ledger/heads').then(function (r) {
        var map = {};
        (r.data || []).forEach(function (row) {
          map[String(row.headId)] = Number(row.balance) || 0;
        });
        S.headBalances = map;
      });
  return req.catch(function () {});
}

function boot() {
  var token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return; }
  var userType = localStorage.getItem('userType');
  $('btn-back').addEventListener('click', function () {
    window.location.href = userType === 'staff' ? 'staff-dashboard.html' : 'dashboard.html';
  });
  var y = Number(todayYmd().slice(0, 4)), m = Number(todayYmd().slice(5, 7));
  var s = m >= 4 ? y : y - 1;
  $('fy-badge').textContent = '📅 FY ' + s + '-' + String(s + 1).slice(2);

  wireEvents();
  setInterval(function () {
    var w = $('p-when');
    if (w && !$('t3-add').hidden && !$('tab3').hidden) w.textContent = fmtDT(new Date());
  }, 30000);

  aGet('/me').then(function (r) {
    S.me = r.data;
    $('who-badge').textContent = (S.me.kind === 'admin' ? '👑 Owner login' : '👤 ' + S.me.name);
    if (!S.me.allEntries && $('e-by-wrap')) $('e-by-wrap').hidden = true;
    var tabs = allowedTabs();
    if (!tabs.length) {
      showDenied('You do not have permission to use any Expense Management section. Please ask the administrator.');
      return;
    }
    tabs.forEach(function (i) { $('tab' + i + '-btn').hidden = false; });
    return loadLookups().then(function () {
      $('loading').hidden = true;
      var start = tabs.indexOf(3) >= 0 ? 3 : tabs[0];
      if (!S.heads.length && tabs.indexOf(1) >= 0) start = 1;
      S.preloaded = true;
      switchTab(start);
      checkAutoDues();
      maybeOfferTour();
    });
  }).catch(function (e) {
    showDenied(errMsg(e));
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 · EXPENSE HEADS & ADVISED-BY
═══════════════════════════════════════════════════════════════ */
var SUGGESTED_HEADS = [
  'Salary', 'Installment', 'Diesel', 'Electricity',
  'Rent', 'Repairs & Maintenance', 'Stationery & Books', 'Events'
];

function can(tab) { return !!(S.me && S.me.perms && S.me.perms['tab' + tab]); }
function isOwner() { return !!(S.me && S.me.isOwner); }
function emptyBox(title, text) { return '<div class="empty"><b>' + esc(title) + '</b>' + esc(text) + '</div>'; }

function renderHeads() {
  var showOff = $('head-inactive').checked;
  var q = ($('head-search') ? $('head-search').value : '').trim().toLowerCase();
  var list = S.headsAll.filter(function (h) {
    var matchesState = showOff ? !h.isActive : !!h.isActive;
    return matchesState && (!q || h.name.toLowerCase().indexOf(q) >= 0);
  });
  $('head-list').innerHTML = list.length ? list.map(function (h) {
    var meta = [
      h.entryCount + ' entr' + (h.entryCount === 1 ? 'y' : 'ies'),
      h.scheduleCount ? h.scheduleCount + ' auto rule' + (h.scheduleCount === 1 ? '' : 's') : '',
      h.isActive ? '' : 'inactive'
    ].filter(Boolean).join(' · ');
    return '<div class="li' + (h.isActive ? '' : ' off') + '"><div class="meta"><b>' + esc(h.name) + '</b><small>' + esc(meta) + '</small></div>' +
      '<div class="acts-row">' +
      '<button class="btn ghost sm" type="button" data-act="edit-head" data-id="' + esc(h._id) + '">Edit</button>' +
      '<button class="btn ' + (h.isActive ? 'danger' : 'ghost') + ' sm" type="button" data-act="toggle-head" data-id="' + esc(h._id) + '">' + (h.isActive ? 'Deactivate' : 'Activate') + '</button>' +
      '<button class="btn danger sm" type="button" data-act="delete-head" data-id="' + esc(h._id) + '">Delete</button>' +
      '</div></div>';
  }).join('') : (
    q
      ? emptyBox('No matching heads', 'No head matched “' + q + '”.')
      : (showOff
          ? emptyBox('No inactive heads', 'Deactivated heads will appear here.')
          : emptyBox('No heads yet', 'Add your first head above, or tap a suggestion.'))
  );

  var have = {};
  S.headsAll.forEach(function (h) { have[h.name.toLowerCase()] = 1; });
  var sugg = SUGGESTED_HEADS.filter(function (name) { return !have[name.toLowerCase()]; });
  $('head-suggest').innerHTML = sugg.length ? '<span class="hint" style="align-self:center">Quick add:</span>' + sugg.map(function (name) {
    return '<button class="chip-btn" type="button" data-act="suggest-head" data-name="' + esc(name) + '">+ ' + esc(name) + '</button>';
  }).join('') : '';
}

function ensureAdvFilters() {
  var listEl = $('adv-list');
  if (!listEl || $('adv-search')) return;
  var wrap = document.createElement('div');
  wrap.id = 'adv-filters';
  wrap.style.marginTop = '14px';
  wrap.innerHTML =
    '<input class="in" id="adv-search" type="search" placeholder="Search names by name..." aria-label="Search advised-by names">' +
    '<label style="display:inline-flex;align-items:center;gap:8px;margin:10px 0 12px;font-size:13.5px;color:var(--text2);cursor:pointer">' +
      '<input id="adv-inactive" type="checkbox" style="width:16px;height:16px;margin:0">' +
      '<span>Show inactive</span>' +
    '</label>';
  listEl.parentNode.insertBefore(wrap, listEl);
}

//

function renderAdvisors() {
  ensureAdvFilters();
  var showOff = $('adv-inactive') ? $('adv-inactive').checked : false;
  var q = ($('adv-search') ? $('adv-search').value : '').trim().toLowerCase();
  var list = S.advisorsAll.filter(function (a) {
    var matchesState = showOff ? !a.isActive : !!a.isActive;
    return matchesState && (!q || a.name.toLowerCase().indexOf(q) >= 0);
  });

  $('adv-list').innerHTML = list.length ? list.map(function (a) {
    var count = Number(a.entryCount || 0);
    var meta = [
      count ? count + ' entr' + (count === 1 ? 'y' : 'ies') : '',
      a.isActive ? '' : 'inactive'
    ].filter(Boolean).join(' · ');
    return '<div class="li' + (a.isActive ? '' : ' off') + '"><div class="meta"><b>' + esc(a.name) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div>' +
      '<div class="acts-row"><button class="btn ghost sm" type="button" data-act="edit-adv" data-id="' + esc(a._id) + '">Rename</button>' +
      '<button class="btn ' + (a.isActive ? 'danger' : 'ghost') + ' sm" type="button" data-act="toggle-adv" data-id="' + esc(a._id) + '">' + (a.isActive ? 'Deactivate' : 'Activate') + '</button>' +
      '<button class="btn danger sm" type="button" data-act="delete-adv" data-id="' + esc(a._id) + '">Delete</button></div></div>';
  }).join('') : (
    q
      ? emptyBox('No matching names', 'No name matched “' + q + '”.')
      : (showOff
          ? emptyBox('No inactive names', 'Deactivated names will appear here.')
          : (S.advisorsAll.length
              ? emptyBox('No active names', 'All names are currently inactive. Check “Show inactive” above to view them.')
              : emptyBox('No names yet', 'Optional. Add Principal, Manager, Director and so on.')))
  );
}

function renderTab1() { renderHeads(); renderAdvisors(); }

function reloadTab1(useCache) {
  return (useCache ? loadLookupsOnce() : loadLookups()).then(renderTab1).catch(function (e) { toast(errMsg(e), 'error'); });
}
TAB_LOADERS[1] = function () { return reloadTab1(true); };

function createHead(name) {
  return aPost('/heads', { name: name }).then(function () { toast('Head added'); return reloadTab1(); });
}

function submitHead(e) {
  e.preventDefault();
  var name = $('head-name').value.trim();
  if (!name) return;
  var btn = e.target.querySelector('button[type="submit"]');
  setBtnLoading(btn, true, 'Adding…');
  createHead(name).then(function () { $('head-name').value = ''; $('head-name').focus(); })
    .catch(function (err) { toast(errMsg(err), 'error'); })
    .then(function () { setBtnLoading(btn, false); });
}

function editHead(id) {
  var h = byId(S.headsAll, id); if (!h) return;
  openForm('Edit head', null, [{ key: 'name', label: 'Head name', value: h.name }], 'Save changes', function (v) {
    if (!String(v.name || '').trim()) throw new Error('Head name cannot be empty');
    return getDeleteCode().then(function (code) {
      return aPut('/heads/' + id, { name: v.name }, code);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function () { toast('Head updated'); return reloadTab1(); });
  });
}

function toggleHead(id) {
  var h = byId(S.headsAll, id); if (!h) return;
  getDeleteCode().then(function (code) {
    return aPut('/heads/' + id, { isActive: !h.isActive }, code);
  }).catch(function (err) { codeFailed(err); throw err; })
    .then(function () { toast(h.isActive ? 'Head deactivated' : 'Head activated'); return reloadTab1(); })
    .catch(function (err) { if (err && err.message !== 'Cancelled') toast(errMsg(err), 'error'); });
}

function submitAdvisor(e) {
  e.preventDefault();
  var name = $('adv-name').value.trim(); if (!name) return;
  var btn = e.target.querySelector('button[type="submit"]');
  setBtnLoading(btn, true, 'Adding…');
  aPost('/advisors', { name: name }).then(function () { toast('Added'); $('adv-name').value = ''; return reloadTab1(); })
    .catch(function (err) { toast(errMsg(err), 'error'); })
    .then(function () { setBtnLoading(btn, false); });
}

function editAdvisor(id) {
  var a = byId(S.advisorsAll, id); if (!a) return;
  openForm('Rename', null, [{ key: 'name', label: 'Name', value: a.name }], 'Save', function (v) {
    if (!String(v.name || '').trim()) throw new Error('Name cannot be empty');
    return getDeleteCode().then(function (code) {
      return aPut('/advisors/' + id, { name: v.name }, code);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function () { toast('Renamed'); return reloadTab1(); });
  });
}

function toggleAdvisor(id) {
  var a = byId(S.advisorsAll, id); if (!a) return;
  getDeleteCode().then(function (code) {
    return aPut('/advisors/' + id, { isActive: !a.isActive }, code);
  }).catch(function (err) { codeFailed(err); throw err; })
    .then(function () { toast(a.isActive ? 'Deactivated' : 'Activated'); return reloadTab1(); })
    .catch(function (err) { if (err && err.message !== 'Cancelled') toast(errMsg(err), 'error'); });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 · EXPENSES DUE & AUTOMATIC SCHEDULES
═══════════════════════════════════════════════════════════════ */
var STATUS_TXT = { unpaid: 'Unpaid', part: 'Part paid', cleared: 'Cleared', advance: 'Paid in advance', nil: 'No dues' };

function fillDueHeads() {
  var cur = $('due-head').value;
  $('due-head').innerHTML = '<option value="">All heads</option>' + S.headsAll.filter(function (h) { return h.isActive; }).map(function (h) {
    return '<option value="' + esc(h._id) + '">' + esc(h.name) + '</option>';
  }).join('');
  $('due-head').value = cur;
}

TAB_LOADERS[2] = function () {
  if (!S.dueMonth) { S.dueMonth = thisMonth(); $('due-month').value = S.dueMonth; }
  loadLookupsOnce().then(function () { fillDueHeads(); loadDue(); }).catch(function (e) { toast(errMsg(e), 'error'); });
};

function loadDue() {
  var my = ++S.dueReq;
  $('due-table').innerHTML = '<div class="empty"><span class="spin"></span>Loading…</div>';
  if ($('t2-schedules-table')) $('t2-schedules-table').innerHTML = '<div class="empty"><span class="spin"></span>Loading…</div>';
  aGet('/due-summary', { month: S.dueMonth }).then(function (r) {
    if (my !== S.dueReq) return;
    S.dueRows = r.data.rows || [];
    S.dueSchedules = r.data.schedules || [];
    S.dueTotals = r.data.totals || { monthDue: 0, monthPaid: 0, outstanding: 0, advances: 0 };
    if (S.dueMonth === thisMonth()) {
      var map = {};
      S.dueRows.forEach(function (row) { map[String(row.headId)] = Number(row.currentBalance) || 0; });
      S.headBalances = map;
    }
    renderDue();
    renderSchedulesTable();
  }).catch(function (e) {
    if (my !== S.dueReq) return;
    $('due-table').innerHTML = emptyBox('Could not load', errMsg(e));
    if ($('t2-schedules-table')) $('t2-schedules-table').innerHTML = '';
  });
}

function renderDue() {
  syncDuePresets();
  var t = S.dueTotals || { monthDue: 0, monthPaid: 0, outstanding: 0, advances: 0 };
  $('due-stats').innerHTML =
    '<div class="stat"><small>Due in ' + esc(monthLabel(S.dueMonth)) + '</small><b>' + inr(t.monthDue) + '</b></div>' +
    '<div class="stat good"><small>Paid in ' + esc(monthLabel(S.dueMonth)) + '</small><b>' + inr(t.monthPaid) + '</b></div>' +
    '<div class="stat warn"><small>Balance to pay</small><b>' + inr(t.outstanding) + '</b></div>' +
    '<div class="stat"><small>Paid in advance</small><b>' + inr(t.advances) + '</b></div>';

  var only = $('due-head').value;
  var dq = ($('due-q') ? $('due-q').value : '').trim().toLowerCase();
  var rawRows = S.dueRows.filter(function (r) {
    if (only && String(r.headId) !== only) return false;
    if (dq) {
      var itemsTxt = (r.dueItems || []).map(function (it) { return it.description + ' ' + (it.remark || '') + ' ' + (it.reference || ''); }).join(' ');
      var schedTxt = (r.schedules || []).map(function (sc) { return sc.description + ' ' + (sc.remark || ''); }).join(' ');
      if ((r.name + ' ' + itemsTxt + ' ' + schedTxt).toLowerCase().indexOf(dq) < 0) return false;
    }
    return true;
  });

  if (!rawRows.length) {
    $('due-table').innerHTML = emptyBox('Nothing to show for ' + monthLabel(S.dueMonth),
      S.headsAll.length ? 'Use “+ Add due (One-time)” or “+ Add due (Automatic)” above to record a due.' : 'Add heads in the Expense Heads tab first.');
    return;
  }

  var rows = rawRows.slice().sort(function (a, b) {
    var aUnpaid = (a.monthDue > a.monthPaid || a.closing > 0) ? 1 : 0;
    var bUnpaid = (b.monthDue > b.monthPaid || b.closing > 0) ? 1 : 0;
    if (aUnpaid !== bUnpaid) return bUnpaid - aUnpaid;
    return a.name.localeCompare(b.name);
  });

  var todayStr = todayYmd();
  var monShort = monthLabel(S.dueMonth).split(' ')[0].slice(0, 3);

  $('due-table').innerHTML = '<table><thead><tr><th>Head &amp; Due details</th><th class="n">Previous balance</th><th class="n">Due</th><th class="n">Paid</th><th class="n">Balance</th><th>Status</th><th class="no-print"></th></tr></thead><tbody>' +
    rows.map(function (r) {
      var isSettled = r.closing <= 0 && r.monthDue <= r.monthPaid;
      var itemsHtml = '';
      if (r.dueItems && r.dueItems.length) {
        itemsHtml = '<div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">' + r.dueItems.map(function (it) {
          var dYmd = it.dueDate ? ymd(it.dueDate) : '';
          var dStr = dYmd ? (Number(dYmd.slice(8, 10)) + ' ' + monShort) : '';
          var overdue = !isSettled && dYmd && dYmd < todayStr;
          var badge = dStr
            ? (overdue
                ? '<span style="color:var(--red);font-weight:700">⚠️ ' + esc(dStr) + '</span>'
                : '<span style="color:var(--brand-ink);font-weight:700">📅 ' + esc(dStr) + '</span>')
            : '';
          var payItemBtn = (can(3) && r.isActive && r.closing > 0)
            ? ' <button class="btn ghost sm no-print" style="padding:2px 8px;font-size:11px" type="button" data-act="pay-item" data-head="' + esc(r.headId) + '" data-amt="' + esc(it.amount) + '" data-desc="' + esc(it.description) + '">Pay</button>'
            : '';
          return '<div class="sm-t" style="color:var(--text2)">• <b>' + esc(it.description) + '</b> — ' + esc(inr(it.amount)) +
            (badge ? ' · ' + badge : '') +
            (it.source === 'auto' ? ' · <span style="color:var(--text3)">auto</span>' : '') +
            (it.reference ? ' · Bill: ' + esc(it.reference) : '') +
            payItemBtn + '</div>';
        }).join('') + '</div>';
      } else if (r.schedules && r.schedules.length) {
        var activeCount = r.schedules.filter(function (s) { return s.autoDueEnabled !== false; }).length;
        itemsHtml = '<span class="sm-t">' + activeCount + ' active automatic rule' + (activeCount === 1 ? '' : 's') + '</span>';
      }

      var acts = [];
      if (can(3) && r.isActive) acts.push('<button class="btn ghost sm" type="button" data-act="pay-head" data-id="' + esc(r.headId) + '" data-bal="' + esc(r.closing > 0 ? r.closing : '') + '">Pay</button>');
      if (can(2) && r.isActive) acts.push('<button class="btn ghost sm" type="button" data-act="quick-due-head" data-id="' + esc(r.headId) + '">+ Due</button>');
      if (can(4) && S.me && S.me.allEntries) acts.push('<button class="btn ghost sm" type="button" data-act="open-head-ledger" data-id="' + esc(r.headId) + '">Ledger</button>');

      return '<tr><td class="keep"><b>' + esc(r.name) + '</b>' + (r.isActive ? '' : ' <span class="sm-t">inactive</span>') + itemsHtml + '</td>' +
        '<td class="n' + (r.previous < 0 ? ' neg' : '') + '">' + num(r.previous) + '</td>' +
        '<td class="n"><b>' + num(r.monthDue) + '</b></td>' +
        '<td class="n">' + num(r.monthPaid) + '</td>' +
        '<td class="n' + (r.closing < 0 ? ' neg' : '') + '"><b>' + num(r.closing) + '</b></td>' +
        '<td><span class="pill ' + esc(r.status) + '">' + esc(STATUS_TXT[r.status] || r.status) + '</span></td>' +
        '<td class="keep no-print"><div class="acts-row" style="justify-content:flex-end">' + acts.join('') + '</div></td></tr>';
    }).join('') + '</tbody></table>';
}

function renderSchedulesTable() {
  var box = $('t2-schedules-table');
  if (!box) return;
  var only = $('due-head').value;
  var dq = ($('due-q') ? $('due-q').value : '').trim().toLowerCase();
  var list = (S.dueSchedules || []).filter(function (s) {
    if (only && String(s.headId) !== only) return false;
    if (dq && (s.headName + ' ' + s.description + ' ' + (s.remark || '')).toLowerCase().indexOf(dq) < 0) return false;
    return true;
  });

  if (!list.length) {
    box.innerHTML = emptyBox('No automatic monthly dues set up', 'Click “+ Add due (Automatic)” above to schedule recurring monthly expenses like bus installments, rent, or salaries.');
    return;
  }

  box.innerHTML = '<table><thead><tr><th>Head</th><th>Description</th><th class="n">Monthly Amount</th><th>Due Date</th><th>Status</th><th>Remarks</th><th class="no-print"></th></tr></thead><tbody>' +
    list.map(function (s) {
      var active = s.autoDueEnabled !== false;
      var acts = [
        '<button class="btn ghost sm" type="button" data-act="edit-schedule" data-id="' + esc(s._id) + '">Edit</button>',
        '<button class="btn ghost sm" type="button" data-act="toggle-schedule" data-id="' + esc(s._id) + '">' + (active ? 'Pause' : 'Resume') + '</button>',
        '<button class="btn danger sm" type="button" data-act="delete-schedule" data-id="' + esc(s._id) + '">Remove</button>'
      ].join('');
      return '<tr' + (active ? '' : ' style="opacity:.65"') + '>' +
        '<td><b>' + esc(s.headName) + '</b></td>' +
        '<td>' + esc(s.description) + '</td>' +
        '<td class="n"><b>' + inr(s.amount) + '</b></td>' +
        '<td><span class="pill due">' + esc(ordinal(s.dueDay)) + ' of month</span></td>' +
        '<td><span class="pill ' + (active ? 'paid' : 'part') + '">' + (active ? 'Active' : 'Paused') + '</span></td>' +
        '<td>' + esc(s.remark || '–') + '</td>' +
        '<td class="keep no-print"><div class="acts-row" style="justify-content:flex-end">' + acts + '</div></td></tr>';
    }).join('') + '</tbody></table>';
}

function openOneTimeDueModal(presetHeadId) {
  if (!S.heads.length) { toast('Add a head first (Expense Heads tab)', 'error'); return; }
  var initHead = presetHeadId || $('due-head').value || String(S.heads[0]._id);
  var fields = [
    { key: 'headId', label: 'Head', type: 'select', value: initHead, options: S.heads.map(function (h) { return { v: h._id, t: h.name }; }) },
    { key: 'description', label: 'Description', placeholder: 'e.g. Bus 0899 insurance or Repair bill' },
    { key: 'amount', label: 'Amount (₹)', placeholder: '0' },
    { key: 'forMonth', label: 'For month', type: 'month', value: S.dueMonth || thisMonth() },
    { key: 'dueDate', label: 'Due date (optional)', type: 'date' },
    { key: 'reference', label: 'Bill / invoice no. (optional)' },
    { key: 'remark', label: 'Remarks (optional)', type: 'textarea' }
  ];
  openForm('Add due (One-time)', 'Record a single bill or amount due for a specific month.', fields, 'Add one-time due', function (v) {
    if (!v.headId) throw new Error('Choose a head');
    var desc = v.description.trim();
    if (!desc) throw new Error('Write a description');
    var amt = money(v.amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Enter an amount greater than zero');
    return aPost('/dues', {
      headId: v.headId,
      description: desc,
      amount: amt,
      forMonth: v.forMonth || undefined,
      dueDate: v.dueDate || undefined,
      reference: v.reference.trim() || undefined,
      remark: v.remark.trim() || undefined
    }).then(function () {
      toast('One-time due added');
      loadDue();
    });
  });
}

function openAutoDueModal(presetHeadId) {
  if (!S.heads.length) { toast('Add a head first (Expense Heads tab)', 'error'); return; }
  var initHead = presetHeadId || $('due-head').value || String(S.heads[0]._id);
  var targetMonth = S.dueMonth || thisMonth();
  var fields = [
    { key: 'headId', label: 'Head', type: 'select', value: initHead, options: S.heads.map(function (h) { return { v: h._id, t: h.name }; }) },
    { key: 'description', label: 'Description', placeholder: 'e.g. Bus 0899 EMI or Building rent', hint: 'You can add multiple automatic dues under the same head (e.g. separate installments for each bus).' },
    { key: 'amount', label: 'Monthly amount (₹)', placeholder: '0' },
    { key: 'dueDay', label: 'Monthly due date (1–31)', type: 'number', min: 1, max: 31, placeholder: 'e.g. 5', hint: 'Automatically creates the due every month on this date (29–31 adjusts to month end).' },
    { key: 'createNow', label: 'Also add due for ' + monthLabel(targetMonth) + ' right now?', type: 'select', value: 'yes', options: [{ v: 'yes', t: 'Yes — create ' + monthLabel(targetMonth) + ' due immediately' }, { v: 'no', t: 'No — start from upcoming scheduled date' }] },
    { key: 'remark', label: 'Saved recurring remark (optional)', type: 'textarea', hint: 'Attached automatically to every generated monthly due' }
  ];
  openForm('Add due (Automatic monthly)', 'Creates a recurring monthly due rule under the selected head.', fields, 'Save automatic due', function (v) {
    if (!v.headId) throw new Error('Choose a head');
    var desc = v.description.trim();
    if (!desc) throw new Error('Write a description');
    var amt = money(v.amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Enter a monthly amount greater than zero');
    var dd = parseDueDayInput(v.dueDay);
    if (!dd) throw new Error('Enter a due date between 1 and 31');

    var startMonth = targetMonth;
    if (v.createNow !== 'yes') {
      var yr = Number(targetMonth.slice(0, 4)), mo = Number(targetMonth.slice(5, 7));
      var maxD = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
      var effD = Math.min(Math.max(1, dd), maxD);
      var targetDueYmd = targetMonth + '-' + (effD < 10 ? '0' : '') + effD;
      var horizonYmd = ymd(new Date(Date.now() + 3 * 86400000));
      if (targetDueYmd <= horizonYmd) {
        mo += 1;
        if (mo === 13) { yr += 1; mo = 1; }
        startMonth = yr + '-' + (mo < 10 ? '0' : '') + mo;
      }
    }

    return aPost('/schedules', {
      headId: v.headId,
      description: desc,
      amount: amt,
      dueDay: dd,
      autoDueEnabled: true,
      startMonth: startMonth,
      createForMonth: v.createNow === 'yes' ? targetMonth : undefined,
      remark: v.remark.trim() || undefined
    }).then(function () {
      if (v.createNow !== 'yes') return aPost('/auto-dues/check').catch(function () {});
    }).then(function () {
      toast('Automatic monthly due saved');
      loadDue();
    });
  });
}

function editSchedule(id) {
  var s = byId(S.dueSchedules || [], id);
  if (!s) return;
  var fields = [
    { key: 'headId', label: 'Head', type: 'select', value: s.headId, options: S.heads.map(function (h) { return { v: h._id, t: h.name }; }) },
    { key: 'description', label: 'Description', value: s.description },
    { key: 'amount', label: 'Monthly amount (₹)', value: s.amount },
    { key: 'dueDay', label: 'Monthly due date (1–31)', type: 'number', min: 1, max: 31, value: s.dueDay },
    { key: 'autoDueEnabled', label: 'Status', type: 'select', value: s.autoDueEnabled === false ? 'false' : 'true', options: [{ v: 'true', t: 'Active (auto-generate monthly)' }, { v: 'false', t: 'Paused' }] },
    { key: 'remark', label: 'Saved recurring remark (optional)', type: 'textarea', value: s.remark || '' }
  ];
  openForm('Edit automatic due rule', null, fields, 'Save changes', function (v) {
    if (!v.headId) throw new Error('Choose a head');
    var desc = v.description.trim();
    if (!desc) throw new Error('Description cannot be empty');
    var amt = money(v.amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Enter a monthly amount greater than zero');
    var dd = parseDueDayInput(v.dueDay);
    if (!dd) throw new Error('Due date must be between 1 and 31');
    var enabled = v.autoDueEnabled === 'true';

    return getDeleteCode().then(function (code) {
      return aPut('/schedules/' + id, {
        headId: v.headId,
        description: desc,
        amount: amt,
        dueDay: dd,
        autoDueEnabled: enabled,
        remark: v.remark.trim() || null
      }, code);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function () {
        if (enabled) return aPost('/auto-dues/check').catch(function () {});
      }).then(function () {
        toast('Schedule updated');
        loadDue();
      });
  });
}

function toggleSchedule(id) {
  var s = byId(S.dueSchedules || [], id);
  if (!s) return;
  var next = s.autoDueEnabled === false;
  getDeleteCode().then(function (code) {
    return aPut('/schedules/' + id, { autoDueEnabled: next }, code);
  }).catch(function (err) { codeFailed(err); throw err; })
    .then(function () {
      if (next) return aPost('/auto-dues/check').catch(function () {});
    }).then(function () {
      toast(next ? 'Schedule resumed' : 'Schedule paused');
      loadDue();
    }).catch(function (e) { if (e && e.message !== 'Cancelled') toast(errMsg(e), 'error'); });
}

function deleteSchedule(id) {
  var s = byId(S.dueSchedules || [], id);
  if (!s) return;
  askConfirm('Remove automatic schedule?', '“' + s.headName + ' — ' + s.description + '” will stop generating future dues. Existing dues already created remain intact.', 'Remove')
    .then(function (yes) {
      if (!yes) return;
      return getDeleteCode().then(function (code) {
        return aDel('/schedules/' + id, code);
      }).catch(function (err) { codeFailed(err); throw err; })
        .then(function () { toast('Automatic schedule removed'); loadDue(); });
    }).catch(function (e) { if (e && e.message !== 'Cancelled') toast(errMsg(e), 'error'); });
}

function checkAutoDues() {
  aPost('/auto-dues/check').then(function (r) {
    var d = r.data;
    if (d && d.created > 0) {
      var months = d.runs.filter(function (x) { return x.created; }).map(function (x) { return monthLabel(x.month); }).join(', ');
      toast('Automatic dues created for ' + months + ' (' + d.created + ' entr' + (d.created === 1 ? 'y' : 'ies') + ')');
      if (!$('tab2').hidden) loadDue();
    }
  }).catch(function () {});
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 · EXPENSES PAID
═══════════════════════════════════════════════════════════════ */
function fillPayForm() {
  var curH = $('p-head').value, curA = $('p-adv').value;
  $('p-head').innerHTML = '<option value="">— choose head —</option>' + S.heads.map(function (h) {
    return '<option value="' + esc(h._id) + '">' + esc(h.name) + '</option>';
  }).join('');
  $('p-adv').innerHTML = S.advisors.length
    ? '<option value="">— choose —</option>' + S.advisors.map(function (a) { return '<option value="' + esc(a._id) + '">' + esc(a.name) + '</option>'; }).join('')
    : '<option value="">Not needed (no names added)</option>';
  $('p-adv').disabled = !S.advisors.length;
  $('p-head').value = curH;
  $('p-adv').value = curA;
  $('p-entered').textContent = whoAmI();
  $('p-when').textContent = fmtDT(new Date());
  $('p-date-wrap').hidden = !isOwner();
  $('p-date').max = todayYmd();
  syncPayForm();
}

function whoAmI() {
  if (!S.me) return '';
  return S.me.kind === 'admin' ? 'Admin (owner login)' : S.me.name + (S.me.designation ? ' · ' + S.me.designation : '');
}

function syncPayForm() {
  var adj = S.payType === 'adjustment';
  $('p-mode-wrap').hidden = adj;
  $('p-desc').placeholder = adj ? 'e.g. Fee concession adjusted against salary' : 'e.g. Bus 0899 installment or Diesel for generator';
  $('p-save').textContent = adj ? 'Save adjustment' : 'Save payment';

  var headId = $('p-head').value;
  var head = byId(S.heads, headId);
  var pv = $('p-preview');
  var amt = money($('p-amount').value);

  if (head && S.headBalances[String(head._id)] !== undefined) {
    var before = Number(S.headBalances[String(head._id)]) || 0;
    if (!isNaN(amt) && amt > 0) {
      var after = Math.round((before - amt) * 100) / 100;
      pv.hidden = false;
      pv.className = 'preview' + (after < 0 ? ' warn' : '');
      pv.textContent = head.name + ' balance after this ' + (adj ? 'adjustment' : 'payment') + ': ' +
        (after < 0 ? inr(Math.abs(after)) + ' advance' : inr(after) + ' due remaining') +
        '  (now ' + (before < 0 ? inr(Math.abs(before)) + ' advance' : inr(before) + ' due') + ')';
    } else {
      pv.hidden = false;
      pv.className = 'preview';
      pv.textContent = head.name + ' current balance: ' +
        (before < 0 ? inr(Math.abs(before)) + ' advance' : before > 0 ? inr(before) + ' due' : 'settled');
    }
  } else {
    pv.hidden = true;
  }
}

function setPayType(t) {
  S.payType = t;
  var btns = document.querySelectorAll('#pay-type button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.type === t ? 'true' : 'false');
  fillPayForm();
}

/* ---- Bill / Receipt image compression ---- */
function clearAttachment() {
  S.pendingAttachment = null;
  if ($('p-att')) $('p-att').value = '';
  if ($('p-att-preview')) {
    $('p-att-preview').hidden = true;
    $('p-att-preview').innerHTML = '';
  }
}

function handleAttachmentChange(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) { clearAttachment(); return; }
  if (!/^image\//i.test(file.type)) {
    toast('Please select an image file (JPG, PNG, or WebP).', 'error');
    clearAttachment();
    return;
  }
  var reader = new FileReader();
  reader.onload = function (ev) {
    var img = new Image();
    img.onload = function () {
      var maxDim = 1280;
      var w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      if (dataUrl.length > 1950000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.55);
      }
      S.pendingAttachment = {
        dataUrl: dataUrl,
        name: file.name || 'bill-image.jpg',
        mimeType: 'image/jpeg'
      };
      var prev = $('p-att-preview');
      if (prev) {
        prev.hidden = false;
        prev.innerHTML = '<span class="att-prev"><img src="' + esc(dataUrl) + '" alt="Bill preview"><span>' + esc(file.name) + '</span>' +
          '<button class="btn danger sm" type="button" data-act="clear-att" style="padding:2px 7px;font-size:11px">Remove</button></span>';
      }
    };
    img.onerror = function () { toast('Could not read image file.', 'error'); clearAttachment(); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function submitPayment(e) {
  e.preventDefault();
  var adj = S.payType === 'adjustment';
  var amt = money($('p-amount').value);
  if (!$('p-head').value) { toast('Choose a head', 'error'); $('p-head').focus(); return; }
  if (isNaN(amt) || amt <= 0) { toast('Enter an amount greater than zero', 'error'); $('p-amount').focus(); return; }
  if (!$('p-desc').value.trim()) { toast('Write a description', 'error'); $('p-desc').focus(); return; }
  if (S.advisors.length && !$('p-adv').value) { toast('Choose who advised this payment', 'error'); $('p-adv').focus(); return; }

  var body = {
    type: S.payType,
    headId: $('p-head').value,
    description: $('p-desc').value.trim(),
    amount: amt,
    mode: adj ? undefined : $('p-mode').value,
    advisedById: $('p-adv').value || undefined,
    reference: $('p-ref').value.trim() || undefined,
    remark: $('p-remark').value.trim() || undefined,
    attachment: S.pendingAttachment || undefined,
    entryDate: (isOwner() && $('p-date').value) || undefined
  };

  if (S.savingPayment) return;
  S.savingPayment = true;
  setBtnLoading($('p-save'), true, 'Saving…');
  aPost('/payments', body).then(function (r) {
    var d = r.data;
    if (d.balanceAfter !== null && d.balanceAfter !== undefined) {
      S.headBalances[String(d.entry.headId)] = d.balanceAfter;
    }
    var tail = d.balanceAfter === null ? '' : ' · ' + (d.balanceAfter < 0 ? inr(Math.abs(d.balanceAfter)) + ' advance' : inr(d.balanceAfter) + ' due');
    toast('Saved ' + d.entry.voucherNo + ' · entered by ' + d.entry.enteredBy.name + tail);
    $('p-last').hidden = false;
    $('p-last').innerHTML = '✔ Saved <b>' + esc(d.entry.voucherNo) + '</b> · ' + esc(inr(d.entry.amount)) + ' · ' + esc(d.entry.headName) +
      ' &nbsp;<button class="btn ghost sm" type="button" data-act="receipt" data-id="' + esc(d.entry._id) + '">Print receipt</button>';
    ['p-amount', 'p-ref', 'p-remark', 'p-desc'].forEach(function (id) { $(id).value = ''; });
    $('p-date').value = '';
    clearAttachment();
    fillPayForm();
    loadEntries(1);
  }).catch(function (err) { toast(errMsg(err), 'error'); })
    .then(function () { S.savingPayment = false; setBtnLoading($('p-save'), false); });
}

/* ---- entries list ---- */
function fillEntryHeads() {
  if (!$('e-head')) return;
  var cur = $('e-head').value;
  $('e-head').innerHTML = '<option value="">All heads</option>' + S.headsAll.map(function (h) {
    return '<option value="' + esc(h._id) + '">' + esc(h.name) + (h.isActive ? '' : ' (inactive)') + '</option>';
  }).join('');
  $('e-head').value = cur;
}

function fillEnteredByFilter() {
  if (!$('e-by')) return;
  var cur = $('e-by').value;
  var seen = {}, staffList = [];
  function addStaff(id, name) {
    if (!id || !name) return;
    var k = String(id);
    if (seen[k]) return;
    seen[k] = true;
    staffList.push({ _id: k, name: name });
  }
  ((S.me && S.me.staffList) || []).forEach(function (s) { addStaff(s._id, s.name); });
  if (S.me && S.me.kind === 'staff' && S.me.userKey) {
    addStaff(S.me.userKey.replace(/^s/, ''), S.me.name);
  }
  (S.entRows || []).forEach(function (e) {
    if (e.enteredBy && e.enteredBy.kind === 'staff' && e.enteredBy.staffId) {
      addStaff(e.enteredBy.staffId, e.enteredBy.name);
    }
  });
  staffList.sort(function (a, b) { return a.name.localeCompare(b.name); });
  var opts = '<option value="">All entries</option><option value="admin">Admin (Manual)</option><option value="system">Admin (Auto dues)</option>';
  if (staffList.length) {
    opts += staffList.map(function (s) { return '<option value="' + esc(s._id) + '">' + esc(s.name) + '</option>'; }).join('');
  }
  $('e-by').innerHTML = opts;
  $('e-by').value = cur;
}

TAB_LOADERS[3] = function () {
  loadLookupsOnce().then(function () {
    fillPayForm();
    fillEntryHeads();
    fillEnteredByFilter();
    refreshHeadBalances().then(syncPayForm);
    if (!S.entInit) { S.entInit = true; applyPreset('today'); } else loadEntries(S.ent.page || 1);
  }).catch(function (e) { toast(errMsg(e), 'error'); });
};

function shiftYmd(n) { return ymd(new Date(Date.now() + n * 86400000)); }
function presetRange(name) {
  var t = todayYmd();
  if (name === 'today') return { from: t, to: t };
  if (name === 'yesterday') return { from: shiftYmd(-1), to: shiftYmd(-1) };
  if (name === 'last7') return { from: shiftYmd(-6), to: t };
  if (name === 'month') return { from: t.slice(0, 8) + '01', to: t };
  return { from: '', to: '' };
}
function markPreset(name) {
  S.preset = name;
  var btns = document.querySelectorAll('#e-presets button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.preset === name ? 'true' : 'false');
}
function applyPreset(name) {
  var r = presetRange(name);
  $('e-from').value = r.from; $('e-to').value = r.to;
  markPreset(name);
  loadEntries(1);
}

function entFilters() {
  return {
    from: $('e-from').value,
    to: $('e-to').value,
    headId: $('e-head') ? $('e-head').value : '',
    type: $('e-type').value,
    enteredBy: $('e-by') ? $('e-by').value : '',
    q: $('e-q').value.trim()
  };
}

function entPeriodText() {
  var f = $('e-from').value, t = $('e-to').value;
  if (!f && !t) return 'All time';
  if (f && t && f === t) return fmtD(f + 'T12:00:00+05:30');
  return (f ? fmtD(f + 'T12:00:00+05:30') : 'Start') + ' to ' + (t ? fmtD(t + 'T12:00:00+05:30') : 'today');
}

function loadEntries(page) {
  S.ent.page = page || 1;
  var my = ++S.entReq;
  $('ent-table').innerHTML = '<div class="empty"><span class="spin"></span>Loading…</div>';
  aGet('/entries', Object.assign({ page: S.ent.page, limit: 15 }, entFilters())).then(function (r) {
    if (my !== S.entReq) return;
    S.entRows = r.data || [];
    fillEnteredByFilter();
    S.ent.pages = r.pagination.totalPages || 1;
    S.ent.total = r.pagination.totalRecords;
    renderEntries(r);
  }).catch(function (e) { if (my !== S.entReq) return; $('ent-table').innerHTML = emptyBox('Could not load entries', errMsg(e)); });
}

function who(a) {
  var label = a.kind === 'system' ? 'Admin' : a.name;
  var sub = a.kind === 'admin' ? 'Owner' : a.kind === 'system' ? 'Auto rule' : (a.designation || '');
  return esc(label) + (sub ? '<span class="sm-t">' + esc(sub) + '</span>' : '');
}
function descOf(e) {
  if (e.description) return e.description;
  return e.type === 'due' ? 'Due' : e.type === 'adjustment' ? 'Adjustment' : 'Payment';
}
function typeLabel(t) { return t === 'adjustment' ? 'Adjustment' : t === 'due' ? 'Due' : 'Paid'; }

function renderEntries(r) {
  $('ent-banner').innerHTML = r.scope === 'mine' ? '<div class="banner">Showing only the entries you made yourself.</div>' : '';
  var t = r.totals || {};
  $('ent-sub').textContent = entPeriodText() + ' · Paid ' + inr(t.paid) + ' · Adjusted ' + inr(t.adjustment) + ' · Due entered ' + inr(t.due) + (S.ent.total ? '  (' + S.ent.total + ' entr' + (S.ent.total === 1 ? 'y' : 'ies') + ')' : '');
  if (!S.entRows.length) {
    $('ent-table').innerHTML = emptyBox('No entries for ' + entPeriodText(), 'Try “Last 7 days” or “All time”, or save a payment in the Add payment tab.');
    $('ent-pager').innerHTML = '';
    return;
  }
  $('ent-table').innerHTML = '<table><thead><tr><th>Sr. No.</th><th>Date</th><th>Head</th><th>Description</th><th>Type</th><th class="n">Amount</th><th>Advised by</th><th>Entered by</th><th>Remarks</th><th class="no-print"></th></tr></thead><tbody>' +
    S.entRows.map(function (e) {
      var rev = e.status === 'reversed';
      var small = [e.mode ? e.mode.toUpperCase() : '', e.reference || ''].filter(Boolean).join(' · ');
      var remarks = (e.remark ? esc(e.remark) : '') + (rev ? '<span class="sm-t" style="color:var(--red)">Reversed: ' + esc(e.reversedReason || '') + '</span>' : '');
      var hasBill = !!(e.attachment && (e.attachment.name || e.attachment.mimeType));
      var acts = '';
      if (hasBill) acts += '<button class="btn ghost sm" type="button" data-act="view-bill" data-id="' + esc(e._id) + '">📎 Bill</button> ';
      if (e.type !== 'due') acts += '<button class="btn ghost sm" type="button" data-act="receipt" data-id="' + esc(e._id) + '">Receipt</button> ';
      acts += '<button class="btn ghost sm" type="button" data-act="audit" data-id="' + esc(e._id) + '">History</button>';
      if (can(3) && !rev) acts += ' <button class="btn ghost sm" type="button" data-act="edit-entry" data-id="' + esc(e._id) + '">Edit</button> <button class="btn danger sm" type="button" data-act="reverse-entry" data-id="' + esc(e._id) + '">Reverse</button>';
      return '<tr' + (rev ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(e.voucherNo) + '</b></td>' +
        '<td>' + esc(fmtD(e.entryDate)) + '<span class="sm-t">' + esc(fmtT(e.entryDate)) + '</span></td>' +
        '<td><b>' + esc(e.headName) + '</b>' + (e.forMonth ? '<span class="sm-t">' + esc(monthLabel(e.forMonth)) + '</span>' : '') + '</td>' +
        '<td><b>' + esc(descOf(e)) + '</b>' + (small ? '<span class="sm-t">' + esc(small) + '</span>' : '') + '</td>' +
        '<td class="keep"><span class="pill ' + esc(e.type) + '">' + esc(typeLabel(e.type)) + '</span>' + (e.source === 'auto' ? '<span class="sm-t">auto</span>' : '') + '</td>' +
        '<td class="n"><b>' + num(e.amount) + '</b></td><td>' + esc(e.advisedByName || '–') + '</td><td>' + who(e.enteredBy) + '</td><td>' + remarks + '</td><td class="keep no-print"><div class="acts-row">' + acts + '</div></td></tr>';
    }).join('') + '</tbody></table>';
  $('ent-pager').innerHTML = '<span>Page ' + S.ent.page + ' of ' + S.ent.pages + '</span><span>' +
    '<button class="btn ghost sm" type="button" data-act="ent-prev"' + (S.ent.page <= 1 ? ' disabled' : '') + '>← Newer</button> ' +
    '<button class="btn ghost sm" type="button" data-act="ent-next"' + (S.ent.page >= S.ent.pages ? ' disabled' : '') + '>Older →</button></span>';
}

function showBillImage(id) {
  aGet('/entries/' + id).then(function (r) {
    var e = r.data;
    if (!e || !e.attachment || !e.attachment.dataUrl) {
      toast('No attached image found for this entry.', 'error');
      return;
    }
    openInfo(
      e.voucherNo + ' · Attached Bill',
      '<p class="sub">' + esc(e.headName) + ' · ' + esc(descOf(e)) + ' (' + esc(inr(e.amount)) + ')</p>' +
      '<div style="text-align:center;background:var(--surface2);padding:10px;border-radius:10px;border:1px solid var(--border)">' +
      '<img src="' + esc(e.attachment.dataUrl) + '" alt="Attached bill" style="max-width:100%;max-height:65vh;border-radius:8px;object-fit:contain">' +
      '</div>'
    );
  }).catch(function (err) { toast(errMsg(err), 'error'); });
}

function showAudit(id) {
  aGet('/entries/' + id).then(function (r) {
    var e = r.data;
    var rows = (e.auditLog || []).map(function (a) {
      var title = a.action === 'created' ? 'Entered' : a.action === 'edited' ? 'Edited' : 'Reversed';
      var byName = a.by.kind === 'system' ? 'Admin' : a.by.name;
      var byRole = (a.by.kind === 'admin' || a.by.kind === 'system') ? ' (Owner)' : (a.by.designation ? ' (' + esc(a.by.designation) + ')' : '');
      var ch = (a.changes || []).map(function (c) { return '<div class="hint">' + esc(c.field) + ': ' + esc(c.from === null ? '–' : c.from) + ' → ' + esc(c.to === null ? '–' : c.to) + '</div>'; }).join('');
      return '<div><b>' + title + '</b> by ' + esc(byName) + byRole +
        '<div class="hint">' + esc(fmtDT(a.at)) + '</div>' + ch + (a.note ? '<div class="hint">Reason: ' + esc(a.note) + '</div>' : '') + '</div>';
    }).join('');
    openInfo(e.voucherNo + ' · ' + inr(e.amount), '<p class="sub">' + esc(e.headName) + ' · ' + esc(descOf(e)) + '</p><div class="tl">' + rows + '</div>');
  }).catch(function (err) { toast(errMsg(err), 'error'); });
}

function editEntry(id) {
  var e = byId(S.entRows, id); if (!e) return;
  var fields = [{ key: 'description', label: 'Description', value: e.description || '' }, { key: 'amount', label: 'Amount (₹)', value: e.amount }];
  fields.push({ key: 'headId', label: 'Head', type: 'select', value: e.headId, options: S.heads.map(function (h) { return { v: h._id, t: h.name }; }) });
  if (e.type === 'paid') fields.push({ key: 'mode', label: 'Mode', type: 'select', value: e.mode || 'cash', options: ['cash', 'bank', 'upi', 'cheque', 'other'].map(function (m) { return { v: m, t: m.toUpperCase() }; }) });
  if (e.type === 'due') fields.push({ key: 'forMonth', label: 'For month', type: 'month', value: e.forMonth || '' });
  if (e.type !== 'due' && S.advisors.length) fields.push({ key: 'advisedById', label: 'Advised by', type: 'select', value: e.advisedById || '', options: S.advisors.map(function (a) { return { v: a._id, t: a.name }; }) });
  fields.push({ key: 'reference', label: 'Bill / transaction no.', value: e.reference || '' });
  fields.push({ key: 'remark', label: 'Remarks', type: 'textarea', value: e.remark || '' });
  var origBy = e.enteredBy.kind === 'system' ? 'Admin' : e.enteredBy.name;
  openForm('Edit ' + e.voucherNo, 'Originally entered by ' + origBy + '. Your change is added to the entry’s history with your name.', fields, 'Save changes', function (v) {
    var body = {}, amt = money(v.amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Enter an amount greater than zero');
    if (v.description.trim() !== (e.description || '')) { if (!v.description.trim()) throw new Error('Description cannot be empty'); body.description = v.description.trim(); }
    if (amt !== e.amount) body.amount = amt;
    if (v.headId && String(v.headId) !== String(e.headId)) body.headId = v.headId;
    if (v.mode !== undefined && v.mode !== (e.mode || 'cash')) body.mode = v.mode;
    if (v.forMonth !== undefined && v.forMonth && v.forMonth !== (e.forMonth || '')) body.forMonth = v.forMonth;
    if (v.advisedById !== undefined && v.advisedById && String(v.advisedById) !== String(e.advisedById || '')) body.advisedById = v.advisedById;
    if (v.reference !== (e.reference || '')) body.reference = v.reference;
    if (v.remark !== (e.remark || '')) body.remark = v.remark;
    if (!Object.keys(body).length) throw new Error('Nothing was changed');
    return getDeleteCode().then(function (code) {
      if (code) body.deleteCode = code;
      return aPut('/entries/' + id, body);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function () {
        toast('Entry updated');
        return refreshHeadBalances().then(function () {
          syncPayForm();
          loadEntries(S.ent.page);
          if (!$('tab2').hidden) loadDue();
        });
      });
  });
}

function reverseEntry(id) {
  var e = byId(S.entRows, id); if (!e) return;
  var isAuto = e.source === 'auto' && e.scheduleId;
  var fields = [
    { key: 'reason', label: 'Reason (required)', type: 'textarea', value: '' }
  ];
  if (isAuto) {
    fields.push({
      key: 'stopSchedule',
      label: 'Recurring schedule',
      type: 'checkbox',
      value: false,
      text: 'Stop future auto-dues (also remove this recurring monthly rule)'
    });
  }
  openForm('Reverse ' + e.voucherNo + '?', 'The entry stays visible, struck through, and stops counting in the balance. This cannot be undone.', fields, 'Reverse entry', function (v) {
    if (!v.reason.trim()) throw new Error('Write a reason');
    return getDeleteCode().then(function (code) {
      var body = { reason: v.reason.trim() };
      if (code) body.deleteCode = code;
      if (isAuto && v.stopSchedule) body.stopSchedule = true;
      return aPost('/entries/' + id + '/reverse', body);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function (res) {
        var stopped = res && res.scheduleRemoved;
        toast(stopped ? 'Entry reversed & recurring rule removed' : 'Entry reversed');
        return refreshHeadBalances().then(function () {
          syncPayForm();
          loadEntries(S.ent.page);
          if (!$('tab2').hidden) loadDue();
        });
      });
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 · LEDGER
═══════════════════════════════════════════════════════════════ */
function monthStartYmd() { return todayYmd().slice(0, 8) + '01'; }

TAB_LOADERS[4] = function () {
  var all = !!(S.me && S.me.allEntries);
  if (!$('l-from').value) $('l-from').value = monthStartYmd();
  if (!$('l-to').value) $('l-to').value = todayYmd();
  loadLookupsOnce().then(function () {
    var cur = $('l-head').value;
    if (all) {
      $('l-head').innerHTML = '<option value="">All heads (Summary)</option>' + S.headsAll.map(function (h) {
        return '<option value="' + esc(h._id) + '">' + esc(h.name) + (h.isActive ? '' : ' (inactive)') + '</option>';
      }).join('');
      if (cur) $('l-head').value = cur;
    } else {
      $('l-head').innerHTML = '<option value="">All heads (My entries summary)</option>';
      $('l-head').value = '';
    }
    setLedView(S.ledView);
  }).catch(function (e) { toast(errMsg(e), 'error'); });
};

function setLedView(v) {
  S.ledView = v;
  var btns = document.querySelectorAll('#led-view button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.view === v ? 'true' : 'false');
  $('l-head-wrap').hidden = v !== 'head';
  loadLedger();
}

function loadLedger() {
  var p = { from: $('l-from').value, to: $('l-to').value };
  var my = ++S.ledReq;
  $('led-body').innerHTML = '<div class="card empty"><span class="spin"></span>Loading…</div>';
  var req;
  if (S.ledView === 'head') {
    var hid = $('l-head').value;
    req = hid ? aGet('/ledger/head/' + hid, p) : aGet('/ledger/heads', p);
  } else {
    req = aGet('/ledger/cashbook', p);
  }
  req.then(function (r) { if (my !== S.ledReq) return; S.ledData = r.data; renderLedger(); })
    .catch(function (e) { if (my !== S.ledReq) return; $('led-body').innerHTML = '<div class="card">' + emptyBox('Could not load the ledger', errMsg(e)) + '</div>'; });
}

function periodText() {
  var f = $('l-from').value, t = $('l-to').value;
  return (f ? fmtD(f + 'T12:00:00+05:30') : 'Start') + ' to ' + (t ? fmtD(t + 'T12:00:00+05:30') : 'today');
}

function ledgerRows(d) {
  var prev = d.opening, out = [];
  d.rows.forEach(function (r) {
    var rev = r.status === 'reversed';
    out.push({ r: r, rev: rev, open: prev, close: rev ? prev : r.balance });
    if (!rev) prev = r.balance;
  });
  return out.reverse();
}
function detailLine(r) { return [r.mode ? r.mode.toUpperCase() : '', r.reference || ''].filter(Boolean).join(' · '); }

function renderLedger() {
  var d = S.ledData, html = '';
  var isSingleHead = S.ledView === 'head' && d && d.head;
  $('l-print-head').innerHTML = '<h2 style="font-size:18px">Expense ledger</h2><div class="hint">' +
    esc(isSingleHead ? d.head.name + ' · ' : '') + esc(periodText()) + ' · Printed by ' + esc(whoAmI()) + '</div>';

  if (isSingleHead) {
    var c = d.totals.closing, lr = ledgerRows(d);
    html += '<div class="grid g4" style="margin-bottom:18px">' +
      '<div class="stat"><small>Opening balance</small><b>' + inr(d.opening) + '</b></div>' +
      '<div class="stat"><small>Credit (due)</small><b>' + inr(d.totals.credit) + '</b></div>' +
      '<div class="stat good"><small>Debit (paid + adjusted)</small><b>' + inr(d.totals.debit) + '</b></div>' +
      '<div class="stat warn"><small>' + (c < 0 ? 'Paid in advance' : 'Closing balance (due)') + '</small><b>' + inr(Math.abs(c)) + '</b></div></div>';
    html += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div><h2>' + esc(d.head.name) + '</h2><p class="sub" style="margin-bottom:0">' + esc(periodText()) + ' · newest first</p></div>' +
      '<button class="btn ghost sm no-print" type="button" data-act="ledger-all-heads">← All heads summary</button></div>' +
      (d.truncated ? '<div class="banner">Showing the first 3,000 rows. Narrow the dates to see the rest.</div>' : '') +
      '<div class="tw"><table><thead><tr><th>Sr. No.</th><th>Date</th><th>Description</th><th class="n">Opening Balance</th><th class="n">Credit (Due)</th><th class="n">Debit (Paid)</th><th class="n">Closing Balance</th><th>Advised by</th><th>Entry made by</th><th>Remarks</th></tr></thead><tbody>' +
      (lr.length ? lr.map(function (x) {
        var r = x.r, sm = detailLine(r);
        return '<tr' + (x.rev ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(r.voucherNo) + '</b></td>' +
          '<td>' + esc(fmtD(r.entryDate)) + '<span class="sm-t">' + esc(fmtT(r.entryDate)) + '</span></td>' +
          '<td>' + esc(descOf(r)) + (r.forMonth ? '<span class="sm-t">' + esc(monthLabel(r.forMonth)) + '</span>' : '') + (sm ? '<span class="sm-t">' + esc(sm) + '</span>' : '') + (r.type === 'adjustment' ? '<span class="sm-t">Non-cash adjustment</span>' : '') + '</td>' +
          '<td class="n keep' + (x.open < 0 ? ' neg' : '') + '">' + (x.rev ? '' : num(x.open)) + '</td>' +
          '<td class="n">' + (r.type === 'due' ? num(r.amount) : '') + '</td><td class="n">' + (r.type !== 'due' ? num(r.amount) : '') + '</td>' +
          '<td class="n keep' + (x.close < 0 ? ' neg' : '') + '"><b>' + (x.rev ? '' : num(x.close)) + '</b></td>' +
          '<td>' + esc(r.advisedByName || '–') + '</td><td>' + who(r.enteredBy) + '</td>' +
          '<td class="keep">' + esc(r.remark || '') + (x.rev ? '<span class="sm-t" style="color:var(--red)">Reversed: ' + esc(r.reversedReason || '') + '</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="10"><div class="empty">No entries in this period.</div></td></tr>') +
      '<tr><td>–</td><td>' + esc(periodText().split(' to ')[0]) + '</td><td><b>Opening balance at the start</b></td><td class="n' + (d.opening < 0 ? ' neg' : '') + '"><b>' + num(d.opening) + '</b></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
      '</tbody><tfoot><tr><td colspan="3">Total for the period</td><td class="n">' + num(d.opening) + '</td><td class="n">' + num(d.totals.credit) + '</td><td class="n">' + num(d.totals.debit) + '</td><td class="n">' + num(c) + '</td><td colspan="3"></td></tr></tfoot></table></div></div>';
  } else if (S.ledView === 'head') {
    var list = Array.isArray(d) ? d : [];
    var totDue = 0, totPaid = 0, totAdj = 0, totSpent = 0, totBal = 0;
    list.forEach(function (r) {
      totDue = Math.round((totDue + r.due) * 100) / 100;
      totPaid = Math.round((totPaid + r.paid) * 100) / 100;
      totAdj = Math.round((totAdj + r.adjustment) * 100) / 100;
      totSpent = Math.round((totSpent + r.spent) * 100) / 100;
      totBal = Math.round((totBal + r.balance) * 100) / 100;
    });
    var canDrill = !!(S.me && S.me.allEntries);
    html += '<div class="card"><h2>Spend &amp; balance by head</h2><p class="sub">' + esc(periodText()) + '</p>' +
      (list.length ? '<div class="tw"><table><thead><tr><th>Head</th><th class="n">Due entered</th><th class="n">Paid</th><th class="n">Adjusted</th><th class="n">Total spent</th><th class="n">Period net (Due − Spent)</th>' + (canDrill ? '<th class="no-print"></th>' : '') + '</tr></thead><tbody>' +
        list.map(function (r) {
          return '<tr><td><b>' + esc(r.name) + '</b>' + (r.isActive ? '' : ' <span class="sm-t">inactive</span>') + '</td>' +
            '<td class="n">' + num(r.due) + '</td>' +
            '<td class="n">' + num(r.paid) + '</td>' +
            '<td class="n">' + num(r.adjustment) + '</td>' +
            '<td class="n"><b>' + num(r.spent) + '</b></td>' +
            '<td class="n' + (r.balance < 0 ? ' neg' : '') + '">' + num(r.balance) + '</td>' +
            (canDrill ? '<td class="keep no-print" style="text-align:right"><button class="btn ghost sm" type="button" data-act="open-head-ledger" data-id="' + esc(r.headId) + '">Full ledger</button></td>' : '') + '</tr>';
        }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="n">' + num(totDue) + '</td><td class="n">' + num(totPaid) + '</td><td class="n">' + num(totAdj) + '</td><td class="n">' + num(totSpent) + '</td><td class="n">' + num(totBal) + '</td>' + (canDrill ? '<td class="no-print"></td>' : '') + '</tr></tfoot></table></div>'
      : emptyBox('No entries in this period', 'Nothing has been recorded against any head yet.')) + '</div>';
  } else {
    html += (d.scope === 'mine' ? '<div class="banner">Showing only the entries you made yourself.</div>' : '') +
      '<div class="card"><h2>Cash book</h2><p class="sub">Who recorded what. Reversed entries are not counted. ' + esc(periodText()) + '</p>' +
      (d.groups.length ? '<div class="tw"><table><thead><tr><th>Recorded by</th><th class="n">Entries</th><th class="n">Paid</th><th class="n">Adjusted</th><th class="n">Dues entered</th><th class="n">Cash</th><th class="n">Bank</th><th class="n">UPI</th><th class="n">Cheque / other</th><th class="n">Reversed</th><th class="no-print"></th></tr></thead><tbody>' +
        d.groups.map(function (g) {
          var gName = g.kind === 'system' ? 'Admin' : g.name;
          var gSub = (g.kind === 'admin' || g.kind === 'system') ? 'Auto rule' : esc(g.designation || 'Staff');
          return '<tr><td class="keep"><b>' + esc(gName) + '</b><span class="sm-t">' + gSub + '</span></td><td class="n">' + g.entries + '</td><td class="n"><b>' + num(g.paid) + '</b></td><td class="n">' + num(g.adjustment) + '</td><td class="n">' + num(g.due) + '</td>' +
            '<td class="n">' + num(g.byMode.cash) + '</td><td class="n">' + num(g.byMode.bank) + '</td><td class="n">' + num(g.byMode.upi) + '</td><td class="n">' + num(g.byMode.cheque + g.byMode.other) + '</td><td class="n">' + g.reversed + '</td>' +
            '<td class="keep no-print"><button class="btn ghost sm" type="button" data-act="cash-drill" data-key="' + esc(g.key) + '">View entries</button></td></tr>';
        }).join('') + '</tbody></table></div>' : emptyBox('No entries in this period', 'Entries you record will be grouped by who made them.')) +
      '</div><div id="cash-detail" style="margin-top:18px"></div>';
  }
  $('led-body').innerHTML = html;
}

function cashDrill(key) {
  var p = { from: $('l-from').value, to: $('l-to').value, limit: 200, enteredBy: key === 'admin' ? 'admin' : key };
  aGet('/entries', p).then(function (r) {
    var rows = r.data || [];
    $('cash-detail').innerHTML = '<div class="card"><h2>Entries</h2><p class="sub">' + rows.length + (r.pagination.totalRecords > rows.length ? ' of ' + r.pagination.totalRecords : '') + ' shown, newest first.</p><div class="tw"><table><thead><tr><th>Sr. No.</th><th>Date</th><th>Head</th><th>Description</th><th>Type</th><th class="n">Amount</th><th>Advised by</th><th>Remarks</th></tr></thead><tbody>' +
      rows.map(function (e) {
        return '<tr' + (e.status === 'reversed' ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(e.voucherNo) + '</b></td><td>' + esc(fmtD(e.entryDate)) + '<span class="sm-t">' + esc(fmtT(e.entryDate)) + '</span></td><td>' + esc(e.headName) + '</td><td>' + esc(descOf(e)) + '</td><td class="keep"><span class="pill ' + esc(e.type) + '">' + esc(typeLabel(e.type)) + '</span></td><td class="n">' + num(e.amount) + '</td><td>' + esc(e.advisedByName || '–') + '</td><td>' + esc(e.remark || '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('cash-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }).catch(function (e) { toast(errMsg(e), 'error'); });
}

/* ---- print + Excel ---- */
function printLedger() {
  var panel = $('tab4');
  panel.classList.add('printing');
  var done = function () { panel.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

function printDue() {
  var panel = $('tab2');
  if ($('due-print-head')) {
    $('due-print-head').innerHTML = '<h2 style="font-size:18px">Expenses due · ' + esc(monthLabel(S.dueMonth)) + '</h2><div class="hint">Printed by ' + esc(whoAmI()) + ' on ' + esc(fmtDT(new Date())) + '</div>';
  }
  panel.classList.add('printing');
  var done = function () { panel.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

function safeCell(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}
function download(name, buf) {
  var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

function needExcel() {
  if (typeof ExcelJS === 'undefined') { toast('The Excel library did not load. Check your internet connection and reload.', 'error'); return false; }
  return true;
}
function headerRows(ws, title, period) {
  ws.addRow([title]); ws.addRow(['Period', period]); ws.addRow(['Generated by', whoAmI()]); ws.addRow(['Generated on', fmtDT(new Date())]); ws.addRow([]);
  ws.getRow(1).font = { bold: true, size: 14 };
}
function boldHeader(ws, rowNo, widths) {
  ws.getRow(rowNo).font = { bold: true };
  widths.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
}
function saveWorkbook(wb, name) {
  return wb.xlsx.writeBuffer().then(function (buf) { download(name, buf); toast('Report downloaded'); })
    .catch(function () { toast('Could not create the Excel file', 'error'); });
}

function exportExcel() {
  var d = S.ledData;
  if (!d) { toast('Nothing to export yet', 'error'); return; }
  if (!needExcel()) return;
  var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Ledger'), label;
  if (S.ledView === 'head' && d.head) {
    headerRows(ws, d.head.name + ' · ledger', periodText());
    ws.addRow(['Sr. No.', 'Date', 'Description', 'For Month', 'Opening Balance', 'Credit (Due)', 'Debit (Paid)', 'Closing Balance', 'Advised by', 'Entry made by', 'Remarks', 'Status']);
    ledgerRows(d).forEach(function (x) {
      var r = x.r;
      ws.addRow([r.voucherNo, fmtD(r.entryDate) + ' ' + fmtT(r.entryDate), safeCell(descOf(r)), r.forMonth ? monthLabel(r.forMonth) : '', x.rev ? '' : x.open,
        r.type === 'due' ? r.amount : '', r.type !== 'due' ? r.amount : '', x.rev ? '' : x.close,
        safeCell(r.advisedByName || ''), safeCell(r.enteredBy.kind === 'system' ? 'Admin' : r.enteredBy.name), safeCell(r.remark || ''), x.rev ? 'Reversed' : '']);
    });
    ws.addRow(['', '', 'Opening balance at the start', '', d.opening]);
    ws.addRow(['', '', 'Total for the period', '', d.opening, d.totals.credit, d.totals.debit, d.totals.closing]);
    boldHeader(ws, 6, [14, 20, 36, 16, 16, 14, 14, 16, 18, 20, 30, 10]);
    label = d.head.name.replace(/[^a-z0-9]+/gi, '-');
  } else if (S.ledView === 'cash') {
    headerRows(ws, 'Cash book', periodText());
    ws.addRow(['Recorded by', 'Role', 'Entries', 'Paid', 'Adjusted', 'Dues entered', 'Cash', 'Bank', 'UPI', 'Cheque / other', 'Reversed']);
    d.groups.forEach(function (g) {
      ws.addRow([safeCell(g.kind === 'system' ? 'Admin' : g.name), (g.kind === 'admin' || g.kind === 'system') ? 'Auto rule' : safeCell(g.designation || 'Staff'), g.entries, g.paid, g.adjustment, g.due, g.byMode.cash, g.byMode.bank, g.byMode.upi, g.byMode.cheque + g.byMode.other, g.reversed]);
    });
    boldHeader(ws, 6, [24, 18, 10, 14, 14, 14, 12, 12, 12, 14, 10]);
    label = 'cash-book';
  } else {
    headerRows(ws, 'Spend & balance by head', periodText());
    ws.addRow(['Head', 'Due entered', 'Paid', 'Adjusted', 'Total spent', 'Period net']);
    (Array.isArray(d) ? d : []).forEach(function (r) { ws.addRow([safeCell(r.name), r.due, r.paid, r.adjustment, r.spent, r.balance]); });
    boldHeader(ws, 6, [28, 14, 14, 14, 16, 16]);
    label = 'by-head';
  }
  saveWorkbook(wb, 'Expense-' + label + '-' + todayYmd() + '.xlsx');
}

function fetchAllEntries(params) {
  var all = [];
  function next(page) {
    return aGet('/entries', Object.assign({}, params, { page: page, limit: 200 })).then(function (r) {
      all = all.concat(r.data || []);
      var pages = (r.pagination && r.pagination.totalPages) || 1;
      if (page < pages && all.length < 5000) return next(page + 1);
      return { rows: all, scope: r.scope, truncated: page < pages };
    });
  }
  return next(1);
}

function exportEntriesReport() {
  if (!needExcel()) return;
  var btn = $('e-report');
  setBtnLoading(btn, true, 'Preparing…');
  fetchAllEntries(entFilters()).then(function (res) {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Expenses');
    headerRows(ws, 'Expense entries', entPeriodText());
    if (res.scope === 'mine') ws.addRow(['Note', 'Only entries made by ' + whoAmI()]);
    if (res.truncated) ws.addRow(['Note', 'Only the newest 5,000 entries are included. Narrow the dates for the rest.']);
    var hdr = ws.addRow(['Sr. No.', 'Date', 'Time', 'Head', 'Description', 'Type', 'Amount', 'Advised by', 'Entered by', 'Mode', 'Bill / Txn no.', 'Remarks', 'Status']);
    hdr.font = { bold: true };
    var tot = { paid: 0, adjustment: 0, due: 0 };
    res.rows.forEach(function (e) {
      var rev = e.status === 'reversed';
      if (!rev) tot[e.type] = Math.round((tot[e.type] + e.amount) * 100) / 100;
      ws.addRow([e.voucherNo, fmtD(e.entryDate), fmtT(e.entryDate), safeCell(e.headName), safeCell(descOf(e)), typeLabel(e.type), e.amount,
        safeCell(e.advisedByName || ''), safeCell(e.enteredBy.kind === 'system' ? 'Admin' : e.enteredBy.name), e.mode ? e.mode.toUpperCase() : '', safeCell(e.reference || ''), safeCell(e.remark || ''), rev ? 'Reversed' : 'Active']);
    });
    ws.addRow([]);
    ws.addRow(['', '', '', '', 'Total paid', '', tot.paid]);
    ws.addRow(['', '', '', '', 'Total adjusted', '', tot.adjustment]);
    ws.addRow(['', '', '', '', 'Total dues entered', '', tot.due]);
    [14, 14, 11, 22, 36, 12, 12, 18, 20, 9, 16, 28, 10].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    return saveWorkbook(wb, 'Expenses-' + (entFilters().from || 'all') + '-to-' + (entFilters().to || 'all') + '.xlsx');
  }).catch(function (e) { toast(errMsg(e), 'error'); })
    .then(function () { setBtnLoading(btn, false); });
}

function exportDueReport() {
  if (!needExcel()) return;
  var only = $('due-head').value;
  var dq = ($('due-q') ? $('due-q').value : '').trim().toLowerCase();
  var rows = S.dueRows.filter(function (r) {
    if (only && String(r.headId) !== only) return false;
    if (dq) {
      var itemsTxt = (r.dueItems || []).map(function (it) { return it.description; }).join(' ');
      if ((r.name + ' ' + itemsTxt).toLowerCase().indexOf(dq) < 0) return false;
    }
    return true;
  });
  if (!rows.length) { toast('There is nothing to export for this month', 'error'); return; }

  var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Expenses due');
  headerRows(ws, 'Expenses due · ' + monthLabel(S.dueMonth), monthLabel(S.dueMonth));
  ws.addRow(['Head', 'Month Due Items', 'Previous balance', 'Due', 'Paid', 'Balance', 'Status']).font = { bold: true };

  var t = { prev: 0, due: 0, paid: 0, bal: 0 };
  rows.forEach(function (r) {
    var itemsSummary = (r.dueItems || []).map(function (it) { return it.description + ' (' + num(it.amount) + ')'; }).join('; ');
    ws.addRow([safeCell(r.name), safeCell(itemsSummary), r.previous, r.monthDue, r.monthPaid, r.closing, STATUS_TXT[r.status] || r.status]);
    t.prev = Math.round((t.prev + r.previous) * 100) / 100;
    t.due = Math.round((t.due + r.monthDue) * 100) / 100;
    t.paid = Math.round((t.paid + r.monthPaid) * 100) / 100;
    t.bal = Math.round((t.bal + r.closing) * 100) / 100;
  });

  ws.addRow([]);
  ws.addRow(['Total', '', t.prev, t.due, t.paid, t.bal, '']).font = { bold: true };
  [24, 42, 16, 14, 14, 14, 16].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
  saveWorkbook(wb, 'Expenses-Due-' + S.dueMonth + '.xlsx');
}

function printEntries() {
  var panel = $('tab3');
  $('e-print-head').innerHTML = '<h2 style="font-size:18px">Expense entries</h2><div class="hint">' + esc(entPeriodText()) + ' · Printed by ' + esc(whoAmI()) + '</div>';
  panel.classList.add('printing');
  var done = function () { panel.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/* ---- Expenses Due: quick month buttons ---- */
function lastMonthStr() {
  var m = thisMonth(), y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1;
  if (mo === 0) { y -= 1; mo = 12; }
  return y + '-' + (mo < 10 ? '0' : '') + mo;
}
function nextMonthStr() {
  var m = thisMonth(), y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) + 1;
  if (mo === 13) { y += 1; mo = 1; }
  return y + '-' + (mo < 10 ? '0' : '') + mo;
}
function syncDuePresets() {
  var btns = document.querySelectorAll('#due-presets button');
  for (var i = 0; i < btns.length; i++) {
    var p = btns[i].dataset.preset;
    var on = (p === 'this' && S.dueMonth === thisMonth()) ||
             (p === 'last' && S.dueMonth === lastMonthStr()) ||
             (p === 'next' && S.dueMonth === nextMonthStr());
    btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
function setDueMonth(which) {
  S.dueMonth = which === 'last' ? lastMonthStr() : which === 'next' ? nextMonthStr() : thisMonth();
  $('due-month').value = S.dueMonth; syncDuePresets(); loadDue();
}

/* ═══════════════════════════════════════════════════════════════
   RECEIPT MODAL
═══════════════════════════════════════════════════════════════ */
var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigitWords(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
function threeDigitWords(n) {
  var out = [], h = Math.floor(n / 100), r = n % 100;
  if (h) out.push(ONES[h] + ' Hundred');
  if (r) out.push(twoDigitWords(r));
  return out.join(' ');
}
function wholeWords(n) {
  var parts = [], crore = Math.floor(n / 10000000); n %= 10000000;
  var lakh = Math.floor(n / 100000); n %= 100000;
  var thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(threeDigitWords(crore) + ' Crore');
  if (lakh) parts.push(twoDigitWords(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigitWords(thousand) + ' Thousand');
  if (n) parts.push(threeDigitWords(n));
  return parts.join(' ');
}
function amountInWords(amount) {
  var total = Math.round(Math.abs(Number(amount) || 0) * 100);
  var rupees = Math.floor(total / 100), paise = total % 100, out = [];
  if (rupees) out.push(wholeWords(rupees) + (rupees === 1 ? ' Rupee' : ' Rupees'));
  if (paise) out.push(twoDigitWords(paise) + ' Paise');
  return out.length ? out.join(' and ') + ' Only' : 'Zero Rupees Only';
}

function closeReceipt() {
  var ov = document.querySelector('.rc-ov');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  document.body.classList.remove('has-receipt');
  document.removeEventListener('keydown', receiptKey);
}
function receiptKey(e) { if (e.key === 'Escape') closeReceipt(); }

function showReceipt(id) {
  aGet('/entries/' + id + '/receipt').then(function (r) { renderReceipt(r.data); })
    .catch(function (e) { toast(errMsg(e), 'error'); });
}

function renderReceipt(d) {
  closeReceipt();
  var e = d.entry, inst = d.institution, adj = e.type === 'adjustment', rev = e.status === 'reversed';
  var balLine = '';
  if (d.balanceAfter !== null && d.balanceAfter !== undefined) {
    balLine = d.balanceAfter > 0
      ? inr(d.balanceAfter) + ' still due under ' + e.headName
      : d.balanceAfter < 0
        ? inr(Math.abs(d.balanceAfter)) + ' advance paid under ' + e.headName
        : e.headName + ' account settled';
  }
  function row(k, v) { return v ? '<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>' : ''; }
  var html = '<div class="rc-ov"><div class="rc-wrap" role="dialog" aria-modal="true" aria-label="Receipt">' +
    '<div class="rc-actions"><button class="btn ghost" type="button" id="rc-close">Close</button><button class="btn" type="button" id="rc-print">Print receipt</button></div>' +
    '<div class="rc-sheet">' +
      '<div class="rc-head"><h2>' + esc(inst.name) + '</h2>' + (inst.address ? '<small>' + esc(inst.address) + '</small>' : '') + (inst.mobile ? '<small>Phone: ' + esc(inst.mobile) + '</small>' : '') + '</div>' +
      '<div class="rc-title">' + (adj ? 'Non-cash adjustment voucher' : 'Payment voucher / receipt') + '<span>No. ' + esc(e.voucherNo) + '<br>' + esc(fmtDT(e.entryDate)) + '</span></div>' +
      (rev ? '<div class="rc-void">REVERSED, NOT VALID' + (e.reversedReason ? '. Reason: ' + esc(e.reversedReason) : '') + '</div>' : '') +
      '<table class="rc-table">' +
        row('Head', '<b>' + esc(e.headName) + '</b>') +
        row('Description', esc(descOf(e))) +
        row('Amount', '<span class="rc-amt">' + esc(inr(e.amount)) + '</span>') +
        row('Amount in words', esc(amountInWords(e.amount))) +
        row(adj ? '' : 'Payment mode', e.mode ? esc(e.mode.toUpperCase()) + (e.reference ? ' · ' + esc(e.reference) : '') : '') +
        row(e.mode ? '' : 'Reference', !e.mode && e.reference ? esc(e.reference) : '') +
        row('Advised by', esc(e.advisedByName || '')) +
        row('Entered by', esc(e.enteredBy.name) + (e.enteredBy.kind === 'admin' ? ' (Owner)' : (e.enteredBy.designation ? ' (' + esc(e.enteredBy.designation) + ')' : ''))) +
        row('Remarks', esc(e.remark || '')) +
        row('Head balance after this', esc(balLine)) +
      '</table>' +
      '<div class="rc-sign"><div>Entered / Paid by<small>' + esc(e.enteredBy.name) + '</small></div><div>Approved / Advised by<small>' + esc(e.advisedByName || '') + '</small></div></div>' +
      '<div class="rc-foot">Computer generated on ' + esc(fmtDT(new Date())) + ' by ' + esc(whoAmI()) + '</div>' +
    '</div></div></div>';
  var holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.appendChild(holder.firstChild);
  document.body.classList.add('has-receipt');
  document.getElementById('rc-close').onclick = closeReceipt;
  document.getElementById('rc-print').onclick = function () { window.print(); };
  document.querySelector('.rc-ov').addEventListener('click', function (ev) { if (ev.target === ev.currentTarget) closeReceipt(); });
  document.addEventListener('keydown', receiptKey);
  setTimeout(function () { var b = document.getElementById('rc-print'); if (b) b.focus(); }, 30);
}

/* ═══════════════════════════════════════════════════════════════
   GUIDED TOUR
═══════════════════════════════════════════════════════════════ */
var TOUR_STEPS = [
  { tab: 0, title: 'Welcome to Expense Management', text: 'This quick tour shows how everything works in 3 simple rules:\n• Due = scheduled or one-time bills under an Expense Head.\n• Paid = money you have paid out.\n• Balance = Due − Paid. Any remaining balance carries forward automatically.' },
  { tab: -1, target: '#tabs', title: 'Your tabs, left to right', text: function () {
    var names = { 1: 'Expense Heads (set up Heads & Advised by)', 2: 'Expenses Due (track monthly bills & auto schedules)', 3: 'Expenses Paid (record every payment & receipt)', 4: 'Ledger (head statements & cash book)' };
    return allowedTabs().map(function (i) { return '• ' + names[i]; }).join('\n'); } },

  { tab: 1, sub: 'heads', target: '#head-form', title: 'Expense Heads: what you spend on', text: 'Heads are your expense categories, such as Salary, Installment, Diesel, Electricity, or Rent. Create each head once and track all dues and payments directly under it.' },
  { tab: 1, sub: 'adv', target: '#t1-adv', title: 'Advised by: who approved', text: 'List the people who approve payments, such as Principal, Manager, or Director.\nOnce added, selecting one is required when recording payments so you always know who approved it.' },

  { tab: 2, target: '#due-add-onetime', title: 'One-time vs Automatic dues', text: 'Use “+ Add due (One-time)” for single bills, or “+ Add due (Automatic)” to set recurring monthly rules (for example, 4 separate bus installments under the Installment head).' },
  { tab: 2, target: '#due-stats', title: 'The month at a glance', text: 'These four cards show total dues for the month, total paid, remaining balance to pay, and any advance paid.' },
  { tab: 2, target: '#due-table', title: 'Month position by head', text: 'Previous balance + Due − Paid = Balance. Each row shows the itemized dues for the month—click Pay on any item or head to record a payment immediately.' },
  { tab: 2, target: '#t2-schedules-card', title: 'Automatic monthly schedules', text: 'All your active recurring rules appear here. Dues are generated automatically on their scheduled date every month, and you can edit, pause, or remove rules anytime.' },

  { tab: 3, sub: 'add', target: '#pay-type', title: 'Two kinds of entry', text: 'Use “Cash / bank payment” when money goes out.\nUse “Non-cash adjustment” when reducing a due balance without cash moving (e.g., fee concessions or adjustments).' },
  { tab: 3, sub: 'add', target: '#p-head', title: 'Select Head, Amount & Description', text: 'Pick the Head, enter the amount and description (e.g. “Bus 0899 installment”), and choose who advised it. You can also attach a bill photo under More options.' },
  { tab: 3, sub: 'add', target: '.autobox', title: 'Date, time and your name: automatic', text: 'Date, time, and your login name are stamped automatically on every entry for complete accountability.' },
  { tab: 3, sub: 'list', target: '#e-presets', title: 'Payment list & filters', text: 'Filter entries by date presets, Head, type, or staff member, or export everything to Excel.' },
  { tab: 3, sub: 'list', target: '#ent-table', prep: 'showSomeEntries', title: 'Receipt, Bill photo, History & Reverse', text: 'Print vouchers, view attached bill photos, check edit history, or reverse mistaken entries without ever losing the audit trail.' },

  { tab: 4, target: '#led-view', title: 'Head Ledger & Cash Book', text: 'By head: view spending across all heads or open a full running-balance statement for any specific head.\nCash book: see totals grouped by who entered them.' },
  { tab: 4, target: '#l-export', title: 'Print or export to Excel', text: 'Select any date range and print or download clean Excel reports.' }
];

var T = null;
function tourKey() { return 'expenseTourSeenV2:' + (S.me ? S.me.userKey : 'x'); }
function tourMarkSeen() { try { localStorage.setItem(tourKey(), '1'); } catch (e) {} }
function currentTab() { for (var i = 1; i <= 4; i++) { var el = $('tab' + i); if (el && !el.hidden) return i; } return 0; }
function tourStepsFor(scope) {
  return TOUR_STEPS.filter(function (st) {
    if (scope === 'all') return st.tab <= 0 || can(st.tab);
    return st.tab === scope && can(st.tab);
  });
}

function tourStart(scope) {
  closeReceipt(); tourEnd(false);
  var steps = tourStepsFor(scope);
  if (!steps.length) { toast('Nothing to show here yet', 'error'); return; }
  T = { steps: steps, i: 0, scope: scope, back: currentTab() };
  var root = document.createElement('div');
  root.className = 'tour-root'; root.id = 'tour-root';
  root.innerHTML = '<div class="tour-dim" id="tour-dim"></div><div class="tour-hl" id="tour-hl" hidden></div>' +
    '<div class="tour-tip" id="tour-tip" role="dialog" aria-modal="true" aria-labelledby="tour-title"></div>';
  document.body.appendChild(root);
  document.addEventListener('keydown', tourKeys);
  tourShow();
}

function tourEnd(markSeen) {
  var root = document.getElementById('tour-root');
  if (root && root.parentNode) root.parentNode.removeChild(root);
  document.removeEventListener('keydown', tourKeys);
  if (T && markSeen !== false) tourMarkSeen();
  if (T && T.saved) { $('e-from').value = T.saved.from; $('e-to').value = T.saved.to; markPreset(T.saved.preset); loadEntries(1); }
  if (T && T.back && currentTab() !== T.back) switchTab(T.back);
  T = null;
}

function tourKeys(e) {
  if (!T) return;
  if (e.key === 'Escape') tourEnd(true);
  else if (e.key === 'ArrowRight') tourGo(1);
  else if (e.key === 'ArrowLeft') tourGo(-1);
}
function tourGo(d) {
  if (!T) return;
  var n = T.i + d;
  if (n >= T.steps.length) { tourEnd(true); return; }
  if (n < 0) return;
  T.i = n; tourShow();
}

function tourShow() {
  var st = T.steps[T.i];
  if (st.tab > 0 && currentTab() !== st.tab) switchTab(st.tab);
  if (st.sub) setSub(st.tab === 1 ? 't1' : 't3', st.sub);
  if (st.prep === 'showSomeEntries') tourShowSomeEntries();
  var text = typeof st.text === 'function' ? st.text() : st.text;
  var last = T.i === T.steps.length - 1;
  var tip = document.getElementById('tour-tip');
  tip.innerHTML = '<div class="tour-step">Step ' + (T.i + 1) + ' of ' + T.steps.length + '</div>' +
    '<h3 id="tour-title">' + esc(st.title) + '</h3><p>' + esc(text).replace(/\n/g, '<br>') + '</p>' +
    '<div class="tour-acts"><button class="btn ghost sm" type="button" id="tour-skip">' + (last ? 'Close' : 'Skip tour') + '</button>' +
    '<span class="grp">' + (T.i > 0 ? '<button class="btn ghost sm" type="button" id="tour-back">Back</button>' : '') +
    '<button class="btn sm" type="button" id="tour-next">' + (last ? 'Done' : 'Next') + '</button></span></div>';
  document.getElementById('tour-skip').onclick = function () { tourEnd(true); };
  document.getElementById('tour-next').onclick = function () { tourGo(1); };
  var back = document.getElementById('tour-back'); if (back) back.onclick = function () { tourGo(-1); };
  tourCenter(tip); document.getElementById('tour-hl').hidden = true;
  setTimeout(function () { if (T && T.steps[T.i] === st) tourPlace(st); }, 220);
  setTimeout(function () { if (T && T.steps[T.i] === st) tourPlace(st); }, 900);
  setTimeout(function () { var nb = document.getElementById('tour-next'); if (nb) nb.focus(); }, 30);
}

function tourCenter(tip) {
  tip.className = 'tour-tip center';
  tip.style.top = ''; tip.style.left = ''; tip.style.transform = '';
}

function tourShowSomeEntries() {
  if (S.entRows && S.entRows.length) return;
  if (!T.saved) T.saved = { preset: S.preset, from: $('e-from').value, to: $('e-to').value };
  applyPreset('all');
}

function tourPlace(st) {
  var tip = document.getElementById('tour-tip'), hl = document.getElementById('tour-hl');
  if (!tip || !hl) return;
  var el = st.target ? document.querySelector(st.target) : null;
  if (!el || !el.getClientRects().length) { tourCenter(tip); hl.hidden = true; return; }
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  var r = el.getBoundingClientRect(), pad = 6;
  hl.hidden = false;
  hl.style.top = (r.top - pad) + 'px'; hl.style.left = (r.left - pad) + 'px';
  hl.style.width = (r.width + pad * 2) + 'px'; hl.style.height = (r.height + pad * 2) + 'px';
  tip.className = 'tour-tip';
  var th = tip.offsetHeight || 190, tw = tip.offsetWidth || 380, vh = window.innerHeight, vw = window.innerWidth;
  var top;
  if (vh - (r.bottom + pad) >= th + 18) top = r.bottom + pad + 12;
  else if (r.top - pad >= th + 18) top = r.top - pad - th - 12;
  else top = Math.max(12, vh - th - 12);
  var left = Math.min(Math.max(12, r.left), Math.max(12, vw - tw - 12));
  tip.style.top = top + 'px'; tip.style.left = left + 'px'; tip.style.transform = 'none';
}

function maybeOfferTour() {
  var seen = null;
  try { seen = localStorage.getItem(tourKey()); } catch (e) {}
  if (!S.me || seen) return;
  askConfirm('Welcome to Expense Management', 'New here? Take a quick 1-minute tour that shows how each tab works. You can open it again any time with the “? Tour” button at the top.', 'Start the tour', 'Not now')
    .then(function (yes) { tourMarkSeen(); if (yes) tourStart('all'); });
}

/* ---- delete ---- */
function deleteItem(kind, id) {
  var cfg = {
    head: { list: S.headsAll,    path: '/heads/',    word: 'head' },
    adv:  { list: S.advisorsAll, path: '/advisors/', word: 'name' }
  }[kind];
  var item = byId(cfg.list, id); if (!item) return;

  var title = 'Delete this ' + cfg.word + '?';
  var msg = '“' + item.name + '” will be removed for good. You can only delete it because nothing has been recorded against it.';

  if (kind === 'head') {
    var entries = Number(item.entryCount || item.entriesCount || 0);
    var rules = Number(item.scheduleCount || item.schedulesCount || 0);
    if (entries > 0 || rules > 0) {
      title = 'Delete “' + item.name + '” and wipe all its data?';
      msg = 'Warning: This will permanently delete the “' + item.name + '” head along with all ' +
        entries + ' recorded entr' + (entries === 1 ? 'y' : 'ies') +
        (rules > 0 ? ' and ' + rules + ' auto rule' + (rules === 1 ? '' : 's') : '') +
        ' under it from Expenses Due, Expenses Paid, and Ledger. This action cannot be undone.';
    } else {
      msg = '“' + item.name + '” will be permanently deleted.';
    }
  } else if (kind === 'adv') {
    var advEntries = Number(item.entryCount || item.entriesCount || 0);
    if (advEntries > 0) {
      title = 'Delete “' + item.name + '” from Advised by?';
      msg = 'Warning: “' + item.name + '” is linked to ' + advEntries + ' recorded entr' + (advEntries === 1 ? 'y' : 'ies') +
        '. Deleting it will permanently remove this name from the Advised-by list, while existing payment entries and balances will remain intact. This action cannot be undone.';
    } else {
      msg = '“' + item.name + '” will be permanently deleted from the Advised-by list.';
    }
  }

  askConfirm(title, msg, kind === 'head' ? 'Delete & Wipe Data' : 'Delete')
    .then(function (yes) {
      if (!yes) return;
      return getDeleteCode().then(function (code) {
        return aDel(cfg.path + id, code);
      }).catch(function (err) { codeFailed(err); throw err; })
        .then(function () { toast(kind === 'head' ? 'Head and all related data deleted' : 'Deleted'); return reloadTab1(); });
    }).catch(function (e) { if (e && e.message !== 'Cancelled') toast(errMsg(e), 'error'); });
}

/* ---- sub-tabs inside Tab 1 and Tab 3 ---- */
var SUBS = {
  t1: { heads: 't1-heads', adv: 't1-adv' },
  t3: { add: 't3-add', list: 't3-list' }
};
function setSub(group, name) {
  var map = SUBS[group]; if (!map || !map[name]) return;
  Object.keys(map).forEach(function (k) { $(map[k]).hidden = k !== name; });
  var btns = document.querySelectorAll('#' + group + '-subtabs button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-selected', btns[i].dataset.sub === name ? 'true' : 'false');
}

var ACTIONS = {
  'receipt': function (el) { showReceipt(el.dataset.id); },
  'view-bill': function (el) { showBillImage(el.dataset.id); },
  'clear-att': function () { clearAttachment(); },
  'delete-head': function (el) { deleteItem('head', el.dataset.id); },
  'delete-adv': function (el) { deleteItem('adv', el.dataset.id); },
  'edit-head': function (el) { editHead(el.dataset.id); },
  'toggle-head': function (el) { toggleHead(el.dataset.id); },
  'suggest-head': function (el) { createHead(el.dataset.name).catch(function (e) { toast(errMsg(e), 'error'); }); },
  'edit-schedule': function (el) { editSchedule(el.dataset.id); },
  'toggle-schedule': function (el) { toggleSchedule(el.dataset.id); },
  'delete-schedule': function (el) { deleteSchedule(el.dataset.id); },
  'edit-adv': function (el) { editAdvisor(el.dataset.id); },
  'toggle-adv': function (el) { toggleAdvisor(el.dataset.id); },
  'quick-due-head': function (el) { openOneTimeDueModal(el.dataset.id); },
  'pay-head': function (el) {
    setPayType('paid'); switchTab(3); setSub('t3', 'add');
    setTimeout(function () {
      $('p-head').value = el.dataset.id;
      if (el.dataset.bal) $('p-amount').value = el.dataset.bal;
      syncPayForm();
      ($('p-amount').value ? $('p-desc') : $('p-amount')).focus();
    }, 200);
  },
  'pay-item': function (el) {
    setPayType('paid'); switchTab(3); setSub('t3', 'add');
    setTimeout(function () {
      $('p-head').value = el.dataset.head;
      $('p-amount').value = el.dataset.amt || '';
      $('p-desc').value = el.dataset.desc || '';
      syncPayForm();
      ($('p-adv').disabled ? $('p-remark') : $('p-adv')).focus();
    }, 200);
  },
  'open-head-ledger': function (el) {
    switchTab(4);
    setTimeout(function () {
      S.ledView = 'head';
      $('l-head').value = el.dataset.id;
      setLedView('head');
    }, 150);
  },
  'ledger-all-heads': function () {
    $('l-head').value = '';
    loadLedger();
  },
  'audit': function (el) { showAudit(el.dataset.id); },
  'edit-entry': function (el) { editEntry(el.dataset.id); },
  'reverse-entry': function (el) { reverseEntry(el.dataset.id); },
  'ent-prev': function () { if (S.ent.page > 1) loadEntries(S.ent.page - 1); },
  'ent-next': function () { if (S.ent.page < S.ent.pages) loadEntries(S.ent.page + 1); },
  'cash-drill': function (el) { cashDrill(el.dataset.key); }
};

function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

function wireEvents() {
  [].forEach.call(document.querySelectorAll('.xtab'), function (b) {
    b.addEventListener('click', function () { switchTab(Number(b.dataset.tab)); });
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el);
  });

  $('btn-tour').addEventListener('click', function () { tourStart('all'); });

  ['t1', 't3'].forEach(function (g) {
    $(g + '-subtabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sub]');
      if (b) setSub(g, b.dataset.sub);
    });
  });

  // tab 1
  $('head-form').addEventListener('submit', submitHead);
  if ($('head-search')) $('head-search').addEventListener('input', renderHeads);
  $('head-inactive').addEventListener('change', renderHeads);
  $('adv-form').addEventListener('submit', submitAdvisor);
  ensureAdvFilters();
  if ($('adv-search')) $('adv-search').addEventListener('input', renderAdvisors);
  if ($('adv-inactive')) $('adv-inactive').addEventListener('change', renderAdvisors);

  // tab 2
  $('due-month').addEventListener('change', function () { S.dueMonth = $('due-month').value || thisMonth(); syncDuePresets(); loadDue(); });
  $('due-presets').addEventListener('click', function (e) { var b = e.target.closest('button[data-preset]'); if (b) setDueMonth(b.dataset.preset); });
  $('due-report').addEventListener('click', exportDueReport);
  if ($('due-print')) $('due-print').addEventListener('click', printDue);
  $('due-head').addEventListener('change', function () { renderDue(); renderSchedulesTable(); });
  if ($('due-q')) $('due-q').addEventListener('input', function () { renderDue(); renderSchedulesTable(); });
  $('due-add-onetime').addEventListener('click', function () { openOneTimeDueModal(); });
  $('due-add-auto').addEventListener('click', function () { openAutoDueModal(); });

  // tab 3
  $('pay-type').addEventListener('click', function (e) { var b = e.target.closest('button[data-type]'); if (b) setPayType(b.dataset.type); });
  $('p-head').addEventListener('change', syncPayForm);
  $('p-amount').addEventListener('input', syncPayForm);
  if ($('p-att')) $('p-att').addEventListener('change', handleAttachmentChange);
  $('pay-form').addEventListener('submit', submitPayment);
  $('e-presets').addEventListener('click', function (e) { var b = e.target.closest('button[data-preset]'); if (b) applyPreset(b.dataset.preset); });
  ['e-from', 'e-to'].forEach(function (id) { $(id).addEventListener('change', function () { markPreset(''); loadEntries(1); }); });
  if ($('e-head')) $('e-head').addEventListener('change', function () { loadEntries(1); });
  $('e-type').addEventListener('change', function () { loadEntries(1); });
  if ($('e-by')) $('e-by').addEventListener('change', function () { loadEntries(1); });
  $('e-report').addEventListener('click', exportEntriesReport);
  $('e-print').addEventListener('click', printEntries);
  $('e-q').addEventListener('input', debounce(function () { loadEntries(1); }, 350));

  // tab 4
  $('led-view').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b && !b.disabled) setLedView(b.dataset.view); });
  ['l-head', 'l-from', 'l-to'].forEach(function (id) { $(id).addEventListener('change', loadLedger); });
  $('l-print').addEventListener('click', printLedger);
  $('l-export').addEventListener('click', exportExcel);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();