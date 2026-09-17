/* ─────────────────────────────────────────────────────────────
   EXAM MANAGEMENT & REPORT CARDS
   ───────────────────────────────────────────────────────────── */
var HDR_BASE = 'examAdmitHeader';
var hdrKey   = 'examAdmitHeader';
var students = [];
var selected = {};
var currentClassName = '';
var schoolLogoUrl = null;
window.currentSession = '2026-27';
var globalSetups = [];
var copySourceSetups = [];
var currentGridSetup = null;
var currentEditSetupId = null;
var cachedSubjectsForPrint = [];

(function boot(){
  var token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
  if (!token) { window.location.href = 'login.html'; return; }
  loadHeader(); loadClasses(); 
  ['sch-name','sch-addr','sch-phone','sch-email'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', saveHeader);
  });
  
  // Feature: Excel-Style Arrow Navigation Listener
  document.addEventListener('keydown', handleGridArrowKeys);
})();

function goDashboard(){ window.location.href = 'dashboard.html'; }

/* =========================================================================
   TAB AUTO-REFRESH LOGIC
   ========================================================================= */
function refreshActiveSubTab(subId) {
  const activeId = subId || (document.querySelector('.sub-content.active') ? document.querySelector('.sub-content.active').id : null);
  if (activeId === 'sub-setup' && getVal('s-class-sel')) loadExistingSetups();
  if (activeId === 'sub-marks' && getVal('m-class-sel')) onMarksClassChange();
  if (activeId === 'sub-tabulation' && getVal('tabu-class-sel')) onTabuClassChange();
  if (activeId === 'sub-print' && document.querySelectorAll('.rc-class-chk:checked').length > 0) loadReportCardOptions();
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
  if (tabId === 'tab-report') refreshActiveSubTab();
}

function switchSubTab(subId, btn) {
  document.querySelectorAll('.sub-content').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.sub-tab-btn').forEach(e => e.classList.remove('active'));
  document.getElementById(subId).classList.add('active');
  btn.classList.add('active');
  refreshActiveSubTab(subId);
}

function loadClasses() {
  apiGet(API_ENDPOINTS.CLASSES, true).then(res => {
    let htmlTab1 = '<option value="">Select a class…</option><option value="all">All Classes (Entire School)</option>';
    let htmlStandard = '<option value="">Select a class…</option>';
    let copyClassHtml = '<option value="" disabled selected hidden>1. Select a Class...</option>';
    let rcClassHtml = '';
    
    (res.data || []).filter(c => c.isActive !== false).forEach(c => {
      const className = escH(c.className || c.name);
      const opt = `<option value="${c._id}">${className}</option>`;
      htmlTab1 += opt; htmlStandard += opt; copyClassHtml += opt;
      rcClassHtml += `<label class="chk-label"><input type="checkbox" class="rc-class-chk" value="${c._id}" data-name="${escAttr(c.className || c.name)}" onchange="loadReportCardOptions()"> ${className}</label>`;
    });
    // Populate all Class dropdowns
    ['class-sel'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = htmlTab1; });
    ['s-class-sel', 'm-class-sel', 'tabu-class-sel'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = htmlStandard; });
    if(document.getElementById('copy-class-sel')) document.getElementById('copy-class-sel').innerHTML = copyClassHtml;
    if(document.getElementById('rc-class-container')) document.getElementById('rc-class-container').innerHTML = rcClassHtml;
  });
}

function rcSelectAllClasses() {
    const chks = document.querySelectorAll('.rc-class-chk');
    if(!chks.length) return;
    const allChecked = Array.from(chks).every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
    loadReportCardOptions();
}

/* =========================================================================
   TAB 1: ADMIT CARDS 
   ========================================================================= */
