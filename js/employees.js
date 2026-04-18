// Employee Management Module (CRUD)
const EmployeesModule = {
    editingEmployee: null,
    filterState: 'active', // Default filter state

    async load() {
        await this.renderEmployeeList();
    },

    async renderEmployeeList() {
        const view = document.getElementById('employeesView');
        if (!view) {
            console.error('employeesView element not found');
            return;
        }

        // Make sure view is visible
        view.classList.remove('d-none');
        view.style.display = '';

        const allEmployees = await DataManager.getEmployees();
        const activeEmployees = await DataManager.getActiveEmployees();
        const canManage = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_EMPLOYEES);

        // Filter Logic
        let displayedEmployees = [];
        if (this.filterState === 'active') {
            displayedEmployees = activeEmployees;
        } else if (this.filterState === 'inactive') {
            displayedEmployees = allEmployees.filter(e => e.dateOfRelieving && new Date(e.dateOfRelieving) < new Date());
        } else {
            displayedEmployees = allEmployees;
        }

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12 d-flex justify-content-between align-items-center">
                    <h2>Employee Directory</h2>
                    ${canManage ? `
                    <div>
                        <button class="btn btn-success me-2" onclick="EmployeesModule.exportSampleFile()">
                            <i class="bi bi-file-earmark-spreadsheet"></i> Export Sample
                        </button>
                        <button class="btn btn-warning me-2" onclick="EmployeesModule.showBulkSalaryAdjustmentModal()">
                            <i class="bi bi-cash-stack"></i> Bulk Salary Update
                        </button>
                        <button class="btn btn-primary" onclick="EmployeesModule.showEmployeeForm()">
                            <i class="bi bi-plus-circle"></i> Add New Employee
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>Employees List (${displayedEmployees.length} Shown)</h5>
                            <div class="btn-group" role="group">
                                <button type="button" class="btn btn-sm btn-outline-primary ${this.filterState === 'active' ? 'active' : ''}" 
                                        onclick="EmployeesModule.setFilter('active')">Active</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary ${this.filterState === 'inactive' ? 'active' : ''}" 
                                        onclick="EmployeesModule.setFilter('inactive')">Inactive</button>
                                <button type="button" class="btn btn-sm btn-outline-info ${this.filterState === 'all' ? 'active' : ''}" 
                                        onclick="EmployeesModule.setFilter('all')">All</button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Date of Joining</th>
                                            <th>Date of Relieving</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${displayedEmployees.length > 0 ? displayedEmployees.map(emp => `
                                            <tr>
                                                <td>${emp.name}</td>
                                                <td>${DataManager.formatDateDisplay(emp.dateOfJoining)}</td>
                                                <td>${emp.dateOfRelieving ? DataManager.formatDateDisplay(emp.dateOfRelieving) : '-'}</td>
                                                <td>
                                                    ${emp.dateOfRelieving && new Date(emp.dateOfRelieving) < new Date()
                ? '<span class="badge bg-danger">Inactive</span>'
                : '<span class="badge bg-success">Active</span>'}
                                                </td>
                                                <td>
                                                    <button class="btn btn-sm btn-info" onclick="EmployeesModule.viewEmployeeDetails('${emp.name.replace(/'/g, "\\'")}')">
                                                        <i class="bi bi-eye"></i> View Details
                                                    </button>
                                                    ${canManage ? `
                                                    <button class="btn btn-sm btn-primary ms-1" onclick="EmployeesModule.editEmployee('${emp.id}')">
                                                        <i class="bi bi-pencil"></i> Edit
                                                    </button>
                                                    <button class="btn btn-sm btn-secondary ms-1" onclick="EmployeesModule.showSalaryAdjustmentModal('${emp.id}')">
                                                        <i class="bi bi-cash-coin"></i> Salary Update
                                                    </button>
                                                    <button class="btn btn-sm btn-warning ms-1" onclick="EmployeesModule.viewSalaryHistory('${emp.name.replace(/'/g, "\\'")}')">
                                                        <i class="bi bi-clock-history"></i> Salary History
                                                    </button>
                                                    <button class="btn btn-sm btn-danger ms-1" onclick="EmployeesModule.deleteEmployee('${emp.id}')">
                                                        <i class="bi bi-trash"></i> Delete
                                                    </button>
                                                    ` : ''}
                                                </td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="5" class="text-center">No employees found</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ${this.getModalHTML()}
        `;

        this.initializeModal();
    },

    setFilter(state) {
        this.filterState = state;
        this.renderEmployeeList();
    },

    async getAdminTableHTML() {
        const employees = await DataManager.getEmployees();
        const activeEmployees = await DataManager.getActiveEmployees();

        return `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Employee Management (${activeEmployees.length} Active / ${employees.length} Total)</h5>
                    <div>
                        <button class="btn btn-sm btn-warning me-2" onclick="EmployeesModule.showBulkSalaryAdjustmentModal()">
                            <i class="bi bi-cash-stack"></i> Bulk Salary Update
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="EmployeesModule.showEmployeeForm()">
                            <i class="bi bi-plus-circle"></i> Add New Employee
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Date of Joining</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${employees.map(emp => `
                                    <tr>
                                        <td>${emp.name}</td>
                                        <td>${DataManager.formatDateDisplay(emp.dateOfJoining)}</td>
                                        <td>
                                            ${emp.dateOfRelieving && new Date(emp.dateOfRelieving) < new Date()
                ? '<span class="badge bg-danger">Inactive</span>'
                : '<span class="badge bg-success">Active</span>'}
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-primary" onclick="EmployeesModule.editEmployee('${emp.id}')">
                                                <i class="bi bi-pencil"></i> Edit
                                            </button>
                                            <button class="btn btn-sm btn-secondary" onclick="EmployeesModule.showSalaryAdjustmentModal('${emp.id}')">
                                                <i class="bi bi-cash-coin"></i> Salary Update
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="EmployeesModule.deleteEmployee('${emp.id}')">
                                                <i class="bi bi-trash"></i> Delete
                                            </button>
                                            <button class="btn btn-sm btn-info" onclick="EmployeesModule.viewEmployeeDetails('${emp.name.replace(/'/g, "\\'")}')">
                                                <i class="bi bi-eye"></i> Details
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            ${this.getModalHTML()}
        `;
    },

    getModalHTML() {
        return `
            <div id="employeeFormModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="employeeFormTitle">Add Employee</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <ul class="nav nav-tabs" id="employeeTabs" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" id="personal-tab" data-bs-toggle="tab" data-bs-target="#personal" type="button">
                                        <i class="bi bi-person"></i> Personal
                                    </button>
                                </li>
                                <li class="nav-item" role="presentation" id="bank-tab-nav">
                                    <button class="nav-link" id="bank-tab" data-bs-toggle="tab" data-bs-target="#bank" type="button">
                                        <i class="bi bi-bank"></i> Bank Details
                                    </button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" id="kyc-tab" data-bs-toggle="tab" data-bs-target="#kyc" type="button">
                                        <i class="bi bi-card-text"></i> KYC
                                    </button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" id="address-tab" data-bs-toggle="tab" data-bs-target="#address" type="button">
                                        <i class="bi bi-geo-alt"></i> Address
                                    </button>
                                </li>
                            </ul>
                            
                            <form id="employeeForm" class="mt-3">
                                <input type="hidden" id="employeeId">
                                <div class="tab-content" id="employeeTabsContent">
                                    <!-- Personal Tab -->
                                    <div class="tab-pane fade show active" id="personal" role="tabpanel">
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="employeeName" class="form-label">Name *</label>
                                                <input type="text" class="form-control" id="employeeName" required>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="employeeIdInput" class="form-label">Employee ID *</label>
                                                <input type="text" class="form-control" id="employeeIdInput" placeholder="Auto-generated if empty">
                                                <small class="form-text text-muted">Leave empty to auto-generate</small>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="phone" class="form-label">Phone</label>
                                                <input type="tel" class="form-control" id="phone" pattern="[0-9]{10}">
                                                <small class="form-text text-muted">10 digits</small>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="email" class="form-label">Email</label>
                                                <input type="email" class="form-control" id="email">
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="dateOfJoining" class="form-label">Date of Joining *</label>
                                                <input type="date" class="form-control" id="dateOfJoining" required>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="dateOfRelieving" class="form-label">Date of Relieving</label>
                                                <input type="date" class="form-control" id="dateOfRelieving">
                                                <small class="form-text text-muted">Leave empty if currently active</small>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="salaryType" class="form-label">Salary Type *</label>
                                                <select class="form-select" id="salaryType" required>
                                                    <option value="monthly">Monthly Salary</option>
                                                    <option value="daily">Daily Salary</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="baseSalary" class="form-label">Basic Salary (₹) *</label>
                                                <input type="number" class="form-control" id="baseSalary" step="0.01" min="0" required>
                                                <small class="form-text text-muted">Monthly or daily rate</small>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="paymentMode" class="form-label">Payment Mode *</label>
                                                <select class="form-select" id="paymentMode" required onchange="EmployeesModule.handlePaymentModeChange()">
                                                    <option value="bank">Bank Transfer</option>
                                                    <option value="cash">Cash</option>
                                                    <option value="cheque">Cheque</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Bank Details Tab -->
                                    <div class="tab-pane fade" id="bank" role="tabpanel">
                                        <div class="alert alert-info">
                                            <i class="bi bi-info-circle"></i> These details are required for salary remittance via bank transfer
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="beneficiaryName" class="form-label">Beneficiary Name *</label>
                                                <input type="text" class="form-control" id="beneficiaryName">
                                                <small class="form-text text-muted">As per bank records</small>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="accountNo" class="form-label">Account Number *</label>
                                                <input type="text" class="form-control" id="accountNo">
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="ifsc" class="form-label">IFSC Code *</label>
                                                <input type="text" class="form-control" id="ifsc" pattern="[A-Z]{4}0[A-Z0-9]{6}" style="text-transform: uppercase">
                                                <small class="form-text text-muted">Format: SBIN0001234</small>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="branchName" class="form-label">Branch Name *</label>
                                                <input type="text" class="form-control" id="branchName">
                                            </div>
                                        </div>
                                        <div class="mb-3">
                                            <label for="bankAddress" class="form-label">Bank Branch Address *</label>
                                            <textarea class="form-control" id="bankAddress" rows="2"></textarea>
                                        </div>
                                    </div>

                                    <!-- KYC Tab -->
                                    <div class="tab-pane fade" id="kyc" role="tabpanel">
                                        <div class="alert alert-warning">
                                            <i class="bi bi-shield-check"></i> KYC details are optional but recommended for compliance
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="pan" class="form-label">PAN Number</label>
                                                <input type="text" class="form-control" id="pan" maxlength="10" style="text-transform: uppercase">
                                                <small class="form-text text-muted">Format: ABCDE1234F</small>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="aadhaar" class="form-label">Aadhaar Number</label>
                                                <input type="text" class="form-control" id="aadhaar" maxlength="12">
                                                <small class="form-text text-muted">12 digits</small>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label for="employeePhoto" class="form-label">Employee Photo</label>
                                                <input type="file" class="form-control" id="employeePhoto" accept="image/*" onchange="EmployeesModule.handlePhotoUpload(event, 'employee')">
                                                <small class="form-text text-muted">Max 15 MB</small>
                                                <div id="employeePhotoPreview" class="mt-2"></div>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label for="aadhaarPhoto" class="form-label">Aadhaar Card Photo</label>
                                                <input type="file" class="form-control" id="aadhaarPhoto" accept="image/*" onchange="EmployeesModule.handlePhotoUpload(event, 'aadhaar')">
                                                <small class="form-text text-muted">Max 15 MB</small>
                                                <div id="aadhaarPhotoPreview" class="mt-2"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Address Tab -->
                                    <div class="tab-pane fade" id="address" role="tabpanel">
                                        <div class="mb-3">
                                            <label for="permanentAddress" class="form-label">Permanent Address</label>
                                            <textarea class="form-control" id="permanentAddress" rows="3"></textarea>
                                        </div>
                                        <div class="mb-3">
                                            <label for="presentAddress" class="form-label">Present Address</label>
                                            <textarea class="form-control" id="presentAddress" rows="3"></textarea>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="sameAsPermAddress" onchange="EmployeesModule.handleSameAddress()">
                                            <label class="form-check-label" for="sameAsPermAddress">
                                                Same as Permanent Address
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="EmployeesModule.saveEmployee()">Save Employee</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="salaryAdjustmentModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-cash-coin me-1"></i> Salary Correction / Hike</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="salaryAdjEmployeeId">
                            <div class="mb-2 small text-muted">Employee: <strong id="salaryAdjEmployeeName">—</strong></div>
                            <div class="mb-3 small text-muted">Current Salary: <strong id="salaryAdjCurrentSalary">₹0</strong></div>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label for="salaryAdjType" class="form-label">Update Type *</label>
                                    <select id="salaryAdjType" class="form-select" onchange="EmployeesModule.updateSalaryAdjustmentPreview()">
                                        <option value="hike">Hike</option>
                                        <option value="correction">Salary Correction</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label for="salaryAdjMode" class="form-label">Mode *</label>
                                    <select id="salaryAdjMode" class="form-select" onchange="EmployeesModule.updateSalaryAdjustmentPreview()">
                                        <option value="amount">Amount (₹)</option>
                                        <option value="percentage">Percentage (%)</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label for="salaryAdjValue" class="form-label">Value *</label>
                                    <input type="number" id="salaryAdjValue" class="form-control" step="0.01" min="0" placeholder="Enter value" oninput="EmployeesModule.updateSalaryAdjustmentPreview()">
                                    <small class="form-text text-muted">For correction + amount, this is treated as the final corrected salary.</small>
                                </div>
                                <div class="col-md-6">
                                    <label for="salaryAdjDate" class="form-label">Effective Date *</label>
                                    <input type="date" id="salaryAdjDate" class="form-control">
                                    <small class="form-text text-muted">Applied from this date (month is derived automatically).</small>
                                </div>
                                <div class="col-12">
                                    <label for="salaryAdjReason" class="form-label">Reason / Notes</label>
                                    <textarea id="salaryAdjReason" class="form-control" rows="2" placeholder="e.g. Annual appraisal, correction from Jan payroll"></textarea>
                                </div>
                            </div>
                            <div class="alert alert-info mt-3 mb-0">
                                <div><strong>New Salary Preview:</strong> <span id="salaryAdjPreview">₹0</span></div>
                                <div class="small mb-0">This update is saved in Salary History with effective date and month for audit.</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="EmployeesModule.saveSalaryAdjustment()">Apply Update</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="bulkSalaryAdjustmentModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-cash-stack me-1"></i> Bulk Salary Correction / Hike</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-3 mb-3">
                                <div class="col-md-3">
                                    <label for="bulkSalaryType" class="form-label">Update Type *</label>
                                    <select id="bulkSalaryType" class="form-select" onchange="EmployeesModule.recalcAllBulkPreviews()">
                                        <option value="hike">Hike</option>
                                        <option value="correction">Salary Correction</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label for="bulkSalaryMode" class="form-label">Mode *</label>
                                    <select id="bulkSalaryMode" class="form-select" onchange="EmployeesModule.recalcAllBulkPreviews()">
                                        <option value="amount">Amount (₹)</option>
                                        <option value="percentage">Percentage (%)</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label for="bulkSalaryDate" class="form-label">Effective Date *</label>
                                    <input type="date" id="bulkSalaryDate" class="form-control">
                                    <small class="form-text text-muted">Applied to every selected employee.</small>
                                </div>
                                <div class="col-md-3">
                                    <label for="bulkSalaryCommonValue" class="form-label">Common Value (optional)</label>
                                    <div class="input-group">
                                        <input type="number" id="bulkSalaryCommonValue" class="form-control" step="0.01" min="0" placeholder="Fill all rows">
                                        <button class="btn btn-outline-secondary" type="button" onclick="EmployeesModule.bulkSalaryApplyCommonValue()" title="Fill value into every selected row">
                                            <i class="bi bi-arrow-down-square"></i> Fill
                                        </button>
                                    </div>
                                </div>
                                <div class="col-12">
                                    <label for="bulkSalaryReason" class="form-label">Common Reason / Notes *</label>
                                    <textarea id="bulkSalaryReason" class="form-control" rows="2" placeholder="e.g. Annual appraisal FY 2026, correction as per revised CTC policy"></textarea>
                                </div>
                            </div>
                            <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-2">
                                <div class="btn-group btn-group-sm" role="group">
                                    <button type="button" class="btn btn-outline-secondary" onclick="EmployeesModule.bulkSalarySelectVisible(true)">
                                        <i class="bi bi-check2-square"></i> Select All
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" onclick="EmployeesModule.bulkSalarySelectVisible(false)">
                                        <i class="bi bi-square"></i> Select None
                                    </button>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <input type="search" class="form-control form-control-sm" id="bulkSalarySearch" placeholder="Search employee..." style="min-width:220px" oninput="EmployeesModule.bulkSalaryFilter()">
                                </div>
                            </div>
                            <div class="table-responsive" style="max-height: 45vh; overflow-y: auto;">
                                <table class="table table-sm table-hover align-middle mb-0">
                                    <thead>
                                        <tr>
                                            <th style="width:36px">
                                                <input type="checkbox" class="form-check-input" id="bulkSalaryHeaderCheck" onchange="EmployeesModule.bulkSalarySelectVisible(this.checked)">
                                            </th>
                                            <th>Employee</th>
                                            <th class="text-end">Current Salary</th>
                                            <th style="width:200px">Value *</th>
                                            <th class="text-end">New Salary</th>
                                        </tr>
                                    </thead>
                                    <tbody id="bulkSalaryTbody">
                                        <tr><td colspan="5" class="text-center text-muted py-4">Loading employees...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="alert alert-info mt-3 mb-0 d-flex flex-wrap justify-content-between gap-3">
                                <div>Selected: <strong id="bulkSalarySelectedCount">0</strong> of <strong id="bulkSalaryVisibleCount">0</strong></div>
                                <div>Total New Payout: <strong id="bulkSalaryTotalPayout">₹0</strong></div>
                                <div>Total Delta: <strong id="bulkSalaryTotalDelta">₹0</strong></div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="EmployeesModule.saveBulkSalaryAdjustment()">
                                <i class="bi bi-check2-circle me-1"></i> Apply Bulk Update
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    viewEmployeeDetails(employeeName) {
        console.log('View Details called for:', employeeName);
        App.showView('employeeView', { employeeName: employeeName });
    },

    initializeModal() {
        const modalElement = document.getElementById('employeeFormModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }
    },

    /**
     * Handle payment mode change - show/hide bank tab
     */
    handlePaymentModeChange() {
        const paymentMode = document.getElementById('paymentMode')?.value;
        const bankTabNav = document.getElementById('bank-tab-nav');

        if (paymentMode === 'bank') {
            bankTabNav?.classList.remove('d-none');
        } else {
            bankTabNav?.classList.add('d-none');
            // Switch to personal tab if currently on bank tab
            const bankTab = document.getElementById('bank');
            if (bankTab?.classList.contains('active')) {
                const personalTabBtn = document.getElementById('personal-tab');
                personalTabBtn?.click();
            }
        }
    },

    /**
     * Handle same address checkbox
     */
    handleSameAddress() {
        const same = document.getElementById('sameAsPermAddress')?.checked;
        const permanent = document.getElementById('permanentAddress')?.value;
        const present = document.getElementById('presentAddress');

        if (same && present) {
            present.value = permanent;
            present.readOnly = true;
        } else if (present) {
            present.readOnly = false;
        }
    },

    attachViewDetailsListeners() {
        // Clear any existing timer
        if (this.attachTimeout) {
            clearTimeout(this.attachTimeout);
        }

        // Attach listeners with a small delay to ensure DOM is ready
        this.attachTimeout = setTimeout(() => {
            const viewDetailsButtons = document.querySelectorAll('.view-employee-details-btn');
            console.log('Attaching View Details listeners to', viewDetailsButtons.length, 'buttons');

            viewDetailsButtons.forEach((btn, index) => {
                // Remove existing listeners by cloning
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const employeeName = this.getAttribute('data-employee');
                    console.log('View Details clicked for:', employeeName);

                    if (employeeName) {
                        const decodedName = employeeName.replace(/&quot;/g, '"');
                        console.log('Showing employee view for:', decodedName);
                        App.showView('employeeView', { employeeName: decodedName });
                    } else {
                        console.error('No employee name found on button');
                    }
                });
            });

            console.log('View Details listeners attached successfully');
        }, 100); // Reduced timeout for faster attachment
    },

    async showEmployeeForm(employeeId = null) {
        this.editingEmployee = employeeId;

        // Ensure modal HTML exists in DOM first
        const modalElement = document.getElementById('employeeFormModal');
        if (!modalElement) {
            console.error('Modal element not found in DOM');
            return;
        }

        // Ensure modal is initialized
        if (!this.modal) {
            this.initializeModal();
        }

        const form = document.getElementById('employeeForm');
        const title = document.getElementById('employeeFormTitle');

        if (employeeId) {
            const employees = await DataManager.getEmployees();
            const employee = employees.find(e => e.id === employeeId);
            if (employee) {
                // Personal Tab
                document.getElementById('employeeId').value = employee.id || '';
                document.getElementById('employeeName').value = employee.name || '';
                if (document.getElementById('employeeIdInput')) document.getElementById('employeeIdInput').value = employee.id || '';
                if (document.getElementById('phone')) document.getElementById('phone').value = employee.phone || '';
                if (document.getElementById('email')) document.getElementById('email').value = employee.email || '';
                document.getElementById('dateOfJoining').value = DataManager.formatDate(employee.dateOfJoining);
                document.getElementById('dateOfRelieving').value = employee.dateOfRelieving ? DataManager.formatDate(employee.dateOfRelieving) : '';
                document.getElementById('salaryType').value = employee.salaryType || 'monthly';
                document.getElementById('baseSalary').value = employee.baseSalary || '';
                if (document.getElementById('paymentMode')) document.getElementById('paymentMode').value = employee.paymentMode || 'bank';

                // Bank Tab
                const bank = employee.bank || {};
                if (document.getElementById('beneficiaryName')) document.getElementById('beneficiaryName').value = bank.beneficiaryName || '';
                if (document.getElementById('accountNo')) document.getElementById('accountNo').value = bank.accountNo || '';
                if (document.getElementById('ifsc')) document.getElementById('ifsc').value = bank.ifsc || '';
                if (document.getElementById('branchName')) document.getElementById('branchName').value = bank.branchName || '';
                if (document.getElementById('bankAddress')) document.getElementById('bankAddress').value = bank.address || '';

                // KYC Tab
                if (document.getElementById('pan')) document.getElementById('pan').value = employee.pan || '';
                if (document.getElementById('aadhaar')) document.getElementById('aadhaar').value = employee.aadhaar || '';

                // Photos
                if (employee.employeePhoto) {
                    this.employeePhotoData = employee.employeePhoto;
                    const preview = document.getElementById('employeePhotoPreview');
                    if (preview) {
                        preview.innerHTML = `<img src="${employee.employeePhoto}" alt="Employee Photo" style="max-width: 150px; max-height: 150px; border-radius: 5px; object-fit: cover;">`;
                    }
                }
                if (employee.aadhaarPhoto) {
                    this.aadhaarPhotoData = employee.aadhaarPhoto;
                    const preview = document.getElementById('aadhaarPhotoPreview');
                    if (preview) {
                        preview.innerHTML = `<img src="${employee.aadhaarPhoto}" alt="Aadhaar Photo" style="max-width: 150px; max-height: 150px; border-radius: 5px; object-fit: cover;">`;
                    }
                }

                // Address Tab
                const address = employee.address || {};
                if (document.getElementById('permanentAddress')) document.getElementById('permanentAddress').value = address.permanent || '';
                if (document.getElementById('presentAddress')) document.getElementById('presentAddress').value = address.present || '';

                // Handle payment mode visibility
                this.handlePaymentModeChange();

                title.textContent = 'Edit Employee';
            }
        } else {
            form.reset();
            document.getElementById('employeeId').value = '';
            if (document.getElementById('paymentMode')) document.getElementById('paymentMode').value = 'bank';

            // Clear photo previews
            this.employeePhotoData = null;
            this.aadhaarPhotoData = null;
            const employeePhotoPreview = document.getElementById('employeePhotoPreview');
            const aadhaarPhotoPreview = document.getElementById('aadhaarPhotoPreview');
            if (employeePhotoPreview) employeePhotoPreview.innerHTML = '';
            if (aadhaarPhotoPreview) aadhaarPhotoPreview.innerHTML = '';

            this.handlePaymentModeChange();
            title.textContent = 'Add Employee';
        }

        // Show modal
        if (this.modal) {
            try {
                this.modal.show();
            } catch (error) {
                console.error('Error showing modal:', error);
                // Fallback: reinitialize and try again
                this.initializeModal();
                if (this.modal) {
                    this.modal.show();
                }
            }
        }
    },

    async saveEmployee() {
        console.log('Save Employee called');

        try {
            const form = document.getElementById('employeeForm');
            if (!form) {
                console.error('Form not found');
                App.showNotification('Form not found', 'error');
                return;
            }

            if (!form.checkValidity()) {
                console.log('Form validation failed');
                form.reportValidity();
                return;
            }

            console.log('Form is valid, collecting data...');

            const employeeId = document.getElementById('employeeId')?.value;

            // Personal Tab
            const name = document.getElementById('employeeName')?.value.trim();
            const phone = document.getElementById('phone')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const dateOfJoining = document.getElementById('dateOfJoining')?.value;
            const dateOfRelieving = document.getElementById('dateOfRelieving')?.value;
            const salaryType = document.getElementById('salaryType')?.value;
            const baseSalary = parseFloat(document.getElementById('baseSalary')?.value);
            const paymentMode = document.getElementById('paymentMode')?.value;

            // Bank Tab
            const beneficiaryName = document.getElementById('beneficiaryName')?.value?.trim() || "";
            const accountNo = document.getElementById('accountNo')?.value?.trim() || "";
            const ifsc = document.getElementById('ifsc')?.value?.trim().toUpperCase() || "";
            const branchName = document.getElementById('branchName')?.value?.trim() || "";
            const bankAddress = document.getElementById('bankAddress')?.value?.trim() || "";

            // KYC Tab
            const pan = document.getElementById('pan')?.value?.trim().toUpperCase() || "";
            const aadhaar = document.getElementById('aadhaar')?.value?.trim() || "";

            // Address Tab
            const permanentAddress = document.getElementById('permanentAddress')?.value?.trim() || "";
            const presentAddress = document.getElementById('presentAddress')?.value?.trim() || "";

            console.log('Data collected:', { name, dateOfJoining, salaryType, baseSalary, paymentMode });

            // Basic validation
            if (!name || !dateOfJoining || !salaryType || isNaN(baseSalary) || baseSalary < 0) {
                console.error('Required fields missing:', { name: !!name, dateOfJoining: !!dateOfJoining, salaryType: !!salaryType, baseSalary });
                App.showNotification('Please fill all required fields with valid values', 'error');
                return;
            }

            // Build employee object
            const employeeData = {
                name,
                phone,
                email,
                dateOfJoining,
                dateOfRelieving: dateOfRelieving || null,
                salaryType,
                baseSalary,
                paymentMode: paymentMode || 'bank',
                bank: {
                    beneficiaryName,
                    accountNo,
                    ifsc,
                    branchName,
                    address: bankAddress
                },
                pan,
                aadhaar,
                address: {
                    permanent: permanentAddress,
                    present: presentAddress
                },
                employeePhoto: this.employeePhotoData || null,
                aadhaarPhoto: this.aadhaarPhotoData || null
            };

            console.log('Employee data built, validating...');

            // Validate bank details if paymentMode is bank
            const bankValidation = DataManager.validateBankDetails(employeeData);
            if (!bankValidation.valid) {
                console.error('Bank validation failed:', bankValidation.errors);
                App.showNotification(bankValidation.errors.join('\n'), 'error');
                return;
            }

            // Validate PAN if provided
            if (pan) {
                const panValidation = DataManager.validatePAN(pan);
                if (!panValidation.valid) {
                    console.error('PAN validation failed:', panValidation.message);
                    App.showNotification(panValidation.message, 'error');
                    return;
                }
            }

            // Validate Aadhaar if provided
            if (aadhaar) {
                const aadhaarValidation = DataManager.validateAadhaar(aadhaar);
                if (!aadhaarValidation.valid) {
                    console.error('Aadhaar validation failed:', aadhaarValidation.message);
                    App.showNotification(aadhaarValidation.message, 'error');
                    return;
                }
            }

            console.log('All validations passed, saving...');

            const employees = await DataManager.getEmployees();

            // Validate unique ID if manually entered or changed
            const manualId = document.getElementById('employeeIdInput')?.value?.trim();
            if (manualId) {
                const existing = employees.find(e => e.id === manualId);
                if (existing && existing.id !== employeeId) {
                    App.showNotification('Employee ID already exists. Please choose a unique ID.', 'error');
                    return;
                }
            }

            if (employeeId) {
                // Update existing
                console.log('Updating employee:', employeeId);
                const index = employees.findIndex(e => e.id === employeeId);
                if (index !== -1) {
                    const oldEmployee = employees[index];
                    const oldSalary = oldEmployee.baseSalary || 0;

                    // Check if salary has changed
                    if (oldSalary !== baseSalary) {
                        console.log(`Salary changed for ${name}: ₹${oldSalary} → ₹${baseSalary}`);

                        // Track revision (will be saved with employees)
                        await DataManager.addSalaryRevision(
                            name,
                            baseSalary,
                            'Salary updated',
                            new Date().toISOString().split('T')[0],
                            oldEmployee
                        );
                    }

                    // Handle ID Change if needed
                    let finalId = employeeId;
                    if (manualId && manualId !== employeeId) {
                        finalId = manualId;
                        // We are changing the ID. 
                        // WARN: This might break links if other records link by ID. 
                        // Currently most links are by Name (legacy), but new features might use ID.
                        // Ideally we should warn user, but for now we proceed.
                    }

                    employees[index] = DataManager.addTimestamp({
                        ...employees[index],
                        id: finalId, // Update ID if changed
                        ...employeeData,
                        employeePhoto: this.employeePhotoData || employees[index].employeePhoto || null,
                        aadhaarPhoto: this.aadhaarPhotoData || employees[index].aadhaarPhoto || null
                    });
                }
            } else {
                // Add new
                console.log('Adding new employee');
                let newId = manualId;
                if (!newId) {
                    newId = await DataManager.generateEmployeeId();
                }

                // Double check generated ID uniqueness just in case
                if (employees.find(e => e.id === newId)) {
                    // Should rarely happen with timestamp based generation but manual input might conflict
                    App.showNotification('Generated ID conflict. Please try again or provide manual ID', 'error');
                    return;
                }

                const newEmployee = DataManager.addTimestamp({
                    id: newId,
                    ...employeeData
                });
                employees.push(newEmployee);
            }

            // Clear photo data
            this.employeePhotoData = null;
            this.aadhaarPhotoData = null;

            console.log('Saving to database...');
            await DataManager.saveEmployees(employees);

            console.log('Hiding modal...');
            this.modal.hide();

            console.log('Refreshing view...');
            if (App.currentView === 'admin') {
                await AdminModule.load();
            } else {
                await this.renderEmployeeList();
            }

            console.log('Save complete!');
            App.showNotification('Employee saved successfully', 'success');

        } catch (error) {
            console.error('Error saving employee:', error);
            App.showNotification('Error saving employee: ' + error.message, 'error');
        }
    },

    handlePhotoUpload(event, type = 'employee') {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (15 MB = 15 * 1024 * 1024 bytes)
        const maxSize = 15 * 1024 * 1024;
        if (file.size > maxSize) {
            App.showNotification('File size exceeds 15 MB limit. Please select a smaller file.', 'error');
            event.target.value = '';
            return;
        }

        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            App.showNotification('Please select an image file', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const photoData = e.target.result;

            if (type === 'employee') {
                this.employeePhotoData = photoData;
                const preview = document.getElementById('employeePhotoPreview');
                if (preview) {
                    preview.innerHTML = `<img src="${photoData}" alt="Employee Photo" style="max-width: 150px; max-height: 150px; border-radius: 5px; object-fit: cover;">`;
                }
            } else if (type === 'aadhaar') {
                this.aadhaarPhotoData = photoData;
                const preview = document.getElementById('aadhaarPhotoPreview');
                if (preview) {
                    preview.innerHTML = `<img src="${photoData}" alt="Aadhaar Photo" style="max-width: 150px; max-height: 150px; border-radius: 5px; object-fit: cover;">`;
                }
            }
        };

        reader.onerror = () => {
            App.showNotification('Error reading file. Please try again.', 'error');
        };

        reader.readAsDataURL(file);
    },

    editEmployee(employeeId) {
        this.showEmployeeForm(employeeId);
    },

    updateSalaryAdjustmentPreview() {
        const currentText = document.getElementById('salaryAdjCurrentSalary')?.textContent || '₹0';
        const currentSalary = Number(currentText.replace(/[^\d.]/g, '')) || 0;
        const type = document.getElementById('salaryAdjType')?.value || 'hike';
        const mode = document.getElementById('salaryAdjMode')?.value || 'amount';
        const value = Number(document.getElementById('salaryAdjValue')?.value || 0);
        let next = currentSalary;
        if (mode === 'percentage') {
            if (type === 'hike') next = currentSalary + (currentSalary * value / 100);
            else next = currentSalary + (currentSalary * value / 100);
        } else {
            if (type === 'hike') next = currentSalary + value;
            else next = value;
        }
        if (!isFinite(next) || next < 0) next = 0;
        const preview = document.getElementById('salaryAdjPreview');
        if (preview) preview.textContent = `₹${next.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    },

    async showSalaryAdjustmentModal(employeeId) {
        const employees = await DataManager.getEmployees();
        const emp = employees.find(e => e.id === employeeId);
        if (!emp) {
            App.showNotification('Employee not found', 'error');
            return;
        }

        const currentSalary = Number(emp.baseSalary || 0);
        const today = new Date();
        const todayDate = today.toISOString().slice(0, 10);

        document.getElementById('salaryAdjEmployeeId').value = emp.id;
        document.getElementById('salaryAdjEmployeeName').textContent = emp.name || emp.id;
        document.getElementById('salaryAdjCurrentSalary').textContent = `₹${currentSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        document.getElementById('salaryAdjType').value = 'hike';
        document.getElementById('salaryAdjMode').value = 'amount';
        document.getElementById('salaryAdjValue').value = '';
        document.getElementById('salaryAdjDate').value = todayDate;
        document.getElementById('salaryAdjReason').value = '';
        this.updateSalaryAdjustmentPreview();

        const modalEl = document.getElementById('salaryAdjustmentModal');
        if (!modalEl) return;

        // Keep modal at document root. When a Bootstrap modal stays nested
        // inside a transformed/stacked container, the backdrop may render
        // above it and block all input interactions (looks "dark + frozen").
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }

        // Ensure it stacks above any stale layers.
        modalEl.style.zIndex = '1080';

        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();

        // UX: focus first editable field once opened.
        modalEl.addEventListener('shown.bs.modal', () => {
            const el = document.getElementById('salaryAdjValue');
            if (el) el.focus();
        }, { once: true });
    },

    async saveSalaryAdjustment() {
        try {
            const employeeId = document.getElementById('salaryAdjEmployeeId')?.value;
            const type = document.getElementById('salaryAdjType')?.value;
            const mode = document.getElementById('salaryAdjMode')?.value;
            const value = Number(document.getElementById('salaryAdjValue')?.value || 0);
            const effectiveDate = document.getElementById('salaryAdjDate')?.value;
            const reasonRaw = (document.getElementById('salaryAdjReason')?.value || '').trim();

            if (!employeeId || !effectiveDate) {
                App.showNotification('Please select employee and effective date.', 'error');
                return;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
                App.showNotification('Please enter a valid effective date (YYYY-MM-DD).', 'error');
                return;
            }
            const effectiveMonth = String(effectiveDate).slice(0, 7);
            if (!isFinite(value) || value <= 0) {
                App.showNotification('Please enter a value greater than 0.', 'error');
                return;
            }

            const employees = await DataManager.getEmployees();
            const idx = employees.findIndex(e => e.id === employeeId);
            if (idx === -1) {
                App.showNotification('Employee not found.', 'error');
                return;
            }
            const employee = employees[idx];
            const oldSalary = Number(employee.baseSalary || 0);

            let newSalary = oldSalary;
            if (mode === 'percentage') {
                // For hike and correction, percentage applies relative delta.
                newSalary = oldSalary + (oldSalary * value / 100);
            } else {
                // amount mode:
                // - hike       => increment by amount
                // - correction => set corrected final salary amount
                newSalary = type === 'hike' ? (oldSalary + value) : value;
            }

            if (!isFinite(newSalary) || newSalary < 0) {
                App.showNotification('Calculated salary is invalid.', 'error');
                return;
            }

            newSalary = Number(newSalary.toFixed(2));
            if (newSalary === oldSalary) {
                App.showNotification('No salary change detected. Please change the value.', 'warning');
                return;
            }
            const reason = reasonRaw || (type === 'hike' ? `Salary hike (${mode})` : `Salary correction (${mode})`);

            const ok = await DataManager.addSalaryRevision(
                employee.name,
                newSalary,
                reason,
                effectiveDate,
                employee,
                {
                    effectiveMonth,
                    adjustmentType: type,
                    adjustmentMode: mode,
                    adjustmentValue: value
                }
            );
            if (!ok) {
                App.showNotification('Could not record salary history for this employee.', 'error');
                return;
            }

            // Keep latest effective values on employee root for quick lookup by
            // payroll screens without scanning history every time.
            employee.salaryEffectiveDate = effectiveDate;
            employee.salaryEffectiveMonth = effectiveMonth;
            employee.salaryLastAdjustment = {
                type,
                mode,
                value,
                oldSalary,
                newSalary,
                reason
            };

            employees[idx] = DataManager.addTimestamp(employee);
            await DataManager.saveEmployees(employees);

            const modalEl = document.getElementById('salaryAdjustmentModal');
            if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

            if (App.currentView === 'admin') {
                await AdminModule.load();
            } else {
                await this.renderEmployeeList();
            }
            App.showNotification('Salary update saved with effective date/month.', 'success');
        } catch (error) {
            console.error('Error saving salary adjustment:', error);
            App.showNotification('Could not save salary update: ' + error.message, 'error');
        }
    },

    _bulkSalaryState: {
        employees: [],
        values: {},
        selected: {}
    },

    _formatINR(n) {
        const num = Number(n || 0);
        if (!isFinite(num)) return '₹0';
        return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    },

    _computeNewSalary(oldSalary, type, mode, value) {
        const v = Number(value);
        if (!isFinite(v) || v <= 0) return oldSalary;
        if (mode === 'percentage') {
            return oldSalary + (oldSalary * v / 100);
        }
        return type === 'hike' ? (oldSalary + v) : v;
    },

    async showBulkSalaryAdjustmentModal() {
        const all = await DataManager.getEmployees();
        const active = all.filter(e => !e.dateOfRelieving || new Date(e.dateOfRelieving) >= new Date());

        const sorted = active.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        this._bulkSalaryState.employees = sorted;
        this._bulkSalaryState.values = {};
        this._bulkSalaryState.selected = {};

        const today = new Date().toISOString().slice(0, 10);
        const typeEl = document.getElementById('bulkSalaryType');
        const modeEl = document.getElementById('bulkSalaryMode');
        const dateEl = document.getElementById('bulkSalaryDate');
        const reasonEl = document.getElementById('bulkSalaryReason');
        const commonEl = document.getElementById('bulkSalaryCommonValue');
        const searchEl = document.getElementById('bulkSalarySearch');
        const headerCheck = document.getElementById('bulkSalaryHeaderCheck');

        if (typeEl) typeEl.value = 'hike';
        if (modeEl) modeEl.value = 'amount';
        if (dateEl) dateEl.value = today;
        if (reasonEl) reasonEl.value = '';
        if (commonEl) commonEl.value = '';
        if (searchEl) searchEl.value = '';
        if (headerCheck) headerCheck.checked = false;

        this._renderBulkSalaryRows('');
        this._wireBulkSalaryTbodyEvents();
        this._updateBulkSalarySummary();

        const modalEl = document.getElementById('bulkSalaryAdjustmentModal');
        if (!modalEl) return;

        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
        modalEl.style.zIndex = '1080';

        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();

        modalEl.addEventListener('shown.bs.modal', () => {
            const s = document.getElementById('bulkSalarySearch');
            if (s) s.focus();
        }, { once: true });
    },

    _renderBulkSalaryRows(filterQuery) {
        const tbody = document.getElementById('bulkSalaryTbody');
        if (!tbody) return;

        const q = String(filterQuery || '').trim().toLowerCase();
        const list = this._bulkSalaryState.employees.filter(emp => {
            if (!q) return true;
            return String(emp.name || '').toLowerCase().includes(q)
                || String(emp.id || '').toLowerCase().includes(q);
        });

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No employees match "${q}".</td></tr>`;
            this._updateBulkSalarySummary();
            return;
        }

        const rows = list.map(emp => {
            const cur = Number(emp.baseSalary || 0);
            const val = this._bulkSalaryState.values[emp.id] || '';
            const checked = !!this._bulkSalaryState.selected[emp.id];
            const safeName = String(emp.name || emp.id).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `
                <tr data-emp-id="${emp.id}">
                    <td>
                        <input type="checkbox" class="form-check-input bulk-salary-check" data-emp-id="${emp.id}" ${checked ? 'checked' : ''}>
                    </td>
                    <td>${safeName}</td>
                    <td class="text-end">${this._formatINR(cur)}</td>
                    <td>
                        <input type="number" class="form-control form-control-sm bulk-salary-value" data-emp-id="${emp.id}" step="0.01" min="0" placeholder="Value" value="${val}" ${checked ? '' : 'disabled'}>
                    </td>
                    <td class="text-end bulk-salary-preview" data-emp-id="${emp.id}">${this._formatINR(cur)}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;

        const visibleCount = list.length;
        const selectedVisible = list.filter(e => this._bulkSalaryState.selected[e.id]).length;
        const headerCheck = document.getElementById('bulkSalaryHeaderCheck');
        if (headerCheck) {
            headerCheck.checked = visibleCount > 0 && selectedVisible === visibleCount;
            headerCheck.indeterminate = selectedVisible > 0 && selectedVisible < visibleCount;
        }

        list.forEach(emp => this._updateBulkRowPreview(emp.id));
        this._updateBulkSalarySummary();
    },

    _wireBulkSalaryTbodyEvents() {
        const tbody = document.getElementById('bulkSalaryTbody');
        if (!tbody || tbody.dataset.wired === '1') return;
        tbody.dataset.wired = '1';

        tbody.addEventListener('change', (e) => {
            const t = e.target;
            if (t && t.classList.contains('bulk-salary-check')) {
                const empId = t.dataset.empId;
                this._bulkSalaryState.selected[empId] = !!t.checked;
                const row = t.closest('tr');
                if (row) {
                    const valInput = row.querySelector('.bulk-salary-value');
                    if (valInput) valInput.disabled = !t.checked;
                }
                this._updateBulkRowPreview(empId);
                this._updateBulkSalarySummary();
                this._refreshBulkHeaderCheckState();
            }
        });

        tbody.addEventListener('input', (e) => {
            const t = e.target;
            if (t && t.classList.contains('bulk-salary-value')) {
                const empId = t.dataset.empId;
                this._bulkSalaryState.values[empId] = t.value;
                this._updateBulkRowPreview(empId);
                this._updateBulkSalarySummary();
            }
        });
    },

    _refreshBulkHeaderCheckState() {
        const headerCheck = document.getElementById('bulkSalaryHeaderCheck');
        if (!headerCheck) return;
        const visibleRows = document.querySelectorAll('#bulkSalaryTbody tr[data-emp-id]');
        if (visibleRows.length === 0) {
            headerCheck.checked = false;
            headerCheck.indeterminate = false;
            return;
        }
        let checked = 0;
        visibleRows.forEach(r => {
            const c = r.querySelector('.bulk-salary-check');
            if (c && c.checked) checked++;
        });
        headerCheck.checked = checked === visibleRows.length;
        headerCheck.indeterminate = checked > 0 && checked < visibleRows.length;
    },

    _updateBulkRowPreview(empId) {
        const row = document.querySelector(`#bulkSalaryTbody tr[data-emp-id="${empId}"]`);
        if (!row) return;
        const emp = this._bulkSalaryState.employees.find(e => e.id === empId);
        if (!emp) return;
        const cur = Number(emp.baseSalary || 0);
        const selected = !!this._bulkSalaryState.selected[empId];
        const type = document.getElementById('bulkSalaryType')?.value || 'hike';
        const mode = document.getElementById('bulkSalaryMode')?.value || 'amount';
        const value = Number(this._bulkSalaryState.values[empId] || 0);

        const previewCell = row.querySelector('.bulk-salary-preview');
        if (!previewCell) return;

        if (!selected) {
            previewCell.textContent = this._formatINR(cur);
            previewCell.classList.remove('text-success', 'text-danger');
            return;
        }
        const next = this._computeNewSalary(cur, type, mode, value);
        previewCell.textContent = this._formatINR(next);
        previewCell.classList.toggle('text-success', next > cur);
        previewCell.classList.toggle('text-danger', next < cur);
    },

    recalcAllBulkPreviews() {
        this._bulkSalaryState.employees.forEach(emp => this._updateBulkRowPreview(emp.id));
        this._updateBulkSalarySummary();
    },

    _updateBulkSalarySummary() {
        const type = document.getElementById('bulkSalaryType')?.value || 'hike';
        const mode = document.getElementById('bulkSalaryMode')?.value || 'amount';
        let selectedCount = 0;
        let totalNew = 0;
        let totalDelta = 0;

        this._bulkSalaryState.employees.forEach(emp => {
            const cur = Number(emp.baseSalary || 0);
            const selected = !!this._bulkSalaryState.selected[emp.id];
            if (!selected) return;
            selectedCount++;
            const v = Number(this._bulkSalaryState.values[emp.id] || 0);
            const next = this._computeNewSalary(cur, type, mode, v);
            totalNew += next;
            totalDelta += (next - cur);
        });

        const selEl = document.getElementById('bulkSalarySelectedCount');
        const visEl = document.getElementById('bulkSalaryVisibleCount');
        const newEl = document.getElementById('bulkSalaryTotalPayout');
        const deltaEl = document.getElementById('bulkSalaryTotalDelta');
        const visibleRows = document.querySelectorAll('#bulkSalaryTbody tr[data-emp-id]');

        if (selEl) selEl.textContent = String(selectedCount);
        if (visEl) visEl.textContent = String(visibleRows.length);
        if (newEl) newEl.textContent = this._formatINR(totalNew);
        if (deltaEl) {
            deltaEl.textContent = (totalDelta >= 0 ? '+' : '−') + this._formatINR(Math.abs(totalDelta)).replace('₹', '₹');
            deltaEl.classList.toggle('text-success', totalDelta > 0);
            deltaEl.classList.toggle('text-danger', totalDelta < 0);
        }
    },

    bulkSalarySelectVisible(checked) {
        const visibleRows = document.querySelectorAll('#bulkSalaryTbody tr[data-emp-id]');
        visibleRows.forEach(row => {
            const empId = row.getAttribute('data-emp-id');
            if (!empId) return;
            this._bulkSalaryState.selected[empId] = !!checked;
            const cb = row.querySelector('.bulk-salary-check');
            if (cb) cb.checked = !!checked;
            const vi = row.querySelector('.bulk-salary-value');
            if (vi) vi.disabled = !checked;
            this._updateBulkRowPreview(empId);
        });
        this._refreshBulkHeaderCheckState();
        this._updateBulkSalarySummary();
    },

    bulkSalaryFilter() {
        const q = document.getElementById('bulkSalarySearch')?.value || '';
        this._renderBulkSalaryRows(q);
    },

    bulkSalaryApplyCommonValue() {
        const v = document.getElementById('bulkSalaryCommonValue')?.value;
        if (v === '' || v === null || typeof v === 'undefined') {
            App.showNotification('Enter a common value first, then click Fill.', 'warning');
            return;
        }
        const num = Number(v);
        if (!isFinite(num) || num <= 0) {
            App.showNotification('Common value must be greater than 0.', 'warning');
            return;
        }

        const visibleRows = document.querySelectorAll('#bulkSalaryTbody tr[data-emp-id]');
        const selectedIds = [];
        visibleRows.forEach(row => {
            const empId = row.getAttribute('data-emp-id');
            if (empId && this._bulkSalaryState.selected[empId]) selectedIds.push(empId);
        });

        const targets = selectedIds.length > 0
            ? selectedIds
            : Array.from(visibleRows).map(r => r.getAttribute('data-emp-id')).filter(Boolean);

        if (targets.length === 0) {
            App.showNotification('No rows visible to fill.', 'warning');
            return;
        }

        targets.forEach(empId => {
            this._bulkSalaryState.values[empId] = String(num);
            const row = document.querySelector(`#bulkSalaryTbody tr[data-emp-id="${empId}"]`);
            if (row) {
                const vi = row.querySelector('.bulk-salary-value');
                if (vi) vi.value = String(num);
            }
            this._updateBulkRowPreview(empId);
        });
        this._updateBulkSalarySummary();

        App.showNotification(
            selectedIds.length > 0
                ? `Common value filled into ${targets.length} selected row(s).`
                : `Common value filled into all ${targets.length} visible row(s). Now tick the employees you want to update.`,
            'success'
        );
    },

    async saveBulkSalaryAdjustment() {
        try {
            const type = document.getElementById('bulkSalaryType')?.value || 'hike';
            const mode = document.getElementById('bulkSalaryMode')?.value || 'amount';
            const effectiveDate = document.getElementById('bulkSalaryDate')?.value || '';
            const reasonRaw = (document.getElementById('bulkSalaryReason')?.value || '').trim();

            if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
                App.showNotification('Please select a valid effective date.', 'error');
                return;
            }
            if (!reasonRaw) {
                App.showNotification('Please enter a common reason / notes for the bulk update.', 'error');
                return;
            }

            const effectiveMonth = effectiveDate.slice(0, 7);
            const state = this._bulkSalaryState;
            const selectedIds = Object.keys(state.selected).filter(id => state.selected[id]);

            if (selectedIds.length === 0) {
                App.showNotification('Select at least one employee to update.', 'warning');
                return;
            }

            const plans = [];
            const skipped = [];

            for (const empId of selectedIds) {
                const emp = state.employees.find(e => e.id === empId);
                if (!emp) {
                    skipped.push({ id: empId, name: empId, reason: 'Employee not found' });
                    continue;
                }
                const cur = Number(emp.baseSalary || 0);
                const raw = state.values[empId];
                const v = Number(raw);
                if (!isFinite(v) || v <= 0) {
                    skipped.push({ id: empId, name: emp.name, reason: 'No value / value ≤ 0' });
                    continue;
                }
                const next = Number(this._computeNewSalary(cur, type, mode, v).toFixed(2));
                if (!isFinite(next) || next < 0) {
                    skipped.push({ id: empId, name: emp.name, reason: 'Invalid computed salary' });
                    continue;
                }
                if (next === cur) {
                    skipped.push({ id: empId, name: emp.name, reason: 'No change' });
                    continue;
                }
                plans.push({ empId, empName: emp.name, oldSalary: cur, newSalary: next, value: v });
            }

            if (plans.length === 0) {
                App.showNotification('No valid updates to apply. Check the values in selected rows.', 'warning');
                return;
            }

            const summary = `About to update ${plans.length} employee(s).\n`
                + `Type: ${type} (${mode})\nEffective: ${effectiveDate}\n`
                + (skipped.length ? `Skipped: ${skipped.length}\n` : '')
                + `\nProceed?`;
            if (!App.confirmAction(summary)) return;

            const employees = await DataManager.getEmployees();
            let applied = 0;
            const failed = [];

            for (const plan of plans) {
                const idx = employees.findIndex(e => e.id === plan.empId);
                if (idx === -1) {
                    failed.push({ name: plan.empName, reason: 'Not found in DB' });
                    continue;
                }
                const employee = employees[idx];
                const ok = await DataManager.addSalaryRevision(
                    employee.name,
                    plan.newSalary,
                    reasonRaw,
                    effectiveDate,
                    employee,
                    {
                        effectiveMonth,
                        adjustmentType: type,
                        adjustmentMode: mode,
                        adjustmentValue: plan.value
                    }
                );
                if (!ok) {
                    failed.push({ name: plan.empName, reason: 'Could not record revision' });
                    continue;
                }
                employee.salaryEffectiveDate = effectiveDate;
                employee.salaryEffectiveMonth = effectiveMonth;
                employee.salaryLastAdjustment = {
                    type,
                    mode,
                    value: plan.value,
                    oldSalary: plan.oldSalary,
                    newSalary: plan.newSalary,
                    reason: reasonRaw
                };
                employees[idx] = DataManager.addTimestamp(employee);
                applied++;
            }

            await DataManager.saveEmployees(employees);

            const modalEl = document.getElementById('bulkSalaryAdjustmentModal');
            if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

            if (App.currentView === 'admin') {
                await AdminModule.load();
            } else {
                await this.renderEmployeeList();
            }

            const parts = [`Applied ${applied}`];
            if (skipped.length) parts.push(`Skipped ${skipped.length}`);
            if (failed.length) parts.push(`Failed ${failed.length}`);
            App.showNotification(`Bulk salary update: ${parts.join(' · ')}.`, applied > 0 ? 'success' : 'warning');

            if (failed.length) {
                console.warn('Bulk salary update - failed rows:', failed);
            }
            if (skipped.length) {
                console.info('Bulk salary update - skipped rows:', skipped);
            }
        } catch (error) {
            console.error('Error saving bulk salary adjustment:', error);
            App.showNotification('Could not apply bulk salary update: ' + error.message, 'error');
        }
    },

    async deleteEmployee(employeeId) {
        if (!App.confirmAction('Are you sure you want to delete this employee? This action cannot be undone.')) {
            return;
        }

        const employees = await DataManager.getEmployees();
        const filtered = employees.filter(e => e.id !== employeeId);
        await DataManager.saveEmployees(filtered);

        // Refresh the appropriate view
        if (App.currentView === 'admin') {
            await AdminModule.load();
        } else {
            // Assuming renderEmployeeList is async or will be made async elsewhere
            // If it's not async, 'await' here will still work but won't pause execution
            await this.renderEmployeeList();
        }

        App.showNotification('Employee deleted successfully', 'success');
    },

    exportSampleFile() {
        const headers = ['Name', 'Employee ID', 'Designation', 'Date of Joining (YYYY-MM-DD)', 'Basic Salary', 'Salary Type (monthly/daily)', 'Phone', 'Email'];
        const sampleData = ['John Doe', 'EMP001', 'Engineer', '2023-01-01', '25000', 'monthly', '9876543210', 'john@example.com'];

        const csvContent = [
            headers.join(','),
            sampleData.join(',')
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee_bulk_import_sample.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    },

    async viewSalaryHistory(employeeName) {
        console.log('View Salary History for:', employeeName);

        const revisions = await DataManager.getSalaryRevisionsForEmployee(employeeName);

        // Create or get modal
        let modal = document.getElementById('salaryHistoryModal');
        if (!modal) {
            // Create modal HTML
            const modalHTML = `
                <div id="salaryHistoryModal" class="modal fade" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Salary Revision History - <span id="salaryHistoryEmployeeName"></span></h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body" id="salaryHistoryContent">
                                <!-- Content will be populated here -->
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('salaryHistoryModal');
        }

        // Update modal content
        document.getElementById('salaryHistoryEmployeeName').textContent = employeeName;

        const content = document.getElementById('salaryHistoryContent');
        if (revisions.length === 0) {
            content.innerHTML = `
                <div class="alert alert-info">
                    <i class="bi bi-info-circle"></i> No salary revision history found for this employee.
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Month</th>
                                <th>Old Salary</th>
                                <th>New Salary</th>
                                <th>Change</th>
                                <th>Type</th>
                                <th>Reason</th>
                                <th>Changed By</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${revisions.map(rev => {
                const change = rev.newSalary - rev.oldSalary;
                const changePercent = rev.oldSalary > 0 ? ((change / rev.oldSalary) * 100).toFixed(2) : 0;
                const changeClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : 'text-muted');
                const changeIcon = change > 0 ? '↑' : (change < 0 ? '↓' : '—');

                return `
                                    <tr>
                                        <td>${DataManager.formatDateDisplay(rev.date)}</td>
                                        <td>${rev.effectiveMonth || (rev.date ? String(rev.date).slice(0, 7) : '—')}</td>
                                        <td>₹${rev.oldSalary.toLocaleString('en-IN')}</td>
                                        <td>₹${rev.newSalary.toLocaleString('en-IN')}</td>
                                        <td class="${changeClass}">
                                            ${changeIcon} ₹${Math.abs(change).toLocaleString('en-IN')}
                                            ${rev.oldSalary > 0 ? `(${changePercent}%)` : ''}
                                        </td>
                                        <td>${rev.adjustmentType ? `${rev.adjustmentType} (${rev.adjustmentMode || 'amount'})` : 'manual'}</td>
                                        <td>${rev.reason}</td>
                                        <td><small class="text-muted">${rev.changedBy === 'system' ? 'System' : 'Admin'}</small></td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="mt-3">
                    <p class="text-muted">
                        <i class="bi bi-info-circle"></i>
                        Total revisions: ${revisions.length} | 
                        Current salary: ₹${revisions[0].newSalary.toLocaleString('en-IN')}
                    </p>
                </div>
            `;
        }

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
};

// Expose to window
window.EmployeesModule = EmployeesModule;
