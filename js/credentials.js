// credentials.js - SIMPLIFIED VERSION

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
    
    // Form submission
    const form = document.getElementById('create-credentials-form');
    if (form) {
        form.addEventListener('submit', handleCreateCredentials);
        console.log('✅ Form submit listener added');
    } else {
        console.error('❌ Form not found');
    }
    
    // Staff selection
    const staffSelect = document.getElementById('staff-select');
    if (staffSelect) {
        staffSelect.addEventListener('change', handleStaffSelection);
        console.log('✅ Staff select listener added');
    } else {
        console.error('❌ Staff select not found');
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
        
        console.log('✅ Data loaded:', {
            staff: staffData.length,
            credentials: credentialsData.length
        });
        
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
    console.log('🛠️ Setting up credential form...');
    
    if (!isDataLoaded) return;
    
    // Populate staff dropdown
    const staffSelect = document.getElementById('staff-select');
    if (!staffSelect) {
        console.error('❌ Staff select not found');
        return;
    }
    
    // Filter staff without credentials
    const staffWithoutCredentials = staffData.filter(staff => {
        return !credentialsData.some(cred => 
            cred.staff && cred.staff._id === staff._id
        );
    });
    
    console.log(`📊 Staff: ${staffWithoutCredentials.length} without credentials`);
    
    // Populate dropdown
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
    console.log(`✅ Populated ${staffWithoutCredentials.length} staff`);
}

// ===============================
// HANDLE STAFF SELECTION
// ===============================
function handleStaffSelection(e) {
    console.log('👤 Staff selected');
    
    const staffId = e.target.value;
    const loginDisplay = document.getElementById('loginid-display');
    
    if (!staffId || !loginDisplay) return;
    
    const selectedOption = e.target.options[e.target.selectedIndex];
    const mobile = selectedOption.dataset.mobile;
    
    if (mobile) {
        loginDisplay.textContent = mobile;
        console.log('📱 Login ID:', mobile);
    } else {
        loginDisplay.textContent = 'Select a staff member first';
    }
}

