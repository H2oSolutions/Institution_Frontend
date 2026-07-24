'use strict';
/* ════════════════════════════════════════════════════════════════════
   I-CARD MANAGEMENT — front-end logic
   Splits out of icard-management.html. Relies on config-v2.js + api.js
   being loaded first (same pattern as fee-management.js), which provide:
     • API_BASE_URL, API_ENDPOINTS  (config-v2.js)
     • apiGet(url, true) / apiPost(url, body, true)  (api.js — auto-attach token)
   ────────────────────────────────────────────────────────────────────
   BACKEND ENDPOINTS THIS FILE EXPECTS  (to build next):

   1. Students / classes  → REUSE existing endpoints
        GET  API_ENDPOINTS.CLASSES                              → { data:[{_id,className,...}] }
        GET  API_ENDPOINTS.STUDENTS + '?classId=&limit=9999'    → { data:[student...], pagination }
        (student objects already carry: name, fatherName, motherName, rollNo,
         classId{className}, mobileNo, dateOfBirth, bloodGroup, photo)

   2. Photo upload → Cloudflare R2 (server-proxied multipart; mirrors the
      site's existing Cloudinary pattern — no R2 bucket CORS needed)
        POST API_ICARD_PHOTO_UPLOAD   multipart: file=<jpeg>, studentId
             → { data:{ studentId, photoUrl } }  // backend stores in R2 + sets Student.photo

   3. Asset upload (logo / signature) — same multipart flow, institution-scoped
        POST API_ICARD_ASSET_UPLOAD   multipart: file=<jpeg>, kind=logo|signature
             → { data:{ kind, url } }

   4. Order + payment (this money is H2O's own revenue → plain Razorpay
      checkout, NO Route transfer / no 0.25% split)
        POST API_ICARD_CREATE_PAY  { ...orderPayload }
             → { data:{ razorpayOrderId, amount, key, iCardOrderId, orderId, institutionName } }
        POST API_ICARD_VERIFY_PAY  { razorpayOrderId, razorpayPaymentId, razorpaySignature, iCardOrderId }
             → { success }
   ════════════════════════════════════════════════════════════════════ */

// ── Endpoints (built off API_BASE_URL, same convention as fee-management.js) ──
var API_ICARD_PHOTO_UPLOAD = API_BASE_URL + '/icard/photo/upload';   // multipart: file + studentId
var API_ICARD_ASSET_UPLOAD = API_BASE_URL + '/icard/asset/upload';   // multipart: file + kind
var API_ICARD_CREATE_PAY   = API_BASE_URL + '/icard/create-payment';
var API_ICARD_VERIFY_PAY   = API_BASE_URL + '/icard/verify-payment';

// ── State ──────────────────────────────────────────────────────────
var S = {
  step:        1,
  fields:      ['name', 'class', 'rollno', 'dob'],
  tpl:         'T01',
  strapStyle:  'S01',
  strapPos:    'center',
  flipped:     null,
  name:        'Hello School',
  logoUrl:     null,
  signatureUrl:null,
  classes:     [],
  selectedClassId: '',
  studentsByClass: {},   // classId -> [students]
  students:    [],       // students of the currently selected class
  selected:    {},       // studentId -> student (chosen for the order)
  photos:      {},       // studentId -> publicUrl (mirror of student.photo for quick UI)
};

// ── Catalog ────────────────────────────────────────────────────────
var FIELDS = [
  {key:'name',label:'Student Name',icon:'👤',star:true},
  {key:'class',label:'Class / Section',icon:'📚',star:true},
  {key:'rollno',label:'Roll Number',icon:'#️⃣',star:true},
  {key:'dob',label:'Date of Birth',icon:'🎂',star:true},
  {key:'father',label:"Father's Name",icon:'👨',star:false},
  {key:'mother',label:"Mother's Name",icon:'👩',star:false},
  {key:'phone',label:'Parent Contact',icon:'📞',star:false},
  {key:'address',label:'Address',icon:'📍',star:false},
  {key:'bloodgroup',label:'Blood Group',icon:'🩸',star:false},
  {key:'admno',label:'Admission No.',icon:'🔖',star:false},
  {key:'transport',label:'Transport Route',icon:'🚌',star:false},
  {key:'session',label:'Academic Session',icon:'📅',star:false},
];
var TPLS = [
  {id:'T01',name:'Classic Navy',      desc:'Navy band · logo'},
  {id:'T02',name:'Maroon Crest',      desc:'Traditional crest'},
  {id:'T03',name:'Emerald Band',      desc:'Clean green header'},
  {id:'T04',name:'Minimal Slate',     desc:'Modern minimal'},
  {id:'T05',name:'Royal Sidebar',     desc:'Side band · logo'},
  {id:'T06',name:'Friendly Teal',     desc:'Rounded · primary'},
  {id:'T07',name:'Corporate Graphite',desc:'Pro · horizontal'},
  {id:'T08',name:'Azure Curve',       desc:'Curved header'},
  {id:'T09',name:'Crimson Split',     desc:'Bold split'},
  {id:'T10',name:'Heritage Bordered', desc:'Premium framed'},
  {id:'T11',name:'Horizontal Wave',   desc:'Landscape · side photo'},
  {id:'T12',name:'Gold & Pink Elegant', desc:'Portrait · curved accents'}, 
];
// Sample data used only to render the design previews (real data fills at print time).
var SAMPLE = {name:'Aryan Kumar',class:'X — A',rollno:'2024101',dob:'15/08/2010',father:'Raj Kumar',mother:'Priya Kumar',phone:'98765-43210',address:'Moradabad, UP',bloodgroup:'O+',admno:'HS-4521',transport:'Route 3',session:'2025-26'};
var FL = {name:'Name',class:'Class',rollno:'Roll No',dob:'DOB',father:'Father',mother:'Mother',phone:'Phone',address:'Address',bloodgroup:'Blood',admno:'Adm No',transport:'Route',session:'Session'};
var PSvg = '<svg style="width:55%;opacity:.6" viewBox="0 0 24 24"><use href="#person"/></svg>';

// ════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════════════
function goStep(n) {
  // Guard: can't go past student selection with nothing selected
  if (n >= 3 && Object.keys(S.selected).length === 0) {
    showToast('Select at least one student first', 'error');
    return;
  }
  document.getElementById('step' + S.step).style.display = 'none';
  document.querySelectorAll('.step').forEach(function (el, i) {
    el.classList.remove('active');
    if (i + 1 < n) el.classList.add('done'); else el.classList.remove('done');
  });
  S.step = n;
  var el = document.getElementById('step' + n);
  el.style.display = 'block';
  document.getElementById('s' + n).classList.add('active');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (n === 2) loadClasses();
  if (n === 3) { renderFields(); renderGrid(); }
  if (n === 4) { document.getElementById('optCount').textContent = selectedCount(); }
  if (n === 5) { renderFinal(); updateCost(); }
}

