/**
 * Update Checker Module
 * Checks for application updates and notifies users
 */
const UpdateChecker = {
    APP_VERSION: '1.3.0', // Match package.json version
    
    /**
     * Get current application version
     */
    getCurrentVersion() {
        return this.currentVersion;
    },

    /**
     * Check for updates (manual check for now)
     * In future, this could call an online API/file for version info
     */
    checkForUpdates() {
        // For now, this is a placeholder
        // Future: fetch('https://yourserver.com/version.json')
        return {
            updateAvailable: false, // Set to true to test the notification modal
            latestVersion: '1.3.0',
            releaseNotes: '• Unified Invoice & Purchase Layouts\n• Robust Vendor Name Cleaning\n• Fixed Table Column Overlaps\n• Enhanced Page-Break Support\n• Import Safeguards for Messy Data',
            downloadUrl: 'https://github.com/leemurali089-pixel/Attendance-GTES/releases'
        };
    },

    /**
     * Show update notification modal
     */
    showUpdateNotification(updateInfo) {
        const modal = new bootstrap.Modal(document.getElementById('updateModal'));
        
        // Populate modal content
        document.getElementById('currentVersion').textContent = this.currentVersion;
        document.getElementById('latestVersion').textContent = updateInfo.latestVersion;
        document.getElementById('releaseNotes').textContent = updateInfo.releaseNotes || 'No release notes available.';
        
        // Set download button link
        const downloadBtn = document.getElementById('downloadUpdateBtn');
        if (updateInfo.downloadUrl) {
            downloadBtn.href = updateInfo.downloadUrl;
            downloadBtn.style.display = 'inline-block';
        } else {
            downloadBtn.style.display = 'none';
        }
        
        modal.show();
    },

    /**
     * Show "up to date" message
     */
    showUpToDateMessage() {
        const modal = new bootstrap.Modal(document.getElementById('upToDateModal'));
        document.getElementById('upToDateVersion').textContent = this.currentVersion;
        modal.show();
    },

    /**
     * Manual update check triggered by user
     */
    async performUpdateCheck() {
        try {
            const updateInfo = this.checkForUpdates();
            
            if (updateInfo.updateAvailable) {
                this.showUpdateNotification(updateInfo);
            } else {
                this.showUpToDateMessage();
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            Utils.showAlert('Failed to check for updates. Please try again later.', 'error');
        }
    }
};
