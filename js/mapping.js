// mapping.js - Part 2: Mapping Logic

let staffData = [];
let classesData = [];
let subjectsData = [];
let designationsData = [];
let staffClassMappings = [];
let classSubjectMappings = [];
let teacherSubjectMappings = [];

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

// Helper function from basic-info.js
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
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    
    // Load all data
    loadAllData();
    
    // Show first section
    showMappingSection('staff-class');
    
    // Setup form handlers
    document.getElementById('assign-staff-class-form').addEventListener('submit', handleAssignStaffToClasses);
    document.getElementById('assign-class-subject-form').addEventListener('submit', handleAssignSubjectsToClass);
    document.getElementById('assign-teacher-subject-form').addEventListener('submit', handleAssignTeacherToSubjects);
    
    // Setup class selection for teacher-subject form
    document.getElementById('ts-class').addEventListener('change', handleTeacherClassSelection);
});

async function loadAllData() {
    try {
        showLoading('Loading mapping data...');
        
        // Load all required data
        const [staff, classes, subjects, designations, mappings] = await Promise.all([
            apiGet(API_ENDPOINTS.STAFF, true),
            apiGet(API_ENDPOINTS.CLASSES, true),
            apiGet(API_ENDPOINTS.SUBJECTS, true),
            apiGet(API_ENDPOINTS.DESIGNATIONS, true),
            apiGet(API_ENDPOINTS.ALL_MAPPINGS, true)
        ]);
        
        staffData = staff.data;
        classesData = classes.data;
        subjectsData = subjects.data;
        designationsData = designations.data;
        
        if (mappings.success) {
            staffClassMappings = mappings.data.staffToClass || [];
            classSubjectMappings = mappings.data.classToSubject || [];
            teacherSubjectMappings = mappings.data.teacherToSubject || [];
        }
        
        hideLoading();
        
        // Populate dropdowns and display data
        setupStaffClassSection();
        setupClassSubjectSection();
        setupTeacherSubjectSection();
        
        displayAllMappings();
        
    } catch (error) {
        hideLoading();
        showError('Failed to load data: ' + error.message);
    }
}

function showMappingSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.mapping-section');
    sections.forEach(s => s.style.display = 'none');
    
    // Remove active style from all tabs
    const tabs = document.querySelectorAll('#section-tabs button');
    tabs.forEach(t => t.style.fontWeight = 'normal');
    
    // Show selected section
    document.getElementById('section-' + sectionName).style.display = 'block';
    document.getElementById('tab-' + sectionName).style.fontWeight = 'bold';
}

// ===================================
// 1. STAFF-CLASS MAPPING
// ===================================

