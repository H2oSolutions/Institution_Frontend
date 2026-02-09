// mapping.js - FIXED VERSION WITH BETTER ERROR HANDLING

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
        if (current === null || current === undefined) {
            return defaultValue;
        }
        current = current[key];
    }
    
    return current !== null && current !== undefined ? current : defaultValue;
}

// ===================================
// MESSAGE FUNCTIONS
// ===================================

function showLoading(message = 'Loading...') {
    console.log('🔄 showLoading called:', message);
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    
    if (errorEl) {
        errorEl.classList.remove('show');
        errorEl.style.display = 'none';
    }
    if (successEl) {
        successEl.classList.remove('show');
        successEl.style.display = 'none';
    }
    
    if (overlay) {
        overlay.classList.add('show');
    }
    
    if (loadingEl) {
        loadingEl.textContent = message;
        loadingEl.style.display = 'block';
        loadingEl.classList.add('show');
    }
}

function hideLoading() {
    const loadingEl = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
    }
    
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    const anyMessageShowing = (errorEl && errorEl.classList.contains('show')) || 
                              (successEl && successEl.classList.contains('show'));
    
    if (overlay && !anyMessageShowing) {
        overlay.classList.remove('show');
    }
}

function showSuccess(message) {
    const successEl = document.getElementById('success-message');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const overlay = document.getElementById('message-overlay');
    
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
    }
    if (errorEl) {
        errorEl.classList.remove('show');
        errorEl.style.display = 'none';
    }
    
    if (overlay) {
        overlay.classList.add('show');
    }
    
    if (successEl) {
        successEl.textContent = message;
        successEl.style.display = 'block';
        successEl.classList.add('show');
        
        setTimeout(() => {
            successEl.classList.remove('show');
            successEl.style.display = 'none';
            if (overlay) {
                overlay.classList.remove('show');
            }
        }, 5000);
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');
    const successEl = document.getElementById('success-message');
    const overlay = document.getElementById('message-overlay');
    
    if (loadingEl) {
        loadingEl.classList.remove('show');
        loadingEl.style.display = 'none';
    }
    if (successEl) {
        successEl.classList.remove('show');
        successEl.style.display = 'none';
    }
    
    if (overlay) {
        overlay.classList.add('show');
    }
    
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        errorEl.classList.add('show');
        
        setTimeout(() => {
            errorEl.classList.remove('show');
            errorEl.style.display = 'none';
            if (overlay) {
                overlay.classList.remove('show');
            }
        }, 7000);
    }
}

function populateDropdown(selectElement, data, valueKey, textKey) {
    if (!selectElement || !Array.isArray(data)) {
        console.warn('populateDropdown skipped, invalid data:', data);
        return;
    }

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
    
    if (mode === 'level-designation') {
        modalBody.innerHTML = generateLevelDesignationEditForm(data);
        setupLevelDesignationEditForm(data);
    } else if (mode === 'staff-class') {
        modalBody.innerHTML = generateStaffClassEditForm(data);
        setupStaffClassEditForm(data);
    } else if (mode === 'class-subject') {
        modalBody.innerHTML = generateClassSubjectEditForm(data);
        setupClassSubjectEditForm(data);
    } else if (mode === 'teacher-subject') {
        modalBody.innerHTML = generateTeacherSubjectEditForm(data);
        setupTeacherSubjectEditForm(data);
    }
    
    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('show');
    currentEditMode = null;
    currentEditId = null;
    currentEditData = null;
}

// ===================================
// LEVEL-DESIGNATION EDIT MODAL
// ===================================

function generateLevelDesignationEditForm(data) {
    const levelName = safeGet(data, 'levelId.levelName', '-');
    
    return `
        <div class="edit-form-group">
            <label>Level</label>
            <input type="text" value="${levelName}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label>Assigned Designations *</label>
            <div class="edit-checkbox-container" id="edit-designations-container">
                <!-- Designations will be inserted here -->
            </div>
        </div>
    `;
}

