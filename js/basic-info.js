// basic-info.js - Part 1: Basic Information Logic

let currentSection = 'designations';
let designationsData = [];
let classesData = [];
let staffData = [];
let subjectsData = [];
let studentsData = [];

// ===================================
// UTILITY FUNCTIONS (ADD AT THE TOP)
// ===================================

function validateMobile(mobile) {
    if (!mobile) return false;
    const cleaned = mobile.replace(/\D/g, '');
    return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
}

function populateDropdown(selectElement, data, valueKey, textKey) {
    if (!selectElement) return;
    
    // Clear existing options except the first one
    selectElement.innerHTML = '<option value="">-- Select --</option>';
    
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = typeof valueKey === 'function' ? valueKey(item) : item[valueKey];
        option.textContent = typeof textKey === 'function' ? textKey(item) : item[textKey];
        selectElement.appendChild(option);
    });
}

// ===================================
// MESSAGE FUNCTIONS (Loading, Success, Error)
// ===================================

function showLoading(message = 'Loading...') {
    console.log('🔄 showLoading called:', message);
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    
    // Hide error and success
    if (errorEl) {
        errorEl.classList.remove('show');
        errorEl.style.display = 'none';
    }
    if (successEl) {
        successEl.classList.remove('show');
        successEl.style.display = 'none';
    }
    
    // Show overlay
    if (overlay) {
        overlay.classList.add('show');
    }
    
    // Show loading
    if (loadingEl) {
        loadingEl.textContent = message;
        loadingEl.style.display = 'block';
        loadingEl.classList.add('show');
        console.log('✅ Loading shown:', message);
    } else {
        console.error('❌ Loading element not found!');
    }
}

function hideLoading() {
    console.log('🔄 hideLoading called');
    const loadingEl = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
        console.log('✅ Loading hidden');
    }
    
    // Hide overlay if no messages are showing
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const anyMessageShowing = (errorEl && errorEl.classList.contains('show')) || 
                              (successEl && successEl.classList.contains('show'));
    
    if (overlay && !anyMessageShowing) {
        overlay.classList.remove('show');
    }
}

function showSuccess(message) {
    console.log('✅ showSuccess called:', message);
    const successEl = document.getElementById('success-message');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const overlay = document.getElementById('message-overlay');
    
    // Hide loading and error
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
    }
    if (errorEl) {
        errorEl.classList.remove('show');
        errorEl.style.display = 'none';
    }
    
    // Show overlay
    if (overlay) {
        overlay.classList.add('show');
    }
    
    // Show success
    if (successEl) {
        successEl.textContent = message;
        successEl.style.display = 'block';
        successEl.classList.add('show');
        console.log('✅ Success shown:', message);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            successEl.classList.remove('show');
            successEl.style.display = 'none';
            if (overlay) {
                overlay.classList.remove('show');
            }
            console.log('✅ Success auto-hidden');
        }, 5000);
    } else {
        console.error('❌ Success element not found!');
    }
}

