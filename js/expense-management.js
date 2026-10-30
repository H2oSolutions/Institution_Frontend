'use strict';
// expense-management.js - Expense Management (owner + staff)
//
// Tabs: 1 Heads/Payees/Advised-by · 2 Expenses Due · 3 Expenses Paid · 4 Ledger
// The server decides what each login may do (GET /expense/me); this page only
// shows what the server allows. Every dynamic string is escaped before it is
// put into HTML, and clicks go through one delegated handler (data-act).

var EXP = API_BASE_URL + '/expense';

var S = {
  me: null,
  headsAll: [], partiesAll: [], advisorsAll: [],
  heads: [], parties: [], advisors: [], staffOpts: [],
  partyMode: 'staff',
  payType: 'paid',
  ent: { page: 1, pages: 1, total: 0 },
  ledView: 'party', ledData: null,
  dueMonth: '', dueRows: [], dueTotals: null,
  entReq: 0, dueReq: 0, ledReq: 0     // newest request wins: a slow old answer must never overwrite a newer one
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
function fmtDT(d) { return fmtD(d) + ', ' + new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }); }
function monthLabel(m) {
  var p = String(m).split('-');
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][Number(p[1]) - 1] + ' ' + p[0];
}
function money(v) { // accepts "1,500" / " 12.5 " -> number or NaN
  var n = Number(String(v === undefined || v === null ? '' : v).replace(/[,\s₹]/g, ''));
  return isFinite(n) ? n : NaN;
}
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
function aPost(path, body) { return apiPost(EXP + path, body || {}, true); }
function aPut(path, body) { return apiPut(EXP + path, body || {}, true); }
function aDel(path) { return apiDelete(EXP + path, true); }

/* ──────────────────── delete-code (shared with Fee) ──────────────────── */
// Editing/reversing an entry needs the institution's edit/delete code when the
// owner has turned that protection on. Cached for 15 minutes like Fee does.
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
  if (e && (e.message === 'Incorrect code' || e.message === 'DELETE_CODE_REQUIRED')) _code = undefined;
}

