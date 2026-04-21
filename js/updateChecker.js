/**
 * Update Checker Module
 * Checks for application updates and notifies users
 */
const UpdateChecker = {
    APP_VERSION: '1.3.21', // Match package.json version
    
    /**
     * Get current application version
     */
    getCurrentVersion() {
        return this.APP_VERSION;
    },

    /**
     * Check for updates (manual check for now)
     * In future, this could call an online API/file for version info
     */
    checkForUpdates() {
        return {
            updateAvailable: false,
            latestVersion: this.APP_VERSION,
            releaseNotes: 'The desktop app checks GitHub Releases automatically on startup. An "Update ready" button appears in the top navbar for every user when a new version is downloaded.',
            downloadUrl: 'https://github.com/leemurali089-pixel/Attendance-GTES/releases/latest'
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
