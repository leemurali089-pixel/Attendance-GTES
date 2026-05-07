// PDF Report Generation Module
const ReportsModule = {
    selectedEmployeesForPDF: [],
    pendingSalaryPayout: null,
    currentSelectionCallback: null,
    salaryPayoutModalFullscreen: false,

    async showEmployeeSelectionModal(callback, title = 'Select Employees for PDF', buttons = 'Generate PDF', year = null, month = null, onlyPaidEmployees = false) {
        // Get employees - filter by month if year and month are provided
        let employees;
        if (year !== null && month !== null) {
            employees = await DataManager.getEmployeesActiveInMonth(year, month);

            // If onlyPaidEmployees is true, filter to only employees with active payouts
            if (onlyPaidEmployees) {
                const settings = await DataManager.getSettings();
                const debitedAdvances = settings.debitedAdvances || {};
                const waivedAdvances = settings.waivedAdvances || {};
                const salaryPayouts = settings.salaryPayouts || {};

                // Check if this month has been paid out at all
                const payoutKey = `${year}_${month}`;
                const isMonthPaid = salaryPayouts[payoutKey] && salaryPayouts[payoutKey].done;

                // Filter employees who:
                // 1. Have debited or waived advances for this month, OR
                // 2. Were active in the month AND the month is marked as paid (for daily pay employees)
                employees = employees.filter(emp => {
                    const key = `${emp.name}_${year}_${month}`;
                    const hasAdvanceRecord = debitedAdvances[key] !== undefined || waivedAdvances[key] !== undefined;

                    // Include if they have advance records OR if the month is paid (for daily employees)
                    return hasAdvanceRecord || isMonthPaid;
                });
            }
        } else {
            employees = await DataManager.getActiveEmployees();
        }

        // Normalize buttons
        const buttonDefs = Array.isArray(buttons) ? buttons : [{ label: buttons, class: 'btn-primary', action: 'confirm' }];

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
                        ${buttonDefs.map(btn => `
                            <button type="button" class="btn ${btn.class || 'btn-primary'}" onclick="ReportsModule.confirmEmployeeSelection('${btn.action}')">${btn.label}</button>
                        `).join('')}
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

    confirmEmployeeSelection(action = 'confirm') {
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

        const executeCallback = () => {
            if (typeof this.currentSelectionCallback === 'function') {
                try {
                    this.currentSelectionCallback(selected, action);
                } catch (error) {
                    console.error('Error executing selection callback:', error);
                }
            }
            this.currentSelectionCallback = null;
        };

        if (modalElement) {
            modalElement.addEventListener('hidden.bs.modal', () => {
                modalElement.remove();
                executeCallback();
            }, { once: true });

            if (modal) {
                modal.hide();
            } else {
                // Formatting fallback
                modalElement.remove();
                executeCallback();
            }
        } else {
            executeCallback();
        }
    },

    formatCurrency(value) {
        return `₹${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    async startSalaryPayoutFlow(year, month) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const title = `Select Employees for Salary Payout - ${months[month]} ${year}`;

        // Check if payout already exists (partial or full)
        const hasAnyPayout = await DataManager.hasAnySalaryPayout(year, month);
        const isPayoutDone = await DataManager.isSalaryPayoutDone(year, month);

        if (isPayoutDone) {
            if (!confirm(`Full salary payout for ${months[month]} ${year} has already been completed. \n\nDo you want to re-process or update specific employees? \n\nExisting payouts will NOT be cleared unless you select the same employees.`)) {
                return;
            }
        } else if (hasAnyPayout) {
            if (!confirm(`A partial salary payout for ${months[month]} ${year} already exists. \n\nDo you want to add more employees or update existing ones?`)) {
                return;
            }
        }

        await this.showEmployeeSelectionModal(
            (selectedEmployees) => {
                ReportsModule.handleSalaryPayoutSelection(year, month, selectedEmployees);
            },
            title,
            'Next',
            year,  // Pass year for filtering
            month  // Pass month for filtering
        );
    },

    async handleSalaryPayoutSelection(year, month, selectedEmployees) {
        if (!selectedEmployees || selectedEmployees.length === 0) {
            App.showNotification('Please select at least one employee', 'error');
            return;
        }

        const employeesData = await this.getSalaryPayoutData(year, month, selectedEmployees);
        if (!employeesData.length) {
            App.showNotification('No employees available for payout', 'warning');
            return;
        }

        const isPayoutDone = await DataManager.isSalaryPayoutDone(year, month);
        if (!isPayoutDone) {
            employeesData.forEach(emp => {
                const outstanding = emp.carryForwardBefore ?? emp.outstandingBefore ?? 0;
                emp.debitAmount = emp.suggestedDebit ?? 0;
                emp.netSalary = Math.max((emp.salaryBeforeAdvance || 0) - emp.debitAmount, 0);
                emp.carryForwardAfter = Math.max(outstanding - emp.debitAmount, 0);
            });
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

        modal.addEventListener('shown.bs.modal', () => {
            const dateInput = document.getElementById('salaryCreditDate');
            if (dateInput) dateInput.focus();
        });

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
            // Limit debit to the LOWER of: Outstanding Amount OR Current Month's Salary
            const maxDebit = Math.min(outstandingAfterWaiver, Math.max(emp.salaryBeforeAdvance, 0));
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
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Present')">${emp.present}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Paid Leave')">${emp.paidLeave}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Unpaid Leave')">${emp.unpaidLeave}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Sick Leave')">${emp.sickLeaves || 0}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Half Days')">${emp.halfDays}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Holidays')">${emp.holidays}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'H-Working')">${emp.holidayWorking}</td>
                    <td class="text-center" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'Total OT Hours')">${emp.otHours.toFixed(2)}</td>
                    <td class="text-center text-primary fw-semibold" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'OT Hours')">${(emp.standardOtHours || 0).toFixed(2)}</td>
                    <td class="text-center text-info fw-semibold" style="cursor: pointer;" onclick="SalaryModule.showStatusCalendar('${safeName}', 'H-OT Hours')">${(emp.hWorkingOtHours || 0).toFixed(2)}</td>
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

    async confirmSalaryPayoutGeneration() {
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

        // PHASE 3: Validate bank details before payout
        const employeeData = await DataManager.getEmployees();
        const fullEmployees = employees.map(e =>
            employeeData.find(emp => emp.name === e.name)
        );

        const validation = DataManager.validateBankDetailsForPayout(fullEmployees);
        if (!validation.valid) {
            this.showBankValidationErrors(validation.errors);
            return;
        }

        const advances = await DataManager.getAdvances(); // Get current advances

        for (const emp of employees) {
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

            await DataManager.saveDebitedAdvance(emp.name, year, month, debitAmount);
            await DataManager.saveWaivedAdvance(emp.name, year, month, waivedAmount);
        }

        await DataManager.saveAdvances(advances); // Save all new wave-off entries

        try {
            await this.generateSalaryPayout(year, month, {
                selectedEmployees,
                payoutData: employees,
                creditDate: creditDate
            });

            // PHASE 3: Mark payout as done after successful generation
            const totalPaid = employees.reduce((sum, emp) => sum + (emp.netSalary || 0), 0);
            await DataManager.markSalaryPayoutDone(year, month, {
                creditDate: creditDate,
                employees: selectedEmployees,
                totalPaid: totalPaid,
                payoutData: employees
            });

            console.log(`Salary payout marked as done for ${year}-${month}`);
        } catch (error) {
            console.error('Error generating payout:', error);
            App.showNotification('Error generating salary payout: ' + error.message, 'error');
            return;
        }

        const modalElement = document.getElementById('salaryPayoutReviewModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
        }

        this.pendingSalaryPayout = null;
        App.showNotification('Salary payout generated and marked as done successfully', 'success');

        // Refresh the Salary View to update status
        if (window.SalaryModule && typeof window.SalaryModule.renderSalaryView === 'function') {
            window.SalaryModule.renderSalaryView();
        }
    },

    // PHASE 3: Show bank validation errors modal
    showBankValidationErrors(errors) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'bankValidationErrorModal';

        const errorHtml = errors.map(e => `
            <div class="alert alert-danger mb-3">
                <h6 class="alert-heading"><i class="bi bi-exclamation-triangle-fill"></i> ${e.employee}</h6>
                <ul class="mb-0">
                    ${e.errors.map(err => `<li>${err}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-x-circle-fill"></i> Bank Details Validation Failed
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="lead">
                            The following employees have incomplete or invalid bank details. 
                            Please fix these issues before generating the salary payout.
                        </p>
                        <hr>
                        ${errorHtml}
                        <div class="alert alert-info">
                            <strong>What to do:</strong>
                            <ol class="mb-0 mt-2">
                                <li>Close this dialog</li>
                                <li>Go to <strong>Employees</strong> page</li>
                                <li>Edit each employee and fill in missing bank details</li>
                                <li>Save and retry payout generation</li>
                            </ol>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Close & Fix Details
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    },

    async getSalaryPayoutData(year, month, selectedEmployees = null) {
        const allEmployees = await DataManager.getEmployeesActiveInMonth(year, month);
        const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
        const attendance = await DataManager.getAttendanceByMonth(year, month);
        const daysInMonth = DataManager.getDaysInMonth(year, month);
        const settings = await DataManager.getSettings();
        const baseSalaries = settings.baseSalaries || {};
        const isPayoutDone = await DataManager.isSalaryPayoutDone(year, month);

        // Use Promise.all to handle async map
        return Promise.all(employees.map(async emp => {
            const empAttendanceRaw = attendance.filter(a => a.employee === emp.name);
            // Match SalaryModule: one record per calendar day (latest wins)
            const byDate = new Map();
            empAttendanceRaw.forEach(record => {
                const d = new Date(record.date);
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                byDate.set(dateKey, record);
            });
            const empAttendance = Array.from(byDate.values());

            let present = 0, paidLeave = 0, unpaidLeave = 0, sickLeaves = 0, halfDays = 0, holidays = 0, holidayWorking = 0;
            let standardOtHours = 0, hWorkingOtHours = 0, sOtHours = 0;

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
                        holidayWorking++;
                        break;
                }
                const hours = parseFloat(record.otHours || 0) || 0;
                const dateObj = new Date(record.date);
                const isSunday = DataManager.isSunday(dateObj);
                const isHoliday = DataManager.isHoliday(dateObj);

                if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                    hWorkingOtHours += hours;
                } else if (isSunday && !isHoliday && record.status === 'Present') {
                    sOtHours += hours;
                } else {
                    standardOtHours += hours;
                }
            });
            const totalOtHours = standardOtHours + hWorkingOtHours + sOtHours;

            const baseSalary = parseFloat(emp.baseSalary || baseSalaries[emp.name] || 0);
            const salaryType = emp.salaryType || 'monthly';
            const perDaySalary = salaryType === 'daily' ? baseSalary : (daysInMonth ? baseSalary / daysInMonth : 0);
            const esiDeduction = (emp.esiDeductionEnabled === true && baseSalary > 0) ? Number((baseSalary * 0.0075).toFixed(2)) : 0;

            // Monthly: each H-Working = 2 paid days (same as salary grid / historical payout statement)
            let paidDays;
            if (salaryType === 'daily') {
                paidDays = present + holidayWorking + (halfDays * 0.5);
            } else {
                paidDays = present + paidLeave + holidays + (halfDays * 0.5) + 2 * holidayWorking;
            }

            const basePay = paidDays * perDaySalary;
            const otBreakdown = DataManager.calculateOTPay(
                totalOtHours,
                baseSalary,
                salaryType,
                { hWorkingOtHours, sOtHours, returnBreakdown: true, settings }
            );
            const otPay = otBreakdown.totalPay;
            const standardOtPay = otBreakdown.standardPay || 0;
            const hWorkingOtPay = otBreakdown.hWorkingPay || 0;
            const salaryBeforeAdvance = Math.max(basePay + otPay - esiDeduction, 0);

            const advanceThisMonth = await DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
            const totalAdvanceFY = await DataManager.getTotalAdvanceForEmployeeFY(emp.name, year, month);
            const remainingAfterExistingDebit = await DataManager.getRemainingAdvanceBalance(emp.name, year, month);
            const existingDebit = (await DataManager.getDebitedAdvance(emp.name, year, month)) || 0;
            const outstandingBefore = remainingAfterExistingDebit + existingDebit;
            const carryForwardPrevious = Math.max(outstandingBefore - advanceThisMonth, 0);
            const maxDebit = outstandingBefore;
            // Review modal default: suggest recovering up to salary or outstanding
            const suggestedDebit = Math.min(Math.max(outstandingBefore, 0), Math.max(salaryBeforeAdvance, 0));
            // Salary table & payout PDF: same as _generateRowHTML — only apply stored debit after payout is finalized
            const appliedDebit = (isPayoutDone && existingDebit > 0) ? existingDebit : 0;
            const carryForwardAfterApplied = Math.max(outstandingBefore - appliedDebit, 0);

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
                esiDeduction,
                salaryBeforeAdvance,
                advanceThisMonth,
                totalAdvanceFY,
                carryForwardPrevious,
                carryForwardBefore: outstandingBefore,
                outstandingBefore,
                suggestedDebit,
                recommendedDebit: suggestedDebit,
                maxDebit,
                debitAmount: appliedDebit,
                carryForwardAfter: carryForwardAfterApplied,
                netSalary: Math.max(salaryBeforeAdvance - appliedDebit, 0)
            };
        }));
    },

    async generateMonthlyPDF(year, month, selectedEmployees = null) {
        console.log('Starting Monthly PDF generation for', year, month);
        try {
            const allEmployees = await DataManager.getActiveEmployees();
            console.log('All employees:', allEmployees.length);
            const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
            console.log('Filtered employees:', employees.length);
            const attendance = await DataManager.getAttendanceByMonth(year, month);
            console.log('Attendance records:', attendance.length);
            const daysInMonth = DataManager.getDaysInMonth(year, month);
            const settings = await DataManager.getSettings();
            const baseSalaries = settings.baseSalaries || {};
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = months[month];

            // Helper to ensure array
            const toArray = (val) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string') return val.split(',').map(s => s.trim());
                return [];
            };

            // Use settings for company profile, fallback to default
            const company = {
                name: settings.companyName || DataManager.COMPANY_PROFILE.name,
                registeredAddress: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
                workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
                gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
                pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
                emails: toArray(settings.emails || DataManager.COMPANY_PROFILE.emails),
                phones: toArray(settings.phones || DataManager.COMPANY_PROFILE.phones),
                iec: settings.iec || DataManager.COMPANY_PROFILE.iec
            };

            // Get credit date if available
            const payoutDetails = await DataManager.getSalaryPayoutDetails(year, month);
            const creditDate = payoutDetails ? payoutDetails.creditDate : null;

            // Create HTML content for PDF
            let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000000 !important; background-color: #ffffff; font-size: 9px; -webkit-print-color-adjust: exact; box-sizing: border-box; }
                    .container { width: 100%; max-width: 700px; margin: 0 auto; border: 1px solid #000; padding: 10px; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                    .company-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #000000 !important; }
                    .company-details { font-size: 9px; line-height: 1.4; color: #000000 !important; }
                    .report-title { text-align: center; font-size: 14px; font-weight: bold; margin: 15px 0; color: #000000 !important; }
                    .report-meta { text-align: center; font-size: 10px; margin-bottom: 15px; color: #000000 !important; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 9px; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: left; color: #000000 !important; border-color: #000000 !important; }
                    th { background-color: #f0f0f0; font-weight: bold; color: #000000 !important; }
                    .text-right { text-align: right; }
                    .summary { margin: 15px 0; color: #000000 !important; }
                    .footer { margin-top: 20px; font-size: 8px; text-align: center; border-top: 1px solid #000; padding-top: 5px; color: #000000 !important; }
                </style>
            </head>
            <body style="color: #000000 !important; background-color: #ffffff !important;">
                <div class="container">
                    <div class="header" style="color: #000000 !important;">
                        <div class="company-name" style="color: #000000 !important;">${company.name}</div>
                        <div class="company-details" style="color: #000000 !important;">
                            Registered Address: ${company.registeredAddress}<br>
                            Work Address: ${company.workAddress}<br>
                            Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                            GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                        </div>
                    </div>
                    <div class="report-title" style="color: #000000 !important;">Monthly Salary Report - ${monthName} ${year}</div>
                    ${creditDate ? `<div class="report-meta" style="color: #000000 !important;"><strong>Salary Credit Date:</strong> ${DataManager.formatDateDisplay(creditDate)}</div>` : ''}
        `;

            // Process employees sequentially or in parallel
            const employeeRows = await Promise.all(employees.map(async emp => {
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
                const allEmps = await DataManager.getEmployees();
                const employee = allEmps.find(e => e.name === emp.name);
                const baseSalary = parseFloat(employee?.baseSalary || baseSalaries[emp.name] || 0);
                const salaryType = employee?.salaryType || 'monthly';
                const esiDeduction = (employee?.esiDeductionEnabled === true && baseSalary > 0) ? Number((baseSalary * 0.0075).toFixed(2)) : 0;

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
                    { hWorkingOtHours, perDaySalary, returnBreakdown: true, settings }
                );
                const otPay = otBreakdown.totalPay;
                const standardOtPay = otBreakdown.standardPay || 0;
                const hOtPay = otBreakdown.hWorkingPay || 0;
                const totalAdvance = await DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
                const remainingAdvanceBalance = await DataManager.getRemainingAdvanceBalance(emp.name, year, month);
                const finalSalary = basePay + otPay - esiDeduction - totalAdvance;

                return `
                <div class="summary" style="color: #000000 !important;">
                    <h3 style="color: #000000 !important;">${emp.name}</h3>
                    <table style="color: #000000 !important; border-color: #000000 !important;">
                        <tr><th style="color: #000000 !important;">Item</th><th style="color: #000000 !important;">Details</th></tr>
                        <tr><td style="color: #000000 !important;">Basic Salary</td><td class="text-right" style="color: #000000 !important;">₹${baseSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        ${present > 0 ? `<tr><td style="color: #000000 !important;">Present Days</td><td class="text-right" style="color: #000000 !important;">${present}</td></tr>` : ''}
                        ${paidLeave > 0 ? `<tr><td style="color: #000000 !important;">Paid Leave</td><td class="text-right" style="color: #000000 !important;">${paidLeave}</td></tr>` : ''}
                        ${unpaidLeave > 0 ? `<tr><td style="color: #000000 !important;">Unpaid Leave</td><td class="text-right" style="color: #000000 !important;">${unpaidLeave}</td></tr>` : ''}
                        ${sickLeaves > 0 ? `<tr><td style="color: #000000 !important;">Sick Leave</td><td class="text-right" style="color: #000000 !important;">${sickLeaves}</td></tr>` : ''}
                        ${halfDays > 0 ? `<tr><td style="color: #000000 !important;">Half Days</td><td class="text-right" style="color: #000000 !important;">${halfDays}</td></tr>` : ''}
                        ${holidays > 0 ? `<tr><td style="color: #000000 !important;">Holidays</td><td class="text-right" style="color: #000000 !important;">${holidays}</td></tr>` : ''}
                        <tr><td style="color: #000000 !important;">Paid Days</td><td class="text-right" style="color: #000000 !important;">${paidDays.toFixed(1)}</td></tr>
                        <tr><td style="color: #000000 !important;">Base Pay</td><td class="text-right" style="color: #000000 !important;">₹${basePay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                        ${totalOtHours > 0 ? `<tr><td style="color: #000000 !important;">OT Hours</td><td class="text-right" style="color: #000000 !important;">${totalOtHours.toFixed(2)}</td></tr>` : ''}
                        ${hWorkingOtHours > 0 ? `<tr><td style="color: #000000 !important;">H-OT Hours</td><td class="text-right" style="color: #000000 !important;">${hWorkingOtHours.toFixed(2)}</td></tr>` : ''}
                        ${standardOtPay > 0 ? `<tr><td style="color: #000000 !important;">Standard OT Pay</td><td class="text-right" style="color: #000000 !important;">₹${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${hOtPay > 0 ? `<tr><td style="color: #000000 !important;">H-OT Pay</td><td class="text-right" style="color: #000000 !important;">₹${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${otPay > 0 ? `<tr><td style="color: #000000 !important;"><strong style="color: #000000 !important;">Total OT Pay</strong></td><td class="text-right" style="color: #000000 !important;"><strong style="color: #000000 !important;">₹${otPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>` : ''}
                        ${esiDeduction > 0 ? `<tr><td style="color: #000000 !important;">ESI Deduction (0.75%)</td><td class="text-right" style="color: #000000 !important;">₹${esiDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${totalAdvance > 0 ? `<tr><td style="color: #000000 !important;">Total Advance (This Month)</td><td class="text-right" style="color: #000000 !important;">₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${remainingAdvanceBalance > 0 ? `<tr><td style="color: #000000 !important;">Pending Advance Balance</td><td class="text-right" style="color: #000000 !important;">₹${remainingAdvanceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        <tr><td style="color: #000000 !important;"><strong style="color: #000000 !important;">Final Salary</strong></td><td class="text-right" style="color: #000000 !important;"><strong style="color: #000000 !important;">₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                    </table>
                </div>
            `;
            }));

            htmlContent += employeeRows.join('');

            htmlContent += `
                <div class="footer">
                    Generated on: ${new Date().toLocaleString('en-IN')}<br>
                    ${company.name} - ${company.registeredAddress}
                </div>
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
        } catch (error) {
            console.error('Error generating Monthly PDF:', error);
            alert('Error generating PDF: ' + error.message);
        }
    },

    async generateAnnualPDF(startYear, endYear, selectedEmployees = null, startMonth = 3, endMonth = 2) {
        console.log('Starting Annual PDF generation for', startYear, '-', endYear);
        try {
            const allEmployees = await DataManager.getActiveEmployees();
            const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;
            const startDate = new Date(startYear, startMonth, 1);
            const endDate = new Date(endYear, endMonth + 1, 0);
            const attendance = await DataManager.getAttendance();
            const filteredAttendance = attendance.filter(a => {
                const date = new Date(a.date);
                return date >= startDate && date <= endDate;
            });
            const settings = await DataManager.getSettings();
            const baseSalaries = settings.baseSalaries || {};

            // Helper to ensure array
            const toArray = (val) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string') return val.split(',').map(s => s.trim());
                return [];
            };

            // Use settings for company profile, fallback to default
            const company = {
                name: settings.companyName || DataManager.COMPANY_PROFILE.name,
                registeredAddress: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
                workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
                gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
                pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
                emails: toArray(settings.emails || DataManager.COMPANY_PROFILE.emails),
                phones: toArray(settings.phones || DataManager.COMPANY_PROFILE.phones),
                iec: settings.iec || DataManager.COMPANY_PROFILE.iec
            };

            // Pre-fetch credit dates
            let datesHtml = '<strong>Salary Credit Dates:</strong><br>';
            let hasDates = false;
            for (let year = startYear; year <= endYear; year++) {
                for (let month = (year === startYear ? startMonth : 0); month <= (year === endYear ? endMonth : 11); month++) {
                    const details = await DataManager.getSalaryPayoutDetails(year, month);
                    if (details && details.creditDate) {
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        datesHtml += `${months[month]} ${year}: ${DataManager.formatDateDisplay(details.creditDate)} | `;
                        hasDates = true;
                    }
                }
            }
            const creditDatesHtml = hasDates ? datesHtml.slice(0, -3) : '';

            const rangeLabel = `${new Date(startYear, startMonth, 1).toLocaleString('default', { month: 'short' })} ${startYear} - ${new Date(endYear, endMonth, 1).toLocaleString('default', { month: 'short' })} ${endYear}`;
            let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000000 !important; background-color: #ffffff; font-size: 9px; -webkit-print-color-adjust: exact; box-sizing: border-box; }
                    .container { width: 100%; max-width: 700px; margin: 0 auto; border: 1px solid #000; padding: 10px; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 6px; }
                    .company-name { font-size: 14px; font-weight: bold; margin-bottom: 4px; color: #000000 !important; }
                    .company-details { font-size: 8px; line-height: 1.3; color: #000000 !important; }
                    .report-title { text-align: center; font-size: 12px; font-weight: bold; margin: 8px 0; color: #000000 !important; }
                    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9px; }
                    th, td { border: 1px solid #000; padding: 3px 4px; text-align: left; color: #000000 !important; font-size: 8px; border-color: #000000 !important; }
                    th { background-color: #f0f0f0; font-weight: bold; color: #000000 !important; }
                    .text-right { text-align: right; }
                    .summary { margin: 8px 0; color: #000000 !important; font-size: 9px; }
                    .footer { margin-top: 8px; font-size: 7px; text-align: center; border-top: 1px solid #000; padding-top: 4px; color: #000000 !important; }
                    * { color: #000000 !important; }
                </style>
            </head>
            <body style="color: #000000 !important; background-color: #ffffff !important;">
                <div class="container">
                    <div class="header" style="color: #000000 !important;">
                        <div class="company-name" style="color: #000000 !important;">${company.name}</div>
                        <div class="company-details" style="color: #000000 !important;">
                            Registered Address: ${company.registeredAddress}<br>
                            Work Address: ${company.workAddress}<br>
                            Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                            GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                        </div>
                    </div>
                    <div class="report-title" style="color: #000000 !important;">Annual Salary Report - ${rangeLabel}</div>
                    <div class="report-meta" style="text-align: center; font-size: 12px; margin-bottom: 20px; color: #000000 !important;">
                        ${creditDatesHtml}
                    </div>
            `;

            const employeeRows = await Promise.all(employees.map(async emp => {
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
                    const dateObj = new Date(record.date);
                    const isSunday = DataManager.isSunday(dateObj);
                    const isHoliday = DataManager.isHoliday(dateObj);

                    // Logic matching salary.js
                    if (record.status === 'H-Working' && record.overTime === 'H-Working') {
                        hWorkingOtHours += hours;
                    } else if (isSunday && !isHoliday && record.status === 'Present') {
                        // S-OT is grouped with Standard OT for reports usually, or we can separate it?
                        // For now, let's group it with Standard OT as per previous logic unless requested otherwise
                        standardOtHours += hours;
                    } else {
                        standardOtHours += hours;
                    }
                });
                const totalOtHours = standardOtHours + hWorkingOtHours;

                // Calculate total advances
                let totalAdvance = 0;
                for (let year = startYear; year <= endYear; year++) {
                    for (let month = (year === startYear ? startMonth : 0); month <= (year === endYear ? endMonth : 11); month++) {
                        totalAdvance += await DataManager.getTotalAdvanceForEmployee(emp.name, year, month);
                    }
                }

                // Get employee data
                const employeesList = await DataManager.getEmployees();
                const employee = employeesList.find(e => e.name === emp.name);
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
                    { hWorkingOtHours, perDaySalary: avgPerDaySalary, returnBreakdown: true, settings }
                );
                const totalOTPay = totalOtBreakdown.totalPay;
                const standardOtPay = totalOtBreakdown.standardPay || 0;
                const hOtPay = totalOtBreakdown.hWorkingPay || 0;
                const totalSalary = totalBasePay + totalOTPay - totalAdvance;

                return `
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
                            <tr><td>Total OT Hours</td><td class="text-right">${standardOtHours.toFixed(2)}</td></tr>
                            <tr><td>H-OT Hours</td><td class="text-right">${hWorkingOtHours.toFixed(2)}</td></tr>
                            <tr><td>Standard OT Pay</td><td class="text-right">₹${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                            <tr><td>H-OT Pay</td><td class="text-right">₹${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                            <tr><td><strong>Total OT Pay</strong></td><td class="text-right"><strong>₹${totalOTPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                            <tr><td>Total Advances</td><td class="text-right">₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                            <tr><td><strong>Total Salary Paid</strong></td><td class="text-right"><strong>₹${totalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
                        </table>
                    </div>
                `;
            }));

            htmlContent += employeeRows.join('');

            htmlContent += `
                    <div class="footer">
                        Generated on: ${new Date().toLocaleString('en-IN')}<br>
                        ${company.name} - ${company.registeredAddress}
                    </div>
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
                    filename: `Annual_Report_${startYear}-${String(startMonth + 1).padStart(2, '0')}_to_${endYear}-${String(endMonth + 1).padStart(2, '0')}.pdf`,
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
        } catch (error) {
            console.error('Error generating Annual PDF:', error);
            alert('Error generating PDF: ' + error.message);
        }
    },


    async generatePayslips(year, month, selectedEmployees = null, action = 'download') {
        try {
            if (typeof html2pdf === 'undefined') {
                alert('Error: html2pdf library is not loaded. Please check your internet connection.');
                return;
            }

            const allEmployees = await DataManager.getEmployeesActiveInMonth(year, month);
            const employees = selectedEmployees ? allEmployees.filter(emp => selectedEmployees.includes(emp.name)) : allEmployees;

            if (employees.length === 0) {
                alert('No employees selected for payslip generation.');
                return;
            }

            App.showLoader();

            const payoutDetails = await DataManager.getSalaryPayoutDetails(year, month);
            const payoutData = await this.getSalaryPayoutData(year, month, employees.map(e => e.name));
            const settings = await DataManager.getSettings();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = months[month];
            const previewHtmls = [];

            // Helper to ensure array
            const toArray = (val) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string') return val.split(',').map(s => s.trim());
                return [];
            };

            // Use settings for company profile, fallback to default
            const company = {
                name: settings.companyName || DataManager.COMPANY_PROFILE.name,
                registeredAddress: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
                workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
                gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
                pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
                emails: toArray(settings.emails || DataManager.COMPANY_PROFILE.emails),
                phones: toArray(settings.phones || DataManager.COMPANY_PROFILE.phones)
            };

            const creditDate = payoutDetails ? payoutDetails.creditDate : null;
            const paymentDate = creditDate ? DataManager.formatDateDisplay(creditDate) : new Date().toLocaleDateString('en-IN');

            App.showNotification(`Generating payslips for ${employees.length} employees...`, 'info');

            // Process sequentially
            for (const data of payoutData) {
                const emp = employees.find(e => e.name === data.name) || { name: data.name, id: 'N/A' };

                const salaryType = data.salaryType;
                const baseSalary = data.baseSalary;
                const paidDays = data.paidDays;
                const basePay = data.basePay;
                const otPay = data.otPay;
                const standardOtPay = data.standardOtPay;
                const hOtPay = data.hWorkingOtPay;
                const standardOtHours = data.standardOtHours;
                const hWorkingOtHours = data.hWorkingOtHours;
                const totalOtHours = data.otHours;

                const advanceThisMonth = data.advanceThisMonth;
                const outstandingBefore = data.outstandingBefore;
                const carryForwardPrevious = data.carryForwardPrevious;
                const debitedThisMonth = data.debitAmount;
                const balanceAfter = data.carryForwardAfter;

                const salaryBeforeAdvance = data.salaryBeforeAdvance;
                const finalSalary = data.netSalary;

                let htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000000 !important; background-color: #ffffff; font-size: 9px; -webkit-print-color-adjust: exact; box-sizing: border-box; }
                    .payslip { width: 100%; max-width: 700px; margin: 0 auto; border: 1px solid #000; padding: 10px; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 6px; }
                    .company-name { font-size: 14px; font-weight: bold; margin-bottom: 3px; color: #000000 !important; }
                    .company-details { font-size: 8px; line-height: 1.3; color: #000000 !important; }
                    .payslip-title { text-align: center; font-size: 12px; font-weight: bold; margin: 6px 0; color: #000000 !important; }
                    .employee-info { margin: 6px 0; color: #000000 !important; }
                    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
                    th, td { border: 1px solid #000; padding: 3px 4px; text-align: left; color: #000000 !important; font-size: 8px; border-color: #000000 !important; }
                    th { background-color: #f0f0f0; font-weight: bold; color: #000000 !important; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .total-row { font-weight: bold; background-color: #f0f0f0; color: #000000 !important; }
                    .footer { margin-top: 8px; font-size: 7px; text-align: center; border-top: 1px solid #000; padding-top: 4px; color: #000000 !important; }
                    .signature-section { margin-top: 12px; display: flex; justify-content: space-between; }
                    .signature-box { width: 150px; border-top: 1px solid #000; padding-top: 3px; text-align: center; color: #000000 !important; font-size: 8px; }
                    * { color: #000000 !important; }
                </style>
                </head>
                <body style="color: #000000 !important; background-color: #ffffff !important;">
                    <div class="payslip" style="color: #000000 !important; border-color: #000000 !important;">
                        <div class="header" style="color: #000000 !important;">
                            <div class="company-name" style="color: #000000 !important;">${company.name}</div>
                            <div class="company-details" style="color: #000000 !important;">
                                ${company.registeredAddress}<br>
                                ${company.workAddress}<br>
                                GSTIN: ${company.gstin} | PAN: ${company.pan}
                            </div>
                        </div>
                        <div class="payslip-title">PAYSLIP FOR THE MONTH OF ${monthName.toUpperCase()} ${year}</div>
                        <div class="employee-info">
                            <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span><strong>Employee Name:</strong> ${emp.name}</span>
                                <span><strong>Salary Credit Date:</strong> ${paymentDate}</span>
                            </div>
                            <div class="info-row" style="display: flex; justify-content: space-between;">
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
                                ${standardOtPay > 0 ? `
                                <tr>
                                    <td>Standard OT Pay (${standardOtHours.toFixed(2)} hrs)</td>
                                    <td class="text-right">${standardOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>` : ''}
                                ${hOtPay > 0 ? `
                                <tr>
                                    <td>H-OT Pay (${hWorkingOtHours.toFixed(2)} hrs)</td>
                                    <td class="text-right">${hOtPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>` : ''}
                                ${otPay > 0 ? `
                                <tr>
                                    <td><strong>Total OT Pay</strong></td>
                                    <td class="text-right"><strong>${otPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>` : ''}
                                <tr class="total-row">
                                    <td><strong>Gross Salary</strong></td>
                                    <td class="text-right"><strong>${salaryBeforeAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                        ${(outstandingBefore > 0 || debitedThisMonth > 0) ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>Deductions & Advance Breakdown</th>
                                    <th class="text-right">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${carryForwardPrevious > 0 ? `
                                <tr>
                                    <td>Previous Advance Balance</td>
                                    <td class="text-right">${carryForwardPrevious.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>` : ''}
                                ${advanceThisMonth > 0 ? `
                                <tr>
                                    <td>Advance Taken (This Month)</td>
                                    <td class="text-right">${advanceThisMonth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>` : ''}
                                <tr>
                                    <td><strong>Total Advance Outstanding</strong></td>
                                    <td class="text-right"><strong>${outstandingBefore.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                                <tr style="background-color: #fff9e6;">
                                    <td>Advance Debited in this month</td>
                                    <td class="text-right">${debitedThisMonth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td>Advance Balance carried forward</td>
                                    <td class="text-right">${balanceAfter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr class="total-row">
                                    <td><strong>Total Deductions</strong></td>
                                    <td class="text-right"><strong>${debitedThisMonth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                        ` : ''}
                        <table>
                            <thead>
                                <tr>
                                    <th>Attendance Summary</th>
                                    <th class="text-right">Days</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Present Days</td>
                                    <td class="text-right">${data.present}</td>
                                </tr>
                                ${data.paidLeave > 0 ? `
                                <tr>
                                    <td>Paid Leave</td>
                                    <td class="text-right">${data.paidLeave}</td>
                                </tr>` : ''}
                                ${data.unpaidLeave > 0 || data.sickLeaves > 0 ? `
                                <tr>
                                    <td>Unpaid / Sick Leave</td>
                                    <td class="text-right">${data.unpaidLeave + data.sickLeaves}</td>
                                </tr>` : ''}
                                ${data.halfDays > 0 ? `
                                <tr>
                                    <td>Half Days</td>
                                    <td class="text-right">${data.halfDays}</td>
                                </tr>` : ''}
                                <tr>
                                    <td>Holidays</td>
                                    <td class="text-right">${data.holidays}</td>
                                </tr>
                                ${data.holidayWorking > 0 ? `
                                <tr>
                                    <td>Holiday Working</td>
                                    <td class="text-right">${data.holidayWorking}</td>
                                </tr>` : ''}
                                <tr>
                                    <td>Total OT Hours</td>
                                    <td class="text-right">${totalOtHours.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="text-align: center; margin: 15px 0; border-top: 2px solid #000; padding-top: 10px;">
                            <span style="font-size: 16px; font-weight: bold;">Net Salary: ₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 3 })}</span>
                        </div>
                        ${emp.paymentMode === 'bank' && emp.bank ? `
                        <div style="margin: 15px 0; border: 1px solid #000; padding: 8px;">
                            <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px; text-align: center;">Bank Account Details (Salary Credited)</div>
                            <table style="margin: 0;">
                                <tbody>
                                    <tr>
                                        <td style="width: 50%; border-right: 1px solid #000;"><strong>Beneficiary Name:</strong> ${emp.bank.beneficiaryName || 'N/A'}</td>
                                        <td style="width: 50%;"><strong>Account Number:</strong> ${emp.bank.accountNo || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td style="border-right: 1px solid #000;"><strong>IFSC Code:</strong> ${emp.bank.ifsc || 'N/A'}</td>
                                        <td><strong>Branch:</strong> ${emp.bank.branchName || 'N/A'}</td>
                                    </tr>
                                    ${emp.bank.address ? `
                                    <tr>
                                        <td colspan="2"><strong>Bank Address:</strong> ${emp.bank.address}</td>
                                    </tr>` : ''}
                                </tbody>
                            </table>
                        </div>
                        ` : ''}
                        <div class="signature-section" style="margin-top: 15px;">
                            ${emp.employeePhoto ? `<div style="text-align: center; width: 100px;"><img src="${emp.employeePhoto}" style="max-width: 80px; max-height: 80px; border: 1px solid #000; border-radius: 3px; object-fit: cover;"/><div style="font-size: 7px; margin-top: 2px;">Employee Photo</div></div>` : '<div class="signature-box">Employee Signature</div>'}
                            <div class="signature-box">Authorized Signature</div>
                        </div>
                        <div class="footer">
                            This is a computer generated payslip. No signature required.
                        </div>
                    </div>
                </body>
                </html>
                `;

                // Handle Actions
                if (action === 'preview') {
                    previewHtmls.push(htmlContent);
                } else if (action === 'email') {
                    if (typeof html2pdf !== 'undefined') {
                        const element = document.createElement('div');
                        element.innerHTML = htmlContent;
                        document.body.appendChild(element);

                        const opt = {
                            margin: [0.3, 0.3, 0.3, 0.3],
                            filename: `Payslip_${emp.name}_${monthName}_${year}.pdf`,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, logging: false },
                            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
                            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                        };

                        try {
                            const pdfDataUri = await html2pdf().set(opt).from(element).output('datauristring');
                            const base64Content = pdfDataUri.split(',')[1];

                            const subject = `Payslip for ${monthName} ${year} - ${company.name}`;
                            const emailHtml = `<p>Dear ${emp.name},</p><p>Please find attached your payslip for ${monthName} ${year}.</p>`;
                            const attachments = [{
                                filename: `Payslip_${emp.name}_${monthName}_${year}.pdf`,
                                content: base64Content,
                                encoding: 'base64'
                            }];

                            if (emp.email) {
                                await EmailService.sendEmail(emp.email, subject, emailHtml, attachments);
                            }
                        } catch (err) {
                            console.error(`Failed to email payslip to ${emp.name}:`, err);
                        } finally {
                            document.body.removeChild(element);
                        }
                    }
                } else {
                    // Default: Download PDF
                    if (typeof html2pdf !== 'undefined') {
                        const element = document.createElement('div');
                        element.innerHTML = htmlContent;
                        document.body.appendChild(element);

                        const opt = {
                            margin: [0.3, 0.3, 0.3, 0.3],
                            filename: `Payslip_${emp.name}_${monthName}_${year}.pdf`,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
                            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
                            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                        };

                        try {
                            await html2pdf().set(opt).from(element).save();
                        } catch (pdfError) {
                            console.error('PDF generation failed, falling back to print:', pdfError);
                            const printWindow = window.open('', '_blank');
                            printWindow.document.write(htmlContent);
                            printWindow.document.close();
                            printWindow.print();
                        } finally {
                            document.body.removeChild(element);
                        }
                    } else {
                        const printWindow = window.open('', '_blank');
                        printWindow.document.write(htmlContent);
                        printWindow.document.close();
                        printWindow.print();
                    }
                }
            }

            if (action === 'preview' && previewHtmls.length > 0) {
                const combinedHtml = previewHtmls.join('<div style="page-break-after: always;"></div>');
                const printWindow = window.open('', '_blank');
                printWindow.document.write(combinedHtml);
                printWindow.document.close();
            }

            if (action === 'email') {
                App.showNotification('Payslips emailed successfully', 'success');
            }
        } catch (error) {
            console.error('Error generating payslips:', error);
            alert('Error generating payslips: ' + error.message);
        } finally {
            App.hideLoader();
        }
    },

    async generateSalaryPayout(year, month, options = {}) {
        const { selectedEmployees = null, payoutData = null, creditDate = null, previewOnly = false } = options || {};

        if (!previewOnly) App.showLoader();

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[month];

        // Helper to ensure array
        const toArray = (val) => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') return val.split(',').map(s => s.trim());
            return [];
        };

        const settings = await DataManager.getSettings();
        console.log('DEBUG: Salary Payout Settings:', settings);
        const company = {
            name: settings.companyName || DataManager.COMPANY_PROFILE.name,
            registeredAddress: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
            emails: toArray(settings.emails || DataManager.COMPANY_PROFILE.emails),
            phones: toArray(settings.phones || DataManager.COMPANY_PROFILE.phones),
            gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
            pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
            iec: settings.iec || DataManager.COMPANY_PROFILE.iec
        };
        console.log('DEBUG: Salary Payout Company Object:', company);
        const manualDebitsProvided = Array.isArray(payoutData) && payoutData.length;
        let data = manualDebitsProvided ? payoutData : await this.getSalaryPayoutData(year, month, selectedEmployees);

        data = await Promise.all(data.map(async item => {
            const carryForwardBefore = item.carryForwardBefore ?? item.outstandingBefore ?? 0;
            const carryForwardPrev = item.carryForwardPrevious ?? Math.max(carryForwardBefore - (item.advanceThisMonth || 0), 0);
            const maxDebit = carryForwardBefore;
            const debit = typeof item.debitAmount === 'number'
                ? Math.min(Math.max(item.debitAmount, 0), maxDebit)
                : Math.min(Math.max(Math.min(carryForwardBefore, item.salaryBeforeAdvance || carryForwardBefore), 0), maxDebit);
            const netSalary = Math.max((item.salaryBeforeAdvance || 0) - debit, 0);
            const carryForwardAfter = Math.max(carryForwardBefore - debit, 0);
            const advanceThisMonth = item.advanceThisMonth != null ? item.advanceThisMonth : await DataManager.getTotalAdvanceForEmployee(item.name, year, month);
            const totalAdvanceFY = item.totalAdvanceFY != null ? item.totalAdvanceFY : await DataManager.getTotalAdvanceForEmployeeFY(item.name, year, month);
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
        }));

        if (!previewOnly) {
            if (!manualDebitsProvided) {
                for (const item of data) {
                    await DataManager.saveDebitedAdvance(item.name, year, month, item.debitAmount || 0);
                }
            }

            // Prepare payout details
            const employeeNames = data.map(d => d.name);
            const totalPaid = data.reduce((sum, d) => sum + (d.netSalary || 0), 0);
            const payoutDetails = {
                creditDate: creditDate,
                employees: employeeNames,
                totalPaid: totalPaid
            };

            //Mark salary payout done for the month, and accumulated months for daily employees
            await DataManager.markSalaryPayoutDone(year, month, payoutDetails);

            // For daily-paid employees, mark all accumulated unpaid months as paid
            const allEmployees = await DataManager.getEmployees();
            for (const item of data) {
                const employee = allEmployees.find(e => e.name === item.name);
                const salaryType = employee?.salaryType || 'monthly';

                if (salaryType === 'daily') {
                    // Mark all accumulated unpaid months as paid
                    let checkMonth = month;
                    let checkYear = year;

                    // Go back and mark up to 12 months or until we find a previously paid month
                    for (let i = 0; i < 12; i++) {
                        // Check if this month was already paid before this payout
                        const wasPaid = await DataManager.isSalaryPayoutDone(checkYear, checkMonth);

                        if (wasPaid && !(checkYear === year && checkMonth === month)) {
                            // Found a previously paid month, stop here
                            break;
                        }

                        // Mark this month as paid
                        if (!(checkYear === year && checkMonth === month)) {
                            await DataManager.markSalaryPayoutDone(checkYear, checkMonth, payoutDetails); // Use same details
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
            }
        }

        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page { size: A4 landscape; margin: 0.1in; }
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #000000 !important; background-color: #ffffff; -webkit-print-color-adjust: exact; }
                    .container { width: 10.8in; margin: 0 auto; padding: 0.1in; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 10px; border-bottom: 1px solid #000; padding-bottom: 5px; color: #000000 !important; }
                    .company-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; color: #000000 !important; }
                    .company-details { font-size: 8px; line-height: 1.2; color: #000000 !important; }
                    .report-title { text-align: center; font-size: 13px; font-weight: bold; margin: 8px 0; color: #000000 !important; text-transform: uppercase; }
                    .report-meta { text-align: center; font-size: 9px; margin-bottom: 8px; color: #000000 !important; }
                    table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 6.5pt; color: #000000 !important; table-layout: fixed; }
                    th, td { border: 1px solid #000; padding: 2px 1px; text-align: center; color: #000000 !important; border-color: #000000 !important; overflow: hidden; word-wrap: break-word; }
                    th { background-color: #f0f0f0; font-weight: bold; color: #000000 !important; font-size: 6pt; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .footer { margin-top: 10px; font-size: 6pt; text-align: center; border-top: 1px solid #000; padding-top: 4px; color: #000000 !important; }
                    .col-emp { width: 11%; }
                    .col-cnt { width: 4.5%; }
                    .col-ot { width: 5%; }
                    .col-adv { width: 6.5%; }
                    .col-pay { width: 7.5%; }
                    * { color: #000000 !important; }
                </style>
            </head>
            <body style="color: #000000 !important; background-color: #ffffff !important;">
                <div class="container">
                    <div class="header">
                    <div class="company-name">${company.name}</div>
                    <div class="company-details">
                        Registered Address: ${company.registeredAddress}<br>
                        Work Address: ${company.workAddress}<br>
                        Email: ${company.emails.join(', ')} | Phone: ${company.phones.join(', ')}<br>
                        GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}
                    </div>
                </div>
                <div class="report-title">SALARY PAYOUT STATEMENT (v2-REFINED) - ${monthName} ${year}</div>
                ${creditDate ? `<div class="report-meta"><strong>Salary Credit Date:</strong> ${DataManager.formatDateDisplay(creditDate)}</div>` : ''}
                <table>
                    <thead>
                        <tr>
                            <th class="col-emp text-left">Employee</th>
                            <th class="col-cnt">Pres.</th>
                            <th class="col-cnt">P.Lv</th>
                            <th class="col-cnt">U/S.Lv</th>
                            <th class="col-cnt">H-Day</th>
                            <th class="col-cnt">H-Work</th>
                            <th class="col-cnt">Hol.</th>
                            <th class="col-cnt">OT Hrs</th>
                            <th class="col-adv">Adv.Taken</th>
                            <th class="col-adv">C/F Prev</th>
                            <th class="col-adv">Bal.Bef.</th>
                            <th class="col-adv">Adv.Deb</th>
                            <th class="col-adv">C/F Next</th>
                            <th class="col-pay">Base Pay</th>
                            <th class="col-pay">OT Pay</th>
                            <th class="col-pay">Net Sal.</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const currency = (value) => `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
                            <td class="text-left">Total</td>
                            <td>${totals.present}</td>
                            <td>${totals.paidLeave}</td>
                            <td>${totals.unpaidLeave}</td>
                            <td>${totals.halfDays.toFixed(1)}</td>
                            <td>${totals.holidayWorking}</td>
                            <td>${totals.holidays}</td>
                            <td>${totals.otHours.toFixed(2)}</td>
                            <td class="text-right">${currency(totals.advanceThisMonth)}</td>
                            <td class="text-right">${currency(totals.carryForwardPrev)}</td>
                            <td class="text-right">${currency(totals.carryForwardOutstanding)}</td>
                            <td class="text-right">${currency(totals.advanceDebit)}</td>
                            <td class="text-right">${currency(totals.carryForwardNext)}</td>
                            <td class="text-right">${currency(totals.basePay)}</td>
                            <td class="text-right">${currency(totals.otPay)}</td>
                            <td class="text-right"><strong>${currency(totals.netSalary)}</strong></td>
                        </tr>
                    </tbody>
                </table>
                <div class="footer">
                    Generated on: ${new Date().toLocaleString('en-IN')}<br>
                    ${company.name} - ${company.registeredAddress}
                </div>
                </div>
            </body>
            </html>
        `;

        if (typeof html2pdf !== 'undefined') {
            const element = document.createElement('div');
            element.innerHTML = htmlContent;
            document.body.appendChild(element);

            const opt = {
                margin: [0.5, 0.3, 0.5, 0.3],
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

            html2pdf().set(opt).from(element).output('bloburl').then((pdfUrl) => {
                window.open(pdfUrl, '_blank');
                document.body.removeChild(element);
                App.hideLoader();
            }).catch(err => {
                console.error('PDF Generation Error:', err);
                App.hideLoader();
            });
        } else {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.print();
        }
    },
    async viewSalaryPayoutPDF(year, month) {
        const payoutDetails = await DataManager.getSalaryPayoutDetails(year, month);
        const creditDate = payoutDetails ? payoutDetails.creditDate : null;
        const employees = payoutDetails ? payoutDetails.employees : null;

        App.showLoader();
        try {
            await this.generateSalaryPayout(year, month, {
                selectedEmployees: employees,
                creditDate: creditDate,
                previewOnly: true
            });
        } finally {
            App.hideLoader();
        }
    }
};

// Expose to window
window.ReportsModule = ReportsModule;