function setupLevelDesignationEditForm(data) {
    const container = document.getElementById('edit-designations-container');
    const assignedDesignationIds = (data.designationIds || []).map(d => d?._id).filter(Boolean);
    
    container.innerHTML = '';
    designationsData.forEach(designation => {
        if (!designation || !designation._id) return;
        
        const isChecked = assignedDesignationIds.includes(designation._id);
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="edit-designation" value="${designation._id}" ${isChecked ? 'checked' : ''}>
            ${designation.name || 'Unnamed'}
        `;
        container.appendChild(label);
    });
}

function generateStaffClassEditForm(data) {
    const staffName = safeGet(data, 'staffId.name', '-');
    
    return `
        <div class="edit-form-group">
            <label>Staff Name</label>
            <input type="text" value="${staffName}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label for="edit-designation">Designation *</label>
            <select id="edit-designation" required>
                <option value="">-- Select Designation --</option>
            </select>
        </div>
        
        <div class="edit-form-group">
            <label>Assigned Classes *</label>
            <div class="edit-checkbox-container" id="edit-classes-container">
                <!-- Classes will be inserted here -->
            </div>
        </div>
    `;
}

function setupStaffClassEditForm(data) {
    const desSelect = document.getElementById('edit-designation');
    populateDropdown(desSelect, designationsData, '_id', 'name');
    
    const designationId = safeGet(data, 'designationId._id', '');
    desSelect.value = designationId;
    
    const container = document.getElementById('edit-classes-container');
    const assignedClassIds = (data.assignedClasses || []).map(c => c?._id).filter(Boolean);
    
    container.innerHTML = '';
    classesData.forEach(cls => {
        if (!cls || !cls._id) return;
        
        const isChecked = assignedClassIds.includes(cls._id);
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="edit-class" value="${cls._id}" ${isChecked ? 'checked' : ''}>
            ${formatClassName(cls)}
        `;
        container.appendChild(label);
    });
}

function generateClassSubjectEditForm(data) {
    const className = formatClassName(data.classId);
    
    return `
        <div class="edit-form-group">
            <label>Class</label>
            <input type="text" value="${className}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label>Assigned Subjects *</label>
            <div class="edit-checkbox-container" id="edit-subjects-container">
                <!-- Subjects will be inserted here -->
            </div>
        </div>
    `;
}

function setupClassSubjectEditForm(data) {
    const container = document.getElementById('edit-subjects-container');
    const assignedSubjectIds = (data.subjectIds || []).map(s => s?._id).filter(Boolean);
    
    container.innerHTML = '';
    subjectsData.forEach(subject => {
        if (!subject || !subject._id) return;
        
        const isChecked = assignedSubjectIds.includes(subject._id);
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="edit-subject" value="${subject._id}" ${isChecked ? 'checked' : ''}>
            ${subject.subjectName || 'Unnamed'}
        `;
        container.appendChild(label);
    });
}

function generateTeacherSubjectEditForm(data) {
    const teacherName = safeGet(data, 'teacherId.name', '-');
    const className = formatClassName(data.classId);
    
    return `
        <div class="edit-form-group">
            <label>Teacher Name</label>
            <input type="text" value="${teacherName}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label>Class</label>
            <input type="text" value="${className}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label>Assigned Subjects *</label>
            <div class="edit-checkbox-container" id="edit-subjects-container">
                <!-- Subjects will be inserted here -->
            </div>
        </div>
    `;
}

function setupTeacherSubjectEditForm(data) {
    const classId = safeGet(data, 'classId._id');
    if (!classId) {
        showError('Invalid class data');
        return;
    }
    
    const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);
    
    if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
        showError('No subjects found for this class');
        return;
    }
    
    const container = document.getElementById('edit-subjects-container');
    const assignedSubjectIds = (data.subjectIds || []).map(s => s?._id).filter(Boolean);
    
    container.innerHTML = '';
    classMapping.subjectIds.forEach(subject => {
        if (!subject || !subject._id) return;
        
        const isChecked = assignedSubjectIds.includes(subject._id);
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="edit-subject" value="${subject._id}" ${isChecked ? 'checked' : ''}>
            ${subject.subjectName || 'Unnamed'}
        `;
        container.appendChild(label);
    });
}

