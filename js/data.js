// localStorage Data Management Layer
const DataManager = {
    // Company Profile Constants
    COMPANY_PROFILE: {
        name: "Gas Tech Engineering Service",
        registeredAddress: "No.232/233, Nageshwara Road, Athipet, Chennai - 600058",
        workAddress: "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058",
        emails: ["gastechengservice@gmail.com", "rajmohan67raj@gmail.com"],
        phones: ["+91 96000 19839", "+91 95662 02896"],
        gstin: "33AFXPR3235A3ZF",
        pan: "AFXPR3235A",
        iec: "AFXPR3235A",
        bankDetails: {
            bankName: "Indian Overseas Bank",
            branch: "Nolambur",
            accountNo: "213902000002759",
            ifsc: "IOBA0002139"
        }
    },

    // Storage Keys
    KEYS: {
        EMPLOYEES: 'gtes_employees',
        ATTENDANCE: 'gtes_attendance',
        HOLIDAYS: 'gtes_holidays',
        ADVANCES: 'gtes_advances',
        BONUS_PAYOUTS: 'gtes_bonus_payouts',
        EMAIL_LOGS: 'gtes_email_logs',
        SETTINGS: 'gtes_settings',
        ADMIN_PASSWORD: 'gtes_admin_password',
        VOUCHERS: 'vouchers',
        EXPENSES: 'purchases',
        INVOICES: 'invoices',
        EXPENSE_CATEGORIES: 'gtes_expense_categories',
        ESTIMATES: 'gtes_estimates',
        PURCHASE_ORDERS: 'gtes_purchase_orders',
        RECURRING_INVOICES: 'gtes_recurring_invoices',
        // Book Keeper Integration Keys
        TAX_SCHEMES: 'gtes_tax_schemes',
        CHALLANS: 'gtes_challans',
        WAREHOUSES: 'gtes_warehouses',
        INVENTORY_ITEMS: 'gtes_inventory_items',
        ACCOUNTS: 'gtes_accounts',
        JOURNAL_ENTRIES: 'gtes_journal_entries',

        INVENTORY: 'inventory',
        // Raw Data Storage (Bookkeeper Import)
        IMPORT_COLUMNS: 'gtes_import_columns',
        IMPORT_RAW: 'gtes_import_raw'
    },

    // Default Settings
    DEFAULT_SETTINGS: {
        otRate: 200, // OT rate per hour (for fixed rate method)
        otCalculationMethod: 'salaryBased', // 'salaryBased' or 'fixedRate'
        sOtCalculationMethod: 'salaryBased8', // Standard OT: salary / 30 / 8 (fixed 30 days)
        hOtCalculationMethod: 'salaryBased8', // Holiday OT: salary / 30 / 8 (fixed 30 days)
        financialYearStart: 4, // April (month index 3, but we use 4 for April)
        defaultAdminPassword: 'admin123',
        // Track salary payout status per month (key: "year_monthIndex")
        salaryPayouts: {}
    },

    // Device ID for tracking changes (used for sync and audit)
    _deviceId: null,

    /**
     * Get or create a unique device ID
     * Stored in localStorage to persist across sessions
     */
    getDeviceId() {
        if (this._deviceId) return this._deviceId;

        let deviceId = localStorage.getItem('gtes_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
            localStorage.setItem('gtes_device_id', deviceId);
        }
        this._deviceId = deviceId;
        return deviceId;
    },

    /**
     * Add timestamp metadata to a record
     * @param {Object} record - The record to add metadata to
     * @returns {Object} - Record with updatedAt and updatedBy fields
     */
    addTimestamp(record) {
        if (!record || typeof record !== 'object') return record;

        return {
            ...record,
            updatedAt: new Date().toISOString(),
            updatedBy: this.getDeviceId()
        };
    },

    /**
     * Add timestamps to an array of records
     */
    addTimestamps(records) {
        if (!Array.isArray(records)) return records;
        return records.map(record => this.addTimestamp(record));
    },

    // Initialize data storage
    async init() {
        // Initialize FileStorage first
        const fileStorageEnabled = await FileStorage.init();

        if (fileStorageEnabled) {
            console.log('Using Dropbox file storage');
        } else {
            console.log('Using localStorage fallback');
        }

        // Initialize SyncManager (Phase 5)
        if (window.SyncManager) {
            window.SyncManager.init();
        }

        // Set default admin password if not exists
        const existingPassword = await this.loadData(this.KEYS.ADMIN_PASSWORD);
        if (!existingPassword) {
            await this.saveData(this.KEYS.ADMIN_PASSWORD, this.DEFAULT_SETTINGS.defaultAdminPassword);
        }

        // Initialize empty arrays if not exists
        if (!(await this.loadData(this.KEYS.EMPLOYEES))) {
            await this.saveData(this.KEYS.EMPLOYEES, []);
        }
        if (!(await this.loadData(this.KEYS.ATTENDANCE))) {
            await this.saveData(this.KEYS.ATTENDANCE, []);
        }
        if (!(await this.loadData(this.KEYS.HOLIDAYS))) {
            await this.saveData(this.KEYS.HOLIDAYS, []);
        }
        if (!(await this.loadData(this.KEYS.ADVANCES))) {
            await this.saveData(this.KEYS.ADVANCES, []);
        }
        if (!(await this.loadData(this.KEYS.BONUS_PAYOUTS))) {
            await this.saveData(this.KEYS.BONUS_PAYOUTS, []);
        }
        if (!(await this.loadData(this.KEYS.EMAIL_LOGS))) {
            await this.saveData(this.KEYS.EMAIL_LOGS, []);
        }
        if (!(await this.loadData(this.KEYS.SETTINGS))) {
            await this.saveData(this.KEYS.SETTINGS, this.DEFAULT_SETTINGS);
        }
        if (!(await this.loadData(this.KEYS.EXPENSES))) {
            await this.saveData(this.KEYS.EXPENSES, []);
        }
        if (!(await this.loadData(this.KEYS.EXPENSE_CATEGORIES))) {
            const defaultCategories = [
                { id: 'cat_rent', name: 'Rent', type: 'indirect' },
                { id: 'cat_salaries', name: 'Salaries', type: 'indirect' },
                { id: 'cat_utilities', name: 'Utilities/Bills', type: 'indirect' },
                { id: 'cat_purchase', name: 'Inventory Purchase', type: 'direct' },
                { id: 'cat_transport', name: 'Transportation', type: 'direct' },
                { id: 'cat_misc', name: 'Miscellaneous', type: 'indirect' }
            ];
            await this.saveData(this.KEYS.EXPENSE_CATEGORIES, defaultCategories);
        }
        if (!(await this.loadData(this.KEYS.ESTIMATES))) {
            await this.saveData(this.KEYS.ESTIMATES, []);
        }
        if (!(await this.loadData(this.KEYS.PURCHASE_ORDERS))) {
            await this.saveData(this.KEYS.PURCHASE_ORDERS, []);
        }
        if (!(await this.loadData(this.KEYS.RECURRING_INVOICES))) {
            await this.saveData(this.KEYS.RECURRING_INVOICES, []);
        }

        // Phase 2: Migrate employees to new schema
        await this.migrateEmployeesToV2();

        // Version 2.0: Migrate employees to add salary revisions
        await this.migrateToSalaryRevisions();

        // Auto-mark Sundays as Holiday for all active employees
        await this.autoMarkSundayHolidays();

        // Schedule auto-marking for midnight each day
        this.scheduleSundayHolidayCheck();
    },

    /**
     * Auto-mark all Sundays with "Holiday" status for active employees
     * This runs on app startup and at midnight
     */
    async autoMarkSundayHolidays() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Only mark if today is Sunday (day 0)
        if (today.getDay() !== 0) {
            console.log('Today is not Sunday, skipping auto-mark');
            return;
        }

        const todayStr = this.formatDate(today);
        console.log(`Today is Sunday (${todayStr}), checking for auto-mark...`);

        // Get all active employees
        const employees = await this.getActiveEmployees();
        if (!employees || employees.length === 0) {
            console.log('No active employees found');
            return;
        }

        // Get existing attendance
        const attendance = await this.getAttendance();
        let markedCount = 0;

        for (const employee of employees) {
            // Check if this employee already has an attendance record for today
            const existingRecord = attendance.find(a =>
                a.employee === employee.name &&
                this.formatDate(new Date(a.date)) === todayStr
            );

            if (existingRecord) {
                // Already marked, skip
                continue;
            }

            // Create a new "Holiday" attendance record
            const newRecord = {
                id: `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                employee: employee.name,
                date: today.toISOString(),
                status: 'Holiday',
                checkIn: '',
                checkOut: '',
                overTime: 'No',
                otHours: 0,
                holidayReason: 'Sunday',
                autoMarked: true, // Flag to indicate this was auto-marked
                ...this.addTimestamp({})
            };

            attendance.push(newRecord);
            markedCount++;
        }

        if (markedCount > 0) {
            await this.saveAttendance(attendance);
            console.log(`Auto-marked ${markedCount} employees as Holiday for Sunday (${todayStr})`);
        } else {
            console.log('All employees already have attendance records for today');
        }
    },

    /**
     * Schedule the Sunday holiday check to run at midnight each day
     */
    scheduleSundayHolidayCheck() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setDate(midnight.getDate() + 1); // Next day
        midnight.setHours(0, 0, 0, 0); // Midnight

        const msUntilMidnight = midnight.getTime() - now.getTime();

        console.log(`Scheduling Sunday holiday check for midnight (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);

        // Schedule for midnight
        setTimeout(async () => {
            console.log('Midnight reached, checking for Sunday auto-mark...');
            await this.autoMarkSundayHolidays();

            // Reschedule for next midnight
            this.scheduleSundayHolidayCheck();
        }, msUntilMidnight);
    },

    // Helper methods for storage operations
    async saveData(key, data) {
        // Update local cache first
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Error updating localStorage cache:', e);
        }

        // Phase 5: Check for conflicts before saving
        if (window.SyncManager) {
            const canProceed = await window.SyncManager.checkConflict(key);
            if (!canProceed) return false;
        }
        return await FileStorage.saveData(key, data);
    },

    async loadData(key) {
        const data = await FileStorage.loadData(key);
        if (data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.error('Error updating localStorage cache during load:', e);
            }
        }
        return data;
    },

    // Alias for loadData (used by delivery modules)
    getData(key) {
        // Note: This is synchronous wrapper - data should be cached already
        const data = localStorage.getItem(key);
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    },

    // Synchronous saveData wrapper for delivery modules  
    saveDataSync(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            // Also trigger async save for file storage
            this.saveData(key, value).catch(err => console.error('Async save error:', err));
            return true;
        } catch (e) {
            console.error('Save error:', e);
            return false;
        }
    },

    /**
     * Merge external data from Book Keeper Import
     * @param {string} key - DataManager KEY
     * @param {Array} newData - Array of new records
     * @param {string} idField - Field to identify uniqueness (default 'id')
     */
    async mergeBookKeeperData(key, newData, idField = 'id') {
        if (!newData || newData.length === 0) return;

        const currentData = (await this.loadData(key)) || [];
        let added = 0;
        let updated = 0;

        // Create a map of current data for faster lookup
        const currentMap = new Map(currentData.map(item => [item[idField], item]));

        for (const item of newData) {
            const existing = currentMap.get(item[idField]);

            if (existing) {
                // Update if changed (simplistic check, or just overwrite)
                // For now, we overwrite as Book Keeper is the source of truth for these
                Object.assign(existing, item, {
                    updatedAt: new Date().toISOString(),
                    syncSource: 'bookkeeper'
                });
                updated++;
            } else {
                // Add new
                const newItem = {
                    ...item,
                    createdAt: new Date().toISOString(),
                    syncSource: 'bookkeeper'
                };
                currentData.push(newItem);
                currentMap.set(item[idField], newItem);
                added++;
            }
        }

        if (added > 0 || updated > 0) {
            await this.saveData(key, currentData);
            console.log(`Merge complete for ${key}: ${added} added, ${updated} updated`);
        }
    },

    // Employee Operations
    async getEmployees() {
        const data = await this.loadData(this.KEYS.EMPLOYEES);
        return data || [];
    },

    async saveEmployees(employees) {
        await this.saveData(this.KEYS.EMPLOYEES, employees);
    },

    /**
     * Generate next employee ID
     * Format: emp_0001, emp_0002, etc.
     */
    async generateEmployeeId() {
        const employees = await this.getEmployees();

        // Find max ID number
        let maxId = 0;
        employees.forEach(emp => {
            if (emp.id && emp.id.startsWith('emp_')) {
                const idNum = parseInt(emp.id.substring(4));
                if (!isNaN(idNum) && idNum > maxId) {
                    maxId = idNum;
                }
            }
        });

        // Generate next ID
        const nextId = maxId + 1;
        return 'emp_' + String(nextId).padStart(4, '0');
    },

    /**
     * Migrate employees to Phase 2 schema (one-time)
     * Adds employee IDs and new fields with defaults
     */
    async migrateEmployeesToV2() {
        const employees = await this.getEmployees();
        if (employees.length === 0) return;

        let modified = false;

        // Sort by dateOfJoining for consistent ID assignment
        const sorted = [...employees].sort((a, b) => {
            const dateA = new Date(a.dateOfJoining);
            const dateB = new Date(b.dateOfJoining);
            return dateA - dateB;
        });

        sorted.forEach((emp, index) => {
            let empModified = false;

            // Add ID if missing
            if (!emp.id) {
                emp.id = 'emp_' + String(index + 1).padStart(4, '0');
                empModified = true;
            }

            // Add paymentMode if missing
            if (!emp.paymentMode) {
                emp.paymentMode = 'bank';
                empModified = true;
            }

            // Add bank object if missing
            if (!emp.bank) {
                emp.bank = {
                    beneficiaryName: "",
                    accountNo: "",
                    ifsc: "",
                    branchName: "",
                    address: ""
                };
                empModified = true;
            }

            // Add KYC fields if missing
            if (emp.pan === undefined) {
                emp.pan = "";
                empModified = true;
            }
            if (emp.aadhaar === undefined) {
                emp.aadhaar = "";
                empModified = true;
            }

            // Add address if missing
            if (!emp.address) {
                emp.address = {
                    permanent: "",
                    present: ""
                };
                empModified = true;
            }

            if (empModified) {
                modified = true;
            }
        });

        if (modified) {
            console.log('Migrating employees to Phase 2 schema...');
            await this.saveEmployees(sorted);
            console.log('Employee migration complete');
        }
    },

    async getActiveEmployees() {
        const employees = await this.getEmployees();
        const today = new Date();
        return employees.filter(emp => this.isActiveOnDate(emp, today));
    },

    /**
     * Check if an employee is active on a specific date
     * @param {Object} employee - Employee object with dateOfJoining and dateOfRelieving
     * @param {Date|string} date - Date to check (Date object or YYYY-MM-DD string)
     * @returns {boolean} - True if employee is active on that date
     * 
     * Rules:
     * - date >= dateOfJoining (midnight normalized)
     * - AND (dateOfRelieving == null OR date <= dateOfRelieving)
     */
    isActiveOnDate(employee, date) {
        if (!employee || !employee.dateOfJoining) {
            return false;
        }

        // Normalize date to midnight (remove time component)
        const checkDate = typeof date === 'string' ? new Date(date) : new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        // Parse joining date
        const doj = new Date(employee.dateOfJoining);
        doj.setHours(0, 0, 0, 0);

        // Check if date is before joining
        if (checkDate < doj) {
            return false;
        }

        // Check if employee has relieving date
        if (employee.dateOfRelieving) {
            const dor = new Date(employee.dateOfRelieving);
            dor.setHours(0, 0, 0, 0);

            // Employee is active only if check date is on or before relieving date
            return checkDate <= dor;
        }

        // No relieving date means employee is still active
        return true;
    },

    /**
     * Calculate overtime hours from checkin/checkout times
     * @param {string} checkin - Check-in time in HH:MM format
     * @param {string} checkout - Check-out time in HH:MM format
     * @param {boolean} isOnDuty - Whether this is duty time (default: true)
     * @param {number} shiftHours - Standard shift duration in hours (default: 9)
     * @returns {number} - Overtime hours (rounded to 2 decimals)
     * 
     * Rules:
     * - If either time missing → return 0
     * - If checkout <= checkin, assume overnight shift (add 24h to checkout)
     * - hoursWorked = (checkout - checkin) in hours
     * - if isOnDuty: OT = max(0, hoursWorked - shiftHours)
     * - else: OT = hoursWorked
     */
    calcOT(checkin, checkout, isOnDuty = true, shiftHours = 9) {
        // Return 0 if either time is missing
        if (!checkin || !checkout) {
            return 0;
        }

        try {
            // Parse times (HH:MM format)
            const [checkinHour, checkinMin] = checkin.split(':').map(Number);
            const [checkoutHour, checkoutMin] = checkout.split(':').map(Number);

            // Create Date objects for calculation (use same day as base)
            const baseDate = new Date(2000, 0, 1); // Arbitrary date
            const checkinTime = new Date(baseDate);
            checkinTime.setHours(checkinHour, checkinMin, 0, 0);

            let checkoutTime = new Date(baseDate);
            checkoutTime.setHours(checkoutHour, checkoutMin, 0, 0);

            // Handle overnight shift (checkout earlier than checkin)
            if (checkoutTime <= checkinTime) {
                checkoutTime.setDate(checkoutTime.getDate() + 1); // Add 24 hours
            }

            // Calculate hours worked
            const millisDiff = checkoutTime - checkinTime;
            const hoursWorked = millisDiff / (1000 * 60 * 60);

            // Calculate OT
            let otHours;
            if (isOnDuty) {
                // For duty: OT is hours beyond shift duration
                otHours = Math.max(0, hoursWorked - shiftHours);
            } else {
                // For non-duty (like holidays): all hours are OT
                otHours = hoursWorked;
            }

            // Round to 2 decimals
            return Math.round(otHours * 100) / 100;

        } catch (error) {
            console.error('Error calculating OT:', error);
            return 0;
        }
    },

    // Employees active on specific date
    async getEmployeesActiveOnDate(dateInput) {
        const targetDate = this.parseDate(dateInput) || new Date();
        const employees = await this.getEmployees();
        return employees.filter(emp => this.isActiveOnDate(emp, targetDate));
    },

    // Helper to parse dates robustly (handles YYYY-MM-DD, DD-MM-YYYY, etc.)
    parseDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return dateStr;

        // Try standard Date constructor first
        let date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;

        // Try DD-MM-YYYY or DD/MM/YYYY
        const parts = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (parts) {
            return new Date(parts[3], parts[2] - 1, parts[1]);
        }

        return null;
    },

    /**
     * Get Financial Year (April to March) from a date string
     * @param {string} dateStr 
     * @returns {string} Format: "2023-24"
     */
    getFinancialYear(dateInput, returnObject = false) {
        // If called without arguments, return current financial year object
        if (arguments.length === 0) {
            dateInput = new Date();
            returnObject = true;
        }

        let date = this.parseDate(dateInput);

        // If date is invalid or null, return empty string or null based on input
        if (!date || isNaN(date.getTime())) return dateInput ? '' : null;

        const year = date.getFullYear();
        const month = date.getMonth(); // 0-indexed, April is 3

        let startYear, endYear;
        if (month >= 3) {
            // April to Dec: current year - next year
            startYear = year;
            endYear = year + 1;
        } else {
            // Jan to March: prev year - current year
            startYear = year - 1;
            endYear = year;
        }

        const label = `${startYear}-${endYear.toString().slice(-2)}`;

        if (returnObject) {
            return {
                startYear,
                endYear,
                label
            };
        }

        return label;
    },

    // Get employees who were active during a specific month
    async getEmployeesActiveInMonth(year, month) {
        const employees = await this.getEmployees();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0); // Last day of month
        const attendance = await this.getAttendanceByMonth(year, month);
        const employeesWithAttendance = new Set(attendance.map(a => a.employee));

        return employees.filter(emp => {
            // Always include if they have attendance in this month
            if (employeesWithAttendance.has(emp.name)) return true;

            const doj = this.parseDate(emp.dateOfJoining);
            const dor = this.parseDate(emp.dateOfRelieving);

            // Employee is active in month if:
            // 1. They joined before or during the month (doj <= monthEnd)
            // 2. AND they haven't left OR they left after the month started (dor >= monthStart)

            if (!doj) return false; // Must have joining date

            const joinedBeforeOrDuringMonth = doj <= monthEnd;
            const leftAfterOrDuringMonth = !dor || dor >= monthStart;

            return joinedBeforeOrDuringMonth && leftAfterOrDuringMonth;
        });
    },

    /**
     * Add a salary revision record for an employee
     * @param {string} employeeName - Employee name
     * @param {number} newSalary - New salary amount
     * @param {string} reason - Reason for revision
     * @param {string} effectiveDate - Date when revision takes effect (YYYY-MM-DD)
     * @param {Object} employeeObj - Employee object (optional, for in-transaction updates)
     * @returns {Promise<boolean>} - Success status
     */
    async addSalaryRevision(employeeName, newSalary, reason, effectiveDate, employeeObj = null) {
        // Use provided employee object or fetch from database
        let employee = employeeObj;

        if (!employee) {
            const employees = await this.getEmployees();
            employee = employees.find(emp => emp.name === employeeName);
        }

        if (!employee) {
            console.error('Employee not found:', employeeName);
            return false;
        }

        // Initialize salaryRevisions array if it doesn't exist
        if (!employee.salaryRevisions) {
            employee.salaryRevisions = [];
        }

        // Get old salary
        const oldSalary = employee.baseSalary || 0;

        // Create revision record
        const revision = {
            id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: effectiveDate || new Date().toISOString().split('T')[0],
            oldSalary: oldSalary,
            newSalary: newSalary,
            reason: reason || 'Salary revision',
            changedBy: this.getDeviceId(),
            changedAt: new Date().toISOString()
        };

        // Add to revisions array
        employee.salaryRevisions.push(revision);

        // Update the base salary
        employee.baseSalary = newSalary;

        console.log(`Salary revision added for ${employeeName}: ₹${oldSalary} → ₹${newSalary}`);
        return true;
    },

    /**
     * Get all salary revisions for an employee
     * @param {string} employeeName - Employee name
     * @returns {Promise<Array>} - Array of revision records, sorted by date (newest first)
     */
    async getSalaryRevisionsForEmployee(employeeName) {
        const employees = await this.getEmployees();
        const employee = employees.find(emp => emp.name === employeeName);

        if (!employee || !employee.salaryRevisions) {
            return [];
        }

        // Sort by date, newest first
        return [...employee.salaryRevisions].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });
    },

    /**
     * Migrate employees to add salaryRevisions array (Version 2.0)
     * Creates initial revision entry if employee has existing salary
     */
    async migrateToSalaryRevisions() {
        const employees = await this.getEmployees();
        if (employees.length === 0) return;

        let modified = false;

        employees.forEach(emp => {
            // Add salaryRevisions array if missing
            if (!emp.salaryRevisions) {
                emp.salaryRevisions = [];

                // If employee has existing salary, create initial revision entry
                if (emp.baseSalary && emp.baseSalary > 0) {
                    emp.salaryRevisions.push({
                        id: 'rev_init_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        date: emp.dateOfJoining || new Date().toISOString().split('T')[0],
                        oldSalary: 0,
                        newSalary: emp.baseSalary,
                        reason: 'Initial salary',
                        changedBy: 'system',
                        changedAt: new Date().toISOString()
                    });
                }

                modified = true;
            }
        });

        if (modified) {
            console.log('Migrating employees to Version 2.0 (salary revisions)...');
            await this.saveEmployees(employees);
            console.log('Salary revisions migration complete');
        }
    },

    // Attendance Operations
    async getAttendance() {
        const data = await this.loadData(this.KEYS.ATTENDANCE);
        return Array.isArray(data) ? data : [];
    },

    async saveAttendance(attendance) {
        await this.saveData(this.KEYS.ATTENDANCE, attendance);
    },

    async getAttendanceByDateRange(startDate, endDate) {
        const attendance = await this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= startDate && recordDate <= endDate;
        });
    },

    async getAttendanceByMonth(year, month) {
        const attendance = await this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate.getFullYear() === year && recordDate.getMonth() === month;
        });
    },

    async getAttendanceByEmployee(employeeName, startDate, endDate) {
        const attendance = await this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return record.employee === employeeName &&
                recordDate >= startDate &&
                recordDate <= endDate;
        });
    },

    // Holiday Operations
    async getHolidays() {
        const data = await this.loadData(this.KEYS.HOLIDAYS);
        return data || [];
    },

    async saveHolidays(holidays) {
        await this.saveData(this.KEYS.HOLIDAYS, holidays);
    },

    async isHoliday(date) {
        const holidays = await this.getHolidays();
        const dateStr = this.formatDate(date);
        return holidays.some(h => this.formatDate(new Date(h.date)) === dateStr);
    },

    isSunday(date) {
        return date.getDay() === 0;
    },

    async getHolidayReason(date) {
        if (this.isSunday(date)) {
            return 'Sunday';
        }
        const holidays = await this.getHolidays();
        const dateStr = this.formatDate(date);
        const holiday = holidays.find(h => this.formatDate(new Date(h.date)) === dateStr);
        return holiday ? holiday.reason : '';
    },

    // Advance Operations
    async getAdvances() {
        const data = await this.loadData(this.KEYS.ADVANCES);
        return data || [];
    },

    async saveAdvances(advances) {
        await this.saveData(this.KEYS.ADVANCES, advances);
    },

    async getAdvancesByEmployee(employeeName, year, month) {
        const advances = await this.getAdvances();
        return advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            // If year is -1, return all advances for this employee
            if (year === -1) return true;

            const advDate = new Date(adv.date);
            return advDate.getFullYear() === year && advDate.getMonth() === month;
        });
    },

    // Get total advance for employee in a specific month (for display purposes)
    async getTotalAdvanceForEmployee(employeeName, year, month) {
        const advances = await this.getAdvancesByEmployee(employeeName, year, month);
        return advances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get total advance for employee in financial year
    async getTotalAdvanceForEmployeeFY(employeeName, year, month) {
        const fy = this.getFinancialYear(new Date(year, month, 1), true);
        const fyStartDate = new Date(fy.startYear, 3, 1); // April 1
        const fyEndDate = new Date(fy.endYear, 2, 31); // March 31

        const advances = await this.getAdvances();
        const fyAdvances = advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            const advDate = new Date(adv.date);
            return advDate >= fyStartDate && advDate <= fyEndDate;
        });

        return fyAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get total advance balance for employee (all time)
    async getTotalAdvanceBalance(employeeName) {
        const advances = await this.getAdvances();
        return advances
            .filter(adv => adv.employee === employeeName)
            .reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get cumulative debited advance amount for employee (up to a specific month)
    async getCumulativeDebitedAdvance(employeeName, year, month) {
        const settings = await this.getSettings();
        const debitedAdvances = settings.debitedAdvances || {};
        let totalDebited = 0;

        // Sum all debits up to and including the specified month
        for (const key of Object.keys(debitedAdvances)) {
            if (key.startsWith(`${employeeName}_`)) {
                const [empName, debYear, debMonth] = key.split('_');
                const debYearNum = parseInt(debYear);
                const debMonthNum = parseInt(debMonth);

                // Check if this debit is before or equal to the specified month
                if (debYearNum < year || (debYearNum === year && debMonthNum <= month)) {
                    // Only count if payout is done for that month
                    if (await this.isSalaryPayoutDone(debYearNum, debMonthNum)) {
                        totalDebited += parseFloat(debitedAdvances[key] || 0);
                    }
                }
            }
        }

        return totalDebited;
    },

    // Get debited advance amount for employee in a specific month
    async getDebitedAdvance(employeeName, year, month) {
        const settings = await this.getSettings();
        const debitedAdvances = settings.debitedAdvances || {};
        const key = `${employeeName}_${year}_${month}`;
        return parseFloat(debitedAdvances[key] || 0);
    },

    // Save debited advance amount
    async saveDebitedAdvance(employeeName, year, month, amount) {
        const settings = await this.getSettings();
        if (!settings.debitedAdvances) {
            settings.debitedAdvances = {};
        }
        const key = `${employeeName}_${year}_${month}`;
        settings.debitedAdvances[key] = amount;
        await this.saveSettings(settings);
    },

    // Save waived advance amount (Free Funds)
    async saveWaivedAdvance(employeeName, year, month, amount) {
        const settings = await this.getSettings();
        if (!settings.waivedAdvances) {
            settings.waivedAdvances = {};
        }
        const key = `${employeeName}_${year}_${month}`;
        settings.waivedAdvances[key] = amount;
        await this.saveSettings(settings);
    },

    // Get waived advance amount
    async getWaivedAdvance(employeeName, year, month) {
        const settings = await this.getSettings();
        const waivedAdvances = settings.waivedAdvances || {};
        const key = `${employeeName}_${year}_${month}`;
        return parseFloat(waivedAdvances[key] || 0);
    },

    // Get cumulative waived advance amount for employee (up to a specific month)
    async getCumulativeWaivedAdvance(employeeName, year, month) {
        const settings = await this.getSettings();
        const waivedAdvances = settings.waivedAdvances || {};
        let totalWaived = 0;

        // Sum all waivers up to and including the specified month
        Object.keys(waivedAdvances).forEach(key => {
            if (key.startsWith(`${employeeName}_`)) {
                const [empName, wavYear, wavMonth] = key.split('_');
                const wavYearNum = parseInt(wavYear);
                const wavMonthNum = parseInt(wavMonth);

                // Check if this waiver is before or equal to the specified month
                if (wavYearNum < year || (wavYearNum === year && wavMonthNum <= month)) {
                    totalWaived += parseFloat(waivedAdvances[key] || 0);
                }
            }
        });

        return totalWaived;
    },

    // Get remaining advance balance (total - cumulative debited - cumulative waived) for financial year
    async getRemainingAdvanceBalance(employeeName, year, month) {
        const fy = this.getFinancialYear();
        const fyStartYear = fy.startYear;
        const fyEndYear = fy.endYear;

        // Get all advances given in the current financial year (April to March)
        const fyStartDate = new Date(fyStartYear, 3, 1); // April 1
        const fyEndDate = new Date(fyEndYear, 2, 31); // March 31

        const advances = await this.getAdvances();
        const fyAdvances = advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            const advDate = new Date(adv.date);
            return advDate >= fyStartDate && advDate <= fyEndDate;
        });

        const totalFyAdvance = fyAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);

        // Get cumulative debited amount for the financial year up to the specified month
        const cumulativeDebited = await this.getCumulativeDebitedAdvance(employeeName, year, month);

        // Get cumulative waived amount for the financial year up to the specified month
        const cumulativeWaived = await this.getCumulativeWaivedAdvance(employeeName, year, month);

        // Calculate remaining balance for current FY
        const remainingFyBalance = Math.max(totalFyAdvance - cumulativeDebited - cumulativeWaived, 0);

        // If we're in a new financial year, check for carry forward from previous FY
        if (year > fyEndYear || (year === fyEndYear && month > 2)) {
            // We're in a new FY, need to check previous FY balance
            const prevFy = this.getFinancialYear(new Date(year, month, 1), true);
            const prevFyStartYear = prevFy.startYear;
            const prevFyEndYear = prevFy.endYear;

            // Get advances from previous FY
            const prevFyStartDate = new Date(prevFyStartYear, 3, 1);
            const prevFyEndDate = new Date(prevFyEndYear, 2, 31);

            const prevFyAdvances = advances.filter(adv => {
                if (adv.employee !== employeeName) return false;
                const advDate = new Date(adv.date);
                return advDate >= prevFyStartDate && advDate <= prevFyEndDate;
            });

            const totalPrevFyAdvance = prevFyAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);

            // Get debited amount for previous FY (up to March)
            const prevFyDebited = await this.getCumulativeDebitedAdvance(employeeName, prevFyEndYear, 2);

            // Get waived amount for previous FY (up to March)
            const prevFyWaived = await this.getCumulativeWaivedAdvance(employeeName, prevFyEndYear, 2);

            const prevFyRemaining = Math.max(totalPrevFyAdvance - prevFyDebited - prevFyWaived, 0);

            // Carry forward previous FY balance
            return remainingFyBalance + prevFyRemaining;
        }

        return remainingFyBalance;
    },



    // Settings Operations
    async getSettings() {
        const data = await this.loadData(this.KEYS.SETTINGS);
        const parsed = data || this.DEFAULT_SETTINGS;
        // Ensure new properties exist for backward compatibility
        if (!parsed.salaryPayouts) {
            parsed.salaryPayouts = {};
        }
        return parsed;
    },

    async saveSettings(settings) {
        await this.saveData(this.KEYS.SETTINGS, settings);
    },

    // Mark salary payout as completed for a specific month (year, monthIndex 0-11)


    // Cancel salary payout for a specific month for selected employees
    async cancelSalaryPayout(year, month, employeeNames) {
        const settings = await this.getSettings();
        const key = `${year}_${month}`;

        // 1. Remove debited advances for selected employees
        if (settings.debitedAdvances) {
            employeeNames.forEach(empName => {
                const k = `${empName}_${year}_${month}`;
                if (settings.debitedAdvances[k]) {
                    delete settings.debitedAdvances[k];
                }
            });
        }

        // 2. Remove waived advances for selected employees
        if (settings.waivedAdvances) {
            employeeNames.forEach(empName => {
                const k = `${empName}_${year}_${month}`;
                if (settings.waivedAdvances[k]) {
                    delete settings.waivedAdvances[k];
                }
            });
        }

        // 3. Update Payout record
        if (settings.salaryPayouts && settings.salaryPayouts[key]) {
            const payout = settings.salaryPayouts[key];

            // Remove from employee list
            if (Array.isArray(payout.employees)) {
                payout.employees = payout.employees.filter(name => !employeeNames.includes(name));
            }

            // Remove from individualPayouts
            if (payout.individualPayouts) {
                employeeNames.forEach(name => {
                    delete payout.individualPayouts[name];
                });
            }

            // Re-calculate totalPaid
            if (payout.individualPayouts) {
                payout.totalPaid = Object.values(payout.individualPayouts).reduce((sum, val) => sum + val, 0);
            } else {
                // Fallback for legacy records
                payout.totalPaid = 0;
            }

            // Re-calculate 'done' status
            const activeEmployees = await this.getEmployeesActiveInMonth(year, month);
            const monthlyEmployees = activeEmployees.filter(emp => (emp.salaryType || 'monthly') === 'monthly');
            const allMonthlyPaid = monthlyEmployees.length > 0 && monthlyEmployees.every(emp => payout.employees.includes(emp.name));

            payout.done = allMonthlyPaid;

            // If NO employees left, just remove the whole record
            if (payout.employees.length === 0) {
                delete settings.salaryPayouts[key];
            }
        }

        await this.saveSettings(settings);
        console.log(`Canceled salary payout for ${employeeNames.length} employees in ${year}-${month}`);
    },

    // Check if salary payout is completed for a specific month
    async isSalaryPayoutDone(year, month) {
        const settings = await this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        const record = payouts[key];
        return !!(record && record.done);
    },

    // Check if ANY employee has a salary payout for the month
    async hasAnySalaryPayout(year, month) {
        const settings = await this.getSettings();

        // Check debited advances
        if (settings.debitedAdvances) {
            const hasDebits = Object.keys(settings.debitedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasDebits) return true;
        }

        // Check waived advances
        if (settings.waivedAdvances) {
            const hasWaivers = Object.keys(settings.waivedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasWaivers) return true;
        }

        return false;
    },

    // Get salary payout details for a specific month
    async getSalaryPayoutDetails(year, month) {
        const settings = await this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        return payouts[key] || null;
    },

    async getOTRate() {
        const settings = await this.getSettings();
        return settings.otRate || this.DEFAULT_SETTINGS.otRate;
    },

    // Utility Functions
    /**
     * Validate IFSC code format
     * Format: First 4 alpha, 5th is 0, last 6 alphanumeric
     * Example: SBIN0001234
     */
    validateIFSC(ifsc) {
        if (!ifsc) return { valid: false, message: "IFSC code is required" };
        const pattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        if (!pattern.test(ifsc)) {
            return { valid: false, message: "Invalid IFSC format (e.g., SBIN0001234)" };
        }
        return { valid: true };
    },

    /**
     * Validate PAN number format
     * Format: 5 alpha, 4 numeric, 1 alpha
     * Example: ABCDE1234F
     */
    validatePAN(pan) {
        if (!pan) return { valid: true }; // PAN is optional
        const pattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
        if (!pattern.test(pan)) {
            return { valid: false, message: "Invalid PAN format (e.g., ABCDE1234F)" };
        }
        return { valid: true };
    },

    /**
     * Validate Aadhaar number
     * Format: 12 digits
     */
    validateAadhaar(aadhaar) {
        if (!aadhaar) return { valid: true }; // Aadhaar is optional
        const pattern = /^[0-9]{12}$/;
        if (!pattern.test(aadhaar)) {
            return { valid: false, message: "Aadhaar must be exactly 12 digits" };
        }
        return { valid: true };
    },

    /**
     * Validate employee bank details (when paymentMode = 'bank')
     */
    validateBankDetails(employee) {
        if (employee.paymentMode !== 'bank') {
            return { valid: true }; // Bank details not required for cash/cheque
        }

        const errors = [];
        const bank = employee.bank || {};

        if (!bank.beneficiaryName || !bank.beneficiaryName.trim()) {
            errors.push("Beneficiary name is required for bank payment");
        }
        if (!bank.accountNo || !bank.accountNo.trim()) {
            errors.push("Account number is required for bank payment");
        }
        if (!bank.branchName || !bank.branchName.trim()) {
            errors.push("Branch name is required for bank payment");
        }
        if (!bank.address || !bank.address.trim()) {
            errors.push("Bank branch address is required for bank payment");
        }

        // Validate IFSC
        const ifscValidation = this.validateIFSC(bank.ifsc);
        if (!ifscValidation.valid) {
            errors.push(ifscValidation.message);
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    formatDateDisplay(date) {
        if (!date) return '';
        const d = new Date(date);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    },

    formatMonthYear(year, month) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[month]}-${year}`;
    },

    // Format time from 24h to 12h AM/PM format
    formatTimeDisplay(time24) {
        if (!time24) return '-';
        const [hour, minute] = time24.split(':').map(Number);
        let displayHour = hour;
        let period = 'AM';

        if (hour === 0) {
            displayHour = 12;
            period = 'AM';
        } else if (hour === 12) {
            displayHour = 12;
            period = 'PM';
        } else if (hour > 12) {
            displayHour = hour - 12;
            period = 'PM';
        }

        return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
    },

    parseMonthYear(monthYearStr) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const parts = monthYearStr.split('-');
        if (parts.length !== 2) return null;
        const month = months.indexOf(parts[0]);
        const year = parseInt(parts[1]);
        if (month === -1 || isNaN(year)) return null;
        return { year, month };
    },



    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },

    // Generate time slots (30-minute intervals) with AM/PM
    generateTimeSlots() {
        const slots = [];
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                let displayHour = hour;
                let period = 'AM';

                if (hour === 0) {
                    displayHour = 12;
                    period = 'AM';
                } else if (hour === 12) {
                    displayHour = 12;
                    period = 'PM';
                } else if (hour > 12) {
                    displayHour = hour - 12;
                    period = 'PM';
                }

                const timeStr24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                const timeStr12 = `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
                slots.push({ value: timeStr24, display: timeStr12 });
            }
        }
        return slots;
    },

    // Calculate hours between two times (supports overnight, handles 24h format)
    calculateHours(checkIn, checkOut) {
        if (!checkIn || !checkOut) return 0;

        // Parse time - handle both 24h format (HH:MM) and 12h format (H:MM AM/PM)
        let inHour, inMin, outHour, outMin;

        // Check if it's 12h format (contains AM/PM)
        if (checkIn.includes('AM') || checkIn.includes('PM')) {
            const inParts = checkIn.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (inParts) {
                inHour = parseInt(inParts[1]);
                inMin = parseInt(inParts[2]);
                const inPeriod = inParts[3].toUpperCase();
                if (inPeriod === 'PM' && inHour !== 12) inHour += 12;
                if (inPeriod === 'AM' && inHour === 12) inHour = 0;
            } else return 0;
        } else {
            [inHour, inMin] = checkIn.split(':').map(Number);
        }

        if (checkOut.includes('AM') || checkOut.includes('PM')) {
            const outParts = checkOut.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (outParts) {
                outHour = parseInt(outParts[1]);
                outMin = parseInt(outParts[2]);
                const outPeriod = outParts[3].toUpperCase();
                if (outPeriod === 'PM' && outHour !== 12) outHour += 12;
                if (outPeriod === 'AM' && outHour === 12) outHour = 0;
            } else return 0;
        } else {
            [outHour, outMin] = checkOut.split(':').map(Number);
        }

        let inMinutes = inHour * 60 + inMin;
        let outMinutes = outHour * 60 + outMin;

        // Handle overnight shift
        if (outMinutes < inMinutes) {
            outMinutes += 24 * 60; // Add 24 hours
        }

        return (outMinutes - inMinutes) / 60;
    },

    // Calculate OT Hours based on new rules
    calculateOTHours(workedHours, status, overTime, isHoliday = false, isSunday = false) {
        // Rule 0: If Over-Time is "H-Working" - Full worked hours as OT (Holiday Working)
        // This takes priority - working on holiday means full hours count as OT
        if (overTime === 'H-Working' || overTime === 'Holiday working') {
            return workedHours; // Full hours for holiday working
        }

        // Rule 0.5: If Over-Time is explicitly "No", return 0 (except for H-Working status)
        // UPDATE: Even for H-Working, if OT is "No", it should be 0 OT (but will be double pay in salary calc)
        if (overTime === 'No') {
            return 0;
        }

        // Rule 1: Unpaid Leave / Paid Leave / Sick Leave / Holiday (not working) - OT = 0
        if (status === 'Unpaid Leave' || status === 'Paid Leave' || status === 'Sick Leave' || (status === 'Holiday' && overTime !== 'H-Working')) {
            return 0;
        }

        // Rule 2: Working on Holiday or Sunday (H-Working status)
        if (status === 'H-Working' || (isHoliday && status === 'Present') || (isSunday && status === 'Present')) {
            // If OT is "Yes", calculate as normal working day (Total - 9)
            if (overTime === 'Yes') {
                return Math.max(workedHours - 9, 0);
            }
            // If OT is "H-Working" (handled above) -> Full hours
            // If OT is "No" (handled above) -> 0

            // Default fallback if OT not specified but status is H-Working:
            // Assume full hours if not specified? Or assume normal rules?
            // Let's assume full hours for backward compatibility if OT is undefined,
            // BUT if OT is explicitly "Yes", we use the new rule.
            return workedHours;
        }

        // Rule 3: Half Day - Normally 0, but can have OT if extra hours (4.5 hours is half day)
        if (status === 'Half Day') {
            // Only calculate OT if overTime is not "No"
            if (overTime === 'No') {
                return 0;
            }
            const halfDayHours = 4.5;
            return Math.max(workedHours - halfDayHours, 0);
        }

        // Rule 4: Normal working day - OT = MAX(Worked Hours - 9, 0)
        if (status === 'Present') {
            if (overTime === 'Yes') {
                return Math.max(workedHours - 9, 0);
            }
            // If overTime is "No", return 0
            if (overTime === 'No') {
                return 0;
            }
            // If overTime is not explicitly set, still calculate if hours > 9 (for backward compatibility)
            return Math.max(workedHours - 9, 0);
        }

        return 0;
    },

    // Calculate Per Hour Salary for OT Pay calculation
    // Always uses fixed 30 days for OT rate calculation
    calculatePerHourSalary(baseSalary, salaryType = 'monthly') {
        let perDaySalary;

        if (salaryType === 'daily') {
            perDaySalary = baseSalary;
        } else {
            // Monthly salary divided by fixed 30 days for OT calculation
            perDaySalary = baseSalary / 30;
        }

        // Per hour salary = Per day salary ÷ 8 hours
        return perDaySalary / 8;
    },

    calculateHWorkingPerHour(perDaySalary) {
        if (!perDaySalary) return 0;
        return perDaySalary / 9;
    },

    // Calculate OT Pay based on selected method
    // OT rate always uses fixed 30 days for monthly employees
    calculateOTPay(otHours, baseSalary, salaryType = 'monthly', options = {}) {
        const {
            hWorkingOtHours = 0,
            sOtHours = 0,
            returnBreakdown = false
        } = options;

        if (otHours <= 0) {
            return returnBreakdown ? {
                totalPay: 0,
                standardHours: 0,
                standardRate: 0,
                standardPay: 0,
                hWorkingHours: 0,
                hWorkingRate: 0,
                hWorkingPay: 0,
                sOtHours: 0,
                sOtRate: 0,
                sOtPay: 0
            } : 0;
        }

        const standardOtHours = Math.max(otHours - hWorkingOtHours - sOtHours, 0);
        // Use provided settings or fall back to defaults (cannot await here as function is sync)
        const settings = options.settings || this.DEFAULT_SETTINGS;
        const sOtMethod = settings.otCalculationMethod || 'salaryBased8'; // Use S-OT method for standard OT too

        // OT rate ALWAYS uses fixed 30 days, not actual days in month
        const daySalary = salaryType === 'daily' ? baseSalary : baseSalary / 30;

        // Standard OT uses S-OT calculation method
        let standardRate = 0;
        if (standardOtHours > 0) {
            if (sOtMethod === 'fixedRate') {
                standardRate = settings.otRate || this.DEFAULT_SETTINGS.otRate;
            } else if (sOtMethod === 'salaryBased9') {
                standardRate = daySalary / 9;
            } else {
                standardRate = daySalary / 8;
            }
        }
        const standardPay = standardOtHours * standardRate;

        // H-OT Calculation Logic
        const hOtMethod = settings.hOtCalculationMethod || 'salaryBased8'; // Default to /8
        let hWorkingRate = 0;

        if (hWorkingOtHours > 0) {
            if (hOtMethod === 'fixedRate') {
                // Use the same fixed rate as normal OT
                hWorkingRate = settings.otRate || this.DEFAULT_SETTINGS.otRate;
            } else if (hOtMethod === 'salaryBased9') {
                // Salary / 30 / 9
                hWorkingRate = daySalary / 9;
            } else {
                // Default: salaryBased8 (Salary / 30 / 8)
                hWorkingRate = daySalary / 8;
            }
        }

        const hWorkingPay = hWorkingOtHours * hWorkingRate;

        // S-OT Calculation Logic (reuse sOtMethod from above)
        let sOtRate = 0;

        if (sOtHours > 0) {
            if (sOtMethod === 'fixedRate') {
                sOtRate = settings.otRate || this.DEFAULT_SETTINGS.otRate;
            } else if (sOtMethod === 'salaryBased9') {
                sOtRate = daySalary / 9;
            } else {
                sOtRate = daySalary / 8;
            }
        }

        const sOtPay = sOtHours * sOtRate;

        const totalPay = standardPay + hWorkingPay + sOtPay;

        if (returnBreakdown) {
            return {
                totalPay,
                standardHours: standardOtHours,
                standardRate,
                standardPay,
                hWorkingHours: hWorkingOtHours,
                hWorkingRate,
                hWorkingPay,
                sOtHours,
                sOtRate,
                sOtPay
            };
        }

        return totalPay;
    },

    // Get OT calculation method
    getOTCalculationMethod() {
        const settings = this.getSettings();
        return settings.otCalculationMethod || this.DEFAULT_SETTINGS.otCalculationMethod;
    },

    // Export all data for backup
    exportAllData() {
        return {
            employees: this.getEmployees(),
            attendance: this.getAttendance(),
            holidays: this.getHolidays(),
            advances: this.getAdvances(),
            settings: this.getSettings(),
            exportDate: new Date().toISOString()
        };
    },

    // Import data from backup
    importData(data) {
        if (data.employees) this.saveEmployees(data.employees);
        if (data.attendance) this.saveAttendance(data.attendance);
        if (data.holidays) this.saveHolidays(data.holidays);
        if (data.advances) this.saveAdvances(data.advances);
        if (data.settings) this.saveSettings(data.settings);
    },

    // ========================================
    // PHASE 3: Salary Payout Tracking
    // ========================================

    /**
     * Check if salary payout has been done for a specific month
     * @param {number} year - The year
     * @param {number} month - The month (0-11)
     * @returns {Promise<boolean>} True if payout is done
     */
    async isSalaryPayoutDone(year, month) {
        const settings = await this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        return payouts[key]?.done === true;
    },

    /**
     * Check if ANY salary payout exists for a specific month (even if partial)
     * @param {number} year - The year
     * @param {number} month - The month (0-11)
     * @returns {Promise<boolean>} True if any payout exists
     */
    async hasAnySalaryPayout(year, month) {
        const settings = await this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        // Return true if the record exists and has employees
        return !!(payouts[key] && payouts[key].employees && payouts[key].employees.length > 0);
    },

    /**
     * Get salary payout details for a specific month
     * @param {number} year - The year
     * @param {number} month - The month (0-11)
     * @returns {Promise<Object|null>} Payout details or null
     */
    async getSalaryPayoutDetails(year, month) {
        const settings = await this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        return payouts[key] || null;
    },

    /**
     * Mark salary payout as done for a specific month
     * @param {number} year - The year
     * @param {number} month - The month (0-11)
     * @param {Object} details - Payout details
     */
    async markSalaryPayoutDone(year, month, details) {
        const settings = await this.getSettings();
        if (!settings.salaryPayouts) {
            settings.salaryPayouts = {};
        }

        const key = `${year}_${month}`;
        const existing = settings.salaryPayouts[key] || {
            done: false,
            employees: [],
            individualPayouts: {},
            totalPaid: 0
        };

        // Merge employees (avoid duplicates)
        const newEmployees = details.employees || [];
        const mergedEmployees = [...new Set([...(existing.employees || []), ...newEmployees])];

        // Store individual payouts for accurate total tracking
        if (!existing.individualPayouts) existing.individualPayouts = {};

        // We can't easily know individual amounts from the old 'totalPaid' if 'individualPayouts' was missing
        // So we update what we have.
        if (details.payoutData && Array.isArray(details.payoutData)) {
            // If full payout data provided, use it to update individual mapping
            details.payoutData.forEach(item => {
                existing.individualPayouts[item.name] = item.netSalary || 0;
            });
        } else if (details.employees && details.totalPaid != null && details.employees.length === 1) {
            // If only one employee provided, we can map it
            existing.individualPayouts[details.employees[0]] = details.totalPaid;
        }

        // Re-calculate totalPaid from individual mapping if possible
        const totalPaid = Object.values(existing.individualPayouts).reduce((sum, val) => sum + val, 0) || details.totalPaid || existing.totalPaid;

        // Check if all Monthly employees are paid
        const activeEmployees = await this.getEmployeesActiveInMonth(year, month);
        const monthlyEmployees = activeEmployees.filter(emp => (emp.salaryType || 'monthly') === 'monthly');
        const allMonthlyPaid = monthlyEmployees.length > 0 && monthlyEmployees.every(emp => mergedEmployees.includes(emp.name));

        settings.salaryPayouts[key] = {
            done: allMonthlyPaid,
            creditDate: details.creditDate || existing.creditDate || null,
            generatedAt: new Date().toISOString(),
            employees: mergedEmployees,
            individualPayouts: existing.individualPayouts,
            totalPaid: totalPaid
        };

        await this.saveSettings(settings);
        console.log(`Updated salary payout for ${year}-${month}. Done: ${allMonthlyPaid}`);
    },

    /**
     * Check if a specific employee has been paid in a month
     */
    async isEmployeePaidInMonth(employeeName, year, month) {
        const details = await this.getSalaryPayoutDetails(year, month);
        if (!details) return false;
        if (Array.isArray(details.employees)) {
            return details.employees.includes(employeeName);
        }
        return details.done === true;
    },

    /**
     * Validate bank details for all employees with bank payment mode
     * @param {Array} employees - Array of employee objects
     * @returns {Object} Validation result with errors array
     */
    validateBankDetailsForPayout(employees) {
        const errors = [];

        employees.forEach(emp => {
            if (emp.paymentMode === 'bank') {
                const validation = this.validateBankDetails(emp);
                if (!validation.valid) {
                    errors.push({
                        employee: emp.name,
                        errors: validation.errors
                    });
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    // Bonus Payout Operations
    async getBonusPayouts() {
        const data = await this.loadData(this.KEYS.BONUS_PAYOUTS);
        return data || [];
    },

    async saveBonusPayouts(payouts) {
        await this.saveData(this.KEYS.BONUS_PAYOUTS, payouts);
    },

    // Email Log Operations
    async getEmailLogs() {
        const data = await this.loadData(this.KEYS.EMAIL_LOGS);
        return data || [];
    },

    async saveEmailLog(log) {
        const logs = await this.getEmailLogs();
        logs.push(this.addTimestamp(log));
        await this.saveData(this.KEYS.EMAIL_LOGS, logs);
    }

};

// --- New Managers for BookKeeper Integration ---

const ExpenseManager = {
    getAllExpenses() {
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('gtes_expenses') || [];
        const allVouchers = DataManager.getData(DataManager.KEYS.VOUCHERS) || [];
        return expenses;
    },

    getAllCategories() {
        return DataManager.getData(DataManager.KEYS.EXPENSE_CATEGORIES) || [];
    },

    saveExpense(expense) {
        const expenses = this.getAllExpenses();
        if (expense.id) {
            const index = expenses.findIndex(e => e.id === expense.id);
            if (index !== -1) {
                expenses[index] = { ...expenses[index], ...expense, updatedAt: new Date().toISOString() };
            }
        } else {
            expense.id = 'exp_' + Date.now();
            expense.createdAt = new Date().toISOString();
            expenses.push(expense);
        }
        return DataManager.saveDataSync(DataManager.KEYS.EXPENSES, expenses);
    },

    deleteExpense(id) {
        const expenses = this.getAllExpenses().filter(e => e.id !== id);
        return DataManager.saveDataSync(DataManager.KEYS.EXPENSES, expenses);
    },

    addCategory(name, type = 'indirect') {
        const categories = this.getAllCategories();
        const newCat = {
            id: 'cat_' + Date.now(),
            name,
            type
        };
        categories.push(newCat);
        return DataManager.saveDataSync(DataManager.KEYS.EXPENSE_CATEGORIES, categories);
    },

    // Get total expenses between dates
    getTotalExpenses(startDate, endDate) {
        const expenses = this.getAllExpenses();
        return expenses
            .filter(e => {
                const d = new Date(e.date);
                return d >= startDate && d <= endDate;
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    },

    // Get expenses by category for a period
    getExpensesByCategory(startDate, endDate) {
        const expenses = this.getAllExpenses();
        const categoryMap = {};

        expenses.forEach(e => {
            const d = new Date(e.date);
            if (d >= startDate && d <= endDate) {
                const cat = e.category || 'Uncategorized';
                categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(e.amount) || 0);
            }
        });

        return categoryMap;
    }
};

const EstimateManager = {
    getAllEstimates() {
        return DataManager.getData(DataManager.KEYS.ESTIMATES) || [];
    },

    getEstimate(id) {
        return this.getAllEstimates().find(e => e.id === id);
    },

    saveEstimate(estimate) {
        const estimates = this.getAllEstimates();
        if (estimate.id) {
            const index = estimates.findIndex(e => e.id === estimate.id);
            if (index !== -1) {
                estimates[index] = { ...estimates[index], ...estimate, updatedAt: new Date().toISOString() };
            }
        } else {
            estimate.id = this.generateEstimateNumber();
            estimate.createdAt = new Date().toISOString();
            estimate.status = 'pending'; // pending, accepted, rejected, converted
            estimates.push(estimate);
        }
        return DataManager.saveDataSync(DataManager.KEYS.ESTIMATES, estimates);
    },

    deleteEstimate(id) {
        const estimates = this.getAllEstimates().filter(e => e.id !== id);
        return DataManager.saveDataSync(DataManager.KEYS.ESTIMATES, estimates);
    },

    generateEstimateNumber() {
        const estimates = this.getAllEstimates();
        const currentYear = new Date().getFullYear();
        const count = estimates.filter(e => e.id.startsWith(`EST-${currentYear}`)).length + 1;
        return `EST-${currentYear}-${String(count).padStart(3, '0')}`;
    },

    updateStatus(id, status) {
        const estimates = this.getAllEstimates();
        const index = estimates.findIndex(e => e.id === id);
        if (index !== -1) {
            estimates[index].status = status;
            return DataManager.saveDataSync(DataManager.KEYS.ESTIMATES, estimates);
        }
        return false;
    }
};

const RecurringInvoiceManager = {
    getAll() {
        return DataManager.getData(DataManager.KEYS.RECURRING_INVOICES) || [];
    },

    save(recurring) {
        const list = this.getAll();
        if (recurring.id) {
            const index = list.findIndex(r => r.id === recurring.id);
            if (index !== -1) list[index] = { ...list[index], ...recurring, updatedAt: new Date().toISOString() };
        } else {
            recurring.id = 'rec_' + Date.now();
            recurring.createdAt = new Date().toISOString();
            recurring.lastGenerated = null;
            list.push(recurring);
        }
        return DataManager.saveDataSync(DataManager.KEYS.RECURRING_INVOICES, list);
    },

    delete(id) {
        const list = this.getAll().filter(r => r.id !== id);
        return DataManager.saveDataSync(DataManager.KEYS.RECURRING_INVOICES, list);
    },

    // Check and generate due invoices
    async checkAndGenerate() {
        const list = this.getAll();
        const today = new Date();
        const generated = [];

        for (const rec of list) {
            if (rec.status !== 'active') return;

            let shouldGenerate = false;
            const lastRun = rec.lastGenerated ? new Date(rec.lastGenerated) : null;
            const nextRun = lastRun ? new Date(lastRun) : new Date(rec.startDate);

            // Simple logic: if nextRun <= today
            if (rec.frequency === 'monthly') {
                if (!lastRun || (today.getMonth() !== lastRun.getMonth())) {
                    // Check if today is past the day-of-month
                    if (today.getDate() >= new Date(rec.startDate).getDate()) {
                        shouldGenerate = true;
                    }
                }
            }

            if (shouldGenerate) {
                console.log('Generating recurring invoice for:', rec.customerName);

                if (typeof window.InvoiceManager !== 'undefined') {
                    try {
                        const newInv = {
                            type: 'without-bill',
                            customerName: rec.customerName,
                            date: today.toISOString().split('T')[0],
                            items: [{
                                description: 'Recurring Service - ' + rec.frequency,
                                quantity: 1,
                                unit: 'service',
                                rate: rec.amount,
                                amount: rec.amount
                            }],
                            subtotal: rec.amount,
                            total: rec.amount,
                            status: 'pending'
                        };

                        await window.InvoiceManager.createInvoice(newInv);
                        console.log('Invoice created successfully');

                        rec.lastGenerated = today.toISOString();
                        generated.push(rec);
                    } catch (err) {
                        console.error('Error generating recurring invoice:', err);
                    }
                } else {
                    console.warn('InvoiceManager not available');
                }
            }
        }

        if (generated.length > 0) {
            this.saveAll(list);
        }
        return generated;
    },

    saveAll(list) {
        return DataManager.saveDataSync(DataManager.KEYS.RECURRING_INVOICES, list);
    }
};

// Initialize on load
DataManager.init();
