// dashboard.js - WITH CENTERED OVERLAY LOADING

// ===============================
// INITIALIZATION
// ===============================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing...');
    
    // Check authentication
    if (!checkAuth()) {
        console.error('Authentication failed');
        return;
    }
    
    // Verify this is an institution user (not staff)
    const userType = localStorage.getItem('userType');
    
    if (userType === 'staff') {
        console.log('Staff user detected, redirecting to staff dashboard...');
        window.location.href = 'staff-dashboard.html';
        return;
    }
    
    if (userType !== 'institution') {
        showError('Unauthorized access. Please login as institution.');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }
    
    console.log('✅ Authentication verified - Institution user');
    
    // Load dashboard data
    loadDashboardData();
});

// ===============================
// MAIN DASHBOARD LOADER
// ===============================

async function loadDashboardData() {
    try {
        showLoading('Loading your dashboard...');
        
        // Show loading skeletons
        showLoadingSkeletons();
        
        // Fetch institution profile
        const response = await apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true);
        
        console.log('📊 Dashboard API Response:', response);
        
        if (!response.success) {
            throw new Error(response.message || 'Failed to load dashboard data');
        }

        const data = response.data;

        if (!data) {
            throw new Error('No data received from server');
        }
        
        // Hide loading, show data with animations
        hideLoading();
        hideLoadingSkeletons();
        
        // Display data with staggered animation
        displayLogo(data.logo);
        
        setTimeout(() => displayProfileDetails(data), 100);
        setTimeout(() => displayLastLogin(data.lastLogin), 200);
        setTimeout(() => displayStatistics(data.stats), 300);
        
        // Animate stats cards
        animateStatsCards();
        
        console.log('✅ Dashboard loaded successfully');
        
    } catch (error) {
        hideLoading();
        hideLoadingSkeletons();
        console.error('❌ Error loading dashboard:', error);
        showError(error.message || 'Failed to load dashboard data');
    }
}

// ===============================
// LOADING SKELETONS
// ===============================

function showLoadingSkeletons() {
    // Stats cards loading state
    const statsCards = document.querySelectorAll('.stat-card p');
    statsCards.forEach(card => {
        card.classList.add('loading-skeleton');
        card.textContent = '...';
    });
}

function hideLoadingSkeletons() {
    const statsCards = document.querySelectorAll('.stat-card p');
    statsCards.forEach(card => {
        card.classList.remove('loading-skeleton');
    });
}

// ===============================
// DISPLAY LOGO
// ===============================

function displayLogo(logo) {
    const logoImg = document.getElementById('institution-logo');
    if (logo && logoImg) {
        logoImg.src = logo;
        logoImg.style.display = 'block';
        logoImg.style.animation = 'fadeInUp 0.6s ease-out';
        
        logoImg.onerror = function() {
            console.warn('Failed to load logo image');
            this.style.display = 'none';
        };
    }
}

// ===============================
// DISPLAY PROFILE DETAILS
// ===============================

function displayProfileDetails(data) {
    // Helper function for safe display
    const safeDisplay = (elementId, value, fallback = '-') => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value ?? fallback;
            element.style.animation = 'fadeIn 0.4s ease-out';
        }
    };

    // Basic Information
    safeDisplay('inst-code', data.institutionCode);
    safeDisplay('inst-name', data.name);
    
    // ✅ FIXED: Display correct institution type
    // Priority: displayType > customType (if type is Other) > type
    let institutionType = data.type || '-';
    
    if (data.displayType) {
        // If backend provides displayType, use it
        institutionType = data.displayType;
    } else if (data.type === 'Other' && data.customType) {
        // If type is Other and customType exists, show customType
        institutionType = data.customType;
    }
    
    safeDisplay('inst-type', institutionType);
    console.log('📝 Institution Type Display:', {
        type: data.type,
        customType: data.customType,
        displayType: data.displayType,
        final: institutionType
    });
    
    // Address - Handle all possible null/undefined cases
    if (data.address && typeof data.address === 'object') {
        safeDisplay('inst-state', data.address.state);
        safeDisplay('inst-district', data.address.district);
        safeDisplay('inst-city', data.address.city);
    } else {
        console.warn('⚠️ Address data is missing or invalid:', data.address);
        safeDisplay('inst-state', null);
        safeDisplay('inst-district', null);
        safeDisplay('inst-city', null);
    }
    
    // Contacts - Handle all possible null/undefined cases
    if (data.contacts && typeof data.contacts === 'object') {
        safeDisplay('inst-mobile1', data.contacts.mobile1);
        safeDisplay('inst-mobile2', data.contacts.mobile2);
        safeDisplay('inst-email', data.contacts.email);
    } else {
        console.warn('⚠️ Contacts data is missing or invalid:', data.contacts);
        safeDisplay('inst-mobile1', null);
        safeDisplay('inst-mobile2', null);
        safeDisplay('inst-email', null);
    }
}

