// mapping.js - UPDATED: Section 2 auto-subject + Section 4 multi-class teacher assignment

let staffData = [];
let classesData = [];
let subjectsData = [];
let designationsData = [];
let levelsData = [];
let staffClassMappings = [];
let classSubjectMappings = [];
let teacherSubjectMappings = [];
let levelDesignationMappings = [];

// Current edit state
let currentEditMode = null;
let currentEditId = null;
let currentEditData = null;

// ===================================
// HELPER: FORMAT CLASS NAME WITH NICKNAME
// ===================================
function formatClassName(classObj) {
    if (!classObj) return '-';
    if (classObj.nickname && classObj.nickname.trim()) {
        return `${classObj.className} (${classObj.nickname})`;
    }
    return classObj.className || '-';
}

// ===================================
// HELPER: SAFE PROPERTY ACCESS
// ===================================
function safeGet(obj, path, defaultValue = '-') {
    if (!obj) return defaultValue;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined) return defaultValue;
        current = current[key];
    }
    return current !== null && current !== undefined ? current : defaultValue;
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
    if (loadingEl) { loadingEl.textContent = message; loadingEl.style.display = 'block'; loadingEl.classList.add('show'); }
}

function hideLoading() {
    const loadingEl = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    if (loadingEl) { loadingEl.classList.remove('show'); loadingEl.style.display = 'none'; }
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const anyMessageShowing = (errorEl && errorEl.classList.contains('show')) || (successEl && successEl.classList.contains('show'));
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

function populateDropdown(selectElement, data, valueKey, textKey) {
    if (!selectElement || !Array.isArray(data)) return;
    selectElement.innerHTML = '<option value="">-- Select --</option>';
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = typeof valueKey === 'function' ? valueKey(item) : item[valueKey];
        option.textContent = typeof textKey === 'function' ? textKey(item) : item[textKey];
        selectElement.appendChild(option);
    });
}

// ===================================
// EDIT MODAL FUNCTIONS
// ===================================

function openEditModal(mode, id, data) {
    currentEditMode = mode;
    currentEditId = id;
    currentEditData = data;
    const modal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('edit-modal-title');
    const modalBody = document.getElementById('edit-modal-body');
    const titles = {
        'level-designation': '✏️ Edit Level-Designation Assignment',
        'staff-class': '✏️ Edit Staff Assignment',
        'class-subject': '✏️ Edit Class Subjects',
        'teacher-subject': '✏️ Edit Teacher Assignment'
    };
    modalTitle.textContent = titles[mode] || 'Edit Assignment';
    if (mode === 'level-designation') { modalBody.innerHTML = generateLevelDesignationEditForm(data); setupLevelDesignationEditForm(data); }
    else if (mode === 'staff-class') { modalBody.innerHTML = generateStaffClassEditForm(data); setupStaffClassEditForm(data); }
    else if (mode === 'class-subject') { modalBody.innerHTML = generateClassSubjectEditForm(data); setupClassSubjectEditForm(data); }
    else if (mode === 'teacher-subject') { modalBody.innerHTML = generateTeacherSubjectEditForm(data); setupTeacherSubjectEditForm(data); }
    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('show');
    currentEditMode = null; currentEditId = null; currentEditData = null;
}

// Level-Designation Edit
function generateLevelDesignationEditForm(data) {
    const designationName = safeGet(data, 'designationId.name', '-');
    return `
        <div class="edit-form-group">
            <label>Designation</label>
            <input type="text" value="${designationName}" disabled class="disabled-input">
        </div>
        <div class="edit-form-group">
            <label>Assigned Level * (Choose ONE only)</label>
            <small style="display:block;margin-bottom:var(--space-2);color:var(--gray-600);">Each designation can have only one level</small>
            <div class="edit-checkbox-container" id="edit-levels-container"></div>
        </div>`;
}

function setupLevelDesignationEditForm(data) {
    const container = document.getElementById('edit-levels-container');
    const assignedLevelIds = (data.levelIds || []).map(l => l?._id).filter(Boolean);
    const currentLevelId = assignedLevelIds[0];
    container.innerHTML = '';
    levelsData.forEach(level => {
        if (!level || !level._id) return;
        const isChecked = currentLevelId === level._id;
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="edit-level" value="${level._id}" ${isChecked ? 'checked' : ''}> ${level.levelName || 'Unnamed'}`;
        container.appendChild(label);
    });
}

// Staff-Class Edit
function generateStaffClassEditForm(data) {
    const staffName = safeGet(data, 'staffId.name', '-');
    return `
        <div class="edit-form-group">
            <label>Staff Name</label>
            <input type="text" value="${staffName}" disabled class="disabled-input">
        </div>
        <div class="edit-form-group">
            <label for="edit-designation">Designation *</label>
            <select id="edit-designation" required><option value="">-- Select Designation --</option></select>
        </div>
        <div class="edit-form-group">
            <label>Assigned Classes *</label>
            <div class="edit-checkbox-container" id="edit-classes-container"></div>
        </div>`;
}

function setupStaffClassEditForm(data) {
    const desSelect = document.getElementById('edit-designation');
    populateDropdown(desSelect, designationsData, '_id', 'name');
    desSelect.value = safeGet(data, 'designationId._id', '');
    const container = document.getElementById('edit-classes-container');
    const assignedClassIds = (data.assignedClasses || []).map(c => c?._id).filter(Boolean);
    container.innerHTML = '';
    classesData.forEach(cls => {
        if (!cls || !cls._id) return;
        const isChecked = assignedClassIds.includes(cls._id);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="edit-class" value="${cls._id}" ${isChecked ? 'checked' : ''}> ${formatClassName(cls)}`;
        container.appendChild(label);
    });
}

