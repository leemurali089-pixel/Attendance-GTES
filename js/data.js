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
        financialYearStart: 4, // April (month index 3, but we use 4 for April)
        defaultAdminPassword: 'admin123',
        // Track salary payout status per month (key: "year_monthIndex")
        salaryPayouts: {}
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
    },

    // Helper methods for storage operations
    async saveData(key, data) {
        return await FileStorage.saveData(key, data);
    },

    async loadData(key) {
        return await FileStorage.loadData(key);
    },

    // Employee Operations
    getEmployees() {
        return JSON.parse(localStorage.getItem(this.KEYS.EMPLOYEES) || '[]');
    },

    saveEmployees(employees) {
        localStorage.setItem(this.KEYS.EMPLOYEES, JSON.stringify(employees));
    },

    getActiveEmployees() {
        const employees = this.getEmployees();
        const today = new Date();
        return employees.filter(emp => {
            const doj = new Date(emp.dateOfJoining);
            const dor = emp.dateOfRelieving ? new Date(emp.dateOfRelieving) : null;
            return doj <= today && (!dor || dor >= today);
        });
    },

    // Employees active on specific date
    getEmployeesActiveOnDate(dateInput) {
        const targetDate = this.parseDate(dateInput) || new Date();
        const employees = this.getEmployees();
        return employees.filter(emp => {
            const doj = this.parseDate(emp.dateOfJoining);
            const dor = emp.dateOfRelieving ? this.parseDate(emp.dateOfRelieving) : null;
            if (!doj) return false;
            return doj <= targetDate && (!dor || dor >= targetDate);
        });
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
    getEmployeesActiveInMonth(year, month) {
        const employees = this.getEmployees();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0); // Last day of month
        const attendance = this.getAttendanceByMonth(year, month);
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

    // Attendance Operations
    getAttendance() {
        return JSON.parse(localStorage.getItem(this.KEYS.ATTENDANCE) || '[]');
    },

    saveAttendance(attendance) {
        localStorage.setItem(this.KEYS.ATTENDANCE, JSON.stringify(attendance));
    },

    getAttendanceByDateRange(startDate, endDate) {
        const attendance = this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= startDate && recordDate <= endDate;
        });
    },

    getAttendanceByMonth(year, month) {
        const attendance = this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate.getFullYear() === year && recordDate.getMonth() === month;
        });
    },

    getAttendanceByEmployee(employeeName, startDate, endDate) {
        const attendance = this.getAttendance();
        return attendance.filter(record => {
            const recordDate = new Date(record.date);
            return record.employee === employeeName &&
                recordDate >= startDate &&
                recordDate <= endDate;
        });
    },

    // Holiday Operations
    getHolidays() {
        return JSON.parse(localStorage.getItem(this.KEYS.HOLIDAYS) || '[]');
    },

    saveHolidays(holidays) {
        localStorage.setItem(this.KEYS.HOLIDAYS, JSON.stringify(holidays));
    },

    isHoliday(date) {
        const holidays = this.getHolidays();
        const dateStr = this.formatDate(date);
        return holidays.some(h => this.formatDate(new Date(h.date)) === dateStr);
    },

    isSunday(date) {
        return date.getDay() === 0;
    },

    getHolidayReason(date) {
        if (this.isSunday(date)) {
            return 'Sunday';
        }
        const holidays = this.getHolidays();
        const dateStr = this.formatDate(date);
        const holiday = holidays.find(h => this.formatDate(new Date(h.date)) === dateStr);
        return holiday ? holiday.reason : '';
    },

    // Advance Operations
    getAdvances() {
        return JSON.parse(localStorage.getItem(this.KEYS.ADVANCES) || '[]');
    },

    saveAdvances(advances) {
        localStorage.setItem(this.KEYS.ADVANCES, JSON.stringify(advances));
    },

    getAdvancesByEmployee(employeeName, year, month) {
        const advances = this.getAdvances();
        return advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            // If year is -1, return all advances for this employee
            if (year === -1) return true;

            const advDate = new Date(adv.date);
            return advDate.getFullYear() === year && advDate.getMonth() === month;
        });
    },

    // Get total advance for employee in a specific month (for display purposes)
    getTotalAdvanceForEmployee(employeeName, year, month) {
        const advances = this.getAdvancesByEmployee(employeeName, year, month);
        return advances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get total advance for employee in financial year
    getTotalAdvanceForEmployeeFY(employeeName, year, month) {
        const fy = this.getFinancialYearForDate(new Date(year, month, 1));
        const fyStartDate = new Date(fy.startYear, 3, 1); // April 1
        const fyEndDate = new Date(fy.endYear, 2, 31); // March 31

        const advances = this.getAdvances();
        const fyAdvances = advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            const advDate = new Date(adv.date);
            return advDate >= fyStartDate && advDate <= fyEndDate;
        });

        return fyAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get total advance balance for employee (all time)
    getTotalAdvanceBalance(employeeName) {
        const advances = this.getAdvances();
        return advances
            .filter(adv => adv.employee === employeeName)
            .reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
    },

    // Get cumulative debited advance amount for employee (up to a specific month)
    getCumulativeDebitedAdvance(employeeName, year, month) {
        const settings = this.getSettings();
        const debitedAdvances = settings.debitedAdvances || {};
        let totalDebited = 0;

        // Sum all debits up to and including the specified month
        Object.keys(debitedAdvances).forEach(key => {
            if (key.startsWith(`${employeeName}_`)) {
                const [empName, debYear, debMonth] = key.split('_');
                const debYearNum = parseInt(debYear);
                const debMonthNum = parseInt(debMonth);

                // Check if this debit is before or equal to the specified month
                if (debYearNum < year || (debYearNum === year && debMonthNum <= month)) {
                    // Only count if payout is done for that month
                    if (this.isSalaryPayoutDone(debYearNum, debMonthNum)) {
                        totalDebited += parseFloat(debitedAdvances[key] || 0);
                    }
                }
            }
        });

        return totalDebited;
    },

    // Get debited advance amount for employee in a specific month
    getDebitedAdvance(employeeName, year, month) {
        const settings = this.getSettings();
        const debitedAdvances = settings.debitedAdvances || {};
        const key = `${employeeName}_${year}_${month}`;
        return parseFloat(debitedAdvances[key] || 0);
    },

    // Save debited advance amount
    saveDebitedAdvance(employeeName, year, month, amount) {
        const settings = this.getSettings();
        if (!settings.debitedAdvances) {
            settings.debitedAdvances = {};
        }
        const key = `${employeeName}_${year}_${month}`;
        settings.debitedAdvances[key] = amount;
        this.saveSettings(settings);
    },

    // Save waived advance amount (Free Funds)
    saveWaivedAdvance(employeeName, year, month, amount) {
        const settings = this.getSettings();
        if (!settings.waivedAdvances) {
            settings.waivedAdvances = {};
        }
        const key = `${employeeName}_${year}_${month}`;
        settings.waivedAdvances[key] = amount;
        this.saveSettings(settings);
    },

    // Get waived advance amount
    getWaivedAdvance(employeeName, year, month) {
        const settings = this.getSettings();
        const waivedAdvances = settings.waivedAdvances || {};
        const key = `${employeeName}_${year}_${month}`;
        return parseFloat(waivedAdvances[key] || 0);
    },

    // Get cumulative waived advance amount for employee (up to a specific month)
    getCumulativeWaivedAdvance(employeeName, year, month) {
        const settings = this.getSettings();
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
    getRemainingAdvanceBalance(employeeName, year, month) {
        const fy = this.getFinancialYear();
        const fyStartYear = fy.startYear;
        const fyEndYear = fy.endYear;

        // Get all advances given in the current financial year (April to March)
        const fyStartDate = new Date(fyStartYear, 3, 1); // April 1
        const fyEndDate = new Date(fyEndYear, 2, 31); // March 31

        const advances = this.getAdvances();
        const fyAdvances = advances.filter(adv => {
            if (adv.employee !== employeeName) return false;
            const advDate = new Date(adv.date);
            return advDate >= fyStartDate && advDate <= fyEndDate;
        });

        const totalFyAdvance = fyAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);

        // Get cumulative debited amount for the financial year up to the specified month
        const cumulativeDebited = this.getCumulativeDebitedAdvance(employeeName, year, month);

        // Get cumulative waived amount for the financial year up to the specified month
        const cumulativeWaived = this.getCumulativeWaivedAdvance(employeeName, year, month);

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
            const prevFyDebited = this.getCumulativeDebitedAdvance(employeeName, prevFyEndYear, 2);

            // Get waived amount for previous FY (up to March)
            const prevFyWaived = this.getCumulativeWaivedAdvance(employeeName, prevFyEndYear, 2);

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
    getSettings() {
        const settings = localStorage.getItem(this.KEYS.SETTINGS);
        const parsed = settings ? JSON.parse(settings) : this.DEFAULT_SETTINGS;
        // Ensure new properties exist for backward compatibility
        if (!parsed.salaryPayouts) {
            parsed.salaryPayouts = {};
        }
        return parsed;
    },

    saveSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    // Mark salary payout as completed for a specific month (year, monthIndex 0-11)
    markSalaryPayoutDone(year, month, creditDate = null) {
        const settings = this.getSettings();
        if (!settings.salaryPayouts) {
            settings.salaryPayouts = {};
        }
        const key = `${year}_${month}`;
        settings.salaryPayouts[key] = {
            done: true,
            timestamp: new Date().toISOString(),
            creditDate: creditDate
        };
        this.saveSettings(settings);
    },

    // Cancel salary payout for a specific month for selected employees
    cancelSalaryPayout(year, month, employeeNames) {
        const settings = this.getSettings();

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

        // 3. Check if ANY data remains for this month
        let hasData = false;

        if (settings.debitedAdvances) {
            const hasDebits = Object.keys(settings.debitedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasDebits) hasData = true;
        }

        if (!hasData && settings.waivedAdvances) {
            const hasWaivers = Object.keys(settings.waivedAdvances).some(key => key.endsWith(`_${year}_${month}`));
            if (hasWaivers) hasData = true;
        }

        // 4. If no data remains, remove payout status
        if (!hasData && settings.salaryPayouts) {
            const key = `${year}_${month}`;
            delete settings.salaryPayouts[key];
        }

        this.saveSettings(settings);
    },

    // Check if salary payout is completed for a specific month
    isSalaryPayoutDone(year, month) {
        const settings = this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        const record = payouts[key];
        return !!(record && record.done);
    },

    // Get salary payout details for a specific month
    getSalaryPayoutDetails(year, month) {
        const settings = this.getSettings();
        const payouts = settings.salaryPayouts || {};
        const key = `${year}_${month}`;
        return payouts[key] || null;
    },

    getOTRate() {
        return this.getSettings().otRate || this.DEFAULT_SETTINGS.otRate;
    },

    // Utility Functions
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
                hWorkingPay: 0
            } : 0;
        }

        const standardOtHours = Math.max(otHours - hWorkingOtHours, 0);
        const settings = this.getSettings();
        const otMethod = settings.otCalculationMethod || this.DEFAULT_SETTINGS.otCalculationMethod;

        let standardRate = 0;
        if (standardOtHours > 0) {
            if (otMethod === 'fixedRate') {
                standardRate = settings.otRate || this.DEFAULT_SETTINGS.otRate;
            } else {
                standardRate = this.calculatePerHourSalary(baseSalary, salaryType);
            }
        }
        const standardPay = standardOtHours * standardRate;

        let daySalary = perDaySalary;
        if (daySalary == null) {
            daySalary = salaryType === 'daily' ? baseSalary : baseSalary / 30;
        }
        const hWorkingRate = hWorkingOtHours > 0 ? this.calculateHWorkingPerHour(daySalary) : 0;
        const hWorkingPay = hWorkingOtHours * hWorkingRate;

        const totalPay = standardPay + hWorkingPay;

        if (returnBreakdown) {
            return {
                totalPay,
                standardHours: standardOtHours,
                standardRate,
                standardPay,
                hWorkingHours: hWorkingOtHours,
                hWorkingRate,
                hWorkingPay
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
    }
};

// Initialize on load
DataManager.init();

