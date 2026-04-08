// Holiday Management Module (CRUD)
const HolidaysModule = {
    editingHoliday: null,
    _resetModalState() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    },

    async load() {
        await this.renderHolidayList();
    },

    async renderHolidayList() {
        const view = document.getElementById('holidaysView');
        if (!view) return;

        const holidays = await DataManager.getHolidays();
        holidays.sort((a, b) => new Date(a.date) - new Date(b.date));

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>Holiday Management</h2>
                    <button class="btn btn-primary" onclick="HolidaysModule.showHolidayForm()">
                        <i class="bi bi-plus-circle"></i> Add Holiday
                    </button>
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5>Holidays List (${holidays.length} holidays)</h5>
                            <small class="text-muted">Note: Sundays are automatically detected and marked as holidays</small>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Day</th>
                                            <th>Reason</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${holidays.map(holiday => {
            const date = new Date(holiday.date);
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return `
                                                <tr>
                                                    <td>${DataManager.formatDateDisplay(holiday.date)}</td>
                                                    <td>${days[date.getDay()]}</td>
                                                    <td>${holiday.reason}</td>
                                                    <td>
                                                        <button class="btn btn-sm btn-primary" onclick="HolidaysModule.editHoliday('${holiday.id}')">
                                                            <i class="bi bi-pencil"></i> Edit
                                                        </button>
                                                        <button class="btn btn-sm btn-danger" onclick="HolidaysModule.deleteHoliday('${holiday.id}')">
                                                            <i class="bi bi-trash"></i> Delete
                                                        </button>
                                                    </td>
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
            <div id="holidayFormModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="holidayFormTitle">Add Holiday</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="holidayForm">
                                <input type="hidden" id="holidayId">
                                <div class="mb-3">
                                    <label for="holidayDate" class="form-label">Date *</label>
                                    <input type="date" class="form-control" id="holidayDate" required>
                                </div>
                                <div class="mb-3">
                                    <label for="holidayReason" class="form-label">Reason *</label>
                                    <input type="text" class="form-control" id="holidayReason" required placeholder="e.g., Republic Day, Diwali">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="HolidaysModule.saveHoliday()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize modal
        const modalElement = document.getElementById('holidayFormModal');
        if (modalElement) {
            if (modalElement.parentElement !== document.body) {
                document.body.appendChild(modalElement);
            }
            this.modal = new bootstrap.Modal(modalElement, { backdrop: true, keyboard: true, focus: true });
            modalElement.addEventListener('hidden.bs.modal', () => this._resetModalState());
        }
    },

    async showHolidayForm(holidayId = null) {
        this.editingHoliday = holidayId;
        const form = document.getElementById('holidayForm');
        const title = document.getElementById('holidayFormTitle');

        if (holidayId) {
            const holidays = await DataManager.getHolidays();
            const holiday = holidays.find(h => h.id === holidayId);
            if (holiday) {
                document.getElementById('holidayId').value = holiday.id;
                document.getElementById('holidayDate').value = DataManager.formatDate(holiday.date);
                document.getElementById('holidayReason').value = holiday.reason;
                title.textContent = 'Edit Holiday';
            }
        } else {
            form.reset();
            document.getElementById('holidayId').value = '';
            title.textContent = 'Add Holiday';
        }

        this._resetModalState();
        if (this.modal) {
            this.modal.show();
        }
    },

    async saveHoliday() {
        const form = document.getElementById('holidayForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const holidayId = document.getElementById('holidayId').value;
        const date = document.getElementById('holidayDate').value;
        const reason = document.getElementById('holidayReason').value.trim();

        if (!date || !reason) {
            App.showNotification('Please fill all required fields', 'error');
            return;
        }

        const holidayDate = new Date(date);
        if (DataManager.isSunday(holidayDate)) {
            App.showNotification('This date is a Sunday. Sundays are automatically marked as holidays.', 'info');
        }

        const holidays = await DataManager.getHolidays();

        // Check for duplicate
        const dateStr = DataManager.formatDate(holidayDate);
        const existingIndex = holidays.findIndex(h => {
            const hDateStr = DataManager.formatDate(new Date(h.date));
            return hDateStr === dateStr && h.id !== holidayId;
        });

        if (existingIndex !== -1) {
            App.showNotification('A holiday already exists for this date', 'error');
            return;
        }

        if (holidayId) {
            // Update existing
            const index = holidays.findIndex(h => h.id === holidayId);
            if (index !== -1) {
                holidays[index] = {
                    ...holidays[index],
                    date: holidayDate.toISOString(),
                    reason
                };
            }
        } else {
            // Add new
            const newHoliday = {
                id: 'hol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                date: holidayDate.toISOString(),
                reason
            };
            holidays.push(newHoliday);
        }

        const saved = await DataManager.saveHolidays(holidays);
        if (saved === false) {
            App.showNotification('Save was cancelled (e.g. sync conflict). Try again.', 'error');
            return;
        }
        this.modal?.hide();
        await this.renderHolidayList();
        App.showNotification('Holiday saved successfully', 'success');

        // Update existing attendance records
        const attendance = await DataManager.getAttendance();
        let attendanceUpdated = false;
        
        // Find records for this date
        const holidayDateStr = DataManager.formatDate(holidayDate);
        
        attendance.forEach(record => {
            const recordDateStr = DataManager.formatDate(new Date(record.date));
            if (recordDateStr === holidayDateStr) {
                // Only update if status is NOT 'H-Working' (allow manual override for working on holiday)
                // We also check if it's not already 'Holiday' to avoid unnecessary saves
                // We typically overwrite 'Present', 'Half Day'. 
                // We might want to be careful about 'Paid Leave'/'Sick Leave' but usually Holiday overrides those too (user's benefit).
                // For safety, let's update everything EXCEPT H-Working.
                if (record.status !== 'H-Working' && (record.status !== 'Holiday' || record.holidayReason !== reason)) {
                    record.status = 'Holiday';
                    record.holidayReason = reason;
                    // Reset OT/Check-in/out? 
                    // Let's keep check-in/out times just in case, but reset OT hours since it's a holiday
                    // actually, if they worked, it should be H-Working. If it's Holiday, they didn't work.
                    // But maybe we should just change status and let them figure out hours transparency?
                    // Safest is to just change status and reason.
                    record.otHours = 0; // Reset OT hours as it is now a holiday
                    attendanceUpdated = true;
                }
            }
        });

        if (attendanceUpdated) {
            await DataManager.saveAttendance(attendance);
            console.log('Attendance records updated to reflect new holiday');
        }

        // Refresh attendance view if it's open
        if (App.currentView === 'attendance') {
            AttendanceModule.load();
        }
    },

    editHoliday(holidayId) {
        this.showHolidayForm(holidayId);
    },

    async deleteHoliday(holidayId) {
        if (!App.confirmAction('Are you sure you want to delete this holiday?')) {
            return;
        }

        const holidays = await DataManager.getHolidays();
        const filtered = holidays.filter(h => h.id !== holidayId);
        await DataManager.saveHolidays(filtered);
        await this.renderHolidayList();
        App.showNotification('Holiday deleted successfully', 'success');

        // Refresh attendance view if it's open
        if (App.currentView === 'attendance') {
            AttendanceModule.load();
        }
    }
};

