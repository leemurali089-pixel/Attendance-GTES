// Advance/Loan Tracking Module (CRUD)
const AdvancesModule = {
    editingAdvance: null,

    async load() {
        await this.renderAdvanceList();
    },

    async renderAdvanceList() {
        const view = document.getElementById('advancesView');
        if (!view) return;

        const advances = await DataManager.getAdvances();
        const employees = await DataManager.getEmployees();
        advances.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalAmount = advances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);

        // Calculate remaining balance per employee
        const employeeBalances = {};

        await Promise.all(employees.map(async emp => {
            const totalAdvance = await DataManager.getTotalAdvanceBalance(emp.name);
            const today = new Date();
            const remaining = await DataManager.getRemainingAdvanceBalance(emp.name, today.getFullYear(), today.getMonth());
            if (totalAdvance > 0) {
                employeeBalances[emp.name] = {
                    total: totalAdvance,
                    remaining: remaining,
                    debited: totalAdvance - remaining
                };
            }
        }));

        const totalRemainingBalance = Object.keys(employeeBalances).reduce((sum, empName) => {
            return sum + employeeBalances[empName].remaining;
        }, 0);

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Advance / Loan Tracking</h2>
                    <button class="btn btn-primary" onclick="AdvancesModule.showAdvanceForm()">
                        <i class="bi bi-plus-circle"></i> Add Advance
                    </button>
                    <button class="btn btn-warning ms-2" onclick="AdvancesModule.showWaveOffModal()">
                        <i class="bi bi-slash-circle"></i> Wave off
                    </button>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Total Advances</h5>
                            <h2 class="text-warning">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Total Remaining Balance</h5>
                            <h2 class="text-danger">₹${totalRemainingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Total Records</h5>
                            <h2 class="text-info">${advances.length}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Employees with Advances</h5>
                            <h2 class="text-success">${Object.keys(employeeBalances).length}</h2>
                        </div>
                    </div>
                </div>
            </div>
            ${Object.keys(employeeBalances).length > 0 ? `
            <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">Employee Advance Balance Summary</h5>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="showOnlyPendingToggle" onchange="AdvancesModule.togglePendingAdvances()">
                                <label class="form-check-label" for="showOnlyPendingToggle">
                                    Show Only Pending Advances
                                </label>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-sm table-hover">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Total Advance</th>
                                            <th>Debited</th>
                                            <th>Remaining Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody id="employeeBalanceTableBody">
                                        ${Object.keys(employeeBalances).map(empName => {
            const bal = employeeBalances[empName];
            return `
                                                <tr style="cursor: pointer;" onclick="AdvancesModule.showEmployeeDetails('${empName}')" data-remaining="${bal.remaining}">
                                                    <td>${empName}</td>
                                                    <td>₹${bal.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td class="text-success">₹${bal.debited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td class="text-warning"><strong>₹${bal.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                                                </tr>
                                            `;
        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Advances List</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Employee</th>
                                            <th>Amount</th>
                                            <th>Reason</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${advances.map(adv => `
                                            <tr>
                                                <td>${DataManager.formatDateDisplay(adv.date)}</td>
                                                <td>${adv.employee}</td>
                                                <td>₹${parseFloat(adv.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td>${adv.reason || '-'}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-primary" onclick="AdvancesModule.editAdvance('${adv.id}')">
                                                        <i class="bi bi-pencil"></i> Edit
                                                    </button>
                                                    <button class="btn btn-sm btn-danger" onclick="AdvancesModule.deleteAdvance('${adv.id}')">
                                                        <i class="bi bi-trash"></i> Delete
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
            </div>
            <div id="advanceFormModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="advanceFormTitle">Add Advance</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="advanceForm">
                                <input type="hidden" id="advanceId">
                                <div class="mb-3">
                                    <label for="advanceDate" class="form-label">Date *</label>
                                    <input type="date" class="form-control" id="advanceDate" required>
                                </div>
                                <div class="mb-3">
                                    <label for="advanceEmployee" class="form-label">Employee *</label>
                                    <select class="form-select" id="advanceEmployee" required>
                                        <option value="">Select Employee</option>
                                        ${employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="advanceAmount" class="form-label">Amount (₹) *</label>
                                    <input type="number" class="form-control" id="advanceAmount" step="0.01" min="0" required>
                                </div>
                                <div class="mb-3">
                                    <label for="advanceReason" class="form-label">Reason / Description</label>
                                    <textarea class="form-control" id="advanceReason" rows="3" placeholder="Enter reason for advance (optional)"></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="AdvancesModule.saveAdvance()">Save</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Employee Details Modal -->
            <div id="employeeDetailsModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="employeeDetailsTitle">Advance Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="employeeDetailsBody">
                            <!-- Content will be populated dynamically -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize modal
        const modalElement = document.getElementById('advanceFormModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }
    },

    async showAdvanceForm(advanceId = null) {
        this.editingAdvance = advanceId;
        const form = document.getElementById('advanceForm');
        const title = document.getElementById('advanceFormTitle');

        if (advanceId) {
            const advances = await DataManager.getAdvances();
            const advance = advances.find(a => a.id === advanceId);
            if (advance) {
                document.getElementById('advanceId').value = advance.id;
                document.getElementById('advanceDate').value = DataManager.formatDate(advance.date);
                document.getElementById('advanceEmployee').value = advance.employee;
                document.getElementById('advanceAmount').value = advance.amount;
                document.getElementById('advanceReason').value = advance.reason || '';
                title.textContent = 'Edit Advance';
            }
        } else {
            form.reset();
            document.getElementById('advanceId').value = '';
            document.getElementById('advanceDate').value = DataManager.formatDate(new Date());
            title.textContent = 'Add Advance';
        }

        if (this.modal) {
            this.modal.show();
        }
    },

    async saveAdvance() {
        const form = document.getElementById('advanceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const advanceId = document.getElementById('advanceId').value;
        const date = document.getElementById('advanceDate').value;
        const employee = document.getElementById('advanceEmployee').value;
        const amount = parseFloat(document.getElementById('advanceAmount').value);
        const reason = document.getElementById('advanceReason').value;

        if (!date || !employee || isNaN(amount) || amount <= 0) {
            App.showNotification('Please fill all required fields with valid values', 'error');
            return;
        }

        const year = new Date(date).getFullYear();
        if (year < 2000) {
            App.showNotification('Please enter a valid year (YYYY)', 'error');
            return;
        }

        const advances = await DataManager.getAdvances();

        if (advanceId) {
            // Update existing
            const index = advances.findIndex(a => a.id === advanceId);
            if (index !== -1) {
                advances[index] = {
                    ...advances[index],
                    date,
                    employee,
                    amount,
                    reason
                };
            }
        } else {
            // Add new
            const newAdvance = {
                id: 'adv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                date,
                employee,
                amount,
                reason
            };
            advances.push(newAdvance);
        }

        await DataManager.saveAdvances(advances);
        this.modal.hide();
        await this.renderAdvanceList();
        App.showNotification('Advance saved successfully', 'success');
    },

    editAdvance(advanceId) {
        this.showAdvanceForm(advanceId);
    },

    async showEmployeeDetails(employeeName) {
        const allAdvances = await DataManager.getAdvancesByEmployee(employeeName, -1, -1); // Get all advances

        // Separate regular advances and wave-offs
        const regularAdvances = allAdvances.filter(a => !a.type || a.type !== 'waveoff');
        const waveOffs = allAdvances.filter(a => a.type === 'waveoff');

        // Sort by date descending
        regularAdvances.sort((a, b) => new Date(b.date) - new Date(a.date));
        waveOffs.sort((a, b) => new Date(b.date) - new Date(a.date));

        const settings = await DataManager.getSettings();
        const debitedAdvances = settings.debitedAdvances || {};
        const deductions = [];

        for (const key of Object.keys(debitedAdvances)) {
            if (key.startsWith(`${employeeName}_`)) {
                const [_, year, month] = key.split('_');
                const yearNum = parseInt(year);
                const monthNum = parseInt(month);

                // Only show deductions for months where payout is actually done
                if (await DataManager.isSalaryPayoutDone(yearNum, monthNum)) {
                    deductions.push({
                        year: yearNum,
                        month: monthNum,
                        amount: debitedAdvances[key]
                    });
                }
            }
        }

        // Sort deductions by date descending
        deductions.sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });

        // Get legacy waived advances (if any) and combine with new wave-offs
        const legacyWaivedAdvances = settings.waivedAdvances || {};
        const waivers = [];

        // Add new wave-offs to waivers list
        waveOffs.forEach(wo => {
            waivers.push({
                date: wo.date,
                amount: Math.abs(parseFloat(wo.amount)), // Store as positive for display
                reason: wo.reason,
                type: 'new'
            });
        });

        // Add legacy waivers
        for (const key of Object.keys(legacyWaivedAdvances)) {
            if (key.startsWith(`${employeeName}_`)) {
                const [_, year, month] = key.split('_');
                const yearNum = parseInt(year);
                const monthNum = parseInt(month);

                if (await DataManager.isSalaryPayoutDone(yearNum, monthNum)) {
                    waivers.push({
                        date: new Date(yearNum, monthNum - 1, 1), // Approximate date
                        amount: legacyWaivedAdvances[key],
                        reason: 'Legacy Waiver',
                        type: 'legacy',
                        year: yearNum,
                        month: monthNum
                    });
                }
            }
        }

        // Sort waivers by date descending
        waivers.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Populate Modal
        const modalTitle = document.getElementById('employeeDetailsTitle');
        const modalBody = document.getElementById('employeeDetailsBody');

        if (modalTitle) modalTitle.textContent = `Advance Details - ${employeeName}`;

        if (modalBody) {
            // Calculate summary data
            const totalAdvances = regularAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
            const totalDebited = deductions.reduce((sum, ded) => sum + parseFloat(ded.amount || 0), 0);
            const totalWaived = waivers.reduce((sum, waiver) => sum + parseFloat(waiver.amount || 0), 0);
            const remainingBalance = totalAdvances - totalDebited - totalWaived;

            let html = `
                <ul class="nav nav-tabs" id="advanceDetailsTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="summary-tab" data-bs-toggle="tab" data-bs-target="#summary" type="button" role="tab">Summary</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="history-tab" data-bs-toggle="tab" data-bs-target="#history" type="button" role="tab">Advance History</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="deductions-tab" data-bs-toggle="tab" data-bs-target="#deductions" type="button" role="tab">Deduction History</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="waivers-tab" data-bs-toggle="tab" data-bs-target="#waivers" type="button" role="tab">Waived History</button>
                    </li>
                </ul>
                <div class="tab-content p-3" id="advanceDetailsTabContent">
                    <div class="tab-pane fade show active" id="summary" role="tabpanel">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-body">
                                        <h6 class="card-subtitle mb-2">Total Advances</h6>
                                        <h4 class="card-title text-primary">₹${totalAdvances.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-body">
                                        <h6 class="card-subtitle mb-2">Total Debited</h6>
                                        <h4 class="card-title text-success">₹${totalDebited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-body">
                                        <h6 class="card-subtitle mb-2">Total Waived</h6>
                                        <h4 class="card-title text-info">₹${totalWaived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card border-warning">
                                    <div class="card-body">
                                        <h6 class="card-subtitle mb-2">Remaining Balance</h6>
                                        <h4 class="card-title text-warning"><strong>₹${remainingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></h4>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="history" role="tabpanel">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${regularAdvances.length > 0 ? regularAdvances.map(adv => `
                                        <tr>
                                            <td>${DataManager.formatDateDisplay(adv.date)}</td>
                                            <td>₹${parseFloat(adv.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td>${adv.reason || '-'}</td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="3" class="text-center">No advance history found</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="deductions" role="tabpanel">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th>Amount Debited</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${deductions.length > 0 ? deductions.map(ded => `
                                        <tr>
                                            <td>${DataManager.formatMonthYear(ded.year, ded.month)}</td>
                                            <td>₹${parseFloat(ded.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="2" class="text-center">No deduction history found</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="waivers" role="tabpanel">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>Date/Month</th>
                                        <th>Amount Waived</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${waivers.length > 0 ? waivers.map(waiver => `
                                        <tr>
                                            <td>${waiver.type === 'new' ? DataManager.formatDateDisplay(waiver.date) : DataManager.formatMonthYear(waiver.year, waiver.month)}</td>
                                            <td>₹${parseFloat(waiver.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td>${waiver.reason || '-'}</td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="3" class="text-center">No waived history found</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            modalBody.innerHTML = html;
        }

        const modalElement = document.getElementById('employeeDetailsModal');
        if (modalElement) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        }
    },

    async deleteAdvance(advanceId) {
        if (!App.confirmAction('Are you sure you want to delete this advance record?')) {
            return;
        }

        const advances = await DataManager.getAdvances();
        const filtered = advances.filter(a => a.id !== advanceId);
        await DataManager.saveAdvances(filtered);
        await this.renderAdvanceList();
        App.showNotification('Advance deleted successfully', 'success');
    },

    togglePendingAdvances() {
        const toggle = document.getElementById('showOnlyPendingToggle');
        const tbody = document.getElementById('employeeBalanceTableBody');

        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        const showOnlyPending = toggle.checked;

        rows.forEach(row => {
            const remaining = parseFloat(row.getAttribute('data-remaining') || 0);
            if (showOnlyPending) {
                // Show only rows with remaining > 0
                row.style.display = remaining > 0 ? '' : 'none';
            } else {
                // Show all rows
                row.style.display = '';
            }
        });
    },

    async showWaveOffModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('waveOffModal');
        if (!modal) {
            const modalsContainer = document.body;
            const modalHTML = `
                <div class="modal fade" id="waveOffModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Wave off Advance</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label for="waveOffEmployee" class="form-label">Select Employee *</label>
                                    <select class="form-select" id="waveOffEmployee" onchange="AdvancesModule.onWaveOffEmployeeSelect()">
                                        <option value="">-- Select Employee --</option>
                                    </select>
                                </div>
                                <div id="waveOffBalanceInfo" class="alert alert-info d-none">
                                    <strong>Pending Balance:</strong> <span id="waveOffPendingBalance">₹0.00</span>
                                </div>
                                <div class="mb-3">
                                    <label for="waveOffAmount" class="form-label">Amount to Wave off *</label>
                                    <input type="number" class="form-control" id="waveOffAmount" 
                                           placeholder="Enter amount" step="0.01" min="0">
                                    <small class="form-text text-muted">Enter the amount you want to waive off from the pending balance</small>
                                </div>
                                <div class="mb-3">
                                    <label for="waveOffReason" class="form-label">Reason</label>
                                    <textarea class="form-control" id="waveOffReason" rows="2" 
                                              placeholder="Optional reason for waiving off"></textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-warning" onclick="AdvancesModule.processWaveOff()">
                                    <i class="bi bi-check-circle"></i> Wave off
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            modalsContainer.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('waveOffModal');
        }

        // Populate employee dropdown with only employees who have pending advances
        const employees = await DataManager.getEmployees();
        const employeeSelect = document.getElementById('waveOffEmployee');
        const today = new Date();

        let options = '<option value="">-- Select Employee --</option>';

        await Promise.all(employees.map(async emp => {
            const remaining = await DataManager.getRemainingAdvanceBalance(emp.name, today.getFullYear(), today.getMonth());
            if (remaining > 0) {
                options += `<option value="${emp.name}">${emp.name} (₹${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} pending)</option>`;
            }
        }));

        employeeSelect.innerHTML = options;

        // Reset form
        document.getElementById('waveOffAmount').value = '';
        document.getElementById('waveOffReason').value = '';
        document.getElementById('waveOffBalanceInfo').classList.add('d-none');

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    },

    async onWaveOffEmployeeSelect() {
        const employeeName = document.getElementById('waveOffEmployee').value;
        const balanceInfo = document.getElementById('waveOffBalanceInfo');
        const balanceSpan = document.getElementById('waveOffPendingBalance');
        const amountInput = document.getElementById('waveOffAmount');

        if (employeeName) {
            const today = new Date();
            const remaining = await DataManager.getRemainingAdvanceBalance(employeeName, today.getFullYear(), today.getMonth());

            balanceSpan.textContent = `₹${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            balanceInfo.classList.remove('d-none');

            // Set max value for amount input
            amountInput.max = remaining;
        } else {
            balanceInfo.classList.add('d-none');
            amountInput.max = '';
        }
    },

    async processWaveOff() {
        const employeeName = document.getElementById('waveOffEmployee').value;
        const amount = parseFloat(document.getElementById('waveOffAmount').value);
        const reason = document.getElementById('waveOffReason').value.trim();

        if (!employeeName) {
            App.showNotification('Please select an employee', 'error');
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            App.showNotification('Please enter a valid amount', 'error');
            return;
        }

        const today = new Date();
        const remaining = await DataManager.getRemainingAdvanceBalance(employeeName, today.getFullYear(), today.getMonth());

        if (amount > remaining) {
            App.showNotification(`Amount cannot exceed pending balance of ₹${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'error');
            return;
        }

        // Create a debit entry for the waived-off amount
        const advances = await DataManager.getAdvances();
        const waveOffEntry = {
            id: 'adv_waveoff_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: DataManager.formatDate(new Date()),
            employee: employeeName,
            amount: -amount, // Negative amount indicates a debit/waive-off
            reason: reason || 'Waived off',
            type: 'waveoff' // Mark as wave-off for tracking
        };

        advances.push(waveOffEntry);
        await DataManager.saveAdvances(advances);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('waveOffModal'));
        modal.hide();

        // Reload the view
        await this.renderAdvanceList();

        App.showNotification(`Successfully waived off ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} for ${employeeName}`, 'success');
    }
};

