/**
 * Job Card Management Module
 * Handles service job tracking with material status
 */

const JobCardManager = {
    async init() {
        await DataManager.init();
        console.log('JobCardManager initialized');
    },

    /**
     * Generate next job card number
     * Format: JC-0001, JC-0002, etc.
     */
    generateJobCardNumber() {
        const jobCards = DataManager.getData('jobcards') || [];
        if (jobCards.length === 0) return 'JC-0001';

        const lastId = jobCards[jobCards.length - 1].id;
        const num = parseInt(lastId.split('-')[1]) + 1;
        return `JC-${num.toString().padStart(4, '0')}`;
    },

    /**
     * Create new job card
     */
    async createJobCard(jobCardData) {
        const jobCards = DataManager.getData('jobcards') || [];

        const jobCard = {
            id: jobCardData.id || this.generateJobCardNumber(),
            date: jobCardData.date || new Date().toISOString().split('T')[0],
            customerId: jobCardData.customerId,
            customerName: jobCardData.customerName,
            equipment: jobCardData.equipment,
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

        jobCards[index] = {
            ...jobCards[index],
            ...updates,
            updatedAt: new Date().toISOString(),
            lastUpdateDate: this.formatDateTime(new Date())
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
        const filtered = jobCards.filter(jc => jc.id !== jobCardId);
        DataManager.saveDataSync('jobcards', filtered);
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
