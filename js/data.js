// localStorage Data Management Layer
const DataManager = {
    // Company Profile Constants
    COMPANY_PROFILE: {
        name: "Gas Tech Engineering Service",
        registeredAddress: "No.232/233, Nageshwara Road, Athipet, Chennai – 600058",
        workAddress: "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai – 600058",
        emails: ["gastechengservice@gmail.com", "rajmohan67raj@gmail.com"],
        phones: ["+91 96000 19839", "+91 95662 02896"],
        gstin: "33AFXPR3235A3ZF",
        pan: "AFXPR3235A",
        iec: "AFXPR3235A"
    },

    // Storage Keys
    KEYS: {
        EMPLOYEES: 'gtes_employees',
        ATTENDANCE: 'gtes_attendance',
        HOLIDAYS: 'gtes_holidays',
        ADVANCES: 'gtes_advances',
        SETTINGS: 'gtes_settings',
        ADMIN_PASSWORD: 'gtes_admin_password'
    },

    // Default Settings
    DEFAULT_SETTINGS: {
        otRate: 200, // OT rate per hour (for fixed rate method)
        otCalculationMethod: 'salaryBased', // 'salaryBased' or 'fixedRate'
        sOtCalculationMethod: 'salaryBased8', // Standard OT: salary / 30 / 8
        hOtCalculationMethod: 'salaryBased8', // Holiday OT: salary / 30 / 8
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
        if (!(await this.loadData(this.KEYS.SETTINGS))) {
            await this.saveData(this.KEYS.SETTINGS, this.DEFAULT_SETTINGS);
        }

        // Phase 2: Migrate employees to new schema
        await this.migrateEmployeesToV2();

        // Version 2.0: Migrate employees to add salary revisions
        await this.migrateToSalaryRevisions();
    },

    // Helper methods for storage operations
    async saveData(key, data) {
        // Phase 5: Check for conflicts before saving
        if (window.SyncManager) {
            const canProceed = await window.SyncManager.checkConflict(key);
            if (!canProceed) return false;
        }
        return await FileStorage.saveData(key, data);
    },

    async loadData(key) {
        return await FileStorage.loadData(key);
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
        return data || [];
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
        const fy = this.getFinancialYearForDate(new Date(year, month, 1));
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
            const prevFy = this.getFinancialYearForDate(new Date(year, month, 1));
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

    // Get financial year for a specific date
    getFinancialYearForDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth();

        if (month >= 3) { // April to December
            return { startYear: year, endYear: year + 1 };
        } else { // January to March
            return { startYear: year - 1, endYear: year };
        }
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
    async markSalaryPayoutDone(year, month, creditDate = null) {
        const settings = await this.getSettings();
        if (!settings.salaryPayouts) {
            settings.salaryPayouts = {};
        }
        const key = `${year}_${month}`;
        settings.salaryPayouts[key] = {
            done: true,
            timestamp: new Date().toISOString(),
            creditDate: creditDate
        };
        await this.saveSettings(settings);
    },

    // Cancel salary payout for a specific month for selected employees
    async cancelSalaryPayout(year, month, employeeNames) {
        const settings = await this.getSettings();

        // 1. Remove debited advances for selected employees
        if (settings.debitedAdvances) {
            employeeNames.forEach(empName => {
                const key = `${empName}_${year}_${month}`;
                if (settings.debitedAdvances[key]) {
                    delete settings.debitedAdvances[key];
                }
            });
        }

        // 2. Remove waived advances for selected employees
        if (settings.waivedAdvances) {
            employeeNames.forEach(empName => {
                const key = `${empName}_${year}_${month}`;
                if (settings.waivedAdvances[key]) {
                    delete settings.waivedAdvances[key];
                }
            });
        }

        // 3. For daily-paid employees, we need to handle accumulated months
        // Get all employees to check their salary types
        const allEmployees = await this.getEmployees();
        const canceledDailyEmployees = employeeNames.filter(empName => {
            const emp = allEmployees.find(e => e.name === empName);
            return emp && emp.salaryType === 'daily';
        });

        // 4. Check if ANY data remains for this month (from other employees)
        let hasData = false;

        if (settings.debitedAdvances) {
            const hasDebits = Object.keys(settings.debitedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasDebits) hasData = true;
        }

        if (!hasData && settings.waivedAdvances) {
            const hasWaivers = Object.keys(settings.waivedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasWaivers) hasData = true;
        }

        // 5. If canceling daily employees OR no data remains, remove payout status
        if (settings.salaryPayouts) {
            const key = `${year}_${month}`;

            // Remove if:
            // a) No advance data remains for ANY employee, OR
            // b) Only daily employees were canceled (their accumulated months need to be freed)
            if (!hasData || canceledDailyEmployees.length > 0) {
                delete settings.salaryPayouts[key];
            }
        }

        await this.saveSettings(settings);
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

    getFinancialYear(date = new Date()) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12
        if (month >= 4) {
            return { startYear: year, endYear: year + 1 };
        } else {
            return { startYear: year - 1, endYear: year };
        }
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
    calculatePerHourSalary(baseSalary, salaryType = 'monthly') {
        let perDaySalary;

        if (salaryType === 'daily') {
            perDaySalary = baseSalary;
        } else {
            // Monthly salary divided by 30 days
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
    calculateOTPay(otHours, baseSalary, salaryType = 'monthly', options = {}) {
        const {
            hWorkingOtHours = 0,
            sOtHours = 0,
            perDaySalary = null,
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

        let daySalary = perDaySalary;
        if (daySalary == null) {
            daySalary = salaryType === 'daily' ? baseSalary : baseSalary / 30;
        }

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
        settings.salaryPayouts[key] = {
            done: true,
            creditDate: details.creditDate || null,
            generatedAt: new Date().toISOString(),
            employees: details.employees || [],
            totalPaid: details.totalPaid || 0
        };

        await this.saveSettings(settings);
        console.log(`Marked salary payout as done for ${year}-${month}`);
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
    }

};

// Initialize on load
DataManager.init();
