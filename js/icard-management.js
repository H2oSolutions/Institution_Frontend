'use strict';

// ── Endpoints (built off API_BASE_URL, same convention as fee-management.js) ──
var API_ICARD_PHOTO_UPLOAD = API_BASE_URL + '/icard/photo/upload';   // multipart: file + studentId
var API_ICARD_ASSET_UPLOAD = API_BASE_URL + '/icard/asset/upload';   // multipart: file + kind
var API_ICARD_CREATE_PAY   = API_BASE_URL + '/icard/create-payment';
var API_ICARD_VERIFY_PAY   = API_BASE_URL + '/icard/verify-payment';
var API_ICARD_DRAFT        = API_BASE_URL + '/icard/draft';         

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
  schoolBgUrl: null,
  bgOpacity:   12,    
  bgZoom:      200,  
  bgPosX:      50,     
  bgPosY:      50,
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
var SAMPLE = {name:'Aryan Kumar',class:'X — A',rollno:'2024101',dob:'15/08/2010',father:'Raj Kumar',mother:'Priya Kumar',phone:'98765-43210',address:'Moradabad, UP',bloodgroup:'O+',admno:'HS-4521',transport:'Route 3',session:'2025-26'};
var FL = {name:'Name',class:'Class',rollno:'Roll No',dob:'DOB',father:'Father',mother:'Mother',phone:'Phone',address:'Address',bloodgroup:'Blood',admno:'Adm No',transport:'Route',session:'Session'};
var PSvg = '<svg style="width:55%;opacity:.6" viewBox="0 0 24 24"><use href="#person"/></svg>';

// ════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════════════
function goStep(n) {
  syncName(); // 🚨 NEW FIX: Forces the app to memorize the school name before drawing the cards!

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
  if (n === 5) { 
    S.previewIndex = 0; 
    renderLivePreview(); 
    updateCost(); 
  }
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
  // The Date.now() forces the browser to fetch fresh photos every single time!
  apiGet(API_ENDPOINTS.STUDENTS + '?classId=' + encodeURIComponent(cid) + '&limit=9999&isActive=true&_t=' + Date.now(), true)
    .then(function (r) {
      var list = r.data || [];
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
  
  var avatar = photo
    ? '<img src="' + escapeAttr(photo) + '" alt="" onclick="viewPhoto(\'' + escapeAttr(photo) + '\', \'' + escapeHtml(s.name) + '\'); event.stopPropagation();" style="cursor:zoom-in;">'
    : '<span class="ph-none">👤</span>';
    
  var badge = photo
    ? '<span class="ph-badge ok">✓</span>'
    : '<span class="ph-badge no">!</span>';
    
  var roll = s.rollNo ? 'Roll ' + escapeHtml(s.rollNo) : 'No roll no.';

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

// ── Photo Compression ──
// 🚨 BUG FIX INCLUDED HERE: Supports preserving aspect ratio for backgrounds!
function compressImage(file, size, quality, preserveAspect) {
  size = size || 600; quality = quality || 0.82;
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    var img = new Image();
    reader.onload = function (e) { img.src = e.target.result; };
    reader.onerror = function () { reject(new Error('Could not read file')); };
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      if (preserveAspect) {
        // Keep original proportions (for building photos)
        var ratio = Math.min(size / img.width, size / img.height);
        var targetW = img.width * ratio;
        var targetH = img.height * ratio;
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(img, 0, 0, targetW, targetH);
      } else {
        // Square Crop (for student photos and logos)
        var side = Math.min(img.width, img.height);
        var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        canvas.width = size; canvas.height = size;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      }

      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Compression failed')); }, 'image/jpeg', quality);
    };
    img.onerror = function () { reject(new Error('Invalid image')); };
    reader.readAsDataURL(file);
  });
}

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

