// staff-dashboard.js - WORKS WITHOUT LOGIN CHANGES

// ===============================
// INITIALIZATION
// ===============================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Staff Dashboard initializing...');
    
    // Check authentication
    if (!checkAuth()) {
        console.error('Authentication failed');
        return;
    }
    
    // Verify this is a staff user
    const userType = localStorage.getItem('userType');
    
    if (userType === 'institution') {
        console.log('Institution user detected, redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }
    
    if (userType !== 'staff') {
        showError('Unauthorized access. Please login as staff.');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }
    
    console.log('✅ Authentication verified - Staff user');
    
    // Load dashboard data
    loadStaffDashboard();
});

// ===============================
// MAIN DASHBOARD LOADER
// ===============================

async function loadStaffDashboard() {
    try {
        showLoading('Loading your dashboard...');
        
        // Fetch staff profile - THIS HAS EVERYTHING WE NEED
        const profileResponse = await apiGet(API_ENDPOINTS.STAFF_PROFILE, true);
        
        console.log('📊 Staff Profile API Response:', profileResponse);
        
        if (!profileResponse.success) {
            throw new Error(profileResponse.message || 'Failed to load profile');
        }

        const data = profileResponse.data;

        if (!data) {
            throw new Error('No data received from server');
        }
        
        console.log('✅ Profile data received:', data);
        
        // 🔥 SMART: Extract and save institutionCode if missing
        ensureInstitutionCode(data);
        
        // Display profile
        displayStaffProfile(data);
        
        hideLoading();
        
        console.log('✅ Staff Dashboard loaded successfully');
        
    } catch (error) {
        hideLoading();
        console.error('❌ Error loading dashboard:', error);
        showError(error.message || 'Failed to load dashboard');
    }
}

// ===============================
// ENSURE INSTITUTION CODE
// ===============================

function ensureInstitutionCode(data) {
    let institutionCode = localStorage.getItem('institutionCode');
    
    // If not in localStorage, try to get from profile data
    if (!institutionCode) {
        console.log('⚠️ Institution code not in localStorage - extracting from profile...');
        
        // Try multiple possible paths in the response
        institutionCode = data.institutionId ||
                         data.institution?.institutionCode ||
                         data.institutionCode ||
                         data.credential?.institutionId ||
                         data.staff?.institutionId;
        
        if (institutionCode) {
            localStorage.setItem('institutionCode', institutionCode);
            console.log('✅ Institution code saved from profile:', institutionCode);
        } else {
            console.warn('⚠️ Could not find institution code in profile response');
        }
    } else {
        console.log('✅ Institution code already in localStorage:', institutionCode);
    }
    
    // Also ensure access level is saved
    let accessLevel = localStorage.getItem('accessLevel');
    if (!accessLevel) {
        accessLevel = data.accessLevel ||
                     data.credential?.accessLevel ||
                     data.staff?.accessLevel ||
                     'teacher'; // fallback
        
        localStorage.setItem('accessLevel', accessLevel);
        console.log('✅ Access level saved:', accessLevel);
    }
}

// ===============================
// DISPLAY STAFF PROFILE
// ===============================

function displayStaffProfile(data) {
    console.log('📋 Displaying staff profile:', data);
    
    // Update welcome banner - Staff name
    const nameDisplay = document.getElementById('staff-name-display');
    if (nameDisplay) {
        const staffName = data.name || 'Staff Member';
        nameDisplay.textContent = staffName;
    }
    
    // Institution code - get from localStorage (we just ensured it exists)
    const instCodeDisplay = document.getElementById('inst-code-display');
    if (instCodeDisplay) {
        const institutionCode = localStorage.getItem('institutionCode') || 'N/A';
        instCodeDisplay.textContent = institutionCode;
    }
    
    // Institution name
    const instNameDisplay = document.getElementById('inst-name-display');
    if (instNameDisplay) {
        const instName = data.institution?.name || 
                        data.institutionName || 
                        'Your Institution';
        instNameDisplay.textContent = instName;
    }
    
    // Profile details - Direct from data
    safeDisplay('staff-name', data.name);
    safeDisplay('staff-mobile', data.mobileNo || data.mobile);
    safeDisplay('staff-loginid', localStorage.getItem('loginId') || data.loginId || 'N/A');
    safeDisplay('staff-designation', data.designation || data.designationName || 'Not Assigned');
    
    // Access Level badge
    const accessElement = document.getElementById('staff-access-level');
    if (accessElement) {
        const accessLevel = localStorage.getItem('accessLevel') || 
                           data.accessLevel ||
                           'teacher';
        const badge = document.createElement('span');
        badge.className = `access-badge access-${accessLevel}`;
        badge.textContent = accessLevel.toUpperCase();
        accessElement.innerHTML = '';
        accessElement.appendChild(badge);
    }
    
    // Status badge
    const statusElement = document.getElementById('staff-status');
    if (statusElement) {
        const isActive = data.isActive !== false; // assume active if not specified
        const badge = document.createElement('span');
        badge.className = `status-badge ${isActive ? 'status-active' : 'status-inactive'}`;
        badge.textContent = isActive ? 'ACTIVE' : 'INACTIVE';
        statusElement.innerHTML = '';
        statusElement.appendChild(badge);
    }
    
    // Display assigned classes and subjects from assignedClasses array
    if (data.assignedClasses && Array.isArray(data.assignedClasses)) {
        console.log('📚 Processing assigned classes:', data.assignedClasses);
        displayAssignedClassesAndSubjects(data.assignedClasses);
    } else {
        console.log('ℹ️ No assigned classes in response');
        displayAssignedClassesAndSubjects([]);
    }
    
    // Display permissions
    const accessLevel = localStorage.getItem('accessLevel') || 'teacher';
    displayPermissions(accessLevel);
}

