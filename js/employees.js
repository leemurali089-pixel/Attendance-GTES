// Employee Management Module (CRUD)
const EmployeesModule = {
    editingEmployee: null,

    load() {
        this.renderEmployeeList();
    },

    renderEmployeeList() {
        const view = document.getElementById('employeesView');
        if (!view) {
            console.error('employeesView element not found');
            return;
        }

        // Make sure view is visible
        view.classList.remove('d-none');
        view.style.display = '';

        const employees = DataManager.getEmployees();
        const activeEmployees = DataManager.getActiveEmployees();

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Employee Directory</h2>
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Employees List (${activeEmployees.length} Active / ${employees.length} Total)</h5>
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
                                        ${employees.map(emp => `
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
            ${this.getModalHTML()}
        `;

        this.initializeModal();
    },

    getAdminTableHTML() {
        const employees = DataManager.getEmployees();
        const activeEmployees = DataManager.getActiveEmployees();

        return `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Employee Management (${activeEmployees.length} Active / ${employees.length} Total)</h5>
                    <button class="btn btn-sm btn-primary" onclick="EmployeesModule.showEmployeeForm()">
                        <i class="bi bi-plus-circle"></i> Add New Employee
                    </button>
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
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="employeeFormTitle">Add Employee</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="employeeForm">
                                <input type="hidden" id="employeeId">
                                <div class="mb-3">
                                    <label for="employeeName" class="form-label">Name *</label>
                                    <input type="text" class="form-control" id="employeeName" required>
                                </div>
                                <div class="mb-3">
                                    <label for="dateOfJoining" class="form-label">Date of Joining *</label>
                                    <input type="date" class="form-control" id="dateOfJoining" required>
                                </div>
                                <div class="mb-3">
                                    <label for="dateOfRelieving" class="form-label">Date of Relieving (Optional)</label>
                                    <input type="date" class="form-control" id="dateOfRelieving">
                                </div>
                                <div class="mb-3">
                                    <label for="salaryType" class="form-label">Salary Type *</label>
                                    <select class="form-select" id="salaryType" required>
                                        <option value="monthly">Monthly Salary</option>
                                        <option value="daily">Daily Salary</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="baseSalary" class="form-label">Basic Salary (₹) *</label>
                                    <input type="number" class="form-control" id="baseSalary" step="0.01" min="0" required>
                                    <small class="form-text text-muted">Enter monthly salary if Monthly, or daily salary if Daily</small>
                                </div>
                                <div class="mb-3">
                                    <label for="idProofType" class="form-label">ID Proof Type *</label>
                                    <select class="form-select" id="idProofType" required>
                                        <option value="">Select ID Proof</option>
                                        <option value="Aadhar Card">Aadhar Card</option>
                                        <option value="Voter ID">Voter ID</option>
                                        <option value="Driving License">Driving License</option>
                                        <option value="PAN Card">PAN Card</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="idProofNumber" class="form-label">ID Proof Number *</label>
                                    <input type="text" class="form-control" id="idProofNumber" required>
                                </div>
                                <div class="mb-3">
                                    <label for="employeePhoto" class="form-label">Employee Photo</label>
                                    <input type="file" class="form-control" id="employeePhoto" accept="image/*" onchange="EmployeesModule.handlePhotoUpload(event)">
                                    <small class="form-text text-muted">Maximum file size: 20 MB</small>
                                    <div id="photoPreview" class="mt-2"></div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="EmployeesModule.saveEmployee()">Save</button>
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

    showEmployeeForm(employeeId = null) {
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
            const employees = DataManager.getEmployees();
            const employee = employees.find(e => e.id === employeeId);
            if (employee) {
                document.getElementById('employeeId').value = employee.id;
                document.getElementById('employeeName').value = employee.name;
                document.getElementById('dateOfJoining').value = DataManager.formatDate(employee.dateOfJoining);
                document.getElementById('dateOfRelieving').value = employee.dateOfRelieving ? DataManager.formatDate(employee.dateOfRelieving) : '';
                document.getElementById('salaryType').value = employee.salaryType || 'monthly';
                document.getElementById('baseSalary').value = employee.baseSalary || '';
                document.getElementById('idProofType').value = employee.idProofType || '';
                document.getElementById('idProofNumber').value = employee.idProofNumber || '';

                // Show existing photo if available
                if (employee.photo) {
                    const preview = document.getElementById('photoPreview');
                    preview.innerHTML = `<img src="${employee.photo}" alt="Employee Photo" style="max-width: 150px; max-height: 150px; border-radius: 5px;">`;
                    this.photoData = employee.photo; // Preserve existing photo
                }

                title.textContent = 'Edit Employee';
            }
        } else {
            form.reset();
            document.getElementById('employeeId').value = '';
            document.getElementById('photoPreview').innerHTML = '';
            this.photoData = null;
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

    saveEmployee() {
        const form = document.getElementById('employeeForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const employeeId = document.getElementById('employeeId').value;
        const name = document.getElementById('employeeName').value.trim();
        const dateOfJoining = document.getElementById('dateOfJoining').value;
        const dateOfRelieving = document.getElementById('dateOfRelieving').value;
        const salaryType = document.getElementById('salaryType').value;
        const baseSalary = parseFloat(document.getElementById('baseSalary').value);
        const idProofType = document.getElementById('idProofType').value;
        const idProofNumber = document.getElementById('idProofNumber').value.trim();
        const photoInput = document.getElementById('employeePhoto');
        const photoData = this.photoData || null;

        if (!name || !dateOfJoining || !salaryType || isNaN(baseSalary) || baseSalary < 0 || !idProofType || !idProofNumber) {
            App.showNotification('Please fill all required fields with valid values', 'error');
            return;
        }

        const employees = DataManager.getEmployees();

        if (employeeId) {
            // Update existing
            const index = employees.findIndex(e => e.id === employeeId);
            if (index !== -1) {
                employees[index] = {
                    ...employees[index],
                    name,
                    dateOfJoining,
                    dateOfRelieving: dateOfRelieving || null,
                    salaryType,
                    baseSalary,
                    idProofType,
                    idProofNumber,
                    photo: photoData || employees[index].photo
                };
            }
        } else {
            // Add new
            const newEmployee = {
                id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name,
                dateOfJoining,
                dateOfRelieving: dateOfRelieving || null,
                salaryType,
                baseSalary,
                idProofType,
                idProofNumber,
                photo: photoData
            };
            employees.push(newEmployee);
        }

        // Clear photo data
        this.photoData = null;
        const photoPreview = document.getElementById('photoPreview');
        if (photoPreview) photoPreview.innerHTML = '';
        if (photoInput) photoInput.value = '';

        DataManager.saveEmployees(employees);
        this.modal.hide();
        DataManager.saveEmployees(employees);
        this.modal.hide();

        if (App.currentView === 'admin') {
            AdminModule.load();
        } else {
            this.renderEmployeeList();
        }

        App.showNotification('Employee saved successfully', 'success');
    },

    handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (20 MB = 20 * 1024 * 1024 bytes)
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) {
            App.showNotification('File size exceeds 20 MB limit. Please select a smaller file.', 'error');
            event.target.value = '';
            return;
        }

        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            App.showNotification('Please select an image file', 'error');
            event.target.value = '';
            return;
        }

        // Convert to base64
        const reader = new FileReader();
        reader.onload = (e) => {
            this.photoData = e.target.result;
            const preview = document.getElementById('photoPreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 150px; max-height: 150px; border-radius: 5px; margin-top: 10px;">`;
        };
        reader.readAsDataURL(file);
    },

    editEmployee(employeeId) {
        this.showEmployeeForm(employeeId);
    },

    deleteEmployee(employeeId) {
        if (!App.confirmAction('Are you sure you want to delete this employee? This action cannot be undone.')) {
            return;
        }

        const employees = DataManager.getEmployees();
        const filtered = employees.filter(e => e.id !== employeeId);
        DataManager.saveEmployees(filtered);

        // Refresh the appropriate view
        if (App.currentView === 'admin') {
            AdminModule.load();
        } else {
            this.renderEmployeeList();
        }

        App.showNotification('Employee deleted successfully', 'success');
    }
};