function syncName() {
  S.name = document.getElementById('instName').value || 'Hello School';
  if (S.step === 3) renderGrid();
}

// ════════════════════════════════════════════════════════════════════
//  STEP 2 — CLASSES, STUDENTS, PHOTOS
// ════════════════════════════════════════════════════════════════════
function loadClasses() {
  if (S.classes.length) { fillClassDropdown(); return; }
  apiGet(API_ENDPOINTS.CLASSES, true)
    .then(function (r) {
      S.classes = (r.data || []).filter(function (c) { return c.isActive !== false; });
      fillClassDropdown();
    })
    .catch(function (e) { showToast(e.message || 'Failed to load classes', 'error'); });
}

function fillClassDropdown() {
  var sel = document.getElementById('classSelect');
  sel.innerHTML = '<option value="">Choose a class…</option>' +
    S.classes.map(function (c) {
      return '<option value="' + c._id + '">' + escapeHtml(c.className) + '</option>';
    }).join('');
  if (S.selectedClassId) sel.value = S.selectedClassId;
}

function onClassChange() {
  var cid = document.getElementById('classSelect').value;
  S.selectedClassId = cid;
  var grid = document.getElementById('studentGrid');
  if (!cid) {
    grid.innerHTML = '<div class="empty-note">Choose a class above to load its students.</div>';
    document.getElementById('selectBar').style.display = 'none';
    document.getElementById('readiness').classList.remove('show');
    return;
  }
  if (S.studentsByClass[cid]) { S.students = S.studentsByClass[cid]; renderStudents(); return; }

  grid.innerHTML = '<div class="empty-note">⏳ Loading students…</div>';
  // Reuse the existing students endpoint (same query shape fee-management.js uses)
  apiGet(API_ENDPOINTS.STUDENTS + '?classId=' + encodeURIComponent(cid) + '&limit=9999&isActive=true', true)
    .then(function (r) {
      var list = r.data || [];
      // mirror any existing photo into S.photos so the readiness count is correct
      list.forEach(function (s) { if (s.photo) S.photos[String(s._id)] = s.photo; });
      S.studentsByClass[cid] = list;
      S.students = list;
      renderStudents();
    })
    .catch(function (e) {
      grid.innerHTML = '<div class="empty-note">Failed: ' + escapeHtml(e.message) + '</div>';
    });
}

function renderStudents() {
  var grid = document.getElementById('studentGrid');
  if (!S.students.length) {
    grid.innerHTML = '<div class="empty-note">No students found in this class.</div>';
    document.getElementById('selectBar').style.display = 'none';
    document.getElementById('readiness').classList.remove('show');
    return;
  }
  document.getElementById('selectBar').style.display = 'flex';
  grid.innerHTML = S.students.map(function (s) { return studentTile(s); }).join('');
  updateSelectionUi();
}

function studentTile(s) {
  var id = String(s._id);
  var sel = !!S.selected[id];
  var photo = S.photos[id] || s.photo || null;
  
  // If there's a photo, make the avatar clickable to view it large
  var avatar = photo
    ? '<img src="' + escapeAttr(photo) + '" alt="" onclick="viewPhoto(\'' + escapeAttr(photo) + '\', \'' + escapeHtml(s.name) + '\'); event.stopPropagation();" style="cursor:zoom-in;">'
    : '<span class="ph-none">👤</span>';
    
  var badge = photo
    ? '<span class="ph-badge ok">✓</span>'
    : '<span class="ph-badge no">!</span>';
    
  var roll = s.rollNo ? 'Roll ' + escapeHtml(s.rollNo) : 'No roll no.';

  // Add the Trash button ONLY if a photo exists
  var trashBtn = photo 
    ? '<button class="photo-act" onclick="clearPhoto(\'' + id + '\')" style="flex:0.4; border-color:var(--danger); color:var(--danger);">🗑️</button>' 
    : '';

  return '<div class="stu-tile ' + (sel ? 'sel' : '') + '" id="stu-' + id + '">' +
      '<div class="stu-tile-top" onclick="toggleStudent(\'' + id + '\')">' +
        '<div class="stu-avatar">' + avatar + badge + '</div>' +
        '<div class="stu-meta">' +
          '<div class="stu-name">' + escapeHtml(s.name) + '</div>' +
          '<div class="stu-sub">' + roll + '</div>' +
        '</div>' +
        '<div class="stu-checkbox">' + (sel ? '✓' : '') + '</div>' +
      '</div>' +
      '<div class="stu-photo-actions">' +
        '<label class="photo-act" id="upbtn-' + id + '">📁 Upload' +
          '<input type="file" accept="image/*" onchange="onPhotoFile(\'' + id + '\', this)">' +
        '</label>' +
        '<button class="photo-act" onclick="openCamera(\'' + id + '\')">📸 Camera</button>' +
        trashBtn +
      '</div>' +
    '</div>';
}

function toggleStudent(id) {
  var s = S.students.find(function (x) { return String(x._id) === id; });
  if (!s) return;
  if (S.selected[id]) delete S.selected[id]; else S.selected[id] = s;
  var tile = document.getElementById('stu-' + id);
  if (tile) {
    var on = !!S.selected[id];
    tile.classList.toggle('sel', on);
    tile.querySelector('.stu-checkbox').textContent = on ? '✓' : '';
  }
  updateSelectionUi();
}

function selectAllStudents(on) {
  S.students.forEach(function (s) {
    var id = String(s._id);
    if (on) S.selected[id] = s; else delete S.selected[id];
  });
  renderStudents();
}

function selectedCount() { return Object.keys(S.selected).length; }

function updateSelectionUi() {
  document.getElementById('selCount').textContent = selectedCount();
  // Readiness = how many SELECTED students have a photo
  var sel = Object.values(S.selected);
  var ready = document.getElementById('readiness');
  if (!sel.length) { ready.classList.remove('show'); return; }
  ready.classList.add('show');
  var withPhoto = sel.filter(function (s) { return S.photos[String(s._id)] || s.photo; });
  var missing = sel.filter(function (s) { return !(S.photos[String(s._id)] || s.photo); });
  document.getElementById('readyCount').textContent = withPhoto.length + ' / ' + sel.length;
  document.getElementById('readyFill').style.width = Math.round((withPhoto.length / sel.length) * 100) + '%';
  var miss = document.getElementById('readyMissing');
  if (missing.length) {
    var names = missing.slice(0, 4).map(function (s) { return s.name.split(' ')[0]; }).join(', ');
    miss.textContent = '⚠ ' + missing.length + ' missing photo' + (missing.length > 1 ? 's' : '') +
      ' (' + names + (missing.length > 4 ? '…' : '') + ')';
    miss.style.color = 'var(--danger)';
  } else {
    miss.textContent = '✓ All selected students have photos';
    miss.style.color = 'var(--success)';
  }
}

