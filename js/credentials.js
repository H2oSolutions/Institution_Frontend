// credentials.js - UPDATED WITH EXAM MANAGEMENT PERMISSIONS

let staffData = [];
let credentialsData = [];
let isDataLoaded = false;

// ===============================
// INITIALIZE PAGE
// ===============================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}

function initializePage() {
    console.log('🚀 Initializing credentials page...');
    
    if (!checkAuth()) {
        console.log('❌ Authentication failed');
        window.location.href = 'login.html';
        return;
    }
    
    console.log('✅ Authentication passed');
    
    setTimeout(() => {
        checkRequiredElements();
        loadCredentialsData();
        setupEventListeners();
    }, 100);
}

// ===============================
// CHECK AUTH
// ===============================
function checkAuth() {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    return token && userType === 'institution';
}

// ===============================
// CHECK REQUIRED ELEMENTS
// ===============================
function checkRequiredElements() {
    console.log('🔍 Checking required DOM elements...');
    
    const requiredElements = {
        'create-credentials-form': 'Form',
        'staff-select': 'Staff dropdown',
        'password': 'Password input',
        'confirm-password': 'Retype password input',
        'loginid-display': 'Login ID display',
        'credentials-table': 'Credentials table',
        'loading': 'Loading indicator',
        'error-message': 'Error message',
        'success-message': 'Success message',
        'message-overlay': 'Message overlay'
    };
    
    let missingElements = [];
    
    for (const [id, name] of Object.entries(requiredElements)) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`⚠️ Missing: ${name} (ID: ${id})`);
            missingElements.push(name);
        } else {
            console.log(`✅ Found: ${name}`);
        }
    }
    
    if (missingElements.length > 0) {
        console.error('❌ Missing elements:', missingElements);
        showError(`Page setup incomplete. Missing: ${missingElements.join(', ')}`);
    } else {
        console.log('✅ All required elements found!');
    }
}

// ===============================
// SETUP EVENT LISTENERS
// ===============================
function setupEventListeners() {
    console.log('🎯 Setting up event listeners...');
    
    const form = document.getElementById('create-credentials-form');
    if (form) {
        form.addEventListener('submit', handleCreateCredentials);
    }
    
    const staffSelect = document.getElementById('staff-select');
    if (staffSelect) {
        staffSelect.addEventListener('change', handleStaffSelection);
    }
}

// ===============================
// LOAD DATA
// ===============================
async function loadCredentialsData() {
    console.log('📥 Starting data load...');
    
    try {
        showLoading('Loading data...');
        
        const [staffResponse, credentialsResponse] = await Promise.all([
            apiGet(API_ENDPOINTS.STAFF, true),
            apiGet(API_ENDPOINTS.CREDENTIALS, true)
        ]);
        
        staffData = staffResponse.data || [];
        credentialsData = credentialsResponse.data || [];
        
        isDataLoaded = true;
        hideLoading();
        
        setupCredentialForm();
        displayCredentials();
        
    } catch (error) {
        console.error('❌ Load error:', error);
        hideLoading();
        showError('Failed to load data: ' + error.message);
    }
}

// ===============================
// SETUP FORM
// ===============================
function setupCredentialForm() {
    if (!isDataLoaded) return;
    
    const staffSelect = document.getElementById('staff-select');
    if (!staffSelect) return;
    
    const staffWithoutCredentials = staffData.filter(staff => {
        return !credentialsData.some(cred => cred.staff && cred.staff._id === staff._id);
    });
    
    staffSelect.innerHTML = '<option value="">-- Choose Staff --</option>';
    
    if (staffWithoutCredentials.length === 0) {
        staffSelect.innerHTML = '<option value="">All staff have credentials</option>';
        staffSelect.disabled = true;
        return;
    }
    
    staffWithoutCredentials.forEach(staff => {
        const option = document.createElement('option');
        option.value = staff._id;
        option.textContent = `${staff.name}${staff.designation?.name ? ' - ' + staff.designation.name : ''}`;
        option.dataset.mobile = staff.mobileNo || '';
        staffSelect.appendChild(option);
    });
    
    staffSelect.disabled = false;
}

