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
        // Fast path for login UX: prefer already-cached users first.
        const cached = DataManager.getData(this.STORAGE_KEY);
        const cachedNorm = typeof DataManager._normalizeGtesUsersPayload === 'function'
            ? DataManager._normalizeGtesUsersPayload(cached)
            : cached;
        if (Array.isArray(cachedNorm) && cachedNorm.length > 0) {
            return cachedNorm;
        }

        const data = await DataManager.loadData(this.STORAGE_KEY);
        const norm = typeof DataManager._normalizeGtesUsersPayload === 'function'
            ? DataManager._normalizeGtesUsersPayload(data)
            : data;
        return Array.isArray(norm) ? norm : [];
    },

    // Save users
    async saveUsers(users) {
        const ok = await DataManager.saveData(this.STORAGE_KEY, users, { skipPreSaveMerge: true });
        if (ok === false) {
            throw new Error('Could not save user changes due to sync conflict. Please sync and retry.');
        }
    },

    // Create new user
    async createUser(userData) {
        const users = await this.getUsers();

        // Check if username already exists
        if (users.some(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }

        // Hash password if running in Electron, otherwise store plain for web
        let password = userData.password;
        let webPassword = null;
        if (window.electronAPI) {
            password = await window.electronAPI.hashPassword(userData.password);
            // Don't store plain text in Electron mode (security)
        } else {
            // Browser/PWA mode: store plain text password as webPassword
            webPassword = userData.password;
        }

        const newUser = {
            id: Date.now().toString(),
            username: userData.username,
            password: password,
            webPassword: webPassword, // Plain text for PWA login
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
        const uq = (username || '').trim();
        const user = users.find(u =>
            u &&
            (u.username || '').trim().toLowerCase() === uq.toLowerCase() &&
            u.isActive !== false
        );

        if (user) {
            let isValid = false;
            const storedPass = user.password != null && user.password !== undefined
                ? String(user.password)
                : '';

            if (window.electronAPI) {
                try {
                    isValid = await window.electronAPI.verifyPassword(password, storedPass);
                } catch (e) {
                    console.error('verifyPassword IPC error:', e);
                    isValid = false;
                }

                // Auto-migrate plain text password (from Web/PWA) to hash in Electron
                if (isValid && storedPass && !storedPass.includes(':')) {
                    console.log('Migrating password to hash for user:', username);
                    user.password = await window.electronAPI.hashPassword(password);
                    user.webPassword = password; // Ensure we keep a web-compatible plain version
                    await this.saveUsers(users);
                }
            } else {
                // Browser/PWA mode: verify using plain text webPassword or fallback to plain password field
                const webPass = user.webPassword != null && user.webPassword !== '' ? String(user.webPassword) : null;
                
                if (webPass !== null) {
                    isValid = webPass === password;
                } else if (storedPass && storedPass.includes(':')) {
                    // It's a hash, need Web Crypto
                    if (!globalThis.crypto || !globalThis.crypto.subtle) {
                        return {
                            success: false,
                            message: 'Use https:// or localhost — secure login requires Web Crypto (desktop app works without this).'
                        };
                    }
                    try {
                        isValid = await UserManager.verifyPasswordBrowser(password, storedPass);
                    } catch (e) {
                        console.error('PBKDF2 verify error:', e);
                        isValid = false;
                    }
                } else if (storedPass) {
                    // Fallback: If no webPassword but password field is plain text
                    isValid = storedPass === password;
                }

                // Auto-migration: If login was valid but webPassword field was missing, populate it now
                if (isValid && webPass === null) {
                    console.log('Auto-populating webPassword for user:', username);
                    user.webPassword = password;
                    await this.saveUsers(users);
                }
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
        // Do not block login on legacy file-session cleanup.
        try { localStorage.removeItem(this.SESSION_KEY); } catch (e) { }
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
        try { localStorage.removeItem(this.SESSION_KEY); } catch (e) { }
    },

    // Update user
    async updateUser(userId, updates) {
        const users = await this.getUsers();
        const index = users.findIndex(u => u.id === userId);

        if (index === -1) {
            throw new Error('User not found');
        }

        // If changing username, check it's not already taken by another user
        if (updates.username && updates.username !== users[index].username) {
            if (users.some(u => u.id !== userId && u.username === updates.username)) {
                throw new Error('Username already exists. Please choose a different username.');
            }
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
        const targetId = String(userId);
        const filtered = users.filter(u => String(u?.id) !== targetId);

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

        // Hash new password for desktop, store plain for web
        if (window.electronAPI) {
            user.password = await window.electronAPI.hashPassword(newPassword);
            user.webPassword = newPassword; // Keep web access in sync
        } else {
            user.password = newPassword;
            user.webPassword = newPassword;
        }

        await this.saveUsers(users);
        return true;
    },

    // Admin reset password
    async adminResetPassword(userId, newPassword) {
        const users = await this.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) throw new Error('User not found');

        // Hash new password for desktop, store plain for web
        if (window.electronAPI) {
            user.password = await window.electronAPI.hashPassword(newPassword);
            user.webPassword = newPassword; // Keep web access in sync
        } else {
            user.password = newPassword;
            user.webPassword = newPassword;
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
    },

    // Browser-side PBKDF2 verification (matches Electron's crypto.pbkdf2 algorithm)
    // Algorithm: PBKDF2, SHA-512, 1000 iterations, 64 bytes, salt:hash format
    async verifyPasswordBrowser(password, storedHash) {
        try {
            if (!storedHash || typeof storedHash !== 'string') return false;
            const ci = storedHash.indexOf(':');
            if (ci <= 0 || ci >= storedHash.length - 1) return false;
            const saltHex = storedHash.slice(0, ci);
            const originalHashHex = storedHash.slice(ci + 1);
            if (!saltHex || !originalHashHex) return false;

            // Node/Electron crypto.pbkdf2(password, salt, ...) encodes string salt as UTF-8 — must match here.
            const enc = new TextEncoder();
            const salt = enc.encode(saltHex);

            // Import the password as a key
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                enc.encode(password),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );

            // Derive the key using same parameters as Electron (PBKDF2, SHA-512, 1000 iter, 64 bytes)
            const derivedBits = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 1000,
                    hash: 'SHA-512'
                },
                keyMaterial,
                512 // 64 bytes = 512 bits
            );

            // Convert derived bits to hex string
            const derivedHex = Array.from(new Uint8Array(derivedBits))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            return derivedHex === originalHashHex;
        } catch (e) {
            console.error('Browser PBKDF2 verification error:', e);
            return false;
        }
    }
};