// ── Photo: client compress + square-crop (solves R2 having no transforms) ──
function compressImage(file, size, quality) {
  size = size || 600; quality = quality || 0.82;
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    var img = new Image();
    reader.onload = function (e) { img.src = e.target.result; };
    reader.onerror = function () { reject(new Error('Could not read file')); };
    img.onload = function () {
      var side = Math.min(img.width, img.height);
      var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      var canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Compression failed')); }, 'image/jpeg', quality);
    };
    img.onerror = function () { reject(new Error('Invalid image')); };
    reader.readAsDataURL(file);
  });
}

// ── Core photo upload: compressed blob → our API (multipart) → R2 → Student.photo ──
function uploadStudentPhoto(studentId, blob) {
  var fd = new FormData();
  fd.append('file', blob, studentId + '.jpg');
  fd.append('studentId', studentId);
  return apiPostFormData(API_ICARD_PHOTO_UPLOAD, fd, true).then(function (r) {
    if (!r || !r.success) throw new Error((r && r.message) || 'Upload failed');
    return r.data.photoUrl;
  });
}

function onPhotoFile(studentId, input) {
  var file = input.files && input.files[0];
  if (!file) return;
  setPhotoBusy(studentId, true);
  compressImage(file)
    .then(function (blob) { return uploadStudentPhoto(studentId, blob); })
    .then(function (url) { applyPhoto(studentId, url); showToast('Photo saved', 'success'); })
    .catch(function (e) { showToast(e.message || 'Upload failed', 'error'); })
    .finally(function () { setPhotoBusy(studentId, false); input.value = ''; });
}

function applyPhoto(studentId, url) {
  S.photos[studentId] = url;
  var s = S.students.find(function (x) { return String(x._id) === studentId; });
  if (s) s.photo = url;
  // refresh just this tile's avatar
  var tile = document.getElementById('stu-' + studentId);
  if (tile) {
    var av = tile.querySelector('.stu-avatar');
    av.innerHTML = '<img src="' + escapeAttr(url) + '" alt=""><span class="ph-badge ok">✓</span>';
  }
  updateSelectionUi();
}

function setPhotoBusy(studentId, on) {
  var up = document.getElementById('upbtn-' + studentId);
  if (up) up.classList.toggle('busy', on);
}

// ── Bulk: files named by roll number → auto-match within current class ──
// ── Bulk: files named by STUDENT NAME → auto-match within current class ──
//    (roll numbers aren't stored, so we match on name)
//    e.g.  "aryan kumar.jpg" → student named "Aryan Kumar"
//    If a filename matches 2+ students (duplicate names) or 0 students,
//    it goes to a conflict resolver instead of silently guessing.
function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function bulkPhotoMatch(files) {
  if (!S.students.length) { showToast('Select a class first', 'error'); return; }
  var arr = Array.prototype.slice.call(files || []);
  if (!arr.length) return;

  // Build name → [students] map (array, because names can repeat)
  var byName = {};
  S.students.forEach(function (s) {
    var k = normName(s.name);
    (byName[k] = byName[k] || []).push(s);
  });

  var autoJobs = [];      // { file, student } — unique matches, upload directly
  var conflicts = [];     // { file, candidates[] } — ambiguous or no match

  arr.forEach(function (file) {
    var base = file.name.replace(/\.[^.]+$/, '');   // strip extension
    var key = normName(base);
    var matches = byName[key] || [];
    if (matches.length === 1) {
      autoJobs.push({ file: file, student: matches[0] });
    } else {
      // 0 matches OR 2+ matches → let the user decide
      conflicts.push({ file: file, candidates: matches.length ? matches : S.students });
    }
  });

  // Upload the clean unique matches right away
  if (autoJobs.length) {
    showToast('Uploading ' + autoJobs.length + ' matched photo' + (autoJobs.length > 1 ? 's' : '') + '…', 'success');
    var jobs = autoJobs.map(function (j) {
      var id = String(j.student._id);
      return compressImage(j.file)
        .then(function (blob) { return uploadStudentPhoto(id, blob); })
        .then(function (url) { applyPhoto(id, url); })
        .catch(function () {/* swallow; surfaced below */});
    });
    Promise.all(jobs).then(function () {
      showToast(autoJobs.length + ' photo(s) matched by name', 'success');
    });
  }

  // Anything ambiguous → open the resolver
  if (conflicts.length) {
    openBulkResolver(conflicts);
  } else if (!autoJobs.length) {
    showToast('No filenames matched any student name', 'error');
  }
  document.getElementById('bulkInput').value = '';
}

// ── Conflict resolver: one row per unresolved file, pick the right student ──
var _bulkConflicts = [];
function openBulkResolver(conflicts) {
  _bulkConflicts = conflicts;
  var rows = conflicts.map(function (c, i) {
    var opts = c.candidates.map(function (s) {
  var roll = s.rollNo ? 'Roll ' + s.rollNo : 'No Roll';
  var father = s.fatherName ? 'S/O ' + s.fatherName : '';
  return '<option value="' + String(s._id) + '">' + escapeHtml(s.name) + ' — ' + escapeHtml(roll) + ' ' + escapeHtml(father) + 
         (s.photo || S.photos[String(s._id)] ? ' (has photo)' : '') + '</option>';
}).join('');
    var label = c.candidates.length > 1
      ? 'Multiple students named like this — pick one:'
      : 'No exact name match — choose the right student:';
    return '<div style="margin-bottom:14px;padding:12px;background:var(--panel);border:1px solid var(--rim);border-radius:10px">' +
        '<div style="font-size:12px;color:var(--silver);margin-bottom:6px">📄 <b>' + escapeHtml(c.file.name) + '</b></div>' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">' + label + '</div>' +
        '<select id="bres-' + i + '" style="width:100%">' +
          '<option value="">— Skip this file —</option>' + opts +
        '</select>' +
      '</div>';
  }).join('');

  var html =
    '<div class="cam-overlay show" id="bulkResolver" style="z-index:1001">' +
      '<div class="cam-box" style="max-width:480px;text-align:left;max-height:80vh;overflow:auto">' +
        '<div class="cam-title" style="text-align:center">Resolve ' + conflicts.length + ' photo' + (conflicts.length > 1 ? 's' : '') + '</div>' +
        '<div class="cam-sub" style="text-align:center">These filenames didn\'t map to exactly one student.</div>' +
        rows +
        '<div class="btn-row" style="justify-content:center">' +
          '<button class="btn btn-out" onclick="closeBulkResolver()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="applyBulkResolver()">Upload selected</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  var wrap = document.createElement('div');
  wrap.id = 'bulkResolverWrap';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}

