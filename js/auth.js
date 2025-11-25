// Simple Password Protection for Admin Features
const AuthManager = {
    isAuthenticated: false,

    checkPassword(password) {
        const storedPassword = localStorage.getItem(DataManager.KEYS.ADMIN_PASSWORD) || DataManager.DEFAULT_SETTINGS.defaultAdminPassword;
        return password === storedPassword;
    },

    authenticate(password) {
        if (this.checkPassword(password)) {
            this.isAuthenticated = true;
            sessionStorage.setItem('gtes_authenticated', 'true');
            this.updateLogoutButton();
            return true;
        }
        return false;
    },

    isAuth() {
        if (this.isAuthenticated) {
            return true;
        }
        const sessionAuth = sessionStorage.getItem('gtes_authenticated');
        if (sessionAuth === 'true') {
            this.isAuthenticated = true;
            return true;
        }
        return false;
    },

    logout() {
        this.isAuthenticated = false;
        sessionStorage.removeItem('gtes_authenticated');
        this.updateLogoutButton();
    },

    updateLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            // Check auth state directly without calling isAuth() to avoid recursion
            const isAuth = this.isAuthenticated || sessionStorage.getItem('gtes_authenticated') === 'true';
            logoutBtn.style.display = isAuth ? 'block' : 'none';
        }
    },

    requireAuth(callback, options = {}) {
        const { forcePrompt = false, onCancel = null } = options;
        
        // Prevent multiple simultaneous auth requests
        const existingModal = document.getElementById('passwordModal');
        if (existingModal && existingModal.classList.contains('show')) {
            // Modal is already showing, don't show another one
            return;
        }

        if (!forcePrompt && this.isAuth()) {
            callback();
            return;
        }

        // Use Custom Modal
        const modalEl = document.getElementById('passwordModal');
        const inputEl = document.getElementById('modalPasswordInput');
        const submitBtn = document.getElementById('modalSubmitBtn');
        const formEl = document.getElementById('passwordForm');

        if (!modalEl || !inputEl || !submitBtn) {
            // Fallback if modal elements missing
            const password = prompt('Enter admin password to access this feature:');
            if (password && this.checkPassword(password)) {
                if (!forcePrompt) this.authenticate(password);
                callback();
            } else if (password) {
                alert('Incorrect password.');
            }
            return;
        }

        const modal = new bootstrap.Modal(modalEl);
        let authSuccessful = false;

        // Reset state
        inputEl.value = '';
        inputEl.classList.remove('is-invalid');
        modalEl.querySelector('.modal-content').classList.remove('shake-animation');

        const cleanup = () => {
            submitBtn.removeEventListener('click', handleAuth);
            if (formEl) {
                formEl.removeEventListener('submit', handleAuth);
            }
            inputEl.onkeydown = null;
        };

        const forceCleanup = () => {
            // FORCE CLEANUP: Manually remove backdrop and reset body style
            // This fixes the issue where the backdrop remains if the thread gets busy
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(backdrop => backdrop.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };

        const handleAuth = () => {
            const password = inputEl.value;
            if (this.checkPassword(password)) {
                authSuccessful = true;
                if (!forcePrompt) this.authenticate(password);

                // Wait for modal to fully hide before executing callback
                const onModalHidden = () => {
                    modalEl.removeEventListener('hidden.bs.modal', onModalHidden);
                    cleanup();
                    forceCleanup();

                    // Use setTimeout to ensure modal is completely removed from DOM
                    setTimeout(() => {
                        callback();
                    }, 100);
                };

                modalEl.addEventListener('hidden.bs.modal', onModalHidden, { once: true });
                modal.hide();
            } else {
                // Shake animation
                const content = modalEl.querySelector('.modal-content');
                content.classList.remove('shake-animation');
                void content.offsetWidth; // Trigger reflow
                content.classList.add('shake-animation');

                inputEl.classList.add('is-invalid');
                inputEl.value = '';
                inputEl.focus();
            }
        };

        // Handle modal dismissal (Cancel button, ESC key, etc.)
        const handleModalDismiss = () => {
            if (!authSuccessful) {
                cleanup();
                // Clean up backdrop immediately when dismissed without auth
                setTimeout(() => {
                    forceCleanup();
                    // Call onCancel callback if provided
                    if (onCancel && typeof onCancel === 'function') {
                        onCancel();
                    }
                }, 150);
            }
        };

        // Event Listeners
        submitBtn.addEventListener('click', handleAuth);
        
        if (formEl) {
            formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                handleAuth();
            });
        }

        // Handle Enter key
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAuth();
            }
        };

        // Listen for modal hide events (when cancelled/dismissed)
        const handleHide = () => {
            if (!authSuccessful) {
                // Modal is being hidden without successful auth
                handleModalDismiss();
            }
        };

        const handleHidden = () => {
            if (!authSuccessful) {
                // Ensure cleanup happens even if hide event didn't fire properly
                handleModalDismiss();
            }
        };

        modalEl.addEventListener('hide.bs.modal', handleHide, { once: true });
        modalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });

        modal.show();

        // Focus input after modal shows
        modalEl.addEventListener('shown.bs.modal', () => {
            inputEl.focus();
        }, { once: true });
    },

    changePassword(oldPassword, newPassword) {
        if (!this.checkPassword(oldPassword)) {
            return { success: false, message: 'Current password is incorrect' };
        }
        if (!newPassword || newPassword.length < 4) {
            return { success: false, message: 'New password must be at least 4 characters' };
        }
        localStorage.setItem(DataManager.KEYS.ADMIN_PASSWORD, newPassword);
        return { success: true, message: 'Password changed successfully' };
    }
};

