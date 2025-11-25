// Monthly Filter Attendance View
const FilterAttendanceModule = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    currentEmployee: null,
    viewType: 'table', // 'table' or 'calendar'
    _cachedTimeSlots: null, // Cache for time slot options HTML

    load() {
        this.renderFilterView();
    },

    setViewType(type) {
        this.viewType = type;
        this.renderFilterView();
    },

    getTimeSlotOptionsHTML() {
        // Return cached version if available
        if (this._cachedTimeSlots) {
            return this._cachedTimeSlots;
        }

        // Generate and cache time slot options
        const timeSlots = DataManager.generateTimeSlots();
        this._cachedTimeSlots = timeSlots.map(slot =>
            `<option value="${slot.value}">${slot.display}</option>`
        ).join('');

        return this._cachedTimeSlots;
    },

    getColorLegendHTML() {
        return `
            <div class="card mb-0">
                <div class="card-header">
                    <h6 class="mb-0"><i class="bi bi-palette"></i> Status Color Code</h6>
                </div>
                <div class="card-body">
                    <div class="row g-2">
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(59, 130, 246, 0.35); border-left: 4px solid #3b82f6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #3b82f6; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #93c5fd;">Paid Leave</strong>
                                    <small class="d-block" style="color: var(--text-secondary);">Employee on paid leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(245, 158, 11, 0.35); border-left: 4px solid #f59e0b;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #f59e0b; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #fbbf24;">Unpaid Leave</strong>
                                    <small class="d-block" style="color: var(--text-secondary);">Employee on unpaid leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #ef4444; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #fca5a5;">Sick Leave</strong>
                                    <small class="d-block" style="color: var(--text-secondary);">Employee on sick leave</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(139, 92, 246, 0.35); border-left: 4px solid #8b5cf6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #8b5cf6; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #c4b5fd;">Half Day</strong>
                                    <small class="d-block" style="color: var(--text-secondary);">Employee worked half day</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(255, 248, 220, 0.5); border-left: 4px solid #d4af37;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #d4af37; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #1e293b;">Holiday</strong>
                                    <small class="d-block" style="color: #475569;">Holiday or Sunday</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 col-lg-4">
                            <div class="d-flex align-items-center p-2 rounded" style="background-color: rgba(20, 78, 94, 0.6); border-left: 4px solid #14b8a6;">
                                <div class="me-2" style="width: 20px; height: 20px; background-color: #14b8a6; border-radius: 3px;"></div>
                                <div>
                                    <strong style="color: #5eead4;">H-Working</strong>
                                    <small class="d-block" style="color: var(--text-secondary);">Working on holiday/Sunday</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderFilterView() {
        const view = document.getElementById('filterAttendanceView');
        if (!view) return;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonthYear = `${months[this.currentMonth]}-${this.currentYear}`;

        const employees = DataManager.getEmployeesActiveInMonth(this.currentYear, this.currentMonth);
        const viewType = this.viewType || 'table';

        view.innerHTML = `
            <div class="filter-attendance-sticky-header">
                <div class="row mb-3">
                <div class="col-12">
                    <h2>Filter Attendance (Monthly View)</h2>
                    <div class="d-flex gap-2 align-items-center flex-wrap mb-3">
                        <label for="filterMonthYear" class="form-label mb-0">Select Month-Year:</label>
                        <input type="month" class="form-control" id="filterMonthYear" 
                               value="${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}" 
                               style="width: auto;" 
                               onchange="FilterAttendanceModule.loadMonthAttendance()">
                        <label for="filterEmployee" class="form-label mb-0">Filter by Employee:</label>
                        <select class="form-select" id="filterEmployee" style="width: auto;" onchange="FilterAttendanceModule.loadMonthAttendance()">
                            <option value="">All Employees</option>
                            ${employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('')}
                        </select>
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-${viewType === 'table' ? 'primary' : 'secondary'}" onclick="FilterAttendanceModule.setViewType('table')">
                                <i class="bi bi-table"></i> Table View
                            </button>
                            <button type="button" class="btn btn-${viewType === 'calendar' ? 'primary' : 'secondary'}" onclick="FilterAttendanceModule.setViewType('calendar')">
                                <i class="bi bi-calendar3"></i> Calendar View
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
                <div class="filter-attendance-sticky-legend">
                    ${this.getColorLegendHTML()}
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Attendance Records - ${currentMonthYear}${this.currentEmployee ? ` (${this.currentEmployee})` : ''}</h5>
                            <small style="color: var(--text-secondary); font-size: 0.9rem;">${viewType === 'table' ? 'Edit fields below and changes will sync to main attendance' : 'Click on dates to view/edit attendance'}</small>
                        </div>
                        <div class="card-body filter-attendance-scrollable" id="filterAttendanceContent">
                            ${viewType === 'table' ? this.renderTableView() : this.renderCalendarView()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderTableView() {
        return `
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Employee</th>
                            <th>Check-in</th>
                            <th>Check-out</th>
                            <th>Status</th>
                            <th>Over-Time</th>
                            <th>OT Hours</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="filterAttendanceTableBody">
                        ${this.renderFilterRows()}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderCalendarView() {
        const daysInMonth = DataManager.getDaysInMonth(this.currentYear, this.currentMonth);
        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const attendance = this.getFilteredAttendance();

        // Create attendance map by date
        const attendanceMap = {};
        attendance.forEach(record => {
            const date = new Date(record.date);
            const day = date.getDate();
            if (!attendanceMap[day]) {
                attendanceMap[day] = [];
            }
            attendanceMap[day].push(record);
        });

        let calendarHTML = '<div class="calendar-container">';
        calendarHTML += '<div class="row g-2">';

        // Day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            calendarHTML += `<div class="col calendar-day-header"><strong>${day}</strong></div>`;
        });
        calendarHTML += '</div>';

        // Empty cells for days before month starts
        calendarHTML += '<div class="row g-2">';
        for (let i = 0; i < firstDay; i++) {
            calendarHTML += '<div class="col calendar-day-empty"></div>';
        }

        // Calendar days
        for (let day = 1; day <= daysInMonth; day++) {
            if ((firstDay + day - 1) % 7 === 0 && day > 1) {
                calendarHTML += '</div><div class="row g-2">';
            }

            const date = new Date(this.currentYear, this.currentMonth, day);
            const isHoliday = DataManager.isHoliday(date) || DataManager.isSunday(date);
            const dayRecords = attendanceMap[day] || [];
            const totalOT = dayRecords.reduce((sum, r) => sum + parseFloat(r.otHours || 0), 0);

            let dayClass = 'calendar-day';
            if (isHoliday) dayClass += ' calendar-holiday';
            if (dayRecords.length > 0) dayClass += ' calendar-has-attendance';

            calendarHTML += `
                <div class="col ${dayClass}" onclick="FilterAttendanceModule.showDayDetails(${day})">
                    <div class="calendar-day-number">${day}</div>
                    ${dayRecords.length > 0 ? `
                        <div class="calendar-day-info">
                            <small class="d-block">${dayRecords.length} record(s)</small>
                            ${totalOT > 0 ? `<small class="text-primary"><strong>OT: ${totalOT.toFixed(1)}h</strong></small>` : ''}
                        </div>
                    ` : ''}
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

    getFilteredAttendance() {
        let attendance = DataManager.getAttendanceByMonth(this.currentYear, this.currentMonth);

        // Filter by employee if selected
        if (this.currentEmployee) {
            attendance = attendance.filter(a => a.employee === this.currentEmployee);
        }

        return attendance;
    },

    renderFilterRows() {
        const attendance = this.getFilteredAttendance();

        if (attendance.length === 0) {
            return '<tr><td colspan="8" class="text-center text-muted">No attendance records for this month' + (this.currentEmployee ? ` for ${this.currentEmployee}` : '') + '</td></tr>';
        }

        // Sort by date and employee
        attendance.sort((a, b) => {
            const dateCompare = new Date(a.date) - new Date(b.date);
            if (dateCompare !== 0) return dateCompare;
            return a.employee.localeCompare(b.employee);
        });

        // Get cached time slot options HTML
        const timeSlotOptions = this.getTimeSlotOptionsHTML();

        // Build rows efficiently using array join
        const rows = attendance.map(record => {
            const date = new Date(record.date);
            const isHoliday = DataManager.isHoliday(date) || DataManager.isSunday(date);
            const isHWorking = record.status === 'H-Working' || record.overTime === 'H-Working' || record.overTime === 'Holiday working';

            let rowClass = '';
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

            // Pre-select the current values by replacing the option value in cached HTML
            const checkInOptions = record.checkIn ?
                timeSlotOptions.replace(`value="${record.checkIn}"`, `value="${record.checkIn}" selected`) :
                timeSlotOptions;

            const checkOutOptions = record.checkOut ?
                timeSlotOptions.replace(`value="${record.checkOut}"`, `value="${record.checkOut}" selected`) :
                timeSlotOptions;

            return `
                <tr class="${rowClass}" data-id="${record.id}">
                    <td>${DataManager.formatDateDisplay(record.date)}</td>
                    <td>${record.employee}</td>
                    <td>
                        <select class="form-select form-select-sm" 
                                data-field="checkIn" 
                                data-id="${record.id}"
                                onchange="FilterAttendanceModule.updateField('${record.id}', 'checkIn', this.value)">
                            <option value="">Select Time</option>
                            ${checkInOptions}
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" 
                                data-field="checkOut" 
                                data-id="${record.id}"
                                onchange="FilterAttendanceModule.updateField('${record.id}', 'checkOut', this.value)">
                            <option value="">Select Time</option>
                            ${checkOutOptions}
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" 
                                data-field="status" 
                                data-id="${record.id}"
                                onchange="FilterAttendanceModule.updateField('${record.id}', 'status', this.value)">
                            <option value="Present" ${record.status === 'Present' ? 'selected' : ''}>Present</option>
                            <option value="Paid Leave" ${record.status === 'Paid Leave' ? 'selected' : ''}>Paid Leave</option>
                            <option value="Unpaid Leave" ${record.status === 'Unpaid Leave' ? 'selected' : ''}>Unpaid Leave</option>
                            <option value="Sick Leave" ${record.status === 'Sick Leave' ? 'selected' : ''}>Sick Leave</option>
                            <option value="Half Day" ${record.status === 'Half Day' ? 'selected' : ''}>Half Day</option>
                            <option value="Holiday" ${record.status === 'Holiday' ? 'selected' : ''}>Holiday</option>
                            <option value="H-Working" ${record.status === 'H-Working' ? 'selected' : ''}>H-Working</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" 
                                data-field="overTime" 
                                data-id="${record.id}"
                                onchange="FilterAttendanceModule.updateField('${record.id}', 'overTime', this.value)">
                            <option value="No" ${record.overTime === 'No' ? 'selected' : ''}>No</option>
                            <option value="Yes" ${record.overTime === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="H-Working" ${(record.overTime === 'H-Working' || record.overTime === 'Holiday working') ? 'selected' : ''}>H-Working</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" 
                               class="form-control form-control-sm" 
                               value="${record.otHours || 0}" 
                               step="0.5" 
                               readonly
                               style="width: 80px;">
                    </td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="FilterAttendanceModule.deleteRecord('${record.id}')">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        });

        return rows.join('');
    },

    loadMonthAttendance() {
        const monthInput = document.getElementById('filterMonthYear');
        const employeeInput = document.getElementById('filterEmployee');

        if (monthInput) {
            const value = monthInput.value;
            if (value) {
                const [year, month] = value.split('-').map(Number);
                this.currentYear = year;
                this.currentMonth = month - 1;
            }
        }

        if (employeeInput) {
            this.currentEmployee = employeeInput.value || null;
        }

        const content = document.getElementById('filterAttendanceContent');
        if (content) {
            content.innerHTML = this.viewType === 'table' ? this.renderTableView() : this.renderCalendarView();
        }

        // Update header
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const header = document.querySelector('#filterAttendanceView .card-header h5');
        if (header) {
            header.textContent = `Attendance Records - ${months[this.currentMonth]}-${this.currentYear}${this.currentEmployee ? ` (${this.currentEmployee})` : ''}`;
        }
    },

    showDayDetails(day) {
        const date = new Date(this.currentYear, this.currentMonth, day);
        const dateStr = DataManager.formatDate(date);
        const attendance = this.getFilteredAttendance();
        const dayRecords = attendance.filter(r => {
            const rDate = new Date(r.date);
            return rDate.getDate() === day;
        });

        if (dayRecords.length === 0) {
            App.showNotification('No attendance records for this date', 'info');
            return;
        }

        let detailsHTML = `<h6>Attendance Details - ${DataManager.formatDateDisplay(date)}</h6>`;
        detailsHTML += '<table class="table table-sm">';
        detailsHTML += '<thead><tr><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>OT Hours</th></tr></thead>';
        detailsHTML += '<tbody>';
        dayRecords.forEach(record => {
            detailsHTML += `
                <tr>
                    <td>${record.employee}</td>
                    <td>${record.checkIn ? DataManager.formatTimeDisplay(record.checkIn) : '-'}</td>
                    <td>${record.checkOut ? DataManager.formatTimeDisplay(record.checkOut) : '-'}</td>
                    <td>${record.status}</td>
                    <td>${record.otHours || 0}</td>
                </tr>
            `;
        });
        detailsHTML += '</tbody></table>';

        // Show in modal or alert
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Day Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${detailsHTML}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    },

    updateField(recordId, field, value) {
        const attendance = DataManager.getAttendance();
        const record = attendance.find(a => a.id === recordId);

        if (!record) {
            App.showNotification('Record not found', 'error');
            return;
        }

        // Update the field
        record[field] = value;

        // If Over Time is set to H-Working, automatically set Status to H-Working
        if (field === 'overTime' && (value === 'H-Working' || value === 'Holiday working')) {
            record.status = 'H-Working';
            // Update the status dropdown in the UI
            const statusSelect = document.querySelector(`select[data-field="status"][data-id="${recordId}"]`);
            if (statusSelect) {
                statusSelect.value = 'H-Working';
            }
        }

        // Recalculate OT Hours if check-in/check-out/status/overTime changed
        if (field === 'checkIn' || field === 'checkOut' || field === 'status' || field === 'overTime') {
            const checkIn = record.checkIn || '';
            const checkOut = record.checkOut || '';

            // Use H-Working status if overTime is H-Working
            let statusForCalculation = record.status;
            if (record.overTime === 'H-Working' || record.overTime === 'Holiday working') {
                statusForCalculation = 'H-Working';
            }

            if (checkIn && checkOut) {
                const date = new Date(record.date);
                const workedHours = DataManager.calculateHours(checkIn, checkOut);
                const isHoliday = DataManager.isHoliday(date);
                const isSunday = DataManager.isSunday(date);
                record.otHours = DataManager.calculateOTHours(workedHours, statusForCalculation, record.overTime, isHoliday, isSunday);
            } else {
                record.otHours = 0;
            }

            // Update holiday reason if status is H-Working or Holiday
            const date = new Date(record.date);
            if (statusForCalculation === 'Holiday' || statusForCalculation === 'H-Working') {
                record.holidayReason = DataManager.getHolidayReason(date) || '';
            } else if (field === 'status' && record.status !== 'Holiday' && record.status !== 'H-Working') {
                record.holidayReason = null;
            }
        }

        // Save updated attendance
        DataManager.saveAttendance(attendance);

        // Update the OT Hours field in the UI
        const row = document.querySelector(`tr[data-id="${recordId}"]`);
        if (row) {
            const otHoursInput = row.querySelector('input[readonly]');
            if (otHoursInput) {
                otHoursInput.value = record.otHours || 0;
            }
        }

        App.showNotification('Attendance updated successfully', 'success');
    },

    deleteRecord(recordId) {
        if (!App.confirmAction('Are you sure you want to delete this attendance record?')) {
            return;
        }

        const attendance = DataManager.getAttendance();
        const filtered = attendance.filter(a => a.id !== recordId);
        DataManager.saveAttendance(filtered);

        const tbody = document.getElementById('filterAttendanceTableBody');
        if (tbody) {
            tbody.innerHTML = this.renderFilterRows();
        }

        App.showNotification('Attendance record deleted successfully', 'success');
    }
};