function closeBulkResolver() {
  var w = document.getElementById('bulkResolverWrap');
  if (w) w.remove();
  _bulkConflicts = [];
}

function applyBulkResolver() {
  var jobs = [];
  _bulkConflicts.forEach(function (c, i) {
    var sel = document.getElementById('bres-' + i);
    var sid = sel && sel.value;
    if (!sid) return;                    // skipped
    jobs.push(
      compressImage(c.file)
        .then(function (blob) { return uploadStudentPhoto(sid, blob); })
        .then(function (url) { applyPhoto(sid, url); })
        .catch(function () {/* surfaced below */})
    );
  });
  if (!jobs.length) { closeBulkResolver(); showToast('Nothing selected', 'error'); return; }
  showToast('Uploading ' + jobs.length + ' photo(s)…', 'success');
  Promise.all(jobs).then(function () {
    showToast(jobs.length + ' photo(s) uploaded', 'success');
    closeBulkResolver();
  });
}

// ── Logo / signature → our API (multipart) → R2; URL goes onto the order ──
function uploadAsset(input, kind) {
  var file = input.files && input.files[0];
  if (!file) return;
  var prevId = kind === 'logo' ? 'logoPrev' : 'sigPrev';
  var iconId = kind === 'logo' ? 'logoIcon' : 'sigIcon';
  compressImage(file, 400, 0.9)
    .then(function (blob) {
      var fd = new FormData();
      fd.append('file', blob, kind + '.jpg');
      fd.append('kind', kind);
      return apiPostFormData(API_ICARD_ASSET_UPLOAD, fd, true);
    })
    .then(function (r) {
      if (!r || !r.success) throw new Error((r && r.message) || 'Upload failed');
      var url = r.data.url;
      if (kind === 'logo') S.logoUrl = url; else S.signatureUrl = url;
      var img = document.getElementById(prevId);
      img.src = url; img.style.display = 'block';
      document.getElementById(iconId).style.display = 'none';
      showToast((kind === 'logo' ? 'Logo' : 'Signature') + ' uploaded', 'success');
    })
    .catch(function (e) { showToast(e.message || 'Upload failed', 'error'); })
    .finally(function () { input.value = ''; });
}

// ════════════════════════════════════════════════════════════════════
//  CAMERA CAPTURE
// ════════════════════════════════════════════════════════════════════
var _camStream = null, _camStudentId = null;
var _camFacing = 'environment'; // Default to back camera

function openCamera(studentId) {
  _camStudentId = studentId;
  var s = S.students.find(function (x) { return String(x._id) === studentId; });
  document.getElementById('camTitle').textContent = 'Capture — ' + ((s && s.name) || 'Student');
  document.getElementById('camOverlay').classList.add('show');

  // If a camera is already running (like when they click flip), stop it first
  if (_camStream) { 
    _camStream.getTracks().forEach(function(t) { t.stop(); }); 
  }

  // Use our _camFacing variable
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: _camFacing }, width: 720, height: 720 }, audio: false })
    .then(function (stream) {
      _camStream = stream;
      var v = document.getElementById('camVideo');
      v.srcObject = stream; v.play();
    })
    .catch(function () { showToast('Could not access camera. Allow permission or upload a file.', 'error'); closeCamera(); });
}

// Function to flip the camera
function flipCamera() {
  _camFacing = _camFacing === 'environment' ? 'user' : 'environment';
  if (_camStudentId) {
    openCamera(_camStudentId); // Instantly restart the camera with the new lens
  }
}

function captureCamera() {
  var v = document.getElementById('camVideo');
  var side = Math.min(v.videoWidth, v.videoHeight) || 600;
  var sx = (v.videoWidth - side) / 2, sy = (v.videoHeight - side) / 2;
  var canvas = document.getElementById('camCanvas');
  canvas.width = 600; canvas.height = 600;
  canvas.getContext('2d').drawImage(v, sx, sy, side, side, 0, 0, 600, 600);
  var sid = _camStudentId;
  var btn = document.getElementById('camShoot');
  btn.disabled = true; btn.textContent = 'Saving…';
  canvas.toBlob(function (blob) {
    uploadStudentPhoto(sid, blob)
      .then(function (url) { applyPhoto(sid, url); showToast('Photo saved', 'success'); closeCamera(); })
      .catch(function (e) { showToast(e.message || 'Save failed', 'error'); })
      .finally(function () { btn.disabled = false; btn.textContent = '📸 Capture & Save'; });
  }, 'image/jpeg', 0.85);
}

function closeCamera() {
  if (_camStream) { _camStream.getTracks().forEach(function (t) { t.stop(); }); _camStream = null; }
  document.getElementById('camOverlay').classList.remove('show');
  _camStudentId = null;
}

// ════════════════════════════════════════════════════════════════════
//  STEP 3 — FIELDS + TEMPLATE
// ════════════════════════════════════════════════════════════════════
function renderFields() {
  document.getElementById('fieldsGrid').innerHTML = FIELDS.map(function (f) {
    var on = S.fields.includes(f.key);
    return '<div class="fchip ' + (on ? 'on' : '') + '" onclick="togField(\'' + f.key + '\')">' +
      '<div class="chk">' + (on ? '✓' : '') + '</div>' + f.icon + ' ' + f.label + (f.star ? ' ★' : '') + '</div>';
  }).join('');
  document.getElementById('fieldCount').textContent = S.fields.length;
}

function togField(k) {
  if (S.fields.includes(k)) { S.fields = S.fields.filter(function (x) { return x !== k; }); }
  else { if (S.fields.length >= 6) { showToast('Max 6 fields', 'error'); return; } S.fields.push(k); }
  renderFields();
  renderGrid(); // live update previews when fields change
}

// ── Card design renderers (unchanged from the design demo) ──
// ── Card design renderers (Upgraded for Real Data) ──