function loadHeader(){
  apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true).then(function(res){
    var d = (res && res.data) || {};
    var code = d.institutionCode || localStorage.getItem('institutionCode') || 'default';
    hdrKey = HDR_BASE + ':' + code;
    if (d.currentAcademicYear) {
      window.currentSession = d.currentAcademicYear;
      var sessionInput = document.getElementById('rc-session-text');
      if (sessionInput) sessionInput.value = window.currentSession;
    }
    var saved = readSaved();
    setVal('sch-name', d.name || saved.name || ''); setVal('sch-addr', d.address ? composeAddress(d.address) : (saved.addr || ''));
    var cf = d.contactsFull || {};
    var realPhone = [cf.mobile1, cf.mobile2].filter(Boolean).join(', ');
    setVal('sch-phone', saved.phone || realPhone || ''); setVal('sch-email', saved.email || cf.email || '');
    if (d.logo) { schoolLogoUrl = d.logo; showLogo(d.logo); } else if (saved.logo) { schoolLogoUrl = saved.logo; showLogo(saved.logo); } else { schoolLogoUrl = null; showLogo(null); }
    saveHeader();
  }).catch(function(){
    var saved = readSaved(); setVal('sch-name', saved.name || ''); setVal('sch-addr', saved.addr || '');
    setVal('sch-phone', saved.phone || ''); setVal('sch-email', saved.email || '');
    if (saved.logo) { schoolLogoUrl = saved.logo; showLogo(saved.logo); }
  });
}
function readSaved(){ try { return JSON.parse(localStorage.getItem(hdrKey) || '{}'); } catch(e){ return {}; } }
function composeAddress(a){ if (!a) return ''; if (typeof a === 'string') return a; if (a.fullAddress) return a.fullAddress; return [a.city, a.district, a.state].filter(Boolean).join(', '); }
function saveHeader(){ try { localStorage.setItem(hdrKey, JSON.stringify({ name:getVal('sch-name'), addr:getVal('sch-addr'), phone:getVal('sch-phone'), email:getVal('sch-email'), logo:schoolLogoUrl || null })); } catch(e){} }
function showLogo(url){ var img = document.getElementById('logo-prev'), ph = document.getElementById('logo-ph'); if (url){ img.src = url; img.style.display='block'; ph.style.display='none'; } else { img.style.display='none'; ph.style.display='flex'; } }
function onLogoPick(e){ var file = e.target.files && e.target.files[0]; if (!file) return; if (file.size > 3*1024*1024){ return toast('Logo too large (max 3MB)','err'); } var reader = new FileReader(); reader.onload = function(){ schoolLogoUrl = reader.result; showLogo(reader.result); saveHeader(); toast('Logo saved', 'success'); }; reader.readAsDataURL(file); }
function loadStudents(){
  var sel = document.getElementById('class-sel'); var cid = sel.value; if (!cid){ return toast('Pick a class first','err'); }
  var btn = document.getElementById('load-btn'); btn.disabled = true; btn.textContent = 'Loading…'; currentClassName = sel.options[sel.selectedIndex].text;
  var url = API_ENDPOINTS.STUDENTS + '?limit=9999&_t=' + new Date().getTime(); if (cid !== 'all') url += '&classId=' + encodeURIComponent(cid);
  apiGet(url, true).then(function(r){
      students = (r && r.data) || [];
      students.sort((a, b) => { var nA = (a.name || '').toLowerCase(), nB = (b.name || '').toLowerCase(); if (nA < nB) return -1; if (nA > nB) return 1; return 0; });
      selected = {}; renderStudents(); document.getElementById('stu-panel').style.display = 'block';
      if (!students.length) toast('No students found','err'); else toast(`Loaded ${students.length} students!`, 'success');
  }).catch(() => toast('Failed to load students','err')).finally(() => { btn.disabled = false; btn.textContent = 'Load Students'; });
}
function renderStudents(){
  var grid = document.getElementById('stu-grid');
  if (!students.length){ grid.innerHTML = '<div class="empty">No students to show.</div>'; updateCount(); return; }
  grid.innerHTML = students.map(s => {
    var photo = s.photo ? `<img class="stu-photo" loading="lazy" src="${escAttr(s.photo)}">` : `<div class="stu-photo-ph">👤</div>`;
    return `<div class="stu-card" data-id="${escAttr(s._id)}" onclick="toggleStu(this)">${photo}<div class="stu-meta"><div class="stu-name">${escH(s.name||'—')}</div><div class="stu-sub">${escH(s.fatherName||'')}</div></div><div class="stu-chk">✓</div></div>`;
  }).join(''); updateCount();
}
function toggleStu(el){ var id = el.getAttribute('data-id'); if (selected[id]){ delete selected[id]; el.classList.remove('on'); } else { selected[id]=true; el.classList.add('on'); } updateCount(); }
function selectAll(on){ document.querySelectorAll('.stu-card').forEach(el => { var id = el.getAttribute('data-id'); if (on){ selected[id]=true; el.classList.add('on'); } else { delete selected[id]; el.classList.remove('on'); } }); updateCount(); }
function updateCount(){ var n = Object.keys(selected).length; document.getElementById('sel-count').textContent = n + ' selected'; document.getElementById('gen-btn').disabled = n === 0; }
function selectedStudents(){ return students.filter(s => selected[s._id]); }
function onGenerate(){ var list = selectedStudents(); if (!list.length) return toast('Select at least one student','err'); saveHeader(); var urls = []; if (schoolLogoUrl) urls.push(schoolLogoUrl); list.forEach(s => { if (s.photo) urls.push(s.photo); }); preloadImages(urls.filter((item, pos) => urls.indexOf(item) === pos), () => buildAndPrint(list)); }
function preloadImages(urls, done){ if (!urls.length) return done(); var total = urls.length, loaded = 0, index = 0; function loadNext() { if (index >= total) return; var u = urls[index++]; var img = new Image(); img.onload = img.onerror = function() { loaded++; if (loaded >= total) done(); else loadNext(); }; img.src = u; } for (var i = 0; i < Math.min(15, total); i++) loadNext(); }
function buildAndPrint(list){
  var hdr = { name: getVal('sch-name'), addr: getVal('sch-addr'), phone: getVal('sch-phone'), email: getVal('sch-email'), logo: schoolLogoUrl };
  var cards = list.map(s => {
    var photo = s.photo ? `<img class="ac-photo" src="${escAttr(s.photo)}">` : `<div class="ac-photo ac-photo-ph">Photo</div>`;
    var logo = hdr.logo ? `<img class="ac-logo" src="${escAttr(hdr.logo)}">` : '';
    return `<div class="ac"><div class="ac-head">${logo}<div class="ac-school"><div class="ac-name">${escH(hdr.name)}</div><div class="ac-addr">${escH(hdr.addr)}</div></div></div><div class="ac-title">Examination Admit Card</div><div class="ac-body"><div class="ac-fields"><div class="ac-row"><span class="ac-lbl">Name :-</span><span class="ac-val">${escH(s.name)}</span></div><div class="ac-row"><span class="ac-lbl">Father Name :-</span><span class="ac-val">${escH(s.fatherName)}</span></div><div class="ac-row"><span class="ac-lbl">Class :-</span><span class="ac-val">${escH(s.classId?.className || '')}</span></div><div class="ac-row"><span class="ac-lbl">Roll No. :-</span><span class="ac-val">${escH(s.rollNo)}</span></div></div><div class="ac-photo-wrap">${photo}</div></div><div class="ac-foot"><div class="ac-date">Date: ______________</div><div class="ac-sig">Signature / Principal</div></div></div>`;
  }).join('');
  var old = document.getElementById('admit-print-frame'); if (old && old.parentNode) old.parentNode.removeChild(old);
  var iframe = document.createElement('iframe'); iframe.id = 'admit-print-frame'; iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'; document.body.appendChild(iframe);
  var doc = iframe.contentWindow.document; doc.open(); doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:0;} *{box-sizing:border-box;margin:0;padding:0;} body{font-family:Georgia,serif;color:#111;} .ac{width:210mm;height:148.5mm;padding:11mm 12mm 9mm;position:relative;border-bottom:1px dashed #999;} .ac:nth-child(even){border-bottom:none;} .ac-head{display:flex;align-items:center;gap:12px;} .ac-logo{width:58px;height:58px;object-fit:contain;} .ac-school{flex:1;} .ac-name{font-size:20px;font-weight:700;} .ac-addr{font-size:11px;color:#333;margin-top:2px;} .ac-title{text-align:center;font-size:15px;font-weight:700;text-decoration:underline;margin:9mm 0 7mm;} .ac-body{display:flex;gap:14px;} .ac-fields{flex:1;} .ac-row{display:flex;align-items:flex-end;margin-bottom:6.5mm;font-size:13.5px;} .ac-lbl{font-weight:700;margin-right:8px;} .ac-val{border-bottom:1px solid #333;flex:1;min-width:120px;} .ac-photo-wrap{width:35mm;display:flex;justify-content:flex-end;} .ac-photo{width:33mm;height:40mm;object-fit:cover;border:1px solid #333;} .ac-photo-ph{display:flex;align-items:center;justify-content:center;font-size:11px;color:#888;} .ac-foot{position:absolute;left:12mm;right:12mm;bottom:9mm;display:flex;justify-content:space-between;align-items:flex-end;} .ac-date{font-size:14px;font-weight:700;} .ac-sig{width:160px;border-top:1px solid #111;padding-top:5px;font-size:14px;font-weight:700;text-align:center;}</style></head><body>'+cards+'</body></html>'); doc.close();
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 1500);
}

/* =========================================================================
   TAB 2: EXAM SETUP (WITH BULK COPY ALL FEATURE)
   ========================================================================= */
function addSetupColumn(name = '', max = '') {
  const container = document.getElementById('s-cols-container'); const div = document.createElement('div'); div.className = 'grid2 setup-col-row'; div.style.marginBottom = '10px';
  div.innerHTML = `<input type="text" class="c-name" placeholder="Assessment Name (e.g., PT1)" value="${escAttr(name)}">
    <div style="display:flex; gap:10px;"><input type="number" class="c-max" placeholder="Max Marks" style="width:60%" value="${max}"><button class="btn-ghost" style="width:40%; padding:0; color:var(--danger); border-color:rgba(239,68,68,0.5);" onclick="this.parentElement.parentElement.remove();">✕</button></div>`;
  container.appendChild(div);
}

function loadCopySetups() {
  const classId = getVal('copy-class-sel');
  const termSel = document.getElementById('copy-term-sel');
  if(!classId) { termSel.innerHTML = '<option value="" disabled selected hidden>2. Select a Term to Copy...</option>'; return; }
  
  termSel.innerHTML = '<option value="" disabled selected hidden>Loading terms...</option>';
  apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => {
      copySourceSetups = res.data || [];
      if(!copySourceSetups.length) {
          termSel.innerHTML = '<option value="" disabled selected hidden>No terms found in this class</option>';
      } else {
          let html = '<option value="" disabled selected hidden>2. Select a Term to Copy...</option>';
          if(copySourceSetups.length > 1) { html += `<option value="ALL" style="font-weight:bold; color:#14b8a6;">⚡ Copy ALL Terms to Target Class</option>`; }
          copySourceSetups.forEach(s => { html += `<option value="${s._id}">${escH(s.termName)}</option>`; });
          termSel.innerHTML = html;
      }
  }).catch(() => { termSel.innerHTML = '<option value="" disabled selected hidden>Error loading</option>'; });
}