async function saveEditModal() {
    if (!currentEditMode || !currentEditId) return;
    
    try {
        if (currentEditMode === 'level-designation') {
            await saveLevelDesignationEdit();
        } else if (currentEditMode === 'staff-class') {
            await saveStaffClassEdit();
        } else if (currentEditMode === 'class-subject') {
            await saveClassSubjectEdit();
        } else if (currentEditMode === 'teacher-subject') {
            await saveTeacherSubjectEdit();
        }
    } catch (error) {
        console.error('Save edit error:', error);
        showError(error.message);
    }
}

async function saveLevelDesignationEdit() {
    const selectedDesignations = Array.from(document.querySelectorAll('input[name="edit-designation"]:checked'))
        .map(cb => cb.value);
    
    if (selectedDesignations.length === 0) {
        showError('Please select at least one designation');
        return;
    }
    
    showLoading('Updating level-designation mapping...');
    
    const levelId = safeGet(currentEditData, 'levelId._id');
    if (!levelId) {
        hideLoading();
        showError('Invalid level data');
        return;
    }
    
    const response = await apiPost(
        API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING,
        {
            levelId: levelId,
            designationIds: selectedDesignations
        },
        true
    );
    
    hideLoading();
    
    if (response.success) {
        showSuccess(response.message || 'Level-designation mapping updated successfully!');
        closeEditModal();
        loadAllData();
    }
}

async function saveStaffClassEdit() {
    const designationId = document.getElementById('edit-designation').value;
    const selectedClasses = Array.from(document.querySelectorAll('input[name="edit-class"]:checked'))
        .map(cb => cb.value);
    
    if (!designationId) {
        showError('Please select a designation');
        return;
    }
    
    if (selectedClasses.length === 0) {
        showError('Please select at least one class');
        return;
    }
    
    showLoading('Updating staff assignment...');
    
    const response = await apiPut(
        API_ENDPOINTS.STAFF_CLASS_MAPPING + '/' + currentEditId,
        {
            designationId: designationId,
            assignedClasses: selectedClasses
        },
        true
    );
    
    hideLoading();
    
    if (response.success) {
        showSuccess(response.message || 'Staff assignment updated successfully!');
        closeEditModal();
        loadAllData();
    }
}

async function saveClassSubjectEdit() {
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="edit-subject"]:checked'))
        .map(cb => cb.value);
    
    if (selectedSubjects.length === 0) {
        showError('Please select at least one subject');
        return;
    }
    
    showLoading('Updating class subjects...');
    
    const classId = safeGet(currentEditData, 'classId._id');
    if (!classId) {
        hideLoading();
        showError('Invalid class data');
        return;
    }
    
    const response = await apiPost(
        API_ENDPOINTS.CLASS_SUBJECT_MAPPING,
        {
            classId: classId,
            subjectIds: selectedSubjects
        },
        true
    );
    
    hideLoading();
    
    if (response.success) {
        showSuccess(response.message || 'Class subjects updated successfully!');
        closeEditModal();
        loadAllData();
    }
}

