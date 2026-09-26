/* ─────────────────────────────────────────────────────────────
   EXAM MANAGEMENT & REPORT CARDS (WITH PARENT DISAMBIGUATION)
   ───────────────────────────────────────────────────────────── */
var HDR_BASE = 'examAdmitHeader';
var hdrKey   = 'examAdmitHeader';
var students = [];
var selected = {};
var currentClassName = '';
var schoolLogoUrl = null;
window.currentSession = '2026-27';
var globalSetups = [];
var currentGridSetup = null;
var currentEditSetupId = null;
var cachedSubjectsForPrint = [];

// Dynamic Grading Scale Variables
var gradingScale = [];
var defaultScale = [
  { min: 91, max: 100, grade: 'A1' },
  { min: 81, max: 90, grade: 'A2' },
  { min: 71, max: 80, grade: 'B1' },
  { min: 61, max: 70, grade: 'B2' },
  { min: 51, max: 60, grade: 'C1' },
  { min: 41, max: 50, grade: 'C2' },
  { min: 33, max: 40, grade: 'D' },
  { min: 0, max: 32, grade: 'E', remark: 'Needs Improvement' }
];

(function boot(){
  var token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
  if (!token) { window.location.href = 'login.html'; return; }
  
  enforceStaffPermissions();
  
  loadHeader(); 
  loadClasses(); 
  loadGradingScale();
  
  ['sch-name','sch-addr','sch-phone','sch-email'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', saveHeader);
  });
  
  document.addEventListener('keydown', handleGridArrowKeys);
})();

function goDashboard(){ window.location.href = 'dashboard.html'; }

/* ================= ACCESS CONTROL ================= */
function enforceStaffPermissions() {
  var userType = localStorage.getItem('userType');
  if (userType !== 'staff') return; 

  var perms = {};
  try {
    perms = JSON.parse(localStorage.getItem('examPermissions') || '{}');
  } catch (e) {
    perms = {};
  }

  var admitTabBtn = document.querySelector('button[onclick*="tab-admit"]');
  if (admitTabBtn && !perms.admit) admitTabBtn.style.display = 'none';

  var setupBtn = document.querySelector('button[onclick*="sub-setup"]');
  if (setupBtn && !perms.setup) setupBtn.style.display = 'none';

  var marksBtn = document.querySelector('button[onclick*="sub-marks"]');
  if (marksBtn && !perms.marks) marksBtn.style.display = 'none';

  var tabuBtn = document.querySelector('button[onclick*="sub-tabulation"]');
  if (tabuBtn && !perms.tabulation) tabuBtn.style.display = 'none';

  var printBtn = document.querySelector('button[onclick*="sub-print"]');
  if (printBtn && !perms.reports) printBtn.style.display = 'none';

  var hasAnyExamSubTab = perms.setup || perms.marks || perms.tabulation || perms.reports;
  var reportTabBtn = document.querySelector('button[onclick*="tab-report"]');
  if (reportTabBtn && !hasAnyExamSubTab) reportTabBtn.style.display = 'none';

  if (!perms.admit && hasAnyExamSubTab) {
    if (reportTabBtn) reportTabBtn.click();
    if (perms.marks && marksBtn) marksBtn.click();
    else if (perms.setup && setupBtn) setupBtn.click();
    else if (perms.tabulation && tabuBtn) tabuBtn.click();
    else if (perms.reports && printBtn) printBtn.click();
  } else if (!perms.admit && !hasAnyExamSubTab) {
    document.querySelector('.main').innerHTML = `
      <div class="card" style="text-align:center; padding:40px 20px;">
        <div style="font-size:40px; margin-bottom:10px;">🔒</div>
        <div class="card-title" style="justify-content:center;">Access Restricted</div>
        <div class="card-sub">You do not have permission to access any examination modules. Please contact the administrator.</div>
      </div>`;
  }
}

/* =========================================================================
   TEMPLATE SELECTOR LOGIC
   ========================================================================= */
function selectTemplate(cardEl) {
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');
}

function getSelectedTemplate() {
    const active = document.querySelector('.tpl-card.active');
    return active ? active.getAttribute('data-tpl') : 'classic';
}

/* =========================================================================
   DYNAMIC GRADING SCALE LOGIC
   ========================================================================= */
function loadGradingScale() {
    const container = document.getElementById('grading-scale-list');
    if(container) container.innerHTML = '<div style="color:var(--muted); font-size:12px; text-align:center; padding:10px;">☁️ Loading grading scale from cloud...</div>';

    apiGet(API_BASE_URL + '/exam-schedules/grading-scale/settings', true)
      .then(res => {
          if (res.data && res.data.length > 0) gradingScale = res.data;
          else gradingScale = [...defaultScale];
          renderGradingScale();
      })
      .catch(e => {
          gradingScale = [...defaultScale];
          renderGradingScale();
      });
}

function renderGradingScale() {
    gradingScale.sort((a, b) => b.min - a.min); 
    const container = document.getElementById('grading-scale-list');
    
    if(container) {
        if(!gradingScale.length) {
            container.innerHTML = '<div style="color:var(--muted); font-size:12px; text-align:center; padding:10px;">No grading rules defined. Add one above.</div>';
        } else {
            container.innerHTML = gradingScale.map((g, i) => `
                <div style="display:flex; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--rim); font-size:13px; align-items:center; background: rgba(255,255,255,0.01);">
                    <div>
                      <strong style="color:var(--gold); font-size:15px; margin-right:10px;">${escH(g.grade)}</strong> 
                      <span style="font-family:'IBM Plex Mono', monospace;">${g.min}% - ${g.max}%</span> 
                      <span style="color:var(--silver); font-size:12px; margin-left:12px; font-style:italic;">${escH(g.remark || '')}</span>
                    </div>
                    <button class="btn-ghost" style="padding:4px 8px; font-size:11px; color:var(--danger); border-color:var(--danger);" onclick="removeGradeRule(${i})">Delete</button>
                </div>
            `).join('');
        }
    }
    
    const textStr = gradingScale.map(g => `${g.min}-${g.max} : ${g.grade}`).join(' | ');
    const rcInput = document.getElementById('rc-scale-text');
    if(rcInput) rcInput.value = textStr;
}

function addGradeRule() {
    const min = parseFloat(document.getElementById('g-min').value);
    const max = parseFloat(document.getElementById('g-max').value);
    const grade = document.getElementById('g-grade').value.trim();
    const remark = document.getElementById('g-remark').value.trim();

    if (isNaN(min) || isNaN(max) || !grade) return toast('Min %, Max %, and Grade are required', 'err');
    if (min > max) return toast('Min % cannot be greater than Max %', 'err');

    gradingScale.push({ min, max, grade, remark });
    saveGradingScale();
    
    document.getElementById('g-min').value = ''; document.getElementById('g-max').value = '';
    document.getElementById('g-grade').value = ''; document.getElementById('g-remark').value = '';
}

function removeGradeRule(index) {
    gradingScale.splice(index, 1);
    saveGradingScale();
}

function saveGradingScale() {
    renderGradingScale(); 
    apiPost(API_BASE_URL + '/exam-schedules/grading-scale/settings', { scale: gradingScale }, true)
      .then(res => toast('Grading scale synced to cloud ☁️', 'success'))
      .catch(e => toast('Failed to sync grading scale', 'err'));
}

function getGradeInfo(total, outOf) {
  if (outOf === 0) return {g: ''};
  const perc = (total / outOf) * 100;
  let assignedGrade = '-';
  
  const scale = gradingScale.length ? gradingScale : defaultScale;
  for (let i = 0; i < scale.length; i++) {
      if (perc >= scale[i].min && perc <= scale[i].max) { assignedGrade = scale[i].grade; break; }
  }
  if (assignedGrade === '-' && perc > 100 && scale.length) assignedGrade = scale[0].grade; 
  return {g: assignedGrade, p: perc};
}

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

/* =========================================================================
   CLASS & STUDENT LOADING LOGIC
   ========================================================================= */
function loadClasses() {
  apiGet(API_ENDPOINTS.CLASSES, true).then(res => {
    let htmlTab1 = '<option value="">Select a class…</option><option value="all">All Classes (Entire School)</option>';
    let htmlStandard = '<option value="">Select a class…</option>';
    let cloneClassHtml = '';
    let rcClassHtml = '';
    
    (res.data || []).filter(c => c.isActive !== false).forEach(c => {
      const className = escH(c.className || c.name);
      const opt = `<option value="${c._id}">${className}</option>`;
      htmlTab1 += opt; htmlStandard += opt; 
      cloneClassHtml += `<label class="chk-label clone-label" data-cid="${c._id}"><input type="checkbox" class="clone-class-chk" value="${c._id}"> ${className}</label>`;
      rcClassHtml += `<label class="chk-label"><input type="checkbox" class="rc-class-chk" value="${c._id}" data-name="${escAttr(c.className || c.name)}" onchange="loadReportCardOptions()"> ${className}</label>`;
    });
    
    ['class-sel'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = htmlTab1; });
    ['s-class-sel', 'm-class-sel', 'tabu-class-sel'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = htmlStandard; });
    
    if(document.getElementById('clone-class-container')) document.getElementById('clone-class-container').innerHTML = cloneClassHtml;
    if(document.getElementById('rc-class-container')) document.getElementById('rc-class-container').innerHTML = rcClassHtml;
  });
}

function toggleCloneClasses() {
    const visibleChks = Array.from(document.querySelectorAll('.clone-label')).filter(lbl => lbl.style.display !== 'none').map(lbl => lbl.querySelector('.clone-class-chk'));
    if (!visibleChks.length) return;
    const allChecked = visibleChks.every(c => c.checked);
    visibleChks.forEach(c => c.checked = !allChecked);
}

function toggleCloneTerms() {
    const chks = document.querySelectorAll('.clone-term-chk');
    if(!chks.length) return;
    const allChecked = Array.from(chks).every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
}

function rcSelectAllClasses() {
    const chks = document.querySelectorAll('.rc-class-chk');
    if(!chks.length) return;
    const allChecked = Array.from(chks).every(c => c.checked);
    chks.forEach(c => c.checked = !allChecked);
    loadReportCardOptions();
}

function loadStudents(){
  var sel = document.getElementById('class-sel'); 
  var cid = sel.value; 
  if (!cid){ return toast('Pick a class first','err'); }
  
  var btn = document.getElementById('load-btn'); btn.disabled = true; btn.textContent = 'Loading…'; 
  currentClassName = sel.options[sel.selectedIndex].text;
  
  var url = API_ENDPOINTS.STUDENTS + '?limit=9999&_t=' + new Date().getTime(); 
  if (cid !== 'all') url += '&classId=' + encodeURIComponent(cid);
  
  apiGet(url, true).then(function(r){
      students = (r && r.data) || [];
      students.sort((a, b) => { var nA = (a.name || '').toLowerCase(), nB = (b.name || '').toLowerCase(); if (nA < nB) return -1; if (nA > nB) return 1; return 0; });
      selected = {}; 
      renderStudents(); 
      document.getElementById('stu-panel').style.display = 'block';
      if (!students.length) toast('No students found','err'); else toast(`Loaded ${students.length} students!`, 'success');
  }).catch(() => toast('Failed to load students','err')).finally(() => { btn.disabled = false; btn.textContent = 'Load Students'; });
}

