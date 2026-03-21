/**
 * WhatsApp Service for sharing task updates and business documents
 */

const WhatsAppService = {
    /**
     * Share a generic message to WhatsApp
     * This opens the WhatsApp share intent with the given text.
     * The user can then select a recipient or a group.
     */
    shareMessage(text) {
        if (!text) return;
        const encodedText = encodeURIComponent(text);
        const url = `https://api.whatsapp.com/send?text=${encodedText}`;
        window.open(url, '_blank');
    },

    /**
     * Send a direct message to a phone number
     */
    sendDirect(phone, text) {
        if (!phone) return this.shareMessage(text);
        
        // Clean phone number: remove non-numeric chars
        const cleanPhone = phone.replace(/\D/g, '');
        // Add country code if not present (assuming Indian numbers if 10 digits)
        const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        
        const encodedText = encodeURIComponent(text);
        const url = `https://wa.me/${finalPhone}?text=${encodedText}`;
        window.open(url, '_blank');
    },

    /**
     * Format a task update for sharing
     */
    formatTaskMessage(task, lastUpdateNote = '') {
        const companyName = (window.DataManager && DataManager.COMPANY_PROFILE && DataManager.COMPANY_PROFILE.name) || "GTES";
        
        let msg = `*📢 TASK UPDATE - ${companyName}*\n\n`;
        msg += `*ID:* ${task.id}\n`;
        msg += `*Title:* ${task.narration || 'No description'}\n`;
        msg += `*Party:* ${task.partyName || 'N/A'}\n`;
        msg += `*Status:* ${task.status.toUpperCase()}\n`;
        msg += `*Due Date:* ${this._formatDate(task.followupDate)} ${task.followupTime || '10:00'}\n`;
        msg += `*Assigned To:* ${task.assignedToName || task.assignedTo || 'Unassigned'}\n`;

        if (lastUpdateNote) {
            msg += `\n*LATEST UPDATE:*\n${lastUpdateNote}\n`;
        }

        msg += `\n_Shared via Attendance GTES App_`;
        return msg;
    },

    /**
     * Internal date formatter
     */
    _formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    }
};

// Expose to window
window.WhatsAppService = WhatsAppService;