function applyCopySetup() {
  const setupId = getVal('copy-term-sel');
  if(!setupId) return;

  const targetClassId = getVal('s-class-sel');
  if(!targetClassId) {
      toast('Please select a Target Class at the top first!', 'err');
      document.getElementById('copy-term-sel').value = '';
      return;
  }

  if (setupId === 'ALL') {
      if(!confirm('This will instantly duplicate ALL terms from the source class into your target class. Proceed?')) {
          document.getElementById('copy-term-sel').value = '';
          return;
      }
      
      const btn = document.getElementById('btn-save-setup');
      const origText = btn.textContent;
      btn.textContent = 'Copying All Terms...';
      btn.disabled = true;

      const promises = copySourceSetups.map(s => {
          return apiPost(API_ENDPOINTS.EXAM_SETUP, { session: window.currentSession, classId: targetClassId, termName: s.termName, assessments: s.assessments }, true);
      });

      Promise.all(promises).then(() => {
          toast('All Terms Copied Successfully!', 'success');
          loadExistingSetups();
          resetSetupForm();
          document.getElementById('copy-term-sel').value = '';
      }).catch(e => {
          toast('Error copying some terms. Check if they already exist.', 'err');
      }).finally(() => {
          btn.textContent = origText;
          btn.disabled = false;
      });
      return;
  }

  const setup = copySourceSetups.find(s => s._id === setupId);
  if(!setup) return;
  setVal('s-term-name', setup.termName);
  const container = document.getElementById('s-cols-container');
  container.innerHTML = '<label style="color:var(--gold); margin-bottom:10px;">Assessments for this Term</label>';
  setup.assessments.forEach(a => addSetupColumn(a.name, a.maxMarks));
  document.getElementById('copy-term-sel').value = ''; 
  toast('Structure & Name Copied! Click Save.', 'success');
}

function saveExamSetup() {
  const classId = getVal('s-class-sel'), termName = getVal('s-term-name');
  if (!classId || !termName) return toast('Class and Term Name are required', 'err');
  const rows = document.querySelectorAll('.setup-col-row'); const assessments = [];
  rows.forEach(r => { const name = r.querySelector('.c-name').value.trim(); const max = Number(r.querySelector('.c-max').value); if (name && max > 0) assessments.push({ name, maxMarks: max }); });
  if (!assessments.length) return toast('Add at least one valid assessment column with Max Marks', 'err');
  const btn = document.getElementById('btn-save-setup'); btn.disabled = true; btn.textContent = 'Saving...';
  if (currentEditSetupId) {
    apiPut(`${API_ENDPOINTS.EXAM_SETUP_ACTION}/${currentEditSetupId}`, { termName, assessments }, true).then(res => { toast('Updated successfully!', 'success'); resetSetupForm(); loadExistingSetups(); }).catch(e => toast(e.message || 'Failed to update', 'err')).finally(() => { btn.disabled = false; btn.textContent = '💾 Save Structure'; });
  } else {
    apiPost(API_ENDPOINTS.EXAM_SETUP, { session: window.currentSession, classId, termName, assessments }, true).then(res => { toast('Created successfully!', 'success'); resetSetupForm(); loadExistingSetups(); }).catch(e => toast(e.message || 'Failed to create', 'err')).finally(() => { btn.disabled = false; btn.textContent = '💾 Save Structure'; });
  }
}

function resetSetupForm() {
  currentEditSetupId = null; setVal('s-term-name', ''); document.getElementById('s-cols-container').innerHTML = '<label style="color:var(--gold); margin-bottom:10px;">Assessments for this Term</label>'; document.getElementById('btn-save-setup').textContent = '💾 Save Structure';
}

function loadExistingSetups() {
  const classId = getVal('s-class-sel');
  if(!classId) {
    document.getElementById('existing-setups-card').style.display = 'none';
    return;
  }
  apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => {
    const list = document.getElementById('s-list'); 
    globalSetups = res.data || [];
    if (!globalSetups.length) {
      list.innerHTML = '<div style="color:var(--muted); padding:10px 0;">No structures created yet.</div>';
    } else {
      list.innerHTML = globalSetups.map(s => {
        return `<div style="padding:14px; background:rgba(255,255,255,0.02); margin-bottom:12px; border-radius:8px; border:1px solid var(--rim); display:flex; justify-content:space-between; align-items:center;"><div><strong style="color:var(--gold); font-size:15px;">${escH(s.termName)}</strong><br><span style="color:var(--silver); font-size:13px; margin-top:4px; display:block;">${s.assessments.map(a => `${escH(a.name)} (${a.maxMarks})`).join(' &nbsp;|&nbsp; ')}</span></div><div style="display:flex; gap:10px;"><button class="btn-ghost" style="padding:6px 12px; font-size:12px; border-color:var(--gold); color:var(--gold);" onclick="editSetup('${s._id}')">Edit</button><button class="btn-ghost" style="padding:6px 12px; font-size:12px; border-color:rgba(239,68,68,0.5); color:var(--danger);" onclick="deleteSetup('${s._id}')">Delete</button></div></div>`;
      }).join('');
    }
    document.getElementById('existing-setups-card').style.display = 'block';
  });
}

function editSetup(id) {
  const setup = globalSetups.find(s => s._id === id); if(!setup) return; currentEditSetupId = id; setVal('s-term-name', setup.termName);
  document.getElementById('s-cols-container').innerHTML = '<label style="color:var(--gold); margin-bottom:10px;">Assessments for this Term</label>';
  setup.assessments.forEach(a => addSetupColumn(a.name, a.maxMarks)); document.getElementById('btn-save-setup').textContent = '💾 Update Structure'; window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteSetup(id) {
  if(!confirm('🚨 WARNING: Are you sure? This will delete the structure and ALL marks entered under it. This cannot be undone.')) return;
  apiDelete(`${API_ENDPOINTS.EXAM_SETUP_ACTION}/${id}`, true).then(res => { toast('Deleted successfully', 'success'); resetSetupForm(); loadExistingSetups(); }).catch(e => toast(e.message || 'Failed to delete', 'err'));
}

/* =========================================================================
   TAB 3: MARKS UPLOAD, EXCEL & CLOUD SYNC
   ========================================================================= */

function onMarksClassChange() {
  populateSetupsDropdown('m-class-sel', 'm-setup-sel');
  loadClassSubjectsForEntry();
}

function populateSetupsDropdown(classSelId, setupSelId) {
  const classId = getVal(classSelId); const sel = document.getElementById(setupSelId);
  if(!classId) { if(sel) sel.innerHTML = '<option value="">Select Class First...</option>'; return; }
  if(sel) sel.innerHTML = '<option value="">Loading...</option>';
  apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => {
    let html = '<option value="">Select Exam Term...</option>';
    (res.data || []).forEach(s => { html += `<option value="${s._id}">${escH(s.termName)}</option>`; });
    if(sel) sel.innerHTML = html;
  });
}