function renderStudents(){
  var grid = document.getElementById('stu-grid');
  if (!students.length){ grid.innerHTML = '<div class="empty">No students to show.</div>'; updateCount(); return; }
  grid.innerHTML = students.map(s => {
    var photo = s.photo ? `<img class="stu-photo" loading="lazy" src="${escAttr(s.photo)}">` : `<div class="stu-photo-ph">👤</div>`;
    return `<div class="stu-card" data-id="${escAttr(s._id)}" onclick="toggleStu(this)">
                ${photo}<div class="stu-meta"><div class="stu-name">${escH(s.name||'—')}</div><div class="stu-sub">${escH(s.fatherName||'')}</div></div><div class="stu-chk">✓</div>
            </div>`;
  }).join(''); 
  updateCount();
}

function toggleStu(el){ var id = el.getAttribute('data-id'); if (selected[id]){ delete selected[id]; el.classList.remove('on'); } else { selected[id]=true; el.classList.add('on'); } updateCount(); }
function selectAll(on){ document.querySelectorAll('.stu-card').forEach(el => { var id = el.getAttribute('data-id'); if (on){ selected[id]=true; el.classList.add('on'); } else { delete selected[id]; el.classList.remove('on'); } }); updateCount(); }
function updateCount(){ var n = Object.keys(selected).length; document.getElementById('sel-count').textContent = n + ' selected'; document.getElementById('gen-btn').disabled = n === 0; }
function selectedStudents(){ return students.filter(s => selected[s._id]); }

/* =========================================================================
   ADMIT CARD LOGIC
   ========================================================================= */
function loadHeader(){
  apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true).then(function(res){
    var d = (res && res.data) || {};
    var code = d.institutionCode || localStorage.getItem('institutionCode') || 'default';
    hdrKey = HDR_BASE + ':' + code;
    
    if (d.currentAcademicYear) { window.currentSession = d.currentAcademicYear; var sessionInput = document.getElementById('rc-session-text'); if (sessionInput) sessionInput.value = window.currentSession; }
    
    var saved = readSaved();
    setVal('sch-name', d.name || saved.name || ''); setVal('sch-addr', d.address ? composeAddress(d.address) : (saved.addr || ''));
    var cf = d.contactsFull || {}; var realPhone = [cf.mobile1, cf.mobile2].filter(Boolean).join(', ');
    setVal('sch-phone', saved.phone || realPhone || ''); setVal('sch-email', saved.email || cf.email || '');
    if (d.logo) { schoolLogoUrl = d.logo; showLogo(d.logo); } else if (saved.logo) { schoolLogoUrl = saved.logo; showLogo(saved.logo); } else { schoolLogoUrl = null; showLogo(null); }
    saveHeader();
  }).catch(function(){
    var saved = readSaved(); setVal('sch-name', saved.name || ''); setVal('sch-addr', saved.addr || ''); setVal('sch-phone', saved.phone || ''); setVal('sch-email', saved.email || '');
    if (saved.logo) { schoolLogoUrl = saved.logo; showLogo(saved.logo); }
  });
}

function readSaved(){ try { return JSON.parse(localStorage.getItem(hdrKey) || '{}'); } catch(e){ return {}; } }
function composeAddress(a){ if (!a) return ''; if (typeof a === 'string') return a; if (a.fullAddress) return a.fullAddress; return [a.city, a.district, a.state].filter(Boolean).join(', '); }
function saveHeader(){ try { localStorage.setItem(hdrKey, JSON.stringify({ name:getVal('sch-name'), addr:getVal('sch-addr'), phone:getVal('sch-phone'), email:getVal('sch-email'), logo:schoolLogoUrl || null })); } catch(e){} }
function showLogo(url){ var img = document.getElementById('logo-prev'), ph = document.getElementById('logo-ph'); if (url){ img.src = url; img.style.display='block'; ph.style.display='none'; } else { img.style.display='none'; ph.style.display='flex'; } }
function onLogoPick(e){ var file = e.target.files && e.target.files[0]; if (!file) return; if (file.size > 3*1024*1024){ return toast('Logo too large (max 3MB)','err'); } var reader = new FileReader(); reader.onload = function(){ schoolLogoUrl = reader.result; showLogo(reader.result); saveHeader(); toast('Logo saved', 'success'); }; reader.readAsDataURL(file); }

function onGenerate(){ 
    var list = selectedStudents(); 
    if (!list.length) return toast('Select at least one student','err'); 
    saveHeader(); 
    var urls = []; 
    if (schoolLogoUrl) urls.push(schoolLogoUrl); 
    list.forEach(s => { if (s.photo) urls.push(s.photo); }); 
    preloadImages(urls.filter((item, pos) => urls.indexOf(item) === pos), () => buildAndPrintAdmit(list)); 
}

function preloadImages(urls, done){ 
    if (!urls.length) return done(); 
    var total = urls.length, loaded = 0, index = 0; 
    function loadNext() { 
        if (index >= total) return; var u = urls[index++]; var img = new Image(); 
        img.onload = img.onerror = function() { loaded++; if (loaded >= total) done(); else loadNext(); }; 
        img.src = u; 
    } 
    for (var i = 0; i < Math.min(15, total); i++) loadNext(); 
}

function buildAndPrintAdmit(list){
  var hdr = { name: getVal('sch-name'), addr: getVal('sch-addr'), phone: getVal('sch-phone'), email: getVal('sch-email'), logo: schoolLogoUrl };
  var cards = list.map(s => {
    var photo = s.photo ? `<img class="ac-photo" src="${escAttr(s.photo)}">` : `<div class="ac-photo ac-photo-ph">Photo</div>`;
    var logo = hdr.logo ? `<img class="ac-logo" src="${escAttr(hdr.logo)}">` : '';
    return `<div class="ac">
                <div class="ac-head">${logo}<div class="ac-school"><div class="ac-name">${escH(hdr.name)}</div><div class="ac-addr">${escH(hdr.addr)}</div></div></div>
                <div class="ac-title">Examination Admit Card</div>
                <div class="ac-body">
                    <div class="ac-fields">
                        <div class="ac-row"><span class="ac-lbl">Name :-</span><span class="ac-val">${escH(s.name)}</span></div>
                        <div class="ac-row"><span class="ac-lbl">Father Name :-</span><span class="ac-val">${escH(s.fatherName)}</span></div>
                        <div class="ac-row"><span class="ac-lbl">Class :-</span><span class="ac-val">${escH(s.classId?.className || '')}</span></div>
                        <div class="ac-row"><span class="ac-lbl">Roll No. :-</span><span class="ac-val">${escH(s.rollNo)}</span></div>
                    </div>
                    <div class="ac-photo-wrap">${photo}</div>
                </div>
                <div class="ac-foot"><div class="ac-date">Date: ______________</div><div class="ac-sig">Signature / Principal</div></div>
            </div>`;
  }).join('');
  
  var old = document.getElementById('admit-print-frame'); if (old && old.parentNode) old.parentNode.removeChild(old);
  var iframe = document.createElement('iframe'); iframe.id = 'admit-print-frame'; iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'; document.body.appendChild(iframe);
  var doc = iframe.contentWindow.document; doc.open(); 
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:0;} *{box-sizing:border-box;margin:0;padding:0;} body{font-family:Georgia,serif;color:#111;} .ac{width:210mm;height:148.5mm;padding:11mm 12mm 9mm;position:relative;border-bottom:1px dashed #999;} .ac:nth-child(even){border-bottom:none;} .ac-head{display:flex;align-items:center;gap:12px;} .ac-logo{width:58px;height:58px;object-fit:contain;} .ac-school{flex:1;} .ac-name{font-size:20px;font-weight:700;} .ac-addr{font-size:11px;color:#333;margin-top:2px;} .ac-title{text-align:center;font-size:15px;font-weight:700;text-decoration:underline;margin:9mm 0 7mm;} .ac-body{display:flex;gap:14px;} .ac-fields{flex:1;} .ac-row{display:flex;align-items:flex-end;margin-bottom:6.5mm;font-size:13.5px;} .ac-lbl{font-weight:700;margin-right:8px;} .ac-val{border-bottom:1px solid #333;flex:1;min-width:120px;} .ac-photo-wrap{width:35mm;display:flex;justify-content:flex-end;} .ac-photo{width:33mm;height:40mm;object-fit:cover;border:1px solid #333;} .ac-photo-ph{display:flex;align-items:center;justify-content:center;font-size:11px;color:#888;} .ac-foot{position:absolute;left:12mm;right:12mm;bottom:9mm;display:flex;justify-content:space-between;align-items:flex-end;} .ac-date{font-size:14px;font-weight:700;} .ac-sig{width:160px;border-top:1px solid #111;padding-top:5px;font-size:14px;font-weight:700;text-align:center;}</style></head><body>'+cards+'</body></html>'); 
  doc.close();
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 1500);
}


/* =========================================================================
   EXAM SETUP LOGIC
   ========================================================================= */
function addSetupColumn(name = '', max = '', overridesStr = '{}') {
  const container = document.getElementById('s-cols-container'); 
  const div = document.createElement('div'); 
  div.className = 'grid2 setup-col-row'; 
  div.style.marginBottom = '10px';
  
  let btnStyle = overridesStr !== '{}' ? 'background:rgba(212,168,67,0.1); color:var(--gold);' : 'color:var(--silver); background:transparent;';
  let btnText = overridesStr !== '{}' ? '⚙️ (Active)' : '⚙️ Overrides';

  div.innerHTML = `<input type="text" class="c-name" placeholder="Assessment Name (e.g., PT1)" value="${escAttr(name)}">
    <div style="display:flex; gap:10px; align-items:center;">
        <input type="number" class="c-max" placeholder="Global Max" style="width:40%" value="${max}">
        <button class="btn-ghost" style="width:40%; padding:0; ${btnStyle} border-color:var(--gold);" title="Subject Overrides" onclick="openOverrideModal(this)">${btnText}</button>
        <button class="btn-ghost" style="width:20%; padding:0; color:var(--danger); border-color:rgba(239,68,68,0.5);" onclick="this.parentElement.parentElement.remove();">✕</button>
        <input type="hidden" class="c-overrides" value="${escAttr(overridesStr)}">
    </div>`;
  container.appendChild(div);
}

let currentOverrideRow = null;