// Class-Subject Edit
function generateClassSubjectEditForm(data) {
    const className = formatClassName(data.classId);
    return `
        <div class="edit-form-group">
            <label>Class</label>
            <input type="text" value="${className}" disabled class="disabled-input">
        </div>
        <div class="edit-form-group">
            <label>Assigned Subjects *</label>
            <div class="edit-checkbox-container" id="edit-subjects-container"></div>
        </div>`;
}

function setupClassSubjectEditForm(data) {
    const container = document.getElementById('edit-subjects-container');
    const assignedSubjectIds = (data.subjectIds || []).map(s => s?._id).filter(Boolean);
    container.innerHTML = '';
    subjectsData.forEach(subject => {
        if (!subject || !subject._id) return;
        const isChecked = assignedSubjectIds.includes(subject._id);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="edit-subject" value="${subject._id}" ${isChecked ? 'checked' : ''}> ${subject.subjectName || 'Unnamed'}`;
        container.appendChild(label);
    });
}

// Teacher-Subject Edit
function generateTeacherSubjectEditForm(data) {
    const teacherName = safeGet(data, 'teacherId.name', '-');
    return `
        <div class="edit-form-group">
            <label>Teacher Name</label>
            <input type="text" value="${teacherName}" disabled class="disabled-input">
        </div>
        <div class="edit-form-group">
            <label for="edit-ts-designation">Designation *</label>
            <select id="edit-ts-designation" required><option value="">-- Select Designation --</option></select>
        </div>
        <div class="edit-form-group">
            <label>Class(es) *</label>
            <div class="edit-checkbox-container" id="edit-ts-class-container" style="max-height:180px;"></div>
        </div>
        <div class="edit-form-group" id="edit-subjects-group">
            <label>Assigned Subjects *</label>
            <div class="edit-checkbox-container" id="edit-subjects-container"></div>
        </div>`;
}

// ✅ FIX 1: setupTeacherSubjectEditForm now loads ALL assigned classes + their subjects
function setupTeacherSubjectEditForm(data) {
    // Populate designation
    const desSelect = document.getElementById('edit-ts-designation');
    populateDropdown(desSelect, designationsData, '_id', 'name');
    const teacherId = safeGet(data, 'teacherId._id', null);
    const staffMapping = staffClassMappings.find(m => m.staffId?._id === teacherId);
    if (staffMapping) desSelect.value = safeGet(staffMapping, 'designationId._id', '');

    // Find ALL classes this teacher is assigned to across ALL their teacher-subject mappings
    const allTeacherClassIds = teacherSubjectMappings
        .filter(m => safeGet(m, 'teacherId._id') === teacherId)
        .map(m => safeGet(m, 'classId._id'))
        .filter(Boolean);

    // Build class checkboxes — pre-check ALL classes this teacher is assigned to
    const classContainer = document.getElementById('edit-ts-class-container');
    classContainer.innerHTML = '';

    classesData.forEach(cls => {
        if (!cls || !cls._id) return;
        const isChecked = allTeacherClassIds.includes(cls._id);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="edit-ts-class" value="${cls._id}" ${isChecked ? 'checked' : ''} onchange="reloadEditSubjects()"> ${formatClassName(cls)}`;
        classContainer.appendChild(label);
    });

    // ✅ Load subjects for ALL assigned classes immediately (not just currentClassId)
    reloadEditSubjects();
}

