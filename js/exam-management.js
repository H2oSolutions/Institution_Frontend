/* ─────────────────────────────────────────────────────────────
   EXAM MANAGEMENT · ADMIT CARDS  (standalone, read-only, print)
   Crash-proofing: Batch preloading, Native High-Limit Fetch,
   Automatic Class Grouping, and perfectly aligned footers.
   ───────────────────────────────────────────────────────────── */
var HDR_BASE = 'examAdmitHeader';
var hdrKey   = 'examAdmitHeader';
var students = [];
var selected = {};
var currentClassName = '';
var schoolLogoUrl = null;

/* ---- boot ---- */
(function boot(){
  var token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
  if (!token) { window.location.href = 'login.html'; return; }
  loadHeader();
  loadClasses();
  ['sch-name','sch-addr','sch-phone','sch-email'].forEach(function(id){
    document.getElementById(id).addEventListener('input', saveHeader);
  });
})();

function goDashboard(){ window.location.href = 'dashboard.html'; }

/* Header */
function loadHeader(){
  apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true).then(function(res){
    var d = (res && res.data) || {};
    var code = d.institutionCode || localStorage.getItem('institutionCode') || 'default';
    hdrKey = HDR_BASE + ':' + code;
    var saved = readSaved();

    setVal('sch-name', d.name || saved.name || '');
    setVal('sch-addr', d.address ? composeAddress(d.address) : (saved.addr || ''));
    var cf = d.contactsFull || {};
    var realPhone = [cf.mobile1, cf.mobile2].filter(Boolean).join(', ');
    setVal('sch-phone', saved.phone || realPhone || '');
    setVal('sch-email', saved.email || cf.email || '');
    if (d.logo)        { schoolLogoUrl = d.logo;     showLogo(d.logo); }
    else if (saved.logo){ schoolLogoUrl = saved.logo; showLogo(saved.logo); }
    else               { schoolLogoUrl = null;       showLogo(null); }
    saveHeader();
  }).catch(function(){
    hdrKey = HDR_BASE + ':' + (localStorage.getItem('institutionCode') || 'default');
    var saved = readSaved();
    setVal('sch-name', saved.name || '');
    setVal('sch-addr', saved.addr || '');
    setVal('sch-phone', saved.phone || '');
    setVal('sch-email', saved.email || '');
    if (saved.logo) { schoolLogoUrl = saved.logo; showLogo(saved.logo); }
  });
}

function readSaved(){ try { return JSON.parse(localStorage.getItem(hdrKey) || '{}'); } catch(e){ return {}; } }

function composeAddress(a){
  if (!a) return '';
  if (typeof a === 'string') return a;
  if (a.fullAddress) return a.fullAddress;
  return [a.city, a.district, a.state].filter(Boolean).join(', ');
}

function saveHeader(){
  var obj = { name:getVal('sch-name'), addr:getVal('sch-addr'), phone:getVal('sch-phone'), email:getVal('sch-email'), logo:schoolLogoUrl || null };
  try { localStorage.setItem(hdrKey, JSON.stringify(obj)); } catch(e){}
}

/* Logo */
function showLogo(url){
  var img = document.getElementById('logo-prev'), ph = document.getElementById('logo-ph');
  if (url){ img.src = url; img.style.display='block'; ph.style.display='none'; }
  else { img.style.display='none'; ph.style.display='flex'; }
}

function onLogoPick(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 3*1024*1024){ toast('Logo too large (max 3MB)','err'); return; }
  var reader = new FileReader();
  reader.onload = function(){ schoolLogoUrl = reader.result; showLogo(reader.result); saveHeader(); toast('Logo set for admit cards'); document.getElementById('logo-hint').textContent='Saved on this device. Used on every card.'; };
  reader.readAsDataURL(file); 
}

/* Classes */
function loadClasses(){
  apiGet(API_ENDPOINTS.CLASSES, true).then(function(r){
    var list = ((r && r.data) || []).filter(function(c){ return c.isActive !== false; });
    var sel = document.getElementById('class-sel');
    
    sel.innerHTML = '<option value="">Select a class…</option><option value="all">All Classes (Entire School)</option>';
    
    list.forEach(function(c){
      var o = document.createElement('option');
      o.value = c._id; o.textContent = c.className || c.name || 'Class';
      sel.appendChild(o);
    });
  }).catch(function(){ toast('Failed to load classes','err'); });
}

