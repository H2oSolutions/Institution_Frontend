// config-v2.js - API Configuration with Level-Designation Mapping Endpoint

  const API_BASE_URL = 'https://institution-backend-kkw8.onrender.com/api';

 //  const API_BASE_URL = 'http://localhost:5000/api';                   // Turn this on for the local development environment and turn off the above line

const API_ENDPOINTS = {
    // ===== INSTITUTION ===== 
    INSTITUTION_REGISTER: `${API_BASE_URL}/auth/register`,
    INSTITUTION_LOGIN: `${API_BASE_URL}/auth/institution/login`,
    INSTITUTION_VERIFY_OTP: `${API_BASE_URL}/auth/verify-otp`,
    INSTITUTION_RESEND_OTP: `${API_BASE_URL}/auth/resend-otp`,
    INSTITUTION_SET_PASSWORD: `${API_BASE_URL}/auth/set-password`,
    INSTITUTION_PROFILE: `${API_BASE_URL}/institution/profile`,
    INSTITUTION_UPDATE: `${API_BASE_URL}/institution/update`,
    INSTITUTION_FORGOT_PASSWORD: `${API_BASE_URL}/auth/forgot-password`,
    INSTITUTION_VERIFY_RESET_OTP: `${API_BASE_URL}/auth/verify-reset-otp`,
    INSTITUTION_RESET_PASSWORD: `${API_BASE_URL}/auth/reset-password`,

    // ===== STAFF ===== 
    STAFF: `${API_BASE_URL}/staff`,
    STAFF_LOGIN: `${API_BASE_URL}/auth/staff/login`,
    STAFF_PROFILE: `${API_BASE_URL}/staff/profile`,

    // ===== STUDENTS =====
    STUDENTS: `${API_BASE_URL}/students`,
    STUDENTS_BY_CLASS: `${API_BASE_URL}/students/by-class`,
    STUDENTS_BULK_UPLOAD: `${API_BASE_URL}/students/bulk-upload`,
    STUDENTS_DOWNLOAD_TEMPLATE: `${API_BASE_URL}/students/download-template`,

    // ===== CLASSES =====
    CLASSES: `${API_BASE_URL}/classes`,
    
    // ===== SUBJECTS =====
    SUBJECTS: `${API_BASE_URL}/subjects`,
    
    // ===== DESIGNATIONS =====
    DESIGNATIONS: `${API_BASE_URL}/designations`,
    
    // ===== HIERARCHY (LEVELS) =====
    HIERARCHY: `${API_BASE_URL}/hierarchy`,

    // ===== MAPPINGS =====
    STAFF_CLASS_MAPPING: `${API_BASE_URL}/mappings/staff-class`,
    CLASS_SUBJECT_MAPPING: `${API_BASE_URL}/mappings/class-subject`,
    TEACHER_SUBJECT_MAPPING: `${API_BASE_URL}/mappings/teacher-subject`,
    LEVEL_DESIGNATION_MAPPING: `${API_BASE_URL}/mappings/level-designation`,
    ALL_MAPPINGS: `${API_BASE_URL}/mappings/all`,

    // ===== CREDENTIALS =====
    CREDENTIALS: `${API_BASE_URL}/credentials`,
    CREDENTIALS_TOGGLE_STATUS: `${API_BASE_URL}/credentials/toggle-status`,
    CREDENTIALS_UPDATE_PASSWORD: `${API_BASE_URL}/credentials/update-password`,

    // ===== ATTENDANCE =====
    ATTENDANCE: `${API_BASE_URL}/attendance`,
    ATTENDANCE_BY_CLASS: `${API_BASE_URL}/attendance/by-class`,
    ATTENDANCE_BY_STUDENT: `${API_BASE_URL}/attendance/by-student`,

    // ===== ASSIGNMENTS =====
    ASSIGNMENTS: `${API_BASE_URL}/assignments`,
    ASSIGNMENTS_BY_CLASS: `${API_BASE_URL}/assignments/by-class`,

    // ===== NOTICES =====
    NOTICES: `${API_BASE_URL}/notices`,
    NOTICES_BY_CLASS: `${API_BASE_URL}/notices/by-class`,

    // ===== COMPLAINTS =====
    COMPLAINTS: `${API_BASE_URL}/complaints`,
    COMPLAINTS_UPDATE_STATUS: `${API_BASE_URL}/complaints/update-status`,

    // ===== FEE NOTICES =====
    FEE_NOTICES: `${API_BASE_URL}/fee-notices`,
    FEE_NOTICES_BY_CLASS: `${API_BASE_URL}/fee-notices/by-class`,

    // ===== EXAMS =====
    EXAMS: `${API_BASE_URL}/exams`,
    EXAMS_BY_CLASS: `${API_BASE_URL}/exams/by-class`,

    // ===== TIMETABLE =====
    TIMETABLE: `${API_BASE_URL}/timetable`,
    TIMETABLE_BY_CLASS: `${API_BASE_URL}/timetable/by-class`
};