function openOverrideModal(btn) {
    const classId = getVal('s-class-sel');
    if (!classId) return toast('Please select a Primary Class first.', 'err');
    
    currentOverrideRow = btn.closest('.setup-col-row');
    const globalMax = currentOverrideRow.querySelector('.c-max').value || 0;
    const overridesObj = JSON.parse(currentOverrideRow.querySelector('.c-overrides').value || '{}');
    const assName = currentOverrideRow.querySelector('.c-name').value || 'This Assessment';

    document.getElementById('override-modal-title').textContent = `⚙️ Overrides for ${assName}`;
    const body = document.getElementById('override-body');
    body.innerHTML = '<div style="color:var(--muted)">Loading subjects...</div>';
    document.getElementById('override-modal').style.display = 'flex';

    apiGet(API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${classId}`, true)
    .then(res => {
        const subjects = res.data || [];
        if (!subjects.length) {
            body.innerHTML = '<div style="color:var(--warn)">No subjects found for this class. Map subjects in the Class module first.</div>';
            return;
        }
        let html = `<div style="font-size:13px; color:var(--silver); margin-bottom:15px;">Global Max is set to <b style="color:var(--gold);">${globalMax}</b>. Change it below only for subjects that need a different Max Mark.</div>`;
        html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;
        subjects.forEach(s => {
            const sName = s.subjectName;
            const val = overridesObj[sName] || globalMax;
            html += `
                <div style="background:var(--panel); padding:10px; border:1px solid var(--rim); border-radius:8px;">
                    <label style="color:var(--text); margin-bottom:4px;">${escH(sName)}</label>
                    <input type="number" class="o-max-input" data-sub="${escAttr(sName)}" value="${val}" style="padding:6px; font-size:13px; background:var(--surface);">
                </div>
            `;
        });
        html += `</div>`;
        body.innerHTML = html;
    }).catch(() => body.innerHTML = '<div style="color:var(--danger)">Error loading subjects.</div>');
}

function closeOverrideModal() { document.getElementById('override-modal').style.display = 'none'; }

function saveOverrides() {
    if (!currentOverrideRow) return closeOverrideModal();
    const globalMax = Number(currentOverrideRow.querySelector('.c-max').value);
    const inputs = document.querySelectorAll('.o-max-input');
    const overrides = {};
    
    inputs.forEach(inp => {
        const sub = inp.getAttribute('data-sub');
        const val = Number(inp.value);
        if (val > 0 && val !== globalMax) {
            overrides[sub] = val;
        }
    });
    
    currentOverrideRow.querySelector('.c-overrides').value = JSON.stringify(overrides);
    
    const btn = currentOverrideRow.querySelector('button[title="Subject Overrides"]');
    if (Object.keys(overrides).length > 0) {
        btn.style.background = 'rgba(212,168,67,0.1)';
        btn.style.color = 'var(--gold)';
        btn.textContent = '⚙️ (Active)';
    } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--silver)';
        btn.textContent = '⚙️ Overrides';
    }
    
    closeOverrideModal();
    toast('Overrides applied to this column!', 'success');
}

function saveExamSetup() {
  const classId = getVal('s-class-sel');
  const termName = getVal('s-term-name');
  if (!classId || !termName) return toast('Class and Term Name are required', 'err');
  
  const rows = document.querySelectorAll('.setup-col-row'); 
  const assessments = [];
  rows.forEach(r => { 
      const name = r.querySelector('.c-name').value.trim(); 
      const max = Number(r.querySelector('.c-max').value); 
      const overrides = JSON.parse(r.querySelector('.c-overrides').value || '{}');
      if (name && max > 0) assessments.push({ name, maxMarks: max, overrides }); 
  });
  
  if (!assessments.length) return toast('Add at least one valid assessment column with Max Marks', 'err');
  
  const btn = document.getElementById('btn-save-setup'); btn.disabled = true; btn.textContent = 'Saving...';
  
  if (currentEditSetupId) {
    apiPut(`${API_ENDPOINTS.EXAM_SETUP_ACTION}/${currentEditSetupId}`, { termName, assessments }, true)
    .then(res => { toast('Updated successfully!', 'success'); resetSetupForm(); loadExistingSetups(); })
    .catch(e => toast(e.message || 'Failed to update', 'err'))
    .finally(() => { btn.disabled = false; btn.textContent = '💾 Save Term'; });
  } else {
    apiPost(API_ENDPOINTS.EXAM_SETUP, { session: window.currentSession, classId, termName, assessments }, true)
    .then(res => { toast('Created successfully!', 'success'); resetSetupForm(); loadExistingSetups(); })
    .catch(e => toast(e.message || 'Failed to create', 'err'))
    .finally(() => { btn.disabled = false; btn.textContent = '💾 Save Term'; });
  }
}

function resetSetupForm() {
  currentEditSetupId = null; 
  setVal('s-term-name', ''); 
  document.getElementById('s-cols-container').innerHTML = '<label style="color:var(--gold); margin-bottom:10px;">Assessments for this Term</label>'; 
  document.getElementById('btn-save-setup').textContent = '💾 Save Term';
}

function loadExistingSetups() {
  const classId = getVal('s-class-sel');
  
  document.querySelectorAll('.clone-label').forEach(lbl => {
      if (lbl.getAttribute('data-cid') === classId) { lbl.style.display = 'none'; lbl.querySelector('input').checked = false; } 
      else { lbl.style.display = 'flex'; }
  });

  if(!classId) { document.getElementById('existing-setups-card').style.display = 'none'; return; }
  
  apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => {
    const list = document.getElementById('s-list'); 
    globalSetups = res.data || [];
    
    if (!globalSetups.length) {
      list.innerHTML = '<div style="color:var(--muted); padding:10px 0;">No structures created yet.</div>';
      document.getElementById('clone-term-container').innerHTML = '<span style="color:var(--muted)">No terms available to clone.</span>';
    } else {
      list.innerHTML = globalSetups.map(s => {
        return `<div style="padding:14px; background:rgba(255,255,255,0.02); margin-bottom:12px; border-radius:8px; border:1px solid var(--rim); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                      <strong style="color:var(--gold); font-size:15px;">${escH(s.termName)}</strong><br>
                      <span style="color:var(--silver); font-size:13px; margin-top:4px; display:block;">${s.assessments.map(a => {
                          const hasOvr = a.overrides && Object.keys(a.overrides).length > 0;
                          return `${escH(a.name)} (${a.maxMarks}${hasOvr?'*':''})`;
                      }).join(' &nbsp;|&nbsp; ')}</span>
                  </div>
                  <div style="display:flex; gap:10px;">
                      <button class="btn-ghost" style="padding:6px 12px; font-size:12px; border-color:var(--gold); color:var(--gold);" onclick="editSetup('${s._id}')">Edit</button>
                      <button class="btn-ghost" style="padding:6px 12px; font-size:12px; border-color:rgba(239,68,68,0.5); color:var(--danger);" onclick="deleteSetup('${s._id}')">Delete</button>
                  </div>
                </div>`;
      }).join('');
      
      document.getElementById('clone-term-container').innerHTML = globalSetups.map(s => 
          `<label class="chk-label"><input type="checkbox" class="clone-term-chk" value="${s._id}" checked> ${escH(s.termName)}</label>`
      ).join('');
    }
    document.getElementById('existing-setups-card').style.display = 'block';
  });
}

function editSetup(id) {
  const setup = globalSetups.find(s => s._id === id); 
  if(!setup) return; 
  currentEditSetupId = id; 
  setVal('s-term-name', setup.termName);
  document.getElementById('s-cols-container').innerHTML = '<label style="color:var(--gold); margin-bottom:10px;">Assessments for this Term</label>';
  setup.assessments.forEach(a => addSetupColumn(a.name, a.maxMarks, JSON.stringify(a.overrides || {}))); 
  document.getElementById('btn-save-setup').textContent = '💾 Update Term'; 
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteSetup(id) {
  if(!confirm('🚨 WARNING: Are you sure? This will delete the structure and ALL marks entered under it. This cannot be undone.')) return;
  apiDelete(`${API_ENDPOINTS.EXAM_SETUP_ACTION}/${id}`, true)
    .then(res => { toast('Deleted successfully', 'success'); resetSetupForm(); loadExistingSetups(); })
    .catch(e => toast(e.message || 'Failed to delete', 'err'));
}

function cloneStructureToClasses() {
    const sourceClassId = getVal('s-class-sel');
    if (!sourceClassId || globalSetups.length === 0) return toast('No structure to clone', 'err');
    
    const termChks = document.querySelectorAll('.clone-term-chk:checked');
    if (termChks.length === 0) return toast('Select at least one term to clone', 'err');
    const selectedTermIds = Array.from(termChks).map(c => c.value);
    const termsToClone = globalSetups.filter(s => selectedTermIds.includes(s._id));

    const targetChks = document.querySelectorAll('.clone-class-chk:checked');
    if (targetChks.length === 0) return toast('Select at least one target class', 'err');
    const targetClassIds = Array.from(targetChks).map(c => c.value);
    
    if (!confirm(`This will copy ${termsToClone.length} term(s) (including subject overrides) to ${targetClassIds.length} class(es). Proceed?`)) return;
    
    const btn = document.querySelector('button[onclick="cloneStructureToClasses()"]');
    const origText = btn.textContent; btn.textContent = 'Cloning...'; btn.disabled = true;
    
    let promises = [];
    targetClassIds.forEach(targetCid => {
        termsToClone.forEach(setup => {
            promises.push(
                apiPost(API_ENDPOINTS.EXAM_SETUP, { session: window.currentSession, classId: targetCid, termName: setup.termName, assessments: setup.assessments }, true)
            );
        });
    });
    
    Promise.all(promises)
        .then(() => { toast('Structure successfully cloned!', 'success'); targetChks.forEach(c => c.checked = false); })
        .catch(e => { toast('Some terms failed to copy (they may already exist in those classes).', 'err'); })
        .finally(() => { btn.textContent = origText; btn.disabled = false; });
}

/* =========================================================================
   MARKS UPLOAD & CLOUD SYNC LOGIC
   ========================================================================= */
function onMarksClassChange() { populateSetupsDropdown('m-class-sel', 'm-setup-sel'); loadClassSubjectsForEntry(); }

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
    else { 
        let html = '<option value="">Select Subject...</option>'; 
        subjects.forEach(s => { html += `<option value="${s._id}">${escH(s.subjectName)}</option>`; }); 
        if(sel) sel.innerHTML = html; 
    }
  }).catch(e => { if(sel) sel.innerHTML = '<option value="">Error loading subjects</option>'; });
}

function getSubMax(a, subName) {
    return (a.overrides && a.overrides[subName] !== undefined) ? Number(a.overrides[subName]) : Number(a.maxMarks);
}

function loadMarksGrid() {
  // Force save any pending changes before destroying the current grid
  if (autoSaveTimeout) { clearTimeout(autoSaveTimeout); silentSaveMarks(); }

  const classId = getVal('m-class-sel'), subjectId = getVal('m-subject-sel'), examSetupId = getVal('m-setup-sel');
  if (!classId || !subjectId || !examSetupId) return toast('Select Class, Subject, and Term', 'err');
  
  const btn = document.getElementById('btn-load-grid'); const originalText = btn?.textContent || 'Load Grid';
  if(btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  
  const sSelect = document.getElementById('m-subject-sel');
  const subjectName = sSelect.options[sSelect.selectedIndex].text;
  
  apiGet(`${API_ENDPOINTS.MARKS_GRID}?session=${window.currentSession}&classId=${classId}&subjectId=${subjectId}&examSetupId=${examSetupId}`, true)
  .then(res => { 
      currentGridSetup = res.setup; 
      // LOCK IN METADATA SO AUTO-SAVES DON'T GRAB THE WRONG DROPDOWN LATER
      window.activeGridMeta = { classId, subjectId, examSetupId };
      renderDynamicGrid(res.data, res.setup, subjectName); 
      document.getElementById('marks-grid-panel').style.display = 'block'; 
  })
  .catch(e => toast(e.message || 'Failed to load grid', 'err'))
  .finally(() => { if(btn) { btn.disabled = false; btn.textContent = originalText; } });
}

// 🚨 UPDATED: Parent Disambiguation in Marks Grid 🚨
function renderDynamicGrid(students, setup, subjectName) {
  const thead = document.getElementById('marks-thead'), tbody = document.getElementById('marks-tbody');
  let totalMax = 0; 
  let thHtml = '<tr><th style="width:12%;">Roll No</th><th style="width:43%;">Student Name</th>';
  
  setup.assessments.forEach(a => { 
      const aMax = getSubMax(a, subjectName);
      let overrideIndicator = (aMax !== a.maxMarks) ? '<span style="color:#ef4444; font-size:10px;"> (Override)</span>' : '';
      thHtml += `<th style="text-align:center;">${escH(a.name)}${overrideIndicator}<br><small style="color:var(--silver);font-weight:400;">(Max: ${aMax})</small></th>`; 
      totalMax += aMax; 
  });
  thHtml += '</tr>'; 
  if(thead) thead.innerHTML = thHtml;
  
  const maxLabel = document.getElementById('m-max-label'); 
  if (maxLabel) maxLabel.textContent = `Total Subject Max Marks: ${totalMax}`;
  
  if (!students || !students.length) { 
      if(tbody) tbody.innerHTML = `<tr><td colspan="${setup.assessments.length + 2}" class="empty" style="padding: 30px; text-align: center;">No students found in this class.</td></tr>`; 
      return; 
  }
  
  if(tbody) tbody.innerHTML = students.map(s => {
    // Father Name added here to avoid identical name confusion
    let tr = `<tr class="m-row" data-sid="${s.studentId}" data-stuname="${escAttr(s.name)}">
                <td style="font-family:'IBM Plex Mono',monospace;">${escH(s.rollNo || '-')}</td>
                <td>
                   <div style="font-weight:600;">${escH(s.name)}</div>
                   <div style="font-size:11px; color:var(--muted); margin-top:2px;">${escH(s.fatherName ? 'D/o, S/o: ' + s.fatherName : '')}</div>
                </td>`;
    setup.assessments.forEach(a => {
      const aMax = getSubMax(a, subjectName);
      const markData = s.marks[a.name] || { status: 'present', obtained: '' };
      const val = markData.status === 'present' ? (markData.obtained ?? '') : markData.status.toUpperCase();
      tr += `<td style="text-align:center;">
                <input type="text" class="m-input dyn-mark" data-name="${escAttr(a.name)}" data-max="${aMax}" value="${val}" placeholder="0-${aMax} / AB / NA" onblur="validateMark(this)" oninput="validateMark(this); triggerAutoSave();">
             </td>`;
    });
    tr += '</tr>'; 
    return tr;
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
  const val = el.value.trim().toUpperCase();
  const max = Number(el.getAttribute('data-max'));
  el.classList.remove('fail', 'err');
  
if (val === '' || val === 'AB' || val === 'ABSENT' || val === 'M' || val === 'MEDICAL' || val === 'NA') { return; }

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
    if (!currentGridSetup || !window.activeGridMeta) return Promise.resolve();
    const rows = document.querySelectorAll('.m-row'); 
    if (!rows.length) return Promise.resolve(); 
    let hasFatalError = false;
    
    const marksData = Array.from(rows).map(r => {
      const studentId = r.getAttribute('data-sid'); 
      const marksObj = {};
      r.querySelectorAll('.dyn-mark').forEach(inp => {
        if (inp.classList.contains('err')) hasFatalError = true;
        const name = inp.getAttribute('data-name'), val = inp.value.trim().toUpperCase();
       
if (val === 'AB' || val === 'ABSENT') marksObj[name] = { status: 'absent', obtained: null };
else if (val === 'M' || val === 'MEDICAL') marksObj[name] = { status: 'medical', obtained: null };
else if (val === 'NA') marksObj[name] = { status: 'na', obtained: null }; // <--- ADD THIS LINE
else { const numVal = val === '' ? null : Number(val); marksObj[name] = { status: 'present', obtained: numVal }; }
      }); 
      return { studentId, marks: marksObj };
    });
    
    if (hasFatalError) { 
        const status = document.getElementById('auto-save-text'); 
        if(status) { status.textContent = '⚠️ Fix red boxes to sync'; status.style.color = 'var(--danger)'; } 
        return Promise.reject(new Error('Validation Error')); 
    }
    
    // USE LOCKED METADATA INSTEAD OF LIVE DROPDOWNS
    return apiPost(API_ENDPOINTS.MARKS_BULK, { 
        session: window.currentSession, 
        classId: window.activeGridMeta.classId, 
        subjectId: window.activeGridMeta.subjectId, 
        examSetupId: window.activeGridMeta.examSetupId, 
        marksData 
    }, true)
      .then(() => { const status = document.getElementById('auto-save-text'); if(status) { status.textContent = '☁️ Cloud Sync Active'; status.style.color = 'var(--silver)'; } })
      .catch(() => { const status = document.getElementById('auto-save-text'); if(status) { status.textContent = '⚠️ Sync failed'; status.style.color = 'var(--danger)'; } throw new Error('Sync failed'); });
}

function saveMarksGrid() {
  const btn = document.getElementById('btn-save-marks'); 
  const originalText = btn.textContent; btn.disabled = true; btn.textContent = 'Saving...';
  
  // WAIT FOR THE PROMISE TO RESOLVE BEFORE SHOWING SUCCESS
  const savePromise = silentSaveMarks();
  if (savePromise) {
      savePromise.then(() => {
          toast('Marks saved to cloud', 'success');
      }).catch(() => {
          toast('Failed to save marks', 'err');
      }).finally(() => {
          btn.disabled = false; btn.textContent = originalText;
      });
  } else {
      btn.disabled = false; btn.textContent = originalText;
  }
}

function showAnalytics() {
    if (!currentGridSetup) return toast('Load a grid first', 'err');
    const rows = document.querySelectorAll('.m-row'); 
    if (!rows.length) return toast('No students to analyze', 'err');
    
    const sSelect = document.getElementById('m-subject-sel');
    const subjectName = sSelect.options[sSelect.selectedIndex].text;
    
    let totalMax = currentGridSetup.assessments.reduce((sum, a) => sum + getSubMax(a, subjectName), 0); 
    if (totalMax === 0) return toast('Max marks is 0', 'err');
    
    let studentsData = []; let classTotalObtained = 0; let validStudentCount = 0;
    
    rows.forEach(r => {
        const name = r.getAttribute('data-stuname'); 
        let stuTotal = 0; let hasValidMark = false;
        r.querySelectorAll('.dyn-mark').forEach(inp => {
            const val = inp.value.trim().toUpperCase();
            if (val !== '' && val !== 'AB' && val !== 'ABSENT' && val !== 'M' && val !== 'MEDICAL') {
                const num = Number(val); 
                if (!isNaN(num) && num >= 0) { stuTotal += num; hasValidMark = true; }
            }
        });
        if (hasValidMark) { 
            let perc = (stuTotal / totalMax) * 100; 
            studentsData.push({ name, total: stuTotal, perc: perc }); 
            classTotalObtained += stuTotal; validStudentCount++; 
        }
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

// 🚨 UPDATED: Excel Offline Template 🚨
function downloadExcelTemplate() {
  if (!currentGridSetup) return toast('Load the grid first to generate template', 'err');
  const rows = document.querySelectorAll('.m-row'); 
  if(!rows.length) return toast('No students to download.', 'err');
  
  const sSelect = document.getElementById('m-subject-sel');
  const subjectName = sSelect.options[sSelect.selectedIndex].text;
  
  const data = Array.from(rows).map(r => {
    const obj = { 
        "Student ID (DO NOT EDIT)": r.getAttribute('data-sid'), 
        "Roll No": r.cells[0].textContent, 
        "Student Name": r.getAttribute('data-stuname') 
    };
    r.querySelectorAll('.dyn-mark').forEach(inp => { obj[`${inp.getAttribute('data-name')} (Max: ${inp.getAttribute('data-max')})`] = inp.value; }); return obj;
  });
  
  const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, ws, "Marks Entry");
  const cSelect = document.getElementById('m-class-sel');
  XLSX.writeFile(wb, `${cSelect.options[cSelect.selectedIndex].text}_${subjectName}_${currentGridSetup.termName}.xlsx`);
}

function handleExcelUpload(event) {
  if (!currentGridSetup) { event.target.value = ""; return toast('Load the grid first.', 'err'); }
  const file = event.target.files[0]; if (!file) return; 
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, {type: 'array'}); 
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let matchCount = 0;
      // Inside handleExcelUpload reader.onload:
              json.forEach(row => {
                const sid = row["Student ID (DO NOT EDIT)"]; if (!sid) return;
                const tr = document.querySelector(`.m-row[data-sid="${sid}"]`);
                if (tr) {
                  tr.querySelectorAll('.dyn-mark').forEach(inp => {
                    const key = `${inp.getAttribute('data-name')} (Max: ${inp.getAttribute('data-max')})`;
                    if (row[key] !== undefined) { inp.value = row[key]; validateMark(inp); }
                  }); 
                  matchCount++;
                }
              }); 
              // FORCE INSTANT SAVE INSTEAD OF DELAYED AUTO-SAVE
              toast(`Mapped ${matchCount} students from Excel. Saving...`, 'success'); 
              silentSaveMarks(); 
            } catch(err) { toast('Error reading Excel file.', 'err'); }
            event.target.value = "";
  }; 
  reader.readAsArrayBuffer(file);
}

/* =========================================================================
   TABULATION REGISTER LOGIC (DYNAMIC SUBJECT OVERRIDES APPLIED)
   ========================================================================= */

function onTabuClassChange() { 
    const classId = getVal('tabu-class-sel'); 
    const container = document.getElementById('tabu-terms-container'); 
    if (!classId) return; 
    
    apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${classId}`, true).then(res => { 
        const setups = res.data || []; 
        container.innerHTML = setups.map(s => `<label class="chk-label"><input type="checkbox" class="tabu-term-chk" value="${s._id}" checked> ${escH(s.termName)}</label>`).join(''); 
    }); 
}