function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function bulkPhotoMatch(files) {
  if (!S.students.length) { showToast('Select a class first', 'error'); return; }
  var arr = Array.prototype.slice.call(files || []);
  if (!arr.length) return;

  var byName = {};
  S.students.forEach(function (s) {
    var k = normName(s.name);
    (byName[k] = byName[k] || []).push(s);
  });

  var autoJobs = [];      
  var conflicts = [];     

  arr.forEach(function (file) {
    var base = file.name.replace(/\.[^.]+$/, '');   
    var key = normName(base);
    var matches = byName[key] || [];
    if (matches.length === 1) {
      autoJobs.push({ file: file, student: matches[0] });
    } else {
      conflicts.push({ file: file, candidates: matches.length ? matches : S.students });
    }
  });

  if (autoJobs.length) {
    showToast('Uploading ' + autoJobs.length + ' matched photo' + (autoJobs.length > 1 ? 's' : '') + '…', 'success');
    var jobs = autoJobs.map(function (j) {
      var id = String(j.student._id);
      return compressImage(j.file)
        .then(function (blob) { return uploadStudentPhoto(id, blob); })
        .then(function (url) { applyPhoto(id, url); })
        .catch(function () {});
    });
    Promise.all(jobs).then(function () {
      showToast(autoJobs.length + ' photo(s) matched by name', 'success');
    });
  }

  if (conflicts.length) {
    openBulkResolver(conflicts);
  } else if (!autoJobs.length) {
    showToast('No filenames matched any student name', 'error');
  }
  document.getElementById('bulkInput').value = '';
}

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
        .catch(function () {})
    );
  });
  if (!jobs.length) { closeBulkResolver(); showToast('Nothing selected', 'error'); return; }
  showToast('Uploading ' + jobs.length + ' photo(s)…', 'success');
  Promise.all(jobs).then(function () {
    showToast(jobs.length + ' photo(s) uploaded', 'success');
    closeBulkResolver();
  });
}

// ── Upload Asset ──
function uploadAsset(input, kind) {
  var file = input.files && input.files[0];
  if (!file) return;
  var prevId = kind === 'logo' ? 'logoPrev' : kind === 'signature' ? 'sigPrev' : 'schoolBgPrev';
  var iconId = kind === 'logo' ? 'logoIcon' : kind === 'signature' ? 'sigIcon' : 'schoolBgIcon';
  var delId  = kind === 'logo' ? 'logoDel' : kind === 'signature' ? 'sigDel' : 'schoolBgDel';
  
  var size = kind === 'schoolBg' ? 800 : 400; 
  // 🚨 NEW BUG FIX: Tell the compressor to preserve the rectangular shape for Signatures, Logos, AND Backgrounds!
  var preserveAspect = (kind === 'schoolBg' || kind === 'signature' || kind === 'logo'); 

  compressImage(file, size, 0.85, preserveAspect)
    .then(function (blob) {
      var fd = new FormData();
      fd.append('file', blob, kind + '.jpg');
      fd.append('kind', kind);
      return apiPostFormData(API_ICARD_ASSET_UPLOAD, fd, true);
    })
    .then(function (r) {
      if (!r || !r.success) throw new Error((r && r.message) || 'Upload failed');
      var url = r.data.url;
      if (kind === 'logo') S.logoUrl = url; 
      else if (kind === 'signature') S.signatureUrl = url;
      else if (kind === 'schoolBg') S.schoolBgUrl = url;
      
      document.getElementById(prevId).src = url; 
      document.getElementById(prevId).style.display = 'block';
      document.getElementById(iconId).style.display = 'none';
      document.getElementById(delId).style.display = 'flex'; // Show Delete Button

      if (kind === 'schoolBg') document.getElementById('bgControls').style.display = 'flex'; // Show Toolbar in Step 3
      
      var tsg = kind === 'logo' ? 'Logo' : kind === 'signature' ? 'Signature' : 'School Photo';
      showToast(tsg + ' uploaded', 'success');
      
      syncDraftToCloud();
      if (S.step >= 3) renderGrid(); 
      if (S.step === 5) renderFinal();
    })
    .catch(function (e) { showToast(e.message || 'Upload failed', 'error'); })
    .finally(function () { input.value = ''; });
}