function setupStaffClassSection() {
    // Populate staff dropdown
    const staffSelect = document.getElementById('sc-staff-name');
    populateDropdown(staffSelect, staffData, '_id', 'name');
    
    // Populate designation dropdown
    const desSelect = document.getElementById('sc-designation');
    populateDropdown(desSelect, designationsData, '_id', 'name');
    
    // Create class checkboxes
    const classesContainer = document.getElementById('sc-classes-checkboxes');
    classesContainer.innerHTML = '';
    
    classesData.forEach(cls => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="sc-class" value="${cls._id}">
            ${cls.nickname || cls.className}
        `;
        classesContainer.appendChild(label);
        classesContainer.appendChild(document.createElement('br'));
    });
}

function toggleAllClasses(checkbox) {
    const classCheckboxes = document.querySelectorAll('input[name="sc-class"]');
    classCheckboxes.forEach(cb => cb.checked = checkbox.checked);
}

async function handleAssignStaffToClasses(e) {
    e.preventDefault();
    
    const staffId = document.getElementById('sc-staff-name').value;
    const designationId = document.getElementById('sc-designation').value;
    
    // Get selected classes
    const selectedClasses = Array.from(document.querySelectorAll('input[name="sc-class"]:checked'))
        .map(cb => cb.value);
    
    if (selectedClasses.length === 0) {
        showError('Please select at least one class');
        return;
    }
    
    try {
        showLoading('Assigning staff to classes...');
        
        const response = await apiPost(API_ENDPOINTS.STAFF_CLASS_MAPPING, {
            staffId: staffId,
            designationId: designationId,
            assignedClasses: selectedClasses
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Staff assigned to classes successfully!');
            document.getElementById('assign-staff-class-form').reset();
            document.getElementById('sc-all-classes').checked = false;
            loadAllData();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayStaffClassMappings() {
    const tbody = document.querySelector('#staff-class-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (staffClassMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No staff assignments yet. Use the form above to assign staff.</td></tr>';
        return;
    }
    
    staffClassMappings.forEach(mapping => {
        const row = tbody.insertRow();
        const classes = mapping.assignedClasses.map(c => c.className).join(', ') || 'None';
        
        row.innerHTML = `
            <td>${mapping.staffId?.name || '-'}</td>
            <td>${mapping.designationId?.name || '-'}</td>
            <td>${classes}</td>
            <td>
                <button onclick="editStaffClassMapping('${mapping._id}')">Edit</button>
                <button onclick="deleteStaffClassMapping('${mapping._id}')">Delete</button>
            </td>
        `;
    });
}

async function editStaffClassMapping(id) {
    showError('Please use the form above to update staff assignments');
}

async function deleteStaffClassMapping(id) {
    if (!confirm('Remove this staff assignment?')) return;
    
    try {
        showLoading('Removing staff assignment...');
        
        const response = await apiDelete(API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Staff assignment removed successfully!');
            loadAllData();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// 2. CLASS-SUBJECT MAPPING
// ===================================

function setupClassSubjectSection() {
    // Populate class dropdown
    const classSelect = document.getElementById('cs-class');
    populateDropdown(classSelect, classesData, '_id', data => data.nickname || data.className);
    
    // Create subject checkboxes
    const subjectsContainer = document.getElementById('cs-subjects-checkboxes');
    subjectsContainer.innerHTML = '';
    
    subjectsData.forEach(subject => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="cs-subject" value="${subject._id}">
            ${subject.subjectName}
        `;
        subjectsContainer.appendChild(label);
        subjectsContainer.appendChild(document.createElement('br'));
    });
}

function toggleAllSubjects(checkbox) {
    const subjectCheckboxes = document.querySelectorAll('input[name="cs-subject"]');
    subjectCheckboxes.forEach(cb => cb.checked = checkbox.checked);
}