function loadClassSubjectsForEntry() {
  const classId = getVal('m-class-sel'); const sel = document.getElementById('m-subject-sel');
  if(!classId) { if(sel) sel.innerHTML = '<option value="">Select Class First...</option>'; return; }
  if(sel) sel.innerHTML = '<option value="">Loading...</option>';
  const apiUrl = API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${classId}`;
  apiGet(apiUrl, true).then(res => {
    const subjects = res.data || [];
    if (!subjects.length) { if(sel) sel.innerHTML = '<option value="">No subjects mapped to this class</option>'; } 
    else { let html = '<option value="">Select Subject...</option>'; subjects.forEach(s => { html += `<option value="${s._id}">${escH(s.subjectName)}</option>`; }); if(sel) sel.innerHTML = html; }
  }).catch(e => { if(sel) sel.innerHTML = '<option value="">Error loading subjects</option>'; });
}

function loadMarksGrid() {
  const classId = getVal('m-class-sel'), subjectId = getVal('m-subject-sel'), examSetupId = getVal('m-setup-sel');
  if (!classId || !subjectId || !examSetupId) return toast('Select Class, Subject, and Term', 'err');
  const btn = document.getElementById('btn-load-grid'); const originalText = btn?.textContent || 'Load Grid';
  if(btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  apiGet(`${API_ENDPOINTS.MARKS_GRID}?session=${window.currentSession}&classId=${classId}&subjectId=${subjectId}&examSetupId=${examSetupId}`, true)
  .then(res => { currentGridSetup = res.setup; renderDynamicGrid(res.data, res.setup); document.getElementById('marks-grid-panel').style.display = 'block'; })
  .catch(e => toast(e.message || 'Failed to load grid', 'err')).finally(() => { if(btn) { btn.disabled = false; btn.textContent = originalText; } });
}

function renderDynamicGrid(students, setup) {
  const thead = document.getElementById('marks-thead'), tbody = document.getElementById('marks-tbody');
  let totalMax = 0; let thHtml = '<tr><th style="width:15%;">Roll No</th><th style="width:40%;">Student Name</th>';
  setup.assessments.forEach(a => { thHtml += `<th style="text-align:center;">${escH(a.name)}<br><small style="color:var(--silver);font-weight:400;">(Max: ${a.maxMarks})</small></th>`; totalMax += a.maxMarks; });
  thHtml += '</tr>'; if(thead) thead.innerHTML = thHtml;
  const maxLabel = document.getElementById('m-max-label'); if (maxLabel) maxLabel.textContent = `Total Max Marks: ${totalMax}`;
  if (!students || !students.length) { if(tbody) tbody.innerHTML = `<tr><td colspan="${setup.assessments.length + 2}" class="empty" style="padding: 30px; text-align: center;">No students found in this class.</td></tr>`; return; }
  if(tbody) tbody.innerHTML = students.map(s => {
    let tr = `<tr class="m-row" data-sid="${s.studentId}"><td style="font-family:'IBM Plex Mono',monospace;">${escH(s.rollNo)}</td><td style="font-weight:600;">${escH(s.name)}</td>`;
    setup.assessments.forEach(a => {
      const markData = s.marks[a.name] || { status: 'present', obtained: '' };
      const val = markData.status === 'present' ? (markData.obtained ?? '') : markData.status.toUpperCase();
      tr += `<td style="text-align:center;"><input type="text" class="m-input dyn-mark" data-name="${escAttr(a.name)}" data-max="${a.maxMarks}" value="${val}" placeholder="0-${a.maxMarks} / AB / M" onblur="validateMark(this)" oninput="validateMark(this); triggerAutoSave();"></td>`;
    });
    tr += '</tr>'; return tr;
  }).join('');
  document.querySelectorAll('.dyn-mark').forEach(el => validateMark(el));
}

function handleGridArrowKeys(e) {
    if (!e.target.classList.contains('dyn-mark')) return;
    const td = e.target.closest('td'); const tr = e.target.closest('tr'); const tbody = tr.parentElement;
    const colIndex = Array.from(tr.children).indexOf(td); const rowIndex = Array.from(tbody.children).indexOf(tr);
    let nextInput = null;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (tr.children[colIndex + 1]) nextInput = tr.children[colIndex + 1].querySelector('.dyn-mark'); } 
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (tr.children[colIndex - 1]) nextInput = tr.children[colIndex - 1].querySelector('.dyn-mark'); } 
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (tbody.children[rowIndex + 1]) nextInput = tbody.children[rowIndex + 1].children[colIndex].querySelector('.dyn-mark'); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (tbody.children[rowIndex - 1]) nextInput = tbody.children[rowIndex - 1].children[colIndex].querySelector('.dyn-mark'); }
    if (nextInput) { nextInput.focus(); nextInput.select(); }
}

function validateMark(el) {
  const val = el.value.trim().toUpperCase(), max = Number(el.getAttribute('data-max'));
  el.classList.remove('fail', 'err');
  if (val === '' || val === 'AB' || val === 'ABSENT' || val === 'M' || val === 'MEDICAL') { return; }
  const num = Number(val); 
  if (isNaN(num) || num < 0 || num > max) { el.classList.add('err'); } 
  else if (num < (max * 0.33)) { el.classList.add('fail'); }
}

let autoSaveTimeout = null;
function triggerAutoSave() {
    const status = document.getElementById('auto-save-text');
    if(status) { status.textContent = '⏳ Syncing...'; status.style.color = 'var(--gold)'; }
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => { silentSaveMarks(); }, 2500); 
}

function silentSaveMarks() {
    if (!currentGridSetup) return;
    const rows = document.querySelectorAll('.m-row'); if (!rows.length) return;
    let hasFatalError = false;
    const marksData = Array.from(rows).map(r => {
      const studentId = r.getAttribute('data-sid'); const marksObj = {};
      r.querySelectorAll('.dyn-mark').forEach(inp => {
        if (inp.classList.contains('err')) hasFatalError = true;
        const name = inp.getAttribute('data-name'), val = inp.value.trim().toUpperCase();
        if (val === 'AB' || val === 'ABSENT') marksObj[name] = { status: 'absent', obtained: null };
        else if (val === 'M' || val === 'MEDICAL') marksObj[name] = { status: 'medical', obtained: null };
        else { const numVal = val === '' ? null : Number(val); marksObj[name] = { status: 'present', obtained: numVal }; }
      }); return { studentId, marks: marksObj };
    });
    if (hasFatalError) {
        const status = document.getElementById('auto-save-text');
        if(status) { status.textContent = '⚠️ Fix red boxes to sync'; status.style.color = 'var(--danger)'; }
        return;
    }
    apiPost(API_ENDPOINTS.MARKS_BULK, { session: window.currentSession, classId: getVal('m-class-sel'), subjectId: getVal('m-subject-sel'), examSetupId: getVal('m-setup-sel'), marksData }, true)
      .then(() => { const status = document.getElementById('auto-save-text'); if(status) { status.textContent = '☁️ Cloud Sync Active'; status.style.color = 'var(--silver)'; } })
      .catch(() => { const status = document.getElementById('auto-save-text'); if(status) { status.textContent = '⚠️ Sync failed'; status.style.color = 'var(--danger)'; } });
}

function saveMarksGrid() {
  const btn = document.getElementById('btn-save-marks'); const originalText = btn.textContent; 
  btn.disabled = true; btn.textContent = 'Saving...';
  silentSaveMarks();
  setTimeout(() => { toast('Marks saved to cloud manually', 'success'); btn.disabled = false; btn.textContent = originalText; }, 800);
}

function showAnalytics() {
    if (!currentGridSetup) return toast('Load a grid first', 'err');
    const rows = document.querySelectorAll('.m-row'); if (!rows.length) return toast('No students to analyze', 'err');
    let totalMax = currentGridSetup.assessments.reduce((sum, a) => sum + a.maxMarks, 0);
    if (totalMax === 0) return toast('Max marks is 0', 'err');
    let studentsData = []; let classTotalObtained = 0; let validStudentCount = 0;
    rows.forEach(r => {
        const name = r.cells[1].textContent; let stuTotal = 0; let hasValidMark = false;
        r.querySelectorAll('.dyn-mark').forEach(inp => {
            const val = inp.value.trim().toUpperCase();
            if (val !== '' && val !== 'AB' && val !== 'ABSENT' && val !== 'M' && val !== 'MEDICAL') {
                const num = Number(val); if (!isNaN(num) && num >= 0) { stuTotal += num; hasValidMark = true; }
            }
        });
        if (hasValidMark) { let perc = (stuTotal / totalMax) * 100; studentsData.push({ name, total: stuTotal, perc: perc }); classTotalObtained += stuTotal; validStudentCount++; }
    });
    if (studentsData.length === 0) return toast('No valid marks entered yet', 'err');
    studentsData.sort((a, b) => b.total - a.total);
    const top3 = studentsData.slice(0, 3);
    let top3Html = top3.map((s, i) => {
        let rankClass = i === 0 ? 'rank-1' : (i === 1 ? 'rank-2' : 'rank-3'); let medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉');
        return `<div class="rank-row"><span class="${rankClass}">${medal} ${escH(s.name)}</span><span style="color:var(--silver); font-size:13px;">${s.total} / ${totalMax} (${s.perc.toFixed(1)}%)</span></div>`;
    }).join('');
    let classAveragePerc = ((classTotalObtained / (validStudentCount * totalMax)) * 100).toFixed(1);
    let failingStudents = studentsData.filter(s => s.perc < 33);
    let failHtml = failingStudents.length > 0 ? failingStudents.map(s => `<div class="rank-row" style="color:var(--danger); border-color:rgba(239,68,68,0.2);"><span>⚠️ ${escH(s.name)}</span><span>${s.perc.toFixed(1)}%</span></div>`).join('') : `<div style="color:var(--success); font-size:14px; text-align:center; padding: 20px 0;">🎉 All students are passing!</div>`;
    document.getElementById('analytics-body').innerHTML = `
        <div class="stat-card"><h4>🏆 Top 3 Rankers</h4>${top3Html || '<div style="font-size:13px; color:var(--silver);">Not enough data</div>'}</div>
        <div class="grid2">
            <div class="stat-card" style="display:flex; flex-direction:column; justify-content:center; align-items:center;"><h4>📈 Class Average</h4><div style="font-size:36px; font-weight:bold; color:${classAveragePerc >= 33 ? 'var(--success)' : 'var(--danger)'};">${classAveragePerc}%</div><div style="font-size:12px; color:var(--silver); margin-top:4px;">Based on ${validStudentCount} entries</div></div>
            <div class="stat-card"><h4>🚨 Needs Attention (< 33%)</h4><div style="max-height: 120px; overflow-y: auto; padding-right: 5px;">${failHtml}</div></div>
        </div>`;
    document.getElementById('analytics-modal').style.display = 'flex';
}
function closeAnalytics() { document.getElementById('analytics-modal').style.display = 'none'; }

function downloadExcelTemplate() {
  if (!currentGridSetup) return toast('Load the grid first to generate template', 'err');
  const rows = document.querySelectorAll('.m-row'); if(!rows.length) return toast('No students to download.', 'err');
  const data = Array.from(rows).map(r => {
    const obj = { "Student ID (DO NOT EDIT)": r.getAttribute('data-sid'), "Roll No": r.cells[0].textContent, "Student Name": r.cells[1].textContent };
    r.querySelectorAll('.dyn-mark').forEach(inp => { obj[`${inp.getAttribute('data-name')} (Max: ${inp.getAttribute('data-max')})`] = inp.value; }); return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Marks Entry");
  const cSelect = document.getElementById('m-class-sel'), sSelect = document.getElementById('m-subject-sel');
  XLSX.writeFile(wb, `${cSelect.options[cSelect.selectedIndex].text}_${sSelect.options[sSelect.selectedIndex].text}_${currentGridSetup.termName}.xlsx`);
}

function handleExcelUpload(event) {
  if (!currentGridSetup) { event.target.value = ""; return toast('Load the grid first.', 'err'); }
  const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result), wb = XLSX.read(data, {type: 'array'});
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let matchCount = 0;
      json.forEach(row => {
        const sid = row["Student ID (DO NOT EDIT)"]; if (!sid) return;
        const tr = document.querySelector(`.m-row[data-sid="${sid}"]`);
        if (tr) {
          tr.querySelectorAll('.dyn-mark').forEach(inp => {
            const key = `${inp.getAttribute('data-name')} (Max: ${inp.getAttribute('data-max')})`;
            if (row[key] !== undefined) { inp.value = row[key]; validateMark(inp); }
          }); matchCount++;
        }
      }); 
      toast(`Mapped ${matchCount} students from Excel.`, 'success');
      triggerAutoSave(); 
    } catch(err) { toast('Error reading Excel file.', 'err'); }
    event.target.value = "";
  }; reader.readAsArrayBuffer(file);
}

/* =========================================================================
   TABULATION REGISTER (NEW - Smart Multi-Term Support & Accurate Averages)
   ========================================================================= */

function onTabuClassChange() {
  const classId = getVal('tabu-class-sel');
  const container = document.getElementById('tabu-terms-container');
  
  if (!classId) {
    container.innerHTML = '<span style="color:var(--muted)">Select a class first.</span>';
    return;
  }
  
  container.innerHTML = '<span style="color:var(--muted)">Loading terms...</span>';

  apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => {
    const setups = res.data || [];
    if (!setups.length) {
      container.innerHTML = '<span style="color:var(--muted)">No terms found. Create Exam Setup first.</span>';
    } else {
      container.innerHTML = setups.map(s => `<label class="chk-label"><input type="checkbox" class="tabu-term-chk" value="${s._id}" checked> ${escH(s.termName)}</label>`).join('');
    }
  });
}

var currentTabuData = null; 
var currentTabuSubjs = [];

function loadTabulation() {
  const classId = getVal('tabu-class-sel');
  const termChks = document.querySelectorAll('.tabu-term-chk:checked');
  if (!classId) return toast('Select Class', 'err');
  if (termChks.length === 0) return toast('Select at least one Term', 'err');
  
  const selectedTermIds = Array.from(termChks).map(c => c.value);
  const btn = document.getElementById('btn-load-tabu');
  btn.disabled = true; btn.textContent = 'Loading...';

  const subjUrl = API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${classId}`;

  Promise.all([
    apiGet(`${API_ENDPOINTS.REPORT_CARDS}?session=${window.currentSession}&classId=${classId}`, true),
    apiGet(subjUrl, true)
  ]).then(results => {
    const res = results[0];
    const subjRes = results[1];
    
    const activeSubjectNames = (subjRes.data || []).map(s => s.subjectName);

    const setups = res.setups.filter(s => selectedTermIds.includes(s._id));
    if (!setups.length) return toast('Setup not found', 'err');
    
    const termMax = setups.reduce((sum, setup) => sum + setup.assessments.reduce((s, a) => s + a.maxMarks, 0), 0);
    const studentsData = res.data || [];
    
    let subjectsSet = new Set();
    studentsData.forEach(item => {
       Object.keys(item.subjects).forEach(sub => {
           if (activeSubjectNames.includes(sub)) {
               subjectsSet.add(sub);
           }
       });
    });
    const subjects = Array.from(subjectsSet).sort();
    currentTabuSubjs = subjects;
    
    let processed = studentsData.map(item => {
       const stu = item.student;
       let grandTotal = 0;
       let subTotals = {};
       let failCount = 0;
       let anyMissing = false; 

       subjects.forEach(sub => {
          let sTotal = 0;
          let termVals = {};
          let hasAnyMarks = false;

          setups.forEach(setup => {
              const termData = item.subjects[sub]?.[setup._id];
              let tTotal = 0;
              let tHasMarks = false;

              if (termData) {
                  setup.assessments.forEach(a => {
                      const m = termData[a.name];
                      if (m && m.status === 'present' && m.obtained !== null && m.obtained !== '') {
                          tTotal += Number(m.obtained);
                          tHasMarks = true;
                          hasAnyMarks = true;
                      }
                  });
              }
              
              termVals[setup._id] = tHasMarks ? tTotal : 'AB';
              sTotal += tTotal;
          });
          
          if (sTotal < (termMax * 0.33)) failCount++;
          if (!hasAnyMarks) anyMissing = true;
          
          subTotals[sub] = { 
              terms: termVals, 
              val: hasAnyMarks ? sTotal : 'AB', 
              missing: !hasAnyMarks, 
              fail: (hasAnyMarks && sTotal < (termMax * 0.33)) 
          };
          
          grandTotal += sTotal;
       });
       
       const maxPossible = termMax * subjects.length;
       const perc = maxPossible > 0 ? ((grandTotal / maxPossible) * 100) : 0;
       
       return {
           id: stu._id, rollNo: stu.rollNo, name: stu.name, subTotals, grandTotal, perc, failCount, maxPossible, anyMissing
       };
    });
    
    processed.sort((a, b) => b.grandTotal - a.grandTotal);
    let currentRank = 1;
    processed.forEach((p, i) => {
        if (i > 0 && p.grandTotal < processed[i-1].grandTotal) currentRank = i + 1;
        p.rank = currentRank; 
    });
    
    processed.sort((a, b) => {
       const ra = parseInt(a.rollNo) || 9999; const rb = parseInt(b.rollNo) || 9999;
       if (ra !== rb) return ra - rb;
       return a.name.localeCompare(b.name);
    });
    
    currentTabuData = { setups, students: processed, termMax, selectedTermNames: setups.map(s => s.termName).join(' + ') };
    renderTabulationGrid();
    
  }).catch(e => toast(e.message || 'Failed to load tabulation', 'err'))
    .finally(() => { btn.disabled = false; btn.textContent = 'Load Tabulation'; });
}

