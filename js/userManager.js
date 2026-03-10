// User Management Module
const UserManager = {
    STORAGE_KEY: 'gtes_users',
    SESSION_KEY: 'gtes_current_user',

    // User roles
    ROLES: {
        ADMIN: 'admin',
        USER: 'user'
    },

    // Default Permissions
    PERMISSIONS: {
        VIEW_DASHBOARD: 'VIEW_DASHBOARD',
        MANAGE_EMPLOYEES: 'MANAGE_EMPLOYEES',
        MANAGE_ATTENDANCE: 'MANAGE_ATTENDANCE',
        MANAGE_SALARY: 'MANAGE_SALARY',
        VIEW_REPORTS: 'VIEW_REPORTS',
        MANAGE_SETTINGS: 'MANAGE_SETTINGS',
        MANAGE_USERS: 'MANAGE_USERS',
        MANAGE_HOLIDAYS: 'MANAGE_HOLIDAYS',
        MANAGE_ADVANCES: 'MANAGE_ADVANCES'
    },

    // Initialize users
    async init() {
        const users = await this.getUsers();

        // Create default admin if no users exist
        if (users.length === 0) {
            await this.createUser({
                username: 'admin',
                password: 'admin123',
                role: this.ROLES.ADMIN,
                fullName: 'Administrator',
                createdAt: new Date().toISOString(),
                permissions: Object.values(this.PERMISSIONS) // Admin gets all permissions
            });
            console.log('Default admin user created');
        } else {
            // Migration: Ensure all existing users have VIEW_DASHBOARD permission
            let updated = false;
            for (const user of users) {
                if (!user.permissions) {
                    user.permissions = [this.PERMISSIONS.VIEW_DASHBOARD];
                    updated = true;
                } else if (!user.permissions.includes(this.PERMISSIONS.VIEW_DASHBOARD)) {
                    user.permissions.push(this.PERMISSIONS.VIEW_DASHBOARD);
                    updated = true;
                }
            }

            if (updated) {
                await this.saveUsers(users);
                console.log('Migrated existing users to include VIEW_DASHBOARD permission');
            }
        }
    },

    // Get all users
    async getUsers() {
        const data = await DataManager.loadData(this.STORAGE_KEY);
        return data || [];
    },

    // Save users
    async saveUsers(users) {
        await DataManager.saveData(this.STORAGE_KEY, users);
    },

    // Create new user
    async createUser(userData) {
        const users = await this.getUsers();

        // Check if username already exists
        if (users.some(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }

        // Hash password if running in Electron
        let password = userData.password;
        if (window.electronAPI) {
            password = await window.electronAPI.hashPassword(password);
        }

        const newUser = {
            id: Date.now().toString(),
            username: userData.username,
            password: password,
            role: userData.role || this.ROLES.USER,
            fullName: userData.fullName || userData.username,
            permissions: userData.permissions || [this.PERMISSIONS.VIEW_DASHBOARD], // Default to VIEW_DASHBOARD at minimum
            createdAt: userData.createdAt || new Date().toISOString(),
            isActive: true
        };

        users.push(newUser);
        await this.saveUsers(users);
        return newUser;
    },

    // Authenticate user
    async authenticate(username, password) {
        const users = await this.getUsers();
        const user = users.find(u => u.username === username && u.isActive);

        if (user) {
            let isValid = false;

            if (window.electronAPI) {
                // Use secure verification
                isValid = await window.electronAPI.verifyPassword(password, user.password);

                // Auto-migrate plain text password to hash
                if (isValid && !user.password.includes(':')) {
                    console.log('Migrating password to hash for user:', username);
                    user.password = await window.electronAPI.hashPassword(password);
                    await this.saveUsers(users);
                }
            } else {
                // Fallback for browser mode (plain text)
                isValid = user.password === password;
            }

            if (isValid) {
                // Store session
                await this.setCurrentUser(user);
                return {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        fullName: user.fullName,
                        permissions: user.permissions || []
                    }
                };
            }
        }

        return {
            success: false,
            message: 'Invalid username or password'
        };
    },

    // Set current logged-in user
    async setCurrentUser(user) {
        const sessionData = {
            id: user.id,
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            permissions: user.permissions || [],
            loginTime: new Date().toISOString()
        };
        // Use sessionStorage instead of file storage (clears when app/window closes)
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));

        // Also clear any legacy file-based session to prevent conflicts
        await DataManager.saveData(this.SESSION_KEY, null);
    },

    // Get current logged-in user
    async getCurrentUser() {
        // Try sessionStorage first
        const sessionData = sessionStorage.getItem(this.SESSION_KEY);
        if (sessionData) {
            return JSON.parse(sessionData);
        }

        // Fallback: Check if there's a legacy file session and migrate/clear it?
        // Actually, to enforce "ask for password", we should ignore file session or clear it.
        // Let's check anyway just in case of reload, but for "closed app" behavior, 
        // sessionStorage is key. 
        // To strictly follow "ask on open", we should NOT read from file.
        // But let's see if we need to clear the old file once.
        return null;
    },

    // Check if user is logged in
    async isLoggedIn() {
        const user = await this.getCurrentUser();
        return user !== null;
    },

    // Check if current user is admin
    async isAdmin() {
        const user = await this.getCurrentUser();
        return user && user.role === this.ROLES.ADMIN;
    },

    // Check if user has specific permission
    async hasPermission(permission) {
        const user = await this.getCurrentUser();
        if (!user) return false;
        if (user.role === this.ROLES.ADMIN) return true; // Admin has all permissions
        return user.permissions && user.permissions.includes(permission);
    },

    // Logout
    async logout() {
        sessionStorage.removeItem(this.SESSION_KEY);
        // Ensure file storage is also clear
        await DataManager.saveData(this.SESSION_KEY, null);
    },

    // Update user
    async updateUser(userId, updates) {
        const users = await this.getUsers();
        const index = users.findIndex(u => u.id === userId);

        if (index === -1) {
            throw new Error('User not found');
        }

        // If updating password, hash it
        if (updates.password && window.electronAPI) {
            updates.password = await window.electronAPI.hashPassword(updates.password);
        }

        users[index] = { ...users[index], ...updates };
        await this.saveUsers(users);
        return users[index];
    },

    // Delete user
    async deleteUser(userId) {
        const users = await this.getUsers();
        const filtered = users.filter(u => u.id !== userId);

        if (filtered.length === users.length) {
            throw new Error('User not found');
        }

        await this.saveUsers(filtered);
    },

    // Change password
    async changePassword(userId, oldPassword, newPassword) {
        const users = await this.getUsers();
        const user = users.find(u => u.id === userId);

        if (!user) {
            throw new Error('User not found');
        }

        // Verify old password
        let isOldValid = false;
        if (window.electronAPI) {
            isOldValid = await window.electronAPI.verifyPassword(oldPassword, user.password);
        } else {
            isOldValid = user.password === oldPassword;
        }

        if (!isOldValid) {
            throw new Error('Current password is incorrect');
        }

        // Hash new password
        if (window.electronAPI) {
            user.password = await window.electronAPI.hashPassword(newPassword);
        } else {
            user.password = newPassword;
        }

        await this.saveUsers(users);
        return true;
    },

    // Admin reset password
    async adminResetPassword(userId, newPassword) {
        const users = await this.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) throw new Error('User not found');

        // Hash new password
        if (window.electronAPI) {
            user.password = await window.electronAPI.hashPassword(newPassword);
        } else {
            user.password = newPassword;
        }

        await this.saveUsers(users);
        return true;
    },

    // Verify password (for re-authentication before sensitive changes)
    async verifyPassword(userId, password) {
        const users = await this.getUsers();
        const user = users.find(u => u.id === userId);

        if (!user) return false;

        if (window.electronAPI) {
            return await window.electronAPI.verifyPassword(password, user.password);
        } else {
            return user.password === password;
        }
    }
};