// ===============================
// HANDLE STAFF SELECTION
// ===============================
function handleStaffSelection(e) {
    const staffId = e.target.value;
    const loginDisplay = document.getElementById('loginid-display');
    
    if (!staffId || !loginDisplay) return;
    
    const selectedOption = e.target.options[e.target.selectedIndex];
    const mobile = selectedOption.dataset.mobile;
    
    if (mobile) loginDisplay.textContent = mobile;
    else loginDisplay.textContent = 'Select a staff member first';
}

// ===============================
// CREATE CREDENTIALS
// ===============================
async function handleCreateCredentials(e) {
    e.preventDefault();
    
    const staffId = document.getElementById('staff-select').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!staffId) return showError('Please select a staff member');
    if (!password || password.trim() === '') return showError('Please enter a password');
    if (password.length < 6) return showError('Password must be at least 6 characters long');
    if (password !== confirmPassword) return showError('Passwords do not match');
    
    const existingCred = credentialsData.find(c => c.staff && c.staff._id === staffId);
    if (existingCred) return showError('Credentials already exist for this staff member');
    
    try {
        showLoading('Creating credentials...');
        
        var feeToggle = document.getElementById('fee-access-toggle');
        var examToggle = document.getElementById('exam-access-toggle');
        var isExamActive = examToggle ? examToggle.checked : false;

        const requestData = {
            staffId: staffId,
            password: password,
            canAccessFeeManagement: feeToggle ? feeToggle.checked : false,
            canAccessAdmitCards: isExamActive ? document.getElementById('perm-admit').checked : false,
            canAccessExamSetup: isExamActive ? document.getElementById('perm-setup').checked : false,
            canAccessMarksEntry: isExamActive ? document.getElementById('perm-marks').checked : false,
            canAccessTabulation: isExamActive ? document.getElementById('perm-tabulation').checked : false,
            canAccessReportCards: isExamActive ? document.getElementById('perm-reports').checked : false
        };
        
        const response = await apiPost(API_ENDPOINTS.CREDENTIALS, requestData, true);
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Credentials created successfully!');
            document.getElementById('create-credentials-form').reset();
            document.getElementById('loginid-display').textContent = 'Select a staff member first';
            
            // Reset Exam visuals
            document.getElementById('exam-toggle-slider').style.background = '#e2e8f0';
            document.getElementById('exam-toggle-knob').style.transform = 'translateX(0)';
            document.getElementById('exam-sub-options').style.display = 'none';

            await loadCredentialsData();
        } else {
            showError(response.message || 'Failed to create credentials');
        }
    } catch (error) {
        hideLoading();
        showError(error.message || 'An error occurred');
    }
}

