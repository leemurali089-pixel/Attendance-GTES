// PDF Report Generation Module
const ReportsModule = {
    selectedEmployeesForPDF: [],
    pendingSalaryPayout: null,
    currentSelectionCallback: null,
    salaryPayoutModalFullscreen: false,

    showEmployeeSelectionModal(callback, title = 'Select Employees for PDF', confirmLabel = 'Generate PDF', year = null, month = null) {
        // Get employees - filter by month if year and month are provided
        let employees;
        if (year !== null && month !== null) {
            employees = DataManager.getEmployeesActiveInMonth(year, month);
        } else {
            employees = DataManager.getActiveEmployees();
        }

        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'employeeSelectionModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <button class="btn btn-sm btn-primary" onclick="ReportsModule.selectAllEmployees()">Select All</button>
                            <button class="btn btn-sm btn-secondary" onclick="ReportsModule.deselectAllEmployees()">Deselect All</button>
                        </div>
                        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-sm">
                                <thead class="table-light sticky-top">
                                    <tr>
                                        <th style="width: 30px;"><input type="checkbox" id="selectAllEmployeesCheckbox" onchange="ReportsModule.toggleAllEmployees(this)"></th>
                                        <th>Employee Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${employees.map(emp => `
                                        <tr>
                                            <td><input type="checkbox" class="employee-select-checkbox" value="${emp.name.replace(/"/g, '&quot;')}" ${this.selectedEmployeesForPDF.includes(emp.name) ? 'checked' : ''}></td>
                                            <td>${emp.name}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="ReportsModule.confirmEmployeeSelection(${callback.toString().replace(/"/g, '&quot;')})">${confirmLabel}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        if (typeof callback === 'function') {
            this.currentSelectionCallback = callback;
        } else {
            this.currentSelectionCallback = null;
        }

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    },

    selectAllEmployees() {
        document.querySelectorAll('.employee-select-checkbox').forEach(cb => cb.checked = true);
        document.getElementById('selectAllEmployeesCheckbox').checked = true;
    },

    deselectAllEmployees() {
        document.querySelectorAll('.employee-select-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('selectAllEmployeesCheckbox').checked = false;
    },

    toggleAllEmployees(checkbox) {
        document.querySelectorAll('.employee-select-checkbox').forEach(cb => cb.checked = checkbox.checked);
    },

    confirmEmployeeSelection() {
        const selected = [];
        document.querySelectorAll('.employee-select-checkbox:checked').forEach(cb => {
            selected.push(cb.value);
        });

        if (selected.length === 0) {
            App.showNotification('Please select at least one employee', 'error');
            return;
        }

        this.selectedEmployeesForPDF = selected;

        // Get callback from modal
        const modalElement = document.getElementById('employeeSelectionModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) modal.hide();
        if (modalElement) {
            modalElement.addEventListener('hidden.bs.modal', () => modalElement.remove(), { once: true });
        }

        if (typeof this.currentSelectionCallback === 'function') {
            try {
                this.currentSelectionCallback(selected);
            } catch (error) {
                console.error('Error executing selection callback:', error);
            }
        }
        this.currentSelectionCallback = null;
    },

    formatCurrency(value) {
        return `₹${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    },

    startSalaryPayoutFlow(year, month) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees for Salary Payout - ${months[month]} ${year}`;

        // Check if payout already exists
        if (DataManager.isSalaryPayoutDone(year, month)) {
            if (!confirm(`Salary payout for ${months[month]} ${year} has already been generated. Do you want to regenerate it? \n\nWARNING: This will overwrite the previous payout data.`)) {
                return;
            }
        }

        this.showEmployeeSelectionModal(
            (selectedEmployees) => {
                ReportsModule.handleSalaryPayoutSelection(year, month, selectedEmployees);
            },
            title,
            'Next',
            year,  // Pass year for filtering
            month  // Pass month for filtering
        );
    },

    handleSalaryPayoutSelection(year, month, selectedEmployees) {
        if (!selectedEmployees || selectedEmployees.length === 0) {
            App.showNotification('Please select at least one employee', 'error');
            return;
        }

        const employeesData = this.getSalaryPayoutData(year, month, selectedEmployees);
        if (!employeesData.length) {
            App.showNotification('No employees available for payout', 'warning');
            return;
        }

        this.pendingSalaryPayout = {
            year,
            month,
            selectedEmployees,
            employees: employeesData
        };

        this.showSalaryPayoutReview();
    },

    showSalaryPayoutReview() {
        if (!this.pendingSalaryPayout) return;
        const { year, month } = this.pendingSalaryPayout;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Review Salary Payout - ${months[month]} ${year}`;

        let modal = document.getElementById('salaryPayoutReviewModal');
        if (modal) {
            modal.remove();
        }

        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'salaryPayoutReviewModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-xxl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title mb-0">${title}</h5>
                        <div class="ms-auto d-flex align-items-center gap-2">
                            <button type="button"
                                    class="btn btn-sm btn-outline-secondary"
                                    id="payoutSizeToggleBtn"
                                    onclick="ReportsModule.toggleSalaryPayoutModalSize()">
                                <i class="bi bi-arrows-fullscreen"></i> Expand
                            </button>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            Review the attendance, leave, OT and advance details for each employee. Specify the advance amount to debit for this month. Remaining balance will be carried forward automatically.
                        </div>
                        <div class="row mb-3">
                            <div class="col-md-4">
                                <label for="salaryCreditDate" class="form-label">Salary Credit Date</label>
                                <input type="date" class="form-control" id="salaryCreditDate" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                        </div>
                        <div id="salaryPayoutReviewContent"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="ReportsModule.confirmSalaryPayoutGeneration()">Generate Salary Payout</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const dialog = modal.querySelector('.modal-dialog');
        const toggleBtn = modal.querySelector('#payoutSizeToggleBtn');
        if (dialog) {
            if (this.salaryPayoutModalFullscreen) {
                dialog.classList.add('modal-fullscreen');
            }
        }
        if (toggleBtn) {
            toggleBtn.innerHTML = this.salaryPayoutModalFullscreen
                ? '<i class="bi bi-fullscreen-exit"></i> Exit Full Screen'
                : '<i class="bi bi-arrows-fullscreen"></i> Expand';
        }

        const bsModal = new bootstrap.Modal(modal, { backdrop: 'static' });
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
            this.pendingSalaryPayout = null;
        });

        this.renderSalaryPayoutReviewContent();
    },

    toggleSalaryPayoutModalSize() {
        const modal = document.getElementById('salaryPayoutReviewModal');
        if (!modal) return;
        const dialog = modal.querySelector('.modal-dialog');
        const btn = modal.querySelector('#payoutSizeToggleBtn');
        this.salaryPayoutModalFullscreen = !this.salaryPayoutModalFullscreen;
        if (dialog) {
            dialog.classList.toggle('modal-fullscreen', this.salaryPayoutModalFullscreen);
        }
        if (btn) {
            btn.innerHTML = this.salaryPayoutModalFullscreen
                ? '<i class="bi bi-fullscreen-exit"></i> Exit Full Screen'
                : '<i class="bi bi-arrows-fullscreen"></i> Expand';
        }
    },

    renderSalaryPayoutReviewContent() {
        if (!this.pendingSalaryPayout) return;
        const container = document.getElementById('salaryPayoutReviewContent');
        if (!container) return;

        const data = this.pendingSalaryPayout.employees || [];
        if (!data.length) {
            container.innerHTML = '<div class="alert alert-warning mb-0">No employees selected.</div>';
            return;
        }

        let totalBasePay = 0;
        let totalOTPay = 0;
        let totalDebit = 0;
        let totalWaived = 0;
        let totalNetSalary = 0;
        let totalStandardOtHours = 0;
        let totalHWorkingOtHours = 0;
        let totalStandardOtPay = 0;
        let totalHWorkingOtPay = 0;

        const rows = data.map(emp => {
            const carryForwardBefore = emp.carryForwardBefore ?? emp.outstandingBefore ?? 0;

            // Handle Free Funds (Waived Advance)
            let waivedAmount = parseFloat(emp.waivedAmount);
            if (isNaN(waivedAmount)) waivedAmount = 0;
            waivedAmount = Math.min(Math.max(waivedAmount, 0), carryForwardBefore);
            emp.waivedAmount = waivedAmount;

            // Calculate new outstanding after waiver
            const outstandingAfterWaiver = Math.max(carryForwardBefore - waivedAmount, 0);
            const maxDebit = outstandingAfterWaiver;
            emp.maxDebit = maxDebit;

            let debitAmount = parseFloat(emp.debitAmount);
            if (isNaN(debitAmount)) debitAmount = 0;
            debitAmount = Math.min(Math.max(debitAmount, 0), maxDebit);
            emp.debitAmount = debitAmount;

            emp.carryForwardAfter = Math.max(outstandingAfterWaiver - debitAmount, 0);
            emp.netSalary = Math.max(emp.salaryBeforeAdvance - debitAmount, 0);

            totalBasePay += emp.basePay;
            totalOTPay += emp.otPay;
            totalDebit += emp.debitAmount;
            totalWaived += emp.waivedAmount;
            totalNetSalary += emp.netSalary;
            totalStandardOtHours += emp.standardOtHours || 0;
            totalHWorkingOtHours += emp.hWorkingOtHours || 0;
            totalStandardOtPay += emp.standardOtPay || 0;
            totalHWorkingOtPay += emp.hWorkingOtPay || 0;

            const safeName = emp.name.replace(/'/g, "\\'");

            return `
                <tr>
                    <td>${emp.name}</td>
                    <td class="text-center">${emp.present}</td>
                    <td class="text-center">${emp.paidLeave}</td>
                    <td class="text-center">${emp.unpaidLeave}</td>
                    <td class="text-center">${emp.sickLeaves || 0}</td>
                    <td class="text-center">${emp.halfDays}</td>
                    <td class="text-center">${emp.holidays}</td>
                    <td class="text-center">${emp.holidayWorking}</td>
                    <td class="text-center">${emp.otHours.toFixed(2)}</td>
                    <td class="text-center text-primary fw-semibold">${(emp.standardOtHours || 0).toFixed(2)}</td>
                    <td class="text-center text-info fw-semibold">${(emp.hWorkingOtHours || 0).toFixed(2)}</td>
                    <td class="text-end">${this.formatCurrency(emp.standardOtPay || 0)}</td>
                    <td class="text-end">${this.formatCurrency(emp.hWorkingOtPay || 0)}</td>
                    <td class="text-end">${this.formatCurrency(emp.advanceThisMonth || 0)}</td>
                    <td class="text-end">${this.formatCurrency(emp.carryForwardPrevious || 0)}</td>
                    <td class="text-end">${this.formatCurrency(carryForwardBefore)}</td>
                    <td>
                        <div class="input-group input-group-sm" style="min-width: 120px;">
                            <span class="input-group-text">₹</span>
                            <input type="number"
                                   class="form-control form-control-sm"
                                   min="0"
                                   max="${carryForwardBefore.toFixed(2)}"
                                   step="0.01"
                                   value="${waivedAmount.toFixed(2)}"
                                   onchange="ReportsModule.updatePayoutFreeFunds('${safeName}', this.value)">
                        </div>
                    </td>
                    <td>
                        <div class="input-group input-group-sm" style="min-width: 120px;">
                            <span class="input-group-text">₹</span>
                            <input type="number"
                                   class="form-control form-control-sm"
                                   min="0"
                                   max="${maxDebit.toFixed(2)}"
                                   step="0.01"
                                   value="${debitAmount.toFixed(2)}"
                                   onchange="ReportsModule.updatePayoutDebit('${safeName}', this.value)">
                        </div>
                        <small class="text-muted">Max: ${this.formatCurrency(maxDebit)}</small>
                    </td>
                    <td class="text-end">${this.formatCurrency(emp.carryForwardAfter)}</td>
                    <td class="text-end">${this.formatCurrency(emp.basePay)}</td>
                    <td class="text-end">${this.formatCurrency(emp.otPay)}</td>
                    <td class="text-end">${this.formatCurrency(emp.netSalary)}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered align-middle">
                    <thead class="table-light">
                        <tr>
                            <th>Employee</th>
                            <th class="text-center">Present</th>
                            <th class="text-center">Paid Leave</th>
                            <th class="text-center">Unpaid Leave</th>
                            <th class="text-center">Sick Leave</th>
                            <th class="text-center">Half Days</th>
                            <th class="text-center">Holidays</th>
                            <th class="text-center">Holiday Working</th>
                            <th class="text-center">OT Hours</th>
                            <th class="text-center">Std OT Hours</th>
                            <th class="text-center">H-OT Hours</th>
                            <th class="text-end">Std OT Pay</th>
                            <th class="text-end">H-OT Pay</th>
                            <th class="text-end">Advance (This Month)</th>
                            <th class="text-end">Carry Forward (Prev)</th>
                            <th class="text-end">Outstanding Before</th>
                            <th class="text-center">Free Funds / Waive</th>
                            <th class="text-center">Debit This Month</th>
                            <th class="text-end">Carry Forward (Next)</th>
                            <th class="text-end">Base Pay</th>
                            <th class="text-end">OT Pay</th>
                            <th class="text-end">Net Salary</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot class="table-secondary">
                        <tr>
                            <th colspan="9" class="text-end">Totals</th>
                            <th class="text-center">${totalStandardOtHours.toFixed(2)}</th>
                            <th class="text-center">${totalHWorkingOtHours.toFixed(2)}</th>
                            <th class="text-end">${this.formatCurrency(totalStandardOtPay)}</th>
                            <th class="text-end">${this.formatCurrency(totalHWorkingOtPay)}</th>
                            <th class="text-end"></th>
                            <th class="text-end"></th>
                            <th class="text-end"></th>
                            <th class="text-end">${this.formatCurrency(totalWaived)}</th>
                            <th class="text-end">${this.formatCurrency(totalDebit)}</th>
                            <th class="text-end"></th>
                            <th class="text-end">${this.formatCurrency(totalBasePay)}</th>
                            <th class="text-end">${this.formatCurrency(totalOTPay)}</th>
                            <th class="text-end">${this.formatCurrency(totalNetSalary)}</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    },

    updatePayoutFreeFunds(employeeName, value) {
        if (!this.pendingSalaryPayout) return;
        const emp = this.pendingSalaryPayout.employees.find(e => e.name === employeeName);
        if (!emp) return;

        const numericValue = parseFloat(value);
        emp.waivedAmount = isNaN(numericValue) ? 0 : numericValue;

        // Recalculate debit if it exceeds new max
        const carryForwardBefore = emp.carryForwardBefore ?? emp.outstandingBefore ?? 0;
        const outstandingAfterWaiver = Math.max(carryForwardBefore - emp.waivedAmount, 0);
        if (emp.debitAmount > outstandingAfterWaiver) {
            emp.debitAmount = outstandingAfterWaiver;
        }

        this.renderSalaryPayoutReviewContent();
    },

    updatePayoutDebit(employeeName, value) {
        if (!this.pendingSalaryPayout) return;
        const emp = this.pendingSalaryPayout.employees.find(e => e.name === employeeName);
        if (!emp) return;

        const numericValue = parseFloat(value);
        emp.debitAmount = isNaN(numericValue) ? 0 : numericValue;
        this.renderSalaryPayoutReviewContent();
    },

    confirmSalaryPayoutGeneration() {
        if (!this.pendingSalaryPayout || !this.pendingSalaryPayout.employees.length) {
            App.showNotification('No employees selected for payout', 'error');
            return;
        }

        const creditDateInput = document.getElementById('salaryCreditDate');
        const creditDate = creditDateInput ? creditDateInput.value : null;

        if (!creditDate) {
            App.showNotification('Please select a Salary Credit Date', 'error');
            return;
        }

        const { year, month, selectedEmployees, employees } = this.pendingSalaryPayout;
        const advances = DataManager.getAdvances(); // Get current advances

        employees.forEach(emp => {
            const carryForwardBefore = emp.carryForwardBefore ?? emp.outstandingBefore ?? 0;

            // Handle Free Funds
            let waivedAmount = parseFloat(emp.waivedAmount);
            if (isNaN(waivedAmount)) waivedAmount = 0;
            waivedAmount = Math.min(Math.max(waivedAmount, 0), carryForwardBefore);
            emp.waivedAmount = waivedAmount;

            // Create a separate wave-off entry if amount > 0
            if (waivedAmount > 0) {
                const waveOffEntry = {
                    id: 'adv_waveoff_payout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    date: DataManager.formatDate(new Date()), // Use current date for the transaction
                    employee: emp.name,
                    amount: -waivedAmount, // Negative amount for deduction
                    reason: `Waived during Salary Payout (${DataManager.formatMonthYear(year, month)})`,
                    type: 'waveoff'
                };
                advances.push(waveOffEntry);
            }

            const outstandingAfterWaiver = Math.max(carryForwardBefore - waivedAmount, 0);
            const maxDebit = outstandingAfterWaiver;

            let debitAmount = parseFloat(emp.debitAmount);
            if (isNaN(debitAmount)) debitAmount = 0;
            debitAmount = Math.min(Math.max(debitAmount, 0), maxDebit);
            emp.debitAmount = debitAmount;

            emp.carryForwardAfter = Math.max(outstandingAfterWaiver - debitAmount, 0);
            emp.netSalary = Math.max(emp.salaryBeforeAdvance - debitAmount, 0);

            DataManager.saveDebitedAdvance(emp.name, year, month, debitAmount);
            DataManager.saveWaivedAdvance(emp.name, year, month, waivedAmount);
        });

        DataManager.saveAdvances(advances); // Save all new wave-off entries

        this.generateSalaryPayout(year, month, {
            selectedEmployees,
            payoutData: employees,
            creditDate: creditDate
        });

        const modalElement = document.getElementById('salaryPayoutReviewModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
        }

        this.pendingSalaryPayout = null;
        App.showNotification('Salary payout generated successfully', 'success');
    },

    getSalaryPayoutData(year, month, selectedEmployees = null) {
        const allEmployees = DataManager.getEmployeesActiveInMonth(year, month);
        const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
        const attendance = DataManager.getAttendanceByMonth(year, month);
        const daysInMonth = DataManager.getDaysInMonth(year, month);
        const settings = DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};

        return employees.map(emp => {
            const empAttendance = attendance.filter(a => a.employee === emp.name);

            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeaves = 0, halfDays = 0, holidays = 0, holidayWorking = 0;
            let standardOtHours = 0, hWorkingOtHours = 0;

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
                        sickLeaves++;
                        break;
                    case 'Half Day':
                        halfDays++;
                        break;
                    case 'Holiday':
                        holidays++;
                        break;
                    case 'H-Working':
                        holidays++;
                        holidayWorking++;
                        // Double Pay Logic: If H-Working and OT is "No", add an extra paid day
                        // Normal holiday pay is already covered by "holidays++" (which adds to paidDays)
                        // So we just need to add one more day to make it double pay (1 day for holiday + 1 extra day)
                        if (record.overTime === 'No') {
                            // We will handle this by adding to a special counter or just incrementing paidDays directly later
                            // Let's add a special property to track this
                            if (!record.extraPaidDay) record.extraPaidDay = 0;
                            record.extraPaidDay = 1;
                        }
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

            const baseSalary = parseFloat(emp.baseSalary || baseSalaries[emp.name] || 0);
            const salaryType = emp.salaryType || 'monthly';
            const perDaySalary = salaryType === 'daily' ? baseSalary : (daysInMonth ? baseSalary / daysInMonth : 0);

            // Calculate extra paid days from H-Working (Double Pay)
            const extraPaidDays = empAttendance.reduce((sum, r) => sum + (r.extraPaidDay || 0), 0);

            const paidDays = present + paidLeave + holidays + (halfDays * 0.5) + extraPaidDays;
            const basePay = paidDays * perDaySalary;
            const otBreakdown = DataManager.calculateOTPay(
                totalOtHours,
                baseSalary,
                salaryType,
                { hWorkingOtHours, perDaySalary, returnBreakdown: true }
            );
            const otPay = otBreakdown.totalPay;
            const standardOtPay = otBreakdown.standardPay || 0;
            const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
            const salaryBeforeAdvance = basePay + otPay;

            const advanceThisMonth = DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
            const totalAdvanceFY = DataManager.getTotalAdvanceForEmployeeFY(emp.name, year, month);
            const remainingAfterExistingDebit = DataManager.getRemainingAdvanceBalance(emp.name, year, month);
            const existingDebit = DataManager.getDebitedAdvance(emp.name, year, month) || 0;
            const outstandingBefore = remainingAfterExistingDebit + existingDebit;
            const carryForwardPrevious = Math.max(outstandingBefore - advanceThisMonth, 0);
            const maxDebit = outstandingBefore;
            const recommendedDebit = existingDebit > 0 ? existingDebit : Math.min(outstandingBefore, salaryBeforeAdvance);

            return {
                name: emp.name,
                present,
                paidLeave,
                unpaidLeave,
                sickLeaves,
                halfDays,
                holidays,
                holidayWorking,
                otHours: totalOtHours,
                standardOtHours,
                hWorkingOtHours,
                standardOtPay,
                hWorkingOtPay,
                baseSalary,
                salaryType,
                perDaySalary,
                paidDays,
                basePay,
                otPay,
                salaryBeforeAdvance,
                advanceThisMonth,
                totalAdvanceFY,
                carryForwardPrevious,
                carryForwardBefore: outstandingBefore,
                outstandingBefore,
                recommendedDebit,
                maxDebit,
                debitAmount: recommendedDebit,
                carryForwardAfter: Math.max(outstandingBefore - recommendedDebit, 0),
                netSalary: salaryBeforeAdvance - recommendedDebit
            };
        });
    },

    generateMonthlyPDF(year, month, selectedEmployees = null) {
        const allEmployees = DataManager.getActiveEmployees();
        const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
        const attendance = DataManager.getAttendanceByMonth(year, month);
        const daysInMonth = DataManager.getDaysInMonth(year, month);
        const settings = DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[month];
        const company = DataManager.COMPANY_PROFILE;

        // Get credit date if available
        const payoutDetails = DataManager.getSalaryPayoutDetails(year, month);
        const creditDate = payoutDetails ? payoutDetails.creditDate : null;

        // Create HTML content for PDF
        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .company-details { font-size: 12px; line-height: 1.6; }
                    .report-title { text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0; }
                    .report-meta { text-align: center; font-size: 14px; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-right { text-align: right; }
                    .summary { margin: 20px 0; }
                    .footer { margin-top: 30px; font-size: 10px; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${company.name}</div>
                    <div class="company-details">
                        Registered Address: ${company.registeredAddress}<br>
                        Work Address: ${company.workAddress}<br>
                        Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                        GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                    </div>
                </div>
                <div class="report-title">Monthly Salary Report - ${monthName} ${year}</div>
                ${creditDate ? `<div class="report-meta"><strong>Salary Credit Date:</strong> ${DataManager.formatDateDisplay(creditDate)}</div>` : ''}
        `;

        employees.forEach(emp => {
            const empAttendance = attendance.filter(a => a.employee === emp.name);

            // Calculate stats
            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeaves = 0, halfDays = 0, holidays = 0;
            let standardOtHours = 0, hWorkingOtHours = 0;

            empAttendance.forEach(record => {
                switch (record.status) {
                    case 'Present': present++; break;
                    case 'Paid Leave': paidLeave++; break;
                    case 'Unpaid Leave': unpaidLeave++; break;
                    case 'Sick Leave': sickLeaves++; break;
                    case 'Half Day': halfDays++; break;
                    case 'Holiday': holidays++; break;
                    case 'H-Working': holidays++; break;
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
            const employee = employees.find(e => e.name === emp.name);
            const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[emp.name] || 0);
            const salaryType = employee?.salaryType || 'monthly';

            // Calculate per day salary
            let perDaySalary;
            if (salaryType === 'daily') {
                perDaySalary = baseSalary;
            } else {
                perDaySalary = baseSalary / daysInMonth;
            }

            const paidDays = present + paidLeave + holidays + (halfDays * 0.5);
            const basePay = paidDays * perDaySalary;
            const otBreakdown = DataManager.calculateOTPay(
                totalOtHours,
                baseSalary,
                salaryType,
                { hWorkingOtHours, perDaySalary, returnBreakdown: true }
            );
            const otPay = otBreakdown.totalPay;
            const standardOtPay = otBreakdown.standardPay || 0;
            const hOtPay = otBreakdown.hWorkingPay || 0;
            const totalAdvance = DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
            const remainingAdvanceBalance = DataManager.getRemainingAdvanceBalance(emp.name, year, month);
            const finalSalary = basePay + otPay - totalAdvance;

            htmlContent += `
                <div class="summary">
                    <h3>${emp.name}</h3>
                    <table>
                        <tr><th>Item</th><th>Details</th></tr>
                        <tr><td>Basic Salary</td><td class="text-right">₹${baseSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td>Present Days</td><td class="text-right">${present}</td></tr>
                        <tr><td>Paid Leave</td><td class="text-right">${paidLeave}</td></tr>
                        <tr><td>Unpaid Leave</td><td class="text-right">${unpaidLeave}</td></tr>
                        <tr><td>Sick Leave</td><td class="text-right">${sickLeaves}</td></tr>
                        <tr><td>Half Days</td><td class="text-right">${halfDays}</td></tr>
                        <tr><td>Holidays</td><td class="text-right">${holidays}</td></tr>
                        <tr><td>Paid Days</td><td class="text-right">${paidDays.toFixed(1)}</td></tr>
                        <tr><td>Base Pay</td><td class="text-right">₹${basePay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td>OT Hours</td><td class="text-right">${totalOtHours.toFixed(2)}</td></tr>
                        <tr><td>H-OT Hours</td><td class="text-right">${hWorkingOtHours.toFixed(2)}</td></tr>
                        <tr><td>Standard OT Pay</td><td class="text-right">₹${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td>H-OT Pay</td><td class="text-right">₹${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td><strong>Total OT Pay</strong></td><td class="text-right"><strong>₹${otPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                        <tr><td>Total Advance (This Month)</td><td class="text-right">₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td>Pending Advance Balance</td><td class="text-right">₹${remainingAdvanceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td><strong>Final Salary</strong></td><td class="text-right"><strong>₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                    </table>
                </div>
            `;
        });

        htmlContent += `
                <div class="footer">
                    Generated on: ${new Date().toLocaleString('en-IN')}<br>
                    ${company.name} - ${company.registeredAddress}
                </div>
            </body>
            </html>
        `;

        // Use html2pdf library if available, otherwise use print
        if (typeof html2pdf !== 'undefined') {
            const element = document.createElement('div');
            element.innerHTML = htmlContent;
            document.body.appendChild(element);

            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `Monthly_Report_${monthName}_${year}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'in',
                    format: 'a4',
                    orientation: 'portrait',
                    compress: true
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                document.body.removeChild(element);
            });
        } else {
            // Fallback: open in new window for printing
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.print();
        }
    },

    generateAnnualPDF(startYear, endYear, selectedEmployees = null) {
        const allEmployees = DataManager.getActiveEmployees();
        const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
        const startDate = new Date(startYear, 3, 1); // April 1
        const endDate = new Date(endYear, 2, 31); // March 31
        const attendance = DataManager.getAttendance();
        const filteredAttendance = attendance.filter(a => {
            const date = new Date(a.date);
            return date >= startDate && date <= endDate;
        });
        const settings = DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};
        const company = DataManager.COMPANY_PROFILE;

        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .company-details { font-size: 12px; line-height: 1.6; }
                    .report-title { text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-right { text-align: right; }
                    .summary { margin: 20px 0; }
                    .footer { margin-top: 30px; font-size: 10px; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${company.name}</div>
                    <div class="company-details">
                        Registered Address: ${company.registeredAddress}<br>
                        Work Address: ${company.workAddress}<br>
                        Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                        GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                    </div>
                </div>
                <div class="report-title">Annual Salary Report - Financial Year ${startYear}-${endYear}</div>
                <div class="report-meta" style="text-align: center; font-size: 12px; margin-bottom: 20px;">
                    ${(() => {
                let datesHtml = '<strong>Salary Credit Dates:</strong><br>';
                let hasDates = false;
                for (let year = startYear; year <= endYear; year++) {
                    for (let month = (year === startYear ? 3 : 0); month <= (year === endYear ? 2 : 11); month++) {
                        const details = DataManager.getSalaryPayoutDetails(year, month);
                        if (details && details.creditDate) {
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            datesHtml += `${months[month]} ${year}: ${DataManager.formatDateDisplay(details.creditDate)} | `;
                            hasDates = true;
                        }
                    }
                }
                return hasDates ? datesHtml.slice(0, -3) : '';
            })()}
                </div>
        `;

        employees.forEach(emp => {
            const empAttendance = filteredAttendance.filter(a => a.employee === emp.name);

            // Calculate annual stats
            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeaves = 0, halfDays = 0, holidays = 0;
            let standardOtHours = 0, hWorkingOtHours = 0;

            empAttendance.forEach(record => {
                switch (record.status) {
                    case 'Present': present++; break;
                    case 'Paid Leave': paidLeave++; break;
                    case 'Unpaid Leave': unpaidLeave++; break;
                    case 'Sick Leave': sickLeaves++; break;
                    case 'Half Day': halfDays++; break;
                    case 'Holiday': holidays++; break;
                    case 'H-Working': holidays++; break;
                }
                const hours = parseFloat(record.otHours || 0) || 0;
                if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                    hWorkingOtHours += hours;
                } else {
                    standardOtHours += hours;
                }
            });
            const totalOtHours = standardOtHours + hWorkingOtHours;

            // Calculate total advances
            let totalAdvance = 0;
            for (let year = startYear; year <= endYear; year++) {
                for (let month = (year === startYear ? 3 : 0); month <= (year === endYear ? 2 : 11); month++) {
                    totalAdvance += DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
                }
            }

            // Get employee data
            const employees = DataManager.getEmployees();
            const employee = employees.find(e => e.name === emp.name);
            const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[emp.name] || 0);
            const salaryType = employee?.salaryType || 'monthly';

            // Calculate per day salary
            const avgDaysPerMonth = 30;
            let avgPerDaySalary;
            if (salaryType === 'daily') {
                avgPerDaySalary = baseSalary;
            } else {
                avgPerDaySalary = baseSalary / avgDaysPerMonth;
            }

            const totalPaidDays = present + paidLeave + holidays + (halfDays * 0.5);
            const totalBasePay = totalPaidDays * avgPerDaySalary;
            const totalOtBreakdown = DataManager.calculateOTPay(
                totalOtHours,
                baseSalary,
                salaryType,
                { hWorkingOtHours, perDaySalary: avgPerDaySalary, returnBreakdown: true }
            );
            const totalOTPay = totalOtBreakdown.totalPay;
            const standardOtPay = totalOtBreakdown.standardPay || 0;
            const hOtPay = totalOtBreakdown.hWorkingPay || 0;
            const totalSalary = totalBasePay + totalOTPay - totalAdvance;

            htmlContent += `
                <div class="summary">
                    <h3>${emp.name}</h3>
                    <table>
                        <tr><th>Item</th><th>Details</th></tr>
                        <tr><td>Total Present Days</td><td class="text-right">${present}</td></tr>
                        <tr><td>Total Paid Leave</td><td class="text-right">${paidLeave}</td></tr>
                        <tr><td>Total Unpaid Leave</td><td class="text-right">${unpaidLeave}</td></tr>
                    <tr><td>Total Sick Leave</td><td class="text-right">${sickLeaves}</td></tr>
                        <tr><td>Total Half Days</td><td class="text-right">${halfDays}</td></tr>
                        <tr><td>Total Holidays</td><td class="text-right">${holidays}</td></tr>
                        <tr><td>Total OT Hours</td><td class="text-right">${totalOtHours.toFixed(2)}</td></tr>
                        <tr><td>H-OT Hours</td><td class="text-right">${hWorkingOtHours.toFixed(2)}</td></tr>
                        <tr><td>Standard OT Pay</td><td class="text-right">₹${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td>H-OT Pay</td><td class="text-right">₹${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td><strong>Total OT Pay</strong></td><td class="text-right"><strong>₹${totalOTPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                        <tr><td>Total Advances</td><td class="text-right">₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td><strong>Total Salary Paid</strong></td><td class="text-right"><strong>₹${totalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                    </table>
                </div>
            `;
        });

        htmlContent += `
                <div class="footer">
                    Generated on: ${new Date().toLocaleString('en-IN')}<br>
                    ${company.name} - ${company.registeredAddress}
                </div>
            </body>
            </html>
        `;

        // Use html2pdf library if available
        if (typeof html2pdf !== 'undefined') {
            const element = document.createElement('div');
            element.innerHTML = htmlContent;
            document.body.appendChild(element);

            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `Annual_Report_${startYear}-${endYear}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'in',
                    format: 'a4',
                    orientation: 'portrait',
                    compress: true
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                document.body.removeChild(element);
            });
        } else {
            // Fallback: open in new window for printing
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.print();
        }
    },

    generatePayslips(year, month, selectedEmployees = null) {
        const allEmployees = DataManager.getActiveEmployees();
        const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
        const attendance = DataManager.getAttendanceByMonth(year, month);
        const daysInMonth = DataManager.getDaysInMonth(year, month);
        const settings = DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[month];
        const company = DataManager.COMPANY_PROFILE;

        // Get credit date if available
        const payoutDetails = DataManager.getSalaryPayoutDetails(year, month);
        const creditDate = payoutDetails ? payoutDetails.creditDate : null;
        const paymentDate = creditDate ? DataManager.formatDateDisplay(creditDate) : new Date().toLocaleDateString('en-IN');

        employees.forEach(emp => {
            const empAttendance = attendance.filter(a => a.employee === emp.name);

            // Calculate stats
            let present = 0, paidLeave = 0, unpaidLeave = 0, halfDays = 0, holidays = 0, hWorking = 0;
            let standardOtHours = 0, hWorkingOtHours = 0;

            empAttendance.forEach(record => {
                switch (record.status) {
                    case 'Present': present++; break;
                    case 'Paid Leave': paidLeave++; break;
                    case 'Unpaid Leave': unpaidLeave++; break;
                    case 'Sick Leave': unpaidLeave++; break;
                    case 'Half Day': halfDays++; break;
                    case 'Holiday': holidays++; break;
                    case 'H-Working':
                        holidays++;
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
            const baseSalary = parseFloat(emp.baseSalary || baseSalaries[emp.name] || 0);
            const salaryType = emp.salaryType || 'monthly';

            // Calculate per day salary
            let perDaySalary;
            if (salaryType === 'daily') {
                perDaySalary = baseSalary;
            } else {
                perDaySalary = baseSalary / daysInMonth;
            }

            const paidDays = present + paidLeave + holidays + (halfDays * 0.5);
            const basePay = paidDays * perDaySalary;
            const otPay = DataManager.calculateOTPay(
                totalOtHours,
                baseSalary,
                salaryType,
                { hWorkingOtHours, perDaySalary }
            );

            // Advance summary (financial year based)
            const totalAdvanceFY = DataManager.getTotalAdvanceForEmployeeFY(emp.name, year, month);
            const remainingAdvanceBalance = DataManager.getRemainingAdvanceBalance(emp.name, year, month);
            const debitedThisMonth = DataManager.getDebitedAdvance(emp.name, year, month) || 0;

            // Reconstruct outstanding before this month's debit and carry forward balance
            const totalOutstandingBefore = remainingAdvanceBalance + debitedThisMonth;
            const balanceAfter = remainingAdvanceBalance;

            const salaryBeforeAdvance = basePay + otPay;
            const actualDebit = debitedThisMonth;
            const finalSalary = salaryBeforeAdvance - actualDebit;

            let htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .payslip { max-width: 800px; margin: 0 auto; border: 2px solid #000; padding: 20px; }
                        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                        .company-name { font-size: 22px; font-weight: bold; margin-bottom: 8px; }
                        .company-details { font-size: 11px; line-height: 1.5; }
                        .payslip-title { text-align: center; font-size: 18px; font-weight: bold; margin: 15px 0; }
                        .employee-info { margin: 15px 0; }
                        .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
                        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                        th, td { border: 1px solid #000; padding: 8px; }
                        th { background-color: #f0f0f0; font-weight: bold; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        .total-row { font-weight: bold; background-color: #f0f0f0; }
                        .footer { margin-top: 20px; font-size: 10px; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
                        .signature-section { margin-top: 30px; display: flex; justify-content: space-between; }
                        .signature-box { width: 200px; border-top: 1px solid #000; padding-top: 5px; text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="payslip">
                        <div class="header">
                            <div class="company-name">${company.name}</div>
                            <div class="company-details">
                                ${company.registeredAddress}<br>
                                ${company.workAddress}<br>
                                GSTIN: ${company.gstin} | PAN: ${company.pan}
                            </div>
                        </div>
                        <div class="payslip-title">PAYSLIP FOR THE MONTH OF ${monthName.toUpperCase()} ${year}</div>
                        <div class="employee-info">
                            <div class="info-row">
                                <span><strong>Employee Name:</strong> ${emp.name}</span>
                                <span><strong>Salary Credit Date:</strong> ${paymentDate}</span>
                            </div>
                            <div class="info-row">
                                <span><strong>Employee ID:</strong> ${emp.id || 'N/A'}</span>
                                <span><strong>Salary Type:</strong> ${salaryType === 'daily' ? 'Daily' : 'Monthly'}</span>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Earnings</th>
                                    <th class="text-right">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Basic Salary</td>
                                    <td class="text-right">${baseSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>Base Pay (${paidDays.toFixed(1)} days)</td>
                                    <td class="text-right">${basePay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>Standard OT Pay (${standardOtHours.toFixed(2)} hrs)</td>
                                    <td class="text-right">${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>H-OT Pay (${hWorkingOtHours.toFixed(2)} hrs)</td>
                                    <td class="text-right">${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td><strong>Total OT Pay</strong></td>
                                    <td class="text-right"><strong>${otPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                                <tr class="total-row">
                                    <td><strong>Gross Salary</strong></td>
                                    <td class="text-right"><strong>${salaryBeforeAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                        <table>
                            <thead>
                                <tr>
                                    <th>Deductions</th>
                                    <th class="text-right">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Total Advance Outstanding (before this month)</td>
                                    <td class="text-right">${totalOutstandingBefore.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>Advance Debited in this month</td>
                                    <td class="text-right">${actualDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>Advance Balance carried forward</td>
                                    <td class="text-right">${balanceAfter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr class="total-row">
                                    <td><strong>Total Deductions</strong></td>
                                    <td class="text-right"><strong>${actualDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                        <table>
                            <thead>
                                <tr>
                                    <th>Attendance Summary</th>
                                    <th class="text-right">Days</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Present Days</td><td class="text-right">${present}</td></tr>
                                <tr><td>Paid Leave</td><td class="text-right">${paidLeave}</td></tr>
                                <tr><td>Unpaid Leave</td><td class="text-right">${unpaidLeave}</td></tr>
                                <tr><td>Half Days</td><td class="text-right">${halfDays}</td></tr>
                                <tr><td>Holidays</td><td class="text-right">${holidays}</td></tr>
                                <tr><td>Holiday Working</td><td class="text-right">${hWorking}</td></tr>
                                <tr><td>H-OT Hours</td><td class="text-right">${hWorkingOtHours.toFixed(2)}</td></tr>
                                <tr><td>Total OT Hours</td><td class="text-right">${totalOtHours.toFixed(2)}</td></tr>
                            </tbody>
                        </table>
                        <div style="text-align: center; margin: 20px 0; font-size: 18px; font-weight: bold;">
                            Net Salary: ₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div class="signature-section">
                            <div class="signature-box">Employee Signature</div>
                            <div class="signature-box">Authorized Signature</div>
                        </div>
                        <div class="footer">
                            This is a computer generated payslip. No signature required.
                        </div>
                    </div>
                </body>
                </html>
            `;

            // Generate PDF for each employee
            if (typeof html2pdf !== 'undefined') {
                const element = document.createElement('div');
                element.innerHTML = htmlContent;
                document.body.appendChild(element);

                const opt = {
                    margin: [0.3, 0.3, 0.3, 0.3],
                    filename: `Payslip_${emp.name}_${monthName}_${year}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        letterRendering: true
                    },
                    jsPDF: {
                        unit: 'in',
                        format: 'a4',
                        orientation: 'portrait',
                        compress: true
                    },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };

                html2pdf().set(opt).from(element).save().then(() => {
                    document.body.removeChild(element);
                });
            } else {
                const printWindow = window.open('', '_blank');
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.print();
            }
        });
    },

    generateSalaryPayout(year, month, options = {}) {
        const { selectedEmployees = null, payoutData = null, creditDate = null } = options || {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[month];
        const company = DataManager.COMPANY_PROFILE;

        const manualDebitsProvided = Array.isArray(payoutData) && payoutData.length;
        let data = manualDebitsProvided ? payoutData : this.getSalaryPayoutData(year, month, selectedEmployees);

        data = data.map(item => {
            const carryForwardBefore = item.carryForwardBefore ?? item.outstandingBefore ?? 0;
            const carryForwardPrev = item.carryForwardPrevious ?? Math.max(carryForwardBefore - (item.advanceThisMonth || 0), 0);
            const maxDebit = carryForwardBefore;
            const debit = typeof item.debitAmount === 'number'
                ? Math.min(Math.max(item.debitAmount, 0), maxDebit)
                : Math.min(Math.max(Math.min(carryForwardBefore, item.salaryBeforeAdvance || carryForwardBefore), 0), maxDebit);
            const netSalary = Math.max((item.salaryBeforeAdvance || 0) - debit, 0);
            const carryForwardAfter = Math.max(carryForwardBefore - debit, 0);
            const advanceThisMonth = item.advanceThisMonth != null ? item.advanceThisMonth : DataManager.getTotalAdvanceForEmployee(item.name, year, month);
            const totalAdvanceFY = item.totalAdvanceFY != null ? item.totalAdvanceFY : DataManager.getTotalAdvanceForEmployeeFY(item.name, year, month);
            return {
                ...item,
                carryForwardPrevious: carryForwardPrev,
                carryForwardBefore,
                maxDebit,
                advanceThisMonth,
                totalAdvanceFY,
                debitAmount: debit,
                netSalary,
                carryForwardAfter
            };
        });

        if (!manualDebitsProvided) {
            data.forEach(item => {
                DataManager.saveDebitedAdvance(item.name, year, month, item.debitAmount || 0);
            });
        }

        //Mark salary payout done for the month, and accumulated months for daily employees
        DataManager.markSalaryPayoutDone(year, month, creditDate);

        // For daily-paid employees, mark all accumulated unpaid months as paid
        data.forEach(item => {
            const employees = DataManager.getEmployees();
            const employee = employees.find(e => e.name === item.name);
            const salaryType = employee?.salaryType || 'monthly';

            if (salaryType === 'daily') {
                // Mark all accumulated unpaid months as paid
                let checkMonth = month;
                let checkYear = year;

                // Go back and mark up to 12 months or until we find a previously paid month
                for (let i = 0; i < 12; i++) {
                    // Check if this month was already paid before this payout
                    const wasPaid = DataManager.isSalaryPayoutDone(checkYear, checkMonth);

                    if (wasPaid && !(checkYear === year && checkMonth === month)) {
                        // Found a previously paid month, stop here
                        break;
                    }

                    // Mark this month as paid
                    if (!(checkYear === year && checkMonth === month)) {
                        DataManager.markSalaryPayoutDone(checkYear, checkMonth, creditDate); // Use same credit date
                    }

                    // Move to previous month
                    checkMonth--;
                    if (checkMonth < 0) {
                        checkMonth = 11;
                        checkYear--;
                    }

                    // Prevent going too far back
                    if (checkYear < year - 2) {
                        break;
                    }
                }
            }
        });

        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .company-details { font-size: 12px; line-height: 1.6; }
                    .report-title { text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0; }
                    .report-meta { text-align: center; font-size: 14px; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px; }
                    th, td { border: 1px solid #000; padding: 6px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-right { text-align: right; }
                    .footer { margin-top: 30px; font-size: 10px; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${company.name}</div>
                    <div class="company-details">
                        Registered Address: ${company.registeredAddress}<br>
                        Work Address: ${company.workAddress}<br>
                        Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                        GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                    </div>
                </div>
                <div class="report-title">SALARY PAYOUT STATEMENT - ${monthName.toUpperCase()} ${year}</div>
                ${creditDate ? `<div class="report-meta"><strong>Salary Credit Date:</strong> ${DataManager.formatDateDisplay(creditDate)}</div>` : ''}
                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th class="text-right">Present</th>
                            <th class="text-right">Paid Leave</th>
                            <th class="text-right">Unpaid / Sick</th>
                            <th class="text-right">Half Days</th>
                            <th class="text-right">Holiday Working</th>
                            <th class="text-right">Holidays</th>
                            <th class="text-right">OT Hours</th>
                            <th class="text-right">Advance (Month)</th>
                            <th class="text-right">Carry Fwd (Prev)</th>
                            <th class="text-right">Outstanding Before</th>
                            <th class="text-right">Advance Debited</th>
                            <th class="text-right">Carry Fwd (Next)</th>
                            <th class="text-right">Base Pay</th>
                            <th class="text-right">OT Pay</th>
                            <th class="text-right">Net Salary</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const currency = (value) => `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        const totals = {
            present: 0,
            paidLeave: 0,
            unpaidLeave: 0,
            halfDays: 0,
            holidayWorking: 0,
            holidays: 0,
            otHours: 0,
            advanceThisMonth: 0,
            carryForwardPrev: 0,
            carryForwardOutstanding: 0,
            advanceDebit: 0,
            carryForwardNext: 0,
            basePay: 0,
            otPay: 0,
            netSalary: 0
        };

        data.forEach(item => {
            totals.present += item.present || 0;
            totals.paidLeave += item.paidLeave || 0;
            totals.unpaidLeave += item.unpaidLeave || 0;
            totals.halfDays += item.halfDays || 0;
            totals.holidayWorking += item.holidayWorking || 0;
            totals.holidays += item.holidays || 0;
            totals.otHours += item.otHours || 0;
            totals.advanceThisMonth += item.advanceThisMonth || 0;
            totals.carryForwardPrev += item.carryForwardPrevious || 0;
            totals.carryForwardOutstanding += item.carryForwardBefore || 0;
            totals.advanceDebit += item.debitAmount || 0;
            totals.carryForwardNext += item.carryForwardAfter || 0;
            totals.basePay += item.basePay || 0;
            totals.otPay += item.otPay || 0;
            totals.netSalary += item.netSalary || 0;

            htmlContent += `
                <tr>
                    <td>${item.name}</td>
                    <td class="text-right">${item.present || 0}</td>
                    <td class="text-right">${item.paidLeave || 0}</td>
                    <td class="text-right">${item.unpaidLeave || 0}</td>
                    <td class="text-right">${(item.halfDays || 0).toFixed(1)}</td>
                    <td class="text-right">${item.holidayWorking || 0}</td>
                    <td class="text-right">${item.holidays || 0}</td>
                    <td class="text-right">${(item.otHours || 0).toFixed(2)}</td>
                    <td class="text-right">${currency(item.advanceThisMonth || 0)}</td>
                    <td class="text-right">${currency(item.carryForwardPrevious || 0)}</td>
                    <td class="text-right">${currency(item.carryForwardBefore || 0)}</td>
                    <td class="text-right">${currency(item.debitAmount || 0)}</td>
                    <td class="text-right">${currency(item.carryForwardAfter || 0)}</td>
                    <td class="text-right">${currency(item.basePay || 0)}</td>
                    <td class="text-right">${currency(item.otPay || 0)}</td>
                    <td class="text-right"><strong>${currency(item.netSalary || 0)}</strong></td>
                </tr>
            `;
        });

        htmlContent += `
                        <tr style="font-weight: bold; background-color: #f0f0f0;">
                            <td>Total</td>
                            <td class="text-right">${totals.present}</td>
                            <td class="text-right">${totals.paidLeave}</td>
                            <td class="text-right">${totals.unpaidLeave}</td>
                            <td class="text-right">${totals.halfDays.toFixed(1)}</td>
                            <td class="text-right">${totals.holidayWorking}</td>
                            <td class="text-right">${totals.holidays}</td>
                            <td class="text-right">${totals.otHours.toFixed(2)}</td>
                            <td class="text-right">${currency(totals.advanceThisMonth)}</td>
                            <td class="text-right">${currency(totals.carryForwardPrev)}</td>
                            <td class="text-right">${currency(totals.carryForwardOutstanding)}</td>
                            <td class="text-right">${currency(totals.advanceDebit)}</td>
                            <td class="text-right">${currency(totals.carryForwardNext)}</td>
                            <td class="text-right">${currency(totals.basePay)}</td>
                            <td class="text-right">${currency(totals.otPay)}</td>
                            <td class="text-right">${currency(totals.netSalary)}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="footer">
                    Generated on: ${new Date().toLocaleString('en-IN')}<br>
                    ${company.name} - ${company.registeredAddress}
                </div>
            </body>
            </html>
        `;

        if (typeof html2pdf !== 'undefined') {
            const element = document.createElement('div');
            element.innerHTML = htmlContent;
            document.body.appendChild(element);

            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `Salary_Payout_${monthName}_${year}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'in',
                    format: 'a4',
                    orientation: 'landscape',
                    compress: true
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                document.body.removeChild(element);
            });
        } else {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.print();
        }
    }
};

