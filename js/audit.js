/**
 * Audit Manager - Logs critical system actions
 */
const AuditManager = {
    STORAGE_KEY: 'gtes_audit_logs',
    MAX_LOGS: 1000, // Keep last 1000 logs

    // Log an action
    async log(action, details, user = null) {
        try {
            const currentUser = user || await UserManager.getCurrentUser();
            const username = currentUser ? currentUser.username : 'System';

            const logEntry = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                user: username,
                action: action,
                details: details
            };

            const logs = await this.getLogs();
            logs.unshift(logEntry); // Add to beginning

            // Trim logs
            if (logs.length > this.MAX_LOGS) {
                logs.length = this.MAX_LOGS;
            }

            await DataManager.saveData(this.STORAGE_KEY, logs);
            console.log(`[AUDIT] ${action}: ${details}`);
        } catch (error) {
            console.error('Failed to log audit entry:', error);
        }
    },

    // Get all logs
    async getLogs() {
        const logs = await DataManager.loadData(this.STORAGE_KEY);
        return logs || [];
    },

    // Clear logs (Admin only)
    async clearLogs() {
        await DataManager.saveData(this.STORAGE_KEY, []);
        this.log('AUDIT_CLEAR', 'Audit logs cleared');
    },

    // Export logs to CSV
    async exportLogs() {
        const logs = await this.getLogs();
        if (logs.length === 0) return;

        const headers = ['Timestamp', 'User', 'Action', 'Details'];
        const csvContent = [
            headers.join(','),
            ...logs.map(log => {
                const date = new Date(log.timestamp).toLocaleString();
                const details = `"${(log.details || '').replace(/"/g, '""')}"`;
                return `${date},${log.user},${log.action},${details}`;
            })
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

// Expose
window.AuditManager = AuditManager;
