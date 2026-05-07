// Salary/Payroll Module
const SalaryModule = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    payoutReviewModal: null,
    currentPayoutDraft: null,
    showSensitiveData: false,
    currentRenderId: 0,

    async load() {
        await this.renderSalaryView();
    },

    formatCurrency(value) {
        if (!this.showSensitiveData) {
            return '****';
        }
        return `₹${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    _getESIDeduction(baseSalary, employee) {
        const base = Number(baseSalary || 0);
        if (!employee || employee.esiDeductionEnabled !== true || !isFinite(base) || base <= 0) return 0;
        return Number((base * 0.0075).toFixed(2)); // 0.75% of basic salary
    },

    async toggleSensitiveData() {
        if (this.showSensitiveData) {
            this.showSensitiveData = false;
            await this.renderSalaryView();
            return;
        }
        AuthManager.requireAuth(async () => {
            this.showSensitiveData = true;
            await this.renderSalaryView();
        }); // Removed forcePrompt so it respects existing authentication
    },

    async renderSalaryView() {
        const view = document.getElementById('salaryView');
        if (!view) return;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonthYear = `${months[this.currentMonth]}-${this.currentYear}`;
        // Use getEmployeesActiveInMonth to match payout logic and include anyone with attendance
        const employees = await DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);
        const otRate = await DataManager.getOTRate();
        const settings = await DataManager.getSettings();

        const isPayoutDone = await DataManager.isSalaryPayoutDone(this.currentYear, this.currentMonth);
        const hasAnyPayout = await DataManager.hasAnySalaryPayout(this.currentYear, this.currentMonth);

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                Salary Calculation - ${currentMonthYear}
                                ${isPayoutDone ? '<span class="badge bg-success ms-2"><i class="bi bi-check-circle-fill"></i> Payout Done</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="bi bi-clock-fill"></i> Pending</span>'}
                            </h5>
                            <div class="d-flex gap-2">
                                <input type="month" id="salaryMonthYear" class="form-control form-control-sm" 
                                    value="${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}"
                                    onchange="SalaryModule.loadSalaryForMonth()">
                                
                                ${isPayoutDone || hasAnyPayout ? `
                                    <button class="btn btn-info btn-sm text-white" onclick="ReportsModule.viewSalaryPayoutPDF(${this.currentYear}, ${this.currentMonth})">
                                        <i class="bi bi-file-earmark-pdf-fill"></i> View Payout PDF
                                    </button>
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
                                ${isPayoutDone || hasAnyPayout ? `
                                <button class="btn btn-outline-primary btn-sm" onclick="SalaryModule.generatePayslips()">
                                    <i class="bi bi-receipt"></i> Payslips
                                </button>
                                ` : ''}
                                ${isPayoutDone || hasAnyPayout ? `
                                <button class="btn btn-primary btn-sm" onclick="SalaryModule.bulkRemittance()" title="Generate bank remittance file">
                                    <i class="bi bi-bank"></i> Bulk Remittance
                                </button>
                                ` : `
                                <button class="btn btn-outline-secondary btn-sm" disabled title="Generate payout first to enable remittance">
                                    <i class="bi bi-bank"></i> Bulk Remittance
                                </button>
                                `}
                                <button class="btn btn-outline-secondary btn-sm" onclick="SalaryModule.downloadAnnualPDF()">
                                    <i class="bi bi-file-earmark-spreadsheet"></i> Annual Report
                                </button>
                                <button class="btn btn-outline-warning btn-sm" onclick="SalaryModule.toggleSensitiveData()">
                                    <i class="bi bi-eye${this.showSensitiveData ? '-slash' : ''}"></i> ${this.showSensitiveData ? 'Hide' : 'Show'} Amounts
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            ${await this.renderUnpaidMonthsWarning()}
                            <div class="alert alert-info">
                                <strong>OT Calculation:</strong> 
                                ${(() => {
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

    async renderUnpaidMonthsWarning() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const settings = await DataManager.getSettings();
        const salaryPayouts = settings.salaryPayouts || {};

        const unpaidMonths = [];
        let checkMonth = this.currentMonth - 1;
        let checkYear = this.currentYear;

        // Check up to 12 previous months
        for (let i = 0; i < 12; i++) {
            if (checkMonth < 0) {
                checkMonth = 11;
                checkYear--;
            }

            const payoutKey = `${checkYear}_${checkMonth}`;
            const isPaid = salaryPayouts[payoutKey] && salaryPayouts[payoutKey].done;

            if (!isPaid) {
                unpaidMonths.push(`${months[checkMonth]} ${checkYear}`);
            } else {
                // Stop at the first paid month encountered
                break;
            }

            checkMonth--;
        }

        if (unpaidMonths.length > 0) {
            return `
                <div class="alert alert-warning alert-dismissible fade show" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    <strong>Pending Payouts:</strong> ${unpaidMonths.length} previous month${unpaidMonths.length > 1 ? 's' : ''} 
                    (${unpaidMonths.reverse().join(', ')}) ${unpaidMonths.length > 1 ? 'have' : 'has'} not been paid out yet.
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
        }

        return '';
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
            const employees = await DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);

            if (!employees || employees.length === 0) {
                if (this.currentRenderId === renderId) {
                    tbody.innerHTML = '<tr><td colspan="13" class="text-center">No employees were active in this month</td></tr>';
                }
                return;
            }

            // Pre-fetch data (Context)
            // OPTIMIZATION: Fetch all data once to avoid repeated localStorage reads
            const allAttendance = await DataManager.getAttendance();
            const settings = await DataManager.getSettings();
            const attendanceByMonth = await DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);

            // OPTIMIZATION: Group attendance by employee to avoid O(N*M) filtering in the loop
            // AND Deduplicate records (use latest per day)
            const attendanceMap = new Map();
            attendanceByMonth.forEach(record => {
                if (!attendanceMap.has(record.employee)) {
                    attendanceMap.set(record.employee, new Map());
                }
                // Use local date string (YYYY-MM-DD) as key to prevent duplicate day counts and avoid Timezone UTC bleed
                const d = new Date(record.date);
                const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                attendanceMap.get(record.employee).set(dateKey, record);
            });

            // Convert nested Maps back to Array for the view logic
            const flatAttendanceMap = new Map();
            attendanceMap.forEach((dateMap, empName) => {
                flatAttendanceMap.set(empName, Array.from(dateMap.values()));
            });

            const context = {
                attendanceMap: flatAttendanceMap, // Pass the de-duped map
                allAttendance: allAttendance, // Pass full attendance for history lookups
                daysInMonth: DataManager.getDaysInMonth(this.currentYear, this.currentMonth),
                otRate: DataManager.getOTRate(),
                settings: settings,
                baseSalaries: settings.baseSalaries || {},
                salaryPayouts: settings.salaryPayouts || {}, // Pre-fetch payout status
                canManage: await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SALARY)
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
            accumulatedData = this.calculateAccumulatedDays(emp, this.currentYear, this.currentMonth, context);
        }

        // Calculate attendance stats for current month
        let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeave = 0, halfDays = 0, holidays = 0, hWorking = 0;
        let standardOtHours = 0, hWorkingSpecialOtHours = 0, sOtHours = 0;

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

                    // H-Working payment logic: Only 1 base day + OT, no extra double-pay
                    // OT Logic is handled below via hWorkingSpecialOtHours or standardOtHours
                    break;
            }
            const hours = parseFloat(record.otHours || 0) || 0;
            const dateObj = new Date(record.date);
            const isSunday = DataManager.isSunday(dateObj);
            const isHoliday = DataManager.isHoliday(dateObj);

            // 1. H-Working Special OT (Explicit H-Working OT)
            if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                hWorkingSpecialOtHours += hours;
            }
            // 2. S-OT (Sunday Present, not Holiday)
            else if (isSunday && !isHoliday && record.status === 'Present') {
                sOtHours += hours;
            }
            // 3. Standard OT (Everything else, including Present on Holiday)
            else {
                standardOtHours += hours;
            }
        });
        let totalOtHours = standardOtHours + hWorkingSpecialOtHours + sOtHours;

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
            const accumulatedSOt = accumulatedData.totalSOtHours || 0; // Need to track this in accumulatedData too if possible
            // For now, accumulated data might not have S-OT separated. This is a limitation for daily accumulated.
            // We'll assume accumulated OT is standard unless we update calculateAccumulatedDays too.
            hWorkingSpecialOtHours = accumulatedSpecial;
            // sOtHours = accumulatedSOt; // TODO: Update calculateAccumulatedDays
            standardOtHours = Math.max((accumulatedData.totalOTHours || 0) - accumulatedSpecial, 0);
            totalOtHours = standardOtHours + hWorkingSpecialOtHours;
        } else if (salaryType === 'daily') {
            // Single month for daily employee (no accumulation or first month)
            perDaySalary = baseSalary;
            paidDays = present + hWorking + (halfDays * 0.5); // Present days + H-Working + half days for daily pay
            basePay = paidDays * perDaySalary;
        } else {
            // Monthly: match payout — each H-Working counts as 2 paid days (day worked + extra paid day)
            perDaySalary = baseSalary / context.daysInMonth;
            paidDays = present + paidLeave + holidays + (halfDays * 0.5) + 2 * hWorking;
            basePay = paidDays * perDaySalary;
        }

        // Calculate OT Pay (standard OT + H-Working OT + S-OT)
        const otBreakdown = DataManager.calculateOTPay(
            totalOtHours,
            baseSalary,
            salaryType,
            { hWorkingOtHours: hWorkingSpecialOtHours, sOtHours: sOtHours, returnBreakdown: true, settings: context.settings }
        );
        const otPay = otBreakdown.totalPay;
        const standardOtPay = otBreakdown.standardPay || 0;
        const standardOtRate = otBreakdown.standardRate || 0;
        const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
        const hWorkingOtRate = otBreakdown.hWorkingRate || 0;
        const sOtPay = otBreakdown.sOtPay || 0;
        const sOtRate = otBreakdown.sOtRate || 0;

        // Get advance info
        const totalAdvance = DataManager.getTotalAdvanceForEmployee(emp.name, this.currentYear, this.currentMonth);

        // Check if payout is already finalized for this month
        const isPayoutDone = DataManager.isSalaryPayoutDone(this.currentYear, this.currentMonth);
        const storedDebit = DataManager.getDebitedAdvance(emp.name, this.currentYear, this.currentMonth);
        const remainingBalance = DataManager.getRemainingAdvanceBalance(emp.name, this.currentYear, this.currentMonth);

        const esiDeduction = this._getESIDeduction(baseSalary, emp);
        // Calculate salary before advance deduction
        const salaryBeforeAdvance = basePay + otPay - esiDeduction;

        let debitToApply = 0;
        let finalRemaining = remainingBalance;

        // Only use stored debit if payout is done
        if (isPayoutDone && storedDebit > 0) {
            debitToApply = storedDebit;
            // When payout is done, the remainingBalance already has the debit subtracted
            finalRemaining = remainingBalance;
        }
        // If payout is NOT done, don't show any debit and use full remaining balance

        const finalSalary = Math.max(salaryBeforeAdvance - debitToApply, 0);

        return `
            <tr>
                <td>
                    ${emp.name}
                    ${accumulatedData && accumulatedData.monthsAccumulated > 0 ?
                `<br><small class="badge bg-warning text-dark" 
                    title="Accumulated Months: ${accumulatedData.accumulatedMonthNames.join(', ')}${accumulatedData.debugInfo ? '\n\nDebug Info:\n' + accumulatedData.debugInfo : ''}" 
                    style="cursor: help;">
                    ${accumulatedData.monthsAccumulated > 1 ? `Accumulated: ${accumulatedData.monthsAccumulated} months` : 'Month: ' + accumulatedData.accumulatedMonthNames[0]}
                </small>
                ${accumulatedData.monthsAccumulated > 1 ? `<br><small class="text-muted" style="font-size: 0.7rem;">(${accumulatedData.accumulatedMonthNames.join(', ')})</small>` : ''}`
                : ''}
                </td>
                <td>
                    ${this.formatCurrency(baseSalary)}
                    <small class="text-muted d-block">(${salaryType === 'daily' ? 'Daily' : 'Monthly'})</small>
                    ${esiDeduction > 0 ? `<small class="text-warning d-block">ESI: -${this.formatCurrency(esiDeduction)}</small>` : ''}
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
                        <strong class="text-info text-decoration-underline">${accumulatedData ? accumulatedData.totalHWorking : hWorking}</strong>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'OT Hours')">
                        <span class="text-primary text-decoration-underline">${standardOtHours.toFixed(2)}</span>
                    </div>
                </td>
                <td>
                    <div style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${emp.name.replace(/'/g, "\\'")}', 'H-OT Hours')">
                        <strong class="text-info text-decoration-underline">${hWorkingSpecialOtHours.toFixed(2)}</strong>
                    </div>
                </td>
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
                            ${otPay},
                            ${sOtHours.toFixed(2)},
                            ${sOtRate},
                            ${sOtPay})">
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
                    ${context.canManage ? `
                    <button class="btn btn-sm btn-primary ms-1" onclick="SalaryModule.editBaseSalary('${emp.name.replace(/'/g, "\\'")}', ${baseSalary})">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    ` : ''}
                    ${isPayoutDone ? `
                    <button class="btn btn-sm btn-outline-secondary ms-1" onclick="SalaryModule.emailPayslip('${emp.name.replace(/'/g, "\\'")}')" title="Email Payslip">
                        <i class="bi bi-envelope"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    },

    // Deprecated: Use renderSalaryRowsAsync instead
    renderSalaryRows() {
        console.warn('renderSalaryRows is deprecated. Use renderSalaryRowsAsync instead.');
        return '';
    },

    async emailPayslip(employeeName) {
        if (!confirm(`Send payslip to ${employeeName} via email?`)) return;

        App.showLoader('Sending email...');
        try {
            const employees = await DataManager.getEmployees();
            const employee = employees.find(e => e.name === employeeName);
            if (!employee) throw new Error('Employee not found');

            // Get salary data (re-calculate or fetch from payout if stored details existed)
            // For now, we re-calculate to get the breakdown. 
            // Ideally, we should fetch from saved payout details if available.
            // But current system re-calculates on fly for view.

            // We need to replicate the calculation logic or extract it.
            // Since _generateRowHTML does calculation but returns HTML, we need a helper.
            // Or we can just use the data we have if we had stored it.

            // Let's assume we can re-calculate using existing methods.
            // But wait, _generateRowHTML is complex.

            // Alternative: Use ReportsModule.generateMonthlyPDF logic which gathers data.
            // ReportsModule.generateMonthlyPDF generates PDF.

            // Let's implement a quick calculation helper or use what we have.
            // Actually, for email, we need the breakdown (Basic, OT, Deductions, Net).

            // I'll implement a simplified calculation here for now, similar to _generateRowHTML
            // but returning data object.

            const salaryData = await this._calculateSalaryForEmail(employee);

            const result = await EmailService.sendSalaryPayslip(employee, salaryData, this.currentMonth, this.currentYear);
            console.log('Email Send Result:', result);

            if (result.success) {
                App.showNotification('Email sent successfully', 'success');
            } else {
                App.showNotification('Failed to send email: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Email error:', error);
            App.showNotification('Error sending email: ' + error.message, 'error');
        } finally {
            App.hideLoader();
        }
    },

    async _calculateSalaryForEmail(employee) {
        // Re-use logic from _generateRowHTML but cleaner
        const attendance = await DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);
        const empAttendance = attendance.filter(a => a.employee === employee.name);
        const settings = await DataManager.getSettings();
        const baseSalary = parseFloat(employee.baseSalary || settings.baseSalaries?.[employee.name] || 0);

        // Calculate components (simplified for brevity, should match _generateRowHTML)
        // ... (This is duplication, but refactoring _generateRowHTML is risky now)
        // I'll try to do a best-effort calculation using DataManager helpers if available.

        // Actually, let's use a helper if I can find one.
        // DataManager.calculateOTPay is available.

        // Let's do a quick calculation:
        const daysInMonth = DataManager.getDaysInMonth(this.currentYear, this.currentMonth);
        let present = 0, paidLeave = 0, holidays = 0, hWorking = 0, halfDays = 0;
        let standardOtHours = 0, hWorkingSpecialOtHours = 0, sOtHours = 0;

        empAttendance.forEach(record => {
            switch (record.status) {
                case 'Present': present++; break;
                case 'Paid Leave': paidLeave++; break;
                case 'Half Day': halfDays++; break;
                case 'Holiday': holidays++; break;
                case 'H-Working':
                    hWorking++;
                    break;
            }
            const hours = parseFloat(record.otHours || 0) || 0;
            const dateObj = new Date(record.date);
            const isSunday = DataManager.isSunday(dateObj);
            const isHoliday = DataManager.isHoliday(dateObj);

            if (record.status === 'H-Working' && record.overTime === 'H-Working') hWorkingSpecialOtHours += hours;
            else if (isSunday && !isHoliday && record.status === 'Present') sOtHours += hours;
            else standardOtHours += hours;
        });

        const totalOtHours = standardOtHours + hWorkingSpecialOtHours + sOtHours;

        let paidDays = 0;
        let earnedBasic = 0;

        if (employee.salaryType === 'daily') {
            paidDays = present + hWorking + (halfDays * 0.5);
            earnedBasic = paidDays * baseSalary;
        } else {
            paidDays = present + paidLeave + holidays + (halfDays * 0.5) + 2 * hWorking;
            earnedBasic = paidDays * (baseSalary / daysInMonth);
        }

        const otBreakdown = DataManager.calculateOTPay(totalOtHours, baseSalary, employee.salaryType, {
            hWorkingOtHours: hWorkingSpecialOtHours,
            sOtHours: sOtHours,
            settings,
            returnBreakdown: true
        });

        const totalAdvance = await DataManager.getTotalAdvanceForEmployee(employee.name, this.currentYear, this.currentMonth);
        const storedDebit = await DataManager.getDebitedAdvance(employee.name, this.currentYear, this.currentMonth);

        // PF/ESI
        const pf = 0;
        const esi = this._getESIDeduction(baseSalary, employee);

        return {
            basic: earnedBasic,
            otAmount: otBreakdown.totalPay,
            allowances: 0,
            gross: earnedBasic + otBreakdown.totalPay,
            pf: pf,
            esi: esi,
            advanceDeduction: storedDebit,
            net: (earnedBasic + otBreakdown.totalPay) - pf - esi - storedDebit
        };
    },

    cancelSalaryPayout() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees to Cancel Payout - ${months[this.currentMonth]} ${this.currentYear}`;

        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees) => {
                if (confirm(`Are you sure you want to cancel the salary payout for ${selectedEmployees.length} employees? This will revert their advance deductions and waivers for this month.`)) {
                    AuthManager.requireAuth(async () => {
                        await DataManager.cancelSalaryPayout(this.currentYear, this.currentMonth, selectedEmployees);
                        App.showNotification('Salary payout cancelled for selected employees', 'success');
                        await this.renderSalaryView(); // Refresh view
                    });
                }
            },
            title,
            'Cancel Payout',
            this.currentYear,
            this.currentMonth,
            true // onlyPaidEmployees - only show employees with active payouts
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

    async showStatusCalendar(employeeName, statusType) {
        // Ensure modal exists
        this._createStatusCalendarModal();
        const modal = new bootstrap.Modal(document.getElementById('statusCalendarModal'));
        const modalTitle = document.getElementById('statusCalendarModalLabel');
        const modalBody = document.getElementById('statusCalendarModalBody');

        modalTitle.textContent = `${statusType} Details - ${employeeName}`;
        modalBody.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div></div>';

        modal.show(); // Show loading first

        try {
            const [employees, allAttendance, settings] = await Promise.all([
                DataManager.getEmployees(),
                DataManager.getAttendance(),
                DataManager.getSettings()
            ]);

            const employee = employees.find(e => e.name === employeeName);

            console.log('showStatusCalendar: Data loaded', {
                allAttendanceLength: Array.isArray(allAttendance) ? allAttendance.length : 'Not Array',
                employee: employee ? employee.name : 'Not Found',
                salaryType: employee ? employee.salaryType : 'N/A'
            });
            const context = {
                allAttendance,
                salaryPayouts: settings.salaryPayouts || {}
            };

            let htmlContent = '';

            // Check if Daily Pay employee with accumulation
            if (employee && employee.salaryType === 'daily') {
                const accumulatedData = this.calculateAccumulatedDays(employee, this.currentYear, this.currentMonth, context);
                console.log('showStatusCalendar: Accumulated Data', accumulatedData);

                if (accumulatedData && accumulatedData.monthsAccumulated > 0) {
                    let startMonth = this.currentMonth;
                    let startYear = this.currentYear;

                    // We need to loop just like calculateAccumulatedDays to get the correct sequence
                    // Since calculateAccumulatedDays returns the COUNT of months, we can just iterate that many times backwards

                    for (let i = 0; i < accumulatedData.monthsAccumulated; i++) {
                        console.log(`Rendering Month ${i}: ${startMonth}/${startYear}`);
                        // Correctly await DataManager call
                        const attendance = await DataManager.getAttendanceByMonth(startYear, startMonth);
                        let empAttendance = Array.isArray(attendance) ? attendance.filter(a => a.employee === employeeName) : [];

                        // Deduplicate (Safe local date)
                        const uniqueMap = new Map();
                        empAttendance.forEach(r => {
                            const d = new Date(r.date);
                            uniqueMap.set(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r);
                        });
                        empAttendance = Array.from(uniqueMap.values());

                        console.log(`Month ${i} Attendance (Unique):`, empAttendance.length);
                        const filteredAttendance = this._filterAttendanceByStatus(empAttendance, statusType);

                        htmlContent += this._renderStatusCalendar(filteredAttendance, statusType, startYear, startMonth);
                        htmlContent += '<hr class="my-3">';

                        // Move to previous month
                        startMonth--;
                        if (startMonth < 0) { startMonth = 11; startYear--; }
                    }
                } else {
                    // Fallback if no accumulation detected (should generally not happen if type is daily, but handled just in case)
                    const attendance = await DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);
                    let empAttendance = Array.isArray(attendance) ? attendance.filter(a => a.employee === employeeName) : [];

                    // Deduplicate (Safe local date)
                    const uniqueMap = new Map();
                    empAttendance.forEach(r => {
                        const d = new Date(r.date);
                        uniqueMap.set(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r);
                    });
                    empAttendance = Array.from(uniqueMap.values());

                    const filteredAttendance = this._filterAttendanceByStatus(empAttendance, statusType);
                    htmlContent = this._renderStatusCalendar(filteredAttendance, statusType, this.currentYear, this.currentMonth);
                }
            } else {
                // Monthly Employee (Standard)
                const attendance = await DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);
                let empAttendance = Array.isArray(attendance) ? attendance.filter(a => a.employee === employeeName) : [];

                // Deduplicate (Safe local date)
                const uniqueMap = new Map();
                empAttendance.forEach(r => {
                    const d = new Date(r.date);
                    uniqueMap.set(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r);
                });
                empAttendance = Array.from(uniqueMap.values());

                const filteredAttendance = this._filterAttendanceByStatus(empAttendance, statusType);
                htmlContent = this._renderStatusCalendar(filteredAttendance, statusType, this.currentYear, this.currentMonth);
            }

            modalBody.innerHTML = htmlContent || '<div class="alert alert-warning">No data found</div>';

        } catch (error) {
            console.error('Error showing status calendar:', error);
            modalBody.innerHTML = `<div class="alert alert-danger">Error loading data: ${error.message}</div>`;
        }
    },

    _filterAttendanceByStatus(attendance, statusType) {
        return attendance.filter(record => {
            const hours = parseFloat(record.otHours || 0) || 0;
            const dateObj = new Date(record.date);
            const isSunday = DataManager.isSunday(dateObj);
            const isHoliday = DataManager.isHoliday(dateObj);

            // Determine specific OT type for this record (Logic from _generateRowHTML)
            let isHOt = (record.status === 'H-Working' && record.overTime === 'H-Working');
            let isSOt = (isSunday && !isHoliday && record.status === 'Present');
            let isStandardOt = (hours > 0 && !isHOt && !isSOt);

            switch (statusType) {
                case 'Present':
                    return record.status === 'Present';

                case 'Paid Leave':
                case 'Unpaid Leave':
                case 'Sick Leave':
                case 'Half Days':
                case 'Holidays':
                    // Note: 'Half Days' label in table matches 'Half Day' status check usually, but let's be safe
                    if (statusType === 'Half Days') return record.status === 'Half Day';
                    if (statusType === 'Holidays') return record.status === 'Holiday';
                    return record.status === statusType;

                case 'H-Working':
                    return record.status === 'H-Working';

                case 'OT Hours':
                    // Should ONLY show Standard OT records
                    return isStandardOt;

                case 'H-OT Hours':
                    // Should ONLY show H-OT records
                    return isHOt && hours > 0;

                case 'Total OT Hours':
                    return hours > 0;

                default:
                    return false;
            }
        });
    },

    _renderStatusCalendar(attendance, statusType, year, month) {
        const targetYear = year !== undefined ? year : this.currentYear;
        const targetMonth = month !== undefined ? month : this.currentMonth;

        const daysInMonth = DataManager.getDaysInMonth(targetYear, targetMonth);
        const firstDay = new Date(targetYear, targetMonth, 1).getDay();

        // Create map of relevant dates
        const relevantDates = new Set(attendance.map(r => new Date(r.date).getDate()));

        // For OT Hours, we might want to show the hours
        const otMap = {};
        if (statusType === 'OT Hours' || statusType === 'H-OT Hours' || statusType === 'Total OT Hours') {
            attendance.forEach(r => {
                otMap[new Date(r.date).getDate()] = parseFloat(r.otHours || 0);
            });
        }

        let calendarHTML = '<div class="calendar-container mb-4">';

        // Month Header
        calendarHTML += `<h6 class="text-center text-primary mb-2">${new Date(targetYear, targetMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</h6>`;

        // Legend/Summary
        calendarHTML += `
            <div class="alert alert-info mb-3 d-flex align-items-center py-2">
                <i class="bi bi-info-circle me-2"></i>
                <div class="small">
                    <strong>Total Days: ${attendance.length}</strong>
                    ${(statusType === 'OT Hours' || statusType === 'H-OT Hours' || statusType === 'Total OT Hours') ? `<br>Total Hours: ${attendance.reduce((sum, r) => sum + parseFloat(r.otHours || 0), 0).toFixed(2)}` : ''}
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

            const date = new Date(targetYear, targetMonth, day);
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
                    ${(statusType === 'OT Hours' || statusType === 'H-OT Hours' || statusType === 'Total OT Hours') && isRelevant ? `<small class="text-white" style="font-size: 0.7rem;">${otMap[day]}h</small>` : ''}
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
                H-OT and Standard OT rates follow the configured OT calculation method.
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
    calculateAccumulatedDays(employee, currentYear, currentMonth, context = null) {
        if (!employee) {
            return null;
        }

        const employeeName = employee.name;

        // Get date of joining to limit how far back we look
        const doj = employee.dateOfJoining ? new Date(employee.dateOfJoining) : null;

        let totalPresent = 0, totalPaidLeave = 0, totalUnpaidLeave = 0, totalSickLeave = 0, totalHalfDays = 0, totalHolidays = 0, totalHWorking = 0, totalOTHours = 0, totalHWorkingSpecialOtHours = 0;
        let monthsAccumulated = 0;
        let accumulatedMonthNames = [];
        let debugInfo = [];
        let startMonth = currentMonth;
        let startYear = currentYear;

        // Limit iterations to prevent performance issues
        const maxIterations = 12;

        // Use pre-fetched data from context. mandatory for synchronous calculation
        const allAttendance = (context && Array.isArray(context.allAttendance)) ? context.allAttendance : [];

        if (allAttendance.length === 0 && (!context || !context.allAttendance)) {
            console.error('calculateAccumulatedDays: Missing context.allAttendance', { context });
            return null;
        }

        const salaryPayouts = context ? context.salaryPayouts : (DataManager.getSettings().salaryPayouts || {});

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Go back month by month until we find a paid month or reach 12 months back or date of joining
        for (let i = 0; i < maxIterations; i++) {
            // Check if this month's salary has been paid out FOR THIS EMPLOYEE
            // OPTIMIZATION: Use pre-fetched settings
            const payoutKey = `${startYear}_${startMonth}`;
            const payoutInfo = salaryPayouts[payoutKey];
            let isEmployeePaid = false;

            if (payoutInfo && payoutInfo.done) {
                // If employees list exists, check if included. If not exists (legacy), assume paid.
                if (Array.isArray(payoutInfo.employees)) {
                    isEmployeePaid = payoutInfo.employees.includes(employeeName);
                } else {
                    isEmployeePaid = true;
                }
            }

            const currentMonthName = `${months[startMonth]} ${startYear}`;

            // Check if this month is before date of joining
            if (doj) {
                // Check against the last day of the month to ensure we include the joining month
                const checkDate = new Date(startYear, startMonth + 1, 0);
                if (checkDate < doj) {
                    debugInfo.push(`${currentMonthName}: Before DOJ`);
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
            // But ALWAYS process the current month (i === 0) even if there's no attendance
            if (isEmployeePaid && monthAttendance.length === 0 && i > 0) {
                debugInfo.push(`${currentMonthName}: Paid + No Attendance (stopped)`);
                break;
            }

            // CRITICAL FIX: If we encounter a paid month while going back (i > 0), 
            // we must STOP immediately and NOT include it.
            // If i === 0, it means we are viewing the current month. 
            // If the current month is paid, we still show it (it's just a historical view).
            if (isEmployeePaid && i > 0) {
                debugInfo.push(`${currentMonthName}: Already Paid (stopped)`);
                break;
            }

            // Deduplicate monthAttendance by date
            const uniqueMonthAttendanceMap = new Map();
            monthAttendance.forEach(r => {
                const d = new Date(r.date);
                uniqueMonthAttendanceMap.set(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r);
            });
            const uniqueMonthAttendance = Array.from(uniqueMonthAttendanceMap.values());

            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeave = 0, halfDays = 0, holidays = 0, hWorking = 0, standardOtHours = 0, hWorkingSpecialOtHours = 0;

            uniqueMonthAttendance.forEach(record => {
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

            // Add month name to list (e.g., "Jan 2023")
            const monthName = new Date(startYear, startMonth).toLocaleString('default', { month: 'short', year: 'numeric' });
            accumulatedMonthNames.push(monthName);
            debugInfo.push(`${currentMonthName}: INCLUDED (Present:${present}, Attendance:${monthAttendance.length}, Paid:${isEmployeePaid})`);

            // If this month was paid, stop accumulating
            if (isEmployeePaid) {
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
            monthsAccumulated,
            accumulatedMonthNames: accumulatedMonthNames.reverse(),
            debugInfo: debugInfo.join(' | ')
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

    editBaseSalary(employeeName, currentSalary, salaryType = 'monthly') {
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
        const now = new Date();
        const fromDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const toDefault = fromDefault;
        const modalId = 'salaryAnnualRangeModal';
        document.getElementById(modalId)?.remove();
        const html = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-calendar-range me-2"></i>Annual Report Range</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-3">
                                <div class="col-6">
                                    <label class="form-label">Start Month *</label>
                                    <input type="month" class="form-control" id="salaryAnnualFrom" value="${fromDefault}">
                                </div>
                                <div class="col-6">
                                    <label class="form-label">End Month *</label>
                                    <input type="month" class="form-control" id="salaryAnnualTo" value="${toDefault}">
                                </div>
                            </div>
                            <small class="text-muted d-block mt-2">Report will include attendance and salary totals between the selected months.</small>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="salaryAnnualContinueBtn">Continue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        const el = document.getElementById(modalId);
        const bs = new bootstrap.Modal(el);
        bs.show();
        document.getElementById('salaryAnnualContinueBtn')?.addEventListener('click', () => {
            const fromVal = document.getElementById('salaryAnnualFrom')?.value || '';
            const toVal = document.getElementById('salaryAnnualTo')?.value || '';
            if (!fromVal || !toVal) {
                App.showNotification('Please select start and end month.', 'error');
                return;
            }
            if (fromVal > toVal) {
                App.showNotification('End month must be greater than or equal to start month.', 'error');
                return;
            }
            const [startYear, startMonth] = fromVal.split('-').map(Number);
            const [endYear, endMonth] = toVal.split('-').map(Number);
            bs.hide();
            ReportsModule.showEmployeeSelectionModal(
                (selectedEmployees) => {
                    ReportsModule.generateAnnualPDF(startYear, endYear, selectedEmployees, startMonth - 1, endMonth - 1);
                },
                `Select Employees for Annual PDF (${fromVal} to ${toVal})`
            );
        });
        el.addEventListener('hidden.bs.modal', () => el.remove(), { once: true });
    },

    // Generate payslips only after salary payout is done for the selected month
    async generatePayslips() {
        const monthInput = document.getElementById('salaryMonthYear');
        if (!monthInput || !monthInput.value) {
            App.showNotification('Please select a month-year before generating payslips', 'error');
            return;
        }

        const [year, month] = monthInput.value.split('-').map(Number);
        const monthIndex = month - 1;

        const isPayoutDone = await DataManager.isSalaryPayoutDone(year, monthIndex);
        const hasAnyPayout = await DataManager.hasAnySalaryPayout(year, monthIndex);

        if (!isPayoutDone && !hasAnyPayout) {
            App.showNotification('Please generate Salary Payout for this month before generating payslips', 'error');
            return;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees for Payslips - ${months[monthIndex]} ${year}`;

        ReportsModule.showEmployeeSelectionModal(
            (selectedEmployees, action) => {
                ReportsModule.generatePayslips(year, monthIndex, selectedEmployees, action);
            },
            title,
            [
                { label: 'Generate Payslip', class: 'btn-info text-white', action: 'preview' },
                { label: 'Generate PDF', class: 'btn-primary', action: 'download' },
                { label: 'Generate PDF & Email', class: 'btn-success', action: 'email' }
            ],
            year,
            monthIndex,
            true // onlyPaidEmployees - only show employees with active payouts
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
        console.log('Navigating to employee view for:', employeeName);
        App.showView('employeeView');
        EmployeeViewModule.load(employeeName);
    },

    // PHASE 3: Bulk remittance function (to be implemented in Phase 4)
    // PHASE 4: Bulk Remittance
    async bulkRemittance() {
        const isPayoutDone = await DataManager.isSalaryPayoutDone(this.currentYear, this.currentMonth);
        if (!isPayoutDone) {
            App.showNotification('Please generate salary payout first.', 'error');
            return;
        }

        const payoutDetails = await DataManager.getSalaryPayoutDetails(this.currentYear, this.currentMonth);
        const allEmployees = await DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);

        // Filter employees who are in the payout AND have bank payment mode
        const payoutEmployeeNames = payoutDetails.employees || [];
        const validEmployees = allEmployees.filter(emp =>
            payoutEmployeeNames.includes(emp.name) &&
            emp.paymentMode === 'bank' &&
            emp.bank &&
            emp.bank.accountNo
        );

        if (validEmployees.length === 0) {
            App.showNotification('No employees with bank details found in this payout.', 'warning');
            return;
        }

        // Fetch salary data for all valid employees BEFORE creating modal
        const employeesWithSalary = await Promise.all(validEmployees.map(async (emp) => {
            const salaryData = await ReportsModule.getSalaryPayoutData(this.currentYear, this.currentMonth, [emp.name]);
            const empSalaryData = salaryData[0] || {};
            return {
                ...emp,
                netSalary: empSalaryData.netSalary || 0,
                basePay: empSalaryData.basePay || 0,
                otPay: empSalaryData.otPay || 0
            };
        }));

        // Calculate total amount from fetched salary data
        const totalAmount = employeesWithSalary.reduce((sum, emp) => sum + (emp.netSalary || 0), 0);

        // Create Modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'bulkRemittanceModal';

        const templates = BankTemplates.getAllTemplates();
        const options = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-bank"></i> Generate Bulk Remittance File</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <div class="d-flex justify-content-between mb-1">
                                <span><strong>Employees:</strong></span>
                                <span>${employeesWithSalary.length}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span><strong>Total Amount:</strong></span>
                                <span>${this.formatCurrency(totalAmount)}</span>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">Select Bank Format</label>
                            <select class="form-select" id="bankTemplateSelect">
                                ${options}
                            </select>
                            <div class="form-text" id="templateDescription">
                                ${templates[0].description}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" onclick="SalaryModule.downloadRemittanceFile()">
                            <i class="bi bi-download"></i> Download .csv
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listener to update description
        const select = modal.querySelector('#bankTemplateSelect');
        const desc = modal.querySelector('#templateDescription');
        select.addEventListener('change', (e) => {
            const template = BankTemplates.getTemplate(e.target.value);
            desc.textContent = template.description;
        });

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());

        // Store data for download (already fetched above)
        this.currentRemittanceData = {
            employees: employeesWithSalary,
            payoutDetails: payoutDetails
        };
    },

    downloadRemittanceFile() {
        const select = document.getElementById('bankTemplateSelect');
        const templateId = select.value;
        const template = BankTemplates.getTemplate(templateId);

        const { employees, payoutDetails } = this.currentRemittanceData;
        const csvContent = BankTemplates.generateCSV(templateId, employees, payoutDetails);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[this.currentMonth];
        const filename = `Salary_Remittance_${template.name.replace(/\s+/g, '_')}_${monthName}_${this.currentYear}.csv`;

        // Trigger Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // Close modal
        const modalEl = document.getElementById('bulkRemittanceModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();

        App.showNotification('Remittance file downloaded successfully', 'success');
    }
};

// Expose to window for onclick handlers
window.SalaryModule = SalaryModule;
