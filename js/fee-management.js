'use strict';

var API_FEE_HEADS        = API_BASE_URL + '/fee/heads';
var API_FEE_STRUCTURE    = API_BASE_URL + '/fee/structure';
var API_FEE_STATUS       = API_BASE_URL + '/fee/status';
var API_FEE_PAY          = API_BASE_URL + '/fee/pay';
var API_FEE_PAY_BULK     = API_BASE_URL + '/fee/pay/bulk';
var API_TRANSPORT_ROUTES = API_BASE_URL + '/transport/routes';
var API_TRANSPORT_BUSES  = API_BASE_URL + '/transport/buses';
var API_TRANSPORT_ASSIGN = API_BASE_URL + '/transport/assign';
var API_TRANSPORT_STATS  = API_BASE_URL + '/transport/route-stats';
var API_TRANSPORT_ROSTER = API_BASE_URL + '/transport/bus-roster';


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
var transportFbs      = {};
var feeStatusData     = [];
var filteredStatus    = [];
var expandedStudentId = null;
var fhEditId          = null;
var currentSession    = '';
var lastReceiptData   = null;

var pendingBusSelections = {};

var PAY_REG = {};
var payIdx  = 0;
function regPay(d) { var k = 'p' + (payIdx++); PAY_REG[k] = d; return k; }

var FLEET_REG = {};
var fleetIdx  = 0;
function regFleet(d) { 
  var k = 'f' + (fleetIdx++); 
  FLEET_REG[k] = d; 
  return k; 
}

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
  var n = new Date(), mo = n.getMonth() + 1, y = n.getFullYear();
  currentSession = mo >= 4
    ? (y + '-' + String(y + 1).slice(2))
    : ((y - 1) + '-' + String(y).slice(2));
  applySession(currentSession);
  Promise.all([loadFeeHeads(), loadClasses(), loadTransportRoutes()]);
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
    .then(function(r) {
      transportRoutes = r.data || [];
      renderRoutesList();
      // Silently load saved months for all routes
      if (currentSession) {
        apiGet(API_FEE_STRUCTURE + '?session=' + encodeURIComponent(currentSession), true)
          .then(function(res) {
            if (!res.data) { initTransportBuilderState(); return; }
            if (res.data.startMonth !== undefined) startMonth = res.data.startMonth;
            initTransportBuilderState();
            (res.data.transportEntries || []).forEach(function(te) {
              var rid = String((te.routeId && te.routeId._id) ? te.routeId._id : te.routeId);
              if (rid) transportFbs[rid] = { dueMonths: Array.from(te.dueMonths || []) };
            });
          }).catch(function() { initTransportBuilderState(); });
      } else {
        initTransportBuilderState();
      }
    })
    .catch(function(e) { document.getElementById('routes-list').innerHTML = '<div class="fm-card"><div class="fm-empty">!' + escH(e.message) + '</div></div>'; });
}