// Helper to pull the right real data from a student object based on the selected field
function getStudentFieldValue(s, key) {
  if (key === 'name') return escapeHtml(s.name || '-');
  if (key === 'class') {
    var c = S.classes.find(function(x) { return String(x._id) === String(S.selectedClassId); });
    return c ? escapeHtml(c.className) : '-';
  }
  if (key === 'rollno') return escapeHtml(s.rollNo || '-');
  if (key === 'dob') {
    if (!s.dateOfBirth) return '-';
    var d = new Date(s.dateOfBirth);
    return isNaN(d) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (key === 'father') return escapeHtml(s.fatherName || '-');
  if (key === 'mother') return escapeHtml(s.motherName || '-');
  if (key === 'phone') return escapeHtml(s.mobileNo || '-');
  if (key === 'address') {
    var adr = s.simpleAddress || (s.address && s.address.fullAddress) || '-';
    return escapeHtml(adr);
  }
  if (key === 'bloodgroup') return escapeHtml(s.bloodGroup || '-');
  if (key === 'admno') return escapeHtml(s.admissionNo || '-');
  if (key === 'transport') return escapeHtml(s.transportRoute || '-');
  if (key === 'session') return escapeHtml(s.academicYear || '-');
  return '-';
}

// Generate field rows (uses real student if provided, else dummy sample)
function gf(max, student = null) {
  var keys = S.fields.length ? S.fields.slice(0, max) : ['name', 'class', 'dob', 'rollno'];
  return keys.map(function (k) { 
    var val = student ? getStudentFieldValue(student, k) : (SAMPLE[k] || '—');
    return [FL[k] || k, val]; 
  });
}

function rows(cls, fkc, fvc, pairs) {
  return pairs.map(function (p) {
    return '<div class="' + cls + '"><span class="' + fkc + '">' + p[0] + '</span><span class="' + fvc + '">' + p[1] + '</span></div>';
  });
}

// Beautifully centered backside text
function bt() {
  var phone = document.getElementById('instPhone').value || '+91 98765 43210';
  var addr = document.getElementById('instAddr').value || 'Your Institution Address Here';
  
  return '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding: 4% 2%;">' +
           '<div style="font-size:3px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:1px;">If found, please return to:</div>' +
           '<div style="font-size:4.5px; font-weight:700; color:#0f172a; margin-bottom:1px; line-height:1.2;">' + escapeHtml(S.name) + '</div>' +
           '<div style="font-size:3px; color:#334155; line-height:1.3; margin-bottom:2px; max-width:90%;">' + escapeHtml(addr) + '</div>' +
           '<div style="font-size:3.2px; font-weight:600; color:#0f172a; margin-bottom:4px;">📞 ' + escapeHtml(phone) + '</div>' +
           '<div style="width:15%; height:1px; background:#cbd5e1; margin-bottom:4px;"></div>' +
           '<div style="font-size:2.8px; color:#94a3b8; line-height:1.4;">This card is institutional property.<br>Report any loss immediately.</div>' +
         '</div>';
}

function logoMark() {
  if (S.logoUrl) return '<img src="' + escapeAttr(S.logoUrl) + '" alt="">';
  var ch = (S.name && S.name.trim()[0]) ? S.name.trim()[0].toUpperCase() : 'S';
  return ch;
}

function front(id, stu = null) {
  var sc = S.name;
  var nm = stu ? escapeHtml(stu.name) : 'Aryan Kumar';
  
  // ✅ FIX 1: Changed from 4 to 6 so it shows all selected fields!
  var p = gf(6, stu); 
  
  var photoUrl = stu ? (S.photos[stu._id] || stu.photo) : null;
  var photoHtml = photoUrl 
    ? '<img src="' + escapeAttr(photoUrl) + '" alt="" style="width:100%; height:100%; object-fit:cover;">' 
    : PSvg;

  if (id === 'T01') return '<div class="t01-i"><div class="hd"><div class="lg">' + logoMark() + '</div><div class="sn">' + sc + '</div></div><div class="bd"><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div><div class="ft"></div></div>';
  if (id === 'T02') return '<div class="t02-i"><div class="crest">' + logoMark() + '</div><div class="sn">' + sc + '</div><div class="rule"></div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T03') return '<div class="t03-i"><div class="hd"><div class="sn">' + sc + '</div><div class="tag">Student Identity Card</div></div><div class="bd"><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div><div class="ft"></div></div>';
  if (id === 'T04') return '<div class="t04-i"><div class="rail"></div><div class="sn">' + sc + '</div><div class="tag">Identity Card</div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div><div class="role">Student</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T05') return '<div class="t05-band"><div class="lg">' + logoMark() + '</div><div class="vsn">' + sc + '</div></div><div class="t05-i"><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T06') return '<div class="t06-i"><div class="hd"><div class="sn">' + sc + '</div></div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T07') return '<div class="t07-i"><div class="hd"><div class="sn">' + sc + '</div><div class="idtag">ID</div></div><div class="bd"><div class="ph">' + photoHtml + '</div><div class="col"><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div></div></div>';
  if (id === 'T08') return '<div class="t08-i"><div class="hd"><div class="sn">' + sc + '</div></div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T09') return '<div class="t09-i"><div class="top"><div class="sn">' + sc + '</div></div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div>';
  if (id === 'T10') return '<div class="t10-frame"><div class="t10-i"><div class="mono">' + logoMark() + '</div><div class="sn">' + sc + '</div><div class="rule"></div><div class="ph">' + photoHtml + '</div><div class="nm">' + nm + '</div>' + rows('fr','fk','fv',p).join('') + '</div></div>';
  
 if (id === 'T11') {
    var sig = S.signatureUrl ? '<img src="' + escapeAttr(S.signatureUrl) + '">' : '';
    var sess = stu && stu.academicYear ? stu.academicYear : '2025-26';
    
    // Custom loop to generate the Black Label -> Red Colon -> Blue Value
    var customFields = p.map(function(pair) {
      return '<div class="t11-fr"><div class="t11-fk">' + pair[0] + '</div><div class="t11-fc">:</div><div class="t11-fv">' + pair[1] + '</div></div>';
    }).join('');

    return '<div class="t11-i">' +
             '<div class="t11-hd"></div>' +
             '<div class="t11-w1"></div>' +
             '<div class="t11-w2"></div>' +
             '<div class="t11-logo">' + logoMark() + '</div>' +
             '<div class="t11-sn">' + sc + '</div>' +
             '<div class="t11-sess">SESSION:- ' + escapeHtml(sess) + '</div>' +
             '<div class="t11-ph">' + photoHtml + '</div>' +
             '<div class="t11-sig">' + sig + 'Principal\'s Sign.</div>' +
             '<div class="t11-fields">' + customFields + '</div>' +
             '<div class="t11-fbw"></div>' +
           '</div>';
  }

  if (id === 'T12') {
    var sc = escapeHtml(S.name);
    var nm = stu ? escapeHtml(stu.name) : 'SUMAN SINGH';
    var cls = stu ? getStudentFieldValue(stu, 'class') : 'IX';
    var regNo = stu ? (stu.admissionNo || stu.rollNo || '12345') : '12345';
    var phone = document.getElementById('instPhone').value || '12345 12345';
    var email = 'schoolid@mail.com';
    
    // Exact mapping: Icon -> Label -> Hyphen (-) -> Value
    var pSliced = p.slice(0, 4);
    var customFields = pSliced.map(function(pair) {
      return '<div class="t12-fr"><div class="t12-f-ic"></div><div class="t12-fk">' + pair[0] + '</div><div class="t12-fc">-</div><div class="t12-fv">' + pair[1] + '</div></div>';
    }).join('');

    return '<div class="t12-i">' +
             '<div class="t12-bg-curve"></div>' +
             '<div class="t12-blob-tl"></div>' +
             '<div class="t12-diag-tr"></div>' +
             '<div class="t12-logo-wrap">' + logoMark() + '</div>' +
             '<div class="t12-ph-wrap">' +
   '<div class="t12-ph-ring"></div>' +
   '<div class="t12-ph-circle">' + photoHtml + '</div>' +
   '<svg class="t12-arc-svg" viewBox="0 0 100 100">' +
     '<path id="t12arc" d="M 78,12 A 46,46 0 0 1 78,88" fill="none" stroke="#c81d5e" stroke-width="14" stroke-linecap="round"/>' +
     '<text font-size="7" fill="#fff" font-weight="700" font-family="Arial, sans-serif">' +
       '<textPath href="#t12arc" startOffset="50%" text-anchor="middle">Reg. No. ' + escapeHtml(regNo) + '</textPath>' +
     '</text>' +
   '</svg>' +
 '</div>' +
             '<div class="t12-name-sec">' +
               '<div class="t12-name">' + nm + '</div>' +
               '<div class="t12-cls">CLASS - ' + escapeHtml(cls) + '</div>' +
             '</div>' +
             '<div class="t12-fields">' + customFields + '</div>' +
             '<div class="t12-bot-ph"><span>📞</span> ' + escapeHtml(phone) + '</div>' +
             '<div class="t12-bot-line"></div>' +
             '<div class="t12-school">' + sc + '</div>' +
             '<div class="t12-bot-contact">' +
               '<div class="t12-bc-row"><span class="t12-bc-ic">☎</span> ' + escapeHtml(phone) + '</div>' +
               '<div class="t12-bc-row"><span class="t12-bc-ic">✉</span> ' + escapeHtml(email) + '</div>' +
             '</div>' +
             '<div class="t12-bot-diag"></div>' +
           '</div>';
  }
  
  return '';
}
 