function renderTabulationGrid() {
   const panel = document.getElementById('tabu-grid-panel');
   const { setups, students, termMax } = currentTabuData;
   
   let html = `<table class="marks-table tabu-table"><thead>`;
   
   if (setups.length > 1) {
       let ths1 = `<tr><th rowspan="2" style="width:50px; vertical-align:middle;">Roll</th><th rowspan="2" style="min-width:180px; text-align:left; vertical-align:middle;">Student Name</th>`;
       let ths2 = `<tr>`;

       currentTabuSubjs.forEach(sub => { 
           ths1 += `<th colspan="${setups.length + 1}" style="color:var(--gold); border-bottom: 1px solid var(--rim);">${escH(sub)}</th>`; 
           setups.forEach(setup => {
               const tMax = setup.assessments.reduce((s, a) => s + a.maxMarks, 0);
               ths2 += `<th>${escH(setup.termName.substring(0, 8))}..<br><small style="color:var(--silver);font-weight:400;">(${tMax})</small></th>`;
           });
           ths2 += `<th style="color:var(--gold);">Subj Total<br><small style="color:var(--silver);font-weight:400;">(${termMax})</small></th>`;
       });

       ths1 += `<th rowspan="2" style="vertical-align:middle; color:var(--gold);">Grand Total<br><small style="color:var(--silver);font-weight:400;">(${termMax * currentTabuSubjs.length})</small></th><th rowspan="2" style="vertical-align:middle; color:var(--gold);">%</th><th rowspan="2" style="vertical-align:middle; color:var(--gold);">Grade</th><th rowspan="2" style="vertical-align:middle; color:var(--gold);">Rank</th></tr>`;
       ths2 += `</tr>`;
       html += ths1 + ths2 + `</thead><tbody>`;
   } else {
       let ths = `<tr><th style="width:50px">Roll</th><th style="min-width:180px; text-align:left;">Student Name</th>`;
       currentTabuSubjs.forEach(sub => { ths += `<th>${escH(sub)}<br><small style="color:var(--silver);font-weight:400;">(${termMax})</small></th>`; });
       ths += `<th style="color:var(--gold);">Grand Total<br><small style="color:var(--silver);font-weight:400;">(${termMax * currentTabuSubjs.length})</small></th><th style="color:var(--gold);">%</th><th style="color:var(--gold);">Grade</th><th style="color:var(--gold);">Rank</th></tr>`;
       html += ths + `</thead><tbody>`;
   }
   
   let subjSums = {}; let subjCounts = {};
   currentTabuSubjs.forEach(s => { subjSums[s] = 0; subjCounts[s] = 0; });
   let totalClassPerc = 0; let totalRankedStus = 0;

   if (!students.length) {
       const cols = setups.length > 1 ? (currentTabuSubjs.length * (setups.length + 1) + 6) : (currentTabuSubjs.length + 6);
       html += `<tr><td colspan="${cols}" style="text-align:center; padding:20px; color:var(--muted)">No data found.</td></tr>`;
   }

   students.forEach(s => {
      let tds = `<td style="font-family:monospace">${escH(s.rollNo || '-')}</td><td style="text-align:left; font-weight:600;">${escH(s.name)}</td>`;
      currentTabuSubjs.forEach(sub => {
          const st = s.subTotals[sub];
          let cls = '';
          if (st.missing) cls = 'cell-missing';
          else if (st.fail) cls = 'cell-fail';
          
          if (setups.length > 1) {
              setups.forEach(setup => {
                  let tVal = st.terms[setup._id];
                  tds += `<td class="${tVal === 'AB' ? 'cell-missing' : ''}">${tVal}</td>`;
              });
          }

          if (!st.missing && typeof st.val === 'number') {
              subjSums[sub] += st.val; subjCounts[sub]++;
          }
          
          tds += `<td class="${cls}" ${setups.length > 1 ? 'style="font-weight:bold; background:rgba(212,168,67,0.1);"' : ''}>${st.val}</td>`;
      });
      
      let rowFailCls = s.failCount > 0 ? 'color:var(--danger);' : '';
      let grade = getGradeInfo(s.grandTotal, s.maxPossible).g;
      
      tds += `<td style="font-weight:bold; ${rowFailCls}">${s.grandTotal}</td>`;
      tds += `<td style="font-weight:bold;">${s.perc.toFixed(1)}%</td>`;
      tds += `<td style="font-weight:bold; ${grade==='E' ? 'color:var(--danger);' : ''}">${grade}</td>`;
      tds += `<td style="font-weight:bold; color:var(--gold);">${s.rank}</td>`;
      
      totalClassPerc += s.perc; totalRankedStus++;
      
      html += `<tr>${tds}</tr>`;
   });
   
   if (students.length > 0) {
       let avgTds = `<td colspan="2" style="text-align:right; font-weight:bold; color:var(--teal);">Class Average</td>`;
       currentTabuSubjs.forEach(sub => {
           let avg = subjCounts[sub] > 0 ? (subjSums[sub] / subjCounts[sub]).toFixed(1) : '-';
           if (setups.length > 1) {
               avgTds += `<td colspan="${setups.length}" style="background:rgba(255,255,255,0.02)"></td>`;
           }
           avgTds += `<td style="font-weight:bold; color:var(--teal);">${avg}</td>`;
       });
       let overallAvg = totalRankedStus > 0 ? (totalClassPerc / totalRankedStus).toFixed(1) + '%' : '-';
       avgTds += `<td colspan="4" style="text-align:center; font-weight:bold; color:var(--teal);">Overall: ${overallAvg}</td>`;
       
       html += `<tr>${avgTds}</tr>`;
   }
   
   html += `</tbody></table>`;
   
   panel.innerHTML = html;
   panel.style.display = 'block';
   document.getElementById('btn-export-tabu-excel').style.display = 'inline-block';
   document.getElementById('btn-export-tabu-pdf').style.display = 'inline-block';
}