var currentTabuData = null; 
var currentTabuSubjs = [];

function loadTabulation() { 
    const classId = getVal('tabu-class-sel'); 
    const termChks = document.querySelectorAll('.tabu-term-chk:checked'); 
    if (!classId || termChks.length===0) return; 
    
    const selectedTermIds = Array.from(termChks).map(c => c.value); 
    Promise.all([ 
        apiGet(`${API_ENDPOINTS.REPORT_CARDS}?session=${window.currentSession}&classId=${classId}`, true), 
        apiGet(API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${classId}`, true) 
    ]).then(results => { 
        const res = results[0]; 
        const activeSubjectNames = (results[1].data || []).map(s => s.subjectName); 
        const setups = res.setups.filter(s => selectedTermIds.includes(s._id)); 
        const studentsData = res.data || []; 
        
        let subjectsSet = new Set(); 
        studentsData.forEach(item => { 
            Object.keys(item.subjects).forEach(sub => { 
                if (activeSubjectNames.includes(sub)) subjectsSet.add(sub); 
            }); 
        }); 
        
        const subjects = Array.from(subjectsSet).sort(); 
        currentTabuSubjs = subjects; 
        
        let processed = studentsData.map(item => { 
            const stu = item.student; 
            let grandTotal = 0; 
            let maxPossible = 0;
            let subTotals = {}; 
            let failCount = 0; 
            let anyMissing = false; 
            
            subjects.forEach(sub => { 
                let sTotal = 0; 
                let sMax = 0;
                let termVals = {}; 
                let hasAnyMarks = false; 
                let completelyNA = true; // Track if the subject is NA
                
                setups.forEach(setup => { 
                    const termData = item.subjects[sub]?.[setup._id]; 
                    let tTotal = 0; 
                    let tHasMarks = false; 
                    let tHasNA = false;
                    
                    setup.assessments.forEach(a => { 
                        const m = termData ? termData[a.name] : null;
                        if (m && m.status === 'na') {
                            tHasNA = true;
                        } else {
                            completelyNA = false; 
                            sMax += getSubMax(a, sub); // Only add max marks if NOT 'na'
                            if (m && m.status === 'present' && m.obtained !== null && m.obtained !== '') { 
                                tTotal += Number(m.obtained); tHasMarks = true; hasAnyMarks = true; 
                            } 
                        }
                    }); 
                    termVals[setup._id] = tHasNA ? 'NA' : (tHasMarks ? tTotal : 'AB'); 
                    sTotal += tTotal; 
                }); 
                
                if (completelyNA) {
                    subTotals[sub] = { terms: termVals, val: 'NA', max: 0, missing: false, fail: false };
                } else {
                    if (sTotal < (sMax * 0.33)) failCount++; 
                    if (!hasAnyMarks) anyMissing = true; 
                    subTotals[sub] = { terms: termVals, val: hasAnyMarks ? sTotal : 'AB', max: sMax, missing: !hasAnyMarks, fail: (hasAnyMarks && sTotal < (sMax * 0.33)) }; 
                    if(hasAnyMarks) grandTotal += sTotal;
                    maxPossible += sMax;
                }
            });
            
            const perc = maxPossible > 0 ? ((grandTotal / maxPossible) * 100) : 0; 
            // Also mapping Father's Name for the broadsheet!
            return { id: stu._id, rollNo: stu.rollNo, name: stu.name, fatherName: stu.fatherName, subTotals, grandTotal, perc, failCount, maxPossible, anyMissing }; 
        }); 
        
        processed.sort((a, b) => b.grandTotal - a.grandTotal); 
        let currentRank = 1; 
        processed.forEach((p, i) => { if (i > 0 && p.grandTotal < processed[i-1].grandTotal) currentRank = i + 1; p.rank = currentRank; }); 
        processed.sort((a, b) => { const ra = parseInt(a.rollNo) || 9999; const rb = parseInt(b.rollNo) || 9999; if (ra !== rb) return ra - rb; return a.name.localeCompare(b.name); }); 
        
        currentTabuData = { setups, students: processed, selectedTermNames: setups.map(s => s.termName).join(' + ') }; 
        renderTabulationGrid(); 
    }); 
}

// 🚨 UPDATED: Parent Disambiguation in Tabulation Broadsheet 🚨
function renderTabulationGrid() { 
    const panel = document.getElementById('tabu-grid-panel'); 
    const { setups, students } = currentTabuData; 
    let html = `<table class="marks-table tabu-table"><thead><tr><th rowspan="2">Roll</th><th rowspan="2" style="text-align:left;">Student Name</th>`; 
    let ths2 = `<tr>`; 
    
    currentTabuSubjs.forEach(sub => { 
        html += `<th colspan="${setups.length + 1}" style="color:var(--gold); border-bottom:1px solid var(--rim);">${escH(sub)}</th>`; 
        let subTotalMax = 0;
        setups.forEach(setup => { 
            const tMax = setup.assessments.reduce((s, a) => s + getSubMax(a, sub), 0); 
            subTotalMax += tMax;
            ths2 += `<th>${escH(setup.termName.substring(0, 8))}..<br><small>(${tMax})</small></th>`; 
        }); 
        ths2 += `<th style="color:var(--gold);">Total<br><small>(${subTotalMax})</small></th>`; 
    }); 
    
    html += `<th rowspan="2" style="color:var(--gold);">Grand Total</th><th rowspan="2" style="color:var(--gold);">%</th><th rowspan="2" style="color:var(--gold);">Grade</th><th rowspan="2" style="color:var(--gold);">Rank</th></tr>`; 
    ths2 += `</tr>`; 
    html += ths2 + `</thead><tbody>`; 
    
    students.forEach(s => { 
        // Showing Father's Name in Tabulation Grid too!
        let tds = `<td>${escH(s.rollNo || '-')}</td>
                   <td style="text-align:left;">
                       <div style="font-weight:600;">${escH(s.name)}</div>
                       <div style="font-size:11px; color:var(--muted); margin-top:2px;">${escH(s.fatherName ? 'D/o, S/o: ' + s.fatherName : '')}</div>
                   </td>`; 
        currentTabuSubjs.forEach(sub => { 
            const st = s.subTotals[sub]; 
            setups.forEach(setup => { tds += `<td class="${st.terms[setup._id] === 'AB' ? 'cell-missing' : ''}">${st.terms[setup._id]}</td>`; }); 
            tds += `<td class="${st.fail ? 'cell-fail' : ''}" style="font-weight:bold; background:rgba(212,168,67,0.1);">${st.val}</td>`; 
        }); 
        let grade = getGradeInfo(s.grandTotal, s.maxPossible).g; 
        tds += `<td style="font-weight:bold;">${s.grandTotal} <span style="font-size:10px; color:var(--silver);">/${s.maxPossible}</span></td><td style="font-weight:bold;">${s.perc.toFixed(1)}%</td><td style="font-weight:bold;">${grade}</td><td style="font-weight:bold; color:var(--gold);">${s.rank}</td>`; 
        html += `<tr>${tds}</tr>`; 
    }); 
    
    html += `</tbody></table>`; 
    panel.innerHTML = html; panel.style.display = 'block'; 
    document.getElementById('btn-export-tabu-pdf').style.display = 'inline-block'; document.getElementById('btn-export-tabu-excel').style.display = 'inline-block';
}

function exportTabulationExcel() {
  if (!currentTabuData) return; 
  const { setups, students } = currentTabuData; 
  const cSelect = document.getElementById('tabu-class-sel'); 
  const className = cSelect.options[cSelect.selectedIndex].text;
  
  const data = students.map(s => {
      // Offline Excel export also gets Father's Name for total clarity
      let obj = { "Roll No": s.rollNo || '-', "Student Name": s.name, "Father Name": s.fatherName || '-' };
      currentTabuSubjs.forEach(sub => { 
          if (setups.length > 1) { 
              setups.forEach(setup => { 
                  const tMax = setup.assessments.reduce((acc, a) => acc + getSubMax(a, sub), 0); 
                  obj[`${sub} - ${setup.termName} (${tMax})`] = s.subTotals[sub].terms[setup._id]; 
              }); 
              obj[`${sub} Total (${s.subTotals[sub].max})`] = s.subTotals[sub].val; 
          } else { 
              obj[`${sub} (${s.subTotals[sub].max})`] = s.subTotals[sub].val; 
          }
      });
      let grade = getGradeInfo(s.grandTotal, s.maxPossible).g;
      obj[`Grand Total (${s.maxPossible})`] = s.grandTotal; 
      obj["Percentage"] = s.perc.toFixed(1) + '%'; 
      obj["Grade"] = grade; 
      obj["Rank"] = s.rank; 
      return obj;
  });
  
  const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, ws, "Tabulation"); 
  XLSX.writeFile(wb, `Tabulation_${className}.xlsx`);
}

function printTabulationPDF() { 
    let printWin = window.open('', '_blank'); 
    let tableHtml = document.querySelector('.tabu-table').outerHTML.replace(/var\(--gold\)/g, '#000').replace(/var\(--rim\)/g, '#000'); 
    printWin.document.write(`<html><head><style>@page{size:landscape;} table{width:100%; border-collapse:collapse; font-size:10px; text-align:center;} th,td{border:1px solid #000; padding:3px;}</style></head><body><h2>Tabulation</h2>${tableHtml}<script>setTimeout(()=>window.print(), 500);</script></body></html>`); 
}

/* =========================================================================
   TAB 4: REPORT CARDS
   ========================================================================= */

function loadReportCardOptions() {
  const classChks = document.querySelectorAll('.rc-class-chk:checked');
  const termsContainer = document.getElementById('rc-terms-container'), subjectsContainer = document.getElementById('rc-subjects-container');
  
  if (classChks.length === 0) { termsContainer.innerHTML = '<span style="color:var(--muted)">Select a class.</span>'; subjectsContainer.innerHTML = '<span style="color:var(--muted)">Select a class.</span>'; return; }
  termsContainer.innerHTML = 'Loading...'; subjectsContainer.innerHTML = 'Loading...';
  
  const classIds = Array.from(classChks).map(c => c.value);
  Promise.all([ 
      Promise.all(classIds.map(cid => apiGet(`${API_ENDPOINTS.EXAM_SETUP}?session=${window.currentSession}&classId=${cid}`, true).catch(()=>({data:[]})))) , 
      Promise.all(classIds.map(cid => apiGet(API_ENDPOINTS.EXAM_SETUP.replace('/setup', '/class-subjects') + `?classId=${cid}`, true).catch(()=>({data:[]})))) 
  ]).then(results => {
      let uniqueTerms = new Map(), uniqueSubjs = new Map();
      results[0].forEach(res => { (res.data || []).forEach(s => uniqueTerms.set(s.termName, s.termName)); });
      results[1].forEach(res => { (res.data || []).forEach(s => uniqueSubjs.set(s.subjectName, s.subjectName)); });
      
      termsContainer.innerHTML = Array.from(uniqueTerms.values()).map(tName => `<label class="chk-label"><input type="checkbox" class="rc-term-chk" value="${escAttr(tName)}" checked> ${escH(tName)}</label>`).join('') || 'No terms found.';
      subjectsContainer.innerHTML = Array.from(uniqueSubjs.values()).map(sName => `<label class="chk-label"><input type="checkbox" class="rc-subj-chk" value="${escAttr(sName)}" checked> ${escH(sName)}</label>`).join('') || 'No subjects mapped.';
  });
}

function getStudentActiveSubjects(stuItem, allSubjects) {
    return allSubjects.filter(subName => {
        let isNA = false;
        stuItem.matchedSetups.forEach(setup => {
            const termData = stuItem.subjects[subName]?.[setup._id];
            setup.assessments.forEach(a => {
                if (termData && termData[a.name] && termData[a.name].status === 'na') isNA = true;
            });
        });
        return !isNA; // If it's NA, drop it from the list
    });
}

function generateReportCards() {
  const classChks = document.querySelectorAll('.rc-class-chk:checked'); 
  if(classChks.length === 0) return toast('Select Class', 'err');
  
  const termChks = document.querySelectorAll('.rc-term-chk:checked'), subjChks = document.querySelectorAll('.rc-subj-chk:checked');
  if(termChks.length === 0 || subjChks.length === 0) return toast('Select Terms & Subjects', 'err');

  const selectedTemplate = getSelectedTemplate(); 
  const selectedTermNames = Array.from(termChks).map(c => c.value); 
  cachedSubjectsForPrint = Array.from(subjChks).map(c => c.value);
  
  const btn = document.getElementById('btn-rep-cards'); const originalText = btn.textContent; btn.disabled = true; btn.textContent = 'Analyzing Data...';
  
  const classIds = Array.from(classChks).map(c => c.value); 
  const classNamesMap = {}; Array.from(classChks).forEach(c => { classNamesMap[c.value] = c.getAttribute('data-name'); });

  const reportPromises = classIds.map(cid => apiGet(`${API_ENDPOINTS.REPORT_CARDS}?session=${window.currentSession}&classId=${cid}`, true).then(res => ({ classId: cid, className: classNamesMap[cid], res: res })).catch(e => null));
  
  Promise.all(reportPromises).then(results => {
      let allStudents = [], missingCount = 0;
      results.forEach(classData => {
          if(!classData || !classData.res) return;
          const setups = classData.res.setups.filter(s => selectedTermNames.includes(s.termName)); 
          const studentsData = classData.res.data || [];
          
          studentsData.forEach(item => {
              item.matchedSetups = setups; item.className = classData.className; let hasMissing = false;
              cachedSubjectsForPrint.forEach(subName => {
                  setups.forEach(setup => { 
                      const termData = item.subjects[subName]?.[setup._id] || {}; 
                      setup.assessments.forEach(a => { if(!termData[a.name] || (termData[a.name].status === 'present' && termData[a.name].obtained === null)) { hasMissing = true; } }); 
                  });
              });
              if(hasMissing) missingCount++; allStudents.push(item);
          });
      });
      
      if(allStudents.length === 0) { btn.disabled = false; btn.textContent = originalText; return toast('No students found.', 'err'); }
      if(missingCount > 0) { if(!confirm(`⚠️ Warning: ${missingCount} student(s) have missing marks. Generate anyway?`)) { btn.disabled = false; btn.textContent = originalText; return; } }

      let oldFrame = document.getElementById('report-iframe'); if (oldFrame) oldFrame.remove();
      let iframe = document.createElement('iframe'); iframe.id = 'report-iframe'; iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'; document.body.appendChild(iframe);
      let doc = iframe.contentWindow.document; doc.open(); doc.write(getReportCardCSSAndHeader(selectedTemplate));
      
      let i = 0;
      function processChunk() {
         const chunk = allStudents.slice(i, i + 10);
         if (chunk.length === 0) { doc.write('</body></html>'); doc.close(); btn.textContent = 'Opening Print Dialog...'; setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); btn.disabled = false; btn.textContent = originalText; }, 1000); return; }
         
         let html = '';
         if (selectedTemplate === 'split') html = buildSplitReportCard(chunk, cachedSubjectsForPrint);
         else if (selectedTemplate === 'ivy') html = buildIvyReportCard(chunk, cachedSubjectsForPrint);
         else if (selectedTemplate === 'dashboard') html = buildDashboardReportCard(chunk, cachedSubjectsForPrint);
         else if (selectedTemplate === 'visual') html = buildVisualReportCard(chunk, cachedSubjectsForPrint);
         else if (selectedTemplate === 'board') html = buildBoardReportCard(chunk, cachedSubjectsForPrint);
         else html = buildClassicReportCard(chunk, cachedSubjectsForPrint);
         
         doc.write(html);
         i += 10; const pct = Math.min(100, Math.round((i / allStudents.length) * 100)); btn.textContent = `Generating PDF (${pct}%)...`; setTimeout(processChunk, 20);
      }
      processChunk();
  }).catch(e => { toast(e.message || 'Failed to process report cards', 'err'); btn.disabled = false; btn.textContent = originalText; });
}

/* =========================================================================
   TEMPLATE ENGINES (CSS & HTML BUILDERS)
   ========================================================================= */
function getReportCardCSSAndHeader(templateId) {
  let css = '';
  
  if (templateId === 'split') {
      css = `@page { size: A4 landscape; margin: 0; } 
             body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1e293b; margin:0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background:#fff;}
             .rc-page { width: 297mm; height: 210mm; page-break-after: always; display: flex; position: relative;}
             .left-bar { width: 32%; background: #0f172a; color: #fff; padding: 30px; display: flex; flex-direction: column; justify-content: space-between; }
             .right-bar { width: 68%; background: #fff; padding: 30px; display:flex; flex-direction: column;}
             .sch-logo { width: 80px; height: 80px; object-fit: contain; background: #fff; padding: 5px; border-radius: 10px; margin-bottom: 20px;}
             .sch-name { font-size: 22px; font-weight: 700; color: #f8fafc; line-height: 1.2; text-transform: uppercase;}
             .sch-addr { font-size: 11px; color: #94a3b8; margin-top: 5px; }
             .stu-info { margin-top: 40px; border-top: 1px solid #334155; padding-top: 20px;}
             .stu-info p { margin: 6px 0; font-size: 13px; color: #cbd5e1;}
             .stu-info strong { color: #fff; display:block; font-size: 16px; margin-bottom: 4px;}
             .report-title { font-size: 28px; color: #0f172a; font-weight: 300; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; text-transform:uppercase; letter-spacing: 1px;}
             .rc-table { width: 100%; border-collapse: collapse; text-align: center; }
             .rc-table th, .rc-table td { border-bottom: 1px solid #e2e8f0; padding: 10px 6px; }
             .rc-table th { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;}
             .rc-table .subj-col { text-align: left; font-weight: 600; color: #0f172a; font-size: 13px;}
             .rc-table tr:last-child td { border-bottom: 2px solid #0f172a; }
             .bottom-meta { margin-top: auto; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #64748b;}
             .sig-box { width: 150px; border-top: 1px solid #94a3b8; padding-top: 5px; text-align: center; margin-top: 40px; font-weight: 600; color:#fff;}
             .scale-box { background: #1e293b; padding: 15px; border-radius: 8px; margin-top:20px; font-size: 10px; color: #cbd5e1; line-height: 1.5;}`;
  } 
  else if (templateId === 'ivy') {
      css = `@page { size: A4 portrait; margin: 15mm; } 
             body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000; margin:0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
             .rc-page { width: 100%; height: 260mm; page-break-after: always; padding: 20px; box-sizing: border-box; border: 8px double #111; position: relative;}
             .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); opacity:0.04; width:400px; z-index:-1;}
             .header { text-align: center; margin-bottom: 30px; }
             .header h1 { margin: 0; font-size: 32px; font-weight: normal; text-transform: uppercase; letter-spacing: 2px;}
             .header h2 { margin: 5px 0 0; font-size: 16px; font-weight: normal; letter-spacing: 1px;}
             .header p { margin: 5px 0 0; font-size: 12px; font-style: italic; }
             .header-line { width: 60%; margin: 15px auto; border-top: 1px solid #000; }
             .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; padding: 0 20px; font-size: 13px;}
             .info-grid span { display: block; margin-bottom: 5px; }
             .rc-table { width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 30px;}
             .rc-table th, .rc-table td { border: 1px solid #000; padding: 6px; }
             .rc-table th { background: #f9f9f9; font-weight: bold; text-transform: uppercase; font-size: 11px; }
             .rc-table .subj-col { text-align: left; font-weight: bold; padding-left: 10px; text-transform: uppercase;}
             .summary-box { border: 2px solid #000; padding: 15px; margin-bottom: 30px; text-align: center; font-size: 14px; font-weight: bold; background: #fafafa;}
             .scale-text { font-size: 11px; text-align: center; margin-bottom: 40px; }
             .signatures { display: flex; justify-content: space-between; padding: 0 40px; font-style: italic; }
             .signatures div { width: 150px; border-top: 1px solid #000; text-align: center; padding-top: 5px; }`;
  }
  else if (templateId === 'dashboard') {
      css = `@page { size: A4 portrait; margin: 10mm; }
             body { font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; color: #1e293b; margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background:#f8fafc;}
             .rc-page { width: 100%; height: 270mm; page-break-after: always; padding: 25px; box-sizing: border-box; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0;}
             .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; }
             .sch-logo { max-height: 50px; border-radius: 8px;}
             .header-text h1 { margin: 0; font-size: 20px; color: #0f172a; font-weight: 700; text-transform: uppercase;}
             .header-text p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
             .badge { background: #eff6ff; color: #2563eb; padding: 6px 12px; border-radius: 20px; font-weight: 700; font-size: 12px; border: 1px solid #bfdbfe;}
             .stu-card { display: flex; align-items: center; padding: 15px; background: #f1f5f9; border-radius: 12px; margin-bottom: 20px; gap: 20px;}
             .stu-photo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1);}
             .stu-meta h2 { margin: 0 0 4px 0; font-size: 18px; color: #0f172a; }
             .stu-meta p { margin: 0; color: #475569; font-size: 13px; }
             .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 25px;}
             .kpi-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.02);}
             .kpi-title { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 5px; letter-spacing:0.5px;}
             .kpi-val { font-size: 22px; font-weight: 700; color: #0f172a;}
             .kpi-val.highlight { color: #10b981; }
             .rc-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;}
             .rc-table th, .rc-table td { padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0;}
             .rc-table th { background: #f8fafc; font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase;}
             .rc-table .subj-col { text-align: left; font-weight: 700; color: #0f172a; }
             .rc-table tr:last-child td { border-bottom: none; }
             .scale-text { font-size: 10px; text-align: center; color: #94a3b8; margin: 20px 0;}
             .signatures { display: flex; justify-content: space-between; margin-top: auto; padding-top: 30px; font-weight: 700; color: #475569;}
             .sig-line { width: 120px; border-top: 2px solid #e2e8f0; text-align: center; padding-top: 8px; }`;
  }
  else if (templateId === 'visual') {
      css = `@page { size: A4 landscape; margin: 10mm; }
             body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1f2937; margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background:#fff;}
             .rc-page { width: 100%; height: 185mm; page-break-after: always; padding: 0; box-sizing: border-box; display: flex; flex-direction: column;}
             .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 15px; margin-bottom: 20px; border-bottom: 4px solid #3b82f6;}
             .header h1 { margin: 0; font-size: 24px; color: #111; font-weight: 800; letter-spacing:-0.5px;}
             .header p { margin: 2px 0 0; color: #6b7280; font-size: 13px;}
             .info-strip { display: flex; background: #f3f4f6; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; justify-content: space-between; margin-bottom: 20px;}
             .rc-table { width: 100%; border-collapse: collapse; text-align: center; }
             .rc-table th, .rc-table td { padding: 12px 8px; border-bottom: 1px solid #e5e7eb;}
             .rc-table th { color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;}
             .rc-table .subj-col { text-align: left; font-weight: 700; font-size: 14px; width: 25%;}
             .bar-container { width: 100%; background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 4px;}
             .bar-fill { height: 100%; background: #3b82f6; border-radius: 4px;}
             .bar-wrapper { display: flex; flex-direction: column; align-items: center; }
             .score-text { font-weight: 800; font-size: 14px; }
             .bottom-section { margin-top: auto; }
             .scale-text { font-size: 11px; text-align: center; color: #9ca3af; margin-bottom: 20px;}
             .signatures { display: flex; justify-content: space-between; padding: 20px; background:#f9fafb; border-radius:8px; font-weight:700; color:#4b5563;}`;
  }
  else if (templateId === 'board') {
      css = `@page { size: A4 landscape; margin: 8mm; }
             body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
             .rc-page { width: 100%; height: 185mm; page-break-after: always; padding: 5px; box-sizing: border-box; border: 2px solid #000;}
             .inner-border { border: 1px solid #000; padding: 15px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; position:relative;}
             .header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 10px;}
             .header img { position: absolute; top: 15px; left: 15px; max-height: 80px;}
             .header h1 { margin: 0; font-size: 26px; font-weight: bold; text-transform: uppercase;}
             .header h2 { margin: 4px 0; font-size: 14px; font-weight: bold; }
             .info-grid { display: flex; justify-content: space-between; margin-bottom: 10px; text-transform: uppercase; font-weight: bold; font-size: 12px; border: 1px solid #000; padding: 8px;}
             .rc-table { width: 100%; border-collapse: collapse; text-align: center; border: 2px solid #000; margin-bottom: 10px;}
             .rc-table th, .rc-table td { border: 1px solid #000; padding: 5px; }
             .rc-table th { background: #eaeaea; font-weight: bold; text-transform: uppercase; font-size: 11px;}
             .rc-table .subj-col { text-align: left; font-weight: bold; text-transform: uppercase; padding-left: 5px;}
             .summary-row { font-weight: bold; background: #eaeaea; }
             .scale-text { font-size: 10px; text-align: center; margin-top: auto; margin-bottom: 15px; text-transform: uppercase;}
             .signatures { display: flex; justify-content: space-between; font-weight: bold; text-transform: uppercase; padding: 0 20px;}
             .signatures div { width: 180px; border-top: 1px dashed #000; text-align: center; padding-top: 5px; }`;
  }
  else {
      // THE ORIGINAL CLASSIC ACME TEMPLATE
      css = `@page { size: A4 landscape; margin: 8mm; }
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
             .empty-row td { padding: 8px 10px; text-align: left; }`;
  }
  
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Card</title><style>${css}</style></head><body>`;
}

// ─── ENGINE 1: ORIGINAL CLASSIC ACME ───
function buildClassicReportCard(studentsChunk, selectedSubjectsList) {
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
            html += `<th colspan="${setup.assessments.length + 2}">${escH(setup.termName)}</th>`;
          });
            
    html += `</tr><tr>`;
          sortedSetups.forEach(setup => {
            setup.assessments.forEach(a => { 
              html += `<th>${escH(a.name)}<br>(${a.maxMarks})</th>`; 
            });
            html += `<th>Marks<br>Obtained</th><th>Grade</th>`;
          });
    html += `</tr></thead><tbody>`;

    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      
      sortedSetups.forEach(setup => {
        let termTotal = 0; let termMax = 0;
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => {
          const aMax = getSubMax(a, subName);
          const markObj = termData[a.name];
          if (markObj && markObj.status === 'present') {
            const val = Number(markObj.obtained || 0);
            termTotal += val;
            if (aMax !== a.maxMarks) html += `<td>${val} <span style="font-size:10px; color:#555;">/${aMax}</span></td>`;
            else html += `<td>${val}</td>`;
          } else if (markObj) {
            html += `<td>${markObj.status === 'absent' ? 'AB' : 'M'}</td>`;
          } else {
            html += `<td></td>`;
          }
          termMax += aMax;
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

// ─── ENGINE 2: CORPORATE SPLIT ───
function buildSplitReportCard(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name', schAddr = getVal('sch-addr') || 'School Address', sessionText = getVal('rc-session-text') || window.currentSession, scaleText = getVal('rc-scale-text');
  let logoHtml = schoolLogoUrl ? `<img src="${escAttr(schoolLogoUrl)}" class="sch-logo">` : '<div class="sch-logo" style="display:flex;align-items:center;justify-content:center;color:#94a3b8;">LOGO</div>';
  let html = '';
  
  studentsChunk.forEach(item => {
    const stu = item.student, subjectsDict = item.subjects, className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    let grandTotal = 0; let grandMax = 0;
    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => {
        sortedSetups.forEach(setup => {
            const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
            setup.assessments.forEach(a => {
                if (termData[a.name] && termData[a.name].status === 'present') { grandTotal += Number(termData[a.name].obtained || 0); }
                grandMax += getSubMax(a, subName);
            });
        });
    });
    
    const finalGr = getGradeInfo(grandTotal, grandMax).g; 
    const finalPerc = grandMax > 0 ? ((grandTotal/grandMax)*100).toFixed(1) : 0;

    html += `<div class="rc-page">
      <div class="left-bar">
         <div>
             ${logoHtml}
             <div class="sch-name">${escH(schName)}</div>
             <div class="sch-addr">${escH(schAddr)}</div>
             
             <div class="stu-info">
                 <strong>${escH(stu.name)}</strong>
                 <p>Class: ${escH(className)} &nbsp;|&nbsp; Roll No: ${escH(stu.rollNo || '—')}</p>
                 <p>D.O.B: ${stu.dateOfBirth ? new Date(stu.dateOfBirth).toLocaleDateString('en-GB') : '—'}</p>
                 <p>Parent: ${escH(stu.fatherName || stu.motherName || '—')}</p>
             </div>
             
             <div class="scale-box">
                 <div style="font-weight:700; color:#fff; margin-bottom:5px; font-size:12px;">ACADEMIC SUMMARY</div>
                 <div>Total Score: <span style="color:#fff; font-weight:700;">${grandTotal} / ${grandMax}</span></div>
                 <div>Percentage: <span style="color:#10b981; font-weight:700; font-size:14px;">${finalPerc}%</span></div>
                 <div>Overall Grade: <span style="color:#fbbf24; font-weight:700; font-size:14px;">${finalGr}</span></div>
             </div>
         </div>
         
         <div>
            <div class="scale-box" style="margin-top:0;"><strong>Grading Scale:</strong><br>${escH(scaleText).replace(/\|/g, '<br>')}</div>
            <div class="sig-box">Principal Signature</div>
         </div>
      </div>
      
      <div class="right-bar">
         <div class="report-title">Academic Performance <span style="font-size:14px; font-weight:700; color:#94a3b8; float:right; margin-top:12px;">SESSION: ${escH(sessionText)}</span></div>
         
         <table class="rc-table"><thead><tr><th class="subj-col">Subjects</th>`;
          sortedSetups.forEach(setup => { html += `<th colspan="${setup.assessments.length + 2}">${escH(setup.termName)}</th>`; });
    html += `</tr><tr><th></th>`;
          sortedSetups.forEach(setup => { setup.assessments.forEach(a => { html += `<th>${escH(a.name)}(${a.maxMarks})</th>`; }); html += `<th>Total</th><th>Grade</th>`; });
    html += `</tr></thead><tbody>`;

    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      sortedSetups.forEach(setup => {
        let termTotal = 0, termMax = 0; const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        setup.assessments.forEach(a => {
          const aMax = getSubMax(a, subName);
          const markObj = termData[a.name];
          if (markObj && markObj.status === 'present') { 
              const val = Number(markObj.obtained || 0); termTotal += val; 
              html += `<td>${val}${aMax !== a.maxMarks ? `<span style="font-size:10px; color:#888;">/${aMax}</span>` : ''}</td>`; 
          } 
          else { html += `<td style="color:#cbd5e1;">-</td>`; }
          termMax += aMax;
        });
        const gradeObj = getGradeInfo(termTotal, termMax); 
        html += `<td style="font-weight:700;">${termTotal || ''}</td><td style="font-weight:700; color:#3b82f6;">${termTotal ? gradeObj.g : ''}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>
         <div class="bottom-meta">
            <div><strong>Teacher Remarks:</strong> ___________________________________________________________</div>
            <div class="sig-box" style="margin-top:0; color:#0f172a; width:200px;">Class Teacher</div>
         </div>
      </div>
    </div>`;
  });
  return html;
}

// ─── ENGINE 3: IVY LEAGUE TRANSCRIPT ───
function buildIvyReportCard(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name', schAddr = getVal('sch-addr') || 'School Address', sessionText = getVal('rc-session-text') || window.currentSession, scaleText = getVal('rc-scale-text');
  let logoHtml = schoolLogoUrl ? `<img src="${escAttr(schoolLogoUrl)}" class="watermark">` : '';
  let html = '';
  
  studentsChunk.forEach(item => {
    const stu = item.student, subjectsDict = item.subjects, className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    let grandTotal = 0; let grandMax = 0;
    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => { 
        sortedSetups.forEach(setup => {
            const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
            setup.assessments.forEach(a => { 
                if (termData[a.name] && termData[a.name].status === 'present') { grandTotal += Number(termData[a.name].obtained || 0); } 
                grandMax += getSubMax(a, subName); 
            }); 
        }); 
    });
    const finalGr = getGradeInfo(grandTotal, grandMax).g; 
    const finalPerc = grandMax > 0 ? ((grandTotal/grandMax)*100).toFixed(1) : 0;

    html += `<div class="rc-page">
      ${logoHtml}
      <div class="header">
          <h1>${escH(schName)}</h1>
          <p>${escH(schAddr)}</p>
          <div class="header-line"></div>
          <h2>OFFICIAL TRANSCRIPT OF ACADEMIC RECORD</h2>
          <p>Session: ${escH(sessionText)}</p>
      </div>
      
      <div class="info-grid">
          <div>
              <span><strong>Student Name:</strong> ${escH(stu.name)}</span>
              <span><strong>Date of Birth:</strong> ${stu.dateOfBirth ? new Date(stu.dateOfBirth).toLocaleDateString('en-GB') : '—'}</span>
          </div>
          <div style="text-align:right;">
              <span><strong>Class:</strong> ${escH(className)}</span>
              <span><strong>Student ID / Roll No:</strong> ${escH(stu.rollNo || '—')}</span>
          </div>
      </div>

      <table class="rc-table"><thead><tr><th rowspan="2" class="subj-col">Course / Subject</th>`;
          sortedSetups.forEach(setup => { html += `<th colspan="2">${escH(setup.termName)}</th>`; });
    html += `<th rowspan="2">Cumulative<br>Credits/Marks</th><th rowspan="2">Final<br>Grade</th></tr><tr>`;
          sortedSetups.forEach(() => { html += `<th>Score</th><th>Grade</th>`; });
    html += `</tr></thead><tbody>`;

    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      let subjTotal = 0; let subjMax = 0;
      
      sortedSetups.forEach(setup => {
        let termTotal = 0, termMax = 0; 
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => { 
            const markObj = termData[a.name]; 
            if (markObj && markObj.status === 'present') { termTotal += Number(markObj.obtained || 0); } 
            termMax += getSubMax(a, subName); 
        });
        
        const termGr = getGradeInfo(termTotal, termMax).g; 
        html += `<td>${termTotal || '-'}</td><td>${termTotal ? termGr : '-'}</td>`;
        subjTotal += termTotal; subjMax += termMax;
      });
      
      const subjGr = getGradeInfo(subjTotal, subjMax).g;
      html += `<td><strong>${subjTotal || '-'}</strong></td><td><strong>${subjTotal ? subjGr : '-'}</strong></td></tr>`;
    });

    html += `</tbody></table>
      
      <div class="summary-box">
          OVERALL ACADEMIC STANDING: &nbsp;&nbsp;&nbsp; TOTAL: ${grandTotal} / ${grandMax} &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp; PERCENTAGE: ${finalPerc}% &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp; FINAL GRADE: ${finalGr}
      </div>
      
      <div class="scale-text"><strong>GRADING LEGEND:</strong><br>${escH(scaleText)}</div>
      
      <div class="signatures" style="margin-top:auto;">
          <div>Registrar / Teacher</div>
          <div>Head of Institution</div>
      </div>
    </div>`;
  });
  return html;
}

// ─── ENGINE 4: SAAS DASHBOARD ───
function buildDashboardReportCard(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name', schAddr = getVal('sch-addr') || 'School Address', sessionText = getVal('rc-session-text') || window.currentSession, scaleText = getVal('rc-scale-text');
  let logoHtml = schoolLogoUrl ? `<img src="${escAttr(schoolLogoUrl)}" class="sch-logo">` : '';
  let html = '';
  
  studentsChunk.forEach(item => {
    const stu = item.student, subjectsDict = item.subjects, className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    let grandTotal = 0; let grandMax = 0;
    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => { 
        sortedSetups.forEach(setup => {
            const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
            setup.assessments.forEach(a => { 
                if (termData[a.name] && termData[a.name].status === 'present') { grandTotal += Number(termData[a.name].obtained || 0); } 
                grandMax += getSubMax(a, subName); 
            }); 
        }); 
    });
    
    const finalGr = getGradeInfo(grandTotal, grandMax).g; 
    const finalPerc = grandMax > 0 ? ((grandTotal/grandMax)*100).toFixed(1) : 0;
    var photoHtml = stu.photo ? `<img src="${escAttr(stu.photo)}" class="stu-photo">` : `<div class="stu-photo" style="background:#cbd5e1; display:flex; align-items:center; justify-content:center; color:#fff;">👤</div>`;

    html += `<div class="rc-page">
      <div class="header">
          <div class="header-text"><h1>${escH(schName)}</h1><p>${escH(schAddr)}</p></div>
          ${logoHtml}
          <div class="badge">SESSION ${escH(sessionText)}</div>
      </div>
      
      <div class="stu-card">
          ${photoHtml}
          <div class="stu-meta">
              <h2>${escH(stu.name)}</h2>
              <p>Class: ${escH(className)} &nbsp;•&nbsp; Roll No: ${escH(stu.rollNo || '—')} &nbsp;•&nbsp; Parent: ${escH(stu.fatherName || '—')}</p>
          </div>
      </div>

      <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-title">Total Marks</div><div class="kpi-val">${grandTotal}<span style="font-size:12px; color:#94a3b8;">/${grandMax}</span></div></div>
          <div class="kpi-card"><div class="kpi-title">Percentage</div><div class="kpi-val highlight">${finalPerc}%</div></div>
          <div class="kpi-card"><div class="kpi-title">Overall Grade</div><div class="kpi-val" style="color:#f59e0b;">${finalGr}</div></div>
          <div class="kpi-card"><div class="kpi-title">Attendance</div><div class="kpi-val">___<span style="font-size:12px; color:#94a3b8;">/___</span></div></div>
      </div>

      <table class="rc-table"><thead><tr><th class="subj-col">Subjects</th>`;
          sortedSetups.forEach(setup => { html += `<th colspan="2">${escH(setup.termName)}</th>`; });
    html += `<th>Final Total</th><th>Grade</th></tr></thead><tbody>`;

    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      let subjTotal = 0; let subjMax = 0;
      
      sortedSetups.forEach(setup => {
        let termTotal = 0, termMax = 0; 
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => { 
            const markObj = termData[a.name]; 
            if (markObj && markObj.status === 'present') { termTotal += Number(markObj.obtained || 0); } 
            termMax += getSubMax(a, subName); 
        });
        
        const termGr = getGradeInfo(termTotal, termMax).g; 
        html += `<td>${termTotal || '-'}</td><td style="color:#64748b;">${termTotal ? termGr : '-'}</td>`;
        subjTotal += termTotal; subjMax += termMax;
      });
      
      const subjGr = getGradeInfo(subjTotal, subjMax).g;
      html += `<td><strong>${subjTotal || '-'}</strong></td><td><strong style="color:#3b82f6;">${subjTotal ? subjGr : '-'}</strong></td></tr>`;
    });

    html += `</tbody></table>
      <div class="scale-text">${escH(scaleText)}</div>
      <div class="signatures"><div class="sig-line">Class Teacher</div><div class="sig-line">Principal</div><div class="sig-line">Parent</div></div>
    </div>`;
  });
  return html;
}

// ─── ENGINE 5: VISUAL INFOGRAPHIC ───
function buildVisualReportCard(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name', sessionText = getVal('rc-session-text') || window.currentSession, scaleText = getVal('rc-scale-text');
  let html = '';
  
  studentsChunk.forEach(item => {
    const stu = item.student, subjectsDict = item.subjects, className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    html += `<div class="rc-page">
      <div class="header">
          <div><h1>${escH(schName)}</h1><p>Performance Analytics & Report Card</p></div>
          <div style="text-align:right;"><div style="font-weight:800; font-size:18px; color:#3b82f6;">${escH(sessionText)}</div></div>
      </div>
      
      <div class="info-strip">
          <div>STUDENT: <span style="color:#3b82f6;">${escH(stu.name)}</span></div>
          <div>CLASS: <span style="color:#3b82f6;">${escH(className)}</span></div>
          <div>ROLL NO: <span style="color:#3b82f6;">${escH(stu.rollNo || '—')}</span></div>
      </div>

      <table class="rc-table"><thead><tr><th class="subj-col">Subject Analysis</th>`;
          sortedSetups.forEach(setup => { html += `<th>${escH(setup.termName)}</th>`; });
    html += `<th>Cumulative Score</th><th>Progress Bar</th><th>Grade</th></tr></thead><tbody>`;

    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      let subjTotal = 0; let subjMax = 0;
      
      sortedSetups.forEach(setup => {
        let termTotal = 0, termMax = 0; 
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => { 
            const markObj = termData[a.name]; 
            if (markObj && markObj.status === 'present') { termTotal += Number(markObj.obtained || 0); } 
            termMax += getSubMax(a, subName); 
        });
        
        html += `<td><span class="score-text">${termTotal || '-'}</span> <span style="font-size:10px; color:#9ca3af;">/${termMax}</span></td>`;
        subjTotal += termTotal; subjMax += termMax;
      });
      
      const subjGr = getGradeInfo(subjTotal, subjMax).g;
      const subjPerc = subjMax > 0 ? (subjTotal/subjMax)*100 : 0;
      
      const barHtml = `<div class="bar-container"><div class="bar-fill" style="width:${subjPerc}%; background:${subjPerc > 80 ? '#10b981' : subjPerc > 40 ? '#3b82f6' : '#ef4444'};"></div></div>`;
      
      html += `<td><span class="score-text" style="color:#111;">${subjTotal || '-'}</span> <span style="font-size:10px; color:#9ca3af;">/${subjMax}</span></td>
               <td style="width:20%;">${barHtml}</td>
               <td><span class="score-text" style="color:#111;">${subjTotal ? subjGr : '-'}</span></td></tr>`;
    });

    html += `</tbody></table>
      
      <div class="bottom-section">
          <div class="scale-text">Grading Scale: ${escH(scaleText)}</div>
          <div class="signatures">
              <div>Remarks: _________________________________________</div>
              <div>Authorized Signatory</div>
          </div>
      </div>
    </div>`;
  });
  return html;
}

// ─── ENGINE 6: STRICT BOARD (CBSE STYLE) ───
function buildBoardReportCard(studentsChunk, selectedSubjectsList) {
  const schName = getVal('sch-name') || 'Your School Name', schAddr = getVal('sch-addr') || 'School Address', sessionText = getVal('rc-session-text') || window.currentSession, scaleText = getVal('rc-scale-text');
  let logoHtml = schoolLogoUrl ? `<img src="${escAttr(schoolLogoUrl)}">` : '';
  let html = '';
  
  studentsChunk.forEach(item => {
    const stu = item.student, subjectsDict = item.subjects, className = item.className;
    const sortedSetups = item.matchedSetups.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
   let grandTotal = 0; let grandMax = 0;
    const activeSubjects = getStudentActiveSubjects(item, selectedSubjectsList);
    activeSubjects.forEach(subName => { 
        sortedSetups.forEach(setup => {
            const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
            setup.assessments.forEach(a => { 
                if (termData[a.name] && termData[a.name].status === 'present') { grandTotal += Number(termData[a.name].obtained || 0); } 
                grandMax += getSubMax(a, subName); 
            }); 
        }); 
    });
    
    const finalGr = getGradeInfo(grandTotal, grandMax).g; 
    const finalPerc = grandMax > 0 ? ((grandTotal/grandMax)*100).toFixed(1) : 0;

    html += `<div class="rc-page"><div class="inner-border">
      <div class="header">
          ${logoHtml}
          <h1>${escH(schName)}</h1>
          <h2>${escH(schAddr)}</h2>
          <h2>ACADEMIC PERFORMANCE RECORD - SESSION ${escH(sessionText)}</h2>
      </div>
      
      <div class="info-grid">
        <div style="flex:1;">
            STUDENT NAME: ${escH(stu.name)}<br><br>
            MOTHER'S NAME: ${escH(stu.motherName || '—')}<br><br>
            FATHER'S NAME: ${escH(stu.fatherName || '—')}
        </div>
        <div style="flex:1; text-align:right;">
            CLASS/SEC: ${escH(className)}<br><br>
            ROLL NO: ${escH(stu.rollNo || '—')}<br><br>
            D.O.B: ${stu.dateOfBirth ? new Date(stu.dateOfBirth).toLocaleDateString('en-GB') : '—'}
        </div>
      </div>

      <table class="rc-table"><thead><tr><th rowspan="2" class="subj-col">Scholastic Areas (Subjects)</th>`;
          sortedSetups.forEach(setup => { html += `<th colspan="${setup.assessments.length + 2}">${escH(setup.termName)}</th>`; });
    html += `</tr><tr>`;
          sortedSetups.forEach(setup => { 
              let termMaxTotal = 0; 
              setup.assessments.forEach(a => { 
                  html += `<th>${escH(a.name)}<br>(${a.maxMarks})</th>`; 
              }); 
              html += `<th>Total</th><th>Gr</th>`; 
          });
    html += `</tr></thead><tbody>`;

    activeSubjects.forEach(subName => {
      html += `<tr><td class="subj-col">${escH(subName)}</td>`;
      sortedSetups.forEach(setup => {
        let termTotal = 0, termMax = 0; 
        const termData = subjectsDict[subName] ? (subjectsDict[subName][setup._id] || {}) : {}; 
        
        setup.assessments.forEach(a => {
          const aMax = getSubMax(a, subName);
          const markObj = termData[a.name];
          if (markObj && markObj.status === 'present') { 
              const val = Number(markObj.obtained || 0); 
              termTotal += val; 
              html += `<td>${val}${aMax !== a.maxMarks ? `<span style="font-size:10px; color:#888;">/${aMax}</span>` : ''}</td>`; 
          } else if (markObj) { 
              html += `<td>${markObj.status === 'absent' ? 'AB' : 'M'}</td>`; 
          } else { 
              html += `<td></td>`; 
          }
          termMax += aMax;
        });
        
        const gradeObj = getGradeInfo(termTotal, termMax); 
        html += `<td class="summary-row">${termTotal || ''}</td><td class="summary-row">${termTotal ? gradeObj.g : ''}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>
      
      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px; margin-bottom:10px;">
          <div style="border:1px solid #000; padding:10px; flex:1; margin-right:10px;">GRAND TOTAL: ${grandTotal} / ${grandMax}</div>
          <div style="border:1px solid #000; padding:10px; flex:1; margin-right:10px;">PERCENTAGE: ${finalPerc}%</div>
          <div style="border:1px solid #000; padding:10px; flex:1;">OVERALL GRADE: ${finalGr}</div>
      </div>

      <div class="scale-text"><strong>GRADING SCALE:</strong> ${escH(scaleText)}</div>
      
      <div class="signatures">
          <div>CLASS TEACHER</div>
          <div>EXAMINER</div>
          <div>PRINCIPAL</div>
      </div>
    </div></div>`;
  });
  return html;
}

/* ================= UTILS ================= */
function getVal(id){ var el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
function setVal(id,v){ document.getElementById(id).value = v || ''; }
function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
var _tt;
function toast(msg, kind){ 
    var t = document.getElementById('toast'); 
    t.textContent = msg; 
    t.className = 'toast show' + (kind==='err'?' err':''); 
    clearTimeout(_tt); 
    _tt = setTimeout(() => t.className='toast', 3000); 
}