// ✅ FIX 2: Added Flexbox centering for the backside text
function back(id, stu = null) {
  var b = bt();
  var sig = S.signatureUrl 
    ? '<img src="' + escapeAttr(S.signatureUrl) + '" style="max-height:10px; max-width:80%; display:block; margin: 0 auto 1px;"><div style="font-size:2.2px;">Authorised Signatory</div>' 
    : 'Authorised Signatory';

  if (id === 'T10') return '<div class="t10b-i"><div class="bttl">Information</div><div class="bbd" style="flex:1; display:flex; flex-direction:column;"><div class="btx" style="flex:1; display:flex; align-items:center; justify-content:center;">' + b + '</div><div class="sig">' + sig + '</div></div></div>';
  
  if (id === 'T11') {
    // 👇 FIXED: Changed the fallback to generic placeholders!
    var phone = document.getElementById('instPhone').value || '+91 98765 43210';
    var addr = document.getElementById('instAddr').value || 'Your Institution Address Here';
    var sig2 = S.signatureUrl ? '<img src="' + escapeAttr(S.signatureUrl) + '">' : '';
    
    var sc = escapeHtml(S.name); 
    
    return '<div class="t11b-i">' +
             '<div class="t11-bg-img"></div>' +
             '<div class="t11-hd"></div>' +
             '<div class="t11-w1"></div>' +
             '<div class="t11-w2"></div>' +
             '<div class="t11-logo">' + logoMark() + '</div>' +
             '<div class="t11-sn">' + sc + '</div>' +
             '<div class="t11-info">' +
               '<div class="t11-line"><div class="t11-icon">📍</div>' + escapeHtml(addr) + '</div>' +
               '<div class="t11-line"><div class="t11-icon">📞</div>' + escapeHtml(phone) + '</div>' +
             '</div>' +
             '<div class="t11-bbw1"></div>' +
             '<div class="t11-bbw2"></div>' +
             '<div class="t11-sig-b">' + sig2 + 'Principal\'s Sign.</div>' +
           '</div>';
  }

  if (id === 'T12') {
    var sc = escapeHtml(S.name);
    var city = document.getElementById('instCity').value || 'Here City, State';
    
    return '<div class="t12b-i">' +
             '<div class="t12-bg-curve"></div>' +
             '<div class="t12b-blob-tl"></div>' +
             '<div class="t12b-blob-br"></div>' +
             '<div class="t12b-diag-tr"></div>' +
             '<div class="t12b-diag-bl"></div>' +
             '<div class="t12b-logo-wrap">' + logoMark() + '</div>' +
             '<div class="t12b-sn-wrap">' +
   '<div class="t12b-sn">' + sc + '</div>' +
   (city ? '<div class="t12b-sub">' + escapeHtml(city) + '</div>' : '') +
 '</div>' +
             '<div class="t12b-sep"></div>' +
             '<div class="t12b-inst-wrap">' +
               '<div class="t12b-inst-title">INSTRUCTIONS</div>' +
               '<div class="t12b-inst-list">' +
  '<div class="t12b-inst-row"><div class="t12b-inst-dot"></div><div class="t12b-inst-text">This ID card is the property of ' + sc + '.</div></div>' +
  '<div class="t12b-inst-row"><div class="t12b-inst-dot"></div><div class="t12b-inst-text">It must be carried daily by the student.</div></div>' +
  '<div class="t12b-inst-row"><div class="t12b-inst-dot"></div><div class="t12b-inst-text">It should be shown on demand.</div></div>' +
  '<div class="t12b-inst-row"><div class="t12b-inst-dot"></div><div class="t12b-inst-text">In case of loss, inform the school immediately.</div></div>' +
'</div>' +
             '</div>' +
           '</div>';
  }

  var lc = id.toLowerCase();
  return '<div class="' + lc + 'b-i"><div class="bhd"><div class="bttl">Information</div></div><div class="bbd" style="flex:1; display:flex; flex-direction:column;"><div class="btx" style="flex:1; display:flex; align-items:center; justify-content:center;">' + b + '</div><div class="sig">' + sig + '</div></div><div class="ft"></div></div>';
}

