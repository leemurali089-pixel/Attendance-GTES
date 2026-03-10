// Bonus Management Module
const BonusModule = {
    currentYear: new Date().getFullYear(),

    // Initialize the module
    async load() {
        console.log('Bonus Module Loaded');
        // Will be used to render the bonus view
        await this.renderBonusView();
    },

    /**
     * Calculate bonus for a specific employee based on payout month
     * Formula: 8.33% of Earned Basic Salary for the previous 12 months
     * Example: Payout Oct 2025 -> Calc based on Oct 2024 to Sep 2025
     * @param {Object} employee - Employee object
     * @param {number} payMonth - Payout Month (0-11)
     * @param {number} payYear - Payout Year (e.g., 2025)
     * @returns {Promise<Object>} - Calculation details
     */
    async calculateBonusForEmployee(employee, payMonth, payYear) {
        let totalEarnedBasic = 0;
        let monthDetails = [];

        // Start from the same month in the previous year
        let startMonth = payMonth;
        let startYear = payYear - 1;

        // Iterate through 12 months
        for (let i = 0; i < 12; i++) {
            let currentMonth = (startMonth + i) % 12;
            let currentYear = startYear + Math.floor((startMonth + i) / 12);

            // Get attendance for this month
            const attendance = await DataManager.getAttendanceByMonth(currentYear, currentMonth);
            const empAttendance = attendance.filter(a => a.employee === employee.name);

            // Calculate Earned Basic for this month
            const earnedBasic = await this._calculateMonthlyEarnedBasic(employee, currentYear, currentMonth, empAttendance);

            if (earnedBasic > 0) {
                totalEarnedBasic += earnedBasic;
                monthDetails.push({
                    month: currentMonth,
                    year: currentYear,
                    earned: earnedBasic
                });
            }
        }

        // Calculate 8.33% bonus
        const bonusAmount = Math.round(totalEarnedBasic * 0.0833);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const periodStr = `${monthNames[payMonth]} ${payYear - 1} - ${monthNames[(payMonth + 11) % 12]} ${payYear}`;

        return {
            employeeId: employee.id,
            employeeName: employee.name,
            period: periodStr,
            totalEarnedBasic: Math.round(totalEarnedBasic),
            calculatedBonus: bonusAmount,
            monthDetails: monthDetails
        };
    },

    /**
     * Helper to calculate earned basic salary for a month
     * Replicates logic from SalaryModule but focuses only on Basic Salary
     */
    async _calculateMonthlyEarnedBasic(employee, year, month, attendanceRecords) {
        const daysInMonth = DataManager.getDaysInMonth(year, month);

        // Get base salary (handle salary revisions if possible, but for now use current base)
        // TODO: In future, check salary history for precise base salary at that time
        const baseSalary = parseFloat(employee.baseSalary || 0);
        const salaryType = employee.salaryType || 'monthly';

        // Calculate paid days
        let present = 0, paidLeave = 0, holidays = 0, hWorking = 0, halfDays = 0;
        let extraPaidDays = 0;

        attendanceRecords.forEach(record => {
            switch (record.status) {
                case 'Present': present++; break;
                case 'Paid Leave': paidLeave++; break;
                case 'Holiday': holidays++; break;
                case 'H-Working':
                    hWorking++;
                    // Double pay logic: if OT is No or Yes, they get extra day pay
                    if (record.overTime === 'No' || record.overTime === 'Yes') {
                        extraPaidDays++;
                    }
                    break;
                case 'Half Day': halfDays++; break;
            }
        });

        let paidDays = 0;
        let earnedBasic = 0;

        if (salaryType === 'daily') {
            // Daily: Paid only for working days (Present + H-Working + Half Days)
            // Usually don't get paid for holidays/leaves unless specified
            paidDays = present + hWorking + (halfDays * 0.5);
            earnedBasic = paidDays * baseSalary;
        } else {
            // Monthly: Paid for all days including leaves/holidays
            paidDays = present + paidLeave + holidays + hWorking + (halfDays * 0.5) + extraPaidDays;

            // Cap paid days at days in month (unless extra pay exceeds it, but basic usually capped)
            // Actually, for bonus, we should strictly follow earned basic.
            // If someone worked on holiday and got double pay, that extra pay is technically "wages"
            // But often bonus is on "Basic". Let's include the extra days as they are part of earned basic wages.

            const perDaySalary = baseSalary / daysInMonth;
            earnedBasic = paidDays * perDaySalary;
        }

        return earnedBasic;
    },

    /**
     * Generate bonus payout list for a payout month/year
     */
    async generateBonusList(payMonth, payYear) {
        const employees = await DataManager.getEmployees();
        const bonusList = [];

        for (const emp of employees) {
            const calculation = await this.calculateBonusForEmployee(emp, payMonth, payYear);
            if (calculation.calculatedBonus > 0) {
                bonusList.push({
                    ...calculation,
                    finalBonus: calculation.calculatedBonus, // Default to calculated
                    status: 'Pending', // Pending, Paid
                    remarks: ''
                });
            }
        }

        return bonusList;
    },

    /**
     * Save a generated bonus payout batch
     */
    async saveBonusPayoutBatch(payMonth, payYear, payouts) {
        const allPayouts = await DataManager.getBonusPayouts();

        // Create a new batch record
        const batch = {
            id: 'bonus_' + payYear + '_' + payMonth + '_' + Date.now(),
            payMonth: payMonth,
            payYear: payYear,
            createdAt: new Date().toISOString(),
            status: 'Draft', // Draft, Finalized
            payouts: payouts
        };

        allPayouts.push(batch);
        await DataManager.saveBonusPayouts(allPayouts);
        return batch;
    },

    async generateAndShowBonus() {
        const payMonth = parseInt(document.getElementById('bonusPayMonth').value);
        const payYear = parseInt(document.getElementById('bonusPayYear').value);
        const resultsArea = document.getElementById('bonusResultsArea');

        resultsArea.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><p>Calculating bonuses...</p></div>';

        try {
            const bonusList = await this.generateBonusList(payMonth, payYear);

            if (bonusList.length === 0) {
                resultsArea.innerHTML = '<div class="alert alert-warning">No eligible employees found for bonus in this period.</div>';
                return;
            }

            let html = `
                <div class="card border-primary">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">Generated Bonus List</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" id="selectAllBonus" onchange="BonusModule.toggleAllBonus(this)" checked></th>
                                        <th>Employee</th>
                                        <th>Earned Basic</th>
                                        <th>Calculated Bonus</th>
                                        <th>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
            `;

            bonusList.forEach((item, index) => {
                html += `
                    <tr>
                        <td><input type="checkbox" class="bonus-checkbox" data-index="${index}" checked></td>
                        <td>
                            ${item.employeeName}
                            <br><small class="text-muted">${item.period}</small>
                        </td>
                        <td>₹${item.totalEarnedBasic.toLocaleString('en-IN')}</td>
                        <td>
                            <input type="number" class="form-control form-control-sm" style="width: 100px" 
                                value="${item.finalBonus}" 
                                onchange="BonusModule.updateBonusAmount(${index}, this.value)">
                        </td>
                        <td>
                            <input type="text" class="form-control form-control-sm" 
                                value="${item.remarks}" 
                                onchange="BonusModule.updateBonusRemarks(${index}, this.value)">
                        </td>
                    </tr>
                `;
            });

            html += `
                                </tbody>
                            </table>
                        </div>
                        <div class="d-flex justify-content-end mt-3">
                            <button class="btn btn-success" onclick="BonusModule.saveBonusBatch()">
                                <i class="bi bi-save"></i> Save Payout
                            </button>
                        </div>
                    </div>
                </div>
            `;

            resultsArea.innerHTML = html;

            // Store current list for editing
            this.currentBonusList = bonusList;

        } catch (error) {
            console.error('Error generating bonus:', error);
            resultsArea.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    },

    toggleAllBonus(source) {
        document.querySelectorAll('.bonus-checkbox').forEach(cb => cb.checked = source.checked);
    },

    updateBonusAmount(index, value) {
        if (this.currentBonusList && this.currentBonusList[index]) {
            this.currentBonusList[index].finalBonus = parseFloat(value) || 0;
        }
    },

    updateBonusRemarks(index, value) {
        if (this.currentBonusList && this.currentBonusList[index]) {
            this.currentBonusList[index].remarks = value;
        }
    },

    async saveBonusBatch() {
        if (!this.currentBonusList) return;

        const selectedIndices = Array.from(document.querySelectorAll('.bonus-checkbox:checked')).map(cb => parseInt(cb.getAttribute('data-index')));

        if (selectedIndices.length === 0) {
            alert('Please select at least one employee.');
            return;
        }

        const selectedPayouts = selectedIndices.map(i => this.currentBonusList[i]);
        const payMonth = parseInt(document.getElementById('bonusPayMonth').value);
        const payYear = parseInt(document.getElementById('bonusPayYear').value);

        try {
            await this.saveBonusPayoutBatch(payMonth, payYear, selectedPayouts);
            App.showNotification('Bonus payout saved successfully', 'success');
            document.getElementById('bonusResultsArea').innerHTML = '';
            this.loadBonusHistory();
        } catch (error) {
            console.error('Error saving bonus batch:', error);
            App.showNotification('Failed to save bonus payout', 'error');
        }
    },

    // Placeholder for UI rendering
    async renderBonusView() {
        const view = document.getElementById('bonusView'); // We'll need to create this in index.html
        if (!view) return;

        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        view.innerHTML = `
            <div class="card">
                <div class="card-body text-center">
                    <h3>Bonus Management</h3>
                    <p>Select the Payout Month to generate bonuses (Calculated on previous 12 months).</p>
                    <div class="row justify-content-center">
                        <div class="col-md-3">
                            <select class="form-select" id="bonusPayMonth">
                                ${months.map((m, i) => `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <select class="form-select" id="bonusPayYear">
                                <option value="${currentYear - 1}">${currentYear - 1}</option>
                                <option value="${currentYear}" selected>${currentYear}</option>
                                <option value="${currentYear + 1}">${currentYear + 1}</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-primary" onclick="BonusModule.generateAndShowBonus()">Generate</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="bonusResultsArea" class="mt-4"></div>
            
            <div class="card mt-4">
                <div class="card-header">
                    <h5>Bonus Payout History</h5>
                </div>
                <div class="card-body">
                    <div id="bonusHistoryArea">
                        <p class="text-muted">Loading history...</p>
                    </div>
                </div>
            </div>
        `;

        this.loadBonusHistory();
    },

    async loadBonusHistory() {
        const historyArea = document.getElementById('bonusHistoryArea');
        const payouts = await DataManager.getBonusPayouts();

        if (payouts.length === 0) {
            historyArea.innerHTML = '<p class="text-center p-3">No bonus payouts found.</p>';
            return;
        }

        // Sort by date desc
        payouts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Payout Month</th>
                            <th>Generated On</th>
                            <th>Status</th>
                            <th>Employees</th>
                            <th>Total Amount</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        payouts.forEach(batch => {
            const totalAmount = batch.payouts.reduce((sum, p) => sum + (p.finalBonus || 0), 0);
            const date = new Date(batch.createdAt).toLocaleDateString();

            // Handle backward compatibility or new format
            let periodLabel = '';
            if (batch.payMonth !== undefined) {
                periodLabel = `${monthNames[batch.payMonth]} ${batch.payYear}`;
            } else {
                periodLabel = `FY ${batch.financialYear}-${batch.financialYear + 1}`;
            }

            html += `
                <tr>
                    <td>${periodLabel}</td>
                    <td>${date}</td>
                    <td><span class="badge bg-${batch.status === 'Finalized' ? 'success' : 'warning'}">${batch.status}</span></td>
                    <td>${batch.payouts.length}</td>
                    <td>₹${totalAmount.toLocaleString('en-IN')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="BonusModule.viewBatchDetails('${batch.id}')">
                            <i class="bi bi-eye"></i> View
                        </button>
                        <button class="btn btn-sm btn-outline-success" onclick="BonusModule.generateBatchPayslips('${batch.id}')">
                            <i class="bi bi-file-earmark-pdf"></i> Payslips
                        </button>
                        <button class="btn btn-sm btn-outline-info" onclick="BonusModule.exportBonusRemittance('${batch.id}')">
                            <i class="bi bi-file-earmark-excel"></i> Export
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        historyArea.innerHTML = html;
    },

    async viewBatchDetails(batchId) {
        const payouts = await DataManager.getBonusPayouts();
        const batch = payouts.find(p => p.id === batchId);
        if (!batch) return;

        // Reuse the results area to show details
        const resultsArea = document.getElementById('bonusResultsArea');

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let periodLabel = '';
        if (batch.payMonth !== undefined) {
            periodLabel = `${monthNames[batch.payMonth]} ${batch.payYear}`;
        } else {
            periodLabel = `FY ${batch.financialYear}-${batch.financialYear + 1}`;
        }

        let html = `
            <div class="card border-primary">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Batch Details: ${periodLabel}</h5>
                    <button class="btn btn-sm btn-light" onclick="document.getElementById('bonusResultsArea').innerHTML = ''">Close</button>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Earned Basic</th>
                                    <th>Bonus Amount</th>
                                    <th>Remarks</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        batch.payouts.forEach(item => {
            html += `
                <tr>
                    <td>${item.employeeName}</td>
                    <td>₹${item.totalEarnedBasic.toLocaleString('en-IN')}</td>
                    <td>₹${item.finalBonus.toLocaleString('en-IN')}</td>
                    <td>${item.remarks || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-secondary" onclick="BonusModule.emailBonusPayslip('${batch.id}', '${item.employeeName.replace(/'/g, "\\'")}')" title="Email Payslip">
                            <i class="bi bi-envelope"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div></div>`;
        resultsArea.innerHTML = html;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    },

    async generateBatchPayslips(batchId) {
        const payouts = await DataManager.getBonusPayouts();
        const batch = payouts.find(p => p.id === batchId);
        if (!batch) return;

        if (!confirm(`Generate bonus payslips for ${batch.payouts.length} employees?`)) return;

        App.showLoader();
        try {
            const settings = await DataManager.getSettings();

            // Generate PDF for each employee or a single PDF with page breaks
            // For now, let's generate a single PDF with all payslips

            const element = document.createElement('div');
            element.innerHTML = await this._generatePayslipHTML(batch, settings);

            const opt = {
                margin: 10,
                filename: `Bonus_Payslips_FY_${batch.financialYear}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();
            App.showNotification('Bonus payslips generated successfully', 'success');

        } catch (error) {
            console.error('Error generating PDF:', error);
            App.showNotification('Failed to generate PDF', 'error');
        } finally {
            App.hideLoader();
        }
    },

    async _generatePayslipHTML(batch, settings) {
        const companyName = settings.companyName || "MJS PrimeLogic";
        const address = settings.registeredAddress || "Chennai, India";

        let html = `
            <style>
                .payslip-container { font-family: Arial, sans-serif; padding: 20px; page-break-after: always; border: 1px solid #ccc; margin-bottom: 20px; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                .company-name { font-size: 24px; font-weight: bold; text-transform: uppercase; }
                .doc-title { font-size: 18px; font-weight: bold; margin-top: 10px; text-decoration: underline; }
                .row { display: flex; margin-bottom: 10px; }
                .col { flex: 1; }
                .label { font-weight: bold; }
                .amount-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                .amount-table th, .amount-table td { border: 1px solid #333; padding: 8px; text-align: left; }
                .amount-table th { background-color: #f0f0f0; }
                .total-row { font-weight: bold; background-color: #e0e0e0; }
                .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                .signature { border-top: 1px solid #000; padding-top: 5px; width: 200px; text-align: center; }
            </style>
        `;

        for (const payout of batch.payouts) {
            html += `
                <div class="payslip-container">
                    <div class="header">
                        <div class="company-name">${companyName}</div>
                        <div>${address}</div>
                        <div class="doc-title">BONUS PAYSLIP - ${batch.payMonth !== undefined ? new Date(batch.payYear, batch.payMonth).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'FY ' + batch.financialYear}</div>
                    </div>
                    
                    <div class="row">
                        <div class="col">
                            <div><span class="label">Employee Name:</span> ${payout.employeeName}</div>
                            <div><span class="label">Employee ID:</span> ${payout.employeeId || 'N/A'}</div>
                        </div>
                        <div class="col" style="text-align: right;">
                            <div><span class="label">Date:</span> ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    
                    <table class="amount-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th style="text-align: right;">Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Total Earned Basic Salary (${payout.period || 'Period'})</td>
                                <td style="text-align: right;">${payout.totalEarnedBasic.toLocaleString('en-IN')}</td>
                            </tr>
                            <tr>
                                <td>Bonus Percentage</td>
                                <td style="text-align: right;">8.33%</td>
                            </tr>
                            <tr class="total-row">
                                <td>Bonus Payable</td>
                                <td style="text-align: right;">${payout.finalBonus.toLocaleString('en-IN')}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 20px;">
                        <strong>Amount in words:</strong> ${this._numberToWords(payout.finalBonus)} Only
                    </div>
                    
                    <div class="footer">
                        <div class="signature">Employee Signature</div>
                        <div class="signature">Authorized Signatory</div>
                    </div>
                </div>
            `;
        }

        return html;
    },

    _numberToWords(amount) {
        // Simple placeholder - for production use a proper library or comprehensive function
        return amount + " Rupees";
    },

    async exportBonusRemittance(batchId) {
        const payouts = await DataManager.getBonusPayouts();
        const batch = payouts.find(p => p.id === batchId);
        if (!batch) return;

        const employees = await DataManager.getEmployees();

        // Prepare data for Excel
        const data = batch.payouts.map(p => {
            const emp = employees.find(e => e.name === p.employeeName) || {};
            return {
                'Employee Name': p.employeeName,
                'Employee ID': p.employeeId || emp.id || '',
                'Bank Account No': emp.accountNo || '',
                'IFSC Code': emp.ifsc || '',
                'Bank Name': emp.branchName || '',
                'Amount': p.finalBonus,
                'Narration': `Bonus ${batch.payMonth !== undefined ? (batch.payMonth + 1) + '/' + batch.payYear : batch.financialYear}`
            };
        });

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bonus Remittance");

        // Save file
        XLSX.writeFile(wb, `Bonus_Remittance_${batch.payMonth !== undefined ? (batch.payMonth + 1) + '-' + batch.payYear : batch.financialYear}.xlsx`);
        App.showNotification('Bonus remittance file exported successfully', 'success');
    },

    async viewBonusPayslip(batchId, employeeName) {
        App.showLoader();
        try {
            const payouts = await DataManager.getBonusPayouts();
            const batch = payouts.find(p => p.id === batchId);
            if (!batch) return;

            const bonusData = batch.payouts.find(p => p.employeeName === employeeName);
            if (!bonusData) return;

            const settings = await DataManager.getSettings();

            // Create a temp batch with single payout for generation
            const tempBatch = { ...batch, payouts: [bonusData] };

            const html = await this._generatePayslipHTML(tempBatch, settings);

            const printWindow = window.open('', '_blank');
            printWindow.document.write(html);
            printWindow.document.close();
        } catch (error) {
            console.error('Error viewing bonus payslip:', error);
            App.showNotification('Error viewing bonus payslip', 'error');
        } finally {
            App.hideLoader();
        }
    },

    async emailBonusPayslip(batchId, employeeName) {
        if (!confirm(`Send bonus payslip to ${employeeName} via email?`)) return;

        App.showLoader('Sending email...');
        try {
            const payouts = await DataManager.getBonusPayouts();
            const batch = payouts.find(p => p.id === batchId);
            if (!batch) throw new Error('Batch not found');

            const bonusData = batch.payouts.find(p => p.employeeName === employeeName);
            if (!bonusData) throw new Error('Bonus data not found');

            const employees = await DataManager.getEmployees();
            const employee = employees.find(e => e.name === employeeName);
            if (!employee) throw new Error('Employee not found');

            const result = await EmailService.sendBonusPayslip(employee, bonusData, batch);

            if (result.success) {
                App.showNotification('Email sent successfully', 'success');
            } else {
                App.showNotification('Failed to send email: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Email error:', error);
            App.showNotification('Error sending email: ' + error.message, 'error');
        } finally {
            App.hideLoader();
        }
    }
};

// Expose to window
window.BonusModule = BonusModule;