async function saveTeacherSubjectEdit() {
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="edit-subject"]:checked'))
        .map(cb => cb.value);
    
    if (selectedSubjects.length === 0) {
        showError('Please select at least one subject');
        return;
    }
    
    showLoading('Updating teacher assignment...');
    
    const response = await apiPut(
        API_ENDPOINTS.TEACHER_SUBJECT_MAPPING + '/' + currentEditId,
        {
            subjectIds: selectedSubjects
        },
        true
    );
    
    hideLoading();
    
    if (response.success) {
        showSuccess(response.message || 'Teacher assignment updated successfully!');
        closeEditModal();
        loadAllData();
    }
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
    document.getElementById('ts-class').addEventListener('change', handleTeacherClassSelection);
    
    const saveBtn = document.getElementById('edit-modal-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveEditModal);
    }
    
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('edit-modal');
        if (e.target === modal) {
            closeEditModal();
        }
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
        
        // FIXED: Properly extract data arrays
        staffData = extractDataArray(staff, 'staff');
        classesData = extractDataArray(classes, 'classes');
        subjectsData = extractDataArray(subjects, 'subjects');
        designationsData = extractDataArray(designations, 'designations');
        
        // FIXED: Special handling for hierarchy/levels data
        levelsData = extractLevelsData(hierarchyData);
        
        console.log('📊 Loaded data:', {
            staff: staffData.length,
            classes: classesData.length,
            subjects: subjectsData.length,
            designations: designationsData.length,
            levels: levelsData.length
        });
        
        console.log('🔍 Levels data structure:', levelsData);
        
        if (mappings.success && mappings.data) {
            staffClassMappings = mappings.data.staffToClass || [];
            classSubjectMappings = mappings.data.classToSubject || [];
            teacherSubjectMappings = mappings.data.teacherToSubject || [];
            levelDesignationMappings = mappings.data.levelToDesignation || [];
            
            console.log('📊 Loaded mappings:', {
                staffClass: staffClassMappings.length,
                classSubject: classSubjectMappings.length,
                teacherSubject: teacherSubjectMappings.length,
                levelDesignation: levelDesignationMappings.length
            });
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

// FIXED: Special function to extract levels from hierarchy response
function extractLevelsData(hierarchyResponse) {
    console.log('🔍 Raw hierarchy response:', hierarchyResponse);
    
    if (!hierarchyResponse) {
        console.warn('⚠️ Hierarchy response is null/undefined');
        return [];
    }
    
    // Get numLevels from response
    let numLevels = 0;
    
    if (hierarchyResponse.data) {
        numLevels = hierarchyResponse.data.numLevels || 0;
    }
    
    console.log(`📊 NumLevels found: ${numLevels}`);
    
    // ALWAYS generate levels from numLevels (ignore the levels array in response)
    // This is because the backend levels array is unreliable
    if (numLevels > 0) {
        console.log(`✅ Generating ${numLevels} level objects from numLevels`);
        
        const levels = [];
        for (let i = 1; i <= numLevels; i++) {
            levels.push({
                _id: `level-${i}`,
                levelName: `Level ${i}`,
                levelNumber: i
            });
        }
        
        console.log('✅ Generated levels:', levels);
        return levels;
    }
    
    console.warn('⚠️ No valid numLevels found in hierarchy response');
    return [];
}

// Helper function to extract data array from API response
function extractDataArray(response, fallbackKey) {
    if (!response) return [];
    
    // If response.data is already an array
    if (Array.isArray(response.data)) {
        return response.data;
    }
    
    // If response.data is an object with nested arrays
    if (response.data && typeof response.data === 'object') {
        // Try the fallback key first
        if (fallbackKey && Array.isArray(response.data[fallbackKey])) {
            return response.data[fallbackKey];
        }
        
        // Try common property names
        const possibleKeys = ['staff', 'classes', 'subjects', 'designations', 'levels', 'hierarchy'];
        for (const key of possibleKeys) {
            if (Array.isArray(response.data[key])) {
                return response.data[key];
            }
        }
    }
    
    // If response itself is an array
    if (Array.isArray(response)) {
        return response;
    }
    
    return [];
}

function showMappingSection(sectionName) {
    const sections = document.querySelectorAll('.mapping-section');
    sections.forEach(s => s.style.display = 'none');
    
    const tabs = document.querySelectorAll('#section-tabs button');
    tabs.forEach(t => t.style.fontWeight = 'normal');
    
    document.getElementById('section-' + sectionName).style.display = 'block';
    document.getElementById('tab-' + sectionName).style.fontWeight = 'bold';
}

// ===================================
// 0. LEVEL-DESIGNATION MAPPING (FIXED VERSION)
// ===================================

// ✅ FIXED: Only show UNASSIGNED designations in dropdown
function setupLevelDesignationSection() {
    console.log('🔧 Setting up Level-Designation section...');
    console.log('📊 Designations available:', designationsData.length);
    console.log('📊 Levels available:', levelsData.length);
    
    const designationSelect = document.getElementById('ld-designation');
    if (!designationSelect) {
        console.error('❌ Designation select element not found!');
        return;
    }
    
    if (designationsData.length === 0) {
        console.warn('⚠️ No designations data available');
        designationSelect.innerHTML = '<option value="">-- No Designations Created Yet --</option>';
        showError('No designations found. Please create designations in Part 1 first.');
        return;
    }
    
    // ✅ FIXED: Filter out designations that already have levels assigned
    const assignedDesignationIds = [];
    levelDesignationMappings.forEach(mapping => {
        if (mapping.designationIds) {
            mapping.designationIds.forEach(des => {
                if (des && des._id) {
                    assignedDesignationIds.push(des._id);
                }
            });
        }
    });
    
    console.log('📌 Already assigned designation IDs:', assignedDesignationIds);
    
    // Filter to show only UNASSIGNED designations
    const unassignedDesignations = designationsData.filter(des => 
        !assignedDesignationIds.includes(des._id)
    );
    
    console.log('📊 Unassigned designations:', unassignedDesignations.length);
    
    if (unassignedDesignations.length === 0) {
        designationSelect.innerHTML = '<option value="">-- All Designations Already Assigned --</option>';
        console.log('ℹ️ All designations have been assigned to levels');
    } else {
        // Populate dropdown with ONLY unassigned designations
        populateDropdown(designationSelect, unassignedDesignations, '_id', 'name');
        console.log('✅ Designation dropdown populated with', unassignedDesignations.length, 'unassigned designations');
    }
    
    // Remove the change event listener that auto-selects levels
    // (since we want fresh selection each time)
    designationSelect.removeEventListener('change', updateLevelCheckboxes);
    
    // Populate Levels checkboxes
    const levelsContainer = document.getElementById('ld-levels-checkboxes');
    if (!levelsContainer) {
        console.error('❌ Levels container not found!');
        return;
    }
    
    levelsContainer.innerHTML = '';
    
    if (levelsData.length === 0) {
        levelsContainer.innerHTML = '<p style="color: var(--gray-500); padding: var(--space-4);">No hierarchy levels available. Please create levels in Part 1 - Hierarchy section first.</p>';
        showError('No hierarchy levels found. Please set up hierarchy levels in Part 1 first.');
        return;
    }
    
    // Use RADIO buttons (only one level at a time)
    levelsData.forEach(level => {
        if (!level || !level._id) return;
        
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="radio" name="ld-level" value="${level._id}">
            ${level.levelName || 'Unnamed Level'}
        `;
        levelsContainer.appendChild(label);
    });
    
    console.log('✅ Level-Designation section setup complete');
}

// ✅ NEW: Update level checkboxes based on selected designation
function updateLevelCheckboxes() {
    const designationId = document.getElementById('ld-designation').value;
    
    if (!designationId) {
        // Clear all selections if no designation selected
        document.querySelectorAll('input[name="ld-level"]').forEach(radio => {
            radio.checked = false;
        });
        return;
    }
    
    // Find which level this designation is currently assigned to
    const existingMapping = levelDesignationMappings.find(mapping => 
        mapping.designationIds && mapping.designationIds.some(d => d._id === designationId)
    );
    
    // Clear all selections first
    document.querySelectorAll('input[name="ld-level"]').forEach(radio => {
        radio.checked = false;
    });
    
    // If designation has a level, check that radio button
    if (existingMapping && existingMapping.levelId) {
        const levelId = existingMapping.levelId._id;
        const radio = document.querySelector(`input[name="ld-level"][value="${levelId}"]`);
        if (radio) {
            radio.checked = true;
        }
    }
}

// FIXED: Handle single level assignment (radio button)
async function handleAssignLevelToDesignations(e) {
    e.preventDefault();
    
    const designationId = document.getElementById('ld-designation').value;
    
    // ✅ FIXED: Get selected radio button (only one level)
    const selectedRadio = document.querySelector('input[name="ld-level"]:checked');
    
    if (!designationId) {
        showError('Please select a designation');
        return;
    }
    
    if (!selectedRadio) {
        showError('Please select a level');
        return;
    }
    
    const selectedLevel = selectedRadio.value;
    
    try {
        showLoading('Assigning level to designation...');
        
        const designationName = designationsData.find(d => d._id === designationId)?.name;
        const levelName = levelsData.find(l => l._id === selectedLevel)?.levelName;
        
        console.log('📤 Assigning:', {
            designation: designationName,
            level: levelName,
            designationId,
            levelId: selectedLevel
        });
        
        const payload = {
            levelId: selectedLevel,
            designationIds: [designationId]  // Array with single designation
        };
        
        console.log('📤 Payload:', JSON.stringify(payload, null, 2));
        
        const response = await apiPost(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING, payload, true);
        
        console.log('📥 Response:', response);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || `Successfully assigned ${designationName} to ${levelName}!`);
            document.getElementById('assign-level-designation-form').reset();
            loadAllData();
        } else {
            showError(response.message || 'Failed to assign level');
        }
        
    } catch (error) {
        console.error('❌ Assignment error:', error);
        hideLoading();
        showError(error.message || 'Failed to assign level. Please check console for details.');
    }
}

function displayLevelDesignationMappings() {
    const tbody = document.querySelector('#level-designation-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (levelDesignationMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No designation-level mappings yet. Use the form above to assign levels.</td></tr>';
        return;
    }
    
    // ✅ FIXED: Display one row per designation (since each designation has only one level)
    const designationMap = new Map();
    
    // Build a map of designation -> level
    levelDesignationMappings.forEach(mapping => {
        if (!mapping || !mapping.designationIds) return;
        
        const levelName = safeGet(mapping, 'levelId.levelName', '-');
        const mappingId = mapping._id;
        
        mapping.designationIds.forEach(designation => {
            if (!designation || !designation._id) return;
            
            designationMap.set(designation._id, {
                name: designation.name || 'Unnamed',
                level: levelName,
                mappingId: mappingId
            });
        });
    });
    
    // Display one row per designation
    designationMap.forEach((data, desId) => {
        const row = tbody.insertRow();
        
        row.innerHTML = `
            <td>${data.name}</td>
            <td>${data.level}</td>
            <td>
                <button onclick="editDesignationLevels('${desId}')">Edit</button>
                <button onclick="deleteDesignationLevels('${desId}')">Delete</button>
            </td>
        `;
    });
    
    console.log('✅ Displayed', designationMap.size, 'designation-level mappings');
}

async function editDesignationLevels(designationId) {
    // Find all mappings that include this designation
    const relatedMappings = levelDesignationMappings.filter(m => 
        m.designationIds && m.designationIds.some(d => d._id === designationId)
    );
    
    if (relatedMappings.length === 0) {
        showError('No mappings found for this designation');
        return;
    }
    
    // Create a combined mapping object for editing
    const designation = designationsData.find(d => d._id === designationId);
    const assignedLevels = relatedMappings.map(m => m.levelId).filter(Boolean);
    
    const editData = {
        designationId: designation,
        levelIds: assignedLevels,
        _id: designationId // Use designation ID as identifier
    };
    
    openEditModal('level-designation', designationId, editData);
}

async function deleteDesignationLevels(designationId) {
    if (!confirm('Are you sure you want to delete this designation-level assignment?')) return;
    
    try {
        showLoading('Deleting designation-level mapping...');
        
        // Find the mapping that contains this designation
        const mapping = levelDesignationMappings.find(m => 
            m.designationIds && m.designationIds.some(d => d._id === designationId)
        );
        
        if (!mapping) {
            hideLoading();
            showError('Mapping not found');
            return;
        }
        
        console.log('🗑️ Found mapping:', mapping._id);
        console.log('📌 Current designations in mapping:', mapping.designationIds.map(d => d.name));
        
        // ✅ FIXED: Remove only THIS designation from the mapping
        const remainingDesignations = mapping.designationIds.filter(
            d => d._id.toString() !== designationId.toString()
        );
        
        console.log('📌 Remaining designations after removal:', remainingDesignations.length);
        
        let response;
        
        if (remainingDesignations.length === 0) {
            // No more designations in this level - delete the entire mapping
            console.log('🗑️ No more designations - deleting entire mapping');
            response = await apiDelete(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING + '/' + mapping._id, true);
        } else {
            // Still have other designations - update the mapping to remove just this one
            console.log('✏️ Other designations remain - updating mapping to remove this designation');
            
            const remainingDesignationIds = remainingDesignations.map(d => d._id);
            
            response = await apiPost(
                API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING,
                {
                    levelId: mapping.levelId._id,
                    designationIds: remainingDesignationIds
                },
                true
            );
        }
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Designation-level assignment deleted successfully!');
            loadAllData();
        } else {
            showError(response.message || 'Failed to delete mapping');
        }
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        hideLoading();
        showError(error.message || 'Failed to delete mapping');
    }
}

// ===================================
// LEVEL-DESIGNATION EDIT MODAL (REVERSED)
// ===================================

function generateLevelDesignationEditForm(data) {
    const designationName = safeGet(data, 'designationId.name', '-');
    
    return `
        <div class="edit-form-group">
            <label>Designation</label>
            <input type="text" value="${designationName}" disabled class="disabled-input">
        </div>
        
        <div class="edit-form-group">
            <label>Assigned Level * (Choose ONE only)</label>
            <small style="display: block; margin-bottom: var(--space-2); color: var(--gray-600);">
                Each designation can have only one level
            </small>
            <div class="edit-checkbox-container" id="edit-levels-container">
                <!-- Levels will be inserted here as RADIO buttons -->
            </div>
        </div>
    `;
}

function setupLevelDesignationEditForm(data) {
    const container = document.getElementById('edit-levels-container');
    const assignedLevelIds = (data.levelIds || []).map(l => l?._id).filter(Boolean);
    const currentLevelId = assignedLevelIds[0]; // Should only be one level
    
    container.innerHTML = '';
    
    // ✅ FIXED: Use RADIO buttons instead of checkboxes
    levelsData.forEach(level => {
        if (!level || !level._id) return;
        
        const isChecked = currentLevelId === level._id;
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="radio" name="edit-level" value="${level._id}" ${isChecked ? 'checked' : ''}>
            ${level.levelName || 'Unnamed'}
        `;
        container.appendChild(label);
    });
}

async function saveLevelDesignationEdit() {
    // ✅ FIXED: Get selected radio button (only one level)
    const selectedRadio = document.querySelector('input[name="edit-level"]:checked');
    
    if (!selectedRadio) {
        showError('Please select a level');
        return;
    }
    
    const selectedLevel = selectedRadio.value;
    
    showLoading('Updating designation-level mapping...');
    
    const designationId = currentEditId; // This is the designation ID
    
    try {
        const payload = {
            levelId: selectedLevel,
            designationIds: [designationId]
        };
        
        console.log('📤 Updating mapping:', payload);
        
        const response = await apiPost(API_ENDPOINTS.LEVEL_DESIGNATION_MAPPING, payload, true);
        
        console.log('📥 Update response:', response);
        
        hideLoading();
        
        if (response.success) {
            showSuccess(response.message || 'Designation-level mapping updated successfully!');
            closeEditModal();
            loadAllData();
        } else {
            showError(response.message || 'Failed to update mapping');
        }
        
    } catch (error) {
        console.error('❌ Update error:', error);
        hideLoading();
        showError(error.message || 'Failed to update mapping');
    }
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
        
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="sc-class" value="${cls._id}">
            ${formatClassName(cls)}
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
    const selectedClasses = Array.from(document.querySelectorAll('input[name="sc-class"]:checked'))
        .map(cb => cb.value);
    
    if (!staffId) {
        showError('Please select a staff member');
        return;
    }
    
    if (!designationId) {
        showError('Please select a designation');
        return;
    }
    
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
        if (!mapping) return;
        
        const row = tbody.insertRow();
        const staffName = safeGet(mapping, 'staffId.name', '-');
        const designationName = safeGet(mapping, 'designationId.name', '-');
        const classes = (mapping.assignedClasses || [])
            .map(c => formatClassName(c))
            .join(', ') || 'None';
        
        row.innerHTML = `
            <td>${staffName}</td>
            <td>${designationName}</td>
            <td>${classes}</td>
            <td>
                ${mapping._id ? `
                    <button onclick="editStaffClassMapping('${mapping._id}')">Edit</button>
                    <button onclick="deleteStaffClassMapping('${mapping._id}')">Delete</button>
                ` : ''}
            </td>
        `;
    });
}

