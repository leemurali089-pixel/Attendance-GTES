/**
 * Bank Template Registry for Bulk Remittance
 * Handles CSV generation for different bank formats
 */
const BankTemplates = {
    // Registry of supported bank templates
    templates: {
        generic: {
            id: 'generic',
            name: "Generic CSV",
            description: "Standard format (Beneficiary Name, Account, IFSC, Amount)",
            headers: ["Beneficiary Name", "Account Number", "IFSC Code", "Amount", "Remarks"],
            // Function to generate a row for this template
            getRow: (emp, amount) => [
                emp.bank.beneficiaryName,
                emp.bank.accountNo,
                emp.bank.ifsc,
                amount,
                "Salary Payout"
            ]
        },
        hdfc: {
            id: 'hdfc',
            name: "HDFC Bank",
            description: "HDFC Bulk Upload Format",
            headers: ["Transaction Type", "Beneficiary Code", "Beneficiary Account Number", "Amount", "Beneficiary Name", "Beneficiary Bank IFSC", "Email", "Mobile"],
            getRow: (emp, amount) => [
                "NEFT", // Transaction Type
                emp.id || "", // Beneficiary Code (using Employee ID)
                emp.bank.accountNo,
                amount,
                emp.bank.beneficiaryName,
                emp.bank.ifsc,
                emp.email || "",
                emp.phone || ""
            ]
        },
        icici: {
            id: 'icici',
            name: "ICICI Bank",
            description: "ICICI Bulk Payment Format",
            headers: ["Debit Account No", "Beneficiary Account No", "Beneficiary Name", "Amount", "Pay Mode", "Date", "IFSC", "Remarks"],
            getRow: (emp, amount) => [
                "", // Debit Account No (User fills this)
                emp.bank.accountNo,
                emp.bank.beneficiaryName,
                amount,
                "NEFT",
                new Date().toLocaleDateString('en-GB'), // DD/MM/YYYY
                emp.bank.ifsc,
                "Salary"
            ]
        },
        iob: {
            id: 'iob',
            name: "Indian Overseas Bank",
            description: "IOB NEFT/RTGS Format",
            headers: ["Remitter Account No", "Beneficiary Name", "Beneficiary Account No", "IFSC Code", "Amount", "Remarks"],
            getRow: (emp, amount) => [
                "", // Remitter Account No (User fills this)
                emp.bank.beneficiaryName,
                emp.bank.accountNo,
                emp.bank.ifsc,
                amount,
                "Salary Payout"
            ]
        }
    },

    /**
     * Get a template by ID
     * @param {string} id - Template ID
     * @returns {Object} Template object
     */
    getTemplate(id) {
        return this.templates[id] || this.templates.generic;
    },

    /**
     * Get all available templates
     * @returns {Array} Array of template objects
     */
    getAllTemplates() {
        return Object.values(this.templates);
    },

    /**
     * Generate CSV content for a specific template
     * @param {string} templateId - ID of the template to use
     * @param {Array} employees - Array of employee objects
     * @param {Object} payoutDetails - Payout details (optional)
     * @returns {string} CSV content string
     */
    generateCSV(templateId, employees, payoutDetails = null) {
        const template = this.getTemplate(templateId);

        // CSV Helper to escape fields
        const escape = (field) => {
            if (field === null || field === undefined) return '';
            const stringField = String(field);
            // If contains comma, quote, or newline, wrap in quotes and escape quotes
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        // 1. Generate Headers
        const headerRow = template.headers.map(escape).join(',');

        // 2. Generate Data Rows
        const dataRows = employees
            .filter(emp => emp.paymentMode === 'bank' && emp.bank) // Only bank employees
            .map(emp => {
                // Determine amount (Net Salary)
                // If payoutDetails provided, try to find specific payout amount, else fall back to calculated netSalary
                let amount = emp.netSalary || 0;

                // If we have specific payout data, use that (more accurate for past payouts)
                if (payoutDetails && payoutDetails.employees) {
                    const payoutEmp = payoutDetails.employees.find(e => e.name === emp.name);
                    if (payoutEmp) {
                        amount = payoutEmp.netSalary || amount;
                    }
                }

                const rowData = template.getRow(emp, amount);
                return rowData.map(escape).join(',');
            });

        return [headerRow, ...dataRows].join('\n');
    }
};

// Expose to window
window.BankTemplates = BankTemplates;