// Reload subjects when class selection changes in edit modal
function reloadEditSubjects() {
    const selectedClassIds = Array.from(document.querySelectorAll('input[name="edit-ts-class"]:checked')).map(cb => cb.value);
    const container = document.getElementById('edit-subjects-container');
    container.innerHTML = '';

    if (selectedClassIds.length === 0) {
        container.innerHTML = '<p style="color:var(--gray-500);padding:var(--space-3);">Select a class to see subjects.</p>';
        return;
    }

    const teacherId = safeGet(currentEditData, 'teacherId._id', null);

    // Collect and group subjects from all selected classes
    selectedClassIds.forEach(classId => {
        const cls = classesData.find(c => c._id === classId);
        const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);

        const header = document.createElement('div');
        header.style.cssText = 'font-weight:700;color:var(--primary-700);padding:var(--space-2) var(--space-3);background:var(--primary-50);border-radius:var(--radius-md);margin:var(--space-2) 0;font-size:var(--text-xs);text-transform:uppercase;';
        header.textContent = `📚 ${formatClassName(cls)}`;
        container.appendChild(header);

        if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
            const warn = document.createElement('div');
            warn.style.cssText = 'color:var(--warning-600);padding:var(--space-2) var(--space-3);font-size:var(--text-sm);';
            warn.textContent = '⚠️ No subjects assigned to this class yet';
            container.appendChild(warn);
            return;
        }

        // Find currently assigned subjects for this class from existing mappings
        const existingMapping = teacherSubjectMappings.find(m =>
            safeGet(m, 'teacherId._id') === teacherId &&
            safeGet(m, 'classId._id') === classId
        );
        const existingSubjectIds = existingMapping
            ? (existingMapping.subjectIds || []).map(s => s?._id).filter(Boolean)
            : [];

        classMapping.subjectIds.forEach(subject => {
            if (!subject || !subject._id) return;
            const isChecked = existingSubjectIds.includes(subject._id);
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="edit-subject" value="${subject._id}" data-class-id="${classId}" ${isChecked ? 'checked' : ''}> ${subject.subjectName || 'Unnamed'}`;
            container.appendChild(label);
        });
    });
}

async function saveEditModal() {
    if (!currentEditMode || !currentEditId) return;

    // ✅ Snapshot state BEFORE closing (closeEditModal resets these to null)
    const mode = currentEditMode;
    const id = currentEditId;
    const data = currentEditData;

    // Close modal immediately so loading is visible behind it
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('show');

    try {
        if (mode === 'level-designation') await saveLevelDesignationEdit(id, data);
        else if (mode === 'staff-class') await saveStaffClassEdit(id, data);
        else if (mode === 'class-subject') await saveClassSubjectEdit(id, data);
        else if (mode === 'teacher-subject') await saveTeacherSubjectEdit(id, data);
    } catch (error) {
        console.error('Save edit error:', error);
        showError(error.message);
    } finally {
        // Now fully reset state
        currentEditMode = null;
        currentEditId = null;
        currentEditData = null;
    }
}

async function saveLevelDesignationEdit(id, data) {
    const selectedRadio = document.querySelector('input[name="edit-level"]:checked');
    if (!selectedRadio) { showError('Please select a level'); return; }
    showLoading('Updating designation-level mapping...');
    try {
        const response = await apiPost(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING, { levelId: selectedRadio.value, designationIds: [id] }, true);
        hideLoading();
        if (response.success) { showSuccess(response.message || 'Updated successfully!'); loadAllData(); }
        else showError(response.message || 'Failed to update mapping');
    } catch (error) { hideLoading(); showError(error.message); }
}

async function saveStaffClassEdit(id, data) {
    const designationId = document.getElementById('edit-designation').value;
    const selectedClasses = Array.from(document.querySelectorAll('input[name="edit-class"]:checked')).map(cb => cb.value);
    if (!designationId) { showError('Please select a designation'); return; }
    if (selectedClasses.length === 0) { showError('Please select at least one class'); return; }
    showLoading('Updating staff assignment...');
    const response = await apiPut(API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + id, { designationId, assignedClasses: selectedClasses }, true);
    hideLoading();
    if (response.success) { showSuccess(response.message || 'Updated successfully!'); loadAllData(); }
}

async function saveClassSubjectEdit(id, data) {
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="edit-subject"]:checked')).map(cb => cb.value);
    if (selectedSubjects.length === 0) { showError('Please select at least one subject'); return; }
    showLoading('Updating class subjects...');
    const classId = safeGet(data, 'classId._id');
    if (!classId) { hideLoading(); showError('Invalid class data'); return; }
    const response = await apiPost(API_ENDPOINTS.CLASS_SUBJECT_MAPPING, { classId, subjectIds: selectedSubjects }, true);
    hideLoading();
    if (response.success) { showSuccess(response.message || 'Updated successfully!'); loadAllData(); }
}

async function saveTeacherSubjectEdit(id, data) {
    const designationId = document.getElementById('edit-ts-designation').value;
    const selectedClassIds = Array.from(document.querySelectorAll('input[name="edit-ts-class"]:checked')).map(cb => cb.value);
    const checkedSubjectInputs = Array.from(document.querySelectorAll('input[name="edit-subject"]:checked'));

    if (!designationId) { showError('Please select a designation'); return; }
    if (selectedClassIds.length === 0) { showError('Please select at least one class'); return; }
    if (checkedSubjectInputs.length === 0) { showError('Please select at least one subject'); return; }

    // ✅ Validate: every selected class that has subjects must have at least one subject checked
    const classSubjectMap = {};
    checkedSubjectInputs.forEach(input => {
        const classId = input.dataset.classId;
        if (!classSubjectMap[classId]) classSubjectMap[classId] = [];
        classSubjectMap[classId].push(input.value);
    });

    for (const classId of selectedClassIds) {
        const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);
        if (classMapping && classMapping.subjectIds && classMapping.subjectIds.length > 0) {
            if (!classSubjectMap[classId] || classSubjectMap[classId].length === 0) {
                const cls = classesData.find(c => c._id === classId);
                showError(`Please select at least one subject for "${formatClassName(cls)}"`);
                return;
            }
        }
    }

    showLoading('Updating teacher assignment...');

    try {
        const teacherId = safeGet(data, 'teacherId._id', null);

        // Step 1: Update staffClassMapping with new designation + classes
        const staffMapping = staffClassMappings.find(m => m.staffId?._id === teacherId);
        if (staffMapping && staffMapping._id) {
            await apiPut(API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + staffMapping._id, {
                designationId,
                assignedClasses: selectedClassIds
            }, true);
        }

        // Step 2: Delete ALL existing teacher-subject mappings for this teacher
        const existingMappings = teacherSubjectMappings.filter(
            m => safeGet(m, 'teacherId._id') === teacherId
        );
        if (existingMappings.length > 0) {
            await Promise.all(
                existingMappings.map(m =>
                    apiDelete(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING + '/' + m._id, true)
                )
            );
        }

        // Step 3: Recreate fresh records from what's currently checked
        const ops = Object.entries(classSubjectMap)
            .filter(([, subjectIds]) => subjectIds.length > 0)
            .map(([classId, subjectIds]) =>
                apiPost(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING, { teacherId, classId, subjectIds }, true)
            );

        await Promise.all(ops);

        hideLoading();
        showSuccess('Teacher assignment updated successfully!');
        loadAllData();

    } catch (error) { hideLoading(); showError(error.message); }
}

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    loadAllData();
    showMappingSection('level-designation');

    document.getElementById('assign-level-designation-form').addEventListener('submit', handleAssignLevelToDesignations);
    document.getElementById('assign-staff-class-form').addEventListener('submit', handleAssignStaffToClasses);
    document.getElementById('assign-class-subject-form').addEventListener('submit', handleAssignSubjectsToClass);
    document.getElementById('assign-teacher-subject-form').addEventListener('submit', handleAssignTeacherToSubjects);

    const saveBtn = document.getElementById('edit-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveEditModal);

    document.addEventListener('click', function(e) {
        const modal = document.getElementById('edit-modal');
        if (e.target === modal) closeEditModal();
    });
});

async function loadAllData() {
    try {
        showLoading('Loading mapping data...');
        const [staff, classes, subjects, designations, hierarchyData, mappings] = await Promise.all([
            apiGet(API_ENDPOINTS.STAFF, true),
            apiGet(API_ENDPOINTS.CLASSES, true),
            apiGet(API_ENDPOINTS.SUBJECTS, true),
            apiGet(API_ENDPOINTS.DESIGNATIONS, true),
            apiGet(API_ENDPOINTS.HIERARCHY, true),
            apiGet(API_ENDPOINTS.ALL_MAPPINGS, true)
        ]);

        staffData = extractDataArray(staff, 'staff');
        classesData = extractDataArray(classes, 'classes');
        subjectsData = extractDataArray(subjects, 'subjects');
        designationsData = extractDataArray(designations, 'designations');
        levelsData = extractLevelsData(hierarchyData);

        if (mappings.success && mappings.data) {
            staffClassMappings = mappings.data.staffToClass || [];
            classSubjectMappings = mappings.data.classToSubject || [];
            teacherSubjectMappings = mappings.data.teacherToSubject || [];
            levelDesignationMappings = mappings.data.levelToDesignation || [];
        }

        hideLoading();
        setupLevelDesignationSection();
        setupStaffClassSection();
        setupClassSubjectSection();
        setupTeacherSubjectSection();
        displayAllMappings();

    } catch (error) {
        console.error('❌ Load data error:', error);
        hideLoading();
        showError('Failed to load data: ' + error.message);
    }
}

function extractLevelsData(hierarchyResponse) {
    if (!hierarchyResponse) return [];
    let numLevels = 0;
    if (hierarchyResponse.data) numLevels = hierarchyResponse.data.numLevels || 0;
    if (numLevels > 0) {
        const levels = [];
        for (let i = 1; i <= numLevels; i++) {
            levels.push({ _id: `level-${i}`, levelName: `Level ${i}`, levelNumber: i });
        }
        return levels;
    }
    return [];
}

function extractDataArray(response, fallbackKey) {
    if (!response) return [];
    if (Array.isArray(response.data)) return response.data;
    if (response.data && typeof response.data === 'object') {
        if (fallbackKey && Array.isArray(response.data[fallbackKey])) return response.data[fallbackKey];
        const possibleKeys = ['staff', 'classes', 'subjects', 'designations', 'levels', 'hierarchy'];
        for (const key of possibleKeys) { if (Array.isArray(response.data[key])) return response.data[key]; }
    }
    if (Array.isArray(response)) return response;
    return [];
}



// ✅ Already-assigned popup for Section 4
function showAlreadyAssignedPopup(teacherName) {
    const existing = document.getElementById('already-assigned-popup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'already-assigned-popup';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10003;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:fadeIn 0.2s ease-out;';

    overlay.innerHTML = `
        <div style="background:var(--white);border-radius:var(--radius-2xl);box-shadow:0 25px 80px rgba(0,0,0,0.4);max-width:460px;width:90%;padding:var(--space-10);text-align:center;animation:slideUp 0.3s ease-out;">
            <div style="font-size:56px;margin-bottom:var(--space-4);">⚠️</div>
            <h3 style="font-size:var(--text-xl);font-weight:800;color:var(--gray-900);margin-bottom:var(--space-3);">Already Assigned!</h3>
            <p style="color:var(--gray-600);font-size:var(--text-base);margin-bottom:var(--space-6);line-height:1.6;">
                <strong>${teacherName}</strong> already has an assignment.<br>
                Please use the <strong>Edit</strong> button in the table below to update their details.
            </p>
            <div style="display:flex;gap:var(--space-3);justify-content:center;">
                <button onclick="document.getElementById('already-assigned-popup').remove()" 
                    style="padding:var(--space-3) var(--space-8);background:var(--gray-200);color:var(--gray-700);border:none;border-radius:var(--radius-xl);font-weight:600;cursor:pointer;font-size:var(--text-base);">
                    Close
                </button>
                <button onclick="document.getElementById('already-assigned-popup').remove();document.querySelector('#teacher-subject-table tbody').scrollIntoView({behavior:'smooth',block:'center'});"
                    style="padding:var(--space-3) var(--space-8);background:var(--gradient-primary);color:var(--white);border:none;border-radius:var(--radius-xl);font-weight:600;cursor:pointer;font-size:var(--text-base);">
                    Go to Table ↓
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showMappingSection(sectionName) {
    document.querySelectorAll('.mapping-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('#section-tabs button').forEach(t => t.style.fontWeight = 'normal');
    document.getElementById('section-' + sectionName).style.display = 'block';
    document.getElementById('tab-' + sectionName).style.fontWeight = 'bold';
}

// ===================================
// 0. LEVEL-DESIGNATION MAPPING
// ===================================

function setupLevelDesignationSection() {
    const designationSelect = document.getElementById('ld-designation');
    if (!designationSelect) return;

    if (designationsData.length === 0) {
        designationSelect.innerHTML = '<option value="">-- No Designations Created Yet --</option>';
        return;
    }

    const assignedDesignationIds = [];
    levelDesignationMappings.forEach(mapping => {
        if (mapping.designationIds) {
            mapping.designationIds.forEach(des => { if (des && des._id) assignedDesignationIds.push(des._id); });
        }
    });

    const unassignedDesignations = designationsData.filter(des => !assignedDesignationIds.includes(des._id));
    if (unassignedDesignations.length === 0) {
        designationSelect.innerHTML = '<option value="">-- All Designations Already Assigned --</option>';
    } else {
        populateDropdown(designationSelect, unassignedDesignations, '_id', 'name');
    }

    const levelsContainer = document.getElementById('ld-levels-checkboxes');
    if (!levelsContainer) return;
    levelsContainer.innerHTML = '';

    if (levelsData.length === 0) {
        levelsContainer.innerHTML = '<p style="color:var(--gray-500);padding:var(--space-4);">No hierarchy levels found. Please set up hierarchy in Part 1 first.</p>';
        return;
    }

    levelsData.forEach(level => {
        if (!level || !level._id) return;
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="ld-level" value="${level._id}"> ${level.levelName || 'Unnamed Level'}`;
        levelsContainer.appendChild(label);
    });
}

async function handleAssignLevelToDesignations(e) {
    e.preventDefault();
    const designationId = document.getElementById('ld-designation').value;
    const selectedRadio = document.querySelector('input[name="ld-level"]:checked');
    if (!designationId) { showError('Please select a designation'); return; }
    if (!selectedRadio) { showError('Please select a level'); return; }
    try {
        showLoading('Assigning level to designation...');
        const response = await apiPost(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING, { levelId: selectedRadio.value, designationIds: [designationId] }, true);
        hideLoading();
        if (response.success) {
            showSuccess(response.message || 'Level assigned successfully!');
            document.getElementById('assign-level-designation-form').reset();
            loadAllData();
        } else { showError(response.message || 'Failed to assign level'); }
    } catch (error) { hideLoading(); showError(error.message || 'Failed to assign level'); }
}

function displayLevelDesignationMappings() {
    const tbody = document.querySelector('#level-designation-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (levelDesignationMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No designation-level mappings yet.</td></tr>';
        return;
    }
    const designationMap = new Map();
    levelDesignationMappings.forEach(mapping => {
        if (!mapping || !mapping.designationIds) return;
        const levelName = safeGet(mapping, 'levelId.levelName', '-');
        mapping.designationIds.forEach(designation => {
            if (!designation || !designation._id) return;
            designationMap.set(designation._id, { name: designation.name || 'Unnamed', level: levelName, mappingId: mapping._id });
        });
    });
    designationMap.forEach((data, desId) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${data.name}</td>
            <td>${data.level}</td>
            <td>
                <button onclick="editDesignationLevels('${desId}')">Edit</button>
                <button onclick="deleteDesignationLevels('${desId}')">Delete</button>
            </td>`;
    });
}

async function editDesignationLevels(designationId) {
    const relatedMappings = levelDesignationMappings.filter(m => m.designationIds && m.designationIds.some(d => d._id === designationId));
    if (relatedMappings.length === 0) { showError('No mappings found for this designation'); return; }
    const designation = designationsData.find(d => d._id === designationId);
    const assignedLevels = relatedMappings.map(m => m.levelId).filter(Boolean);
    openEditModal('level-designation', designationId, { designationId: designation, levelIds: assignedLevels, _id: designationId });
}

async function deleteDesignationLevels(designationId) {
    if (!confirm('Are you sure you want to delete this designation-level assignment?')) return;
    try {
        showLoading('Deleting...');
        const mapping = levelDesignationMappings.find(m => m.designationIds && m.designationIds.some(d => d._id === designationId));
        if (!mapping) { hideLoading(); showError('Mapping not found'); return; }
        const remainingDesignations = mapping.designationIds.filter(d => d._id.toString() !== designationId.toString());
        let response;
        if (remainingDesignations.length === 0) {
            response = await apiDelete(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING + '/' + mapping._id, true);
        } else {
            response = await apiPost(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING, { levelId: mapping.levelId._id, designationIds: remainingDesignations.map(d => d._id) }, true);
        }
        hideLoading();
        if (response.success) { showSuccess('Deleted successfully!'); loadAllData(); }
        else showError(response.message || 'Failed to delete');
    } catch (error) { hideLoading(); showError(error.message); }
}

// ===================================
// 1. STAFF-CLASS MAPPING
// ===================================

function setupStaffClassSection() {
    const staffSelect = document.getElementById('sc-staff-name');
    populateDropdown(staffSelect, staffData, '_id', 'name');

    const desSelect = document.getElementById('sc-designation');
    populateDropdown(desSelect, designationsData, '_id', 'name');

    const classesContainer = document.getElementById('sc-classes-checkboxes');
    classesContainer.innerHTML = '';

    classesData.forEach(cls => {
        if (!cls || !cls._id) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'sc-class-item';

        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="sc-class" value="${cls._id}" onchange="updateClassSubjectsPreview()">
            ${formatClassName(cls)}
        `;
        wrapper.appendChild(label);
        classesContainer.appendChild(wrapper);
    });

    // Create subjects preview container below the checkbox list
    const existingPreview = document.getElementById('sc-subjects-preview');
    if (!existingPreview) {
        const form = document.getElementById('assign-staff-class-form');
        const submitBtn = form.querySelector('button[type="submit"]');

        const previewDiv = document.createElement('div');
        previewDiv.id = 'sc-subjects-preview';
        previewDiv.style.display = 'none';
        previewDiv.innerHTML = `
            <div class="info-box" style="margin-top:var(--space-4);">
                <strong>📚 Subjects that will be auto-assigned:</strong>
                <p style="margin-top:var(--space-2);font-style:italic;color:var(--gray-600);">Selecting a class will automatically assign all its subjects to this staff member.</p>
                <div id="sc-subjects-list" style="margin-top:var(--space-3);"></div>
            </div>
        `;
        form.insertBefore(previewDiv, submitBtn);
    }
}

// ✅ NEW: Show subject preview when classes are selected in Section 2
function updateClassSubjectsPreview() {
    const selectedClassIds = Array.from(document.querySelectorAll('input[name="sc-class"]:checked')).map(cb => cb.value);
    const previewDiv = document.getElementById('sc-subjects-preview');
    const subjectsList = document.getElementById('sc-subjects-list');

    if (selectedClassIds.length === 0) {
        previewDiv.style.display = 'none';
        return;
    }

    previewDiv.style.display = 'block';
    subjectsList.innerHTML = '';

    selectedClassIds.forEach(classId => {
        const cls = classesData.find(c => c._id === classId);
        const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);

        const classSection = document.createElement('div');
        classSection.style.cssText = 'margin-bottom:var(--space-3);';

        if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
            classSection.innerHTML = `
                <strong style="color:var(--gray-700);">📚 ${formatClassName(cls)}:</strong>
                <span style="color:var(--warning-600);margin-left:var(--space-2);">⚠️ No subjects assigned to this class yet</span>
            `;
        } else {
            const subjectNames = classMapping.subjectIds.map(s => s?.subjectName || 'Unnamed').join(', ');
            classSection.innerHTML = `
                <strong style="color:var(--gray-700);">📚 ${formatClassName(cls)}:</strong>
                <span style="color:var(--primary-700);margin-left:var(--space-2);">${subjectNames}</span>
            `;
        }
        subjectsList.appendChild(classSection);
    });
}

function toggleAllClasses(checkbox) {
    document.querySelectorAll('input[name="sc-class"]').forEach(cb => cb.checked = checkbox.checked);
    updateClassSubjectsPreview();
}

// ✅ UPDATED: After assigning staff to class, also auto-assign all subjects for each class
async function handleAssignStaffToClasses(e) {
    e.preventDefault();

    const staffId = document.getElementById('sc-staff-name').value;
    const designationId = document.getElementById('sc-designation').value;
    const selectedClasses = Array.from(document.querySelectorAll('input[name="sc-class"]:checked')).map(cb => cb.value);

    if (!staffId) { showError('Please select a staff member'); return; }
    if (!designationId) { showError('Please select a designation'); return; }
    if (selectedClasses.length === 0) { showError('Please select at least one class'); return; }

    // ✅ Check if this staff is already assigned
    const alreadyAssigned = staffClassMappings.some(m => safeGet(m, 'staffId._id') === staffId);
    if (alreadyAssigned) {
        const staffName = staffData.find(s => s._id === staffId)?.name || 'This staff member';
        showAlreadyAssignedPopup(staffName);
        return;
    }

    try {
        showLoading('Assigning staff to classes...');

        // Step 1: Assign staff to classes
        const response = await apiPost(API_ENDPOINTS.STAFF_CLASS_MAPPING, {
            staffId, designationId, assignedClasses: selectedClasses
        }, true);

        if (!response.success) {
            hideLoading();
            showError(response.message || 'Failed to assign staff to classes');
            return;
        }

        // Step 2: Auto-assign all subjects for each selected class
        const classesWithSubjects = selectedClasses.filter(classId => {
            const mapping = classSubjectMappings.find(m => m.classId?._id === classId);
            return mapping && mapping.subjectIds && mapping.subjectIds.length > 0;
        });

        if (classesWithSubjects.length > 0) {
            showLoading('Auto-assigning subjects...');

            const subjectAssignments = classesWithSubjects.map(classId => {
                const mapping = classSubjectMappings.find(m => m.classId?._id === classId);
                const subjectIds = mapping.subjectIds.map(s => s?._id || s).filter(Boolean);
                return apiPost(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING, {
                    teacherId: staffId,
                    classId: classId,
                    subjectIds: subjectIds
                }, true).catch(err => {
                    console.warn(`⚠️ Could not assign subjects for class ${classId}:`, err.message);
                    return null;
                });
            });

            await Promise.all(subjectAssignments);
        }

        hideLoading();
        showSuccess(response.message || 'Staff assigned to classes (and subjects auto-assigned) successfully!');
        document.getElementById('assign-staff-class-form').reset();
        document.getElementById('sc-all-classes').checked = false;
        document.getElementById('sc-subjects-preview').style.display = 'none';
        loadAllData();

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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No staff assignments yet.</td></tr>';
        return;
    }
    staffClassMappings.forEach(mapping => {
        if (!mapping) return;
        const row = tbody.insertRow();
        const staffName = safeGet(mapping, 'staffId.name', '-');
        const designationName = safeGet(mapping, 'designationId.name', '-');
        const classes = (mapping.assignedClasses || []).map(c => formatClassName(c)).join(', ') || 'None';
        row.innerHTML = `
            <td>${staffName}</td>
            <td>${designationName}</td>
            <td>${classes}</td>
            <td>${mapping._id ? `<button onclick="editStaffClassMapping('${mapping._id}')">Edit</button> <button onclick="deleteStaffClassMapping('${mapping._id}')">Delete</button>` : ''}</td>`;
    });
}

async function editStaffClassMapping(id) {
    const mapping = staffClassMappings.find(m => m._id === id);
    if (mapping) openEditModal('staff-class', id, mapping);
}

async function deleteStaffClassMapping(id) {
    if (!confirm('Remove this staff assignment? This will also remove their subject assignments.')) return;
    try {
        showLoading('Removing...');

        // Find the staffId from the mapping before deleting
        const mapping = staffClassMappings.find(m => m._id === id);
        const staffId = safeGet(mapping, 'staffId._id', null);

        // Step 1: Delete all teacher-subject mappings for this staff member
        if (staffId) {
            const teacherMappings = teacherSubjectMappings.filter(
                m => safeGet(m, 'teacherId._id') === staffId
            );
            await Promise.all(
                teacherMappings.map(m =>
                    apiDelete(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING + '/' + m._id, true)
                )
            );
        }

        // Step 2: Delete the staff-class mapping itself
        const response = await apiDelete(API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + id, true);

        hideLoading();

        if (response.success) {
            showSuccess('Staff assignment and all related subject assignments removed!');
            loadAllData();
        }
    } catch (error) { hideLoading(); showError(error.message); }
}

// ===================================
// 2. CLASS-SUBJECT MAPPING
// ===================================

function setupClassSubjectSection() {
    const classSelect = document.getElementById('cs-class');
    populateDropdown(classSelect, classesData, '_id', formatClassName);

    const subjectsContainer = document.getElementById('cs-subjects-checkboxes');
    subjectsContainer.innerHTML = '';
    subjectsData.forEach(subject => {
        if (!subject || !subject._id) return;
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="cs-subject" value="${subject._id}"> ${subject.subjectName || 'Unnamed'}`;
        subjectsContainer.appendChild(label);
        subjectsContainer.appendChild(document.createElement('br'));
    });
}

function toggleAllSubjects(checkbox) {
    document.querySelectorAll('input[name="cs-subject"]').forEach(cb => cb.checked = checkbox.checked);
}

async function handleAssignSubjectsToClass(e) {
    e.preventDefault();
    const classId = document.getElementById('cs-class').value;
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="cs-subject"]:checked')).map(cb => cb.value);
    if (!classId) { showError('Please select a class'); return; }
    if (selectedSubjects.length === 0) { showError('Please select at least one subject'); return; }
    try {
        showLoading('Assigning subjects to class...');
        const response = await apiPost(API_ENDPOINTS.CLASS_SUBJECT_MAPPING, { classId, subjectIds: selectedSubjects }, true);
        hideLoading();
        if (response.success) {
            showSuccess(response.message || 'Subjects assigned successfully!');
            document.getElementById('assign-class-subject-form').reset();
            document.getElementById('cs-all-subjects').checked = false;
            loadAllData();
        }
    } catch (error) { hideLoading(); showError(error.message); }
}

function displayClassSubjectMappings() {
    const tbody = document.querySelector('#class-subject-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (classSubjectMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No subject assignments yet.</td></tr>';
        return;
    }
    classSubjectMappings.forEach(mapping => {
        if (!mapping) return;
        const row = tbody.insertRow();
        const className = formatClassName(mapping.classId);
        const subjects = (mapping.subjectIds || []).map(s => s?.subjectName || 'Unnamed').join(', ') || 'None';
        const classId = safeGet(mapping, 'classId._id');
        row.innerHTML = `
            <td>${className}</td>
            <td>${subjects}</td>
            <td>${classId ? `<button onclick="editClassSubjectMapping('${classId}')">Edit</button>` : ''}</td>`;
    });
}

async function editClassSubjectMapping(classId) {
    const mapping = classSubjectMappings.find(m => m.classId?._id === classId);
    if (mapping) openEditModal('class-subject', mapping._id, mapping);
}

// ===================================
// 3. TEACHER-SUBJECT MAPPING (MULTI-CLASS)
// ===================================

function setupTeacherSubjectSection() {
    const teacherSelect = document.getElementById('ts-teacher');
    populateDropdown(teacherSelect, staffData, '_id', 'name');

    const designationSelect = document.getElementById('ts-designation');
    populateDropdown(designationSelect, designationsData, '_id', 'name');

    const classContainer = document.getElementById('ts-class-checkboxes');
    if (!classContainer) return;
    classContainer.innerHTML = '';

    classesData.forEach(cls => {
        if (!cls || !cls._id) return;
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="ts-class" value="${cls._id}" onchange="handleTeacherClassSelection()">
            ${formatClassName(cls)}
        `;
        classContainer.appendChild(label);
    });
}

function handleTeacherClassSelection() {
    const selectedClassIds = Array.from(document.querySelectorAll('input[name="ts-class"]:checked')).map(cb => cb.value);
    const subjectsContainer = document.getElementById('ts-subjects-container');
    const subjectsCheckboxes = document.getElementById('ts-subjects-checkboxes');

    if (selectedClassIds.length === 0) {
        subjectsContainer.classList.remove('show');
        return;
    }

    subjectsCheckboxes.innerHTML = '';
    let hasAnySubjects = false;

    selectedClassIds.forEach(classId => {
        const cls = classesData.find(c => c._id === classId);
        const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);

        if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
            const warning = document.createElement('div');
            warning.style.cssText = 'padding:var(--space-3);color:var(--warning-700);font-size:var(--text-sm);border-bottom:1px solid var(--gray-200);margin-bottom:var(--space-2);';
            warning.textContent = `⚠️ ${formatClassName(cls)}: No subjects assigned yet (assign subjects in Section 3 first)`;
            subjectsCheckboxes.appendChild(warning);
            return;
        }

        hasAnySubjects = true;

        const header = document.createElement('div');
        header.style.cssText = 'font-weight:700;color:var(--primary-700);padding:var(--space-2) var(--space-3);background:var(--primary-50);border-radius:var(--radius-md);margin:var(--space-3) 0 var(--space-2);font-size:var(--text-sm);text-transform:uppercase;letter-spacing:var(--tracking-wide);';
        header.textContent = `📚 ${formatClassName(cls)}`;
        subjectsCheckboxes.appendChild(header);

        classMapping.subjectIds.forEach(subject => {
            if (!subject || !subject._id) return;
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" name="ts-subject" value="${subject._id}" data-class-id="${classId}">
                ${subject.subjectName || 'Unnamed'}
            `;
            subjectsCheckboxes.appendChild(label);
        });
    });

    if (hasAnySubjects) {
        subjectsContainer.classList.add('show');
    } else {
        subjectsContainer.classList.remove('show');
    }
}

function toggleAllTeacherClasses(checkbox) {
    document.querySelectorAll('input[name="ts-class"]').forEach(cb => cb.checked = checkbox.checked);
    handleTeacherClassSelection();
}

function toggleAllTeacherSubjects(checkbox) {
    document.querySelectorAll('input[name="ts-subject"]').forEach(cb => cb.checked = checkbox.checked);
}

async function handleAssignTeacherToSubjects(e) {
    e.preventDefault();

    const teacherId = document.getElementById('ts-teacher').value;
    const designationId = document.getElementById('ts-designation').value;
    const selectedClassIds = Array.from(document.querySelectorAll('input[name="ts-class"]:checked')).map(cb => cb.value);
    const checkedSubjectInputs = Array.from(document.querySelectorAll('input[name="ts-subject"]:checked'));

    if (!teacherId) { showError('Please select a teacher'); return; }
    if (!designationId) { showError('Please select a designation'); return; }
    if (selectedClassIds.length === 0) { showError('Please select at least one class'); return; }
    if (checkedSubjectInputs.length === 0) { showError('Please select at least one subject'); return; }

    // ✅ If already assigned from Section 3 or Section 4 — show edit reminder
    const assignedFromSection3 = staffClassMappings.some(m => safeGet(m, 'staffId._id') === teacherId);
    if (assignedFromSection3) {
        const teacherName = staffData.find(s => s._id === teacherId)?.name || 'This teacher';
        showAlreadyAssignedPopup(teacherName);
        return;
    }

    // ✅ If already assigned from Section 4 — block with edit reminder
    const alreadyAssigned = teacherSubjectMappings.some(m => safeGet(m, 'teacherId._id') === teacherId);
    if (alreadyAssigned) {
        const teacherName = staffData.find(s => s._id === teacherId)?.name || 'This teacher';
        showAlreadyAssignedPopup(teacherName);
        return;
    }

    try {
        showLoading('Assigning classes and subjects...');

        await apiPost(API_ENDPOINTS.STAFF_CLASS_MAPPING, {
            staffId: teacherId,
            designationId: designationId,
            assignedClasses: selectedClassIds
        }, true);

        const classSubjectMap = {};
        checkedSubjectInputs.forEach(input => {
            const classId = input.dataset.classId;
            if (!classSubjectMap[classId]) classSubjectMap[classId] = [];
            classSubjectMap[classId].push(input.value);
        });

        const assignments = Object.entries(classSubjectMap).map(([classId, subjectIds]) =>
            apiPost(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING, { teacherId, classId, subjectIds }, true)
        );

        const results = await Promise.all(assignments);
        hideLoading();

        const allSuccess = results.every(r => r && r.success);
        const anySuccess = results.some(r => r && r.success);

        if (allSuccess) {
            showSuccess('Teacher designation, classes and subjects assigned successfully!');
        } else if (anySuccess) {
            showSuccess('Teacher assigned to some classes. Check console for any errors.');
        } else {
            const firstError = results.find(r => r && !r.success);
            showError((firstError && firstError.message) || 'Failed to assign teacher to subjects');
            return;
        }

        document.getElementById('assign-teacher-subject-form').reset();
        document.getElementById('ts-subjects-container').classList.remove('show');
        document.querySelectorAll('input[name="ts-class"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[name="ts-subject"]').forEach(cb => cb.checked = false);
        const selectAllTs = document.getElementById('ts-all-subjects');
        if (selectAllTs) selectAllTs.checked = false;
        const selectAllClasses = document.getElementById('ts-all-classes');
        if (selectAllClasses) selectAllClasses.checked = false;

        loadAllData();

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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No teacher assignments yet.</td></tr>';
        return;
    }

    // Group all records by teacherId — one row per teacher
    const grouped = new Map();

    teacherSubjectMappings.forEach(mapping => {
        if (!mapping) return;
        const teacherId = safeGet(mapping, 'teacherId._id', null);
        if (!teacherId) return;

        if (!grouped.has(teacherId)) {
            const staffMapping = staffClassMappings.find(m => m.staffId?._id === teacherId);
            grouped.set(teacherId, {
                teacherId: teacherId,
                teacherName: safeGet(mapping, 'teacherId.name', '-'),
                designationName: safeGet(staffMapping, 'designationId.name', '-'),
                classes: [],
                subjects: [],
                firstMappingId: mapping._id
            });
        }

        const entry = grouped.get(teacherId);
        entry.classes.push(formatClassName(mapping.classId));
        (mapping.subjectIds || []).forEach(s => {
            const name = s?.subjectName || 'Unnamed';
            if (!entry.subjects.includes(name)) entry.subjects.push(name);
        });
    });

    grouped.forEach(data => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${data.teacherName}</td>
            <td>${data.designationName}</td>
            <td>${data.classes.join(', ')}</td>
            <td>${data.subjects.join(', ')}</td>
            <td>
                <button onclick="editTeacherSubjectMapping('${data.firstMappingId}')">Edit</button>
                <button onclick="deleteAllTeacherMappings('${data.teacherId}')">Delete</button>
            </td>`;
    });
}

async function editTeacherSubjectMapping(id) {
    const mapping = teacherSubjectMappings.find(m => m._id === id);
    if (mapping) openEditModal('teacher-subject', id, mapping);
}

// ✅ FIX 2 & 3: Delete ALL teacher-subject records at once + ALWAYS delete staff-class mapping
async function deleteAllTeacherMappings(teacherId) {
    if (!confirm('Remove this teacher assignment? All their class and subject assignments will be deleted.')) return;
    try {
        showLoading('Removing...');

        // Step 1: Delete ALL teacher-subject mappings for this teacher at once
        const allTeacherMappings = teacherSubjectMappings.filter(
            m => safeGet(m, 'teacherId._id') === teacherId
        );

        if (allTeacherMappings.length > 0) {
            await Promise.all(
                allTeacherMappings.map(m =>
                    apiDelete(API_ENDPOINTS.TEACHER_SUBJECT_MAPPING + '/' + m._id, true)
                )
            );
        }

        // Step 2: ALWAYS delete the staff-class mapping so Section 3 is also cleared
        const staffMapping = staffClassMappings.find(m => safeGet(m, 'staffId._id') === teacherId);
        if (staffMapping && staffMapping._id) {
            await apiDelete(API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + staffMapping._id, true);
        }

        hideLoading();
        showSuccess('Teacher assignment removed successfully from all sections!');
        loadAllData();

    } catch (error) { hideLoading(); showError(error.message); }
}

// ===================================
// DISPLAY ALL MAPPINGS
// ===================================

function displayAllMappings() {
    displayLevelDesignationMappings();
    displayStaffClassMappings();
    displayClassSubjectMappings();
    displayTeacherSubjectMappings();
}

console.log('✅ mapping.js loaded - FIXED: Edit shows all classes/subjects, Delete clears all at once');