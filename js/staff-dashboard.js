// staff-dashboard.js - SECURE EXAM & 7 TAB FEE INJECTION

document.addEventListener('DOMContentLoaded', function() {
    console.log('Staff Dashboard initializing...');
    
    if (!checkAuth()) {
        console.error('Authentication failed');
        return;
    }
    
    const userType = localStorage.getItem('userType');
    
    if (userType === 'institution') {
        window.location.href = 'dashboard.html';
        return;
    }
    
    if (userType !== 'staff') {
        showError('Unauthorized access. Please login as staff.');
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        return;
    }
    
    console.log('✅ Authentication verified - Staff user');
    loadStaffDashboard();
});

async function loadStaffDashboard() {
    try {
        showLoading('Loading your dashboard...');
        
        const profileResponse = await apiGet(API_ENDPOINTS.STAFF_PROFILE, true);
        
        if (!profileResponse.success) throw new Error(profileResponse.message || 'Failed to load profile');
        const data = profileResponse.data;
        if (!data) throw new Error('No data received from server');
        
        ensureInstitutionCode(data);
        displayStaffProfile(data);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        showError(error.message || 'Failed to load dashboard');
    }
}

function ensureInstitutionCode(data) {
    let institutionCode = localStorage.getItem('institutionCode');
    
    if (!institutionCode) {
        institutionCode = data.institutionId || data.institution?.institutionCode || data.institutionCode || data.credential?.institutionId || data.staff?.institutionId;
        if (institutionCode) localStorage.setItem('institutionCode', institutionCode);
    }
    
    let accessLevel = localStorage.getItem('accessLevel');
    if (!accessLevel) {
        accessLevel = data.accessLevel || data.credential?.accessLevel || data.staff?.accessLevel || 'teacher';
        localStorage.setItem('accessLevel', accessLevel);
    }
}

function displayStaffProfile(data) {
    const nameDisplay = document.getElementById('staff-name-display');
    if (nameDisplay) nameDisplay.textContent = data.name || 'Staff Member';
    
    const instCodeDisplay = document.getElementById('inst-code-display');
    if (instCodeDisplay) instCodeDisplay.textContent = localStorage.getItem('institutionCode') || 'N/A';
    
    const instNameDisplay = document.getElementById('inst-name-display');
    if (instNameDisplay) instNameDisplay.textContent = data.institution?.name || data.institutionName || 'Your Institution';
    
    safeDisplay('staff-name', data.name);
    safeDisplay('staff-mobile', data.mobileNo || data.mobile);
    safeDisplay('staff-loginid', localStorage.getItem('loginId') || data.loginId || 'N/A');
    safeDisplay('staff-designation', data.designation || data.designationName || 'Not Assigned');
    
    const accessElement = document.getElementById('staff-access-level');
    if (accessElement) {
        const accessLevel = localStorage.getItem('accessLevel') || data.accessLevel || 'teacher';
        accessElement.innerHTML = `<span class="access-badge access-${accessLevel}">${accessLevel.toUpperCase()}</span>`;
    }
    
    const statusElement = document.getElementById('staff-status');
    if (statusElement) {
        const isActive = data.isActive !== false;
        statusElement.innerHTML = `<span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">${isActive ? 'ACTIVE' : 'INACTIVE'}</span>`;
    }
    
    if (data.assignedClasses && Array.isArray(data.assignedClasses)) {
        displayAssignedClassesAndSubjects(data.assignedClasses);
    } else {
        displayAssignedClassesAndSubjects([]);
    }
    
    displayPermissions(localStorage.getItem('accessLevel') || 'teacher');

    // ── Parse Additional Access Controls ──
    const addAccess = data.additionalAccess || (data.credential && data.credential.additionalAccess) || {};
    
    // 1. Fee Permissions
    const canFee = !!(data.canAccessFeeManagement || addAccess.canAccessFeeManagement);
    
    // THE MAGIC HANDOFF: Save all 7 tabs independently for fee-management.html to read!
    localStorage.setItem('feePermissions', JSON.stringify({
        tab1: !!addAccess.canAccessFeeTab1,
        tab2: !!addAccess.canAccessFeeTab2,
        tab3: !!addAccess.canAccessFeeTab3,
        tab4: !!addAccess.canAccessFeeTab4,
        tab5: !!addAccess.canAccessFeeTab5,
        tab6: !!addAccess.canAccessFeeTab6,
        tab7: !!addAccess.canAccessFeeTab7
    }));

    if (canFee) {
        addFeePermission();
        addFeeActionCard();
    }

    // 2. Exam Permissions
    const canAdmit = !!(data.canAccessAdmitCards || addAccess.canAccessAdmitCards);
    const canSetup = !!(data.canAccessExamSetup || addAccess.canAccessExamSetup);
    const canMarks = !!(data.canAccessMarksEntry || addAccess.canAccessMarksEntry);
    const canTabu = !!(data.canAccessTabulation || addAccess.canAccessTabulation);
    const canReports = !!(data.canAccessReportCards || addAccess.canAccessReportCards);

    const hasExam = canAdmit || canSetup || canMarks || canTabu || canReports;

    localStorage.setItem('examPermissions', JSON.stringify({
        admit: canAdmit,
        setup: canSetup,
        marks: canMarks,
        tabulation: canTabu,
        reports: canReports
    }));

    if (hasExam) {
        addExamPermission(canAdmit, canSetup, canMarks, canTabu, canReports);
        addExamActionCard();
    }
}