/* STUDENTS - WITH AUTOMATIC CLASS GROUPING */
function loadStudents(){
  var sel = document.getElementById('class-sel');
  var cid = sel.value;
  
  if (!cid){ 
    toast('Pick a class first','err'); 
    return; 
  }
  
  var btn = document.getElementById('load-btn');
  btn.disabled = true; 
  btn.textContent = 'Loading…';
  
  currentClassName = sel.options[sel.selectedIndex].text;

  var bypassCache = '&_t=' + new Date().getTime();
  var url = API_ENDPOINTS.STUDENTS + '?limit=9999' + bypassCache;
  
  if (cid !== 'all') {
    url += '&classId=' + encodeURIComponent(cid);
  }

  apiGet(url, true)
    .then(function(r){
      students = (r && r.data) || [];
      
      students.sort(function(a, b) {
        var classA = className(a).toLowerCase();
        var classB = className(b).toLowerCase();
        if (classA < classB) return -1;
        if (classA > classB) return 1;
        
        var nameA = (a.name || '').toLowerCase();
        var nameB = (b.name || '').toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        
        return 0;
      });
      
      selected = {};
      renderStudents();
      document.getElementById('stu-panel').style.display = 'block';
      document.getElementById('stu-cls').textContent = '· ' + currentClassName + ' · ' + students.length + ' students';
      
      if (!students.length) {
        toast('No students found for this selection','err');
      } else {
        toast('Loaded ' + students.length + ' students!', 'success');
      }
    })
    .catch(function(err){ 
      toast('Failed to load students. Check console.','err'); 
    })
    .finally(function(){ 
      btn.disabled = false; 
      btn.textContent = 'Load Students'; 
    });
}

/* UI Rendering */
function renderStudents(){
  var grid = document.getElementById('stu-grid');
  if (!students.length){ grid.innerHTML = '<div class="empty">No students to show.</div>'; updateCount(); return; }
  
  grid.innerHTML = students.map(function(s){
    var photo = s.photo
      ? '<img class="stu-photo" loading="lazy" src="'+escAttr(s.photo)+'" onerror="this.outerHTML=\'<div class=&quot;stu-photo-ph&quot;>👤</div>\'">'
      : '<div class="stu-photo-ph">👤</div>';
    
    var subText = (document.getElementById('class-sel').value === 'all') 
                  ? '<b>' + escH(className(s)) + '</b> · ' + escH(s.fatherName||'')
                  : escH(s.fatherName||'');

    return '<div class="stu-card" data-id="'+escAttr(s._id)+'" onclick="toggleStu(this)">'+
             photo+
             '<div class="stu-meta"><div class="stu-name">'+escH(s.name||'—')+'</div>'+
             '<div class="stu-sub">'+subText+'</div></div>'+
             '<div class="stu-chk">✓</div>'+
           '</div>';
  }).join('');
  updateCount();
}

function toggleStu(el){
  var id = el.getAttribute('data-id');
  if (selected[id]){ delete selected[id]; el.classList.remove('on'); }
  else { selected[id]=true; el.classList.add('on'); }
  updateCount();
}

function selectAll(on){
  document.querySelectorAll('.stu-card').forEach(function(el){
    var id = el.getAttribute('data-id');
    if (on){ selected[id]=true; el.classList.add('on'); }
    else { delete selected[id]; el.classList.remove('on'); }
  });
  updateCount();
}

function updateCount(){
  var n = Object.keys(selected).length;
  document.getElementById('sel-count').textContent = n + ' selected';
  document.getElementById('gen-btn').disabled = n === 0;
}

/* Admit Card Generation */
function selectedStudents(){ return students.filter(function(s){ return selected[s._id]; }); }

function onGenerate(){
  var list = selectedStudents();
  if (!list.length){ toast('Select at least one student','err'); return; }
  
  var miss = [];
  if (!schoolLogoUrl) miss.push('🔲 School logo — no logo set (header prints without it)');
  var noPhoto = list.filter(function(s){ return !s.photo; }).length;
  if (noPhoto) miss.push('👤 Student photos — ' + noPhoto + ' of ' + list.length + ' have no photo (placeholder box shown).');
  if (!getVal('sch-phone') && !getVal('sch-email')) miss.push('✉️ Phone/Email — left blank in the header');

  if (miss.length){
    var ul = document.getElementById('miss-list');
    ul.innerHTML = miss.map(function(m){ return '<li>'+escH(m)+'</li>'; }).join('');
    document.getElementById('miss-overlay').classList.add('show');
  } else {
    proceedGenerate();
  }
}