function exportTabulationExcel() {
  if (!currentTabuData) return;
  const { setups, students, termMax } = currentTabuData;
  const cSelect = document.getElementById('tabu-class-sel');
  const className = cSelect.options[cSelect.selectedIndex].text;

  const data = students.map(s => {
      let obj = { "Roll No": s.rollNo || '-', "Student Name": s.name };
      currentTabuSubjs.forEach(sub => { 
          if (setups.length > 1) {
              setups.forEach(setup => {
                 const tMax = setup.assessments.reduce((acc, a) => acc + a.maxMarks, 0);
                 obj[`${sub} - ${setup.termName} (${tMax})`] = s.subTotals[sub].terms[setup._id];
              });
              obj[`${sub} Total (${termMax})`] = s.subTotals[sub].val;
          } else {
              obj[`${sub} (${termMax})`] = s.subTotals[sub].val; 
          }
      });
      
      let grade = getGradeInfo(s.grandTotal, s.maxPossible).g;

      obj[`Grand Total (${termMax * currentTabuSubjs.length})`] = s.grandTotal;
      obj["Percentage"] = s.perc.toFixed(1) + '%';
      obj["Grade"] = grade;
      obj["Rank"] = s.rank;
      return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data); 
  const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, ws, "Tabulation");
  XLSX.writeFile(wb, `Tabulation_${className}.xlsx`);
}