// ✅ FIX 3: Inject real selected student into Step 3 previews!
function renderGrid() {
  var grid = document.getElementById('tplGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  // Grab the first selected student to show in the preview grid!
  var selectedArr = Object.values(S.selected);
  var sampleStudent = selectedArr.length > 0 ? selectedArr[0] : null;

  TPLS.forEach(function (t) {
    var sc = document.createElement('div');
    sc.className = 'tpl-scene' + (S.tpl === t.id ? ' picked' : '');
    sc.id = 'tsc-' + t.id;
    sc.innerHTML = '<div class="tpl-flip-hint">flip ⟳</div><div class="tpl-check">✓</div>' +
      '<div class="tpl-body" id="tb-' + t.id + '">' +
        '<div class="tpl-face"><div class="icard ' + t.id.toLowerCase() + '">' + front(t.id, sampleStudent) + '</div></div>' +
        '<div class="tpl-backface"><div class="icard ' + t.id.toLowerCase() + 'b">' + back(t.id, sampleStudent) + '</div></div>' +
      '</div>' +
      '<div class="tpl-label"><div class="tpl-label-name">' + t.name + '</div><div class="tpl-label-desc">' + t.desc + '</div></div>';
    sc.addEventListener('click', function () { clickTpl(t.id, t.name); });
    grid.appendChild(sc);
  });
  
  if (document.getElementById('tplPreview').classList.contains('show')) {
    var cur = TPLS.find(function (t) { return t.id === S.tpl; });
    if (cur) updateTplPreview(cur.id, cur.name);
  }
}



function clickTpl(id, name) {
  var sc = document.getElementById('tsc-' + id);
  if (S.flipped === id) { sc.classList.remove('flipped'); S.flipped = null; }
  else {
    if (S.flipped) { var prev = document.getElementById('tsc-' + S.flipped); if (prev) prev.classList.remove('flipped'); }
    sc.classList.add('flipped'); S.flipped = id;
  }
  if (S.tpl) { var old = document.getElementById('tsc-' + S.tpl); if (old) old.classList.remove('picked'); }
  S.tpl = id; sc.classList.add('picked');
  updateTplPreview(id, name);
  var pan = document.getElementById('tplPreview');
  pan.classList.add('show'); pan.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateTplPreview(id, name) {
  document.getElementById('tplPTitle').textContent = name;
  document.getElementById('tplPBadge').textContent = '✦ ' + id + ' Selected';
  
  // Grab the first selected student to show in the big preview!
  var selectedArr = Object.values(S.selected);
  var sampleStudent = selectedArr.length > 0 ? selectedArr[0] : null;

  document.getElementById('tplPCards').innerHTML =
    '<div class="preview-item"><div class="preview-item-label">Front Side</div><div class="preview-card-big"><div class="icard ' + id.toLowerCase() + '">' + front(id, sampleStudent) + '</div></div></div>' +
    '<div class="preview-item"><div class="preview-item-label">Back Side</div><div class="preview-card-big"><div class="icard ' + id.toLowerCase() + 'b">' + back(id, sampleStudent) + '</div></div></div>';
}

// ════════════════════════════════════════════════════════════════════
//  STEP 4 — OPTIONS
// ════════════════════════════════════════════════════════════════════
function toggleStrap() {
  document.getElementById('strapOpts').style.display = document.getElementById('strapToggle').checked ? 'block' : 'none';
  updateCost();
}
function toggleStrapPrint() {
  document.getElementById('strapPrintOpts').style.display = document.getElementById('strapPrintToggle').checked ? 'block' : 'none';
}
function pickStrap(el, v) {
  document.querySelectorAll('.strap-chip').forEach(function (c) { c.classList.remove('on'); });
  el.classList.add('on'); S.strapStyle = v;
}
function pickPos(el, v) {
  document.querySelectorAll('.pos-btn').forEach(function (c) { c.classList.remove('on'); });
  el.classList.add('on'); S.strapPos = v;
}

// ════════════════════════════════════════════════════════════════════
//  STEP 5 — PREVIEW + COST
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
//  STEP 5 — REAL DATA PREVIEW SLIDER & COST
// ════════════════════════════════════════════════════════════════════

function renderFinal() {
  var selectedArr = Object.values(S.selected);
  if (selectedArr.length === 0) return;

  // Initialize preview index
  if (S.previewIndex === undefined) S.previewIndex = 0;
  
  // Wrap around logic
  if (S.previewIndex >= selectedArr.length) S.previewIndex = 0;
  if (S.previewIndex < 0) S.previewIndex = selectedArr.length - 1;

  var student = selectedArr[S.previewIndex];
  var id = S.tpl;

  var html = `
    <div style="text-align:center; margin-bottom: 18px; display:flex; align-items:center; justify-content:center; gap:16px;">
      <button class="btn btn-out" style="padding: 6px 14px;" onclick="S.previewIndex--; renderFinal();">❮</button>
      <div>
        <div style="font-size:12px; color:var(--silver); font-weight:600; font-family:'IBM Plex Mono',monospace; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">
          Preview ${S.previewIndex + 1} of ${selectedArr.length}
        </div>
        <div style="font-family:'Playfair Display',serif; font-size:18px; color:var(--gold);">
          ${escapeHtml(student.name)}
        </div>
      </div>
      <button class="btn btn-out" style="padding: 6px 14px;" onclick="S.previewIndex++; renderFinal();">❯</button>
    </div>

    <div style="display:flex; justify-content:center; gap:32px; flex-wrap:wrap;">
       <div>
         <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px;text-align:center">Front Side</div>
         <div style="width:190px; margin:0 auto"><div class="icard ${id.toLowerCase()}" style="border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6)">${front(id, student)}</div></div>
       </div>
       <div>
         <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px;text-align:center">Back Side</div>
         <div style="width:190px; margin:0 auto"><div class="icard ${id.toLowerCase()}b" style="border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6)">${back(id, student)}</div></div>
       </div>
    </div>
  `;
  
  document.getElementById('finalPreview').innerHTML = html;
  
  // Update grid template inside the HTML directly for the final view
  document.getElementById('finalPreview').style.display = 'block';
}

function pricing() {
  var qty   = selectedCount();
  var q     = (document.getElementById('cardQuality') || {}).value || 'normal';
  var strap = (document.getElementById('strapToggle') || {}).checked || false;
  var lam   = (document.getElementById('laminationToggle') || {}).checked || false;
  var base  = { normal: 15, premium: 25, private: 40 }[q];
  var perCard = base + (strap ? 12 : 0) + (lam ? 3 : 0);
  var total = perCard * qty + 1; // +₹1 platform fee
  return { qty: qty, q: q, base: base, strap: strap, lam: lam, perCard: perCard, total: total };
}

function updateCost() {
  var p = pricing();
  var fa = document.getElementById('finalAmt');
  if (!fa) return;
  fa.textContent = '₹' + p.total.toLocaleString();
  document.getElementById('finalSub').textContent = '₹' + p.perCard + ' per card × ' + p.qty + ' cards';
  var rowsData = [
    { k: 'Printing (' + p.qty + ' × ₹' + p.base + ')', v: '₹' + (p.base * p.qty).toLocaleString() },
    p.strap ? { k: 'Strap / Lanyard (₹12/card)', v: '₹' + (12 * p.qty).toLocaleString() } : null,
    p.lam ? { k: 'Lamination (₹3/card)', v: '₹' + (3 * p.qty).toLocaleString() } : null,
    { k: 'Platform Fee', v: '₹1' },
    { k: 'Total', v: '₹' + p.total.toLocaleString(), tot: true },
  ].filter(Boolean);
  document.getElementById('costRows').innerHTML = rowsData.map(function (r) {
    return '<div class="cost-row' + (r.tot ? ' tot' : '') + '"><span class="ck">' + r.k + '</span><span class="cv">' + r.v + '</span></div>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════════
//  ORDER + PAYMENT  (plain Razorpay checkout — H2O's own revenue)
// ════════════════════════════════════════════════════════════════════
function buildOrderPayload() {
  var p = pricing();
  var studentIds = Object.keys(S.selected);
  // lightweight per-student snapshot so the print bundle is self-contained
  var students = studentIds.map(function (id) {
    var s = S.selected[id];
    return {
      studentId:  id,
      name:       s.name,
      rollNo:     s.rollNo || null,
      photoUrl:   S.photos[id] || s.photo || null,
    };
  });
  return {
    institutionName:  document.getElementById('instName').value || S.name,
    institutionPhone: document.getElementById('instPhone').value || null,
    institutionCity:  document.getElementById('instCity').value || null,
    institutionAddr:  document.getElementById('instAddr').value || null,
    logoUrl:          S.logoUrl,
    signatureUrl:     S.signatureUrl,
    classId:          S.selectedClassId,
    selectedFields:   S.fields,
    templateId:       S.tpl,
    cardQuality:      p.q,
    cardCount:        p.qty,
    students:         students,
    studentIds:       studentIds,
    strapRequired:    p.strap,
    strapStyle:       p.strap ? S.strapStyle : null,
    strapPrint:       (document.getElementById('strapPrintToggle') || {}).checked || false,
    strapText:        (document.getElementById('strapText') || {}).value || null,
    strapPosition:    p.strap ? S.strapPos : null,
    lamination:       p.lam,
    holePunch:        (document.getElementById('holeToggle') || {}).checked || false,
    perCardCost:      p.perCard,
    platformFee:      1,
    totalAmount:      p.total,
  };
}

function initiatePayment() {
  var btn = document.getElementById('payBtn');
  if (selectedCount() === 0) { showToast('No students selected', 'error'); return; }
  

  // Soft warning for missing photos
  var missing = Object.values(S.selected).filter(function (s) { return !(S.photos[String(s._id)] || s.photo); });
  if (missing.length && !confirm(missing.length + ' selected student(s) have no photo. Place the order anyway?')) return;

  btn.disabled = true; 
  btn.textContent = 'Submitting Test Order...';
  
  var payload = buildOrderPayload();

  // Hit the direct order endpoint instead of the Razorpay one
  apiPost(API_BASE_URL + '/icard/order', payload, true)
    .then(function (data) {
      if (!data || !data.success) throw new Error((data && data.message) || 'Failed to place order');
      
      // Show success screen instantly
      document.getElementById('sOrdId').textContent = '#' + data.data.orderId;
      document.getElementById('successOverlay').classList.add('show');
    })
    .catch(function (e) {
      showToast(e.message || 'Something went wrong. Please try again.', 'error');
    })
    .finally(function () { 
      btn.disabled = false; 
      btn.textContent = '💳 Place Order (Test Mode)'; 
    });
}

// ════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════
function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '') + ' show';
  setTimeout(function () { t.classList.remove('show'); }, 2800);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Optional: prefill institution info from a saved profile, if your config exposes it.
(function prefillInstitution() {
  try {
    var name = localStorage.getItem('institutionName');
    if (name) { var el = document.getElementById('instName'); if (el && !el.value) { el.value = name; S.name = name; } }
  } catch (e) {}
})();

// boot
goStep(1);

function finishOrder() {
  // Hide the popup
  var overlay = document.getElementById('successOverlay');
  if (overlay) overlay.classList.remove('show');
  
  // Reload the page to clear the wizard and start fresh
  window.location.reload(); 
}


// Function to delete the photo from the UI and state
function clearPhoto(studentId) {
  if(!confirm("Are you sure you want to completely remove this student's photo?")) return;
  
  // Show a loading toast so the user knows it's working
  showToast('Deleting photo...', '');

  // Call your backend to delete the photo permanently
  apiPost(API_BASE_URL + '/icard/photo/delete', { studentId: studentId }, true)
    .then(function (r) {
      if (!r || !r.success) throw new Error((r && r.message) || 'Failed to delete photo');
      
      // If the backend successfully deleted it, clear it from our frontend memory
      delete S.photos[studentId];
      var s = S.students.find(function (x) { return String(x._id) === studentId; });
      if (s) s.photo = null;
      
      showToast('Photo permanently deleted', 'success');
      renderStudents(); // Refresh the grid to show the red missing icon
    })
    .catch(function (e) {
      showToast(e.message || 'Error deleting photo', 'error');
    });
}

// Function to pop up the large photo viewer
function viewPhoto(url, name) {
  var html = 
    '<div class="cam-overlay show" id="photoViewer" style="z-index:1005;" onclick="this.remove()">' +
      '<div class="cam-box" style="padding:15px; max-width:500px;" onclick="event.stopPropagation()">' +
        '<div class="cam-title" style="margin-bottom:15px;">' + escapeHtml(name) + '</div>' +
        '<img src="' + escapeAttr(url) + '" style="width:100%; border-radius:10px; max-height:60vh; object-fit:contain; background:#000;">' +
        '<button class="btn btn-out" style="margin-top:15px; width:100%;" onclick="document.getElementById(\'photoViewer\').remove()">Close Preview</button>' +
      '</div>' +
    '</div>';
    
  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}