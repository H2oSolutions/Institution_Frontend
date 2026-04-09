// basic-info.js - Part 1: Basic Information Logic
// ✅ UPDATED: isActive filter + tab switch reload

let currentSection = 'designations';
let designationsData = [];
let classesData = [];
let staffData = [];
let subjectsData = [];
let studentsData = [];
let classStatistics = [];

// ===================================
// UTILITY FUNCTIONS
// ===================================

function validateMobile(mobile) {
    if (!mobile) return false;
    const cleaned = mobile.replace(/\D/g, '');
    return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
}

function populateDropdown(selectElement, data, valueKey, textKey) {
    if (!selectElement) return;
    selectElement.innerHTML = '<option value="">-- Select --</option>';
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = typeof valueKey === 'function' ? valueKey(item) : item[valueKey];
        option.textContent = typeof textKey === 'function' ? textKey(item) : item[textKey];
        selectElement.appendChild(option);
    });
}

// ===================================
// MESSAGE FUNCTIONS
// ===================================

function showLoading(message = 'Loading...') {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');

    if (errorEl) { errorEl.classList.remove('show'); errorEl.style.display = 'none'; }
    if (successEl) { successEl.classList.remove('show'); successEl.style.display = 'none'; }
    if (overlay) overlay.classList.add('show');

    if (loadingEl) {
        loadingEl.textContent = message;
        loadingEl.style.display = 'block';
        loadingEl.classList.add('show');
    }
}

function hideLoading() {
    const loadingEl = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');

    if (loadingEl) { loadingEl.classList.remove('show'); loadingEl.style.display = 'none'; }

    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const anyMessageShowing = (errorEl && errorEl.classList.contains('show')) ||
                              (successEl && successEl.classList.contains('show'));

    if (overlay && !anyMessageShowing) overlay.classList.remove('show');
}

function showSuccess(message) {
    const successEl = document.getElementById('success-message');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const overlay = document.getElementById('message-overlay');

    if (loadingEl) { loadingEl.classList.remove('show'); loadingEl.style.display = 'none'; }
    if (errorEl) { errorEl.classList.remove('show'); errorEl.style.display = 'none'; }
    if (overlay) overlay.classList.add('show');

    if (successEl) {
        successEl.textContent = message;
        successEl.style.display = 'block';
        successEl.classList.add('show');
        setTimeout(() => {
            successEl.classList.remove('show');
            successEl.style.display = 'none';
            if (overlay) overlay.classList.remove('show');
        }, 5000);
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');

    if (loadingEl) { loadingEl.classList.remove('show'); loadingEl.style.display = 'none'; }
    if (successEl) { successEl.classList.remove('show'); successEl.style.display = 'none'; }
    if (overlay) overlay.classList.add('show');

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        errorEl.classList.add('show');
        setTimeout(() => {
            errorEl.classList.remove('show');
            errorEl.style.display = 'none';
            if (overlay) overlay.classList.remove('show');
        }, 7000);
    }
}

// ===================================
// CLASS STATISTICS FUNCTIONS
// ===================================

async function loadClassStatistics() {
    try {
        const classesResponse = await apiGet(API_ENDPOINTS.CLASSES, true);
        if (classesResponse.success) {
            classStatistics = classesResponse.data;
            displayClassStatistics();
        }
    } catch (error) {
        console.error('❌ Failed to load class statistics:', error);
    }
}