async function editStaffClassMapping(id) {
    const mapping = staffClassMappings.find(m => m._id === id);
    if (mapping) {
        openEditModal('staff-class', id, mapping);
    }
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
    const classSelect = document.getElementById('cs-class');
    populateDropdown(classSelect, classesData, '_id', formatClassName);
    
    const subjectsContainer = document.getElementById('cs-subjects-checkboxes');
    subjectsContainer.innerHTML = '';
    
    subjectsData.forEach(subject => {
        if (!subject || !subject._id) return;
        
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="cs-subject" value="${subject._id}">
            ${subject.subjectName || 'Unnamed'}
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
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="cs-subject"]:checked'))
        .map(cb => cb.value);
    
    if (!classId) {
        showError('Please select a class');
        return;
    }
    
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
        if (!mapping) return;
        
        const row = tbody.insertRow();
        const className = formatClassName(mapping.classId);
        const subjects = (mapping.subjectIds || [])
            .map(s => s?.subjectName || 'Unnamed')
            .join(', ') || 'None';
        
        const classId = safeGet(mapping, 'classId._id');
        
        row.innerHTML = `
            <td>${className}</td>
            <td>${subjects}</td>
            <td>
                ${classId ? `<button onclick="editClassSubjectMapping('${classId}')">Edit</button>` : ''}
            </td>
        `;
    });
}

