const PayrollAgent = {
    async generateSalary(slots) {
        const monthIdx = ErpFunctions.parseMonthName(slots.monthName || ContextManager.get().lastMonth);
        const year = new Date().getFullYear();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (typeof App !== 'undefined') App.showView('salary');
        if (typeof ReportsModule !== 'undefined' && ReportsModule.startSalaryPayoutFlow) {
            await ReportsModule.startSalaryPayoutFlow(year, monthIdx);
        }
        return {
            success: true,
            message: `Opening salary payout for ${months[monthIdx]} ${year}. Please confirm employees in the dialog.`,
            data: { year, month: monthIdx }
        };
    },

    async getSalarySummary() {
        const now = new Date();
        const done = await DataManager.isSalaryPayoutDone(now.getFullYear(), now.getMonth());
        return {
            success: true,
            message: done
                ? `Salary payout for this month is already completed.`
                : `Salary payout for this month is not yet completed.`,
            data: { completed: done }
        };
    }
};

window.PayrollAgent = PayrollAgent;