function printTabulationPDF() {
  if (!currentTabuData) return;
  const { selectedTermNames } = currentTabuData;
  const cSelect = document.getElementById('tabu-class-sel');
  const className = cSelect.options[cSelect.selectedIndex].text;
  const schName = getVal('sch-name') || 'Hello School';

  let printWin = window.open('', '_blank');
  if (!printWin) return toast('Allow popups to print', 'err');

  let tableHtml = document.querySelector('.tabu-table').outerHTML;
  tableHtml = tableHtml.replace(/var\(--teal\)/g, '#0f766e')
                       .replace(/var\(--danger\)/g, '#b91c1c')
                       .replace(/var\(--gold\)/g, '#000')
                       .replace(/var\(--silver\)/g, '#666')
                       .replace(/cell-missing/g, 'print-missing')
                       .replace(/cell-fail/g, 'print-fail')
                       .replace(/background:rgba\(212,168,67,0\.1\);/g, 'background:#f3f4f6;');

  const html = `<!DOCTYPE html><html><head><title>Tabulation - ${className}</title>
      <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h2, h3 { text-align: center; margin: 5px 0; }
          .tabu-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .tabu-table th, .tabu-table td { border: 1px solid #000; padding: 4px; text-align: center; }
          .tabu-table th { background-color: #f3f4f6; }
          .print-missing { background-color: #fef08a !important; font-weight: bold; }
          .print-fail { background-color: #fecaca !important; color: #b91c1c !important; font-weight: bold; }
          .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 40px; font-weight: bold; }
      </style></head><body>
      <h2>${escH(schName)}</h2>
      <h3>Tabulation Register: ${escH(selectedTermNames)} | Class: ${escH(className)} | Session: ${window.currentSession}</h3>
      ${tableHtml}
      <div class="signatures">
          <div>Class Teacher</div>
          <div>Examination In-Charge</div>
          <div>Principal</div>
      </div>
      <script>setTimeout(function(){ window.print(); window.close(); }, 1000);</script>
      </body></html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

/* =========================================================================
   TAB 4: REPORT CARDS (Asynchronous Background Chunking & Pre-Flight Warning)
   ========================================================================= */

function loadReportCardOptions() {
  const classChks = document.querySelectorAll('.rc-class-chk:checked');
  const termsContainer = document.getElementById('rc-terms-container');
  const subjectsContainer = document.getElementById('rc-subjects-container');
  
  if (classChks.length === 0) {
    termsContainer.innerHTML = '<span style="color:var(--muted)">Select at least one class.</span>';
    subjectsContainer.innerHTML = '<span style="color:var(--muted)">Select at least one class.</span>';
    return;
  }
  
  termsContainer.innerHTML = '<span style="color:var(--muted)">Loading terms...</span>';
  subjectsContainer.innerHTML = '<span style="color:var(--muted)">Loading subjects...</span>';

  const classIds = Array.from(classChks).map(c => c.value);
  
  const setupPromises = classIds.map(cid => apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${cid}`, true).catch(() => ({data: []})));
  const subjPromises = classIds.map(cid => apiGet(API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${cid}`, true).catch(() => ({data: []})));

  Promise.all([Promise.all(setupPromises), Promise.all(subjPromises)]).then(results => {
      const setupsArrs = results[0];
      const subjsArrs = results[1];
      
      let uniqueTerms = new Map();
      let uniqueSubjs = new Map();
      
      setupsArrs.forEach(res => {
          (res.data || []).forEach(s => uniqueTerms.set(s.termName, s.termName));
      });
      
      subjsArrs.forEach(res => {
          (res.data || []).forEach(s => uniqueSubjs.set(s.subjectName, s.subjectName));
      });
      
      if (uniqueTerms.size === 0) {
          termsContainer.innerHTML = '<span style="color:var(--muted)">No terms found. Create Exam Setup first.</span>';
      } else {
          termsContainer.innerHTML = Array.from(uniqueTerms.values()).map(tName => `<label class="chk-label"><input type="checkbox" class="rc-term-chk" value="${escAttr(tName)}" checked> ${escH(tName)}</label>`).join('');
      }
      
      if (uniqueSubjs.size === 0) {
          subjectsContainer.innerHTML = '<span style="color:var(--muted)">No subjects mapped to selected classes.</span>';
      } else {
          subjectsContainer.innerHTML = Array.from(uniqueSubjs.values()).map(sName => `<label class="chk-label"><input type="checkbox" class="rc-subj-chk" value="${escAttr(sName)}" checked> ${escH(sName)}</label>`).join('');
      }
  }).catch(e => {
      termsContainer.innerHTML = '<span style="color:var(--danger)">Error loading data.</span>';
      subjectsContainer.innerHTML = '<span style="color:var(--danger)">Error loading data.</span>';
  });
}

function generateReportCards() {
  const classChks = document.querySelectorAll('.rc-class-chk:checked');
  if(classChks.length === 0) return toast('Select at least one Class', 'err');

  const termChks = document.querySelectorAll('.rc-term-chk:checked');
  const subjChks = document.querySelectorAll('.rc-subj-chk:checked');
  if(termChks.length === 0) return toast('Select at least one Term', 'err');
  if(subjChks.length === 0) return toast('Select at least one Subject', 'err');

  const selectedTermNames = Array.from(termChks).map(c => c.value);
  cachedSubjectsForPrint = Array.from(subjChks).map(c => c.value);

  const btn = document.getElementById('btn-rep-cards');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Analyzing Data...';

  const classIds = Array.from(classChks).map(c => c.value);
  const classNamesMap = {};
  Array.from(classChks).forEach(c => { classNamesMap[c.value] = c.getAttribute('data-name'); });

  const reportPromises = classIds.map(cid => 
      apiGet(`${API_ENDPOINTS.REPORT_CARDS}?session=${window.currentSession}&classId=${cid}`, true)
      .then(res => ({ classId: cid, className: classNamesMap[cid], res: res }))
      .catch(e => null) 
  );

  Promise.all(reportPromises).then(results => {
      let allStudents = [];
      let missingCount = 0;

      results.forEach(classData => {
          if(!classData || !classData.res) return;
          const setups = classData.res.setups.filter(s => selectedTermNames.includes(s.termName));
          const studentsData = classData.res.data || [];
          
          studentsData.forEach(item => {
              item.matchedSetups = setups;
              item.className = classData.className;
              
              let hasMissing = false;
              cachedSubjectsForPrint.forEach(subName => {
                  setups.forEach(setup => {
                      const termData = item.subjects[subName]?.[setup._id] || {};
                      setup.assessments.forEach(a => {
                          if(!termData[a.name] || (termData[a.name].status === 'present' && termData[a.name].obtained === null)) {
                              hasMissing = true;
                          }
                      });
                  });
              });
              if(hasMissing) missingCount++;
              allStudents.push(item);
          });
      });
      
      if(allStudents.length === 0) { 
          btn.disabled = false; btn.textContent = originalText; 
          return toast('No students found for the selected classes.', 'err'); 
      }

      if(missingCount > 0) {
          if(!confirm(`⚠️ Warning: ${missingCount} student(s) have missing marks for the selected subjects/terms. Generate report cards anyway?`)) {
              btn.disabled = false; btn.textContent = originalText; return;
          }
      }

      let oldFrame = document.getElementById('report-iframe');
      if (oldFrame) oldFrame.remove();
      
      let iframe = document.createElement('iframe');
      iframe.id = 'report-iframe';
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(iframe);
      
      let doc = iframe.contentWindow.document;
      doc.open();
      
      doc.write(getReportCardCSSAndHeader());
      
      let i = 0;
      function processChunk() {
         const chunk = allStudents.slice(i, i + 10);
         if (chunk.length === 0) {
            doc.write('</body></html>');
            doc.close();
            btn.textContent = 'Opening Print Dialog...';
            setTimeout(() => {
               iframe.contentWindow.focus();
               iframe.contentWindow.print();
               btn.disabled = false;
               btn.textContent = originalText;
            }, 1000);
            return;
         }
         
         let html = buildACMEReportCardHTML(chunk, cachedSubjectsForPrint);
         doc.write(html);
         
         i += 10;
         const pct = Math.min(100, Math.round((i / allStudents.length) * 100));
         btn.textContent = `Generating PDF (${pct}%)...`;
         
         setTimeout(processChunk, 20);
      }
      processChunk();
  }).catch(e => {
      toast(e.message || 'Failed to process report cards', 'err');
      btn.disabled = false; btn.textContent = originalText;
  });
}

function getGradeInfo(total, outOf) {
  if (outOf === 0) return {g: ''};
  const perc = (total / outOf) * 100;
  if(perc >= 91) return {g:'A1'};
  if(perc >= 81) return {g:'A2'};
  if(perc >= 71) return {g:'B1'};
  if(perc >= 61) return {g:'B2'};
  if(perc >= 51) return {g:'C1'};
  if(perc >= 41) return {g:'C2'};
  if(perc >= 33) return {g:'D'};
  return {g:'E'};
}

function getReportCardCSSAndHeader() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Card</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; font-size: 13px; color: #000; margin:0; padding:0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
      .rc-page { width: 100%; height: 185mm; page-break-after: always; padding: 0; box-sizing: border-box; display: block; position: relative; overflow: hidden;}
      
      .header { text-align: center; margin-bottom: 12px; }
      .header h1 { margin: 0; color: #8b0000; font-family: Arial, sans-serif; font-size: 26px; font-weight: bold; text-transform: uppercase;}
      .header p { margin: 5px 0 0; font-size: 15px; color: #333; font-weight: bold; }
      .header h3 { margin: 10px 0 0; color: #8b0000; font-size: 20px; font-weight: bold; }
      
      .info-grid { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 0 40px; }
      .info-col table { font-size: 14px; border-collapse: collapse; }
      .info-col td { padding: 3px 15px; }
      .info-col td:first-child { font-weight: normal; }
      .info-col td:last-child { font-weight: bold; }

      .table-wrapper { margin-bottom: 15px; }
      .rc-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: center; border: 2px solid #000; }
      .rc-table th, .rc-table td { border: 1px solid #000; padding: 5px 4px; color: #000;}
      .rc-table th { background: #e0e0e0; font-weight: normal; }
      .rc-table .subj-col { text-align: left; font-weight: bold; padding-left: 10px; width: 14%; }
      .bold-cell { font-weight: bold; }
      .left-align { text-align: left !important; padding-left: 10px !important; }
      
      .bottom-section { padding-bottom: 0px; margin-top: 15px; }
      .scale-text { font-size: 12px; text-align: center; margin: 10px 0 15px 0; font-weight: bold; letter-spacing: 0.5px;}
      
      .sign-text { font-size: 12px; vertical-align: top; }
      .empty-row td { padding: 8px 10px; text-align: left; }
    </style></head><body>`;
}

function buildACMEReportCardHTML(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name';
  const schAddr = getVal('sch-addr') || 'School Address';
  
  const scaleText = getVal('rc-scale-text');
  const promoText = getVal('rc-promo-text');
  const reopenText = getVal('rc-reopen-text');
  const dateText = getVal('rc-date-text');
  const sessionText = getVal('rc-session-text') || window.currentSession;

  let logoHtml = schoolLogoUrl ? `<img src="${escAttr(schoolLogoUrl)}" style="max-height:80px; max-width:80px; position:absolute; left:20px; top:10px;">` : '';
  let html = '';

  studentsChunk.forEach(item => {
    const stu = item.student;
    const subjectsDict = item.subjects; 
    const className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    html += `<div class="rc-page">
      ${logoHtml}
      <div class="header">
        <h1>${escH(schName)}</h1>
        <p>${escH(schAddr)}</p>
        <h3>Report Card (${escH(sessionText)})</h3>
      </div>
      
      <div class="info-grid">
        <div class="info-col">
          <table>
            <tr><td>Student's Name</td><td>: &nbsp;${escH(stu.name)}</td></tr>
            <tr><td>Mother's Name</td><td>: &nbsp;${escH(stu.motherName || '________________')}</td></tr>
            <tr><td>Father's Name</td><td>: &nbsp;${escH(stu.fatherName || '________________')}</td></tr>
          </table>
        </div>
        <div class="info-col">
          <table>
            <tr><td>Class</td><td>: &nbsp;${escH(className)}</td></tr>
            <tr><td>Serial Number</td><td>: &nbsp;${escH(stu.rollNo || '________________')}</td></tr>
            <tr><td>Date of Birth.</td><td>: &nbsp;${stu.dateOfBirth ? new Date(stu.dateOfBirth).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}).replace(/ /g, '-') : '________________'}</td></tr>
          </table>
        </div>
      </div>
      
      <div class="table-wrapper">
      <table class="rc-table">
        <thead>
          <tr>
            <th rowspan="2" class="subj-col">Scholastic Areas:<br>Subjects</th>`;
          
          let overallMaxTotal = 0;
          
          sortedSetups.forEach(setup => {
            const termMax = setup.assessments.reduce((sum, a) => sum + a.maxMarks, 0);
            overallMaxTotal += termMax;
            html += `<th colspan="${setup.assessments.length + 2}">${escH(setup.termName)}</th>`;
          });
            
    html += `</tr><tr>`;
          sortedSetups.forEach(setup => {
            let termMaxTotal = 0;
            setup.assessments.forEach(a => { 
              html += `<th>${escH(a.name)}(${a.maxMarks})</th>`; 
              termMaxTotal += a.maxMarks;
            });
            html += `<th>Marks Obtained<br>(${termMaxTotal})</th><th>Grade</th>`;
          });
    html += `</tr></thead><tbody>`;

    selectedSubjectsList.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      
      sortedSetups.forEach(setup => {
        let termTotal = 0; let termMax = 0;
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => {
          const markObj = termData[a.name];
          if (markObj && markObj.status === 'present') {
            const val = Number(markObj.obtained || 0);
            termTotal += val;
            html += `<td>${val}</td>`;
          } else if (markObj) {
            html += `<td>${markObj.status === 'absent' ? 'AB' : 'M'}</td>`;
          } else {
            html += `<td></td>`;
          }
          termMax += a.maxMarks;
        });
        
        const gradeObj = getGradeInfo(termTotal, termMax);
        html += `<td class="bold-cell">${termTotal || ''}</td><td class="bold-cell">${termTotal ? gradeObj.g : ''}</td>`;
      });
      html += `</tr>`;
    });

    html += `<tr class="empty-row">
        <td class="subj-col sign-text left-align" style="height: 35px;">Class Teacher's Signature</td>`;
        
    sortedSetups.forEach((setup) => {
      const assLen = setup.assessments.length;
      if (assLen >= 2) {
         html += `<td colspan="1" class="sign-text left-align">Rank<br><br></td>`;
         html += `<td colspan="${assLen - 1}" class="sign-text left-align">Attendance<br><br></td>`;
      } else {
         html += `<td colspan="${assLen}" class="sign-text left-align">Rank & Attd.<br><br></td>`;
      }
      html += `<td colspan="2"></td>`;
    });
    html += `</tr>`;

    html += `<tr><td class="subj-col sign-text left-align" style="height: 30px;">Class Teacher's<br>Remarks</td>`;
    sortedSetups.forEach((setup, index) => {
      const totalCols = setup.assessments.length + 2;
      if (index === 0) {
          html += `<td colspan="${totalCols}"></td>`;
      } else {
          const splitCols = Math.floor(totalCols / 2);
          const remainCols = totalCols - splitCols;
          html += `<td colspan="${splitCols}" class="sign-text left-align" style="position:relative;">Overall Scholastic Grade</td>
                   <td colspan="${remainCols}" class="sign-text left-align" style="position:relative;">Overall Co-scholastic Grade</td>`;
      }
    });
    html += `</tr>`;

    html += `<tr><td class="subj-col sign-text left-align" style="height: 35px;">Principal's Signature</td>`;
    sortedSetups.forEach((setup, index) => {
      const totalCols = setup.assessments.length + 2;
      if (index === 0) {
        html += `<td colspan="${totalCols}" class="sign-text left-align">Parent's Signature</td>`;
      } else {
        html += `<td colspan="${totalCols}"></td>`;
      }
    });
    html += `</tr>`;

    html += `</tbody></table></div>
      
      <div class="bottom-section">
        <div class="scale-text">${escH(scaleText)}</div>

        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; padding: 0 10px; margin-top: 5px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
             <div>${escH(promoText)}</div>
             <div>Date: &nbsp;${escH(dateText)}</div>
          </div>
          <div style="display: flex; align-items: flex-end;">
             <div>${escH(reopenText)}</div>
          </div>
        </div>
      </div>

    </div>`;
  });

  return html;
}

/* ================= UTILS ================= */
function getVal(id){ return (document.getElementById(id).value||'').trim(); }
function setVal(id,v){ document.getElementById(id).value = v || ''; }
function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
var _tt;
function toast(msg, kind){
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (kind==='err'?' err':'');
  clearTimeout(_tt); _tt = setTimeout(() => t.className='toast', 3000);
}