function closeMiss(){ document.getElementById('miss-overlay').classList.remove('show'); }

function proceedGenerate(){
  closeMiss();
  var list = selectedStudents();
  saveHeader();
  
  var urls = [];
  if (schoolLogoUrl) urls.push(schoolLogoUrl);
  list.forEach(function(s){ if (s.photo) urls.push(s.photo); });
  
  var uniqueUrls = urls.filter(function(item, pos) { return urls.indexOf(item) === pos; });
  
  preloadImages(uniqueUrls, function(){
    buildAndPrint(list);
  });
}

function preloadImages(urls, done){
  var overlay = document.getElementById('prog-overlay');
  var fill = document.getElementById('prog-fill');
  var txt = document.getElementById('prog-text');
  overlay.classList.add('show');
  
  var total = urls.length, loaded = 0;
  if (!total){ fill.style.width='100%'; setTimeout(function(){ overlay.classList.remove('show'); done(); }, 120); return; }
  
  var concurrencyLimit = 15; 
  var index = 0;

  function loadNext() {
    if (index >= total) return;
    var u = urls[index++];
    var img = new Image();
    var settled = false;

    function onSettle() {
      if (!settled) {
        settled = true;
        loaded++;
        fill.style.width = Math.round((loaded / total) * 100) + '%';
        txt.textContent = 'Loading images… ' + loaded + ' / ' + total;
        
        if (loaded >= total) {
          setTimeout(function(){ overlay.classList.remove('show'); done(); }, 150);
        } else {
          loadNext(); 
        }
      }
    }

    var t = setTimeout(onSettle, 8000); 
    img.onload = function(){ clearTimeout(t); onSettle(); };
    img.onerror = function(){ clearTimeout(t); onSettle(); };
    img.src = u;
  }

  for (var i = 0; i < Math.min(concurrencyLimit, total); i++) {
    loadNext();
  }
}

function buildAndPrint(list){
  var hdr = {
    name: getVal('sch-name') || 'School Name',
    addr: getVal('sch-addr') || '',
    phone: getVal('sch-phone') || '',
    email: getVal('sch-email') || '',
    logo: schoolLogoUrl || ''
  };
  
  var cards = list.map(function(s){ return cardHTML(s, hdr); }).join('');
  
  var old = document.getElementById('admit-print-frame');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  var iframe = document.createElement('iframe');
  iframe.id = 'admit-print-frame';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  var doc = iframe.contentWindow.document;
  doc.open(); doc.write(printDoc(cards)); doc.close();
  
  waitForWinImages(iframe.contentWindow, function(){
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e){}
    setTimeout(function(){ if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 60000);
  });
}

function waitForWinImages(win, cb){
  try{
    var imgs = win.document.images;
    if (!imgs || !imgs.length){ setTimeout(cb, 200); return; }
    var total = imgs.length, done = 0, called = false;
    function fin(){ if(!called){ called=true; cb(); } }
    
    var timeoutDuration = Math.max(10000, imgs.length * 50); 
    var hardStop = setTimeout(fin, timeoutDuration);
    
    function one(){ done++; if (done>=total){ clearTimeout(hardStop); setTimeout(fin, 250); } }
    for (var i=0;i<imgs.length;i++){
      if (imgs[i].complete){ one(); }
      else { imgs[i].addEventListener('load', one); imgs[i].addEventListener('error', one); }
    }
  } catch(e){ setTimeout(cb, 400); }
}

