// js/dashboard.js
'use strict';

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
    loadSubscriptionStatus();
    loadPaymentSetupStatus();
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
    if (!grid) return;
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
// SUBSCRIPTION STATUS
// ─────────────────────────────────────────────
async function loadSubscriptionStatus() {
    try {
        const token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
        if (!token) return;
        const res  = await fetch(`${API_BASE_URL}/subscription/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.success || !data.data) return;
        const sub = data.data;
        if (sub.isExpired)     updatePremiumCard('expired', sub);
        else if (sub.isActive) updatePremiumCard('active',  sub);
    } catch(err) { console.warn('Subscription status error:', err.message); }
}

function updatePremiumCard(state, sub) {
    const lockBadge = document.querySelector('.premium-lock-badge');
    const pillFee   = document.querySelectorAll('.pf-pill')[0];
    const pillIcard = document.querySelectorAll('.pf-pill')[1];
    const ctaBtn    = document.querySelector('.premium-cta-btn');
    const premTitle = document.querySelector('.premium-title-wrap h3');
    const premSub   = document.querySelector('.premium-title-wrap span');
    const labels    = { fee: 'Fee Management', icard: 'I-Card Management', bundle: 'Complete Bundle' };
    const expDate   = new Date(sub.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    if (state === 'active') {
        if (lockBadge) {
            lockBadge.innerHTML = `<div class="lock-dot" style="background:#10b981;box-shadow:0 0 6px #10b981"></div> ✅ Active`;
            lockBadge.style.cssText = 'background:rgba(16,185,129,0.15);border-color:rgba(16,185,129,0.4);color:#6ee7b7;display:flex;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;flex-shrink:0;border:1.5px solid rgba(16,185,129,0.4)';
        }
        if (premTitle) premTitle.textContent = `${labels[sub.plan] || 'Premium'} — Active`;
        if (premSub) premSub.textContent   = `Expires ${expDate} · ${sub.daysLeft} days left`;
        if (ctaBtn) ctaBtn.innerHTML       = 'Manage Features <span class="arrow">→</span>';
        if (sub.plan === 'fee' || sub.plan === 'bundle') { if (pillFee) { pillFee.style.borderColor = 'rgba(16,185,129,0.5)'; pillFee.style.background = 'rgba(16,185,129,0.07)'; } }
        if (sub.plan === 'icard' || sub.plan === 'bundle') { if (pillIcard) { pillIcard.style.borderColor = 'rgba(16,185,129,0.5)'; pillIcard.style.background = 'rgba(16,185,129,0.07)'; } }
        
        if (sub.plan === 'fee' || sub.plan === 'bundle') {
            hasFeeSubscription = true;
            const row = document.getElementById('paymentSetupRow');
            if (row) row.style.display = 'block';
        }
    } else if (state === 'expired') {
        if (lockBadge) {
            lockBadge.innerHTML = `<div class="lock-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444"></div> ⚠️ Expired`;
            lockBadge.style.cssText = 'background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.4);color:#fca5a5;display:flex;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-size:0.75rem;font-weight:700;text-transform:uppercase;flex-shrink:0;border:1.5px solid rgba(239,68,68,0.4)';
        }
        if (premTitle) premTitle.textContent = 'Subscription Expired';
        if (premSub) premSub.textContent   = `Expired on ${expDate} · Renew to continue`;
        if (ctaBtn) ctaBtn.innerHTML       = 'Renew Now <span class="arrow">→</span>';
    }
}

// ─────────────────────────────────────────────
// PAYMENT SETUP STATUS
// ─────────────────────────────────────────────
let hasFeeSubscription = false;

async function loadPaymentSetupStatus() {
    const card  = document.getElementById('psCard');
    const badge = document.getElementById('psBadge');
    const sub   = document.getElementById('psSub');
    const btn   = document.getElementById('psBtn');
    if (!card) return;

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
        if (!token) return;
        const res  = await fetch(`${API_BASE_URL}/institution/payment-setup`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        
        if (data.success && data.data?.isSetupComplete) {
            card.classList.add('ps-active');
            if (badge) {
                badge.className = 'ps-badge ps-badge-active';
                badge.innerHTML = '<div class="ps-dot"></div><span>Active</span>';
            }
            if (btn) btn.textContent = 'Manage →';
            const m = data.data.paymentMethod;
            if (sub) {
                if (m === 'bank')    sub.textContent = `Bank a/c ****${data.data.bankAccountLast4 || '****'} · ${data.data.ifsc || ''} · Parents can pay online`;
                else if (m === 'upi') sub.textContent = `UPI: ${data.data.upiId} · Parents can pay fees online`;
                else                 sub.textContent = 'Payment setup complete · Parents can pay fees online';
            }
            hideSRBanner();
        } else {
            card.classList.add('ps-warning');
            if (badge) {
                badge.className = 'ps-badge ps-badge-warning';
                badge.innerHTML = '<div class="ps-dot"></div><span>Not Set Up</span>';
            }
            if (btn) btn.textContent = 'Setup Now →';
            if (sub) sub.textContent = 'Parents cannot pay online until you add a bank account or UPI ID';
            
            setTimeout(() => {
                if (hasFeeSubscription && !isDismissed()) showSRBanner();
            }, 600);
        }
    } catch(err) {
        if (badge) {
            badge.className = 'ps-badge ps-badge-default';
            badge.innerHTML = '<div class="ps-dot"></div><span>Setup</span>';
        }
        if (btn) btn.textContent = 'Setup →';
        console.warn('Payment setup fetch failed:', err.message);
    }
}

function showSRBanner() {
    const banner = document.getElementById('setup-required-banner');
    if (banner) banner.style.display = 'block';
}
function hideSRBanner() {
    const banner = document.getElementById('setup-required-banner');
    if (banner) banner.style.display = 'none';
}
function dismissSetupBanner() {
    hideSRBanner();
    sessionStorage.setItem('srbDismissed', '1');
}
function isDismissed() {
    return sessionStorage.getItem('srbDismissed') === '1';
}

// ─────────────────────────────────────────────
// PREMIUM MODAL
// ─────────────────────────────────────────────
function openPremiumModal()  { document.getElementById('premium-modal')?.classList.add('show'); document.body.style.overflow = 'hidden'; }
function closePremiumModal() { document.getElementById('premium-modal')?.classList.remove('show'); document.body.style.overflow = ''; }

document.addEventListener('click', function(e) {
    const modal = document.getElementById('premium-modal');
    if (modal && e.target === modal) closePremiumModal();
});

async function goToFeature(feature) {
    closePremiumModal();
    if (feature === 'bundle') { window.location.href = 'premium-payment.html?plan=bundle'; return; }
    try {
        const token = localStorage.getItem('token') || localStorage.getItem('institutionToken');
        const res  = await fetch(`${API_BASE_URL}/subscription/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        const sub  = data?.data;
        const ok   = sub && sub.isActive && !sub.isExpired && (sub.plan === feature || sub.plan === 'bundle');
        if (ok)                     window.location.href = feature === 'fee' ? 'fee-management.html' : 'icard-management.html';
        else if (sub && sub.isExpired) window.location.href = `premium-payment.html?plan=${sub.plan}`;
        else                        window.location.href = `premium-payment.html?plan=${feature}`;
    } catch(err) { window.location.href = `premium-payment.html?plan=${feature}`; }
}

// ─────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────
function showLoadingSkeletons() { document.querySelectorAll('.stat-card p').forEach(c => { c.classList.add('loading-skeleton'); c.textContent = '...'; }); }
function hideLoadingSkeletons() { document.querySelectorAll('.stat-card p').forEach(c => c.classList.remove('loading-skeleton')); }
function displayLogo(logo) { const img = document.getElementById('institution-logo'); if (logo && img) { img.src = logo; img.style.display = 'block'; img.onerror = function() { this.style.display = 'none'; }; } }
function displayProfileDetails(data) {
    const safe = (id, val, f = '-') => { const el = document.getElementById(id); if (el) el.textContent = val ?? f; };
    safe('inst-code', data.institutionCode); safe('inst-name', data.name);
    let t = data.type || '-'; if (data.displayType) t = data.displayType; else if (data.type === 'Other' && data.customType) t = data.customType;
    safe('inst-type', t); safe('inst-current-year', data.currentAcademicYear || '-');
    if (data.address) { safe('inst-state', data.address.state); safe('inst-district', data.address.district); safe('inst-city', data.address.city); }
    if (data.contacts) { safe('inst-mobile1', data.contacts.mobile1); safe('inst-mobile2', data.contacts.mobile2); safe('inst-email', data.contacts.email); }
}
function displayLastLogin(lastLogin) {
    const el = document.getElementById('inst-last-login'); if (!el) return;
    if (lastLogin) { try { const d = new Date(lastLogin); el.textContent = isNaN(d.getTime()) ? 'Invalid date' : d.toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { el.textContent = 'Invalid date'; } }
    else el.textContent = 'First login';
}
function displayStatistics(stats) {
    if (!stats) return;
    const s = (id, v) => { const el = document.getElementById(id); if (el) animateValue(el, 0, isNaN(Number(v)) ? 0 : Number(v), 1000); };
    s('stat-staff', stats.totalStaff); s('stat-classes', stats.totalClasses); s('stat-subjects', stats.totalSubjects); s('stat-students', stats.totalStudents);
}
function animateValue(element, start, end, duration) {
    if (!element) return;
    const range = end - start, incr = range / (duration / 16); let cur = start;
    const t = setInterval(() => { cur += incr; if ((incr >= 0 && cur >= end) || (incr < 0 && cur <= end) || incr === 0) { cur = end; clearInterval(t); } element.textContent = Math.floor(cur).toString(); }, 16);
}
function animateStatsCards() { document.querySelectorAll('.stat-card').forEach((c, i) => setTimeout(() => { c.style.animation = 'fadeInUp 0.6s ease-out'; }, i * 100)); }

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function goToPart1()          { window.location.href = 'part1-basic-info.html'; }
function goToPart2()          { window.location.href = 'part2-mapping.html'; }
function goToPart3()          { window.location.href = 'part3-credentials.html'; }
function goToPromotion()      { window.location.href = 'promotion.html'; }
function goToDataManagement() { window.location.href = 'data-management.html'; }
function goToPaymentSetup()   { window.location.href = 'payment-setup.html'; }

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function showLoading(msg = 'Loading...') { const l = document.getElementById('loading'), o = document.getElementById('message-overlay'); if (l) { l.textContent = msg; l.classList.add('show'); } if (o) o.classList.add('show'); }
function hideLoading() { document.getElementById('loading')?.classList.remove('show'); document.getElementById('message-overlay')?.classList.remove('show'); }
function showError(msg) { hideMessages(); const el = document.getElementById('error-message'); if (el) { el.textContent = msg; el.classList.add('show'); document.getElementById('message-overlay')?.classList.add('show'); setTimeout(hideMessages, 5000); } }
function showSuccess(msg) { hideMessages(); const el = document.getElementById('success-message'); if (el) { el.textContent = msg; el.classList.add('show'); document.getElementById('message-overlay')?.classList.add('show'); setTimeout(hideMessages, 3000); } }
function hideMessages() { ['error-message', 'success-message', 'loading'].forEach(id => document.getElementById(id)?.classList.remove('show')); document.getElementById('message-overlay')?.classList.remove('show'); }
function checkAuth() { if (!localStorage.getItem('token') && !localStorage.getItem('institutionToken')) { window.location.href = 'login.html'; return false; } return true; }
function logout() { if (confirm('Are you sure you want to logout?')) { localStorage.removeItem('token'); localStorage.removeItem('institutionToken'); localStorage.removeItem('userType'); localStorage.removeItem('institutionCode'); window.location.href = 'index.html'; } }

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
window.goToPaymentSetup   = goToPaymentSetup;
window.openPremiumModal   = openPremiumModal;
window.closePremiumModal  = closePremiumModal;
window.goToFeature        = goToFeature;
window.logout             = logout;

console.log('✅ Dashboard loaded');