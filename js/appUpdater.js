/**
 * Global auto-update client (non-admin safe).
 *
 * Runs for every user the moment the app boots, not just admins.
 * Shows a small "Update ready" button in the top navbar whenever a
 * new version becomes available and lets the user restart to install
 * without needing access to the Admin panel.
 *
 * Power users still get the full status/progress card on
 * Admin > Application Version (wired by `AdminModule._wireAppUpdateCard`).
 */
const AppUpdater = {
    _bound: false,
    _modalEl: null,
    _modal: null,
    _state: 'idle', // idle | checking | available | downloading | downloaded | not-available | error
    _latestInfo: null,
    _progress: 0,

    init() {
        if (this._bound) return;
        const api = window.electronAPI && window.electronAPI.updater;
        if (!api) return; // web / non-Electron: silently no-op
        this._bound = true;

        const btn = document.getElementById('navUpdateBtn');
        if (btn) btn.onclick = () => this.openModal();

        if (typeof api.onEvent === 'function') {
            api.onEvent((data) => this._handleEvent(data));
        }

        if (typeof api.getState === 'function') {
            api.getState().then((st) => {
                if (st && st.lastEvent) this._handleEvent(st.lastEvent);
            }).catch(() => {});
        }
    },

    _handleEvent(data) {
        if (!data || !data.type) return;
        switch (data.type) {
            case 'checking-for-update':
                this._state = 'checking';
                break;
            case 'update-available':
                this._state = 'downloading';
                this._latestInfo = data.info || null;
                this._progress = 0;
                this._showIndicator('Downloading update…');
                if (typeof App !== 'undefined' && App.showNotification) {
                    const v = (data.info && data.info.version) ? `v${data.info.version}` : 'a new version';
                    App.showNotification(`Downloading ${v} in the background…`, 'info');
                }
                break;
            case 'update-not-available':
                this._state = 'not-available';
                this._hideIndicator();
                break;
            case 'download-progress':
                this._state = 'downloading';
                this._progress = (data.progress && data.progress.percent) || 0;
                this._showIndicator(`Downloading ${this._progress.toFixed(0)}%`);
                this._refreshModalIfOpen();
                break;
            case 'update-downloaded':
                this._state = 'downloaded';
                this._latestInfo = data.info || this._latestInfo;
                this._showIndicator('Update ready');
                if (typeof App !== 'undefined' && App.showNotification) {
                    const v = (this._latestInfo && this._latestInfo.version) ? `v${this._latestInfo.version}` : 'A new version';
                    App.showNotification(`${v} is ready. Click "Update ready" in the top bar to restart and install.`, 'success');
                }
                this._refreshModalIfOpen();
                break;
            case 'error':
                this._state = 'error';
                this._hideIndicator();
                break;
        }
    },

    _showIndicator(label) {
        const wrap = document.getElementById('navUpdateIndicator');
        const lbl = document.getElementById('navUpdateBtnLabel');
        if (wrap) wrap.classList.remove('d-none');
        if (lbl && label) lbl.textContent = label;
    },

    _hideIndicator() {
        const wrap = document.getElementById('navUpdateIndicator');
        if (wrap) wrap.classList.add('d-none');
    },

    _ensureModal() {
        if (this._modalEl) return this._modalEl;
        const html = `
            <div class="modal fade" id="appUpdateModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-arrow-down-circle"></i> Application Update</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-1"><strong>Current version:</strong> <span id="appUpdateModalCurrent">—</span></p>
                            <p class="mb-3"><strong>New version:</strong> <span id="appUpdateModalLatest">—</span></p>
                            <div id="appUpdateModalStatus" class="small text-muted mb-2">—</div>
                            <div class="progress d-none" id="appUpdateModalProgress" style="height: 8px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Later</button>
                            <button type="button" class="btn btn-success d-none" id="appUpdateModalInstallBtn">
                                <i class="bi bi-arrow-clockwise"></i> Restart &amp; Install
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const holder = document.createElement('div');
        holder.innerHTML = html;
        document.body.appendChild(holder.firstElementChild);
        this._modalEl = document.getElementById('appUpdateModal');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            this._modal = new bootstrap.Modal(this._modalEl);
        }
        const installBtn = document.getElementById('appUpdateModalInstallBtn');
        if (installBtn) {
            installBtn.onclick = async () => {
                installBtn.disabled = true;
                const api = window.electronAPI && window.electronAPI.updater;
                if (api && typeof api.install === 'function') await api.install();
            };
        }
        return this._modalEl;
    },

    async openModal() {
        this._ensureModal();
        const api = window.electronAPI && window.electronAPI.updater;
        let current = '';
        try {
            const v = api && typeof api.getVersion === 'function' ? await api.getVersion() : null;
            current = (v && v.version) || '';
        } catch {}
        const el = (id) => document.getElementById(id);
        if (el('appUpdateModalCurrent')) el('appUpdateModalCurrent').textContent = current || '—';
        this._refreshModalIfOpen(true);
        if (this._modal) this._modal.show();
    },

    _refreshModalIfOpen(force) {
        if (!this._modalEl) return;
        if (!force && !this._modalEl.classList.contains('show')) return;
        const el = (id) => document.getElementById(id);
        const latestV = this._latestInfo && this._latestInfo.version;
        if (el('appUpdateModalLatest')) el('appUpdateModalLatest').textContent = latestV ? `v${latestV}` : '—';
        const status = el('appUpdateModalStatus');
        const installBtn = el('appUpdateModalInstallBtn');
        const prog = el('appUpdateModalProgress');
        const bar = prog && prog.querySelector('.progress-bar');
        if (!status) return;
        switch (this._state) {
            case 'downloading':
                status.className = 'small text-primary mb-2';
                status.textContent = `Downloading in background (${this._progress.toFixed(0)}%)…`;
                if (prog) prog.classList.remove('d-none');
                if (bar) bar.style.width = this._progress + '%';
                if (installBtn) installBtn.classList.add('d-none');
                break;
            case 'downloaded':
                status.className = 'small text-success mb-2';
                status.textContent = 'Ready to install. Click "Restart & Install" to apply the update now. The app will close and reopen automatically.';
                if (prog) prog.classList.add('d-none');
                if (installBtn) installBtn.classList.remove('d-none');
                break;
            case 'not-available':
                status.className = 'small text-success mb-2';
                status.textContent = 'You are already on the latest version.';
                if (prog) prog.classList.add('d-none');
                if (installBtn) installBtn.classList.add('d-none');
                break;
            case 'error':
                status.className = 'small text-danger mb-2';
                status.textContent = 'Update error. Please try again later.';
                if (prog) prog.classList.add('d-none');
                if (installBtn) installBtn.classList.add('d-none');
                break;
            default:
                status.className = 'small text-muted mb-2';
                status.textContent = 'Checking for updates…';
                if (prog) prog.classList.add('d-none');
                if (installBtn) installBtn.classList.add('d-none');
        }
    }
};

if (typeof window !== 'undefined') {
    window.AppUpdater = AppUpdater;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AppUpdater.init());
    } else {
        AppUpdater.init();
    }
}
