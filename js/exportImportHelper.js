/**
 * Export/Import Helper
 * Handles Excel/CSV operations and BookKeeper format mappings
 */
const ExportImportHelper = {
    /**
     * Open import/export modal with context
     */
    openImportExport(moduleType, defaultTab = 'import') {
        const modalEl = document.getElementById('exportImportModal');
        if (!modalEl) return;

        const modal = new bootstrap.Modal(modalEl);

        // Pre-select module type
        const select = document.getElementById('importModuleSelect');
        if (select) {
            // Map common module names to select values
            const typeMap = {
                'sales': 'sales',
                'purchase': 'purchase',
                'invoices': 'sales',
                'vouchers': 'receipt',
                'receipt': 'receipt',
                'payment': 'payment',
                'inventory': 'inventory',
                'material': 'inventory',
                'customers': 'customers',
                'suppliers': 'suppliers',
                'vendors': 'suppliers',
                'accounts': 'accounts',
                'service': 'service',
                'labor': 'service'
            };
            select.value = typeMap[moduleType] || moduleType;
        }

        // Pre-select tab
        if (defaultTab === 'export') {
            const exportTab = document.getElementById('export-tab');
            if (exportTab) exportTab.click();
        } else {
            const importTab = document.getElementById('import-tab');
            if (importTab) importTab.click();
        }

        // Update modal title based on module
        const titleEl = modalEl.querySelector('.modal-title');
        if (titleEl) {
            const labels = {
                'sales': 'Sales Invoices',
                'purchase': 'Purchase Invoices',
                'inventory': 'Inventory / Stock',
                'receipt': 'Receipt Vouchers',
                'payment': 'Payment Vouchers',
                'customers': 'Customers Registry',
                'suppliers': 'Suppliers / Vendors',
                'accounts': 'Accounting Ledger',
                'service': 'Services / Labor'
            };
            const label = labels[moduleType] || (moduleType.charAt(0).toUpperCase() + moduleType.slice(1));
            titleEl.innerHTML = `<i class="bi bi-arrow-left-right me-2"></i>Import/Export ${label}`;
        }

        modal.show();
    },

    /**
     * Download sample Excel template based on module
     */
    async downloadTemplate() {
        const module = document.getElementById('importModuleSelect').value;
        const workbook = XLSX.utils.book_new();
        let headers = [];
        let fileName = `template_${module}.xlsx`;

        switch (module) {
            case 'inventory':
                headers = [
                    'Item Name*', 'Unit Of Measure*', 'SKU/HSN/Item Code', 'Opening Stock',
                    'Cost Price', 'Selling Price', 'Dealer Price', 'Online Price', 'MRP',
                    'Tax Account Name', 'Acount Group', 'Sales Description', 'Stock Item Remarks'
                ];
                break;
            case 'sales':
                headers = [
                    'Voucher No', 'Voucher Date (YYYY-MM-DD)', 'Customer Name', 'Tax No1',
                    'Tax No2', 'Item/Service Name', 'Item Description', 'Quantity', 'Rate',
                    'Subtotal', 'Tax Account Name', 'Total Amount', 'Round Off', 'Narration'
                ];
                break;
            case 'purchase':
                headers = [
                    'Purchase Number', 'Supplier/Cash/Bank', 'Voucher Date (YYYY-MM-DD)', 'Supplier Inv No',
                    'Item/Service Name', 'Quantity', 'Rate', 'Subtotal', 'Tax Account Name',
                    'Total Purchase Value', 'Place of Supply', 'Local/Interstate', 'Acount Group'
                ];
                break;
            case 'receipt':
            case 'payment':
                headers = [
                    'Voucher No', 'Voucher Date (YYYY-MM-DD)', 'Particulars', 'Amount',
                    'Account Name', 'Payment Mode', 'Trans Ref No', 'Narration'
                ];
                break;
            case 'customers':
            case 'suppliers':
                headers = [
                    'Accounts Name', 'Display Name', 'Opening Balance', 'Address Line1',
                    'Address Line2', 'State', 'Pincode', 'Country', 'Phone number', 'Email id',
                    'Tax No1', 'GST Registration Type', 'Bank Account Number', 'Bank IFSC Code',
                    'Bank Name', 'Credit Limit', 'Credit Period', 'Remarks'
                ];
                break;
            case 'service':
                headers = [
                    'Service Name*', 'Service Code', 'Description', 'Rate', 'Tax %',
                    'Unit', 'Category', 'Remarks'
                ];
                break;
        }

        const worksheet = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        XLSX.writeFile(workbook, fileName);
        App.showNotification(`Download template: ${fileName}`, 'success');
    },

    async runExport() {
        const module = document.getElementById('importModuleSelect').value;
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'xlsx';
        const range = document.getElementById('exportRange').value;

        if (module === 'all_in_one' || format === 'xml') {
            return await this.generateAllInOneXML();
        }

        let data = [];
        let fileName = `export_${module}_${new Date().toISOString().split('T')[0]}.${format}`;

        // Get data based on module
        switch (module) {
            case 'inventory':
                data = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
                break;
            case 'customers':
            case 'suppliers':
            case 'accounts':
                const allAccounts = DataManager.getData('gtes_accounts') || [];
                if (module === 'customers') data = allAccounts.filter(a => a.accountType === 'Customer');
                else if (module === 'suppliers') data = allAccounts.filter(a => a.accountType === 'Supplier');
                else data = allAccounts.filter(a => a.accountType === 'Other' || a.isOtherAccount);
                break;
            case 'sales':
                data = DataManager.getData('invoices') || [];
                break;
            case 'receipt':
            case 'payment':
                const allVouchers = DataManager.getData(DataManager.KEYS.VOUCHERS) || [];
                data = allVouchers.filter(v => v.type === (module === 'receipt' ? 'Receipt' : 'Payment'));
                break;
            case 'service':
                const inv = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
                data = inv.filter(i => i.isService);
                break;
        }

        if (data.length === 0) {
            App.showNotification('No data found to export', 'warning');
            return;
        }

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
            XLSX.writeFile(workbook, fileName);
        } else {
            // CSV
            const worksheet = XLSX.utils.json_to_sheet(data);
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        App.showNotification(`Exported ${data.length} records to ${format.toUpperCase()}`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('exportImportModal'))?.hide();
    },

    /**
     * Run the import process
     */
    async runImport() {
        const fileInput = document.getElementById('importFileInput');
        const module = document.getElementById('importModuleSelect').value;
        const schemaAction = document.querySelector('input[name="schemaAction"]:checked')?.value || 'create';

        if (!fileInput.files.length) {
            App.showNotification('Please select a file to import', 'warning');
            return;
        }

        const file = fileInput.files[0];

        // Handle XML All-in-One first
        if (file.name.toLowerCase().endsWith('.xml') || module === 'all_in_one') {
            return await this.processAllInOneXML(file, schemaAction);
        }

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                let allRows = [];
                let headersDetected = false;
                let finalHeaders = [];

                // Iterate through all sheets
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                    if (jsonData.length === 0) continue;

                    // Find header row (the first row with actual content)
                    let headerRowIndex = -1;
                    for (let i = 0; i < jsonData.length; i++) {
                        const row = jsonData[i].filter(cell => cell !== null && cell !== '');
                        if (row.length > 2) { // Assume headers have at least 3 columns
                            // Validation: check if this row is likely headers or just data
                            // If it's all numbers/dates, it's not headers
                            const isData = row.every(cell => !isNaN(cell) || (typeof cell === 'string' && cell.match(/^\d{4}-\d{2}-\d{2}$/)));
                            if (!isData) {
                                headerRowIndex = i;
                                break;
                            }
                        }
                    }

                    if (headerRowIndex === -1) {
                        console.warn(`[Import] Could not find headers in sheet: ${sheetName}`);
                        continue;
                    }

                    // Extract headers and sanitize them
                    const headers = jsonData[headerRowIndex].map(h => String(h || '').trim());

                    // Convert remaining rows to objects
                    const sheetRows = jsonData.slice(headerRowIndex + 1)
                        .filter(row => row.some(cell => cell !== null && cell !== '')) // Skip empty rows
                        .map(row => {
                            const obj = {};
                            headers.forEach((header, index) => {
                                if (header) obj[header] = row[index] !== undefined ? row[index] : '';
                            });
                            return obj;
                        });

                    if (sheetRows.length > 0) {
                        allRows = allRows.concat(sheetRows);
                        if (!headersDetected) {
                            finalHeaders = headers;
                            headersDetected = true;
                        }
                    }
                }

                if (allRows.length === 0) {
                    throw new Error('No valid data found in the Excel file.');
                }

                console.log(`[Import] Processed ${allRows.length} rows across all sheets`);
                console.log(`[Import DEBUG] Detected headers:`, finalHeaders);

                // For "Update Existing", strictly enforce schema overwrite if needed
                if (schemaAction === 'create') {
                    // This is "Create New Module" logic - we normally append in DataManager,
                    // but for raw storage we overwrite for that module
                } else {
                    // Logic for "Update Existing"
                }

                // Save headers for schema mapping
                await DataManager.saveData('gtes_import_columns', {
                    [module]: finalHeaders
                });

                // Save raw data (overwrite for this specific module)
                let rawDataMap = DataManager.getData('gtes_import_raw') || {};
                rawDataMap[module] = allRows;
                await DataManager.saveData('gtes_import_raw', rawDataMap);

                console.log(`[Import] Saved ${finalHeaders.length} columns and ${allRows.length} raw rows for module: ${module}`);

                // Proceed with processing for the application
                await this.processImport(module, allRows, schemaAction);

                bootstrap.Modal.getInstance(document.getElementById('exportImportModal'))?.hide();
                fileInput.value = '';

            } catch (error) {
                console.error('Import Error:', error);
                App.showNotification('Import failed: ' + error.message, 'error');
            }
        };

        reader.readAsArrayBuffer(file);
    },

    /**
     * Map raw data to application formats
     */
    async processImport(type, rows, schemaAction = 'update') {
        let count = 0;
        switch (type) {
            case 'inventory':
                const existingInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
                // Selective Reset: If Fresh Schema, remove non-service items
                let inventory = schemaAction === 'create' ?
                    existingInventory.filter(i => i.isService) : [...existingInventory];

                const initialCount = inventory.length;
                let duplicates = 0;

                for (const row of rows) {
                    const name = row['Item Name*'] || row['Item Name'] || row['Stock Item'] ||
                        row['Material'] || row['Particulars'] || row['Product'] || row['Description'];

                    if (name) {
                        const material = {
                            id: row['SKU/HSN/Item Code'] || row['Item Code'] || row['SKU'] || ('MAT_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                            name: name.trim(),
                            unit: row['Unit Of Measure*'] || row['Unit'] || row['UOM'] || 'Unit',
                            currentStock: parseFloat(row['Opening Stock'] || 0),
                            openingStock: parseFloat(row['Opening Stock'] || 0),
                            rate: parseFloat(row['Selling Price'] || row['Sale Price'] || 0), // Sale Rate
                            purchaseRate: parseFloat(row['Cost Price'] || row['Rate'] || 0),
                            mrp: parseFloat(row['MRP'] || 0),
                            category: row['Acount Group'] || row['Category'] || 'General',
                            gstRate: row['Tax Account Name'] || row['Tax %'] || 'GST@18%',
                            description: row['Sales Description'] || row['Remarks'] || '',
                            hsnCode: row['SKU/HSN/Item Code'] || row['HSN'] || '',
                            updatedAt: new Date().toISOString()
                        };

                        const existingIdx = inventory.findIndex(m => m.name.toLowerCase() === material.name.toLowerCase());
                        if (existingIdx !== -1) {
                            console.warn(`[Import] Duplicate item name found: "${material.name}". Merging data.`);
                            inventory[existingIdx] = { ...inventory[existingIdx], ...material };
                            duplicates++;
                        } else {
                            inventory.push(material);
                        }
                    }
                }
                const importedCount = inventory.length - initialCount;
                await DataManager.saveData(DataManager.KEYS.INVENTORY, inventory);

                let message = `Successfully imported ${importedCount} unique items`;
                if (duplicates > 0) message += ` (${duplicates} duplicates merged)`;
                App.showNotification(message, 'success');

                if (window.DeliveryUI) DeliveryUI.loadInventory();
                break;

            case 'sales':
                const existingInvoices = schemaAction === 'create' ? [] : (DataManager.getData('invoices') || []);
                const salesGroups = {};

                // Line-item grouping by Voucher No
                for (const row of rows) {
                    const voucherNo = row['Voucher No'] || row['Invoice No'] || row['Ref No'] || row['Bill No'];
                    if (!voucherNo) continue;

                    if (!salesGroups[voucherNo]) {
                        salesGroups[voucherNo] = {
                            header: row,
                            items: []
                        };
                    }

                    const itemName = row['Item/Service Name'] || row['Particulars'] || row['Item'] || row['Product'];
                    if (itemName) {
                        salesGroups[voucherNo].items.push({
                            name: itemName,
                            description: row['Item Description'] || row['Description'] || '',
                            qty: parseFloat(row['Quantity'] || row['Qty'] || 1),
                            rate: parseFloat(row['Rate'] || row['Price'] || 0),
                            tax: row['Tax Account Name'] || row['Tax Scheme'] || '',
                            amount: parseFloat(row['Subtotal'] || row['Amount'] || 0)
                        });
                    }
                }

                for (const [voucherNo, data] of Object.entries(salesGroups)) {
                    const row = data.header;
                    const inv = {
                        id: voucherNo,
                        date: row['Voucher Date (YYYY-MM-DD)'] || row['Date'] || new Date().toISOString().split('T')[0],
                        customerName: row['Customer Name'] || row['Party Name'] || row['Customer'] || 'Walking Customer',
                        gstin: row['Tax No1'] || row['GSTIN'] || '',
                        totalAmount: parseFloat(row['Total Amount'] || row['Amount'] || 0),
                        roundOff: parseFloat(row['Round Off'] || 0),
                        remarks: row['Narration'] || row['Remarks'] || '',
                        items: data.items,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                    };

                    if (inv.customerName && inv.items.length > 0) {
                        existingInvoices.push(inv);
                        count++;
                    }
                }

                await DataManager.saveData('invoices', existingInvoices);
                App.showNotification(`Successfully imported ${count} sales invoices`, 'success');
                if (window.DeliveryUI) DeliveryUI.loadHistory();
                break;

            case 'purchase':
                const existingExpenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
                const purchaseGroups = {};

                for (const row of rows) {
                    const purchaseNo = row['Purchase Number'] || row['Voucher No'] || row['Bill No'] ||
                        row['Invoice No'] || row['Ref No'];
                    if (!purchaseNo) continue;

                    if (!purchaseGroups[purchaseNo]) {
                        purchaseGroups[purchaseNo] = {
                            header: row,
                            items: []
                        };
                    }

                    const itemName = row['Item/Service Name'] || row['Item Name'] || row['Item'] ||
                        row['Product'] || row['Particulars'];
                    if (itemName) {
                        purchaseGroups[purchaseNo].items.push({
                            name: itemName,
                            description: row['Item Description'] || row['Description'] || '',
                            qty: parseFloat(row['Quantity'] || 1),
                            rate: parseFloat(row['Rate'] || 0),
                            subtotal: parseFloat(row['Subtotal'] || row['Amount'] || 0),
                            discount: parseFloat(row['Discount %'] || row['Discount'] || 0),
                            tax: row['Tax Account Name'] || row['GST'] || ''
                        });
                    }
                }

                for (const [purchaseNo, data] of Object.entries(purchaseGroups)) {
                    const row = data.header;
                    const exp = {
                        id: purchaseNo,
                        billNo: row['Supplier Inv No'] || row['Supplier Invoice'] || purchaseNo,
                        date: row['Voucher Date (YYYY-MM-DD)'] || row['Date'] || new Date().toISOString().split('T')[0],
                        vendor: row['Supplier/Cash/Bank'] || row['Supplier'] || row['Vendor'] || 'Unknown Supplier',
                        category: row['Purchase'] || 'Purchase',
                        amount: parseFloat(row['Total Purchase Value'] || row['Amount'] || 0),
                        remarks: row['Narration'] || row['Remarks'] || '',
                        items: data.items,
                        source: 'imported',
                        createdAt: new Date().toISOString()
                    };

                    if (exp.vendor && exp.items.length > 0) {
                        existingExpenses.push(exp);
                        count++;
                    }
                }

                await DataManager.saveData(DataManager.KEYS.EXPENSES, existingExpenses);
                App.showNotification(`Successfully imported ${count} purchase invoices`, 'success');
                if (window.DeliveryUI) DeliveryUI.loadPurchases();
                break;

            case 'customers':
            case 'suppliers':
            case 'vendors':
            case 'accounts':
                let targetCategory = (type === 'accounts') ? 'Other' :
                    (type === 'suppliers' || type === 'vendors') ? 'Supplier' : 'Customer';

                // Smart detection: If importing into 'customers' but file has supplier headers
                if (type === 'customers' && rows.length > 0) {
                    const firstRow = rows[0];
                    if (firstRow['Supplier Name'] || firstRow['Vendor Name'] || firstRow['Export Supplier Accounts Name']) {
                        targetCategory = 'Supplier';
                    }
                }

                let existingAccounts = DataManager.getData('customers') || [];

                if (schemaAction === 'create') {
                    console.log(`[Import] Fresh Schema selected for ${targetCategory}. Cleaning target category...`);
                    // Use the same categorization logic as the display UI
                    const getCategory = (c) => {
                        if (c.isOtherAccount || c.accountType === 'Other') return 'Other';
                        if (c.accountType === 'Supplier') return 'Supplier';
                        if (c.accountType === 'Customer') return 'Customer';

                        const name = (c.name || '').toLowerCase();
                        const group = (c.accountGroup || '').toLowerCase();
                        const systemKeywords = ['bank', 'cash', 'sales return', 'purchase return', 'tax', 'gst', 'vat', 'discount', 'tds', 'round off', 'salary', 'duty', 'expense', 'income', 'capital'];
                        if (systemKeywords.some(k => name.includes(k))) return 'Other';

                        if (group && (group.includes('bank') || group.includes('cash') || group.includes('tax') ||
                            group.includes('income') || group.includes('expense') || group.includes('fixed asset') || group.includes('capital') ||
                            group.includes('duty') || group.includes('current liability') || group.includes('current asset'))) {
                            if (!group.includes('debtor') && !group.includes('creditor')) return 'Other';
                        }
                        if (group.includes('creditor')) return 'Supplier';
                        if (group.includes('debtor')) return 'Customer';
                        return 'Customer';
                    };

                    existingAccounts = existingAccounts.filter(c => getCategory(c) !== targetCategory);
                }

                for (const row of rows) {
                    const isOtherAccount = row['Account Type'] && !row['Address Line1'];

                    if (isOtherAccount) {
                        const account = {
                            name: row['Account Name'] || row['Accounts Name'] || row['Name'],
                            accountType: row['Account Type'] || 'Other',
                            openingBalance: parseFloat(row['Opening Balance'] || 0),
                            accountGroup: row['Account Group'] || '',
                            isOtherAccount: true,
                            createdAt: new Date().toISOString()
                        };

                        if (account.name) {
                            existingAccounts.push(account);
                            count++;
                        }
                    } else {
                        const account = {
                            name: row['Export Supplier Accounts Name'] || row['Export Customer Accounts Name'] ||
                                row['Export Account Name'] || row['Accounts Name'] || row['Account Name'] || row['Name'] ||
                                row['Customer Name'] || row['Supplier Name'] || row['Vendor Name'],
                            displayName: row['Display Name'] || '',
                            openingBalance: parseFloat(row['Opening Balance'] || 0),
                            creditLimit: parseFloat(row['Credit Limit'] || 50000),
                            creditPeriod: parseInt(row['Credit Period'] || 0),
                            phone: row['Phone number'] || row['Phone'] || '',
                            email: row['Email id'] || row['Email'] || '',
                            address: row['Address Line1'] || '',
                            address2: row['Address Line2'] || '',
                            state: row['State'] || '',
                            pincode: row['Pincode'] || '',
                            country: row['Country'] || 'India',
                            shippingAddress: row['Shipping Address Line1'] || '',
                            shippingAddress2: row['Shipping Address Line2'] || '',
                            gstin: row['Tax No1'] || row['GSTIN'] || '',
                            taxNo2: row['Tax No2'] || '',
                            taxNo3: row['Tax No3'] || '',
                            gstRegistrationType: row['GST Registration Type'] || 'Unregistered',
                            bankAccount: row['Bank Account Number'] || '',
                            bankIFSC: row['Bank IFSC Code'] || '',
                            bankName: row['Bank Name'] || '',
                            accountGroup: row['Acount Group'] || row['Account Group'] || '',
                            remarks: row['Remarks'] || '',
                            accountType: targetCategory,
                            isOtherAccount: (targetCategory === 'Other'),
                            balance: parseFloat(row['Opening Balance'] || 0),
                            createdAt: new Date().toISOString()
                        };

                        if (account.name) {
                            existingAccounts.push(account);
                            count++;
                        }
                    }
                }

                await DataManager.saveData('customers', existingAccounts);
                const typeLabel = (type === 'suppliers' || type === 'vendors') ? 'suppliers' :
                    (type === 'accounts') ? 'accounts' : 'customers';
                App.showNotification(`Successfully imported ${count} ${typeLabel}`, 'success');
                if (window.DeliveryUI) DeliveryUI.loadCustomers();
                break;

            case 'receipt':
            case 'payment':
                const vouchers = schemaAction === 'create' ? [] : (DataManager.getData('vouchers') || []);
                for (const row of rows) {
                    const voucher = {
                        id: row['Voucher No'] || ('VOU_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                        date: row['Voucher Date (YYYY-MM-DD)'] || row['Date'] || new Date().toISOString().split('T')[0],
                        type: type, // receipt or payment
                        customerName: row['Particulars'] || row['Party Name'] || 'Unknown',
                        amount: parseFloat(row['Amount'] || 0),
                        accountName: row['Account Name'] || row['Cash/Bank'] || 'Cash',
                        paymentMode: row['Payment Mode'] || 'Cash',
                        refNo: row['Trans Ref No'] || row['Reference'] || '',
                        narration: row['Narration'] || row['Remarks'] || '',
                        createdAt: new Date().toISOString()
                    };
                    if (voucher.customerName && voucher.amount > 0) {
                        vouchers.push(voucher);
                        count++;
                    }
                }
                await DataManager.saveData('vouchers', vouchers);
                App.showNotification(`Successfully imported ${count} ${type} vouchers`, 'success');
                if (window.VouchersUI) VouchersUI.loadVouchers();
                break;

            case 'service':
                const allInv = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
                // Selective Reset: If Fresh Schema, remove only existing items that are services
                let items = schemaAction === 'create' ?
                    allInv.filter(i => !i.isService) : [...allInv];

                for (const row of rows) {
                    const name = row['Service Name*'] || row['Service Name'] || row['Name'];
                    if (name) {
                        const service = {
                            id: row['Service Code'] || ('SRV_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                            name: name,
                            description: row['Description'] || '',
                            rate: parseFloat(row['Rate'] || 0),
                            gstRate: row['Tax %'] || 'GST@18%',
                            unit: row['Unit'] || 'Service',
                            category: row['Category'] || 'Service',
                            remarks: row['Remarks'] || '',
                            isService: true,
                            updatedAt: new Date().toISOString()
                        };

                        const existingIdx = items.findIndex(m => m.name.toLowerCase() === service.name.toLowerCase());
                        if (existingIdx !== -1) {
                            items[existingIdx] = { ...items[existingIdx], ...service };
                        } else {
                            items.push(service);
                        }
                        count++;
                    }
                }
                await DataManager.saveData(DataManager.KEYS.INVENTORY, items);
                App.showNotification(`Successfully imported ${count} services`, 'success');
                if (window.DeliveryUI) DeliveryUI.loadServices();
                break;

            default:
                App.showNotification('Import logic for this category is under development', 'info');
        }
    },

    /**
     * Generate All-in-One XML Backup
     */
    async generateAllInOneXML() {
        try {
            App.showNotification('Preparing XML Backup...', 'info');

            const data = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    version: "1.0",
                    appName: "GTES Management System",
                    type: "Transactions Only"
                },
                // inventory: DataManager.getData(DataManager.KEYS.INVENTORY) || [], // Excluded by user request
                accounts: DataManager.getData('gtes_accounts') || [],
                invoices: DataManager.getData('invoices') || [],
                vouchers: DataManager.getData(DataManager.KEYS.VOUCHERS) || [],
                purchases: DataManager.getData(DataManager.KEYS.EXPENSES) || [],
                invoices: DataManager.getData(DataManager.KEYS.INVOICES) || [],
                expenses: DataManager.getData('gtes_expenses') || [],
                challans: DataManager.getData('gtes_challans') || [],
                jobcards: DataManager.getData('jobcards') || []
                // settings: await DataManager.getSettings() || {} // Excluded by user request
            };

            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            xml += '<GTES_Backup>\n';

            // Utility to escape XML entities
            const escapeXML = (str) => {
                if (typeof str !== 'string') return str;
                return str.replace(/[<>&"']/g, function (c) {
                    switch (c) {
                        case '<': return '&lt;';
                        case '>': return '&gt;';
                        case '&': return '&amp;';
                        case '"': return '&quot;';
                        case "'": return '&apos;';
                    }
                });
            };

            // Recursive function to build XML
            const buildXML = (obj, indent = '  ') => {
                let s = '';
                for (const key in obj) {
                    if (obj[key] === null || obj[key] === undefined) continue;

                    const value = obj[key];
                    if (Array.isArray(value)) {
                        s += `${indent}<${key}_List>\n`;
                        value.forEach(item => {
                            s += `${indent}  <${key}_Item>\n`;
                            s += buildXML(item, indent + '    ');
                            s += `${indent}  </${key}_Item>\n`;
                        });
                        s += `${indent}</${key}_List>\n`;
                    } else if (typeof value === 'object') {
                        s += `${indent}<${key}>\n`;
                        s += buildXML(value, indent + '  ');
                        s += `${indent}</${key}>\n`;
                    } else {
                        s += `${indent}<${key}>${escapeXML(String(value))}</${key}>\n`;
                    }
                }
                return s;
            };

            xml += buildXML(data);
            xml += '</GTES_Backup>';

            const fileName = `GTES_Backup_${new Date().toISOString().split('T')[0]}.xml`;
            const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            App.showNotification('Back-up exported successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('exportImportModal'))?.hide();
        } catch (error) {
            console.error('XML Export Error:', error);
            App.showNotification('Export failed: ' + error.message, 'error');
        }
    },

    /**
     * Process All-in-One XML Import
     */
    async processAllInOneXML(file, schemaAction) {
        try {
            const text = await file.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "application/xml");

            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                throw new Error("Error parsing XML file. Ensure it is a valid GTES backup.");
            }

            const root = xmlDoc.getElementsByTagName("GTES_Backup")[0];
            if (!root) throw new Error("Invalid backup format: Missing GTES_Backup root element.");

            if (schemaAction === 'create') {
                if (!confirm("FRESH SCHEMA: This will OVERWRITE your current data with the backup. Continue?")) {
                    return;
                }
            }

            // Recursive function to parse back to JSON
            const parseNode = (node) => {
                if (node.children.length === 0) return node.textContent;

                const obj = {};
                // Check if it's a List type
                let isList = node.tagName.endsWith('_List');
                if (isList) {
                    const list = [];
                    for (const child of node.children) {
                        list.push(parseNode(child));
                    }
                    return list;
                }

                for (const child of node.children) {
                    const key = child.tagName;
                    const value = parseNode(child);

                    if (key.endsWith('_List')) {
                        obj[key.replace('_List', '')] = value;
                    } else if (key.endsWith('_Item')) {
                        return value; // Direct return for item elements
                    } else {
                        obj[key] = value;
                    }
                }
                return obj;
            };

            const backupData = parseNode(root);
            console.log('Parsed XML Backup Data:', backupData);

            let importCount = 0;
            const modules = [
                { key: DataManager.KEYS.INVENTORY, data: backupData.inventory, name: 'Inventory' },
                { key: 'gtes_accounts', data: backupData.accounts, name: 'Accounts' },
                { key: 'invoices', data: backupData.invoices, name: 'Invoices' },
                { key: DataManager.KEYS.VOUCHERS, data: backupData.vouchers, name: 'Vouchers' },
                { key: DataManager.KEYS.EXPENSES, data: backupData.purchases, name: 'Purchases' },
                { key: DataManager.KEYS.INVOICES, data: backupData.invoices, name: 'Invoices' },
                { key: 'gtes_expenses', data: backupData.expenses, name: 'Expenses' },
                { key: 'gtes_challans', data: backupData.challans, name: 'Challans' },
                { key: 'jobcards', data: backupData.jobcards, name: 'Job Cards' }
            ];

            for (const mod of modules) {
                if (!mod.data || !Array.isArray(mod.data)) continue;

                if (schemaAction === 'create') {
                    await DataManager.saveData(mod.key, mod.data);
                } else {
                    const existing = DataManager.getData(mod.key) || [];
                    // Simple merge by ID
                    const merged = [...existing];
                    mod.data.forEach(item => {
                        const idx = merged.findIndex(e => e.id === item.id);
                        if (idx !== -1) merged[idx] = item;
                        else merged.push(item);
                    });
                    await DataManager.saveData(mod.key, merged);
                }
                importCount += mod.data.length;
                console.log(`Imported ${mod.data.length} records for ${mod.name}`);
            }

            // Also restore settings if present
            if (backupData.settings) {
                await DataManager.saveSettings(backupData.settings);
            }

            App.showNotification(`Successfully restored ${importCount} records from XML backup!`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('exportImportModal'))?.hide();

            // Reload to reflect changes
            setTimeout(() => window.location.reload(), 2000);

        } catch (error) {
            console.error('XML Import Error:', error);
            App.showNotification('Import failed: ' + error.message, 'error');
        }
    }
};
