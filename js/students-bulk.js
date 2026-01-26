// students-bulk.js - Bulk Upload Students with Excel

// Download Excel Template
function downloadStudentTemplate() {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create template data
    const templateData = [
        ['Name', 'Father Name', 'Mobile No'],
        ['John Doe', 'Robert Doe', '9876543210'],
        ['Jane Smith', 'Michael Smith', '9876543211'],
        ['Alex Johnson', 'David Johnson', '9876543212']
    ];
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 15 }
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    
    // Generate and download file
    XLSX.writeFile(wb, 'Student_Upload_Template.xlsx');
    
    console.log('✅ Template downloaded');
}

// Parse Excel File
async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first sheet
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
                    header: 1,
                    defval: '' // Default value for empty cells
                });
                
                console.log('📊 Parsed Excel data:', jsonData);
                
                resolve(jsonData);
            } catch (error) {
                console.error('❌ Parse error:', error);
                reject(error);
            }
        };
        
        reader.onerror = function(error) {
            console.error('❌ File read error:', error);
            reject(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// Validate Student Data
function validateStudentData(row, rowIndex) {
    const errors = [];
    
    // Ensure row has values
    if (!row || row.length === 0) {
        return { valid: false, errors: ['Empty row'] };
    }
    
    const name = row[0] ? String(row[0]).trim() : '';
    const fatherName = row[1] ? String(row[1]).trim() : '';
    const mobileNo = row[2] ? String(row[2]).trim() : '';
    
    // Validate Name
    if (!name || name.length === 0) {
        errors.push('Name is required');
    }
    
    // Validate Father Name
    if (!fatherName || fatherName.length === 0) {
        errors.push('Father name is required');
    }
    
    // Validate Mobile
    if (!mobileNo || mobileNo.length === 0) {
        errors.push('Mobile number is required');
    } else {
        // Clean mobile number
        const cleanedMobile = mobileNo.replace(/\D/g, '');
        if (cleanedMobile.length !== 10) {
            errors.push('Mobile must be 10 digits');
        } else if (!/^[6-9]/.test(cleanedMobile)) {
            errors.push('Mobile must start with 6-9');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors: errors,
        data: {
            name: name,
            fatherName: fatherName,
            mobileNo: mobileNo.replace(/\D/g, '')
        }
    };
}

// Process and Upload Students
async function processAndUploadStudents(excelData, classId) {
    const results = {
        total: 0,
        successful: 0,
        failed: 0,
        errors: []
    };
    
    // Skip header row (index 0)
    const dataRows = excelData.slice(1);
    
    console.log(`📊 Processing ${dataRows.length} rows...`);
    
    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNumber = i + 2; // +2 because: +1 for array index, +1 for header row
        
        // Skip completely empty rows
        const hasData = row.some(cell => cell && String(cell).trim().length > 0);
        if (!hasData) {
            console.log(`⏭️ Skipping empty row ${rowNumber}`);
            continue;
        }
        
        results.total++;
        
        // Validate data
        const validation = validateStudentData(row, rowNumber);
        
        if (!validation.valid) {
            results.failed++;
            results.errors.push({
                row: rowNumber,
                errors: validation.errors
            });
            console.error(`❌ Row ${rowNumber} validation failed:`, validation.errors);
            continue;
        }
        
        // Try to upload
        try {
            const studentData = {
                name: validation.data.name,
                fatherName: validation.data.fatherName,
                classId: classId,
                mobileNo: validation.data.mobileNo
            };
            
            console.log(`📤 Uploading student from row ${rowNumber}:`, studentData);
            
            const response = await apiPost(API_ENDPOINTS.STUDENTS, studentData, true);
            
            if (response.success) {
                results.successful++;
                console.log(`✅ Row ${rowNumber} uploaded successfully`);
            } else {
                results.failed++;
                results.errors.push({
                    row: rowNumber,
                    errors: [response.message || 'Upload failed']
                });
                console.error(`❌ Row ${rowNumber} upload failed:`, response.message);
            }
            
        } catch (error) {
            results.failed++;
            results.errors.push({
                row: rowNumber,
                errors: [error.message]
            });
            console.error(`❌ Row ${rowNumber} error:`, error);
        }
    }
    
    return results;
}

// Handle Bulk Upload Form Submission
async function handleBulkUpload(e) {
    e.preventDefault();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 BULK UPLOAD STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const classId = document.getElementById('bulk-class-select').value;
    const fileInput = document.getElementById('student-file');
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
    
    try {
        // Show loading
        showLoading('Reading Excel file...');
        
        // Parse Excel
        const excelData = await parseExcelFile(file);
        
        if (!excelData || excelData.length <= 1) {
            hideLoading();
            showError('Excel file is empty or has no data rows');
            return;
        }
        
        // Update loading message
        showLoading(`Processing ${excelData.length - 1} students...`);
        
        // Process and upload
        const results = await processAndUploadStudents(excelData, classId);
        
        hideLoading();
        
        // Show results in modal
        showUploadResultsModal(results);
        
        // Reset form
        document.getElementById('bulk-upload-form').reset();
        
        // Reload students list
        if (results.successful > 0) {
            loadStudents();
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

// Show Upload Results Modal
function showUploadResultsModal(results) {
    // Create modal HTML
    const modalHTML = `
        <div id="upload-results-modal" class="upload-modal-overlay">
            <div class="upload-modal-content">
                <div class="upload-modal-header">
                    <h3>📊 Upload Results</h3>
                </div>
                
                <div class="upload-modal-body">
                    <div class="upload-stats">
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
                            <div class="stat-label">Failed</div>
                        </div>
                    </div>
                    
                    ${results.errors.length > 0 ? `
                        <div class="upload-errors">
                            <h4>❌ Errors:</h4>
                            <div class="errors-list">
                                ${results.errors.map(err => `
                                    <div class="error-item">
                                        <strong>Row ${err.row}:</strong> ${err.errors.join(', ')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="upload-modal-footer">
                    <button class="btn-primary" onclick="closeUploadResultsModal()">OK</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('upload-results-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Close Upload Results Modal
function closeUploadResultsModal() {
    const modal = document.getElementById('upload-results-modal');
    if (modal) {
        modal.remove();
    }
}

console.log('✅ students-bulk.js loaded successfully');