function displayClassStatistics() {
    const totalClassesEl  = document.getElementById('total-classes-count');
    const totalStudentsEl = document.getElementById('total-students-count');
    const classListEl     = document.getElementById('class-list');

    if (!totalClassesEl || !totalStudentsEl || !classListEl) return;

    const totalClasses  = classStatistics.length;
    const totalStudents = classStatistics.reduce((sum, cls) => sum + (cls.studentCount || 0), 0);

    totalClassesEl.textContent = totalClasses;
    totalStudentsEl.textContent = totalStudents;

    if (classStatistics.length === 0) {
        classListEl.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:var(--space-4);">No classes available</p>';
        return;
    }

    classListEl.innerHTML = classStatistics.map(cls => `
        <div class="class-list-item"
            onclick="openClassStudentsModal('${cls._id}', '${cls.className}', '${(cls.nickname || '').replace(/'/g, "\\'")}')"
            style="cursor:pointer; transition:all 0.18s;"
            onmouseover="this.style.background='#eff6ff';this.style.transform='translateX(5px)'"
            onmouseout="this.style.background='white';this.style.transform='translateX(0)'">
            <span class="class-name">
    ${cls.className}${cls.nickname ? ` <span style="font-size:12px;font-weight:600;color:#6b7280;">(${cls.nickname})</span>` : ''}
</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="class-student-count">${cls.studentCount || 0} students</span>
                <span style="font-size:11px;color:#93c5fd;font-weight:600;">tap ›</span>
            </div>
        </div>
    `).join('');
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

    showSection('designations');

    loadDesignations();
    loadClasses();
    loadStaff();
    loadSubjects();
    loadStudents();
    loadHierarchy();

    const addDesForm      = document.getElementById('add-designation-form');
    const addClassForm    = document.getElementById('add-class-form');
    const addStaffForm    = document.getElementById('add-staff-form');
    const addSubjectForm  = document.getElementById('add-subject-form');
    const addStudentForm  = document.getElementById('add-student-form');
    const bulkUploadForm  = document.getElementById('bulk-upload-form');
    const hierarchyForm   = document.getElementById('hierarchy-form');

    if (addDesForm)     addDesForm.addEventListener('submit', handleAddDesignation);
    if (addClassForm)   addClassForm.addEventListener('submit', handleAddClass);
    if (addStaffForm)   addStaffForm.addEventListener('submit', handleAddStaff);
    if (addSubjectForm) addSubjectForm.addEventListener('submit', handleAddSubject);
    if (addStudentForm) addStudentForm.addEventListener('submit', handleAddStudent);
    if (bulkUploadForm) bulkUploadForm.addEventListener('submit', handleBulkUpload);
    if (hierarchyForm)  hierarchyForm.addEventListener('submit', handleSaveHierarchy);

    const staffMobile   = document.getElementById('staff-mobile');
    const studentMobile = document.getElementById('student-mobile');

    function validatePhoneInput(input) {
        if (!input) return;
        input.addEventListener('input', function() {
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
    }

    validatePhoneInput(staffMobile);
    validatePhoneInput(studentMobile);

    console.log('✅ All event listeners attached');
});

// ===================================
// SECTION SWITCHING
// ✅ FIX: reload students fresh every time students tab is opened
// ===================================

function showSection(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');

    const tabs = document.querySelectorAll('#section-tabs button');
    tabs.forEach(t => t.style.fontWeight = 'normal');

    const section = document.getElementById('section-' + sectionName);
    const tab     = document.getElementById('tab-' + sectionName);

    if (section) section.style.display = 'block';
    if (tab)     tab.style.fontWeight = 'bold';

    currentSection = sectionName;

    // ✅ FIX: always re-fetch fresh data when switching to students tab
    // This ensures changes made in data-management (transfers) are reflected here
    if (sectionName === 'students') {
        loadClassStatistics();
        loadStudents();
    }
}

// ===================================
// 1. DESIGNATIONS MANAGEMENT
// ===================================

async function loadDesignations() {
    try {
        showLoading('Loading designations...');
        const response = await apiGet(API_ENDPOINTS.DESIGNATIONS, true);
        hideLoading();
        if (response.success) {
            designationsData = response.data;
            displayDesignations();
        }
    } catch (error) {
        hideLoading();
        showError('Failed to load designations: ' + error.message);
    }
}

function displayDesignations() {
    const tbody = document.querySelector('#designations-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (designationsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No designations found. Add one above.</td></tr>';
        return;
    }

    designationsData.forEach(des => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${des.name}</td>
            <td>${des.staffCount || 0}</td>
            <td>
                <button onclick="editDesignation('${des._id}')">Edit</button>
                <button onclick="deleteDesignation('${des._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddDesignation(e) {
    e.preventDefault();
    const name = document.getElementById('des-name').value.trim();
    if (!name) { showError('Please enter a designation name'); return; }

    const token = localStorage.getItem('token');
    if (!token) { showError('Please login again'); window.location.href = 'login.html'; return; }

    try {
        showLoading('Adding designation...');
        const response = await fetch(API_ENDPOINTS.DESIGNATIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
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
        if (response.success) { showSuccess(response.message); loadDesignations(); }
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
        showLoading('Loading classes...');
        const response = await apiGet(API_ENDPOINTS.CLASSES, true);
        hideLoading();
        if (response.success) {
            classesData = response.data;
            displayClasses();
            if (currentSection === 'students') {
                classStatistics = classesData;
                displayClassStatistics();
            }
        }
    } catch (error) {
        hideLoading();
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

    const studentClassSelect = document.getElementById('student-class');
    const bulkClassSelect    = document.getElementById('bulk-class-select');

    if (studentClassSelect) populateDropdown(studentClassSelect, classesData, '_id', data => data.nickname ? `${data.className} (${data.nickname})` : data.className);
    if (bulkClassSelect)    populateDropdown(bulkClassSelect,    classesData, '_id', data => data.nickname ? `${data.className} (${data.nickname})` : data.className);
}

// made changes in this part for boht nickname and class name and also added nickname in display of class in dropdowns

async function handleAddClass(e) {
    e.preventDefault();
    const className = document.getElementById('class-name').value.trim();
    const nickname  = document.getElementById('class-nickname').value.trim();

    if (!className) { showError('Please enter a class name'); return; }

    const token = localStorage.getItem('token');
    if (!token) { showError('Please login again'); window.location.href = 'login.html'; return; }

    try {
        showLoading('Adding class...');
        const response = await fetch(API_ENDPOINTS.CLASSES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ className, nickname: nickname || null })
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
        if (response.success) { showSuccess(response.message); loadClasses(); }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 3. STAFF MANAGEMENT
// ✅ Designation field removed — assigned in Part 2 Mapping
// ===================================

async function loadStaff() {
    try {
        showLoading('Loading staff...');
        const response = await apiGet(API_ENDPOINTS.STAFF, true);
        hideLoading();
        if (response.success) {
            staffData = response.data;
            displayStaff();
        }
    } catch (error) {
        hideLoading();
        showError('Failed to load staff: ' + error.message);
    }
}

function displayStaff() {
    const tbody = document.querySelector('#staff-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (staffData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No staff found. Add one above.</td></tr>';
        return;
    }

    staffData.forEach(staff => {
        const row = tbody.insertRow();
        const classes     = staff.assignedClasses ? staff.assignedClasses.map(c => c.className).join(', ') : '-';
        const credentials = staff.hasCredentials
            ? (staff.isCredentialActive ? 'Yes (Active)' : 'Yes (Inactive)')
            : 'No';

        row.innerHTML = `
            <td>${staff.name}</td>
            <td>${staff.mobileNo}</td>
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

    const nameInput   = document.getElementById('staff-name');
    const mobileInput = document.getElementById('staff-mobile');

    if (!nameInput || !mobileInput) {
        showError('Form error: Required fields not found');
        return;
    }

    const name     = nameInput.value.trim();
    const mobileNo = mobileInput.value.trim();

    if (!name || !mobileNo) {
        showError('Please fill all required fields');
        return;
    }

    if (!validateMobile(mobileNo)) {
        showError('Please enter a valid 10-digit mobile number starting with 6-9');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        showError('Please login again');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }

    try {
        showLoading('Adding staff...');
        const response = await fetch(API_ENDPOINTS.STAFF, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, mobileNo })
        });

        const data = await response.json();
        hideLoading();

        if (response.ok && data.success) {
            showSuccess(data.message || 'Staff added successfully!');
            document.getElementById('add-staff-form').reset();
            const staffMobileInput = document.getElementById('staff-mobile');
            if (staffMobileInput) staffMobileInput.classList.remove('phone-valid', 'phone-invalid');
            await loadStaff();
        } else {
            showError(data.message || 'Failed to add staff');
        }
    } catch (error) {
        hideLoading();
        showError('Network error: ' + error.message);
    }
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
        if (response.success) { showSuccess(response.message); loadStaff(); }
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
        showLoading('Loading subjects...');
        const response = await apiGet(API_ENDPOINTS.SUBJECTS, true);
        hideLoading();
        if (response.success) {
            subjectsData = response.data;
            displaySubjects();
        }
    } catch (error) {
        hideLoading();
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
    const subjectName = document.getElementById('subject-name').value.trim();
    if (!subjectName) { showError('Please enter a subject name'); return; }

    try {
        showLoading('Adding subject...');
        const response = await apiPost(API_ENDPOINTS.SUBJECTS, { subjectName }, true);
        hideLoading();
        if (response.success) {
            showSuccess(response.message || 'Subject added successfully');
            document.getElementById('add-subject-form').reset();
            loadSubjects();
        }
    } catch (error) {
        hideLoading();
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
        if (response.success) { showSuccess(response.message); loadSubjects(); }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 5. STUDENTS MANAGEMENT
// ✅ FIX: isActive=true filter on all student fetches
// ===================================

async function loadStudents() {
    try {
        showLoading('Loading students...');
        // ✅ FIX: isActive=true ensures graduated/transferred-out students never appear here
        const response = await apiGet(API_ENDPOINTS.STUDENTS + '?limit=100&isActive=true', true);
        hideLoading();
        if (response.success) {
            studentsData = response.data;
            displayStudents();
        }
    } catch (error) {
        hideLoading();
        showError('Failed to load students: ' + error.message);
    }
}

async function loadAllStudents() {
    document.getElementById('search-student').value = '';
    loadStudents(); // uses isActive=true by default
}

function displayStudents() {
    const tbody = document.querySelector('#students-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (studentsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">No students found. Add one above.</td></tr>';
        return;
    }

    studentsData.forEach((student, index) => {
        const row = tbody.insertRow();
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            try { return new Date(dateString).toLocaleDateString('en-IN'); }
            catch { return '-'; }
        };
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${student.name}</td>
            <td>${student.fatherName}</td>
            <td>${student.motherName || '-'}</td>
            <td>${student.classId?.className || '-'}</td>
            <td>${student.mobileNo}</td>
            <td>${formatDate(student.dateOfBirth)}</td>
            <td>${student.simpleAddress || '-'}</td>
            <td>
                <button onclick="editStudent('${student._id}')">Edit</button>
                <button onclick="deleteStudent('${student._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddStudent(e) {
    e.preventDefault();

    const nameInput    = document.getElementById('student-name');
    const fatherInput  = document.getElementById('student-father');
    const motherInput  = document.getElementById('student-mother');
    const classInput   = document.getElementById('student-class');
    const mobileInput  = document.getElementById('student-mobile');
    const dobInput     = document.getElementById('student-dob');
    const addressInput = document.getElementById('student-address');

    if (!nameInput || !fatherInput || !classInput || !mobileInput) {
        showError('Form error: Required fields not found');
        return;
    }

    const name         = nameInput.value.trim();
    const fatherName   = fatherInput.value.trim();
    const motherName   = motherInput ? motherInput.value.trim() : '';
    const classId      = classInput.value;
    const mobileNo     = mobileInput.value.trim();
    const dateOfBirth  = dobInput ? dobInput.value : '';
    const simpleAddress = addressInput ? addressInput.value.trim() : '';

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
            name,
            fatherName,
            motherName:    motherName   || undefined,
            classId,
            mobileNo,
            dateOfBirth:   dateOfBirth  || undefined,
            simpleAddress: simpleAddress || undefined
        }, true);
        hideLoading();

        if (response.success) {
            const classResponse = await apiGet(API_ENDPOINTS.CLASSES + '/' + classId, true);
            const totalInClass  = classResponse.success ? classResponse.data.studentCount : 1;

            showBulkUploadResultsModal({
                className: classesData.find(c => c._id === classId)?.className || 'Class',
                total: 1, successful: 1, failed: 0, totalInClass,
                errors: [], successMessage: 'Student added successfully!'
            });

            document.getElementById('add-student-form').reset();
            const studentMobileInput = document.getElementById('student-mobile');
            if (studentMobileInput) studentMobileInput.classList.remove('phone-valid', 'phone-invalid');

            await loadStudents();
            await loadClasses();
            await loadClassStatistics();

        } else if (response.isDuplicate) {
            showBulkUploadResultsModal({
                className: classesData.find(c => c._id === classId)?.className || 'Class',
                total: 1, successful: 0, failed: 1, totalInClass: 0,
                errors: [{ row: 1, message: response.message }]
            });
        }
    } catch (error) {
        hideLoading();
        if (error.message.includes('Duplicate') || error.message.includes('409')) {
            showBulkUploadResultsModal({
                className: 'Class', total: 1, successful: 0, failed: 1, totalInClass: 0,
                errors: [{ row: 1, message: error.message }]
            });
        } else {
            showError(error.message);
        }
    }
}

async function searchStudents() {
    const searchTerm = document.getElementById('search-student').value.trim();
    if (!searchTerm) { loadStudents(); return; }

    try {
        showLoading('Searching...');
        // ✅ FIX: keep isActive=true in search too
        const response = await apiGet(
            API_ENDPOINTS.STUDENTS + '?isActive=true&search=' + encodeURIComponent(searchTerm),
            true
        );
        hideLoading();
        if (response.success) { studentsData = response.data; displayStudents(); }
    } catch (error) {
        hideLoading();
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
            await loadStudents();
            await loadClasses();
            await loadClassStatistics();
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
        showLoading('Loading hierarchy...');
        const response = await apiGet(API_ENDPOINTS.HIERARCHY, true);
        hideLoading();
        if (response.success && response.data) displayCurrentHierarchy(response.data.numLevels);
    } catch (error) {
        hideLoading();
        console.error('Failed to load hierarchy:', error);
    }
}

async function handleSaveHierarchy(e) {
    e.preventDefault();
    const numLevels = parseInt(document.getElementById('num-levels').value);
    if (!numLevels) { showError('Please select number of levels'); return; }

    try {
        showLoading('Saving hierarchy...');
        const response = await apiPost(API_ENDPOINTS.HIERARCHY, { numLevels }, true);
        hideLoading();
        if (response.success) {
            showSuccess(response.message || 'Hierarchy saved successfully');
            displayCurrentHierarchy(numLevels);
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayCurrentHierarchy(numLevels) {
    const container = document.getElementById('current-hierarchy');
    if (!container) return;

    if (!numLevels || numLevels === 0) {
        container.innerHTML = '<p>No hierarchy defined yet.</p>';
        return;
    }

    let html = '<ul style="list-style-type: none; padding-left: 0;">';
    for (let i = 1; i <= numLevels; i++) {
        html += `<li style="padding: 10px; margin-bottom: 8px; background: white; border-left: 4px solid var(--primary-500); border-radius: 8px;">
            <strong>Level ${i}</strong>
        </li>`;
    }
    html += '</ul>';
    container.innerHTML = html;
}

// ===================================
// EDIT MODAL FUNCTIONS
// ✅ Staff edit modal: designation removed
// ===================================

let currentEditType = null;
let currentEditId   = null;
let currentEditData = null;

function openEditModal(type, id, data) {
    currentEditType = type;
    currentEditId   = id;
    currentEditData = data;

    const modal      = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody  = document.getElementById('modal-body');

    const titles = {
        'designation': 'Edit Designation',
        'class':       'Edit Class',
        'staff':       'Edit Staff Member',
        'subject':     'Edit Subject',
        'student':     'Edit Student'
    };
    modalTitle.textContent = titles[type] || 'Edit Item';

    let fieldsHTML = '';

    switch(type) {
        case 'designation':
            fieldsHTML = `
                <div class="edit-modal-field">
                    <label>Designation Name *</label>
                    <input type="text" id="edit-des-name" value="${data.name || ''}" required>
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
                    <label>Mother Name</label>
                    <input type="text" id="edit-student-mother" value="${data.motherName || ''}">
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
                <div class="edit-modal-field">
                    <label>Date of Birth</label>
                    <input type="date" id="edit-student-dob" value="${data.dateOfBirth ? data.dateOfBirth.split('T')[0] : ''}">
                </div>
                <div class="edit-modal-field">
                    <label>Address</label>
                    <textarea id="edit-student-address" rows="3">${data.simpleAddress || ''}</textarea>
                </div>
            `;
            break;
    }

    modalBody.innerHTML = fieldsHTML;

    const phoneFields = modalBody.querySelectorAll('.phone-field');
    phoneFields.forEach(field => {
        field.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length === 10) {
                this.classList.remove('phone-invalid'); this.classList.add('phone-valid');
            } else if (this.value.length > 0) {
                this.classList.remove('phone-valid'); this.classList.add('phone-invalid');
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
    currentEditId   = null;
    currentEditData = null;
}

async function saveEdit() {
    if (!currentEditType || !currentEditId) return;

    try {
        let updatedData = {};
        let response;

        switch(currentEditType) {
            case 'designation':
                updatedData = { name: document.getElementById('edit-des-name').value };
                showLoading('Updating designation...');
                response = await apiPut(API_ENDPOINTS.DESIGNATIONS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) { showSuccess(response.message); loadDesignations(); }
                break;

            case 'class':
                updatedData = {
                    className: document.getElementById('edit-class-name').value,
                    nickname:  document.getElementById('edit-class-nickname').value || null
                };
                showLoading('Updating class...');
                response = await apiPut(API_ENDPOINTS.CLASSES + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    await loadClasses();
                    await loadClassStatistics();
                }
                break;

            case 'staff':
                const mobileInput = document.getElementById('edit-staff-mobile');
                if (mobileInput.value.length !== 10) {
                    alert('Please enter a valid 10-digit mobile number');
                    return;
                }
                updatedData = {
                    name:     document.getElementById('edit-staff-name').value,
                    mobileNo: mobileInput.value
                };
                showLoading('Updating staff...');
                response = await apiPut(API_ENDPOINTS.STAFF + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) { showSuccess(response.message); loadStaff(); }
                break;

            case 'subject':
                updatedData = { subjectName: document.getElementById('edit-subject-name').value };
                showLoading('Updating subject...');
                response = await apiPut(API_ENDPOINTS.SUBJECTS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) { showSuccess(response.message); loadSubjects(); }
                break;

            case 'student':
                const studentMobileInput = document.getElementById('edit-student-mobile');
                if (studentMobileInput.value.length !== 10) {
                    alert('Please enter a valid 10-digit mobile number');
                    return;
                }
                updatedData = {
                    name:          document.getElementById('edit-student-name').value,
                    fatherName:    document.getElementById('edit-student-father').value,
                    motherName:    document.getElementById('edit-student-mother')?.value.trim()   || undefined,
                    classId:       document.getElementById('edit-student-class').value,
                    mobileNo:      studentMobileInput.value,
                    dateOfBirth:   document.getElementById('edit-student-dob')?.value             || undefined,
                    simpleAddress: document.getElementById('edit-student-address')?.value.trim()  || undefined
                };
                showLoading('Updating student...');
                response = await apiPut(API_ENDPOINTS.STUDENTS + '/' + currentEditId, updatedData, true);
                hideLoading();
                if (response.success) {
                    showSuccess(response.message);
                    await loadStudents();
                    await loadClasses();
                    await loadClassStatistics();
                }
                break;
        }

        closeEditModal();
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function getClassOptions(selectedClass) {
    let options = '<option value="">-- Select Class --</option>';
    classesData.forEach(cls => {
        const selected = cls._id === selectedClass ? 'selected' : '';
        options += `<option value="${cls._id}" ${selected}>${cls.nickname || cls.className}</option>`;
    });
    return options;
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('upload-results-modal');
    if (e.target === modal) closeUploadModal();
});


// ===================================
// CLASS STUDENTS MODAL
// With pagination (50/page) + live search filter
// ===================================

const CSM_PAGE_SIZE = 50;
let csmState = {
    classId:    '',
    className:  '',
    nickname:   '',
    page:       1,
    totalPages: 1,
    totalCount: 0,
    allLoaded:  [],   // all fetched students for current page-set
    filtered:   [],   // after search filter
    searchTerm: ''
};

async function openClassStudentsModal(classId, className, nickname) {
    // Reset state
    csmState = {
        classId, className, nickname,
        page: 1, totalPages: 1, totalCount: 0,
        allLoaded: [], filtered: [], searchTerm: ''
    };

    // Clear search input
    const searchEl = document.getElementById('csm-search');
    if (searchEl) searchEl.value = '';

    // Set title
    document.getElementById('csm-title').textContent =
        nickname ? `${className} (${nickname})` : className;
    document.getElementById('csm-subtitle').textContent = 'Loading...';

    // Show modal
    const modal = document.getElementById('class-students-modal');
    modal.style.display = 'flex';

    // Show loading state
    document.getElementById('csm-body').innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:#94a3b8;">
            <div style="font-size:36px;margin-bottom:12px;">⏳</div>
            <div style="font-size:15px;font-weight:600;">Loading students...</div>
        </div>`;
    document.getElementById('csm-pagination').style.display = 'none';

    await csmFetchPage(1);
}

async function csmFetchPage(page) {
    try {
        const token = localStorage.getItem('token');
        const url = `${API_ENDPOINTS.STUDENTS}?classId=${csmState.classId}&isActive=true&limit=${CSM_PAGE_SIZE}&page=${page}&sortBy=name&sortOrder=asc`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success) {
            csmShowError('Failed to load students.');
            return;
        }

        // Update state
        csmState.page       = page;
        csmState.allLoaded  = data.data || [];
        csmState.totalCount = data.pagination?.totalRecords ?? data.data.length;
        csmState.totalPages = data.pagination?.totalPages   ?? 1;
        csmState.searchTerm = (document.getElementById('csm-search')?.value || '').trim().toLowerCase();
        csmState.filtered   = csmApplySearch(csmState.allLoaded, csmState.searchTerm);

        // Update subtitle
        document.getElementById('csm-subtitle').textContent =
            `${csmState.totalCount} student${csmState.totalCount !== 1 ? 's' : ''} total`;

        csmRenderList();
        csmRenderPagination();

    } catch (err) {
        csmShowError('Network error: ' + err.message);
    }
}

function csmApplySearch(students, term) {
    if (!term) return students;
    return students.filter(s =>
        s.name?.toLowerCase().includes(term)       ||
        s.fatherName?.toLowerCase().includes(term) ||
        s.mobileNo?.includes(term)
    );
}

function filterModalStudents() {
    const term = (document.getElementById('csm-search')?.value || '').trim().toLowerCase();
    csmState.searchTerm = term;
    csmState.filtered   = csmApplySearch(csmState.allLoaded, term);
    csmRenderList();
}

function csmRenderList() {
    const body = document.getElementById('csm-body');
    const list = csmState.filtered;

    if (list.length === 0) {
        body.innerHTML = `
            <div style="text-align:center;padding:50px 20px;color:#94a3b8;">
                <div style="font-size:36px;margin-bottom:12px;">🔍</div>
                <div style="font-size:15px;font-weight:600;">
                    ${csmState.searchTerm ? 'No students match your search.' : 'No students in this class yet.'}
                </div>
            </div>`;
        return;
    }

    // Calculate display index offset for current page
    const pageOffset = (csmState.page - 1) * CSM_PAGE_SIZE;

    body.innerHTML = list.map((s, i) => `
        <div style="
            display:flex; align-items:center; gap:14px;
            padding:13px 15px; margin-bottom:9px;
            background:#f8fafc; border-radius:13px;
            border-left:4px solid #3b82f6;
            transition:background 0.15s;"
            onmouseover="this.style.background='#eff6ff'"
            onmouseout="this.style.background='#f8fafc'">

            <!-- Index badge -->
            <div style="
                width:36px; height:36px; border-radius:50%;
                background:linear-gradient(135deg,#1d4ed8,#3b82f6);
                color:#fff; display:flex; align-items:center; justify-content:center;
                font-weight:800; font-size:13px; flex-shrink:0; letter-spacing:-0.5px;">
                ${pageOffset + i + 1}
            </div>

            <!-- Info -->
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700;color:#0f172a;font-size:15px;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${s.name}
                </div>
                <div style="font-size:12px;color:#64748b;margin-top:2px;">
                    Father: <span style="font-weight:600;color:#475569;">${s.fatherName}</span>
                </div>
            </div>

            <!-- Mobile chip -->
            <div style="
                font-size:12px; font-weight:700; color:#1d4ed8;
                background:#dbeafe; padding:6px 11px;
                border-radius:20px; white-space:nowrap; flex-shrink:0;">
                📞 ${s.mobileNo}
            </div>
        </div>
    `).join('');
}

function csmRenderPagination() {
    const pag     = document.getElementById('csm-pagination');
    const info    = document.getElementById('csm-page-info');
    const prevBtn = document.getElementById('csm-prev-btn');
    const nextBtn = document.getElementById('csm-next-btn');

    if (csmState.totalPages <= 1) {
        pag.style.display = 'none';
        return;
    }

    pag.style.display = 'flex';

    const start = (csmState.page - 1) * CSM_PAGE_SIZE + 1;
    const end   = Math.min(csmState.page * CSM_PAGE_SIZE, csmState.totalCount);
    info.textContent = `Showing ${start}–${end} of ${csmState.totalCount}`;

    prevBtn.disabled = csmState.page <= 1;
    nextBtn.disabled = csmState.page >= csmState.totalPages;
    prevBtn.style.opacity = csmState.page <= 1 ? '0.4' : '1';
    nextBtn.style.opacity = csmState.page >= csmState.totalPages ? '0.4' : '1';
}

async function csmChangePage(delta) {
    const newPage = csmState.page + delta;
    if (newPage < 1 || newPage > csmState.totalPages) return;

    // Clear search when changing pages
    const searchEl = document.getElementById('csm-search');
    if (searchEl) searchEl.value = '';
    csmState.searchTerm = '';

    document.getElementById('csm-body').innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:#94a3b8;">
            <div style="font-size:36px;margin-bottom:12px;">⏳</div>
            <div style="font-size:15px;font-weight:600;">Loading page ${newPage}...</div>
        </div>`;

    await csmFetchPage(newPage);
}

function csmShowError(msg) {
    document.getElementById('csm-body').innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:#dc2626;">
            <div style="font-size:36px;margin-bottom:12px;">❌</div>
            <div style="font-size:15px;font-weight:600;">${msg}</div>
        </div>`;
    document.getElementById('csm-subtitle').textContent = 'Error';
}

function closeClassStudentsModal() {
    document.getElementById('class-students-modal').style.display = 'none';
}

// Close on backdrop click
document.addEventListener('click', function(e) {
    const modal = document.getElementById('class-students-modal');
    if (e.target === modal) closeClassStudentsModal();
});

console.log('✅ basic-info.js loaded — isActive filter + tab reload fixed');