function displayAssignedClassesAndSubjects(assignedClasses) {
    const classesContainer = document.getElementById('classes-list');
    const subjectsSection = document.getElementById('subjects-section');
    const subjectsContainer = document.getElementById('subjects-list');
    
    if (!assignedClasses || assignedClasses.length === 0) {
        if (classesContainer) classesContainer.innerHTML = `<div class="empty-state"><p>📭 No classes assigned yet</p><small>Classes will appear here once assigned by admin</small></div>`;
        if (subjectsSection) subjectsSection.style.display = 'none';
        return;
    }
    
    if (classesContainer) {
        classesContainer.innerHTML = '';
        assignedClasses.forEach((classData, index) => {
            const card = document.createElement('div');
            card.className = 'class-card';
            card.style.animationDelay = `${index * 0.1}s`;
            card.style.animation = 'fadeInUp 0.6s ease-out';
            card.innerHTML = `<h4>${sanitizeHTML(classData.nickname || classData.className || 'Unknown')}</h4><p>Assigned Class</p>`;
            classesContainer.appendChild(card);
        });
    }
    
    const allSubjects = [];
    assignedClasses.forEach(classData => {
        const className = classData.nickname || classData.className || 'Unknown';
        if (classData.subjects && Array.isArray(classData.subjects)) {
            classData.subjects.forEach(subject => {
                allSubjects.push({ className: className, subjectName: subject.subjectName || subject.name });
            });
        }
    });
    
    if (allSubjects.length > 0 && subjectsSection && subjectsContainer) {
        subjectsSection.style.display = 'block';
        subjectsContainer.innerHTML = '';
        allSubjects.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'subject-card';
            card.style.animationDelay = `${index * 0.1}s`;
            card.style.animation = 'fadeInUp 0.6s ease-out';
            card.innerHTML = `<h4>${sanitizeHTML(item.subjectName)}</h4><p>in ${sanitizeHTML(item.className)}</p>`;
            subjectsContainer.appendChild(card);
        });
    } else {
        if (subjectsSection) subjectsSection.style.display = 'none';
    }
}

