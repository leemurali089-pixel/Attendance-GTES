/**
 * BookKeeper Import Module
 * Imports data from BookKeeper Android app SQLite backup
 * Supports: Customers, Inventory, Vouchers, Sales, Purchases
 */

const BookKeeperImport = {
    db: null,
    importStats: {},

    /**
     * Initialize SQL.js library
     */
    async initSqlJs() {
        if (window.SQL) return window.SQL;

        // Load SQL.js from CDN
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
            script.onload = async () => {
                try {
                    const SQL = await initSqlJs({
                        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                    });
                    window.SQL = SQL;
                    resolve(SQL);
                } catch (e) {
                    reject(e);
                }
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    /**
     * Open database file
     */
    /**
     * Open database file
     */
    async openDatabase(fileOrBuffer) {
        try {
            const SQL = await this.initSqlJs();
            let uint8Array;

            if (fileOrBuffer instanceof Uint8Array || fileOrBuffer instanceof ArrayBuffer || (window.Buffer && window.Buffer.isBuffer(fileOrBuffer))) {
                // It's already a buffer-like object
                uint8Array = new Uint8Array(fileOrBuffer);
            } else if (fileOrBuffer.arrayBuffer) {
                // It's a File or Blob object
                const arrayBuffer = await fileOrBuffer.arrayBuffer();
                uint8Array = new Uint8Array(arrayBuffer);
            } else if (fileOrBuffer.buffer) {
                // It's a Node buffer
                uint8Array = new Uint8Array(fileOrBuffer.buffer);
            } else {
                throw new Error('Invalid input: Expected File, Blob, or ArrayBuffer');
            }

            // NOTE: We are initializing SQL.js with a byte array copy of the file.
            // This is an in-memory database and DOES NOT modify the original file on disk.
            this.db = new SQL.Database(uint8Array);

            console.log('BookKeeper database opened successfully (In-Memory mode, safely read-only)');
            return true;
        } catch (error) {
            console.error('Error opening database:', error);
            throw new Error('Failed to open database file. Please ensure it is a valid BookKeeper backup.');
        }
    },

    /**
     * Get table names from database
     */
    /**
     * Get table names from database
     */
    /**
     * Get table names from database
     */
    getTables() {
        if (!this.db) return [];
        const result = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        if (result.length === 0) return [];
        return result[0].values.map(row => row[0]);
    },

    /**
     * Smartly detect a table based on its columns, regardless of name
     */
    detectTableByColumns(allTables, validNames, requiredColumns, minMatch = 1) {
        // 1. First try exact name matches (fast path)
        const nameMatch = validNames.find(n => allTables.includes(n));
        if (nameMatch) {
            console.log(`[Import] Found explicit table match: ${nameMatch}`);
            return nameMatch;
        }

        // 2. Content scan - expensive but robust
        console.log(`[Import] Scanning for table with columns: ${requiredColumns.join(', ')}`);
        for (const tableName of allTables) {
            // Skip system tables
            if (tableName.startsWith('sqlite_') || tableName.startsWith('android_')) continue;

            try {
                const cols = this.getColumns(tableName);
                const matches = requiredColumns.filter(req => cols.includes(req));
                if (matches.length >= minMatch) {
                    console.log(`[Import] Smart detected table '${tableName}' matches columns: ${matches.join(', ')}`);
                    return tableName;
                }
            } catch (e) {
                console.warn(`[Import] Failed to inspect table ${tableName}:`, e);
            }
        }
        return null;
    },

    /**
     * Get columns for a table
     */
    getColumns(tableName) {
        if (!this.db) return [];
        const res = this.db.exec(`PRAGMA table_info("${tableName}")`);
        if (res.length > 0 && res[0].values) {
            return res[0].values.map(v => v[1]); // Column name is at index 1
        }
        return [];
    },

    /**
     * Smartly detect a table based on its columns, regardless of name
     */
    detectTableByColumns(allTables, validNames, requiredColumns, minMatch = 1) {
        // 1. First try exact name matches (fast path)
        const nameMatch = validNames.find(n => allTables.includes(n));
        if (nameMatch) {
            console.log(`[Import] Found explicit table match: ${nameMatch}`);
            return nameMatch;
        }

        // 2. Content scan - expensive but robust
        console.log(`[Import] Scanning for table with columns: ${requiredColumns.join(', ')}`);
        for (const tableName of allTables) {
            // Skip system tables
            if (tableName.startsWith('sqlite_') || tableName.startsWith('android_')) continue;

            try {
                const cols = this.getColumns(tableName);
                const matches = requiredColumns.filter(req => cols.includes(req));
                if (matches.length >= minMatch) {
                    console.log(`[Import] Smart detected table '${tableName}' matches columns: ${matches.join(', ')}`);
                    return tableName;
                }
            } catch (e) {
                console.warn(`[Import] Failed to inspect table ${tableName}:`, e);
            }
        }
        return null;
    },

    /**
     * Get columns for a table
     */
    getColumns(tableName) {
        if (!this.db) return [];
        const res = this.db.exec(`PRAGMA table_info("${tableName}")`);
        if (res.length > 0 && res[0].values) {
            return res[0].values.map(v => v[1]); // Column name is at index 1
        }
        return [];
    },

    /**
     * Inspect Database Schema (Debug Tool)
     * Extracts column names from key tables to debug schema mismatches.
     */
    async inspectSchema() {
        const schema = {};
        const keyTables = ['item_measure', 'stock', 'inventory_item', 'service', 'vouchers', 'account_detail'];

        for (const table of keyTables) {
            try {
                // Check if table exists
                const check = this.db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
                if (check.length > 0) {
                    // Get first row to see actual keys (better than PRAGMA sometimes for aliasing check)
                    const res = this.db.exec(`SELECT * FROM ${table} LIMIT 1`);
                    if (res.length > 0 && res[0].columns) {
                        schema[table] = res[0].columns;
                    } else {
                        // Fallback to PRAGMA if empty
                        const cols = this.getColumns(table);
                        schema[table] = cols;
                    }
                }
            } catch (e) {
                console.warn(`Failed to inspect ${table}:`, e);
            }
        }
        return schema;
    },

    /**
     * Analyze Features from Database Structure
     */
    async analyzeFeatures(fileOrBuffer) {
        await this.openDatabase(fileOrBuffer);
        const tables = this.getTables();
        const features = [];

        // Check for specific tables that indicate features
        if (tables.includes('inventory_batch')) features.push('Batch/Expiry Tracking');
        if (tables.includes('cheque_details')) features.push('Cheque/PDC Management');
        if (tables.includes('godown')) features.push('Warehousing/Godowns');
        if (tables.includes('mfg_journal')) features.push('Manufacturing Journals');
        if (tables.includes('loyalty_points')) features.push('Loyalty Program');
        if (tables.includes('barcodes')) features.push('Barcode Scanning');
        if (tables.includes('custom_fields')) features.push('Custom Fields');
        if (tables.includes('users')) features.push('Multi-User/Roles');
        if (tables.includes('currency')) features.push('Multi-Currency');

        return {
            tables: tables.sort(), // Full list for deep inspection if needed
            detectedFeatures: features
        };
    },

    /**
     * Parse CSV File
     */
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                if (lines.length < 2) return resolve([]); // Empty or just header

                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
                const data = [];

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Basic CSV parsing handling quotes
                    const values = [];
                    let inQuote = false;
                    let currentVal = '';

                    for (let char of line) {
                        if (char === '"') {
                            inQuote = !inQuote;
                        } else if (char === ',' && !inQuote) {
                            values.push(currentVal.trim().replace(/"/g, ''));
                            currentVal = '';
                        } else {
                            currentVal += char;
                        }
                    }
                    values.push(currentVal.trim().replace(/"/g, '')); // Last value

                    const row = {};
                    headers.forEach((h, index) => {
                        row[h] = values[index] || '';
                    });
                    data.push(row);
                }
                resolve(data);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Import Customers from CSV
     */
    async importCustomersFromCSV(file) {
        const rows = await this.parseCSV(file);
        const existingCustomers = DataManager.getData('customers') || [];
        const existingIds = new Set(existingCustomers.map(c => c.name)); // Dedupe by name
        let imported = 0;

        rows.forEach(row => {
            // Flexible column mapping
            const name = row['name'] || row['customer name'] || row['party name'] || row['account name'];
            if (!name || existingIds.has(name)) return;

            // Extract balance
            let balance = 0;
            const balStr = row['balance'] || row['closing balance'] || row['current balance'] || '0';
            balance = parseFloat(balStr.replace(/[^\d.-]/g, '')) || 0;

            const customer = {
                id: `CUST-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                name: name,
                type: 'customer', // Assume customer for now
                phone: row['phone'] || row['mobile'] || row['contact'] || '',
                email: row['email'] || '',
                address: row['address'] || row['billing address'] || '',
                gstin: row['gstin'] || row['gst no'] || row['tax number'] || '',
                balance: Math.abs(balance),
                balanceType: balance < 0 ? 'Payable' : 'Receivable',
                status: 'active',
                source: 'csv_import'
            };

            existingCustomers.push(customer);
            existingIds.add(name);
            imported++;
        });

        DataManager.saveData('customers', existingCustomers);
        return { imported };
    },

    /**
     * Import Inventory from CSV
     */
    async importInventoryFromCSV(file) {
        const rows = await this.parseCSV(file);
        const existingInventory = DataManager.getData('inventory') || [];
        const existingIds = new Set(existingInventory.map(i => i.name));
        let imported = 0;

        rows.forEach(row => {
            // Flexible column mapping
            const name = row['item name'] || row['name'] || row['product name'] || row['item'];
            if (!name || existingIds.has(name)) return;

            // Extract numeric values
            const getNum = (keys) => {
                for (const key of keys) {
                    if (row[key]) return parseFloat(row[key].replace(/[^\d.-]/g, '')) || 0;
                }
                return 0;
            };

            const stock = getNum(['stock', 'quantity', 'qty', 'closing stock', 'balance qty']);
            const rate = getNum(['rate', 'price', 'selling price', 'sales price', 'mrp']);
            const purchaseRate = getNum(['purchase price', 'cost', 'buying price']);

            const item = {
                id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                name: name,
                description: row['description'] || row['narration'] || '',
                category: row['category'] || 'General',
                brand: row['brand'] || '-',
                unit: row['unit'] || row['uom'] || 'nos',
                stock: stock,
                rate: rate,
                purchaseRate: purchaseRate,
                hsn: row['hsn'] || row['hsn code'] || '',
                gstRate: row['tax'] || row['gst'] || 'GST@18%',
                status: 'active',
                source: 'csv_import'
            };

            existingInventory.push(item);
            existingIds.add(name);
            imported++;
        });

        DataManager.saveData('inventory', existingInventory);
        return { imported };
    },

    /**
     * Execute SQL query and return results as array of objects
     */
    query(sql) {
        if (!this.db) return [];
        try {
            const result = this.db.exec(sql);
            if (result.length === 0) return [];

            const columns = result[0].columns;
            return result[0].values.map(row => {
                const obj = {};
                columns.forEach((col, i) => {
                    obj[col] = row[i];
                });
                return obj;
            });
        } catch (e) {
            console.error('Query error:', sql, e);
            return [];
        }
    },

    /**
     * Check if a column exists in a table
     */
    hasColumn(tableName, columnName) {
        if (!this.db) return false;
        try {
            const info = this.query(`PRAGMA table_info(${tableName})`);
            return info.some(col => col.name === columnName);
        } catch (e) {
            return false;
        }
    },

    /**
     * Helper to safely get a numeric value from an object using multiple possible keys
     */
    getVal(item, keys) {
        if (!item) return 0;
        for (const key of keys) {
            if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
                // POWERFUL PARSING: Remove everything except numbers, decimal point, and minus sign
                // This handles "-4,168.00 nos", "7.00 cbm", etc.
                let valStr = String(item[key]).replace(/[^-0-9.]/g, '');
                const val = parseFloat(valStr);
                if (!isNaN(val)) return val;
            }
        }
        return 0;
    },

    /**
     * Helper to safely get a string value from an object using multiple possible keys
     */
    getStr(item, keys) {
        if (!item) return '';
        for (const key of keys) {
            if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
                return String(item[key]).trim();
            }
        }
        return '';
    },

    normalizeName(name) {
        if (!name) return '';
        return name.trim()
            .replace(/[ \t]+/g, ' ')               // Standardize spaces
            .replace(/[×xX]/g, '*')                // Standardize multiplication signs
            .replace(/[“”""]/g, '"')               // Standardize quotes
            .replace(/[‘’'']/g, "'")               // Standardize single quotes
            .toLowerCase();
    },

    async learnHSNFromTransactions(itemName) {
        if (!itemName) return '';
        const tables = ['sale_item', 'service_sales', 'bill_item', 'purchase_item', 'inventory_transaction'];
        for (const table of tables) {
            try {
                // Try to find a row with this name that HAS an hsn_code
                const q = `SELECT * FROM ${table} WHERE (item = '${itemName.replace(/'/g, "''")}' OR service = '${itemName.replace(/'/g, "''")}' OR item_name = '${itemName.replace(/'/g, "''")}') AND (hsn_code IS NOT NULL AND hsn_code != '') LIMIT 1`;
                const res = this.query(q);
                if (res.length > 0) {
                    const hsn = this.findHSNFuzzy(res[0]);
                    if (hsn) return hsn;
                }
            } catch (e) { }
        }
        return '';
    },

    /**
     * Helper to find an HSN code by checking ALL columns for a matching pattern (4-8 digits)
     */
    findHSNFuzzy(item) {
        if (!item) return '';
        // Known keys first (Speed optimization)
        const hsn = this.getStr(item, ['SKU/HSN/Item Code', 'sku_hsn_item_code', 'hsn_code', 'hsncode', 'hsn', 'tax_hsn', 'tax_hsn_code', 'hsn_no', 'hsn_sac', 'hsn_sac_code', 'sac', 'sac_code', 'item_code', 'itemcode', 'code', 'barcode', 'tax_hsn_no', 'commodity_code']);
        if (hsn) return hsn;

        // Exhaustive scan
        for (const key in item) {
            const lk = key.toLowerCase();
            // SKIP columns that are clearly IDs OR pricing/quantity fields to avoid mistaking rates (e.g. 4500) for HSNs
            if (lk.includes('id') || lk.includes('guid') || lk.includes('parent') || lk.includes('ref') ||
                lk.includes('rate') || lk.includes('price') || lk.includes('amt') || lk.includes('amount') ||
                lk.includes('total') || lk.includes('subtotal') || lk.includes('qty') || lk.includes('quantity') ||
                lk.includes('unit')) continue;

            const val = String(item[key]).trim();
            // HSN/SAC codes are usually 4, 6, or 8 digits.
            if (/^\d{4,8}$/.test(val)) {
                return val;
            }
        }
        return '';
    },

    /**
     * Helper to find a rate by checking ALL columns for potential numeric values
     */
    findRateFuzzy(item) {
        if (!item) return 0;
        const rate = this.getVal(item, ['Rate/Unit', 'rate', 'selling_price', 'selling_rate', 'sale_rate', 'rate1', 'defaultsellingprice', 'default_selling_price', 'price', 'unit_price', 'item_rate', 'sp_per_unit', 'p_rate', 'unit_rate', 'selling_per_unit']);
        if (rate > 0) return rate;

        // Exhaustive scan for positive numbers in columns containing 'rate' or 'price'
        for (const key in item) {
            const lk = key.toLowerCase();
            if (lk.includes('rate') || lk.includes('price')) {
                const val = parseFloat(String(item[key]).replace(/[^-0-9.]/g, ''));
                if (!isNaN(val) && val > 0) return val;
            }
        }
        return 0;
    },

    /**
     * Import Company Information
     */
    async importCompanyInfo(tableName = 'company') {
        const companies = this.query(`SELECT * FROM ${tableName} LIMIT 1`);
        if (companies.length === 0) return null;

        const company = companies[0];
        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};

        // Update settings with company info
        settings.companyName = company.c_name || settings.companyName;
        settings.address = company.address1 || settings.address;
        settings.address2 = company.address2 || settings.address2;
        settings.email = company.email_id || settings.email;
        settings.phone = company.phone || settings.phone;
        settings.gstin = company.tax_regn || settings.gstin;
        settings.pan = company.tax_regn2 || settings.pan;

        DataManager.saveData(DataManager.KEYS.SETTINGS, settings);

        return {
            name: company.c_name,
            financialYear: company.fin_yr
        };
    },

    /**
     * Import Customers from account_detail
     */
    async importCustomers(tableName = 'account_detail') {
        const accounts = this.query(`
            SELECT * FROM ${tableName} 
            WHERE a_type IN ('Sundry Debtors', 'Sundry Creditors') 
            OR type IN ('Sundry Debtors', 'Sundry Creditors')
        `);

        const existingCustomers = DataManager.getData('customers') || [];
        const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));

        let imported = 0;
        let skipped = 0;

        accounts.forEach(acc => {
            if (existingNames.has(acc.aname?.toLowerCase())) {
                skipped++;
                return;
            }

            // Robust Name Check
            const customerName = acc.aname || acc.account_name || acc.name || acc.customer_name || '';
            if (!customerName) {
                skipped++;
                return;
            }

            const customer = {
                id: `CUST-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: customerName,
                displayName: acc.display_name || customerName,
                phone: acc.phone || acc.mobile || '',
                email: acc.email_id || acc.email || '',
                address: acc.address || '',
                address2: acc.address2 || '',
                gstin: acc.tax_regn || acc.gstin || '',
                pan: acc.tax_regn2 || acc.pan || '',
                state: acc.state || '',
                pincode: acc.pincode || acc.zip || '',
                country: acc.country || 'India',
                accountType: (acc.a_type && acc.a_type.includes('Creditor')) ? 'Supplier' : 'Customer',
                isOtherAccount: false,
                openingBalance: parseFloat(acc.op_bal) || 0,
                closingBalance: parseFloat(acc.cl_bal) || 0,
                creditPeriod: parseInt(acc.credit_period) || 30,
                creditLimit: parseFloat(acc.credit_limit) || 0,
                status: acc.status === 0 ? 'inactive' : 'active',
                createdAt: acc.date_created || new Date().toISOString(),
                source: 'bookkeeper'
            };

            existingCustomers.push(customer);
            existingNames.add(customer.name.toLowerCase());
            imported++;
        });

        DataManager.saveData('customers', existingCustomers);

        return { imported, skipped, total: accounts.length };
    },

    /**
     * Import Warehouses
     */
    async importWarehouses() {
        try {
            const warehouses = this.query('SELECT * FROM warehouse');
            const gtesWarehouses = warehouses.map(w => ({
                id: `WH-${w.warehouse_id || Date.now()}`,
                name: w.warehouse_name,
                location: w.location || '',
                source: 'bookkeeper'
            }));

            if (gtesWarehouses.length > 0) {
                DataManager.saveData('warehouses', gtesWarehouses);
            }
            return { imported: gtesWarehouses.length };
        } catch (e) {
            console.warn('Warehouse import failed', e);
            return { imported: 0, error: e.message };
        }
    },

    /**
     * Import Services (from 'service' table)
     */
    async importServices() {
        try {
            const services = this.query('SELECT * FROM service');
            const existingInventory = DataManager.getData('inventory') || [];

            let imported = 0;
            services.forEach(s => {
                const serviceItem = {
                    id: `SVC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    name: s.service_name,
                    description: s.service_desc || '',
                    type: 'service',
                    unit: 'nos',
                    rate: parseFloat(s.defaultsellingprice) || 0,
                    gstRate: s.scheme_name || 'GST@18%', // heuristic
                    status: 'active',
                    source: 'bookkeeper_service_table'
                };

                // Avoid duplicates
                if (!existingInventory.find(i => i.name === serviceItem.name)) {
                    existingInventory.push(serviceItem);
                    imported++;
                }
            });

            DataManager.saveData('inventory', existingInventory);
            return { imported: imported };
        } catch (e) {
            return { imported: 0, error: e.message };
        }
    },

    /**
     * Import Orders (PO/SO)
     */
    async importOrders() {
        try {
            const orders = this.query('SELECT * FROM po_so_vouchers');
            const existingOrders = DataManager.getData('orders') || [];
            const existingIds = new Set(existingOrders.map(o => o.bookkeeperId));

            let imported = 0;
            orders.forEach(o => {
                const bkId = `BK-ORD-${o.v_id}`;
                if (existingIds.has(bkId)) return;

                const isSalesOrder = o.v_type && o.v_type.toLowerCase().includes('sales');

                // Fetch items for this order
                const items = this.query(`SELECT * FROM po_so_item WHERE v_id = ${o.v_id}`);

                const order = {
                    id: o.vch_no || `ORD-${Date.now()}`,
                    bookkeeperId: bkId,
                    type: isSalesOrder ? 'sales_order' : 'purchase_order',
                    date: this.formatDate(o.date), // Requires formatDate helper, assume it exists or use new Date
                    customerName: isSalesOrder ? o.debit : o.credit,
                    items: items.map(i => ({
                        name: i.item,
                        quantity: parseFloat(i.units) || 0,
                        rate: parseFloat(i.sp_per_unit) || 0,
                        amount: (parseFloat(i.units) || 0) * (parseFloat(i.sp_per_unit) || 0)
                    })),
                    total: parseFloat(o.amount) || 0,
                    status: 'open',
                    source: 'bookkeeper'
                };

                existingOrders.push(order);
                imported++;
            });

            DataManager.saveData('orders', existingOrders);
            return { imported: imported };
        } catch (e) {
            return { imported: 0, error: e.message };
        }
    },

    /**
     * Import Inventory from BookKeeper
     */
    async importInventory(tableName = 'item_measure') {
        const items = this.query(`SELECT * FROM ${tableName}`);
        const categories = this.getTables().includes('item_category') ? this.query('SELECT * FROM item_category') : [];
        const subcategories = this.getTables().includes('item_subcategory') ? this.query('SELECT * FROM item_subcategory') : [];

        // NEW: Check for separate 'stock' table
        let stockMap = {};
        if (this.getTables().includes('stock')) {
            try {
                const stockData = this.query('SELECT * FROM stock');

                // DYNAMICALLY DETECT KEYS from the first row
                if (stockData.length > 0) {
                    const sample = stockData[0];
                    const keys = Object.keys(sample);
                    if (!this.importStats.debugColumns) this.importStats.debugColumns = {};
                    this.importStats.debugColumns['stock_table'] = keys;

                    // Find ID Key: looks like 'item_id', 'inventory_id', 'inventory_item_id', 'id'
                    const idKey = keys.find(k => {
                        const lk = k.toLowerCase();
                        return lk === 'inventory_item_id' || lk.includes('item_id') || lk === 'inventory_id' || lk === 'id' || lk.includes('guid');
                    });

                    // Find Quantity Key: looks like 'stock', 'qty', 'balance', 'current'
                    const qtyKey = keys.find(k => {
                        const lk = k.toLowerCase();
                        return (lk.includes('stock') || lk.includes('qty') || lk.includes('bal') || lk.includes('current') || lk === 'qty_in_hand') && !lk.includes('id');
                    });

                    console.log(`[Import] Dynamic Stock Keys detected -> ID: ${idKey}, QTY: ${qtyKey}, All Keys:`, keys);

                    if (qtyKey) {
                        // DUAL MAPPING STRATEGY: Map by both ID and NAME
                        // Some schemas use inventory_item_id, others use stock_name

                        const nameKey = keys.find(k => k.toLowerCase().includes('stock_name') || k.toLowerCase().includes('item_name'));

                        this.importStats.debugColumns['stock_mapping'] = {
                            idKey: idKey || 'none',
                            nameKey: nameKey || 'none',
                            qtyKey: qtyKey
                        };

                        // DEBUG: Capture one full row to verify IDs
                        this.importStats.debugColumns['DEBUG_STOCK_ROW'] = stockData[0];

                        // TRACK LATEST BALANCE: Stock table might have multiple entries (history).
                        // We need the one with the latest Date or highest ID.
                        const latestEntryMap = {}; // key -> { date, id, val }

                        stockData.forEach(s => {
                            const val = parseFloat(s[qtyKey]);
                            if (isNaN(val)) return;

                            const date = s.date || '1970-01-01';
                            const rowId = s.id || 0;

                            // Strategy 1: Map by ID (if idKey exists)
                            if (idKey && s[idKey]) {
                                const itemId = s[idKey];
                                const key = `id_${itemId}`;

                                if (!latestEntryMap[key] || date > latestEntryMap[key].date || (date === latestEntryMap[key].date && rowId > latestEntryMap[key].id)) {
                                    latestEntryMap[key] = { date, id: rowId, val };
                                    stockMap[itemId] = val; // Map by actual item ID
                                }
                            }

                            // Strategy 2: Map by NAME (fallback or additional mapping)
                            if (nameKey && s[nameKey]) {
                                const itemName = s[nameKey];
                                const key = `name_${itemName.trim().toLowerCase()}`;

                                if (!latestEntryMap[key] || date > latestEntryMap[key].date || (date === latestEntryMap[key].date && rowId > latestEntryMap[key].id)) {
                                    latestEntryMap[key] = { date, id: rowId, val };
                                    stockMap[itemName.trim().toLowerCase()] = val; // Map by name
                                }
                            }
                        });

                        console.log(`[Import] Loaded separate stock table with ${Object.keys(stockMap).length} entries (Mapped by ${idKey ? 'ID+' : ''}Name, Latest Balance).`);
                        console.log(`[Import] Sample stock map keys:`, Object.keys(stockMap).slice(0, 10));
                        // DEBUG: Log if we found 'OXYGEN' in the stock map
                        const oxyKey = Object.keys(stockMap).find(k => k.includes('oxygen'));
                        if (oxyKey) console.log(`[Import] Stock for [${oxyKey}]: ${stockMap[oxyKey]}`);
                    }
                }
            } catch (e) {
                console.warn('[Import] Failed to read separate stock table:', e);
            }
        }

        // DEBUG: Capture Item Row
        if (items.length > 0) {
            if (!this.importStats.debugColumns) this.importStats.debugColumns = {};
            this.importStats.debugColumns['DEBUG_ITEM_ROW'] = items[0];
        }

        // Create category lookup
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.category_id] = cat.category_name;
        });

        // Create subcategory lookup
        const subcatMap = {};
        subcategories.forEach(sub => {
            subcatMap[sub.subcategory_id] = {
                name: sub.subcategory_name,
                category: categoryMap[sub.category_id] || 'General'
            };
        });

        const existingInventory = DataManager.getData('inventory') || [];
        const existingTxns = DataManager.getData('inventoryTransactions') || [];
        let imported = 0;
        let updated = 0;
        let skipped = 0;

        for (const item of items) {
            // Try all likely column names for Item Name
            const itemName = (item.item || item.item_name || item.name || item.item_desc || item.product_name || '').trim();
            if (!itemName) {
                skipped++;
                continue;
            }

            const normalized = this.normalizeName(itemName);

            // FILTER: Skip Service items if they appear in inventory list
            const lowerName = itemName.toLowerCase();
            if (lowerName.includes('service') || lowerName.includes('charge') || lowerName.includes('installation') || lowerName.includes('labour')) {
                // Double check stock to be safe (though services usually have 0 stock)
                // We'll filter them out here effectively
                skipped++;
                continue;
            }

            const subcat = subcatMap[item.item_subcategory_id] || {};

            // DEBUG: Capture columns from First Item to debug Zero Stock issue
            if (imported === 0 && !this.importStats.debugColumns) {
                this.importStats.debugColumns = {};
            }
            if (imported === 0) {
                this.importStats.debugColumns['inventory'] = Object.keys(item);
                console.log('[Import] [DEBUG] Inventory Columns:', Object.keys(item));
                console.log('[Import] [DEBUG] First Inventory Item:', item);
            }

            const getVal = (i, keys) => this.getVal(i, keys);
            const getStr = (i, keys) => this.getStr(i, keys);

            // COMPREHENSIVE STOCK TRACKING
            // 1. Try separate stock table map (HIGHEST PRIORITY - more real-time)
            const itemId = item.item_id || item.id || item.inventory_item_id || item.guid || item.item_guid;
            let currentStock = 0;
            let stockFoundInMap = false;

            if (itemId && stockMap[itemId] !== undefined) {
                currentStock = stockMap[itemId];
                stockFoundInMap = true;
            } else if (itemName) {
                const nameKey = itemName.trim().toLowerCase();
                if (stockMap[nameKey] !== undefined) {
                    currentStock = stockMap[nameKey];
                    stockFoundInMap = true;
                }
            }

            // 2. Fallback to item_measure columns if not in stock table
            if (!stockFoundInMap) {
                const dynamicKeys = Object.keys(item).filter(k =>
                    k.toLowerCase().startsWith('closing inventory') ||
                    k.toLowerCase().startsWith('closing stock') ||
                    k.toLowerCase().includes('balance (as on') ||
                    k.toLowerCase().includes('stock (as on')
                );
                currentStock = getVal(item, [...dynamicKeys, 'cl_bal', 'units_left', 'closing_stock', 'current_stock', 'stock', 'qty_in_hand', 'balance_qty', 'closing_balance', 'qty', 'quantity', 'units_on_hand', 'on_hand_qty', 'current_qty', 'qty_on_hand']);
            }

            const openingStock = getVal(item, ['op_bal', 'opening_stock', 'opening_balance', 'op_stock', 'Initial Quantity']);
            const purchasePrice = getVal(item, ['defaultpurchaseprice', 'purchase_rate', 'cost_price', 'Default Purchase Price (Ex-Tax)']);
            const stockValue = getVal(item, ['stock_value', 'closing_value', 'cl_value']) || (currentStock * purchasePrice);

            let hsn = this.findHSNFuzzy(item);
            if (!hsn && items.length < 500) {
                // Try learning from transactions if not in master
                hsn = await this.learnHSNFromTransactions(itemName);
            }

            const unitRaw = (getStr(item, ['Unit Of Measure*', 'unit_of_measure', 'u_measure', 'unit', 'u_name', 'unit_name', 'units_name', 'uom', 'measure_unit']) || '').toLowerCase();
            const materialData = {
                name: itemName,
                description: (item.item_desc || item.description || item.remarks || item['Item Description'] || item.ite_desc || item.item_note || item.notes || '').trim(),
                unit: (unitRaw === 'service' || !unitRaw || unitRaw === 'numbers' || unitRaw === 'u' || unitRaw === 'unit') ? 'nos' : unitRaw,
                category: subcat.category || getStr(item, ['Category']) || 'General',
                subcategory: subcat.name || getStr(item, ['Subcategory']) || '',
                currentStock: currentStock,
                openingStock: openingStock,
                unitsLeft: currentStock,
                stockValue: stockValue,
                rate: this.findRateFuzzy(item),
                purchaseRate: purchasePrice,
                mrp: getVal(item, ['mrp', 'max_retail_price', 'm_r_p', 'MRP', 'M.R.P.']),
                moq: getVal(item, ['min_qty', 'reorder_level', 'min_order_qty', 'minimum_qty', 'Minimum Order Quantity']),
                gstRate: item.scheme_name || item['Tax Scheme Name'] || 'GST@18%',
                hsnCode: hsn,
                type: (item.item_type || (unitRaw === '' || unitRaw === 'service' ? 'service' : 'product')).toLowerCase(),
                status: (item.status === 0 || item['Active Status'] === 'NA') ? 'inactive' : 'active',
                source: 'bookkeeper'
            };

            const existingIdx = existingInventory.findIndex(i => this.normalizeName(i.name) === normalized);
            if (existingIdx >= 0) {
                const existing = existingInventory[existingIdx];
                // MERGE STRATEGY: Prioritize non-zero stock, HSNs, and normalized units
                // We ONLY overwrite stock if the new value is non-zero OR if the existing was already 0.
                // This prevents partial imports from wiping out existing stock counts.
                if (materialData.currentStock !== 0 || (existing.currentStock || 0) === 0) {
                    existing.currentStock = materialData.currentStock;
                    existing.unitsLeft = materialData.currentStock;
                }
                if (materialData.hsnCode && (!existing.hsnCode || existing.hsnCode === 'NA')) existing.hsnCode = materialData.hsnCode;
                if (materialData.unit && (existing.unit === 'service' || existing.unit === 'Numbers')) existing.unit = materialData.unit;
                if (materialData.rate > existing.rate) existing.rate = materialData.rate;
                if (materialData.type === 'service') existing.type = 'service';
                existing.updatedAt = new Date().toISOString();
                updated++;
            } else {
                const newItem = {
                    id: `MAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    ...materialData,
                    createdAt: new Date().toISOString()
                };
                if (openingStock !== 0) {
                    existingTxns.push({
                        id: `TXN-BK-OP-${newItem.id}-${Date.now()}`,
                        materialId: newItem.id,
                        type: 'in',
                        quantity: openingStock,
                        date: new Date().toISOString(),
                        remarks: 'Opening Balance (BookKeeper Import)'
                    });
                }
                existingInventory.push(newItem);
                imported++;
            }
        }

        await DataManager.saveData('inventory', existingInventory);
        await DataManager.saveData('inventoryTransactions', existingTxns);

        console.log(`[Import] ✅ Inventory: ${imported} items imported, ${skipped} skipped (Total in DB: ${items.length})`);
        if (imported > 0) {
            console.log(`[Import] Sample imported items:`, existingInventory.slice(-Math.min(3, imported)).map(i => i.name));
        }

        return { imported, skipped, total: items.length };
    },

    /**
     * Import Services from BookKeeper
     */
    async importServices(tableName = 'service') {
        const services = this.query(`SELECT * FROM ${tableName}`);
        const existingInventory = DataManager.getData('inventory') || [];
        const existingNames = new Set(existingInventory.map(s => s.name.toLowerCase()));
        let imported = 0;
        let skipped = 0;

        // NEW: Also save to dedicated 'services' collection for Service Manager UI
        const serviceCollection = DataManager.getData('gtes_services') || [];
        const existingServiceIds = new Set(serviceCollection.map(s => s.id));

        const getStr = (obj, keys) => this.getStr(obj, keys);

        for (const service of services) {
            const serviceName = service.service_name || service.name || '';
            if (!serviceName) {
                skipped++;
                continue;
            }

            // Generate consistent ID for services based on name to avoid dups
            const safeNameId = 'SRV-' + serviceName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();

            let hsn = this.findHSNFuzzy(service);
            if (!hsn) {
                hsn = await this.learnHSNFromTransactions(serviceName);
            }
            const unitRaw = (service.units_name || '').toLowerCase();

            const serviceItem = {
                id: safeNameId,
                name: serviceName,
                description: service.service_desc || service.description || service.remarks || '',
                unit: (unitRaw === 'service' || !unitRaw) ? 'nos' : unitRaw,
                category: 'Services',
                subcategory: '',

                // Stock Tracking (Services don't have stock)
                currentStock: 0,
                openingStock: 0,
                unitsLeft: 0,
                minStock: 0,

                // Pricing Details
                rate: parseFloat(service.defaultsellingprice) || parseFloat(service.rate) || 0,
                purchaseRate: parseFloat(service.defaultpurchaseprice) || 0,
                mrp: 0,

                // Tax & Compliance
                gstRate: service.scheme_name || service['Tax Scheme Name'] || 'GST@18%',
                hsnCode: hsn,
                taxType: service.tax_type || service.rrp_tax_type || '',

                // Product Details
                type: 'service',
                sku: service.sku || '',
                barcode: '',
                status: service.status === 0 ? 'inactive' : 'active',
                remarks: service.remarks || '',

                createdAt: new Date().toISOString(),
                source: 'bookkeeper_service_table',
                isHidden: true // USER REQ: Hide From Inventory List
            };

            // Add to Inventory (Hidden)
            if (!existingNames.has(serviceName.toLowerCase())) {
                serviceItem.id = safeNameId; // Use consistent ID for inventory lookup
                existingInventory.push(serviceItem);
                existingNames.add(serviceItem.name.toLowerCase());
                imported++;
            }

            // Add to Services Collection (Visible)
            // Use overwrite strategy for services collection
            const existIdx = serviceCollection.findIndex(s => s.name.toLowerCase() === serviceName.toLowerCase());
            if (existIdx >= 0) {
                serviceCollection[existIdx] = { ...serviceCollection[existIdx], ...serviceItem, id: serviceCollection[existIdx].id };
            } else {
                serviceCollection.push({ ...serviceItem, id: safeNameId });
            }
        }

        // Save both collections
        await DataManager.saveData('inventory', existingInventory);
        await DataManager.saveData('gtes_services', serviceCollection);

        console.log(`[Import] Services: ${imported} imported, ${skipped} skipped. Synced to 'gtes_services'.`);

        return { imported, skipped, total: services.length };
    },

    /**
     * Import Vouchers (Payments/Receipts)
     */
    async importVouchers(tableName = 'vouchers') {
        const vouchers = this.query(`
            SELECT * FROM ${tableName} 
            WHERE v_type LIKE '%Receipt%' 
               OR v_type LIKE '%Payment%' 
               OR v_type LIKE '%Voucher%'
               OR v_type LIKE '%Journal%'
               OR v_type LIKE '%Contra%'
            ORDER BY date DESC
        `);

        const existingVouchers = DataManager.getData('vouchers') || [];
        const existingIds = new Set(existingVouchers.map(v => v.bookkeeperId));
        const customers = CustomerManager.getAllCustomers();

        let imported = 0;
        let skipped = 0;

        for (const v of vouchers) {
            const bkId = `BK-${v.v_id}`;
            if (existingIds.has(bkId)) {
                skipped++;
                continue;
            }

            const isReceipt = v.v_type?.includes('Receipt');

            // Smart Account Selection: Ignore common Bank/Cash accounts
            const isBankOrCash = (name) => {
                if (!name) return false;
                const n = name.toLowerCase();
                return n.includes('bank') || n.includes('cash') || n.includes('petty') || n.includes('hdfc') || n.includes('icici') || n.includes('sbi') || n.includes('sbm') || n.includes('axis') || n.includes('kotak') || n.includes('indian bank') || n.includes('canara');
            };

            let bkCustomerName = '';
            const debit = (v.debit || '').trim();
            const credit = (v.credit || '').trim();

            if (isBankOrCash(debit) && !isBankOrCash(credit)) {
                bkCustomerName = credit;
            } else if (isBankOrCash(credit) && !isBankOrCash(debit)) {
                bkCustomerName = debit;
            } else {
                // Fallback to standard accounting rules if ambiguous
                bkCustomerName = (isReceipt ? credit : debit || '').trim();
            }

            // Mapping for Customer/Supplier
            let customerId = '';
            if (bkCustomerName) {
                const existingCust = customers.find(c => c.name.toLowerCase() === bkCustomerName.toLowerCase());
                if (existingCust) {
                    customerId = existingCust.id;
                } else {
                    try {
                        const newCust = await CustomerManager.addCustomer({
                            name: bkCustomerName,
                            address: '',
                            phone: '',
                            id: CustomerManager.generateCustomerId()
                        });
                        customers.push(newCust);
                        customerId = newCust.id;
                    } catch (e) {
                        console.error('Error auto-creating customer for voucher:', e);
                    }
                }
            }

            // Enhanced Payment Mode Detection
            let pMode = (v.payment_mode || v.mode || '').trim();
            const narration = (v.narration || '').toLowerCase();

            if (!pMode || pMode.toLowerCase() === 'others') {
                if (narration.includes('bank') || narration.includes('neft') || narration.includes('rtgs')) {
                    pMode = 'Bank Transfer';
                } else if (narration.includes('upi') || narration.includes('gpay') || narration.includes('phonepe')) {
                    pMode = 'UPI';
                } else if (narration.includes('cheque') || narration.includes('check')) {
                    pMode = 'Cheque';
                } else {
                    pMode = 'Cash';
                }
            }

            const voucher = {
                id: v.vch_no || `VCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                bookkeeperId: bkId,
                date: this.formatDate(v.date),
                customerId: customerId,
                customerName: bkCustomerName,
                amount: parseFloat(v.amount) || 0,
                type: isReceipt ? 'receipt' : 'payment',
                paymentMode: pMode, // Use detected mode
                mode: pMode,        // Backward compatibility
                narration: v.narration || '',
                voucherNo: v.vch_no || '',
                // Capture reference/invoice link
                linkedInvoiceId: v.ref_no || v.reference_no || v.payment_reference || v.bill_no || '',
                referenceId: v.cheque_no || v.payment_ref_no || '',
                createdAt: new Date().toISOString(),
                source: 'bookkeeper'
            };

            existingVouchers.push(voucher);
            existingIds.add(bkId);
            imported++;
        }

        // Fix existing records if they were imported with "Bank" or "Cash"
        for (let ev of existingVouchers) {
            if (ev.source === 'bookkeeper' && (ev.customerName === 'Bank' || ev.customerName === 'Cash')) {
                // We can't easily fix without v_id, but if they match by voucherNo we could try.
                // For now, the cleanupImportedData will handle the bulk fix if possible.
            }
        }

        DataManager.saveDataSync('vouchers', existingVouchers);

        return { imported, skipped, total: vouchers.length };
    },

    /**
     * Import Sales as Invoices
     */
    async importSales(voucherTable = 'vouchers', accountTable = 'account_detail') {
        // Detect available columns in vouchers table - COMPREHENSIVE CHECK
        const hasBalance = this.hasColumn(voucherTable, 'balance_amount');
        const hasBal = this.hasColumn(voucherTable, 'bal_amount');
        const hasBalAmt = this.hasColumn(voucherTable, 'balance');
        const hasPaid = this.hasColumn(voucherTable, 'total_paid');
        const hasPaidAmt = this.hasColumn(voucherTable, 'paid_amount');
        const hasPaidTotal = this.hasColumn(voucherTable, 'paid');
        const hasStatus = this.hasColumn(voucherTable, 'status');
        const hasPaymentStatus = this.hasColumn(voucherTable, 'payment_status');

        console.log('[Import] Payment column detection:', {
            hasBalance, hasBal, hasBalAmt,
            hasPaid, hasPaidAmt, hasPaidTotal,
            hasStatus, hasPaymentStatus
        });

        // Priority order for balance field
        const balanceField = hasBalance ? 'v.balance_amount' :
            (hasBal ? 'v.bal_amount' :
                (hasBalAmt ? 'v.balance' : '0'));

        // Priority order for paid field
        const paidField = hasPaid ? 'v.total_paid' :
            (hasPaidAmt ? 'v.paid_amount' :
                (hasPaidTotal ? 'v.paid' : '0'));

        const hasRoundOff = this.hasColumn(voucherTable, 'round_off');
        const hasRoundAmt = this.hasColumn(voucherTable, 'round_amt');
        const roundOffField = hasRoundOff ? 'v.round_off' : (hasRoundAmt ? 'v.round_amt' : '0');

        // Detect correct Amount Column
        let amtField = 'v.v_amt';
        if (this.hasColumn(voucherTable, 'v_amt')) amtField = 'v.v_amt';
        else if (this.hasColumn(voucherTable, 'v_bill_amt')) amtField = 'v.v_bill_amt';
        else if (this.hasColumn(voucherTable, 'taxable_v_amt')) amtField = 'v.taxable_v_amt';
        else if (this.hasColumn(voucherTable, 'taxable_amt')) amtField = 'v.taxable_amt';
        else if (this.hasColumn(voucherTable, 'amount')) amtField = 'v.amount';
        else if (this.hasColumn(voucherTable, 'total_amount')) amtField = 'v.total_amount';
        else if (this.hasColumn(voucherTable, 'v_total_amt')) amtField = 'v.v_total_amt';

        // Detect available columns in account_detail
        const accountDetailCols = [];
        // Helper to check column existence in account table logic...
        // ... (Skipping full alias logic rewrite for brevity, assuming standard acc table structure mostly stable
        //      or we simply use accountTable variable in hasColumn checks)

        const hasCol = (col) => this.hasColumn(accountTable, col);

        const accColMap = {
            'address': 'acc.address',
            'address2': 'acc.address2',
            'tax_regn': 'acc.tax_regn as gstin',
            'tax_regn2': 'acc.tax_regn2 as pan',
            'gstin': 'acc.gstin',
            'pan': 'acc.pan',
            'state': 'acc.state',
            'pincode': 'acc.pincode',
            'contact': 'acc.contact as phone',
            'mobile': 'acc.mobile as phone',
            'email_id': 'acc.email_id as email',
            'email': 'acc.email'
        };

        // Priority columns to avoid duplicates if both exist
        ['address', 'address2', 'state', 'pincode', 'gstin', 'pan', 'phone', 'email'].forEach(alias => {
            if (alias === 'address' && hasCol('address')) accountDetailCols.push('acc.address');
            else if (alias === 'address2' && hasCol('address2')) accountDetailCols.push('acc.address2');
            else if (alias === 'state' && hasCol('state')) accountDetailCols.push('acc.state');
            else if (alias === 'pincode' && hasCol('pincode')) accountDetailCols.push('acc.pincode');
            else if (alias === 'gstin') {
                if (hasCol('tax_regn')) accountDetailCols.push('acc.tax_regn as gstin');
                else if (hasCol('gstin')) accountDetailCols.push('acc.gstin');
            }
            else if (alias === 'pan') {
                if (hasCol('tax_regn2')) accountDetailCols.push('acc.tax_regn2 as pan');
                else if (hasCol('pan')) accountDetailCols.push('acc.pan');
            }
            else if (alias === 'phone') {
                if (hasCol('contact')) accountDetailCols.push('acc.contact as phone');
                else if (hasCol('mobile')) accountDetailCols.push('acc.mobile as phone');
            }
            else if (alias === 'email') {
                if (hasCol('email_id')) accountDetailCols.push('acc.email_id as email');
                else if (hasCol('email')) accountDetailCols.push('acc.email');
            }
        });
        const accSelect = accountDetailCols.length > 0 ? `, ${accountDetailCols.join(', ')}` : '';

        const hasRefNo = this.hasColumn(voucherTable, 'ref_no');
        const hasBillNo = this.hasColumn(voucherTable, 'bill_no');
        const vchNoField = `COALESCE(NULLIF(CAST(v.vch_no AS TEXT), '0'), NULLIF(CAST(v.vch_no AS TEXT), ''), ${hasRefNo ? 'v.ref_no' : "''"}, ${hasBillNo ? 'v.bill_no' : "''"}, '') as vch_no`;

        // First get unique sales vouchers with customer details
        const salesVouchers = this.query(`
            SELECT DISTINCT v.v_id, v.debit as customer, v.date, ${amtField} as amount, v.narration, ${vchNoField}, 
                   COALESCE(${balanceField}, 0) as balance_amount,
                   COALESCE(${paidField}, 0) as total_paid,
                   COALESCE(${roundOffField}, 0) as round_off,
                   v.v_type
                   ${accSelect}
            FROM ${voucherTable} v
            LEFT JOIN ${accountTable} acc ON v.debit = acc.aname
            WHERE (v.v_type LIKE '%Sales%' 
               OR v.v_type LIKE '%Tax Invoice%' 
               OR v.v_type LIKE '%Invoice%'
               OR v.v_type LIKE '%Sale%')
               AND v.debit NOT LIKE '%Cash%' AND v.debit NOT LIKE '%Bank%'
            ORDER BY v.date DESC
        `);

        const existingInvoices = DataManager.getData('invoices') || [];
        const existingTxns = DataManager.getData('inventoryTransactions') || [];
        const inventory = DataManager.getData('inventory') || [];
        const customers = CustomerManager.getAllCustomers();

        let imported = 0;
        let updated = 0;

        for (const sale of salesVouchers) {
            const bkId = `BK-INV-${sale.v_id}`;
            const invNo = (sale.vch_no || '').trim();

            // Mapping for Customer
            let customerId = '';
            const bkCustomerName = (sale.customer || '').trim();
            if (bkCustomerName) {
                const existingCust = customers.find(c => c.name.toLowerCase() === bkCustomerName.toLowerCase());
                if (existingCust) customerId = existingCust.id;
                else {
                    try {
                        const newCust = await CustomerManager.addCustomer({
                            name: bkCustomerName, id: CustomerManager.generateCustomerId()
                        });
                        customers.push(newCust);
                        customerId = newCust.id;
                    } catch (e) { }
                }
            }


            const totalAmt = parseFloat(sale.amount) || 0;
            let totalPaid = parseFloat(sale.total_paid) || 0;
            let balanceAmt = parseFloat(sale.balance_amount) || 0;

            // Priority 0: Check 'bill_receipt_payment' table (Best Reliability)
            if (this.getTables().includes('bill_receipt_payment')) {
                try {
                    const brCols = this.getColumns('bill_receipt_payment');
                    // UPDATED: Check for b_v_id first (found in user schema)
                    const billIdCol = brCols.includes('b_v_id') ? 'b_v_id' : (brCols.includes('bill_id') ? 'bill_id' : (brCols.includes('bill_no') ? 'bill_no' : ''));
                    const amtCol = brCols.includes('amount') ? 'amount' : 'adjusted_amount';

                    if (billIdCol && amtCol) {
                        // Check both v_id and invNo to be safe
                        const brQuery = `SELECT sum(${amtCol}) as paid FROM bill_receipt_payment WHERE ${billIdCol} = '${sale.v_id}' OR ${billIdCol} = '${invNo}'`;
                        const brRes = this.query(brQuery);
                        if (brRes.length > 0 && brRes[0].paid) {
                            const foundPaid = parseFloat(brRes[0].paid);
                            // Only add if it's not already accounted for
                            if (totalPaid < foundPaid) totalPaid = foundPaid;
                            balanceAmt = totalAmt - totalPaid;
                        }
                    }
                } catch (e) {
                    console.warn('[Import] Error reading bill_receipt_payment:', e);
                }
            }

            // Check for payments in Vouchers table if not already found (for Sales -> Receipts)
            if (totalPaid === 0 && this.getTables().includes('vouchers')) {
                try {
                    // Check standard reference columns
                    const refCols = ['ref_no', 'reference_no', 'payment_reference', 'bill_no'];
                    const vCols = this.getColumns('vouchers');
                    const validRefCols = refCols.filter(c => vCols.includes(c));

                    if (validRefCols.length > 0) {
                        const conditions = validRefCols.map(c => `${c} = '${invNo}'`).join(' OR ');
                        const paymentQuery = `
                            SELECT sum(amount) as total_paid_vch 
                            FROM vouchers 
                            WHERE (v_type LIKE '%Receipt%' OR v_type LIKE '%Contra%') 
                            AND (${conditions})
                        `;
                        const paymentResult = this.query(paymentQuery);
                        if (paymentResult.length > 0 && paymentResult[0].total_paid_vch) {
                            totalPaid += parseFloat(paymentResult[0].total_paid_vch);
                            // Recalculate balance since we found more payments
                            balanceAmt = totalAmt - totalPaid;
                        }
                    }
                } catch (e) {
                    console.warn('[Import] Error checking linked receipts:', e);
                }
            }

            // Priority Check: 'Set Off Voucher Number With Amount' (Explicit Link provided by User)
            // Format example: "INV1:200;INV2:100"
            if (this.getTables().includes('vouchers')) {
                const vTaxCols = this.getColumns('vouchers');
                const setOffCol = vTaxCols.find(c => c.includes('set_off') || c.includes('setoff') || (c.includes('voucher') && c.includes('amount') && c.includes('number')));

                if (setOffCol && totalPaid < totalAmt) {
                    try {
                        const setOffQuery = `SELECT ${setOffCol} as allocation_str FROM vouchers WHERE ${setOffCol} LIKE '%${invNo}%'`;
                        const setOffRes = this.query(setOffQuery);

                        let allocatedAmt = 0;
                        setOffRes.forEach(row => {
                            if (row.allocation_str) {
                                // Split by comma OR semicolon for robustness
                                const pairs = row.allocation_str.split(/[;,]/);
                                pairs.forEach(pair => {
                                    if (pair.includes(invNo)) {
                                        const parts = pair.split(':');
                                        if (parts.length >= 2 && parts[0].includes(invNo)) {
                                            allocatedAmt += parseFloat(parts[1]) || 0;
                                        }
                                    }
                                });
                            }
                        });

                        if (allocatedAmt > 0) {
                            totalPaid += allocatedAmt;
                            balanceAmt = totalAmt - totalPaid;
                        }
                    } catch (e) { }
                }
            }

            // DEBUG: Log payment status calculation for first 3 invoices
            if (imported < 3) {
                console.log(`[Import] Invoice ${invNo} Payment Status:`, {
                    hasBalance, hasBal, hasBalAmt, hasPaid, hasPaidAmt, hasPaidTotal,
                    totalAmt, totalPaid, balanceAmt,
                    rawBalance: sale.balance_amount,
                    rawPaid: sale.total_paid
                });
            }

            let status = 'pending'; // Default to pending

            // Priority 1: Use balance_amount if available (most reliable)
            if (hasBalance || hasBal || hasBalAmt) {
                if (balanceAmt <= 0 && totalAmt > 0) {
                    status = 'paid';
                } else if (balanceAmt > 0 && balanceAmt < totalAmt) {
                    status = 'partial';
                } else if (balanceAmt >= totalAmt && totalAmt > 0) {
                    status = 'pending';
                }
            }
            // Priority 2: Use total_paid if balance not available
            else if (hasPaid || hasPaidAmt || hasPaidTotal) {
                if (totalPaid >= totalAmt && totalAmt > 0) {
                    status = 'paid';
                } else if (totalPaid > 0 && totalPaid < totalAmt) {
                    status = 'partial';
                } else {
                    status = 'pending';
                }
            }
            // Priority 3: If no payment fields, assume unpaid
            else {
                status = 'pending';
            }

            if (imported < 3) {
                console.log(`[Import] Invoice ${invNo} Final Status: ${status}`);
            }

            // HYPER-ROBUST ITEM RECOVERY
            let itemsRaw = [];
            const possibleTables = [
                // PRIORITY: Known tables from user's database (service_sales moved up for priority)
                'sales', 'service_sales', 'purchases', 'po_so_item',
                // Common variations
                'sale_item', 'sales_item', 'voucher_item', 'vch_item',
                'service_item', 'service_voucher_item', 'service_details',
                'inventory_transaction', 'inventory_transactions',
                'items', 'bill_item', 'bill_items', 'sale_details',
                'inventory_txn', 'vch_details', 'sales_details_item',
                'estimate_item', 'order_item', 'job_card_item',
                'transaction_detail', 'voucher_item_detail', 'sale_item_detail'
            ];
            const idCols = ['v_id', 'voucher_id', 'vch_id', 'parent_id', 'ref_id', 'vouch_id', 'v_no', 'v_vchid'];
            const vchCols = ['vch_no', 'voucher_no', 'bill_no', 'inv_no', 'invoice_no', 'reference_no', 'bill_id', 'vch_number'];

            for (const table of possibleTables) {
                if (!this.getTables().includes(table)) continue;

                let tableFound = false;
                for (const idCol of idCols) {
                    if (this.hasColumn(table, idCol)) {
                        const results = this.query(`SELECT * FROM ${table} WHERE ${idCol} = '${sale.v_id}' OR ${idCol} = ${sale.v_id}`);
                        if (results.length > 0) {
                            itemsRaw.push(...results);
                            console.log(`[Import] Found ${results.length} items in [${table}] via [${idCol}] for VID:${sale.v_id}`);
                            tableFound = true;
                            break;
                        }
                    }
                }

                if (!tableFound && invNo) {
                    const numericVchNo = parseInt(invNo);
                    for (const vchCol of vchCols) {
                        if (this.hasColumn(table, vchCol)) {
                            const trimmedVchNo = invNo.replace(/^0+/, '');
                            const results = this.query(`SELECT * FROM ${table} WHERE ${vchCol} = '${invNo}' OR ${vchCol} = '${trimmedVchNo}' OR ${vchCol} = '${numericVchNo}'`);

                            if (results.length > 0) {
                                itemsRaw.push(...results);
                                tableFound = true;
                                break;
                            } else if (!isNaN(numericVchNo)) {
                                try {
                                    const numResults = this.query(`SELECT * FROM ${table} WHERE CAST(${vchCol} AS INTEGER) = ${numericVchNo}`);
                                    if (numResults.length > 0) {
                                        itemsRaw.push(...numResults);
                                        tableFound = true;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }
                    }
                }
            }

            // Strategy 2: Disabled (was causing SQL errors with NaN values)
            // The targeted recovery in Strategy 1 is sufficient

            // Exhaustive Tax Fetching
            let taxes = [];
            const taxTables = ['voucher_tax', 'tax_details', 'vch_tax'];
            for (const tTable of taxTables) {
                if (!this.getTables().includes(tTable)) continue;
                for (const tCol of ['v_id', 'voucher_id', 'vch_id', 'parent_id', 'ref_id']) {
                    if (this.hasColumn(tTable, tCol)) {
                        const tRes = this.query(`SELECT * FROM ${tTable} WHERE ${tCol} = '${sale.v_id}' OR ${tCol} = ${sale.v_id}`);
                        if (tRes.length > 0) { taxes = tRes; break; }
                    }
                }
                if (taxes.length > 0) break;
            }

            const invoice = {
                id: invNo || `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                bookkeeperId: bkId,
                date: this.formatDate(sale.date),
                customerId: customerId,
                customerName: bkCustomerName,
                customerAddress: `${sale.address || ''} ${sale.address2 || ''} ${sale.state || ''} ${sale.pincode || ''} India`.trim(),
                customerGstin: sale.gstin || '',
                customerPan: sale.pan || '',
                invoiceNo: invNo || '',
                items: itemsRaw.map(item => {
                    // RESOLVE NAME & IDENTITIES
                    let name = (item.service || item.item || item.item_name || item.name || item.service_name || item.particulars || item.description || item.item_desc || item.vch_item || item.ite_name || '').trim();
                    const itemId = item.item_id || item.ite_id || item.i_id || item.product_id || '';

                    // If name is blank or looks like a technical ID, try a direct DB lookup in item_measure
                    if (!name || /^\d+$/.test(name) || name.length < 2) {
                        const lookupId = name || itemId;
                        if (lookupId) {
                            try {
                                const resolved = this.query(`SELECT * FROM item_measure WHERE item_id = '${lookupId}' OR item = '${lookupId}' LIMIT 1`);
                                if (resolved.length > 0) {
                                    name = (resolved[0].item || name).trim();
                                }
                            } catch (e) { }
                        }
                    }

                    // FALLBACK: Look up Account Name if this is a Service/Ledger entry
                    if ((!name || name === 'Unknown Item' || /^\d+$/.test(name)) && (item.account_id || item.ledger_id || item.ac_id)) {
                        const acId = item.account_id || item.ledger_id || item.ac_id;
                        try {
                            const acRes = this.query(`SELECT account_name, ledger_name FROM account_ledger WHERE account_id = '${acId}' OR ledger_id = '${acId}' LIMIT 1`);
                            if (acRes.length > 0) {
                                name = (acRes[0].account_name || acRes[0].ledger_name || name).trim();
                            }
                        } catch (e) { }
                    }

                    if (!name) name = 'Unknown Item';

                    const invItem = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
                    const qty = parseFloat(item.units || item.quantity || item.qty || item.qty_out || item.quantity_out || item.u_in || item.u_out || item.units_out || item.qty_in || item.Qty || 1) || 1;

                    let rate = this.findRateFuzzy(item) || parseFloat(item.Rate || 0);
                    const hsn = this.findHSNFuzzy(item) || invItem?.hsnCode || '';

                    let lineAmount = parseFloat(item.amount || item.total || item.total_amount || item.taxable_value || item.net_amount || item.taxable_amount || item.credit || item.debit || item.Subtotal || 0);
                    lineAmount = Math.abs(lineAmount);

                    if (lineAmount === 0 && qty !== 0 && rate !== 0) {
                        lineAmount = qty * rate;
                    }
                    if (rate === 0 && lineAmount !== 0 && qty !== 0) {
                        rate = lineAmount / qty;
                    }
                    if ((qty === 0 || qty === 1) && lineAmount > 0 && rate === 0) {
                        rate = lineAmount;
                    }

                    let disc = parseFloat(item.discount || item.disc_amt || item.disc || 0);
                    if (!disc) {
                        const discPer = parseFloat(item.discount_percentage || item.disc_per || item.disc_rate || 0);
                        if (discPer > 0) disc = (lineAmount * discPer) / 100;
                    }

                    let lineTaxRate = 0;
                    const taxStr = String(item.scheme_name || item.tax_percent || item.tax_rate || item.t_rate || item.tax_account_name || '');
                    const taxMatch = taxStr.match(/(\d+(\.\d+)?)/);
                    if (taxMatch) {
                        lineTaxRate = parseFloat(taxMatch[0]);
                    } else {
                        lineTaxRate = parseFloat(item.gst_per || item.tax_per || (parseFloat(item.cgst_rate || 0) + parseFloat(item.sgst_rate || 0))) || 0;
                    }

                    let lineCgst = parseFloat(item.cgst_amount || item.cgst_amt || item.tax_amt_cgst || 0);
                    let lineSgst = parseFloat(item.sgst_amount || item.sgst_amt || item.tax_amt_sgst || 0);
                    let lineIgst = parseFloat(item.igst_amount || item.igst_amt || item.tax_amt_igst || 0);

                    return {
                        name,
                        // POWERFUL: Transaction-level description priority
                        description: (
                            item.item_particulars || item.vch_particulars || item.item_remarks || item.vch_item_remarks ||
                            item.ite_remarks || item.ite_particulars || item.ite_para || item.i_remarks ||
                            item.item_note || item.item_desc || item.service_desc || item.particulars ||
                            item.remarks || item.narration || item.notes || item.ite_desc || invItem?.description || ''
                        ).trim(),
                        hsn: hsn,
                        quantity: qty,
                        unit: (() => {
                            const u = (item.unit || item.unit_name || item.uom || item.measure_unit || invItem?.unit || 'nos').toLowerCase();
                            return (u === 'service' || u === 'numbers' || u === 'u' || u === 'unit') ? 'nos' : u;
                        })(),
                        rate: rate,
                        discount: disc,
                        gstRate: lineTaxRate ? (lineTaxRate + '%') : (item.scheme_name || ''),
                        amount: parseFloat(item.amount || item.taxable_value || item.taxable_amt || (qty * rate)) || 0,
                        cgst: lineCgst,
                        sgst: lineSgst,
                        igst: lineIgst
                    };
                }),
                subtotal: 0,
                gst: { cgst: 0, sgst: 0, igst: 0 },
                total: totalAmt,
                roundOff: parseFloat(sale.round_off) || 0,
                status: status,
                narration: sale.narration || '',
                createdAt: new Date().toISOString(),
                source: 'bookkeeper',
                type: 'with-bill'
            };

            // Calculate Subtotal and GST
            invoice.subtotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);

            // 1. Tax from voucher_tax
            taxes.forEach(tax => {
                // Ensure we pick the actual tax amount, not the voucher total
                // BookKeeper sometimes stores the parent voucher amount in 'amount' column
                const amt = parseFloat(tax.tax_amt || tax.sc_amt || tax.v_tax_val || tax.tax_amount || tax.amount || 0) || 0;

                // CRITICAL: If tax amount matches total voucher amount, it's likely a mis-mapped column
                if (amt === totalAmt && totalAmt > 0) {
                    console.warn(`[Import] Potential tax mapping error: tax amount ${amt} matches total ${totalAmt}. Skipping.`);
                    return;
                }

                const scheme = String(tax.scheme_name || tax.tax_name || '').toUpperCase();
                if (scheme.includes('CGST')) invoice.gst.cgst += amt;
                else if (scheme.includes('SGST')) invoice.gst.sgst += amt;
                else if (scheme.includes('IGST')) invoice.gst.igst += amt;
            });

            // 2. Fallback Tax from item lines
            if (invoice.gst.cgst === 0 && invoice.gst.sgst === 0 && invoice.gst.igst === 0) {
                invoice.items.forEach(item => {
                    // Ensure line items have correct GST components if rate is provided
                    if ((!item.cgst && !item.sgst && !item.igst) && item.gstRate) {
                        const rate = parseFloat(item.gstRate);
                        if (rate > 0) {
                            const totalLineTax = (item.amount * rate) / 100;
                            // Split default 50/50 for CGST/SGST if no IGST
                            item.cgst = totalLineTax / 2;
                            item.sgst = totalLineTax / 2;
                        }
                    }
                    invoice.gst.cgst += (item.cgst || 0);
                    invoice.gst.sgst += (item.sgst || 0);
                    invoice.gst.igst += (item.igst || 0);
                });
            }

            // 3. Mathematical Fallback
            if (invoice.gst.cgst === 0 && invoice.gst.sgst === 0 && invoice.gst.igst === 0 && totalAmt > invoice.subtotal) {
                const diff = totalAmt - invoice.subtotal - invoice.roundOff;
                if (diff > 0) {
                    invoice.gst.cgst = diff / 2;
                    invoice.gst.sgst = diff / 2;
                }
            }

            invoice.cgst = invoice.gst.cgst;
            invoice.sgst = invoice.gst.sgst;
            invoice.igst = invoice.gst.igst;

            // EMERGENCY RECONSTRUCTION
            if (invoice.items.length === 0 && totalAmt > 0) {
                const taxSum = invoice.gst.cgst + invoice.gst.sgst + invoice.gst.igst;
                let baseAmt = totalAmt - taxSum - invoice.roundOff;

                // If baseAmt is 0 or negative, it means totalAmt was likely a tax-exclusive value
                if (baseAmt <= 0) baseAmt = totalAmt;

                // Calculate actual GST rate (not the split percentage)
                // If tax is 248 and base is 496, the GST rate is (248/496)*100 = 50%
                // But we want the TOTAL GST rate, not the CGST/SGST split
                const totalGstRate = (taxSum > 0 && baseAmt > 0) ? Math.round((taxSum / baseAmt) * 100) : 0;

                invoice.items.push({
                    name: sale.narration || 'BookKeeper Sale Item',
                    description: sale.narration || 'General Sales from BookKeeper',
                    hsn: '',
                    quantity: 1,
                    unit: 'nos',
                    rate: baseAmt,
                    amount: baseAmt,
                    discount: 0,
                    gstRate: totalGstRate > 0 ? (totalGstRate + '%') : '',
                    cgst: invoice.gst.cgst,
                    sgst: invoice.gst.sgst
                });
                invoice.subtotal = baseAmt;
            }

            // Mark as GST Bill (With Bill) - this ensures it appears in the "With Bill (GST)" tab
            invoice.type = 'with-bill';
            invoice.billType = 'gst';
            invoice.hasGst = true;

            // Update or Add
            const idx = existingInvoices.findIndex(i => i.bookkeeperId === bkId || (invNo && (i.invoiceNo || '').toLowerCase() === invNo.toLowerCase()));
            if (idx >= 0) {
                invoice.id = existingInvoices[idx].id;
                existingInvoices[idx] = invoice;
                updated++;
            } else {
                existingInvoices.push(invoice);
                imported++;
            }
        }

        await DataManager.saveData('invoices', existingInvoices);
        return { imported, updated, total: salesVouchers.length };
    },

    /**
     * Import Purchases as Expenses
     */
    async importPurchases() {
        // Detect available columns in vouchers table
        const hasBalance = this.hasColumn('vouchers', 'balance_amount');
        const hasBal = this.hasColumn('vouchers', 'bal_amount');
        const hasBalVar = this.hasColumn('vouchers', 'bal');
        const hasPaid = this.hasColumn('vouchers', 'total_paid');
        const hasPaidAmt = this.hasColumn('vouchers', 'paid_amount');
        const hasPaidVar = this.hasColumn('vouchers', 'paid');

        const balanceField = hasBalance ? 'v.balance_amount' : (hasBal ? 'v.bal_amount' : (hasBalVar ? 'v.bal' : '0'));
        const paidField = hasPaid ? 'v.total_paid' : (hasPaidAmt ? 'v.paid_amount' : (hasPaidVar ? 'v.paid' : '0'));
        const hasRoundOff = this.hasColumn('vouchers', 'round_off');
        const hasRoundAmt = this.hasColumn('vouchers', 'round_amt');
        const hasRoundOffAmt = this.hasColumn('vouchers', 'round_off_amount');
        const roundedOffField = hasRoundOff ? 'v.round_off' : (hasRoundAmt ? 'v.round_amt' : (hasRoundOffAmt ? 'v.round_off_amount' : '0'));

        const hasVoucherDisc = this.hasColumn('vouchers', 'discount');
        const hasVoucherLess = this.hasColumn('vouchers', 'less');
        const hasOtherCharges = this.hasColumn('vouchers', 'other_charges');
        const vchDiscField = hasVoucherDisc ? 'v.discount' : (hasVoucherLess ? 'v.less' : '0');
        const vchOtherField = hasOtherCharges ? 'v.other_charges' : '0';

        // Detect correct Amount Column
        let amtFieldPurchase = 'v.v_amt';
        if (this.hasColumn('vouchers', 'v_amt')) amtFieldPurchase = 'v.v_amt';
        else if (this.hasColumn('vouchers', 'v_bill_amt')) amtFieldPurchase = 'v.v_bill_amt';
        else if (this.hasColumn('vouchers', 'amount')) amtFieldPurchase = 'v.amount';
        else if (this.hasColumn('vouchers', 'total_amount')) amtFieldPurchase = 'v.total_amount';
        else if (this.hasColumn('vouchers', 'v_total_amt')) amtFieldPurchase = 'v.v_total_amt';
        else if (this.hasColumn('vouchers', 'net_amount')) amtFieldPurchase = 'v.net_amount';

        // Detect available columns in account_detail
        const accountDetailCols = [];
        ['address', 'address2', 'state', 'pincode', 'tax_regn', 'tax_regn2', 'gstin', 'pan'].forEach(col => {
            if (this.hasColumn('account_detail', col)) {
                if (col === 'tax_regn') accountDetailCols.push('acc.tax_regn as gstin');
                else if (col === 'tax_regn2') accountDetailCols.push('acc.tax_regn2 as pan');
                else accountDetailCols.push(`acc.${col}`);
            }
        });
        const accSelect = accountDetailCols.length > 0 ? `, ${accountDetailCols.join(', ')}` : '';

        const hasRefNo = this.hasColumn('vouchers', 'ref_no');
        const hasBillNo = this.hasColumn('vouchers', 'bill_no');
        const vchNoField = `COALESCE(NULLIF(CAST(v.vch_no AS TEXT), '0'), NULLIF(CAST(v.vch_no AS TEXT), ''), ${hasRefNo ? 'v.ref_no' : "''"}, ${hasBillNo ? 'v.bill_no' : "''"}, '') as vch_no`;
        const refNoField = hasRefNo ? "COALESCE(v.ref_no, '') as ref_no" : "'' as ref_no";

        // 1. Detect Line Item Table globally
        // User has 'sales' and 'purchases' tables, but also potentially 'po_so_item' or 'bill_receipt_payment'
        // We need a table that has (item_name/desc) AND (qty) AND (rate) AND (v_id link)
        const allTables = this.getTables();
        let lineItemTable = null;
        let lineItemCols = {};

        // Priority List
        const candidateTables = ['inventory_transaction', 'transaction_items', 'sale_item', 'sales_items', 'bill_item', 'po_so_item', 'sales', 'purchases'];

        // Scan for the best match
        for (const t of allTables) {
            if (t.startsWith('sqlite_') || t.startsWith('android_')) continue;

            try {
                const cols = this.getColumns(t);
                // Check for foreign key to voucher
                const hasWrapId = cols.some(c => ['v_id', 'vch_id', 'voucher_id', 'trans_id', 'parent_id'].includes(c));
                // Check for item identity
                const hasItem = cols.some(c => ['item_name', 'item_id', 'item_desc', 'item'].includes(c));
                // Check for quantity/amount
                // Check for quantity/amount
                const hasQty = cols.some(c => ['qty', 'quantity', 'units', 'b_qty'].includes(c));
                const hasRate = cols.some(c => ['rate', 'price', 'unit_price', 'amount', 'total', 'cost_per_unit', 'rate1', 'rate_inc_tax'].includes(c));

                if (hasWrapId && hasItem && (hasQty || hasRate)) {
                    // Score the table -> Priority to known names
                    console.log(`[Import] Purchase: Checking table [${t}] for items... Found cols:`, cols);

                    if (candidateTables.includes(t)) {
                        lineItemTable = t;
                        console.log(`[Import] Found Line Item Table (High Priority): ${t} [${cols.join(', ')}]`);
                        break; // Stop if we find a good one
                    } else if (!lineItemTable) {
                        lineItemTable = t;
                        console.log(`[Import] Found Line Item Table (Generic): ${t} [${cols.join(', ')}]`);
                    }
                }
            } catch (e) { }
        }

        if (lineItemTable) {
            const cols = this.getColumns(lineItemTable);
            this.importStats.debugColumns['DETECTED_LINE_ITEMS'] = { table: lineItemTable, columns: cols };
        }

        // Get purchases with vendor details
        const purchaseVouchers = this.query(`
            SELECT DISTINCT v.v_id, v.credit as vendor_name, v.date, ${amtFieldPurchase} as amount, v.narration, ${vchNoField},
                   ${refNoField},
                   COALESCE(${balanceField}, 0) as balance_amount,
                   COALESCE(${paidField}, 0) as total_paid,
                   COALESCE(${roundedOffField}, 0) as round_off,
                   COALESCE(${vchDiscField}, 0) as v_discount,
                   COALESCE(${vchOtherField}, 0) as v_other_charges,
                   v.v_type
                   ${accSelect}
            FROM vouchers v
            LEFT JOIN account_detail acc ON v.credit = acc.aname
            WHERE (v.v_type LIKE '%Purchase%' OR v.v_type LIKE '%Bill%')
               AND v.credit NOT LIKE '%Cash%' AND v.credit NOT LIKE '%Bank%'
            ORDER BY v.date DESC
        `);

        let existingExpenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const existingTxns = DataManager.getData('inventoryTransactions') || [];
        const inventory = DataManager.getData('inventory') || [];

        let imported = 0;
        let updated = 0;

        for (const purchase of purchaseVouchers) {
            const bkId = `BK-PUR-${purchase.v_id}`;
            const billNo = (purchase.vch_no || '').trim();

            console.log('Vouchers Columns:', this.getColumns('vouchers'));
            console.log('Account Detail Columns:', this.getColumns('account_detail'));

            // HYPER-ROBUST ITEM RECOVERY FOR PURCHASES
            let itemsRaw = [];
            const possiblePurchaseTables = [
                'purchase_item', 'purchases_item', 'voucher_item', 'vch_item',
                'inventory_transaction', 'inventory_transactions',
                'items', 'bill_item', 'bill_items', 'purchase_details',
                'inventory_txn', 'vch_details', 'purchases_details_item', 'purchases',
                'service_purchases', 'service_sales', 'po_so_item'
            ];
            if (lineItemTable && !possiblePurchaseTables.includes(lineItemTable)) {
                possiblePurchaseTables.unshift(lineItemTable);
            }

            const idCols = ['v_id', 'voucher_id', 'vch_id', 'parent_id', 'ref_id', 'vouch_id', 'v_no', 'p_v_id', 'purchase_id', 'pur_id', 'service_purchase_id'];
            const vchCols = ['vch_no', 'voucher_no', 'bill_no', 'inv_no', 'invoice_no', 'reference_no', 'bill_id', 'ref_no'];

            // Track found IDs to avoid duplicates if aggregating across tables
            const foundItemKeys = new Set();

            for (const table of possiblePurchaseTables) {
                if (!this.getTables().includes(table)) continue;

                for (const idCol of idCols) {
                    if (this.hasColumn(table, idCol)) {
                        try {
                            const sortCol = this.hasColumn(table, 'rowid') ? 'rowid' : (this.hasColumn(table, 'id') ? 'id' : '');
                            const orderClause = sortCol ? ` ORDER BY ${sortCol}` : '';
                            const results = this.query(`SELECT * FROM ${table} WHERE ${idCol} = '${purchase.v_id}' OR ${idCol} = ${purchase.v_id}${orderClause}`);
                            if (results.length > 0) {
                                results.forEach((res, idx) => {
                                    const itemName = (res.service || res.item || res.item_name || res.name || res.particulars || '').trim();
                                    const key = `${table}_${res.id || purchase.v_id}_${idx}_${itemName}`;
                                    if (!foundItemKeys.has(key)) {
                                        itemsRaw.push(res);
                                        foundItemKeys.add(key);
                                    }
                                });
                                console.log(`[Import] Found ${results.length} purchase items in [${table}] via [${idCol}]`);
                            }
                        } catch (e) {
                            console.error(`[Import] Error querying table ${table} for items:`, e);
                        }
                    }
                }

                if (billNo) {
                    const numericBillNo = parseInt(billNo);
                    for (const vchCol of vchCols) {
                        if (this.hasColumn(table, vchCol)) {
                            const trimmedBillNo = billNo.replace(/^0+/, '');
                            const results = this.query(`SELECT * FROM ${table} WHERE ${vchCol} = '${billNo}' OR ${vchCol} = '${trimmedBillNo}' OR ${vchCol} = '${numericBillNo}'`);
                            if (results.length === 0 && !isNaN(numericBillNo)) {
                                try {
                                    const sortCol = this.hasColumn(table, 'rowid') ? 'rowid' : (this.hasColumn(table, 'id') ? 'id' : '');
                                    const orderClause = sortCol ? ` ORDER BY ${sortCol}` : '';
                                    const numResults = this.query(`SELECT * FROM ${table} WHERE CAST(${vchCol} AS INTEGER) = ${numericBillNo}${orderClause}`);
                                    if (numResults.length > 0) {
                                        numResults.forEach((res, idx) => {
                                            const itemName = (res.service || res.item || res.item_name || res.name || res.particulars || '').trim();
                                            const key = `${table}_${res.id || purchase.v_id}_${idx}_${itemName}`;
                                            if (!foundItemKeys.has(key)) {
                                                itemsRaw.push(res);
                                                foundItemKeys.add(key);
                                            }
                                        });
                                        console.log(`[Import] Found ${numResults.length} purchase items in [${table}] via numeric [${vchCol}]`);
                                    }
                                } catch (e) { }
                            } else if (results.length > 0) {
                                results.forEach((res, idx) => {
                                    const itemName = (res.service || res.item || res.item_name || res.name || res.particulars || '').trim();
                                    const key = `${table}_${res.id || purchase.v_id}_${idx}_${itemName}`;
                                    if (!foundItemKeys.has(key)) {
                                        itemsRaw.push(res);
                                        foundItemKeys.add(key);
                                    }
                                });
                                console.log(`[Import] Found ${results.length} purchase items in [${table}] via [${vchCol}]`);
                            }
                        }
                    }
                }
            }

            // Robust Status Determination for Purchase
            let purchaseStatus = 'pending';
            const pTotalAmt = parseFloat(purchase.amount) || 0;
            let pPaidAmt = parseFloat(purchase.total_paid) || 0;
            const pBalAmt = parseFloat(purchase.balance_amount) || 0;

            // Priority 0: Check 'bill_receipt_payment' table
            if (this.getTables().includes('bill_receipt_payment')) {
                try {
                    const brCols = this.getColumns('bill_receipt_payment');
                    const billIdCol = brCols.includes('b_v_id') ? 'b_v_id' : (brCols.includes('bill_id') ? 'bill_id' : (brCols.includes('bill_no') ? 'bill_no' : ''));
                    const amtCol = brCols.includes('amount') ? 'amount' : 'adjusted_amount';

                    if (billIdCol && amtCol) {
                        const brQuery = `SELECT sum(${amtCol}) as paid FROM bill_receipt_payment WHERE ${billIdCol} = '${purchase.v_id}' OR ${billIdCol} = '${purchase.vch_no}'`;
                        const brRes = this.query(brQuery);
                        if (brRes.length > 0 && brRes[0].paid) {
                            const foundPaid = parseFloat(brRes[0].paid);
                            if (pPaidAmt < foundPaid) pPaidAmt = foundPaid;
                        }
                    }
                } catch (e) { }
            }

            // Priority 1: Check linked payments in Vouchers table
            if (pPaidAmt === 0 && this.getTables().includes('vouchers')) {
                try {
                    const refCols = ['ref_no', 'reference_no', 'payment_reference', 'bill_no'];
                    const vCols = this.getColumns('vouchers');
                    const validRefCols = refCols.filter(c => vCols.includes(c));

                    if (validRefCols.length > 0) {
                        const conditions = validRefCols.map(c => `${c} = '${purchase.vch_no}' OR ${c} = '${purchase.v_id}'`).join(' OR ');
                        const paymentQuery = `
                            SELECT sum(amount) as total_paid_vch 
                            FROM vouchers 
                            WHERE (v_type LIKE '%Payment%' OR v_type LIKE '%Contra%') 
                            AND (${conditions})
                        `;
                        const paymentResult = this.query(paymentQuery);
                        if (paymentResult.length > 0 && paymentResult[0].total_paid_vch) {
                            pPaidAmt += parseFloat(paymentResult[0].total_paid_vch);
                        }
                    }
                } catch (e) { }
            }

            if (pPaidAmt >= pTotalAmt && pTotalAmt > 0) purchaseStatus = 'paid';
            else if (pPaidAmt > 0 && pPaidAmt < pTotalAmt) purchaseStatus = 'partial';
            else if ((hasBalance || hasBal || hasBalVar) && pBalAmt <= 0 && pTotalAmt > 0) purchaseStatus = 'paid';
            else if ((hasBalance || hasBal || hasBalVar) && pBalAmt >= pTotalAmt && pTotalAmt > 0) purchaseStatus = 'pending';
            else if ((hasBalance || hasBal || hasBalVar) && pBalAmt > 0 && pBalAmt < pTotalAmt) purchaseStatus = 'partial';
            else purchaseStatus = 'pending';

            // Robust Tax Fetching (Summary)
            let taxes = [];
            if (this.getTables().includes('voucher_tax')) {
                const taxIdCol = this.hasColumn('voucher_tax', 'v_id') ? 'v_id' : (this.hasColumn('voucher_tax', 'voucher_id') ? 'voucher_id' : '');
                if (taxIdCol) taxes = this.query(`SELECT * FROM voucher_tax WHERE ${taxIdCol} = ${purchase.v_id}`);
            }

            let cgst = 0, sgst = 0, igst = 0;
            taxes.forEach(tax => {
                const taxAmount = parseFloat(tax.amount) || 0;
                const scheme = String(tax.scheme_name || '').toUpperCase();
                if (scheme.includes('CGST')) cgst += taxAmount;
                else if (scheme.includes('SGST')) sgst += taxAmount;
                else if (scheme.includes('IGST')) igst += taxAmount;
            });

            // Item Mapping
            const expenseItems = itemsRaw.map(i => {
                let name = (i.service || i.item || i.item_name || i.name || i.service_name || i.particulars || i.description || i.vch_item || i.ite_name || '').trim();
                const itemId = i.item_id || i.ite_id || i.i_id || i.product_id || '';

                if (!name || /^\d+$/.test(name) || name.length < 2) {
                    const lookupId = name || itemId;
                    if (lookupId) {
                        try {
                            const resolved = this.query(`SELECT * FROM item_measure WHERE (item_id = '${lookupId}' OR item = '${lookupId}') COLLATE NOCASE LIMIT 1`);
                            if (resolved.length > 0) {
                                name = (resolved[0].item || name).trim();
                                if (!i.item_desc) i.item_desc = resolved[0].item_desc;
                                if (!i.hsn_code) {
                                    i.hsn_code = this.findHSNFuzzy(resolved[0]);
                                }
                                if (!i.u_name) i.u_name = resolved[0].u_name || resolved[0].u_measure || resolved[0].unit || resolved[0].unit_name;
                            }
                        } catch (e) { }
                    }
                }

                if (!name) name = 'Unknown Item';

                if (name === 'Unknown Item' && imported < 10) {
                    console.warn(`[Import] ⚠️ Found 'Unknown Item' in invoice ${billNo}. Raw Row Data:`, i);
                    if (!this.importStats.debugColumns) this.importStats.debugColumns = {};
                    this.importStats.debugColumns['UNKNOWN_ITEM_SAMPLE'] = i;
                }

                // EXTRACT TRANSACTION LEVEL DATA FIRST
                const rowUnit = i.u_name || i.units_name || i.unit_name || i.uom || i.measure_unit || i.u_measure || (i.unit && isNaN(i.unit) ? i.unit : '') || '';
                const rowHsn = i.hsn_code || i.hsn || i.hsncode || i.tax_hsn || i.hsn_no || '';

                // SYSTEMATIC MASTER DATA LOOKUP (Inventory / Service Master)
                if (name && name !== 'Unknown Item') {
                    // 1. Check memory-loaded inventory
                    const matchingInv = inventory.find(inv => inv.name.toLowerCase() === name.toLowerCase());
                    if (matchingInv) {
                        if (!rowUnit && matchingInv.unit) i.u_name = matchingInv.unit;
                        if (!rowHsn && matchingInv.hsnCode) i.hsn_code = matchingInv.hsnCode;
                        if (!i.item_desc && matchingInv.description) i.item_desc = matchingInv.description;
                    }
                    // 2. Fallback to DB Lookup in item_measure (Master Source)
                    if (!rowUnit || rowUnit === 'nos' || !rowHsn) {
                        try {
                            const master = this.query(`SELECT * FROM item_measure WHERE item = '${name.replace(/'/g, "''")}' COLLATE NOCASE LIMIT 1`);
                            if (master.length > 0) {
                                if (!rowUnit || rowUnit === 'nos') i.u_name = master[0].u_name || master[0].u_measure || master[0].unit || master[0].unit_name;
                                if (!rowHsn) {
                                    i.hsn_code = this.findHSNFuzzy(master[0]);
                                }
                                if (!i.item_desc) i.item_desc = master[0].item_desc;
                            }
                        } catch (e) { }
                    }
                }

                const qty = parseFloat(i.units || i.quantity || i.qty || i.qty_in || i.quantity_in || i.u_in || i.Qty || 0) || 0;
                let rate = this.findRateFuzzy(i) || parseFloat(i.Rate || 0);

                // Prioritize taxable/net amount if available
                let grossAmount = parseFloat(i.amount || i.total || i.total_amount || i.Subtotal || 0);
                let taxableValue = parseFloat(i.taxable_value || i.taxable_amt || i.tax_exclusive_amount || i.net_amount || 0);

                if (grossAmount === 0 && qty !== 0 && rate !== 0) grossAmount = qty * rate;
                if (rate === 0 && grossAmount !== 0 && qty !== 0) rate = grossAmount / qty;

                // Handle Discount
                let discAmt = 0;
                let discDisplay = 0;
                const discPerRaw = parseFloat(i.discount_percentage || i.disc_per || i.discount_per || 0);
                const discValRaw = parseFloat(i.discount || i.disc || i.disc_amt || 0);

                if (discPerRaw > 0) {
                    discAmt = (grossAmount * discPerRaw) / 100;
                    discDisplay = discPerRaw;
                } else if (discValRaw > 0) {
                    // HEURISTIC: In BookKeeper, the 'discount' column often stores percentage even if not marked.
                    // If it's a common percentage or exactly 50/20/etc, and < 100, treat as percentage.
                    const commonRates = [5, 10, 12, 12.5, 15, 18, 20, 25, 28, 30, 40, 50, 75];
                    if (discValRaw < 100 && (commonRates.includes(discValRaw) || String(i.discount || '').includes('%') || String(i.disc || '').includes('%'))) {
                        discAmt = (grossAmount * discValRaw) / 100;
                        discDisplay = discValRaw;
                    } else if (discValRaw < 100 && grossAmount > 0 && discValRaw > (grossAmount / 2)) {
                        // If discount value is more than half of gross, it's probably percentage if it's like 50
                        discAmt = (grossAmount * discValRaw) / 100;
                        discDisplay = discValRaw;
                    } else {
                        discAmt = discValRaw;
                        discDisplay = (grossAmount > 0) ? (discAmt / grossAmount * 100) : 0;
                    }
                }

                // Distribution of voucher-level discount if any exists and wasn't in line items
                const vDiscTotal = parseFloat(purchase.v_discount || 0);
                if (vDiscTotal > 0 && itemsRaw.length > 0 && discAmt === 0) {
                    // Spread it proportionally based on gross amount
                    const totalGrossSum = itemsRaw.reduce((s, ir) => s + (parseFloat(ir.amount || ir.total || ir.v_amt || (parseFloat(ir.quantity || ir.qty || 1) * parseFloat(ir.rate || 0)) || 0)), 0);
                    if (totalGrossSum > 0) {
                        discAmt = (vDiscTotal * grossAmount) / totalGrossSum;
                        discDisplay = (grossAmount > 0) ? (discAmt / grossAmount * 100) : 0;
                    }
                }

                if (taxableValue === 0) taxableValue = grossAmount - discAmt;

                let taxRate = 0;
                const taxStr = String(i.tax_rate || i.tax_percent || i.scheme_name || i.vat_percent || i.tax_account_name || '');
                const taxMatch = taxStr.match(/(\d+(\.\d+)?)/);
                if (taxMatch) taxRate = parseFloat(taxMatch[0]);
                else taxRate = parseFloat(i.gst || i.gst_per || i.tax_per || i.igst_rate || (parseFloat(i.cgst_rate || 0) + parseFloat(i.sgst_rate || 0))) || 0;

                const taxAmount = taxableValue * (taxRate / 100);
                let iCgst = 0, iSgst = 0, iIgst = 0;
                if (String(taxStr || '').toUpperCase().includes('IGST')) iIgst = taxAmount;
                else { iCgst = taxAmount / 2; iSgst = taxAmount / 2; }

                return {
                    cgst: iCgst, sgst: iSgst, igst: iIgst,
                    cgstAmount: iCgst, sgstAmount: iSgst, igstAmount: iIgst,
                    cgstRate: iIgst === 0 ? (taxRate / 2) : 0,
                    sgstRate: iIgst === 0 ? (taxRate / 2) : 0,
                    igstRate: iIgst > 0 ? taxRate : 0,
                    hsn: i.hsn_code || i.hsn || i.hsncode || i.tax_hsn || i.hsn_no || i.item_code || i.tax_hsn_code || i.sac_code || '',
                    gstRate: taxRate ? (taxRate + '%') : '',
                    name,
                    description: i.desc || i.description || '',
                    quantity: qty,
                    rate: rate,
                    discount: discDisplay,
                    unit: (() => {
                        const u = (i.u_name || i.units_name || i.unit_name || i.uom || i.measure_unit || i.u_measure || (i.unit && isNaN(i.unit) ? i.unit : '') || 'nos').toLowerCase().trim();
                        return (u === 'service' || u === 'numbers') ? 'nos' : u;
                    })(),
                    per: (() => {
                        const u = (i.u_name || i.units_name || i.unit_name || i.uom || i.measure_unit || i.u_measure || (i.unit && isNaN(i.unit) ? i.unit : '') || 'nos').toLowerCase().trim();
                        return (u === 'service' || u === 'numbers') ? 'nos' : u;
                    })(),
                    amount: taxableValue,
                    totalAmount: taxableValue + taxAmount
                };
            });

            const expense = {
                id: purchase.vch_no || `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                bookkeeperId: bkId,
                date: this.formatDate(purchase.date),
                vendor: purchase.vendor_name || '',
                vendorAddress: `${purchase.address || ''} ${purchase.address2 || ''} ${purchase.state || ''} ${purchase.pincode || ''} India`.trim(),
                vendorGstin: purchase.gstin || '',
                vendorPan: purchase.pan || '',
                description: expenseItems.length > 0 ? expenseItems.map(i => i.name).join(', ') : (purchase.narration || 'Purchase'),
                items: expenseItems,
                category: 'Purchase',
                amount: pTotalAmt,
                subtotal: Math.round(expenseItems.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
                roundOff: parseFloat(purchase.round_off || 0),
                discount: parseFloat(purchase.v_discount || 0),
                otherCharges: parseFloat(purchase.v_other_charges || 0),
                gst: { cgst, sgst, igst },
                cgst, sgst, igst,
                billNo: purchase.vch_no || '',
                supplierBillNo: purchase.ref_no || '',
                createdAt: new Date().toISOString(),
                source: 'bookkeeper'
            };

            // Hardened Status Logic
            if (pPaidAmt >= pTotalAmt && pTotalAmt > 0) expense.status = 'paid';
            else if (pPaidAmt > 0 && pPaidAmt < pTotalAmt) expense.status = 'partial';
            else if ((hasBalance || hasBal || hasBalVar) && pBalAmt <= 0 && pTotalAmt > 0 && pPaidAmt > 0) expense.status = 'paid';
            else if ((hasBalance || hasBal || hasBalVar) && pBalAmt > 0) {
                if (pBalAmt >= pTotalAmt) expense.status = 'pending';
                else expense.status = 'partial';
            } else {
                expense.status = 'pending';
            }

            // Fallback Tax Aggregation
            if (expense.gst.cgst === 0 && expense.gst.sgst === 0 && expense.gst.igst === 0) {
                expense.items.forEach(item => {
                    expense.gst.cgst += (item.cgst || 0);
                    expense.gst.sgst += (item.sgst || 0);
                    expense.gst.igst += (item.igst || 0);
                });
                expense.cgst = expense.gst.cgst;
                expense.sgst = expense.gst.sgst;
                expense.igst = expense.gst.igst;
            }

            // EMERGENCY RECONSTRUCTION
            if (expense.items.length === 0 && pTotalAmt > 0) {
                const taxSum = expense.gst.cgst + expense.gst.sgst + expense.gst.igst;
                let baseAmt = pTotalAmt - taxSum - (parseFloat(purchase.round_off) || 0);
                if (baseAmt <= 0) baseAmt = pTotalAmt;
                const infTaxRate = (taxSum > 0 && baseAmt > 0) ? Math.round((taxSum / baseAmt) * 100) : 0;

                expense.items.push({
                    name: purchase.narration || 'General Purchase',
                    description: purchase.narration || 'Expense Entry',
                    quantity: 1, rate: baseAmt, unit: 'nos', amount: baseAmt,
                    gstRate: infTaxRate > 0 ? (infTaxRate + '%') : '',
                    cgst: expense.gst.cgst, sgst: expense.gst.sgst, igst: expense.gst.igst
                });
                expense.subtotal = baseAmt;
            }

            // Save/Update
            const existingIndex = existingExpenses.findIndex(e => e.bookkeeperId === bkId || (billNo && (e.billNo || '').toLowerCase() === billNo.toLowerCase()));
            if (existingIndex >= 0) {
                expense.id = existingExpenses[existingIndex].id;
                existingExpenses[existingIndex] = expense;
                updated++;
            } else {
                existingExpenses.push(expense);
                imported++;
            }

            // Inventory transactions
            itemsRaw.forEach(i => {
                const materialName = (i.item || i.item_name || i.description || '').toLowerCase();
                const material = inventory.find(m => m.name.toLowerCase() === materialName);
                if (material) {
                    const ref = expense.billNo || expense.id;
                    if (!existingTxns.some(t => t.ref === ref && t.materialId === material.id)) {
                        existingTxns.push({
                            id: `TXN-BK-P-${purchase.v_id}-${Math.random().toString(36).substr(2, 4)}`,
                            materialId: material.id, type: 'in', quantity: parseFloat(i.units || i.quantity) || 0,
                            date: expense.date, ref: ref, party: expense.vendor, source: 'bookkeeper_import'
                        });
                    }
                }
            });
        }

        await DataManager.saveData(DataManager.KEYS.EXPENSES, existingExpenses);
        await DataManager.saveData('inventoryTransactions', existingTxns || []);

        return { imported, updated, total: purchaseVouchers.length };
    },

    /**
     * Import Estimations as Estimates
     */
    async importEstimates() {
        const estVouchers = this.query(`
            SELECT DISTINCT v.v_id, v.debit as customer, v.date, v.amount, v.narration, v.vch_no
            FROM vouchers v
            WHERE v.v_type LIKE '%Estimation%' 
               OR v_type LIKE '%Quotation%' 
               OR v_type LIKE '%Estimate%'
               OR v_type LIKE '%Proforma%'
            ORDER BY v.date DESC
        `);

        const existingEstimates = DataManager.getData(DataManager.KEYS.ESTIMATES) || [];

        // Create sets for fast lookup of existing records
        const existingBkIds = new Set(existingEstimates.map(e => e.bookkeeperId).filter(id => id));
        const existingEstNos = new Set(existingEstimates.map(e => (e.id).toLowerCase()));

        let imported = 0;
        let skipped = 0;

        estVouchers.forEach(est => {
            const bkId = `BK-EST-${est.v_id}`;
            const estNo = (est.vch_no || '').trim();

            // Skip if already imported by BkID OR if an estimate with same number exists
            if (existingBkIds.has(bkId) || (estNo && existingEstNos.has(estNo.toLowerCase()))) {
                skipped++;
                return;
            }

            // In BookKeeper, estimation items are usually in 'sales' table but linked to estimation voucher
            const items = this.query(`SELECT * FROM sales WHERE v_id = ${est.v_id}`);

            const estimate = {
                id: est.vch_no || `EST-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                bookkeeperId: bkId,
                date: this.formatDate(est.date),
                customerName: est.customer || '',
                items: items.map(item => ({
                    name: item.item || '',
                    description: item.desc || '',
                    quantity: parseFloat(item.units) || 1,
                    rate: parseFloat(item.sp_per_unit) || 0,
                    amount: (parseFloat(item.units) || 1) * (parseFloat(item.sp_per_unit) || 0)
                })),
                subtotal: items.reduce((sum, item) => sum + ((parseFloat(item.units) || 1) * (parseFloat(item.sp_per_unit) || 0)), 0),
                total: parseFloat(est.amount) || 0,
                status: 'pending',
                remarks: est.narration || '',
                createdAt: new Date().toISOString(),
                source: 'bookkeeper'
            };

            existingEstimates.push(estimate);
            existingBkIds.add(bkId);
            existingEstNos.add(estimate.id.toLowerCase());
            imported++;
        });

        DataManager.saveData(DataManager.KEYS.ESTIMATES, existingEstimates);
        return { imported, skipped, total: estVouchers.length };
    },

    /**
     * Import Challans
     */
    async importChallans() {
        const dcVouchers = this.query(`
            SELECT DISTINCT v.v_id, v.debit as customer, v.date, v.amount, v.narration, v.vch_no, v.v_type
            FROM vouchers v
            WHERE v.v_type LIKE '%Challan%' 
               OR v.v_type LIKE '%Delivery%'
               OR v.v_type LIKE '%Job Card%'
            ORDER BY v.date DESC
        `);

        const existingChallans = DataManager.getData('challans') || [];

        // Create sets for fast lookup of existing records
        const existingBkIds = new Set(existingChallans.map(c => c.bookkeeperId).filter(id => id));
        const existingChallanNos = new Set(existingChallans.map(c => (c.id).toLowerCase()));

        let imported = 0;
        let skipped = 0;

        dcVouchers.forEach(dc => {
            const bkId = `BK-DC-${dc.v_id}`;
            const challanNo = (dc.vch_no || '').trim();

            // Skip if already imported by BkID OR if a challan with same number exists
            if (existingBkIds.has(bkId) || (challanNo && existingChallanNos.has(challanNo.toLowerCase()))) {
                skipped++;
                return;
            }
            const items = this.query(`SELECT * FROM sales WHERE v_id = ${dc.v_id}`);
            const isService = dc.v_type?.toLowerCase().includes('service');

            const challan = {
                id: dc.vch_no || `DC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                bookkeeperId: bkId,
                type: isService ? 'service' : 'delivery',
                date: this.formatDate(dc.date),
                customerName: dc.customer || '',
                items: items.map(item => ({
                    name: item.item || '',
                    itemDescription: item.desc || '',
                    quantity: parseFloat(item.units) || 1,
                    unit: 'pcs',
                    rate: parseFloat(item.sp_per_unit) || 0,
                    amount: (parseFloat(item.units) || 1) * (parseFloat(item.sp_per_unit) || 0)
                })),
                workDone: dc.narration || '', // Mapping narration to workDone for service details
                status: 'finalized',
                createdAt: new Date().toISOString(),
                source: 'bookkeeper'
            };

            existingChallans.push(challan);
            existingBkIds.add(bkId);
            existingChallanNos.add(challan.id.toLowerCase());
            imported++;
        });

        DataManager.saveData('challans', existingChallans);
        return { imported, skipped, total: dcVouchers.length };
    },

    /**
     * Import Tax Schemes
     */
    async importTaxSchemes() {
        const taxes = this.query('SELECT * FROM tax');

        const taxSchemes = taxes.map(tax => ({
            name: tax.scheme_name,
            percentage: parseFloat(tax.percentage) || 0,
            category: tax.tax_category || 'GST',
            inputCredit: tax.input_credit === 'yes'
        }));

        DataManager.saveData('taxSchemes', taxSchemes);

        return { imported: taxes.length };
    },

    /**
     * Format date from BookKeeper format
     */
    formatDate(dateStr) {
        if (!dateStr) return new Date().toISOString().split('T')[0];

        // Try different date formats
        const formats = [
            /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /^(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
            /^(\d{2})\/(\d{2})\/(\d{4})/ // DD/MM/YYYY
        ];

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (match[1].length === 4) {
                    return `${match[1]}-${match[2]}-${match[3]}`;
                } else {
                    return `${match[3]}-${match[2]}-${match[1]}`;
                }
            }
        }

        return dateStr;
    },

    /**
     * Import Inventory Batches
     */
    async importBatches() {
        // Try to query inventory batches if table exists
        // Table name guess: inventory_batch or similar. 
        // Based on analysis: 'inventory_batch'
        try {
            const batches = this.query('SELECT * FROM inventory_batch');
            const existingBatches = DataManager.getData('gtes_batches') || [];

            // Map table columns to our batch object
            // Assuming columns: batch_no, expiry_date, item_id, quantity, etc.
            // Using generic mapping if schema unknown, but trying standard names

            const newBatches = batches.map(b => ({
                id: `BATCH-${b.batch_id || Date.now()}`,
                batchNo: b.batch_no || b.batch_name || '',
                expiryDate: this.formatDate(b.expiry_date),
                itemId: b.item_id, // Need to map to our Item ID? Or just store raw
                itemName: b.item_name, // If available
                quantity: parseFloat(b.closing_stock) || 0,
                mfgDate: this.formatDate(b.mfg_date),
                mrp: parseFloat(b.mrp) || 0,
                rate: parseFloat(b.rate) || 0,
                source: 'bookkeeper'
            }));

            DataManager.saveData('gtes_batches', newBatches);
            return { imported: batches.length };
        } catch (e) {
            console.warn('Batch table not found or error importing batches', e);
            return { imported: 0, error: e.message };
        }
    },

    /**
     * Confirm and Clear All BookKeeper Data
     */
    async confirmClearData() {
        if (confirm('Are you sure you want to delete ALL data imported from BookKeeper? \n\nThis will remove:\n- Invoices\n- Inventory Items\n- Customers\n- Expenses\n\nThis action cannot be undone.')) {
            await this.clearAllData();
        }
    },

    async clearAllData() {
        App.showNotification('Sweeping all BookKeeper Service & Inventory Data...', 'info');

        // 1. Invoices
        const invoices = DataManager.getData('invoices') || [];
        const cleanInvoices = invoices.filter(i => i.source !== 'bookkeeper' && i.source !== 'seed' && !i.bookkeeperId);
        await DataManager.saveData('invoices', cleanInvoices);

        // 2. Vouchers (Transactions)
        const vouchers = DataManager.getData('vouchers') || [];
        const cleanVouchers = vouchers.filter(v => v.source !== 'bookkeeper' && v.source !== 'seed');
        await DataManager.saveData('vouchers', cleanVouchers);

        // 3. Inventory (Robust Cleanup for all import variants)
        const inventory = DataManager.getData('inventory') || [];
        const cleanInventory = inventory.filter(i => {
            // Explicit tags
            if (i.source === 'bookkeeper') return false;
            if (i.source === 'bookkeeper_service_table') return false;
            if (i.source === 'seed') return false; // NEW: Clear seed data too

            // Heuristic Checks for Orphans
            if (i.id) {
                if (i.id.startsWith('SVC-')) return false;
                if (i.id.startsWith('SRV-')) return false;
                if (i.id.startsWith('MAT-SEED-')) return false; // NEW: Explicit Seed IDs
                if (i.id.startsWith('MAT-') && i.id.length > 10) return false;
            }
            return true;
        });
        await DataManager.saveData('inventory', cleanInventory);

        // 3b. Services Collection (NEW - Clear dedicated services collection)
        await DataManager.saveData('gtes_services', []);

        // 4. Inventory Txns (Remove if linked to BK)
        const txn = DataManager.getData('inventoryTransactions') || [];
        const cleanTxn = txn.filter(t => !t.refId?.toString().includes('BK-') && t.source !== 'bookkeeper' && t.source !== 'seed');
        await DataManager.saveData('inventoryTransactions', cleanTxn);

        // 5. Customers
        const customers = DataManager.getData('customers') || [];
        const cleanCustomers = customers.filter(c => c.source !== 'bookkeeper' && c.source !== 'seed');
        await DataManager.saveData('customers', cleanCustomers);

        // 6. Expenses
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const cleanExpenses = expenses.filter(e => !e.bookkeeperId && e.source !== 'bookkeeper' && e.source !== 'seed');
        await DataManager.saveData(DataManager.KEYS.EXPENSES, cleanExpenses);

        App.showNotification('All BookKeeper data cleared successfully.', 'success');
        setTimeout(() => location.reload(), 1500);
    },

    async runFullImport(fileOrBuffer, options = {}) {
        this.importStats = {
            startTime: new Date(),
            company: null,
            customers: null,
            inventory: null,
            services: null,
            vouchers: null,
            sales: null,
            purchases: null,
            purchases: null,
            batches: null,
            foundTables: [],
            taxSchemes: null,
            errors: []
        };

        try {
            await this.openDatabase(fileOrBuffer);

            // 0. INSPECT SCHEMA (DEBUG MODE)
            // Blindly capture column names to debug "0 Imported" issues permanently
            if (this.inspectSchema) {
                this.importStats.debugColumns = await this.inspectSchema();
                console.log('[Import] Schema Inspection:', this.importStats.debugColumns);
            }

            const tables = this.getTables();
            console.log('[Import] 📊 ALL Tables found in DB:', tables);

            // Initial Analysis
            this.importStats.foundTables = tables.filter(t => !t.startsWith('sqlite_') && !t.startsWith('android_'));

            // DEBUG SCHEMA - Log sample data for investigation
            const debugTables = ['item_measure', 'items', 'vouchers', 'sale_item', 'voucher_tax', 'tax_details', 'inventory_transaction', 'stock', 'sales', 'purchases', 'bill', 'combined_vouchers'];
            debugTables.forEach(t => {
                if (tables.includes(t)) {
                    try {
                        const sample = this.query(`SELECT * FROM ${t} LIMIT 3`);
                        console.log(`[Import] [DEBUG] Data sample from [${t}]:`, sample);
                        if (sample.length > 0) {
                            if (!this.importStats.debugColumns) this.importStats.debugColumns = {};
                            this.importStats.debugColumns[t] = Object.keys(sample[0]);
                        }
                    } catch (e) { }
                }
            });

            // 1. Company Information
            // Smart detect company table
            let companyTable = this.detectTableByColumns(tables, ['company', 'company_info'], ['c_name', 'fin_yr']);
            // Fallback: Use standard name if detection failed
            if (!companyTable && tables.includes('company')) companyTable = 'company';

            if (options.company !== false && companyTable) {
                try {
                    this.importStats.company = await this.importCompanyInfo(companyTable);
                } catch (e) {
                    this.importStats.errors.push({ section: 'Company', error: e.message });
                }
            }

            // 2. Customers
            // Smart detect accounts table
            let accountTable = this.detectTableByColumns(tables, ['account_detail', 'accounts', 'account'], ['aname', 'op_bal']);
            // Fallback: Use standard name if detection failed
            if (!accountTable && tables.includes('account_detail')) accountTable = 'account_detail';
            if (options.customers !== false && accountTable) {
                try {
                    this.importStats.customers = await this.importCustomers(accountTable);
                } catch (e) {
                    this.importStats.errors.push({ section: 'Customers', error: e.message });
                }
            }

            // 3. Inventory & Items
            // Smart detect Inventory table. 
            // NOTE: User has split schema (item_measure + stock table). unique 'stock' column might not be in item table.
            // We search for name, code, AND pricing fields now to ensure we find 'item_measure'.
            let inventoryTable = this.detectTableByColumns(
                tables,
                ['item_measure', 'items', 'item', 'inventory', 'products', 'product', 'mst_item', 'stock_items'],
                ['item_name', 'name', 'item_code', 'code', 'stock', 'qty', 'rate', 'selling_price', 'defaultsellingprice', 'sp_per_unit', 'price'],
                2
            );
            // Fallback
            if (!inventoryTable && tables.includes('item_measure')) inventoryTable = 'item_measure';

            if (options.inventory !== false && inventoryTable) {
                try {
                    this.importStats.inventory = await this.importInventory(inventoryTable);
                    this.importStats.inventoryTable = inventoryTable;
                } catch (e) {
                    this.importStats.errors.push({ section: 'Inventory', error: e.message });
                }

                // Try to find batches if inventory exists
                if (tables.includes('inventory_batch') || tables.includes('batch_details')) {
                    try { this.importStats.batches = await this.importBatches(); } catch (e) { }
                }
            }

            // Services
            let serviceTable = this.detectTableByColumns(
                tables,
                ['service', 'services', 'service_measure', 'mst_service'],
                ['service_name', 'service_code'],
                1
            );
            // Fallback
            if (!serviceTable && tables.includes('service')) serviceTable = 'service';

            if (options.inventory !== false && serviceTable && serviceTable !== inventoryTable) {
                try { this.importStats.services = await this.importServices(serviceTable); } catch (e) { }
            }

            // Detect Voucher Table for next steps
            let voucherTable = this.detectTableByColumns(tables, ['vouchers', 'voucher', 'trans_vouchers', 'transactions'], ['v_date', 'v_amount', 'v_type'], 1) ||
                this.detectTableByColumns(tables, ['vouchers', 'voucher'], ['date', 'amount', 'type'], 1);
            // Fallback
            if (!voucherTable && tables.includes('vouchers')) voucherTable = 'vouchers';

            // 4. Vouchers & Orders
            if (options.vouchers !== false) {
                if (voucherTable) {
                    try { this.importStats.vouchers = await this.importVouchers(voucherTable); } catch (e) { this.importStats.errors.push({ section: 'Vouchers', error: e.message }); }
                }
                if (tables.includes('po_so_vouchers')) {
                    try { await this.importOrders(); } catch (e) { }
                }
            }

            // 5. Estimates
            if (options.estimates !== false && voucherTable) {
                try {
                    // Note: importEstimates might need refactoring too if it uses hardcoded 'vouchers', 
                    // but usually estimates are separate or in vouchers with v_type.
                    // Assuming standard behavior for now or skipping deep refactor of estimates to focus on Sales.
                    this.importStats.estimates = await this.importEstimates();
                } catch (e) {
                    this.importStats.errors.push({ section: 'Estimates', error: e.message });
                }
            }

            // 6. Sales (Invoices)
            if (options.sales !== false && voucherTable && accountTable) {
                try {
                    this.importStats.sales = await this.importSales(voucherTable, accountTable);
                } catch (e) {
                    this.importStats.errors.push({ section: 'Sales', error: e.message });
                }
            }

            // 7. Purchases (Expenses)
            if (options.purchases !== false && tables.includes('vouchers')) {
                try {
                    console.log('[Import] Starting purchases import...');
                    this.importStats.purchases = await this.importPurchases();
                    console.log('[Import] Purchases import result:', this.importStats.purchases);
                } catch (e) {
                    console.error('[Import] Purchases import error:', e);
                    this.importStats.errors.push({ section: 'Purchases', error: e.message });
                    // Set a default value so it doesn't show as undefined
                    this.importStats.purchases = { imported: 0, updated: 0, total: 0, error: e.message };
                }
            }

            // 8. Delivery Challans
            if (options.challans !== false && tables.includes('vouchers')) {
                try {
                    this.importStats.challans = await this.importChallans();
                } catch (e) {
                    this.importStats.errors.push({ section: 'Challans', error: e.message });
                }
            }

            // 9. Tax Schemes
            if (options.taxSchemes !== false && tables.includes('tax')) {
                try {
                    this.importStats.taxSchemes = await this.importTaxSchemes();
                } catch (e) {
                    this.importStats.errors.push({ section: 'Tax Schemes', error: e.message });
                }
            }

            // 10. DIAGNOSTIC DUMP (CRITICAL FOR DEBUGGING)
            try {
                // Collect detailed column info for all major tables
                const detailedDebug = {
                    tables: tables,
                    stats: this.importStats,
                    columns: {},
                    sampleData: {} // Capture 1 row from each table to see ACTUAL data format
                };

                const importantTables = ['vouchers', 'items', 'item_measure', 'stock', 'inventory_batch', 'sales', 'purchases', 'service_sales', 'service_purchases', 'bill_receipt_payment', 'account_detail', 'sale_item', 'purchase_item', 'bill_item'];
                for (const t of importantTables) {
                    if (tables.includes(t)) {
                        try {
                            const cols = this.query(`SELECT * FROM ${t} LIMIT 1`);
                            if (cols.length > 0) {
                                detailedDebug.columns[t] = Object.keys(cols[0]);
                                detailedDebug.sampleData[t] = cols[0];
                            }
                        } catch (e) { }
                    }
                }

                // USE DATA MANAGER instead of direct fs to avoid renderer issues
                const debugKey = 'gtes_debug_import_schema';
                await DataManager.saveData(debugKey, detailedDebug);

                console.log(`[Import] 🔍 Debug Schema saved via DataManager (Key: ${debugKey})`);
                console.log('[Import] Schema Column Map:', detailedDebug.columns);
            } catch (e) {
                console.error('[Import] Failed to save debug schema to file', e);
            }

            this.importStats.endTime = new Date();
            this.importStats.duration = (this.importStats.endTime - this.importStats.startTime) / 1000;
            return this.importStats;

        } catch (error) {
            console.error('[Import] Critical failure:', error);
            this.importStats.errors.push({ section: 'Database', error: error.message });
            throw error;
        } finally {
            // Database remains open for potential UI interaction, unless explicitly closed elsewhere
        }
    },

    /**
     * Get all accounts from account_detail
     */
    getAccounts() {
        return this.query("SELECT aname, a_type FROM account_detail ORDER BY aname ASC");
    },

    /**
     * Add a voucher to the BookKeeper database
     */
    addVoucher(vData) {
        if (!this.db) {
            throw new Error('No BookKeeper database opened');
        }

        // 1. Get next v_id
        const res = this.db.exec("SELECT MAX(v_id) FROM vouchers");
        const nextId = (res[0].values[0][0] || 0) + 1;

        // 2. Prepare SQL
        const sql = `
            INSERT INTO vouchers (
                v_id, date, vch_no, v_type, debit, credit, amount, narration, status
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, 1
            )
        `;

        try {
            this.db.run(sql, [
                nextId,
                vData.date, // YYYY-MM-DD
                vData.vchNo || `BANK-${Date.now().toString().slice(-6)}`,
                vData.type, // Receipt or Payment
                vData.debit,
                vData.credit,
                vData.amount,
                vData.narration
            ]);
            console.log(`Added voucher ${nextId} to BookKeeper DB`);
            return nextId;
        } catch (e) {
            console.error('Error adding voucher to BookKeeper:', e);
            throw e;
        }
    },

    /**
     * Export the current in-memory database as a Blob
     */
    exportDatabase() {
        if (!this.db) return null;
        const data = this.db.export();
        return new Blob([data], { type: 'application/x-sqlite3' });
    },

    /**
     * Close the database
     */
    closeDatabase() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    },

    /**
     * Get summary of import
     */
    getSummary() {
        const stats = this.importStats;
        const sections = [];

        if (stats.company) {
            sections.push({
                name: 'Company',
                status: 'success',
                message: `Updated: ${stats.company.name}`
            });
        }

        if (stats.customers) {
            sections.push({
                name: 'Customers',
                status: 'success',
                imported: stats.customers.imported,
                skipped: stats.customers.skipped
            });
        }

        if (stats.inventory) {
            sections.push({
                name: 'Inventory',
                status: 'success',
                imported: stats.inventory.imported,
                skipped: stats.inventory.skipped
            });
        }

        if (stats.vouchers) {
            sections.push({
                name: 'Vouchers',
                status: 'success',
                imported: stats.vouchers.imported,
                skipped: stats.vouchers.skipped
            });
        }

        if (stats.estimates) {
            sections.push({
                name: 'Estimates',
                status: 'success',
                imported: stats.estimates.imported,
                skipped: stats.estimates.skipped
            });
        }

        if (stats.challans) {
            sections.push({
                name: 'Challans',
                status: 'success',
                imported: stats.challans.imported,
                skipped: stats.challans.skipped
            });
        }

        if (stats.sales) {
            sections.push({
                name: 'Sales/Invoices',
                status: 'success',
                imported: stats.sales.imported,
                skipped: stats.sales.skipped
            });
        }

        if (stats.purchases) {
            sections.push({
                name: 'Purchases/Expenses',
                status: stats.purchases.error ? 'error' : 'success',
                imported: stats.purchases.imported || 0,
                skipped: stats.purchases.skipped || 0,
                message: stats.purchases.error || ''
            });
        }

        if (stats.taxSchemes) {
            sections.push({
                name: 'Tax Schemes',
                status: 'success',
                imported: stats.taxSchemes.imported
            });
        }

        stats.errors.forEach(err => {
            sections.push({
                name: err.section,
                status: 'error',
                message: err.error
            });
        });

        return {
            sections,
            totalImported: sections.reduce((sum, s) => sum + (s.imported || 0), 0),
            duration: stats.duration,
        };
    },

    async cleanupImportedData() {
        console.log('Starting cleanup of imported data...');
        const invoices = DataManager.getData('invoices') || [];
        const vouchers = DataManager.getData('vouchers') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const customers = CustomerManager.getAllCustomers();
        let modified = 0;

        // Cleanup Invoices
        for (let inv of invoices) {
            let changed = false;

            // 1. Fix missing customerId
            if (!inv.customerId && inv.customerName) {
                const existing = customers.find(c => c.name.toLowerCase() === inv.customerName.toLowerCase());
                if (existing) {
                    inv.customerId = existing.id;
                    changed = true;
                } else {
                    try {
                        const newCust = await CustomerManager.addCustomer({
                            name: inv.customerName,
                            address: '',
                            phone: ''
                        });
                        customers.push(newCust);
                        inv.customerId = newCust.id;
                        changed = true;
                    } catch (e) { }
                }
            }

            // 2. Fix missing type or total
            if (!inv.type) {
                const hasGst = (inv.cgst || inv.sgst || inv.igst || (inv.gst && (inv.gst.cgst || inv.gst.sgst || inv.gst.igst)));
                inv.type = hasGst ? 'with-bill' : 'without-bill';
                changed = true;
            }

            // 3. Ensure gst object exists for History view
            if (!inv.gst) {
                inv.gst = {
                    cgst: inv.cgst || 0,
                    sgst: inv.sgst || 0,
                    igst: inv.igst || 0
                };
                changed = true;
            }

            // 4. Fix random IDs if vch_no available
            if (inv.id && inv.id.toString().startsWith('INV-17') && inv.invoiceNo) {
                inv.id = inv.invoiceNo;
                changed = true;
            }

            if (changed) modified++;
        }

        // Cleanup Vouchers
        for (let v of vouchers) {
            let changed = false;

            // 1. Fix incorrect "Bank" or "Cash" names
            const n = (v.customerName || '').toLowerCase();
            const isBankOrCash = (name) => {
                if (!name) return false;
                const val = name.toLowerCase();
                return val.includes('bank') || val.includes('cash') || val.includes('petty') || val.includes('hdfc') || val.includes('icici') || val.includes('sbi');
            };

            if (v.customerName === 'Bank' || v.customerName === 'Cash' || isBankOrCash(v.customerName)) {
                if (this.db && v.bookkeeperId) {
                    const vid = v.bookkeeperId.replace('BK-', '');
                    const res = this.query(`SELECT * FROM vouchers WHERE v_id = ${vid}`);
                    if (res.length > 0) {
                        const row = res[0];
                        const d = (row.debit || '').trim();
                        const c = (row.credit || '').trim();

                        if (isBankOrCash(d) && !isBankOrCash(c)) {
                            v.customerName = c;
                            changed = true;
                        } else if (isBankOrCash(c) && !isBankOrCash(d)) {
                            v.customerName = d;
                            changed = true;
                        }
                    }
                }
            }

            // 2. Fix missing customerId
            if (!v.customerId && v.customerName && !isBankOrCash(v.customerName)) {
                const existing = customers.find(c => c.name.toLowerCase() === v.customerName.toLowerCase());
                if (existing) {
                    v.customerId = existing.id;
                    changed = true;
                } else {
                    try {
                        const newCust = await CustomerManager.addCustomer({
                            name: v.customerName,
                            address: '',
                            phone: ''
                        });
                        customers.push(newCust);
                        v.customerId = newCust.id;
                        changed = true;
                    } catch (e) { }
                }
            }

            // 3. Fix random IDs if voucherNo available
            if (v.id && v.id.toString().startsWith('VCH-17') && v.voucherNo) {
                v.id = v.voucherNo;
                changed = true;
            }

            if (changed) modified++;
        }

        // 4. Link Vouchers to Invoices/Expenses (Auto-Mapping) - Move Up to link before status check
        vouchers.forEach(v => {
            let vChanged = false;
            // Only auto-link if no links exist and it's from bookkeeper (imported)
            if (v.source === 'bookkeeper' && (!v.linkedInvoices || v.linkedInvoices.length === 0)) {
                const searchName = (v.customerName || '').trim().toLowerCase();
                if (v.type === 'payment') {
                    // Try to find a matching expense for this vendor/amount
                    const matchingExp = expenses.find(e => {
                        const vendorName = (e.vendor || '').trim().toLowerCase();
                        const amountMatch = Math.abs(parseFloat(e.amount || 0) - parseFloat(v.amount || 0)) < 1;
                        const refMatch = v.narration && e.billNo && v.narration.includes(e.billNo);
                        return vendorName === searchName && (amountMatch || refMatch);
                    });

                    if (matchingExp) {
                        v.linkedInvoices = [{
                            id: matchingExp.id,
                            amount: v.amount,
                            billNo: matchingExp.billNo,
                            supplierBillNo: matchingExp.supplierBillNo
                        }];
                        vChanged = true;
                    }
                } else if (v.type === 'receipt') {
                    // Try to find a matching invoice for this customer/amount
                    const matchingInv = invoices.find(i => {
                        const custName = (i.customerName || '').trim().toLowerCase();
                        const amountMatch = Math.abs(parseFloat(i.total || 0) - parseFloat(v.amount || 0)) < 1;
                        const refMatch = v.narration && i.invoiceNo && v.narration.includes(i.invoiceNo);
                        return custName === searchName && (amountMatch || refMatch);
                    });

                    if (matchingInv) {
                        v.linkedInvoices = [{
                            id: matchingInv.id,
                            amount: v.amount,
                            invoiceNo: matchingInv.invoiceNo
                        }];
                        vChanged = true;
                    }
                }
            }
            if (vChanged) modified++;
        });

        // 5. Reconcile Payments status AFTER linking
        for (let exp of expenses) {
            let changed = false;

            // 1. Reconcile Payments if status is pending
            if (exp.status !== 'paid') {
                const totalPaid = vouchers.filter(v =>
                    (v.type === 'payment' || v.type === 'supplier') &&
                    v.linkedInvoices &&
                    v.linkedInvoices.some(link => link.id === exp.id || link === exp.id || (link.billNo && link.billNo === exp.billNo))
                ).reduce((sum, v) => {
                    const link = v.linkedInvoices.find(l => l.id === exp.id || l === exp.id || (l.billNo && l.billNo === exp.billNo));
                    return sum + (parseFloat(typeof link === 'object' ? link.amount : v.amount) || 0);
                }, 0);

                if (totalPaid >= (parseFloat(exp.amount) - 1) && parseFloat(exp.amount) > 0) {
                    exp.status = 'paid';
                    changed = true;
                }
            }

            if (changed) modified++;
        }

        if (modified > 0) {
            DataManager.saveDataSync('invoices', invoices);
            DataManager.saveDataSync('vouchers', vouchers);
            DataManager.saveDataSync(DataManager.KEYS.EXPENSES, expenses);
            console.log(`Cleaned up ${modified} records (Invoices, Vouchers & Expenses).`);
        }
        return modified;
    },

    /**
     * Generate Summary Data for UI
     */
    getSummary(stats) {
        let totalImported = 0;
        if (stats.company) totalImported++;
        if (stats.customers) totalImported += (stats.customers.imported || 0);
        if (stats.inventory) totalImported += (stats.inventory.imported || 0);
        if (stats.services) totalImported += (stats.services.imported || 0);
        if (stats.vouchers) totalImported += (stats.vouchers.imported || 0);
        if (stats.sales) totalImported += (stats.sales.imported || 0);
        if (stats.purchases) totalImported += (stats.purchases.imported || 0);
        if (stats.taxSchemes) totalImported += (stats.taxSchemes.imported || 0);

        const endTime = new Date();
        const duration = stats.startTime ? (endTime - stats.startTime) / 1000 : 0;

        const sections = [
            { name: 'Company', status: stats.company ? 'success' : 'skipped', imported: stats.company ? 1 : 0 },
            { name: 'Customers', status: stats.customers ? 'success' : 'skipped', imported: stats.customers ? stats.customers.imported : 0 },
            { name: 'Inventory', status: stats.inventory ? 'success' : 'skipped', imported: stats.inventory ? stats.inventory.imported : 0 },
            { name: 'Vouchers', status: stats.vouchers ? 'success' : 'skipped', imported: stats.vouchers ? stats.vouchers.imported : 0 },
            { name: 'Estimates', status: stats.estimates ? 'success' : 'skipped', imported: stats.estimates ? stats.estimates.imported : 0 },
            { name: 'Challans', status: stats.challans ? 'success' : 'skipped', imported: stats.challans ? stats.challans.imported : 0 },
            { name: 'Sales/Invoices', status: stats.sales ? 'success' : 'skipped', imported: stats.sales ? stats.sales.imported : 0 },
            { name: 'Purchases/Expenses', status: stats.purchases ? 'success' : 'skipped', imported: stats.purchases ? stats.purchases.imported : 0 },
            { name: 'Tax Schemes', status: stats.taxSchemes ? 'success' : 'skipped', imported: stats.taxSchemes ? stats.taxSchemes.imported : 0 }
        ];

        return {
            totalImported,
            duration,
            sections,
            foundTables: stats.foundTables || [],
            debugColumns: stats.debugColumns || {}
        };
    }
};

// Expose to window
window.BookKeeperImport = BookKeeperImport;
