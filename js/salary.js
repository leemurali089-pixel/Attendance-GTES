// Salary/Payroll Module
const SalaryModule = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    payoutReviewModal: null,
    currentPayoutDraft: null,
    showSensitiveData: false,
    currentRenderId: 0,

    load() {
        this.renderSalaryView();
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
            this.renderSalaryView();
            return;
        }
        AuthManager.requireAuth(() => {
            this.showSensitiveData = true;
            this.renderSalaryView();
        }); // Removed forcePrompt so it respects existing authentication
    },

    renderSalaryView() {
        const view = document.getElementById('salaryView');
        if (!view) return;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonthYear = `${months[this.currentMonth]}-${this.currentYear}`;
        // Use getEmployeesActiveInMonth to match payout logic and include anyone with attendance
        const employees = DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);
        const otRate = DataManager.getOTRate();

        const isPayoutDone = DataManager.isSalaryPayoutDone(this.currentYear, this.currentMonth);

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">Salary Calculation - ${currentMonthYear}</h5>
                            <div class="d-flex gap-2">
                                <input type="month" id="salaryMonthYear" class="form-control form-control-sm" 
                                    value="${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}"
                                    onchange="SalaryModule.loadSalaryForMonth()">
                                
                                ${isPayoutDone ? `
                                    <button class="btn btn-warning btn-sm" onclick="SalaryModule.generateSalaryPayout()">
                                        <i class="bi bi-arrow-repeat"></i> Regenerate Payout
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="SalaryModule.cancelSalaryPayout()">
                                        <i class="bi bi-x-circle"></i> Cancel Payout
                                    </button>
                                ` : `
                                    <button class="btn btn-success btn-sm" onclick="SalaryModule.generateSalaryPayout()">
                                        <i class="bi bi-cash-stack"></i> Generate Payout
                                    </button>
                                `}
                                
                                <button class="btn btn-outline-primary btn-sm" onclick="SalaryModule.downloadMonthlyPDF()">
                                    <i class="bi bi-file-earmark-pdf"></i> Monthly Report
                                </button>
                                <button class="btn btn-outline-primary btn-sm" onclick="SalaryModule.generatePayslips()">
                                    <i class="bi bi-receipt"></i> Payslips
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="SalaryModule.downloadAnnualPDF()">
                                    <i class="bi bi-file-earmark-spreadsheet"></i> Annual Report
                                </button>
                                <button class="btn btn-outline-warning btn-sm" onclick="SalaryModule.toggleSensitiveData()">
                                    <i class="bi bi-eye${this.showSensitiveData ? '-slash' : ''}"></i> ${this.showSensitiveData ? 'Hide' : 'Show'} Amounts
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="alert alert-info">
                                <strong>OT Calculation:</strong> 
                                ${(() => {
                const settings = DataManager.getSettings();
                const method = settings.otCalculationMethod || 'salaryBased';
                if (method === 'fixedRate') {
                    const rate = settings.otRate || DataManager.DEFAULT_SETTINGS.otRate;
                    return `Fixed Rate: OT Pay = OT Hours × ₹${rate} (Same for all employees)`;
                } else {
                    return `Based on Salary: Per Hour Salary = (Basic Salary ÷ 30) ÷ 8, then OT Pay = OT Hours × Per Hour Salary`;
                }
            })()}
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Salary Calculation - ${currentMonthYear}</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Basic Salary</th>
                                            <th>Present</th>
                                            <th>Paid Leave</th>
                                            <th>Unpaid Leave</th>
                                            <th>Sick Leave</th>
                                            <th>Half Days</th>
                                            <th>Holidays</th>
                                            <th>H-Working</th>
                                            <th>OT Hours</th>
                                            <th>H-OT Hours</th>
                                            <th>OT Pay</th>
                                            <th>Total Advance</th>
                                            <th>Final Salary</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="salaryTableBody">
                                        <!-- Rows will be rendered asynchronously -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="salarySettingsModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Set Basic Salary</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="salarySettingsForm">
                                <input type="hidden" id="salaryEmployeeName">
                                <div class="mb-3">
                                    <label for="baseSalary" class="form-label">Basic Salary (₹) *</label>
                                    <input type="number" class="form-control" id="baseSalary" step="0.01" min="0" required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="SalaryModule.saveBaseSalary()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize modal
        const modalElement = document.getElementById('salarySettingsModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }

        // Trigger async rendering
        this.renderSalaryRowsAsync();
    },

    async renderSalaryRowsAsync() {
        const tbody = document.getElementById('salaryTableBody');
        if (!tbody) return;

        // Cancel previous render
        this.currentRenderId++;
        const renderId = this.currentRenderId;

        tbody.innerHTML = '<tr><td colspan="13" class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div> Loading employee data...</td></tr>';

        // Allow UI to update - Increased delay to ensure modal backdrop is gone
        await new Promise(resolve => setTimeout(resolve, 150));

        try {
            // Get employees active in the selected month only
            const employees = DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);

            if (!employees || employees.length === 0) {
                if (this.currentRenderId === renderId) {
                    tbody.innerHTML = '<tr><td colspan="13" class="text-center">No employees were active in this month</td></tr>';
                }
                return;
            }

            // Pre-fetch data (Context)
            // OPTIMIZATION: Fetch all data once to avoid repeated localStorage reads
            const allAttendance = DataManager.getAttendance();
            const settings = DataManager.getSettings();
            const attendanceByMonth = DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);

            // OPTIMIZATION: Group attendance by employee to avoid O(N*M) filtering in the loop
            const attendanceMap = new Map();
            attendanceByMonth.forEach(record => {
                if (!attendanceMap.has(record.employee)) {
                    attendanceMap.set(record.employee, []);
                }
                attendanceMap.get(record.employee).push(record);
            });

            const context = {
                attendanceMap: attendanceMap, // Pass the map instead of raw array
                allAttendance: allAttendance, // Pass full attendance for history lookups
                daysInMonth: DataManager.getDaysInMonth(this.currentYear, this.currentMonth),
                otRate: DataManager.getOTRate(),
                settings: settings,
                baseSalaries: settings.baseSalaries || {},
                salaryPayouts: settings.salaryPayouts || {} // Pre-fetch payout status
            };

            if (this.currentRenderId !== renderId) return;
            tbody.innerHTML = ''; // Clear loading message

            const batchSize = 20; // Increased batch size for better performance

            for (let i = 0; i < employees.length; i += batchSize) {
                if (this.currentRenderId !== renderId) return; // Cancelled

                const batch = employees.slice(i, i + batchSize);
                const html = batch.map(emp => this._generateRowHTML(emp, context)).join('');

                tbody.insertAdjacentHTML('beforeend', html);

                // Yield to main thread
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (this.currentRenderId === renderId) {
                this._attachEventListeners();
            }
        } catch (error) {
            console.error('Error rendering salary rows:', error);
            if (this.currentRenderId === renderId) {
                tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger">Error loading data: ${error.message}</td></tr>`;
            }
        }
    },

    _generateRowHTML(emp, context) {
        // OPTIMIZATION: Use pre-grouped attendance from map
        const empAttendance = context.attendanceMap.get(emp.name) || [];

        // Get base salary from employee record or settings (for backward compatibility)
        const baseSalary = parseFloat(emp.baseSalary || context.baseSalaries[emp.name] || 0);
        const salaryType = emp.salaryType || 'monthly';

        // For daily-paid employees, calculate accumulated unpaid days
        let accumulatedData = null;
        if (salaryType === 'daily') {
            accumulatedData = this.calculateAccumulatedDays(emp.name, this.currentYear, this.currentMonth, context);
        }

        // Calculate attendance stats for current month
        let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeave = 0, halfDays = 0, holidays = 0, hWorking = 0;
        let standardOtHours = 0, hWorkingSpecialOtHours = 0;
        let extraPaidDaysFromHWorking = 0; // Track extra days for double pay

        empAttendance.forEach(record => {
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
                    sickLeave++;
                    break;
                case 'Half Day':
                    halfDays++;
                    break;
                case 'Holiday':
                    holidays++;
                    break;
                case 'H-Working':
                    hWorking++; // Count H-Working separately

                    // H-Working payment logic based on Over Time value:
                    // 1. Over Time = "No" → 2 days pay (1 base + 1 extra), 0 OT hours
                    // 2. Over Time = "Yes" → 2 days pay (1 base + 1 extra), OT hours already calculated normally (total - 9)
                    // 3. Over Time = "H-Working" → 1 day pay (base only), OT hours = full hours worked

                    if (record.overTime === 'No' || record.overTime === 'Yes') {
                        // Double pay: add 1 extra day for working on holiday
                        extraPaidDaysFromHWorking += 1;
                    }
                    // If overTime === 'H-Working', no extra day (just base pay + full OT)
                    break;
            }
            const hours = parseFloat(record.otHours || 0) || 0;
            if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                hWorkingSpecialOtHours += hours;
            } else {
                standardOtHours += hours;
            }
        });
        let totalOtHours = standardOtHours + hWorkingSpecialOtHours;

        // Calculate per day salary based on type
        let perDaySalary;
        let paidDays;
        let basePay;

        if (salaryType === 'daily' && accumulatedData) {
            // Use accumulated data for daily employees
            // Daily employees get paid ONLY for present days (no paid leave, holidays, etc.)
            perDaySalary = baseSalary;
            paidDays = accumulatedData.totalPaidDays;
            basePay = paidDays * perDaySalary;
            const accumulatedSpecial = accumulatedData.totalHWorkingSpecialOtHours || 0;
            hWorkingSpecialOtHours = accumulatedSpecial;
            standardOtHours = Math.max((accumulatedData.totalOTHours || 0) - accumulatedSpecial, 0);
            totalOtHours = standardOtHours + hWorkingSpecialOtHours;
        } else if (salaryType === 'daily') {
            // Single month for daily employee (no accumulation or first month)
            perDaySalary = baseSalary;
            paidDays = present + hWorking + (halfDays * 0.5); // Present days + H-Working + half days for daily pay
            basePay = paidDays * perDaySalary;
        } else {
            // Monthly employees: present + paid leave + holidays + H-Working + half days + extra days
            // H-Working base pay (1 day) + extra days for double pay scenarios
            perDaySalary = baseSalary / context.daysInMonth;
            paidDays = present + paidLeave + holidays + hWorking + (halfDays * 0.5) + extraPaidDaysFromHWorking;
            basePay = paidDays * perDaySalary;
        }

        // Calculate OT Pay (standard OT + H-Working OT with per-day/9 rule)
        const otBreakdown = DataManager.calculateOTPay(
            totalOtHours,
            baseSalary,
            salaryType,
            { hWorkingOtHours: hWorkingSpecialOtHours, perDaySalary, returnBreakdown: true }
        );
        const otPay = otBreakdown.totalPay;
        const standardOtPay = otBreakdown.standardPay || 0;
        const standardOtRate = otBreakdown.standardRate || 0;
        const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
        const hWorkingOtRate = otBreakdown.hWorkingRate || 0;

        // Get advance info
        const totalAdvance = DataManager.getTotalAdvanceForEmployee(emp.name, this.currentYear, this.currentMonth);

        // Check if payout is already finalized for this month
        const isPayoutDone = DataManager.isSalaryPayoutDone(this.currentYear, this.currentMonth);
        const storedDebit = DataManager.getDebitedAdvance(emp.name, this.currentYear, this.currentMonth);
        const remainingBalance = DataManager.getRemainingAdvanceBalance(emp.name, this.currentYear, this.currentMonth);

        // Calculate salary before advance deduction
        const salaryBeforeAdvance = basePay + otPay;

        let debitToApply = 0;
        let finalRemaining = remainingBalance;

        // Only use stored debit if payout is done
        if (isPayoutDone && storedDebit > 0) {
            debitToApply = storedDebit;
            // When payout is done, the remainingBalance already has the debit subtracted
            finalRemaining = remainingBalance;
        }
        // If payout is NOT done, don't show any debit and use full remaining balance

        const finalSalary = salaryBeforeAdvance - debitToApply;

        return `
            <tr>
                <td>
                    ${emp.name}
                    ${accumulatedData && accumulatedData.monthsAccumulated > 1 ?
                `<br><small class="badge bg-warning text-dark">Accumulated: ${accumulatedData.monthsAccumulated} months</small>`
                : ''}
                </td>
                <td>
                    ${this.formatCurrency(baseSalary)}
                    <small class="text-muted d-block">(${salaryType === 'daily' ? 'Daily' : 'Monthly'})</small>
                    <button class="btn btn-sm btn-link p-0 ms-1" onclick="SalaryModule.setBaseSalary('${emp.name}', ${baseSalary}, '${salaryType}')" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Present')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalPresent : present}</span>
                        ${accumulatedData && accumulatedData.monthsAccumulated > 1 ?
                `<br><small class="text-muted" title="Accumulated from ${accumulatedData.monthsAccumulated} months">*</small>`
                : ''}
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Paid Leave')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalPaidLeave : paidLeave}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Unpaid Leave')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalUnpaidLeave : unpaidLeave}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Sick Leave')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalSickLeave : sickLeave}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Half Days')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalHalfDays : halfDays}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'Holidays')">
                        <span class="text-primary text-decoration-underline">${accumulatedData ? accumulatedData.totalHolidays : holidays}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'H-Working')">
                        <strong class="text-info text-decoration-underline">${hWorking}</strong>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'OT Hours')">
                        <span class="text-primary text-decoration-underline">${totalOtHours.toFixed(2)}</span>
                    </div>
                </td>
                <td><strong>${hWorkingSpecialOtHours.toFixed(2)}</strong></td>
                <td>
                    <button type="button"
                        class="btn btn-link p-0 text-decoration-underline ot-breakdown-btn"
                        onclick="SalaryModule.showOtPayBreakdown('${emp.name.replace(/'/g, "\\'")}',
                            ${standardOtHours.toFixed(2)},
                            ${standardOtRate},
                            ${standardOtPay},
                            ${hWorkingSpecialOtHours.toFixed(2)},
                            ${hWorkingOtRate},
                            ${hWorkingOtPay},
                            ${otPay})">
                        ${this.formatCurrency(otPay)}
                    </button>
                </td>
                <td>
                    ${this.formatCurrency(totalAdvance)}
                    ${debitToApply > 0 && isPayoutDone ? `<br><small class="text-danger">Debited: -${this.formatCurrency(debitToApply)}</small>` : ''}
                    ${finalRemaining > 0 ? `<br><small class="text-muted">Remaining: ${this.formatCurrency(finalRemaining)}</small>` : ''}
                </td>
                <td><strong>${this.formatCurrency(finalSalary)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-info view-employee-btn" data-employee="${emp.name.replace(/"/g, '&quot;')}">
                        <i class="bi bi-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    },

    // Deprecated: Use renderSalaryRowsAsync instead
    renderSalaryRows() {
        console.warn('renderSalaryRows is deprecated. Use renderSalaryRowsAsync instead.');
        return '';
    },

    cancelSalaryPayout() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees to Cancel Payout - ${months[this.currentMonth]} ${this.currentYear}`;

        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees) => {
                if (confirm(`Are you sure you want to cancel the salary payout for ${selectedEmployees.length} employees? This will revert their advance deductions and waivers for this month.`)) {
                    AuthManager.requireAuth(() => {
                        DataManager.cancelSalaryPayout(this.currentYear, this.currentMonth, selectedEmployees);
                        App.showNotification('Salary payout cancelled for selected employees', 'success');
                        this.renderSalaryView(); // Refresh view
                    });
                }
            },
            title,
            'Cancel Payout',
            this.currentYear,
            this.currentMonth
        );
    },

    _attachEventListeners() {
        document.querySelectorAll('.view-employee-btn').forEach(btn => {
            // Remove existing listeners by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            // Add new listener
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const employeeName = newBtn.getAttribute('data-employee');
                if (employeeName) {
                    SalaryModule.handleViewEmployee(employeeName);
                }
            });
        });
    },

    showStatusCalendar(employeeName, statusType) {
        // Ensure modal exists
        this._createStatusCalendarModal();

        const modal = new bootstrap.Modal(document.getElementById('statusCalendarModal'));
        const modalTitle = document.getElementById('statusCalendarModalLabel');
        const modalBody = document.getElementById('statusCalendarModalBody');

        // Set title
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        modalTitle.textContent = `${statusType} Details - ${employeeName} (${months[this.currentMonth]} ${this.currentYear})`;

        // Get attendance data
        const attendance = DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);
        const empAttendance = attendance.filter(a => a.employee === employeeName);

        // Filter by status
        const filteredAttendance = this._filterAttendanceByStatus(empAttendance, statusType);

        // Render calendar
        modalBody.innerHTML = this._renderStatusCalendar(filteredAttendance, statusType);

        modal.show();
    },

    _filterAttendanceByStatus(attendance, statusType) {
        return attendance.filter(record => {
            switch (statusType) {
                case 'Present':
                    return record.status === 'Present';
                case 'Paid Leave':
                    return record.status === 'Paid Leave';
                case 'Unpaid Leave':
                    return record.status === 'Unpaid Leave';
                case 'Sick Leave':
                    return record.status === 'Sick Leave';
                case 'Half Days':
                    return record.status === 'Half Day';
                case 'Holidays':
                    return record.status === 'Holiday';
                case 'H-Working':
                    return record.status === 'H-Working';
                case 'OT Hours':
                    return parseFloat(record.otHours || 0) > 0;
                default:
                    return false;
            }
        });
    },

    _renderStatusCalendar(attendance, statusType) {
        const daysInMonth = DataManager.getDaysInMonth(this.currentYear, this.currentMonth);
        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();

        // Create map of relevant dates
        const relevantDates = new Set(attendance.map(r => new Date(r.date).getDate()));

        // For OT Hours, we might want to show the hours
        const otMap = {};
        if (statusType === 'OT Hours') {
            attendance.forEach(r => {
                otMap[new Date(r.date).getDate()] = parseFloat(r.otHours || 0);
            });
        }

        let calendarHTML = '<div class="calendar-container">';

        // Legend/Summary
        calendarHTML += `
            <div class="alert alert-info mb-3 d-flex align-items-center">
                <i class="bi bi-info-circle me-2"></i>
                <div>
                    <strong>Total Days: ${attendance.length}</strong>
                    ${statusType === 'OT Hours' ? `<br>Total Hours: ${attendance.reduce((sum, r) => sum + parseFloat(r.otHours || 0), 0).toFixed(2)}` : ''}
                </div>
            </div>
        `;

        calendarHTML += '<div class="row g-2">';

        // Day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            calendarHTML += `<div class="col calendar-day-header text-center py-1"><strong>${day}</strong></div>`;
        });
        calendarHTML += '</div>';

        // Empty cells for days before month starts
        calendarHTML += '<div class="row g-2 mt-1">';
        for (let i = 0; i < firstDay; i++) {
            calendarHTML += '<div class="col calendar-day-empty"></div>';
        }

        // Calendar days
        for (let day = 1; day <= daysInMonth; day++) {
            if ((firstDay + day - 1) % 7 === 0 && day > 1) {
                calendarHTML += '</div><div class="row g-2 mt-1">';
            }

            const date = new Date(this.currentYear, this.currentMonth, day);
            const isRelevant = relevantDates.has(day);
            const isHoliday = DataManager.isHoliday(date) || DataManager.isSunday(date);

            let dayClass = 'calendar-day justify-content-center flex-column';
            let style = '';

            if (isRelevant) {
                dayClass += ' selected';
            } else if (isHoliday) {
                dayClass += ' holiday';
            }

            calendarHTML += `
                <div class="col ${dayClass}" style="${style}">
                    <div class="calendar-day-number">${day}</div>
                    ${statusType === 'OT Hours' && isRelevant ? `<small class="text-white" style="font-size: 0.7rem;">${otMap[day]}h</small>` : ''}
                </div>
            `;
        }

        // Fill remaining cells
        const remainingCells = (7 - ((firstDay + daysInMonth) % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            calendarHTML += '<div class="col calendar-day-empty"></div>';
        }

        calendarHTML += '</div></div>';
        return calendarHTML;
    },

    _createStatusCalendarModal() {
        if (!document.getElementById('statusCalendarModal')) {
            const modalHTML = `
                <div class="modal fade" id="statusCalendarModal" tabindex="-1" aria-labelledby="statusCalendarModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="statusCalendarModalLabel">Status Details</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body" id="statusCalendarModalBody">
                                <!-- Calendar content will be injected here -->
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    },

    _ensureOtBreakdownModal() {
        if (!document.getElementById('otBreakdownModal')) {
            const modalHTML = `
                <div class="modal fade" id="otBreakdownModal" tabindex="-1" aria-labelledby="otBreakdownModalLabel" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="otBreakdownModalLabel">OT Pay Breakdown</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body" id="otBreakdownModalBody"></div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    },

    showOtPayBreakdown(employeeName, standardHours, standardRate, standardPay, hHours, hRate, hPay, totalPay) {
        this._ensureOtBreakdownModal();

        const modal = new bootstrap.Modal(document.getElementById('otBreakdownModal'));
        const modalBody = document.getElementById('otBreakdownModalBody');
        const modalTitle = document.getElementById('otBreakdownModalLabel');

        modalTitle.textContent = `OT Pay Breakdown - ${employeeName}`;

        const formattedStandardRate = this.formatCurrency(standardRate || 0);
        const formattedHRate = this.formatCurrency(hRate || 0);

        modalBody.innerHTML = `
            <table class="table table-bordered mb-3">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th class="text-end">Hours</th>
                        <th class="text-end">Rate (₹/hr)</th>
                        <th class="text-end">Pay (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Standard OT</td>
                        <td class="text-end">${Number(standardHours || 0).toFixed(2)}</td>
                        <td class="text-end">${formattedStandardRate}</td>
                        <td class="text-end">${this.formatCurrency(standardPay || 0)}</td>
                    </tr>
                    <tr>
                        <td>H-OT (Holiday Working)</td>
                        <td class="text-end">${Number(hHours || 0).toFixed(2)}</td>
                        <td class="text-end">${formattedHRate}</td>
                        <td class="text-end">${this.formatCurrency(hPay || 0)}</td>
                    </tr>
                    <tr class="table-primary">
                        <th>Total</th>
                        <th class="text-end">${Number((standardHours || 0) + (hHours || 0)).toFixed(2)}</th>
                        <th></th>
                        <th class="text-end">${this.formatCurrency(totalPay || 0)}</th>
                    </tr>
                </tbody>
            </table>
            <small class="text-muted">
                H-OT rate = Per-day salary ÷ 9 hours. Standard OT rate follows the configured OT method.
            </small>
        `;

        modal.show();
    },

    // Deprecated: Use renderSalaryRowsAsync instead
    renderSalaryRows() {
        console.warn('renderSalaryRows is deprecated. Use renderSalaryRowsAsync instead.');
        return '';
    },

    // New helper function to calculate accumulated days for daily-paid employees
    calculateAccumulatedDays(employeeName, currentYear, currentMonth, context = null) {
        const employees = DataManager.getEmployees();
        const employee = employees.find(e => e.name === employeeName);

        if (!employee) {
            return null;
        }

        // Get date of joining to limit how far back we look
        const doj = employee.dateOfJoining ? new Date(employee.dateOfJoining) : null;

        let totalPresent = 0, totalPaidLeave = 0, totalUnpaidLeave = 0, totalSickLeave = 0, totalHalfDays = 0, totalHolidays = 0, totalHWorking = 0, totalOTHours = 0, totalHWorkingSpecialOtHours = 0;
        let monthsAccumulated = 0;
        let startMonth = currentMonth;
        let startYear = currentYear;

        // Limit iterations to prevent performance issues
        const maxIterations = 12;

        // Use pre-fetched data if available, otherwise fetch (fallback)
        const allAttendance = context ? context.allAttendance : DataManager.getAttendance();
        const salaryPayouts = context ? context.salaryPayouts : (DataManager.getSettings().salaryPayouts || {});

        // Go back month by month until we find a paid month or reach 12 months back or date of joining
        for (let i = 0; i < maxIterations; i++) {
            // Check if this month's salary has been paid out
            // OPTIMIZATION: Use pre-fetched settings
            const payoutKey = `${startYear}_${startMonth}`;
            const isPaid = salaryPayouts[payoutKey] && salaryPayouts[payoutKey].done;

            // Check if this month is before date of joining
            if (doj) {
                // Check against the last day of the month to ensure we include the joining month
                const checkDate = new Date(startYear, startMonth + 1, 0);
                if (checkDate < doj) {
                    break; // Stop if the entire month is before employee joined
                }
            }

            // Get attendance for this month
            // OPTIMIZATION: Filter in-memory instead of parsing JSON again
            const monthAttendance = allAttendance.filter(record => {
                const d = new Date(record.date);
                return d.getFullYear() === startYear &&
                    d.getMonth() === startMonth &&
                    record.employee === employeeName;
            });

            // Skip if no attendance records and salary was paid (optimization)
            if (isPaid && monthAttendance.length === 0) {
                break;
            }

            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeave = 0, halfDays = 0, holidays = 0, hWorking = 0, standardOtHours = 0, hWorkingSpecialOtHours = 0;

            monthAttendance.forEach(record => {
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
                        sickLeave++;
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
                    hWorkingSpecialOtHours += hours;
                } else {
                    standardOtHours += hours;
                }
            });

            // Add to totals
            totalPresent += present;
            totalPaidLeave += paidLeave;
            totalUnpaidLeave += unpaidLeave;
            totalSickLeave += sickLeave;
            totalHalfDays += halfDays;
            totalHolidays += holidays;
            totalHWorking += hWorking;
            totalOTHours += standardOtHours + hWorkingSpecialOtHours;
            totalHWorkingSpecialOtHours += hWorkingSpecialOtHours;
            monthsAccumulated++;

            // If this month was paid, stop accumulating
            if (isPaid) {
                break;
            }

            // Move to previous month
            startMonth--;
            if (startMonth < 0) {
                startMonth = 11;
                startYear--;
            }

            // Prevent infinite loop
            if (startYear < currentYear - 2) {
                break;
            }
        }

        // For daily employees: present days + half days + H-Working (no paid leave or holidays)
        const totalPaidDays = totalPresent + totalHWorking + (totalHalfDays * 0.5);

        return {
            totalPresent,
            totalPaidLeave,
            totalUnpaidLeave,
            totalSickLeave,
            totalHalfDays,
            totalHolidays,
            totalHWorking,
            totalOTHours,
            totalHWorkingSpecialOtHours,
            totalPaidDays,
            monthsAccumulated
        };
    },


    loadSalaryForMonth() {
        const monthInput = document.getElementById('salaryMonthYear');
        if (!monthInput) return;

        const value = monthInput.value;
        if (!value) return;

        const [year, month] = value.split('-').map(Number);
        this.currentYear = year;
        this.currentMonth = month - 1;

        // Re-render the entire view to update buttons and header
        this.renderSalaryView();
    },

    setBaseSalary(employeeName, currentSalary, salaryType = 'monthly') {
        document.getElementById('salaryEmployeeName').value = employeeName;
        document.getElementById('baseSalary').value = currentSalary || '';
        // Note: Salary type should be edited from Employee management, not here
        if (this.modal) {
            this.modal.show();
        }
    },

    saveBaseSalary() {
        const employeeName = document.getElementById('salaryEmployeeName').value;
        const baseSalary = parseFloat(document.getElementById('baseSalary').value);

        if (!employeeName || isNaN(baseSalary) || baseSalary < 0) {
            App.showNotification('Please enter a valid basic salary', 'error');
            return;
        }

        // Update employee record instead of settings
        const employees = DataManager.getEmployees();
        const employee = employees.find(e => e.name === employeeName);
        if (employee) {
            employee.baseSalary = baseSalary;
            DataManager.saveEmployees(employees);
        } else {
            // Fallback to settings for backward compatibility
            const settings = DataManager.getSettings();
            if (!settings.baseSalaries) {
                settings.baseSalaries = {};
            }
            settings.baseSalaries[employeeName] = baseSalary;
            DataManager.saveSettings(settings);
        }

        this.modal.hide();
        this.renderSalaryRowsAsync(); // Refresh rows
        App.showNotification('Basic salary saved successfully', 'success');
    },

    downloadMonthlyPDF() {
        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees) => {
                ReportsModule.generateMonthlyPDF(this.currentYear, this.currentMonth, selectedEmployees);
            },
            'Select Employees for Monthly PDF',
            'Generate PDF',
            this.currentYear,
            this.currentMonth
        );
    },

    downloadAnnualPDF() {
        const fy = DataManager.getFinancialYear();
        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees) => {
                ReportsModule.generateAnnualPDF(fy.startYear, fy.endYear, selectedEmployees);
            },
            'Select Employees for Annual PDF'
        );
    },

    // Generate payslips only after salary payout is done for the selected month
    generatePayslips() {
        const monthInput = document.getElementById('salaryMonthYear');
        if (!monthInput || !monthInput.value) {
            App.showNotification('Please select a month-year before generating payslips', 'error');
            return;
        }

        const [year, month] = monthInput.value.split('-').map(Number);
        const monthIndex = month - 1;

        if (!DataManager.isSalaryPayoutDone(year, monthIndex)) {
            App.showNotification('Please generate Salary Payout for this month before generating payslips', 'error');
            return;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees for Payslips - ${months[monthIndex]} ${year}`;

        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees) => {
                ReportsModule.generatePayslips(year, monthIndex, selectedEmployees);
            },
            title,
            'Generate PDF',
            year,
            monthIndex
        );
    },

    generateSalaryPayout() {
        const monthInput = document.getElementById('salaryMonthYear');
        if (!monthInput || !monthInput.value) {
            App.showNotification('Please select a month-year before generating salary payout', 'error');
            return;
        }

        const [year, month] = monthInput.value.split('-').map(Number);
        const monthIndex = month - 1;

        ReportsModule.startSalaryPayoutFlow(year, monthIndex);
    },

    handleViewEmployee(employeeName) {
        AuthManager.requireAuth(() => {
            App.showView('employeeView', { employeeName });
        });
    }
};

