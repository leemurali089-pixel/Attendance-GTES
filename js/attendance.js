// Attendance Management Module
const AttendanceModule = {
    currentDate: new Date(),
    bulkTimeSlots: [],
    currentBulkDate: null,

    async load() {
        await this.renderAttendanceView();
    },

    getColorLegendHTML() {
        return `
            <div class="card mb-3">
                <div class="card-header">
                    <h6 class="mb-0"><i class="bi bi-palette"></i> Status Color Code</h6>
                </div>
                <div class="card-body">
                    <div class="row g-2">
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(59, 130, 246, 0.15); border-left: 4px solid #3b82f6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(59, 130, 246, 0.3); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #93c5fd;">Paid Leave</strong>
                                    <small class="d-block text-muted">Employee on paid leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(245, 158, 11, 0.15); border-left: 4px solid #f59e0b;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(245, 158, 11, 0.3); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #fbbf24;">Unpaid Leave</strong>
                                    <small class="d-block text-muted">Employee on unpaid leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(239, 68, 68, 0.3); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #fca5a5;">Sick Leave</strong>
                                    <small class="d-block text-muted">Employee on sick leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(139, 92, 246, 0.15); border-left: 4px solid #8b5cf6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(139, 92, 246, 0.3); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #c4b5fd;">Half Day</strong>
                                    <small class="d-block text-muted">Employee worked half day</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(255, 248, 220, 0.3); border-left: 4px solid #d4af37;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(255, 248, 220, 0.5); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #1e293b;">Holiday</strong>
                                    <small class="d-block text-muted">Holiday or Sunday</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(20, 78, 94, 0.4); border-left: 4px solid #14b8a6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: rgba(20, 78, 94, 0.6); border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #5eead4;">H-Working</strong>
                                    <small class="d-block text-muted">Working on holiday/Sunday</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderAttendanceView() {
        const view = document.getElementById('attendanceView');
        if (!view) return;

        const employees = await DataManager.getActiveEmployees();
        const timeSlots = DataManager.generateTimeSlots();
        const today = new Date();
        const todayStr = DataManager.formatDate(today);

        const rowsHtml = await this.renderAttendanceRows(todayStr);

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Attendance Management</h2>
                    <div class="d-flex gap-2 align-items-center">
                        <label for="attendanceDate" class="form-label mb-0">Select Date:</label>
                        <input type="date" class="form-control" id="attendanceDate" value="${todayStr}" style="width: auto;" onchange="AttendanceModule.loadAttendanceForDate()">
                        <button class="btn btn-primary" onclick="AttendanceModule.addAttendanceRecord()">
                            <i class="bi bi-plus-circle"></i> Add Record
                        </button>
                        <button class="btn btn-success" onclick="AttendanceModule.addBulkAttendance()">
                            <i class="bi bi-people"></i> Bulk Mark Attendance
                        </button>
                        <button class="btn btn-outline-success" onclick="AttendanceModule.exportSampleFile()">
                            <i class="bi bi-file-earmark-spreadsheet"></i> Export Sample
                        </button>
                    </div>
                </div>
            </div>
            ${this.getColorLegendHTML()}
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Attendance Records</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover" id="attendanceTable">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Check-in</th>
                                            <th>Check-out</th>
                                            <th>Status</th>
                                            <th>Over-Time</th>
                                            <th>OT Hours</th>
                                            <th>Holiday Reason</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="attendanceTableBody">
                                        ${rowsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="attendanceFormModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="attendanceFormTitle">Add Attendance Record</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="attendanceForm">
                                <input type="hidden" id="attendanceId">
                                <input type="hidden" id="attendanceRecordDate" value="${todayStr}">
                                <div class="mb-3">
                                    <label for="attendanceEmployee" class="form-label">Employee *</label>
                                    <select class="form-select" id="attendanceEmployee" required>
                                        <option value="">Select Employee</option>
                                        ${employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('')}
                                    </select>
                                </div>
                                    <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label for="attendanceCheckIn" class="form-label">Check-in Time</label>
                                        <select class="form-select" id="attendanceCheckIn" onchange="AttendanceModule.calculateOTHours()">
                                            <option value="">Select Time</option>
                                            ${timeSlots.map(slot => `<option value="${slot.value}">${slot.display}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label for="attendanceCheckOut" class="form-label">Check-out Time</label>
                                        <select class="form-select" id="attendanceCheckOut" onchange="AttendanceModule.calculateOTHours()">
                                            <option value="">Select Time</option>
                                            ${timeSlots.map(slot => `<option value="${slot.value}">${slot.display}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label for="attendanceStatus" class="form-label">Status *</label>
                                    <select class="form-select" id="attendanceStatus" required onchange="AttendanceModule.handleStatusChange()">
                                        <option value="">Select Status</option>
                                        <option value="Present">Present</option>
                                        <option value="Paid Leave">Paid Leave</option>
                                        <option value="Unpaid Leave">Unpaid Leave</option>
                                        <option value="Sick Leave">Sick Leave</option>
                                        <option value="Half Day">Half Day</option>
                                        <option value="Holiday">Holiday</option>
                                        <option value="H-Working">H-Working</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="attendanceOverTime" class="form-label">Over-Time</label>
                                    <select class="form-select" id="attendanceOverTime" onchange="AttendanceModule.handleOverTimeChange()">
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                        <option value="H-Working">H-Working</option>
                                    </select>
                                    <small class="form-text text-muted">Selecting "H-Working" will automatically set Status to "H-Working" and calculate full hours as OT</small>
                                </div>
                                <div class="mb-3">
                                    <label for="attendanceOTHours" class="form-label">OT Hours (Auto-calculated)</label>
                                    <input type="number" class="form-control" id="attendanceOTHours" step="0.5" readonly>
                                </div>
                                <div class="mb-3">
                                    <label for="attendanceHolidayReason" class="form-label">Holiday Reason</label>
                                    <input type="text" class="form-control" id="attendanceHolidayReason" readonly>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="AttendanceModule.saveAttendanceRecord()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize modal
        const modalElement = document.getElementById('attendanceFormModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }
    },

    async renderAttendanceRows(dateStr) {
        const attendance = await DataManager.getAttendance();
        const dateRecords = attendance.filter(a => DataManager.formatDate(new Date(a.date)) === dateStr);

        if (dateRecords.length === 0) {
            return '<tr><td colspan="8" class="text-center text-muted">No attendance records for this date</td></tr>';
        }

        return Promise.all(dateRecords.map(async record => {
            const date = new Date(record.date);
            const isHoliday = await DataManager.isHoliday(date) || DataManager.isSunday(date);
            const isHWorking = record.status === 'H-Working' || record.overTime === 'H-Working' || record.overTime === 'Holiday working';
            let rowClass = '';
            // Apply status-based row classes
            if (isHWorking) {
                rowClass = 'table-holiday-working';
            } else if (isHoliday) {
                rowClass = 'table-warning';
            } else if (record.status === 'Paid Leave') {
                rowClass = 'table-paid-leave';
            } else if (record.status === 'Unpaid Leave') {
                rowClass = 'table-unpaid-leave';
            } else if (record.status === 'Sick Leave') {
                rowClass = 'table-sick-leave';
            } else if (record.status === 'Half Day') {
                rowClass = 'table-half-day';
            }
            const holidayReason = record.holidayReason || await DataManager.getHolidayReason(date) || '';

            return `
                <tr class="${rowClass}" data-id="${record.id}">
                    <td>${record.employee}</td>
                    <td>${record.checkIn ? DataManager.formatTimeDisplay(record.checkIn) : '-'}</td>
                    <td>${record.checkOut ? DataManager.formatTimeDisplay(record.checkOut) : '-'}</td>
                    <td><span class="badge bg-${this.getStatusBadgeColor(record.status)}">${record.status}</span></td>
                    <td>${record.overTime || 'No'}</td>
                    <td>${record.otHours || 0}</td>
                    <td>${holidayReason}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="AttendanceModule.editAttendanceRecord('${record.id}')">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="AttendanceModule.deleteAttendanceRecord('${record.id}')">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        })).then(rows => rows.join(''));
    },

    getStatusBadgeColor(status) {
        const colors = {
            'Present': 'success',
            'Paid Leave': 'info',
            'Unpaid Leave': 'warning',
            'Half Day': 'primary',
            'Holiday': 'secondary',
            'H-Working': 'danger'
        };
        return colors[status] || 'secondary';
    },

    async loadAttendanceForDate() {
        const dateInput = document.getElementById('attendanceDate');
        const dateStr = dateInput.value;
        const tbody = document.getElementById('attendanceTableBody');
        if (tbody) {
            tbody.innerHTML = await this.renderAttendanceRows(dateStr);
        }
    },

    async addAttendanceRecord() {
        const dateInput = document.getElementById('attendanceDate');
        const dateStr = dateInput ? dateInput.value : DataManager.formatDate(new Date());

        const form = document.getElementById('attendanceForm');
        if (form) {
            form.reset();
            document.getElementById('attendanceId').value = '';
            document.getElementById('attendanceRecordDate').value = dateStr;
            document.getElementById('attendanceFormTitle').textContent = 'Add Attendance Record';

            // Auto-detect holiday
            const date = new Date(dateStr);
            const isHoliday = await DataManager.isHoliday(date);
            if (isHoliday || DataManager.isSunday(date)) {
                document.getElementById('attendanceStatus').value = 'Holiday';
                document.getElementById('attendanceHolidayReason').value = isHoliday ? await DataManager.getHolidayReason(date) : '';
                this.handleStatusChange();
            }

            // Update employee dropdown based on date
            const employees = await DataManager.getEmployeesActiveInMonth(date.getFullYear(), date.getMonth());
            const employeeSelect = document.getElementById('attendanceEmployee');
            if (employeeSelect) {
                employeeSelect.innerHTML = '<option value="">Select Employee</option>' +
                    employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('');
            }
        }

        if (this.modal) {
            this.modal.show();
        }
    },

    async addBulkAttendance() {
        const dateInput = document.getElementById('attendanceDate');
        const dateStr = dateInput ? dateInput.value : DataManager.formatDate(new Date());
        const date = new Date(dateStr);
        this.currentBulkDate = dateStr;
        this.bulkTimeSlots = DataManager.generateTimeSlots();
        const timeSlots = this.bulkTimeSlots;
        const isHoliday = await DataManager.isHoliday(date);
        const isSunday = DataManager.isSunday(date);
        const defaultStatus = (isHoliday || isSunday) ? 'Holiday' : 'Present';
        const holidayReason = isHoliday ? await DataManager.getHolidayReason(date) : '';
        const tableRows = await this.renderBulkEmployeeRows(dateStr);

        const bulkModal = document.createElement('div');
        bulkModal.className = 'modal fade';
        bulkModal.id = 'bulkAttendanceModal';
        bulkModal.innerHTML = `
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Bulk Mark Attendance</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <label class="form-label">Select Date *</label>
                                <input type="date" class="form-control" id="bulkAttendanceDate" value="${dateStr}" onchange="AttendanceModule.updateBulkDate()">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Or Select Multiple Dates</label>
                                <button class="btn btn-sm btn-info" onclick="AttendanceModule.showDatePicker()">
                                    <i class="bi bi-calendar3"></i> Select Multiple Dates
                                </button>
                                <div id="selectedDatesDisplay" class="mt-2"></div>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-md-4">
                                <label class="form-label">Default Check-in Time</label>
                                <select class="form-select" id="bulkCheckIn" onchange="AttendanceModule.updateBulkDefaults()">
                                    <option value="">Select Time</option>
                                    ${timeSlots.map(slot => `<option value="${slot.value}">${slot.display}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Default Check-out Time</label>
                                <select class="form-select" id="bulkCheckOut" onchange="AttendanceModule.updateBulkDefaults()">
                                    <option value="">Select Time</option>
                                    ${timeSlots.map(slot => `<option value="${slot.value}">${slot.display}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Default Status</label>
                                <select class="form-select" id="bulkStatus" onchange="AttendanceModule.updateBulkDefaults()">
                                    <option value="Present" ${defaultStatus === 'Present' ? 'selected' : ''}>Present</option>
                                    <option value="Paid Leave" ${defaultStatus === 'Paid Leave' ? 'selected' : ''}>Paid Leave</option>
                                    <option value="Unpaid Leave" ${defaultStatus === 'Unpaid Leave' ? 'selected' : ''}>Unpaid Leave</option>
                                    <option value="Sick Leave" ${defaultStatus === 'Sick Leave' ? 'selected' : ''}>Sick Leave</option>
                                    <option value="Half Day" ${defaultStatus === 'Half Day' ? 'selected' : ''}>Half Day</option>
                                    <option value="Holiday" ${defaultStatus === 'Holiday' ? 'selected' : ''}>Holiday</option>
                                    <option value="H-Working" ${defaultStatus === 'H-Working' ? 'selected' : ''}>H-Working</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-3">
                            <button class="btn btn-sm btn-secondary" onclick="AttendanceModule.applyBulkDefaults()">Apply Defaults to All</button>
                            <button class="btn btn-sm btn-primary" onclick="AttendanceModule.selectAllEmployees()">Select All</button>
                            <button class="btn btn-sm btn-secondary" onclick="AttendanceModule.deselectAllEmployees()">Deselect All</button>
                        </div>
                        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-sm table-bordered">
                                <thead class="table-light sticky-top">
                                    <tr>
                                        <th style="width: 30px;"><input type="checkbox" id="selectAllCheckbox" onchange="AttendanceModule.toggleAllEmployees(this)"></th>
                                        <th>Employee</th>
                                        <th>Check-in</th>
                                        <th>Check-out</th>
                                        <th>Status</th>
                                        <th>Over-Time</th>
                                    </tr>
                                </thead>
                                <tbody id="bulkAttendanceTableBody">
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="AttendanceModule.saveBulkAttendance()">Save Selected</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(bulkModal);
        const bsModal = new bootstrap.Modal(bulkModal);
        bsModal.show();
        bulkModal.addEventListener('hidden.bs.modal', () => bulkModal.remove());

        this.initializeBulkStatusControls();
        this.setupBulkDefaultHandlers();
        this.attachBulkCheckboxListeners();
    },

    async renderBulkEmployeeRows(dateStr) {
        const date = new Date(dateStr);
        const isHoliday = await DataManager.isHoliday(date) || DataManager.isSunday(date);
        const defaultStatus = isHoliday ? 'Holiday' : 'Present';
        const employees = await DataManager.getEmployeesActiveOnDate(date);
        const attendance = await DataManager.getAttendance();
        if (!this.bulkTimeSlots || this.bulkTimeSlots.length === 0) {
            this.bulkTimeSlots = DataManager.generateTimeSlots();
        }

        const buildTimeOptions = (selectedValue = '') => {
            let options = '<option value="">Select Time</option>';
            this.bulkTimeSlots.forEach(slot => {
                const selectedAttr = slot.value === selectedValue ? 'selected' : '';
                options += `<option value="${slot.value}" ${selectedAttr}>${slot.display}</option>`;
            });
            return options;
        };

        const buildStatusOptions = (selectedValue) => {
            const statuses = ['Present', 'Paid Leave', 'Unpaid Leave', 'Sick Leave', 'Half Day', 'Holiday', 'H-Working'];
            return statuses.map(status => {
                const isSelected = (selectedValue || defaultStatus) === status ? 'selected' : '';
                return `<option value="${status}" ${isSelected}>${status}</option>`;
            }).join('');
        };

        const buildOvertimeOptions = (selectedValue) => {
            const options = ['No', 'Yes', 'H-Working'];
            return options.map(opt => `<option value="${opt}" ${(selectedValue || 'No') === opt ? 'selected' : ''}>${opt}</option>`).join('');
        };

        return employees.map(emp => {
            const existingRecord = attendance.find(a =>
                a.employee === emp.name && DataManager.formatDate(new Date(a.date)) === dateStr
            );
            const checkIn = existingRecord?.checkIn || '';
            const checkOut = existingRecord?.checkOut || '';
            const statusValue = existingRecord?.status || (isHoliday ? 'Holiday' : 'Present');
            const overTimeValue = existingRecord?.overTime || 'No';
            const badge = existingRecord ? '<span class="badge bg-info ms-2">Already Marked</span>' : '';

            return `
                <tr data-employee="${emp.name}" data-record-id="${existingRecord ? existingRecord.id : ''}">
                    <td><input type="checkbox" class="employee-checkbox"></td>
                    <td class="fw-semibold">${emp.name} ${badge}</td>
                    <td>
                        <select class="form-select form-select-sm bulk-checkin" data-employee="${emp.name}">
                            ${buildTimeOptions(checkIn)}
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm bulk-checkout" data-employee="${emp.name}">
                            ${buildTimeOptions(checkOut)}
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm bulk-status" data-employee="${emp.name}" onchange="AttendanceModule.handleBulkStatusChange(this)">
                            ${buildStatusOptions(statusValue)}
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm bulk-overtime" data-employee="${emp.name}">
                            ${buildOvertimeOptions(overTimeValue)}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    },

    initializeBulkStatusControls() {
        document.querySelectorAll('#bulkAttendanceTableBody .bulk-status').forEach(select => {
            this.handleBulkStatusChange(select, true);
        });
    },

    setupBulkDefaultHandlers() {
        const checkInDefault = document.getElementById('bulkCheckIn');
        const checkOutDefault = document.getElementById('bulkCheckOut');

        if (checkInDefault) {
            checkInDefault.onchange = () => this.applyDefaultTime('checkIn');
        }
        if (checkOutDefault) {
            checkOutDefault.onchange = () => this.applyDefaultTime('checkOut');
        }
    },

    attachBulkCheckboxListeners() {
        const tbody = document.getElementById('bulkAttendanceTableBody');
        if (!tbody) return;

        tbody.querySelectorAll('.employee-checkbox').forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) {
                    this.applyDefaultTime('checkIn');
                    this.applyDefaultTime('checkOut');
                }
            };
        });
    },

    applyDefaultTime(field) {
        const leaveStatuses = ['Paid Leave', 'Unpaid Leave', 'Sick Leave'];
        const defaultCheckIn = document.getElementById('bulkCheckIn')?.value;
        const defaultCheckOut = document.getElementById('bulkCheckOut')?.value;

        document.querySelectorAll('.employee-checkbox:checked:not(:disabled)').forEach(checkbox => {
            const row = checkbox.closest('tr');
            const status = row.querySelector('.bulk-status').value;
            if (leaveStatuses.includes(status)) {
                return;
            }

            if (field === 'checkIn' && defaultCheckIn) {
                const checkInSelect = row.querySelector('.bulk-checkin');
                checkInSelect.value = defaultCheckIn;
            }
            if (field === 'checkOut' && defaultCheckOut) {
                const checkOutSelect = row.querySelector('.bulk-checkout');
                checkOutSelect.value = defaultCheckOut;
            }
        });
    },

    handleBulkStatusChange(selectEl, isInitializing = false) {
        if (!selectEl) return;
        const status = selectEl.value;
        const row = selectEl.closest('tr');
        if (!row) return;
        const checkInSelect = row.querySelector('.bulk-checkin');
        const checkOutSelect = row.querySelector('.bulk-checkout');
        const leaveStatuses = ['Paid Leave', 'Unpaid Leave', 'Sick Leave'];

        if (leaveStatuses.includes(status)) {
            if (checkInSelect) {
                checkInSelect.value = '';
                checkInSelect.disabled = true;
            }
            if (checkOutSelect) {
                checkOutSelect.value = '';
                checkOutSelect.disabled = true;
            }
        } else {
            if (checkInSelect) {
                checkInSelect.disabled = false;
            }
            if (checkOutSelect) {
                checkOutSelect.disabled = false;
            }
        }

        // When initializing, no further action
        if (!isInitializing) {
            // ensure checkbox stays enabled even for existing
        }
    },

    updateBulkDefaults() {
        // Automatically apply defaults to all checked employees when defaults change
        const defaultCheckIn = document.getElementById('bulkCheckIn')?.value;
        const defaultCheckOut = document.getElementById('bulkCheckOut')?.value;
        const defaultStatus = document.getElementById('bulkStatus')?.value;

        document.querySelectorAll('.employee-checkbox:checked:not(:disabled)').forEach(checkbox => {
            const row = checkbox.closest('tr');
            const employee = row.dataset.employee;

            const checkInSelect = row.querySelector(`.bulk-checkin[data-employee="${employee}"]`);
            const checkOutSelect = row.querySelector(`.bulk-checkout[data-employee="${employee}"]`);
            const statusSelect = row.querySelector(`.bulk-status[data-employee="${employee}"]`);

            const leaveStatuses = ['Paid Leave', 'Unpaid Leave', 'Sick Leave'];

            // Update status first
            if (defaultStatus && statusSelect) {
                statusSelect.value = defaultStatus;
                this.handleBulkStatusChange(statusSelect, true);
            }

            // Then update times (only if not a leave status)
            const currentStatus = statusSelect?.value;
            if (!leaveStatuses.includes(currentStatus)) {
                if (defaultCheckIn && checkInSelect) {
                    checkInSelect.value = defaultCheckIn;
                }
                if (defaultCheckOut && checkOutSelect) {
                    checkOutSelect.value = defaultCheckOut;
                }
            }
        });
    },

    async updateBulkDate() {
        const dateInput = document.getElementById('bulkAttendanceDate');
        if (!dateInput) return;

        const dateStr = dateInput.value;
        this.currentBulkDate = dateStr;

        // Update modal title
        const modalTitle = document.querySelector('#bulkAttendanceModal .modal-title');
        if (modalTitle) {
            modalTitle.textContent = `Bulk Mark Attendance - ${DataManager.formatDateDisplay(dateStr)}`;
        }

        const tableBody = document.getElementById('bulkAttendanceTableBody');
        if (tableBody) {
            tableBody.innerHTML = await this.renderBulkEmployeeRows(dateStr);
            this.initializeBulkStatusControls();
            this.setupBulkDefaultHandlers();
            this.attachBulkCheckboxListeners();
        }

        const selectAll = document.getElementById('selectAllCheckbox');
        if (selectAll) {
            selectAll.checked = false;
        }
    },

    applyBulkDefaults() {
        const defaultCheckIn = document.getElementById('bulkCheckIn').value;
        const defaultCheckOut = document.getElementById('bulkCheckOut').value;
        const defaultStatus = document.getElementById('bulkStatus').value;

        document.querySelectorAll('.employee-checkbox:not(:disabled)').forEach(checkbox => {
            if (checkbox.checked) {
                const row = checkbox.closest('tr');
                const employee = row.dataset.employee;
                const checkInSelect = row.querySelector(`.bulk-checkin[data-employee="${employee}"]`);
                const checkOutSelect = row.querySelector(`.bulk-checkout[data-employee="${employee}"]`);
                const statusSelect = row.querySelector(`.bulk-status[data-employee="${employee}"]`);
                const statusValue = statusSelect.value;
                const leaveStatuses = ['Paid Leave', 'Unpaid Leave', 'Sick Leave'];

                if (defaultCheckIn && !leaveStatuses.includes(statusValue)) {
                    checkInSelect.value = defaultCheckIn;
                }
                if (defaultCheckOut && !leaveStatuses.includes(statusValue)) {
                    checkOutSelect.value = defaultCheckOut;
                }
                if (defaultStatus) {
                    statusSelect.value = defaultStatus;
                    this.handleBulkStatusChange(statusSelect, true);
                }
            }
        });
    },

    selectAllEmployees() {
        document.querySelectorAll('.employee-checkbox:not(:disabled)').forEach(cb => cb.checked = true);
        document.getElementById('selectAllCheckbox').checked = true;
        this.applyDefaultTime('checkIn');
        this.applyDefaultTime('checkOut');
    },

    deselectAllEmployees() {
        document.querySelectorAll('.employee-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('selectAllCheckbox').checked = false;
    },

    toggleAllEmployees(checkbox) {
        document.querySelectorAll('.employee-checkbox:not(:disabled)').forEach(cb => cb.checked = checkbox.checked);
    },

    selectedDates: [],

    showDatePicker() {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        const datePickerModal = document.createElement('div');
        datePickerModal.className = 'modal fade';
        datePickerModal.id = 'datePickerModal';
        datePickerModal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Select Multiple Dates</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Month-Year:</label>
                            <input type="month" class="form-control" id="datePickerMonth" 
                                   value="${currentYear}-${String(currentMonth + 1).padStart(2, '0')}" 
                                   onchange="AttendanceModule.renderDatePickerCalendar()">
                        </div>
                        <div class="mb-3">
                            <button class="btn btn-sm btn-primary" onclick="AttendanceModule.selectAllDatesInMonth()">Select All in Month</button>
                            <button class="btn btn-sm btn-secondary" onclick="AttendanceModule.clearSelectedDates()">Clear All</button>
                            <span class="ms-3"><strong>Selected: <span id="selectedDatesCount">0</span> dates</strong></span>
                        </div>
                        <div id="datePickerCalendar" class="date-picker-calendar"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="AttendanceModule.applySelectedDates()">Apply Selected Dates</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(datePickerModal);
        const bsModal = new bootstrap.Modal(datePickerModal);
        bsModal.show();
        datePickerModal.addEventListener('hidden.bs.modal', () => datePickerModal.remove());

        this.renderDatePickerCalendar();
    },

    renderDatePickerCalendar() {
        const monthInput = document.getElementById('datePickerMonth');
        if (!monthInput) return;

        const value = monthInput.value;
        if (!value) return;

        const [year, month] = value.split('-').map(Number);
        const daysInMonth = DataManager.getDaysInMonth(year, month - 1);
        const firstDay = new Date(year, month - 1, 1).getDay();
        const calendar = document.getElementById('datePickerCalendar');
        if (!calendar) return;

        let html = '<div class="premium-calendar">';

        // Header
        html += '<div class="calendar-header">';
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            html += `<div class="calendar-header-cell">${day}</div>`;
        });
        html += '</div>'; // End header

        // Grid
        html += '<div class="calendar-grid">';

        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        // Days
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = DataManager.formatDate(date);
            const isSelected = this.selectedDates.includes(dateStr);
            const isHoliday = DataManager.isHoliday(date) || DataManager.isSunday(date);
            const isToday = date.getTime() === today.getTime();

            let classes = ['calendar-day'];
            if (isSelected) classes.push('selected');
            if (isHoliday) classes.push('holiday');
            if (isToday) classes.push('today');

            html += `
                <div class="${classes.join(' ')}" 
                     onclick="AttendanceModule.toggleDateSelection('${dateStr}')">
                    ${day}
                </div>
            `;
        }

        html += '</div></div>'; // End grid and container
        calendar.innerHTML = html;
        this.updateSelectedDatesCount();
    },

    toggleDateSelection(dateStr) {
        const index = this.selectedDates.indexOf(dateStr);
        if (index > -1) {
            // Deselect
            this.selectedDates.splice(index, 1);
        } else {
            // Select
            this.selectedDates.push(dateStr);
        }
        this.renderDatePickerCalendar();
        this.updateSelectedDatesDisplay();
    },

    selectAllDatesInMonth() {
        const monthInput = document.getElementById('datePickerMonth');
        if (!monthInput) return;

        const value = monthInput.value;
        if (!value) return;

        const [year, month] = value.split('-').map(Number);
        const daysInMonth = DataManager.getDaysInMonth(year, month - 1);

        this.selectedDates = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = DataManager.formatDate(date);
            this.selectedDates.push(dateStr);
        }

        this.renderDatePickerCalendar();
        this.updateSelectedDatesDisplay();
    },

    clearSelectedDates() {
        this.selectedDates = [];
        this.renderDatePickerCalendar();
        this.updateSelectedDatesDisplay();
    },

    updateSelectedDatesCount() {
        const countEl = document.getElementById('selectedDatesCount');
        if (countEl) {
            countEl.textContent = this.selectedDates.length;
        }
    },

    updateSelectedDatesDisplay() {
        const display = document.getElementById('selectedDatesDisplay');
        if (display) {
            if (this.selectedDates.length > 0) {
                const datesList = this.selectedDates.map(d => DataManager.formatDateDisplay(d)).join(', ');
                display.innerHTML = `<small class="text-success"><strong>Selected:</strong> ${datesList}</small>`;
            } else {
                display.innerHTML = '';
            }
        }
    },

    applySelectedDates() {
        if (this.selectedDates.length === 0) {
            App.showNotification('Please select at least one date', 'error');
            return;
        }

        // Close date picker modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('datePickerModal'));
        if (modal) modal.hide();

        // Update bulk attendance date input (use first selected date as default)
        const dateInput = document.getElementById('bulkAttendanceDate');
        if (dateInput && this.selectedDates.length > 0) {
            dateInput.value = this.selectedDates[0];
            // Trigger updateBulkDate to refresh UI (title, defaults, existing records)
            this.updateBulkDate();
        }

        this.updateSelectedDatesDisplay();
        App.showNotification(`Selected ${this.selectedDates.length} date(s)`, 'success');
    },

    async saveBulkAttendance() {
        // Use selected dates if available, otherwise use single date input
        let datesToProcess = [];

        if (this.selectedDates && this.selectedDates.length > 0) {
            datesToProcess = [...this.selectedDates];
        } else {
            const dateInput = document.getElementById('bulkAttendanceDate');
            if (!dateInput || !dateInput.value) {
                App.showNotification('Please select a date or multiple dates', 'error');
                return;
            }
            datesToProcess = [dateInput.value];
        }

        if (datesToProcess.length === 0) {
            App.showNotification('Please select at least one date', 'error');
            return;
        }
        const selectedEmployees = [];
        document.querySelectorAll('.employee-checkbox:checked:not(:disabled)').forEach(checkbox => {
            const row = checkbox.closest('tr');
            const employee = row.dataset.employee;
            let checkIn = row.querySelector(`.bulk-checkin[data-employee="${employee}"]`).value;
            let checkOut = row.querySelector(`.bulk-checkout[data-employee="${employee}"]`).value;
            const status = row.querySelector(`.bulk-status[data-employee="${employee}"]`).value;
            const overTime = row.querySelector(`.bulk-overtime[data-employee="${employee}"]`).value;
            const recordId = row.dataset.recordId || null;
            const leaveStatuses = ['Paid Leave', 'Unpaid Leave', 'Sick Leave'];

            if (leaveStatuses.includes(status)) {
                checkIn = '';
                checkOut = '';
            }

            if (employee && status) {
                selectedEmployees.push({ employee, checkIn, checkOut, status, overTime, recordId });
            }
        });

        if (selectedEmployees.length === 0) {
            App.showNotification('Please select at least one employee', 'error');
            return;
        }

        const attendance = await DataManager.getAttendance();
        let totalSavedCount = 0;

        // Process each selected date
        for (const dateStr of datesToProcess) {
            const date = new Date(dateStr);
            const isHoliday = await DataManager.isHoliday(date);
            const isSunday = DataManager.isSunday(date);

            for (const empData of selectedEmployees) {
                const existingIndex = attendance.findIndex(a =>
                    a.employee === empData.employee && DataManager.formatDate(new Date(a.date)) === dateStr
                );

                // If Over Time is H-Working, automatically set Status to H-Working
                let finalStatus = empData.status;
                if (empData.overTime === 'H-Working' || empData.overTime === 'Holiday working') {
                    finalStatus = 'H-Working';
                }

                const workedHours = empData.checkIn && empData.checkOut ?
                    DataManager.calculateHours(empData.checkIn, empData.checkOut) : 0;
                const otHours = DataManager.calculateOTHours(workedHours, finalStatus, empData.overTime, isHoliday, isSunday);
                const holidayReason = (finalStatus === 'Holiday' || finalStatus === 'H-Working') ?
                    await DataManager.getHolidayReason(date) : null;

                let recordId = empData.recordId;
                if (!recordId && existingIndex !== -1) {
                    recordId = attendance[existingIndex].id;
                }
                if (!recordId) {
                    recordId = 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                }

                const record = DataManager.addTimestamp({
                    id: recordId,
                    date: date.toISOString(),
                    employee: empData.employee,
                    checkIn: empData.checkIn || null,
                    checkOut: empData.checkOut || null,
                    status: finalStatus,
                    overTime: empData.overTime || 'No',
                    otHours: otHours,
                    holidayReason: holidayReason
                });

                if (existingIndex !== -1) {
                    attendance[existingIndex] = record;
                } else {
                    attendance.push(record);
                }
                totalSavedCount++;
            }
        }

        await DataManager.saveAttendance(attendance);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('bulkAttendanceModal'));
        if (modal) modal.hide();

        // Clear selected dates
        this.selectedDates = [];

        // Reload attendance view
        const dateInput = document.getElementById('attendanceDate');
        if (dateInput) {
            await this.loadAttendanceForDate();
        }

        App.showNotification(`Successfully marked attendance for ${totalSavedCount} record(s) across ${datesToProcess.length} date(s)`, 'success');
    },

    async handleStatusChange() {
        const status = document.getElementById('attendanceStatus').value;
        const dateInput = document.getElementById('attendanceRecordDate');
        const dateStr = dateInput ? dateInput.value : DataManager.formatDate(new Date());
        const date = new Date(dateStr);

        if (status === 'Holiday' || status === 'H-Working') {
            const reason = await DataManager.getHolidayReason(date) || '';
            document.getElementById('attendanceHolidayReason').value = reason;
        } else {
            document.getElementById('attendanceHolidayReason').value = '';
        }

        this.calculateOTHours();
    },

    handleOverTimeChange() {
        const overTime = document.getElementById('attendanceOverTime').value;

        // If Over Time is set to H-Working, automatically set Status to H-Working
        if (overTime === 'H-Working') {
            document.getElementById('attendanceStatus').value = 'H-Working';
            this.handleStatusChange(); // Trigger status change to update holiday reason
        }

        this.calculateOTHours();
    },

    calculateOTHours() {
        const checkIn = document.getElementById('attendanceCheckIn').value;
        const checkOut = document.getElementById('attendanceCheckOut').value;
        let status = document.getElementById('attendanceStatus').value;
        const overTime = document.getElementById('attendanceOverTime').value;
        const dateInput = document.getElementById('attendanceRecordDate');
        const dateStr = dateInput ? dateInput.value : DataManager.formatDate(new Date());

        // If Over Time is H-Working, use H-Working status for calculation
        if (overTime === 'H-Working' || overTime === 'Holiday working') {
            status = 'H-Working';
        }

        if (!checkIn || !checkOut) {
            document.getElementById('attendanceOTHours').value = '0';
            return;
        }

        const date = new Date(dateStr);
        const workedHours = DataManager.calculateHours(checkIn, checkOut);
        const isHoliday = DataManager.isHoliday(date);
        const isSunday = DataManager.isSunday(date);
        const otHours = DataManager.calculateOTHours(workedHours, status, overTime, isHoliday, isSunday);
        document.getElementById('attendanceOTHours').value = otHours.toFixed(2);
    },

    async saveAttendanceRecord() {
        const form = document.getElementById('attendanceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const recordId = document.getElementById('attendanceId').value;
        const dateStr = document.getElementById('attendanceRecordDate').value;
        const employee = document.getElementById('attendanceEmployee').value;
        const checkIn = document.getElementById('attendanceCheckIn').value;
        const checkOut = document.getElementById('attendanceCheckOut').value;
        const status = document.getElementById('attendanceStatus').value;
        const overTime = document.getElementById('attendanceOverTime').value;
        const otHours = parseFloat(document.getElementById('attendanceOTHours').value) || 0;
        const holidayReason = document.getElementById('attendanceHolidayReason').value;

        if (!employee || !status || !dateStr) {
            App.showNotification('Please fill all required fields', 'error');
            return;
        }

        const date = new Date(dateStr);
        const workedHours = checkIn && checkOut ? DataManager.calculateHours(checkIn, checkOut) : 0;
        const isHoliday = await DataManager.isHoliday(date);
        const isSunday = DataManager.isSunday(date);

        // If Over Time is H-Working, automatically set Status to H-Working
        let finalStatus = status;
        if (overTime === 'H-Working' || overTime === 'Holiday working') {
            finalStatus = 'H-Working';
        }

        const calculatedOTHours = DataManager.calculateOTHours(workedHours, finalStatus, overTime, isHoliday, isSunday);

        // Update holiday reason if status is H-Working
        let finalHolidayReason = holidayReason;
        if (finalStatus === 'H-Working') {
            finalHolidayReason = await DataManager.getHolidayReason(date) || holidayReason || null;
        } else if (finalStatus === 'Holiday') {
            finalHolidayReason = await DataManager.getHolidayReason(date) || holidayReason || null;
        }

        const attendance = await DataManager.getAttendance();

        // Check for duplicate employee on same date
        const existingIndex = attendance.findIndex(a => {
            const aDateStr = DataManager.formatDate(new Date(a.date));
            return aDateStr === dateStr && a.employee === employee && a.id !== recordId;
        });

        if (existingIndex !== -1) {
            App.showNotification('Attendance record already exists for this employee on this date', 'error');
            return;
        }

        const record = DataManager.addTimestamp({
            id: recordId || 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: date.toISOString(),
            employee,
            checkIn: checkIn || null,
            checkOut: checkOut || null,
            status: finalStatus,
            overTime: overTime || 'No',
            otHours: calculatedOTHours,
            holidayReason: finalHolidayReason
        });

        if (recordId) {
            // Update existing
            const index = attendance.findIndex(a => a.id === recordId);
            if (index !== -1) {
                attendance[index] = record;
            }
        } else {
            // Add new
            attendance.push(record);
        }

        await DataManager.saveAttendance(attendance);
        this.modal.hide();
        await this.loadAttendanceForDate();
        App.showNotification('Attendance record saved successfully', 'success');
    },

    async editAttendanceRecord(recordId) {
        const attendance = await DataManager.getAttendance();
        const record = attendance.find(a => a.id === recordId);

        if (!record) {
            App.showNotification('Record not found', 'error');
            return;
        }

        const form = document.getElementById('attendanceForm');
        if (form) {
            document.getElementById('attendanceId').value = record.id;
            document.getElementById('attendanceRecordDate').value = DataManager.formatDate(record.date);
            document.getElementById('attendanceEmployee').value = record.employee;
            document.getElementById('attendanceCheckIn').value = record.checkIn || '';
            document.getElementById('attendanceCheckOut').value = record.checkOut || '';
            document.getElementById('attendanceStatus').value = record.status;
            document.getElementById('attendanceOverTime').value = record.overTime || 'No';
            document.getElementById('attendanceOTHours').value = record.otHours || 0;
            document.getElementById('attendanceHolidayReason').value = record.holidayReason || '';
            document.getElementById('attendanceFormTitle').textContent = 'Edit Attendance Record';
        }

        // Add event listeners for OT calculation
        document.getElementById('attendanceCheckIn').addEventListener('change', () => this.calculateOTHours());
        document.getElementById('attendanceCheckOut').addEventListener('change', () => this.calculateOTHours());
        document.getElementById('attendanceOverTime').addEventListener('change', () => this.calculateOTHours());

        if (this.modal) {
            this.modal.show();
        }
    },

    async deleteAttendanceRecord(recordId) {
        if (!App.confirmAction('Are you sure you want to delete this attendance record?')) {
            return;
        }

        const attendance = await DataManager.getAttendance();
        const filtered = attendance.filter(a => a.id !== recordId);
        await DataManager.saveAttendance(filtered);
        await this.loadAttendanceForDate();
        App.showNotification('Attendance record deleted successfully', 'success');
    },

    exportSampleFile() {
        const headers = ['Employee Name', 'Date (YYYY-MM-DD)', 'Status', 'Check-in (HH:MM)', 'Check-out (HH:MM)', 'Overtime (Yes/No/H-Working)'];
        const sampleData = ['John Doe', '2023-10-25', 'Present', '09:00', '18:00', 'No'];

        const csvContent = [
            headers.join(','),
            sampleData.join(',')
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance_bulk_import_sample.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

// Expose to window
window.AttendanceModule = AttendanceModule;