function showError(message) {
    console.log('❌ showError called:', message);
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    
    // Hide loading and success
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
    }
    if (successEl) {
        successEl.classList.remove('show');
        successEl.style.display = 'none';
    }
    
    // Show overlay
    if (overlay) {
        overlay.classList.add('show');
    }
    
    // Show error
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        errorEl.classList.add('show');
        console.log('❌ Error shown:', message);
        
        // Auto-hide after 7 seconds
        setTimeout(() => {
            errorEl.classList.remove('show');
            errorEl.style.display = 'none';
            if (overlay) {
                overlay.classList.remove('show');
            }
            console.log('❌ Error auto-hidden');
        }, 7000);
    } else {
        console.error('❌ Error element not found!');
    }
}

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Part 1 - Basic Info initializing...');
    
    if (!checkAuth()) {
        console.error('Authentication failed');
        return;
    }
    
    // Show first section by default
    showSection('designations');
    
    // Load all data
    loadDesignations();
    loadClasses();
    loadStaff();
    loadSubjects();
    loadStudents();
    loadHierarchy();
    
    // Setup form handlers
    const addDesForm = document.getElementById('add-designation-form');
    const addClassForm = document.getElementById('add-class-form');
    const addStaffForm = document.getElementById('add-staff-form');
    const addSubjectForm = document.getElementById('add-subject-form');
    const addStudentForm = document.getElementById('add-student-form');
    const bulkUploadForm = document.getElementById('bulk-upload-form');
    
    if (addDesForm) addDesForm.addEventListener('submit', handleAddDesignation);
    if (addClassForm) addClassForm.addEventListener('submit', handleAddClass);
    if (addStaffForm) addStaffForm.addEventListener('submit', handleAddStaff);
    if (addSubjectForm) addSubjectForm.addEventListener('submit', handleAddSubject);
    if (addStudentForm) addStudentForm.addEventListener('submit', handleAddStudent);
    if (bulkUploadForm) bulkUploadForm.addEventListener('submit', handleBulkUpload);
    
    // Phone validation for staff and student mobile inputs
    const staffMobile = document.getElementById('staff-mobile');
    const studentMobile = document.getElementById('student-mobile');
    
    function validatePhoneInput(input) {
        if (!input) return;
        
        input.addEventListener('input', function(e) {
            // Remove non-numeric characters
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Validate length
            if (this.value.length === 10) {
                this.classList.remove('phone-invalid');
                this.classList.add('phone-valid');
            } else if (this.value.length > 0) {
                this.classList.remove('phone-valid');
                this.classList.add('phone-invalid');
            } else {
                this.classList.remove('phone-valid', 'phone-invalid');
            }
        });
    }
    
    validatePhoneInput(staffMobile);
    validatePhoneInput(studentMobile);
    
    console.log('✅ All event listeners attached');
});

function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('#section-tabs button');
    tabs.forEach(t => t.style.fontWeight = 'normal');
    
    // Show selected section
    const section = document.getElementById('section-' + sectionName);
    const tab = document.getElementById('tab-' + sectionName);
    
    if (section) section.style.display = 'block';
    if (tab) tab.style.fontWeight = 'bold';
    
    currentSection = sectionName;
}

// ===================================
// 1. DESIGNATIONS MANAGEMENT
// ===================================