// ===============================
// DISPLAY CREDENTIALS TABLE
// ===============================
function displayCredentials() {
    const tbody = document.querySelector('#credentials-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (credentialsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><p>📭 No credentials created yet</p><small>Create your first staff credential above</small></td></tr>`;
        return;
    }
    
    credentialsData.forEach(cred => {
        const row = tbody.insertRow();
        const lastLogin = cred.lastLogin ? new Date(cred.lastLogin).toLocaleString() : '<em style="color: var(--gray-400);">Never</em>';
        const statusBadge = cred.isActive ? '<span class="status-badge status-active">Active</span>' : '<span class="status-badge status-inactive">Inactive</span>';
        
        // Extract permissions safely
        const addAccess = cred.additionalAccess || {};
        const hasFee = !!addAccess.canAccessFeeManagement;
        const hasExam = !!(addAccess.canAccessAdmitCards || addAccess.canAccessExamSetup || addAccess.canAccessMarksEntry || addAccess.canAccessTabulation || addAccess.canAccessReportCards);
        
        let badgesHtml = '';
        if (hasFee) badgesHtml += '<span style="font-size:10px;background:#eef2ff;color:#4f46e5;border-radius:4px;padding:2px 6px;font-weight:700;margin-right:4px;">💰 Fee</span>';
        if (hasExam) badgesHtml += '<span style="font-size:10px;background:#fffbeb;color:#d97706;border-radius:4px;padding:2px 6px;font-weight:700;">📝 Exam</span>';

        row.innerHTML = `
            <td><code style="background: var(--gray-100); padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace;">${cred.loginId || '-'}</code></td>
            <td>
              <strong>${cred.staff?.name || '-'}</strong>
              ${badgesHtml ? `<div style="margin-top:4px;">${badgesHtml}</div>` : ''}
            </td>
            <td>${statusBadge}</td>
            <td>${lastLogin}</td>
            <td style="white-space: nowrap;">
                <button onclick="updateCredential('${cred._id}')" style="padding: 5px 10px; margin: 2px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 3px; font-size: 12px;">✏️ Update</button>
                <button onclick="toggleCredentialStatus('${cred._id}', ${!cred.isActive})" style="padding: 5px 10px; margin: 2px; cursor: pointer; background: ${cred.isActive ? '#ffc107' : '#28a745'}; color: white; border: none; border-radius: 3px; font-size: 12px;">${cred.isActive ? '⏸️ Disable' : '▶️ Enable'}</button>
                <button onclick="deleteCredential('${cred._id}')" style="padding: 5px 10px; margin: 2px; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 3px; font-size: 12px;">🗑️ Delete</button>
            </td>
        `;
    });
}

// ===============================
// UPDATE CREDENTIAL
// ===============================
var _updateCredentialId = null;

function updateCredential(id) {
    var cred = credentialsData.find(c => c._id === id);
    if (!cred) return showError('Credential not found');

    _updateCredentialId = id;
    document.getElementById('update-modal-sub').textContent = 'Updating: ' + (cred.staff?.name || 'Staff Member');
    document.getElementById('update-password').value = '';

    var addAccess = cred.additionalAccess || {};
    
    // Fee logic
    var hasFee = !!addAccess.canAccessFeeManagement;
    var feeToggle = document.getElementById('update-fee-toggle');
    feeToggle.checked = hasFee;
    document.getElementById('update-fee-slider').style.background = hasFee ? '#6366f1' : '#e2e8f0';
    document.getElementById('update-fee-knob').style.transform = hasFee ? 'translateX(20px)' : 'translateX(0)';

    // Exam logic
    var hasAdmit = !!addAccess.canAccessAdmitCards;
    var hasSetup = !!addAccess.canAccessExamSetup;
    var hasMarks = !!addAccess.canAccessMarksEntry;
    var hasTabu = !!addAccess.canAccessTabulation;
    var hasReports = !!addAccess.canAccessReportCards;
    var hasAnyExam = hasAdmit || hasSetup || hasMarks || hasTabu || hasReports;

    var examToggle = document.getElementById('update-exam-toggle');
    examToggle.checked = hasAnyExam;
    document.getElementById('update-exam-slider').style.background = hasAnyExam ? '#d97706' : '#e2e8f0';
    document.getElementById('update-exam-knob').style.transform = hasAnyExam ? 'translateX(20px)' : 'translateX(0)';
    document.getElementById('update-exam-sub-options').style.display = hasAnyExam ? 'block' : 'none';

    document.getElementById('update-perm-admit').checked = hasAdmit;
    document.getElementById('update-perm-setup').checked = hasSetup;
    document.getElementById('update-perm-marks').checked = hasMarks;
    document.getElementById('update-perm-tabulation').checked = hasTabu;
    document.getElementById('update-perm-reports').checked = hasReports;

    document.getElementById('update-modal').style.display = 'flex';
}

function closeUpdateModal() {
    document.getElementById('update-modal').style.display = 'none';
    _updateCredentialId = null;
}

