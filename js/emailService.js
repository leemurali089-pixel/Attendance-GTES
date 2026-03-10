const EmailService = {
    // Configuration
    async getConfig() {
        const settings = await DataManager.getSettings();
        return settings.emailConfig || null;
    },

    async saveConfig(config) {
        const settings = await DataManager.getSettings();
        settings.emailConfig = config;
        await DataManager.saveSettings(settings);
    },

    // Send Email
    async sendEmail(to, subject, html, attachments = []) {
        const config = await this.getConfig();
        if (!config || !config.auth || !config.auth.user || !config.auth.pass) {
            return { success: false, error: 'Email not configured. Please check settings.' };
        }

        // Prepare mail options
        const mailOptions = {
            from: `"${DataManager.COMPANY_PROFILE.name}" <${config.auth.user}>`,
            to: to,
            subject: subject,
            html: html,
            attachments: attachments
        };

        try {
            // Send via Electron Main process
            const result = await window.electronAPI.sendEmail(config, mailOptions);

            // Log the attempt
            await DataManager.saveEmailLog({
                to: to,
                subject: subject,
                status: result.success ? 'Sent' : 'Failed',
                error: result.error || null,
                timestamp: new Date().toISOString()
            });

            return result;
        } catch (error) {
            console.error('EmailService Error:', error);
            return { success: false, error: error.message };
        }
    },

    // Templates
    _getHeader() {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ddd;">
                <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333;">${DataManager.COMPANY_PROFILE.name}</h2>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">${DataManager.COMPANY_PROFILE.registeredAddress}</p>
                </div>
        `;
    },

    _getFooter() {
        return `
                <div style="margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888;">
                    <p>This is a computer-generated document and does not require a signature.</p>
                    <p>For any queries, please contact: ${DataManager.COMPANY_PROFILE.phones[0]}</p>
                </div>
            </div>
        `;
    },

    // Generate Salary Payslip HTML
    generateSalaryEmail(employee, salaryData, month, year) {
        const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
        const header = this._getHeader();
        const footer = this._getFooter();

        const content = `
            <h3 style="text-align: center; color: #444;">Payslip for ${monthName} ${year}</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee Name:</strong> ${employee.name}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID:</strong> ${employee.id}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Designation:</strong> ${employee.designation || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Department:</strong> ${employee.department || '-'}</td>
                </tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Description</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Amount (₹)</th>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Basic Salary</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${(salaryData.basic || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Overtime Pay</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${(salaryData.otAmount || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Other Allowances</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${(salaryData.allowances || 0).toFixed(2)}</td>
                </tr>
                <tr style="font-weight: bold; background-color: #f9f9f9;">
                    <td style="padding: 8px; border: 1px solid #ddd;">Gross Salary</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${(salaryData.gross || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">PF Deduction</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #d9534f;">-${(salaryData.pf || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">ESI Deduction</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #d9534f;">-${(salaryData.esi || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Advance Deduction</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #d9534f;">-${(salaryData.advanceDeduction || 0).toFixed(2)}</td>
                </tr>
                <tr style="font-weight: bold; background-color: #e8f5e9; font-size: 16px;">
                    <td style="padding: 10px; border: 1px solid #ddd;">Net Payable</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">₹${(salaryData.net || 0).toFixed(2)}</td>
                </tr>
            </table>
            
            <p><strong>Payment Mode:</strong> ${employee.paymentMode === 'bank' ? 'Bank Transfer' : 'Cash'}</p>
        `;

        return header + content + footer;
    },

    // Generate Bonus Payslip HTML
    generateBonusEmail(employee, bonusData, batch) {
        const header = this._getHeader();
        const footer = this._getFooter();

        let periodLabel = '';
        if (batch.payMonth !== undefined) {
            const monthName = new Date(batch.payYear, batch.payMonth).toLocaleString('default', { month: 'long' });
            periodLabel = `${monthName} ${batch.payYear}`;
        } else {
            periodLabel = `FY ${batch.financialYear}`;
        }

        const content = `
            <h3 style="text-align: center; color: #444;">Bonus Payslip - ${periodLabel}</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee Name:</strong> ${employee.name}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID:</strong> ${employee.id}</td>
                </tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Description</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Details</th>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Bonus Type</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">Annual Bonus</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Calculation Period</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">Previous 12 Months</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Total Earned Basic</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹${(bonusData.totalEarnedBasic || 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">Bonus Rate</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">8.33%</td>
                </tr>
                <tr style="font-weight: bold; background-color: #e8f5e9; font-size: 16px;">
                    <td style="padding: 10px; border: 1px solid #ddd;">Net Bonus Payable</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">₹${(bonusData.finalBonus || 0).toLocaleString('en-IN')}</td>
                </tr>
            </table>
            
            ${bonusData.remarks ? `<p><strong>Remarks:</strong> ${bonusData.remarks}</p>` : ''}
        `;

        return header + content + footer;
    },

    // Send Salary Payslip
    async sendSalaryPayslip(employee, salaryData, month, year) {
        if (!employee.email) {
            return { success: false, error: 'Employee email not found' };
        }

        const html = this.generateSalaryEmail(employee, salaryData, month, year);
        const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
        const subject = `Payslip for ${monthName} ${year} - ${DataManager.COMPANY_PROFILE.name}`;

        return await this.sendEmail(employee.email, subject, html);
    },

    // Send Bonus Payslip
    async sendBonusPayslip(employee, bonusData, batch) {
        if (!employee.email) {
            return { success: false, error: 'Employee email not found' };
        }

        const html = this.generateBonusEmail(employee, bonusData, batch);
        const subject = `Bonus Payslip - ${DataManager.COMPANY_PROFILE.name}`;

        return await this.sendEmail(employee.email, subject, html);
    }
};

// Expose to window
window.EmailService = EmailService;
