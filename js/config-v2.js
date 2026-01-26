// js/config-v2.js - API Configuration

// ✅ Production Backend URL
const API_BASE_URL = 'https://institution-backend-kkw8.onrender.com/api';

// ✅ API Endpoints
const API_ENDPOINTS = {
    // Auth
    REGISTER: '/auth/register',
    VERIFY_OTP: '/auth/verify-otp',
    RESEND_OTP: '/auth/resend-otp',
    SET_PASSWORD: '/auth/set-password',
    INSTITUTION_LOGIN: '/auth/institution/login',
    STAFF_LOGIN: '/auth/staff/login',
    FORGOT_PASSWORD: '/auth/forgot-password',      
    RESET_PASSWORD: '/auth/reset-password',  
    
    // Dashboard
    DASHBOARD_STATS: '/dashboard/stats',
    
    // Designations
    DESIGNATIONS: '/designations',
    
    // Classes
    CLASSES: '/classes',
    
    // Staff
    STAFF: '/staff',
    STAFF_PROFILE: '/staff/profile',
    STAFF_ASSIGNMENTS: '/staff/assignments',
    
    // Subjects
    SUBJECTS: '/subjects',
    
    // Students
    STUDENTS: '/students',
    STUDENTS_BULK_UPLOAD: '/students/bulk-upload',  // ✅ FIXED: Changed from STUDENTS_BULK
    
    // Hierarchy
    HIERARCHY: '/hierarchy',
    
    // Mappings
    STAFF_CLASS_MAPPING: '/mappings/staff-class',
    CLASS_SUBJECT_MAPPING: '/mappings/class-subject',
    TEACHER_SUBJECT_MAPPING: '/mappings/teacher-subject',
    ALL_MAPPINGS: '/mappings/all',
    
    // Credentials
    CREDENTIALS: '/credentials',
    
    // Attendance
    ATTENDANCE: '/attendance',
    
    // Institution
    INSTITUTION_PROFILE: '/institution/profile'
};

// ✅ Indian States for Dropdown
const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

console.log('✅ Config loaded - API Base:', API_BASE_URL);