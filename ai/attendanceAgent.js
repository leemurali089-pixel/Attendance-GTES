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

    async getAbsentToday(slots = {}) {
        let date = new Date();
        if (slots.when === 'yesterday') {
            date = new Date();
            date.setDate(date.getDate() - 1);
        }
        const data = await ErpFunctions.getAbsentEmployeesForDate(date);
        const label = slots.when === 'yesterday' ? 'yesterday' : 'today';
        return {
            success: true,
            message: NotificationAgent.format('absent_employees', { ...data, label }),
            data
        };
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