function loadAllStudents() {
  return apiGet(API_ENDPOINTS.STUDENTS + '?limit=9999&isActive=true', true)
    .then(function(r) {
      allStudents = r.data || [];
      var pagination = r.pagination;

      // If backend still caps and there are more pages, fetch them all
      if (pagination && pagination.totalPages > 1) {
        var pagePromises = [];
        for (var p = 2; p <= pagination.totalPages; p++) {
          pagePromises.push(
            apiGet(API_ENDPOINTS.STUDENTS + '?limit=9999&isActive=true&page=' + p, true)
              .then(function(res) { return res.data || []; })
          );
        }
        return Promise.all(pagePromises).then(function(pages) {
          pages.forEach(function(page) {
            allStudents = allStudents.concat(page);
          });
        });
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
  if (n === 2) loadFleetOverview();
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
  if (!transportRoutes.length) {
    el.innerHTML = '<div class="fm-card"><div class="fm-empty"><div class="ei">?</div>No routes yet.</div></div>';
    return;
  }
  
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
      '<div class="route-body" id="rb-' + rt._id + '"><div class="fm-empty" style="padding:14px 0">Click to expand</div></div>' +
      '</div>';
  }).join('');

  // ONE batch call for all badge counts instead of N×2 calls
  apiGet(API_TRANSPORT_STATS, true)
    .then(function(r) {
      var stats = r.data || {};
      transportRoutes.forEach(function(rt) {
        var s  = stats[rt._id] || { busCount: 0, studentCount: 0 };
        var bc = document.getElementById('rbc-' + rt._id);
        var sc = document.getElementById('rsc-' + rt._id);
        if (bc) bc.textContent = s.busCount + ' bus' + (s.busCount !== 1 ? 'es' : '');
        if (sc) sc.textContent = s.studentCount + ' student' + (s.studentCount !== 1 ? 's' : '');
      });
    })
    .catch(function() {
      transportRoutes.forEach(function(rt) {
        var bc = document.getElementById('rbc-' + rt._id);
        var sc = document.getElementById('rsc-' + rt._id);
        if (bc) bc.textContent = '?';
        if (sc) sc.textContent = '?';
      });
    });
}

// ── FLEET OVERVIEW ──────────────────────────────────────────────
function loadFleetOverview() {
  FLEET_REG = {};
  var el = document.getElementById('fleet-overview-container');
  if (!el) return;
  el.innerHTML = '<div class="fm-empty" style="padding:18px 0"><div class="ei">⏳</div>Loading fleet...</div>';
 
  var session = currentSession;
  if (!session) return;
 
  apiGet(API_TRANSPORT_ROSTER + '?session=' + encodeURIComponent(session), true)
    .then(function(r) {
      var routes = r.data || [];
      if (!routes.length) {
        el.innerHTML = '<div class="fm-empty">No routes or buses yet. Add routes in Tab 2.</div>';
        return;
      }
 
      var html = '';
 
      routes.forEach(function(route) {
        var buses       = route.buses      || [];
        var unassigned  = route.unassigned || [];
        var totalStus   = buses.reduce(function(s, b) { return s + b.students.length; }, 0) + unassigned.length;
        var totalCap    = buses.reduce(function(s, b) { return s + (b.capacity || 0); }, 0);
        var totalOnBus  = buses.reduce(function(s, b) { return s + b.students.length; }, 0);
        var overallOcc  = totalCap > 0 ? Math.round((totalOnBus / totalCap) * 100) : null;
        var occColor    = overallOcc === null ? '#6366f1'
          : overallOcc >= 90 ? '#ef4444'
          : overallOcc >= 70 ? '#f59e0b' : '#10b981';
 
        /* ── Header ── */
        html += '<div class="fov2-item" id="fov2-' + route._id + '">';
        html += '<div class="fov2-header" onclick="toggleFov2(\'' + route._id + '\')">';
        html += '<span class="fov2-icon">&#128652;</span>';
        html += '<div class="fov2-route-info">';
        html += '<div class="fov2-route-name">' + escH(route.name) + '</div>';
        html += '<div class="fov2-route-path">' + escH(route.from) + ' \u2192 ' + escH(route.to) + '</div>';
        html += '</div>';
 
        /* stat badges */
        html += '<div class="fov2-stat-badges">';
        html += '<span class="fov2-badge fov2-b-bus">' + buses.length + ' bus' + (buses.length !== 1 ? 'es' : '') + '</span>';
        html += '<span class="fov2-badge fov2-b-stu">' + totalStus + ' student' + (totalStus !== 1 ? 's' : '') + '</span>';
        if (overallOcc !== null) {
          html += '<span class="fov2-badge" style="background:' + occColor + '18;color:' + occColor + ';border-color:' + occColor + '44">' + overallOcc + '% full</span>';
        }
        if (unassigned.length) {
          html += '<span class="fov2-badge fov2-b-warn">&#9888; ' + unassigned.length + ' unassigned</span>';
        }
        html += '</div>'; /* badges */
 
        html += '<span class="fov2-chevron">&#9660;</span>';
        html += '</div>'; /* header */
 
        /* ── Body (hidden by default) ── */
        html += '<div class="fov2-body" id="fov2body-' + route._id + '">';
 
        if (buses.length || unassigned.length) {
          html += '<div class="fov2-bus-grid">';
 
          /* regular bus tiles */
          buses.forEach(function(bus) {
            var k = regFleet({
              bus: bus, routeId: route._id, students: bus.students,
              route: route, isUnassigned: false
            });
            var occ   = bus.capacity ? Math.round((bus.students.length / bus.capacity) * 100) : null;
            var oc    = occ === null ? '#6366f1' : occ >= 90 ? '#ef4444' : occ >= 70 ? '#f59e0b' : '#10b981';
            var pct   = bus.capacity ? Math.min(100, Math.round((bus.students.length / bus.capacity) * 100)) : 0;
 
            html += '<div class="fov2-bus-tile" onclick="openBusRosterFromReg(\'' + k + '\')">';
            html += '<div class="fov2-tile-top">';
            html += '<div class="fov2-tile-num">' + escH(bus.busNumber || 'No No.') + '</div>';
            if (occ !== null) {
              html += '<div style="font-size:9px;font-weight:800;background:' + oc + '18;color:' + oc + ';border:1.5px solid ' + oc + '33;border-radius:4px;padding:1px 5px">' + occ + '%</div>';
            }
            html += '</div>';
            html += '<div class="fov2-tile-driver">&#128100; ' + escH(bus.driverName) + '</div>';
            html += '<div class="fov2-tile-count" style="color:' + oc + '">';
            html += bus.students.length + '<span>/' + (bus.capacity || '?') + ' seats</span></div>';
            if (bus.capacity) {
              html += '<div class="fov2-occ-bar"><div class="fov2-occ-fill" style="width:' + pct + '%;background:' + oc + '"></div></div>';
            }
            html += '<div class="fov2-tile-hint">Tap to view roster \u2192</div>';
            html += '</div>'; /* bus-tile */
          });
 
          /* unassigned tile */
          if (unassigned.length) {
            var ku = regFleet({
              bus: null, routeId: route._id, students: unassigned,
              route: route, isUnassigned: true
            });
            html += '<div class="fov2-bus-tile fov2-tile-unassigned" onclick="openBusRosterFromReg(\'' + ku + '\')">';
            html += '<div class="fov2-tile-top">';
            html += '<div class="fov2-tile-num" style="color:#c2410c">No Bus</div>';
            html += '<div style="font-size:9px;font-weight:800;background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;border-radius:4px;padding:1px 5px">!</div>';
            html += '</div>';
            html += '<div class="fov2-tile-driver" style="color:#c2410c">&#9888; Not assigned to bus</div>';
            html += '<div class="fov2-tile-count" style="color:#c2410c">' + unassigned.length + '<span style="color:#ea580c"> students</span></div>';
            html += '<div class="fov2-tile-hint" style="color:#c2410c">Tap to view \u2192</div>';
            html += '</div>';
          }
 
          html += '</div>'; /* bus-grid */
        } else {
          html += '<div class="fov2-no-buses">No buses added to this route yet.</div>';
        }
 
        html += '</div>'; /* fov2-body */
        html += '</div>'; /* fov2-item */
      });
 
      el.innerHTML = html;
    })
    .catch(function(e) {
      el.innerHTML = '<div class="fm-empty">Failed to load fleet: ' + escH(e.message) + '</div>';
    });
}

function toggleFov2(routeId) {
  var item = document.getElementById('fov2-' + routeId);
  var body = document.getElementById('fov2body-' + routeId);
  if (!item || !body) return;

  var isOpen = item.classList.contains('fov2-open');
  item.classList.toggle('fov2-open', !isOpen);
  body.style.display = isOpen ? 'none' : 'block';

  if (!isOpen) {
    setTimeout(function() {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
}

function openBusRosterModal(bus, routeId, students, route, isUnassigned) {
  var modal = document.getElementById('bus-roster-modal');
  var title = document.getElementById('brm-title');
  var sub   = document.getElementById('brm-sub');
  var info  = document.getElementById('brm-bus-info');
  var tbody = document.getElementById('brm-student-tbody');
  var cnt   = document.getElementById('brm-student-count');

  window._busRosterData = { bus: bus, route: route, students: students, isUnassigned: isUnassigned };

  if (isUnassigned) {
    title.textContent = 'Unassigned Students — ' + (route ? route.name : '');
    sub.textContent   = 'Students on this route not assigned to any specific bus';
    info.innerHTML    = '<div class="brm-info-grid">' +
      '<div><div class="brm-il">Route</div><div class="brm-iv">' + escH(route.name) + '</div></div>' +
      '<div><div class="brm-il">Path</div><div class="brm-iv">' + escH(route.from) + ' → ' + escH(route.to) + '</div></div>' +
      '<div><div class="brm-il">Monthly Fee</div><div class="brm-iv">Rs.' + (route.amount || 0).toLocaleString() + '</div></div>' +
    '</div>';
  } else {
    title.textContent = 'Bus Roster — ' + (bus.busNumber || 'No Bus No.');
    sub.textContent   = route ? route.name + '  (' + route.from + ' → ' + route.to + ')' : '';
    info.innerHTML    = '<div class="brm-info-grid">' +
      '<div><div class="brm-il">Bus Number</div><div class="brm-iv brm-bus-no">' + escH(bus.busNumber || 'Not Set') + '</div></div>' +
      '<div><div class="brm-il">Driver</div><div class="brm-iv">&#128100; ' + escH(bus.driverName) + '</div></div>' +
      '<div><div class="brm-il">Driver Contact</div><div class="brm-iv">&#128222; ' + escH(bus.driverContact) + '</div></div>' +
      '<div><div class="brm-il">Capacity</div><div class="brm-iv">' + (bus.capacity ? bus.capacity + ' seats' : 'Not set') + '</div></div>' +
      '<div><div class="brm-il">Route</div><div class="brm-iv">' + escH(route ? route.name : '') + '</div></div>' +
      '<div><div class="brm-il">Monthly Fee</div><div class="brm-iv">Rs.' + (route ? (route.amount || 0).toLocaleString() : '0') + '</div></div>' +
    '</div>';
  }

  cnt.textContent = students.length + ' student' + (students.length !== 1 ? 's' : '');

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text3);font-size:13px">No students assigned.</td></tr>';
  } else {
    tbody.innerHTML = students.map(function(s, idx) {
      return '<tr>' +
        '<td style="color:var(--text3);font-size:11px;font-weight:600">' + (idx + 1) + '</td>' +
        '<td>' +
          '<div style="font-size:13px;font-weight:800;color:#0f172a">' + escH(s.name) + '</div>' +
          (s.rollNo ? '<div style="font-size:10px;color:var(--text3)">Roll ' + escH(s.rollNo) + '</div>' : '') +
        '</td>' +
        '<td style="font-size:12px;font-weight:600">' + escH(s.class || '-') + '</td>' +
        '<td>' +
          '<div style="font-size:12px;font-weight:700">' + escH(s.fatherName || '-') + '</div>' +
        '</td>' +
        '<td>' +
          (s.phone ? '<a href="tel:' + escH(s.phone) + '" style="font-size:12px;font-weight:700;color:var(--brand);text-decoration:none">&#128222; ' + escH(s.phone) + '</a>' : '<span style="color:var(--text3);font-size:11px">—</span>') +
        '</td>' +
      '</tr>';
    }).join('');
  }

  openModal('bus-roster-modal');
}

function printBusRoster() {
  var d = window._busRosterData;
  if (!d) return;
  var route = d.route || {};
  var bus   = d.bus   || {};
  var students = d.students || [];
  var isUnassigned = d.isUnassigned;

  var dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  var rows = students.map(function(s, idx) {
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">' + (idx + 1) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a">' +
        escH(s.name) + (s.rollNo ? '<br><span style="font-size:10px;color:#94a3b8;font-weight:600">Roll ' + escH(s.rollNo) + '</span>' : '') +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#334155">' + escH(s.class || '-') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#0f172a">' + escH(s.fatherName || '-') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#4f46e5">' + escH(s.phone || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;width:80px"></td>' +
    '</tr>';
  }).join('');

  var busBlock = isUnassigned ? '' :
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">' +
      _infoBox('Bus Number', bus.busNumber || 'Not Set') +
      _infoBox('Driver Name', bus.driverName || '—') +
      _infoBox('Driver Contact', bus.driverContact || '—') +
      _infoBox('Capacity', bus.capacity ? bus.capacity + ' seats' : 'Not set') +
      _infoBox('Route', route.name || '—') +
      _infoBox('Monthly Fee', 'Rs.' + (route.amount || 0).toLocaleString()) +
    '</div>';

  function _infoBox(label, value) {
    return '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px 13px">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:3px">' + label + '</div>' +
      '<div style="font-size:14px;font-weight:800;color:#1e293b">' + escH(String(value)) + '</div>' +
    '</div>';
  }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bus Roster</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",Arial,sans-serif;background:#eef2ff;padding:28px;color:#0f172a}' +
    '.wrap{max-width:900px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(99,102,241,.18)}' +
    '.hdr{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:26px 32px}' +
    '.hdr-title{font-size:22px;font-weight:900;margin-bottom:3px}' +
    '.hdr-sub{font-size:12px;opacity:.75;font-weight:600}' +
    '.hdr-date{font-size:11px;opacity:.65;margin-top:6px}' +
    '.body{padding:26px 32px}' +
    'table{width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden}' +
    'thead tr{background:linear-gradient(135deg,#4f46e5,#7c3aed)}' +
    'thead th{padding:10px 10px;font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#fff;font-weight:800;text-align:left}' +
    'tbody tr:nth-child(even){background:#f8fafc}' +
    '.foot{border-top:1px dashed #e2e8f0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;background:#fafbff}' +
    '.sig{text-align:center}.sig-line{width:130px;border-top:1.5px solid #cbd5e1;margin-bottom:4px}' +
    '@media print{body{background:#fff;padding:0}.wrap{box-shadow:none;border-radius:0}.pabtn{display:none!important}}' +
    '.pabtn{display:flex;justify-content:center;gap:12px;padding:16px 32px 24px}' +
    '.pabtn button{border-radius:9px;padding:10px 24px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;border:none}' +
    '</style></head><body><div class="wrap">' +
    '<div class="hdr">' +
      '<div class="hdr-title">&#127979; Hello School — Bus Roster</div>' +
      '<div class="hdr-sub">' + (isUnassigned ? 'Unassigned Students — ' : 'Bus: ') + escH(isUnassigned ? route.name : (bus.busNumber || 'No Bus No.')) + '</div>' +
      '<div class="hdr-date">Printed: ' + dateStr + ' &nbsp;·&nbsp; Session: ' + escH(currentSession || '') + '</div>' +
    '</div>' +
    '<div class="body">' +
      busBlock +
      '<div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
        'Student Roster <span style="color:#4f46e5;font-size:13px;font-weight:900">' + students.length + '</span>' +
        '<span style="flex:1;height:1px;background:#e2e8f0;margin-left:6px"></span>' +
      '</div>' +
      '<table><thead><tr>' +
        '<th style="width:36px">#</th>' +
        '<th>Student Name</th>' +
        '<th>Class</th>' +
        '<th>Father\'s Name</th>' +
        '<th>Phone</th>' +
        '<th>Signature</th>' +
      '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" style="text-align:center;padding:18px;color:#94a3b8">No students assigned.</td></tr>') +
      '</tbody></table>' +
    '</div>' +
    '<div class="foot">' +
      '<div>Hello School &middot; Transport Management &middot; ' + escH(currentSession || '') + '</div>' +
      '<div class="sig"><div class="sig-line"></div><div style="font-size:10px;color:#64748b;font-weight:700">Authorised Signatory</div></div>' +
    '</div>' +
    '<div class="pabtn">' +
      '<button style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff" onclick="window.print()">&#128424; Print Roster</button>' +
      '<button style="background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0" onclick="window.close()">Close</button>' +
    '</div>' +
  '</div></body></html>';

  var w = window.open('', '_blank', 'width=960,height=900');
  if (!w) { toast('Please allow popups to print', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function loadRouteStats(rid) {
  // This is now only called when a specific route card is expanded.
  // It fetches full bus + assignment arrays for that one route only.
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
  var isExpanding = card.classList.toggle('expanded');
  if (isExpanding) {
    var body = document.getElementById('rb-' + rid);
    body.innerHTML = '<div class="fm-empty" style="padding:14px 0">Loading...</div>';
    loadRouteStats(rid).then(function() {
      renderRouteBody(rid);
    });
  }
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
  // ── Fee months for this route ──
  if (!transportFbs[rid]) transportFbs[rid] = { dueMonths: getSessionMonths().slice() };
  var tfbR   = transportFbs[rid];
  var mthsR  = getSessionMonths();
  var allSelR = tfbR.dueMonths.length === 12;
  html += '<div class="sec-title" style="margin-top:16px">Fee Charged Months</div>';
  html += '<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:7px">Deselect months when transport fee is NOT charged (e.g. summer vacation)</div>';
  html += '<div class="month-grid" id="rb-tfbmon-' + rid + '">' +
    '<div class="m-chip all-m ' + (allSelR ? 'selected' : '') + '" onclick="rbTFbToggleAllMon(\'' + rid + '\')">All</div>' +
    mthsR.map(function(m) {
      return '<div class="m-chip ' + (tfbR.dueMonths.indexOf(m) > -1 ? 'selected' : '') +
        '" onclick="rbTFbToggleMon(\'' + rid + '\',' + m + ')">' + SHORT_MONTHS[m] + '</div>';
    }).join('') + '</div>';
  html += '<button class="btn-primary" style="font-size:11px;padding:6px 14px;margin-top:9px;margin-bottom:4px" ' +
    'onclick="saveRouteMonths(\'' + rid + '\')">&#128190; Save Fee Months</button>';
  html += '<div class="sec-title" style="margin-top:16px">Assigned Students</div>';
  if (stus.length) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:9px">' + stus.map(function(s) {
      var nm = (s.student && s.student.name) ? s.student.name : '?';
      var cn = (s.student && s.student.class && s.student.class.className) ? s.student.class.className : '';
      var busInfo = s.busNumber ? ' · ' + escH(s.busNumber) : '';
      var busId = s.busId ? String(s.busId._id || s.busId) : '';
return '<div class="stu-chip-sm">' +
  '<div class="stu-av-sm">' + nm.charAt(0).toUpperCase() + '</div>' +
  escH(nm) +
  '<span style="color:var(--text3);font-size:10px">' + escH(cn) + busInfo + '</span>' +
  '<button onclick="openChangeBusModal(\'' + s._id + '\',\'' + escA(nm) + '\',\'' + busId + '\',\'' + rid + '\')"' +
    ' style="font-size:9px;font-weight:800;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:4px;padding:1px 5px;cursor:pointer;font-family:inherit;margin-left:2px">Bus</button>' +
  '<span class="stu-chip-remove" onclick="removeAssignment(\'' + s._id + '\',\'' + rid + '\')">X</span>' +
  '</div>';
    }).join('') + '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text3);padding:5px 0 9px">No students assigned.</div>';
  }
  html += '<button class="btn-green" onclick="openAssignModal(\'' + rid + '\')">+ Assign Students</button>';
  document.getElementById('rb-' + rid).innerHTML = html;
}


function openChangeBusModal(assignmentId, studentName, currentBusId, rid) {
  var buses = routeBusCache[rid] || [];
  document.getElementById('cbm2-aid').value  = assignmentId;
  document.getElementById('cbm2-rid').value  = rid;
  document.getElementById('cbm2-sub').textContent = 'Changing bus for: ' + studentName;

  var sel = document.getElementById('cbm2-bus');
  sel.innerHTML =
    '<option value="">No specific bus</option>' +
    buses.map(function(b) {
      return '<option value="' + b._id + '"' + (String(b._id) === currentBusId ? ' selected' : '') + '>' +
        escH(b.busNumber || 'Bus') + ' — ' + escH(b.driverName) + '</option>';
    }).join('');

  openModal('change-bus-modal');
}

function saveChangeBus() {
  var aid     = document.getElementById('cbm2-aid').value;
  var rid     = document.getElementById('cbm2-rid').value;
  var newBusId = document.getElementById('cbm2-bus').value || null;
  var session = currentSession;

  // Find the studentId from cache
  var assignment = (routeStuCache[rid] || []).find(function(a) {
    return String(a._id) === String(aid);
  });
  if (!assignment) { toast('Assignment not found', 'error'); return; }

  var sid = String(assignment.studentId || (assignment.student && assignment.student._id));

  var btn = document.getElementById('cbm2-save-btn');
  setLoading(btn, true);

  // Re-send full list with this student's bus updated
  var allStudentsPayload = (routeStuCache[rid] || []).map(function(a) {
    var s  = String(a.studentId || (a.student && a.student._id));
    var b  = a.busId ? String(a.busId._id || a.busId) : null;
    if (s === sid) b = newBusId; // update this one
    return { studentId: s, busId: b };
  });

  apiPost(API_TRANSPORT_ASSIGN, { routeId: rid, students: allStudentsPayload, session: session }, true)
    .then(function() {
      toast('Bus updated');
      closeModal('change-bus-modal');
      routeStuCache[rid] = null;
      return loadRouteStats(rid);
    })
    .then(function() {
      var card = document.getElementById('rc-' + rid);
      if (card && card.classList.contains('expanded')) renderRouteBody(rid);
      loadFleetOverview();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save'; });
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

function openBusRosterFromReg(k) {
  var d = FLEET_REG[k];
  if (!d) {
    console.error("Invalid key:", k);
    return;
  }

  openBusRosterModal(
    d.bus,
    d.routeId,
    d.students,
    d.route,
    d.isUnassigned
  );
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
  var cachePromise = routeStuCache[rid] ? Promise.resolve() : loadRouteStats(rid);
  var loadPromise  = allStudents.length  ? Promise.resolve() : loadAllStudents();

  return Promise.all([cachePromise, loadPromise]).then(function() {
    document.getElementById('am-route-id').value = rid;
    var rt = transportRoutes.find(function(r) { return r._id === rid; });
    document.getElementById('assign-modal-sub').textContent =
      'Assigning to: ' + ((rt && rt.name) || 'Route');

    var amCls = document.getElementById('am-class');
    amCls.innerHTML = '<option value="">All Classes</option>' +
      classes.map(function(c) {
        return '<option value="' + c._id + '">' + escH(c.className) + '</option>';
      }).join('');
    document.getElementById('am-search').value = '';
    pendingBusSelections = {};

    // ── Populate & show global bus selector ──
    var buses      = routeBusCache[rid] || [];
    var amBusRow   = document.getElementById('am-bus-row');
    var amBusSel   = document.getElementById('am-bus');
    if (buses.length > 0 && amBusRow && amBusSel) {
      amBusSel.innerHTML =
        '<option value="">Tap to select bus</option>' +
        buses.map(function(b) {
          return '<option value="' + b._id + '">' +
            escH(b.busNumber || 'Bus') + ' — ' + escH(b.driverName) + '</option>';
        }).join('');
      amBusSel.onchange = applyGlobalBus;
      amBusRow.style.display = 'block';
    } else if (amBusRow) {
      amBusRow.style.display = 'none';
    }

    filterAssignStudents();
    openModal('assign-modal');
  });
}

// Called when global bus selector changes — applies to ALL checked students
function applyGlobalBus() {
  var globalBusId = document.getElementById('am-bus').value;
  document.querySelectorAll('#assign-student-list input[type="checkbox"]:checked').forEach(function(cb) {
    var sid = cb.value;
    if (globalBusId) {
      pendingBusSelections[sid] = globalBusId;
    } else {
      delete pendingBusSelections[sid];
    }
    // Visually update per-student dropdown too
    var perSelect = document.querySelector(
      '#assign-student-list .bus-select[data-student-id="' + sid + '"]'
    );
    if (perSelect) perSelect.value = globalBusId || perSelect.options[0].value;
  });
  var count = document.querySelectorAll('#assign-student-list input[type="checkbox"]:checked').length;
  if (globalBusId && count > 0) {
    toast(count + ' student(s) set to this bus');
  }
}

// Called when a student checkbox is checked/unchecked
function onStudentCheck(cb) {
  var sid = cb.value;
  if (!cb.checked) {
    delete pendingBusSelections[sid];
    return;
  }
  // Auto-apply global bus to newly checked student
  var globalBusId = document.getElementById('am-bus') && document.getElementById('am-bus').value;
  if (globalBusId) {
    pendingBusSelections[sid] = globalBusId;
    var perSelect = document.querySelector(
      '#assign-student-list .bus-select[data-student-id="' + sid + '"]'
    );
    if (perSelect) perSelect.value = globalBusId;
  }
}

function filterAssignStudents() {
  var cls    = document.getElementById('am-class').value;
  var search = document.getElementById('am-search').value.toLowerCase().trim();
  var rid    = document.getElementById('am-route-id').value;
  var buses  = routeBusCache[rid] || [];

  // Build map of already-assigned student IDs
  var assignedMap = {};
  (routeStuCache[rid] || []).forEach(function(a) {
    var sid = String(a.studentId || (a.student && a.student._id));
    assignedMap[sid] = true;
  });

  // Only show UNASSIGNED students
  var list = allStudents.filter(function(s) {
    if (assignedMap[String(s._id)]) return false; // already on route — hide
    if (cls) {
      var cid = s.classId && s.classId._id ? String(s.classId._id) : String(s.classId || '');
      if (cid !== String(cls)) return false;
    }
    if (search) {
      if (!(s.name && s.name.toLowerCase().includes(search)) &&
          !String(s.rollNo || '').includes(search)) return false;
    }
    return true;
  });

  var el = document.getElementById('assign-student-list');
  el.style.alignItems = 'stretch';

  if (!list.length) {
    el.innerHTML = '<div class="fm-empty">No unassigned students found for this route.</div>';
    return;
  }

  var hasBuses = buses.length > 0;

 el.innerHTML = list.map(function(s) {
  var cn      = (s.classId && s.classId.className) || (s.class && s.class.className) || '';
  var initial = s.name.charAt(0).toUpperCase();

  return '<label style="display:flex;flex-direction:column;padding:10px 12px;border-radius:8px;cursor:pointer;' +
    'border:1.5px solid #e2e8f0;background:#fff;width:100%;list-style:none">' +
    '<div style="display:flex;align-items:center;gap:12px;width:100%">' +
      '<input type="checkbox" value="' + s._id + '"' +
        ' onchange="onStudentCheck(this)"' +
        ' style="width:16px;height:16px;flex-shrink:0;cursor:pointer;accent-color:#4f46e5;margin:0">' +
      '<div style="width:34px;height:34px;border-radius:8px;background:#4f46e5;display:flex;align-items:center;' +
        'justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">' + initial + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:#0f172a">' + escH(s.name) + '</div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-top:1px">' +
          escH(cn) + (s.rollNo ? ' · Roll ' + s.rollNo : '') +
          (s.fatherName ? ' · S/O ' + escH(s.fatherName) : '') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</label>';
}).join('');
}

function saveAssignments() {
  var rid     = document.getElementById('am-route-id').value;
  var session = currentSession || document.getElementById('st-session').value;
  if (!session) { toast('Session not loaded yet', 'error'); return; }

  var students = [];
  document.querySelectorAll('#assign-student-list input[type="checkbox"]:checked').forEach(function(cb) {
  var sid   = cb.value;
  var busId = pendingBusSelections[sid] || null;
  // Fallback to global selector if no explicit selection tracked
  if (!busId) {
    var globalSel = document.getElementById('am-bus');
    busId = (globalSel && globalSel.value) ? globalSel.value : null;
  }
  students.push({ studentId: sid, busId: busId });
});

  if (!students.length) { toast('Select at least one student', 'error'); return; }

  var btn = document.getElementById('am-save-btn');
  setLoading(btn, true);

  // Merge with existing assignments so server doesn't remove them
  var existing = (routeStuCache[rid] || []).map(function(a) {
    var sid = String(a.studentId || (a.student && a.student._id));
    var bid = a.busId ? String(a.busId._id || a.busId) : null;
    return { studentId: sid, busId: bid };
  });

  var allStudentsPayload = existing.concat(students);

  apiPost(API_TRANSPORT_ASSIGN, { routeId: rid, students: allStudentsPayload, session: session }, true)
    .then(function() {
      toast(students.length + ' student(s) assigned');
      closeModal('assign-modal');
      pendingBusSelections = {};
      routeStuCache[rid] = null;
      routeBusCache[rid] = null;
      return loadRouteStats(rid);
    })
    .then(function() {
      var card = document.getElementById('rc-' + rid);
      if (card && card.classList.contains('expanded')) renderRouteBody(rid);
      loadFleetOverview();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Save'; });
}

function removeAssignment(aid, rid) {
  if (!confirm('Remove from route?')) return;
  apiDelete(API_TRANSPORT_ASSIGN + '/' + aid, true)
    .then(function() {
      toast('Removed');
      routeStuCache[rid] = null;
      return loadRouteStats(rid);
    }).then(function() { 
      renderRouteBody(rid); 
      loadFleetOverview(); // ADD THIS LINE
    })
    .catch(function(e) { toast(e.message, 'error'); });
}

function initFeeSetupTab() {
  initBuilderState();
  initTransportBuilderState();
  renderFeeBuilder();
  renderTransportFeeBuilder();
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

function initTransportBuilderState() {
  transportRoutes.forEach(function(rt) {
    if (!transportFbs[rt._id]) {
      transportFbs[rt._id] = { dueMonths: getSessionMonths().slice() };
    }
  });
}

function onSessionChange() {
  var session = document.getElementById('fs-session').value;
  if (!session) return;
  Object.keys(fbs).forEach(function(k) { fbs[k].enabled = false; fbs[k].amount = ''; fbs[k].classIds = []; fbs[k].dueMonths = []; });
  transportFbs = {};
  initTransportBuilderState();
  renderFeeBuilder();
  renderTransportFeeBuilder();
  buildPreview();
  loadExistingStructure(session);
}

function onStartMonthChange() {
  startMonth = parseInt(document.getElementById('fs-start-month').value) || 3;
  feeHeads.forEach(function(fh) { if (fbs[fh._id] && fbs[fh._id].enabled) renderFBMonths(fh._id); });
  renderTransportFeeBuilder();
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
      (s.transportEntries || []).forEach(function(te) {
        var rid = String((te.routeId && te.routeId._id) ? te.routeId._id : te.routeId);
        if (rid) {
          transportFbs[rid] = { dueMonths: Array.from(te.dueMonths || []) };
        }
      });
      renderTransportFeeBuilder();

      renderFeeBuilder();
      buildPreview();
     // toast('Structure loaded');
    }).catch(function(e) { console.error('loadExistingStructure:', e); });
}

function updateTransportNote() {
  var el = document.getElementById('transport-note-text');
  if (!el) return;
  if (!transportRoutes.length) { el.textContent = 'No transport routes. Add routes in Tab 2 first.'; return; }
  el.textContent = 'Transport fees auto-added: ' + transportRoutes.map(function(r) { return r.name + ' (Rs.' + r.amount + '/mo)'; }).join(', ');
}

function renderTransportFeeBuilder() {
  var section = document.getElementById('transport-builder-section');
  var el      = document.getElementById('transport-builder-list');
  if (!section || !el) return;

  if (!transportRoutes.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  el.innerHTML = transportRoutes.map(function(rt) {
    var tfb    = transportFbs[rt._id] || { dueMonths: getSessionMonths().slice() };
    var months = getSessionMonths();
    var allSel = tfb.dueMonths.length === 12;

    var monthChips =
      '<div class="m-chip all-m ' + (allSel ? 'selected' : '') + '" onclick="tFbToggleAllMon(\'' + rt._id + '\')">All</div>' +
      months.map(function(m) {
        return '<div class="m-chip ' + (tfb.dueMonths.indexOf(m) > -1 ? 'selected' : '') +
          '" onclick="tFbToggleMon(\'' + rt._id + '\',' + m + ')">' + SHORT_MONTHS[m] + '</div>';
      }).join('');

    return '<div class="fb-card on" style="border-color:#fed7aa">' +
      '<div class="fb-header" style="background:#fff7ed">' +
        '<div style="width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#ea580c,#f97316);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">&#128652;</div>' +
        '<div class="fb-title">' + escH(rt.name) +
          ' <span style="font-size:11px;font-weight:600;color:var(--text3)">' + escH(rt.from) + ' → ' + escH(rt.to) + '</span></div>' +
        '<div class="fb-summary ok" id="tfbsum-' + rt._id + '">Rs.' + rt.amount + ' × ' + tfb.dueMonths.length + 'mo</div>' +
      '</div>' +
      '<div class="fb-body" style="border-top:1.5px solid #fed7aa;background:#fffbf5">' +
        '<div class="fm-form-group" style="margin-bottom:0"><label class="fm-label">Due Months (deselect months when transport is not charged)</label>' +
        '<div class="month-grid" id="tfbmon-' + rt._id + '">' + monthChips + '</div></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function tFbToggleMon(rid, m) {
  if (!transportFbs[rid]) transportFbs[rid] = { dueMonths: [] };
  var idx = transportFbs[rid].dueMonths.indexOf(m);
  if (idx > -1) transportFbs[rid].dueMonths.splice(idx, 1);
  else          transportFbs[rid].dueMonths.push(m);
  renderTransportMonthChips(rid);
  updateTransportFBSummary(rid);
}

function tFbToggleAllMon(rid) {
  if (!transportFbs[rid]) transportFbs[rid] = { dueMonths: [] };
  transportFbs[rid].dueMonths = transportFbs[rid].dueMonths.length === 12
    ? []
    : getSessionMonths().slice();
  renderTransportMonthChips(rid);
  updateTransportFBSummary(rid);
}

function renderTransportMonthChips(rid) {
  var el = document.getElementById('tfbmon-' + rid);
  if (!el) return;
  var tfb    = transportFbs[rid] || { dueMonths: [] };
  var months = getSessionMonths();
  var allSel = tfb.dueMonths.length === 12;
  el.innerHTML =
    '<div class="m-chip all-m ' + (allSel ? 'selected' : '') + '" onclick="tFbToggleAllMon(\'' + rid + '\')">All</div>' +
    months.map(function(m) {
      return '<div class="m-chip ' + (tfb.dueMonths.indexOf(m) > -1 ? 'selected' : '') +
        '" onclick="tFbToggleMon(\'' + rid + '\',' + m + ')">' + SHORT_MONTHS[m] + '</div>';
    }).join('');
}

function updateTransportFBSummary(rid) {
  var el = document.getElementById('tfbsum-' + rid);
  if (!el) return;
  var rt  = transportRoutes.find(function(r) { return r._id === rid; });
  var tfb = transportFbs[rid] || { dueMonths: [] };
  el.textContent = (rt ? 'Rs.' + rt.amount + ' × ' : '') + tfb.dueMonths.length + 'mo';
  el.className = 'fb-summary' + (tfb.dueMonths.length > 0 ? ' ok' : '');
}

function rbTFbToggleMon(rid, m) {
  if (!transportFbs[rid]) transportFbs[rid] = { dueMonths: [] };
  var idx = transportFbs[rid].dueMonths.indexOf(m);
  if (idx > -1) transportFbs[rid].dueMonths.splice(idx, 1);
  else          transportFbs[rid].dueMonths.push(m);
  rbRefreshMonthChips(rid);
}

function rbTFbToggleAllMon(rid) {
  if (!transportFbs[rid]) transportFbs[rid] = { dueMonths: [] };
  transportFbs[rid].dueMonths = transportFbs[rid].dueMonths.length === 12
    ? []
    : getSessionMonths().slice();
  rbRefreshMonthChips(rid);
}

function rbRefreshMonthChips(rid) {
  var el = document.getElementById('rb-tfbmon-' + rid);
  if (!el) return;
  var tfb    = transportFbs[rid] || { dueMonths: [] };
  var months = getSessionMonths();
  var allSel = tfb.dueMonths.length === 12;
  el.innerHTML =
    '<div class="m-chip all-m ' + (allSel ? 'selected' : '') + '" onclick="rbTFbToggleAllMon(\'' + rid + '\')">All</div>' +
    months.map(function(m) {
      return '<div class="m-chip ' + (tfb.dueMonths.indexOf(m) > -1 ? 'selected' : '') +
        '" onclick="rbTFbToggleMon(\'' + rid + '\',' + m + ')">' + SHORT_MONTHS[m] + '</div>';
    }).join('');
  // Also sync Tab 3 builder if visible
  updateTransportFBSummary(rid);
}

function saveRouteMonths(rid) {
  var session = currentSession;
  if (!session) { toast('Session not loaded', 'error'); return; }

  var btn = document.querySelector('[onclick="saveRouteMonths(\'' + rid + '\')"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '...'; }

  // Fetch existing structure first so we don't overwrite regular fee entries
  apiGet(API_FEE_STRUCTURE + '?session=' + encodeURIComponent(session), true)
    .then(function(res) {
      var existing    = res.data || {};
      var sm          = existing.startMonth != null ? existing.startMonth : startMonth;

      // Normalise existing regular entries
      var entries = (existing.entries || []).map(function(e) {
        return {
          feeHeadId: (e.feeHeadId && e.feeHeadId._id) ? String(e.feeHeadId._id) : String(e.feeHeadId),
          amount:    e.amount,
          classIds:  (e.classIds || []).map(function(c) { return String(c._id || c); }),
          dueMonths: e.dueMonths
        };
      });

      // Build transport entries using current transportFbs state
      var transportEntries = transportRoutes.map(function(rt) {
        var tfb = transportFbs[rt._id] || {};
        return {
          routeId:   rt._id,
          amount:    rt.amount,
          dueMonths: (tfb.dueMonths && tfb.dueMonths.length) ? tfb.dueMonths : getSessionMonths()
        };
      });

      return apiPost(API_FEE_STRUCTURE, {
        session:          session,
        startMonth:       sm,
        entries:          entries,
        transportEntries: transportEntries
      }, true);
    })
    .then(function() {
      toast('Fee months saved');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#128190; Save Fee Months'; }
    })
    .catch(function(e) {
      toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#128190; Save Fee Months'; }
    });
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
    var tfb = transportFbs[rt._id] || {};
    var dueMonths = (tfb.dueMonths && tfb.dueMonths.length)
      ? tfb.dueMonths
      : getSessionMonths();
    return { routeId: rt._id, amount: rt.amount, dueMonths: dueMonths };
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
  var hasPartial = monthMap[mi].some(function(i) { return i.month.isPartial && !i.month.isRecovered; });
  if (hasPartial) return acc;
  return acc + monthMap[mi].reduce(function(s2, i) { return s2 + calcRemaining(i.month); }, 0);
}, 0);
    if (totalRegDue > 0) {
      html += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">' +
        '<button class="mqs-btn" onclick="selectAllRegMonths(\'' + sid + '\')">Select All Due Months</button>' +
        '</div>';
    }

    html += '<div class="month-rows-list" id="mrl-' + sid + '">';
    sortedMonths.forEach(function(mi, idx) {
  var nextMi = sortedMonths[idx + 1];
  html += buildMonthRow(
  sid,
  mi,
  monthMap[mi],
  nextMi != null ? MONTHS[nextMi] : null,
  idx,
  sortedMonths,
  monthMap
);
});
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">No regular fee entries for this student.</div>';
  }

  // ── TRANSPORT SECTION (redesigned as rows) ──
  if (stu.transport && stu.transport.months && stu.transport.months.length) {
  var ucT = stu.transport.months.filter(function(m) {
      return calcRemaining(m) > 0 && !m.isPartial && !m.isRecovered;
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
    stu.transport.months.map(function(m, idx) {
  var nextM = stu.transport.months[idx + 1];
  return buildTransportMonthRow(
    sid,
    m,
    stu.transport.routeName,
    session,
    stu.transport.routeId,
    nextM ? MONTHS[nextM.monthIndex] : null,
    idx,
    stu.transport.months
  );
}).join('') +
    '</div>';
  }

  return html;
}

function buildMonthRow(sid, monthIndex, items, nextMonthName, idx, sortedMonths, monthMap) {
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
  // Partial months: no Pay button — balance carries to next month automatically
  var canPay     = totalDue > 0 && !anyPartial;

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

  var carryTo = nextMonthName || 'next month';
  var badge = '';

if (allPaid) {
  badge = '<span class="mr-status mr-status-paid">✓ Paid — Rs.' + totalPaidAmt.toLocaleString() + '</span>';

}else if (isFullyRecovered) {
  badge = '<span class="mr-status mr-status-covered">→ Carried forward to ' + carryTo + '</span>';
} else if (anyPartial) {
  badge = '<span class="mr-status mr-status-partial">~ Rs.' + totalPaidAmt.toLocaleString() +
    ' paid · Rs.' + totalDue.toLocaleString() + ' carried to ' + carryTo + '</span>';

} else {
  badge = '<span class="mr-status mr-status-due">Rs.' + totalDue.toLocaleString() + ' due</span>';
}

  var carryParts = [];

items.forEach(function(i) {
  var m       = i.month;
  var adjBase = m.adjustedBase != null ? m.adjustedBase : (m.baseAmount != null ? m.baseAmount : m.amount);
  var effDue  = m.effectiveDue != null ? m.effectiveDue : adjBase;
  var carry   = Math.max(0, Math.round(effDue - adjBase));
  if (!m.isPaid && !m.isRecovered && carry > 0) {
    carryParts.push('+Rs.' + carry.toLocaleString() + ' carry');
  }
  if ((m.previousCredit || 0) > 0) {
    carryParts.push('\u2212Rs.' + m.previousCredit.toLocaleString() + ' credit');
  }
});

  if (carryParts.length && !isFullyRecovered) {
  badge += ' <span class="mr-carry">' + carryParts.join(' · ') + '</span>';
}

// ── Date + Bulk tag ──
  if (allPaid || anyPartial) {
    var paidAtItem = items.find(function(i) { return i.month.paidAt; });
    if (paidAtItem) {
      var d = new Date(paidAtItem.month.paidAt);
      badge += ' <span class="mr-date">' +
        d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) +
        ' ' + d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true}) +
      '</span>';
    }
    var bulkItem = items.find(function(i) { return i.month.bulkGroupId; });
    if (bulkItem) {
      var bgid = bulkItem.month.bulkGroupId;
      var stuRef = feeStatusData.find(function(s) { return s.studentId === sid; });
      if (stuRef) {
        var bMIs = [];
        (stuRef.entries || []).forEach(function(entry) {
          entry.months.forEach(function(m) {
            if (m.bulkGroupId === bgid && bMIs.indexOf(m.monthIndex) === -1) bMIs.push(m.monthIndex);
          });
        });
        if (bMIs.length > 1) {
          var bNames = bMIs.sort(function(a,b){ return sessionOrderOf(a)-sessionOrderOf(b); })
            .map(function(mi){ return SHORT_MONTHS[mi]; }).join(', ');
          badge += '<br><span class="mr-bulk-tag">&#128230; Bulk payment: ' + bNames + '</span>';
        }
      }
    }
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
function buildTransportMonthRow(sid, m, routeName, session, routeId, nextMonthName, idx, months) {
  var remaining  = calcRemaining(m);
  var base       = m.baseAmount != null ? m.baseAmount : m.amount;
  var canPay     = remaining > 0 && !m.isPartial;
  var hasPayment = !!m.paymentId;

  var k = null;
  if (canPay) {
    var stuRef = feeStatusData.find(function(s) { return s.studentId === sid; });
    k = regPay({
      studentId:    sid,
      feeHeadId:    null,
      routeId:      routeId,
      monthIndex:   m.monthIndex,
      amount:       remaining,
      baseAmount:   base,
      type:         'transport',
      session:      session,
      name:         (stuRef && stuRef.name) || '',
      fhName:       'Transport \u2014 ' + routeName,
      carryDue:     m.carryDue    || 0,
      carryCredit:  m.carryCredit || 0,
      waiverAmount: m.waiverAmount || 0,
      lateFee:      m.lateFee     || 0,
      paidAmount:   m.paidAmount  || 0,
      isPartial:    m.isPartial   || false,
      isRecovered:  m.isRecovered || false
    });
  }

  var stateClass = (m.isPaid && !m.isPartial) ? 'mr-paid'
    : m.isRecovered  ? 'mr-covered'
    : m.isPartial    ? 'mr-partial'
    : remaining <= 0 ? 'mr-covered'
    : 'mr-unpaid';

  var carryTo = nextMonthName || 'next month';
  var badge   = '';

  if (m.isPaid && !m.isPartial) {
    badge = '<span class="mr-status mr-status-paid">&#10003; Paid \u2014 Rs.' + (m.paidAmount || 0).toLocaleString() + '</span>';
    if (m.paidAt) badge += ' <span class="mr-date">' + new Date(m.paidAt).toLocaleDateString('en-IN') + '</span>';
  } else if (m.isRecovered) {
    badge = '<span class="mr-status mr-status-covered">\u2192 Carried forward to ' + escH(carryTo) + '</span>';
  } else if (remaining <= 0 && m.previousCredit > 0) {
    badge = '<span class="mr-status mr-status-covered">&#10003; Covered by advance</span>';
  } else if (m.isPartial) {
    badge = '<span class="mr-status mr-status-partial">~ Rs.' + (m.paidAmount || 0).toLocaleString() +
      ' paid &middot; Rs.' + remaining.toLocaleString() + ' carried to ' + escH(carryTo) + '</span>';
  } else {
    badge = '<span class="mr-status mr-status-due">Rs.' + remaining.toLocaleString() + ' due</span>';
  }

  if ((m.carryDue || 0) > 0 && m.displayStatus !== 'settled') {
    badge += ' <span class="mr-carry">+Rs.' + (m.previousDue || m.carryDue || 0).toLocaleString() + ' carry</span>';
  }
  if ((m.waiverAmount || 0) > 0) {
    badge += ' <span class="mr-carry" style="background:#fef9c3;color:#78350f;border-color:var(--amber)">\u2212Rs.' + m.waiverAmount.toLocaleString() + ' waiver</span>';
  }
  if ((m.lateFee || 0) > 0) {
    badge += ' <span class="mr-carry" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa">+Rs.' + m.lateFee.toLocaleString() + ' late</span>';
  }

  var cbHtml = (canPay && k)
    ? '<input type="checkbox" class="mp-checkbox" id="tcb-' + sid + '-' + m.monthIndex + '"' +
      ' data-key="' + k + '" style="margin-bottom:3px"' +
      ' onclick="event.stopPropagation()" onchange="toggleBulkItem(\'' + k + '\',this.checked)">'
    : '';

  var paidAtStr = m.paidAt ? escA(new Date(m.paidAt).toISOString()) : '';
  var paySource = m.paymentSource || 'cash';

  var actions = '';

  if (canPay && k) {
    actions += '<button class="mr-btn mr-btn-pay" onclick="event.stopPropagation();openSinglePay(\'' + k + '\')">Pay</button>';
  }

  // ── FIX: show Edit/Del/PDF for ANY paid month (including recovered) ──
  if (hasPayment) {
    actions +=
      '<button class="mr-btn mr-btn-edit" onclick="event.stopPropagation();openTransportEditModal(\'' +
        m.paymentId + '\',' + (m.paidAmount || 0) + ',\'' + escA(SHORT_MONTHS[m.monthIndex]) +
        '\',\'' + escA(m.remark || '') + '\',' + base + ',\'' + sid + '\',' +
        m.monthIndex + ',\'' + routeId + '\',\'' + session + '\')">Edit</button>' +
      '<button class="mr-btn mr-btn-del" onclick="event.stopPropagation();openDelPay(\'' +
        m.paymentId + '\',\'' + SHORT_MONTHS[m.monthIndex] + ' Transport\')">Del</button>' +
      '<button class="mr-btn" style="background:#eff6ff;color:#3b82f6;border-color:#bfdbfe"' +
  ' onclick="event.stopPropagation();printTransportMonthReceipt(\'' +
  sid + '\',' + m.monthIndex + ')">&#128424; PDF</button>';
  }

  return '<div class="month-row mr-transport ' + stateClass + '" id="trow-' + sid + '-' + m.monthIndex + '">' +
    '<div class="mr-month-col">' +
      cbHtml +
      '<div style="font-size:14px;margin-bottom:2px">&#128652;</div>' +
      '<div class="mr-month-name">' + SHORT_MONTHS[m.monthIndex] + '</div>' +
      '<div class="mr-base-total">Rs.' + Number(base).toLocaleString() + '</div>' +
    '</div>' +
    '<div class="mr-detail-col">' +
      '<div class="mr-fh-list">' +
        '<span class="mr-fh-chip"><span style="font-size:12px;flex-shrink:0">&#128652;</span>' + escH(routeName) + '</span>' +
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

function openMonthPayModal(studentId, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === studentId; });
  if (!stu) return;

  var items = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
    if (m && !m.paymentId && calcRemaining(m) > 0) {
      items.push({ entry: entry, month: m });
    }
  });

  if (!items.length) { toast('Nothing to pay for this month', 'info'); return; }

  // calcRemaining reads effectiveDue which already includes carry from backend
  var totalDue = items.reduce(function(sum, i) { return sum + calcRemaining(i.month); }, 0);

  var html = '';
  items.forEach(function(i) {
    var m       = i.month;
    var base    = m.baseAmount   != null ? m.baseAmount   : (m.amount || 0);
    var adjBase = m.adjustedBase != null ? m.adjustedBase : base;
    var effDue  = m.effectiveDue != null ? m.effectiveDue : adjBase;
    var carry   = Math.max(0, Math.round(effDue - adjBase));
    var credit  = m.previousCredit || 0;
    var waiver  = m.waiverAmount   || 0;

    html += '<div class="mpm-fee-row">' +
      '<span class="color-dot ' + i.entry.color + '" style="width:9px;height:9px;border-radius:50%;flex-shrink:0;display:inline-block"></span>' +
      '<span style="flex:1;font-size:13px;font-weight:700">' + escH(i.entry.feeHeadName) + '</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:800;font-size:13px">Rs.' + Number(base).toLocaleString() + '</span>' +
      '</div>';

    if (waiver > 0) {
      html += '<div style="padding:2px 13px 2px 26px;font-size:11px;color:#4f46e5;font-weight:700">' +
        '\u2212 Rs.' + waiver.toLocaleString() + ' waiver applied</div>';
    }
    if (carry > 0) {
      html += '<div style="padding:2px 13px 2px 26px;font-size:11px;color:#d97706;font-weight:700">' +
        '+ Rs.' + carry.toLocaleString() + ' carried from previous month</div>';
    }
    if (credit > 0) {
      html += '<div style="padding:2px 13px 2px 26px;font-size:11px;color:#059669;font-weight:700">' +
        '\u2212 Rs.' + credit.toLocaleString() + ' advance credit applied</div>';
    }
    if (carry > 0 || credit > 0 || waiver > 0) {
      html += '<div style="padding:2px 13px 6px 26px;font-size:11px;font-weight:900;color:var(--brand);border-bottom:1px dashed #e2e8f0">' +
        '= Rs.' + calcRemaining(m).toLocaleString() + ' effective due</div>';
    }
  });

  document.getElementById('mpm-fee-list').innerHTML = html;
  document.getElementById('mpm-total-due').textContent  = 'Rs.' + totalDue.toLocaleString();
  document.getElementById('mpm-title').textContent      = stu.name + ' \u2014 ' + MONTHS[monthIndex];
  document.getElementById('mpm-sub').textContent        = 'Session: ' + currentSession;
  document.getElementById('mpm-amount').value           = totalDue;
  document.getElementById('mpm-waiver').value           = 0;
  document.getElementById('mpm-latefee').value          = 0;
  document.getElementById('mpm-remark').value           = '';

  // Carry info banner
  var totalCarry = items.reduce(function(sum, i) {
    var m       = i.month;
    var adjBase = m.adjustedBase != null ? m.adjustedBase : (m.baseAmount != null ? m.baseAmount : m.amount);
    var effDue  = m.effectiveDue != null ? m.effectiveDue : adjBase;
    return sum + Math.max(0, effDue - adjBase);
  }, 0);
  var carryBox = document.getElementById('mpm-carry-info');
  if (totalCarry > 0) {
    carryBox.innerHTML = '\u26a0 Rs.' + totalCarry.toLocaleString() +
      ' carried from previous unpaid month(s) — already included in the total above';
    carryBox.classList.add('show');
  } else {
    carryBox.classList.remove('show');
  }

  pendingMonthPay = {
    sid:        studentId,
    monthIndex: monthIndex,
    items:      items,
    totalDue:   totalDue,
    session:    currentSession
  };

  updateMonthPayPreview();
  openModal('month-pay-modal');   // ← correct modal
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

  // Compute per-item effective quota: (due - waiver on first) + lateFee on last
var adjItemDues = d.items.map(function(item, idx) {
    var due = calcRemaining(item.month);
    var wv  = (idx === 0) ? waiver   : 0;
    var lf  = (idx === d.items.length - 1) ? lateFeeV : 0;
    return Math.max(0, due - wv) + lf;
});

var remaining = paidAmt;
var payments  = d.items.map(function(item, idx) {
    var alloc = Math.min(remaining, adjItemDues[idx]);
    remaining -= alloc;
    return {
      type: 'regular', feeHeadId: item.entry.feeHeadId, routeId: null,
      monthIndex: d.monthIndex,
      amount: item.month.baseAmount != null ? item.month.baseAmount : item.month.amount,
      paidAmount:   alloc,
      waiverAmount: idx === 0 ? waiver   : 0,
      lateFee:      idx === d.items.length - 1 ? lateFeeV : 0
    };
});

if (remaining > 0 && payments.length > 0) {
    payments[payments.length - 1].paidAmount += remaining;
}

  var btn = document.getElementById('mpm-confirm-btn');
  setLoading(btn, true);

  apiPost(API_FEE_PAY_BULK, {
    studentId: d.sid, session: d.session,
    payments: payments, remark: remark || null
  }, true)
    .then(function() {
      closeModal('month-pay-modal');

      var stu      = feeStatusData.find(function(s) { return s.studentId === d.sid; });
      var adjDue   = Math.max(0, d.totalDue - waiver);

      // ── Build rich items from pendingMonthPay data ──
      var totalBase = 0, totalCarry = 0, totalCredit = 0, totalWaiver = 0, totalLateFee = 0;

      var richItems = d.items.map(function(item, idx) {
        var m       = item.month;
        var base    = m.baseAmount   != null ? m.baseAmount   : (m.amount || 0);
        var adjBase = m.adjustedBase != null ? m.adjustedBase : base;
        var effDue  = m.effectiveDue != null ? m.effectiveDue : adjBase;
        var carry   = Math.max(0, Math.round(effDue - adjBase));
        var credit  = m.previousCredit || 0;
        var wv      = (idx === 0) ? waiver : 0;      // waiver applied to first head
        var lf      = (idx === d.items.length - 1) ? lateFeeV : 0; // late fee to last
        var paidRow = payments[idx] ? payments[idx].paidAmount : 0;

        totalBase    += base;
        totalCarry   += carry;
        totalCredit  += credit;
        totalWaiver  += wv;
        totalLateFee += lf;

        var rowEffDue = Math.max(0, adjBase - wv) - credit + carry + lf;

        return {
          feeHead:      item.entry.feeHeadName,
          month:        MONTHS[d.monthIndex],
          base:         base,           // triggers isRich
          waiver:       wv,
          carry:        carry,
          credit:       credit,
          lateFee:      lf,
          effectiveDue: rowEffDue,
          paid:         paidRow,
          isPaid:       paidRow >= rowEffDue,
          isPartial:    paidRow > 0 && paidRow < rowEffDue
        };
      });

      var totalFeeDue = totalBase - totalWaiver + totalCarry - totalCredit + totalLateFee;

      showReceipt({
        studentName:  (stu && stu.name) || '',
        className:    (stu && stu.class && stu.class.className) || '',
        rollNo:       (stu && stu.rollNo)     || '',
        fatherName:   (stu && stu.fatherName) || '',
        phone:        (stu && stu.phone)      || '',
        session:      d.session,
        total:        paidAmt + lateFeeV,
        totalBase:    totalBase,
        totalCarry:   totalCarry,
        totalCredit:  totalCredit,
        totalWaiver:  totalWaiver,
        totalLateFee: totalLateFee,
        totalFeeDue:  totalFeeDue,
        balance:      (paidAmt - lateFeeV) - adjDue,
        paymentMode:  'Cash \u2014 Reception',
        remark:       remark,
        items:        richItems,
        paidAt:       new Date(),
        receiptType:  'Monthly Fee Receipt \u2014 ' + MONTHS[d.monthIndex]
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

  // Detect bulk group
  var bulkGroupId = null;
  var bulkMonthIndices = [];
  if (stu) {
    (stu.entries || []).forEach(function(entry) {
      var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
      if (m && m.bulkGroupId) bulkGroupId = m.bulkGroupId;
    });
    if (bulkGroupId) {
      (stu.entries || []).forEach(function(entry) {
        entry.months.forEach(function(m) {
          if (m.bulkGroupId === bulkGroupId && bulkMonthIndices.indexOf(m.monthIndex) === -1)
            bulkMonthIndices.push(m.monthIndex);
        });
      });
    }
  }

  var subText;
  if (bulkGroupId && bulkMonthIndices.length > 1) {
    var bNames = bulkMonthIndices
      .sort(function(a,b){ return sessionOrderOf(a)-sessionOrderOf(b); })
      .map(function(mi){ return MONTHS[mi]; }).join(', ');
    subText = '\u26a0 This was a bulk payment covering ' + bNames +
      '. Deleting will remove ALL ' + bulkMonthIndices.length +
      ' months\u2019 payments for ' + (stu ? stu.name : 'this student') + '.';
  } else {
    subText = 'Delete ALL payments for ' + MONTHS[monthIndex] +
      (stu ? ' \u2014 ' + stu.name : '') + '?';
  }

  document.getElementById('mdm-sub').textContent = subText;
  pendingMonthDelete = { sid: sid, monthIndex: monthIndex };
  openModal('month-delete-modal');
}

function confirmMonthDelete() {
  if (!pendingMonthDelete) return;
  var d   = pendingMonthDelete;
  var stu = feeStatusData.find(function(s) { return s.studentId === d.sid; });
  if (!stu) return;

  var paymentIds  = [];
  var bulkGroupId = null;

  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === d.monthIndex; });
    if (m && m.paymentId) {
      paymentIds.push(m.paymentId);
      if (m.bulkGroupId) bulkGroupId = m.bulkGroupId;
    }
  });

  if (!paymentIds.length) { toast('No payments to delete for this month', 'error'); return; }

  var btn = document.getElementById('mdm-confirm-btn');
  setLoading(btn, true);

  if (bulkGroupId) {
    // Fetch full group then delete all payments in it
    apiGet(API_FEE_PAY + '/group/' + encodeURIComponent(bulkGroupId), true)
      .then(function(res) {
        var groupPayments = res.data || [];
        var allIds = groupPayments.map(function(p) { return p._id; });
        paymentIds.forEach(function(pid) { if (allIds.indexOf(pid) === -1) allIds.push(pid); });
        return Promise.all(allIds.map(function(pid) {
          return apiDelete(API_FEE_PAY + '/' + pid, true);
        }));
      })
      .then(function() {
        // Collect month names that were part of this bulk group
        var bMIs = [];
        (stu.entries || []).forEach(function(entry) {
          entry.months.forEach(function(m) {
            if (m.bulkGroupId === bulkGroupId && bMIs.indexOf(m.monthIndex) === -1)
              bMIs.push(m.monthIndex);
          });
        });
        var bNames = bMIs
          .sort(function(a,b){ return sessionOrderOf(a)-sessionOrderOf(b); })
          .map(function(mi){ return SHORT_MONTHS[mi]; }).join(', ');
        toast('Bulk payment deleted \u2014 ' + bNames + ' reverted to unpaid');
        closeModal('month-delete-modal');
        pendingMonthDelete = null;
        return loadFeeStatus();
      })
      .catch(function(e) { toast(e.message, 'error'); })
      .finally(function() { setLoading(btn, false); btn.innerHTML = 'Yes, Delete All'; });

  } else {
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

  document.getElementById('pay-modal-title').textContent  = d.name;
  document.getElementById('pay-modal-sub').textContent    = d.fhName + ' \u2014 ' + MONTHS[d.monthIndex];
  document.getElementById('pay-modal-amount').textContent = 'Rs.' + Number(remaining).toLocaleString();
  document.getElementById('pay-amount-input').value = remaining;
  document.getElementById('pay-waiver').value  = 0;
  document.getElementById('pay-latefee').value = 0;
  document.getElementById('pay-remark').value  = '';

  var amtLabel = document.querySelector('#pay-modal .pay-amt-box .pal');
  if (amtLabel) amtLabel.textContent = d.isPartial ? 'Remaining Due This Month' : 'Effective Due Amount';

  // ── Derive all adjustment values ─────────────────────────────────
  var base    = d.baseAmount  || remaining;
  var waiver  = d.waiverAmount || 0;
  var credit  = d.carryCredit  || 0;  // advance credit from previous overpayment
  var adjBase = Math.max(0, base - waiver);

  // KEY FIX: compute carry mathematically — don't trust d.carryDue
  // effectiveDue = adjustedBase - credit + carry  →  carry = effectiveDue + credit - adjustedBase
  var carry = Math.max(0, remaining + credit - adjBase);

  // ── Build breakdown HTML ─────────────────────────────────────────
  var bodyHtml = '<div style="border:1.5px solid var(--border);border-radius:10px;' +
    'overflow:hidden;margin-bottom:14px;background:var(--surface2)">';

  // Row 1 — base fee
  bodyHtml += '<div style="display:flex;justify-content:space-between;align-items:center;' +
    'padding:10px 13px;border-bottom:1px solid #f1f5f9">' +
    '<span style="font-size:13px;font-weight:800;color:var(--text)">' + escH(d.fhName) + '</span>' +
    '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:800;font-size:13px;color:var(--text)">' +
    'Rs.' + Number(base).toLocaleString() + '</span></div>';

  // Row — partial already paid this month
  if (d.isPartial && !d.isRecovered && (d.paidAmount || 0) > 0) {
    bodyHtml += '<div style="display:flex;justify-content:space-between;padding:5px 13px 5px 26px;' +
      'font-size:11px;color:#d97706;font-weight:700;background:#fffbeb">' +
      '<span>\u2714 Already paid this month</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace">\u2212 Rs.' +
      Number(d.paidAmount).toLocaleString() + '</span></div>';
  }

  // Row — waiver / discount
  if (waiver > 0) {
    bodyHtml += '<div style="display:flex;justify-content:space-between;padding:5px 13px 5px 26px;' +
      'font-size:11px;color:#4338ca;font-weight:700;background:#f5f3ff">' +
      '<span>\u2212 Waiver / discount applied</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace">\u2212 Rs.' +
      Number(waiver).toLocaleString() + '</span></div>';
  }

  // Row — previous month carry due  ← THE KEY MISSING ROW
  if (carry > 0) {
    bodyHtml += '<div style="display:flex;justify-content:space-between;padding:6px 13px 6px 26px;' +
      'font-size:11px;color:#c2410c;font-weight:700;background:#fff7ed;' +
      'border-top:1px dashed #fed7aa">' +
      '<span>&#128336; Previous month unpaid — carried to this month</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace">+ Rs.' +
      Number(carry).toLocaleString() + '</span></div>';
  }

  // Row — advance credit from previous overpayment
  if (credit > 0) {
    bodyHtml += '<div style="display:flex;justify-content:space-between;padding:5px 13px 5px 26px;' +
      'font-size:11px;color:#059669;font-weight:700;background:#f0fdf4">' +
      '<span>\u2212 Advance credit applied from previous month</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace">\u2212 Rs.' +
      Number(credit).toLocaleString() + '</span></div>';
  }

  // Final row — effective due total
  var hasAdj = carry > 0 || credit > 0 || waiver > 0 || d.isPartial;
  var effLabel = hasAdj ? '= Effective Due This Month' : 'Amount Due This Month';
  bodyHtml += '<div style="display:flex;justify-content:space-between;' +
    'padding:9px 13px;font-weight:900;color:var(--brand);font-size:13px;' +
    'font-family:\'JetBrains Mono\',monospace;' +
    'border-top:2px solid var(--brand);background:#eef2ff">' +
    '<span style="font-family:\'Plus Jakarta Sans\',sans-serif">' + effLabel + '</span>' +
    '<span>Rs.' + Number(remaining).toLocaleString() + '</span></div>';

  bodyHtml += '</div>';
  document.getElementById('pay-modal-body').innerHTML = bodyHtml;

  // Clear legacy carry boxes
  document.getElementById('pay-carry-info').classList.remove('show');
  document.getElementById('pay-prev-warn').classList.remove('show');

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
    studentId:    d.studentId,
    feeHeadId:    d.feeHeadId,
    monthIndex:   d.monthIndex,
    amount:       d.baseAmount,
    paidAmount:   paidAmt,
    waiverAmount: waiver,
    lateFee:      lateFeeV,
    type:         d.type,
    routeId:      d.routeId,
    session:      d.session,
    remark:       remark || null
  }, true)
    .then(function() {
      closeModal('pay-modal');

      var stu     = feeStatusData.find(function(s) { return s.studentId === d.studentId; });

      // ── Derive carry mathematically (same logic as openSinglePay) ──
      // effectiveDue = adjustedBase - credit + carry
      // → carry = effectiveDue + credit - adjustedBase
      var base      = d.baseAmount  || d.amount;
      var credit    = d.carryCredit || 0;
      var adjBase   = Math.max(0, base - waiver);
      var carry     = Math.max(0, d.amount + credit - adjBase);  // d.amount = effectiveDue

      var effDue    = adjBase - credit + carry + lateFeeV;
      var adjDue    = Math.max(0, d.amount - waiver);
      var paidToBase = Math.max(0, paidAmt - lateFeeV);

      // ── Rich item — all fields populated so PDF and modal match ──
      var richItem = {
        feeHead:      d.fhName,
        month:        MONTHS[d.monthIndex],
        base:         base,
        waiver:       waiver,
        carry:        carry,        // ← mathematically derived, never 0 incorrectly
        credit:       credit,
        lateFee:      lateFeeV,
        effectiveDue: effDue,
        paid:         paidAmt,
        isPaid:       paidToBase >= adjBase,
        isPartial:    paidToBase < adjBase && paidToBase > 0
      };

      showReceipt({
        studentName:  (stu && stu.name)  || d.name,
        className:    (stu && stu.class && stu.class.className) || '',
        rollNo:       (stu && stu.rollNo)     || '',
        fatherName:   (stu && stu.fatherName) || '',
        phone:        (stu && stu.phone)      || '',
        session:      d.session,
        total:        paidAmt,
        totalBase:    base,
        totalCarry:   carry,        // ← derived carry propagates to Payment Summary
        totalCredit:  credit,
        totalWaiver:  waiver,
        totalLateFee: lateFeeV,
        totalFeeDue:  effDue,
        balance:      paidToBase - adjBase,
        paymentMode:  'Cash \u2014 Reception',
        remark:       remark,
        items:        [richItem],
        paidAt:       new Date(),
        receiptType:  d.type === 'transport'
          ? 'Transport Fee Receipt \u2014 ' + MONTHS[d.monthIndex]
          : 'Fee Receipt \u2014 ' + MONTHS[d.monthIndex]
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
  document.getElementById('bulk-waiver').value  = 0;
document.getElementById('bulk-latefee').value = 0;
document.getElementById('bulk-remark').value  = '';
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
  document.getElementById('bulk-waiver').value  = 0;
document.getElementById('bulk-latefee').value = 0;
document.getElementById('bulk-remark').value  = '';
updateBulkAmtPreview(total);
  document.getElementById('bulk-confirm-btn').onclick = confirmRegBulkPayment;
  openModal('bulk-pay-modal');
}

function updateBulkAmtPreview(val) {
  var waiver   = Math.max(0, parseInt(document.getElementById('bulk-waiver').value)  || 0);
  var lateFeeV = Math.max(0, parseInt(document.getElementById('bulk-latefee').value) || 0);
  var total;
  if (currentBulkMode === 'regular') {
    var rk = Object.keys(regBulkMap);
    total = rk.reduce(function(s, k) { return s + regBulkMap[k].totalDue; }, 0);
  } else {
    var tk = Object.keys(bulkMap);
    total = tk.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);
  }
  var adjBase = Math.max(0, total - waiver);
  var v   = parseInt(val) || 0;
  var paidTowardBase = Math.max(0, v - lateFeeV);
  var box = document.getElementById('bulk-preview');
  box.className = 'pay-preview';
  if (!v) { box.classList.remove('show'); return; }
  if (paidTowardBase < adjBase) {
    box.innerHTML = 'Rs.' + (adjBase - paidTowardBase).toLocaleString() + ' short \u2014 distributed as partials, oldest month first';
    box.classList.add('show', 'partial');
  } else if (paidTowardBase > adjBase) {
    box.innerHTML = 'Rs.' + (paidTowardBase - adjBase).toLocaleString() + ' extra \u2014 credited to next applicable month';
    box.classList.add('show', 'advance');
  } else {
    var cnt = currentBulkMode === 'regular' ? Object.keys(regBulkMap).length : Object.keys(bulkMap).length;
    box.innerHTML = 'Exact \u2014 all ' + cnt + ' item' + (cnt !== 1 ? 's' : '') + ' will be fully paid'
      + (waiver   ? ' (Rs.' + waiver.toLocaleString()   + ' waiver applied)' : '')
      + (lateFeeV ? ' + Rs.' + lateFeeV.toLocaleString() + ' late fee' : '');
    box.classList.add('show', 'full');
  }
}

function confirmBulkPayment() {
  var keys = Object.keys(bulkMap); if (!keys.length) return;
  var remark    = document.getElementById('bulk-remark').value.trim();
  var waiver    = Math.max(0, parseInt(document.getElementById('bulk-waiver').value)  || 0);
  var lateFeeV  = Math.max(0, parseInt(document.getElementById('bulk-latefee').value) || 0);
  var customAmt = parseInt(document.getElementById('bulk-custom-amount').value);
  var remaining = customAmt || keys.reduce(function(s, k) { return s + (bulkMap[k].amount || 0); }, 0);

  var payments = keys.map(function(k, idx) {
    var d     = bulkMap[k];
    var alloc = Math.min(remaining, d.amount);
    remaining -= alloc;
    return {
      type: d.type, feeHeadId: d.feeHeadId, routeId: d.routeId,
      monthIndex: d.monthIndex, amount: d.baseAmount,
      paidAmount: alloc,
      waiverAmount: idx === 0 ? waiver : 0,
      lateFee: idx === keys.length - 1 ? lateFeeV : 0
    };
  });

  // Add late fee to last item's paidAmount
  if (lateFeeV > 0 && payments.length > 0) {
    payments[payments.length - 1].paidAmount += lateFeeV;
  }

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
      var totalDueForBulk = keys.reduce(function(s, k2) { return s + (bulkMap[k2].amount || 0); }, 0);
      closeModal('bulk-pay-modal');
      showReceipt({
        studentName:  (stu && stu.name) || '',
        className:    (stu && stu.class && stu.class.className) || '',
        fatherName:   (stu && stu.fatherName) || '',
        session:      session,
        total:        collected,
        totalFeeDue:  totalDueForBulk,
        totalWaiver:  waiver,
        totalLateFee: lateFeeV,
        balance:      collected - lateFeeV - Math.max(0, totalDueForBulk - waiver),
        paymentMode:  'Cash \u2014 Reception',
        remark:       remark,
        items:        items
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
  var waiver    = Math.max(0, parseInt(document.getElementById('bulk-waiver').value)  || 0);
  var lateFeeV  = Math.max(0, parseInt(document.getElementById('bulk-latefee').value) || 0);
  var customAmt = parseInt(document.getElementById('bulk-custom-amount').value);
  var sid       = regBulkStudentId;
  var session   = currentSession;

  var sorted = keys.slice().sort(function(a, b) {
    return sessionOrderOf(regBulkMap[a].monthIndex) - sessionOrderOf(regBulkMap[b].monthIndex);
  });

  // Build flat ordered list of all items
  var flatItems = [];
  sorted.forEach(function(k) {
    var d = regBulkMap[k];
    d.items.forEach(function(item) {
      flatItems.push({ item: item, monthIndex: d.monthIndex });
    });
  });

  var totalItems = flatItems.length;

  // Compute per-item adjusted quota (waiver on first, lateFee on last)
  var adjItemDues = flatItems.map(function(fi, idx) {
    var due = calcRemaining(fi.item.month);
    var wv  = (idx === 0) ? waiver   : 0;
    var lf  = (idx === totalItems - 1) ? lateFeeV : 0;
    return Math.max(0, due - wv) + lf;
  });

  var remaining = customAmt || adjItemDues.reduce(function(s, v) { return s + v; }, 0);
  var payments  = [];

  flatItems.forEach(function(fi, idx) {
    var alloc = Math.min(remaining, adjItemDues[idx]);
    remaining -= alloc;
    payments.push({
      type: 'regular', feeHeadId: fi.item.entry.feeHeadId, routeId: null,
      monthIndex: fi.monthIndex,
      amount:       fi.item.month.baseAmount != null ? fi.item.month.baseAmount : fi.item.month.amount,
      paidAmount:   alloc,
      waiverAmount: idx === 0 ? waiver   : 0,
      lateFee:      idx === totalItems - 1 ? lateFeeV : 0
    });
  });

  if (remaining > 0 && payments.length > 0) {
    payments[payments.length - 1].paidAmount += remaining;
  }
  // NOTE: late fee is already baked into adjItemDues — do NOT add again

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
      var totalDueForRegBulk = sorted.reduce(function(s, k2) { return s + regBulkMap[k2].totalDue; }, 0);
      closeModal('bulk-pay-modal');
      showReceipt({
        studentName:  (stu && stu.name) || '',
        className:    (stu && stu.class && stu.class.className) || '',
        fatherName:   (stu && stu.fatherName) || '',
        session:      session,
        total:        collected,
        totalFeeDue:  totalDueForRegBulk,
        totalWaiver:  waiver,
        totalLateFee: lateFeeV,
        balance:      collected - lateFeeV - Math.max(0, totalDueForRegBulk - waiver),
        paymentMode:  'Cash \u2014 Reception',
        remark:       remark,
        items:        items
      });
      clearRegBulkSelection();
      return loadFeeStatus();
    })
    .catch(function(e) { toast(e.message, 'error'); })
    .finally(function() { setLoading(btn, false); btn.innerHTML = 'Confirm All'; });
}

function showReceipt(data) {
  lastReceiptData = data;

  // Normalise items: rich format uses .feeHead + .paid; simple uses .label + .amount
  var displayItems = (data.items || []).map(function(i) {
    var lbl = i.label  != null ? i.label  : (i.feeHead || '-');
    var amt = i.amount != null ? i.amount : (i.paid    != null ? i.paid : 0);
    return { label: lbl, amount: amt };
  });

  document.getElementById('rc-amount').textContent  = 'Rs.' + Number(data.total || 0).toLocaleString();
  document.getElementById('rc-date').textContent    = new Date().toLocaleString('en-IN');
  document.getElementById('rc-student').textContent = data.studentName || '-';
  document.getElementById('rc-class').textContent   = data.className  || '';
  document.getElementById('rc-session').textContent = data.session    || '';
  document.getElementById('rc-total').textContent   = 'Rs.' + Number(data.total || 0).toLocaleString();

  // Father name row
  var fatherRow = document.getElementById('rc-father-row');
  if (fatherRow) {
    if (data.fatherName) {
      document.getElementById('rc-father').textContent = data.fatherName;
      fatherRow.style.display = '';
    } else {
      fatherRow.style.display = 'none';
    }
  }

  // Items list (using normalised display items — never NaN)
  document.getElementById('rc-items').innerHTML = displayItems.map(function(i) {
    return '<div class="receipt-row">' +
      '<span style="color:var(--text2)">' + escH(i.label) + '</span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700">Rs.' +
      Number(i.amount || 0).toLocaleString() + '</span></div>';
  }).join('');

  // Balance row
  var balanceRow = document.getElementById('rc-balance-row');
  if (balanceRow) {
    if (data.balance != null) {
      var balLabel = document.getElementById('rc-balance-label');
      var balVal   = document.getElementById('rc-balance');
      if (data.balance > 0) {
        balLabel.textContent = 'Advance (next month)';
        balVal.textContent   = 'Rs.' + Math.round(data.balance).toLocaleString();
        balVal.style.color   = 'var(--green)';
      } else if (data.balance < 0) {
        balLabel.textContent = 'Carried Forward';
        balVal.textContent   = 'Rs.' + Math.round(Math.abs(data.balance)).toLocaleString();
        balVal.style.color   = 'var(--red)';
      } else {
        balLabel.textContent = 'Balance';
        balVal.textContent   = 'Fully Settled';
        balVal.style.color   = 'var(--text2)';
      }
      balanceRow.style.display = '';
    } else {
      balanceRow.style.display = 'none';
    }
  }

  // Payment mode
  var modeRow = document.getElementById('rc-mode-row');
  if (modeRow) {
    document.getElementById('rc-mode').textContent = data.paymentMode || 'Cash \u2014 Reception';
    modeRow.style.display = '';
  }

  // Remark
  var remRow = document.getElementById('rc-remark-row');
  if (data.remark) {
    document.getElementById('rc-remark').textContent = data.remark;
    remRow.style.display = '';
  } else {
    remRow.style.display = 'none';
  }

  openModal('receipt-modal');
}

function printReceipt() {
  if (!lastReceiptData) return;
  var d   = lastReceiptData;
  var stu = feeStatusData.find(function(s) { return s.studentId === (d.studentId || ''); });
  printDetailedReceipt({
    studentName:  d.studentName,
    className:    d.className,
    rollNo:       d.rollNo  || (stu && stu.rollNo)  || '',
    fatherName:   d.fatherName || (stu && stu.fatherName) || '',
    phone:        d.phone   || (stu && stu.phone)   || '',
    session:      d.session,
    total:        d.total,
    totalBase:    d.totalBase,
    totalCarry:   d.totalCarry,
    totalCredit:  d.totalCredit,
    totalWaiver:  d.totalWaiver,
    totalLateFee: d.totalLateFee,
    totalFeeDue:  d.totalFeeDue,
    balance:      d.balance,
    paymentMode:  d.paymentMode || 'Cash \u2014 Reception',
    remark:       d.remark,
    items:        d.items,
    paidAt:       d.paidAt || new Date(),
    receiptType:  d.receiptType || 'Fee Receipt'
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

  // Rich format = items from printMonthRowReceipt (have .base property)
  var isRich = data.items && data.items.length > 0 && data.items[0].base !== undefined;
  var balance = data.balance != null ? data.balance : null;

  // ── Table head ──────────────────────────────────────────────────
  var theadHtml = isRich
    ? '<tr><th class="csn">S.No</th><th class="cds">Fee Head</th><th class="cmo">Month</th>' +
      '<th class="cba">Base Fee</th><th class="cad">Adjustments</th>' +
      '<th class="cam">Due</th><th class="cam">Collected</th></tr>'
    : '<tr><th class="csn">S.No</th><th class="cds">Fee Head / Description</th>' +
      '<th class="cmo">Month</th><th class="cam">Amount</th></tr>';

  // ── Item rows ────────────────────────────────────────────────────
  var itemRowsHtml = '';

  if (isRich) {
    itemRowsHtml = data.items.map(function(item, idx) {
      var adj = [];
      if ((item.waiver  || 0) > 0) adj.push('<span class="tag-w">&minus;&#8377;' + item.waiver.toLocaleString('en-IN')  + ' waiver</span>');
      if ((item.carry   || 0) > 0) adj.push('<span class="tag-c">+&#8377;'        + item.carry.toLocaleString('en-IN')   + ' prev.carry</span>');
      if ((item.credit  || 0) > 0) adj.push('<span class="tag-g">&minus;&#8377;'  + item.credit.toLocaleString('en-IN')  + ' adv.credit</span>');
      if ((item.lateFee || 0) > 0) adj.push('<span class="tag-r">+&#8377;'        + item.lateFee.toLocaleString('en-IN') + ' late fee</span>');
      var adjHtml = adj.length ? adj.join('') : '<span style="color:#cbd5e1">&mdash;</span>';

      var paidCol = item.isPaid ? '#059669' : (item.isPartial ? '#d97706' : '#1e293b');
      var paidPfx = item.isPaid ? '&#10003;&nbsp;' : (item.isPartial ? '&#8764;&nbsp;' : '');

      return '<tr>' +
        '<td class="csn">' + (idx + 1) + '</td>' +
        '<td class="cds"><div class="itl">' + sh(item.feeHead || '-') + '</div></td>' +
        '<td class="cmo">' + sh(item.month || '-') + '</td>' +
        '<td class="cba">&#8377;' + Number(item.base || 0).toLocaleString('en-IN') + '</td>' +
        '<td class="cad">' + adjHtml + '</td>' +
        '<td class="cam">&#8377;' + Number(item.effectiveDue || 0).toLocaleString('en-IN') + '</td>' +
        '<td class="cam" style="color:' + paidCol + '">' + paidPfx + '&#8377;' + Number(item.paid || 0).toLocaleString('en-IN') + '</td>' +
      '</tr>';
    }).join('');
  } else {
    itemRowsHtml = (data.items || []).map(function(item, idx) {
      return '<tr>' +
        '<td class="csn">' + (idx + 1) + '</td>' +
        '<td class="cds"><div class="itl">' + sh(item.feeHead || item.label || '-') + '</div>' +
          (item.description ? '<div class="its">' + sh(item.description) + '</div>' : '') + '</td>' +
        '<td class="cmo">' + sh(item.month || '-') + '</td>' +
        '<td class="cam">&#8377;' + Number(item.amount || 0).toLocaleString('en-IN') + '</td>' +
      '</tr>';
    }).join('');
  }

  // ── Table foot ───────────────────────────────────────────────────
  var tfootHtml = '';
  if (isRich) {
    tfootHtml = '<tfoot>' +
      '<tr class="tr-tot">' +
        '<td colspan="5">Total</td>' +
        '<td class="ta" style="color:#4f46e5">&#8377;' + Number(data.totalFeeDue || 0).toLocaleString('en-IN') + '</td>' +
        '<td class="ta" style="color:#059669">&#8377;' + Number(data.total || 0).toLocaleString('en-IN') + '</td>' +
      '</tr>' +
    '</tfoot>';
  } else {
    var simBalHtml = '';
    if (balance != null && balance !== 0) {
      var sbc = balance > 0 ? '#059669' : '#dc2626';
      var sbb = balance > 0 ? '#f0fdf4' : '#fef2f2';
      var sbl = balance > 0 ? '&#10003; Advance — credited to next month' : '&#9888; Balance carried forward';
      simBalHtml = '<tr style="background:' + sbb + '">' +
        '<td colspan="3" style="padding:10px 13px;font-size:11px;font-weight:700;color:' + sbc + '">' + sbl + '</td>' +
        '<td style="padding:10px 13px;text-align:right;font-family:monospace;font-weight:800;font-size:14px;color:' + sbc + '">&#8377;' + Number(Math.abs(balance)).toLocaleString('en-IN') + '</td>' +
      '</tr>';
    }
    tfootHtml = '<tfoot>' +
      '<tr class="tr-tot"><td colspan="3">Total Amount Paid</td><td class="ta">&#8377;' + Number(data.total || 0).toLocaleString('en-IN') + '</td></tr>' +
      simBalHtml +
    '</tfoot>';
  }

  // ── Payment Summary (rich only) ──────────────────────────────────
  var summaryHtml = '';
  if (isRich) {
    var bal = data.balance || 0;
    var bCol = bal > 0 ? '#059669' : bal < 0 ? '#dc2626' : '#0f172a';
    var bBg  = bal > 0 ? '#f0fdf4' : bal < 0 ? '#fef2f2' : '#f8fafc';
    var bBor = bal > 0 ? '#bbf7d0' : bal < 0 ? '#fecaca' : '#e2e8f0';
    var bIcon, bText;
    if (bal > 0) {
      bIcon = '&#10003;'; bText = '&#8377;' + Number(bal).toLocaleString('en-IN') + ' credited to next month as advance payment';
    } else if (bal < 0) {
      bIcon = '&#8594;'; bText = '&#8377;' + Number(Math.abs(bal)).toLocaleString('en-IN') + ' to be carried forward to next month';
    } else {
      bIcon = '&#10003;'; bText = 'Account fully settled for this month';
    }

    summaryHtml =
      '<div class="psum">' +
        '<div class="psum-head">Payment Summary</div>' +
        '<table class="psum-tbl">' +
          '<tr><td class="pl">Total Base Fee (this month)</td><td class="pv">&#8377;' + Number(data.totalBase || 0).toLocaleString('en-IN') + '</td></tr>' +
          ((data.totalWaiver || 0)  > 0 ? '<tr class="adj-row"><td class="pl waiver-lbl">&minus; Waiver / Discount Applied</td><td class="pv waiver-val">&minus;&nbsp;&#8377;' + Number(data.totalWaiver).toLocaleString('en-IN') + '</td></tr>' : '') +
          ((data.totalCarry  || 0)  > 0 ? '<tr class="adj-row"><td class="pl carry-lbl">+ Previous Month Carry Due</td><td class="pv carry-val">+&nbsp;&#8377;' + Number(data.totalCarry).toLocaleString('en-IN') + '</td></tr>' : '') +
          ((data.totalCredit || 0)  > 0 ? '<tr class="adj-row"><td class="pl credit-lbl">&minus; Advance Credit Applied</td><td class="pv credit-val">&minus;&nbsp;&#8377;' + Number(data.totalCredit).toLocaleString('en-IN') + '</td></tr>' : '') +
          ((data.totalLateFee || 0) > 0 ? '<tr class="adj-row"><td class="pl late-lbl">+ Late Fee Charged</td><td class="pv late-val">+&nbsp;&#8377;' + Number(data.totalLateFee).toLocaleString('en-IN') + '</td></tr>' : '') +
          '<tr><td colspan="2" class="div-row"><hr class="div-line"/></td></tr>' +
          '<tr class="sum-row"><td class="pl">Total Fee Due This Month</td><td class="pv">&#8377;' + Number(data.totalFeeDue || 0).toLocaleString('en-IN') + '</td></tr>' +
          '<tr class="sum-row"><td class="pl">Amount Collected</td><td class="pv" style="color:#4f46e5">&#8377;' + Number(data.total || 0).toLocaleString('en-IN') + '</td></tr>' +
          '<tr><td colspan="2" class="div-row"><hr class="div-line" style="border-color:#1e293b"/></td></tr>' +
          '<tr><td colspan="2" style="padding:10px 16px 0">' +
            '<div style="background:' + bBg + ';border:1.5px solid ' + bBor + ';border-radius:9px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">' +
              '<span style="font-size:12px;font-weight:800;color:' + bCol + '">' + bIcon + '&nbsp;Balance &mdash; ' + bText + '</span>' +
              '<span style="font-family:monospace;font-size:14px;font-weight:900;color:' + bCol + ';flex-shrink:0;margin-left:12px">' +
                (bal === 0 ? 'Settled' : '&#8377;' + Number(Math.abs(bal)).toLocaleString('en-IN')) +
              '</span>' +
            '</div>' +
          '</td></tr>' +
        '</table>' +
      '</div>';
  }

  // ── Info grid ────────────────────────────────────────────────────
  var infoItems = [
    { l: 'Payment Mode',     v: sh(data.paymentMode || 'Cash \u2014 Reception') },
    { l: 'Academic Session', v: sh(data.session || '-') }
  ];
  if (!isRich && data.totalFeeDue != null) {
    infoItems.push({ l: 'Total Fee Due', v: '&#8377;' + Number(data.totalFeeDue).toLocaleString('en-IN') });
  }
  if (data.remark) infoItems.push({ l: 'Remark', v: sh(data.remark) });
  var infoHtml = infoItems.map(function(i) {
    return '<div class="ibox"><div class="il">' + i.l + '</div><div class="iv">' + i.v + '</div></div>';
  }).join('');

  // ── CSS ──────────────────────────────────────────────────────────
  var css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"Segoe UI",Arial,sans-serif;background:#eef2ff;padding:28px;color:#0f172a}',
    '.rw{max-width:820px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 50px rgba(99,102,241,.2)}',
    '.rh{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;padding:30px 36px 26px;position:relative;overflow:hidden}',
    '.rh::before{content:"";position:absolute;right:-50px;top:-50px;width:230px;height:230px;border-radius:50%;background:rgba(255,255,255,.07)}',
    '.school{font-size:24px;font-weight:900;position:relative;margin-bottom:3px}',
    '.rtype{font-size:11px;text-transform:uppercase;letter-spacing:.13em;opacity:.75;font-weight:700;position:relative}',
    '.rno{position:absolute;top:30px;right:36px;text-align:right}',
    '.rno-l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.65;margin-bottom:3px}',
    '.rno-v{font-size:15px;font-weight:900;font-family:monospace;letter-spacing:.04em}',
    '.ab{background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:20px 36px;display:flex;justify-content:space-between;align-items:center}',
    '.al{font-size:10px;text-transform:uppercase;letter-spacing:.1em;opacity:.8;margin-bottom:5px;font-weight:700}',
    '.av{font-size:36px;font-weight:900;font-family:monospace;letter-spacing:-1px}',
    '.aw{font-size:10px;opacity:.8;margin-top:3px;font-style:italic}',
    '.dc{text-align:right}.dl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.75;margin-bottom:3px}',
    '.dv{font-size:14px;font-weight:700}.tv{font-size:12px;opacity:.8;margin-top:2px}',
    '.body{padding:28px 36px}',
    '.stitle{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.13em;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:8px}',
    '.stitle::after{content:"";flex:1;height:1px;background:#e2e8f0}',
    '.scard{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.fl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:3px}',
    '.fv{font-size:14px;font-weight:800;color:#1e293b}.fv.ac{color:#4f46e5}',
    'table.ft{width:100%;border-collapse:collapse;margin-bottom:8px;border:1.5px solid #e2e8f0;border-radius:11px;overflow:hidden}',
    'table.ft thead tr{background:linear-gradient(135deg,#4f46e5,#7c3aed)}',
    'table.ft thead th{padding:9px 11px;font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#fff;font-weight:800;text-align:left}',
    'table.ft tbody tr:nth-child(even){background:#f8fafc}',
    '.csn{width:34px;padding:9px 11px;color:#94a3b8;font-size:11px;font-weight:600}',
    '.cds{padding:9px 11px}.itl{font-size:13px;font-weight:700;color:#1e293b}.its{font-size:10px;color:#64748b;margin-top:2px}',
    '.cmo{padding:9px 11px;font-size:12px;color:#475569;font-weight:600;white-space:nowrap}',
    '.cba{padding:9px 11px;text-align:right;font-family:monospace;font-weight:700;font-size:13px;color:#1e293b}',
    '.cad{padding:9px 11px}',
    '.cam{padding:9px 11px;text-align:right;font-family:monospace;font-weight:800;font-size:13px;color:#1e293b}',
    '.tag-w{background:#eef2ff;color:#4338ca;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:800;display:inline-block;margin:1px 2px}',
    '.tag-c{background:#fff7ed;color:#c2410c;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:800;display:inline-block;margin:1px 2px}',
    '.tag-g{background:#f0fdf4;color:#065f46;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:800;display:inline-block;margin:1px 2px}',
    '.tag-r{background:#fef2f2;color:#dc2626;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:800;display:inline-block;margin:1px 2px}',
    '.tr-tot{background:#eef2ff}',
    '.tr-tot td{padding:12px 11px;font-weight:900;border-top:2.5px solid #6366f1}',
    '.ta{text-align:right;font-family:monospace;font-size:15px;color:#4f46e5}',
    '.psum{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:13px;padding:0;margin-bottom:20px;overflow:hidden}',
    '.psum-head{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;padding:12px 16px 10px;border-bottom:1px solid #e2e8f0}',
    '.psum-tbl{width:100%;border-collapse:collapse}',
    '.pl{padding:8px 16px;font-size:12px;font-weight:600;color:#475569}',
    '.pv{padding:8px 16px;text-align:right;font-family:monospace;font-weight:800;font-size:13px;color:#1e293b}',
    '.adj-row .pl{padding-left:28px;font-size:11px;font-weight:700}',
    '.adj-row .pv{font-size:11px}',
    '.waiver-lbl,.waiver-val{color:#4338ca}',
    '.carry-lbl,.carry-val{color:#c2410c}',
    '.credit-lbl,.credit-val{color:#059669}',
    '.late-lbl,.late-val{color:#dc2626}',
    '.div-row{padding:4px 16px}.div-line{border:none;border-top:1.5px dashed #e2e8f0;margin:0}',
    '.sum-row .pl{font-size:13px;font-weight:800;color:#0f172a}',
    '.sum-row .pv{font-size:14px;color:#0f172a}',
    '.igrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 24px}',
    '.ibox{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 15px}',
    '.il{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:3px}',
    '.iv{font-size:13px;font-weight:700;color:#334155}',
    '.footer{border-top:2px dashed #e2e8f0;padding:20px 36px;display:flex;justify-content:space-between;align-items:flex-end;background:#fafbff}',
    '.sig{text-align:center}.sig-line{width:150px;border-top:1.5px solid #cbd5e1;margin-bottom:5px}',
    '.sig-lbl{font-size:10px;color:#94a3b8;font-weight:600}',
    '.paid-stamp{display:inline-flex;align-items:center;justify-content:center;border:3.5px solid #10b981;color:#059669;border-radius:11px;padding:6px 18px;font-size:22px;font-weight:900;transform:rotate(-7deg);letter-spacing:.15em;opacity:.75}',
    '.pabtn{margin:0 36px 20px;display:flex;justify-content:center;gap:12px}',
    '.pabtn button{border-radius:10px;padding:11px 26px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;border:none}',
    '.btn-pr{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}',
    '.btn-cl{background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0!important}',
    '@media print{body{padding:0;background:#fff}.rw{box-shadow:none;border-radius:0}.pabtn{display:none!important}}'
  ].join('');

  // ── Full HTML ────────────────────────────────────────────────────
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>' + sh(data.receiptType || 'Fee Receipt') + '</title>' +
    '<style>' + css + '</style></head><body>' +
    '<div class="rw">' +

    '<div class="rh">' +
      '<div class="school">&#127979; Hello School</div>' +
      '<div class="rtype">' + sh(data.receiptType || 'Fee Receipt') + '</div>' +
      '<div class="rno"><div class="rno-l">Receipt No.</div><div class="rno-v">' + receiptNo + '</div></div>' +
    '</div>' +

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

    '<div class="stitle">Student Information</div>' +
    '<div class="scard">' +
      '<div><div class="fl">Student Name</div><div class="fv">' + sh(data.studentName || '-') + '</div></div>' +
      '<div><div class="fl">Class</div><div class="fv ac">' + sh(data.className || '-') + '</div></div>' +
      (data.fatherName ? '<div><div class="fl">Father\'s Name</div><div class="fv">' + sh(data.fatherName) + '</div></div>' : '<div></div>') +
      (data.rollNo     ? '<div><div class="fl">Roll No.</div><div class="fv">' + sh(data.rollNo) + '</div></div>' : '<div></div>') +
      '<div><div class="fl">Session</div><div class="fv ac">' + sh(data.session || '-') + '</div></div>' +
      (data.phone      ? '<div><div class="fl">Contact</div><div class="fv">' + sh(data.phone) + '</div></div>' : '<div></div>') +
    '</div>' +

    '<div class="stitle">Fee Details</div>' +
    '<table class="ft"><thead>' + theadHtml + '</thead><tbody>' + itemRowsHtml + '</tbody>' + tfootHtml + '</table>' +

    summaryHtml +

    '<div class="igrid">' + infoHtml + '</div>' +

    '</div>' +

    '<div class="footer">' +
      '<div>' +
        '<div class="paid-stamp">PAID</div>' +
        '<div style="font-size:10px;color:#94a3b8;max-width:210px;line-height:1.6;margin-top:8px">' +
          'This is a computer-generated receipt. Valid without physical signature.' +
        '</div>' +
      '</div>' +
      '<div class="sig">' +
        '<div class="sig-line"></div>' +
        '<div class="sig-lbl">Authorised Signatory</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:3px;font-weight:800">Hello School</div>' +
      '</div>' +
    '</div>' +

    '<div class="pabtn">' +
      '<button class="btn-pr" onclick="window.print()">&#128424;&nbsp; Print Receipt</button>' +
      '<button class="btn-cl" onclick="window.close()">Close</button>' +
    '</div>' +

    '</div></body></html>';

  var w = window.open('', '_blank', 'width=860,height=980');
  if (!w) { toast('Please allow popups to print', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function printMonthRowReceipt(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;

  var rawItems = [];
  (stu.entries || []).forEach(function(entry) {
    var m = entry.months.find(function(mo) { return mo.monthIndex === monthIndex; });
    if (m && m.paymentId) rawItems.push({ entry: entry, month: m });
  });

  if (!rawItems.length) { toast('No payment record found for this month', 'error'); return; }

  // ── Check if this was part of a bulk payment ──
  var bulkGroupId = rawItems[0].month.bulkGroupId;
  if (bulkGroupId) {
    // Fetch all months paid in this bulk group
    apiGet(API_FEE_PAY + '/group/' + encodeURIComponent(bulkGroupId), true)
      .then(function(res) {
        var groupPayments = res.data || [];
        _buildAndPrintGroupReceipt(stu, groupPayments, bulkGroupId);
      })
      .catch(function() {
        // Fallback to single month if group fetch fails
        _buildAndPrintSingleMonthReceipt(stu, rawItems, monthIndex);
      });
    return;
  }

  _buildAndPrintSingleMonthReceipt(stu, rawItems, monthIndex);
}

function _buildAndPrintSingleMonthReceipt(stu, rawItems, monthIndex) {
  var paidAt  = rawItems[0].month.paidAt ? new Date(rawItems[0].month.paidAt) : new Date();
  var remark  = rawItems[0].month.remark || '';
  var payMode = rawItems[0].month.paymentSource === 'online' ? 'Online \u2014 App' : 'Cash \u2014 Reception';

  var receiptItems = [];
  var totalBase = 0, totalCarry = 0, totalCredit = 0;
  var totalWaiver = 0, totalLateFee = 0, totalDue = 0, totalPaid = 0;

  rawItems.forEach(function(i) {
    var m       = i.month;
    var base    = m.baseAmount   != null ? m.baseAmount   : (m.amount || 0);
    var adjBase = m.adjustedBase != null ? m.adjustedBase : base;
    var effDue  = m.effectiveDue != null ? m.effectiveDue : adjBase;
    var credit  = m.previousCredit || 0;
    var carry   = Math.max(0, Math.round(effDue + credit - adjBase));
    var waiver  = m.waiverAmount   || 0;
    var lateFee = m.lateFee        || 0;
    var paidAmt = m.paidAmount     || 0;

    totalBase    += base;
    totalCarry   += carry;
    totalCredit  += credit;
    totalWaiver  += waiver;
    totalLateFee += lateFee;
    totalDue     += effDue + lateFee;
    totalPaid    += paidAmt;

    receiptItems.push({
      feeHead:      i.entry.feeHeadName,
      month:        MONTHS[monthIndex],
      base:         base,
      waiver:       waiver,
      carry:        carry,
      credit:       credit,
      lateFee:      lateFee,
      effectiveDue: effDue + lateFee,
      paid:         paidAmt,
      isPaid:       m.isPaid && !m.isPartial,
      isPartial:    m.isPartial
    });
  });

  printDetailedReceipt({
    studentName:  stu.name,
    className:    (stu.class && stu.class.className) || '',
    rollNo:       stu.rollNo     || '',
    fatherName:   stu.fatherName || '',
    phone:        stu.phone      || '',
    session:      currentSession,
    total:        totalPaid,
    totalBase:    totalBase,
    totalCarry:   totalCarry,
    totalCredit:  totalCredit,
    totalWaiver:  totalWaiver,
    totalLateFee: totalLateFee,
    totalFeeDue:  totalDue,
    balance:      totalPaid - totalDue,
    paymentMode:  payMode,
    remark:       remark,
    items:        receiptItems,
    paidAt:       paidAt,
    receiptType:  'Monthly Fee Receipt \u2014 ' + MONTHS[monthIndex]
  });
}

function _buildAndPrintGroupReceipt(stu, groupPayments, bulkGroupId) {
  var monthGroups = {};
  groupPayments.forEach(function(p) {
    var mi = p.monthIndex;
    if (!monthGroups[mi]) monthGroups[mi] = [];
    monthGroups[mi].push(p);
  });

  var sortedMonthIndices = Object.keys(monthGroups).map(Number).sort(function(a, b) {
    return sessionOrderOf(a) - sessionOrderOf(b);
  });

  var receiptItems = [];
  var totalBase = 0, totalCarry = 0, totalCredit = 0;
  var totalWaiver = 0, totalLateFee = 0, totalDue = 0, totalPaid = 0;

  var paidAt  = new Date(groupPayments[0].paidAt || Date.now());
  var remark  = groupPayments[0].remark || '';
  var payMode = groupPayments[0].paymentSource === 'online' ? 'Online \u2014 App' : 'Cash \u2014 Reception';

  // Look up full student data to get credit/carry info
  var stuData = feeStatusData.find(function(s) { return s.studentId === stu.studentId; });

  sortedMonthIndices.forEach(function(mi) {
    var payments = monthGroups[mi];
    payments.forEach(function(p) {
      var base    = p.amount       || 0;
      var paidAmt = (p.paidAmount != null) ? p.paidAmount : base;
      var waiver  = p.waiverAmount || 0;
      var lateFee = p.lateFee      || 0;
      var adjBase = Math.max(0, base - waiver);

      // ── Resolve credit and carry from feeStatusData ──
      var credit = 0, carry = 0;

      if (p.type !== 'transport' && p.feeHeadId && stuData) {
        var entry = (stuData.entries || []).find(function(e) {
          return String(e.feeHeadId) === String(p.feeHeadId);
        });
        if (entry) {
          var monthData = (entry.months || []).find(function(m) { return m.monthIndex === mi; });
          if (monthData) {
            credit      = monthData.previousCredit || 0;
            var adjBaseM = monthData.adjustedBase != null ? monthData.adjustedBase : adjBase;
            var effDueM  = monthData.effectiveDue != null ? monthData.effectiveDue : adjBaseM;
            carry        = Math.max(0, Math.round(effDueM + credit - adjBaseM));
          }
        }
      } else if (p.type === 'transport' && stuData && stuData.transport) {
        var tMonth = (stuData.transport.months || []).find(function(m) { return m.monthIndex === mi; });
        if (tMonth) {
          credit       = tMonth.previousCredit || 0;
          var adjBaseT = tMonth.adjustedBase != null ? tMonth.adjustedBase : adjBase;
          var effDueT  = tMonth.effectiveDue  != null ? tMonth.effectiveDue  : adjBaseT;
          carry        = Math.max(0, Math.round(effDueT + credit - adjBaseT));
        }
      }

      var effDue = Math.max(0, adjBase - credit) + carry + lateFee;

      totalBase    += base;
      totalWaiver  += waiver;
      totalLateFee += lateFee;
      totalCarry   += carry;
      totalCredit  += credit;
      totalDue     += effDue;
      totalPaid    += paidAmt;

      var fhName = 'Fee';
      if (p.type === 'transport') {
        fhName = 'Transport Fee';
      } else if (p.feeHeadId && stuData) {
        var e2 = (stuData.entries || []).find(function(e) { return String(e.feeHeadId) === String(p.feeHeadId); });
        if (e2) fhName = e2.feeHeadName;
      }

      receiptItems.push({
        feeHead:      fhName,
        month:        MONTHS[mi],
        base:         base,
        waiver:       waiver,
        carry:        carry,
        credit:       credit,
        lateFee:      lateFee,
        effectiveDue: effDue,
        paid:         paidAmt,
        isPaid:       p.isPaid && p.paymentStatus !== 'partial',
        isPartial:    p.paymentStatus === 'partial'
      });
    });
  });

  var monthNames = sortedMonthIndices.map(function(mi) { return SHORT_MONTHS[mi]; }).join(', ');

  printDetailedReceipt({
    studentName:  stu.name,
    className:    (stu.class && stu.class.className) || '',
    rollNo:       stu.rollNo     || '',
    fatherName:   stu.fatherName || '',
    phone:        stu.phone      || '',
    session:      currentSession,
    total:        totalPaid,
    totalBase:    totalBase,
    totalCarry:   totalCarry,
    totalCredit:  totalCredit,
    totalWaiver:  totalWaiver,
    totalLateFee: totalLateFee,
    totalFeeDue:  totalDue,
    balance:      totalPaid - totalDue,
    paymentMode:  payMode,
    remark:       remark,
    items:        receiptItems,
    paidAt:       paidAt,
    receiptType:  'Multi-Month Fee Receipt \u2014 ' + monthNames
  });
}

function printTransportRowReceipt(sid, monthIndex, paidAmount, paidAtStr, remark, routeName, session, paymentSource) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu) return;

  var paidAt   = paidAtStr ? new Date(paidAtStr) : new Date();
  var payMode  = paymentSource === 'online' ? 'Online \u2014 App' : 'Cash \u2014 Reception';

  var tMonths  = (stu.transport && stu.transport.months) || [];
  var tMonth   = tMonths.find(function(m) { return m.monthIndex === monthIndex; });

  var base     = tMonth ? (tMonth.baseAmount != null ? tMonth.baseAmount : paidAmount) : paidAmount;
  var waiver   = (tMonth && tMonth.waiverAmount) || 0;
  var lateFee  = (tMonth && tMonth.lateFee)      || 0;
  var carry    = 0;
  var credit   = (tMonth && tMonth.previousCredit) || 0;

  // Recalculate carry from adjustedBase vs effectiveDue
  if (tMonth) {
    var adjBase = tMonth.adjustedBase != null ? tMonth.adjustedBase : Math.max(0, base - waiver);
    var effDue  = tMonth.effectiveDue != null ? tMonth.effectiveDue : adjBase;
    carry       = Math.max(0, Math.round(effDue - adjBase));
  }

  var adjBase2   = Math.max(0, base - waiver);
  var effDue2    = adjBase2 - credit + carry + lateFee;
  var isPaid     = !!(tMonth && tMonth.isPaid && !tMonth.isPartial);
  var isPartial  = !!(tMonth && tMonth.isPartial);

  // Rich item — presence of .base triggers isRich = true in printDetailedReceipt
  var richItem = {
    feeHead:      'Transport Fee \u2014 ' + routeName,
    month:        MONTHS[monthIndex],
    base:         base,
    waiver:       waiver,
    carry:        carry,
    credit:       credit,
    lateFee:      lateFee,
    effectiveDue: effDue2,
    paid:         paidAmount,
    isPaid:       isPaid,
    isPartial:    isPartial
  };

  printDetailedReceipt({
    studentName:  stu.name,
    className:    (stu.class && stu.class.className) || '',
    rollNo:       stu.rollNo     || '',
    fatherName:   stu.fatherName || '',
    phone:        stu.phone      || '',
    session:      session,
    total:        paidAmount,
    totalBase:    base,
    totalCarry:   carry,
    totalCredit:  credit,
    totalWaiver:  waiver,
    totalLateFee: lateFee,
    totalFeeDue:  effDue2,
    balance:      paidAmount - effDue2,
    paymentMode:  payMode,
    remark:       remark,
    items:        [richItem],
    paidAt:       paidAt,
    receiptType:  'Transport Fee Receipt \u2014 ' + MONTHS[monthIndex]
  });
}

// Transport PDF — checks bulkGroupId first, just like regular fee printMonthRowReceipt()
function printTransportMonthReceipt(sid, monthIndex) {
  var stu = feeStatusData.find(function(s) { return s.studentId === sid; });
  if (!stu || !stu.transport) return;

  var tMonths  = stu.transport.months || [];
  var tMonth   = tMonths.find(function(m) { return m.monthIndex === monthIndex; });
  if (!tMonth || !tMonth.paymentId) { toast('No payment record found', 'error'); return; }

  // If this was part of a bulk group, print all months paid together
  var bulkGroupId = tMonth.bulkGroupId;
  if (bulkGroupId) {
    apiGet(API_FEE_PAY + '/group/' + encodeURIComponent(bulkGroupId), true)
      .then(function(res) {
        var groupPayments = res.data || [];
        _buildAndPrintGroupReceipt(stu, groupPayments, bulkGroupId);
      })
      .catch(function() {
        // Fallback to single month if group fetch fails
        _printSingleTransportReceipt(stu, tMonth, monthIndex);
      });
    return;
  }

  // No bulk group — single month receipt
  _printSingleTransportReceipt(stu, tMonth, monthIndex);
}

function _printSingleTransportReceipt(stu, tMonth, monthIndex) {
  var routeName   = (stu.transport && stu.transport.routeName) || 'Transport';
  var session     = currentSession;
  var paidAt      = tMonth.paidAt ? new Date(tMonth.paidAt) : new Date();
  var paySource   = tMonth.paymentSource || 'cash';
  var payMode     = paySource === 'online' ? 'Online — App' : 'Cash — Reception';
  var paidAmount  = tMonth.paidAmount || 0;

  var base    = tMonth.baseAmount != null ? tMonth.baseAmount : paidAmount;
  var waiver  = tMonth.waiverAmount  || 0;
  var lateFee = tMonth.lateFee       || 0;
  var credit  = tMonth.previousCredit || 0;
  var adjBase = Math.max(0, base - waiver);
  var effDue  = tMonth.effectiveDue != null ? tMonth.effectiveDue : adjBase;
  var carry   = Math.max(0, Math.round(effDue + credit - adjBase));

  var richItem = {
    feeHead:      'Transport Fee — ' + routeName,
    month:        MONTHS[monthIndex],
    base:         base,
    waiver:       waiver,
    carry:        carry,
    credit:       credit,
    lateFee:      lateFee,
    effectiveDue: effDue + lateFee,
    paid:         paidAmount,
    isPaid:       tMonth.isPaid && !tMonth.isPartial,
    isPartial:    tMonth.isPartial || false
  };

  printDetailedReceipt({
    studentName:  stu.name,
    className:    (stu.class && stu.class.className) || '',
    rollNo:       stu.rollNo     || '',
    fatherName:   stu.fatherName || '',
    phone:        stu.phone      || '',
    session:      session,
    total:        paidAmount,
    totalBase:    base,
    totalCarry:   carry,
    totalCredit:  credit,
    totalWaiver:  waiver,
    totalLateFee: lateFee,
    totalFeeDue:  effDue + lateFee, 
    balance:      (paidAmount - lateFee) - adjBase,
    paymentMode:  payMode,
    remark:       tMonth.remark || '',
    items:        [richItem],
    paidAt:       paidAt,
    receiptType:  'Transport Fee Receipt — ' + MONTHS[monthIndex]
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

async function exportBusRosterExcel() {
  var d = window._busRosterData;
  if (!d) return;
  var route        = d.route    || {};
  var bus          = d.bus      || {};
  var students     = d.students || [];
  var isUnassigned = d.isUnassigned;

  var title = isUnassigned
    ? 'Unassigned Students — ' + (route.name || '')
    : 'Bus Roster — ' + (bus.busNumber || 'No Bus No.');

  var workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Hello School';
  workbook.created = new Date();

  var sheetName = (isUnassigned ? 'Unassigned' : (bus.busNumber || 'Roster')).slice(0, 31);
  var ws = workbook.addWorksheet(sheetName);

  ws.columns = [
    { width: 5  },  // #
    { width: 26 },  // Student Name
    { width: 14 },  // Class
    { width: 26 },  // Father's Name
    { width: 18 },  // Phone
    { width: 22 },  // Signature
  ];

  // ── Color palette ──
  var C = {
    purple:      'FF4F46E5',
    purple2:     'FF7C3AED',
    lightPurple: 'FFEEF2FF',
    midPurple:   'FFC7D2FE',
    white:       'FFFFFFFF',
    gray:        'FFF8FAFC',
    darkText:    'FF0F172A',
    mutedText:   'FF94A3B8',
    orange:      'FFEA580C',
    lightOrange: 'FFFFF7ED',
    green:       'FF059669',
    lightGreen:  'FFF0FDF4',
  };

  function mkFill(argb)  { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
  function mkFont(opts)  { return Object.assign({ name: 'Arial' }, opts); }
  function mkBorder(col) {
    var s = { style: 'thin', color: { argb: col || 'FFE2E8F0' } };
    return { top: s, left: s, bottom: s, right: s };
  }
  function mkAlign(h, v) { return { horizontal: h || 'left', vertical: v || 'middle', wrapText: false }; }

  function mergeStyle(r1, c1, r2, c2, val, fontOpts, fillArgb, alignH) {
    var addr = ws.getCell(r1, c1).address + ':' + ws.getCell(r2, c2).address;
    ws.mergeCells(addr);
    var cell = ws.getCell(r1, c1);
    cell.value     = val;
    cell.font      = mkFont(fontOpts);
    cell.fill      = mkFill(fillArgb);
    cell.alignment = mkAlign(alignH || 'left', 'middle');
    return cell;
  }

  var row = 1;

  // ── Row 1: Big header ──
  ws.getRow(row).height = 40;
  mergeStyle(row, 1, row, 6, '🏫  Hello School — Bus Roster',
    { bold: true, size: 16, color: { argb: C.white } }, C.purple, 'center');
  row++;

  // ── Row 2: Title ──
  ws.getRow(row).height = 26;
  mergeStyle(row, 1, row, 6, title,
    { bold: true, size: 12, color: { argb: C.white } }, C.purple2, 'center');
  row++;

  // ── Row 3: Session | Date ──
  ws.getRow(row).height = 20;
  var addr3a = ws.getCell(row, 1).address + ':' + ws.getCell(row, 3).address;
  ws.mergeCells(addr3a);
  var c3a = ws.getCell(row, 1);
  c3a.value = 'Session: ' + (currentSession || '');
  c3a.font = mkFont({ size: 10, color: { argb: C.darkText } });
  c3a.fill = mkFill(C.lightPurple);
  c3a.alignment = mkAlign('left', 'middle');

  var addr3b = ws.getCell(row, 4).address + ':' + ws.getCell(row, 6).address;
  ws.mergeCells(addr3b);
  var c3b = ws.getCell(row, 4);
  c3b.value = 'Printed: ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  c3b.font = mkFont({ size: 10, color: { argb: C.darkText } });
  c3b.fill = mkFill(C.lightPurple);
  c3b.alignment = mkAlign('right', 'middle');
  row++;

  // ── Spacer ──
  ws.getRow(row).height = 10;
  row++;

  // ── Bus info block ──
  if (!isUnassigned && bus.busNumber) {
    ws.getRow(row).height = 18;
    mergeStyle(row, 1, row, 6, 'BUS INFORMATION',
      { bold: true, size: 9, color: { argb: C.purple } }, C.lightPurple, 'left');
    row++;

    var infoData = [
      ['Bus Number', bus.busNumber || '—'],
      ['Driver',     bus.driverName || '—'],
      ['Contact',    String(bus.driverContact || '—')],
      ['Capacity',   bus.capacity ? bus.capacity + ' seats' : 'Not set'],
      ['Route',      route.name || '—'],
      ['Path',       (route.from || '') + ' → ' + (route.to || '')],
      ['Monthly Fee','Rs.' + (route.amount || 0).toLocaleString()],
    ];

    for (var i = 0; i < infoData.length; i += 2) {
      ws.getRow(row).height = 20;

      var lc1 = ws.getCell(row, 1);
      lc1.value = infoData[i][0];
      lc1.font  = mkFont({ bold: true, size: 9, color: { argb: C.mutedText } });
      lc1.fill  = mkFill(C.gray);
      lc1.alignment = mkAlign('left', 'middle');

      var addr_v1 = ws.getCell(row, 2).address + ':' + ws.getCell(row, 3).address;
      ws.mergeCells(addr_v1);
      var vc1 = ws.getCell(row, 2);
      vc1.value = infoData[i][1];
      vc1.font  = mkFont({ bold: true, size: 10, color: { argb: C.darkText } });
      vc1.fill  = mkFill(C.white);
      vc1.alignment = mkAlign('left', 'middle');

      if (infoData[i + 1]) {
        var lc2 = ws.getCell(row, 4);
        lc2.value = infoData[i + 1][0];
        lc2.font  = mkFont({ bold: true, size: 9, color: { argb: C.mutedText } });
        lc2.fill  = mkFill(C.gray);
        lc2.alignment = mkAlign('left', 'middle');

        var addr_v2 = ws.getCell(row, 5).address + ':' + ws.getCell(row, 6).address;
        ws.mergeCells(addr_v2);
        var vc2 = ws.getCell(row, 5);
        vc2.value = infoData[i + 1][1];
        vc2.font  = mkFont({ bold: true, size: 10, color: { argb: C.darkText } });
        vc2.fill  = mkFill(C.white);
        vc2.alignment = mkAlign('left', 'middle');
      }
      row++;
    }
    ws.getRow(row).height = 10;
    row++;
  }

  // ── Student count label ──
  ws.getRow(row).height = 18;
  mergeStyle(row, 1, row, 6,
    'STUDENT ROSTER — ' + students.length + ' STUDENT' + (students.length !== 1 ? 'S' : ''),
    { bold: true, size: 9, color: { argb: C.purple } }, C.lightPurple, 'left');
  row++;

  // ── Table header ──
  ws.getRow(row).height = 26;
  var headers = ['#', 'Student Name', 'Class', "Father's Name", 'Phone', 'Signature'];
  headers.forEach(function(h, i) {
    var cell = ws.getCell(row, i + 1);
    cell.value     = h;
    cell.font      = mkFont({ bold: true, size: 10, color: { argb: C.white } });
    cell.fill      = mkFill(C.purple);
    cell.alignment = mkAlign('center', 'middle');
    cell.border    = mkBorder('FF4F46E5');
  });
  row++;

  // ── Student rows ──
  students.forEach(function(s, idx) {
    ws.getRow(row).height = 22;
    var rowFill = idx % 2 === 1 ? C.gray : C.white;
    var vals = [idx + 1, s.name || '', s.class || '', s.fatherName || '', String(s.phone || ''), ''];
    vals.forEach(function(v, i) {
      var cell = ws.getCell(row, i + 1);
      cell.value     = v;
      cell.font      = mkFont({ size: 10, color: { argb: C.darkText }, bold: i === 1 });
      cell.fill      = mkFill(rowFill);
      cell.alignment = mkAlign(i === 0 ? 'center' : 'left', 'middle');
      cell.border    = mkBorder();
    });
    row++;
  });

  // ── Footer ──
  ws.getRow(row).height = 20;
  var addr_fl = ws.getCell(row, 1).address + ':' + ws.getCell(row, 4).address;
  ws.mergeCells(addr_fl);
  var fl = ws.getCell(row, 1);
  fl.value     = 'Hello School · Transport Management · ' + (currentSession || '');
  fl.font      = mkFont({ size: 9, color: { argb: C.mutedText }, italic: true });
  fl.fill      = mkFill(C.lightPurple);
  fl.alignment = mkAlign('left', 'middle');

  var addr_fr = ws.getCell(row, 5).address + ':' + ws.getCell(row, 6).address;
  ws.mergeCells(addr_fr);
  var fr = ws.getCell(row, 5);
  fr.value     = 'Authorised Signatory';
  fr.font      = mkFont({ size: 9, color: { argb: C.mutedText } });
  fr.fill      = mkFill(C.lightPurple);
  fr.alignment = mkAlign('center', 'middle');

  // ── Download ──
  var buffer = await workbook.xlsx.writeBuffer();
  var blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url    = URL.createObjectURL(blob);
  var a      = document.createElement('a');
  a.href     = url;
  a.download = title.replace(/[^a-z0-9]/gi, '_') + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Excel file downloaded');
}