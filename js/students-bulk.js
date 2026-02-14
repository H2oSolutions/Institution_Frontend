// students-bulk.js - COMPLETE VERSION WITH 3 NEW OPTIONAL FIELDS

// Download Excel Template - ✅ UPDATED with 3 new columns
function downloadStudentTemplate() {
    const wb = XLSX.utils.book_new();
    
    // ✅ UPDATED: Template now includes Mother Name, DOB, and Address
    const templateData = [
        ['Name', 'Father Name', 'Mother Name', 'Mobile No', 'DOB', 'Address'],
        ['John Doe', 'Robert Doe', 'Jane Doe', '9876543210', '2010-05-15', '123 Main Street, City'],
        ['Jane Smith', 'Michael Smith', 'Sarah Smith', '9876543211', '2011-08-20', '456 Park Avenue, Town'],
        ['Alex Johnson', 'David Johnson', 'Mary Johnson', '9876543212', '2012-03-10', '789 Oak Road, Village']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // ✅ UPDATED: Column widths for 6 columns
    ws['!cols'] = [
        { wch: 20 },  // Name
        { wch: 20 },  // Father Name
        { wch: 20 },  // Mother Name
        { wch: 15 },  // Mobile No
        { wch: 15 },  // DOB
        { wch: 40 }   // Address
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'Student_Upload_Template.xlsx');
    
    console.log('✅ Template downloaded with 6 columns');
    showSuccess('Template downloaded! Fill in student details (Mother Name, DOB, and Address are optional)');
}

// Handle Bulk Upload Form Submission
async function handleBulkUpload(e) {
    e.preventDefault();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 BULK UPLOAD STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const classSelect = document.getElementById('bulk-class-select');
    const fileInput = document.getElementById('student-file');
    
    if (!classSelect || !fileInput) {
        showError('Form elements not found');
        return;
    }
    
    const classId = classSelect.value;
    const file = fileInput.files[0];
    
    // Validation
    if (!classId) {
        showError('Please select a class');
        return;
    }
    
    if (!file) {
        showError('Please select an Excel file');
        return;
    }
    
    // Check file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        showError('Please upload only Excel files (.xlsx or .xls)');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }
    
    try {
        showLoading('Uploading students...');
        
        // Create FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('classId', classId);
        
        console.log('📤 Uploading file:', file.name);
        console.log('📤 Class ID:', classId);
        
        // Upload using backend endpoint
        const response = await apiPostFormData(API_ENDPOINTS.STUDENTS_BULK_UPLOAD, formData, true);
        
        hideLoading();
        
        console.log('📊 Upload response:', response);
        
        if (response.success) {
            const stats = response.stats || {};
            
            // Get class name for display
            const selectedClassEl = document.getElementById('bulk-class-select');
            const className = selectedClassEl.options[selectedClassEl.selectedIndex].text;
            
            // Show detailed results modal
            showBulkUploadResultsModal({
                className: className,
                total: stats.total || 0,
                successful: stats.successful || 0,
                failed: stats.failed || 0,
                totalInClass: stats.totalInClass || 0,
                errors: stats.errors || [],
                successMessage: response.message || 'Upload completed'
            });
            
            // Reset form
            document.getElementById('bulk-upload-form').reset();
            
            // Reload data only if successful
            if (stats.successful > 0) {
                console.log('♻️ Reloading student data...');
                setTimeout(async () => {
                    await loadStudents();
                    await loadClasses();
                    await loadClassStatistics();
                }, 500);
            }
        } else {
            showError(response.message || 'Upload failed');
        }
        
    } catch (error) {
        hideLoading();
        console.error('💥 Bulk upload error:', error);
        showError('Upload failed: ' + error.message);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 BULK UPLOAD COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Show Detailed Bulk Upload Results Modal
function showBulkUploadResultsModal(results) {
    console.log('📊 Showing detailed upload results:', results);
    
    const modal = document.getElementById('upload-results-modal');
    const modalTitle = document.getElementById('upload-modal-title');
    const statsContainer = document.getElementById('upload-stats-container');
    const successListContainer = document.getElementById('success-list-container');
    const errorsContainer = document.getElementById('upload-errors-container');
    const errorsList = document.getElementById('errors-list');
    
    if (!modal || !statsContainer) {
        console.error('❌ Upload results modal elements not found');
        return;
    }
    
    // Set title
    if (modalTitle) {
        modalTitle.textContent = `Upload Results - ${results.className || 'Class'}`;
    }
    
    // Build stats HTML
    let statsHTML = `
        <div class="stat-card total">
            <div class="stat-number">${results.total}</div>
            <div class="stat-label">Total Processed</div>
        </div>
        <div class="stat-card success">
            <div class="stat-number">${results.successful}</div>
            <div class="stat-label">Successfully Added</div>
        </div>
        <div class="stat-card failed">
            <div class="stat-number">${results.failed}</div>
            <div class="stat-label">Failed/Skipped</div>
        </div>
        <div class="stat-card class-total">
            <div class="stat-number">${results.totalInClass}</div>
            <div class="stat-label">Total in Class Now</div>
        </div>
    `;
    
    statsContainer.innerHTML = statsHTML;
    
    // Show success message if provided
    if (results.successMessage && successListContainer) {
        successListContainer.style.display = 'block';
        successListContainer.innerHTML = `
            <div style="background: #d1fae5; padding: 16px; border-radius: 12px; border-left: 4px solid #10b981; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 8px; color: #065f46; font-weight: 600;">
                    <span style="font-size: 20px;">✅</span>
                    <span>${results.successMessage}</span>
                </div>
                ${results.successful > 0 ? `
                    <div style="margin-top: 12px; color: #047857; font-size: 14px;">
                        ${results.successful} student${results.successful > 1 ? 's' : ''} successfully added to ${results.className}
                    </div>
                ` : ''}
            </div>
        `;
    } else if (successListContainer) {
        successListContainer.style.display = 'none';
    }
    
    // Show errors if any
    if (results.errors && Array.isArray(results.errors) && results.errors.length > 0) {
        if (errorsContainer && errorsList) {
            errorsContainer.style.display = 'block';
            errorsList.innerHTML = results.errors.map(err => {
                const rowNum = err.row || 'N/A';
                const message = err.message || err.error || String(err);
                
                return `
                    <div class="error-item">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <span style="color: #dc2626; font-weight: 700; font-size: 16px;">❌</span>
                            <div style="flex: 1;">
                                <strong style="color: #991b1b;">Row ${rowNum}:</strong>
                                <span style="color: #374151; margin-left: 8px;">${message}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } else {
        if (errorsContainer) {
            errorsContainer.style.display = 'none';
        }
    }
    
    // Show modal
    modal.classList.add('show');
    console.log('✅ Detailed upload results modal displayed');
}

// Close Upload Modal
function closeUploadModal() {
    const modal = document.getElementById('upload-results-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Close modal when clicking outside
window.addEventListener('click', function(e) {
    const modal = document.getElementById('upload-results-modal');
    if (e.target === modal) {
        closeUploadModal();
    }
});

console.log('✅ students-bulk.js loaded successfully with 3 new optional fields');