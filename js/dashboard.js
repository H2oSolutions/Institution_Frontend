// dashboard.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing...');

    if (!checkAuth()) return;

    const userType = localStorage.getItem('userType');
    if (userType === 'staff') { window.location.href = 'staff-dashboard.html'; return; }
    if (userType !== 'institution') {
        showError('Unauthorized access. Please login as institution.');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }

    loadDashboardData();
    loadYearStats();
});

// ─────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────
async function loadDashboardData() {
    try {
        showLoading('Loading your dashboard...');
        showLoadingSkeletons();

        const response = await apiGet(API_ENDPOINTS.INSTITUTION_PROFILE, true);
        console.log('📊 Dashboard Response:', response);

        if (!response.success) throw new Error(response.message || 'Failed to load dashboard data');

        const data = response.data;
        if (!data) throw new Error('No data received from server');

        hideLoading();
        hideLoadingSkeletons();

        displayLogo(data.logo);
        setTimeout(() => displayProfileDetails(data), 100);
        setTimeout(() => displayLastLogin(data.lastLogin), 200);
        setTimeout(() => displayStatistics(data.stats), 300);
        animateStatsCards();

        console.log('✅ Dashboard loaded');

    } catch (error) {
        hideLoading();
        hideLoadingSkeletons();
        console.error('❌ Dashboard load error:', error);
        showError(error.message || 'Failed to load dashboard data');
    }
}