/* ───────────────────────── generic form modal ───────────────────────── */
// fields: [{key,label,type,value,options:[{v,t}],hint,required,placeholder}]
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
      } else {
        html += '<input class="in" id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' +
          (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.max ? ' max="' + esc(f.max) + '"' : '') + (f.type === 'text' || !f.type ? ' maxlength="100"' : '') + '>';
      }
      if (f.hint) html += '<span class="hint">' + esc(f.hint) + '</span>';
      html += '</label>';
    });
    html += '</div><div class="hint" id="fm-err" style="color:var(--red);font-weight:700;min-height:18px" role="alert"></div>' +
      '<div class="acts"><button class="btn ghost" type="button" id="fm-no">Cancel</button><button class="btn" type="submit" id="fm-ok">' + esc(saveLabel || 'Save') + '</button></div></form>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    var form = ov.firstChild, first = ov.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
    function close() { if (ov.parentNode) document.body.removeChild(ov); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') { close(); resolve(false); } }
    document.addEventListener('keydown', onKey);
    ov.querySelector('#fm-no').onclick = function () { close(); resolve(false); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = ov.querySelector('#fm-ok'), er = ov.querySelector('#fm-err');
      if (ok.disabled) return;          // already saving: ignore repeat submits
      var vals = {};
      fields.forEach(function (f) { vals[f.key] = ov.querySelector('#ff-' + f.key).value; });
      ok.disabled = true; er.textContent = '';
      // run inside a promise so a validation error thrown by onSave is shown in the modal, not lost
      Promise.resolve().then(function () { return onSave(vals); }).then(function () { close(); resolve(true); })
        .catch(function (err) { er.textContent = errMsg(err); ok.disabled = false; });
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
  S.parties = S.partiesAll.filter(function (p) { return p.isActive; });
  S.advisors = S.advisorsAll.filter(function (a) { return a.isActive; });
}
function loadLookups() {
  return Promise.all([
    aGet('/heads', { includeInactive: 'true' }).then(function (r) { S.headsAll = r.data || []; }),
    aGet('/parties', { withBalance: 'true', includeInactive: 'true' }).then(function (r) { S.partiesAll = r.data || []; }),
    aGet('/advisors', { includeInactive: 'true' }).then(function (r) { S.advisorsAll = r.data || []; })
  ]).then(deriveActive);
}

// Balances are the only list that changes when a payment is saved, edited or reversed,
// so those actions refresh just the payees instead of all three lists.
function refreshParties() {
  return aGet('/parties', { withBalance: 'true', includeInactive: 'true' }).then(function (r) { S.partiesAll = r.data || []; deriveActive(); });
}
// The page has just loaded the lists in boot(); the first tab that opens can reuse them.
function loadLookupsOnce() {
  if (S.preloaded) { S.preloaded = false; return Promise.resolve(); }
  return loadLookups();
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
  setInterval(function () { var w = $('p-when'); if (w && !$('t3-add').hidden && !$('tab3').hidden) w.textContent = fmtDT(new Date()); }, 30000);

  aGet('/me').then(function (r) {
    S.me = r.data;
    $('who-badge').textContent = (S.me.kind === 'admin' ? '👑 Owner login' : '👤 ' + S.me.name);
    var tabs = allowedTabs();
    if (!tabs.length) { showDenied('You do not have permission to use any Expense Management section. Please ask the administrator.'); return; }
    tabs.forEach(function (i) { $('tab' + i + '-btn').hidden = false; });
    return loadLookups().then(function () {
      $('loading').hidden = true;
      var start = tabs.indexOf(3) >= 0 ? 3 : tabs[0];
      if (!S.heads.length && tabs.indexOf(1) >= 0) start = 1;   // first visit: set things up first
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
   TAB 1 · HEADS, PAYEES, ADVISED-BY
═══════════════════════════════════════════════════════════════ */
var SUGGESTED_HEADS = [
  { name: 'Salary - Staff', type: 'payee' }, { name: 'Salary - Helpers', type: 'payee' },
  { name: 'Electricity', type: 'oneoff' }, { name: 'Repairs & Maintenance', type: 'oneoff' },
  { name: 'Stationery & Books', type: 'oneoff' }, { name: 'Events', type: 'oneoff' }
];

function can(tab) { return !!(S.me && S.me.perms && S.me.perms['tab' + tab]); }
function isOwner() { return !!(S.me && S.me.isOwner); }

function emptyBox(title, text) { return '<div class="empty"><b>' + esc(title) + '</b>' + esc(text) + '</div>'; }

function renderHeads() {
  var showOff = $('head-inactive').checked;
  var list = S.headsAll.filter(function (h) { return showOff || h.isActive; });
  $('head-list').innerHTML = list.length ? list.map(function (h) {
    return '<div class="li' + (h.isActive ? '' : ' off') + '"><div class="meta"><b>' + esc(h.name) + '</b>' +
      '<small>' + (h.type === 'payee' ? 'Payee ledger' : 'One-off') + ' · ' + h.entryCount + ' entr' + (h.entryCount === 1 ? 'y' : 'ies') + (h.isActive ? '' : ' · inactive') + '</small></div>' +
      '<div><button class="btn ghost sm" type="button" data-act="edit-head" data-id="' + esc(h._id) + '">Edit</button> ' +
      '<button class="btn ' + (h.isActive ? 'danger' : 'ghost') + ' sm" type="button" data-act="toggle-head" data-id="' + esc(h._id) + '">' + (h.isActive ? 'Deactivate' : 'Activate') + '</button>' +
      (h.entryCount === 0 ? ' <button class="btn danger sm" type="button" data-act="delete-head" data-id="' + esc(h._id) + '">Delete</button>' : '') + '</div></div>';
  }).join('') : emptyBox('No heads yet', 'Add your first head above, or tap a suggestion.');

  var have = {}; S.headsAll.forEach(function (h) { have[h.name.toLowerCase()] = 1; });
  var sugg = SUGGESTED_HEADS.filter(function (x) { return !have[x.name.toLowerCase()]; });
  $('head-suggest').innerHTML = sugg.length ? '<span class="hint" style="align-self:center">Quick add:</span>' + sugg.map(function (x) {
    return '<button class="chip-btn" type="button" data-act="suggest-head" data-name="' + esc(x.name) + '" data-type="' + x.type + '">+ ' + esc(x.name) + '</button>';
  }).join('') : '';
}

function headOptions(selected, withNone, noneLabel) {
  var o = withNone ? '<option value="">' + esc(noneLabel || '— none —') + '</option>' : '';
  return o + S.heads.map(function (h) {
    return '<option value="' + esc(h._id) + '"' + (String(h._id) === String(selected) ? ' selected' : '') + '>' + esc(h.name) + '</option>';
  }).join('');
}
function renderHeadSelects() { $('ps-head').innerHTML = headOptions('', true); $('pm-head').innerHTML = headOptions('', true); }

function balLabel(b) {
  if (b > 0) return '<span>' + inr(b) + ' owed</span>';
  if (b < 0) return '<span class="neg">' + inr(Math.abs(b)) + ' advance</span>';
  return '<span class="hint">settled</span>';
}

function renderParties() {
  var showOff = $('party-inactive').checked;
  var list = S.partiesAll.filter(function (p) { return showOff || p.isActive; });
  $('party-list').innerHTML = list.length ? list.map(function (p) {
    return '<div class="li' + (p.isActive ? '' : ' off') + '"><div class="meta"><b>' + esc(p.name) + '</b> <span class="pill">' + (p.source === 'staff' ? 'Staff' : 'Manual') + '</span>' +
      '<small>' + esc(p.role) + (p.monthlyAmount > 0 ? ' · ' + inr(p.monthlyAmount) + ' / month' : '') + ' · ' + balLabel(p.balance || 0) + '</small></div>' +
      '<div><button class="btn ghost sm" type="button" data-act="edit-party" data-id="' + esc(p._id) + '">Edit</button> ' +
      '<button class="btn ' + (p.isActive ? 'danger' : 'ghost') + ' sm" type="button" data-act="toggle-party" data-id="' + esc(p._id) + '">' + (p.isActive ? 'Deactivate' : 'Activate') + '</button>' +
      (p.entryCount === 0 ? ' <button class="btn danger sm" type="button" data-act="delete-party" data-id="' + esc(p._id) + '">Delete</button>' : '') + '</div></div>';
  }).join('') : emptyBox('No payees yet', 'Pick staff from the list above, or add a helper or vendor manually.');
}

function renderStaffList() {
  var q = ($('staff-search').value || '').trim().toLowerCase();
  var list = S.staffOpts.filter(function (s) { return !q || (s.name + ' ' + (s.designation || '')).toLowerCase().indexOf(q) >= 0; });
  $('staff-list').innerHTML = list.length ? list.map(function (s) {
    return '<label><input type="checkbox" class="staff-ck" value="' + esc(s._id) + '"> <span>' + esc(s.name) +
      (s.designation ? ' <span class="hint">· ' + esc(s.designation) + '</span>' : '') + '</span></label>';
  }).join('') : '<div class="hint" style="padding:10px 0">' + (S.staffOpts.length ? 'No staff match your search.' : 'Every active staff member is already a payee.') + '</div>';
}

function renderAdvisors() {
  $('adv-list').innerHTML = S.advisorsAll.length ? S.advisorsAll.map(function (a) {
    return '<div class="li' + (a.isActive ? '' : ' off') + '"><div class="meta"><b>' + esc(a.name) + '</b>' + (a.isActive ? '' : '<small>inactive</small>') + '</div>' +
      '<div><button class="btn ghost sm" type="button" data-act="edit-adv" data-id="' + esc(a._id) + '">Rename</button> ' +
      '<button class="btn ' + (a.isActive ? 'danger' : 'ghost') + ' sm" type="button" data-act="toggle-adv" data-id="' + esc(a._id) + '">' + (a.isActive ? 'Deactivate' : 'Activate') + '</button>' +
      (a.entryCount === 0 ? ' <button class="btn danger sm" type="button" data-act="delete-adv" data-id="' + esc(a._id) + '">Delete</button>' : '') + '</div></div>';
  }).join('') : emptyBox('No names yet', 'Optional. Add Principal, Manager, Director and so on.');
}

function renderTab1() { renderHeads(); renderHeadSelects(); renderParties(); renderAdvisors(); renderStaffList(); }

function reloadTab1(useCache) {
  return (useCache ? loadLookupsOnce() : loadLookups()).then(function () {
    renderTab1();
    return aGet('/staff-options').then(function (r) { S.staffOpts = r.data || []; renderStaffList(); });
  }).catch(function (e) { toast(errMsg(e), 'error'); });
}
TAB_LOADERS[1] = function () { return reloadTab1(true); };

/* ---- Tab 1 actions ---- */
function createHead(name, type) {
  return aPost('/heads', { name: name, type: type }).then(function () { toast('Head added'); return reloadTab1(); });
}

function submitHead(e) {
  e.preventDefault();
  var name = $('head-name').value.trim();
  if (!name) return;
  createHead(name, $('head-type').value).then(function () { $('head-name').value = ''; $('head-name').focus(); })
    .catch(function (err) { toast(errMsg(err), 'error'); });
}

function editHead(id) {
  var h = byId(S.headsAll, id); if (!h) return;
  var fields = [{ key: 'name', label: 'Head name', value: h.name }];
  if (!h.entryCount) fields.push({ key: 'type', label: 'Type', type: 'select', value: h.type, options: [{ v: 'oneoff', t: 'One-off expense' }, { v: 'payee', t: 'Salary / payee ledger' }] });
  else fields.push({ key: 'note', label: 'Type', type: 'text', value: h.type === 'payee' ? 'Payee ledger' : 'One-off', hint: 'Type is locked once a head has entries.' });
  openForm('Edit head', null, fields, 'Save changes', function (v) {
    var body = { name: v.name };
    if (v.type) body.type = v.type;
    return aPut('/heads/' + id, body).then(function () { toast('Head updated'); return reloadTab1(); });
  });
}
function toggleHead(id) {
  var h = byId(S.headsAll, id); if (!h) return;
  aPut('/heads/' + id, { isActive: !h.isActive }).then(function () { toast(h.isActive ? 'Head deactivated' : 'Head activated'); return reloadTab1(); })
    .catch(function (err) { toast(errMsg(err), 'error'); });
}

function setPartyMode(mode) {
  S.partyMode = mode;
  var btns = document.querySelectorAll('#party-mode button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.mode === mode ? 'true' : 'false');
  $('party-staff-form').hidden = mode !== 'staff';
  $('party-manual-form').hidden = mode !== 'manual';
}

function optAmount(v, label) {  // blank -> undefined (leave out), invalid -> throws
  if (v === undefined || String(v).trim() === '') return undefined;
  var n = money(v);
  if (isNaN(n)) throw new Error(label + ' must be a number');
  return n;
}

function submitStaffParties(e) {
  e.preventDefault();
  var ids = [].map.call(document.querySelectorAll('.staff-ck:checked'), function (c) { return c.value; });
  if (!ids.length) { toast('Tick at least one staff member', 'error'); return; }
  var body;
  try { body = { staffIds: ids, monthlyAmount: optAmount($('ps-monthly').value, 'Monthly amount'), defaultHeadId: $('ps-head').value || undefined }; }
  catch (err) { toast(errMsg(err), 'error'); return; }
  $('ps-add').disabled = true;
  aPost('/parties/from-staff', body).then(function (r) {
    var d = r.data; toast(d.created.length + ' payee' + (d.created.length === 1 ? '' : 's') + ' added' + (d.skipped.length ? ', ' + d.skipped.length + ' skipped' : ''));
    $('ps-monthly').value = ''; return reloadTab1();
  }).catch(function (err) { toast(errMsg(err), 'error'); })
    .then(function () { $('ps-add').disabled = false; });
}

function submitManualParty(e) {
  e.preventDefault();
  var body;
  try {
    body = {
      source: 'manual', name: $('pm-name').value.trim(), role: $('pm-role').value.trim() || undefined,
      mobile: $('pm-mobile').value.trim() || undefined,
      monthlyAmount: optAmount($('pm-monthly').value, 'Monthly amount'),
      openingBalance: optAmount($('pm-opening').value, 'Opening balance'),
      defaultHeadId: $('pm-head').value || undefined
    };
  } catch (err) { toast(errMsg(err), 'error'); return; }
  if (!body.name) { toast('Enter a name', 'error'); return; }
  aPost('/parties', body).then(function () {
    toast('Payee added');
    ['pm-name', 'pm-role', 'pm-mobile', 'pm-monthly', 'pm-opening'].forEach(function (id) { $(id).value = ''; });
    return reloadTab1();
  }).catch(function (err) { toast(errMsg(err), 'error'); });
}

function editParty(id) {
  var p = byId(S.partiesAll, id); if (!p) return;
  var fields = [
    { key: 'name', label: 'Name', value: p.name },
    { key: 'role', label: 'Role', value: p.role },
    { key: 'mobile', label: 'Mobile', value: p.mobile || '' },
    { key: 'monthlyAmount', label: 'Monthly amount (₹)', value: p.monthlyAmount || '', type: 'text', placeholder: '0' },
    { key: 'defaultHeadId', label: 'Default head', type: 'select', value: p.defaultHeadId || '', options: [{ v: '', t: '— none —' }].concat(S.heads.map(function (h) { return { v: h._id, t: h.name }; })) }
  ];
  if (isOwner()) fields.push({ key: 'openingBalance', label: 'Opening balance (₹)', value: p.openingBalance || 0, hint: 'Positive = you owe them. Negative = advance already given. Changes the whole ledger.' });
  openForm('Edit payee', p.source === 'staff' ? 'Linked to a staff record.' : null, fields, 'Save changes', function (v) {
    var body = { name: v.name, role: v.role, mobile: v.mobile, defaultHeadId: v.defaultHeadId || null };
    var m = money(v.monthlyAmount === '' ? 0 : v.monthlyAmount); if (isNaN(m)) throw new Error('Monthly amount must be a number');
    body.monthlyAmount = m;
    if (isOwner()) { var o = money(v.openingBalance === '' ? 0 : v.openingBalance); if (isNaN(o)) throw new Error('Opening balance must be a number'); body.openingBalance = o; }
    return aPut('/parties/' + id, body).then(function () { toast('Payee updated'); return reloadTab1(); });
  });
}
function toggleParty(id) {
  var p = byId(S.partiesAll, id); if (!p) return;
  aPut('/parties/' + id, { isActive: !p.isActive }).then(function () { toast(p.isActive ? 'Payee deactivated' : 'Payee activated'); return reloadTab1(); })
    .catch(function (err) { toast(errMsg(err), 'error'); });
}

function submitAdvisor(e) {
  e.preventDefault();
  var name = $('adv-name').value.trim(); if (!name) return;
  aPost('/advisors', { name: name }).then(function () { toast('Added'); $('adv-name').value = ''; return reloadTab1(); })
    .catch(function (err) { toast(errMsg(err), 'error'); });
}
function editAdvisor(id) {
  var a = byId(S.advisorsAll, id); if (!a) return;
  openForm('Rename', null, [{ key: 'name', label: 'Name', value: a.name }], 'Save', function (v) {
    return aPut('/advisors/' + id, { name: v.name }).then(function () { toast('Renamed'); return reloadTab1(); });
  });
}
function toggleAdvisor(id) {
  var a = byId(S.advisorsAll, id); if (!a) return;
  aPut('/advisors/' + id, { isActive: !a.isActive }).then(function () { return reloadTab1(); })
    .catch(function (err) { toast(errMsg(err), 'error'); });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 · EXPENSES DUE
═══════════════════════════════════════════════════════════════ */
var STATUS_TXT = { unpaid: 'Unpaid', part: 'Part paid', cleared: 'Cleared', advance: 'Paid in advance', nil: 'No dues' };

function fillDueParties() {
  var cur = $('due-party').value;
  $('due-party').innerHTML = '<option value="">All payees</option>' + S.partiesAll.filter(function (p) { return p.isActive; }).map(function (p) {
    return '<option value="' + esc(p._id) + '">' + esc(p.name) + '</option>';
  }).join('');
  $('due-party').value = cur;
}

TAB_LOADERS[2] = function () {
  if (!S.dueMonth) { S.dueMonth = thisMonth(); $('due-month').value = S.dueMonth; }
  loadSettings();
  loadLookupsOnce().then(function () { fillDueParties(); loadDue(); }).catch(function (e) { toast(errMsg(e), 'error'); });
};

function loadDue() {
  var my = ++S.dueReq;
  $('due-table').innerHTML = '<div class="empty"><span class="spin"></span>Loading…</div>';
  aGet('/due-summary', { month: S.dueMonth }).then(function (r) {
    if (my !== S.dueReq) return;
    S.dueRows = r.data.rows; S.dueTotals = r.data.totals; renderDue();
  }).catch(function (e) { if (my !== S.dueReq) return; $('due-table').innerHTML = emptyBox('Could not load', errMsg(e)); });
}

function renderDue() {
  syncDuePresets();
  var t = S.dueTotals || { monthDue: 0, monthPaid: 0, outstanding: 0, advances: 0 };
  $('due-stats').innerHTML =
    '<div class="stat"><small>Due in ' + esc(monthLabel(S.dueMonth)) + '</small><b>' + inr(t.monthDue) + '</b></div>' +
    '<div class="stat good"><small>Paid in ' + esc(monthLabel(S.dueMonth)) + '</small><b>' + inr(t.monthPaid) + '</b></div>' +
    '<div class="stat warn"><small>Balance to pay</small><b>' + inr(t.outstanding) + '</b></div>' +
    '<div class="stat"><small>Paid in advance</small><b>' + inr(t.advances) + '</b></div>';

  var only = $('due-party').value;
  var rows = S.dueRows.filter(function (r) { return !only || String(r.partyId) === only; });
  if (!rows.length) {
    $('due-table').innerHTML = emptyBox('Nothing to show for ' + monthLabel(S.dueMonth),
      S.partiesAll.length ? 'Use “Generate monthly salary dues”, or add a due or bill.' : 'Add payees in the Expense Heads tab first.');
    return;
  }
  $('due-table').innerHTML = '<table><thead><tr><th>Payee</th><th>Head</th><th class="n">Previous balance</th><th class="n">Due</th><th class="n">Paid</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td class="keep"><b>' + esc(r.name) + '</b><span class="sm-t">' + esc(r.role) + (r.isActive ? '' : ' · inactive') + '</span></td>' +
        '<td>' + esc(r.head || '–') + '</td>' +
        '<td class="n' + (r.previous < 0 ? ' neg' : '') + '">' + num(r.previous) + '</td>' +
        '<td class="n">' + num(r.monthDue) + '</td><td class="n">' + num(r.monthPaid) + '</td>' +
        '<td class="n' + (r.closing < 0 ? ' neg' : '') + '"><b>' + num(r.closing) + '</b></td>' +
        '<td><span class="pill ' + esc(r.status) + '">' + esc(STATUS_TXT[r.status] || r.status) + '</span></td>' +
        '<td>' + (can(3) && r.isActive ? '<button class="btn ghost sm" type="button" data-act="pay-party" data-id="' + esc(r.partyId) + '">Pay</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

/* ---- Auto dues setting: which day each month salaries become "to pay" by themselves ---- */
function ordinal(n) { var v = n % 100, sfx = ['th', 'st', 'nd', 'rd']; return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]); }
function fillAutoDays() {
  if ($('auto-day').options.length) return;
  var h = '';
  for (var i = 1; i <= 28; i++) h += '<option value="' + i + '">' + ordinal(i) + ' of the month</option>';
  $('auto-day').innerHTML = h;
}
function loadSettings() {
  return aGet('/settings').then(function (r) { S.settings = r.data; renderSettings(); })
    .catch(function () { $('auto-text').textContent = 'Could not load the auto dues setting.'; });
}
function renderSettings() {
  var st = S.settings; if (!st) return;
  fillAutoDays();
  $('auto-day').value = String(st.day);
  $('auto-on').checked = !!st.enabled;
  ['auto-day', 'auto-on', 'auto-save'].forEach(function (id) { $(id).disabled = !st.canEdit; });
  var txt = st.enabled
    ? 'Every month on the ' + ordinal(st.day) + ', each payee’s monthly amount becomes “to pay” by itself. You do not have to press anything.' + (st.nextRun ? ' Next run: ' + fmtD(st.nextRun + 'T12:00:00+05:30') + '.' : '')
    : 'Auto dues are switched off. Press “Generate monthly salary dues” each month, or switch this on.';
  if (!st.canEdit) txt += ' Only the owner, or someone with Heads access, can change this.';
  $('auto-text').textContent = txt;
  var lb = st.lastBatch;
  if (lb && lb.at) {
    var skipped = (lb.skipped || []).map(function (x) { return x.name + ' (' + x.reason.toLowerCase() + ')'; });
    var done = lb.created > 0
      ? lb.created + ' due' + (lb.created === 1 ? '' : 's') + ' created for ' + lb.months.map(function (m) { return monthLabel(m.month); }).join(', ') + '.'
      : 'nothing new to create.';
    $('auto-last').textContent = 'Last automatic check: ' + fmtDT(lb.at) + ': ' + done + (skipped.length ? ' Skipped: ' + skipped.join(', ') + '.' : '');
  } else $('auto-last').textContent = '';
}
function saveSettings() {
  $('auto-save').disabled = true;
  aPut('/settings', { enabled: $('auto-on').checked, day: Number($('auto-day').value) }).then(function (r) {
    S.settings = r.data; renderSettings(); toast('Auto dues saved');
  }).catch(function (e) { toast(errMsg(e), 'error'); renderSettings(); })
    .then(function () { if (S.settings && S.settings.canEdit) $('auto-save').disabled = false; });
}
// Runs when the page opens: if a month was missed (nobody opened the app on the day), it is created now.
function checkAutoDues() {
  aPost('/auto-dues/check').then(function (r) {
    var d = r.data;
    if (d && d.created > 0) {
      var months = d.runs.filter(function (x) { return x.created; }).map(function (x) { return monthLabel(x.month); }).join(', ');
      toast('Auto dues created for ' + months + ' (' + d.created + ' payee' + (d.created === 1 ? '' : 's') + ')');
      if (!$('tab2').hidden) loadDue();
    }
  }).catch(function () { /* the hourly job will try again */ });
}

function generateDues() {
  askConfirm('Generate dues for ' + monthLabel(S.dueMonth) + '?',
    'A due is added for every payee that has a monthly amount. Payees who already have one for this month are skipped.', 'Generate')
    .then(function (yes) {
      if (!yes) return;
      return aPost('/dues/generate', { month: S.dueMonth }).then(function (r) {
        var d = r.data;
        toast(d.created.length + ' due' + (d.created.length === 1 ? '' : 's') + ' generated');
        var problems = d.skipped.filter(function (x) { return x.reason !== 'Already generated'; });
        if (problems.length) {
          openInfo('Some payees were skipped', '<p class="sub">Set a default head for them in the Expense Heads tab, then generate again.</p>' +
            problems.map(function (x) { return '<div class="li"><span>' + esc(x.name) + '</span><span class="hint">' + esc(x.reason) + '</span></div>'; }).join(''));
        }
        loadDue();
      });
    }).catch(function (e) { toast(errMsg(e), 'error'); });
}

function addDue() {
  if (!S.parties.length) { toast('Add a payee first (Expense Heads tab)', 'error'); return; }
  if (!S.heads.length) { toast('Add a head first (Expense Heads tab)', 'error'); return; }
  openForm('Add a due or bill', 'Money you owe a payee, like a salary or a supplier’s bill. It is recorded under: ' + whoAmI() + ' (automatic).', [
    { key: 'partyId', label: 'Payee', type: 'select', value: $('due-party').value || '', options: S.parties.map(function (p) { return { v: p._id, t: p.name }; }) },
    { key: 'headId', label: 'Head', type: 'select', value: '', options: S.heads.map(function (h) { return { v: h._id, t: h.name }; }) },
    { key: 'description', label: 'Description', value: '', placeholder: 'e.g. September salary' },
    { key: 'amount', label: 'Amount (₹)', value: '', placeholder: '0' },
    { key: 'forMonth', label: 'For month', type: 'month', value: S.dueMonth },
    { key: 'reference', label: 'Bill number (optional)', value: '' },
    { key: 'remark', label: 'Remarks (optional)', type: 'textarea', value: '' }
  ], 'Add due', function (v) {
    var amt = money(v.amount); if (isNaN(amt) || amt <= 0) throw new Error('Enter an amount greater than zero');
    if (!v.description.trim()) throw new Error('Write a description');
    return aPost('/dues', { partyId: v.partyId, headId: v.headId, description: v.description.trim(), amount: amt, forMonth: v.forMonth || undefined, reference: v.reference || undefined, remark: v.remark || undefined })
      .then(function () { toast('Due added'); loadDue(); });
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 · EXPENSES PAID
═══════════════════════════════════════════════════════════════ */
function fillPayForm() {
  var curP = $('p-party').value, curH = $('p-head').value, curA = $('p-adv').value;
  $('p-party').innerHTML = '<option value="">' + (S.payType === 'adjustment' ? '— choose payee —' : '— no payee (one-off) —') + '</option>' +
    S.parties.map(function (p) { return '<option value="' + esc(p._id) + '">' + esc(p.name) + ' · ' + esc(p.role) + '</option>'; }).join('');
  $('p-head').innerHTML = '<option value="">— choose head —</option>' + S.heads.map(function (h) { return '<option value="' + esc(h._id) + '">' + esc(h.name) + '</option>'; }).join('');
  $('p-adv').innerHTML = S.advisors.length
    ? '<option value="">— choose —</option>' + S.advisors.map(function (a) { return '<option value="' + esc(a._id) + '">' + esc(a.name) + '</option>'; }).join('')
    : '<option value="">Not needed (no names added)</option>';
  $('p-adv').disabled = !S.advisors.length;
  $('p-party').value = curP; $('p-head').value = curH; $('p-adv').value = curA;
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

// Description fills itself as "To <payee>" until the person types their own
function autoDescribe() {
  if (S.payType === 'adjustment') return;
  var party = byId(S.parties, $('p-party').value), d = $('p-desc');
  var auto = party ? 'To ' + party.name : '';
  if (!d.value || d.value === S.lastAutoDesc) d.value = auto;
  S.lastAutoDesc = auto;
}

function syncPayForm() {
  var adj = S.payType === 'adjustment';
  var party = byId(S.parties, $('p-party').value);
  var head = byId(S.heads, $('p-head').value);
  $('p-name-row').hidden = !!party || adj;
  $('p-mode-wrap').hidden = adj;
  $('p-desc').placeholder = adj ? 'e.g. Books adjusted' : 'e.g. To Guard, salary';
  $('p-save').textContent = adj ? 'Save adjustment' : 'Save payment';
  var first = $('p-party').options[0]; if (first && !$('p-party').value) first.textContent = adj ? '— choose payee —' : '— no payee (one-off) —';

  var pv = $('p-preview'), amt = money($('p-amount').value);
  if (party) {
    var before = Number(party.balance) || 0;
    if (!isNaN(amt) && amt > 0) {
      var after = Math.round((before - amt) * 100) / 100;
      pv.hidden = false; pv.className = 'preview' + (after < 0 ? ' warn' : '');
      pv.textContent = 'Balance after this ' + (adj ? 'adjustment' : 'payment') + ': ' + (after < 0 ? inr(Math.abs(after)) + ' advance' : inr(after) + ' still owed') + '  (now ' + (before < 0 ? inr(Math.abs(before)) + ' advance' : inr(before) + ' owed') + ')';
    } else {
      pv.hidden = false; pv.className = 'preview';
      pv.textContent = 'Current balance: ' + (before < 0 ? inr(Math.abs(before)) + ' advance given' : before > 0 ? inr(before) + ' owed to ' + party.name : 'settled');
    }
  } else if (head && head.type === 'payee') {
    pv.hidden = false; pv.className = 'preview warn'; pv.textContent = '“' + head.name + '” is a payee head. Choose who is being paid.';
  } else pv.hidden = true;
}

function setPayType(t) {
  S.payType = t;
  var btns = document.querySelectorAll('#pay-type button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.type === t ? 'true' : 'false');
  fillPayForm();
  if (t === 'adjustment') { if ($('p-desc').value === S.lastAutoDesc) $('p-desc').value = ''; S.lastAutoDesc = null; }
  else autoDescribe();
}

function submitPayment(e) {
  e.preventDefault();
  var adj = S.payType === 'adjustment';
  var amt = money($('p-amount').value);
  if (!$('p-head').value) { toast('Choose a head', 'error'); return; }
  if (!$('p-desc').value.trim()) { toast('Write a description', 'error'); $('p-desc').focus(); return; }
  if (isNaN(amt) || amt <= 0) { toast('Enter an amount greater than zero', 'error'); return; }
  if (adj && !$('p-party').value) { toast('Choose the payee whose ledger this adjusts', 'error'); return; }
  if (S.advisors.length && !$('p-adv').value) { toast('Choose who advised this payment', 'error'); return; }
  var body = {
    type: S.payType, headId: $('p-head').value, partyId: $('p-party').value || undefined,
    payeeName: $('p-party').value ? undefined : ($('p-name').value.trim() || undefined),
    description: $('p-desc').value.trim(),
    amount: amt, mode: adj ? undefined : $('p-mode').value,
    advisedById: $('p-adv').value || undefined, reference: $('p-ref').value.trim() || undefined,
    remark: $('p-remark').value.trim() || undefined, entryDate: (isOwner() && $('p-date').value) || undefined
  };
  if (S.savingPayment) return;      // a second submit (double click, Enter twice) while the first is still being saved
  S.savingPayment = true;
  $('p-save').disabled = true;
  aPost('/payments', body).then(function (r) {
    var d = r.data;
    var tail = d.balanceAfter === null ? '' : ' · ' + (d.balanceAfter < 0 ? inr(Math.abs(d.balanceAfter)) + ' advance' : inr(d.balanceAfter) + ' still owed');
    toast('Saved ' + d.entry.voucherNo + ' · entered by ' + d.entry.enteredBy.name + tail);
    $('p-last').hidden = false;
    $('p-last').innerHTML = '✔ Saved <b>' + esc(d.entry.voucherNo) + '</b> · ' + esc(inr(d.entry.amount)) + ' · ' + esc(d.entry.partyName || d.entry.payeeName || '') +
      ' &nbsp;<button class="btn ghost sm" type="button" data-act="receipt" data-id="' + esc(d.entry._id) + '">Print receipt</button>';
    ['p-amount', 'p-ref', 'p-remark', 'p-name', 'p-desc'].forEach(function (id) { $(id).value = ''; });
    $('p-date').value = ''; S.lastAutoDesc = null;
    return refreshParties().then(function () { fillPayForm(); autoDescribe(); loadEntries(1); });
  }).catch(function (err) { toast(errMsg(err), 'error'); })
    .then(function () { S.savingPayment = false; $('p-save').disabled = false; });
}

/* ---- entries list ---- */
S.entRows = []; S.preset = 'today'; S.entInit = false;

TAB_LOADERS[3] = function () {
  loadLookupsOnce().then(function () {
    fillPayForm();
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

function entFilters() { return { from: $('e-from').value, to: $('e-to').value, type: $('e-type').value, q: $('e-q').value.trim() }; }

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
    S.ent.pages = r.pagination.totalPages || 1; S.ent.total = r.pagination.totalRecords;
    renderEntries(r);
  }).catch(function (e) { if (my !== S.entReq) return; $('ent-table').innerHTML = emptyBox('Could not load entries', errMsg(e)); });
}

function who(a) {
  var sub = a.kind === 'admin' ? 'Owner' : a.kind === 'system' ? 'Automatic' : (a.designation || '');
  return esc(a.name) + (sub ? '<span class="sm-t">' + esc(sub) + '</span>' : '');
}
function fmtT(d) { return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }); }
function descOf(e) {
  if (e.description) return e.description;
  return e.type === 'due' ? 'Due' : e.type === 'adjustment' ? 'Adjustment' : 'Payment';   // entries made before Description existed
}
function typeLabel(t) { return t === 'adjustment' ? 'Adjustment' : t === 'due' ? 'Due' : 'Paid'; }

function renderEntries(r) {
  $('ent-banner').innerHTML = r.scope === 'mine' ? '<div class="banner">Showing only the entries you made yourself.</div>' : '';
  var t = r.totals || {};
  $('ent-sub').textContent = entPeriodText() + ' · Paid ' + inr(t.paid) + ' · Adjusted ' + inr(t.adjustment) + ' · Due entered ' + inr(t.due) + (S.ent.total ? '  (' + S.ent.total + ' entr' + (S.ent.total === 1 ? 'y' : 'ies') + ')' : '');
  if (!S.entRows.length) { $('ent-table').innerHTML = emptyBox('No entries for ' + entPeriodText(), 'Try “Last 7 days” or “All time”, or save a payment in the Add payment tab.'); $('ent-pager').innerHTML = ''; return; }
  $('ent-table').innerHTML = '<table><thead><tr><th>Sr. No.</th><th>Date</th><th>Head</th><th>Description</th><th>Type</th><th class="n">Amount</th><th>Advised by</th><th>Entered by</th><th>Remarks</th><th></th></tr></thead><tbody>' +
    S.entRows.map(function (e) {
      var rev = e.status === 'reversed';
      var small = [e.partyName || e.payeeName ? 'Paid to ' + (e.partyName || e.payeeName) : '', e.mode ? e.mode.toUpperCase() : '', e.reference || ''].filter(Boolean).join(' · ');
      var remarks = (e.remark ? esc(e.remark) : '') + (rev ? '<span class="sm-t" style="color:var(--red)">Reversed: ' + esc(e.reversedReason || '') + '</span>' : '');
      var acts = '';
      if (e.type !== 'due') acts += '<button class="btn ghost sm" type="button" data-act="receipt" data-id="' + esc(e._id) + '">Receipt</button> ';
      acts += '<button class="btn ghost sm" type="button" data-act="audit" data-id="' + esc(e._id) + '">History</button>';
      if (isOwner() && !rev) acts += ' <button class="btn ghost sm" type="button" data-act="edit-entry" data-id="' + esc(e._id) + '">Edit</button> <button class="btn danger sm" type="button" data-act="reverse-entry" data-id="' + esc(e._id) + '">Reverse</button>';
      return '<tr' + (rev ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(e.voucherNo) + '</b></td>' +
        '<td>' + esc(fmtD(e.entryDate)) + '<span class="sm-t">' + esc(fmtT(e.entryDate)) + '</span></td>' +
        '<td>' + esc(e.headName) + (e.forMonth ? '<span class="sm-t">' + esc(monthLabel(e.forMonth)) + '</span>' : '') + '</td>' +
        '<td><b>' + esc(descOf(e)) + '</b>' + (small ? '<span class="sm-t">' + esc(small) + '</span>' : '') + '</td>' +
        '<td class="keep"><span class="pill ' + esc(e.type) + '">' + esc(typeLabel(e.type)) + '</span>' + (e.source === 'auto' ? '<span class="sm-t">auto</span>' : '') + '</td>' +
        '<td class="n"><b>' + num(e.amount) + '</b></td><td>' + esc(e.advisedByName || '–') + '</td><td>' + who(e.enteredBy) + '</td><td>' + remarks + '</td><td class="keep">' + acts + '</td></tr>';
    }).join('') + '</tbody></table>';
  $('ent-pager').innerHTML = '<span>Page ' + S.ent.page + ' of ' + S.ent.pages + '</span><span>' +
    '<button class="btn ghost sm" type="button" data-act="ent-prev"' + (S.ent.page <= 1 ? ' disabled' : '') + '>← Newer</button> ' +
    '<button class="btn ghost sm" type="button" data-act="ent-next"' + (S.ent.page >= S.ent.pages ? ' disabled' : '') + '>Older →</button></span>';
}

function showAudit(id) {
  aGet('/entries/' + id).then(function (r) {
    var e = r.data;
    var rows = (e.auditLog || []).map(function (a) {
      var title = a.action === 'created' ? 'Entered' : a.action === 'edited' ? 'Edited' : 'Reversed';
      var ch = (a.changes || []).map(function (c) { return '<div class="hint">' + esc(c.field) + ': ' + esc(c.from === null ? '–' : c.from) + ' → ' + esc(c.to === null ? '–' : c.to) + '</div>'; }).join('');
      return '<div><b>' + title + '</b> by ' + esc(a.by.name) + (a.by.kind === 'admin' ? ' (Owner)' : a.by.kind === 'system' ? ' (Automatic)' : (a.by.designation ? ' (' + esc(a.by.designation) + ')' : '')) +
        '<div class="hint">' + esc(fmtDT(a.at)) + '</div>' + ch + (a.note ? '<div class="hint">Reason: ' + esc(a.note) + '</div>' : '') + '</div>';
    }).join('');
    openInfo(e.voucherNo + ' · ' + inr(e.amount), '<p class="sub">' + esc(e.partyName || e.payeeName || '') + ' · ' + esc(e.headName) + '</p><div class="tl">' + rows + '</div>');
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
  openForm('Edit ' + e.voucherNo, 'Originally entered by ' + e.enteredBy.name + '. Your change is added to the entry’s history with your name.', fields, 'Save changes', function (v) {
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
      .then(function () { toast('Entry updated'); return refreshParties().then(function () { loadEntries(S.ent.page); }); });
  });
}

function reverseEntry(id) {
  var e = byId(S.entRows, id); if (!e) return;
  openForm('Reverse ' + e.voucherNo + '?', 'The entry stays visible, struck through, and stops counting in the balance. This cannot be undone.', [
    { key: 'reason', label: 'Reason (required)', type: 'textarea', value: '' }
  ], 'Reverse entry', function (v) {
    if (!v.reason.trim()) throw new Error('Write a reason');
    return getDeleteCode().then(function (code) {
      var body = { reason: v.reason.trim() }; if (code) body.deleteCode = code;
      return aPost('/entries/' + id + '/reverse', body);
    }).catch(function (err) { codeFailed(err); throw err; })
      .then(function () { toast('Entry reversed'); return refreshParties().then(function () { fillPayForm(); loadEntries(S.ent.page); }); });
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 · LEDGER
═══════════════════════════════════════════════════════════════ */
function monthStartYmd() { return todayYmd().slice(0, 8) + '01'; }

TAB_LOADERS[4] = function () {
  var all = !!(S.me && S.me.allEntries);
  var btns = document.querySelectorAll('#led-view button');
  for (var i = 0; i < btns.length; i++) {
    var needsAll = btns[i].dataset.view !== 'cash';
    btns[i].disabled = needsAll && !all;
    btns[i].title = (needsAll && !all) ? 'Needs permission to see everyone’s entries' : '';
  }
  if (!all) S.ledView = 'cash';
  if (!$('l-from').value) $('l-from').value = monthStartYmd();
  if (!$('l-to').value) $('l-to').value = todayYmd();
  loadLookupsOnce().then(function () {
    var cur = $('l-party').value;
    $('l-party').innerHTML = S.partiesAll.map(function (p) { return '<option value="' + esc(p._id) + '">' + esc(p.name) + ' · ' + esc(p.role) + (p.isActive ? '' : ' (inactive)') + '</option>'; }).join('');
    if (cur) $('l-party').value = cur;
    setLedView(S.ledView);
  }).catch(function (e) { toast(errMsg(e), 'error'); });
};

function setLedView(v) {
  S.ledView = v;
  var btns = document.querySelectorAll('#led-view button');
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.view === v ? 'true' : 'false');
  $('l-party-wrap').hidden = v !== 'party';
  loadLedger();
}

function loadLedger() {
  var p = { from: $('l-from').value, to: $('l-to').value };
  var my = ++S.ledReq;
  $('led-body').innerHTML = '<div class="card empty"><span class="spin"></span>Loading…</div>';
  var req;
  if (S.ledView === 'party') {
    var pid = $('l-party').value;
    if (!pid) { $('led-body').innerHTML = '<div class="card">' + emptyBox('No payees yet', 'Add payees in the Expense Heads tab to see their ledgers.') + '</div>'; return; }
    req = aGet('/ledger/party/' + pid, p);
  } else if (S.ledView === 'cash') req = aGet('/ledger/cashbook', p);
  else req = aGet('/ledger/heads', p);
  req.then(function (r) { if (my !== S.ledReq) return; S.ledData = r.data; renderLedger(); })
    .catch(function (e) { if (my !== S.ledReq) return; $('led-body').innerHTML = '<div class="card">' + emptyBox('Could not load the ledger', errMsg(e)) + '</div>'; });
}

function periodText() {
  var f = $('l-from').value, t = $('l-to').value;
  return (f ? fmtD(f + 'T12:00:00+05:30') : 'Start') + ' to ' + (t ? fmtD(t + 'T12:00:00+05:30') : 'today');
}

// Newest first. Each row shows the balance BEFORE it (opening) and AFTER it (closing).
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
  $('l-print-head').innerHTML = '<h2 style="font-size:18px">Expense ledger</h2><div class="hint">' + esc(S.ledView === 'party' && d.party ? d.party.name + ' · ' + d.party.role + ' · ' : '') + esc(periodText()) + ' · Printed by ' + esc(whoAmI()) + '</div>';

  if (S.ledView === 'party') {
    var c = d.totals.closing, lr = ledgerRows(d);
    html += '<div class="grid g4" style="margin-bottom:18px">' +
      '<div class="stat"><small>Opening balance</small><b>' + inr(d.opening) + '</b></div>' +
      '<div class="stat"><small>Credit (due)</small><b>' + inr(d.totals.credit) + '</b></div>' +
      '<div class="stat good"><small>Debit (paid + adjusted)</small><b>' + inr(d.totals.debit) + '</b></div>' +
      '<div class="stat warn"><small>' + (c < 0 ? 'Paid in advance' : 'Closing balance (owed)') + '</small><b>' + inr(Math.abs(c)) + '</b></div></div>';
    html += '<div class="card"><h2>' + esc(d.party.name) + '</h2><p class="sub">' + esc(d.party.role) + ' · ' + esc(periodText()) + ' · newest first</p>' +
      (d.truncated ? '<div class="banner">Showing the first 3,000 rows. Narrow the dates to see the rest.</div>' : '') +
      '<div class="tw"><table><thead><tr><th>Sr. No.</th><th>Date</th><th>Head</th><th>Description</th><th class="n">Opening Balance</th><th class="n">Credit</th><th class="n">Debit</th><th class="n">Closing Balance</th><th>Advised by</th><th>Entry made by</th><th>Remarks</th></tr></thead><tbody>' +
      (lr.length ? lr.map(function (x) {
        var r = x.r, sm = detailLine(r);
        return '<tr' + (x.rev ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(r.voucherNo) + '</b></td>' +
          '<td>' + esc(fmtD(r.entryDate)) + '<span class="sm-t">' + esc(fmtT(r.entryDate)) + '</span></td>' +
          '<td>' + esc(r.headName) + (r.forMonth ? '<span class="sm-t">' + esc(monthLabel(r.forMonth)) + '</span>' : '') + '</td>' +
          '<td>' + esc(descOf(r)) + (sm ? '<span class="sm-t">' + esc(sm) + '</span>' : '') + (r.type === 'adjustment' ? '<span class="sm-t">Non-cash adjustment</span>' : '') + '</td>' +
          '<td class="n keep' + (x.open < 0 ? ' neg' : '') + '">' + (x.rev ? '' : num(x.open)) + '</td>' +
          '<td class="n">' + (r.type === 'due' ? num(r.amount) : '') + '</td><td class="n">' + (r.type !== 'due' ? num(r.amount) : '') + '</td>' +
          '<td class="n keep' + (x.close < 0 ? ' neg' : '') + '"><b>' + (x.rev ? '' : num(x.close)) + '</b></td>' +
          '<td>' + esc(r.advisedByName || '–') + '</td><td>' + who(r.enteredBy) + '</td>' +
          '<td class="keep">' + esc(r.remark || '') + (x.rev ? '<span class="sm-t" style="color:var(--red)">Reversed: ' + esc(r.reversedReason || '') + '</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="11"><div class="empty">No entries in this period.</div></td></tr>') +
      '<tr><td>–</td><td>' + esc(periodText().split(' to ')[0]) + '</td><td></td><td><b>Opening balance at the start</b></td><td class="n' + (d.opening < 0 ? ' neg' : '') + '"><b>' + num(d.opening) + '</b></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
      '</tbody><tfoot><tr><td colspan="4">Total for the period</td><td class="n">' + num(d.opening) + '</td><td class="n">' + num(d.totals.credit) + '</td><td class="n">' + num(d.totals.debit) + '</td><td class="n">' + num(c) + '</td><td colspan="3"></td></tr></tfoot></table></div></div>';
  } else if (S.ledView === 'cash') {
    html += (d.scope === 'mine' ? '<div class="banner">Showing only the entries you made yourself.</div>' : '') +
      '<div class="card"><h2>Cash book</h2><p class="sub">Who recorded what. Reversed entries are not counted. ' + esc(periodText()) + '</p>' +
      (d.groups.length ? '<div class="tw"><table><thead><tr><th>Recorded by</th><th class="n">Entries</th><th class="n">Paid</th><th class="n">Adjusted</th><th class="n">Dues entered</th><th class="n">Cash</th><th class="n">Bank</th><th class="n">UPI</th><th class="n">Cheque / other</th><th class="n">Reversed</th><th></th></tr></thead><tbody>' +
        d.groups.map(function (g) {
          return '<tr><td class="keep"><b>' + esc(g.name) + '</b><span class="sm-t">' + (g.kind === 'admin' ? 'Owner login' : g.kind === 'system' ? 'Created by the system' : esc(g.designation || 'Staff')) + '</span></td><td class="n">' + g.entries + '</td><td class="n"><b>' + num(g.paid) + '</b></td><td class="n">' + num(g.adjustment) + '</td><td class="n">' + num(g.due) + '</td>' +
            '<td class="n">' + num(g.byMode.cash) + '</td><td class="n">' + num(g.byMode.bank) + '</td><td class="n">' + num(g.byMode.upi) + '</td><td class="n">' + num(g.byMode.cheque + g.byMode.other) + '</td><td class="n">' + g.reversed + '</td>' +
            '<td class="keep"><button class="btn ghost sm no-print" type="button" data-act="cash-drill" data-key="' + esc(g.key) + '">View entries</button></td></tr>';
        }).join('') + '</tbody></table></div>' : emptyBox('No entries in this period', 'Entries you record will be grouped by who made them.')) +
      '</div><div id="cash-detail" style="margin-top:18px"></div>';
  } else {
    html += '<div class="card"><h2>Spend by head</h2><p class="sub">' + esc(periodText()) + '</p>' +
      (d.length ? '<div class="tw"><table><thead><tr><th>Head</th><th class="n">Due entered</th><th class="n">Paid</th><th class="n">Adjusted</th><th class="n">Total paid + adjusted</th></tr></thead><tbody>' +
        d.map(function (r) { return '<tr><td><b>' + esc(r.name) + '</b></td><td class="n">' + num(r.due) + '</td><td class="n">' + num(r.paid) + '</td><td class="n">' + num(r.adjustment) + '</td><td class="n"><b>' + num(r.paid + r.adjustment) + '</b></td></tr>'; }).join('') +
        '</tbody></table></div>' : emptyBox('No entries in this period', 'Nothing has been recorded against any head yet.')) + '</div>';
  }
  $('led-body').innerHTML = html;
}

function cashDrill(key) {
  var p = { from: $('l-from').value, to: $('l-to').value, limit: 200, enteredBy: key === 'admin' ? 'admin' : key };
  aGet('/entries', p).then(function (r) {
    var rows = r.data || [];
    $('cash-detail').innerHTML = '<div class="card"><h2>Entries</h2><p class="sub">' + rows.length + (r.pagination.totalRecords > rows.length ? ' of ' + r.pagination.totalRecords : '') + ' shown, newest first.</p><div class="tw"><table><thead><tr><th>Sr. No.</th><th>Date</th><th>Head</th><th>Description</th><th>Type</th><th class="n">Amount</th><th>Advised by</th><th>Remarks</th></tr></thead><tbody>' +
      rows.map(function (e) {
        return '<tr' + (e.status === 'reversed' ? ' class="rev"' : '') + '><td class="keep"><b>' + esc(e.voucherNo) + '</b></td><td>' + esc(fmtD(e.entryDate)) + '<span class="sm-t">' + esc(fmtT(e.entryDate)) + '</span></td><td>' + esc(e.headName) + '</td><td>' + esc(descOf(e)) + ((e.partyName || e.payeeName) ? '<span class="sm-t">Paid to ' + esc(e.partyName || e.payeeName) + '</span>' : '') + '</td><td class="keep"><span class="pill ' + esc(e.type) + '">' + esc(typeLabel(e.type)) + '</span></td><td class="n">' + num(e.amount) + '</td><td>' + esc(e.advisedByName || '–') + '</td><td>' + esc(e.remark || '') + '</td></tr>';
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

function safeCell(v) {   // stop spreadsheet formula injection from names/remarks
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
  if (S.ledView === 'party') {
    headerRows(ws, d.party.name + ' (' + d.party.role + ') · ledger', periodText());
    ws.addRow(['Sr. No.', 'Date', 'Head', 'Description', 'Opening Balance', 'Credit', 'Debit', 'Closing Balance', 'Advised by', 'Entry made by', 'Remarks', 'Status']);
    ledgerRows(d).forEach(function (x) {
      var r = x.r;
      ws.addRow([r.voucherNo, fmtD(r.entryDate) + ' ' + fmtT(r.entryDate), safeCell(r.headName), safeCell(descOf(r)), x.rev ? '' : x.open,
        r.type === 'due' ? r.amount : '', r.type !== 'due' ? r.amount : '', x.rev ? '' : x.close,
        safeCell(r.advisedByName || ''), safeCell(r.enteredBy.name), safeCell(r.remark || ''), x.rev ? 'Reversed' : '']);
    });
    ws.addRow(['', '', '', 'Opening balance at the start', d.opening]);
    ws.addRow(['', '', '', 'Total for the period', d.opening, d.totals.credit, d.totals.debit, d.totals.closing]);
    boldHeader(ws, 6, [14, 20, 22, 36, 16, 12, 12, 16, 18, 20, 30, 10]);
    label = d.party.name.replace(/[^a-z0-9]+/gi, '-');
  } else if (S.ledView === 'cash') {
    headerRows(ws, 'Cash book', periodText());
    ws.addRow(['Recorded by', 'Role', 'Entries', 'Paid', 'Adjusted', 'Dues entered', 'Cash', 'Bank', 'UPI', 'Cheque / other', 'Reversed']);
    d.groups.forEach(function (g) {
      ws.addRow([safeCell(g.name), g.kind === 'admin' ? 'Owner' : g.kind === 'system' ? 'System' : safeCell(g.designation || 'Staff'), g.entries, g.paid, g.adjustment, g.due, g.byMode.cash, g.byMode.bank, g.byMode.upi, g.byMode.cheque + g.byMode.other, g.reversed]);
    });
    boldHeader(ws, 6, [24, 18, 10, 14, 14, 14, 12, 12, 12, 14, 10]);
    label = 'cash-book';
  } else {
    headerRows(ws, 'Spend by head', periodText());
    ws.addRow(['Head', 'Due entered', 'Paid', 'Adjusted', 'Paid + adjusted']);
    d.forEach(function (r) { ws.addRow([safeCell(r.name), r.due, r.paid, r.adjustment, r.paid + r.adjustment]); });
    boldHeader(ws, 6, [28, 14, 14, 14, 18]);
    label = 'by-head';
  }
  saveWorkbook(wb, 'Expense-' + label + '-' + todayYmd() + '.xlsx');
}

/* ---- reports for Expenses Paid (the entries list) and Expenses Due ---- */
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
  toast('Preparing the report…');
  fetchAllEntries(entFilters()).then(function (res) {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Expenses');
    headerRows(ws, 'Expense entries', entPeriodText());
    if (res.scope === 'mine') ws.addRow(['Note', 'Only entries made by ' + whoAmI()]);
    if (res.truncated) ws.addRow(['Note', 'Only the newest 5,000 entries are included. Narrow the dates for the rest.']);
    var hdr = ws.addRow(['Sr. No.', 'Date', 'Time', 'Head', 'Paid to', 'Description', 'Type', 'Amount', 'Advised by', 'Entered by', 'Mode', 'Bill / Txn no.', 'Remarks', 'Status']);
    hdr.font = { bold: true };
    var tot = { paid: 0, adjustment: 0, due: 0 };
    res.rows.forEach(function (e) {
      var rev = e.status === 'reversed';
      if (!rev) tot[e.type] = Math.round((tot[e.type] + e.amount) * 100) / 100;
      ws.addRow([e.voucherNo, fmtD(e.entryDate), fmtT(e.entryDate), safeCell(e.headName), safeCell(e.partyName || e.payeeName || ''), safeCell(descOf(e)), typeLabel(e.type), e.amount,
        safeCell(e.advisedByName || ''), safeCell(e.enteredBy.name), e.mode ? e.mode.toUpperCase() : '', safeCell(e.reference || ''), safeCell(e.remark || ''), rev ? 'Reversed' : 'Active']);
    });
    ws.addRow([]);
    ws.addRow(['', '', '', '', '', 'Total paid', '', tot.paid]);
    ws.addRow(['', '', '', '', '', 'Total adjusted', '', tot.adjustment]);
    ws.addRow(['', '', '', '', '', 'Total dues entered', '', tot.due]);
    [14, 14, 11, 22, 22, 34, 12, 12, 18, 20, 9, 16, 28, 10].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    return saveWorkbook(wb, 'Expenses-' + (entFilters().from || 'all') + '-to-' + (entFilters().to || 'all') + '.xlsx');
  }).catch(function (e) { toast(errMsg(e), 'error'); });
}

function exportDueReport() {
  if (!needExcel()) return;
  var only = $('due-party').value;
  var rows = S.dueRows.filter(function (r) { return !only || String(r.partyId) === only; });
  if (!rows.length) { toast('There is nothing to export for this month', 'error'); return; }
  var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Expenses due');
  headerRows(ws, 'Expenses due · ' + monthLabel(S.dueMonth), monthLabel(S.dueMonth));
  ws.addRow(['Payee', 'Role', 'Head', 'Previous balance', 'Due', 'Paid', 'Balance', 'Status']).font = { bold: true };
  var t = { due: 0, paid: 0, bal: 0 };
  rows.forEach(function (r) {
    ws.addRow([safeCell(r.name), safeCell(r.role), safeCell(r.head || ''), r.previous, r.monthDue, r.monthPaid, r.closing, STATUS_TXT[r.status] || r.status]);
    t.due = Math.round((t.due + r.monthDue) * 100) / 100; t.paid = Math.round((t.paid + r.monthPaid) * 100) / 100; t.bal = Math.round((t.bal + r.closing) * 100) / 100;
  });
  ws.addRow([]);
  ws.addRow(['Total', '', '', '', t.due, t.paid, t.bal]).font = { bold: true };
  [26, 18, 22, 16, 12, 12, 14, 14].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
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
function syncDuePresets() {
  var btns = document.querySelectorAll('#due-presets button');
  for (var i = 0; i < btns.length; i++) {
    var on = (btns[i].dataset.preset === 'this' && S.dueMonth === thisMonth()) || (btns[i].dataset.preset === 'last' && S.dueMonth === lastMonthStr());
    btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
function setDueMonth(which) {
  S.dueMonth = which === 'last' ? lastMonthStr() : thisMonth();
  $('due-month').value = S.dueMonth; syncDuePresets(); loadDue();
}

/* ═══════════════════════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════════════════════ */
/* ---- amount in words (Indian system: thousand, lakh, crore) ---- */
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

/* ---- printable receipt / voucher for one payment ---- */
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
  var to = e.partyName || e.payeeName || '–';
  var balLine = '';
  if (d.balanceAfter !== null && d.balanceAfter !== undefined) {
    balLine = d.balanceAfter > 0 ? inr(d.balanceAfter) + ' still owed to ' + to : d.balanceAfter < 0 ? inr(Math.abs(d.balanceAfter)) + ' advance given to ' + to : 'Account settled';
  }
  function row(k, v) { return v ? '<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>' : ''; }
  var html = '<div class="rc-ov"><div class="rc-wrap" role="dialog" aria-modal="true" aria-label="Receipt">' +
    '<div class="rc-actions"><button class="btn ghost" type="button" id="rc-close">Close</button><button class="btn" type="button" id="rc-print">Print receipt</button></div>' +
    '<div class="rc-sheet">' +
      '<div class="rc-head"><h2>' + esc(inst.name) + '</h2>' + (inst.address ? '<small>' + esc(inst.address) + '</small>' : '') + (inst.mobile ? '<small>Phone: ' + esc(inst.mobile) + '</small>' : '') + '</div>' +
      '<div class="rc-title">' + (adj ? 'Non-cash adjustment voucher' : 'Payment receipt') + '<span>No. ' + esc(e.voucherNo) + '<br>' + esc(fmtDT(e.entryDate)) + '</span></div>' +
      (rev ? '<div class="rc-void">REVERSED, NOT VALID' + (e.reversedReason ? '. Reason: ' + esc(e.reversedReason) : '') + '</div>' : '') +
      '<table class="rc-table">' +
        row(adj ? 'Adjusted for' : 'Paid to', '<b>' + esc(to) + '</b>') +
        row('Head', esc(e.headName)) +
        row('Description', esc(descOf(e))) +
        row('Amount', '<span class="rc-amt">' + esc(inr(e.amount)) + '</span>') +
        row('Amount in words', esc(amountInWords(e.amount))) +
        row(adj ? '' : 'Payment mode', e.mode ? esc(e.mode.toUpperCase()) + (e.reference ? ' · ' + esc(e.reference) : '') : '') +
        row(e.mode ? '' : 'Reference', !e.mode && e.reference ? esc(e.reference) : '') +
        row('Advised by', esc(e.advisedByName || '')) +
        row('Entered by', esc(e.enteredBy.name) + (e.enteredBy.kind === 'admin' ? ' (Owner)' : (e.enteredBy.designation ? ' (' + esc(e.enteredBy.designation) + ')' : ''))) +
        row('Remarks', esc(e.remark || '')) +
        row('Balance after this', esc(balLine)) +
      '</table>' +
      '<div class="rc-sign"><div>Received by<small>' + esc(to) + '</small></div><div>Paid by<small>' + esc(e.enteredBy.name) + '</small></div><div>Approved by<small>' + esc(e.advisedByName || '') + '</small></div></div>' +
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
   GUIDED TOUR  (the "? Tour" button, "? How this works" on each tab, and a first-visit offer)
═══════════════════════════════════════════════════════════════ */
var TOUR_STEPS = [
  { tab: 0, title: 'Welcome to Expense Management', text: 'This 1-minute tour shows how everything fits together. The whole idea in 3 lines:\n• Due = money you owe someone.\n• Paid = money you have paid.\n• Balance = Due − Paid. Whatever is left moves to next month by itself.' },
  { tab: -1, target: '#tabs', title: 'Your tabs, left to right', text: function () {
    var names = { 1: 'Expense Heads (set things up once)', 2: 'Expenses Due (who you owe this month)', 3: 'Expenses Paid (record every payment)', 4: 'Ledger (the full account of any person)' };
    return allowedTabs().map(function (i) { return '• ' + names[i]; }).join('\n') + '\nYou only see the tabs you have access to.'; } },

  { tab: 1, sub: 'heads', target: '#head-form', title: 'Heads: what you spend on', text: 'Heads are labels for your spending, like Salary, Electricity or Repairs. Create each one once.\nChoose “Salary / payee ledger” when the money goes to a person, and “One-off” for ordinary bills.\nTip: 5 to 10 heads are plenty.' },
  { tab: 1, sub: 'payees', target: '#party-mode', title: 'Payees: who you pay', text: 'Payees are the people and shops you pay. Pick teachers from your staff list, or add helpers, drivers and vendors by hand.\nEvery payee gets a personal account that tracks what you owe them.' },
  { tab: 1, sub: 'payees', target: '#ps-monthly', title: 'Monthly amount = the salary plan', text: 'Type the monthly salary here, for example 20000. It is only a plan: each month it becomes “money to pay” by itself, on the day you choose in the Expenses Due tab.' },
  { tab: 1, sub: 'adv', target: '#t1-adv', title: 'Advised by: who approved', text: 'List the people who approve payments, for example Principal, Manager and Director.\nOnce you add a name, choosing one becomes required on every payment, so you always know who said yes.' },

  { tab: 2, target: '#auto-card', title: 'Auto dues', text: 'Choose the day of the month when every salary becomes “to pay” by itself. Change the day or switch it off whenever you like.\nPeople without permission can see this but not change it.' },
  { tab: 2, target: '#due-stats', title: 'The month at a glance', text: 'These four boxes sum up the month: what became due, what you paid, what is still left to pay, and anything paid in advance.' },
  { tab: 2, target: '#due-table', title: 'One row per person', text: 'Previous balance + Due − Paid = Balance. Whatever is left carries into next month by itself.\nPress Pay on a row to record a payment for that person.' },
  { tab: 2, target: '#due-generate', title: 'Generate dues now', text: 'Creates this month’s salaries right away, instead of waiting for the automatic day. It is safe to press twice: it never makes duplicates.' },

  { tab: 3, sub: 'add', target: '#pay-type', title: 'Two kinds of entry', text: 'Use “Cash / bank payment” when money really goes out.\nUse “Non-cash adjustment” when no cash moves but the balance should go down, for example books given to a staff member’s child.' },
  { tab: 3, sub: 'add', target: '#p-party', title: 'Pick who you paid', text: 'Choose the payee. The head and a description such as “To Ramesh Kumar” fill in by themselves. You can change them.' },
  { tab: 3, sub: 'add', target: '#p-amount', title: 'Type the amount', text: 'The line below the form shows the balance after this payment. It turns orange if you are paying more than is due.' },
  { tab: 3, sub: 'add', target: '.autobox', title: 'Date, time and your name: automatic', text: 'These are added for you and nobody can type them. That is how every entry shows who made it.' },
  { tab: 3, sub: 'list', target: '#e-presets', title: 'Payment list: find any entry', text: 'Use Today, Yesterday, Last 7 days, This month or All time. “Get Report” downloads the list to Excel.' },
  { tab: 3, sub: 'list', target: '#ent-table', title: 'Receipt, History, Reverse', text: 'Receipt prints a slip with the amount in words. History shows who entered or changed an entry. Reverse cancels a wrong entry: it stays visible but stops counting, so nothing is ever deleted and the books stay honest.\n(Edit and Reverse are for the owner.)' },

  { tab: 4, target: '#led-view', title: 'The full account', text: 'By payee: one person’s account, newest first, with the opening and closing balance on every row.\nCash book: who entered what.\nBy head: where the money went.' },
  { tab: 4, target: '#l-export', title: 'Print or export', text: 'Pick the dates, then print the page or export it to Excel.' },

  { tab: 0, title: 'You are all set', text: 'If anything is confusing later, press “? Tour” at the top, or “? How this works” at the top of any tab.' }
];

var T = null;
function tourKey() { return 'expenseTourSeen:' + (S.me ? S.me.userKey : 'x'); }
function tourMarkSeen() { try { localStorage.setItem(tourKey(), '1'); } catch (e) { /* private mode */ } }
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
  var text = typeof st.text === 'function' ? st.text() : st.text;
  var last = T.i === T.steps.length - 1;
  var tip = document.getElementById('tour-tip');
  tip.innerHTML = '<div class="tour-step">Step ' + (T.i + 1) + ' of ' + T.steps.length + '</div>' +
    '<h3 id="tour-title">' + esc(st.title) + '</h3><p>' + esc(text).replace(/\n/g, '<br>') + '</p>' +
    '<div class="tour-acts"><button class="linkbtn" type="button" id="tour-skip">' + (last ? 'Close' : 'Skip tour') + '</button>' +
    '<span class="grp">' + (T.i > 0 ? '<button class="btn ghost sm" type="button" id="tour-back">Back</button>' : '') +
    '<button class="btn sm" type="button" id="tour-next">' + (last ? 'Done' : 'Next') + '</button></span></div>';
  document.getElementById('tour-skip').onclick = function () { tourEnd(true); };
  document.getElementById('tour-next').onclick = function () { tourGo(1); };
  var back = document.getElementById('tour-back'); if (back) back.onclick = function () { tourGo(-1); };
  tip.className = 'tour-tip center'; document.getElementById('tour-hl').hidden = true;   // centered until the target is found
  setTimeout(function () { if (T && T.steps[T.i] === st) tourPlace(st); }, 220);
  setTimeout(function () { var nb = document.getElementById('tour-next'); if (nb) nb.focus(); }, 30);
}

function tourPlace(st) {
  var tip = document.getElementById('tour-tip'), hl = document.getElementById('tour-hl');
  if (!tip || !hl) return;
  var el = st.target ? document.querySelector(st.target) : null;
  if (!el || !el.getClientRects().length) { tip.className = 'tour-tip center'; hl.hidden = true; return; }
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
  try { seen = localStorage.getItem(tourKey()); } catch (e) { /* ignore */ }
  if (!S.me || seen) return;
  askConfirm('Welcome to Expense Management', 'New here? Take a quick 1-minute tour that shows what each tab is for. You can open it again any time with the “? Tour” button at the top.', 'Start the tour', 'Not now')
    .then(function (yes) { tourMarkSeen(); if (yes) tourStart('all'); });
}

/* ---- delete (only offered for things that were never used) ---- */
function deleteItem(kind, id) {
  var cfg = {
    head:  { list: S.headsAll,    path: '/heads/',    word: 'head' },
    party: { list: S.partiesAll,  path: '/parties/',  word: 'payee' },
    adv:   { list: S.advisorsAll, path: '/advisors/', word: 'name' }
  }[kind];
  var item = byId(cfg.list, id); if (!item) return;
  askConfirm('Delete this ' + cfg.word + '?', '“' + item.name + '” will be removed for good. You can only delete it because nothing has been recorded against it.', 'Delete')
    .then(function (yes) {
      if (!yes) return;
      return aDel(cfg.path + id).then(function () { toast('Deleted'); return reloadTab1(); });
    }).catch(function (e) { toast(errMsg(e), 'error'); });
}

/* ---- sub-tabs inside Tab 1 and Tab 3 ---- */
var SUBS = {
  t1: { heads: 't1-heads', payees: 't1-payees', adv: 't1-adv' },
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
  'tour-tab': function (el) { tourStart(Number(el.dataset.tab)); },
  'delete-head': function (el) { deleteItem('head', el.dataset.id); },
  'delete-party': function (el) { deleteItem('party', el.dataset.id); },
  'delete-adv': function (el) { deleteItem('adv', el.dataset.id); },
  'edit-head': function (el) { editHead(el.dataset.id); },
  'toggle-head': function (el) { toggleHead(el.dataset.id); },
  'suggest-head': function (el) { createHead(el.dataset.name, el.dataset.type).catch(function (e) { toast(errMsg(e), 'error'); }); },
  'edit-party': function (el) { editParty(el.dataset.id); },
  'toggle-party': function (el) { toggleParty(el.dataset.id); },
  'edit-adv': function (el) { editAdvisor(el.dataset.id); },
  'toggle-adv': function (el) { toggleAdvisor(el.dataset.id); },
  'pay-party': function (el) {
    setPayType('paid'); switchTab(3); setSub('t3', 'add');
    setTimeout(function () {
      $('p-party').value = el.dataset.id;
      var p = byId(S.parties, el.dataset.id);
      if (p && p.defaultHeadId && !$('p-head').value) $('p-head').value = p.defaultHeadId;
      autoDescribe(); syncPayForm(); $('p-amount').focus();
    }, 250);
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
  [].forEach.call(document.querySelectorAll('.xtab'), function (b) { b.addEventListener('click', function () { switchTab(Number(b.dataset.tab)); }); });
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el);
  });

  $('btn-tour').addEventListener('click', function () { tourStart('all'); });
  $('auto-save').addEventListener('click', saveSettings);

  // sub-tabs
  ['t1', 't3'].forEach(function (g) {
    $(g + '-subtabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-sub]'); if (b) setSub(g, b.dataset.sub); });
  });

  // tab 1
  $('head-form').addEventListener('submit', submitHead);
  $('head-inactive').addEventListener('change', renderHeads);
  $('party-mode').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (b) setPartyMode(b.dataset.mode); });
  $('staff-search').addEventListener('input', renderStaffList);
  $('party-staff-form').addEventListener('submit', submitStaffParties);
  $('ps-all').addEventListener('click', function () { [].forEach.call(document.querySelectorAll('.staff-ck'), function (c) { c.checked = true; }); });
  $('party-manual-form').addEventListener('submit', submitManualParty);
  $('party-inactive').addEventListener('change', renderParties);
  $('adv-form').addEventListener('submit', submitAdvisor);

  // tab 2
  $('due-month').addEventListener('change', function () { S.dueMonth = $('due-month').value || thisMonth(); syncDuePresets(); loadDue(); });
  $('due-presets').addEventListener('click', function (e) { var b = e.target.closest('button[data-preset]'); if (b) setDueMonth(b.dataset.preset); });
  $('due-report').addEventListener('click', exportDueReport);
  $('due-party').addEventListener('change', renderDue);
  $('due-generate').addEventListener('click', generateDues);
  $('due-add').addEventListener('click', addDue);

  // tab 3
  $('pay-type').addEventListener('click', function (e) { var b = e.target.closest('button[data-type]'); if (b) setPayType(b.dataset.type); });
  $('p-party').addEventListener('change', function () {
    var p = byId(S.parties, $('p-party').value);
    if (p && p.defaultHeadId && !$('p-head').value) $('p-head').value = p.defaultHeadId;
    autoDescribe();
    syncPayForm();
  });
  $('p-head').addEventListener('change', syncPayForm);
  $('p-amount').addEventListener('input', syncPayForm);
  $('pay-form').addEventListener('submit', submitPayment);
  $('e-presets').addEventListener('click', function (e) { var b = e.target.closest('button[data-preset]'); if (b) applyPreset(b.dataset.preset); });
  ['e-from', 'e-to'].forEach(function (id) { $(id).addEventListener('change', function () { markPreset(''); loadEntries(1); }); });
  $('e-type').addEventListener('change', function () { loadEntries(1); });
  $('e-report').addEventListener('click', exportEntriesReport);
  $('e-print').addEventListener('click', printEntries);
  $('e-q').addEventListener('input', debounce(function () { loadEntries(1); }, 350));

  // tab 4
  $('led-view').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b && !b.disabled) setLedView(b.dataset.view); });
  ['l-party', 'l-from', 'l-to'].forEach(function (id) { $(id).addEventListener('change', loadLedger); });
  $('l-print').addEventListener('click', printLedger);
  $('l-export').addEventListener('click', exportExcel);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();