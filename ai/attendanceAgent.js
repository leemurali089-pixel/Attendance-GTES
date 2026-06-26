const AttendanceAgent = {
    async markAttendance(slots) {
        const res = EmployeeAgent._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const status = slots.status || 'present';
        const data = await ErpFunctions.markAttendanceDirect({ employeeName: res.employee.name, status });
        return {
            success: true,
            message: NotificationAgent.format('mark_attendance', data),
            data
        };
    },

    async markLeave(slots) {
        const res = EmployeeAgent._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const data = await ErpFunctions.markAttendanceDirect({ employeeName: res.employee.name, status: 'leave' });
        return { success: true, message: NotificationAgent.format('mark_leave', data), data };
    },

    _whenLabel(when) {
        const w = String(when || '').toLowerCase();
        if (w === 'yesterday' || w === 'innal' || w === 'innalai') return 'yesterday';
        if (w === 'tomorrow' || w === 'naalai') return 'tomorrow';
        return 'today';
    },

    async getAbsentToday(slots = {}) {
        const date = ErpFunctions.resolveDateFromWhen(slots.when || 'today');
        const data = await ErpFunctions.getAbsentEmployeesForDate(date);
        const label = this._whenLabel(slots.when);
        return {
            success: true,
            message: NotificationAgent.format('absent_employees', { ...data, label }),
            data
        };
    },

    async markAllHoliday(slots = {}) {
        const when = slots.when || 'today';
        const date = ErpFunctions.resolveDateFromWhen(when);
        let reason = slots.reason || 'Holiday';
        if (!slots.reason && typeof DataManager !== 'undefined' && DataManager.isSunday && DataManager.isSunday(date)) {
            reason = 'Sunday';
        }
        const data = await ErpFunctions.markAllHolidayForDate({ date, reason });
        const parts = [`Marked ${data.markedCount} employee(s) as Holiday for ${data.dateStr}`];
        if (data.skipped) parts.push(`${data.skipped} already had attendance records`);
        return { success: true, message: parts.join('. ') + '.', data };
    },

    async getMonthlySummary() {
        const now = new Date();
        const records = await DataManager.getAttendanceByMonth(now.getFullYear(), now.getMonth());
        const present = records.filter((r) => r.status === 'Present').length;
        const leave = records.filter((r) => ['Paid Leave', 'Unpaid Leave', 'Sick Leave'].includes(r.status)).length;
        return {
            success: true,
            message: `This month: ${present} present records and ${leave} leave records logged.`,
            data: { present, leave, total: records.length }
        };
    },

    async deleteAttendance(slots) {
        const res = EmployeeAgent._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const todayStr = DataManager.formatDate(new Date());
        const attendance = await DataManager.getAttendance();
        const filtered = attendance.filter((a) =>
            !(DataManager.formatDate(new Date(a.date)) === todayStr && a.employee === res.employee.name));
        if (filtered.length === attendance.length) {
            throw new Error(`No attendance record found today for ${res.employee.name}.`);
        }
        await DataManager.saveAttendance(filtered);
        return { success: true, message: `Attendance removed for ${res.employee.name} today.` };
    }
};

window.AttendanceAgent = AttendanceAgent;
