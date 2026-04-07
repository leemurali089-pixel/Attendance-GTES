// Employee Monthly & Annual Views
const EmployeeViewModule = {
    currentEmployee: null,
    viewType: 'monthly', // 'monthly' or 'annual'
    showSensitiveData: false,

    async load(employeeName) {
        console.log('EmployeeViewModule.load called with:', employeeName);
        this.currentEmployee = employeeName;

        // Ensure view is visible
        const view = document.getElementById('employeeView');
        if (view) {
            view.classList.remove('d-none');
            view.style.display = '';
        }

        await this.renderEmployeeView();
    },

    formatCurrency(value) {
        if (!this.showSensitiveData) {
            return '****';
        }
        return `₹${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    },

    maskId(value) {
        if (!value) return 'Not provided';
        if (value.length < 4) return '****';
        return 'X'.repeat(value.length - 4) + value.slice(-4);
    },

    toggleSensitiveData() {
        if (this.showSensitiveData) {
            this.showSensitiveData = false;
            this.renderEmployeeView();
            return;
        }
        AuthManager.requireAuth(() => {
            this.showSensitiveData = true;
            this.renderEmployeeView();
        });
    },

    async renderEmployeeView() {
        const view = document.getElementById('employeeView');
        if (!view) return;

        if (!this.currentEmployee) {
            view.innerHTML = '<div class="alert alert-warning">Please select an employee to view details</div>';
            return;
        }

        const employees = await DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);

        if (!employee) {
            view.innerHTML = '<div class="alert alert-danger">Employee not found: ' + this.currentEmployee + '</div>';
            return;
        }

        console.log('Rendering view for employee:', employee);

        const [fySummaryHtml, viewContentHtml] = await Promise.all([
            this.renderFinancialYearSummary(employee),
            this.viewType === 'monthly' ? this.renderMonthlyView()
                : this.viewType === 'annual' ? this.renderAnnualView()
                    : this.viewType === 'payslips' ? this.renderPayslipsView()
                        : Promise.resolve('')
        ]);

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Employee Details - ${employee.name}</h2>
                    <div class="d-flex gap-2 align-items-center mb-3 flex-wrap">
                        <button class="btn btn-${this.viewType === 'monthly' ? 'primary' : 'secondary'}" 
                                onclick="EmployeeViewModule.setViewType('monthly')">
                            Monthly View
                        </button>
                        <button class="btn btn-${this.viewType === 'annual' ? 'primary' : 'secondary'}" 
                                onclick="EmployeeViewModule.setViewType('annual')">
                            Annual View
                        </button>
                        <button class="btn btn-${this.viewType === 'payslips' ? 'primary' : 'secondary'}" 
                                onclick="EmployeeViewModule.setViewType('payslips')">
                            Payslips History
                        </button>
                        <button class="btn btn-outline-dark ms-auto" onclick="EmployeeViewModule.toggleSensitiveData()">
                            <i class="bi ${this.showSensitiveData ? 'bi-eye-slash' : 'bi-eye'}"></i>
                            ${this.showSensitiveData ? 'Hide Sensitive Data' : 'Show Sensitive Data'}
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Personal Info Row -->
            <div class="row mb-3">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h5>Personal Information</h5>
                            ${employee.employeePhoto ? `<div class="mb-3"><img src="${employee.employeePhoto}" alt="Employee Photo" style="max-width: 100%; max-height: 200px; border-radius: 5px; object-fit: cover;"></div>` : ''}
                            <p><strong>Name:</strong> ${employee.name}</p>
                            <p><strong>Employee ID:</strong> ${employee.id || 'N/A'}</p>
                            <p><strong>Date of Joining:</strong> <span style="color: var(--primary-color); font-weight: 600;">${DataManager.formatDateDisplay(employee.dateOfJoining)}</span></p>
                            <p><strong>Date of Resign:</strong> ${employee.dateOfRelieving ? DataManager.formatDateDisplay(employee.dateOfRelieving) : 'Active'}</p>
                            <p><strong>Salary Type:</strong> ${employee.salaryType === 'daily' ? 'Daily Pay' : 'Monthly Pay'}</p>
                            <p><strong>Experience:</strong> <span style="color: var(--primary-color); font-weight: 600;">${this.calculateExperience(employee)}</span></p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h5>Contact Information</h5>
                            <p><strong>Phone:</strong> ${employee.phone || 'Not provided'}</p>
                            <p><strong>Email:</strong> ${employee.email || 'Not provided'}</p>
                            <hr>
                            <h6>Payment Details</h6>
                            <p><strong>Payment Mode:</strong> <span class="badge bg-${employee.paymentMode === 'bank' ? 'success' : 'info'}">${(employee.paymentMode || 'bank').toUpperCase()}</span></p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h5>KYC Information</h5>
                            <p><strong>PAN:</strong> ${this.showSensitiveData ? (employee.pan || 'Not provided') : this.maskId(employee.pan)}</p>
                            <p><strong>Aadhaar:</strong> ${this.showSensitiveData ? (employee.aadhaar || 'Not provided') : this.maskId(employee.aadhaar)}</p>
                            ${employee.aadhaarPhoto ? `<div class="mt-2"><small class="text-muted">Aadhaar Document:</small><br><img src="${employee.aadhaarPhoto}" alt="Aadhaar" style="max-width: 100%; max-height: 150px; border-radius: 5px; object-fit: cover; margin-top: 5px; filter: ${this.showSensitiveData ? 'none' : 'blur(5px)'}; transition: filter 0.3s;"></div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Bank & Address Row -->
            ${employee.paymentMode === 'bank' && employee.bank ? `
            <div class="row mb-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5>Bank Details </h5>
                            <p><strong>Beneficiary Name:</strong> ${employee.bank.beneficiaryName || 'Not provided'}</p>
                            <p><strong>Account Number:</strong> ${employee.bank.accountNo || 'Not provided'}</p>
                            <p><strong>IFSC Code:</strong> ${employee.bank.ifsc || 'Not provided'}</p>
                            <p><strong>Branch Name:</strong> ${employee.bank.branchName || 'Not provided'}</p>
                            <p><strong>Branch Address:</strong> ${employee.bank.address || 'Not provided'}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5>Address Information</h5>
                            <p><strong>Permanent Address:</strong><br>${(employee.address?.permanent || 'Not provided').replace(/\n/g, '<br>')}</p>
                            <hr>
                            <p><strong>Present Address:</strong><br>${(employee.address?.present || 'Not provided').replace(/\n/g, '<br>')}</p>
                        </div>
                    </div>
                </div>
            </div>
            ` : employee.address ? `
            <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5>Address Information</h5>
                            <div class="row">
                                <div class="col-md-6">
                                    <p><strong>Permanent Address:</strong><br>${(employee.address?.permanent || 'Not provided').replace(/\n/g, '<br>')}</p>
                                </div>
                                <div class="col-md-6">
                                    <p><strong>Present Address:</strong><br>${(employee.address?.present || 'Not provided').replace(/\n/g, '<br>')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5>Financial Year Summary</h5>
                            ${fySummaryHtml}
                        </div>
                    </div>
                </div>
            </div>
            <div id="employeeViewContent">
                ${viewContentHtml}
            </div>
        `;
    },

    async renderMonthlyView() {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Default to table if not set
        if (!this.monthlyViewMode) this.monthlyViewMode = 'table';

        const monthlyDataHtml = await this.renderMonthlyData(currentYear, currentMonth);

        return `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>Monthly View</h5>
                            <div class="d-flex gap-3 align-items-center">
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-sm btn-outline-primary ${this.monthlyViewMode === 'table' ? 'active' : ''}" 
                                            onclick="EmployeeViewModule.setMonthlyViewMode('table')">
                                        <i class="bi bi-table"></i> Table
                                    </button>
                                    <button type="button" class="btn btn-sm btn-outline-primary ${this.monthlyViewMode === 'calendar' ? 'active' : ''}" 
                                            onclick="EmployeeViewModule.setMonthlyViewMode('calendar')">
                                        <i class="bi bi-calendar3"></i> Calendar
                                    </button>
                                </div>
                                <div class="d-flex gap-2 align-items-center">
                                    <label for="employeeMonthYear" class="form-label mb-0">Select Month:</label>
                                    <input type="month" class="form-control form-control-sm" id="employeeMonthYear" 
                                           value="${currentYear}-${String(currentMonth + 1).padStart(2, '0')}" 
                                           style="width: auto;" 
                                           onchange="EmployeeViewModule.loadMonthlyData()">
                                </div>
                            </div>
                        </div>
                        <div class="card-body" id="monthlyViewContent">
                            ${monthlyDataHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    setMonthlyViewMode(mode) {
        this.monthlyViewMode = mode;
        this.renderEmployeeView(); // Re-render to update UI
    },

    async renderMonthlyData(year, month) {
        const attendance = await DataManager.getAttendanceByEmployee(this.currentEmployee,
            new Date(year, month, 1),
            new Date(year, month + 1, 0));

        // Sort attendance by date
        attendance.sort((a, b) => new Date(a.date) - new Date(b.date));

        const daysInMonth = DataManager.getDaysInMonth(year, month);

        // Calculate stats
        let present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, holidays = 0, hWorking = 0;
        let standardOtHours = 0, hWorkingOtHours = 0;

        // Map for quick lookup
        const attendanceMap = {};

        attendance.forEach(record => {
            const dateStr = new Date(record.date).toISOString().split('T')[0];
            attendanceMap[dateStr] = record;

            switch (record.status) {
                case 'Present':
                    present++;
                    break;
                case 'Paid Leave':
                    paidLeave++;
                    break;
                case 'Unpaid Leave':
                    unpaidLeave++;
                    break;
                case 'Sick Leave':
                    unpaidLeave++;
                    break;
                case 'Half Day':
                    halfDays++;
                    break;
                case 'Holiday':
                    holidays++;
                    break;
                case 'H-Working':
                    hWorking++;
                    break;
            }
            const hours = parseFloat(record.otHours || 0) || 0;
            if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                hWorkingOtHours += hours;
            } else {
                standardOtHours += hours;
            }
        });
        const totalOtHours = standardOtHours + hWorkingOtHours;

        // Get employee data
        const employees = await DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);
        const settings = await DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};

        // Get base salary from employee record or settings
        const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[this.currentEmployee] || 0);
        const salaryType = employee?.salaryType || 'monthly';

        // Calculate per day salary based on type
        let perDaySalary;
        if (salaryType === 'daily') {
            perDaySalary = baseSalary;
        } else {
            perDaySalary = baseSalary / daysInMonth;
        }

        // H-Working Pay is handled by standard daily pay + special OT hours pay
        // Not adding extra 2x multiplier as per new requirement
        const hWorkingDaysPay = 0; // Removed extra day's double pay mapping

        const paidDays = present + paidLeave + holidays + hWorking + (halfDays * 0.5);
        const basePay = paidDays * perDaySalary; // Standard 1-day pay for H-Working + OT


        // Calculate OT Pay
        const otBreakdown = DataManager.calculateOTPay(
            totalOtHours,
            baseSalary,
            salaryType,
            { hWorkingOtHours, returnBreakdown: true, settings: settings }
        );
        const otPay = otBreakdown.totalPay;
        const standardOtPay = otBreakdown.standardPay || 0;
        const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
        // Format OT Rates properly based on settings and fixed 30 days
        const fixedDaySalary = salaryType === 'daily' ? baseSalary : baseSalary / 30;
        
        let standardPerHour = 0;
        const sOtMethod = settings.otCalculationMethod || 'salaryBased8';
        if (sOtMethod === 'fixedRate') standardPerHour = settings.otRate || DataManager.DEFAULT_SETTINGS.otRate;
        else if (sOtMethod === 'salaryBased9') standardPerHour = fixedDaySalary / 9;
        else standardPerHour = fixedDaySalary / 8;

        let hWorkingPerHour = 0;
        const hOtMethod = settings.hOtCalculationMethod || 'salaryBased8';
        if (hOtMethod === 'fixedRate') hWorkingPerHour = settings.otRate || DataManager.DEFAULT_SETTINGS.otRate;
        else if (hOtMethod === 'salaryBased9') hWorkingPerHour = fixedDaySalary / 9;
        else hWorkingPerHour = fixedDaySalary / 8;

        const otPerHourDisplay = `${this.formatCurrency(standardPerHour)} (Std) / ${this.formatCurrency(hWorkingPerHour)} (H-Working)`;

        const totalAdvance = await DataManager.getTotalAdvanceForEmployee(this.currentEmployee, year, month);
        const finalSalary = basePay + otPay - totalAdvance;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        let detailsHtml = '';

        if (this.monthlyViewMode === 'calendar') {
            // CALENDAR VIEW
            const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)

            // Build calendar grid
            let calendarHtml = '<div class="calendar-grid">';

            // Header
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            calendarHtml += days.map(d => `<div class="calendar-header fw-bold text-center py-2">${d}</div>`).join('');

            // Empty cells for days before the 1st
            for (let i = 0; i < firstDay; i++) {
                calendarHtml += '<div class="calendar-day empty"></div>';
            }

            // Days
            for (let day = 1; day <= daysInMonth; day++) {
                const dateObj = new Date(year, month, day);
                // Simple date matching since we are iterating exactly

                // Let's safe match
                const record = attendance.find(r => new Date(r.date).getDate() === day);

                let statusClass = 'bg-light';
                let statusText = '';
                let otText = '';

                if (record) {
                    if (record.status === 'Present') statusClass = 'bg-success text-white';
                    else if (record.status === 'Paid Leave') statusClass = 'bg-info text-white';
                    else if (record.status === 'Unpaid Leave' || record.status === 'Sick Leave') statusClass = 'bg-danger text-white';
                    else if (record.status === 'Half Day') statusClass = 'bg-warning text-dark';
                    else if (record.status === 'Holiday') statusClass = 'bg-secondary text-white';
                    else if (record.status === 'H-Working') statusClass = 'bg-primary text-white';

                    statusText = record.status;
                    if (record.otHours > 0) otText = `<small class="d-block mt-1" style="font-size: 0.7rem;">OT: ${record.otHours}</small>`;
                }

                calendarHtml += `
                    <div class="calendar-day border p-2" style="min-height: 80px; position: relative;">
                        <div class="fw-bold small mb-1">${day}</div>
                        ${record ? `
                            <div class="badge ${statusClass} w-100 text-wrap text-start p-1" style="font-size: 0.7rem;">
                                ${statusText}
                            </div>
                            ${otText}
                        ` : ''}
                    </div>
                `;
            }

            calendarHtml += '</div>'; // End grid

            // Add some styles specifically here or ensure they exist
            // Using inline styles for grid to be safe
            detailsHtml = `
                <style>
                    .calendar-grid {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 5px;
                    }
                    .calendar-day {
                        background: var(--bg-card);
                    }
                </style>
                <h6 class="mt-4">Attendance Calendar</h6>
                ${calendarHtml}
            `;

        } else {
            // TABLE VIEW (Existing)
            detailsHtml = `
            <h6 class="mt-4">Attendance Details</h6>
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Check-in</th>
                            <th>Check-out</th>
                            <th>Status</th>
                            <th>OT Hours</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${attendance.map(record => {
                // Highlight H-Working
                const rowClass = record.status === 'H-Working' ? 'table-primary' : '';
                return `
                            <tr class="${rowClass}">
                                <td>${DataManager.formatDateDisplay(record.date)}</td>
                                <td>${record.checkIn || '-'}</td>
                                <td>${record.checkOut || '-'}</td>
                                <td>
                                    ${record.status}
                                    ${record.status === 'H-Working' ? '<i class="bi bi-hammer ms-1" title="H-Working"></i>' : ''}
                                </td>
                                <td>${record.otHours || 0}</td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        return `
            <h6>Summary for ${months[month]} ${year}</h6>
            <div class="row mb-3">
                <div class="col-md-6">
                    <table class="table table-bordered">
                        <tr><th>Present Days</th><td>${present}</td></tr>
                        <tr><th>Paid Leave</th><td>${paidLeave}</td></tr>
                        <tr><th>Unpaid Leave</th><td>${unpaidLeave}</td></tr>
                        <tr><th>Half Days</th><td>${halfDays}</td></tr>
                        <tr><th>Holidays</th><td>${holidays}</td></tr>
                        <tr><th>H-Working Days</th><td>${hWorking}</td></tr>
                        <tr><th>Standard OT Hours</th><td>${standardOtHours.toFixed(2)}</td></tr>
                        <tr><th>H-OT Hours</th><td>${hWorkingOtHours.toFixed(2)}</td></tr>
                        <tr><th>Total OT Hours</th><td>${totalOtHours.toFixed(2)}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <table class="table table-bordered">
                        <tr><th>Basic Salary</th><td>${this.formatCurrency(baseSalary)}</td></tr>
                        <tr><th>Per Day Salary</th><td>${this.formatCurrency(perDaySalary)}</td></tr>
                        <tr><th>Paid Days</th><td>${paidDays.toFixed(1)}</td></tr>
                        <tr><th>H-Working Days Pay</th><td>${this.formatCurrency(hWorkingDaysPay)}</td></tr>
                        <tr><th>OT Per Hour Pay</th><td>${otPerHourDisplay}</td></tr>
                        <tr><th>Standard OT Pay</th><td>${this.formatCurrency(standardOtPay)}</td></tr>
                        <tr><th>H-OT Pay</th><td>${this.formatCurrency(hWorkingOtPay)}</td></tr>
                        <tr><th>Total OT Pay</th><td>${this.formatCurrency(otPay)}</td></tr>
                        <tr><th>Total Advance</th><td>${this.formatCurrency(totalAdvance)}</td></tr>
                        <tr><th class="table-primary">Final Salary</th><td class="table-primary"><strong>${this.formatCurrency(finalSalary)}</strong></td></tr>
                    </table>
                </div>
            </div>
            ${detailsHtml}
        `;
    },

    async renderAnnualView() {
        const fy = DataManager.getFinancialYear();
        const startDate = new Date(fy.startYear, 3, 1); // April 1
        const endDate = new Date(fy.endYear, 2, 31); // March 31

        const annualDataHtml = await this.renderAnnualData(fy.startYear, fy.endYear);

        return `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Annual View - Financial Year ${fy.startYear}-${fy.endYear}</h5>
                        </div>
                        <div class="card-body">
                            ${annualDataHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderAnnualData(startYear, endYear) {
        const startDate = new Date(startYear, 3, 1); // April 1
        const endDate = new Date(endYear, 2, 31); // March 31

        const attendance = await DataManager.getAttendanceByEmployee(this.currentEmployee, startDate, endDate);

        // Calculate annual stats
        let present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, holidays = 0, hWorking = 0;
        let standardOtHours = 0, hWorkingOtHours = 0;
        let totalSalary = 0;

        // Group by month for detailed breakdown
        const monthlyData = {};

        attendance.forEach(record => {
            const recordDate = new Date(record.date);
            const monthKey = `${recordDate.getFullYear()}-${recordDate.getMonth()}`;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    present: 0, paidLeave: 0, unpaidLeave: 0, halfDays: 0, holidays: 0, otHours: 0
                };
            }

            switch (record.status) {
                case 'Present':
                    present++;
                    monthlyData[monthKey].present++;
                    break;
                case 'Paid Leave':
                    paidLeave++;
                    monthlyData[monthKey].paidLeave++;
                    break;
                case 'Unpaid Leave':
                    unpaidLeave++;
                    monthlyData[monthKey].unpaidLeave++;
                    break;
                case 'Sick Leave':
                    unpaidLeave++;
                    monthlyData[monthKey].unpaidLeave++;
                    break;
                case 'Half Day':
                    halfDays++;
                    monthlyData[monthKey].halfDays++;
                    break;
                case 'Holiday':
                    holidays++;
                    monthlyData[monthKey].holidays++;
                    break;
                case 'H-Working':
                    hWorking++;
                    break;
            }
            const hours = parseFloat(record.otHours || 0) || 0;
            if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                hWorkingOtHours += hours;
            } else {
                standardOtHours += hours;
            }
            monthlyData[monthKey].otHours += hours;
        });

        // Total advances in range — single load (was N× await getTotalAdvance..., very slow)
        let totalAdvance = 0;
        {
            const advances = await DataManager.getAdvances();
            const advRows = advances.filter(adv => adv.employee === this.currentEmployee);
            advRows.forEach(adv => {
                const advDate = new Date(adv.date);
                if (advDate >= startDate && advDate <= endDate) {
                    totalAdvance += parseFloat(adv.amount || 0) || 0;
                }
            });
        }

        // Get employee data
        const employees = await DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);
        const settings = await DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};

        // Get base salary from employee record or settings
        const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[this.currentEmployee] || 0);
        const salaryType = employee?.salaryType || 'monthly';

        // Calculate total salary
        const avgDaysPerMonth = 30;
        let avgPerDaySalary;
        if (salaryType === 'daily') {
            avgPerDaySalary = baseSalary;
        } else {
            avgPerDaySalary = baseSalary / avgDaysPerMonth;
        }

        const totalPaidDays = present + paidLeave + holidays + (halfDays * 0.5);
        const totalBasePay = totalPaidDays * avgPerDaySalary;
        const totalOtHours = standardOtHours + hWorkingOtHours;
        const annualOtBreakdown = DataManager.calculateOTPay(
            totalOtHours,
            baseSalary,
            salaryType,
            { hWorkingOtHours, perDaySalary: avgPerDaySalary, returnBreakdown: true, settings: settings }
        );
        const totalOTPay = annualOtBreakdown.totalPay;
        const annualStandardOtPay = annualOtBreakdown.standardPay || 0;
        const annualHWorkingOtPay = annualOtBreakdown.hWorkingPay || 0;
        totalSalary = totalBasePay + totalOTPay - totalAdvance;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        return `
            <h6>Annual Summary</h6>
            <div class="row mb-3">
                <div class="col-md-6">
                    <table class="table table-bordered">
                        <tr><th>Total Present Days</th><td>${present}</td></tr>
                        <tr><th>Total Paid Leave</th><td>${paidLeave}</td></tr>
                        <tr><th>Total Unpaid Leave</th><td>${unpaidLeave}</td></tr>
                        <tr><th>Total Half Days</th><td>${halfDays}</td></tr>
                        <tr><th>Total Holidays</th><td>${holidays}</td></tr>
                        <tr><th>Standard OT Hours</th><td>${standardOtHours.toFixed(2)}</td></tr>
                        <tr><th>H-OT Hours</th><td>${hWorkingOtHours.toFixed(2)}</td></tr>
                        <tr><th>Total OT Hours</th><td>${totalOtHours.toFixed(2)}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <table class="table table-bordered">
                        <tr><th>Standard OT Pay</th><td>${this.formatCurrency(annualStandardOtPay)}</td></tr>
                        <tr><th>H-OT Pay</th><td>${this.formatCurrency(annualHWorkingOtPay)}</td></tr>
                        <tr><th>Total OT Pay</th><td>${this.formatCurrency(totalOTPay)}</td></tr>
                        <tr><th>Total Advances</th><td>₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><th class="table-primary">Total Salary Paid</th><td class="table-primary"><strong>₹${totalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                    </table>
                </div>
            </div>
            <h6>Monthly Breakdown</h6>
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Present</th>
                            <th>Paid Leave</th>
                            <th>Unpaid Leave</th>
                            <th>Half Days</th>
                            <th>Holidays</th>
                            <th>OT Hours</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.keys(monthlyData).sort().map(key => {
            const [year, month] = key.split('-').map(Number);
            const data = monthlyData[key];
            return `
                                <tr>
                                    <td>${months[month]} ${year}</td>
                                    <td>${data.present}</td>
                                    <td>${data.paidLeave}</td>
                                    <td>${data.unpaidLeave}</td>
                                    <td>${data.halfDays}</td>
                                    <td>${data.holidays}</td>
                                    <td>${data.otHours.toFixed(2)}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    setViewType(type) {
        this.viewType = type;
        this.renderEmployeeView();
    },

    async loadMonthlyData() {
        const monthInput = document.getElementById('employeeMonthYear');
        if (!monthInput) return;

        const value = monthInput.value;
        if (!value) return;

        const [year, month] = value.split('-').map(Number);
        const content = document.getElementById('monthlyViewContent');
        if (content) {
            content.innerHTML = await this.renderMonthlyData(year, month - 1);
        }
    },

    calculateExperience(employee) {
        const doj = new Date(employee.dateOfJoining);
        const dor = employee.dateOfRelieving ? new Date(employee.dateOfRelieving) : new Date();

        // Set time to start of day for accurate calculation
        doj.setHours(0, 0, 0, 0);
        dor.setHours(0, 0, 0, 0);

        let years = dor.getFullYear() - doj.getFullYear();
        let months = dor.getMonth() - doj.getMonth();
        let days = dor.getDate() - doj.getDate();

        // Adjust for negative days
        if (days < 0) {
            months--;
            const lastDayOfPrevMonth = new Date(dor.getFullYear(), dor.getMonth(), 0).getDate();
            days += lastDayOfPrevMonth;
        }

        // Adjust for negative months
        if (months < 0) {
            years--;
            months += 12;
        }

        // Build the formatted string
        const parts = [];
        if (years > 0) {
            parts.push(`${years} ${years === 1 ? 'Year' : 'Years'}`);
        }
        if (months > 0) {
            parts.push(`${months} ${months === 1 ? 'Month' : 'Months'}`);
        }
        if (days > 0 || parts.length === 0) {
            parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
        }

        return parts.join(' ');
    },

    async renderFinancialYearSummary(employee) {
        const fy = DataManager.getFinancialYear();
        const startDate = new Date(fy.startYear, 3, 1); // April 1
        const endDate = new Date(fy.endYear, 2, 31); // March 31

        const attendance = await DataManager.getAttendanceByEmployee(employee.name, startDate, endDate);

        let totalLeaves = 0, sickLeaves = 0, present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, hWorking = 0;

        attendance.forEach(record => {
            switch (record.status) {
                case 'Present': present++; break;
                case 'Paid Leave':
                    paidLeave++;
                    totalLeaves++;
                    break;
                case 'Unpaid Leave':
                    unpaidLeave++;
                    totalLeaves++;
                    break;
                case 'Sick Leave':
                    unpaidLeave++;
                    totalLeaves++;
                    sickLeaves++;
                    break;
                case 'Half Day':
                    halfDays++;
                    totalLeaves += 0.5;
                    break;
                case 'H-Working':
                    hWorking++;
                    break;
            }
        });

        return `
            <div class="row">
                <div class="col-md-12">
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th>Item</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Financial Year</strong></td>
                                <td>${fy.startYear}-${fy.endYear}</td>
                            </tr>
                            <tr>
                                <td>Total Present Days</td>
                                <td>${present}</td>
                            </tr>
                            <tr>
                                <td>Total Leaves</td>
                                <td>${totalLeaves.toFixed(1)}</td>
                            </tr>
                            <tr>
                                <td>Paid Leave</td>
                                <td>${paidLeave}</td>
                            </tr>
                            <tr>
                                <td>Unpaid Leave</td>
                                <td>${unpaidLeave}</td>
                            </tr>
                            <tr>
                                <td><strong>Total Sick Leaves</strong></td>
                                <td><strong>${sickLeaves}</strong></td>
                            </tr>
                            <tr>
                                <td>Half Days</td>
                                <td>${halfDays}</td>
                            </tr>
                            <tr>
                                <td><strong>H-Working Days</strong></td>
                                <td><strong>${hWorking}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async renderPayslipsView() {
        const salaryPayouts = (await DataManager.getSettings()).salaryPayouts || {};
        const bonusPayouts = await DataManager.getBonusPayouts();
        const employeeName = this.currentEmployee;

        const history = [];

        // Process Salary Payouts
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        Object.entries(salaryPayouts).forEach(([key, data]) => {
            if (data.done && data.employees && data.employees.includes(employeeName)) {
                const [year, month] = key.split('_').map(Number);
                history.push({
                    type: 'Salary',
                    date: new Date(year, month, 1),
                    label: `Salary - ${months[month]} ${year}`,
                    displayDate: data.creditDate ? DataManager.formatDateDisplay(data.creditDate) : '-',
                    amount: '-', // Net salary calculation requires heavy fetching, skipping for list view
                    details: { year, month }
                });
            }
        });

        // Process Bonus Payouts
        bonusPayouts.forEach(batch => {
            const empBonus = batch.payouts.find(p => p.employeeName === employeeName);
            if (empBonus) {
                history.push({
                    type: 'Bonus',
                    date: new Date(batch.financialYear, 3, 1), // Approx April
                    label: `Bonus - FY ${batch.financialYear}-${batch.financialYear + 1}`,
                    displayDate: '-',
                    amount: `₹${empBonus.finalBonus.toLocaleString('en-IN')}`,
                    details: { batchId: batch.id }
                });
            }
        });

        // Sort by date desc
        history.sort((a, b) => b.date - a.date);

        return `
            <div class="card">
                <div class="card-header">
                    <h5>Payslips History</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Period / Label</th>
                                    <th>Payout Date</th>
                                    <th>Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${history.length > 0 ? history.map(item => `
                                    <tr>
                                        <td><span class="badge bg-${item.type === 'Salary' ? 'success' : 'warning text-dark'}">${item.type}</span></td>
                                        <td>${item.label}</td>
                                        <td>${item.displayDate}</td>
                                        <td>${item.amount}</td>
                                        <td>
                                            ${item.type === 'Salary' ? `
                                                <button class="btn btn-sm btn-outline-primary" onclick="ReportsModule.generatePayslips(${item.details.year}, ${item.details.month}, ['${employeeName.replace(/'/g, "\\'")}'], 'preview')" title="View Payslip">
                                                    <i class="bi bi-eye"></i> View
                                                </button>
                                                <button class="btn btn-sm btn-outline-success" onclick="ReportsModule.generatePayslips(${item.details.year}, ${item.details.month}, ['${employeeName.replace(/'/g, "\\'")}'], 'email')" title="Email Payslip">
                                                    <i class="bi bi-envelope"></i> Email
                                                </button>
                                            ` : `
                                                <button class="btn btn-sm btn-outline-primary" onclick="BonusModule.viewBonusPayslip('${item.details.batchId}', '${employeeName.replace(/'/g, "\\'")}')" title="View Payslip">
                                                    <i class="bi bi-eye"></i> View
                                                </button>
                                                <button class="btn btn-sm btn-outline-success" onclick="BonusModule.emailBonusPayslip('${item.details.batchId}', '${employeeName.replace(/'/g, "\\'")}')" title="Email Payslip">
                                                    <i class="bi bi-envelope"></i> Email
                                                </button>
                                            `}
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="5" class="text-center">No payment history found to view.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
};