async function editClassSubjectMapping(classId) {
    const mapping = classSubjectMappings.find(m => m.classId?._id === classId);
    if (mapping) {
        openEditModal('class-subject', mapping._id, mapping);
    }
}

// ===================================
// 3. TEACHER-SUBJECT MAPPING
// ===================================

function setupTeacherSubjectSection() {
    const teacherSelect = document.getElementById('ts-teacher');
    populateDropdown(teacherSelect, staffData, '_id', 'name');
    
    const classSelect = document.getElementById('ts-class');
    populateDropdown(classSelect, classesData, '_id', formatClassName);
}

async function handleTeacherClassSelection() {
    const classId = document.getElementById('ts-class').value;
    
    if (!classId) {
        document.getElementById('ts-subjects-container').classList.remove('show');
        return;
    }
    
    const classMapping = classSubjectMappings.find(m => m.classId?._id === classId);
    
    if (!classMapping || !classMapping.subjectIds || classMapping.subjectIds.length === 0) {
        showError('No subjects assigned to this class yet. Please assign subjects first in Section 2.');
        document.getElementById('ts-subjects-container').classList.remove('show');
        return;
    }
    
    const container = document.getElementById('ts-subjects-checkboxes');
    container.innerHTML = '';
    
    classMapping.subjectIds.forEach(subject => {
        if (!subject || !subject._id) return;
        
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" name="ts-subject" value="${subject._id}">
            ${subject.subjectName || 'Unnamed'}
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
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="ts-subject"]:checked'))
        .map(cb => cb.value);
    
    if (!teacherId) {
        showError('Please select a teacher');
        return;
    }
    
    if (!classId) {
        showError('Please select a class');
        return;
    }
    
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
        if (!mapping) return;
        
        const row = tbody.insertRow();
        const teacherName = safeGet(mapping, 'teacherId.name', '-');
        const className = formatClassName(mapping.classId);
        const subjects = (mapping.subjectIds || [])
            .map(s => s?.subjectName || 'Unnamed')
            .join(', ') || 'None';
        
        row.innerHTML = `
            <td>${teacherName}</td>
            <td>${className}</td>
            <td>${subjects}</td>
            <td>
                ${mapping._id ? `
                    <button onclick="editTeacherSubjectMapping('${mapping._id}')">Edit</button>
                    <button onclick="deleteTeacherSubjectMapping('${mapping._id}')">Delete</button>
                ` : ''}
            </td>
        `;
    });
}

async function editTeacherSubjectMapping(id) {
    const mapping = teacherSubjectMappings.find(m => m._id === id);
    if (mapping) {
        openEditModal('teacher-subject', id, mapping);
    }
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
    displayLevelDesignationMappings();
    displayStaffClassMappings();
    displayClassSubjectMappings();
    displayTeacherSubjectMappings();
}

console.log('✅ mapping.js loaded successfully (FIXED VERSION with better error handling)');