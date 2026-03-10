// Authentication Manager - Integrates with UserManager
const AuthManager = {
    // Check if user is authenticated (logged in)
    isAuth() {
        // This is now handled by App.checkLoginStatus and UserManager
        return sessionStorage.getItem('gtes_current_user') !== null;
    },

    // Logout
    async logout() {
        await UserManager.logout();
    },

    // Update logout button visibility
    updateLogoutButton() {
        // Handled in App.js
    },

    // Require Admin Authentication
    async requireAuth(callback, options = {}) {
        const isAdmin = await UserManager.isAdmin();

        if (isAdmin) {
            callback();
        } else {
            App.showNotification('Access denied. Admin privileges required.', 'error');
            if (options.onCancel) {
                options.onCancel();
            }
        }
    },

    // Legacy methods kept for compatibility but redirected
    checkPassword(password) {
        return false; // Deprecated
    },

    authenticate(password) {
        return false; // Deprecated
    },

    changePassword(oldPassword, newPassword) {
        // This is now handled by AdminModule calling UserManager directly
        return { success: false, message: 'Please use User Management to change passwords' };
    }
};


