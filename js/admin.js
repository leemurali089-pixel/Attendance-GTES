// Admin Panel Module
const AdminModule = {
    backupFileHandle: null,

    load() {
        this.renderAdminPanel();
    },

    renderAdminPanel() {
        const view = document.getElementById('adminView');
        if (!view) return;

        const settings = DataManager.getSettings();
        const employees = DataManager.getEmployees();
        const activeEmployees = DataManager.getActiveEmployees();
        const baseSalaries = settings.baseSalaries || {};

        // Get base salaries from employee records or settings
        const employeeSalaries = {};
        employees.forEach(emp => {
            employeeSalaries[emp.name] = emp.baseSalary || baseSalaries[emp.name] || 0;
        });

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Admin Panel - System Management</h2>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Salary Settings</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label for="otCalculationMethod" class="form-label">OT Calculation Method *</label>
                                <select class="form-select" id="otCalculationMethod" onchange="AdminModule.toggleOTRateField()">
                                    <option value="salaryBased" ${(settings.otCalculationMethod || 'salaryBased') === 'salaryBased' ? 'selected' : ''}>
                                        Based on Salary (Per Hour Salary = Basic Salary ÷ 30 ÷ 8)
                                    </option>
                                    <option value="fixedRate" ${settings.otCalculationMethod === 'fixedRate' ? 'selected' : ''}>
                                        Fixed Rate (Same for all employees)
                                    </option>
                                </select>
                                <small class="form-text text-muted">
                                    <strong>Salary Based:</strong> OT Pay = OT Hours × (Basic Salary ÷ 30 ÷ 8)<br>
                                    <strong>Fixed Rate:</strong> OT Pay = OT Hours × Fixed Rate
                                </small>
                            </div>
                            <div class="mb-3" id="otRateContainer" style="display: ${settings.otCalculationMethod === 'fixedRate' ? 'block' : 'none'};">
                                <label for="otRate" class="form-label">Fixed OT Rate (₹ per hour)</label>
                                <input type="number" class="form-control" id="otRate" 
                                       value="${settings.otRate || DataManager.DEFAULT_SETTINGS.otRate}" 
                                       step="0.01" min="0">
                                <small class="form-text text-muted">This rate will be applied to all employees regardless of their salary</small>
                            </div>
                            <button class="btn btn-primary" onclick="AdminModule.saveSettings()">Save Settings</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Change Admin Password</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label for="oldPassword" class="form-label">Current Password</label>
                                <input type="password" class="form-control" id="oldPassword">
                            </div>
                            <div class="mb-3">
                                <label for="newPassword" class="form-label">New Password</label>
                                <input type="password" class="form-control" id="newPassword" minlength="4">
                            </div>
                            <button class="btn btn-primary" onclick="AdminModule.changePassword()">Change Password</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Basic Salary Management</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>EMPLOYEE</th>
                                            <th>BASIC SALARY</th>
                                            <th>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${activeEmployees.map(emp => `
                                            <tr>
                                                <td>${emp.name}</td>
                                                <td>₹${emp.baseSalary.toFixed(2)}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-primary" onclick="AdminModule.editBaseSalary('${emp.name.replace(/'/g, "\\'")}', ${emp.baseSalary})">
                                                        <i class="bi bi-pencil"></i> Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            <div class="row">
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Salary Management</h5>
                        </div>
                        <div class="card-body">
                            <p>Manage salary payouts and calculations</p>
                            <div class="d-grid gap-2">
                                <button class="btn btn-primary" onclick="App.showView('salary')">
                                    <i class="bi bi-calculator"></i> Go to Salary Calculation
                                </button>
                                <button class="btn btn-secondary" onclick="SalaryModule.generateSalaryPayout()">
                                    <i class="bi bi-cash-stack"></i> Generate Salary Payout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Backup & Export</h5>
                        </div>
                        <div class="card-body">
                            <p>Export all data to Excel/CSV for backup</p>
                            <button class="btn btn-success mb-2" onclick="AdminModule.exportBackup()">
                                <i class="bi bi-download"></i> Export Backup
                            </button>
                            <hr>
                            <p>Import data from backup file</p>
                            <input type="file" class="form-control mb-2" id="importFile" accept=".json,.csv">
                            <button class="btn btn-warning" onclick="AdminModule.importBackup()">
                                <i class="bi bi-upload"></i> Import Backup
                            </button>
                            <div class="alert alert-warning mt-3">
                                <small><strong>Warning:</strong> Importing will overwrite existing data. Make sure to backup first.</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5>Import Data (CSV)</h5>
                        </div>
                        <div class="card-body">
                            <ul class="nav nav-tabs mb-3" id="importTabs" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" id="emp-import-tab" data-bs-toggle="tab" data-bs-target="#emp-import" type="button" role="tab">Employees</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" id="att-import-tab" data-bs-toggle="tab" data-bs-target="#att-import" type="button" role="tab">Attendance</button>
                                </li>
                            </ul>
                            <div class="tab-content" id="importTabsContent">
                                <div class="tab-pane fade show active" id="emp-import" role="tabpanel">
                                    <p class="small text-muted">Import employees from Google Sheets/Excel.</p>
                                    <button class="btn btn-sm btn-outline-primary mb-3" onclick="AdminModule.downloadTemplate('employees')">
                                        <i class="bi bi-file-earmark-spreadsheet"></i> Download Template
                                    </button>
                                    <div class="mb-3">
                                        <label for="importEmployeesFile" class="form-label">Upload CSV File</label>
                                        <input type="file" class="form-control" id="importEmployeesFile" accept=".csv">
                                    </div>
                                    <button class="btn btn-primary w-100" onclick="AdminModule.triggerImport('employees')">
                                        <i class="bi bi-cloud-upload"></i> Import Employees
                                    </button>
                                </div>
                                <div class="tab-pane fade" id="att-import" role="tabpanel">
                                    <p class="small text-muted">Import attendance records.</p>
                                    <button class="btn btn-sm btn-outline-primary mb-3" onclick="AdminModule.downloadTemplate('attendance')">
                                        <i class="bi bi-file-earmark-spreadsheet"></i> Download Template
                                    </button>
                                    <div class="mb-3">
                                        <label for="importAttendanceFile" class="form-label">Upload CSV File</label>
                                        <input type="file" class="form-control" id="importAttendanceFile" accept=".csv">
                                    </div>
                                    <button class="btn btn-primary w-100" onclick="AdminModule.triggerImport('attendance')">
                                        <i class="bi bi-cloud-upload"></i> Import Attendance
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-12 mb-4">
                    ${EmployeesModule.getAdminTableHTML()}
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>System Information</h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-3">
                                    <strong>Total Employees:</strong> ${employees.length}
                                </div>
                                <div class="col-md-3">
                                    <strong>Total Attendance Records:</strong> ${DataManager.getAttendance().length}
                                </div>
                                <div class="col-md-3">
                                    <strong>Total Holidays:</strong> ${DataManager.getHolidays().length}
                                </div>
                                <div class="col-md-3">
                                    <strong>Total Advances:</strong> ${DataManager.getAdvances().length}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="baseSalaryModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Set Basic Salary</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="baseSalaryForm">
                                <input type="hidden" id="baseSalaryEmployeeName">
                                <div class="mb-3">
                                    <label for="baseSalaryAmount" class="form-label">Basic Salary (₹) *</label>
                                    <input type="number" class="form-control" id="baseSalaryAmount" step="0.01" min="0" required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="AdminModule.saveBaseSalary()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize modal
        const modalElement = document.getElementById('baseSalaryModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }

        // Initialize Employee Modal if present (it's injected via getAdminTableHTML)
        EmployeesModule.initializeModal();
        EmployeesModule.attachViewDetailsListeners();
    },

    toggleOTRateField() {
        const method = document.getElementById('otCalculationMethod').value;
        const otRateContainer = document.getElementById('otRateContainer');
        if (otRateContainer) {
            otRateContainer.style.display = method === 'fixedRate' ? 'block' : 'none';
        }
    },

    saveSettings() {
        const otCalculationMethod = document.getElementById('otCalculationMethod').value;
        const otRate = parseFloat(document.getElementById('otRate').value);

        if (!otCalculationMethod) {
            App.showNotification('Please select OT calculation method', 'error');
            return;
        }

        if (otCalculationMethod === 'fixedRate') {
            if (isNaN(otRate) || otRate < 0) {
                App.showNotification('Please enter a valid fixed OT rate', 'error');
                return;
            }
        }

        const settings = DataManager.getSettings();
        settings.otCalculationMethod = otCalculationMethod;
        if (otCalculationMethod === 'fixedRate') {
            settings.otRate = otRate;
        }
        DataManager.saveSettings(settings);
        App.showNotification('Settings saved successfully', 'success');

        // Refresh salary view if it's open
        if (App.currentView === 'salary') {
            SalaryModule.load();
        }
    },

    changePassword() {
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;

        const result = AuthManager.changePassword(oldPassword, newPassword);
        if (result.success) {
            App.showNotification(result.message, 'success');
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
        } else {
            App.showNotification(result.message, 'error');
        }
    },

    editBaseSalary(employeeName, currentSalary) {
        document.getElementById('baseSalaryEmployeeName').value = employeeName;
        document.getElementById('baseSalaryAmount').value = currentSalary || '';
        if (this.modal) {
            this.modal.show();
        }
    },

    saveBaseSalary() {
        const employeeName = document.getElementById('baseSalaryEmployeeName').value;
        const baseSalary = parseFloat(document.getElementById('baseSalaryAmount').value);

        if (!employeeName || isNaN(baseSalary) || baseSalary < 0) {
            App.showNotification('Please enter a valid basic salary', 'error');
            return;
        }

        const settings = DataManager.getSettings();
        if (!settings.baseSalaries) {
            settings.baseSalaries = {};
        }
        settings.baseSalaries[employeeName] = baseSalary;
        DataManager.saveSettings(settings);

        this.modal.hide();
        this.renderAdminPanel();
        App.showNotification('Basic salary saved successfully', 'success');
    },

    async exportBackup() {
        const data = DataManager.exportAllData();
        const fy = DataManager.getFinancialYear();
        const filename = `Attendance_Backup_Apr-${fy.startYear}-Mar-${fy.endYear}.json`;

        try {
            const content = JSON.stringify(data, null, 2);
            const saved = await this.tryNativeFileSave(content, filename);
            if (!saved) {
                this.triggerFileDownload(content, filename);
            }
            App.showNotification('Backup exported successfully', 'success');
        } catch (error) {
            console.error('Backup export error:', error);
            App.showNotification('Error exporting backup: ' + error.message, 'error');
        }
    },

    async tryNativeFileSave(content, suggestedName) {
        if (!window.showSaveFilePicker) {
            return false;
        }

        try {
            const handle = await this.ensureBackupFileHandle(suggestedName);
            if (!handle) {
                return false;
            }
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (error) {
            console.warn('Native save failed, falling back to download:', error);
            this.backupFileHandle = null;
            return false;
        }
    },

    async ensureBackupFileHandle(suggestedName) {
        if (this.backupFileHandle) {
            const permission = await this.backupFileHandle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                return this.backupFileHandle;
            }
            this.backupFileHandle = null;
        }

        try {
            this.backupFileHandle = await window.showSaveFilePicker({
                suggestedName,
                types: [
                    {
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            });
            return this.backupFileHandle;
        } catch (error) {
            console.warn('User cancelled save picker or permission denied:', error);
            return null;
        }
    },

    triggerFileDownload(content, filename, mimeType = 'application/json') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importBackup(file) {
        let selectedFile = file;
        let fileInput = null;

        if (!selectedFile) {
            fileInput = document.getElementById('importFile');
            selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
        }

        if (!selectedFile) {
            App.showNotification('Please select a file to import', 'error');
            return;
        }

        if (!App.confirmAction('This will overwrite all existing data. Are you sure you want to continue?')) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                DataManager.importData(data);
                App.showNotification('Backup imported successfully', 'success');
                if (fileInput) {
                    fileInput.value = '';
                }
                // Reload current view
                if (App.currentView) {
                    App.showView(App.currentView);
                }
            } catch (error) {
                App.showNotification('Error importing backup: ' + error.message, 'error');
            }
        };
        reader.readAsText(selectedFile);
    },

    downloadTemplate(type) {
        let data = [];
        let filename = '';

        if (type === 'employees') {
            data = [
                ['Employee ID', 'Name', 'Date of Joining (YYYY-MM-DD)', 'Salary Type (Monthly/Daily)', 'Basic Salary', 'ID Proof Type', 'ID Proof Number', 'Date of Resign (YYYY-MM-DD)'],
                ['EMP001', 'John Doe', '2024-01-15', 'Monthly', 25000, 'Aadhar Card', '123456789012', '']
            ];
            filename = 'employees_template.xlsx';
        } else if (type === 'attendance') {
            data = [
                ['Employee Name', 'Date (YYYY-MM-DD)', 'Status (Present/Paid Leave/Unpaid Leave/Sick Leave/Half Day/Holiday/H-Working)', 'In Time (HH:MM)', 'Out Time (HH:MM)', 'Over Time (No/Yes/H-Working)'],
                ['John Doe', '2024-11-01', 'Present', '09:00', '18:00', 'No']
            ];
            filename = 'attendance_template.xlsx';
        }

        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(data);

            // Set column widths for better readability
            const wscols = data[0].map(() => ({ wch: 25 }));
            ws['!cols'] = wscols;

            XLSX.utils.book_append_sheet(wb, ws, "Template");
            XLSX.writeFile(wb, filename);
        } catch (error) {
            console.error('Template Generation Error:', error);
            App.showNotification('Error generating template: ' + error.message, 'error');
        }
    },

    triggerImport(type) {
        const fileInput = document.getElementById(type === 'employees' ? 'importEmployeesFile' : 'importAttendanceFile');
        // Accept CSV and Excel files
        fileInput.setAttribute('accept', '.csv, .xlsx, .xls');
        const file = fileInput.files[0];

        if (!file) {
            App.showNotification('Please select a file first', 'error');
            return;
        }

        this.processFile(file, type);
    },

    processFile(file, type) {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            this.processCSV(file, type);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            this.processExcel(file, type);
        } else {
            App.showNotification('Unsupported file format. Please use CSV or Excel.', 'error');
        }
    },

    processExcel(file, type) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON with raw values to preserve dates if possible, but we might need to format them
                // Using {raw: false} forces everything to strings which matches CSV behavior better for our parser
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' });

                if (jsonData.length === 0) {
                    throw new Error('No data found in Excel file');
                }

                this.handleImportData(jsonData, type);

            } catch (error) {
                console.error('Excel Import Error:', error);
                App.showNotification('Error importing Excel: ' + error.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    processCSV(file, type) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const data = this.parseCSV(text);
                this.handleImportData(data, type);
            } catch (error) {
                console.error('CSV Import Error:', error);
                App.showNotification('Error importing CSV: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    },

    handleImportData(data, type) {
        if (data.length === 0) {
            throw new Error('No data found');
        }

        let count = 0;
        if (type === 'employees') {
            count = this.processEmployees(data);
        } else if (type === 'attendance') {
            count = this.processAttendance(data);
        }

        App.showNotification(`Successfully imported ${count} records`, 'success');

        // Clear input
        const fileInput = document.getElementById(type === 'employees' ? 'importEmployeesFile' : 'importAttendanceFile');
        fileInput.value = '';

        // Refresh view
        this.renderAdminPanel();
    },

    parseCSV(text) {
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            // Handle quotes (simple implementation)
            const row = [];
            let inQuote = false;
            let currentVal = '';

            for (let char of lines[i]) {
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    row.push(currentVal.trim());
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            row.push(currentVal.trim());

            if (row.length === headers.length) {
                const obj = {};
                headers.forEach((h, index) => {
                    obj[h] = row[index];
                });
                result.push(obj);
            }
        }
        return result;
    },

    parseImportDate(dateInput) {
        if (!dateInput) return null;

        // Handle Excel serial date (number)
        if (typeof dateInput === 'number') {
            // Excel base date is Dec 30, 1899
            const excelBaseDate = new Date(1899, 11, 30);
            const date = new Date(excelBaseDate.getTime() + dateInput * 24 * 60 * 60 * 1000);
            return DataManager.formatDate(date);
        }

        const dateStr = String(dateInput).trim();
        if (!dateStr) return null;

        // Handle DD-MM-YYYY or DD/MM/YYYY
        if (dateStr.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
            const parts = dateStr.split(/[-/]/);
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }

        // Handle YYYY-MM-DD (already correct)
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateStr;
        }

        // Try parsing standard date string
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return DataManager.formatDate(date);
        }

        return null;
    },

    processEmployees(data) {
        const employees = DataManager.getEmployees();
        let addedCount = 0;

        data.forEach(row => {
            const name = row['Name'];
            if (!name) return;

            // Get Employee ID from import, or generate if not provided
            const employeeId = row['Employee ID'] && row['Employee ID'].trim()
                ? row['Employee ID'].trim()
                : 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            // Check if employee ID already exists
            const existingById = employees.find(e => e.id === employeeId);
            if (existingById) {
                console.warn(`Employee ID ${employeeId} already exists. Skipping.`);
                return;
            }

            // Check if name already exists
            const existingByName = employees.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (existingByName) {
                console.warn(`Employee name ${name} already exists. Skipping.`);
                return;
            }

            const doj = this.parseImportDate(row['Date of Joining (YYYY-MM-DD)']) || DataManager.formatDate(new Date());
            const dor = this.parseImportDate(row['Date of Resign (YYYY-MM-DD)']);

            const newEmployee = {
                id: employeeId,
                name: name,
                dateOfJoining: doj,
                salaryType: (row['Salary Type (Monthly/Daily)'] || 'Monthly').toLowerCase(),
                baseSalary: parseFloat(row['Basic Salary']) || 0,
                idProofType: row['ID Proof Type'] || 'Other',
                idProofNumber: row['ID Proof Number'] || '-',
                dateOfRelieving: dor,
                status: dor ? 'Inactive' : 'Active',
                photo: null
            };

            employees.push(newEmployee);
            addedCount++;
        });

        DataManager.saveEmployees(employees);
        return addedCount;
    },

    processAttendance(data) {
        const attendance = DataManager.getAttendance();
        let addedCount = 0;

        data.forEach(row => {
            const name = row['Employee Name'];
            const dateRaw = row['Date (YYYY-MM-DD)'];
            const date = this.parseImportDate(dateRaw);

            if (!name || !date) return;

            // Check if record exists
            const existingIndex = attendance.findIndex(a => a.employee === name && a.date === date);

            // Get Over Time value from import, default to 'No' if not provided
            let overTime = 'No';
            if (row['Over Time (No/Yes/H-Working)']) {
                const otValue = row['Over Time (No/Yes/H-Working)'].trim();
                // Handle both "H-Working" and legacy "Holiday working"
                if (otValue === 'H-Working' || otValue === 'Holiday working' || otValue.toLowerCase() === 'h-working' || otValue.toLowerCase() === 'holiday working') {
                    overTime = 'H-Working';
                } else if (otValue === 'Yes' || otValue.toLowerCase() === 'yes') {
                    overTime = 'Yes';
                } else {
                    overTime = 'No';
                }
            }

            // Get status from import, but if Over Time is H-Working, automatically set Status to H-Working
            let status = row['Status (Present/Absent/Half Day)'] || row['Status (Present/Paid Leave/Unpaid Leave/Sick Leave/Half Day/Holiday/H-Working)'] || 'Absent';
            if (overTime === 'H-Working' || overTime === 'Holiday working') {
                status = 'H-Working';
            }

            const dateObj = new Date(date);
            const isHoliday = DataManager.isHoliday(dateObj);
            const holidayReason = (status === 'Holiday' || status === 'H-Working') ? DataManager.getHolidayReason(dateObj) : null;

            const newRecord = {
                id: existingIndex !== -1 ? attendance[existingIndex].id : 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                employee: name,
                date: date,
                status: status,
                checkIn: row['In Time (HH:MM)'] || '',
                checkOut: row['Out Time (HH:MM)'] || '',
                overTime: overTime,
                holidayReason: holidayReason
            };

            // Calculate hours
            if (newRecord.checkIn && newRecord.checkOut) {
                newRecord.workedHours = DataManager.calculateHours(newRecord.checkIn, newRecord.checkOut);
                const isSunday = DataManager.isSunday(dateObj);
                newRecord.otHours = DataManager.calculateOTHours(newRecord.workedHours, newRecord.status, newRecord.overTime, isHoliday, isSunday);
            }

            if (existingIndex !== -1) {
                attendance[existingIndex] = newRecord;
            } else {
                attendance.push(newRecord);
                addedCount++;
            }
        });

        DataManager.saveAttendance(attendance);
        return addedCount;
    }
};

