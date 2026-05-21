/**
 * Update Checker Module
 * Checks for application updates and notifies users
 */
const UpdateChecker = {
    /** Keep in sync with package.json — web + fallback label. */
    APP_VERSION: '1.3.39',

    /**
     * Version string for UI: packaged Electron uses app.getVersion(); web uses APP_VERSION.
     */
    getDisplayVersion() {
        return this._resolvedDisplayVersion || this.APP_VERSION;
    },

    /**
     * Fill #loginVersionText, #footerAppVersion, [data-app-version], copyright year. Call on DOM ready.
     */
    applyVersionLabels() {
        const v = this.getDisplayVersion();
        const loginEl = document.getElementById('loginVersionText');
        if (loginEl) loginEl.textContent = `VERSION ${v}`;
        const foot = document.getElementById('footerAppVersion');
        if (foot) foot.textContent = `Version ${v}`;
        document.querySelectorAll('[data-app-version-label]').forEach((el) => {
            el.textContent = (el.getAttribute('data-app-version-prefix') || '') + v;
        });
        const y = document.getElementById('copyrightYear');
        if (y) y.textContent = String(new Date().getFullYear());

        this._tryResolveElectronVersion();
    },

    _tryResolveElectronVersion() {
        const api = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.updater;
        if (!api || typeof api.getVersion !== 'function') return;
        api.getVersion().then((info) => {
            const ev = info && (info.version || info);
            if (!ev) return;
            this._resolvedDisplayVersion = String(ev);
            const loginEl = document.getElementById('loginVersionText');
            if (loginEl) loginEl.textContent = `VERSION ${this._resolvedDisplayVersion}`;
            const foot = document.getElementById('footerAppVersion');
            if (foot) foot.textContent = `Version ${this._resolvedDisplayVersion}`;
        }).catch(() => {});
    },
    
    /**
     * Get current application version
     */
    getCurrentVersion() {
        return this.getDisplayVersion();
    },

    /**
     * Check for updates (manual check for now)
     * In future, this could call an online API/file for version info
     */
    checkForUpdates() {
        return {
            updateAvailable: false,
            latestVersion: this.getDisplayVersion(),
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
        document.getElementById('currentVersion').textContent = this.getCurrentVersion();
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
        document.getElementById('upToDateVersion').textContent = this.getCurrentVersion();
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

// Run as soon as this file loads: login #loginVersionText is above the script bundle.
UpdateChecker.applyVersionLabels();