async function loadDesignations() {
    try {
        console.log('Loading designations...');
        showLoading('Loading designations...');
        const response = await apiGet(API_ENDPOINTS.DESIGNATIONS, true);
        
        hideLoading();
        if (response.success) {
            designationsData = response.data;
            console.log('✅ Designations loaded:', designationsData.length);
            displayDesignations();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Failed to load designations:', error);
        showError('Failed to load designations: ' + error.message);
    }
}

function displayDesignations() {
    const tbody = document.querySelector('#designations-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (designationsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No designations found. Add one above.</td></tr>';
        return;
    }
    
    designationsData.forEach(des => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${des.name}</td>
            <td>${des.level || '-'}</td>
            <td>${des.staffCount || 0}</td>
            <td>
                <button onclick="editDesignation('${des._id}')">Edit</button>
                <button onclick="deleteDesignation('${des._id}')">Delete</button>
            </td>
        `;
    });
    
    // Update staff designation dropdown
    const staffDesSelect = document.getElementById('staff-designation');
    if (staffDesSelect) {
        populateDropdown(staffDesSelect, designationsData, '_id', 'name');
        console.log('✅ Staff designation dropdown populated');
    }
}

async function handleAddDesignation(e) {
    e.preventDefault();
    console.log('Adding designation...');
    
    const name = document.getElementById('des-name').value.trim();
    const level = document.getElementById('des-level').value;
    
    if (!name) {
        showError('Please enter a designation name');
        return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
        showError('Please login again');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        showLoading('Adding designation...');
        
        const response = await fetch(API_BASE_URL + API_ENDPOINTS.DESIGNATIONS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: name,
                level: level ? parseInt(level) : null
            })
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (response.ok && data.success) {
            showSuccess(data.message || 'Designation added successfully');
            document.getElementById('add-designation-form').reset();
            loadDesignations();
        } else {
            showError(data.message || 'Failed to add designation');
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Error:', error);
        showError('Error: ' + error.message);
    }
}

async function editDesignation(id) {
    const des = designationsData.find(d => d._id === id);
    if (!des) return;
    openEditModal('designation', id, des);
}

async function deleteDesignation(id) {
    if (!confirm('Are you sure you want to delete this designation?')) return;
    
    try {
        showLoading('Deleting designation...');
        
        const response = await apiDelete(API_ENDPOINTS.DESIGNATIONS + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            loadDesignations();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 2. CLASSES MANAGEMENT
// ===================================

async function loadClasses() {
    try {
        console.log('Loading classes...');
        showLoading('Loading classes...');
        const response = await apiGet(API_ENDPOINTS.CLASSES, true);
        
        hideLoading();
        if (response.success) {
            classesData = response.data;
            console.log('✅ Classes loaded:', classesData.length);
            displayClasses();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Failed to load classes:', error);
        showError('Failed to load classes: ' + error.message);
    }
}

function displayClasses() {
    const tbody = document.querySelector('#classes-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (classesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No classes found. Add one above.</td></tr>';
        return;
    }
    
    classesData.forEach(cls => {
        const row = tbody.insertRow();
        const subjects = cls.assignedSubjects ? cls.assignedSubjects.map(s => s.subjectName).join(', ') : '-';
        
        row.innerHTML = `
            <td>${cls.className}</td>
            <td>${cls.nickname || '-'}</td>
            <td>${cls.studentCount || 0}</td>
            <td>${subjects}</td>
            <td>
                <button onclick="editClass('${cls._id}')">Edit</button>
                <button onclick="deleteClass('${cls._id}')">Delete</button>
            </td>
        `;
    });
    
    // Update student class dropdowns
    const studentClassSelect = document.getElementById('student-class');
    const bulkClassSelect = document.getElementById('bulk-class-select');
    
    if (studentClassSelect) {
        populateDropdown(studentClassSelect, classesData, '_id', data => data.nickname || data.className);
    }
    if (bulkClassSelect) {
        populateDropdown(bulkClassSelect, classesData, '_id', data => data.nickname || data.className);
    }
}

async function handleAddClass(e) {
    e.preventDefault();
    console.log('Adding class...');
    
    const className = document.getElementById('class-name').value.trim();
    const nickname = document.getElementById('class-nickname').value.trim();
    
    if (!className) {
        showError('Please enter a class name');
        return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
        showError('Please login again');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        showLoading('Adding class...');
        
        const response = await fetch(API_BASE_URL + API_ENDPOINTS.CLASSES, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                className: className,
                nickname: nickname || null
            })
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (response.ok && data.success) {
            showSuccess(data.message || 'Class added successfully');
            document.getElementById('add-class-form').reset();
            loadClasses();
        } else {
            showError(data.message || 'Failed to add class');
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Error:', error);
        showError('Error: ' + error.message);
    }
}

async function editClass(id) {
    const cls = classesData.find(c => c._id === id);
    if (!cls) return;
    openEditModal('class', id, cls);
}

async function deleteClass(id) {
    if (!confirm('Are you sure you want to delete this class?')) return;
    
    try {
        showLoading('Deleting class...');
        
        const response = await apiDelete(API_ENDPOINTS.CLASSES + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            loadClasses();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 3. STAFF MANAGEMENT
// ===================================

async function loadStaff() {
    try {
        console.log('Loading staff...');
        showLoading('Loading staff...');
        const response = await apiGet(API_ENDPOINTS.STAFF, true);
        
        hideLoading();
        if (response.success) {
            staffData = response.data;
            console.log('✅ Staff loaded:', staffData.length);
            displayStaff();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Failed to load staff:', error);
        showError('Failed to load staff: ' + error.message);
    }
}

function displayStaff() {
    const tbody = document.querySelector('#staff-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (staffData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No staff found. Add one above.</td></tr>';
        return;
    }
    
    staffData.forEach(staff => {
        const row = tbody.insertRow();
        const classes = staff.assignedClasses ? staff.assignedClasses.map(c => c.className).join(', ') : '-';
        const credentials = staff.hasCredentials ? (staff.isCredentialActive ? 'Yes (Active)' : 'Yes (Inactive)') : 'No';
        
        row.innerHTML = `
            <td>${staff.name}</td>
            <td>${staff.mobileNo}</td>
            <td>${staff.designationId?.name || '-'}</td>
            <td>${classes}</td>
            <td>${credentials}</td>
            <td>
                <button onclick="editStaff('${staff._id}')">Edit</button>
                <button onclick="deleteStaff('${staff._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddStaff(e) {
    e.preventDefault();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 ADD STAFF FUNCTION CALLED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Step 1: Get form values
    console.log('📝 Step 1: Getting form values...');
    const nameInput = document.getElementById('staff-name');
    const mobileInput = document.getElementById('staff-mobile');
    const designationInput = document.getElementById('staff-designation');
    
    console.log('Form elements found:', {
        nameInput: !!nameInput,
        mobileInput: !!mobileInput,
        designationInput: !!designationInput
    });
    
    if (!nameInput || !mobileInput || !designationInput) {
        console.error('❌ Form elements not found!');
        showError('Form error: Required fields not found');
        return;
    }
    
    const name = nameInput.value.trim();
    const mobileNo = mobileInput.value.trim();
    const designationId = designationInput.value;
    
    console.log('📋 Form Data:', {
        name: name,
        nameLength: name.length,
        mobileNo: mobileNo,
        mobileLength: mobileNo.length,
        designationId: designationId
    });
    
    // Step 2: Validate inputs
    console.log('✅ Step 2: Validating inputs...');
    
    if (!name) {
        console.error('❌ Validation failed: Name is empty');
        showError('Please enter staff name');
        return;
    }
    console.log('✅ Name validation passed');
    
    if (!mobileNo) {
        console.error('❌ Validation failed: Mobile is empty');
        showError('Please enter mobile number');
        return;
    }
    console.log('✅ Mobile not empty');
    
    if (!validateMobile(mobileNo)) {
        console.error('❌ Validation failed: Invalid mobile format');
        console.log('Mobile number:', mobileNo);
        console.log('Mobile regex test:', /^[6-9]\d{9}$/.test(mobileNo));
        showError('Please enter a valid 10-digit mobile number starting with 6-9');
        return;
    }
    console.log('✅ Mobile format validation passed');
    
    if (!designationId) {
        console.error('❌ Validation failed: No designation selected');
        showError('Please select a designation');
        return;
    }
    console.log('✅ Designation validation passed');
    
    // Step 3: Get token
    console.log('🔑 Step 3: Getting authentication token...');
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.error('❌ No token found in localStorage');
        showError('Please login again');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }
    console.log('✅ Token found:', token.substring(0, 20) + '...');
    
    // Step 4: Prepare request
    console.log('📦 Step 4: Preparing API request...');
    
    const url = API_BASE_URL + API_ENDPOINTS.STAFF;
    console.log('🌐 API_BASE_URL:', API_BASE_URL);
    console.log('🌐 API_ENDPOINTS.STAFF:', API_ENDPOINTS.STAFF);
    console.log('🌐 Full URL:', url);
    
    const requestBody = {
        name: name,
        mobileNo: mobileNo,
        designationId: designationId
    };
    console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    console.log('📤 Request headers:', {
        'Content-Type': headers['Content-Type'],
        'Authorization': headers['Authorization'].substring(0, 30) + '...'
    });
    
    // Step 5: Make API call
    try {
        console.log('🚀 Step 5: Making API call...');
        showLoading('Adding staff...');
        
        console.log('⏳ Sending fetch request...');
        const startTime = Date.now();
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('📥 Response received in', duration, 'ms');
        console.log('📥 Response status:', response.status);
        console.log('📥 Response statusText:', response.statusText);
        console.log('📥 Response ok:', response.ok);
        console.log('📥 Response type:', response.type);
        console.log('📥 Response headers:');
        response.headers.forEach((value, key) => {
            console.log(`   ${key}: ${value}`);
        });
        
        // Step 6: Parse response
        console.log('📖 Step 6: Parsing response...');
        
        let responseText;
        try {
            responseText = await response.text();
            console.log('📥 Raw response text:', responseText);
        } catch (textError) {
            console.error('❌ Failed to get response text:', textError);
            hideLoading();
            showError('Failed to read server response');
            return;
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('📥 Parsed JSON:', JSON.stringify(data, null, 2));
        } catch (parseError) {
            console.error('❌ Failed to parse JSON:', parseError);
            console.error('Response text was:', responseText);
            hideLoading();
            showError('Server returned invalid response');
            return;
        }
        
        hideLoading();
        
        // Step 7: Handle response
        console.log('🎯 Step 7: Handling response...');
        
        if (response.ok && data.success) {
            console.log('✅ SUCCESS!');
            console.log('✅ Message:', data.message);
            console.log('✅ Data:', data.data);
            
            showSuccess(data.message || 'Staff added successfully!');
            
            console.log('🔄 Resetting form...');
            const form = document.getElementById('add-staff-form');
            form.reset();
            // Remove phone validation classes
            const staffMobileInput = document.getElementById('staff-mobile');
            if (staffMobileInput) {
                staffMobileInput.classList.remove('phone-valid', 'phone-invalid');
            }
            
            console.log('🔄 Reloading staff list...');
            await loadStaff();
            
            console.log('✅ All done!');
        } else {
            console.error('❌ Request failed');
            console.error('Status:', response.status);
            console.error('Success flag:', data.success);
            console.error('Message:', data.message);
            console.error('Full response:', data);
            
            showError(data.message || `Failed to add staff (Status: ${response.status})`);
        }
        
    } catch (error) {
        hideLoading();
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌❌❌ CRITICAL ERROR ❌❌❌');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error type:', error.constructor.name);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error object:', error);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        showError('Network error: ' + error.message);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 END OF ADD STAFF FUNCTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function editStaff(id) {
    const staff = staffData.find(s => s._id === id);
    if (!staff) return;
    openEditModal('staff', id, staff);
}

async function deleteStaff(id) {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    
    try {
        showLoading('Deleting staff...');
        
        const response = await apiDelete(API_ENDPOINTS.STAFF + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            loadStaff();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 4. SUBJECTS MANAGEMENT
// ===================================

async function loadSubjects() {
    try {
        console.log('Loading subjects...');
        showLoading('Loading subjects...');
        const response = await apiGet(API_ENDPOINTS.SUBJECTS, true);
        
        hideLoading();
        if (response.success) {
            subjectsData = response.data;
            console.log('✅ Subjects loaded:', subjectsData.length);
            displaySubjects();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Failed to load subjects:', error);
        showError('Failed to load subjects: ' + error.message);
    }
}

function displaySubjects() {
    const tbody = document.querySelector('#subjects-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (subjectsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center">No subjects found. Add one above.</td></tr>';
        return;
    }
    
    subjectsData.forEach(subject => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${subject.subjectName}</td>
            <td>
                <button onclick="editSubject('${subject._id}')">Edit</button>
                <button onclick="deleteSubject('${subject._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddSubject(e) {
    e.preventDefault();
    console.log('Adding subject...');
    
    const subjectName = document.getElementById('subject-name').value.trim();
    
    if (!subjectName) {
        showError('Please enter a subject name');
        return;
    }
    
    try {
        showLoading('Adding subject...');
        
        const response = await apiPost(API_ENDPOINTS.SUBJECTS, {
            subjectName: subjectName
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Subject added successfully');
            document.getElementById('add-subject-form').reset();
            loadSubjects();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Add subject error:', error);
        showError(error.message);
    }
}

async function editSubject(id) {
    const subject = subjectsData.find(s => s._id === id);
    if (!subject) return;
    openEditModal('subject', id, subject);
}

async function deleteSubject(id) {
    if (!confirm('Are you sure you want to delete this subject?')) return;
    
    try {
        showLoading('Deleting subject...');
        
        const response = await apiDelete(API_ENDPOINTS.SUBJECTS + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            loadSubjects();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 5. STUDENTS MANAGEMENT
// ===================================

async function loadStudents() {
    try {
        console.log('Loading students...');
        showLoading('Loading students...');
        const response = await apiGet(API_ENDPOINTS.STUDENTS + '?limit=100', true);
        
        hideLoading();
        if (response.success) {
            studentsData = response.data;
            console.log('✅ Students loaded:', studentsData.length);
            displayStudents();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Failed to load students:', error);
        showError('Failed to load students: ' + error.message);
    }
}

async function loadAllStudents() {
    document.getElementById('search-student').value = '';
    loadStudents();
}

function displayStudents() {
    const tbody = document.querySelector('#students-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (studentsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No students found. Add one above.</td></tr>';
        return;
    }
    
    studentsData.forEach((student, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${student.name}</td>
            <td>${student.fatherName}</td>
            <td>${student.classId?.className || '-'}</td>
            <td>${student.mobileNo}</td>
            <td>
                <button onclick="editStudent('${student._id}')">Edit</button>
                <button onclick="deleteStudent('${student._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddStudent(e) {
    e.preventDefault();
    console.log('Adding student...');
    
    const name = document.getElementById('student-name').value.trim();
    const fatherName = document.getElementById('student-father').value.trim();
    const classId = document.getElementById('student-class').value;
    const mobileNo = document.getElementById('student-mobile').value.trim();
    
    if (!name || !fatherName || !classId || !mobileNo) {
        showError('Please fill all required fields');
        return;
    }
    
    if (!validateMobile(mobileNo)) {
        showError('Please enter a valid 10-digit mobile number starting with 6-9');
        return;
    }
    
    try {
        showLoading('Adding student...');
        
        const response = await apiPost(API_ENDPOINTS.STUDENTS, {
            name: name,
            fatherName: fatherName,
            classId: classId,
            mobileNo: mobileNo
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Student added successfully');
            const form = document.getElementById('add-student-form');
            form.reset();
            // Remove phone validation classes
            const studentMobileInput = document.getElementById('student-mobile');
            if (studentMobileInput) {
                studentMobileInput.classList.remove('phone-valid', 'phone-invalid');
            }
            loadStudents();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Add student error:', error);
        showError(error.message);
    }
}

async function handleBulkUpload(e) {
    e.preventDefault();
    console.log('Bulk uploading students...');
    
    const classId = document.getElementById('bulk-class-select').value;
    const fileInput = document.getElementById('student-file');
    const file = fileInput.files[0];
    
    if (!classId) {
        showError('Please select a class');
        return;
    }
    
    if (!file) {
        showError('Please select a file');
        return;
    }
    
    try {
        showLoading('Uploading students...');
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('classId', classId);
        
        const response = await apiPostFormData(API_ENDPOINTS.STUDENTS_BULK_UPLOAD, formData, true);
        
        hideLoading();
        
        if (response.success) {
            const stats = response.stats || {};
            showSuccess(`Upload complete!\nSuccessful: ${stats.successful || 0}\nFailed: ${stats.failed || 0}`);
            document.getElementById('bulk-upload-form').reset();
            loadStudents();
            
            if (stats.errors && stats.errors.length > 0) {
                console.error('Upload errors:', stats.errors);
            }
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Bulk upload error:', error);
        showError(error.message);
    }
}

async function searchStudents() {
    const searchTerm = document.getElementById('search-student').value.trim();
    
    if (!searchTerm) {
        loadStudents();
        return;
    }
    
    try {
        showLoading('Searching...');
        
        const response = await apiGet(API_ENDPOINTS.STUDENTS + '?search=' + encodeURIComponent(searchTerm), true);
        
        hideLoading();
        
        if (response.success) {
            studentsData = response.data;
            displayStudents();
        }
    } catch (error) {
        hideLoading();
        console.error('❌ Search error:', error);
        showError(error.message);
    }
}

async function editStudent(id) {
    const student = studentsData.find(s => s._id === id);
    if (!student) return;
    openEditModal('student', id, student);
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;
    
    try {
        showLoading('Deleting student...');
        
        const response = await apiDelete(API_ENDPOINTS.STUDENTS + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            loadStudents();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 6. HIERARCHY MANAGEMENT
// ===================================

async function loadHierarchy() {
    try {
        console.log('Loading hierarchy...');
        showLoading('Loading hierarchy...');
        const response = await apiGet(API_ENDPOINTS.HIERARCHY, true);
        
        hideLoading();
        if (response.success && response.data && response.data.levels) {
            displayCurrentHierarchy(response.data.levels);
        } else {
            hideLoading();
        }
    } catch (error) {
        hideLoading();
        console.error('Failed to load hierarchy:', error);
    }
}

function generateHierarchyLevels() {
    const numLevels = parseInt(document.getElementById('num-levels').value);
    const container = document.getElementById('hierarchy-levels-container');
    
    container.innerHTML = '<h3>Define Level Names:</h3>';
    
    for (let i = 1; i <= numLevels; i++) {
        const div = document.createElement('div');
        div.innerHTML = `
            <label for="level-${i}">Level ${i} Name: *</label>
            <input type="text" id="level-${i}" required>
        `;
        container.appendChild(div);
    }
    
    document.getElementById('save-hierarchy-btn').style.display = 'block';
}

async function saveHierarchy() {
    const numLevels = parseInt(document.getElementById('num-levels').value);
    const levels = [];
    
    for (let i = 1; i <= numLevels; i++) {
        const name = document.getElementById('level-' + i).value.trim();
        if (!name) {
            showError('Please fill all level names');
            return;
        }
        levels.push({
            levelNumber: i,
            name: name
        });
    }
    
    try {
        showLoading('Saving hierarchy...');
        
        const response = await apiPost(API_ENDPOINTS.HIERARCHY, {
            levels: levels
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message);
            displayCurrentHierarchy(levels);
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayCurrentHierarchy(levels) {
    const container = document.getElementById('current-hierarchy');
    if (!container) return;
    
    if (!levels || levels.length === 0) {
        container.innerHTML = '<p>No hierarchy defined yet.</p>';
        return;
    }
    
    container.innerHTML = '<ul>';
    levels.forEach(level => {
        container.innerHTML += `<li>Level ${level.levelNumber}: ${level.name}</li>`;
    });
    container.innerHTML += '</ul>';
}

// ===================================
// EDIT MODAL FUNCTIONS
// ===================================

let currentEditType = null;
let currentEditId = null;
let currentEditData = null;

function openEditModal(type, id, data) {
    currentEditType = type;
    currentEditId = id;
    currentEditData = data;
    
    const modal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    // Set title based on type
    const titles = {
        'designation': 'Edit Designation',
        'class': 'Edit Class',
        'staff': 'Edit Staff Member',
        'subject': 'Edit Subject',
        'student': 'Edit Student'
    };
    modalTitle.textContent = titles[type] || 'Edit Item';
    
    // Generate form fields based on type
    let fieldsHTML = '';
    
    switch(type) {
        case 'designation':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Designation Name *</label>
                    <input type="text" id="edit-des-name" value="${data.name || ''}" required>
                </div>
                <div class="edit-modal-field">
                    <label>Level (1-10)</label>
                    <input type="number" id="edit-des-level" min="1" max="10" value="${data.level || ''}">
                </div>
            `;
            break;
            
        case 'class':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Class Name *</label>
                    <input type="text" id="edit-class-name" value="${data.className || ''}" required>
                </div>
                <div class="edit-modal-field">
                    <label>Nick Name</label>
                    <input type="text" id="edit-class-nickname" value="${data.nickname || ''}">
                </div>
            `;
            break;
            
        case 'staff':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Name *</label>
                    <input type="text" id="edit-staff-name" value="${data.name || ''}" required>
                </div>
                <div class="edit-modal-field">
                    <label>Mobile No * (10 digits)</label>
                    <input type="tel" id="edit-staff-mobile" maxlength="10" value="${data.mobileNo || ''}" required class="phone-field">
                </div>
                <div class="edit-modal-field">
                    <label>Designation *</label>
                    <select id="edit-staff-designation" required>
                        ${getDesignationOptions(data.designationId?._id || data.designationId)}
                    </select>
                </div>
            `;
            break;
            
        case 'subject':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Subject Name *</label>
                    <input type="text" id="edit-subject-name" value="${data.subjectName || ''}" required>
                </div>
            `;
            break;
            
        case 'student':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Name *</label>
                    <input type="text" id="edit-student-name" value="${data.name || ''}" required>
                </div>
                <div class="edit-modal-field">
                    <label>Father Name *</label>
                    <input type="text" id="edit-student-father" value="${data.fatherName || ''}" required>
                </div>
                <div class="edit-modal-field">
                    <label>Class *</label>
                    <select id="edit-student-class" required>
                        ${getClassOptions(data.classId?._id || data.classId)}
                    </select>
                </div>
                <div class="edit-modal-field">
                    <label>Mobile * (10 digits)</label>
                    <input type="tel" id="edit-student-mobile" maxlength="10" value="${data.mobileNo || ''}" required class="phone-field">
                </div>
            `;
            break;
    }
    
    modalBody.innerHTML = fieldsHTML;
    
    // Add phone validation to modal phone fields
    const phoneFields = modalBody.querySelectorAll('.phone-field');
    phoneFields.forEach(field => {
        field.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length === 10) {
                this.classList.remove('phone-invalid');
                this.classList.add('phone-valid');
            } else if (this.value.length > 0) {
                this.classList.remove('phone-valid');
                this.classList.add('phone-invalid');
            } else {
                this.classList.remove('phone-valid', 'phone-invalid');
            }
        });
    });
    
    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('show');
    currentEditType = null;
    currentEditId = null;
    currentEditData = null;
}

async function saveEdit() {
    if (!currentEditType || !currentEditId) return;
    
    try {
        let updatedData = {};
        let response;
        
        switch(currentEditType) {
            case 'designation':
                updatedData = {
                    name: document.getElementById('edit-des-name').value,
                    level: document.getElementById('edit-des-level').value ? parseInt(document.getElementById('edit-des-level').value) : null
                };
                showLoading('Updating designation...');
                response = await apiPut(API_ENDPOINTS.DESIGNATIONS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    loadDesignations();
                }
                break;
                
            case 'class':
                updatedData = {
                    className: document.getElementById('edit-class-name').value,
                    nickname: document.getElementById('edit-class-nickname').value || null
                };
                showLoading('Updating class...');
                response = await apiPut(API_ENDPOINTS.CLASSES + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    loadClasses();
                }
                break;
                
            case 'staff':
                const mobileInput = document.getElementById('edit-staff-mobile');
                if (mobileInput.value.length !== 10) {
                    alert('Please enter a valid 10-digit mobile number');
                    return;
                }
                updatedData = {
                    name: document.getElementById('edit-staff-name').value,
                    mobileNo: mobileInput.value,
                    designationId: document.getElementById('edit-staff-designation').value
                };
                showLoading('Updating staff...');
                response = await apiPut(API_ENDPOINTS.STAFF + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    loadStaff();
                }
                break;
                
            case 'subject':
                updatedData = {
                    subjectName: document.getElementById('edit-subject-name').value
                };
                showLoading('Updating subject...');
                response = await apiPut(API_ENDPOINTS.SUBJECTS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    loadSubjects();
                }
                break;
                
            case 'student':
                const studentMobileInput = document.getElementById('edit-student-mobile');
                if (studentMobileInput.value.length !== 10) {
                    alert('Please enter a valid 10-digit mobile number');
                    return;
                }
                updatedData = {
                    name: document.getElementById('edit-student-name').value,
                    fatherName: document.getElementById('edit-student-father').value,
                    classId: document.getElementById('edit-student-class').value,
                    mobileNo: studentMobileInput.value
                };
                showLoading('Updating student...');
                response = await apiPut(API_ENDPOINTS.STUDENTS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    loadStudents();
                }
                break;
        }
        
        closeEditModal();
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function getDesignationOptions(selectedDesignation) {
    let options = '<option value="">-- Select Designation --</option>';
    designationsData.forEach(des => {
        const selected = des._id === selectedDesignation ? 'selected' : '';
        options += `<option value="${des._id}" ${selected}>${des.name}</option>`;
    });
    return options;
}

function getClassOptions(selectedClass) {
    let options = '<option value="">-- Select Class --</option>';
    classesData.forEach(cls => {
        const selected = cls._id === selectedClass ? 'selected' : '';
        options += `<option value="${cls._id}" ${selected}>${cls.nickname || cls.className}</option>`;
    });
    return options;
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('edit-modal');
    if (e.target === modal) {
        closeEditModal();
    }
});

console.log('✅ basic-info.js loaded successfully');