function cardHTML(s, hdr){
  var photo = s.photo
    ? '<img class="ac-photo" src="'+escAttr(s.photo)+'" onerror="this.style.visibility=\'hidden\'">'
    : '<div class="ac-photo ac-photo-ph">Photo</div>';
  var logo = hdr.logo
    ? '<img class="ac-logo" src="'+escAttr(hdr.logo)+'" onerror="this.style.display=\'none\'">'
    : '';
  var contactLine = [hdr.phone ? 'Ph: '+hdr.phone : '', hdr.email ? 'Email: '+hdr.email : ''].filter(Boolean).join(' · ');
  return ''+
  '<div class="ac">'+
    '<div class="ac-head">'+
      logo+
      '<div class="ac-school">'+
        '<div class="ac-name">'+escH(hdr.name)+'</div>'+
        (hdr.addr ? '<div class="ac-addr">'+escH(hdr.addr)+'</div>' : '')+
        (contactLine ? '<div class="ac-addr">'+escH(contactLine)+'</div>' : '')+
      '</div>'+
    '</div>'+
    '<div class="ac-title">Examination Admit Card</div>'+
    '<div class="ac-body">'+
      '<div class="ac-fields">'+
        row('Name', s.name)+
        row('Father Name', s.fatherName)+
        row('Mother Name', s.motherName)+
        row('Class', className(s))+
        row('Roll No.', s.rollNo)+
        row('Classroom No.', '')+
      '</div>'+
      '<div class="ac-photo-wrap">'+photo+'</div>'+
    '</div>'+
    '<div class="ac-foot">'+
      '<div class="ac-date">Date: ______________</div>'+
      /* ✅ FIX: Removed the extra div inside here. Just simple text. */
      '<div class="ac-sig">Signature / Principal</div>'+
    '</div>'+
  '</div>';
}

function row(label, val){
  var v = (val === 0 || val) ? String(val) : '';
  return '<div class="ac-row"><span class="ac-lbl">'+escH(label)+' :-</span>'+
         (v ? '<span class="ac-val">'+escH(v)+'</span>' : '<span class="ac-blank"></span>')+'</div>';
}

function className(s){
  var parsedName = (s.classId && (s.classId.className||s.classId.name)) || (s.class && (s.class.className||s.class.name)) || s._fallbackClassName;
  if (parsedName) return parsedName;
  if (currentClassName && currentClassName !== 'All Classes (Entire School)') return currentClassName;
  return '';
}

/* ✅ FIX: Updated the CSS for .ac-date, .ac-sig, and .ac-foot */
function printDoc(cardsHtml){
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admit Cards</title>'+
  '<style>'+
  '@page{size:A4;margin:0;}'+
  '*{box-sizing:border-box;margin:0;padding:0;}'+
  'body{font-family:Georgia,"Times New Roman",serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'+
  '.ac{width:210mm;height:148.5mm;padding:11mm 12mm 9mm;position:relative;overflow:hidden;page-break-inside:avoid;border-bottom:1px dashed #999;}'+
  '.ac:nth-child(even){border-bottom:none;}'+           
  '.ac-head{display:flex;align-items:center;gap:12px;}'+
  '.ac-logo{width:58px;height:58px;object-fit:contain;flex-shrink:0;}'+
  '.ac-school{flex:1;}'+
  '.ac-name{font-size:20px;font-weight:700;line-height:1.1;}'+
  '.ac-addr{font-size:11px;color:#333;margin-top:2px;}'+
  '.ac-title{text-align:center;font-size:15px;font-weight:700;text-decoration:underline;margin:9mm 0 7mm;}'+
  '.ac-body{display:flex;gap:14px;}'+
  '.ac-fields{flex:1;}'+
  '.ac-row{display:flex;align-items:flex-end;margin-bottom:6.5mm;font-size:13.5px;}'+
  '.ac-lbl{font-weight:700;white-space:nowrap;margin-right:8px;}'+
  '.ac-val{font-weight:400;}'+
  '.ac-blank{flex:1;border-bottom:1px solid #333;min-width:120px;height:14px;}'+
  '.ac-photo-wrap{width:35mm;display:flex;justify-content:flex-end;}'+
  '.ac-photo{width:33mm;height:40mm;object-fit:cover;border:1px solid #333;}'+
  '.ac-photo-ph{display:flex;align-items:center;justify-content:center;font-size:11px;color:#888;font-family:Arial,sans-serif;}'+
  '.ac-foot{position:absolute;left:12mm;right:12mm;bottom:9mm;display:flex;justify-content:space-between;align-items:flex-end;}'+
  '.ac-date{font-size:14px;font-weight:700;line-height:1;}'+
  '.ac-sig{width:160px;border-top:1px solid #111;padding-top:5px;font-size:14px;font-weight:700;text-align:center;line-height:1;}'+
  '</style></head><body>'+cardsHtml+'</body></html>';
}

function getVal(id){ return (document.getElementById(id).value||'').trim(); }
function setVal(id,v){ document.getElementById(id).value = v || ''; }
function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
var _tt;
function toast(msg, kind){
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (kind==='err'?' err':'');
  clearTimeout(_tt); _tt = setTimeout(function(){ t.className='toast'; }, 3000);
}