// ── Handle Delete Buttons ──
function removeAsset(kind) {
  var prevId = kind === 'logo' ? 'logoPrev' : kind === 'signature' ? 'sigPrev' : 'schoolBgPrev';
  var iconId = kind === 'logo' ? 'logoIcon' : kind === 'signature' ? 'sigIcon' : 'schoolBgIcon';
  var delId  = kind === 'logo' ? 'logoDel' : kind === 'signature' ? 'sigDel' : 'schoolBgDel';
  var inputId = kind === 'logo' ? 'logoInput' : kind === 'signature' ? 'sigInput' : 'schoolBgInput';

  if (kind === 'logo') S.logoUrl = null;
  else if (kind === 'signature') S.signatureUrl = null;
  else if (kind === 'schoolBg') {
      S.schoolBgUrl = null;
      document.getElementById('bgControls').style.display = 'none';
  }

  document.getElementById(prevId).src = '';
  document.getElementById(prevId).style.display = 'none';
  document.getElementById(iconId).style.display = 'block';
  document.getElementById(delId).style.display = 'none';
  document.getElementById(inputId).value = ''; 

  syncDraftToCloud();
  if (S.step >= 3) renderGrid();
  if (S.step === 5) renderFinal();
}

// ── Watermark Adjustments (Slider + Typing Two-Way Sync) ──
function updateBgSettings(key, val) {
  var numId, sliderId;
  
  if (key === 'opacity') {
      S.bgOpacity = parseInt(val) || 0;
      numId = 'opNum'; sliderId = 'opSlider';
  } else if (key === 'zoom') {
      S.bgZoom = parseInt(val) || 100;
      numId = 'zoomNum'; sliderId = 'zoomSlider';
  } else if (key === 'posY') {
      S.bgPosY = parseInt(val) || 0;
      numId = 'posYNum'; sliderId = 'posYSlider';
  } else if (key === 'posX') {
      S.bgPosX = parseInt(val) || 0;
      numId = 'posXNum'; sliderId = 'posXSlider';
  }
  
  // Two-way data binding: Sync both the slider and the number input
  var numEl = document.getElementById(numId);
  var sliderEl = document.getElementById(sliderId);
  if (numEl && numEl.value !== val) numEl.value = val;
  if (sliderEl && sliderEl.value !== val) sliderEl.value = val;

  // 🚨 WE DELETED syncDraftToCloud() HERE TO STOP THE 429 DDoS ATTACK!
  // The 15-second background interval will save the changes naturally.

  if (S.step >= 3) renderGrid();
  if (S.step === 5) renderFinal();
}

// ════════════════════════════════════════════════════════════════════
//  CAMERA CAPTURE
// ════════════════════════════════════════════════════════════════════
var _camStream = null, _camStudentId = null;
var _camFacing = 'environment'; 

function openCamera(studentId) {
  _camStudentId = studentId;
  var s = S.students.find(function (x) { return String(x._id) === studentId; });
  document.getElementById('camTitle').textContent = 'Capture — ' + ((s && s.name) || 'Student');
  document.getElementById('camOverlay').classList.add('show');

  if (_camStream) { 
    _camStream.getTracks().forEach(function(t) { t.stop(); }); 
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: _camFacing }, width: 720, height: 720 }, audio: false })
    .then(function (stream) {
      _camStream = stream;
      var v = document.getElementById('camVideo');
      v.srcObject = stream; v.play();
    })
    .catch(function () { showToast('Could not access camera. Allow permission or upload a file.', 'error'); closeCamera(); });
}

function flipCamera() {
  _camFacing = _camFacing === 'environment' ? 'user' : 'environment';
  if (_camStudentId) {
    openCamera(_camStudentId); 
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
  renderGrid(); 
}

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
  if (S.logoUrl) {
    // We add inline CSS to force the image to shrink, contain itself, and respect the circle!
    return '<img src="' + escapeAttr(S.logoUrl) + '" alt="" style="width:100%; height:100%; object-fit:contain; border-radius:inherit; display:block;">';
  }
  var ch = (S.name && S.name.trim()[0]) ? S.name.trim()[0].toUpperCase() : 'S';
  return ch;
}