// ─────────────────────────────────────────────
// YEAR-WISE STATS
// ─────────────────────────────────────────────
async function loadYearStats() {
    try {
        const res = await apiGet(`${API_BASE_URL}/promotion/year-stats`, true);
        if (!res.success) return;

        const {
            stats, currentAcademicYear,
            isPromotionLocked, lastPromotionYear, lastPromotionDate,
            feeDefaultersCount
        } = res.data;

        renderYearCards(stats, currentAcademicYear);

        animateValue(document.getElementById('stat-defaulters'), 0, feeDefaultersCount || 0, 800);

        if (isPromotionLocked && lastPromotionYear) {
            const banner   = document.getElementById('promotion-lock-banner');
            const lockDate = lastPromotionDate
                ? new Date(lastPromotionDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
                : '';
            document.getElementById('lock-banner-text').textContent =
                `Promotion to ${lastPromotionYear} was completed${lockDate ? ' on ' + lockDate : ''}.`;
            banner.style.display = 'flex';
        }

        if (feeDefaultersCount > 0) {
            const banner = document.getElementById('fee-defaulter-banner');
            document.getElementById('defaulter-banner-text').textContent =
                `${feeDefaultersCount} unpaid fee notice${feeDefaultersCount > 1 ? 's' : ''} in ${currentAcademicYear}. Consider following up.`;
            banner.style.display = 'flex';
        }

    } catch (error) {
        console.warn('⚠️ Year stats load error:', error);
        document.getElementById('yearwise-grid').innerHTML =
            '<p style="text-align:center; color:#9ca3af; padding:20px; grid-column:1/-1;">Could not load year data.</p>';
    }
}

function renderYearCards(stats, currentAcademicYear) {
    const grid = document.getElementById('yearwise-grid');
    if (!stats || !stats.length) {
        grid.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:20px; grid-column:1/-1;">No year data yet.</p>';
        return;
    }

    grid.innerHTML = [...stats].reverse().map(s => {
        const isCurrent = s.year === currentAcademicYear;
        return `
            <div class="year-card ${isCurrent ? 'current-year' : ''}">
                <div class="year-card-header">
                    <div class="year-title">📅 ${s.year}</div>
                    <span class="year-badge ${isCurrent ? 'current' : 'previous'}">
                        ${isCurrent ? '🟢 Active' : '⏪ Past'}
                    </span>
                </div>
                <div class="year-stats-row">
                    <div class="yr-stat">
                        <div class="num green">${s.active}</div>
                        <div class="lbl">Active</div>
                    </div>
                    <div class="yr-stat">
                        <div class="num purple">${s.graduated}</div>
                        <div class="lbl">Graduated</div>
                    </div>
                    <div class="yr-stat">
                        <div class="num orange">${s.repeating}</div>
                        <div class="lbl">Repeating</div>
                    </div>
                </div>
                <div style="font-size:0.78rem; color:#9ca3af; text-align:center; margin-top:4px;">
                    Total: <strong style="color:#374151;">${s.total}</strong> students
                    ${s.newAdmissions > 0 ? ` &nbsp;·&nbsp; <strong style="color:#6366f1;">${s.newAdmissions} new</strong>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ─────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────
function showLoadingSkeletons() {
    document.querySelectorAll('.stat-card p').forEach(card => {
        card.classList.add('loading-skeleton');
        card.textContent = '...';
    });
}
function hideLoadingSkeletons() {
    document.querySelectorAll('.stat-card p').forEach(card => {
        card.classList.remove('loading-skeleton');
    });
}

function displayLogo(logo) {
    const img = document.getElementById('institution-logo');
    if (logo && img) {
        img.src = logo; img.style.display = 'block';
        img.onerror = function() { this.style.display = 'none'; };
    }
}

function displayProfileDetails(data) {
    const safe = (id, val, fallback = '-') => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? fallback;
    };
    safe('inst-code', data.institutionCode);
    safe('inst-name', data.name);

    let institutionType = data.type || '-';
    if (data.displayType) institutionType = data.displayType;
    else if (data.type === 'Other' && data.customType) institutionType = data.customType;
    safe('inst-type', institutionType);
    safe('inst-current-year', data.currentAcademicYear || '-');

    if (data.address) {
        safe('inst-state',    data.address.state);
        safe('inst-district', data.address.district);
        safe('inst-city',     data.address.city);
    }
    if (data.contacts) {
        safe('inst-mobile1', data.contacts.mobile1);
        safe('inst-mobile2', data.contacts.mobile2);
        safe('inst-email',   data.contacts.email);
    }
}

function displayLastLogin(lastLogin) {
    const el = document.getElementById('inst-last-login');
    if (!el) return;
    if (lastLogin) {
        try {
            const d = new Date(lastLogin);
            el.textContent = isNaN(d.getTime()) ? 'Invalid date'
                : d.toLocaleString('en-IN', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        } catch { el.textContent = 'Invalid date'; }
    } else {
        el.textContent = 'First login';
    }
}

function displayStatistics(stats) {
    if (!stats) return;
    const safeStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) animateValue(el, 0, isNaN(Number(val)) ? 0 : Number(val), 1000);
    };
    safeStat('stat-staff',    stats.totalStaff);
    safeStat('stat-classes',  stats.totalClasses);
    safeStat('stat-subjects', stats.totalSubjects);
    safeStat('stat-students', stats.totalStudents);
}

function animateValue(element, start, end, duration) {
    if (!element) return;
    const range     = end - start;
    const increment = range / (duration / 16);
    let current     = start;
    const timer = setInterval(() => {
        current += increment;
        if ((increment >= 0 && current >= end) || (increment < 0 && current <= end) || increment === 0) {
            current = end; clearInterval(timer);
        }
        element.textContent = Math.floor(current).toString();
    }, 16);
}

function animateStatsCards() {
    document.querySelectorAll('.stat-card').forEach((card, i) => {
        setTimeout(() => { card.style.animation = 'fadeInUp 0.6s ease-out'; }, i * 100);
    });
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function goToPart1()          { window.location.href = 'part1-basic-info.html'; }
function goToPart2()          { window.location.href = 'part2-mapping.html'; }
function goToPart3()          { window.location.href = 'part3-credentials.html'; }
function goToPromotion()      { window.location.href = 'promotion.html'; }
function goToDataManagement() { window.location.href = 'data-management.html'; }

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function showLoading(message = 'Loading...') {
    const loading = document.getElementById('loading');
    const overlay = document.getElementById('message-overlay');
    if (loading) { loading.textContent = message; loading.classList.add('show'); }
    if (overlay) overlay.classList.add('show');
}
function hideLoading() {
    document.getElementById('loading')?.classList.remove('show');
    document.getElementById('message-overlay')?.classList.remove('show');
}
function showError(message) {
    hideMessages();
    const el = document.getElementById('error-message');
    if (el) {
        el.textContent = message; el.classList.add('show');
        document.getElementById('message-overlay')?.classList.add('show');
        setTimeout(() => hideMessages(), 5000);
    }
}
function showSuccess(message) {
    hideMessages();
    const el = document.getElementById('success-message');
    if (el) {
        el.textContent = message; el.classList.add('show');
        document.getElementById('message-overlay')?.classList.add('show');
        setTimeout(() => hideMessages(), 3000);
    }
}
function hideMessages() {
    ['error-message','success-message','loading'].forEach(id => document.getElementById(id)?.classList.remove('show'));
    document.getElementById('message-overlay')?.classList.remove('show');
}
function checkAuth() {
    if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return false; }
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

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); goToPart1(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); goToPart2(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '3') { e.preventDefault(); goToPart3(); }
});

window.goToPart1          = goToPart1;
window.goToPart2          = goToPart2;
window.goToPart3          = goToPart3;
window.goToPromotion      = goToPromotion;
window.goToDataManagement = goToDataManagement;
window.logout             = logout;

console.log('✅ Dashboard.js loaded');