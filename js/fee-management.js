'use strict';

var API_FEE_HEADS        = API_BASE_URL + '/fee/heads';
var API_FEE_STRUCTURE    = API_BASE_URL + '/fee/structure';
var API_FEE_STATUS       = API_BASE_URL + '/fee/status';
var API_FEE_PAY          = API_BASE_URL + '/fee/pay';
var API_FEE_PAY_BULK     = API_BASE_URL + '/fee/pay/bulk';
var API_TRANSPORT_ROUTES = API_BASE_URL + '/transport/routes';
var API_TRANSPORT_BUSES  = API_BASE_URL + '/transport/buses';
var API_TRANSPORT_ASSIGN = API_BASE_URL + '/transport/assign';

var MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

var feeHeads          = [];
var classes           = [];
var allStudents       = [];
var transportRoutes   = [];
var routeBusCache     = {};
var routeStuCache     = {};
var fbs               = {};
var startMonth        = 3;
var feeStatusData     = [];
var filteredStatus    = [];
var expandedStudentId = null;
var fhEditId          = null;
var currentSession    = '';
var lastReceiptData   = null;

var PAY_REG = {};
var payIdx  = 0;
function regPay(d) { var k = 'p' + (payIdx++); PAY_REG[k] = d; return k; }

var pendingSinglePay   = null;
var bulkMap            = {};
var bulkStudentId      = null;

var regBulkMap         = {};
var regBulkStudentId   = null;
var currentBulkMode    = 'transport';

var pendingMonthPay    = null;
var pendingMonthEdit   = null;
var pendingMonthDelete = null;

(function boot() {
  apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true)
    .then(function(p) {
      var s = p.data && p.data.currentAcademicYear;
      if (s) {
        currentSession = s;
      } else {
        var n = new Date(), m = n.getMonth() + 1, y = n.getFullYear();
        currentSession = m >= 4 ? (y + '-' + String(y + 1).slice(2)) : ((y - 1) + '-' + String(y).slice(2));
      }
      applySession(currentSession);
    })
    .catch(function() {
      var n = new Date(), m = n.getMonth() + 1, y = n.getFullYear();
      currentSession = m >= 4 ? (y + '-' + String(y + 1).slice(2)) : ((y - 1) + '-' + String(y).slice(2));
      applySession(currentSession);
    })
    .then(function() {
      return Promise.all([loadFeeHeads(), loadClasses(), loadTransportRoutes()]);
    });
})();

function applySession(s) {
  var parts = s.split('-');
  var label = parts[0] + ' - 20' + parts[1];
  document.getElementById('header-session-badge').textContent = label;
  document.getElementById('st-session').value = s;
  document.getElementById('tab4-session-pill').textContent = 'Session: ' + label;
  buildSessionDropdown(s);
}

function buildSessionDropdown(active) {
  var y1 = parseInt(active.split('-')[0]);
  var sessions = [
    (y1 - 1) + '-' + String(y1).slice(2),
    y1 + '-' + String(y1 + 1).slice(2),
    (y1 + 1) + '-' + String(y1 + 2).slice(2)
  ];
  var sel = document.getElementById('fs-session');
  sel.innerHTML = sessions.map(function(s) {
    var p = s.split('-');
    return '<option value="' + s + '"' + (s === active ? ' selected' : '') + '>' +
      p[0] + ' - 20' + p[1] + (s === active ? ' (Current)' : '') + '</option>';
  }).join('');
}

function loadFeeHeads() {
  return apiGet(API_FEE_HEADS, true)
    .then(function(r) { feeHeads = r.data || []; renderFeeHeadList(); })
    .catch(function(e) { document.getElementById('fh-list').innerHTML = '<div class="fm-empty"><div class="ei">!</div>' + escH(e.message) + '</div>'; });
}

function loadClasses() {
  return apiGet(API_ENDPOINTS.CLASSES, true)
    .then(function(r) { classes = (r.data || []).filter(function(c) { return c.isActive !== false; }); populateClassDropdowns(); })
    .catch(function() { toast('Failed to load classes', 'error'); });
}

function loadTransportRoutes() {
  return apiGet(API_TRANSPORT_ROUTES, true)
    .then(function(r) { transportRoutes = r.data || []; renderRoutesList(); })
    .catch(function(e) { document.getElementById('routes-list').innerHTML = '<div class="fm-card"><div class="fm-empty">!' + escH(e.message) + '</div></div>'; });
}

function loadAllStudents() {
  return apiGet(API_ENDPOINTS.STUDENTS + '?limit=2000&isActive=true', true)
    .then(function(r) {
      allStudents = r.data || [];
      if (r.total && r.total > allStudents.length) {
        console.warn('loadAllStudents: total=' + r.total + ' but only fetched ' + allStudents.length);
      }
    })
    .catch(function() { toast('Failed to load students', 'error'); });
}

function switchTab(n) {
  [1, 2, 3, 4].forEach(function(i) {
    document.getElementById('tab' + i).style.display = i === n ? 'block' : 'none';
    document.getElementById('tab' + i + '-btn').classList.toggle('active', i === n);
  });
  if (n === 3) initFeeSetupTab();
  if (n === 4) populateClassDropdowns();
}

function renderFeeHeadList() {
  var el = document.getElementById('fh-list');
  if (!feeHeads.length) { el.innerHTML = '<div class="fm-empty"><div class="ei">?</div>No fee heads yet.</div>'; return; }
  el.innerHTML = feeHeads.map(function(fh) {
    return '<div class="fh-item">' +
      '<span class="color-dot ' + fh.color + '"></span>' +
      '<div style="flex:1"><div class="fh-name">' + escH(fh.name) + '</div>' +
      (fh.description ? '<div class="fh-desc">' + escH(fh.description) + '</div>' : '') +
      '</div><div class="fh-actions">' +
      '<button class="btn-edit" onclick="editFH(\'' + fh._id + '\')">Edit</button>' +
      '<button class="btn-danger" onclick="deleteFH(\'' + fh._id + '\')">Del</button>' +
      '</div></div>';
  }).join('');
}

function saveFeeHead() {
  var name  = document.getElementById('fh-name').value.trim();
  var desc  = document.getElementById('fh-desc').value.trim();
  var color = (document.querySelector('input[name="fh-color"]:checked') || {}).value || 'dot-blue';
  if (!name) { toast('Name required', 'error'); return; }
  var btn = document.getElementById('fh-save-btn');
  setLoading(btn, true);
  var p = fhEditId
    ? apiPut(API_FEE_HEADS + '/' + fhEditId, {name: name, description: desc, color: color}, true)
    : apiPost(API_FEE_HEADS, {name: name, description: desc, color: color}, true);
  p.then(function() {
    if (fhEditId) { toast('Updated'); cancelEditFH(); }
    else { toast('Fee head added'); document.getElementById('fh-name').value = ''; document.getElementById('fh-desc').value = ''; }
    return loadFeeHeads();
  }).catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = fhEditId ? 'Save Changes' : '+ Add Fee Head'; });
}

function editFH(id) {
  var fh = feeHeads.find(function(f) { return f._id === id; });
  if (!fh) return;
  fhEditId = id;
  document.getElementById('fh-name').value = fh.name;
  document.getElementById('fh-desc').value = fh.description || '';
  var r = document.querySelector('input[name="fh-color"][value="' + fh.color + '"]');
  if (r) r.checked = true;
  document.getElementById('fh-form-title').textContent = 'Edit Fee Head';
  document.getElementById('fh-save-btn').innerHTML = 'Save Changes';
  document.getElementById('fh-cancel-btn').style.display = 'inline-flex';
  document.getElementById('fh-form-card').scrollIntoView({behavior: 'smooth', block: 'start'});
}

function cancelEditFH() {
  fhEditId = null;
  document.getElementById('fh-name').value = '';
  document.getElementById('fh-desc').value = '';
  document.getElementById('fh-form-title').textContent = 'Create Fee Head';
  document.getElementById('fh-save-btn').innerHTML = '+ Add Fee Head';
  document.getElementById('fh-cancel-btn').style.display = 'none';
}

function deleteFH(id) {
  if (!confirm('Delete this fee head?')) return;
  apiDelete(API_FEE_HEADS + '/' + id, true)
    .then(function() { toast('Deleted'); return loadFeeHeads(); })
    .catch(function(e) { toast(e.message, 'error'); });
}

function addRoute() {
  var name   = document.getElementById('rt-name').value.trim();
  var from   = document.getElementById('rt-from').value.trim();
  var to     = document.getElementById('rt-to').value.trim();
  var amount = parseInt(document.getElementById('rt-amount').value) || 0;
  if (!name || !from || !to) { toast('Name, From, To required', 'error'); return; }
  if (!amount || amount < 1) { toast('Enter valid amount', 'error'); return; }
  var btn = document.getElementById('add-route-btn');
  setLoading(btn, true);
  apiPost(API_TRANSPORT_ROUTES, {name: name, from: from, to: to, amount: amount}, true)
    .then(function() {
      toast('Route added');
      ['rt-name', 'rt-from', 'rt-to', 'rt-amount'].forEach(function(id) { document.getElementById(id).value = ''; });
      return loadTransportRoutes();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Add Route'; });
}

function renderRoutesList() {
  var el = document.getElementById('routes-list');
  if (!transportRoutes.length) { el.innerHTML = '<div class="fm-card"><div class="fm-empty"><div class="ei">?</div>No routes yet.</div></div>'; return; }
  el.innerHTML = transportRoutes.map(function(rt) {
    return '<div class="route-card" id="rc-' + rt._id + '">' +
      '<div class="route-header" onclick="toggleRoute(\'' + rt._id + '\')">' +
      '<div class="route-icon">&#128652;</div>' +
      '<div class="route-info"><div class="route-name">' + escH(rt.name) + '</div>' +
      '<div class="route-path"><span>' + escH(rt.from) + '</span><span class="arrow">&#8594;</span><span>' + escH(rt.to) + '</span></div></div>' +
      '<div class="route-badges"><span class="rb rb-amount">Rs.' + (rt.amount || 0).toLocaleString() + '/mo</span>' +
      '<span class="rb rb-buses" id="rbc-' + rt._id + '">...</span>' +
      '<span class="rb rb-students" id="rsc-' + rt._id + '">...</span></div>' +
      '<div class="route-actions" onclick="event.stopPropagation()">' +
      '<button class="btn-edit" onclick="openEditRouteModal(\'' + rt._id + '\')">Edit</button>' +
      '<button class="btn-danger" onclick="deleteRoute(\'' + rt._id + '\')">Del</button></div>' +
      '<div class="route-chevron">&#9660;</div></div>' +
      '<div class="route-body" id="rb-' + rt._id + '"><div class="fm-empty" style="padding:14px 0">Loading...</div></div>' +
      '</div>';
  }).join('');
  transportRoutes.forEach(function(rt) { loadRouteStats(rt._id); });
}

function loadRouteStats(rid) {
  return Promise.all([
    apiGet(API_TRANSPORT_BUSES + '?routeId=' + rid, true),
    apiGet(API_TRANSPORT_ASSIGN + '?routeId=' + rid, true)
  ]).then(function(results) {
    routeBusCache[rid] = results[0].data || [];
    routeStuCache[rid] = results[1].data || [];
    var bc = document.getElementById('rbc-' + rid);
    var sc = document.getElementById('rsc-' + rid);
    if (bc) bc.textContent = routeBusCache[rid].length + ' bus' + (routeBusCache[rid].length !== 1 ? 'es' : '');
    if (sc) sc.textContent = routeStuCache[rid].length + ' student' + (routeStuCache[rid].length !== 1 ? 's' : '');
  }).catch(function(e) { console.error('loadRouteStats:', e); });
}

function toggleRoute(rid) {
  var card = document.getElementById('rc-' + rid);
  if (card.classList.toggle('expanded')) renderRouteBody(rid);
}

function renderRouteBody(rid) {
  var buses = routeBusCache[rid] || [];
  var stus  = routeStuCache[rid] || [];
  var html  = '<div class="sec-title">Buses</div>';
  if (buses.length) {
    html += '<div class="bus-grid">' + buses.map(function(b) {
      return '<div class="bus-card">' +
        (b.busNumber ? '<div class="bus-num">' + escH(b.busNumber) + '</div>' : '<div class="bus-num-empty">No Bus No.</div>') +
        '<div class="bus-detail">Driver: ' + escH(b.driverName) + '</div>' +
        '<div class="bus-detail">Ph: ' + escH(b.driverContact) + '</div>' +
        (b.capacity ? '<div class="bus-detail">Seats: ' + b.capacity + '</div>' : '') +
        '<div style="display:flex;gap:5px;margin-top:8px">' +
        '<button class="btn-edit" onclick="openBusModal(\'' + rid + '\',\'' + b._id + '\')">Edit</button>' +
        '<button class="btn-danger" onclick="deleteBus(\'' + b._id + '\',\'' + rid + '\')">Del</button>' +
        '</div></div>';
    }).join('') + '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text3);padding:5px 0 11px">No buses added.</div>';
  }
  html += '<button class="add-bus-btn" onclick="openBusModal(\'' + rid + '\',null)">+ Add Bus</button>';
  html += '<div class="sec-title" style="margin-top:16px">Assigned Students</div>';
  if (stus.length) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:9px">' + stus.map(function(s) {
      var nm = (s.student && s.student.name) ? s.student.name : '?';
      var cn = (s.student && s.student.class && s.student.class.className) ? s.student.class.className : '';
      return '<div class="stu-chip-sm"><div class="stu-av-sm">' + nm.charAt(0).toUpperCase() + '</div>' +
        escH(nm) + '<span style="color:var(--text3);font-size:10px">' + escH(cn) + '</span>' +
        '<span class="stu-chip-remove" onclick="removeAssignment(\'' + s._id + '\',\'' + rid + '\')">X</span></div>';
    }).join('') + '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text3);padding:5px 0 9px">No students assigned.</div>';
  }
  html += '<button class="btn-green" onclick="openAssignModal(\'' + rid + '\')">+ Assign Students</button>';
  document.getElementById('rb-' + rid).innerHTML = html;
}

function openEditRouteModal(id) {
  var rt = transportRoutes.find(function(r) { return r._id === id; });
  if (!rt) return;
  document.getElementById('er-id').value     = id;
  document.getElementById('er-name').value   = rt.name;
  document.getElementById('er-amount').value = rt.amount;
  document.getElementById('er-from').value   = rt.from;
  document.getElementById('er-to').value     = rt.to;
  openModal('edit-route-modal');
}