function displayPermissions(accessLevel) {
    const container = document.getElementById('permissions-list');
    if (!container) return;
    
    container.innerHTML = '';
    let permissions = [];
    
    if (accessLevel === 'teacher') {
        permissions = [{ icon: '👀', text: 'View assigned classes' }, { icon: '📚', text: 'View teaching subjects' }, { icon: '👥', text: 'View student information' }, { icon: '✅', text: 'Mark attendance' }];
    } else if (accessLevel === 'coordinator') {
        permissions = [{ icon: '👀', text: 'View assigned classes' }, { icon: '📚', text: 'View teaching subjects' }, { icon: '👥', text: 'View and manage students' }, { icon: '✅', text: 'Mark attendance' }, { icon: '📊', text: 'Generate reports' }, { icon: '📝', text: 'Update student records' }];
    } else if (accessLevel === 'admin') {
        permissions = [{ icon: '🔐', text: 'Full system access' }, { icon: '👥', text: 'Manage all staff' }, { icon: '📚', text: 'Manage all classes' }, { icon: '📖', text: 'Manage all subjects' }, { icon: '🎓', text: 'Manage all students' }, { icon: '📊', text: 'Access all reports' }];
    }
    
    permissions.forEach((perm, index) => {
        const item = document.createElement('div');
        item.className = 'permission-item';
        item.style.animationDelay = `${index * 0.05}s`;
        item.style.animation = 'fadeInUp 0.4s ease-out';
        item.innerHTML = `<span class="permission-icon">${perm.icon}</span><span class="permission-text">${perm.text}</span>`;
        container.appendChild(item);
    });
}

function addFeePermission() {
    var container = document.getElementById('permissions-list');
    if (!container) return;
    var item = document.createElement('div');
    item.className = 'permission-item';
    item.style.border = '2px solid #c7d2fe';
    item.style.background = '#eef2ff';
    item.innerHTML = '<span class="permission-icon">💰</span><span class="permission-text" style="color:#4f46e5">Fee Management Access</span>';
    container.appendChild(item);
}

function addFeeActionCard() {
    var grid = document.querySelector('.actions-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'action-card';
    card.style.borderColor = '#c7d2fe';
    card.innerHTML = '<span class="action-icon">💰</span><h4 style="color:#4f46e5">Fee Management</h4><p>Access your permitted fee modules</p>';
    card.onclick = function() { window.location.href = 'fee-management.html'; };
    grid.appendChild(card);
}

function addExamPermission(admit, setup, marks, tabu, reports) {
    var container = document.getElementById('permissions-list');
    if (!container) return;
    
    let details = [];
    if(admit) details.push('Admit Cards');
    if(setup) details.push('Setup');
    if(marks) details.push('Marks');
    if(tabu) details.push('Tabulation');
    if(reports) details.push('Report Cards');
    
    var item = document.createElement('div');
    item.className = 'permission-item';
    item.style.border = '2px solid #fde68a';
    item.style.background = '#fffbeb';
    item.innerHTML = '<span class="permission-icon">📝</span><span class="permission-text" style="color:#b45309">Exam Modules: ' + details.join(', ') + '</span>';
    container.appendChild(item);
}

function addExamActionCard() {
    var grid = document.querySelector('.actions-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'action-card';
    card.style.borderColor = '#fde68a';
    card.innerHTML = '<span class="action-icon">📝</span><h4 style="color:#b45309">Exam Management</h4><p>Access your permitted exam & grading modules</p>';
    card.onclick = function() { window.location.href = 'exam-management.html'; };
    grid.appendChild(card);
}

function safeDisplay(elementId, value, fallback = '-') {
    const element = document.getElementById(elementId);
    if (element) { element.textContent = value ?? fallback; element.style.animation = 'fadeIn 0.4s ease-out'; }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return false; }
    return true;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

function showLoading(message = 'Loading...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.querySelector('#loading-overlay .loading-text');
    if (loadingOverlay) loadingOverlay.classList.add('show');
    if (loadingText) loadingText.textContent = '⏳ ' + message;
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.remove('show');
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = '❌ ' + message; errorDiv.classList.add('show');
        setTimeout(() => { errorDiv.classList.remove('show'); }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    if (successDiv) {
        successDiv.textContent = '✅ ' + message; successDiv.classList.add('show');
        setTimeout(() => { successDiv.classList.remove('show'); }, 3000);
    }
}

function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div'); div.textContent = str;
    return div.innerHTML;
}

window.logout = logout;