// ===============================
// DISPLAY CLASSES AND SUBJECTS
// ===============================

function displayAssignedClassesAndSubjects(assignedClasses) {
    console.log('📚 Displaying classes and subjects:', assignedClasses);
    
    const classesContainer = document.getElementById('classes-list');
    const subjectsSection = document.getElementById('subjects-section');
    const subjectsContainer = document.getElementById('subjects-list');
    
    // Handle empty data
    if (!assignedClasses || assignedClasses.length === 0) {
        if (classesContainer) {
            classesContainer.innerHTML = `
                <div class="empty-state">
                    <p>📭 No classes assigned yet</p>
                    <small>Classes will appear here once assigned by admin</small>
                </div>
            `;
        }
        if (subjectsSection) {
            subjectsSection.style.display = 'none';
        }
        return;
    }
    
    // ✅ Display Classes
    if (classesContainer) {
        classesContainer.innerHTML = '';
        
        assignedClasses.forEach((classData, index) => {
            const className = classData.nickname || classData.className || 'Unknown Class';
            
            const card = document.createElement('div');
            card.className = 'class-card';
            card.style.animationDelay = `${index * 0.1}s`;
            card.style.animation = 'fadeInUp 0.6s ease-out';
            
            card.innerHTML = `
                <h4>${sanitizeHTML(className)}</h4>
                <p>Assigned Class</p>
            `;
            
            classesContainer.appendChild(card);
        });
        
        console.log(`✅ Displayed ${assignedClasses.length} classes`);
    }
    
    // ✅ Display Subjects (if any class has subjects)
    const allSubjects = [];
    
    assignedClasses.forEach(classData => {
        const className = classData.nickname || classData.className || 'Unknown Class';
        
        if (classData.subjects && Array.isArray(classData.subjects) && classData.subjects.length > 0) {
            classData.subjects.forEach(subject => {
                allSubjects.push({
                    className: className,
                    subjectName: subject.subjectName || subject.name
                });
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
            
            card.innerHTML = `
                <h4>${sanitizeHTML(item.subjectName)}</h4>
                <p>in ${sanitizeHTML(item.className)}</p>
            `;
            
            subjectsContainer.appendChild(card);
        });
        
        console.log(`✅ Displayed ${allSubjects.length} subjects`);
    } else {
        if (subjectsSection) {
            subjectsSection.style.display = 'none';
        }
        console.log('ℹ️ No subjects to display');
    }
}

// ===============================
// DISPLAY PERMISSIONS
// ===============================

function displayPermissions(accessLevel) {
    const container = document.getElementById('permissions-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    console.log('🔑 Access Level:', accessLevel);
    
    let permissions = [];
    
    if (accessLevel === 'teacher') {
        permissions = [
            { icon: '👀', text: 'View assigned classes' },
            { icon: '📚', text: 'View teaching subjects' },
            { icon: '👥', text: 'View student information' },
            { icon: '✅', text: 'Mark attendance' }
        ];
    } else if (accessLevel === 'coordinator') {
        permissions = [
            { icon: '👀', text: 'View assigned classes' },
            { icon: '📚', text: 'View teaching subjects' },
            { icon: '👥', text: 'View and manage students' },
            { icon: '✅', text: 'Mark attendance' },
            { icon: '📊', text: 'Generate reports' },
            { icon: '📝', text: 'Update student records' }
        ];
    } else if (accessLevel === 'admin') {
        permissions = [
            { icon: '🔐', text: 'Full system access' },
            { icon: '👥', text: 'Manage all staff' },
            { icon: '📚', text: 'Manage all classes' },
            { icon: '📖', text: 'Manage all subjects' },
            { icon: '🎓', text: 'Manage all students' },
            { icon: '📊', text: 'Access all reports' }
        ];
    }
    
    permissions.forEach((perm, index) => {
        const item = document.createElement('div');
        item.className = 'permission-item';
        item.style.animationDelay = `${index * 0.05}s`;
        item.style.animation = 'fadeInUp 0.4s ease-out';
        
        item.innerHTML = `
            <span class="permission-icon">${perm.icon}</span>
            <span class="permission-text">${perm.text}</span>
        `;
        
        container.appendChild(item);
    });
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

function safeDisplay(elementId, value, fallback = '-') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value ?? fallback;
        element.style.animation = 'fadeIn 0.4s ease-out';
    }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('No authentication token found');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('loginId');
        localStorage.removeItem('institutionCode');
        localStorage.removeItem('accessLevel');
        window.location.href = 'index.html';
    }
}

// ===============================
// MESSAGE FUNCTIONS
// ===============================

function showLoading(message = 'Loading...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.querySelector('#loading-overlay .loading-text');
    
    if (loadingOverlay) {
        loadingOverlay.classList.add('show');
    }
    
    if (loadingText) {
        loadingText.textContent = '⏳ ' + message;
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = '❌ ' + message;
        errorDiv.classList.add('show');
        errorDiv.style.animation = 'slideInRight 0.4s ease-out';
        
        setTimeout(() => {
            errorDiv.classList.remove('show');
        }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    if (successDiv) {
        successDiv.textContent = '✅ ' + message;
        successDiv.classList.add('show');
        successDiv.style.animation = 'slideInRight 0.4s ease-out';
        
        setTimeout(() => {
            successDiv.classList.remove('show');
        }, 3000);
    }
}

// ===============================
// SANITIZATION
// ===============================

function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===============================
// EXPORT FUNCTIONS
// ===============================

window.logout = logout;

console.log('✅ Staff-Dashboard.js loaded successfully (DASHBOARD-ONLY FIX - No login changes needed)');