function saveEditRoute() {
  var id     = document.getElementById('er-id').value;
  var name   = document.getElementById('er-name').value.trim();
  var amount = parseInt(document.getElementById('er-amount').value) || 0;
  var from   = document.getElementById('er-from').value.trim();
  var to     = document.getElementById('er-to').value.trim();
  if (!name || !from || !to || !amount) { toast('All fields required', 'error'); return; }
  var btn = document.getElementById('er-save-btn');
  setLoading(btn, true);
  apiPut(API_TRANSPORT_ROUTES + '/' + id, {name: name, amount: amount, from: from, to: to}, true)
    .then(function() {
      toast('Route updated \u2014 fee status will now reflect the new amount automatically');
      closeModal('edit-route-modal');
      return loadTransportRoutes();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save'; });
}

function deleteRoute(id) {
  if (!confirm('Delete this route?')) return;
  apiDelete(API_TRANSPORT_ROUTES + '/' + id, true)
    .then(function() { toast('Route deleted'); return loadTransportRoutes(); })
    .catch(function(e) { toast(e.message, 'error'); });
}

function openBusModal(rid, busId) {
  document.getElementById('bm-route-id').value = rid;
  document.getElementById('bm-bus-id').value   = busId || '';
  if (busId) {
    var b = (routeBusCache[rid] || []).find(function(x) { return x._id === busId; });
    document.getElementById('bm-num').value      = (b && b.busNumber)     || '';
    document.getElementById('bm-capacity').value = (b && b.capacity)      || '';
    document.getElementById('bm-driver').value   = (b && b.driverName)    || '';
    document.getElementById('bm-contact').value  = (b && b.driverContact) || '';
    document.getElementById('bus-modal-title').textContent = 'Edit Bus';
  } else {
    ['bm-num', 'bm-capacity', 'bm-driver', 'bm-contact'].forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('bus-modal-title').textContent = 'Add Bus';
  }
  openModal('bus-modal');
}

function saveBus() {
  var rid           = document.getElementById('bm-route-id').value;
  var bid           = document.getElementById('bm-bus-id').value;
  var busNumber     = document.getElementById('bm-num').value.trim().toUpperCase() || null;
  var capacity      = parseInt(document.getElementById('bm-capacity').value) || null;
  var driverName    = document.getElementById('bm-driver').value.trim();
  var driverContact = document.getElementById('bm-contact').value.trim();
  if (!driverName || !driverContact) { toast('Driver name and contact required', 'error'); return; }
  var btn = document.getElementById('bm-save-btn');
  setLoading(btn, true);
  var p = bid
    ? apiPut(API_TRANSPORT_BUSES + '/' + bid, {busNumber: busNumber, capacity: capacity, driverName: driverName, driverContact: driverContact}, true)
    : apiPost(API_TRANSPORT_BUSES, {routeId: rid, busNumber: busNumber, capacity: capacity, driverName: driverName, driverContact: driverContact}, true);
  p.then(function() {
    toast(bid ? 'Bus updated' : 'Bus added');
    closeModal('bus-modal');
    return loadRouteStats(rid);
  }).then(function() {
    var card = document.getElementById('rc-' + rid);
    if (card && card.classList.contains('expanded')) renderRouteBody(rid);
  }).catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save Bus'; });
}

function deleteBus(bid, rid) {
  if (!confirm('Delete this bus?')) return;
  apiDelete(API_TRANSPORT_BUSES + '/' + bid, true)
    .then(function() {
      toast('Bus deleted');
      return loadRouteStats(rid);
    }).then(function() {
      var card = document.getElementById('rc-' + rid);
      if (card && card.classList.contains('expanded')) renderRouteBody(rid);
    }).catch(function(e) { toast(e.message, 'error'); });
}

function openAssignModal(rid) {
  allStudents = [];
  return loadAllStudents().then(function() {
    document.getElementById('am-route-id').value = rid;
    var rt = transportRoutes.find(function(r) { return r._id === rid; });
    document.getElementById('assign-modal-sub').textContent = 'Assigning to: ' + ((rt && rt.name) || 'Route');
    var amCls = document.getElementById('am-class');
    amCls.innerHTML = '<option value="">All Classes</option>' + classes.map(function(c) {
      return '<option value="' + c._id + '">' + escH(c.className) + '</option>';
    }).join('');
    document.getElementById('am-search').value = '';
    filterAssignStudents();
    openModal('assign-modal');
  });
}

function filterAssignStudents() {
  var cls    = document.getElementById('am-class').value;
  var search = document.getElementById('am-search').value.toLowerCase().trim();
  var rid    = document.getElementById('am-route-id').value;
  var assigned = (routeStuCache[rid] || []).map(function(a) {
    return String(a.studentId || (a.student && a.student._id));
  });
  var list = allStudents.filter(function(s) {
    if (cls) {
      var cid = s.classId && s.classId._id ? String(s.classId._id) : String(s.classId || '');
      if (cid !== String(cls)) return false;
    }
    if (search) {
      if (!(s.name && s.name.toLowerCase().includes(search)) && !String(s.rollNo || '').includes(search)) return false;
    }
    return true;
  });
  var el = document.getElementById('assign-student-list');
  if (!list.length) { el.innerHTML = '<div class="fm-empty">No students found.</div>'; return; }
  el.innerHTML = list.map(function(s) {
    var isOn = assigned.includes(String(s._id));
    var cn = (s.classId && s.classId.className) || (s.class && s.class.className) || '';
    return '<label style="display:flex;align-items:center;gap:8px;padding:8px 11px;border:1.5px solid ' + (isOn ? '#c7d2fe' : 'var(--border)') + ';border-radius:9px;cursor:pointer;background:' + (isOn ? '#eef2ff' : '#fff') + '">' +
      '<input type="checkbox" value="' + s._id + '" ' + (isOn ? 'checked' : '') + ' style="accent-color:var(--brand);width:15px;height:15px;flex-shrink:0">' +
      '<div style="width:30px;height:30px;border-radius:8px;background:var(--brand-grad);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;flex-shrink:0">' + s.name.charAt(0).toUpperCase() + '</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">' + escH(s.name) + '</div>' +
      '<div style="font-size:11px;color:var(--text3)">' + escH(cn) + (s.rollNo ? ' Roll ' + s.rollNo : '') + '</div></div>' +
      (isOn ? '<span style="font-size:10px;font-weight:800;color:var(--brand);background:#eef2ff;border-radius:4px;padding:1px 6px">On Route</span>' : '') +
      '</label>';
  }).join('');
}

function saveAssignments() {
  var rid     = document.getElementById('am-route-id').value;
  var session = currentSession || '2026-27';
  var checked = Array.from(document.querySelectorAll('#assign-student-list input[type=checkbox]:checked')).map(function(i) { return i.value; });
  var btn = document.getElementById('am-save-btn');
  setLoading(btn, true);
  apiPost(API_TRANSPORT_ASSIGN, {routeId: rid, studentIds: checked, session: session}, true)
    .then(function() {
      toast(checked.length + ' student(s) saved');
      closeModal('assign-modal');
      routeStuCache[rid] = null;
      return loadRouteStats(rid);
    }).then(function() {
      var card = document.getElementById('rc-' + rid);
      if (card && card.classList.contains('expanded')) renderRouteBody(rid);
    }).catch(function(e) { toast(e.message, 'error'); })
      .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save'; });
}

function removeAssignment(aid, rid) {
  if (!confirm('Remove from route?')) return;
  apiDelete(API_TRANSPORT_ASSIGN + '/' + aid, true)
    .then(function() {
      toast('Removed');
      routeStuCache[rid] = null;
      return loadRouteStats(rid);
    }).then(function() { renderRouteBody(rid); })
      .catch(function(e) { toast(e.message, 'error'); });
}

function initFeeSetupTab() {
  initBuilderState();
  renderFeeBuilder();
  updateTransportNote();
  var session = document.getElementById('fs-session').value;
  if (session) loadExistingStructure(session);
}

function getSessionMonths() {
  var months = [];
  for (var i = 0; i < 12; i++) months.push((startMonth + i) % 12);
  return months;
}

function initBuilderState() {
  feeHeads.forEach(function(fh) {
    if (!fbs[fh._id]) fbs[fh._id] = {name: fh.name, color: fh.color, enabled: false, amount: '', classIds: [], dueMonths: []};
  });
}

function onSessionChange() {
  var session = document.getElementById('fs-session').value;
  if (!session) return;
  Object.keys(fbs).forEach(function(k) { fbs[k].enabled = false; fbs[k].amount = ''; fbs[k].classIds = []; fbs[k].dueMonths = []; });
  renderFeeBuilder();
  buildPreview();
  loadExistingStructure(session);
}

function onStartMonthChange() {
  startMonth = parseInt(document.getElementById('fs-start-month').value) || 3;
  feeHeads.forEach(function(fh) { if (fbs[fh._id] && fbs[fh._id].enabled) renderFBMonths(fh._id); });
  buildPreview();
}

function loadExistingStructure(session) {
  return apiGet(API_FEE_STRUCTURE + '?session=' + encodeURIComponent(session), true)
    .then(function(res) {
      if (!res.data) return;
      var s = res.data;
      if (s.startMonth !== undefined) {
        startMonth = s.startMonth;
        document.getElementById('fs-start-month').value = s.startMonth;
      }
      (s.entries || []).forEach(function(e) {
        var id = String((e.feeHeadId && e.feeHeadId._id) ? e.feeHeadId._id : e.feeHeadId);
        if (fbs[id]) {
          fbs[id].enabled   = true;
          fbs[id].amount    = e.amount;
          fbs[id].classIds  = (e.classIds || []).map(function(c) { return String(c && c._id ? c._id : c); });
          fbs[id].dueMonths = Array.from(e.dueMonths || []);
        }
      });
      renderFeeBuilder();
      buildPreview();
      toast('Structure loaded');
    }).catch(function(e) { console.error('loadExistingStructure:', e); });
}

function updateTransportNote() {
  var el = document.getElementById('transport-note-text');
  if (!el) return;
  if (!transportRoutes.length) { el.textContent = 'No transport routes. Add routes in Tab 2 first.'; return; }
  el.textContent = 'Transport fees auto-added: ' + transportRoutes.map(function(r) { return r.name + ' (Rs.' + r.amount + '/mo)'; }).join(', ');
}

function renderFeeBuilder() {
  var el = document.getElementById('reg-builder-list');
  if (!feeHeads.length) { el.innerHTML = '<div class="builder-empty">No fee heads. Add in Tab 1.</div>'; return; }
  el.innerHTML = feeHeads.map(function(fh) {
    var s   = fbs[fh._id] || {};
    var sum = fbSummary(fh._id);
    return '<div class="fb-card ' + (s.enabled ? 'on' : '') + '" id="fbc-' + fh._id + '">' +
      '<div class="fb-header" onclick="toggleFBCard(\'' + fh._id + '\')">' +
      '<label class="toggle-wrap" onclick="event.stopPropagation()">' +
      '<div class="toggle-sw"><input type="checkbox" id="fbtog-' + fh._id + '" ' + (s.enabled ? 'checked' : '') +
      ' onchange="onFBToggle(\'' + fh._id + '\',this.checked)"><div class="slider"></div></div></label>' +
      '<span class="color-dot ' + fh.color + '"></span>' +
      '<div class="fb-title">' + escH(fh.name) + '</div>' +
      '<div class="fb-summary ' + (s.enabled && sum ? 'ok' : '') + '" id="fbsum-' + fh._id + '">' + (sum || (s.enabled ? 'Configure below' : 'Off')) + '</div>' +
      '</div>' +
      '<div class="fb-body" ' + (s.enabled ? '' : 'style="display:none"') + '>' +
      '<div class="fm-grid-2" style="margin-bottom:13px">' +
      '<div class="fm-form-group" style="margin-bottom:0"><label class="fm-label">Amount per month</label>' +
      '<input type="number" id="fbamt-' + fh._id + '" class="fm-input" placeholder="e.g. 1500" min="1" value="' + (s.amount || '') + '"' +
      ' oninput="onFbAmtInput(\'' + fh._id + '\',this.value)"></div></div>' +
      '<div class="fm-form-group"><label class="fm-label">Applicable Classes</label><div class="chip-grid" id="fbcls-' + fh._id + '"></div></div>' +
      '<div class="fm-form-group" style="margin-bottom:0"><label class="fm-label">Due Months</label><div class="month-grid" id="fbmon-' + fh._id + '"></div></div>' +
      '</div></div>';
  }).join('');
  feeHeads.forEach(function(fh) { if (fbs[fh._id] && fbs[fh._id].enabled) { renderFBClasses(fh._id); renderFBMonths(fh._id); } });
}

function onFbAmtInput(fhId, val) {
  fbs[fhId].amount = parseInt(val) || '';
  updateFBSummary(fhId);
  buildPreview();
}

function toggleFBCard(id) {
  if (!fbs[id] || !fbs[id].enabled) return;
  var b = document.querySelector('#fbc-' + id + ' .fb-body');
  if (b) b.style.display = b.style.display === 'none' ? 'block' : 'none';
}

function onFBToggle(id, checked) {
  if (!fbs[id]) return;
  fbs[id].enabled = checked;
  var card = document.getElementById('fbc-' + id);
  if (card) card.classList.toggle('on', checked);
  var b = document.querySelector('#fbc-' + id + ' .fb-body');
  if (b) b.style.display = checked ? 'block' : 'none';
  updateFBSummary(id);
  if (checked) { renderFBClasses(id); renderFBMonths(id); }
  buildPreview();
}

function renderFBClasses(id) {
  var el = document.getElementById('fbcls-' + id);
  if (!el) return;
  var s      = fbs[id] || {};
  var allSel = classes.length > 0 && s.classIds.length === classes.length;
  var html   = '<div class="c-chip all-c ' + (allSel ? 'selected' : '') + '" onclick="fbToggleAllCls(\'' + id + '\')">' +
    '<div class="cb"></div>All</div>';
  html += classes.map(function(c) {
    var sel = s.classIds.indexOf(String(c._id)) > -1;
    return '<div class="c-chip ' + (sel ? 'selected' : '') + '" onclick="fbToggleCls(\'' + id + '\',\'' + c._id + '\')">' +
      '<div class="cb"></div>' + escH(c.className) + '</div>';
  }).join('');
  el.innerHTML = html;
}

function fbToggleCls(id, cid) {
  var s = fbs[id]; if (!s) return;
  var idx = s.classIds.indexOf(String(cid));
  if (idx > -1) s.classIds.splice(idx, 1); else s.classIds.push(String(cid));
  renderFBClasses(id); updateFBSummary(id); buildPreview();
}

function fbToggleAllCls(id) {
  var s = fbs[id]; if (!s) return;
  s.classIds = s.classIds.length === classes.length ? [] : classes.map(function(c) { return String(c._id); });
  renderFBClasses(id); updateFBSummary(id); buildPreview();
}

function renderFBMonths(id) {
  var el = document.getElementById('fbmon-' + id);
  if (!el) return;
  var s      = fbs[id] || {};
  var months = getSessionMonths();
  var html   = '<div class="m-chip all-m ' + (s.dueMonths.length === 12 ? 'selected' : '') + '" onclick="fbToggleAllMon(\'' + id + '\')">All</div>';
  html += months.map(function(m) {
    return '<div class="m-chip ' + (s.dueMonths.indexOf(m) > -1 ? 'selected' : '') + '" onclick="fbToggleMon(\'' + id + '\',' + m + ')">' + SHORT_MONTHS[m] + '</div>';
  }).join('');
  el.innerHTML = html;
}

function fbToggleMon(id, m) {
  var s = fbs[id]; if (!s) return;
  var idx = s.dueMonths.indexOf(m);
  if (idx > -1) s.dueMonths.splice(idx, 1); else s.dueMonths.push(m);
  renderFBMonths(id); updateFBSummary(id); buildPreview();
}

function fbToggleAllMon(id) {
  var s = fbs[id]; if (!s) return;
  s.dueMonths = s.dueMonths.length === 12 ? [] : getSessionMonths();
  renderFBMonths(id); updateFBSummary(id); buildPreview();
}

function fbSummary(id) {
  var s = fbs[id];
  if (!s || !s.enabled || !s.amount || !s.classIds.length || !s.dueMonths.length) return '';
  var cls = s.classIds.length === classes.length ? 'All Classes' : s.classIds.length + ' class' + (s.classIds.length > 1 ? 'es' : '');
  return 'Rs.' + Number(s.amount).toLocaleString() + ' / ' + cls + ' / ' + s.dueMonths.length + 'mo';
}

function updateFBSummary(id) {
  var el = document.getElementById('fbsum-' + id);
  if (!el) return;
  var s = fbSummary(id);
  el.textContent = s || ((fbs[id] && fbs[id].enabled) ? 'Configure below' : 'Off');
  el.className = 'fb-summary' + (s ? ' ok' : '');
}

function buildPreview() {
  var active = feeHeads.filter(function(fh) {
    var s = fbs[fh._id];
    return s && s.enabled && s.amount && s.classIds && s.classIds.length && s.dueMonths && s.dueMonths.length;
  });
  var pc = document.getElementById('preview-card');
  if (!active.length) { pc.style.display = 'none'; return; }
  pc.style.display = 'block';

  var classMap = {};
  active.forEach(function(fh) {
    var s = fbs[fh._id];
    s.classIds.forEach(function(cid) {
      if (!classMap[cid]) classMap[cid] = {};
      classMap[cid][fh._id] = {amount: s.amount, months: s.dueMonths};
    });
  });

  var thead = document.querySelector('#preview-table thead');
  var tbody = document.querySelector('#preview-table tbody');
  thead.innerHTML = '<tr><th>Class</th>' + active.map(function(fh) { return '<th>' + escH(fh.name) + '</th>'; }).join('') + '<th>Transport</th><th>Actions</th></tr>';

  var session = document.getElementById('fs-session').value;
  var rows = '';
  Object.keys(classMap).forEach(function(cid) {
    var fhMap   = classMap[cid];
    var cls     = classes.find(function(c) { return String(c._id) === cid; });
    var clsName = (cls && cls.className) || cid;
    var cells   = active.map(function(fh) {
      var d = fhMap[fh._id];
      if (!d) return '<td style="color:var(--text3);font-size:12px">-</td>';
      return '<td class="amount-mono">Rs.' + Number(d.amount).toLocaleString() + ' x ' + d.months.length + '<br>' +
        d.months.map(function(m) { return '<span class="month-tag">' + SHORT_MONTHS[m] + '</span>'; }).join('') + '</td>';
    }).join('');
    var rtNote = transportRoutes.length
      ? '<td style="font-size:11px;color:var(--orange);font-weight:700">Auto per student</td>'
      : '<td style="color:var(--text3);font-size:11px">-</td>';
    rows += '<tr><td><span class="class-badge" onclick="openClassBreakdown(\'' + cid + '\',\'' + escA(clsName) + '\',\'' + session + '\')">' + escH(clsName) + '</span></td>' +
      cells + rtNote +
      '<td><div style="display:flex;gap:5px">' +
      '<button class="btn-edit" onclick="openEditEntryModal(\'' + cid + '\',\'' + escA(clsName) + '\')">Edit</button>' +
      '<button class="btn-danger" onclick="removeClassFromEntries(\'' + cid + '\',\'' + escA(clsName) + '\')">Del</button>' +
      '</div></td></tr>';
  });
  tbody.innerHTML = rows || '<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:13px;font-size:12px">Toggle on fee heads to see preview.</td></tr>';
}

function openEditEntryModal(cid, clsName) {
  var activeFHs = feeHeads.filter(function(fh) {
    return fbs[fh._id] && fbs[fh._id].enabled && (fbs[fh._id].classIds || []).indexOf(String(cid)) > -1;
  });
  if (!activeFHs.length) { toast('No fee heads for this class', 'error'); return; }
  document.getElementById('eem-sub').textContent = 'Editing fees for: ' + clsName;
  var clsEl = document.getElementById('eem-classes');
  var monEl = document.getElementById('eem-months');
  var months = getSessionMonths();
  var dynArea = document.getElementById('eem-dyn-area');
  if (!dynArea) {
    dynArea = document.createElement('div');
    dynArea.id = 'eem-dyn-area';
    document.getElementById('eem-amount').parentElement.after(dynArea);
  }
  dynArea.innerHTML = activeFHs.map(function(fh) {
    var s = fbs[fh._id];
    return '<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="color-dot ' + fh.color + '"></span><span style="font-size:13px;font-weight:800">' + escH(fh.name) + '</span></div>' +
      '<div class="fm-form-group" style="margin-bottom:10px"><label class="fm-label">Amount per month</label>' +
      '<input type="number" id="eem-amt-' + fh._id + '" class="fm-input" value="' + (s.amount || '') + '" min="1"' +
      ' oninput="onEemAmtInput(\'' + fh._id + '\',this.value)"></div>' +
      '<label class="fm-label">Due Months</label>' +
      '<div class="month-grid" style="margin-top:5px">' +
      months.map(function(m) {
        return '<div class="m-chip ' + (s.dueMonths.indexOf(m) > -1 ? 'selected' : '') + '" onclick="eemToggleMon(\'' + fh._id + '\',' + m + ',this)">' + SHORT_MONTHS[m] + '</div>';
      }).join('') + '</div></div>';
  }).join('');
  document.getElementById('eem-amount').style.display = 'none';
  clsEl.parentElement.style.display = 'none';
  monEl.parentElement.style.display = 'none';
  openModal('edit-entry-modal');
}

function onEemAmtInput(fhId, val) {
  fbs[fhId].amount = parseInt(val) || '';
  buildPreview();
}

function eemToggleMon(fhId, m, el) {
  var s = fbs[fhId]; if (!s) return;
  var idx = s.dueMonths.indexOf(m);
  if (idx > -1) { s.dueMonths.splice(idx, 1); el.classList.remove('selected'); }
  else { s.dueMonths.push(m); el.classList.add('selected'); }
  updateFBSummary(fhId); buildPreview();
}

function saveEditEntry() { renderFeeBuilder(); buildPreview(); closeModal('edit-entry-modal'); toast('Updated'); }

function removeClassFromEntries(cid, clsName) {
  if (!confirm('Remove "' + clsName + '" from all fee entries?')) return;
  feeHeads.forEach(function(fh) {
    if (fbs[fh._id]) fbs[fh._id].classIds = fbs[fh._id].classIds.filter(function(id) { return id !== String(cid); });
  });
  renderFeeBuilder(); buildPreview(); toast(clsName + ' removed');
}

function openClassBreakdown(cid, clsName, session) {
  document.getElementById('cbm-title').textContent = clsName + ' Fee Breakdown';
  document.getElementById('cbm-sub').textContent   = 'Session: ' + session;
  var thead = document.querySelector('#cls-bk-table thead');
  var tbody = document.querySelector('#cls-bk-table tbody');
  var activeFHs = feeHeads.filter(function(fh) {
    return fbs[fh._id] && fbs[fh._id].enabled && (fbs[fh._id].classIds || []).indexOf(String(cid)) > -1;
  });
  thead.innerHTML = '<tr><th>Student</th>' + activeFHs.map(function(fh) { return '<th>' + escH(fh.name) + '</th>'; }).join('') + '<th>Transport</th><th>Total/Year</th></tr>';
  tbody.innerHTML = '<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:14px">Loading...</td></tr>';
  openModal('cls-breakdown-modal');

  var stuPromise = allStudents.length
    ? Promise.resolve({data: allStudents.filter(function(s) {
        var v = s.classId && s.classId._id ? String(s.classId._id) : String(s.classId || '');
        return v === String(cid);
      })})
    : apiGet(API_ENDPOINTS.STUDENTS + '?classId=' + cid + '&limit=500', true);

  var rNF = transportRoutes.filter(function(rt) { return !routeStuCache[rt._id]; });
  var fetchPromise = rNF.length ? Promise.all(rNF.map(function(rt) { return loadRouteStats(rt._id); })) : Promise.resolve();

  fetchPromise.then(function() { return stuPromise; })
    .then(function(stuRes) {
      var students = stuRes.data || [];
      var aMap = {};
      transportRoutes.forEach(function(rt) {
        (routeStuCache[rt._id] || []).forEach(function(a) {
          var sid = String(a.studentId || (a.student && a.student._id));
          aMap[sid] = {routeId: rt._id, routeName: rt.name, routeAmount: rt.amount};
        });
      });
      if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:14px">No students.</td></tr>';
        return;
      }
      tbody.innerHTML = students.map(function(stu) {
        var total = 0;
        var cells = activeFHs.map(function(fh) {
          var s  = fbs[fh._id];
          var ya = s.amount * s.dueMonths.length;
          total += ya;
          return '<td class="mono">Rs.' + Number(s.amount).toLocaleString() + '/mo<br><span style="font-size:10px;color:var(--text3)">' + s.dueMonths.length + 'mo = Rs.' + ya.toLocaleString() + '</span></td>';
        }).join('');
        var assign = aMap[String(stu._id)];
        var tCell  = '<td style="color:var(--text3);font-size:11px;font-weight:600">-</td>';
        if (assign) {
          var tA = assign.routeAmount || 0;
          total += tA * 12;
          tCell = '<td class="transport-cell">Rs.' + tA.toLocaleString() + '/mo<br><span style="font-size:10px;color:var(--text3)">' + escH(assign.routeName || '') + '</span></td>';
        }
        return '<tr><td style="font-weight:700">' + escH(stu.name) + (stu.rollNo ? '<br><span style="font-size:10px;color:var(--text3)">Roll ' + stu.rollNo + '</span>' : '') + '</td>' + cells + tCell + '<td class="total-cell">Rs.' + total.toLocaleString() + '</td></tr>';
      }).join('');
    }).catch(function(e) {
      tbody.innerHTML = '<tr><td colspan="99" style="text-align:center;color:var(--red);padding:14px">' + escH(e.message) + '</td></tr>';
    });
}

function saveFeeStructure() {
  var session = document.getElementById('fs-session').value;
  var sm      = parseInt(document.getElementById('fs-start-month').value) || 3;
  if (!session) { toast('Session not loaded yet', 'error'); return; }
  var entries = [];
  for (var i = 0; i < feeHeads.length; i++) {
    var fh = feeHeads[i];
    var s  = fbs[fh._id];
    if (!s || !s.enabled) continue;
    if (!s.amount || s.amount < 1) { toast('Enter amount for "' + fh.name + '"', 'error'); return; }
    if (!s.classIds.length)        { toast('Select classes for "' + fh.name + '"', 'error'); return; }
    if (!s.dueMonths.length)       { toast('Select due months for "' + fh.name + '"', 'error'); return; }
    entries.push({feeHeadId: fh._id, amount: s.amount, classIds: s.classIds, dueMonths: s.dueMonths});
  }
  var transportEntries = transportRoutes.map(function(rt) {
    return {routeId: rt._id, amount: rt.amount, dueMonths: getSessionMonths()};
  });
  if (!entries.length && !transportEntries.length) { toast('Enable at least one fee head', 'error'); return; }
  var btn = document.getElementById('save-structure-btn');
  setLoading(btn, true);
  apiPost(API_FEE_STRUCTURE, {session: session, startMonth: sm, entries: entries, transportEntries: transportEntries}, true)
    .then(function() { toast('Fee structure saved'); })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save Fee Structure'; });
}

function loadFeeStatus() {
  var session = document.getElementById('st-session').value;
  var classId = document.getElementById('st-class').value;
  if (!session) { toast('Session not loaded yet', 'error'); return; }
  var el = document.getElementById('stu-list-container');
  el.innerHTML = '<div class="fm-card"><div class="fm-empty"><div class="ei">...</div>Loading...</div></div>';
  expandedStudentId = null;
  clearBulkSelection();
  clearRegBulkSelection();
  PAY_REG = {};
  payIdx = 0;
  var url = API_FEE_STATUS + '?session=' + encodeURIComponent(session);
  if (classId) url += '&classId=' + encodeURIComponent(classId);
  apiGet(url, true)
    .then(function(res) {
      feeStatusData = res.data || [];
      if (!feeStatusData.length) {
        el.innerHTML = '<div class="fm-card"><div class="fm-empty"><div class="ei">' + (res.structure ? 'ok' : '!') + '</div>' +
          (res.structure ? 'No students found.' : 'No fee structure for ' + session + '. Go to Fee Setup (Tab 3) first.') + '</div></div>';
        return;
      }
      filterStudents();
    })
    .catch(function(e) {
      el.innerHTML = '<div class="fm-card"><div class="fm-empty"><div class="ei">!</div>' + escH(e.message) + '</div></div>';
    });
}

function filterStudents() {
  var q = (document.getElementById('st-search') ? document.getElementById('st-search').value : '').toLowerCase();
  filteredStatus = q
    ? feeStatusData.filter(function(s) { return (s.name && s.name.toLowerCase().includes(q)) || String(s.rollNo || '').includes(q); })
    : feeStatusData.slice();
  renderStudentList();
}

function renderStudentList() {
  var el = document.getElementById('stu-list-container');
  if (!filteredStatus.length) { el.innerHTML = '<div class="fm-card"><div class="fm-empty">No match.</div></div>'; return; }
  el.innerHTML = filteredStatus.map(function(s) {
    var className = (s.class && s.class.className) ? s.class.className : '-';
    return '<div class="stu-row ' + (expandedStudentId === s.studentId ? 'expanded' : '') + '" id="sr-' + s.studentId + '">' +
      '<div class="stu-summary" onclick="toggleStudent(\'' + s.studentId + '\')">' +
      '<div class="stu-av">' + s.name.charAt(0).toUpperCase() + '</div>' +
      '<div class="stu-info"><div class="stu-name">' + escH(s.name) + '</div>' +
      '<div class="stu-sub">' + escH(className) + (s.rollNo ? ' Roll ' + s.rollNo : '') + (s.fatherName ? ' S/O ' + escH(s.fatherName) : '') + '</div></div>' +
      '<div class="stu-badges">' +
      '<span class="s-badge sb-paid">Rs.' + s.totalPaid.toLocaleString() + '</span>' +
      (s.totalDue > 0 ? '<span class="s-badge sb-due">Rs.' + s.totalDue.toLocaleString() + ' due</span>' : '<span class="s-badge sb-zero">All clear</span>') +
      '</div><div class="stu-chevron">&#9660;</div></div>' +
      '<div class="stu-detail" id="sd-' + s.studentId + '">' + buildStudentDetail(s) + '</div></div>';
  }).join('');
}

function toggleStudent(sid) {
  if (expandedStudentId === sid) {
    var prev = document.getElementById('sr-' + sid);
    if (prev) prev.classList.remove('expanded');
    expandedStudentId = null;
  } else {
    if (expandedStudentId) {
      var old = document.getElementById('sr-' + expandedStudentId);
      if (old) old.classList.remove('expanded');
    }
    expandedStudentId = sid;
    var row = document.getElementById('sr-' + sid);
    if (row) { row.classList.add('expanded'); row.scrollIntoView({behavior: 'smooth', block: 'nearest'}); }
  }
}

function sessionOrderOf(m) {
  return ((m - (startMonth || 3) + 12) % 12);
}

// ─────────────────────────────────────────────────────────────────
//  FIX: Added isPaid check so fully-paid months return 0 remaining
//  This prevents Pay button showing on already-paid months
// ─────────────────────────────────────────────────────────────────
function calcRemaining(m) {
  if (m.isRecovered) return 0;
  if (m.isPaid && !m.isPartial) return 0;   // <-- FIX: fully paid months have 0 remaining
  var base = m.baseAmount != null ? m.baseAmount : m.amount;
  if (m.isPartial) return Math.max(0, base - (m.paidAmount || 0));
  var effectiveDue = m.effectiveDue != null ? m.effectiveDue : m.amount;
  return Math.max(0, effectiveDue);
}

function buildStudentDetail(stu) {
  var session = currentSession || document.getElementById('st-session').value;
  var sid     = stu.studentId;

  var monthMap = {};
  (stu.entries || []).forEach(function(entry) {
    entry.months.forEach(function(m) {
      if (!monthMap[m.monthIndex]) monthMap[m.monthIndex] = [];
      monthMap[m.monthIndex].push({entry: entry, month: m});
    });
  });
  var sortedMonths = Object.keys(monthMap).map(Number).sort(function(a, b) {
    return sessionOrderOf(a) - sessionOrderOf(b);
  });

  var html = '<div class="stu-detail-header">' +
    '<div class="stu-detail-av">' + stu.name.charAt(0).toUpperCase() + '</div>' +
    '<div style="flex:1;min-width:0"><div class="stu-full-name">' + escH(stu.name) + '</div>' +
    '<div class="stu-detail-sub">' +
    '<span>' + escH((stu.class && stu.class.className) || '-') + '</span>' +
    (stu.rollNo     ? '<span>Roll ' + stu.rollNo + '</span>'           : '') +
    (stu.fatherName ? '<span>S/O ' + escH(stu.fatherName) + '</span>' : '') +
    (stu.phone      ? '<span>' + stu.phone + '</span>'                 : '') +
    '</div></div>' +
    '<div class="stu-sum-badges">' +
    '<div class="sum-box sum-paid"><div class="sl">Paid</div><div class="sv">Rs.' + stu.totalPaid.toLocaleString() + '</div></div>' +
    '<div class="sum-box sum-due"><div class="sl">Due</div><div class="sv">Rs.' + stu.totalDue.toLocaleString() + '</div></div>' +
    '<div class="sum-box sum-total"><div class="sl">Total</div><div class="sv">Rs.' + (stu.totalPaid + stu.totalDue).toLocaleString() + '</div></div>' +
    '</div></div>';

  html += '<div class="transport-row">' +
    '<div class="tl">Transport: ' + (stu.transport
      ? '<b>' + escH(stu.transport.routeName) + '</b>'
      : '<span style="color:var(--text3)">Not Assigned</span>') + '</div>' +
    '<select onchange="quickAssignTransport(\'' + sid + '\',this.value,\'' + session + '\')">' +
    '<option value="">No Transport</option>' +
    transportRoutes.map(function(rt) {
      return '<option value="' + rt._id + '"' +
        (stu.transport && stu.transport.routeId === rt._id ? ' selected' : '') + '>' +
        escH(rt.name) + ' Rs.' + rt.amount + '/mo</option>';
    }).join('') + '</select></div>';

  if (sortedMonths.length) {
    html += '<div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin-bottom:8px;display:flex;align-items:center;gap:8px">' +
      'Monthly Fee Schedule' +
      '<span style="flex:1;height:1px;background:var(--border)"></span></div>';

    // Reg bulk select all button
    var totalRegDue = sortedMonths.reduce(function(acc, mi) {
      return acc + monthMap[mi].reduce(function(s2, i) { return s2 + calcRemaining(i.month); }, 0);
    }, 0);
    if (totalRegDue > 0) {
      html += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">' +
        '<button class="mqs-btn" onclick="selectAllRegMonths(\'' + sid + '\')">Select All Due Months</button>' +
        '</div>';
    }

    html += '<div class="month-rows-list" id="mrl-' + sid + '">';
    sortedMonths.forEach(function(mi) {
      html += buildMonthRow(sid, mi, monthMap[mi]);
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">No regular fee entries for this student.</div>';
  }

  // ── TRANSPORT SECTION (redesigned as rows) ──
  if (stu.transport && stu.transport.months && stu.transport.months.length) {
    var ucT = stu.transport.months.filter(function(m) {
      return calcRemaining(m) > 0;
    }).length;
    var busInfo = '';
    if (stu.transport.buses) {
      var busNums = stu.transport.buses
        .filter(function(b) { return b.busNumber; })
        .map(function(b) { return escH(b.busNumber); });
      if (busNums.length) busInfo = ' <span style="font-size:10px;font-weight:600;color:var(--text3)">(' + busNums.join(', ') + ')</span>';
    }

    // ── UPDATED: Transport section label (clean card-style header) ──
    html += '<div class="transport-section-label">' +
      '<span class="tsl-icon">&#128652;</span>' +
      '<div>' +
        '<div class="tsl-title">Transport Fee</div>' +
        '<div style="font-size:10px;color:#ea580c;font-weight:600;margin-top:1px">' + escH(stu.transport.routeName) + busInfo + '</div>' +
      '</div>' +
      (ucT > 0
        ? '<button class="tsl-badge" style="cursor:pointer;background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;border-radius:999px;padding:4px 12px;font-size:10px;font-weight:800;font-family:inherit" onclick="selectAllTransportRows(\'' + sid + '\')">Select All (' + ucT + ')</button>'
        : '<span class="tsl-badge" style="background:#f0fdf4;border-color:#bbf7d0;color:#16a34a">All Clear &#10003;</span>') +
    '</div>';

    html += '<div class="month-rows-list" id="tmrl-' + sid + '">' +
    stu.transport.months.map(function(m) {
      return buildTransportMonthRow(sid, m, stu.transport.routeName, session, stu.transport.routeId);
    }).join('') +
    '</div>';
  }

  return html;
}

function buildMonthRow(sid, monthIndex, items) {
  var allPaid    = items.every(function(i) { return i.month.isPaid && !i.month.isPartial; });
  var anyPartial = items.some(function(i)  { return i.month.isPartial && !i.month.isRecovered; });
  var isFullyRecovered = !allPaid && items.every(function(i) {
    return (i.month.isPaid && !i.month.isPartial) || i.month.isRecovered;
  });
  var totalDue     = items.reduce(function(s, i) { return s + calcRemaining(i.month); }, 0);
  var totalPaidAmt = items.reduce(function(s, i) { return s + (i.month.paidAmount || 0); }, 0);
  var baseTotal    = items.reduce(function(s, i) {
    return s + (i.month.baseAmount != null ? i.month.baseAmount : (i.month.amount || 0));
  }, 0);
  var hasPayment = items.some(function(i) { return !!i.month.paymentId; });
  var canPay     = totalDue > 0;

  var stateClass = allPaid ? 'mr-paid'
    : isFullyRecovered ? 'mr-covered'
    : anyPartial ? 'mr-partial'
    : totalDue <= 0 ? 'mr-covered'
    : 'mr-unpaid';

  var fhChips = items.map(function(i) {
    var remaining = calcRemaining(i.month);
    var dispAmt   = allPaid ? (i.month.paidAmount || baseTotal)
                  : isFullyRecovered ? (i.month.paidAmount || 0)
                  : remaining;
    var partialTag = (i.month.isPartial && !i.month.isRecovered)
      ? ' <span style="color:#ea580c;font-size:9px;font-weight:900">(partial)</span>'
      : '';
    return '<span class="mr-fh-chip">' +
      '<span class="color-dot ' + i.entry.color + '" style="width:8px;height:8px"></span>' +
      escH(i.entry.feeHeadName) + partialTag +
      ' <b>Rs.' + Number(dispAmt).toLocaleString() + '</b>' +
      '</span>';
  }).join('');

  var badge = '';
  if (allPaid) {
    badge = '<span class="mr-status mr-status-paid">&#10003; Paid \u2014 Rs.' + totalPaidAmt.toLocaleString() + '</span>';
    var paidAt = items[0] && items[0].month.paidAt;
    if (paidAt) badge += ' <span class="mr-date">' + new Date(paidAt).toLocaleDateString('en-IN') + '</span>';
  } else if (isFullyRecovered) {
    badge = '<span class="mr-status mr-status-covered">&#10003; Covered by advance</span>';
    if (totalPaidAmt > 0) badge += ' <span class="mr-date">Rs.' + totalPaidAmt.toLocaleString() + ' partial paid</span>';
  } else if (anyPartial) {
    badge = '<span class="mr-status mr-status-partial">~ Rs.' + totalPaidAmt.toLocaleString() +
      ' paid &middot; Rs.' + totalDue.toLocaleString() + ' left</span>';
  } else if (totalDue <= 0) {
    badge = '<span class="mr-status mr-status-covered">&#10003; Covered by advance</span>';
  } else {
    badge = '<span class="mr-status mr-status-due">Rs.' + totalDue.toLocaleString() + ' due</span>';
  }

  var carryParts = [];
  items.forEach(function(i) {
    if (i.month.carryDue    > 0) carryParts.push('+Rs.' + i.month.carryDue.toLocaleString()    + ' carry');
    if (i.month.carryCredit > 0) carryParts.push('&#8722;Rs.' + i.month.carryCredit.toLocaleString() + ' credit');
  });
  if (carryParts.length) {
    badge += ' <span class="mr-carry">' + carryParts.join(' &middot; ') + '</span>';
  }

  var cbHtml = canPay
    ? '<input type="checkbox" class="mp-checkbox" id="reg-cb-' + sid + '-' + monthIndex + '"' +
      ' style="margin-bottom:3px"' +
      ' onclick="event.stopPropagation()" onchange="toggleRegBulkMonth(\'' + sid + '\',' + monthIndex + ',this.checked)">'
    : '';

  var actions = '';
  if (canPay) {
    actions += '<button class="mr-btn mr-btn-pay" onclick="event.stopPropagation();openMonthPayModal(\'' + sid + '\',' + monthIndex + ')">Pay</button>';
  }
  if (hasPayment) {
    actions += '<button class="mr-btn mr-btn-edit" onclick="event.stopPropagation();openMonthEditModal(\'' + sid + '\',' + monthIndex + ')">Edit</button>';
    actions += '<button class="mr-btn mr-btn-del"  onclick="event.stopPropagation();openMonthDeleteModal(\'' + sid + '\',' + monthIndex + ')">Del</button>';
    actions += '<button class="mr-btn" style="background:#eff6ff;color:#3b82f6;border-color:#bfdbfe" onclick="event.stopPropagation();printMonthRowReceipt(\'' + sid + '\',' + monthIndex + ')">&#128424; PDF</button>';
  }

  return '<div class="month-row ' + stateClass + '" id="mrow-' + sid + '-' + monthIndex + '">' +
    '<div class="mr-month-col">' +
      cbHtml +
      '<div class="mr-month-name">' + SHORT_MONTHS[monthIndex] + '</div>' +
      '<div class="mr-base-total">Rs.' + Number(baseTotal).toLocaleString() + '</div>' +
    '</div>' +
    '<div class="mr-detail-col">' +
      '<div class="mr-fh-list">' + fhChips + '</div>' +
      '<div class="mr-badges">' + badge + '</div>' +
    '</div>' +
    '<div class="mr-actions-col">' + actions + '</div>' +
    '</div>';
}

// ─────────────────────────────────────────────────────────────────
//  TRANSPORT MONTH ROW  (new row-based design, matches reg fees UI)
// ─────────────────────────────────────────────────────────────────
function buildTransportMonthRow(sid, m, routeName, session, routeId) {
  var remaining  = calcRemaining(m);
  var base       = m.baseAmount != null ? m.baseAmount : m.amount;
  var canPay     = remaining > 0;
  var hasPayment = !!m.paymentId;

  var k = null;
  if (canPay) {
    var stuRef = feeStatusData.find(function(s) { return s.studentId === sid; });
    k = regPay({
      studentId:   sid,
      feeHeadId:   null,
      routeId:     routeId,
      monthIndex:  m.monthIndex,
      amount:      remaining,
      baseAmount:  base,
      type:        'transport',
      session:     session,
      name:        (stuRef && stuRef.name) || '',
      fhName:      'Transport \u2014 ' + routeName,
      carryDue:    m.carryDue    || 0,
      carryCredit: m.carryCredit || 0,
      waiverAmount: m.waiverAmount || 0,
      lateFee:     m.lateFee     || 0,
      paidAmount:  m.paidAmount  || 0,
      isPartial:   m.isPartial   || false,
      isRecovered: m.isRecovered || false
    });
  }

  var stateClass = (m.isPaid && !m.isPartial) ? 'mr-paid'
    : m.isRecovered    ? 'mr-covered'
    : m.isPartial      ? 'mr-partial'
    : remaining <= 0   ? 'mr-covered'
    : 'mr-unpaid';

  var badge = '';
  if (m.isPaid && !m.isPartial) {
    badge = '<span class="mr-status mr-status-paid">&#10003; Paid \u2014 Rs.' + (m.paidAmount || 0).toLocaleString() + '</span>';
    if (m.paidAt) badge += ' <span class="mr-date">' + new Date(m.paidAt).toLocaleDateString('en-IN') + '</span>';
  } else if (m.isRecovered || remaining <= 0) {
    badge = '<span class="mr-status mr-status-covered">&#10003; Covered by advance</span>';
    if ((m.paidAmount || 0) > 0) badge += ' <span class="mr-date">Rs.' + m.paidAmount.toLocaleString() + ' partial paid</span>';
  } else if (m.isPartial) {
    badge = '<span class="mr-status mr-status-partial">~ Rs.' + (m.paidAmount || 0).toLocaleString() +
      ' paid &middot; Rs.' + remaining.toLocaleString() + ' left</span>';
  } else {
    badge = '<span class="mr-status mr-status-due">Rs.' + remaining.toLocaleString() + ' due</span>';
  }
  if (m.carryDue    > 0) badge += ' <span class="mr-carry">+Rs.' + m.carryDue.toLocaleString()    + ' carry</span>';
  if (m.carryCredit > 0) badge += ' <span class="mr-carry">\u2212Rs.' + m.carryCredit.toLocaleString() + ' credit</span>';
  if ((m.waiverAmount || 0) > 0) badge += ' <span class="mr-carry" style="background:#fef9c3;color:#78350f;border-color:var(--amber)">\u2212Rs.' + m.waiverAmount.toLocaleString() + ' waiver</span>';
  if ((m.lateFee     || 0) > 0) badge += ' <span class="mr-carry" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa">+Rs.' + m.lateFee.toLocaleString() + ' late</span>';

  var cbHtml = (canPay && k)
    ? '<input type="checkbox" class="mp-checkbox" id="tcb-' + sid + '-' + m.monthIndex + '"' +
      ' data-key="' + k + '" style="margin-bottom:3px"' +
      ' onclick="event.stopPropagation()" onchange="toggleBulkItem(\'' + k + '\',this.checked)">'
    : '';

  var paidAtStr = m.paidAt ? escA(new Date(m.paidAt).toISOString()) : '';

  var actions = '';
  if (canPay && k) {
    actions += '<button class="mr-btn mr-btn-pay" onclick="event.stopPropagation();openSinglePay(\'' + k + '\')">Pay</button>';
  }
  if (hasPayment && !m.isRecovered) {
    actions +=
      '<button class="mr-btn mr-btn-edit" onclick="event.stopPropagation();openTransportEditModal(\'' +
        m.paymentId + '\',' + (m.paidAmount || 0) + ',\'' + escA(SHORT_MONTHS[m.monthIndex]) +
        '\',\'' + escA(m.remark || '') + '\',' + base + ',\'' + sid + '\',' +
        m.monthIndex + ',\'' + routeId + '\',\'' + session + '\')">Edit</button>' +
      '<button class="mr-btn mr-btn-del" onclick="event.stopPropagation();openDelPay(\'' +
        m.paymentId + '\',\'' + SHORT_MONTHS[m.monthIndex] + '\')">Del</button>' +
      '<button class="mr-btn" style="background:#eff6ff;color:#3b82f6;border-color:#bfdbfe" onclick="event.stopPropagation();printTransportRowReceipt(\'' +
        sid + '\',' + m.monthIndex + ',' + (m.paidAmount || 0) + ',\'' +
        paidAtStr + '\',\'' + escA(m.remark || '') + '\',\'' + escA(routeName) + '\',\'' + session + '\')">&#128424; PDF</button>';
  }

  // ── UPDATED: added mr-transport class + bus icon in month col ──
  return '<div class="month-row mr-transport ' + stateClass + '" id="trow-' + sid + '-' + m.monthIndex + '">' +
    '<div class="mr-month-col">' +
      cbHtml +
      '<div style="font-size:14px;margin-bottom:2px">&#128652;</div>' +
      '<div class="mr-month-name">' + SHORT_MONTHS[m.monthIndex] + '</div>' +
      '<div class="mr-base-total">Rs.' + Number(base).toLocaleString() + '</div>' +
    '</div>' +
    '<div class="mr-detail-col">' +
      '<div class="mr-fh-list">' +
        '<span class="mr-fh-chip">' +
          '<span style="font-size:12px;flex-shrink:0">&#128652;</span>' +
          escH(routeName) +
        '</span>' +
      '</div>' +
      '<div class="mr-badges">' + badge + '</div>' +
    '</div>' +
    '<div class="mr-actions-col">' + actions + '</div>' +
  '</div>';
}

// Select all unpaid transport months for a student (checkbox + bulk bar)
function selectAllTransportRows(sid) {
  var container = document.getElementById('tmrl-' + sid);
  if (!container) return;
  container.querySelectorAll('.mp-checkbox').forEach(function(cb) {
    if (!cb.checked) {
      var k = cb.getAttribute('data-key');
      if (k) { cb.checked = true; toggleBulkItem(k, true); }
    }
  });
}

// Select all unpaid regular months for a student
function selectAllRegMonths(sid) {
  var container = document.getElementById('mrl-' + sid);
  if (!container) return;
  container.querySelectorAll('.mp-checkbox').forEach(function(cb) {
    if (!cb.checked) {
      var parts = cb.id.replace('reg-cb-', '').split('-');
      var monthIdx = parseInt(parts[parts.length - 1]);
      toggleRegBulkMonth(sid, monthIdx, true);
      cb.checked = true;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
//  TRANSPORT EDIT MODAL  (delete + re-record with new amounts)
// ─────────────────────────────────────────────────────────────────
function openTransportEditModal(pid, currentPaid, label, remark, baseAmount, sid, monthIndex, routeId, session) {
  document.getElementById('tem-id').value    = pid;
  document.getElementById('tem-sub').textContent =
    'Transport \u2014 ' + label + '  (base: Rs.' + baseAmount.toLocaleString() + '/mo)';
  document.getElementById('tem-base-display').innerHTML =
    '<span style="color:var(--text2)">Base amount:</span> ' +
    '<b style="font-family:\'JetBrains Mono\',monospace">Rs.' + baseAmount.toLocaleString() + '</b>' +
    ' &nbsp;&middot;&nbsp; ' +
    '<span style="color:var(--text2)">Currently recorded:</span> ' +
    '<b style="font-family:\'JetBrains Mono\',monospace">Rs.' + currentPaid.toLocaleString() + '</b>';
  document.getElementById('tem-amount').value  = currentPaid;
  document.getElementById('tem-waiver').value  = 0;
  document.getElementById('tem-latefee').value = 0;
  document.getElementById('tem-remark').value  = remark || '';

  window._temCtx = {
    pid:        pid,
    baseAmount: baseAmount,
    sid:        sid,
    monthIndex: monthIndex,
    routeId:    routeId,
    session:    session
  };

  updateTransportEditPreview();
  openModal('transport-edit-modal');
}

function updateTransportEditPreview() {
  var ctx = window._temCtx; if (!ctx) return;
  var waiver        = Math.max(0, parseInt(document.getElementById('tem-waiver').value)  || 0);
  var lateFeeV      = Math.max(0, parseInt(document.getElementById('tem-latefee').value) || 0);
  var paidAmt       = parseInt(document.getElementById('tem-amount').value) || 0;
  var adjBase       = Math.max(0, ctx.baseAmount - waiver);
  var paidTowardBase = Math.max(0, paidAmt - lateFeeV);

  var box = document.getElementById('tem-preview');
  box.className = 'pay-preview';
  if (!paidAmt) { box.classList.remove('show'); return; }

  if (paidTowardBase < adjBase) {
    box.innerHTML = '&#9888; Partial \u2014 Rs.' + (adjBase - paidTowardBase).toLocaleString() +
      ' will carry forward to next month';
    box.classList.add('show', 'partial');
  } else if (paidTowardBase > adjBase) {
    box.innerHTML = '&#10003; Full + Rs.' + (paidTowardBase - adjBase).toLocaleString() +
      ' advance \u2014 credited to next month automatically';
    box.classList.add('show', 'advance');
  } else {
    box.innerHTML = '&#10003; Exact full payment' +
      (waiver   ? ' (Rs.' + waiver.toLocaleString()    + ' waiver applied)' : '') +
      (lateFeeV ? ' + Rs.' + lateFeeV.toLocaleString() + ' late fee' : '');
    box.classList.add('show', 'full');
  }
}

function saveTransportEditPayment() {
  var ctx = window._temCtx; if (!ctx) return;
  var paidAmt  = parseInt(document.getElementById('tem-amount').value)  || 0;
  var waiver   = Math.max(0, parseInt(document.getElementById('tem-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('tem-latefee').value) || 0);
  var remark   = document.getElementById('tem-remark').value.trim();

  if (paidAmt < 1) { toast('Enter a valid amount', 'error'); return; }

  var btn = document.getElementById('tem-save-btn');
  setLoading(btn, true);

  // Delete old record then re-create with new values
  apiDelete(API_FEE_PAY + '/' + ctx.pid, true)
    .then(function() {
      return apiPost(API_FEE_PAY, {
        studentId:    ctx.sid,
        feeHeadId:    null,
        routeId:      ctx.routeId,
        monthIndex:   ctx.monthIndex,
        amount:       ctx.baseAmount,
        paidAmount:   paidAmt,
        waiverAmount: waiver,
        lateFee:      lateFeeV,
        type:         'transport',
        session:      ctx.session,
        remark:       remark || null
      }, true);
    })
    .then(function() {
      toast('Transport payment updated');
      closeModal('transport-edit-modal');
      window._temCtx = null;
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save Changes'; });
}

function openMonthPayModal(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;

  var items = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
    if (m) items.push({entry: entry, month: m});
  });
  if (!items.length) return;

  var totalDue = items.reduce(function(s, i) { return s + calcRemaining(i.month); }, 0);
  if (totalDue <= 0) return; // Safety: don't open if nothing to pay

  document.getElementById('mpm-title').textContent = stu.name + ' \u2014 ' + MONTHS[monthIndex];
  document.getElementById('mpm-sub').textContent   = 'Session: ' + currentSession + '  |  ' +
    items.length + ' fee head' + (items.length !== 1 ? 's' : '');

  var carryParts = [];
  items.forEach(function(i) {
    if (i.month.isPartial && !i.month.isRecovered) carryParts.push('<b>' + escH(i.entry.feeHeadName) + '</b>: Rs.' + (i.month.paidAmount || 0).toLocaleString() + ' already paid this month');
    if (i.month.carryDue    > 0) carryParts.push('<b>' + escH(i.entry.feeHeadName) + '</b>: +Rs.' + i.month.carryDue.toLocaleString() + ' carried in from previous unpaid month');
    if (i.month.carryCredit > 0) carryParts.push('<b>' + escH(i.entry.feeHeadName) + '</b>: &#8722;Rs.' + i.month.carryCredit.toLocaleString() + ' advance credit applied');
  });
  var carryBox = document.getElementById('mpm-carry-info');
  if (carryParts.length) { carryBox.innerHTML = carryParts.join('<br>'); carryBox.classList.add('show'); }
  else carryBox.classList.remove('show');

  document.getElementById('mpm-fee-list').innerHTML = items.map(function(i) {
    var remaining = calcRemaining(i.month);
    return '<div class="mpm-fee-row">' +
      '<span class="color-dot ' + i.entry.color + '" style="width:10px;height:10px;flex-shrink:0"></span>' +
      '<span style="flex:1;font-size:13px;font-weight:700">' + escH(i.entry.feeHeadName) + '</span>' +
      (i.month.isPartial && !i.month.isRecovered
        ? '<span style="font-size:10px;color:#ea580c;font-weight:800;margin-right:6px">Rs.' + (i.month.paidAmount || 0).toLocaleString() + ' paid</span>'
        : '') +
      (i.month.carryDue > 0
        ? '<span style="font-size:10px;color:#b91c1c;font-weight:800;margin-right:6px">+' + i.month.carryDue.toLocaleString() + ' carry</span>'
        : '') +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:900;font-size:13px;flex-shrink:0">Rs.' + remaining.toLocaleString() + '</span>' +
      '</div>';
  }).join('');

  document.getElementById('mpm-total-due').textContent = 'Rs.' + totalDue.toLocaleString();
  document.getElementById('mpm-amount').value  = totalDue;
  document.getElementById('mpm-waiver').value  = 0;
  document.getElementById('mpm-latefee').value = 0;
  document.getElementById('mpm-remark').value  = '';

  pendingMonthPay = {
    sid: sid, monthIndex: monthIndex,
    items: items, session: currentSession,
    totalDue: totalDue
  };

  updateMonthPayPreview();
  openModal('month-pay-modal');
}

function updateMonthPayPreview() {
  if (!pendingMonthPay) return;
  var waiver   = Math.max(0, parseInt(document.getElementById('mpm-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('mpm-latefee').value) || 0);
  var paid     = parseInt(document.getElementById('mpm-amount').value) || 0;
  var adjDue   = Math.max(0, pendingMonthPay.totalDue - waiver);
  var paidTowardBase = Math.max(0, paid - lateFeeV);

  var box = document.getElementById('mpm-preview');
  box.className = 'pay-preview';
  if (!paid) { box.classList.remove('show'); return; }

  if (paidTowardBase < adjDue) {
    box.innerHTML = '&#9888; Partial \u2014 Rs.' + (adjDue - paidTowardBase).toLocaleString() +
      ' remaining will carry forward across unpaid fee heads';
    box.classList.add('show', 'partial');
  } else if (paidTowardBase > adjDue) {
    box.innerHTML = '&#10003; Full + Rs.' + (paidTowardBase - adjDue).toLocaleString() +
      ' extra \u2014 credited to next applicable month automatically';
    box.classList.add('show', 'advance');
  } else {
    box.innerHTML = '&#10003; Exact \u2014 all ' + pendingMonthPay.items.length + ' fee head' +
      (pendingMonthPay.items.length !== 1 ? 's' : '') + ' for ' + SHORT_MONTHS[pendingMonthPay.monthIndex] + ' will be marked paid' +
      (waiver   ? ' (Rs.' + waiver.toLocaleString()   + ' waiver)' : '') +
      (lateFeeV ? ' + Rs.' + lateFeeV.toLocaleString() + ' late fee' : '');
    box.classList.add('show', 'full');
  }
}

function confirmMonthPayment() {
  if (!pendingMonthPay) return;
  var d        = pendingMonthPay;
  var paidAmt  = parseInt(document.getElementById('mpm-amount').value) || d.totalDue;
  var waiver   = Math.max(0, parseInt(document.getElementById('mpm-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('mpm-latefee').value) || 0);
  var remark   = document.getElementById('mpm-remark').value.trim();

  var remaining = paidAmt;
  var payments  = d.items.map(function(item) {
    var due   = calcRemaining(item.month);
    var alloc = Math.min(remaining, due);
    remaining -= alloc;
    return {
      type:        'regular',
      feeHeadId:   item.entry.feeHeadId,
      routeId:     null,
      monthIndex:  d.monthIndex,
      amount:      item.month.baseAmount != null ? item.month.baseAmount : item.month.amount,
      paidAmount:  alloc,
      waiverAmount: 0,
      lateFee:     0
    };
  });

  if (remaining > 0 && payments.length > 0) {
    payments[payments.length - 1].paidAmount += remaining;
  }
  if (waiver   > 0 && payments.length > 0) payments[0].waiverAmount = waiver;
  if (lateFeeV > 0 && payments.length > 0) {
    var last = payments[payments.length - 1];
    last.lateFee    = lateFeeV;
    last.paidAmount += lateFeeV;
  }

  var btn = document.getElementById('mpm-confirm-btn');
  setLoading(btn, true);

  apiPost(API_FEE_PAY_BULK, {
    studentId: d.sid, session: d.session,
    payments: payments, remark: remark || null
  }, true)
    .then(function() {
      closeModal('month-pay-modal');
      var stu = feeStatusData.find(function(s) { return s.studentId === d.sid; });
      var receiptItems = d.items.map(function(item, idx) {
        return {
          label:  item.entry.feeHeadName + ' \u2014 ' + SHORT_MONTHS[d.monthIndex],
          amount: (payments[idx] ? payments[idx].paidAmount : 0)
        };
      });
      showReceipt({
        studentName: (stu && stu.name) || '',
        className:   (stu && stu.class && stu.class.className) || '',
        session:     d.session,
        total:       paidAmt + lateFeeV,
        remark:      remark,
        items:       receiptItems
      });
      pendingMonthPay = null;
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Confirm Payment'; });
}

function openMonthEditModal(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;

  var items = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
    if (m && m.paymentId) items.push({entry: entry, month: m});
  });
  if (!items.length) { toast('No payment records found for this month', 'error'); return; }

  var totalPaid = items.reduce(function(s, i) { return s + (i.month.paidAmount || 0); }, 0);

  document.getElementById('mem-title').textContent = stu.name + ' \u2014 ' + MONTHS[monthIndex];
  document.getElementById('mem-amount').value = totalPaid;
  document.getElementById('mem-remark').value = (items[0].month.remark || '');

  pendingMonthEdit = {
    sid: sid, monthIndex: monthIndex,
    items: items, session: currentSession
  };
  openModal('month-edit-modal');
}

function confirmMonthEdit() {
  if (!pendingMonthEdit) return;
  var d        = pendingMonthEdit;
  var newTotal = parseInt(document.getElementById('mem-amount').value) || 0;
  var remark   = document.getElementById('mem-remark').value.trim();

  if (newTotal < 1) { toast('Enter a valid amount', 'error'); return; }

  var btn = document.getElementById('mem-confirm-btn');
  setLoading(btn, true);

  var deletePromises = d.items
    .filter(function(i) { return i.month.paymentId; })
    .map(function(i) { return apiDelete(API_FEE_PAY + '/' + i.month.paymentId, true); });

  Promise.all(deletePromises)
    .then(function() {
      var remaining = newTotal;
      var payments  = d.items.map(function(item) {
        var base  = item.month.baseAmount != null ? item.month.baseAmount : (item.month.amount || 0);
        var alloc = Math.min(remaining, base);
        remaining -= alloc;
        return {
          type: 'regular', feeHeadId: item.entry.feeHeadId, routeId: null,
          monthIndex: d.monthIndex, amount: base, paidAmount: alloc
        };
      });
      if (remaining > 0 && payments.length > 0) {
        payments[payments.length - 1].paidAmount += remaining;
      }
      return apiPost(API_FEE_PAY_BULK, {
        studentId: d.sid, session: d.session,
        payments: payments, remark: remark || null
      }, true);
    })
    .then(function() {
      toast('Payment updated for ' + SHORT_MONTHS[d.monthIndex]);
      closeModal('month-edit-modal');
      pendingMonthEdit = null;
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save Changes'; });
}

function openMonthDeleteModal(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  document.getElementById('mdm-sub').textContent =
    'Delete ALL payments for ' + MONTHS[monthIndex] +
    (stu ? ' \u2014 ' + stu.name : '') + '?';
  pendingMonthDelete = {sid: sid, monthIndex: monthIndex};
  openModal('month-delete-modal');
}

function confirmMonthDelete() {
  if (!pendingMonthDelete) return;
  var d   = pendingMonthDelete;
  var stu = feeStatusData.find(function(s) { return s.studentId === d.sid; });
  if (!stu) return;

  var paymentIds = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === d.monthIndex; });
    if (m && m.paymentId) paymentIds.push(m.paymentId);
  });

  if (!paymentIds.length) { toast('No payments to delete for this month', 'error'); return; }

  var btn = document.getElementById('mdm-confirm-btn');
  setLoading(btn, true);

  Promise.all(paymentIds.map(function(pid) {
    return apiDelete(API_FEE_PAY + '/' + pid, true);
  }))
    .then(function() {
      toast(SHORT_MONTHS[d.monthIndex] + ' payments deleted \u2014 month reverted to unpaid');
      closeModal('month-delete-modal');
      pendingMonthDelete = null;
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Yes, Delete All'; });
}

function buildMonthTile(m, k, isTransport) {
  var base         = m.baseAmount != null ? m.baseAmount : m.amount;
  var effectiveDue = m.effectiveDue != null ? m.effectiveDue : m.amount;
  var remaining    = calcRemaining(m);

  var stateClass, isInteractive;

  if (m.isPaid && !m.isPartial) {
    stateClass    = isTransport ? 't-paid' : (m.paymentStatus === 'advance' ? 'advance' : 'paid');
    isInteractive = false;
  } else if (m.isRecovered) {
    stateClass    = isTransport ? 't-covered' : 'covered';
    isInteractive = false;
  } else if (m.isPartial) {
    stateClass    = isTransport ? 't-partial' : 'partial';
    isInteractive = remaining > 0;
  } else if (remaining <= 0) {
    stateClass    = isTransport ? 't-covered' : 'covered';
    isInteractive = false;
  } else {
    stateClass    = isTransport ? 't-unpaid' : 'unpaid';
    isInteractive = true;
  }

  var isSelected   = !!(bulkMap[k]);
  var carryDueTag  = m.carryDue    > 0 ? '<span class="carry-tag due">+Rs.' + m.carryDue.toLocaleString() + ' carry</span>' : '';
  var carryCrTag   = m.carryCredit > 0 ? '<span class="carry-tag credit">-Rs.' + m.carryCredit.toLocaleString() + ' credit</span>' : '';
  var waiverTag    = m.waiverAmount > 0 ? '<span class="carry-tag waiver">-Rs.' + m.waiverAmount.toLocaleString() + ' waiver</span>' : '';
  var lateFeeTag   = m.lateFee     > 0 ? '<span class="carry-tag late">+Rs.' + m.lateFee.toLocaleString() + ' late</span>' : '';

  var statusLine;
  if (m.isRecovered) {
    statusLine = '<div class="mp-status">Covered</div>';
  } else if (m.isPartial) {
    statusLine = '<div class="mp-status">Paid Rs.' + (m.paidAmount || 0).toLocaleString() + ', <b>Rs.' + remaining.toLocaleString() + ' left</b></div>';
  } else if (m.isPaid) {
    statusLine = '<div class="mp-status">Paid</div>';
  } else if (remaining <= 0) {
    statusLine = '<div class="mp-status">Covered</div>';
  } else {
    statusLine = '<div class="mp-status">Tap to pay</div>';
  }

  var dateLine = (m.isPaid || m.isPartial) && m.paidAt
    ? '<div class="mp-date">' + new Date(m.paidAt).toLocaleDateString('en-IN') + '</div>' : '';

  var editLine = (m.isPaid || m.isPartial) && m.paymentId && !m.isRecovered
    ? '<div class="paid-actions">' +
      '<button class="pab" onclick="event.stopPropagation();openEditPay(\'' + m.paymentId + '\',' + (m.paidAmount || m.amount) + ',\'' + escA(SHORT_MONTHS[m.monthIndex]) + '\',\'' + escA(m.remark || '') + '\')">E</button>' +
      '<button class="pab del" onclick="event.stopPropagation();openDelPay(\'' + m.paymentId + '\',\'' + SHORT_MONTHS[m.monthIndex] + '\')">D</button>' +
      '</div>' : '';

  var cbHtml = isInteractive
    ? '<input type="checkbox" class="mp-checkbox"' + (isSelected ? ' checked' : '') +
      ' onclick="event.stopPropagation()" onchange="toggleBulkItem(\'' + k + '\',this.checked)">'
    : '';

  var clickAttr = isInteractive ? 'onclick="openSinglePay(\'' + k + '\')"' : '';
  var displayAmt = remaining;

  return '<div class="mp-tile ' + stateClass + (isSelected ? ' selected-bulk' : '') + '" id="mpt-' + k + '" ' + clickAttr + '>' +
    '<div class="mp-top-row">' + cbHtml + '<span class="mp-month">' + SHORT_MONTHS[m.monthIndex] + '</span></div>' +
    '<div class="mp-amount">Rs.' + displayAmt.toLocaleString() + '</div>' +
    carryDueTag + carryCrTag + waiverTag + lateFeeTag +
    statusLine + dateLine + editLine + '</div>';
}

function toggleBulkItem(k, checked) {
  var d = PAY_REG[k]; if (!d) return;
  if (bulkStudentId && bulkStudentId !== d.studentId) clearBulkSelection();
  if (checked) { bulkMap[k] = d; bulkStudentId = d.studentId; }
  else { delete bulkMap[k]; if (!Object.keys(bulkMap).length) bulkStudentId = null; }
  updateBulkBar();
  var tile = document.getElementById('mpt-' + k);
  if (tile) tile.classList.toggle('selected-bulk', checked);
}

function clearBulkSelection() {
  Object.keys(bulkMap).forEach(function(k) {
    var tile = document.getElementById('mpt-' + k);
    if (tile) { tile.classList.remove('selected-bulk'); var cb = tile.querySelector('.mp-checkbox'); if (cb) cb.checked = false; }
  });
  // Also clear transport row checkboxes
  document.querySelectorAll('[id^="tcb-"]').forEach(function(cb) { cb.checked = false; });
  bulkMap = {}; bulkStudentId = null; updateBulkBar();
}

function toggleRegBulkMonth(sid, monthIndex, checked) {
  var key = sid + '-' + monthIndex;
  if (checked) {
    if (regBulkStudentId && regBulkStudentId !== sid) clearRegBulkSelection();
    var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
    if (!stu) return;
    var items = [];
    (stu.entries || []).forEach(function(entry) {
      var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
      if (m) items.push({entry: entry, month: m});
    });
    var totalDue = items.reduce(function(s, i) { return s + calcRemaining(i.month); }, 0);
    regBulkMap[key] = {sid: sid, monthIndex: monthIndex, totalDue: totalDue, items: items};
    regBulkStudentId = sid;
    var row = document.getElementById('mrow-' + sid + '-' + monthIndex);
    if (row) row.classList.add('selected-bulk');
  } else {
    delete regBulkMap[key];
    var row2 = document.getElementById('mrow-' + sid + '-' + monthIndex);
    if (row2) row2.classList.remove('selected-bulk');
    if (!Object.keys(regBulkMap).length) regBulkStudentId = null;
  }
  updateBulkBar();
}

function clearRegBulkSelection() {
  Object.keys(regBulkMap).forEach(function(key) {
    var cb = document.getElementById('reg-cb-' + key);
    if (cb) cb.checked = false;
    var row = document.getElementById('mrow-' + key);
    if (row) row.classList.remove('selected-bulk');
  });
  regBulkMap = {};
  regBulkStudentId = null;
  updateBulkBar();
}

function updateBulkBar() {
  var transportKeys = Object.keys(bulkMap);
  var regKeys       = Object.keys(regBulkMap);
  var bar           = document.getElementById('bulk-bar');

  if (!transportKeys.length && !regKeys.length) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  var actions = bar.querySelector('.bulk-bar-actions');

  if (transportKeys.length) {
    currentBulkMode = 'transport';
    var total = transportKeys.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);
    document.getElementById('bulk-count').textContent = transportKeys.length + ' transport item' + (transportKeys.length !== 1 ? 's' : '') + ' selected';
    document.getElementById('bulk-total').textContent = 'Rs.' + total.toLocaleString();
    actions.innerHTML = '<button class="btn-bulk-clear" onclick="clearBulkSelection()">Clear</button>' +
      '<button class="btn-bulk-pay" onclick="openBulkPayModal()">Pay Transport</button>';
  } else {
    currentBulkMode = 'regular';
    var regTotal = regKeys.reduce(function(s, k) { return s + regBulkMap[k].totalDue; }, 0);
    document.getElementById('bulk-count').textContent = regKeys.length + ' month' + (regKeys.length !== 1 ? 's' : '') + ' selected';
    document.getElementById('bulk-total').textContent = 'Rs.' + regTotal.toLocaleString();
    actions.innerHTML = '<button class="btn-bulk-clear" onclick="clearRegBulkSelection()">Clear</button>' +
      '<button class="btn-bulk-pay" onclick="openRegBulkPayModal()">Pay Months</button>';
  }
}

function selectAllForHead(sid, headId, type) {
  Object.keys(PAY_REG).forEach(function(k) {
    var d = PAY_REG[k];
    if (d.studentId !== sid || d.type !== type) return;
    var matches = type === 'transport' ? d.routeId === headId : d.feeHeadId === headId;
    if (!matches) return;
    var tile = document.getElementById('mpt-' + k); if (!tile) return;
    var cb = tile.querySelector('.mp-checkbox');
    if (cb && !cb.disabled) { cb.checked = true; toggleBulkItem(k, true); }
  });
}

function openSinglePay(k) {
  var d = PAY_REG[k]; if (!d) return;
  pendingSinglePay = k;
  var remaining = d.amount;

  document.getElementById('pay-modal-title').textContent = d.name;
  document.getElementById('pay-modal-sub').textContent   = d.fhName + ' \u2014 ' + MONTHS[d.monthIndex];
  document.getElementById('pay-modal-amount').textContent = 'Rs.' + remaining.toLocaleString();
  document.getElementById('pay-amount-input').value = remaining;
  document.getElementById('pay-waiver').value  = 0;
  document.getElementById('pay-latefee').value = 0;
  document.getElementById('pay-remark').value  = '';

  var amtLabel = document.querySelector('#pay-modal .pay-amt-box .pal');
  if (amtLabel) amtLabel.textContent = d.isPartial ? 'Remaining Due This Month' : 'Effective Due Amount';

  var carryBox = document.getElementById('pay-carry-info');
  var parts = [];
  if (d.isPartial && !d.isRecovered) parts.push('Rs.' + d.paidAmount.toLocaleString() + ' already paid for this month \u2014 Rs.' + remaining.toLocaleString() + ' still due');
  if (d.carryDue    > 0) parts.push('+Rs.' + d.carryDue.toLocaleString() + ' carried in from previous unpaid month');
  if (d.carryCredit > 0) parts.push('-Rs.' + d.carryCredit.toLocaleString() + ' credit applied from previous advance');
  if (parts.length) { carryBox.innerHTML = parts.join('<br>'); carryBox.classList.add('show'); }
  else carryBox.classList.remove('show');

  var warnBox  = document.getElementById('pay-prev-warn');
  warnBox.classList.remove('show');

  updatePayPreview();
  openModal('pay-modal');
}

function updatePayPreview() {
  var k = pendingSinglePay; if (!k) return;
  var d = PAY_REG[k]; if (!d) return;
  var waiver   = Math.max(0, parseInt(document.getElementById('pay-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('pay-latefee').value) || 0);
  var paidAmt  = parseInt(document.getElementById('pay-amount-input').value) || 0;
  var remaining = d.amount;
  var adjBase   = Math.max(0, remaining - waiver);
  var paidBase  = Math.max(0, paidAmt - lateFeeV);

  var box = document.getElementById('pay-preview');
  box.className = 'pay-preview';
  if (!paidAmt) { box.classList.remove('show'); return; }

  if (paidBase < adjBase) {
    box.innerHTML = 'Partial \u2014 Rs.' + (adjBase - paidBase).toLocaleString() + ' will carry to next month';
    box.classList.add('show', 'partial');
  } else if (paidBase > adjBase) {
    box.innerHTML = 'Full payment + Rs.' + (paidBase - adjBase).toLocaleString() + ' advance credit to next month' + (lateFeeV ? ' (incl. Rs.' + lateFeeV.toLocaleString() + ' late fee)' : '');
    box.classList.add('show', 'advance');
  } else {
    box.innerHTML = 'Full payment' + (d.isPartial ? ' \u2014 clears this month completely' : '') + (lateFeeV ? ' + Rs.' + lateFeeV.toLocaleString() + ' late fee' : '') + (waiver ? ' (Rs.' + waiver.toLocaleString() + ' waiver applied)' : '');
    box.classList.add('show', 'full');
  }
}

function confirmPayment() {
  var k = pendingSinglePay; if (!k) return;
  var d = PAY_REG[k]; if (!d) return;
  var remark   = document.getElementById('pay-remark').value.trim();
  var paidAmt  = parseInt(document.getElementById('pay-amount-input').value) || d.amount;
  var waiver   = Math.max(0, parseInt(document.getElementById('pay-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('pay-latefee').value) || 0);
  var btn = document.getElementById('pay-confirm-btn');
  setLoading(btn, true);
  apiPost(API_FEE_PAY, {
    studentId: d.studentId, feeHeadId: d.feeHeadId, monthIndex: d.monthIndex,
    amount: d.baseAmount,
    paidAmount: paidAmt, waiverAmount: waiver, lateFee: lateFeeV,
    type: d.type, routeId: d.routeId, session: d.session, remark: remark || null
  }, true)
    .then(function() {
      closeModal('pay-modal');
      var stu = feeStatusData.find(function(s) { return s.studentId === d.studentId; });
      showReceipt({
        studentName: (stu && stu.name) || d.name,
        className:   (stu && stu.class && stu.class.className) || '',
        session:     d.session,
        total:       paidAmt,
        remark:      remark,
        items:       [{label: d.fhName + ' \u2014 ' + SHORT_MONTHS[d.monthIndex], amount: paidAmt}]
      });
      clearBulkSelection();
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Confirm Payment'; });
}

function openBulkPayModal() {
  currentBulkMode = 'transport';
  var keys = Object.keys(bulkMap); if (!keys.length) return;
  var total = keys.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);
  var modal = document.getElementById('bulk-pay-modal');
  modal.querySelector('h3').textContent = 'Bulk Transport Payment';
  modal.querySelector('.modal-sub').textContent = 'Review selected transport months. Adjust amount for lump-sum or partial, distributed oldest-first.';
  document.getElementById('bulk-items-list').innerHTML = keys.map(function(k) {
    var d = bulkMap[k];
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px">' +
      '<span style="font-weight:700">' + escH(d.fhName) + ' <span style="color:var(--text3)">' + SHORT_MONTHS[d.monthIndex] + '</span>' +
      (d.isPartial ? ' <span style="font-size:9px;color:#c2410c;font-weight:800;background:#fff7ed;border-radius:3px;padding:1px 4px">partial</span>' : '') +
      (d.carryDue > 0 ? ' <span style="font-size:9px;color:#b91c1c;font-weight:800">(+Rs.' + d.carryDue.toLocaleString() + ' carry)</span>' : '') + '</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700">Rs.' + Number(d.amount).toLocaleString() + '</span></div>';
  }).join('');
  document.getElementById('bulk-total-display').textContent = 'Rs.' + total.toLocaleString();
  document.getElementById('bulk-custom-amount').value = total;
  document.getElementById('bulk-remark').value = '';
  updateBulkAmtPreview(total);
  document.getElementById('bulk-confirm-btn').onclick = confirmBulkPayment;
  openModal('bulk-pay-modal');
}

function openRegBulkPayModal() {
  currentBulkMode = 'regular';
  var keys = Object.keys(regBulkMap); if (!keys.length) return;
  var sorted = keys.slice().sort(function(a, b) {
    return sessionOrderOf(regBulkMap[a].monthIndex) - sessionOrderOf(regBulkMap[b].monthIndex);
  });
  var total = sorted.reduce(function(s, k) { return s + regBulkMap[k].totalDue; }, 0);
  var modal = document.getElementById('bulk-pay-modal');
  modal.querySelector('h3').textContent = 'Pay Multiple Months';
  modal.querySelector('.modal-sub').textContent = 'Review selected months. Amount distributed oldest-first across all fee heads.';
  document.getElementById('bulk-items-list').innerHTML = sorted.map(function(k) {
    var d = regBulkMap[k];
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px">' +
      '<span style="font-weight:700">' + MONTHS[d.monthIndex] +
      ' <span style="color:var(--text3)">' + d.items.length + ' fee head' + (d.items.length !== 1 ? 's' : '') + '</span></span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700">Rs.' + Number(d.totalDue).toLocaleString() + '</span></div>';
  }).join('');
  document.getElementById('bulk-total-display').textContent = 'Rs.' + total.toLocaleString();
  document.getElementById('bulk-custom-amount').value = total;
  document.getElementById('bulk-remark').value = '';
  updateBulkAmtPreview(total);
  document.getElementById('bulk-confirm-btn').onclick = confirmRegBulkPayment;
  openModal('bulk-pay-modal');
}

function updateBulkAmtPreview(val) {
  var total;
  if (currentBulkMode === 'regular') {
    var rk = Object.keys(regBulkMap);
    total = rk.reduce(function(s, k) { return s + regBulkMap[k].totalDue; }, 0);
  } else {
    var tk = Object.keys(bulkMap);
    total = tk.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);
  }
  var v   = parseInt(val) || 0;
  var box = document.getElementById('bulk-preview');
  box.className = 'pay-preview';
  if (!v) { box.classList.remove('show'); return; }
  if (v < total) {
    box.innerHTML = 'Rs.' + (total - v).toLocaleString() + ' short \u2014 distributed as partials, oldest month first';
    box.classList.add('show', 'partial');
  } else if (v > total) {
    box.innerHTML = 'Rs.' + (v - total).toLocaleString() + ' extra \u2014 credited to next applicable month';
    box.classList.add('show', 'advance');
  } else {
    var cnt = currentBulkMode === 'regular' ? Object.keys(regBulkMap).length : Object.keys(bulkMap).length;
    box.innerHTML = 'Exact \u2014 all ' + cnt + ' item' + (cnt !== 1 ? 's' : '') + ' will be fully paid';
    box.classList.add('show', 'full');
  }
}

function confirmBulkPayment() {
  var keys = Object.keys(bulkMap); if (!keys.length) return;
  var remark    = document.getElementById('bulk-remark').value.trim();
  var customAmt = parseInt(document.getElementById('bulk-custom-amount').value);
  var remaining = customAmt || keys.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);
  var payments  = keys.map(function(k) {
    var d     = bulkMap[k];
    var alloc = Math.min(remaining, d.amount);
    remaining -= alloc;
    return {type: d.type, feeHeadId: d.feeHeadId, routeId: d.routeId, monthIndex: d.monthIndex, amount: d.baseAmount, paidAmount: alloc};
  });
  var sid     = bulkStudentId;
  var session = currentSession || document.getElementById('st-session').value;
  var btn = document.getElementById('bulk-confirm-btn');
  setLoading(btn, true);
  apiPost(API_FEE_PAY_BULK, {studentId: sid, session: session, payments: payments, remark: remark || null}, true)
    .then(function() {
      var stu       = feeStatusData.find(function(s) { return s.studentId === sid; });
      var collected = payments.reduce(function(s, p) { return s + (p.paidAmount || 0); }, 0);
      var items     = payments.map(function(p) {
        var d = Object.values(bulkMap).find(function(bd) { return bd.monthIndex === p.monthIndex && bd.feeHeadId === p.feeHeadId && bd.routeId === p.routeId; });
        return {label: ((d && d.fhName) || 'Fee') + ' \u2014 ' + SHORT_MONTHS[p.monthIndex], amount: p.paidAmount};
      });
      closeModal('bulk-pay-modal');
      showReceipt({
        studentName: (stu && stu.name) || '',
        className:   (stu && stu.class && stu.class.className) || '',
        session:     session, total: collected, remark: remark, items: items
      });
      clearBulkSelection();
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Confirm All'; });
}

function confirmRegBulkPayment() {
  var keys = Object.keys(regBulkMap); if (!keys.length) return;
  var remark    = document.getElementById('bulk-remark').value.trim();
  var customAmt = parseInt(document.getElementById('bulk-custom-amount').value);
  var sid       = regBulkStudentId;
  var session   = currentSession;

  var sorted = keys.slice().sort(function(a, b) {
    return sessionOrderOf(regBulkMap[a].monthIndex) - sessionOrderOf(regBulkMap[b].monthIndex);
  });

  var remaining = customAmt || sorted.reduce(function(s, k) { return s + regBulkMap[k].totalDue; }, 0);
  var payments  = [];

  sorted.forEach(function(k) {
    var d = regBulkMap[k];
    d.items.forEach(function(item) {
      var due   = calcRemaining(item.month);
      var alloc = Math.min(remaining, due);
      remaining -= alloc;
      payments.push({
        type:       'regular',
        feeHeadId:  item.entry.feeHeadId,
        routeId:    null,
        monthIndex: d.monthIndex,
        amount:     item.month.baseAmount != null ? item.month.baseAmount : item.month.amount,
        paidAmount: alloc
      });
    });
  });

  if (remaining > 0 && payments.length > 0) {
    payments[payments.length - 1].paidAmount += remaining;
  }

  var btn = document.getElementById('bulk-confirm-btn');
  setLoading(btn, true);

  apiPost(API_FEE_PAY_BULK, {studentId: sid, session: session, payments: payments, remark: remark || null}, true)
    .then(function() {
      var stu       = feeStatusData.find(function(s) { return s.studentId === sid; });
      var collected = payments.reduce(function(s, p) { return s + (p.paidAmount || 0); }, 0);
      var items     = sorted.map(function(k) {
        var d = regBulkMap[k];
        return {label: MONTHS[d.monthIndex], amount: d.totalDue};
      });
      closeModal('bulk-pay-modal');
      showReceipt({
        studentName: (stu && stu.name) || '',
        className:   (stu && stu.class && stu.class.className) || '',
        session:     session, total: collected, remark: remark, items: items
      });
      clearRegBulkSelection();
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Confirm All'; });
}

function showReceipt(data) {
  lastReceiptData = data;
  document.getElementById('rc-amount').textContent  = 'Rs.' + data.total.toLocaleString();
  document.getElementById('rc-date').textContent    = new Date().toLocaleString('en-IN');
  document.getElementById('rc-student').textContent = data.studentName || '-';
  document.getElementById('rc-class').textContent   = data.className  || '';
  document.getElementById('rc-session').textContent = data.session    || '';
  document.getElementById('rc-total').textContent   = 'Rs.' + data.total.toLocaleString();
  document.getElementById('rc-items').innerHTML = data.items.map(function(i) {
    return '<div class="receipt-row"><span style="color:var(--text2)">' + escH(i.label) + '</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700">Rs.' + Number(i.amount).toLocaleString() + '</span></div>';
  }).join('');
  var remRow = document.getElementById('rc-remark-row');
  if (data.remark) { document.getElementById('rc-remark').textContent = data.remark; remRow.style.display = ''; }
  else remRow.style.display = 'none';
  openModal('receipt-modal');
}

function printReceipt() {
  if (!lastReceiptData) return;
  var d = lastReceiptData;
  var stu = feeStatusData.find(function(s) { return s.studentId === (d.studentId || ''); });
  printDetailedReceipt({
    studentName: d.studentName,
    className:   d.className,
    rollNo:      (stu && stu.rollNo)     || '',
    fatherName:  (stu && stu.fatherName) || '',
    phone:       (stu && stu.phone)      || '',
    session:     d.session,
    total:       d.total,
    remark:      d.remark,
    items:       d.items,
    paidAt:      new Date(),
    receiptType: 'Fee Receipt'
  });
}

function openEditPay(pid, amount, label, remark) {
  document.getElementById('epm-id').value         = pid;
  document.getElementById('epm-sub').textContent  = label;
  document.getElementById('epm-amount').value     = amount;
  document.getElementById('epm-remark').value     = remark || '';
  openModal('edit-pay-modal');
}

function saveEditPayment() {
  var id     = document.getElementById('epm-id').value;
  var amount = parseInt(document.getElementById('epm-amount').value) || 0;
  var remark = document.getElementById('epm-remark').value.trim();
  if (amount < 1) { toast('Enter valid amount', 'error'); return; }
  var btn = document.getElementById('epm-save-btn');
  setLoading(btn, true);
  apiPut(API_FEE_PAY + '/' + id, {amount: amount, remark: remark}, true)
    .then(function() { toast('Payment updated'); closeModal('edit-pay-modal'); return loadFeeStatus(); })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save'; });
}

function openDelPay(pid, label) {
  document.getElementById('dpm-id').value        = pid;
  document.getElementById('dpm-sub').textContent = 'Delete payment for: ' + label + '?';
  openModal('del-pay-modal');
}

function confirmDeletePayment() {
  var id  = document.getElementById('dpm-id').value;
  var btn = document.getElementById('dpm-confirm-btn');
  setLoading(btn, true);
  apiDelete(API_FEE_PAY + '/' + id, true)
    .then(function() { toast('Payment deleted'); closeModal('del-pay-modal'); return loadFeeStatus(); })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Yes, Delete'; });
}

function quickAssignTransport(sid, rid, session) {
  apiPost(API_TRANSPORT_ASSIGN, {studentId: sid, routeId: rid || null, session: session}, true)
    .then(function() {
      toast(rid ? 'Transport assigned' : 'Transport removed');
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); });
}

function populateClassDropdowns() {
  var d4 = document.getElementById('st-class');
  if (d4) {
    d4.innerHTML = '<option value="">All Classes</option>' + classes.map(function(c) {
      return '<option value="' + c._id + '">' + escH(c.className) + '</option>';
    }).join('');
  }
  var am = document.getElementById('am-class');
  if (am) {
    am.innerHTML = '<option value="">All Classes</option>' + classes.map(function(c) {
      return '<option value="' + c._id + '">' + escH(c.className) + '</option>';
    }).join('');
  }
}

function openModal(id)  { document.getElementById(id).classList.add('show');    document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('show'); document.body.style.overflow = ''; }

document.querySelectorAll('.modal-overlay').forEach(function(el) {
  el.addEventListener('click', function(e) { if (e.target === this) closeModal(this.id); });
});

function setLoading(btn, on) { btn.disabled = on; if (on) btn.innerHTML = '...'; }

function escH(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escA(s) {
  return String(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

/* ─── Professional PDF Receipt ─────────────────────────────────── */
function numberToWords(num) {
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
    'Seventeen','Eighteen','Nineteen'];
  var tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (!num || num === 0) return 'Zero Rupees';
  function cvt(n) {
    if (n < 20)      return ones[n];
    if (n < 100)     return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000)    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + cvt(n % 100) : '');
    if (n < 100000)  return cvt(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + cvt(n % 1000) : '');
    if (n < 10000000)return cvt(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + cvt(n % 100000) : '');
    return cvt(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + cvt(n % 10000000) : '');
  }
  return 'Rupees ' + cvt(Math.floor(num));
}

function printDetailedReceipt(data) {
  function sh(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  var receiptNo = 'RCP-' + Date.now().toString().slice(-10);
  var paidDate  = data.paidAt instanceof Date ? data.paidAt : new Date(data.paidAt || Date.now());
  var dateStr   = paidDate.toLocaleDateString('en-IN', {day:'2-digit', month:'long', year:'numeric'});
  var timeStr   = paidDate.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true});
  var amtWords  = numberToWords(data.total || 0);

  var itemRows = (data.items || []).map(function(item, idx) {
    return '<tr>' +
      '<td class="c-sno">' + (idx + 1) + '</td>' +
      '<td class="c-desc">' +
        '<div class="item-title">' + sh(item.feeHead || item.label || '-') + '</div>' +
        (item.description ? '<div class="item-sub">' + sh(item.description) + '</div>' : '') +
      '</td>' +
      '<td class="c-month">' + sh(item.month || '-') + '</td>' +
      '<td class="c-amt">&#8377;' + Number(item.amount || 0).toLocaleString('en-IN') + '</td>' +
    '</tr>';
  }).join('');

  var css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"Segoe UI",Arial,sans-serif;background:#eef2ff;padding:28px;color:#0f172a}',
    '.rw{max-width:700px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 50px rgba(99,102,241,.2)}',
    '.rh{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;padding:30px 36px 26px;position:relative;overflow:hidden}',
    '.rh::before{content:"";position:absolute;right:-50px;top:-50px;width:230px;height:230px;border-radius:50%;background:rgba(255,255,255,.07)}',
    '.rh::after{content:"";position:absolute;left:55%;bottom:-70px;width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.05)}',
    '.school{font-size:24px;font-weight:900;position:relative;margin-bottom:3px}',
    '.receipt-type{font-size:11px;text-transform:uppercase;letter-spacing:.13em;opacity:.75;font-weight:700;position:relative}',
    '.rno{position:absolute;top:30px;right:36px;text-align:right}',
    '.rno-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.65;margin-bottom:3px}',
    '.rno-val{font-size:15px;font-weight:900;font-family:monospace;letter-spacing:.04em}',
    '.ab{background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:20px 36px;display:flex;justify-content:space-between;align-items:center}',
    '.al{font-size:10px;text-transform:uppercase;letter-spacing:.1em;opacity:.8;margin-bottom:5px;font-weight:700}',
    '.av{font-size:36px;font-weight:900;font-family:monospace;letter-spacing:-1px}',
    '.aw{font-size:10px;opacity:.8;margin-top:3px;font-style:italic}',
    '.dc{text-align:right}',
    '.dl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.75;margin-bottom:3px}',
    '.dv{font-size:14px;font-weight:700}',
    '.tv{font-size:12px;opacity:.8;margin-top:2px}',
    '.body{padding:28px 36px}',
    '.stitle{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.13em;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:8px}',
    '.stitle::after{content:"";flex:1;height:1px;background:#e2e8f0}',
    '.scard{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.fl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:3px}',
    '.fv{font-size:14px;font-weight:800;color:#1e293b}',
    '.fv.ac{color:#4f46e5}',
    'table.ft{width:100%;border-collapse:collapse;margin-bottom:8px;border:1.5px solid #e2e8f0;border-radius:11px;overflow:hidden}',
    'table.ft thead tr{background:linear-gradient(135deg,#4f46e5,#7c3aed)}',
    'table.ft thead th{padding:10px 13px;font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#fff;font-weight:800;text-align:left}',
    'table.ft thead th.c-amt{text-align:right}',
    'table.ft tbody tr:nth-child(even){background:#f8fafc}',
    '.c-sno{width:38px;padding:10px 13px;color:#94a3b8;font-size:12px;font-weight:600}',
    '.c-desc{padding:10px 13px}',
    '.item-title{font-size:13px;font-weight:700;color:#1e293b}',
    '.item-sub{font-size:10px;color:#64748b;margin-top:2px}',
    '.c-month{padding:10px 13px;font-size:12px;color:#475569;font-weight:600;white-space:nowrap}',
    '.c-amt{padding:10px 13px;text-align:right;font-family:monospace;font-weight:800;font-size:13px;color:#1e293b}',
    '.tr-total{background:#eef2ff}',
    '.tr-total td{padding:13px;font-weight:900;border-top:2.5px solid #6366f1}',
    '.tr-total td:first-child{font-size:11px;color:#6366f1;text-transform:uppercase;letter-spacing:.07em;padding-left:13px;colspan:3}',
    '.tr-total td.ta{text-align:right;font-family:monospace;font-size:17px;color:#4f46e5}',
    '.igrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0 24px}',
    '.ibox{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 15px}',
    '.il{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:3px}',
    '.iv{font-size:13px;font-weight:700;color:#334155}',
    '.footer{border-top:2px dashed #e2e8f0;padding:20px 36px;display:flex;justify-content:space-between;align-items:flex-end;background:#fafbff}',
    '.sig{text-align:center}',
    '.sig-line{width:150px;border-top:1.5px solid #cbd5e1;margin-bottom:5px}',
    '.sig-lbl{font-size:10px;color:#94a3b8;font-weight:600}',
    '.paid-stamp{display:inline-flex;align-items:center;justify-content:center;border:3.5px solid #10b981;color:#059669;border-radius:11px;padding:6px 18px;font-size:22px;font-weight:900;transform:rotate(-7deg);letter-spacing:.15em;opacity:.75}',
    '.pabtn{margin:0 36px 20px;display:flex;justify-content:center;gap:12px}',
    '.pabtn button{border-radius:10px;padding:11px 26px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;border:none}',
    '.btn-pr{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}',
    '.btn-cl{background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0!important;border:none}',
    '@media print{body{padding:0;background:#fff}.rw{box-shadow:none;border-radius:0}.pabtn{display:none!important}}'
  ].join('');

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>Fee Receipt</title><style>' + css + '</style></head><body>' +
    '<div class="rw">' +

    // ── Header ──
    '<div class="rh">' +
      '<div class="school">&#127979; Hello School</div>' +
      '<div class="receipt-type">' + sh(data.receiptType || 'Fee Receipt') + '</div>' +
      '<div class="rno"><div class="rno-lbl">Receipt No.</div><div class="rno-val">' + receiptNo + '</div></div>' +
    '</div>' +

    // ── Amount band ──
    '<div class="ab">' +
      '<div>' +
        '<div class="al">Amount Collected</div>' +
        '<div class="av">&#8377;' + Number(data.total || 0).toLocaleString('en-IN') + '</div>' +
        '<div class="aw">' + sh(amtWords) + ' Only</div>' +
      '</div>' +
      '<div class="dc">' +
        '<div class="dl">Payment Date</div>' +
        '<div class="dv">' + dateStr + '</div>' +
        '<div class="tv">' + timeStr + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="body">' +

    // ── Student info ──
    '<div class="stitle">Student Information</div>' +
    '<div class="scard">' +
      '<div><div class="fl">Student Name</div><div class="fv">' + sh(data.studentName || '-') + '</div></div>' +
      '<div><div class="fl">Class</div><div class="fv ac">' + sh(data.className || '-') + '</div></div>' +
      (data.rollNo     ? '<div><div class="fl">Roll No.</div><div class="fv">' + sh(data.rollNo) + '</div></div>'          : '<div></div>') +
      (data.fatherName ? '<div><div class="fl">Father\'s Name</div><div class="fv">' + sh(data.fatherName) + '</div></div>' : '<div></div>') +
      '<div><div class="fl">Session</div><div class="fv ac">' + sh(data.session || '-') + '</div></div>' +
      (data.phone      ? '<div><div class="fl">Contact</div><div class="fv">' + sh(data.phone) + '</div></div>'            : '<div></div>') +
    '</div>' +

    // ── Fee table ──
    '<div class="stitle">Fee Details</div>' +
    '<table class="ft">' +
      '<thead><tr>' +
        '<th class="c-sno">S.No</th>' +
        '<th class="c-desc">Fee Head / Description</th>' +
        '<th class="c-month">Month</th>' +
        '<th class="c-amt">Amount</th>' +
      '</tr></thead>' +
      '<tbody>' + itemRows + '</tbody>' +
      '<tfoot><tr class="tr-total">' +
        '<td colspan="3">Total Amount Paid</td>' +
        '<td class="ta">&#8377;' + Number(data.total || 0).toLocaleString('en-IN') + '</td>' +
      '</tr></tfoot>' +
    '</table>' +

    // ── Payment info boxes ──
    '<div class="igrid">' +
      '<div class="ibox"><div class="il">Payment Mode / Remark</div>' +
        '<div class="iv">' + sh(data.remark || 'Cash') + '</div></div>' +
      '<div class="ibox"><div class="il">Academic Session</div>' +
        '<div class="iv">' + sh(data.session || '-') + '</div></div>' +
    '</div>' +

    '</div>' + // end .body

    // ── Footer ──
    '<div class="footer">' +
      '<div>' +
        '<div class="paid-stamp">PAID</div>' +
        '<div style="font-size:10px;color:#94a3b8;max-width:210px;line-height:1.6;margin-top:8px">This is a computer-generated receipt. Valid without physical signature.</div>' +
      '</div>' +
      '<div class="sig">' +
        '<div class="sig-line"></div>' +
        '<div class="sig-lbl">Authorised Signatory</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:3px;font-weight:800">Hello School</div>' +
      '</div>' +
    '</div>' +

    // ── Print/Close buttons ──
    '<div class="pabtn">' +
      '<button class="btn-pr" onclick="window.print()">&#128424;&nbsp; Print Receipt</button>' +
      '<button class="btn-cl" onclick="window.close()">Close</button>' +
    '</div>' +

    '</div></body></html>';

  var w = window.open('', '_blank', 'width=780,height=940');
  if (!w) { toast('Please allow popups to print', 'error'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function printMonthRowReceipt(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;
  var items = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
    if (m && m.paymentId) items.push({entry: entry, month: m});
  });
  if (!items.length) { toast('No payment record found for this month', 'error'); return; }
  var totalPaid = items.reduce(function(s, i) { return s + (i.month.paidAmount || 0); }, 0);
  var paidAt    = (items[0] && items[0].month.paidAt) ? new Date(items[0].month.paidAt) : new Date();
  var remark    = (items[0] && items[0].month.remark) || '';
  printDetailedReceipt({
    studentName: stu.name,
    className:   (stu.class && stu.class.className) || '',
    rollNo:      stu.rollNo      || '',
    fatherName:  stu.fatherName  || '',
    phone:       stu.phone       || '',
    session:     currentSession,
    total:       totalPaid,
    remark:      remark,
    items: items.map(function(i) {
      return {
        feeHead:     i.entry.feeHeadName,
        description: '',
        month:       MONTHS[monthIndex],
        amount:      i.month.paidAmount || 0
      };
    }),
    paidAt:      paidAt,
    receiptType: 'Monthly Fee Receipt'
  });
}

function printTransportRowReceipt(sid, monthIndex, paidAmount, paidAtStr, remark, routeName, session) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;
  var paidAt = paidAtStr ? new Date(paidAtStr) : new Date();
  printDetailedReceipt({
    studentName: stu.name,
    className:   (stu.class && stu.class.className) || '',
    rollNo:      stu.rollNo     || '',
    fatherName:  stu.fatherName || '',
    phone:       stu.phone      || '',
    session:     session,
    total:       paidAmount,
    remark:      remark,
    items: [{
      feeHead:     'Transport Fee',
      description: routeName,
      month:       MONTHS[monthIndex],
      amount:      paidAmount
    }],
    paidAt:      paidAt,
    receiptType: 'Transport Fee Receipt'
  });
}

var toastTimer;
function toast(msg, type) {
  type = type || 'success';
  var t = document.getElementById('fm-toast');
  t.textContent = msg;
  t.className = 'fm-toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}