async function handleAssignSubjectsToClass(e) {
    e.preventDefault();
    
    const classId = document.getElementById('cs-class').value;
    
    // Get selected subjects
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="cs-subject"]:checked'))
        .map(cb => cb.value);
    
    if (selectedSubjects.length === 0) {
        showError('Please select at least one subject');
        return;
    }
    
    try {
        showLoading('Assigning subjects to class...');
        
        const response = await apiPost(API_ENDPOINTS.CLASS_SUBJECT_MAPPING, {
            classId: classId,
            subjectIds: selectedSubjects
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Subjects assigned to class successfully!');
            document.getElementById('assign-class-subject-form').reset();
            document.getElementById('cs-all-subjects').checked = false;
            loadAllData();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayClassSubjectMappings() {
    const tbody = document.querySelector('#class-subject-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (classSubjectMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No subject assignments yet. Use the form above to assign subjects to classes.</td></tr>';
        return;
    }
    
    classSubjectMappings.forEach(mapping => {
        const row = tbody.insertRow();
        const subjects = mapping.subjectIds.map(s => s.subjectName).join(', ') || 'None';
        
        row.innerHTML = `
            <td>${mapping.classId?.className || '-'} ${mapping.classId?.nickname ? '(' + mapping.classId.nickname + ')' : ''}</td>
            <td>${subjects}</td>
            <td>
                <button onclick="editClassSubjectMapping('${mapping.classId._id}')">Edit</button>
            </td>
        `;
    });
}

async function editClassSubjectMapping(classId) {
    showError('Please use the form above to update class subject assignments');
}

// ===================================
// 3. TEACHER-SUBJECT MAPPING
// ===================================

function setupTeacherSubjectSection() {
    // Populate teacher dropdown (only staff members)
    const teacherSelect = document.getElementById('ts-teacher');
    populateDropdown(teacherSelect, staffData, '_id', 'name');
    
    // Populate class dropdown
    const classSelect = document.getElementById('ts-class');
    populateDropdown(classSelect, classesData, '_id', data => data.nickname || data.className);
}

async function handleTeacherClassSelection() {
    const classId = document.getElementById('ts-class').value;
    
    if (!classId) {
        document.getElementById('ts-subjects-container').classList.remove('show');
        return;
    }
    
    // Find subjects assigned to this class
    const classMapping = classSubjectMappings.find(m => m.classId._id === classId);
    
    if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
        showError('No subjects assigned to this class yet. Please assign subjects first in Section 2.');
        document.getElementById('ts-subjects-container').classList.remove('show');
        return;
    }
    
    // Show subjects as checkboxes
    const container = document.getElementById('ts-subjects-checkboxes');
    container.innerHTML = '';
    
    classMapping.subjectIds.forEach(subject => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="ts-subject" value="${subject._id}">
            ${subject.subjectName}
        `;
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
    
    document.getElementById('ts-subjects-container').classList.add('show');
}

async function handleAssignTeacherToSubjects(e) {
    e.preventDefault();
    
    const teacherId = document.getElementById('ts-teacher').value;
    const classId = document.getElementById('ts-class').value;
    
    // Get selected subjects
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="ts-subject"]:checked'))
        .map(cb => cb.value);
    
    if (selectedSubjects.length === 0) {
        showError('Please select at least one subject');
        return;
    }
    
    try {
        showLoading('Assigning teacher to subjects...');
        
        const response = await apiPost(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING, {
            teacherId: teacherId,
            classId: classId,
            subjectIds: selectedSubjects
        }, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Teacher assigned to subjects successfully!');
            document.getElementById('assign-teacher-subject-form').reset();
            document.getElementById('ts-subjects-container').classList.remove('show');
            loadAllData();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayTeacherSubjectMappings() {
    const tbody = document.querySelector('#teacher-subject-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (teacherSubjectMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No teacher assignments yet. Use the form above to assign teachers to subjects.</td></tr>';
        return;
    }
    
    teacherSubjectMappings.forEach(mapping => {
        const row = tbody.insertRow();
        const subjects = mapping.subjectIds.map(s => s.subjectName).join(', ') || 'None';
        
        row.innerHTML = `
            <td>${mapping.teacherId?.name || '-'}</td>
            <td>${mapping.classId?.className || '-'} ${mapping.classId?.nickname ? '(' + mapping.classId.nickname + ')' : ''}</td>
            <td>${subjects}</td>
            <td>
                <button onclick="editTeacherSubjectMapping('${mapping._id}')">Edit</button>
                <button onclick="deleteTeacherSubjectMapping('${mapping._id}')">Delete</button>
            </td>
        `;
    });
}

async function editTeacherSubjectMapping(id) {
    showError('Please use the form above to update teacher subject assignments');
}

async function deleteTeacherSubjectMapping(id) {
    if (!confirm('Remove this teacher assignment?')) return;
    
    try {
        showLoading('Removing teacher assignment...');
        
        const response = await apiDelete(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING + '/' + id, true);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Teacher assignment removed successfully!');
            loadAllData();
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

// ===================================
// DISPLAY ALL MAPPINGS
// ===================================

function displayAllMappings() {
    displayStaffClassMappings();
    displayClassSubjectMappings();
    displayTeacherSubjectMappings();
}

console.log('✅ mapping.js loaded successfully');