// ===============================
// CREATE CREDENTIALS
// ===============================
async function handleCreateCredentials(e) {
    e.preventDefault();
    console.log('📝 Creating credentials...');
    
    // Get form values
    const staffId = document.getElementById('staff-select').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    console.log('📋 Form values:', {
        staffId,
        passwordLength: password?.length
    });
    
    // Validation
    if (!staffId) {
        showError('Please select a staff member');
        return;
    }
    
    if (!password || password.trim() === '') {
        showError('Please enter a password');
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    // Check if credentials already exist
    const existingCred = credentialsData.find(c => c.staff && c.staff._id === staffId);
    if (existingCred) {
        showError('Credentials already exist for this staff member');
        return;
    }
    
    try {
        showLoading('Creating credentials...');
        
       var feeToggle = document.getElementById('fee-access-toggle');
const requestData = {
    staffId: staffId,
    password: password,
    canAccessFeeManagement: feeToggle ? feeToggle.checked : false
};
        
        console.log('📤 Request:', requestData);
        
        const response = await apiPost(API_ENDPOINTS.CREDENTIALS, requestData, true);
        
        console.log('📨 Response:', response);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Credentials created successfully!');
            
            // Reset form
            document.getElementById('create-credentials-form').reset();
            document.getElementById('loginid-display').textContent = 'Select a staff member first';
            
            console.log('✅ Form reset, reloading data...');
            await loadCredentialsData();
        } else {
            showError(response.message || 'Failed to create credentials');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        hideLoading();
        showError(error.message || 'An error occurred');
    }
}

// ===============================
// DISPLAY CREDENTIALS TABLE
// ===============================
function displayCredentials() {
    console.log('📊 Displaying credentials...');
    
    const tbody = document.querySelector('#credentials-table tbody');
    if (!tbody) {
        console.error('❌ Table tbody not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (credentialsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <p>📭 No credentials created yet</p>
                    <small>Create your first staff credential above</small>
                </td>
            </tr>
        `;
        return;
    }
    
    console.log(`📋 Displaying ${credentialsData.length} credentials`);
    
    credentialsData.forEach(cred => {
        const row = tbody.insertRow();
        
        // Last login
        const lastLogin = cred.lastLogin ? 
            new Date(cred.lastLogin).toLocaleString() : 
            '<em style="color: var(--gray-400);">Never</em>';
        
        // Status badge
        const statusBadge = cred.isActive ? 
            '<span class="status-badge status-active">Active</span>' : 
            '<span class="status-badge status-inactive">Inactive</span>';
        
        row.innerHTML = `
            <td><code style="background: var(--gray-100); padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace;">${cred.loginId || '-'}</code></td>
            <td>
  <strong>${cred.staff?.name || '-'}</strong>
  ${cred.additionalAccess?.canAccessFeeManagement 
    ? '<br><span style="font-size:10px;background:#eef2ff;color:#4f46e5;border-radius:4px;padding:1px 6px;font-weight:700">💰 Fee Access</span>' 
    : ''}
</td>
            <td>${statusBadge}</td>
            <td>${lastLogin}</td>
            <td style="white-space: nowrap;">
                <button onclick="updateCredential('${cred._id}')" 
                        style="padding: 5px 10px; margin: 2px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 3px; font-size: 12px;">
                    ✏️ Update
                </button>
                <button onclick="toggleCredentialStatus('${cred._id}', ${!cred.isActive})" 
                        style="padding: 5px 10px; margin: 2px; cursor: pointer; background: ${cred.isActive ? '#ffc107' : '#28a745'}; color: white; border: none; border-radius: 3px; font-size: 12px;">
                    ${cred.isActive ? '⏸️ Disable' : '▶️ Enable'}
                </button>
                <button onclick="deleteCredential('${cred._id}')" 
                        style="padding: 5px 10px; margin: 2px; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 3px; font-size: 12px;">
                    🗑️ Delete
                </button>
            </td>
        `;
    });
    
    console.log('✅ Table populated');
}

// ===============================
// UPDATE CREDENTIAL
// ===============================
var _updateCredentialId = null;

function updateCredential(id) {
    var cred = credentialsData.find(function(c) { return c._id === id; });
    if (!cred) { showError('Credential not found'); return; }

    _updateCredentialId = id;

    // Set subtitle
    document.getElementById('update-modal-sub').textContent =
        'Updating: ' + (cred.staff?.name || 'Staff Member');

    // Clear password field
    document.getElementById('update-password').value = '';

    // Set fee toggle to current value
    var hasFee = !!(cred.additionalAccess?.canAccessFeeManagement);
    var toggle = document.getElementById('update-fee-toggle');
    var slider = document.getElementById('update-fee-slider');
    var knob   = document.getElementById('update-fee-knob');

    toggle.checked          = hasFee;
    slider.style.background = hasFee ? '#6366f1' : '#e2e8f0';
    knob.style.transform    = hasFee ? 'translateX(20px)' : 'translateX(0)';

    // Show modal
    var modal = document.getElementById('update-modal');
    modal.style.display = 'flex';
}

function closeUpdateModal() {
    document.getElementById('update-modal').style.display = 'none';
    _updateCredentialId = null;
}

async function saveUpdatedCredential() {
    if (!_updateCredentialId) return;

    var password   = document.getElementById('update-password').value.trim();
    var feeAccess  = document.getElementById('update-fee-toggle').checked;
    var btn        = document.getElementById('update-save-btn');

    // Validate password only if provided
    if (password && password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    var updateData = {
        additionalAccess: { canAccessFeeManagement: feeAccess }
    };
    if (password) updateData.password = password;

    btn.disabled    = true;
    btn.textContent = '...';

    try {
        showLoading('Saving changes...');

        var response = await apiPut(
            API_ENDPOINTS.CREDENTIALS + '/' + _updateCredentialId,
            updateData,
            true
        );

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
        btn.disabled    = false;
        btn.textContent = '💾 Save Changes';
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
        
        const response = await apiPut(API_ENDPOINTS.CREDENTIALS + '/' + id, {
            isActive: newStatus
        }, true);
        
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
// UI HELPERS - WITH OVERLAY
// ===============================
function showLoading(message = 'Loading...') {
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    
    if (loading) {
        loading.textContent = message;
        loading.classList.add('show');
    }
    
    if (overlay) {
        overlay.classList.add('show');
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    
    if (loading) {
        loading.classList.remove('show');
    }
    
    if (overlay) {
        overlay.classList.remove('show');
    }
}

function showError(message) {
    console.error('❌', message);
    hideMessages();
    
    const errorDiv = document.getElementById('error-message');
    const overlay = document.getElementById('message-overlay');
    
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        
        if (overlay) {
            overlay.classList.add('show');
        }
        
        setTimeout(() => {
            errorDiv.classList.remove('show');
            if (overlay) {
                overlay.classList.remove('show');
            }
        }, 5000);
    } else {
        alert('Error: ' + message);
    }
}

function showSuccess(message) {
    console.log('✅', message);
    hideMessages();
    
    const successDiv = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.classList.add('show');
        
        if (overlay) {
            overlay.classList.add('show');
        }
        
        setTimeout(() => {
            successDiv.classList.remove('show');
            if (overlay) {
                overlay.classList.remove('show');
            }
        }, 3000);
    } else {
        alert(message);
    }
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

// ===============================
// LOGOUT
// ===============================
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

console.log('✅ credentials.js loaded successfully!');