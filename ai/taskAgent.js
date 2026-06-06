const TaskAgent = {
    async createTask(slots) {
        const partyName = slots.partyName || ContextManager.get().lastCustomerName;
        const hint = slots.taskHint || 'task';
        const narration = slots.narration || `${hint} — created via voice assistant`;
        const tomorrow = new Date();
        if (/tomorrow/i.test(JSON.stringify(slots))) tomorrow.setDate(tomorrow.getDate() + 1);
        const data = await ErpFunctions.createTaskDirect({
            partyName,
            narration,
            followupDate: tomorrow.toISOString().split('T')[0]
        });
        if (typeof App !== 'undefined') App.showView('tasks');
        return { success: true, message: NotificationAgent.format('create_task', data), data };
    },

    async completeTask(slots) {
        const hint = slots.taskHint || slots.taskHintAlt || ContextManager.get().lastTaskHint;
        const data = await ErpFunctions.completeTaskByHint(hint);
        return { success: true, message: NotificationAgent.format('complete_task', data), data };
    },

    async getPendingTasks() {
        const tasks = (DataManager.getData(DataManager.KEYS.TASKS) || []).filter((t) => t.status === 'open' || t.status === 'pending');
        return {
            success: true,
            message: `You have ${tasks.length} pending task(s).`,
            data: { count: tasks.length, tasks: tasks.slice(0, 5).map((t) => ({ id: t.id, party: t.partyName, narration: t.narration })) }
        };
    },

    async deleteTask(slots) {
        return { success: false, needClarify: true, message: 'Please open Tasks and select the task to delete, or specify the task details.' };
    }
};

window.TaskAgent = TaskAgent;
