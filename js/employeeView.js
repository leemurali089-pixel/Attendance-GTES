// Employee Monthly & Annual Views
const EmployeeViewModule = {
    currentEmployee: null,
    viewType: 'monthly', // 'monthly' or 'annual'
    showSensitiveData: false,

    load(employeeName) {
        console.log('EmployeeViewModule.load called with:', employeeName);
        this.currentEmployee = employeeName;

        // Ensure view is visible
        const view = document.getElementById('employeeView');
        if (view) {
            view.classList.remove('d-none');
            view.style.display = '';
        }

        this.renderEmployeeView();
    },

    formatCurrency(value) {
        if (!this.showSensitiveData) {
            return '****';
        }
        return `₹${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
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
        }); // Removed forcePrompt so it respects existing authentication
    },

    renderEmployeeView() {
        const view = document.getElementById('employeeView');
        if (!view) return;

        if (!this.currentEmployee) {
            view.innerHTML = '<div class="alert alert-warning">Please select an employee to view details</div>';
            return;
        }

        const employees = DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);

        if (!employee) {
            view.innerHTML = '<div class="alert alert-danger">Employee not found: ' + this.currentEmployee + '</div>';
            return;
        }

        console.log('Rendering view for employee:', employee);

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
                        <button class="btn btn-outline-dark ms-auto" onclick="EmployeeViewModule.toggleSensitiveData()">
                            <i class="bi ${this.showSensitiveData ? 'bi-eye-slash' : 'bi-eye'}"></i>
                            ${this.showSensitiveData ? 'Hide Salary Details' : 'Show Salary Details'}
                        </button>
                    </div>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5>Employee Information</h5>
                            ${employee.photo ? `<div class="mb-3"><img src="${employee.photo}" alt="Employee Photo" style="max-width: 200px; max-height: 200px; border-radius: 5px; border: 2px solid #dee2e6;"></div>` : ''}
                            <p><strong>Name:</strong> ${employee.name}</p>
                            <p><strong>Employee ID:</strong> ${employee.id}</p>
                            <p><strong>Date of Joining:</strong> <span style="color: var(--primary-color); font-weight: 600;">${DataManager.formatDateDisplay(employee.dateOfJoining)}</span></p>
                            <p><strong>Date of Resign:</strong> ${employee.dateOfRelieving ? DataManager.formatDateDisplay(employee.dateOfRelieving) : 'Active'}</p>
                            <p><strong>Salary Type:</strong> ${employee.salaryType === 'daily' ? 'Daily Pay' : 'Monthly Pay'}</p>
                            <p><strong>Experience:</strong> <span style="color: var(--primary-color); font-weight: 600;">${this.calculateExperience(employee)}</span></p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5>ID Proof Details</h5>
                            <p><strong>ID Proof Type:</strong> ${employee.idProofType || 'Not provided'}</p>
                            <p><strong>ID Proof Number:</strong> ${employee.idProofNumber || 'Not provided'}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5>Financial Year Summary</h5>
                            ${this.renderFinancialYearSummary(employee)}
                        </div>
                    </div>
                </div>
            </div>
            <div id="employeeViewContent">
                ${this.viewType === 'monthly' ? this.renderMonthlyView() : this.renderAnnualView()}
            </div>
        `;
    },

    renderMonthlyView() {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        return `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Monthly View</h5>
                            <div class="d-flex gap-2 align-items-center mt-2">
                                <label for="employeeMonthYear" class="form-label mb-0">Select Month-Year:</label>
                                <input type="month" class="form-control" id="employeeMonthYear" 
                                       value="${currentYear}-${String(currentMonth + 1).padStart(2, '0')}" 
                                       style="width: auto;" 
                                       onchange="EmployeeViewModule.loadMonthlyData()">
                            </div>
                        </div>
                        <div class="card-body" id="monthlyViewContent">
                            ${this.renderMonthlyData(currentYear, currentMonth)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderMonthlyData(year, month) {
        const attendance = DataManager.getAttendanceByEmployee(this.currentEmployee,
            new Date(year, month, 1),
            new Date(year, month + 1, 0));

        const daysInMonth = DataManager.getDaysInMonth(year, month);

        // Calculate stats
        let present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, holidays = 0;
        let standardOtHours = 0, hWorkingOtHours = 0;

        attendance.forEach(record => {
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
                    holidays++;
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
        const employees = DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);
        const settings = DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};

        // Get base salary from employee record or settings (backward compatibility)
        const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[this.currentEmployee] || 0);
        const salaryType = employee?.salaryType || 'monthly';

        // Calculate per day salary based on type
        let perDaySalary;
        if (salaryType === 'daily') {
            perDaySalary = baseSalary;
        } else {
            perDaySalary = baseSalary / daysInMonth;
        }

        const paidDays = present + paidLeave + holidays + (halfDays * 0.5);
        const basePay = paidDays * perDaySalary;

        // Calculate OT Pay using new formula (special rate for H-Working OT)
        const otBreakdown = DataManager.calculateOTPay(
            totalOtHours,
            baseSalary,
            salaryType,
            { hWorkingOtHours, perDaySalary, returnBreakdown: true }
        );
        const otPay = otBreakdown.totalPay;
        const standardOtPay = otBreakdown.standardPay || 0;
        const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
        const standardPerHour = salaryType === 'daily'
            ? baseSalary / 8
            : (baseSalary / 30) / 8;
        const hWorkingPerHour = DataManager.calculateHWorkingPerHour(perDaySalary);
        const otPerHourDisplay = hWorkingOtHours > 0
            ? `${this.formatCurrency(standardPerHour)} (Std) / ${this.formatCurrency(hWorkingPerHour)} (H-Working)`
            : this.formatCurrency(standardPerHour);

        const totalAdvance = DataManager.getTotalAdvanceForEmployee(this.currentEmployee, year, month);
        const finalSalary = basePay + otPay - totalAdvance;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
                        <tr><th>OT Per Hour Pay</th><td>${otPerHourDisplay}</td></tr>
                        <tr><th>Standard OT Pay</th><td>${this.formatCurrency(standardOtPay)}</td></tr>
                        <tr><th>H-OT Pay</th><td>${this.formatCurrency(hWorkingOtPay)}</td></tr>
                        <tr><th>Total OT Pay</th><td>${this.formatCurrency(otPay)}</td></tr>
                        <tr><th>Total Advance</th><td>${this.formatCurrency(totalAdvance)}</td></tr>
                        <tr><th class="table-primary">Final Salary</th><td class="table-primary"><strong>${this.formatCurrency(finalSalary)}</strong></td></tr>
                    </table>
                </div>
            </div>
            <h6>Attendance Details</h6>
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
                        ${attendance.map(record => `
                            <tr>
                                <td>${DataManager.formatDateDisplay(record.date)}</td>
                                <td>${record.checkIn || '-'}</td>
                                <td>${record.checkOut || '-'}</td>
                                <td>${record.status}</td>
                                <td>${record.otHours || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderAnnualView() {
        const fy = DataManager.getFinancialYear();
        const startDate = new Date(fy.startYear, 3, 1); // April 1
        const endDate = new Date(fy.endYear, 2, 31); // March 31

        return `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Annual View - Financial Year ${fy.startYear}-${fy.endYear}</h5>
                        </div>
                        <div class="card-body">
                            ${this.renderAnnualData(fy.startYear, fy.endYear)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderAnnualData(startYear, endYear) {
        const startDate = new Date(startYear, 3, 1); // April 1
        const endDate = new Date(endYear, 2, 31); // March 31

        const attendance = DataManager.getAttendanceByEmployee(this.currentEmployee, startDate, endDate);

        // Calculate annual stats
        let present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, holidays = 0;
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
                    holidays++;
                    monthlyData[monthKey].holidays++;
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

        // Calculate total advances
        let totalAdvance = 0;
        for (let year = startYear; year <= endYear; year++) {
            for (let month = (year === startYear ? 3 : 0); month <= (year === endYear ? 2 : 11); month++) {
                totalAdvance += DataManager.getTotalAdvanceForEmployee(this.currentEmployee, year, month);
            }
        }

        // Get employee data
        const employees = DataManager.getEmployees();
        const employee = employees.find(e => e.name === this.currentEmployee);
        const settings = DataManager.getSettings();
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
            { hWorkingOtHours, perDaySalary: avgPerDaySalary, returnBreakdown: true }
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

    loadMonthlyData() {
        const monthInput = document.getElementById('employeeMonthYear');
        if (!monthInput) return;

        const value = monthInput.value;
        if (!value) return;

        const [year, month] = value.split('-').map(Number);
        const content = document.getElementById('monthlyViewContent');
        if (content) {
            content.innerHTML = this.renderMonthlyData(year, month - 1);
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

    renderFinancialYearSummary(employee) {
        const fy = DataManager.getFinancialYear();
        const startDate = new Date(fy.startYear, 3, 1); // April 1
        const endDate = new Date(fy.endYear, 2, 31); // March 31

        const attendance = DataManager.getAttendanceByEmployee(employee.name, startDate, endDate);

        let totalLeaves = 0, sickLeaves = 0, present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0;

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
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
};