async function saveUpdatedCredential() {
    if (!_updateCredentialId) return;

    var password = document.getElementById('update-password').value.trim();
    var feeAccess = document.getElementById('update-fee-toggle').checked;
    var examAccess = document.getElementById('update-exam-toggle').checked;
    var btn = document.getElementById('update-save-btn');

    if (password && password.length < 6) return showError('Password must be at least 6 characters');

    var updateData = {
        additionalAccess: { 
            canAccessFeeManagement: feeAccess,
            canAccessAdmitCards: examAccess ? document.getElementById('update-perm-admit').checked : false,
            canAccessExamSetup: examAccess ? document.getElementById('update-perm-setup').checked : false,
            canAccessMarksEntry: examAccess ? document.getElementById('update-perm-marks').checked : false,
            canAccessTabulation: examAccess ? document.getElementById('update-perm-tabulation').checked : false,
            canAccessReportCards: examAccess ? document.getElementById('update-perm-reports').checked : false
        }
    };
    if (password) updateData.password = password;

    btn.disabled = true; btn.textContent = '...';

    try {
        showLoading('Saving changes...');
        var response = await apiPut(API_ENDPOINTS.CREDENTIALS + '/' + _updateCredentialId, updateData, true);
        hideLoading();

        if (response.success) {
            closeUpdateModal();
            showSuccess('Credentials updated successfully!');
            await loadCredentialsData();
        } else {
            showError(response.message || 'Update failed');
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    } finally {
        btn.disabled = false; btn.textContent = '💾 Save Changes';
    }
}

// ===============================
// TOGGLE STATUS
// ===============================
async function toggleCredentialStatus(id, newStatus) {
    const cred = credentialsData.find(c => c._id === id);
    if (!cred) return;
    
    const action = newStatus ? 'enable' : 'disable';
    const staffName = cred.staff?.name || 'this staff member';
    
    if (!confirm(`${action.toUpperCase()} credentials for ${staffName}?`)) return;
    
    try {
        showLoading(`${action === 'enable' ? 'Enabling' : 'Disabling'} credentials...`);
        const response = await apiPut(API_ENDPOINTS.CREDENTIALS + '/' + id, { isActive: newStatus }, true);
        hideLoading();
        
        if (response.success) {
            showSuccess(`Credential ${action}d successfully!`);
            await loadCredentialsData();
        } else {
            showError(response.message);
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===============================
// DELETE CREDENTIAL
// ===============================
async function deleteCredential(id) {
    const cred = credentialsData.find(c => c._id === id);
    if (!cred) return;
    
    const staffName = cred.staff?.name || 'this staff member';
    
    if (!confirm(`⚠️ DELETE credentials for ${staffName}?\n\nThis cannot be undone.`)) return;
    
    try {
        showLoading('Deleting credential...');
        const response = await apiDelete(API_ENDPOINTS.CREDENTIALS + '/' + id, true);
        hideLoading();
        
        if (response.success) {
            showSuccess('Credential deleted successfully!');
            await loadCredentialsData();
        } else {
            showError(response.message);
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===============================
// UI HELPERS
// ===============================
function showLoading(message = 'Loading...') {
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    if (loading) { loading.textContent = message; loading.classList.add('show'); }
    if (overlay) { overlay.classList.add('show'); }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    if (loading) loading.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
}

function showError(message) {
    hideMessages();
    const errorDiv = document.getElementById('error-message');
    const overlay = document.getElementById('message-overlay');
    if (errorDiv) {
        errorDiv.textContent = message; errorDiv.classList.add('show');
        if (overlay) overlay.classList.add('show');
        setTimeout(() => { errorDiv.classList.remove('show'); if (overlay) overlay.classList.remove('show'); }, 5000);
    } else alert('Error: ' + message);
}

function showSuccess(message) {
    hideMessages();
    const successDiv = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    if (successDiv) {
        successDiv.textContent = message; successDiv.classList.add('show');
        if (overlay) overlay.classList.add('show');
        setTimeout(() => { successDiv.classList.remove('show'); if (overlay) overlay.classList.remove('show'); }, 3000);
    } else alert(message);
}

function hideMessages() {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    if (errorDiv) errorDiv.classList.remove('show');
    if (successDiv) successDiv.classList.remove('show');
    if (loading) loading.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}