function front(id, stu = null) {
  var sc = S.name;
  var nm = stu ? escapeHtml(stu.name) : 'Aryan Kumar';
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
    // 🚨 Added max-height:none !important to defeat the CSS bug, and filter:contrast(2) to destroy the grey background!
var sig = S.signatureUrl ? '<img src="' + escapeAttr(S.signatureUrl) + '" style="width:100%; height:12px; max-height:none !important; object-fit:contain; mix-blend-mode:multiply; filter:grayscale(1) contrast(4) brightness(1.2); margin-bottom:2px; display:block;">' : '<div style="height:12px;"></div>';    var sess = stu && stu.academicYear ? stu.academicYear : '2025-26';
    
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
             '<div class="t11-sig" style="border-top:none; padding-top:0;">' + sig + '<div style="border-top: 0.6px solid #111; padding-top: 1.5px;">Principal\'s Sign.</div></div>' +
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
 
function back(id, stu = null) {
  var b = bt();
  
  // 🚨 The Universal Signature Fix: Image -> Line -> Text
  var sigImg = S.signatureUrl 
    ? '<img src="' + escapeAttr(S.signatureUrl) + '" style="width:100%; height:12px; max-height:none !important; object-fit:contain; mix-blend-mode:multiply; filter:grayscale(1) contrast(4) brightness(1.2); display:block; margin: 0 auto 2px;">' 
    : '<div style="height:12px;"></div>';
    
  var sigText = '<div style="border-top: 0.6px solid currentColor; padding-top: 2px; width: 100%; font-size: 2.2px;">Authorised Signatory</div>';
  var sig = sigImg + sigText;

  // Opacity, Zoom, and Position mapping
  var op = (S.bgOpacity !== undefined ? S.bgOpacity : 12) / 100;
  var zoom = (S.bgZoom !== undefined ? S.bgZoom : 200) + '%';
  var posX = S.bgPosX !== undefined ? S.bgPosX : 50;
  var posY = S.bgPosY !== undefined ? S.bgPosY : 50;

  var wm = S.schoolBgUrl 
    ? '<div style="position:absolute; inset:0; background:url(\'' + escapeAttr(S.schoolBgUrl) + '\') ' + posX + '% ' + posY + '% / ' + zoom + ' auto no-repeat; opacity:' + op + '; mix-blend-mode:multiply; pointer-events:none; z-index:0;"></div>' 
    : '';

  if (id === 'T10') return wm + '<div class="t10b-i"><div class="bttl" style="position:relative; z-index:2;">Information</div><div class="bbd" style="flex:1; display:flex; flex-direction:column; position:relative; z-index:2;"><div class="btx" style="flex:1; display:flex; align-items:center; justify-content:center;">' + b + '</div><div class="sig" style="position:relative; z-index:2; border-top:none; padding-top:0;">' + sig + '</div></div></div>';
  
  if (id === 'T11') {
    var phone = document.getElementById('instPhone').value || '+91 98765 43210';
    var addr = document.getElementById('instAddr').value || 'Your Institution Address Here';
var sig2 = S.signatureUrl ? '<img src="' + escapeAttr(S.signatureUrl) + '" style="width:100%; height:12px; max-height:none !important; object-fit:contain; mix-blend-mode:multiply; filter:grayscale(1) contrast(4) brightness(1.2); margin-bottom:2px; display:block;">' : '<div style="height:12px;"></div>';    var sc = escapeHtml(S.name); 
    
    var bgImg = S.schoolBgUrl ? escapeAttr(S.schoolBgUrl) : 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=800&auto=format&fit=crop';
    var t11BgStyle = S.schoolBgUrl 
      ? 'background: url(\'' + bgImg + '\') ' + posX + '% ' + posY + '% / ' + zoom + ' auto no-repeat; opacity:' + op + '; mix-blend-mode:multiply;' 
      : 'background: url(\'' + bgImg + '\') center/cover; opacity: 0.25;';
    
    return '<div class="t11b-i">' +
             '<div class="t11-bg-img" style="' + t11BgStyle + '"></div>' +
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
             '<div class="t11-sig-b" style="border-top:none; padding-top:0;">' + sig2 + '<div style="border-top: 0.6px solid #111; padding-top: 1.5px;">Principal\'s Sign.</div></div>' +
           '</div>';
  }

  if (id === 'T12') {
    var sc = escapeHtml(S.name);
    var city = document.getElementById('instCity').value || 'Here City, State';
    
    return wm + '<div class="t12b-i">' +
             '<div class="t12-bg-curve"></div>' +
             '<div class="t12b-blob-tl"></div>' +
             '<div class="t12b-blob-br"></div>' +
             '<div class="t12b-diag-tr"></div>' +
             '<div class="t12b-diag-bl"></div>' +
             '<div class="t12b-logo-wrap">' + logoMark() + '</div>' +
             '<div class="t12b-sn-wrap">' +
               '<div class="t12b-sn" style="position:relative; z-index:2;">' + sc + '</div>' +
               (city ? '<div class="t12b-sub" style="position:relative; z-index:2;">' + escapeHtml(city) + '</div>' : '') +
             '</div>' +
             '<div class="t12b-sep"></div>' +
             '<div class="t12b-inst-wrap" style="position:relative; z-index:2;">' +
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
  return wm + '<div class="' + lc + 'b-i"><div class="bhd" style="position:relative; z-index:2;"><div class="bttl">Information</div></div><div class="bbd" style="flex:1; display:flex; flex-direction:column; position:relative; z-index:2;"><div class="btx" style="flex:1; display:flex; align-items:center; justify-content:center;">' + b + '</div><div class="sig" style="position:relative; z-index:2; border-top:none; padding-top:0;">' + sig + '</div></div><div class="ft" style="position:relative; z-index:2;"></div></div>';
}

function renderGrid() {
  var grid = document.getElementById('tplGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
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
function renderFinal() {
  var selectedArr = Object.values(S.selected);
  if (selectedArr.length === 0) return;

  if (S.previewIndex === undefined) S.previewIndex = 0;
  
  if (S.previewIndex >= selectedArr.length) S.previewIndex = 0;
  if (S.previewIndex < 0) S.previewIndex = selectedArr.length - 1;

  var student = selectedArr[S.previewIndex];
  var id = S.tpl;

  var html = `
    <div style="text-align:center; margin-bottom: 18px; display:flex; align-items:center; justify-content:center; gap:16px;">
      <button class="btn btn-out" style="padding: 6px 14px;" onclick="S.previewIndex--; renderFinal();">❮</button>
      <div>
        <div style="font-size:12px; color:var(--silver); font-weight:600; font-family:'IBM Plex Mono',monospace; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">
          Peview ${S.previewIndex + 1} of ${selectedArr.length}
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
  document.getElementById('finalPreview').style.display = 'block';
}

// ════════════════════════════════════════════════════════════════════
//  STEP 5 — PREVIEW + COST (LIVE VERIFIER CAROUSEL)
// ════════════════════════════════════════════════════════════════════
function renderLivePreview() {
  const container = document.getElementById('live-preview-container');
  const counter = document.getElementById('preview-counter');
  
  if (!S.students || S.students.length === 0) {
    if (container) container.innerHTML = `<div style="color: var(--muted); font-family: 'IBM Plex Mono', monospace;">No student data uploaded yet.</div>`;
    if (counter) counter.textContent = "Student 0 of 0";
    return;
  }

  // 1. Safeguard the index
  if (S.previewIndex === undefined || S.previewIndex < 0) S.previewIndex = 0;
  if (S.previewIndex >= S.students.length) S.previewIndex = S.students.length - 1;

  // 2. Get the current student & correct template class
  const stu = S.students[S.previewIndex];
  const tplClass = (S.tpl || 'T01').toLowerCase();

  // 🚨 FIX: Determine if it's Landscape or Portrait so it doesn't get cut off!
  const isLandscape = (S.tpl === 'T11'); 
  const cardW = isLandscape ? '86mm' : '54mm';
  const cardH = isLandscape ? '54mm' : '86mm';

  // 3. Inject the Front and Back cards with dynamic dimensions
  if (container) {
    container.innerHTML = `
      <div class="icard ${tplClass}" style="width: ${cardW}; height: ${cardH}; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.4); flex-shrink: 0; border-radius: 6px; overflow: hidden; background: #fff;">
        ${front(S.tpl, stu)}
      </div>
      <div class="icard ${tplClass}b" style="width: ${cardW}; height: ${cardH}; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.4); flex-shrink: 0; border-radius: 6px; overflow: hidden; background: #fff;">
        ${back(S.tpl, stu)}
      </div>
    `;
  }

  // 4. Update the Counter text
  if (counter) {
    counter.textContent = `Student ${S.previewIndex + 1} of ${S.students.length}`;
  }
}

function nextPreviewStudent() {
  if (S.students && S.previewIndex < S.students.length - 1) {
    S.previewIndex++;
    renderLivePreview();
  }
}

function prevPreviewStudent() {
  if (S.students && S.previewIndex > 0) {
    S.previewIndex--;
    renderLivePreview();
  }
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
//  ORDER + PAYMENT 
// ════════════════════════════════════════════════════════════════════
function buildOrderPayload() {
  var p = pricing();
  var studentIds = Object.keys(S.selected);
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
    schoolBgUrl:      S.schoolBgUrl,
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
  
  var missing = Object.values(S.selected).filter(function (s) { return !(S.photos[String(s._id)] || s.photo); });
  if (missing.length && !confirm(missing.length + ' selected student(s) have no photo. Place the order anyway?')) return;

  btn.disabled = true; 
  btn.textContent = 'Submitting Test Order...';
  
  var payload = buildOrderPayload();

  apiPost(API_BASE_URL + '/icard/order', payload, true)
    .then(function (data) {
      if (!data || !data.success) throw new Error((data && data.message) || 'Failed to place order');
      
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

(function prefillInstitution() {
  try {
    var name = localStorage.getItem('institutionName');
    if (name) { var el = document.getElementById('instName'); if (el && !el.value) { el.value = name; S.name = name; } }
  } catch (e) {}
})();



// ════════════════════════════════════════════════════════════════════
//  CLOUD DRAFT SYNC & BOOT
// ════════════════════════════════════════════════════════════════════
var lastSavedDraftStr = "";

function syncDraftToCloud() {
  // 1. Build a microscopic, 100% safe payload manually
  var tinyState = {
    step: S.step,
    fields: S.fields,
    tpl: S.tpl,
    strapStyle: S.strapStyle,
    strapPos: S.strapPos,
    flipped: S.flipped,
    logoUrl: S.logoUrl,
    signatureUrl: S.signatureUrl,
    schoolBgUrl: S.schoolBgUrl,
    bgOpacity: S.bgOpacity,
    bgZoom: S.bgZoom,
    bgPosX: S.bgPosX,
    bgPosY: S.bgPosY,
    selectedClassId: S.selectedClassId,
    selectedIds: Object.keys(S.selected),
    photos: S.photos
  };

  var draftPayload = {
    state: tinyState,
    inputs: {
      instName: document.getElementById('instName').value || '',
      instPhone: document.getElementById('instPhone').value || '',
      instCity: document.getElementById('instCity').value || '',
      instAddr: document.getElementById('instAddr').value || ''
    }
  };

  var currentStr = JSON.stringify(draftPayload);
  if (currentStr === lastSavedDraftStr) return;

  apiPost(API_ICARD_DRAFT, { draftState: draftPayload }, true)
    .then(function(r) { if (r && r.success) lastSavedDraftStr = currentStr; })
    .catch(function(e) { console.warn("Draft skip:", e); }); 
}

// Auto-save silently every 15 seconds
setInterval(syncDraftToCloud, 15000);

// BOOT LOGIC (Check for cloud draft)
apiGet(API_ICARD_DRAFT, true).then(function(r) {
  if (r && r.success && r.data) {
    if (confirm('You have an unsaved I-Card order draft from a previous session.\n\nWould you like to resume it?')) {
      
      var saved = r.data.state || {};
      
      // 1. Safely restore basic values
      var targetStep = saved.step || 1;
      S.fields = saved.fields || ['name', 'class', 'rollno', 'dob'];
      S.tpl = saved.tpl || 'T01';
      S.strapStyle = saved.strapStyle || 'S01';
      S.strapPos = saved.strapPos || 'center';
      S.flipped = saved.flipped || null;
      S.logoUrl = saved.logoUrl || null;
      S.signatureUrl = saved.signatureUrl || null;
      S.schoolBgUrl = saved.schoolBgUrl || null;
      S.bgOpacity = saved.bgOpacity !== undefined ? saved.bgOpacity : 12;
      S.bgZoom = saved.bgZoom !== undefined ? saved.bgZoom : 200;
      S.bgPosX = saved.bgPosX !== undefined ? saved.bgPosX : 50;
      S.bgPosY = saved.bgPosY !== undefined ? saved.bgPosY : 50;
      S.selectedClassId = saved.selectedClassId || '';
      
      var selectedIdsToRestore = saved.selectedIds || [];
      lastSavedDraftStr = JSON.stringify(r.data);

      // 2. Restore Step 1 text inputs
      if (r.data.inputs) {
        if(r.data.inputs.instName) document.getElementById('instName').value = r.data.inputs.instName;
        if(r.data.inputs.instPhone) document.getElementById('instPhone').value = r.data.inputs.instPhone;
        if(r.data.inputs.instCity) document.getElementById('instCity').value = r.data.inputs.instCity;
        if(r.data.inputs.instAddr) document.getElementById('instAddr').value = r.data.inputs.instAddr;
      }

      // 3. Restore Images & Sliders
      if (S.logoUrl) { 
          document.getElementById('logoPrev').src = S.logoUrl; document.getElementById('logoPrev').style.display='block'; 
          document.getElementById('logoIcon').style.display='none'; document.getElementById('logoDel').style.display='flex'; 
      }
      if (S.signatureUrl) { 
          document.getElementById('sigPrev').src = S.signatureUrl; document.getElementById('sigPrev').style.display='block'; 
          document.getElementById('sigIcon').style.display='none'; document.getElementById('sigDel').style.display='flex'; 
      }
      if (S.schoolBgUrl) { 
          document.getElementById('schoolBgPrev').src = S.schoolBgUrl; document.getElementById('schoolBgPrev').style.display='block'; 
          document.getElementById('schoolBgIcon').style.display='none'; document.getElementById('schoolBgDel').style.display='flex'; 
          document.getElementById('bgControls').style.display='flex'; 
          
          updateBgSettings('opacity', S.bgOpacity);
          updateBgSettings('zoom', S.bgZoom);
          updateBgSettings('posY', S.bgPosY);
          updateBgSettings('posX', S.bgPosX);
      }
      
      // 4. Go to step and Re-hydrate Grid Data
      goStep(targetStep);
      
      if (targetStep >= 2 && S.selectedClassId) {
        // Add cache buster here too!
        apiGet(API_ENDPOINTS.STUDENTS + '?classId=' + encodeURIComponent(S.selectedClassId) + '&limit=9999&isActive=true&_t=' + Date.now(), true)
          .then(function (sr) {
              var list = sr.data || [];
              S.studentsByClass[S.selectedClassId] = list;
              S.students = list;
              S.selected = {};
              
              // 🚨 Safely restore photos from the draft
              S.photos = saved.photos || {}; 
              
              list.forEach(function(stu) {
                  // Failsafe: Sync DB photos with Draft photos
                  if (stu.photo && !S.photos[String(stu._id)]) {
                      S.photos[String(stu._id)] = stu.photo;
                  }
                  if (selectedIdsToRestore.includes(String(stu._id))) {
                      S.selected[String(stu._id)] = stu;
                  }
              });
              
              document.getElementById('classSelect').value = S.selectedClassId;
              renderStudents();
              if (targetStep >= 3) { renderFields(); renderGrid(); }
              if (targetStep === 5) { S.previewIndex = 0; renderLivePreview(); updateCost(); }
          });
      } else if (targetStep >= 3) {
    renderFields(); renderGrid();
}

      showToast('Draft restored from cloud ☁️', 'success');
    } else {
      apiPost(API_ICARD_DRAFT, { draftState: null }, true);
      goStep(1);
    }
  } else {
    goStep(1);
  }
}).catch(function(err) {
  console.warn("Draft corrupted. Wiping database block to self-heal.", err);
  // 🚨 EMERGENCY SELF-HEAL: If GET fails due to a corrupted 500 error string, 
  // it instantly sends a 'null' wipe command to the DB to fix your server!
  apiPost(API_ICARD_DRAFT, { draftState: null }, true);
  goStep(1);
});

function finishOrder() {
  apiPost(API_ICARD_DRAFT, { draftState: null }, true); 
  var overlay = document.getElementById('successOverlay');
  if (overlay) overlay.classList.remove('show');
  window.location.reload(); 
}

function clearPhoto(studentId) {
  if(!confirm("Are you sure you want to completely remove this student's photo?")) return;
  showToast('Deleting photo...', '');

  apiPost(API_BASE_URL + '/icard/photo/delete', { studentId: studentId }, true)
    .then(function (r) {
      if (!r || !r.success) throw new Error((r && r.message) || 'Failed to delete photo');
      
      delete S.photos[studentId];
      var s = S.students.find(function (x) { return String(x._id) === studentId; });
      if (s) s.photo = null;
      
      showToast('Photo permanently deleted', 'success');
      renderStudents(); 
    })
    .catch(function (e) {
      showToast(e.message || 'Error deleting photo', 'error');
    });
}

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


/* ══════════════════════════════════════════════════════════
   ENTERPRISE RASTER ENGINE (JPEG PROOF GENERATOR)
══════════════════════════════════════════════════════════ */
async function downloadSampleProof() {
  const btn = document.getElementById('proof-btn');
  const originalText = btn ? btn.innerHTML : 'Download Sample Proof';
  
  if(btn) {
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;"></span> Generating...';
    btn.disabled = true;
  }

  try {
    // 1. Grab the live preview cards already visible on the screen
    const screenCards = document.querySelectorAll('#live-preview-container .icard');
    if (screenCards.length === 0) {
      alert("No preview cards found to capture.");
      return;
    }

    // 2. Create a hidden off-screen container
    const offScreen = document.createElement('div');
    offScreen.style.position = 'fixed';
    offScreen.style.left = '-9999px';
    offScreen.style.top = '0';
    offScreen.style.display = 'flex';
    offScreen.style.gap = '20px';
    offScreen.style.padding = '20px';
    offScreen.style.background = '#ffffff';
    document.body.appendChild(offScreen);

    // 3. Determine Dimensions & Clone Cards
    const isLandscape = (S.tpl === 'T11');
    const cardW = isLandscape ? '86mm' : '54mm';
    const cardH = isLandscape ? '54mm' : '86mm';

    Array.from(screenCards).slice(0, 2).forEach(card => {
      const clone = card.cloneNode(true);
      clone.classList.add('proof-watermark'); 
      clone.style.width = cardW;
      clone.style.height = cardH;
      clone.style.transform = 'none'; 
      clone.style.position = 'relative';
      clone.style.margin = '0';
      offScreen.appendChild(clone);
    });

    // 4. Wait for images to attach
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Take High-Res Screenshot
    const canvas = await html2canvas(offScreen, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    // 6. Download File
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    const link = document.createElement('a');
    link.download = `HelloSchool_Unpaid_Proof.jpg`;
    link.href = imgData;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    document.body.removeChild(offScreen);

  } catch (err) {
    console.error('Raster Engine Error:', err);
    alert("Proof generation failed. Check the Console for the red error message.");
  } finally {
    if(btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  PRINT / PDF GENERATION
// ════════════════════════════════════════════════════════════════════
function printCards() {
  var selectedArr = Object.values(S.selected);
  if (selectedArr.length === 0) {
    showToast('No students selected to print.', 'error');
    return;
  }

  var id = S.tpl; 
  
  var printHtml = '<div style="text-align:center; font-family:\'DM Sans\',sans-serif; margin-bottom:10mm;">' +
                  '<h2 style="margin:0; font-size:24px; color:#111;">' + escapeHtml(S.name) + ' — ID Cards</h2>' +
                  '<p style="margin:5px 0 0; color:#555; font-size:14px;">Total Cards: ' + selectedArr.length + ' | Template: ' + id + '</p>' +
                  '</div>';
                  
  printHtml += '<div class="print-grid">';
  
  selectedArr.forEach(function(student) {
    var f = front(id, student);
    var b = back(id, student);
    
    printHtml += 
      '<div class="print-student-row">' +
        '<div class="icard ' + id.toLowerCase() + '">' + f + '</div>' +
        '<div class="icard ' + id.toLowerCase() + 'b">' + b + '</div>' +
      '</div>';
  });
  
  printHtml += '</div>';
  
  document.getElementById('printArea').innerHTML = printHtml;
  showToast('Preparing PDF...', 'success');
  
  setTimeout(function() {
    window.print();
  }, 500);
}