// Constants
const CONSTANTS = {
    TOKEN_KEY: 'institution_token',
    USER_TYPE_KEY: 'user_type',
    USER_TYPES: {
        INSTITUTION: 'institution',
        STAFF: 'staff',
        PARENT: 'parent'
    },
    
    // Indian States with Districts
    STATES_DISTRICTS: {
        'Uttarakhand': [
            'Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Dehradun',
            'Haridwar', 'Nainital', 'Pauri Garhwal', 'Pithoragarh',
            'Rudraprayag', 'Tehri Garhwal', 'Udham Singh Nagar', 'Uttarkashi'
        ],
        'Uttar Pradesh': [
            'Agra', 'Aligarh', 'Allahabad', 'Ambedkar Nagar', 'Amethi',
            'Amroha', 'Auraiya', 'Azamgarh', 'Baghpat', 'Bahraich',
            'Ballia', 'Balrampur', 'Banda', 'Barabanki', 'Bareilly',
            'Basti', 'Bhadohi', 'Bijnor', 'Budaun', 'Bulandshahr',
            'Chandauli', 'Chitrakoot', 'Deoria', 'Etah', 'Etawah',
            'Faizabad', 'Farrukhabad', 'Fatehpur', 'Firozabad', 'Gautam Buddha Nagar',
            'Ghaziabad', 'Ghazipur', 'Gonda', 'Gorakhpur', 'Hamirpur',
            'Hapur', 'Hardoi', 'Hathras', 'Jalaun', 'Jaunpur',
            'Jhansi', 'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar', 'Kasganj',
            'Kaushambi', 'Kushinagar', 'Lakhimpur Kheri', 'Lalitpur', 'Lucknow',
            'Maharajganj', 'Mahoba', 'Mainpuri', 'Mathura', 'Mau',
            'Meerut', 'Mirzapur', 'Moradabad', 'Muzaffarnagar', 'Pilibhit',
            'Pratapgarh', 'Raebareli', 'Rampur', 'Saharanpur', 'Sambhal',
            'Sant Kabir Nagar', 'Shahjahanpur', 'Shamli', 'Shravasti', 'Siddharthnagar',
            'Sitapur', 'Sonbhadra', 'Sultanpur', 'Unnao', 'Varanasi'
        ]
    },
    
    // Institution Types
    INSTITUTION_TYPES: [
        'School',
        'College',
        'University',
        'Institute',
        'Academy',
        'Coaching Center',
        'Training Center',
        'Custom (Specify)'
    ],
    
    // Access Levels
    ACCESS_LEVELS: {
        TEACHER: 'Teacher',
        COORDINATOR: 'Coordinator',
        ADMIN: 'Admin'
    }
};

console.log('✅ Config loaded - API Base URL:', API_BASE_URL);