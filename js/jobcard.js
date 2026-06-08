/**
 * Job Card Management Module
 * Handles service job tracking with material status
 */

const JobCardManager = {
    _lastSerial: null,

    async init() {
        await DataManager.init();
        console.log('JobCardManager initialized');
    },

    /**
     * Track last used serial in-session (mirrors VoucherManager.recordUsedSerial).
     */
    recordUsedSerial(id) {
        if (id) this._lastSerial = id;
    },

    /**
     * Next job card number — scans all JC-* ids for max suffix (same idea as voucher serials).
     * Format: JC-0001, JC-0002, etc.
     */
    getNextJobCardNumber() {
        const jobCards = DataManager.getData('jobcards') || [];
        const prefix = 'JC-';
        let maxNum = 0;
        let padding = 4;

        const consider = (rawId) => {
            const match = (rawId || '').match(/^(JC-)(\d+)$/i);
            if (!match) return;
            const n = parseInt(match[2], 10);
            if (n > maxNum) {
                maxNum = n;
                padding = match[2].length;
            }
        };

        jobCards.forEach((jc) => consider(jc.id));
        consider(this._lastSerial);

        if (maxNum === 0) return `${prefix}${String(1).padStart(padding, '0')}`;
        return `${prefix}${String(maxNum + 1).padStart(padding, '0')}`;
    },

    /** @deprecated use getNextJobCardNumber */
    generateJobCardNumber() {
        return this.getNextJobCardNumber();
    },

    normalizeJobCardId(rawId) {
        const trimmed = (rawId || '').trim();
        if (!trimmed) return '';
        const match = trimmed.match(/^(jc-)(\d+)$/i);
        if (match) return `JC-${match[2]}`;
        return trimmed;
    },

    isJobCardIdTaken(id, excludeId = null) {
        const normalized = this.normalizeJobCardId(id);
        if (!normalized) return false;
        return (DataManager.getData('jobcards') || []).some(
            (jc) => jc.id === normalized && jc.id !== excludeId
        );
    },

    /**
     * Normalize equipment rows; migrate legacy single equipment string.
     */
    normalizeEquipmentItems(jobCard) {
        if (!jobCard) return [];
        if (Array.isArray(jobCard.equipmentItems) && jobCard.equipmentItems.length) {
            return jobCard.equipmentItems.map((row) => ({
                itemName: (row.itemName || row.name || '').trim(),
                description: (row.description || '').trim(),
                quantity: parseInt(row.quantity, 10) || 1,
                complaint: (row.complaint || '').trim()
            })).filter((row) => row.itemName);
        }
        const legacy = (jobCard.equipment || '').trim();
        if (legacy) {
            return [{
                itemName: legacy,
                description: '',
                quantity: 1,
                complaint: (jobCard.complaint || '').trim()
            }];
        }
        return [];
    },

    /**
     * Short summary for list views and legacy PDF fields.
     */
    deriveEquipmentSummary(equipmentItems) {
        return (equipmentItems || []).map((row) => {
            const qty = parseInt(row.quantity, 10) || 1;
            return qty > 1 ? `${row.itemName} x${qty}` : row.itemName;
        }).join('; ');
    },

    /**
     * Create new job card
     */
    async createJobCard(jobCardData) {
        const jobCards = DataManager.getData('jobcards') || [];
        const equipmentItems = jobCardData.equipmentItems || [];
        const equipment = jobCardData.equipment
            || this.deriveEquipmentSummary(equipmentItems);

        let id = this.normalizeJobCardId(jobCardData.id);
        if (!id) id = this.getNextJobCardNumber();

        if (jobCards.some((jc) => jc.id === id)) {
            throw new Error(`Job Card number "${id}" already exists. Please choose a different number.`);
        }

        const jobCard = {
            id,
            date: jobCardData.date || new Date().toISOString().split('T')[0],
            customerId: jobCardData.customerId,
            customerName: jobCardData.customerName,
            customerRef: jobCardData.customerRef || '',
            equipment,
            equipmentItems,
            complaint: jobCardData.complaint,
            status: 'pending', // pending|in-progress|job-done|dispatched
            materials: jobCardData.materials || [],
            workDone: jobCardData.workDone || '',
            technicianId: jobCardData.technicianId || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastUpdateDate: this.formatDateTime(new Date())
        };

        jobCards.push(jobCard);
        DataManager.saveDataSync('jobcards', jobCards);
        this.recordUsedSerial(id);
        return jobCard;
    },

    /**
     * Update job card
     */
    async updateJobCard(jobCardId, updates) {
        const jobCards = DataManager.getData('jobcards') || [];
        const index = jobCards.findIndex(jc => jc.id === jobCardId);

        if (index === -1) {
            throw new Error('Job card not found');
        }

        const now = new Date();
        const displayTime = this.formatDateTime(now);

        // Track history
        const currentJC = jobCards[index];
        const historyEntry = {
            date: now.toISOString(),
            displayDate: displayTime,
            status: updates.status || currentJC.status,
            note: updates.workDone && updates.workDone !== currentJC.workDone ? 'Work details updated' : 'Status/Details updated',
            materialsCount: updates.materials ? updates.materials.length : (currentJC.materials ? currentJC.materials.length : 0)
        };

        jobCards[index] = {
            ...currentJC,
            ...updates,
            history: [...(currentJC.history || []), historyEntry],
            updatedAt: now.toISOString(),
            lastUpdateDate: displayTime
        };

        DataManager.saveDataSync('jobcards', jobCards);
        return jobCards[index];
    },

    /**
     * Update job card status
     */
    async updateStatus(jobCardId, newStatus) {
        return await this.updateJobCard(jobCardId, { status: newStatus });
    },

    /**
     * Update material status within job card
     */
    async updateMaterialStatus(jobCardId, materialIndex, newStatus) {
        const jobCards = DataManager.getData('jobcards') || [];
        const jobCard = jobCards.find(jc => jc.id === jobCardId);

        if (!jobCard) {
            throw new Error('Job card not found');
        }

        if (!jobCard.materials[materialIndex]) {
            throw new Error('Material not found');
        }

        jobCard.materials[materialIndex].status = newStatus;
        jobCard.updatedAt = new Date().toISOString();
        jobCard.lastUpdateDate = this.formatDateTime(new Date());

        DataManager.saveDataSync('jobcards', jobCards);
        return jobCard;
    },

    /**
     * Get all job cards
     */
    getAllJobCards() {
        return DataManager.getData('jobcards') || [];
    },

    /**
     * Get job card by ID
     */
    getJobCard(jobCardId) {
        const jobCards = this.getAllJobCards();
        return jobCards.find(jc => jc.id === jobCardId);
    },

    /**
     * Filter job cards by status
     */
    filterByStatus(status) {
        const jobCards = this.getAllJobCards();
        return jobCards.filter(jc => jc.status === status);
    },

    /**
     * Delete job card
     */
    async deleteJobCard(jobCardId) {
        const jobCards = DataManager.getData('jobcards') || [];
        const jobCard = jobCards.find(jc => jc.id === jobCardId);

        if (jobCard) {
            // Move to Recycle Bin BEFORE removing
            const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
            bin.push({
                ...jobCard,
                _deletedAt: new Date().toISOString(),
                _recordType: 'jobcard'
            });
            await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, bin);
        }

        const filtered = jobCards.filter(jc => jc.id !== jobCardId);
        DataManager.saveDataSync('jobcards', filtered);
    },

    /**
     * Restore job card from recycle bin
     */
    async restoreJobCard(jobCardId) {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const index = bin.findIndex(item => item.id === jobCardId && item._recordType === 'jobcard');

        if (index === -1) throw new Error('Job Card not found in Recycle Bin');

        const jobCard = { ...bin[index] };
        delete jobCard._deletedAt;
        delete jobCard._recordType;

        const jobCards = DataManager.getData('jobcards') || [];
        jobCards.push(jobCard);

        const newBin = bin.filter((_, i) => i !== index);

        DataManager.saveDataSync('jobcards', jobCards);
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, newBin);

        return jobCard;
    },

    /**
     * Format date and time for display
     */
    formatDateTime(date) {
        const d = new Date(date);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    }
};