// ===============================
// DISPLAY LAST LOGIN
// ===============================

function displayLastLogin(lastLogin) {
    const element = document.getElementById('inst-last-login');
    if (!element) return;
    
    if (lastLogin) {
        try {
            const date = new Date(lastLogin);
            if (isNaN(date.getTime())) {
                element.textContent = 'Invalid date';
            } else {
                element.textContent = date.toLocaleString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            console.error('Error parsing last login date:', error);
            element.textContent = 'Invalid date';
        }
    } else {
        element.textContent = 'First login';
    }
    
    // Add fade-in animation
    element.style.animation = 'fadeIn 0.4s ease-out';
}

// ===============================
// DISPLAY STATISTICS
// ===============================

function displayStatistics(stats) {
    // Helper function for safe stat display with animation
    const safeStatDisplay = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element) {
            const numValue = Number(value);
            const finalValue = isNaN(numValue) ? 0 : numValue;
            
            // Animate number counting
            animateValue(element, 0, finalValue, 1000);
        }
    };

    if (stats && typeof stats === 'object') {
        safeStatDisplay('stat-staff', stats.totalStaff);
        safeStatDisplay('stat-classes', stats.totalClasses);
        safeStatDisplay('stat-subjects', stats.totalSubjects);
        safeStatDisplay('stat-students', stats.totalStudents);
    } else {
        console.warn('⚠️ Statistics data is missing');
        safeStatDisplay('stat-staff', 0);
        safeStatDisplay('stat-classes', 0);
        safeStatDisplay('stat-subjects', 0);
        safeStatDisplay('stat-students', 0);
    }
}

// ===============================
// ANIMATE NUMBER COUNTING
// ===============================

function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16); // 60fps
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toString();
    }, 16);
}

// ===============================
// ANIMATE STATS CARDS
// ===============================

function animateStatsCards() {
    const cards = document.querySelectorAll('.stat-card');
    
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.animation = 'fadeInUp 0.6s ease-out';
        }, index * 100);
    });
}

// ===============================
// NAVIGATION FUNCTIONS
// ===============================

function goToPart1() {
    console.log('Navigating to Part 1...');
    window.location.href = 'part1-basic-info.html';
}

function goToPart2() {
    console.log('Navigating to Part 2...');
    window.location.href = 'part2-mapping.html';
}

function goToPart3() {
    console.log('Navigating to Part 3...');
    window.location.href = 'part3-credentials.html';
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
// UTILITY FUNCTIONS
// ===============================

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
        localStorage.removeItem('institutionCode');
        window.location.href = 'index.html';
    }
}

// ===============================
// KEYBOARD SHORTCUTS
// ===============================

document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + 1 = Part 1
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        goToPart1();
    }
    
    // Ctrl/Cmd + 2 = Part 2
    if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        goToPart2();
    }
    
    // Ctrl/Cmd + 3 = Part 3
    if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        goToPart3();
    }
});

// ===============================
// EXPORT FUNCTIONS
// ===============================

window.goToPart1 = goToPart1;
window.goToPart2 = goToPart2;
window.goToPart3 = goToPart3;
window.logout = logout;

console.log('✅ Dashboard.js loaded successfully');