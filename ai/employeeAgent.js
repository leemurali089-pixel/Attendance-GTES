const EmployeeAgent = {
    _resolveEmployee(slots = {}) {
        let query = slots.employeeName || slots.employeeId || ContextManager.resolveEmployeeName(slots);
        if (!query) {
            return {
                needClarify: true,
                state: 'need_name',
                message: NotificationAgent.formatClarify('employee_need_name')
            };
        }

        const resolved = ErpFunctions.resolveEmployeeQuery(query);

        if (resolved.exact && !resolved.needConfirm) {
            return { resolved: true, employee: resolved.exact };
        }

        if (resolved.state === 'need_confirm') {
            const emp = resolved.exact || resolved.candidates?.[0];
            if (emp) {
                return {
                    needClarify: true,
                    state: 'need_confirm',
                    message: NotificationAgent.formatClarify('employee_need_confirm', { name: emp.name, id: emp.id }),
                    candidates: resolved.candidates || [emp],
                    tentative: emp
                };
            }
        }

        if (resolved.state === 'need_pick' && resolved.candidates?.length) {
            return {
                needClarify: true,
                state: 'need_pick',
                message: NotificationAgent.formatClarify('employee_need_pick', { candidates: resolved.candidates }),
                candidates: resolved.candidates
            };
        }

        const suggestions = ErpFunctions.suggestSimilarEmployees(query, 5);
        return {
            needClarify: true,
            state: 'need_name',
            query,
            candidates: suggestions.map((name) => ({ name })),
            message: NotificationAgent.formatClarify('employee_not_found', { query, suggestions })
        };
    },

    async getOtHours(slots) {
        const res = this._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const data = await ErpFunctions.getEmployeeOtHours(res.employee.name);
        return { success: true, message: NotificationAgent.format('employee_ot', data), data };
    },

    async getSalaryInfo(slots) {
        const res = this._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const emp = res.employee;

        if (slots.monthOffset === -1 || slots.when === 'last_month') {
            const now = new Date();
            const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const data = await ErpFunctions.getEmployeeSalaryForMonth(emp.name, last.getFullYear(), last.getMonth());
            return {
                success: true,
                message: NotificationAgent.format('employee_salary_month', data),
                data
            };
        }

        const salary = parseFloat(emp.salary || emp.basicSalary || emp.baseSalary || emp.monthlySalary || 0);
        return {
            success: true,
            message: `${emp.name} monthly salary is ${ErpFunctions.formatMoney(salary)}.`,
            data: { employeeName: emp.name, salary }
        };
    },

    async getEmployeeDetails(slots) {
        const res = this._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const emp = res.employee;
        const salary = parseFloat(emp.salary || emp.basicSalary || emp.baseSalary || emp.monthlySalary || 0);
        const data = {
            employeeName: emp.name,
            employeeId: emp.id || null,
            salary,
            department: emp.department || emp.designation || emp.salaryType || 'Employee',
            status: emp.status || 'Active',
            phone: emp.phone || null,
            dateOfJoining: emp.dateOfJoining || null
        };
        return {
            success: true,
            message: NotificationAgent.format('employee_details', data),
            data
        };
    },

    async listEmployees() {
        const names = ErpFunctions.listEmployees();
        if (!names.length) {
            return { success: true, message: 'No active employees found.', data: { count: 0, employees: [] } };
        }
        const preview = names.slice(0, 15).join(', ');
        const more = names.length > 15 ? ` and ${names.length - 15} more` : '';
        return {
            success: true,
            message: `${names.length} active employee(s): ${preview}${more}.`,
            data: { count: names.length, employees: names }
        };
    },

    async getAttendanceSummary(slots) {
        const res = this._resolveEmployee(slots);
        if (res.needClarify) return { success: false, ...res };
        const emp = res.employee;

        if (slots.when) {
            const date = ErpFunctions.resolveDateFromWhen(slots.when);
            const data = await ErpFunctions.getEmployeeAttendanceForDate(emp.name, date);
            return {
                success: true,
                message: NotificationAgent.format('employee_attendance_date', data),
                data
            };
        }

        const now = new Date();
        const records = await DataManager.getAttendanceByMonth(now.getFullYear(), now.getMonth());
        const mine = records.filter((r) => r.employee === emp.name);
        const present = mine.filter((r) => r.status === 'Present').length;
        return {
            success: true,
            message: `${emp.name} has ${present} present day(s) this month (${mine.length} records).`,
            data: { employeeName: emp.name, present, total: mine.length }
        };
    }
};

window.EmployeeAgent = EmployeeAgent;
