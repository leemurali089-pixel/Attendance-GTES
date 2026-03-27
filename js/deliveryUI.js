/**
 * Delivery UI Controller
 * Handles all UI interactions for the Delivery Challan module
 */

const DeliveryUI = {
    currentEditingChallan: null,
    currentEditingMaterialId: null,
    currentCustomerType: 'Customer',
    historyFilters: {
        dataType: 'all', // all, challan-dc, challan-sc, invoice-gst, invoice-non-gst
        fy: '2025-26',
        technician: 'all',
        status: 'all', // all, pending, paid (for invoices), pending-invoice (for challans)
        customerId: 'all',
        search: ''
    },

    getAccountCategory(c) {
        if (!c) return 'Customer';
        if (c.isOtherAccount || c.accountType === 'Other') return 'Other';
        if (c.accountType === 'Supplier') return 'Supplier';
        if (c.accountType === 'Customer') return 'Customer';

        // Smart fallback for legacy or incomplete data
        const name = (c.name || '').toLowerCase();
        const group = (c.accountGroup || '').toLowerCase();

        // Known System/Other Account keywords
        const systemKeywords = ['bank', 'cash', 'sales return', 'purchase return', 'tax', 'gst', 'vat', 'discount', 'tds', 'round off', 'salary', 'duty', 'expense', 'income', 'capital'];
        if (systemKeywords.some(k => name.includes(k))) return 'Other';

        // Known non-customer/supplier groups
        if (group && (group.includes('bank') || group.includes('cash') || group.includes('tax') ||
            group.includes('income') || group.includes('expense') || group.includes('fixed asset') || group.includes('capital') ||
            group.includes('duty') || group.includes('current liability') || group.includes('current asset'))) {
            // Only exclude from other assets/liabilities if they aren't debtors/creditors
            if (!group.includes('debtor') && !group.includes('creditor')) return 'Other';
        }

        // Group-based detection ( Sundry Debtors / Sundry Creditors )
        if (group.includes('creditor')) return 'Supplier';
        if (group.includes('debtor')) return 'Customer';

        // Default fallback
        return 'Customer';
    },

    async init() {
        try {
            console.log('DeliveryUI initializing...');

            // Initialize managers
            console.log('Initializing CustomerManager...');
            await CustomerManager.init();

            console.log('Initializing InventoryManager...');
            await InventoryManager.init();

            console.log('Initializing DeliveryManager...');
            await DeliveryManager.init();

            // Render initial UIs
            console.log('Rendering create form...');
            this.renderCreateForm();

            console.log('Loading customers...');
            this.loadCustomers();

            console.log('Loading inventory...');
            this.loadInventory();

            console.log('Loading history...');
            this.loadHistory();

            // Setup event listeners
            console.log('Setting up event listeners...');
            this.setupEventListeners();

            console.log('DeliveryUI initialization complete!');
        } catch (error) {
            console.error('DeliveryUI initialization failed:', error);
            App.showNotification('Error initializing Delivery module: ' + error.message, 'error');
        }
    },

    /**
     * Lightweight init — only sets up data managers, no UI rendering.
     * Used when navigating to accounting sub-views (Challans, Job Cards, Customers).
     */
    async initManagersOnly() {
        try {
            if (typeof CustomerManager !== 'undefined') await CustomerManager.init();
            if (typeof InventoryManager !== 'undefined') await InventoryManager.init();
            if (typeof DeliveryManager !== 'undefined') await DeliveryManager.init();
        } catch (error) {
            console.error('DeliveryUI initManagersOnly failed:', error);
        }
    },

    setupEventListeners() {
        // Challan type change
        const challanTypeEl = document.getElementById('challanType');
        if (challanTypeEl) {
            challanTypeEl.addEventListener('change', () => {
                this.updateChallanNumber();
                this.toggleServiceFields();
            });
        }

        // GST mode toggle
        const gstModeEl = document.getElementById('gstMode');
        if (gstModeEl) {
            gstModeEl.addEventListener('change', () => {
                this.toggleGSTFields();
            });
        }

        // GST percentage changes
        ['cgstPercent', 'sgstPercent', 'igstPercent'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.calculateTotals());
            }
        });

        // Challan number edit
        const challanNumberEl = document.getElementById('challanNumber');
        if (challanNumberEl) {
            challanNumberEl.addEventListener('click', () => {
                challanNumberEl.readOnly = false;
                challanNumberEl.select();
            });
        }

        // Form submit
        const challanFormEl = document.getElementById('challanForm');
        if (challanFormEl) {
            challanFormEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveChallan();
            });
        }

        // Tab change events
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                if (target === '#customers') this.loadCustomers();
                if (target === '#inventory') this.loadInventory();
                if (target === '#history') this.loadHistory();
            });
        });
    },

    renderCreateForm() {
        this.updateInventoryDatalist();
        const container = document.getElementById('challanFormContainer');
        if (!container) return;

        container.innerHTML = `
            <form id="challanForm">
                <!-- Challan Header -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <label class="form-label">Challan Type</label>
                        <select class="form-select" id="challanType" required>
                            <option value="delivery">Delivery Challan (DC)</option>
                            <option value="service">Service Challan (SC)</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Challan Number</label>
                        <input type="text" class="form-control" id="challanNumber" readonly>
                        <small class="text-muted">Click to edit</small>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Challan Date</label>
                        <input type="date" class="form-control" id="challanDate" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Reference Number</label>
                        <input type="text" class="form-control" id="referenceNumber">
                    </div>
                </div>

                <!-- Customer Selection -->
                <div class="row mb-4">
                    <div class="col-md-8">
                        <label class="form-label">Customer *</label>
                        <div class="input-group">
                            <span class="input-group-text"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control" id="customerSearch" 
                                placeholder="Type customer name..." list="customerList" autocomplete="off" required>
                            <select id="customerId" style="display: none;">
                                <option value="">Select Customer...</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-4 d-flex align-items-end">
                        <button type="button" class="btn btn-primary w-100" onclick="DeliveryUI.showCustomerModal()">
                            <i class="bi bi-plus-circle me-1"></i> Add New Customer
                        </button>
                    </div>
                </div>

                <!-- Service Fields (hidden by default) -->
                <div id="serviceFields" style="display: none;">
                    <hr class="my-4">
                    <h5 class="mb-3"><i class="bi bi-tools me-2"></i>Service Details</h5>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">Service Location</label>
                            <input type="text" class="form-control" id="serviceLocation">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Technician</label>
                            <select class="form-select" id="technicianId">
                                <option value="">Select Technician...</option>
                            </select>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">Complaint Description</label>
                            <textarea class="form-control" id="complaint" rows="2"></textarea>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Fault Reported</label>
                            <textarea class="form-control" id="faultReported" rows="2"></textarea>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">Observations</label>
                            <textarea class="form-control" id="observations" rows="2"></textarea>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Work Done</label>
                            <textarea class="form-control" id="workDone" rows="2"></textarea>
                        </div>
                    </div>
                </div>

                <hr class="my-4">

                <!-- Items & Services Search -->
                <div class="row g-3 mb-4">
                    <div class="col-md-6">
                        <div class="card glass-panel border-secondary h-100">
                            <div class="card-body p-3">
                                <label class="form-label small text-info mb-1">Search Inventory (Materials)</label>
                                <div class="input-group input-group-sm mb-2">
                                    <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-search"></i></span>
                                    <input type="text" class="form-control bg-dark text-white border-secondary" 
                                        id="globalInventorySearch" placeholder="Type material name..." 
                                        list="inventoryList" autocomplete="off">
                                </div>
                                <div class="row g-2">
                                    <div class="col-6">
                                        <button type="button" class="btn btn-sm btn-outline-success w-100" onclick="DeliveryUI.addItemRow()">
                                            <i class="bi bi-plus"></i> Custom
                                        </button>
                                    </div>
                                    <div class="col-6">
                                        <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="DeliveryUI.showInventoryModal()">
                                            <i class="bi bi-box"></i> New
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card glass-panel border-secondary h-100">
                            <div class="card-body p-3">
                                <label class="form-label small text-warning mb-1">Search Services / Labor</label>
                                <div class="input-group input-group-sm mb-2">
                                    <span class="input-group-text bg-dark border-secondary text-warning"><i class="bi bi-tools"></i></span>
                                    <input type="text" class="form-control bg-dark text-white border-secondary" 
                                        id="globalServiceSearch" placeholder="Type service charges..." 
                                        list="serviceList" autocomplete="off">
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-warning w-100" onclick="DeliveryUI.showSection('services')">
                                    <i class="bi bi-gear"></i> Manage Services
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5><i class="bi bi-list-check me-2"></i>Items List</h5>
                </div>

                <div class="table-responsive">
                    <table class="table table-dark table-striped">
                        <thead>
                            <tr>
                                <th style="width: 25%;">Item Name</th>
                                <th style="width: 20%;">Description</th>
                                <th style="width: 8%;">Qty</th>
                                <th style="width: 10%;">Unit</th>
                                <th style="width: 12%;">Rate</th>
                                <th style="width: 15%;">Amount</th>
                                <th style="width: 10%;"></th>
                            </tr>
                        </thead>
                        <tbody id="itemsTableBody">
                            <!-- Rows added dynamically -->
                        </tbody>
                    </table>
                </div>

                <hr class="my-4">

                <!-- Tax Section -->
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" id="gstMode" checked>
                            <label class="form-check-label" for="gstMode">GST Mode</label>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card bg-secondary">
                            <div class="card-body">
                                <table class="table table-sm table-borderless text-white mb-0">
                                    <tr>
                                        <td><strong>Subtotal:</strong></td>
                                        <td class="text-end fw-bold" id="subtotalDisplay">₹0.00</td>
                                    </tr>
                                    <tr class="gst-row">
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span>CGST</span>
                                                <input type="number" id="cgstPercent" value="9" step="0.01" 
                                                    class="form-control form-control-sm" style="width:70px; background: #fff; color: #000; font-weight: bold;">
                                                <span>%</span>
                                            </div>
                                        </td>
                                        <td class="text-end" id="cgstDisplay">₹0.00</td>
                                    </tr>
                                    <tr class="gst-row">
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span>SGST</span>
                                                <input type="number" id="sgstPercent" value="9" step="0.01" 
                                                    class="form-control form-control-sm" style="width:70px; background: #fff; color: #000; font-weight: bold;">
                                                <span>%</span>
                                            </div>
                                        </td>
                                        <td class="text-end" id="sgstDisplay">₹0.00</td>
                                    </tr>
                                    <tr class="gst-row">
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span>IGST</span>
                                                <input type="number" id="igstPercent" value="0" step="0.01" 
                                                    class="form-control form-control-sm" style="width:70px; background: #fff; color: #000; font-weight: bold;">
                                                <span>%</span>
                                            </div>
                                        </td>
                                        <td class="text-end" id="igstDisplay">₹0.00</td>
                                    </tr>
                                    <tr>
                                        <td><small>Round Off:</small></td>
                                        <td class="text-end" id="roundOffDisplay">₹0.00</td>
                                    </tr>
                                    <tr class="fw-bold fs-5 border-top">
                                        <td><strong>TOTAL:</strong></td>
                                        <td class="text-end" id="totalDisplay">₹0.00</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Terms -->
                <div class="mb-4">
                    <label class="form-label">Terms & Conditions</label>
                    <textarea class="form-control" id="terms" rows="2">Please check goods before accepting delivery</textarea>
                </div>

                <!-- Actions -->
                <div class="d-flex gap-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-save me-1"></i> Save Challan
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="DeliveryUI.resetForm()">
                        <i class="bi bi-x-circle me-1"></i> Clear
                    </button>
                </div>
            </form>
        `;

        // Initialize
        this.updateChallanNumber();
        document.getElementById('challanDate').valueAsDate = new Date();
        this.loadCustomersDropdown();
        this.loadTechniciansDropdown();
        this.addItemRow(); // Add first row

        // Setup Search Listeners
        this.handleInventorySearch('globalInventorySearch', 'challan');
        this.handleInventorySearch('globalServiceSearch', 'challan');
        this.handleCustomerSearch('customerSearch', 'customerId');

        this.setupEventListeners();
    },

    updateChallanNumber() {
        const type = document.getElementById('challanType')?.value || 'delivery';
        const number = DeliveryManager.generateChallanNumber(type);
        const numberEl = document.getElementById('challanNumber');
        if (numberEl) numberEl.value = number;
    },

    toggleServiceFields() {
        const type = document.getElementById('challanType')?.value;
        const serviceFields = document.getElementById('serviceFields');
        if (serviceFields) {
            serviceFields.style.display = type === 'service' ? 'block' : 'none';
        }

        // Toggle "Material Changed" fields on all rows
        document.querySelectorAll('.material-changed-section').forEach(el => {
            el.classList.toggle('d-none', type !== 'service');
        });
    },

    toggleGSTFields() {
        const gstMode = document.getElementById('gstMode')?.checked;
        document.querySelectorAll('.gst-row').forEach(row => {
            row.style.display = gstMode ? 'table-row' : 'none';
        });
        this.calculateTotals();
    },

    addItemRow(data = null) {
        const tbody = document.getElementById('itemsTableBody');
        if (!tbody) return;

        const rowId = 'item_' + Date.now();
        const row = document.createElement('tr');
        row.id = rowId;
        // Handle both 'name' and 'description' field names
        const itemName = data ? (data.name || data.description || '') : '';
        const itemDesc = data ? (data.itemDescription || '') : '';
        const itemQty = data ? (data.quantity || data.qty || 1) : 1;
        const itemRate = data ? (data.rate || 0) : 0;
        const itemAmount = data ? (data.amount || (itemQty * itemRate)) : 0;

        row.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm item-name" 
                    placeholder="Item name" required value="${itemName}" list="inventoryList">
            </td>
            <td>
                <input type="text" class="form-control form-control-sm item-desc" 
                    placeholder="Details (optional)" value="${itemDesc}">
                
                <div class="mt-2 d-flex align-items-center gap-3 material-changed-section ${document.getElementById('challanType')?.value !== 'service' ? 'd-none' : ''}">
                    <div class="form-check form-check-inline mb-0">
                        <input class="form-check-input item-replaced-check" type="checkbox" id="check_${rowId}" ${data && data.materialChanged ? 'checked' : ''}>
                        <label class="form-check-label small" for="check_${rowId}">Changed</label>
                    </div>
                    <input type="text" class="form-control form-control-sm item-replaced-desc ${data && data.materialChanged ? '' : 'd-none'}" 
                        placeholder="Replaced materials" style="flex: 1;" value="${data && data.replacedDescription ? data.replacedDescription : ''}">
                </div>
            </td>
            <td><input type="number" class="form-control form-control-sm item-qty" value="${itemQty}" step="0.01"></td>
            <td>
                <select class="form-select form-select-sm item-unit">
                    <option ${data && data.unit === 'pcs' ? 'selected' : ''}>pcs</option>
                    <option ${data && data.unit === 'nos' ? 'selected' : ''}>nos</option>
                    <option ${data && data.unit === 'kg' ? 'selected' : ''}>kg</option>
                    <option ${data && data.unit === 'ltr' ? 'selected' : ''}>ltr</option>
                    <option ${data && data.unit === 'mtr' ? 'selected' : ''}>mtr</option>
                    <option ${data && data.unit === 'hrs' ? 'selected' : ''}>hrs</option>
                    <option ${data && data.unit === 'job' ? 'selected' : ''}>job</option>
                    <option ${data && data.unit === 'set' ? 'selected' : ''}>set</option>
                </select>
            </td>
            <td><input type="number" class="form-control form-control-sm item-rate" value="${itemRate}" step="0.01"></td>
            <td><input type="number" class="form-control form-control-sm item-amount" value="${itemAmount.toFixed ? itemAmount.toFixed(2) : itemAmount}" step="0.01" readonly></td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove(); DeliveryUI.calculateTotals();">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);

        // Toggle replaced description visibility
        const replacedCheck = row.querySelector('.item-replaced-check');
        const replacedDescInput = row.querySelector('.item-replaced-desc');
        replacedCheck.addEventListener('change', () => {
            replacedDescInput.classList.toggle('d-none', !replacedCheck.checked);
        });

        // Auto-calculate amount
        row.querySelectorAll('.item-qty, .item-rate').forEach(input => {
            input.addEventListener('input', () => {
                const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
                const rate = parseFloat(row.querySelector('.item-rate').value) || 0;
                row.querySelector('.item-amount').value = (qty * rate).toFixed(2);
                this.calculateTotals();
            });
        });

        if (data) this.calculateTotals();
    },

    handleInventorySearch(inputId, type) {
        const input = document.getElementById(inputId);
        if (!input) return;

        // Determine if we should only look for services
        const isServiceSearch = inputId.toLowerCase().includes('servicesearch');

        const processSelection = (value) => {
            if (!value) return;

            const materials = InventoryManager.getAllMaterials();
            // Filter by service unit if it's a service search
            const filtered = isServiceSearch ? materials.filter(m => m.unit === 'service') : materials;

            const found = filtered.find(m =>
                m.name === value ||
                (m.brand && m.brand + ' - ' + m.name === value) ||
                (m.code && m.code === value)
            );

            if (found) {
                // Clear input only AFTER successful processing
                input.value = '';

                if (type === 'challan') this.addItemRow(found);
                else if (type === 'invoice') this.addInvoiceItemRow(found);
                else if (type === 'jobcard') this.addJobCardMaterialRow(found);
                else if (type === 'jobcard_view') this.addJobCardMaterialRow(found, 'jcViewMaterialsBody');

                App.showNotification(`Added ${found.name}`, 'success');
                return true;
            }
            return false;
        };

        // Use 'input' for reactive search if needed, but 'change' is better for datalist selection
        // However, 'change' only fires on blur or explicit selection. 
        // We'll use 'input' with a check for exact match to make it feel responsive, 
        // but avoid clearing it unless it's a definitive selection or Enter press.

        input.addEventListener('input', (e) => {
            const val = input.value.trim();
            // Optional: Auto-add if exact match found (UX choice)
            // For now, let's keep it manual or via selection to avoid "surprises"
        });

        // Handle datalist selection and manual Enter
        input.addEventListener('change', (e) => {
            processSelection(input.value.trim());
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                processSelection(input.value.trim());
            }
        });
    },

    handleCustomerSearch(inputId, targetId) {
        const input = document.getElementById(inputId);
        const targetSelect = document.getElementById(targetId);
        if (!input || !targetSelect) return;

        const updateTarget = (value) => {
            const query = value.trim().toLowerCase();
            console.log(`Searching for customer: "${query}"`);

            if (!query) {
                targetSelect.value = '';
                return;
            }

            const customers = CustomerManager.getAllCustomers().filter(c => {
                const cat = this.getAccountCategory(c);
                return cat === 'Customer' || cat === 'Supplier';
            });
            
            const found = customers.find(c => 
                (c.name && c.name.trim().toLowerCase() === query) || 
                (c.phone && String(c.phone).trim().toLowerCase() === query)
            );

            if (found) {
                targetSelect.value = found.id;
                targetSelect.dispatchEvent(new Event('change'));
                console.log(`Customer search matched: ${found.name} (${found.id})`);
            } else {
                targetSelect.value = ''; // Clear if no match
                if (query.length > 2) console.warn(`Customer search found no match for: "${query}" total checked: ${customers.length}`);
            }
        };

        input.addEventListener('input', () => updateTarget(input.value));
        input.addEventListener('change', () => updateTarget(input.value));
    },

    async quickAddToInventory(rowId) {
        const row = document.getElementById(rowId);
        if (!row) return;

        const description = row.querySelector('.item-desc').value.trim();
        if (!description) {
            App.showNotification('Please enter item description first', 'warning');
            return;
        }

        // Pre-fill modal with description
        document.getElementById('materialName').value = description;
        document.getElementById('materialUnit').value = row.querySelector('.item-unit').value;
        document.getElementById('materialRate').value = row.querySelector('.item-rate').value;

        // Show modal
        this.showInventoryModal();
    },

    calculateTotals() {
        let subtotal = 0;

        document.querySelectorAll('#itemsTableBody tr').forEach(row => {
            const amount = parseFloat(row.querySelector('.item-amount')?.value) || 0;
            subtotal += amount;
        });

        const gstMode = document.getElementById('gstMode')?.checked;
        const cgstPercent = parseFloat(document.getElementById('cgstPercent')?.value) || 0;
        const sgstPercent = parseFloat(document.getElementById('sgstPercent')?.value) || 0;
        const igstPercent = parseFloat(document.getElementById('igstPercent')?.value) || 0;

        let cgst = 0, sgst = 0, igst = 0;
        if (gstMode) {
            cgst = (subtotal * cgstPercent) / 100;
            sgst = (subtotal * sgstPercent) / 100;
            igst = (subtotal * igstPercent) / 100;
        }

        const totalBeforeRound = subtotal + cgst + sgst + igst;
        const total = Math.round(totalBeforeRound);
        const roundOff = total - totalBeforeRound;

        // Update displays
        document.getElementById('subtotalDisplay').textContent = `₹${subtotal.toFixed(2)}`;
        document.getElementById('cgstDisplay').textContent = `₹${cgst.toFixed(2)}`;
        document.getElementById('sgstDisplay').textContent = `₹${sgst.toFixed(2)}`;
        document.getElementById('igstDisplay').textContent = `₹${igst.toFixed(2)}`;
        document.getElementById('roundOffDisplay').textContent = `₹${roundOff.toFixed(2)}`;
        document.getElementById('totalDisplay').textContent = `₹${total.toFixed(2)}`;
    },

    async loadCustomersDropdown() {
        const select = document.getElementById('customerId');
        if (!select) return;

        const customers = CustomerManager.getAllCustomers().filter(c => this.getAccountCategory(c) === 'Customer');
        select.innerHTML = '<option value="">Select Customer...</option>';
        customers.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name} ${c.gstin ? '(' + c.gstin + ')' : ''}</option>`;
        });
    },

    async loadTechniciansDropdown() {
        const select = document.getElementById('technicianId');
        if (!select) return;

        // Load from HRMS employees
        const employees = DataManager.getData('employees') || [];
        select.innerHTML = '<option value="">Select Technician...</option>';
        employees.filter(e => e.status === 'active').forEach(emp => {
            select.innerHTML += `<option value="${emp.name}">${emp.name}</option>`;
        });
    },

    async saveChallan() {
        try {
            // Collect form data
            const items = [];
            document.querySelectorAll('#itemsTableBody tr').forEach(row => {
                const name = row.querySelector('.item-name')?.value;
                if (!name) return; // Skip empty rows

                items.push({
                    name: name,
                    description: name, // Keep for backward compatibility
                    itemDescription: row.querySelector('.item-desc')?.value || '',
                    quantity: parseFloat(row.querySelector('.item-qty').value) || 0,
                    unit: row.querySelector('.item-unit').value,
                    rate: parseFloat(row.querySelector('.item-rate').value) || 0,
                    amount: parseFloat(row.querySelector('.item-amount').value) || 0,
                    materialChanged: row.querySelector('.item-replaced-check').checked,
                    replacedDescription: row.querySelector('.item-replaced-desc').value.trim()
                });
            });

            if (items.length === 0) {
                throw new Error('Please add at least one item');
            }

            const customerId = document.getElementById('customerId').value;
            if (!customerId) {
                throw new Error('Please select a valid customer from the list');
            }

            const challanData = {
                type: document.getElementById('challanType').value,
                customNumber: document.getElementById('challanNumber').value,
                date: document.getElementById('challanDate').value,
                customerId: document.getElementById('customerId').value,
                referenceNumber: document.getElementById('referenceNumber').value,
                serviceLocation: document.getElementById('serviceLocation')?.value,
                technicianId: document.getElementById('technicianId')?.value,
                complaint: document.getElementById('complaint')?.value,
                faultReported: document.getElementById('faultReported')?.value,
                observations: document.getElementById('observations')?.value,
                workDone: document.getElementById('workDone')?.value,
                items: items,
                gstMode: document.getElementById('gstMode').checked,
                cgstPercent: parseFloat(document.getElementById('cgstPercent').value) || 0,
                sgstPercent: parseFloat(document.getElementById('sgstPercent').value) || 0,
                igstPercent: parseFloat(document.getElementById('igstPercent').value) || 0,
                terms: document.getElementById('terms').value,
                status: 'finalized'
            };

            if (this.currentEditingChallan) {
                // Update existing challan
                await DeliveryManager.updateChallan(this.currentEditingChallan, challanData);
                App.showNotification(`Challan ${this.currentEditingChallan} updated successfully!`, 'success');
                this.currentEditingChallan = null;
            } else {
                // Create new challan
                const challan = await DeliveryManager.createChallan(challanData);
                App.showNotification(`Challan ${challan.id} created successfully!`, 'success');
            }
            // Refresh UI components instead of full page reload
            this.resetForm();
            this.updateInventoryDatalist();
            this.loadHistory();
            this.showSection('history');
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    resetForm() {
        document.getElementById('challanForm')?.reset();
        document.getElementById('itemsTableBody').innerHTML = '';
        this.updateChallanNumber();
        document.getElementById('challanDate').valueAsDate = new Date();
        this.addItemRow();
    },

    // Customer Management
    // Customer Management
    showCustomerModal(customerId = null) {
        this.editingCustomerId = customerId;
        const modalTitle = document.querySelector('#customerModal .modal-title');
        const saveBtn = document.querySelector('#customerModal .modal-footer .btn-primary');

        const typeLabels = {
            'Customer': 'Customer',
            'Supplier': 'Supplier / Vendor',
            'Other': 'General Account'
        };
        const currentLabel = typeLabels[this.currentCustomerType] || 'Account';

        if (customerId) {
            const customer = CustomerManager.getCustomer(customerId);
            if (!customer) {
                App.showNotification('Account not found', 'error');
                return;
            }
            if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Edit ${currentLabel}`;
            if (saveBtn) saveBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Update ${currentLabel}`;

            if (document.getElementById('customerGSTIN')) document.getElementById('customerGSTIN').value = customer.gstin || '';
            if (document.getElementById('customerName')) document.getElementById('customerName').value = customer.name || '';
            if (document.getElementById('customerPhone')) document.getElementById('customerPhone').value = customer.phone || '';
            if (document.getElementById('customerAddress')) document.getElementById('customerAddress').value = customer.address || '';
            if (document.getElementById('customerEmail')) document.getElementById('customerEmail').value = customer.email || '';
            if (document.getElementById('customerDCNumber')) document.getElementById('customerDCNumber').value = customer.customerDCNumber || '';
        } else {
            if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-person-plus-fill me-2"></i>Add New ${currentLabel}`;
            if (saveBtn) saveBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>Add ${currentLabel}`;
            document.getElementById('customerForm')?.reset();
        }

        const modal = new bootstrap.Modal(document.getElementById('customerModal'));
        modal.show();
    },

    async verifyGSTIN() {
        try {
            const gstinInput = document.getElementById('customerGSTIN');
            const gstin = gstinInput?.value.trim();

            if (!gstin) {
                App.showNotification('Please enter GSTIN first', 'warning');
                return;
            }

            if (gstin.length !== 15) {
                App.showNotification('GSTIN must be 15 characters', 'warning');
                return;
            }

            // Show loading state
            const verifyBtn = event?.target;
            const originalText = verifyBtn?.innerHTML;
            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Verifying...';
            }

            App.showNotification('Verifying GSTIN...', 'info');
            const result = await CustomerManager.verifyGSTIN(gstin);

            // Restore button
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = originalText;
            }

            if (result.success) {
                document.getElementById('customerName').value = result.data.name || '';
                document.getElementById('customerAddress').value = result.data.address || '';
                App.showNotification('GSTIN verified successfully! Details auto-filled.', 'success');
            } else {
                App.showNotification(result.message || 'Unable to verify online. Please enter details manually.', 'warning');
            }
        } catch (error) {
            console.error('GSTIN Verification Error:', error);
            App.showNotification('Error verifying GSTIN: ' + error.message, 'error');
        }
    },

    async saveCustomer() {
        try {
            const customerData = {
                gstin: document.getElementById('customerGSTIN')?.value.trim(),
                name: document.getElementById('customerName')?.value.trim(),
                phone: document.getElementById('customerPhone')?.value.trim(),
                address: document.getElementById('customerAddress')?.value.trim(),
                email: document.getElementById('customerEmail')?.value.trim(),
                customerDCNumber: document.getElementById('customerDCNumber')?.value.trim()
            };

            if (!customerData.name) {
                throw new Error('Customer name is required');
            }

            let customer;
            if (this.editingCustomerId) {
                customer = await CustomerManager.updateCustomer(this.editingCustomerId, customerData);
                App.showNotification('Customer updated successfully!', 'success');
            } else {
                customer = await CustomerManager.addCustomer(customerData);
                App.showNotification('Customer added successfully!', 'success');
            }

            // Close modal and refresh
            bootstrap.Modal.getInstance(document.getElementById('customerModal'))?.hide();
            this.updateInventoryDatalist();
            this.loadCustomersDropdown();
            this.loadCustomers();

            // Select it in searchable inputs if just added/edited
            const searchableInputs = ['customerSearch', 'invCustomerSearch', 'jcCustomerSearch'];
            searchableInputs.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.value = customer.name;
                    input.dispatchEvent(new Event('input'));
                }
            });

            this.editingCustomerId = null;
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    loadCustomers(searchQuery = '') {
        let containerId = this.currentCustomersContainerId || 'customersContainer';
        let container = document.getElementById(containerId);

        // Robust Container Detection: Scan all arguments for a container ID
        const args = Array.from(arguments);
        const viewArg = args.find(a => typeof a === 'string' && (a.endsWith('View') || a.endsWith('Container')));
        if (viewArg) {
            containerId = viewArg;
            container = document.getElementById(containerId);
            // If the viewArg was the first arg, arguments[1] might be search. 
            // If it was the second arg, arguments[0] might be search.
            const otherArg = args.find(a => typeof a === 'string' && a !== viewArg);
            if (otherArg) searchQuery = otherArg;
        }

        if (!container) return;

        // If we're rendering into a top-level view, we might need a shell
        if (container.classList.contains('view-section')) {
            const accId = 'accCustomersContainer_' + Date.now();
            container.innerHTML = `<div class="container-fluid p-4" id="${accId}"></div>`;
            container = container.querySelector('#' + accId);
            this.currentCustomersContainerId = accId;
        }

        const allData = CustomerManager.getAllCustomers();

        // Separate into buckets for stats
        const counts = {
            Customer: 0,
            Supplier: 0,
            Other: 0
        };

        allData.forEach(c => {
            const cat = this.getAccountCategory(c);
            counts[cat]++;
        });

        // Update stats cards
        const sCust = document.getElementById('statsCustomerCount');
        const sSupp = document.getElementById('statsSupplierCount');
        const sOther = document.getElementById('statsOtherCount');
        if (sCust) sCust.innerText = counts.Customer;
        if (sSupp) sSupp.innerText = counts.Supplier;
        if (sOther) sOther.innerText = counts.Other;

        // Apply categorical filter
        let customers = allData.filter(c => {
            return this.getAccountCategory(c) === this.currentCustomerType;
        });

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            customers = customers.filter(c =>
                c.name.toLowerCase().includes(lowerQuery) ||
                (c.gstin || '').toLowerCase().includes(lowerQuery) ||
                String(c.phone || '').includes(searchQuery)
            );
        }

        const typeLabels = {
            'Customer': 'Customers',
            'Supplier': 'Suppliers / Vendors',
            'Other': 'Other Accounts'
        };

        container.innerHTML = `
            <div class="row h-100 g-4">
                <!-- Left: List View -->
                <div class="col-md-7 border-end border-secondary">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4 class="mb-0 text-primary">
                            <i class="bi bi-people-fill me-2"></i>${typeLabels[this.currentCustomerType]} (${customers.length})
                        </h4>
                        <div class="btn-group">
                            <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                                <i class="bi bi-grid-fill me-1"></i> Apps
                            </button>
                            <button class="btn btn-primary btn-sm ms-2" onclick="DeliveryUI.showCustomerModal()">
                                <i class="bi bi-plus-circle me-1"></i> Add ${this.currentCustomerType}
                            </button>
                        </div>
                    </div>

                    <div class="input-group mb-3 glass-panel p-2 rounded">
                        <span class="input-group-text bg-transparent border-0 text-muted"><i class="bi bi-search"></i></span>
                        <input type="text" class="form-control bg-transparent border-0 text-white" id="customerSearchGlobal"
                               placeholder="Search name, GSTIN or phone..." value="${searchQuery}"
                               oninput="DeliveryUI.loadCustomers(this.value)">
                    </div>

                    <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
                        <table class="table table-dark table-hover align-middle border-secondary">
                            <thead class="sticky-top bg-dark">
                                <tr class="small text-uppercase text-muted">
                                    <th>${this.currentCustomerType} Info</th>
                                    <th>${this.currentCustomerType === 'Other' ? 'Group' : 'Address'}</th>
                                    <th class="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customers.length === 0 ? `<tr><td colspan="3" class="text-center p-5 text-muted">No ${this.currentCustomerType.toLowerCase()}s found</td></tr>` :
                customers.map(c => {
                    try {
                        return `
                                    <tr onclick="DeliveryUI.showCustomerBills('${c.id}')" style="cursor: pointer;">
                                        <td>
                                            <div class="fw-bold text-white">${c.name || c.displayName || '(No Name)'}</div>
                                            <div class="extra-small text-muted">
                                                ${c.gstin ? `<span class="me-2"><i class="bi bi-tag-fill me-1"></i>${c.gstin}</span>` : ''}
                                                ${c.phone ? `<span><i class="bi bi-telephone-fill me-1"></i>${c.phone}</span>` : ''}
                                            </div>
                                        </td>
                                        <td>
                                            <div class="extra-small text-muted text-truncate" style="max-width: 200px;">
                                                ${c.isOtherAccount ? (c.accountGroup || 'Other') : (c.address || '-')}
                                            </div>
                                        </td>
                                        <td class="text-end">
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-info" onclick="event.stopPropagation(); DeliveryUI.showCustomerModal('${c.id}')" title="Edit">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <button class="btn btn-outline-success" onclick="event.stopPropagation(); DeliveryUI.showCustomerLedger('${c.id}')" title="Ledger">
                                                    <i class="bi bi-journal-text"></i>
                                                </button>
                                                <button class="btn btn-outline-danger" onclick="event.stopPropagation(); DeliveryUI.deleteCustomer('${c.id}')" title="Delete">
                                                    <i class="bi bi-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                    } catch (e) {
                        console.error('Error rendering customer row:', e, c);
                        return `<tr class="table-danger"><td colspan="3">Error rendering record: ${c.name || c.id}</td></tr>`;
                    }
                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right: Side-tab Bill View -->
                <div class="col-md-5">
                    <div id="customerBillView" class="h-100">
                        <div class="h-100 d-flex flex-column justify-content-center align-items-center text-muted p-5 text-center bg-dark bg-opacity-25 rounded border border-dashed">
                            <i class="bi bi-receipt mb-3 fs-1"></i>
                            <p>Select a ${this.currentCustomerType.toLowerCase()} to view history</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Focus search input if it was active
        if (searchQuery) {
            const input = document.getElementById('customerSearchGlobal');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
    },

    showCustomerBills(customerId) {
        const customer = CustomerManager.getCustomer(customerId);
        if (!customer) return;

        const invoices = InvoiceManager.getAllInvoices().filter(i => i.customerId === customerId);
        const challans = DeliveryManager.getAllChallans().filter(c => c.customerId === customerId);

        // Match purchases by vendor name
        const purchases = ExpenseManager.getAllExpenses().filter(e =>
            (e.category || '').toLowerCase().includes('purchase') &&
            (e.vendorName || '').toLowerCase() === customer.name.toLowerCase()
        );

        const container = document.getElementById('customerBillView');
        if (!container) return;

        container.innerHTML = `
            <div class="card glass-panel border-0 h-100 d-flex flex-column">
                <div class="card-header border-secondary p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="mb-0 text-success fw-bold">${customer.name}</h5>
                        <button class="btn btn-sm btn-outline-secondary" onclick="DeliveryUI.loadCustomers()"><i class="bi bi-x"></i></button>
                    </div>
                    <div class="small text-muted mb-3">
                        ${customer.gstin ? `<div><i class="bi bi-tag-fill me-1"></i>GSTIN: ${customer.gstin}</div>` : ''}
                        ${customer.phone ? `<div><i class="bi bi-telephone-fill me-1"></i>Phone: ${customer.phone}</div>` : ''}
                    </div>

                    <ul class="nav nav-pills nav-fill small bg-dark p-1 rounded-pill" id="customerBillTabs" role="tablist">
                        <li class="nav-item">
                            <button class="nav-link active rounded-pill py-1" data-bs-toggle="pill" data-bs-target="#cust-invoices">Sales (${invoices.length})</button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link rounded-pill py-1" data-bs-toggle="pill" data-bs-target="#cust-purchases">Purchases (${purchases.length})</button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link rounded-pill py-1" data-bs-toggle="pill" data-bs-target="#cust-challans">Challans (${challans.length})</button>
                        </li>
                    </ul>
                </div>
                <div class="card-body p-0 overflow-auto tab-content" style="max-height: 60vh;">
                    <div class="tab-pane fade show active" id="cust-invoices">
                        <div class="list-group list-group-flush bg-transparent">
                            ${invoices.length === 0 ? '<div class="p-4 text-center text-muted small">No invoices found.</div>' :
                invoices.sort((a, b) => new Date(b.date) - new Date(a.date)).map(inv => `
                                <div class="list-group-item bg-transparent border-secondary py-3">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <span class="fw-bold text-white small">INV #${inv.id}</span>
                                        <span class="badge bg-success small">₹${inv.total.toFixed(2)}</span>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center extra-small">
                                        <span class="text-muted">${DataManager.formatDateDisplay(inv.date)}</span>
                                        <button class="btn btn-link btn-sm p-0 extra-small text-info" onclick="DeliveryUI.viewInvoice('${inv.id}')">View PDF</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="tab-pane fade" id="cust-purchases">
                        <div class="list-group list-group-flush bg-transparent">
                            ${purchases.length === 0 ? '<div class="p-4 text-center text-muted small">No purchase records found.</div>' :
                purchases.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `
                                <div class="list-group-item bg-transparent border-secondary py-3">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <span class="fw-bold text-white small">PUR #${p.id}</span>
                                        <span class="badge bg-info small">₹${(p.amount || 0).toFixed(2)}</span>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center extra-small">
                                        <span class="text-muted">${DataManager.formatDateDisplay(p.date)}</span>
                                        <button class="btn btn-link btn-sm p-0 extra-small text-info" onclick="DeliveryUI.viewPurchaseDetails('${p.id}')">View Details</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="tab-pane fade" id="cust-challans">
                        <div class="list-group list-group-flush bg-transparent">
                            ${challans.length === 0 ? '<div class="p-4 text-center text-muted small">No challans found.</div>' :
                challans.sort((a, b) => new Date(b.date) - new Date(a.date)).map(ch => `
                                <div class="list-group-item bg-transparent border-secondary py-3">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <span class="fw-bold text-white small">${ch.type === 'service' ? 'SC' : 'DC'} #${ch.id}</span>
                                        <span class="badge bg-secondary small">${ch.status.toUpperCase()}</span>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center extra-small">
                                        <span class="text-muted">${DataManager.formatDateDisplay(ch.date)}</span>
                                        <button class="btn btn-link btn-sm p-0 extra-small text-info" onclick="DeliveryUI.viewChallan('${ch.id}')">View Details</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="card-footer border-secondary text-center">
                    <button class="btn btn-sm btn-outline-primary w-100" onclick="DeliveryUI.showCustomerLedger('${customerId}')">
                        <i class="bi bi-file-earmark-ruled me-1"></i> Open Full Ledger
                    </button>
                </div>
            </div>
        `;
    },

    async deleteCustomer(customerId) {
        if (!confirm('Delete this customer?')) return;

        try {
            await CustomerManager.deleteCustomer(customerId);
            App.showNotification('Customer deleted', 'success');
            this.loadCustomers();
            this.loadCustomersDropdown();
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    showCustomerLedger(customerId) {
        const customer = CustomerManager.getCustomer(customerId);
        if (!customer) {
            App.showNotification('Customer not found', 'error');
            return;
        }

        const invoices = InvoiceManager.getAllInvoices().filter(i => i.customerId === customerId);
        const challans = DeliveryManager.getAllChallans().filter(c => c.customerId === customerId);
        const jobCards = JobCardManager.getAllJobCards().filter(jc => jc.customerId === customerId);

        // Match vouchers by customerId OR by exact customerName (for imported data)
        const customerNameLower = customer.name.toLowerCase().trim();
        const vouchers = (DataManager.getData('vouchers') || []).filter(v => {
            if (v.customerId === customerId) return true;
            const voucherCustomerName = (v.customerName || '').toLowerCase().trim();
            // Strict matching for imported data to avoid cross-account entries
            return voucherCustomerName === customerNameLower;
        });

        // Match purchases by vendor name (using strict match)
        const purchases = ExpenseManager.getAllExpenses().filter(e => {
            const vendorNameLower = (e.vendorName || e.description.split(':')[0] || '').toLowerCase().trim();
            const categoryLower = (e.category || '').toLowerCase();

            // Check if it's a purchase category
            if (!categoryLower.includes('purchase')) return false;

            // Strict name matching
            return vendorNameLower === customerNameLower;
        });

        const totalInvoiced = invoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
        const totalPurchased = purchases.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalPaid = vouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);
        const totalPaymentsMade = vouchers.filter(v => v.type !== 'receipt').reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

        // Standard Accounting Principles:
        // Sales/Invoices = Debit
        // Receipts from Customers = Credit
        // Purchases from Vendors = Credit
        // Payments to Vendors = Debit
        const transactions = [
            ...invoices.map(i => ({ date: i.date, type: 'Invoice (Sale)', ref: i.id, debit: i.total, credit: 0, docType: 'invoice' })),
            ...challans.map(c => ({ date: c.date, type: 'Challan', ref: c.id, debit: c.total || 0, credit: 0, docType: 'challan' })),
            ...jobCards.map(jc => ({ date: jc.createdAt, type: 'Job Card', ref: jc.id, debit: 0, credit: 0, docType: 'jobcard' })),
            ...purchases.map(p => ({ date: p.date, type: 'Purchase', ref: p.id, debit: 0, credit: p.amount, docType: 'purchase' })),
            ...vouchers.map(v => {
                const isReceipt = v.type === 'receipt';
                return {
                    date: v.date,
                    type: isReceipt ? 'Receipt' : 'Payment',
                    ref: v.id,
                    debit: isReceipt ? 0 : v.amount,
                    credit: isReceipt ? v.amount : 0,
                    docType: 'voucher'
                };
            })
        ];

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Sort transactions chronologically (oldest first) for running balance calculation
        const sortedTransactions = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate running balance
        let runningBalance = 0;
        const transactionsWithBalance = sortedTransactions.map(t => {
            runningBalance += (t.debit - t.credit);
            return { ...t, balance: runningBalance };
        });

        // Calculate totals
        const totalDebit = transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
        const totalCredit = transactions.reduce((sum, t) => sum + (t.credit || 0), 0);
        const closingBalance = totalDebit - totalCredit;

        const modalHtml = `
            <div class="modal fade" id="ledgerModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content bg-dark text-white">
                        <div class="modal-header border-secondary">
                            <div>
                                <h5 class="modal-title text-white"><i class="bi bi-journal-text me-2"></i>Account Ledger - ${customer.name}</h5>
                                <small class="text-white-50">${customer.gstin ? `GSTIN: ${customer.gstin}` : ''} ${customer.phone ? `| Phone: ${customer.phone}` : ''}</small>
                            </div>
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="const modal = document.getElementById('ledgerModal'); const dialog = modal.querySelector('.modal-dialog'); const tableDiv = document.getElementById('ledgerTableContainer'); dialog.classList.toggle('modal-fullscreen'); if(dialog.classList.contains('modal-fullscreen')) { tableDiv.style.maxHeight = 'calc(100vh - 350px)'; this.querySelector('i').classList.remove('bi-fullscreen'); this.querySelector('i').classList.add('bi-fullscreen-exit'); } else { tableDiv.style.maxHeight = '450px'; this.querySelector('i').classList.remove('bi-fullscreen-exit'); this.querySelector('i').classList.add('bi-fullscreen'); }" title="Toggle Fullscreen">
                                    <i class="bi bi-fullscreen"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-success" onclick="window.print()" title="Print Ledger">
                                    <i class="bi bi-printer"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-info" onclick="alert('Email feature coming soon')" title="Email Ledger">
                                    <i class="bi bi-envelope"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-primary" onclick="alert('WhatsApp feature coming soon')" title="Share via WhatsApp">
                                    <i class="bi bi-whatsapp"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body">
                            <div class="row g-2 mb-4">
                                <div class="col">
                                    <div class="card bg-secondary text-center border-0 shadow-sm h-100">
                                        <div class="card-body py-2 px-1 text-nowrap">
                                            <h6 class="text-white-50 extra-small mb-1">Total Sales</h6>
                                            <h5 class="mb-0 text-info fw-bold small">₹${totalInvoiced.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                                        </div>
                                    </div>
                                </div>
                                <div class="col">
                                    <div class="card bg-secondary text-center border-0 shadow-sm h-100">
                                        <div class="card-body py-2 px-1 text-nowrap">
                                            <h6 class="text-white-50 extra-small mb-1">Total Purchases</h6>
                                            <h5 class="mb-0 text-warning fw-bold small">₹${totalPurchased.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                                        </div>
                                    </div>
                                </div>
                                <div class="col">
                                    <div class="card bg-secondary text-center border-0 shadow-sm h-100">
                                        <div class="card-body py-2 px-1 text-nowrap">
                                            <h6 class="text-white-50 extra-small mb-1 text-nowrap">Total Receipts</h6>
                                            <h5 class="mb-0 text-success fw-bold small">₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                                        </div>
                                    </div>
                                </div>
                                <div class="col">
                                    <div class="card bg-secondary text-center border-0 shadow-sm h-100">
                                        <div class="card-body py-2 px-1 text-nowrap">
                                            <h6 class="text-white-50 extra-small mb-1 text-nowrap">Total Payments</h6>
                                            <h5 class="mb-0 text-danger fw-bold small">₹${totalPaymentsMade.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                                        </div>
                                    </div>
                                </div>
                                                                            <div class="col">
                                    <div class="card bg-secondary text-center border-0 shadow-sm h-100">
                                        <div class="card-body py-2 px-1 text-nowrap">
                                            <h6 class="text-white-50 extra-small mb-1 text-nowrap">Net Balance</h6>
                                            <h5 class="mb-0 fw-bold small ${closingBalance > 0 ? 'text-danger' : closingBalance < 0 ? 'text-success' : 'text-white'}">₹${Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                                            <div class="extra-small text-white-50">${closingBalance > 0 ? 'Receivable' : closingBalance < 0 ? 'Payable' : 'Settled'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <h6 class="mb-3 text-white">Transaction History</h6>
                            <div id="ledgerTableContainer" class="table-responsive" style="max-height: 450px;">
                                <table class="table table-dark table-hover table-sm mb-0">
                                    <thead class="sticky-top bg-dark">
                                        <tr class="small">
                                            <th class="text-white">Date</th>
                                            <th class="text-white">Particulars</th>
                                            <th class="text-white">Vch No</th>
                                            <th class="text-white">Ref No</th>
                                            <th class="text-end text-white">Debit (₹)</th>
                                            <th class="text-end text-white">Credit (₹)</th>
                                            <th class="text-end text-white">Balance (₹)</th>
                                            <th class="text-center text-white">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${transactionsWithBalance.length === 0 ?
                '<tr><td colspan="8" class="text-center text-muted py-4">No transactions found</td></tr>' :
                `<tr class="table-secondary fw-bold">
                                                <td colspan="4" class="text-white">Opening Balance</td>
                                                <td class="text-end text-white">-</td>
                                                <td class="text-end text-white">-</td>
                                                <td class="text-end text-white">₹0.00</td>
                                                <td></td>
                                            </tr>
                                            ${transactionsWithBalance.map(t => `
                                                <tr>
                                                    <td class="small text-white-50">${DataManager.formatDateDisplay(t.date)}</td>
                                                    <td>
                                                        <span class="badge bg-${t.type === 'Payment' ? 'success' :
                        t.type === 'Purchase' ? 'warning' :
                            t.type.includes('Sale') ? 'primary' :
                                'secondary'
                    } small">${t.type}</span>
                                                    </td>
                                                    <td class="small text-white">${t.ref}</td>
                                                <td class="small text-white-50">-</td>
                                                    <td class="text-end ${t.debit ? 'text-danger fw-bold' : 'text-white-50'}">${t.debit ? t.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
                                                    <td class="text-end ${t.credit ? 'text-success fw-bold' : 'text-white-50'}">${t.credit ? t.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
                                                    <td class="text-end fw-bold ${t.balance > 0 ? 'text-danger' : t.balance < 0 ? 'text-success' : 'text-white'}">${Math.abs(t.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${t.balance > 0 ? 'Dr' : t.balance < 0 ? 'Cr' : ''}</td>
                                                    <td class="text-center">
                                                        <button class="btn btn-sm btn-outline-info border-0" onclick="event.stopPropagation(); DeliveryUI.${t.docType === 'invoice' ? 'viewInvoice' : t.docType === 'purchase' ? 'viewPurchaseDetails' : t.docType === 'voucher' ? 'viewVoucher' : t.docType === 'challan' ? 'viewChallan' : t.docType === 'jobcard' ? 'viewJobCard' : 'alert'}('${t.ref}');" title="View Details">
                                                            <i class="bi bi-eye"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                            <tr class="table-secondary fw-bold border-top border-2">
                                                <td colspan="4" class="text-white">Current Total</td>
                                                <td class="text-end text-danger fw-bold">₹${totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td class="text-end text-success fw-bold">₹${totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td class="text-end text-white">-</td>
                                                <td></td>
                                            </tr>
                                            <tr class="table-info fw-bold">
                                                <td colspan="6" class="text-end text-white">Closing Balance:</td>
                                                <td class="text-end fw-bold ${closingBalance > 0 ? 'text-danger' : closingBalance < 0 ? 'text-success' : 'text-white'}">₹${Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${closingBalance > 0 ? 'Dr' : closingBalance < 0 ? 'Cr' : ''}</td>
                                                <td></td>
                                            </tr>`
            }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-success" onclick="DeliveryUI.showVoucherForm('${customer.id}', '${customer.name.replace(/'/g, "\\'")}');">
                                <i class="bi bi-plus-circle me-1"></i>Record Payment
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('ledgerModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }

        // Insert modal HTML into DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Now create and show the modal
        const modal = new bootstrap.Modal(document.getElementById('ledgerModal'));
        modal.show();
    },

    // Inventory Management
    loadInventory(searchQuery = '') {
        const container = document.getElementById('inventoryContainer');
        if (!container) return;

        let materials = InventoryManager.getAllMaterials();

        // Alphabetical sorting
        materials.sort((a, b) => a.name.localeCompare(b.name));

        // Search filtering
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            materials = materials.filter(m =>
                m.name.toLowerCase().includes(query) ||
                (m.description || '').toLowerCase().includes(query) ||
                (m.category || '').toLowerCase().includes(query)
            );
        }

        container.innerHTML = `
            <div class="d-flex justify-content-between mb-3 align-items-center">
                <h5>Inventory (${materials.length})</h5>
                <div class="d-flex gap-2">
                    <div class="input-group input-group-sm" style="width: 250px;">
                        <span class="input-group-text bg-dark border-secondary text-muted"><i class="bi bi-search"></i></span>
                        <input type="text" id="inventorySearch" class="form-control bg-dark border-secondary text-light" 
                               placeholder="Search items..." value="${searchQuery}"
                               oninput="DeliveryUI.loadInventory(this.value)">
                    </div>
                    <button class="btn btn-outline-info btn-sm" onclick="ExportImportHelper.showModal('inventory')">
                    <i class="bi bi-arrow-left-right me-1"></i> Export/Import
                </button>
                <button class="btn btn-primary btn-sm" onclick="DeliveryUI.showInventoryModal()">
                    <i class="bi bi-plus-circle me-1"></i> Add Item
                </button>
                </div>
            </div>
            ${materials.length === 0 ? `
                <div class="text-center text-light py-4 bg-dark rounded border border-secondary border-dashed">
                    <i class="bi bi-box-seam display-4 text-muted mb-2"></i>
                    <p class="mb-0">${searchQuery ? 'No items match your search.' : 'No materials found. Add your first material!'}</p>
                </div>
            ` : `
            <div class="table-responsive">
                <table class="table table-dark table-hover table-sm border-secondary align-middle">
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th>HSN</th>
                            <th>Category</th>
                            <th>Brand</th>
                            <th>Unit</th>
                            <th>Stock</th>
                            <th>Rate</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${materials.map(m => `
                            <tr>
                                <td><span class="fw-bold text-info">${m.name}</span></td>
                                <td><small class="badge bg-dark border border-secondary">${m.hsnCode || '-'}</small></td>
                                <td>${m.category || '-'}</td>
                                <td>${m.brand || '-'}</td>
                                <td><span class="badge bg-secondary">${m.unit}</span></td>
                                <td class="${m.currentStock < 0 ? 'text-danger fw-bold' : ''}">${m.currentStock || 0}</td>
                                <td>₹${(m.rate || 0).toFixed(2)}</td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-info me-1" onclick="DeliveryUI.showInventoryModal('${m.id}')">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="DeliveryUI.deleteMaterial('${m.id}')">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        `;

        // Focus search input after re-render if it was focused
        if (searchQuery) {
            const searchInput = document.getElementById('inventorySearch');
            if (searchInput) {
                searchInput.focus();
                searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
            }
        }
    },

    showInventoryModal(materialId = null) {
        document.getElementById('inventoryForm')?.reset();
        this.currentEditingMaterialId = materialId;

        if (materialId) {
            const m = InventoryManager.getMaterial(materialId);
            if (m) {
                this.setFieldValue('materialType', m.type || 'material');
                this.setFieldValue('materialName', m.name);
                this.setFieldValue('materialCategory', m.category || '');
                this.setFieldValue('materialSubcategory', m.subcategory || '');
                this.setFieldValue('materialBrand', m.brand || '');
                this.setFieldValue('materialUnit', m.unit || 'pcs');
                this.setFieldValue('materialHSN', m.hsnCode || '');
                this.setFieldValue('materialBarcode', m.barcode || '');
                this.setFieldValue('materialMRP', m.mrp || 0);
                this.setFieldValue('materialStock', m.currentStock || 0);
                this.setFieldValue('materialMinQty', m.moq || m.minStock || 0);
                this.setFieldValue('materialPurchasePrice', m.purchaseRate || 0);
                this.setFieldValue('materialRate', m.rate || 0);
                this.setFieldValue('materialDiscount', m.discount || 0);
                this.setFieldValue('materialTaxType', m.taxType || 'exclusive');
                this.setFieldValue('materialGSTRate', m.gstRate?.replace(/[^\d]/g, '') || '18');
                this.setFieldValue('materialDescription', m.description || '');
                this.setFieldValue('materialRemarks', m.remarks || '');

                const modalTitle = document.querySelector('#inventoryModal .modal-title');
                if (modalTitle) modalTitle.textContent = 'Edit Item';
            }
        } else {
            const modalTitle = document.querySelector('#inventoryModal .modal-title');
            if (modalTitle) modalTitle.textContent = 'Add Inventory Item';
        }

        const modal = new bootstrap.Modal(document.getElementById('inventoryModal'));
        modal.show();
    },

    setFieldValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    },

    async saveMaterial() {
        try {
            const materialData = {
                type: document.getElementById('materialType').value,
                name: document.getElementById('materialName').value.trim(),
                category: document.getElementById('materialCategory').value.trim(),
                subcategory: document.getElementById('materialSubcategory').value.trim(),
                brand: document.getElementById('materialBrand').value.trim(),
                unit: document.getElementById('materialUnit').value,
                hsnCode: document.getElementById('materialHSN').value.trim(),
                barcode: document.getElementById('materialBarcode').value.trim(),
                mrp: parseFloat(document.getElementById('materialMRP').value) || 0,
                currentStock: parseFloat(document.getElementById('materialStock').value) || 0,
                moq: parseFloat(document.getElementById('materialMinQty').value) || 0,
                purchaseRate: parseFloat(document.getElementById('materialPurchasePrice').value) || 0,
                rate: parseFloat(document.getElementById('materialRate').value) || 0,
                discount: parseFloat(document.getElementById('materialDiscount').value) || 0,
                taxType: document.getElementById('materialTaxType').value,
                gstRate: `GST@${document.getElementById('materialGSTRate').value}%`,
                description: document.getElementById('materialDescription').value.trim(),
                remarks: document.getElementById('materialRemarks').value.trim()
            };

            if (!materialData.name) {
                throw new Error('Item name is required');
            }

            if (this.currentEditingMaterialId) {
                await InventoryManager.updateMaterial(this.currentEditingMaterialId, materialData);
                App.showNotification('Item updated successfully!', 'success');
            } else {
                await InventoryManager.addMaterial(materialData);
                App.showNotification('Item added successfully!', 'success');
            }

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('inventoryModal'))?.hide();

            // Refresh UI
            this.loadInventory();
            this.loadServices();
            this.updateInventoryDatalist();

        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    async deleteMaterial(materialId) {
        if (!confirm('Delete this item from inventory?')) return;
        try {
            await InventoryManager.deleteMaterial(materialId);
            App.showNotification('Item removed', 'success');
            this.loadInventory();
            this.updateInventoryDatalist();
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    updateInventoryDatalist() {
        const inventoryDatalist = document.getElementById('inventoryList');
        const serviceDatalist = document.getElementById('serviceList');
        const customerDatalist = document.getElementById('customerList');

        const materials = InventoryManager.getAllMaterials();
        const customers = CustomerManager.getAllCustomers();

        if (inventoryDatalist) {
            inventoryDatalist.innerHTML = materials
                .filter(m => m.unit !== 'service')
                .map(m => `
                    <option value="${m.name}" data-rate="${m.rate}" data-unit="${m.unit}" data-stock="${m.currentStock || 0}">
                        ${m.brand ? m.brand + ' - ' : ''}${m.name} (₹${m.rate}) [Stock: ${m.currentStock || 0}]
                    </option>
                `).join('');
        }

        if (serviceDatalist) {
            serviceDatalist.innerHTML = materials
                .filter(m => m.unit === 'service')
                .map(m => `
                    <option value="${m.name}" data-rate="${m.rate}" data-unit="${m.unit}">
                        ${m.name} (₹${m.rate})
                    </option>
                `).join('');
        }

        if (customerDatalist) {
            customerDatalist.innerHTML = customers.map(c => `
                <option value="${c.name}">${c.phone || ''}</option>
            `).join('');
        }
    },

    // Services Management
    loadServices() {
        const container = document.getElementById('servicesContainer');
        if (!container) return;

        // Try dedicated services collection first (populated by improved Import)
        let services = DataManager.getData('gtes_services') || [];

        // Fallback or legacy support: check Inventory
        if (services.length === 0) {
            // Pass true to includeHidden, as services are now hidden from main list
            const materials = InventoryManager.getAllMaterials(true);
            services = materials.filter(m => m.unit === 'service' || m.type === 'service' || m.category === 'Services');
        }

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h4><i class="bi bi-tools text-warning me-2"></i>Service Details</h4>
                <button class="btn btn-primary" onclick="DeliveryUI.showServiceModal()">
                    <i class="bi bi-plus-circle me-1"></i> Add New Service
                </button>
            </div>

            <div class="table-responsive">
                <table class="table table-dark table-hover border-secondary">
                    <thead>
                        <tr>
                            <th>Service Description</th>
                            <th>HSN</th>
                            <th>Unit</th>
                            <th>Default Rate</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${services.length === 0 ? '<tr><td colspan="5" class="text-center text-muted py-4">No service items found</td></tr>' :
                services.map(s => `
                            <tr>
                                <td><span class="fw-bold text-warning">${s.name}</span></td>
                                <td><small class="badge bg-dark border border-secondary">${s.hsnCode || '-'}</small></td>
                                <td><small class="badge bg-secondary opacity-75">${s.unit || 'nos'}</small></td>
                                <td>₹${(s.rate || 0).toFixed(2)}</td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-info me-1" onclick="DeliveryUI.showServiceModal('${s.id}')">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="DeliveryUI.deleteMaterial('${s.id}')">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    showServiceModal(serviceId = null) {
        this.showInventoryModal(serviceId);
        const unitSelect = document.getElementById('materialUnit');
        const typeSelect = document.getElementById('materialType');

        if (typeSelect) typeSelect.value = 'service';

        if (unitSelect && !serviceId) {
            unitSelect.value = 'nos'; // Default NEW service to 'nos'
        }

        // Update modal title via JS since it's shared
        const modalTitle = document.querySelector('#inventoryModal .modal-title');
        if (modalTitle) modalTitle.textContent = 'Add Service / Labor Detail';

        // Reset when modal closed
        const modalEl = document.getElementById('inventoryModal');
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (unitSelect) unitSelect.disabled = false;
            const modalTitle = document.querySelector('#inventoryModal .modal-title');
            if (modalTitle) modalTitle.textContent = 'Add Inventory Item';
            this.currentEditingMaterialId = null;
        }, { once: true });
    },

    // History Management
    loadHistory() {
        // Robust Container Detection
        let containerId = this.currentHistoryContainerId || 'historyContainer';
        let container = document.getElementById(containerId);

        const args = Array.from(arguments);
        const viewArg = args.find(a => typeof a === 'string' && (a.endsWith('View') || a.endsWith('Container')));
        if (viewArg) {
            containerId = viewArg;
            container = document.getElementById(containerId);
        }

        console.log("loadHistory Diagnostics:", {
            args: args,
            viewArg: viewArg,
            containerId: containerId,
            containerExists: !!container
        });

        if (!container) {
            console.error("loadHistory failed: container not found for ID", containerId);
            App.showNotification("System Error: Container " + containerId + " not found in DOM", "error");
            return;
        }

        // Diagnostic visual marker so we know the function ran
        container.innerHTML = `<div class="p-3 bg-warning text-dark mb-3">Diagnostic: loadHistory is running...</div>`;

        if (container.classList.contains('view-section')) {
            const accId = 'accHistoryContainer_' + Date.now();
            container.innerHTML = `<div class="container-fluid p-4" id="${accId}"></div>`;
            container = container.querySelector('#' + accId);
            this.currentHistoryContainerId = accId;
        }

        const challans = DeliveryManager.getAllChallans();
        const invoices = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getAllInvoices() : [];
        const jobCards = (typeof JobCardManager !== 'undefined') ? JobCardManager.getAllJobCards() : [];
        const vouchers = (typeof VoucherManager !== 'undefined') ? DataManager.getData('vouchers') || [] : [];
        const customers = CustomerManager.getAllCustomers();
        
        // Optimization: Create a customer map for O(1) lookups
        const customerMap = new Map();
        customers.forEach(c => {
            if (c.id && c.id !== 'undefined') {
                customerMap.set(c.id, c.name);
            }
        });

        const employees = DataManager.getData('employees') || [];
        const employeeMap = new Map();
        employees.forEach(e => employeeMap.set(e.id, e.name));
        
        const technicians = [...new Set(employees.map(e => e.name))];

        // 1. Gather Data based on dataType
        let data = [];
        const dataType = this.historyFilters.dataType;

        if (dataType === 'all') {
            const allExpenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : [];
            const purchases = allExpenses.filter(e => (e.category || '').toLowerCase().includes('purchase')).map(p => ({ ...p, _source: 'purchase', total: p.amount }));

            data = [
                ...challans.map(c => ({ ...c, _source: 'challan' })),
                ...invoices.map(i => ({ ...i, _source: 'invoice' })),
                ...jobCards.map(jc => ({ ...jc, _source: 'jobcard' })),
                ...vouchers.map(v => ({ ...v, _source: 'voucher', total: parseFloat(v.amount) })),
                ...purchases
            ];
        } else if (dataType === 'challan-dc') {
            data = challans.filter(c => c.type === 'delivery').map(c => ({ ...c, _source: 'challan' }));
        } else if (dataType === 'challan-sc') {
            data = challans.filter(c => c.type === 'service').map(c => ({ ...c, _source: 'challan' }));
        } else if (dataType === 'invoice-gst') {
            data = invoices.filter(i => i.type === 'with-bill').map(i => ({ ...i, _source: 'invoice' }));
        } else if (dataType === 'invoice-non-gst') {
            data = invoices.filter(i => i.type === 'without-bill').map(i => ({ ...i, _source: 'invoice' }));
        } else if (dataType === 'job-cards') {
            data = jobCards.map(jc => ({ ...jc, _source: 'jobcard' }));
        } else if (dataType === 'vouchers') {
            data = vouchers.map(v => ({ ...v, _source: 'voucher', total: parseFloat(v.amount) }));
        } else if (dataType === 'vouchers-receipt') {
            data = vouchers.filter(v => (v.type || '').toLowerCase() === 'receipt').map(v => ({ ...v, _source: 'voucher', total: parseFloat(v.amount) }));
        } else if (dataType === 'vouchers-payment') {
            data = vouchers.filter(v => (v.type || '').toLowerCase() === 'payment').map(v => ({ ...v, _source: 'voucher', total: parseFloat(v.amount) }));
        } else if (dataType === 'purchases') {
            const allExpenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : [];
            data = allExpenses.filter(e => (e.category || '').toLowerCase().includes('purchase')).map(p => ({ ...p, _source: 'purchase', total: p.amount }));
        }

        // 2. Financial Year Helper - Optimized to avoid heavy Date objects if possible
        const getFY = (dateStr) => {
            if (!dateStr) return 'Unknown';
            // Fast path for ISO strings or YYYY-MM-DD
            if (typeof dateStr === 'string' && dateStr.length >= 10 && dateStr[4] === '-' && dateStr[7] === '-') {
                const y = parseInt(dateStr.substring(0, 4));
                const m = parseInt(dateStr.substring(5, 7));
                const start = m >= 4 ? y : y - 1; // FY starts in April (m=4)
                return `${start}-${(start + 1).toString().slice(2)}`;
            }
            const d = new Date(dateStr);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const start = m >= 4 ? y : y - 1;
            return `${start}-${(start + 1).toString().slice(2)}`;
        };
        
        // Cache FYs to avoid recalculating in the filter loop
        data.forEach(item => { item._fy = getFY(item.date || item.createdAt); });
        
        const allFYs = [...new Set(data.map(item => item._fy))].filter(fy => fy !== 'Unknown').sort().reverse();

        // 3. Apply Filters
        const filtered = data.filter(item => {
            // FY Filter
            const matchesFY = this.historyFilters.fy === 'all' || item._fy === this.historyFilters.fy;

            // Technician Filter (only for challans/JC)
            let matchesTech = true;
            if (this.historyFilters.technician !== 'all') {
                if (item._source === 'challan' || item._source === 'jobcard') {
                    let currentTechName = item.technicianId || item.technician;
                    if (currentTechName && currentTechName.startsWith('emp_')) {
                        currentTechName = employeeMap.get(currentTechName) || currentTechName;
                    }
                    matchesTech = currentTechName === this.historyFilters.technician;
                } else {
                    matchesTech = false;
                }
            }

            // Customer Filter
            const matchesCustomer = this.historyFilters.customerId === 'all' || item.customerId === this.historyFilters.customerId;

            // Status Filter
            let matchesStatus = true;
            const statusFilter = this.historyFilters.status;
            if (statusFilter !== 'all') {
                if (item._source === 'invoice') {
                    matchesStatus = item.status === statusFilter;
                } else if (item._source === 'challan') {
                    if (statusFilter === 'pending-invoice') matchesStatus = !item.invoiceId;
                    else if (statusFilter === 'invoiced') matchesStatus = !!item.invoiceId;
                    else matchesStatus = false;
                } else if (item._source === 'jobcard') {
                    if (statusFilter === 'pending-jc') matchesStatus = item.status !== 'dispatched';
                    else if (statusFilter === 'dispatched') matchesStatus = item.status === 'dispatched';
                    else matchesStatus = item.status === statusFilter;
                } else {
                    matchesStatus = false;
                }
            }

            // Search
            const searchLower = this.historyFilters.search.toLowerCase();
            const custName = customerMap.get(item.customerId) || '';
            const matchesSearch = !searchLower ||
                (item.id && item.id.toLowerCase().includes(searchLower)) ||
                (custName.toLowerCase().includes(searchLower)) ||
                (item.customNumber && item.customNumber.toLowerCase().includes(searchLower));

            return matchesFY && matchesTech && matchesCustomer && matchesStatus && matchesSearch;
        });

        // 4. Sorting: Newest first
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 5. Render UI
        // Only render the filter skeleton if it's not already there
        const resultsExist = document.getElementById('historyTableBody');
        if (!resultsExist) {
            container.innerHTML = `
                <div class="card glass-panel border-0 mb-4">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="mb-0 text-muted">Data Filters</h6>
                            <div class="d-flex gap-2">
                                <button class="btn btn-outline-warning btn-sm" onclick="RecycleBinUI.open()" title="Recycle Bin">
                                    <i class="bi bi-trash3 me-1"></i> Recycle Bin
                                </button>
                                <button class="btn btn-outline-info btn-sm" onclick="ExportImportHelper.showModal('invoices-sales')">
                                    <i class="bi bi-arrow-left-right me-1"></i> Export/Import
                                </button>
                            </div>
                        </div>
                        <div class="row g-3">
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Data Type</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    onchange="DeliveryUI.setHistoryFilter('dataType', this.value)">
                                    <option value="all" ${this.historyFilters.dataType === 'all' ? 'selected' : ''}>All Records</option>
                                    <option value="challan-dc" ${this.historyFilters.dataType === 'challan-dc' ? 'selected' : ''}>Delivery Challans</option>
                                    <option value="challan-sc" ${this.historyFilters.dataType === 'challan-sc' ? 'selected' : ''}>Service Challans</option>
                                    <option value="invoice-gst" ${this.historyFilters.dataType === 'invoice-gst' ? 'selected' : ''}>GST Invoices</option>
                                    <option value="invoice-non-gst" ${this.historyFilters.dataType === 'invoice-non-gst' ? 'selected' : ''}>Non-GST Invoices</option>
                                    <option value="job-cards" ${this.historyFilters.dataType === 'job-cards' ? 'selected' : ''}>Job Cards</option>
                                    <optgroup label="Vouchers">
                                        <option value="vouchers-receipt" ${this.historyFilters.dataType === 'vouchers-receipt' ? 'selected' : ''}>Receipts</option>
                                        <option value="vouchers-payment" ${this.historyFilters.dataType === 'vouchers-payment' ? 'selected' : ''}>Payments</option>
                                    </optgroup>
                                    <option value="purchases" ${this.historyFilters.dataType === 'purchases' ? 'selected' : ''}>Purchases</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Financial Year</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    onchange="DeliveryUI.setHistoryFilter('fy', this.value)">
                                    <option value="all">All Year</option>
                                    ${allFYs.map(fy => `<option value="${fy}" ${this.historyFilters.fy === fy ? 'selected' : ''}>FY ${fy}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Customer</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    onchange="DeliveryUI.setHistoryFilter('customerId', this.value)">
                                    <option value="all">All Customers</option>
                                    ${customers.map(c => `<option value="${c.id}" ${this.historyFilters.customerId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Status</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    onchange="DeliveryUI.setHistoryFilter('status', this.value)">
                                    <option value="all" ${this.historyFilters.status === 'all' ? 'selected' : ''}>All Status</option>
                                    <optgroup label="Invoices">
                                        <option value="pending" ${this.historyFilters.status === 'pending' ? 'selected' : ''}>Unpaid (Pending)</option>
                                        <option value="paid" ${this.historyFilters.status === 'paid' ? 'selected' : ''}>Paid</option>
                                    </optgroup>
                                    <optgroup label="Challans">
                                        <option value="pending-invoice" ${this.historyFilters.status === 'pending-invoice' ? 'selected' : ''}>Not Invoiced</option>
                                        <option value="invoiced" ${this.historyFilters.status === 'invoiced' ? 'selected' : ''}>Invoiced</option>
                                    </optgroup>
                                    <optgroup label="Job Cards">
                                        <option value="pending-jc" ${this.historyFilters.status === 'pending-jc' ? 'selected' : ''}>Pending (All)</option>
                                        <option value="job_done" ${this.historyFilters.status === 'job_done' ? 'selected' : ''}>Job Done</option>
                                        <option value="dispatched" ${this.historyFilters.status === 'dispatched' ? 'selected' : ''}>Dispatched</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Technician</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" 
                                    onchange="DeliveryUI.setHistoryFilter('technician', this.value)">
                                    <option value="all">All Technicians</option>
                                    ${technicians.map(t => `<option value="${t}" ${this.historyFilters.technician === t ? 'selected' : ''}>${t}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Search ID/DC</label>
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text bg-dark border-secondary text-muted"><i class="bi bi-search"></i></span>
                                    <input type="text" class="form-control bg-dark text-white border-secondary" 
                                        id="historySearchInput"
                                        placeholder="Search..." value="${this.historyFilters.search}"
                                        oninput="DeliveryUI.setHistoryFilter('search', this.value)">
                                    <button class="btn btn-outline-warning" onclick="DeliveryUI.repairImportedData()" title="Repair / Sync Data">
                                        <i class="bi bi-wrench"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="table table-dark table-hover table-sm border-secondary align-middle">
                        <thead>
                            <tr>
                                <th>ID / No</th>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Customer</th>
                                <th>Total</th>
                                <th>History / Status</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="historyTableBody">
                            <!-- Rows rendered incrementally -->
                        </tbody>
                    </table>
                    <div id="historyLoadingStatus" class="text-center py-3 d-none">
                        <div class="spinner-border spinner-border-sm text-warning" role="status"></div>
                        <span class="ms-2 small text-muted">Loading more records...</span>
                    </div>
                </div>
            `;
        } else {
            // Keep focus if we were searching
            // Note: browser might handle this, but let's be careful.
            // Just clear the body and restart rendering
            resultsExist.innerHTML = '';
        }

        // Chunked Rendering Logic
        const tbody = document.getElementById('historyTableBody');
        const chunkSize = 50;
        let currentIndex = 0;

        const renderNextChunk = () => {
            if (currentIndex >= filtered.length) {
                if (filtered.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">No matching records found</td></tr>';
                }
                const loadingStatus = document.getElementById('historyLoadingStatus');
                if (loadingStatus) loadingStatus.classList.add('d-none');
                return;
            }

            const loadingStatus = document.getElementById('historyLoadingStatus');
            if (loadingStatus) loadingStatus.classList.remove('d-none');
            
            const chunk = filtered.slice(currentIndex, currentIndex + chunkSize);
            const rowsHtml = chunk.map(item => {
                try {
                    let custName = customerMap.get(item.customerId) || item.customerName || 'N/A';
                    // Extra fallback for synced documents
                    if (custName === 'N/A' && item.invoiceId && typeof InvoiceManager !== 'undefined') {
                        const linkedInv = InvoiceManager.getInvoice(item.invoiceId);
                        if (linkedInv) custName = linkedInv.customerName || 'N/A';
                    }
                    let typeBadge = '';
                    let statusHtml = '';
                    let actionHtml = '';

                    if (item._source === 'challan') {
                        typeBadge = item.type === 'service' ? 'bg-info' : 'bg-primary';
                        statusHtml = `
                            <span class="badge ${item.invoiceId ? 'bg-success' : 'bg-warning'}">${item.invoiceId ? 'INVOICED' : 'PENDING'}</span>
                            ${item.invoiceId ? `<br><small class="text-muted">${item.referenceNumber || item.invoiceId}</small>` : ''}
                        `;
                        actionHtml = `
                            <button class="btn btn-sm btn-outline-info" onclick="DeliveryUI.viewChallan('${item.id}')" title="View">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-warning" onclick="DeliveryUI.editChallan('${item.id}')" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-primary" onclick="DeliveryUI.printChallan('${item.id}')" title="Download PDF">
                                <i class="bi bi-download"></i>
                            </button>
                        `;
                    } else if (item._source === 'invoice') {
                        const invType = (item.type || '').toLowerCase();
                        typeBadge = (invType === 'with-bill' || invType === 'gst-invoice' || invType === 'sales-gst') ? 'bg-success' : 'bg-secondary';
                        const s = (item.status || 'pending').toUpperCase();
                        statusHtml = `
                            <span class="badge ${item.status === 'paid' ? 'bg-success' : 'bg-warning'}">${s}</span>
                            ${item.challanId ? `<br><small class="text-muted">Ref: ${item.challanId}</small>` : ''}
                        `;
                        actionHtml = `
                            <button class="btn btn-sm btn-outline-success" onclick="DeliveryUI.viewInvoice('${item.id}')" title="View">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-warning" onclick="DeliveryUI.editInvoice('${item.id}')" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        `;
                    } else if (item._source === 'jobcard') {
                        typeBadge = 'bg-warning text-dark';
                        const stat = (item.status || 'pending').toUpperCase();
                        statusHtml = `
                            <span class="badge bg-secondary">${stat}</span>
                            <br><small class="text-muted">${item.customerRef || ''}</small>
                        `;
                        actionHtml = `
                            <button class="btn btn-sm btn-outline-warning" onclick="DeliveryUI.viewJobCard('${item.id}')" title="View">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-info" onclick="DeliveryUI.editJobCard('${item.id}')" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        `;
                    } else if (item._source === 'voucher') {
                        typeBadge = 'bg-light text-dark';
                        const vType = (item.type || 'PAYMENT').toUpperCase();
                        statusHtml = `<span class="badge bg-outline-light text-muted small">${vType}</span>`;
                        actionHtml = `
                            <button class="btn btn-sm btn-outline-light" onclick="DeliveryUI.viewVoucher('${item.id}')" title="View">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-warning" onclick="DeliveryUI.editVoucher('${item.id}')" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        `;
                    }
                    
                    const safeTotal = (parseFloat(item.total) || 0).toFixed(2);
                    const invType = (item.type || '').toLowerCase();
                    const safeTypeStr = item._source === 'challan' ? (item.type || '').toUpperCase() : 
                                      (item._source === 'invoice' ? (invType === 'with-bill' || invType === 'gst-invoice' || invType === 'sales-gst' ? 'GST INV' : 'NON-GST') : 
                                      (item._source || '').toUpperCase());

                    return `
                        <tr>
                            <td><span class="fw-bold">${item.id}</span></td>
                            <td>${DataManager.formatDateDisplay(item.date || item.createdAt)}</td>
                            <td><span class="badge ${typeBadge}">${safeTypeStr}</span></td>
                            <td>${custName}</td>
                            <td class="fw-bold">₹${safeTotal}</td>
                            <td>${statusHtml}</td>
                            <td class="text-end">
                                <div class="btn-group">
                                    ${actionHtml}
                                    <button class="btn btn-sm btn-outline-danger" onclick="DeliveryUI.deleteGenericRecord('${item._source}', '${item.id}')" title="Delete">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                } catch(renderErr) {
                    console.error("Error rendering row item:", item, renderErr);
                    return `<tr><td colspan="7" class="text-danger">Error rendering record ${item.id}</td></tr>`;
                }
            }).join('');

            tbody.insertAdjacentHTML('beforeend', rowsHtml);
            currentIndex += chunkSize;

            requestAnimationFrame(renderNextChunk);
        };

        renderNextChunk();
    },

    async deleteGenericRecord(source, id) {
        let deleteChallanToo = false;

        if (source === 'invoice') {
            const inv = InvoiceManager.getAllInvoices().find(i => i.id === id);
            if (inv && inv.challanId) {
                const choice = confirm(`Delete this invoice?\n\nClick OK to also delete the linked Delivery Challan (${inv.challanId}).\nClick Cancel to ONLY delete the invoice and unlink the challan.`);
                // Note: Standard confirm is limited. Let's use a more explicit dual-confirm if the user cancels the first one.
                if (choice) {
                    deleteChallanToo = true;
                } else {
                    if (!confirm("Delete ONLY the invoice? (The Delivery Challan will remain)")) return;
                    deleteChallanToo = false;
                }
            } else {
                if (!confirm(`Delete this invoice?`)) return;
            }
        } else if (source === 'jobcard') {
            const challans = DeliveryManager.getAllChallans();
            const invoices = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getAllInvoices() : [];
            const linkedChallan = challans.find(c => c.jobCardId === id);
            const linkedInvoice = invoices.find(i => i.jobCardId === id);
            
            if (linkedChallan || linkedInvoice) {
                let msg = `Delete this Job Card?\n\nClick OK to also delete the interlinked:\n`;
                if (linkedInvoice) msg += `- Invoice (${linkedInvoice.invoiceNo || linkedInvoice.id})\n`;
                if (linkedChallan) msg += `- Challan (${linkedChallan.id})\n`;
                msg += `\nClick Cancel to ONLY delete the Job Card and keep the linked documents.`;
                
                const choice = confirm(msg);
                if (choice) {
                    deleteChallanToo = true; // Reusing this boolean to mean "delete all children"
                } else {
                    if (!confirm("Delete ONLY the Job Card? (The linked documents will remain)")) return;
                    deleteChallanToo = false;
                }
            } else {
                if (!confirm(`Delete this Job Card?`)) return;
            }
        } else {
            if (!confirm(`Delete this ${source}?`)) return;
        }

        try {
            if (source === 'challan') await DeliveryManager.deleteChallan(id);
            else if (source === 'invoice') await InvoiceManager.deleteInvoice(id, deleteChallanToo);
            else if (source === 'jobcard') {
                await JobCardManager.deleteJobCard(id);
                if (deleteChallanToo) {
                    const challans = DeliveryManager.getAllChallans();
                    const linkedChallan = challans.find(c => c.jobCardId === id);
                    if (linkedChallan) await DeliveryManager.deleteChallan(linkedChallan.id);

                    if (typeof InvoiceManager !== 'undefined') {
                        const invoices = InvoiceManager.getAllInvoices();
                        const linkedInvoices = invoices.filter(i => i.jobCardId === id);
                        for (let inv of linkedInvoices) {
                            await InvoiceManager.deleteInvoice(inv.id, false);
                        }
                    }
                }
            }
            else if (source === 'voucher') await VoucherManager.deleteVoucher(id);
            else if (source === 'purchase' && typeof ExpenseManager !== 'undefined') await ExpenseManager.deleteExpense(id);

            App.showNotification(`${source.toUpperCase()} deleted`, 'success');
            this.loadHistory();
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    async repairImportedData() {
        if (!confirm('This will fix missing customer names and random IDs in imported invoices. Proceed?')) return;

        App.showNotification('Repairing data...', 'info');
        try {
            const modified = await BookKeeperImport.cleanupImportedData();
            if (modified > 0) {
                App.showNotification(`${modified} records repaired successfully!`, 'success');
                this.loadHistory();
            } else {
                App.showNotification('No repairs needed.', 'info');
            }
        } catch (error) {
            console.error('Repair error:', error);
            App.showNotification('Repair failed: ' + error.message, 'error');
        }
    },

    setHistoryFilter(key, value) {
        this.historyFilters[key] = value;
        this.loadHistory();
    },

    async deleteChallan(challanId) {
        if (!confirm('Delete this challan?')) return;

        try {
            await DeliveryManager.deleteChallan(challanId);
            App.showNotification('Challan deleted', 'success');
            this.loadHistory();
        } catch (error) {
            App.showNotification(error.message, 'error');
        }
    },

    // View Challan Details
    viewChallan(challanId) {
        const challan = DeliveryManager.getChallan(challanId);
        if (!challan) {
            App.showNotification('Challan not found', 'error');
            return;
        }

        const customer = CustomerManager.getCustomer(challan.customerId);
        const settings = DataManager.getData('gtes_settings') || {};
        const companyName = settings.companyName || "Gas Tech Engineering Service";
        const companyAddress = settings.registeredAddress || "No.232/233, Nageshwara Road, Athipet, Chennai-58";
        const workAddress = settings.workAddress || "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058";
        const email = settings.email || "gastechengservice@gmail.com, rajmohan67raj@gmail.com";
        const phone = settings.phone || "+91 9600015839, +91 95662 02856";
        const gstin = settings.gstin || "33AFXPR3235A32F";
        const pan = settings.pan || "AFXPR3235A";
        const iec = settings.iec || "AFXPR3235A";
        const typeLabel = challan.type === 'delivery' ? 'Delivery Challan' : 'Service Challan';

        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const formatCurrency = (amount) => {
            return (parseFloat(amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const modalHtml = `
            <div class="modal fade" id="challanViewModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content bg-dark border-0 shadow-lg">
                        <div class="modal-header border-0 pb-0">
                            <div class="d-flex align-items-center">
                                <h5 class="modal-title text-white fw-bold"><i class="bi bi-file-earmark-text me-2"></i>${typeLabel} Preview</h5>
                            </div>
                            <div class="d-flex gap-2 align-items-center">
                                <button type="button" class="btn btn-outline-light btn-sm border-secondary" onclick="DeliveryUI.toggleModalFullscreen('challanViewModal')" title="Toggle Fullscreen">
                                    <i class="bi bi-fullscreen"></i>
                                </button>
                                <button type="button" class="btn btn-primary" onclick="DeliveryUI.printChallan('${challan.id}')">
                                    <i class="bi bi-download me-1"></i> Download PDF
                                </button>
                                ${!challan.invoiceId ? `
                                <button class="btn btn-success" onclick="DeliveryUI.convertToInvoice('${challan.id}')">
                                    <i class="bi bi-receipt me-1"></i> Generate Invoice
                                </button>
                                ` : `
                                <button class="btn btn-outline-info" onclick="DeliveryUI.viewInvoice('${challan.invoiceId}')">
                                    <i class="bi bi-eye me-1"></i> View Invoice
                                </button>
                                `}
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0">
                            <div id="challanPrintArea" class="bg-white text-dark mx-auto my-4 shadow-lg p-5" style="max-width: 850px; min-height: 1050px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                                <!-- Header Section -->
                                <div class="row mb-5 border-bottom border-dark border-2 pb-3">
                                    <div class="col-7">
                                        <h2 class="fw-bold text-primary mb-1">${companyName.toUpperCase()}</h2>
                                        <p class="mb-0 text-muted small" style="max-width: 400px;">${companyAddress}</p>
                                        <p class="mb-0 text-muted extra-small">Work: ${workAddress}</p>
                                        <p class="mb-0 text-muted extra-small">Email: ${email} | Ph: ${phone}</p>
                                        <p class="mb-0 text-muted extra-small fw-bold">GSTIN: ${gstin} | PAN: ${pan}</p>
                                    </div>
                                    <div class="col-5 text-end">
                                        <h3 class="fw-bold text-uppercase mb-1" style="letter-spacing: 2px; color: #333;">${typeLabel}</h3>
                                        <p class="mb-1 text-muted">No: <span class="text-dark fw-bold">#${challan.id}</span></p>
                                        <div class="badge ${challan.gstMode ? 'bg-success' : 'bg-secondary'} px-3 rounded-pill">
                                            ${challan.gstMode ? 'Taxable Document' : 'Non-GST Note'}
                                        </div>
                                    </div>
                                </div>

                                <!-- Party Details & Document Info -->
                                <div class="row mb-5 g-4">
                                    <div class="col-6">
                                        <div class="p-3 border rounded-3 h-100 bg-light bg-opacity-50">
                                            <h6 class="text-uppercase text-muted extra-small fw-bold mb-3 border-bottom pb-1">Billed To / Customer</h6>
                                            <h5 class="fw-bold mb-1">${customer?.name || challan.customerName || (window.InvoiceManager && challan.invoiceId ? InvoiceManager.getInvoice(challan.invoiceId)?.customerName : '') || 'Walk-in Customer'}</h5>
                                            <div class="small text-muted mb-2">
                                                ${customer?.address ? `<div>${customer.address}</div>` : (challan.customerAddress ? `<div>${challan.customerAddress}</div>` : (window.InvoiceManager && challan.invoiceId ? `<div>${InvoiceManager.getInvoice(challan.invoiceId)?.customerAddress || ''}</div>` : ''))}
                                                ${customer?.phone ? `<div>Phone: ${customer.phone}</div>` : ''}
                                                ${customer?.gstin ? `<div class="mt-2 fw-bold text-dark">GSTIN: ${customer.gstin}</div>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="p-3 border rounded-3 h-100 bg-light bg-opacity-50">
                                            <h6 class="text-uppercase text-muted extra-small fw-bold mb-3 border-bottom pb-1">Document Information</h6>
                                            <table class="table table-sm table-borderless mb-0 w-100">
                                                <tr class="small">
                                                    <td class="text-muted py-1">Date:</td>
                                                    <td class="fw-bold text-end py-1">${formatDate(challan.date)}</td>
                                                </tr>
                                                ${challan.referenceNumber ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">Ref No:</td>
                                                    <td class="fw-bold text-end py-1">${challan.referenceNumber}</td>
                                                </tr>` : ''}
                                                ${challan.dispatchVia ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">Dispatch Via:</td>
                                                    <td class="fw-bold text-end py-1">${challan.dispatchVia}</td>
                                                </tr>` : ''}
                                                ${challan.lrNo ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">LR / Track No:</td>
                                                    <td class="fw-bold text-end py-1">${challan.lrNo}</td>
                                                </tr>` : ''}
                                                ${challan.vehicleNo ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">Vehicle No:</td>
                                                    <td class="fw-bold text-end py-1">${challan.vehicleNo}</td>
                                                </tr>` : ''}
                                                ${challan.dispatchDate ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">Dispatch Date:</td>
                                                    <td class="fw-bold text-end py-1">${formatDate(challan.dispatchDate)}</td>
                                                </tr>` : ''}
                                                ${challan.technicianId ? `
                                                <tr class="small">
                                                    <td class="text-muted py-1">Technician:</td>
                                                    <td class="fw-bold text-end py-1">${challan.technicianId}</td>
                                                </tr>` : ''}
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                <!-- Service / Fault Details -->
                                ${(challan.complaint || challan.workDone) ? `
                                <div class="mb-5 p-3 border border-warning border-opacity-25 rounded-3" style="background-color: #fffdf5;">
                                    <h6 class="fw-bold text-uppercase small text-warning border-bottom pb-2 mb-3">Service & Maintenance Log</h6>
                                    <div class="row g-3">
                                        ${challan.complaint ? `<div class="col-6 small"><strong>Complaint:</strong> <span class="text-muted">${challan.complaint}</span></div>` : ''}
                                        ${challan.workDone ? `<div class="col-12 small"><strong>Work Performed:</strong> <span class="text-muted">${challan.workDone}</span></div>` : ''}
                                    </div>
                                </div>
                                ` : ''}

                                <!-- Items Table -->
                                <div class="table-responsive mb-5">
                                    <table class="table table-bordered align-middle text-dark border-dark">
                                        <thead style="background-color: #f8f9fa;" class="text-dark">
                                            <tr class="small text-uppercase fw-bold">
                                                <th class="text-center" style="width: 50px;">#</th>
                                                <th>Material / Description</th>
                                                <th class="text-center" style="width: 80px;">Qty</th>
                                                <th class="text-center" style="width: 80px;">Unit</th>
                                                ${challan.type !== 'service' ? `
                                                <th class="text-end" style="width: 120px;">Rate</th>
                                                <th class="text-end" style="width: 120px;">Amount</th>
                                                ` : ''}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${challan.items.map((item, index) => `
                                            <tr class="small">
                                                <td class="text-center text-muted">${index + 1}</td>
                                                <td>
                                                    <div class="fw-bold">${item.name || item.description || ''}</div>
                                                    <div class="extra-small text-muted">${item.itemDescription || ''}</div>
                                                    ${item.materialChanged ? `<div class="extra-small text-danger mt-1 fst-italic"><i class="bi bi-repeat me-1"></i>Replaced: ${item.replacedDescription || 'Replaced'}</div>` : ''}
                                                </td>
                                                <td class="text-center font-monospace">${item.quantity}</td>
                                                <td class="text-center">${item.unit || 'pcs'}</td>
                                                ${challan.type !== 'service' ? `
                                                <td class="text-end font-monospace">₹${formatCurrency(item.rate)}</td>
                                                <td class="text-end font-monospace fw-bold">₹${formatCurrency(item.amount)}</td>
                                                ` : ''}
                                            </tr>
                                            `).join('')}
                                        </tbody>
                                        ${challan.type !== 'service' ? `
                                        <tfoot class="border-top-0">
                                            <tr>
                                                <td colspan="${challan.gstMode ? 4 : 4}" class="border-0"></td>
                                                <td class="text-end border-0 pt-4 small">Subtotal:</td>
                                                <td class="text-end border-0 pt-4 fw-bold font-monospace">₹${formatCurrency(challan.subtotal)}</td>
                                            </tr>
                                            ${challan.gstMode ? `
                                            <tr>
                                                <td colspan="4" class="border-0"></td>
                                                <td class="text-end border-0 py-0 small">Tax (GST):</td>
                                                <td class="text-end border-0 py-0 fw-bold font-monospace">₹${formatCurrency((challan.cgst || 0) + (challan.sgst || 0) + (challan.igst || 0))}</td>
                                            </tr>
                                            ` : ''}
                                            <tr>
                                                <td colspan="4" class="border-0"></td>
                                                <td class="text-end border-0 py-2 fw-bold text-primary fs-5">Total:</td>
                                                <td class="text-end border-0 py-2 fw-bold text-primary fs-5 font-monospace">₹${formatCurrency(challan.total)}</td>
                                            </tr>
                                        </tfoot>
                                        ` : `
                                        <tfoot>
                                            <tr>
                                                <td colspan="4" class="py-5 text-center text-muted extra-small fst-italic">
                                                    I acknowledge receipt of the materials/services listed above in good condition.
                                                </td>
                                            </tr>
                                        </tfoot>
                                        `}
                                    </table>
                                </div>

                                <!-- Signature Section -->
                                <div class="row mt-auto pt-5">
                                    <div class="col-8">
                                        <h6 class="fw-bold extra-small text-uppercase mb-2">Terms & Conditions:</h6>
                                        <ol class="extra-small text-muted ps-3">
                                            <li>Goods once sold will not be taken back.</li>
                                            <li>Subject to city jurisdiction.</li>
                                            <li>Please verify items before project handover.</li>
                                        </ol>
                                    </div>
                                    <div class="col-4 text-center">
                                        <div class="mb-4 mt-4" style="border-bottom: 2px solid #eee; height: 40px;"></div>
                                        <p class="small fw-bold mb-0">Authorized Signatory</p>
                                        <p class="extra-small text-muted">For ${companyName}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary py-2">
                             <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Close Preview</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const oldModalEl = document.getElementById('challanViewModal');
        if (oldModalEl) {
            const oldInstance = bootstrap.Modal.getInstance(oldModalEl);
            if (oldInstance) oldInstance.hide();
            oldModalEl.remove();
        }

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('challanViewModal'));
        modal.show();
    },

    // Helper for fullscreen
    toggleModalFullscreen(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const dialog = modal.querySelector('.modal-dialog');
        const icon = modal.querySelector('.bi-fullscreen, .bi-fullscreen-exit');

        dialog.classList.toggle('modal-fullscreen');

        if (icon) {
            if (dialog.classList.contains('modal-fullscreen')) {
                icon.classList.replace('bi-fullscreen', 'bi-fullscreen-exit');
            } else {
                icon.classList.replace('bi-fullscreen-exit', 'bi-fullscreen');
            }
        }
    },

    // Print Challan (PDF) - Updated for PRD requirements
    async printChallan(challanId) {
        const element = document.getElementById('challanPrintArea');
        if (!element) return;

        const challan = DeliveryManager.getChallan(challanId);
        if (!challan) return;

        const typeLabel = challan.type === 'service' ? 'Service_Challan' : 'Delivery_Challan';
        const subfolder = challan.type === 'service' ? 'Service' : 'Delivery';
        const filename = `${typeLabel}_${challanId}.pdf`;

        const opt = {
            margin: 0.5,
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // Use html2pdf
        if (typeof html2pdf !== 'undefined') {
            App.showNotification('Generating PDF...', 'info');

            // Generate PDF and save automatically
            const worker = html2pdf().set(opt).from(element);

            if (window.electronAPI && window.electronAPI.savePdf) {
                // Get PDF as base64 for auto-saving
                const pdfBase64 = await worker.output('base64');
                const result = await window.electronAPI.savePdf({
                    blobBase64: pdfBase64,
                    filename: filename,
                    subfolder: subfolder
                });

                if (result.success) {
                    App.showNotification(`PDF saved to ChallanOutput/${subfolder}`, 'success');
                } else {
                    App.showNotification('Error saving PDF: ' + result.error, 'error');
                }
            }

            // Open in professional browser viewer instead of direct download
            worker.output('bloburl').then(url => {
                window.open(url, '_blank');
            });
        } else {
            App.showNotification('PDF generation library not loaded', 'error');
        }
    },

    async convertToInvoice(challanId) {
        if (!confirm('Convert this challan to an official invoice?')) return;

        try {
            const challan = DeliveryManager.getChallan(challanId);
            if (!challan) throw new Error('Challan not found');

            const invoiceData = {
                date: new Date().toISOString().split('T')[0],
                customerId: challan.customerId,
                customerName: CustomerManager.getCustomer(challan.customerId)?.name || challan.customerName || 'Walk-in Customer',
                challanId: challan.id,
                type: challan.gstMode ? 'with-bill' : 'without-bill',
                items: challan.items,
                subtotal: challan.subtotal,
                gst: {
                    cgst: challan.cgst,
                    sgst: challan.sgst,
                    igst: challan.igst
                },
                cgstPercent: challan.cgstPercent,
                sgstPercent: challan.sgstPercent,
                igstPercent: challan.igstPercent,
                roundOff: challan.roundOff,
                total: challan.total,
                status: 'pending'
            };

            const invoice = await InvoiceManager.createInvoice(invoiceData);

            // Link invoice back to challan
            await DeliveryManager.updateChallan(challanId, { invoiceId: invoice.id });

            App.showNotification(`Invoice ${invoice.id} created successfully!`, 'success');
            this.viewChallan(challanId); // Refresh view
        } catch (error) {
            console.error(error);
            App.showNotification(error.message, 'error');
        }
    },

    // Navigation methods
    showLanding() {
        document.getElementById('deliveryLandingMenu')?.classList.remove('d-none');
        document.getElementById('deliveryChallanMenu')?.classList.add('d-none');
        document.getElementById('deliveryVoucherMenu')?.classList.add('d-none');
        document.getElementById('deliveryCreateSection')?.classList.add('d-none');
        document.getElementById('deliveryJobCardSection')?.classList.add('d-none');
        document.getElementById('deliveryHistorySection')?.classList.add('d-none');
        document.getElementById('deliveryInvoicesSection')?.classList.add('d-none');
        document.getElementById('deliveryCustomersSection')?.classList.add('d-none');
        document.getElementById('deliveryInventorySection')?.classList.add('d-none');
        document.getElementById('deliveryVouchersSection')?.classList.add('d-none');
        document.getElementById('deliveryServicesSection')?.classList.add('d-none');
        document.getElementById('deliveryPurchasesSection')?.classList.add('d-none');
    },

    showChallanMenu() {
        this.showSection('none');
        document.getElementById('deliveryChallanMenu')?.classList.remove('d-none');
    },

    showVoucherMenu() {
        this.showSection('none');
        document.getElementById('deliveryVoucherMenu')?.classList.remove('d-none');
    },

    viewVoucherType(type) {
        this.currentVoucherType = type;
        this.showSection('vouchers');
    },

    viewChallanType(type) {
        if (type === 'purchase') {
            this.showSection('purchases');
            return;
        }
        this.historyFilters.dataType = type === 'delivery' ? 'challan-dc' : 'challan-sc';
        this.showSection('history');
    },

    showSection(section) {
        document.getElementById('deliveryLandingMenu')?.classList.add('d-none');
        document.getElementById('deliveryChallanMenu')?.classList.add('d-none');
        document.getElementById('deliveryVoucherMenu')?.classList.add('d-none');
        document.getElementById('deliveryCreateSection')?.classList.add('d-none');
        document.getElementById('deliveryJobCardSection')?.classList.add('d-none');
        document.getElementById('deliveryHistorySection')?.classList.add('d-none');
        document.getElementById('deliveryInvoicesSection')?.classList.add('d-none');
        document.getElementById('deliveryCustomersSection')?.classList.add('d-none');
        document.getElementById('deliveryInventorySection')?.classList.add('d-none');
        document.getElementById('deliveryVouchersSection')?.classList.add('d-none');
        document.getElementById('deliveryServicesSection')?.classList.add('d-none');
        document.getElementById('deliveryPurchasesSection')?.classList.add('d-none');

        switch (section) {
            case 'create':
                document.getElementById('deliveryCreateSection')?.classList.remove('d-none');
                if (!this.createFormRendered) {
                    this.renderCreateForm();
                    this.setupEventListeners();
                    this.createFormRendered = true;
                } else {
                    // Reset form when navigating back to it
                    this.resetForm();
                    this.currentEditingChallan = null;
                }
                break;
            case 'jobcard':
                document.getElementById('deliveryJobCardSection')?.classList.remove('d-none');
                this.loadJobCards();
                break;
            case 'history':
                document.getElementById('deliveryHistorySection')?.classList.remove('d-none');
                this.loadHistory();
                break;
            case 'invoices':
                document.getElementById('deliveryInvoicesSection')?.classList.remove('d-none');
                this.loadInvoices();
                break;
            case 'customers':
                document.getElementById('deliveryCustomersSection')?.classList.remove('d-none');
                this.loadCustomers();
                break;
            case 'inventory':
                document.getElementById('deliveryInventorySection')?.classList.remove('d-none');
                this.loadInventory();
                break;
            case 'vouchers':
                document.getElementById('deliveryVouchersSection')?.classList.remove('d-none');
                this.loadVouchers();
                break;
            case 'services':
                document.getElementById('deliveryServicesSection')?.classList.remove('d-none');
                this.loadServices();
                break;
            case 'purchases':
                document.getElementById('deliveryPurchasesSection')?.classList.remove('d-none');
                this.loadPurchases();
                break;
        }
    },

    filterCustomerType(type) {
        this.currentCustomerType = type;

        // Update active UI classes
        document.querySelectorAll('.clickable-card').forEach(c => c.classList.remove('active-filter', 'border-primary', 'border-success', 'border-info'));

        const cardMap = {
            'Customer': { id: 'cardCustomerFilter', class: 'border-primary' },
            'Supplier': { id: 'cardSupplierFilter', class: 'border-success' },
            'Other': { id: 'cardOtherFilter', class: 'border-info' }
        };

        const target = cardMap[type];
        const el = document.getElementById(target.id);
        if (el) {
            el.classList.add('active-filter', target.class);
        }

        this.loadCustomers();
    },

    // Job Cards
    jobCardFilter: 'all',

    setJobCardFilter(filter) {
        this.jobCardFilter = filter;
        this.loadJobCards();
    },

    loadJobCards() {
        // Robust Container Detection
        let containerId = this.currentJobCardContainerId || 'jobCardContainer';
        let container = document.getElementById(containerId);

        const args = Array.from(arguments);
        const viewArg = args.find(a => typeof a === 'string' && (a.endsWith('View') || a.endsWith('Container')));
        if (viewArg) {
            containerId = viewArg;
            container = document.getElementById(containerId);
        }

        if (!container) return;

        if (container.classList.contains('view-section')) {
            const accId = 'accJobCardContainer_' + Date.now();
            container.innerHTML = `<div class="container-fluid p-4" id="${accId}"></div>`;
            container = container.querySelector('#' + accId);
            this.currentJobCardContainerId = accId;
        }

        let jobCards = (typeof JobCardManager !== 'undefined') ? JobCardManager.getAllJobCards() : [];

        // Apply filter
        if (this.jobCardFilter !== 'all') {
            jobCards = jobCards.filter(jc => jc.status === this.jobCardFilter);
        }

        // Sort by date descending
        jobCards.sort((a, b) => new Date(b.date) - new Date(a.date));

        const getBtnClass = (filter) => {
            return this.jobCardFilter === filter ? 'btn-primary' : 'btn-outline-secondary';
        };

        container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="mb-0"><i class="bi bi-tools text-warning me-2"></i>Job Cards</h4>
                <div class="btn-group">
                    <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                        <i class="bi bi-grid-fill me-1"></i> Apps
                    </button>
                    <button class="btn btn-primary btn-sm ms-2" onclick="DeliveryUI.showJobCardForm()">
                        <i class="bi bi-plus-circle me-1"></i> New Job Card
                    </button>
                </div>
            </div>
            
            <div class="d-flex gap-2 mb-3 overflow-auto">
                <button class="btn btn-sm ${getBtnClass('all')}" onclick="DeliveryUI.setJobCardFilter('all')">All</button>
                <button class="btn btn-sm ${getBtnClass('pending')}" onclick="DeliveryUI.setJobCardFilter('pending')">Pending</button>
                <button class="btn btn-sm ${getBtnClass('in-progress')}" onclick="DeliveryUI.setJobCardFilter('in-progress')">In Progress</button>
                <button class="btn btn-sm ${getBtnClass('job-done')}" onclick="DeliveryUI.setJobCardFilter('job-done')">Job Done</button>
                <button class="btn btn-sm ${getBtnClass('dispatched')}" onclick="DeliveryUI.setJobCardFilter('dispatched')">Dispatched</button>
            </div>

            <div class="table-responsive">
                <table class="table table-dark table-hover border-secondary">
                    <thead>
                        <tr>
                            <th>Job Card #</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Equipment</th>
                            <th>Status</th>
                            <th>Last Update</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${jobCards.length === 0 ? '<tr><td colspan="7" class="text-center text-light py-4">No job cards found</td></tr>' :
                jobCards.map(jc => {
                                try {
                                    return `
                                <tr>
                                    <td>${jc.id}</td>
                                    <td>${DataManager.formatDateDisplay(jc.date)}</td>
                                    <td>${jc.customerName}</td>
                                    <td>${jc.equipment}</td>
                                    <td><span class="badge bg-${this.getStatusColor(jc.status)}">${jc.status.toUpperCase()}</span></td>
                                    <td>${jc.lastUpdateDate}</td>
                                    <td>
                                        <button class="btn btn-sm btn-info" onclick="DeliveryUI.viewJobCard('${jc.id}')" title="View Details">
                                            <i class="bi bi-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger ms-1" onclick="DeliveryUI.deleteJobCard('${jc.id}')" title="Delete">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                                } catch (e) {
                                    console.error('Error rendering jobcard row:', e, jc);
                                    return `<tr class="table-danger"><td colspan="7">Error rendering record: ${jc.id}</td></tr>`;
                                }
                            }).join('')}
                    </tbody>
                </table>
            </div>
`;
    },

    getStatusColor(status) {
        const colors = {
            'pending': 'warning',
            'in-progress': 'info',
            'job-done': 'success',
            'dispatched': 'secondary'
        };
        return colors[status] || 'secondary';
    },

    async showJobCardForm() {
        this.updateInventoryDatalist();
        const container = document.getElementById(this.currentJobCardContainerId || 'jobCardContainer');
        if (!container) return;

        let technicians = [];
        try {
            const employees = await DataManager.getActiveEmployees();
            if (Array.isArray(employees)) {
                technicians = employees.map(e => e.name);
            }
        } catch (error) {
            console.error('Error fetching technicians:', error);
        }

        const today = new Date().toISOString().split('T')[0];

        // Ensure customers are loaded
        const customers = CustomerManager.getAllCustomers();

        container.innerHTML = `
            <div class="card glass-panel border-secondary">
                <div class="card-header border-secondary d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="bi bi-tools me-2"></i>New Job Card</h5>
                    <button class="btn btn-sm btn-outline-secondary" onclick="DeliveryUI.loadJobCards()">
                        <i class="bi bi-arrow-left me-1"></i> Back to List
                    </button>
                </div>
                <div class="card-body">
                    <form id="jobCardForm">
                        <div class="row mb-3">
                            <div class="col-md-3">
                                <label class="form-label">Date</label>
                                <input type="date" class="form-control" id="jcDate" value="${today}" required>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Job Card No.</label>
                                <input type="text" class="form-control" value="Auto-generated" readonly disabled>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Customer DC / Ref No</label>
                                <input type="text" class="form-control" id="jcCustomerRef" placeholder="e.g. DC-1234">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Technician</label>
                                <select class="form-select" id="jcTechnician" required>
                                    <option value="">Select Technician...</option>
                                    ${technicians.map(t => `<option value="${t}">${t}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="row mb-3">
                            <div class="col-md-8">
                                <label class="form-label">Customer *</label>
                                <div class="input-group">
                                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                                    <input type="text" class="form-control" id="jcCustomerSearch" 
                                        placeholder="Type customer name..." list="customerList" autocomplete="off" required>
                                    <input type="hidden" id="jcCustomer" required>
                                </div>
                            </div>
                            <div class="col-md-4 d-flex align-items-end">
                                <button type="button" class="btn btn-primary w-100" onclick="DeliveryUI.showCustomerModal()">
                                    <i class="bi bi-plus-circle me-1"></i> New Customer
                                </button>
                            </div>
                        </div>

                        <div class="row mb-3">
                            <div class="col-12">
                                <label class="form-label">Equipment / Device Details *</label>
                                <input type="text" class="form-control" id="jcEquipment" placeholder="e.g. Dell Laptop, AC Unit, etc." required>
                            </div>
                        </div>

                        <div class="row mb-3">
                            <div class="col-md-6">
                                <label class="form-label">Complaint Reported *</label>
                                <textarea class="form-control" id="jcComplaint" rows="3" required></textarea>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Work Done / API Report</label>
                                <textarea class="form-control" id="jcWorkDone" rows="3"></textarea>
                            </div>
                        </div>

                        <hr class="border-secondary">

                        <!-- Materials & Services Search -->
                        <div class="row g-3">
                            <div class="col-md-6">
                                <div class="card glass-panel border-secondary h-100">
                                    <div class="card-body p-2">
                                        <label class="form-label small text-info mb-1">Search Inventory (Materials)</label>
                                        <div class="input-group input-group-sm mb-2">
                                            <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-search"></i></span>
                                            <input type="text" class="form-control bg-dark text-white border-secondary" 
                                                id="jcGlobalSearch" placeholder="Type material name..." 
                                                list="inventoryList" autocomplete="off">
                                        </div>
                                        <div class="row g-2">
                                            <div class="col-6">
                                                <button type="button" class="btn btn-sm btn-success w-100" onclick="DeliveryUI.addJobCardMaterialRow()">
                                                    <i class="bi bi-plus"></i> Custom
                                                </button>
                                            </div>
                                            <div class="col-6">
                                                <button type="button" class="btn btn-sm btn-primary w-100" onclick="DeliveryUI.showInventoryModal()">
                                                    <i class="bi bi-box"></i> New
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card glass-panel border-secondary h-100">
                                    <div class="card-body p-2">
                                        <label class="form-label small text-warning mb-1">Search Services / Labor</label>
                                        <div class="input-group input-group-sm mb-2">
                                            <span class="input-group-text bg-dark border-secondary text-warning"><i class="bi bi-tools"></i></span>
                                            <input type="text" class="form-control bg-dark text-white border-secondary" 
                                                id="jcServiceSearch" placeholder="Type service name..." 
                                                list="serviceList" autocomplete="off">
                                        </div>
                                        <button type="button" class="btn btn-sm btn-outline-warning w-100" onclick="DeliveryUI.showSection('services')">
                                            <i class="bi bi-gear"></i> Manage Services
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="mb-0">Selected Materials</h6>
                        </div>

                        <div class="table-responsive mb-3">
                            <table class="table table-dark table-sm" id="jcMaterialsTable">
                                <thead>
                                    <tr>
                                        <th style="width: 35%">Item Name</th>
                                        <th style="width: 15%">Qty</th>
                                        <th style="width: 25%">Replaced Item (if any)</th>
                                        <th style="width: 15%">Status</th>
                                        <th style="width: 10%"></th>
                                    </tr>
                                </thead>
                                <tbody id="jcMaterialsBody">
                                    <!-- Rows added dynamically -->
                                    <tr id="emptyMaterialsRow">
                                        <td colspan="4" class="text-center text-muted small py-3">No materials added</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div class="d-flex justify-content-end gap-2">
                            <button type="button" class="btn btn-secondary" onclick="DeliveryUI.loadJobCards()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="bi bi-save me-1"></i> Create Job Card
                            </button>
                        </div>
                    </form>
                </div>
            </div>
    `;

        // Initialize search
        this.handleInventorySearch('jcGlobalSearch', 'jobcard');
        this.handleInventorySearch('jcServiceSearch', 'jobcard');
        this.handleCustomerSearch('jcCustomerSearch', 'jcCustomer');

        // Add event listener for form submit
        document.getElementById('jobCardForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveJobCard();
        });
    },

    addJobCardMaterialRow(data = null, targetBodyId = 'jcMaterialsBody') {
        const tbody = document.getElementById(targetBodyId);
        const emptyRow = document.getElementById('emptyMaterialsRow');
        const viewEmptyRow = document.getElementById('viewEmptyMaterialsRow');
        if (emptyRow) emptyRow.remove();
        if (viewEmptyRow) viewEmptyRow.remove();

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm item-desc" 
                    name="materialName" placeholder="Description" required value="${data ? data.name : ''}">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" name="materialQty" value="1" min="1" required>
            </td>
            <td>
                <input type="text" class="form-control form-control-sm" name="materialReplaced" placeholder="Old Part Details">
            </td>
            <td>
                <select class="form-select form-select-sm" name="materialStatus">
                    <option value="pending">Pending</option>
                    <option value="installed">Installed</option>
                    <option value="returned">Returned</option>
                </select>
                <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="this.closest('tr').remove()">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    },

    async saveJobCard() {
        try {
            let customerId = document.getElementById('jcCustomer').value;
            const customerNameInput = document.getElementById('jcCustomerSearch');
            const customerName = customerNameInput ? customerNameInput.value.trim() : '';

            console.log('Attempting to save Job Card.', { customerId, customerName });
            
            let customer = CustomerManager.getCustomer(customerId);
            
            // Fallback Search: If hidden ID is missing but name matches an existing customer exactly
            if (!customer && customerName) {
                console.log('Hidden ID missing. Attempting fallback search by name:', customerName);
                const allCustomers = CustomerManager.getAllCustomers();
                customer = allCustomers.find(c => 
                    (c.name && c.name.trim().toLowerCase() === customerName.toLowerCase()) ||
                    (c.phone && String(c.phone).trim() === customerName)
                );
                
                if (customer) {
                    customerId = customer.id || '';
                    console.log('Fallback match found:', customer.name, customer.id);
                }
            }

            if (!customer) {
                const allCustomers = CustomerManager.getAllCustomers();
                console.error('Validation failed: No valid customer found for input:', customerName);
                console.log('Available customers in system:', allCustomers.map(c => c.name));
                throw new Error('Please select a valid customer');
            }

            // Gather materials
            const materials = [];
            const rows = document.querySelectorAll('#jcMaterialsBody tr');
            rows.forEach(row => {
                if (row.id === 'emptyMaterialsRow') return;
                const nameInput = row.querySelector('input[name="materialName"]');
                const qtyInput = row.querySelector('input[name="materialQty"]');
                const statusSelect = row.querySelector('select[name="materialStatus"]');

                if (nameInput && nameInput.value) {
                    const replacedInput = row.querySelector('input[name="materialReplaced"]');
                    materials.push({
                        name: nameInput.value,
                        quantity: parseInt(qtyInput.value) || 1,
                        replaced: replacedInput ? replacedInput.value : '',
                        status: statusSelect.value
                    });
                }
            });

            const jobCardData = {
                date: document.getElementById('jcDate').value,
                customerRef: document.getElementById('jcCustomerRef').value,
                customerId: customerId,
                customerName: customer.name,
                technicianId: document.getElementById('jcTechnician').value,
                equipment: document.getElementById('jcEquipment').value,
                complaint: document.getElementById('jcComplaint').value,
                workDone: document.getElementById('jcWorkDone').value,
                materials: materials
            };

            await JobCardManager.createJobCard(jobCardData);
            App.showNotification('Job Card created successfully!', 'success');
            this.loadJobCards();

        } catch (error) {
            console.error('Error saving job card:', error);
            App.showNotification(error.message, 'error');
        }
    },

    viewJobCard(id) {
        const jobCard = JobCardManager.getJobCard(id);
        if (!jobCard) {
            App.showNotification('Job Card not found', 'error');
            return;
        }

        const customer = CustomerManager.getCustomer(jobCard.customerId);
        const statusColors = {
            'pending': 'warning',
            'in-progress': 'info',
            'job-done': 'success',
            'dispatched': 'secondary'
        };

        const modalHtml = `
            <div class="modal fade" id="jobCardViewModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content bg-dark border-0 shadow-lg text-white">
                        <div class="modal-header border-0 pb-0">
                            <div>
                                <h5 class="modal-title text-white fw-bold"><i class="bi bi-tools me-2"></i>Job Card Preview</h5>
                                <div class="d-flex align-items-center mt-1">
                                    <span class="badge bg-${statusColors[jobCard.status] || 'secondary'} me-2">${jobCard.status.toUpperCase()}</span>
                                    <span class="small text-muted">${jobCard.id} | ${jobCard.customerName}</span>
                                </div>
                            </div>
                            <div class="d-flex gap-2 align-items-center">
                                <button type="button" class="btn btn-outline-light btn-sm border-secondary" onclick="DeliveryUI.toggleModalFullscreen('jobCardViewModal')" title="Toggle Fullscreen">
                                    <i class="bi bi-fullscreen"></i>
                                </button>
                                <button type="button" class="btn btn-primary" onclick="DeliveryUI.generateJobCardPDF('${jobCard.id}')" title="Download PDF">
                                    <i class="bi bi-download me-1"></i> Download PDF
                                </button>
                                ${(jobCard.status === 'job-done' || jobCard.status === 'dispatched') ? `
                                <div class="dropdown">
                                    <button class="btn btn-success dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                        <i class="bi bi-receipt me-1"></i> Generate Invoice
                                    </button>
                                    <ul class="dropdown-menu dropdown-menu-dark shadow-lg">
                                        <li><a class="dropdown-item" href="#" onclick="DeliveryUI.convertJobCardToInvoice('${jobCard.id}', 'with-bill')"><i class="bi bi-file-earmark-check me-2"></i>GST Invoice</a></li>
                                        <li><a class="dropdown-item" href="#" onclick="DeliveryUI.convertJobCardToInvoice('${jobCard.id}', 'without-bill')"><i class="bi bi-file-earmark me-2"></i>Non-GST Invoice</a></li>
                                    </ul>
                                </div>
                                ` : ''}
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0">
                            <div class="bg-white text-dark p-4" id="jobCardPrintArea">
                                <form id="jobCardDetailsForm">
                                    <input type="hidden" id="jcViewId" value="${jobCard.id}">
                                    
                                    <div class="row mb-4">
                                        <div class="col-md-6">
                                            <h6 class="text-uppercase text-muted extra-small fw-bold mb-2">Customer Details</h6>
                                            <h5 class="fw-bold mb-1">${jobCard.customerName}</h5>
                                            <p class="mb-0 small text-muted">${customer?.phone || ''}</p>
                                            <p class="mb-0 small text-muted">${customer?.address || ''}</p>
                                        </div>
                                        <div class="col-md-6 text-md-end">
                                            <h6 class="text-uppercase text-muted extra-small fw-bold mb-2">Job Details</h6>
                                            <p class="mb-1"><strong>Date:</strong> ${jobCard.date}</p>
                                            <p class="mb-1"><strong>Technician:</strong> ${jobCard.technicianId || 'Not assigned'}</p>
                                            <p class="mb-0 extra-small text-muted">Last Updated: ${jobCard.lastUpdateDate || '-'}</p>
                                        </div>
                                    </div>

                                    <div class="p-3 border border-secondary rounded bg-light mb-4 text-dark">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label class="form-label extra-small text-muted text-uppercase fw-bold">Customer DC / Ref No</label>
                                                    <input type="text" class="form-control form-control-sm border-secondary" id="jcViewCustomerRef" value="${jobCard.customerRef || ''}">
                                                </div>
                                                <div class="mb-3">
                                                    <label class="form-label extra-small text-muted text-uppercase fw-bold">Equipment/Details</label>
                                                    <input type="text" class="form-control form-control-sm border-secondary" id="jcViewEquipment" value="${jobCard.equipment || ''}">
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label extra-small text-muted text-uppercase fw-bold">Complaint</label>
                                                <textarea class="form-control form-control-sm border-secondary mb-3" rows="2" readonly>${jobCard.complaint}</textarea>
                                                <label class="form-label extra-small text-muted text-uppercase fw-bold">Work Done / Technician Notes</label>
                                                <textarea class="form-control form-control-sm border-secondary" id="jcViewWorkDone" rows="2">${jobCard.workDone || ''}</textarea>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="card border-info mb-4">
                                        <div class="card-header bg-info-subtle border-info py-1">
                                            <h6 class="mb-0 small fw-bold"><i class="bi bi-truck me-2"></i>Dispatch & Status Update</h6>
                                        </div>
                                        <div class="card-body py-2">
                                            <div class="row g-2">
                                                <div class="col-md-4">
                                                    <label class="extra-small text-muted mb-1">Current Status</label>
                                                    <select class="form-select form-select-sm border-secondary" id="jcViewStatus">
                                                        <option value="pending" ${jobCard.status === 'pending' ? 'selected' : ''}>Pending</option>
                                                        <option value="in-progress" ${jobCard.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                                        <option value="job-done" ${jobCard.status === 'job-done' ? 'selected' : ''}>Job Done</option>
                                                        <option value="dispatched" ${jobCard.status === 'dispatched' ? 'selected' : ''}>Dispatched</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-4">
                                                    <label class="extra-small text-muted mb-1">Dispatch Via</label>
                                                    <input type="text" class="form-control form-control-sm border-secondary" id="jcViewDispatchVia" value="${jobCard.dispatchVia || ''}" placeholder="e.g. Self / Courier">
                                                </div>
                                                <div class="col-md-4">
                                                    <label class="extra-small text-muted mb-1">LR / Tracking No</label>
                                                    <input type="text" class="form-control form-control-sm border-secondary" id="jcViewLRNo" value="${jobCard.lrNo || ''}" placeholder="LR Number">
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Search Section Added -->
                                    <div class="row g-3 mb-4">
                                        <div class="col-md-6">
                                            <div class="card glass-panel border-secondary h-100 bg-light">
                                                <div class="card-body p-2 text-dark">
                                                    <label class="form-label small text-muted text-uppercase fw-bold mb-1">Search Inventory (Materials)</label>
                                                    <div class="input-group input-group-sm mb-2">
                                                        <span class="input-group-text bg-white border-secondary text-primary"><i class="bi bi-search"></i></span>
                                                        <input type="text" class="form-control bg-white text-dark border-secondary" 
                                                            id="jcViewGlobalSearch" placeholder="Type material name..." 
                                                            list="inventoryList" autocomplete="off">
                                                    </div>
                                                    <div class="row g-2">
                                                        <div class="col-6">
                                                            <button type="button" class="btn btn-sm btn-outline-success w-100" onclick="DeliveryUI.addJobCardMaterialRow(null, 'jcViewMaterialsBody')">
                                                                <i class="bi bi-plus-circle me-1"></i> Custom
                                                            </button>
                                                        </div>
                                                        <div class="col-6">
                                                            <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="DeliveryUI.showInventoryModal()">
                                                                <i class="bi bi-box-seam me-1"></i> New
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="card glass-panel border-secondary h-100 bg-light">
                                                <div class="card-body p-2 text-dark">
                                                    <label class="form-label small text-muted text-uppercase fw-bold mb-1">Search Services / Labor</label>
                                                    <div class="input-group input-group-sm mb-2">
                                                        <span class="input-group-text bg-white border-secondary text-warning"><i class="bi bi-tools"></i></span>
                                                        <input type="text" class="form-control bg-white text-dark border-secondary" 
                                                            id="jcViewServiceSearch" placeholder="Type service name..." 
                                                            list="serviceList" autocomplete="off">
                                                    </div>
                                                    <button type="button" class="btn btn-sm btn-outline-warning w-100 text-dark" onclick="DeliveryUI.showSection('services')">
                                                        <i class="bi bi-gear-fill me-1"></i> Manage Services
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <h6 class="fw-bold mb-3 small text-dark d-flex align-items-center">
                                        <i class="bi bi-box-seam me-2"></i>Materials Tracking
                                    </h6>
                                    <div class="table-responsive">
                                        <table class="table table-sm table-bordered border-secondary small text-dark">
                                            <thead style="background-color: #f8f9fa;" class="text-dark">
                                                <tr>
                                                    <th>Material</th>
                                                    <th style="width: 10%">Qty</th>
                                                    <th>Replaced Item</th>
                                                    <th style="width: 20%">Current Status</th>
                                                    <th class="text-center" style="width: 8%"></th>
                                                </tr>
                                            </thead>
                                            <tbody id="jcViewMaterialsBody">
                                                ${jobCard.materials && jobCard.materials.length > 0 ?
                jobCard.materials.map((m, idx) => `
                                                    <tr class="align-middle">
                                                        <td>${m.name}</td>
                                                        <td class="text-center">${m.quantity}</td>
                                                        <td>
                                                            <input type="text" class="form-control form-control-sm border-0 bg-light material-replaced-input" 
                                                                   data-index="${idx}" value="${m.replaced || ''}" placeholder="Enter replaced part...">
                                                        </td>
                                                        <td>
                                                            <span class="badge bg-${m.status === 'installed' ? 'success' : m.status === 'returned' ? 'warning' : 'secondary'}">
                                                                ${m.status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <select class="form-select form-select-sm border-0 bg-light material-status-select" data-index="${idx}">
                                                                <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>Pending</option>
                                                                <option value="installed" ${m.status === 'installed' ? 'selected' : ''}>Installed</option>
                                                                <option value="returned" ${m.status === 'returned' ? 'selected' : ''}>Returned</option>
                                                            </select>
                                                        </td>
                                                    </tr>
                                                `).join('') : '<tr><td colspan="5" class="text-center text-muted py-3">No materials tracked</td></tr>'}
                                            </tbody>
                                        </table>
                                    </div>
                                    ${(!jobCard.materials || jobCard.materials.length === 0) ? `
                                        <div id="viewEmptyMaterialsRow" class="text-center text-muted small py-3 bg-light border border-top-0 rounded-bottom">
                                            No materials tracked. Add using search above.
                                        </div>
                                    ` : ''}

                                    <h6 class="fw-bold mt-4 mb-3 small text-muted d-flex align-items-center">
                                        <i class="bi bi-clock-history me-2"></i>Update History
                                    </h6>
                                    <div class="bg-light border rounded p-2" style="max-height: 150px; overflow-y: auto;">
                                        ${jobCard.history && jobCard.history.length > 0 ?
                jobCard.history.slice().reverse().map(h => `
                                                <div class="d-flex justify-content-between small border-bottom pb-1 mb-1">
                                                    <span class="text-dark">
                                                        <span class="badge bg-secondary me-1">${h.status.toUpperCase()}</span>
                                                        ${h.note}
                                                    </span>
                                                    <span class="text-muted">${h.displayDate}</span>
                                                </div>
                                            `).join('') : '<p class="text-muted small mb-0 text-center py-2">No history records yet.</p>'}
                                    </div>
                                </form>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-primary" onclick="DeliveryUI.saveJobCardDetails()">
                                <i class="bi bi-save me-1"></i> Update Job Card
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('jobCardViewModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = new bootstrap.Modal(document.getElementById('jobCardViewModal'));
        modal.show();

        // Initialize search for View modal
        this.handleInventorySearch('jcViewGlobalSearch', 'jobcard_view');
        this.handleInventorySearch('jcViewServiceSearch', 'jobcard_view');
    },

    async saveJobCardDetails() {
        try {
            const id = document.getElementById('jcViewId').value;
            const status = document.getElementById('jcViewStatus').value;
                   // Gather ALL materials from the view table
            const materials = [];
            document.querySelectorAll('#jcViewMaterialsBody tr').forEach(row => {
                // Check if it's an existing item row (with data-index)
                const statusSelect = row.querySelector('.material-status-select');
                if (statusSelect) {
                    const index = parseInt(statusSelect.getAttribute('data-index'));
                    const name = row.cells[0].innerText || row.cells[0].textContent;
                    const quantity = parseInt(row.querySelector('.material-qty-input')?.value || row.cells[1].innerText || 1);
                    const replaced = row.querySelector('.material-replaced-input')?.value || '';
                    const status = statusSelect.value;
                    materials.push({ name, quantity, replaced, status });
                } else {
                    // It's a newly added row
                    const name = row.querySelector('[name="materialName"]')?.value;
                    const quantity = row.querySelector('[name="materialQty"]')?.value;
                    const replaced = row.querySelector('[name="materialReplaced"]')?.value;
                    const status = row.querySelector('[name="materialStatus"]')?.value;

                    if (name) {
                        materials.push({
                            name,
                            quantity: parseInt(quantity) || 1,
                            replaced: replaced || '',
                            status: status || 'pending'
                        });
                    }
                }
            });

            const updates = {
                customerRef: document.getElementById('jcViewCustomerRef').value,
                equipment: document.getElementById('jcViewEquipment').value,
                workDone: document.getElementById('jcViewWorkDone').value,
                status: document.getElementById('jcViewStatus').value,
                dispatchVia: document.getElementById('jcViewDispatchVia').value,
                lrNo: document.getElementById('jcViewLRNo').value,
                materials: materials
            };

            await JobCardManager.updateJobCard(id, updates);

            App.showNotification('Job Card updated successfully', 'success');
            this.viewJobCard(id); // Reload view

        } catch (error) {
            console.error('Error updating job card:', error);
            App.showNotification('Failed to update: ' + error.message, 'error');
        }
    },

    async convertJobCardToInvoice(id, type = 'with-bill') {
        try {
            const jc = JobCardManager.getJobCard(id);
            if (!jc) throw new Error('Job Card not found');
            
            // Redirect to modern InvoicesUI (Screenshot 2 style)
            if (typeof InvoicesUI !== 'undefined') {
                InvoicesUI.showCreateModal(type === 'with-bill' ? 'sales-gst' : 'sales-non-gst');
                
                // Wait a moment for modal to render, then populate
                setTimeout(() => {
                    const form = document.getElementById('createInvoiceForm');
                    if (!form) return;

                    // Tag form with Job Card ID so the saved invoice triggers a Service Challan
                    form.setAttribute('data-source-jc', id);

                    // Fill Customer
                    const customerInput = form.querySelector('[name="customerName"]');
                    if (customerInput) {
                        customerInput.value = jc.customerName || '';
                        const idInput = form.querySelector('[name="customerId"]');
                        if (idInput) {
                            idInput.value = (jc.customerId && jc.customerId !== 'undefined') ? jc.customerId : '';
                        }
                        
                        // Trigger change to update other info
                        customerInput.dispatchEvent(new Event('change'));
                    }

                    // Fill DC Ref
                    const poInput = form.querySelector('[name="poNumber"]');
                    if (poInput) {
                        poInput.value = jc.customerRef || jc.id || '';
                    }

                    // Pre-fill materials
                    if (jc.materials && jc.materials.length > 0) {
                        // Clear existing rows (keep the header)
                        const tbody = document.getElementById('invoiceItemsBody');
                        if (tbody) tbody.innerHTML = '';
                        
                        jc.materials.filter(m => m.status === 'installed').forEach(m => {
                            if (typeof InvoicesUI.addItemRow === 'function') {
                                InvoicesUI.addItemRow({
                                    name: m.name,
                                    itemDescription: m.replaced ? `Replaced: ${m.replaced}` : '',
                                    quantity: m.quantity,
                                    unit: 'pcs',
                                    rate: 0
                                });
                            }
                        });
                    }
                }, 500);
            } else {
                throw new Error('Modern Invoice system not loaded');
            }

            App.showNotification(`Job Card ${id} sent to invoice form`, 'success');

        } catch (error) {
            console.error('Conversion Error:', error);
            App.showNotification(error.message, 'error');
        }
    },

    async generateJobCardPDF(id) {
        let element = document.getElementById('jobCardPrintArea');
        if (!element) {
            this.viewJobCard(id);
            await new Promise(r => setTimeout(r, 200));
            element = document.getElementById('jobCardPrintArea');
        }

        if (!element) {
            App.showNotification('Job Card print area not found', 'error');
            return;
        }

        const jobCard = JobCardManager.getJobCard(id);
        if (!jobCard) return;

        const filename = `JobCard_${id}.pdf`;
        const opt = {
            margin: [0.3, 0.3, 0.3, 0.3],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        if (typeof html2pdf !== 'undefined') {
            App.showNotification('Preparing PDF Viewer...', 'info');
            const worker = html2pdf().set(opt).from(element);

            if (window.electronAPI && window.electronAPI.savePdf) {
                try {
                    const pdfBase64 = await worker.output('base64');
                    await window.electronAPI.savePdf({
                        blobBase64: pdfBase64,
                        filename: filename,
                        subfolder: 'JobCards'
                    });
                } catch (e) {
                    console.error('PDF Save Error:', e);
                }
            }

            worker.output('bloburl').then(url => {
                window.open(url, '_blank');
            });
        } else {
            App.showNotification('PDF generation library not loaded', 'error');
        }
    },

    async deleteJobCard(id) {
        if (!confirm('Delete this job card?')) return;
        if (typeof JobCardManager !== 'undefined') {
            await JobCardManager.deleteJobCard(id);
            App.showNotification('Job card deleted', 'success');
            this.loadJobCards();
        }
    },

    // Invoices
    loadInvoices() {
        const container = document.getElementById('invoicesContainer');
        if (!container) return;

        const invoicesWithBill = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getInvoicesByType('with-bill') : [];
        const invoicesWithoutBill = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getInvoicesByType('without-bill') : [];

        // Helper to render table
        const renderTable = (invoices) => {
            if (invoices.length === 0) return '<p class="text-light text-center py-4">No invoices found</p>';
            return `
        <div class="table-responsive">
            <table class="table table-dark table-hover table-sm border-secondary">
                <thead>
                    <tr>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map(inv => `
                                    <tr>
                                        <td>${inv.id}</td>
                                        <td>${DataManager.formatDateDisplay(inv.date)}</td>
                                        <td>${inv.customerName}</td>
                                        <td>₹${inv.total.toFixed(2)}</td>
                                        <td><span class="badge bg-${inv.status === 'paid' ? 'success' : 'warning'}">${inv.status.toUpperCase()}</span></td>
                                        <td>
                                            <button class="btn btn-sm btn-info" onclick="DeliveryUI.viewInvoice('${inv.id}')" title="View">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-light ms-1" onclick="DeliveryUI.printInvoice('${inv.id}')" title="Print">
                                                <i class="bi bi-printer"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger ms-1" onclick="DeliveryUI.deleteInvoice('${inv.id}')" title="Delete">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                </tbody>
            </table>
        </div>
        `;
        };

        container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
                <h4><i class="bi bi-receipt text-success me-2"></i>Invoices</h4>
                <div>
                    <button class="btn btn-success me-2" onclick="InvoicesUI.showCreateModal('sales-gst')">
                        <i class="bi bi-plus-circle me-1"></i> GST Invoice
                    </button>
                    <button class="btn btn-outline-success" onclick="InvoicesUI.showCreateModal('sales-non-gst')">
                        <i class="bi bi-plus-circle me-1"></i> Non-GST Invoice
                    </button>
                </div>
            </div>

            <ul class="nav nav-tabs mb-3" role="tablist">
                <li class="nav-item">
                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#invWithBill" type="button">
                        With Bill (GST) <span class="badge bg-secondary ms-1">${invoicesWithBill.length}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#invWithoutBill" type="button">
                        Without Bill <span class="badge bg-secondary ms-1">${invoicesWithoutBill.length}</span>
                    </button>
                </li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="invWithBill">
                    ${renderTable(invoicesWithBill)}
                </div>
                <div class="tab-pane fade" id="invWithoutBill">
                    ${renderTable(invoicesWithoutBill)}
                </div>
            </div>
`;
    },

    async deleteInvoice(id) {
        if (confirm('Are you sure you want to delete this invoice? This will also remove its link from any associated challans.')) {
            try {
                // CASCADING DELETE LOGIC:
                // Find challans linked to this invoice and unlink them (or delete them if preferred by user,
                // but usually unlinking is safer unless specified. However, the plan said "Cascading deletion for Challans").
                // "Cascading deletion" means if invoice is gone, challan is gone.
                const challans = DeliveryManager.getAllChallans().filter(c => c.invoiceId === id);
                challans.forEach(c => {
                    DeliveryManager.deleteChallan(c.id);
                });

                await InvoiceManager.deleteInvoice(id);
                App.showNotification('Invoice and linked challans deleted', 'success');
                this.loadInvoices(); // Changed from loadHistory() to loadInvoices() to match context
            } catch (error) {
                console.error(error);
                App.showNotification(error.message, 'error');
            }
        }
    },

    // REDUNDANT: Legacy methods removed.
    // Creating invoices is now handled by InvoicesUI.showCreateModal().

    async createAutoChallanFromInvoice(invoice) {
        try {
            // Logic: If Job Card is present, it's a Service Challan (SC). Else it's a Delivery Challan (DC).
            const isService = !!invoice.jobCardId;
            const challanType = isService ? 'service' : 'delivery';
            const invoiceStableId = invoice.id; 
            const invoiceNo = invoice.invoiceNo || invoice.id;

            // Check if a challan already exists for this invoice (during edits)
            // Search by invoiceId (stable link) or referenceNumber (legacy link)
            const existingChallans = DeliveryManager.getAllChallans();
            const existing = existingChallans.find(c => 
                (c.invoiceId === invoiceStableId) || 
                (c.referenceNumber === invoiceNo && c.type === challanType) ||
                (c.referenceNumber === invoiceStableId && c.type === challanType)
            );

            const customer = typeof CustomerManager !== 'undefined' ? CustomerManager.getCustomer(invoice.customerId) : null;
            const customerName = customer ? customer.name : (invoice.customerName || 'Walk-in Customer');
            const dispatch = invoice.dispatchDetails || {};

            const challanData = {
                type: challanType,
                date: invoice.date,
                customerId: invoice.customerId,
                customerName: customerName,
                customerAddress: customer ? customer.address : (invoice.customerAddress || ''),
                referenceNumber: invoiceNo, // Use the current display number
                invoiceId: invoiceStableId, // Link by stable ID
                jobCardId: invoice.jobCardId || null, 
                dispatchVia: dispatch.via || '',
                lrNo: dispatch.lrNo || '',
                vehicleNo: dispatch.vehicleNo || '',
                dispatchDate: dispatch.date || '',
                workDone: invoice.narration || '',
                items: (invoice.items || []).map(item => ({
                    name: item.name,
                    description: item.description || '',
                    quantity: item.quantity,
                    unit: item.unit || 'pcs',
                    rate: 0, 
                    amount: 0
                })),
                gstMode: false,
                status: 'completed',
                notes: `Auto-generated from Invoice ${invoiceNo}.${invoice.jobCardId ? ' Job Card: ' + invoice.jobCardId : ''}`
            };

            let finalChallan;
            if (existing) {
                // Update the existing DC with brand new info from the Invoice
                finalChallan = await DeliveryManager.updateChallan(existing.id, challanData);
                console.log(`${isService ? 'Service' : 'Delivery'} Challan synced for invoice:`, invoiceNo);
            } else {
                finalChallan = await DeliveryManager.createChallan(challanData);
                console.log(`${isService ? 'Service' : 'Delivery'} Challan created for invoice:`, invoiceNo);
            }

            // Also update the invoice to point back to this challan (important for sync)
            if (finalChallan && invoice.challanId !== finalChallan.id) {
                await InvoiceManager.updateInvoice(invoiceStableId, { challanId: finalChallan.id });
            }
        } catch (error) {
            console.error('Error creating auto challan:', error);
            App.showNotification('Warning: Could not sync automated challan', 'warning');
        }
    },

    viewInvoice(id) {
        const invoice = InvoiceManager.getInvoice(id);
        if (!invoice) {
            App.showNotification('Invoice not found', 'error');
            return;
        }

        const customer = CustomerManager.getCustomer(invoice.customerId);
        const typeLabel = invoice.type === 'with-bill' ? 'TAX INVOICE' : 'BILL OF SUPPLY';
        const settings = DataManager.getData('gtes_settings') || {};
        const companyName = settings.companyName || "Gas Tech Engineering Service";
        const companyAddress = settings.registeredAddress || "No.232/233, Nageshwara Road, Athipet, Chennai-58";
        const workAddress = settings.workAddress || "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058";
        const email = settings.email || "gastechengservice@gmail.com, rajmohan67raj@gmail.com";
        const phone = settings.phone || "+91 9600015839, +91 95662 02856";
        const gstin = settings.gstin || "33AFXPR3235A32F";
        const pan = settings.pan || "AFXPR3235A";
        const iec = settings.iec || "AFXPR3235A";
        const upiId = settings.upiId || 'gastechengservice@okicici';

        const modalHtml = `
            <div class="modal fade" id="invoicePreviewModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content bg-dark border-0 shadow-lg">
                        <div class="modal-header border-0 pb-0">
                            <div>
                                <h5 class="modal-title text-white fw-bold"><i class="bi bi-file-earmark-check me-2"></i>${typeLabel} Preview</h5>
                                <p class="small text-muted mb-0">${invoice.invoiceNo || invoice.id} | ${invoice.customerName}</p>
                            </div>
                            <div class="d-flex gap-2 align-items-center">
                                <button type="button" class="btn btn-outline-light btn-sm border-secondary" onclick="DeliveryUI.toggleModalFullscreen('invoicePreviewModal')" title="Toggle Fullscreen">
                                    <i class="bi bi-fullscreen"></i>
                                </button>
                                <button type="button" class="btn btn-outline-info" onclick="DeliveryUI.nativePrint()" title="Print (Faster)">
                                    <i class="bi bi-printer me-1"></i> Print
                                </button>
                                <button type="button" class="btn btn-primary" onclick="DeliveryUI.printInvoice('${invoice.id}')" title="Download PDF (Highest Quality)">
                                    <i class="bi bi-download me-1"></i> Save PDF
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 bg-secondary-subtle overflow-auto" style="max-height: 90vh;">
                            <div id="invoicePrintArea" class="bg-white text-dark p-4 mx-auto my-5 shadow-lg" style="width: 720px; font-size: 10pt; box-sizing: border-box; border: 1px solid #dee2e6;">
                                <!-- Company Header -->
                                <div class="text-center border-bottom pb-3 mb-4">
                                    <h2 class="fw-bold mb-1">${companyName.toUpperCase()}</h2>
                                    <p class="mb-0 small">${companyAddress}</p>
                                    <p class="mb-0 small">Work Address: ${workAddress}</p>
                                    <p class="mb-0 small">Email: ${email} | Ph: ${phone}</p>
                                    <p class="mb-0 small fw-bold">GSTIN: ${gstin} | PAN: ${pan} | IEC: ${iec}</p>
                                </div>

                                <!-- Invoice Title and Details -->
                                <div class="row mb-4">
                                    <div class="col-7">
                                        <h6 class="text-uppercase text-muted small fw-bold mb-2">DETAILS OF RECEIVER (BILLED TO)</h6>
                                        <h5 class="fw-bold mb-1">${invoice.customerName}</h5>
                                        <p class="mb-0 small" style="white-space: pre-line;">${customer?.address || invoice.customerAddress || ''}</p>
                                        ${customer?.phone ? `<p class="mb-0 small mt-1"><strong>Phone:</strong> ${customer.phone}</p>` : ''}
                                        ${customer?.gstin ? `<p class="mb-0 small"><strong>GSTIN:</strong> ${customer.gstin}</p>` : ''}
                                    </div>
                                    <div class="col-5">
                                        <div class="text-end mb-3">
                                            <h3 class="fw-bold text-uppercase mb-0">${typeLabel}</h3>
                                        </div>
                                        <table class="table table-sm table-borderless mb-0 small" style="font-size: 8.5pt;">
                                            <tr><td class="text-muted text-end pe-2 py-0">Invoice No:</td><td class="fw-bold py-0">${invoice.invoiceNo || invoice.id}</td></tr>
                                            <tr><td class="text-muted text-end pe-2 py-0">Date:</td><td class="fw-bold py-0">${DataManager.formatDateDisplay(invoice.date)}</td></tr>
                                            ${invoice.dispatchDetails?.via ? `<tr><td class="text-muted text-end pe-2 py-0">Dispatch Via:</td><td class="fw-bold py-0">${invoice.dispatchDetails.via}</td></tr>` : ''}
                                            ${invoice.dispatchDetails?.lrNo ? `<tr><td class="text-muted text-end pe-2 py-0">LR/Track No:</td><td class="fw-bold py-0">${invoice.dispatchDetails.lrNo}</td></tr>` : ''}
                                            ${invoice.dispatchDetails?.vehicleNo ? `<tr><td class="text-muted text-end pe-2 py-0">Vehicle No:</td><td class="fw-bold py-0">${invoice.dispatchDetails.vehicleNo}</td></tr>` : ''}
                                            ${invoice.dispatchDetails?.date ? `<tr><td class="text-muted text-end pe-2 py-0">Disp. Date:</td><td class="fw-bold py-0">${DataManager.formatDateDisplay(invoice.dispatchDetails.date)}</td></tr>` : ''}
                                        </table>
                                    </div>
                                </div>

                                <!-- Items Table -->
                                <table class="table table-bordered border-dark mb-4 text-dark" style="table-layout: fixed; width: 100%;">
                                    <thead style="background-color: #eee;" class="text-dark">
                                        <tr class="text-center align-middle extra-small fw-bold">
                                            <th style="width: 4%">#</th>
                                            <th style="width: 28%">DESCRIPTION</th>
                                            <th style="width: 10%">HSN</th>
                                            <th style="width: 7%">QTY</th>
                                            <th style="width: 6%">UNIT</th>
                                            <th style="width: 9%">RATE</th>
                                            <th style="width: 4%">DISC</th>
                                            <th style="width: 6%">CGST%</th>
                                            <th style="width: 6%">SGST%</th>
                                            <th style="width: 20%">TOTAL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${invoice.items.map((item, idx) => {
                                            const itemGstRate = parseFloat(item.gstRate) || 0;
                                            const cgstRate = itemGstRate / 2;
                                            const sgstRate = itemGstRate / 2;
                                            
                                            return `
                                            <tr class="align-middle text-dark">
                                                <td class="text-center extra-small">${idx + 1}</td>
                                                <td>
                                                    <div class="fw-bold extra-small">${item.name || item.description || ''}</div>
                                                </td>
                                                <td class="text-center extra-small">${item.hsn || '-'}</td>
                                                <td class="text-center extra-small">${item.quantity}</td>
                                                <td class="text-center extra-small">${item.unit || 'nos'}</td>
                                                <td class="text-end extra-small">${item.rate.toFixed(2)}</td>
                                                <td class="text-center extra-small">${item.discount || 0}%</td>
                                                <td class="text-center extra-small">${cgstRate.toFixed(1)}%</td>
                                                <td class="text-center extra-small">${sgstRate.toFixed(1)}%</td>
                                                <td class="text-end fw-bold extra-small">${item.amount.toFixed(2)}</td>
                                            </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                    <tfoot>
                                        <tr class="align-middle text-dark">
                                            <td colspan="9" class="text-end fw-bold extra-small py-2" style="border: 1px solid #000;">Subtotal:</td>
                                            <td class="text-end fw-bold extra-small py-2" style="border: 1px solid #000; padding-right: 5px;">₹${invoice.subtotal.toFixed(2)}</td>
                                        </tr>
                                        ${invoice.gst && invoice.gst.cgst > 0 ? `
                                        <tr class="align-middle text-dark">
                                            <td colspan="9" class="text-end py-1 extra-small" style="border: 1px solid #000;">CGST Amt:</td>
                                            <td class="text-end py-1 extra-small" style="border: 1px solid #000; padding-right: 5px;">₹${invoice.gst.cgst.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        ${invoice.gst && invoice.gst.sgst > 0 ? `
                                        <tr class="align-middle text-dark">
                                            <td colspan="9" class="text-end py-1 extra-small" style="border: 1px solid #000;">SGST Amt:</td>
                                            <td class="text-end py-1 extra-small" style="border: 1px solid #000; padding-right: 5px;">₹${invoice.gst.sgst.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        ${invoice.roundOff ? `
                                        <tr class="align-middle text-dark">
                                            <td colspan="9" class="text-end py-1 extra-small" style="border: 1px solid #000;">Round Off:</td>
                                            <td class="text-end py-1 extra-small" style="border: 1px solid #000; padding-right: 5px;">${invoice.roundOff > 0 ? '+' : ''}${invoice.roundOff.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                         <tr style="background-color: #f8f9fa !important;">
                                             <td colspan="9" class="text-end text-uppercase py-3 extra-small fw-bold" style="color: #000 !important; border: 2px solid #000;">Total Amount</td>
                                             <td class="text-end py-3 extra-small fs-6 fw-bold" style="color: #000 !important; border: 2px solid #000; padding-right: 5px !important;">₹${invoice.total.toFixed(2)}</td>
                                         </tr>
                                    </tfoot>
                                </table>

                                <!-- Footer -->
                                <div class="row mt-4">
                                    <div class="col-8">
                                        <h6 class="fw-bold small mb-2">Terms & Conditions:</h6>
                                        <p class="extra-small text-muted mb-1">1. Goods once sold will not be taken back.</p>
                                        <p class="extra-small text-muted mb-3">2. Subject to Chennai Jurisdiction.</p>

                                        ${invoice.narration ? `
                                        <div class="mb-3 p-2 border rounded bg-light" style="font-size: 8.5pt;">
                                            <span class="text-muted text-uppercase fw-bold extra-small d-block mb-1">Narration:</span>
                                            <div class="text-dark">${invoice.narration}</div>
                                        </div>
                                        ` : ''}
                                        
                                        <div class="d-flex align-items-center border rounded p-2 bg-light" style="width: fit-content;">
                                            <div class="bg-white p-1 border me-3">
                                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyName)}&am=${invoice.total}&cu=INR`)}" 
                                                    alt="UPI QR" style="width: 80px; height: 80px;">
                                            </div>
                                            <div>
                                                <h6 class="fw-bold extra-small mb-1 uppercase"><i class="bi bi-qr-code-scan me-1"></i>Pay via UPI</h6>
                                                <p class="extra-small mb-0 fw-bold text-dark">${upiId}</p>
                                                <p class="extra-small mb-0 text-muted">Scan to pay directly</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-4 text-center mt-auto">
                                        <div class="mb-4 text-muted small">For ${companyName}</div>
                                        <div class="border-bottom border-dark mb-2 mx-auto" style="width: 150px; height: 40px;"></div>
                                        <p class="small fw-bold">Authorized Signatory</p>
                                    </div>
                                </div>

                                <div class="mt-4 text-center text-muted border-top pt-3">
                                    <small>This is a computer generated invoice and does not require a physical signature.</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('invoicePreviewModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }

        // Insert modal HTML into DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('invoicePreviewModal'));
        modal.show();
    },


    nativePrint() {
        window.focus();
        setTimeout(() => {
            window.print();
        }, 500);
    },

    async printInvoice(id) {
        let element = document.getElementById('invoicePrintArea');
        if (!element) {
            this.viewInvoice(id);
            await new Promise(r => setTimeout(r, 200));
            element = document.getElementById('invoicePrintArea');
        }

        if (!element) {
            App.showNotification('Invoice print area not found', 'error');
            return;
        }

        const invoice = InvoiceManager.getInvoice(id);
        if (!invoice) return;

        const filename = `Invoice_${id}.pdf`;
        const opt = {
            margin: [0.3, 0.3, 0.3, 0.3],
            filename: filename,
            image: { type: 'jpeg', quality: 0.90 },
            html2canvas: { scale: 1.0, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        if (typeof html2pdf !== 'undefined') {
            const btn = document.querySelector('#invoicePreviewModal .btn-primary, #voucherPreviewModal .btn-primary');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating PDF...';

            App.showNotification('Generating PDF...', 'info');
            
            try {
                const worker = html2pdf().set(opt).from(element);

                if (window.electronAPI && window.electronAPI.savePdf) {
                    const pdfBase64 = await worker.output('base64');
                    await window.electronAPI.savePdf({
                        blobBase64: pdfBase64,
                        filename: filename,
                        subfolder: 'Invoices'
                    });
                }

                // Open in professional browser viewer
                const blob = await worker.output('blob');
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                
            } catch (e) {
                console.error('PDF Generation Error:', e);
                App.showNotification('Error generating PDF', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        } else {
            window.print();
        }
    },

    /**
     * View Professional Voucher Details
     */
    viewVoucher(id) {
        const voucher = VoucherManager.getVoucher(id);
        if (!voucher) {
            App.showNotification('Voucher not found', 'error');
            return;
        }

        const customer = CustomerManager.getCustomer(voucher.customerId);
        const settings = DataManager.getData('gtes_settings') || {};
        const companyName = settings.companyName || "Gas Tech Engineering Service";
        const companyAddress = settings.registeredAddress || "No.232/233, Nageshwara Road, Athipet, Chennai-58";
        const workAddress = settings.workAddress || "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058";
        const email = settings.email || "gastechengservice@gmail.com, rajmohan67raj@gmail.com";
        const phone = settings.phone || "+91 9600015839, +91 95662 02856";
        const gstin = settings.gstin || "33AFXPR3235A32F";
        const pan = settings.pan || "AFXPR3235A";

        const isReceipt = voucher.type === 'receipt';
        const title = isReceipt ? 'Receipt' : 'Payment';

        const modalHtml = `
            <div class="modal fade" id="voucherPreviewModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content bg-dark border-0 shadow-lg text-white">
                        <div class="modal-header border-0 pb-0">
                            <div>
                                <h5 class="modal-title text-white fw-bold"><i class="bi bi-wallet2 me-2"></i>VOUCHER PREVIEW</h5>
                                <p class="small text-muted mb-0">${voucher.id} | ${voucher.customerName}</p>
                            </div>
                            <div class="ms-auto d-flex gap-2 align-items-center">
                                <button class="btn btn-primary" onclick="DeliveryUI.printVoucher('${voucher.id}')">
                                    <i class="bi bi-download me-1"></i> Download PDF
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-4 bg-dark">
                            <div class="bg-white text-dark p-4 shadow-lg mx-auto" id="voucherPrintArea" style="max-width: 800px; min-height: 600px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                                <!-- Company Header -->
                                <div class="text-center mb-4 pb-3 border-bottom border-dark">
                                    <h3 class="fw-bold text-uppercase mb-1">${companyName}</h3>
                                    <p class="mb-0 small">${companyAddress}</p>
                                    <p class="mb-0 small">
                                        ${settings.email ? `Email: ${settings.email} | ` : ''}
                                        ${settings.phone ? `Phone: ${settings.phone} | ` : ''}
                                        ${settings.gstin ? `GSTIN: ${settings.gstin}` : ''}
                                    </p>
                                </div>

                                <!-- Voucher Info Row -->
                                <div class="row mb-5">
                                    <div class="col-7">
                                        <h6 class="fw-bold border-bottom border-dark pb-1 text-muted small text-uppercase" style="width: fit-content;">${isReceipt ? 'Received From' : 'Paid To'}:</h6>
                                        <h5 class="fw-bold mb-1">${voucher.customerName}</h5>
                                        <p class="mb-0 small text-muted" style="white-space: pre-line;">${customer?.address || voucher.customerAddress || ''}</p>
                                        ${customer?.gstin ? `<p class="mb-0 small"><strong>GSTIN:</strong> ${customer.gstin}</p>` : ''}
                                    </div>
                                    <div class="col-5 text-end">
                                        <h2 class="fw-bold text-uppercase mb-1" style="letter-spacing: 2px;">${title}</h2>
                                        <p class="mb-0 small"><strong>Voucher No:</strong> ${voucher.id}</p>
                                        <p class="mb-0 small"><strong>Date:</strong> ${DataManager.formatDateDisplay(voucher.date)}</p>
                                    </div>
                                </div>

                                <div class="mb-5 p-3 bg-light border border-dark rounded">
                                    <p class="mb-0 fs-5">
                                        ${isReceipt ? 'Received with thanks from' : 'Paid amount to'} 
                                        <strong>${voucher.customerName}</strong> 
                                        the sum of 
                                        <span class="fw-bold fs-4 ms-2">₹${voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </p>
                                </div>

                                <!-- Detail Table -->
                                <table class="table table-bordered border-dark table-sm mb-5 text-dark">
                                    <thead style="background-color: #f8f9fa;" class="text-dark">
                                        <tr class="small text-uppercase fw-bold">
                                            <th style="width: 40%;">Description / Reference</th>
                                            <th style="width: 20%;">Date</th>
                                            <th style="width: 20%;">Mode</th>
                                            <th class="text-end" style="width: 20%;">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td class="py-3">${voucher.remarks || voucher.referenceId || 'General Account Payment'}</td>
                                            <td class="py-3">${DataManager.formatDateDisplay(voucher.date)}</td>
                                            <td class="text-center py-3">${(voucher.paymentMode || voucher.mode || 'Cash').toUpperCase()}</td>
                                            <td class="text-end fw-bold py-3">₹${voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        <tr class="fw-bold">
                                            <td colspan="3" class="text-end text-uppercase small py-2">Total Amount (${title})</td>
                                            <td class="text-end bg-light border-top border-dark border-double py-2">₹${voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div class="row mt-5 pt-5">
                                    <div class="col-4">
                                        <div class="mt-4 pt-2 border-top border-dark text-center small">Receiver's Signature</div>
                                    </div>
                                    <div class="col-4 offset-4 text-center">
                                        <div class="small mb-5">For <strong>${companyName}</strong></div>
                                        <div class="mt-5 pt-2 border-top border-dark small fw-bold">Authorized Signatory</div>
                                    </div>
                                </div>

                                <div class="mt-5 text-center text-muted small border-top pt-3">
                                    This is a computer generated voucher and does not require a physical signature.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('voucherPreviewModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = new bootstrap.Modal(document.getElementById('voucherPreviewModal'));
        modal.show();
    },

    /**
     * Print professional voucher to PDF
     */
    async printVoucher(id) {
        let element = document.getElementById('voucherPrintArea');
        if (!element) {
            this.viewVoucher(id);
            await new Promise(r => setTimeout(r, 200));
            element = document.getElementById('voucherPrintArea');
        }

        if (!element) {
            App.showNotification('Voucher print area not found', 'error');
            return;
        }

        const voucher = VoucherManager.getVoucher(id);
        if (!voucher) return;

        const filename = `${voucher.type === 'receipt' ? 'Receipt' : 'Payment'}_${id}.pdf`;
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        if (typeof html2pdf !== 'undefined') {
            App.showNotification('Preparing PDF Viewer...', 'info');
            const worker = html2pdf().set(opt).from(element);

            if (window.electronAPI && window.electronAPI.savePdf) {
                try {
                    const pdfBase64 = await worker.output('base64');
                    await window.electronAPI.savePdf({
                        blobBase64: pdfBase64,
                        filename: filename,
                        subfolder: 'Vouchers'
                    });
                } catch (e) {
                    console.error('PDF Save Error:', e);
                }
            }

            // Open in professional browser viewer
            worker.output('bloburl').then(url => {
                window.open(url, '_blank');
            });
        } else {
            window.print();
        }
    },

    viewPurchaseDetails(id) {
        const expense = ExpenseManager.getAllExpenses().find(e => e.id === id);
        if (!expense) {
            App.showNotification('Purchase record not found', 'error');
            return;
        }

        const settings = DataManager.getData('gtes_settings') || {};
        const companyName = settings.companyName || "Gas Tech Engineering Service";
        const companyAddress = settings.registeredAddress || "No.232/233, Nageshwara Road, Athipet, Chennai-58";
        const workAddress = settings.workAddress || "236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058";
        const email = settings.email || "gastechengservice@gmail.com, rajmohan67raj@gmail.com";
        const phone = settings.phone || "+91 9600015839, +91 95662 02856";
        const gstin = settings.gstin || "33AFXPR3235A32F";
        const pan = settings.pan || "AFXPR3235A";
        const iec = settings.iec || "AFXPR3235A";

        const modalHtml = `
            <div class="modal fade" id="purchaseViewModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content bg-dark">
                        <div class="modal-header border-0">
                            <h5 class="modal-title text-white">Purchase Bill Preview</h5>
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-outline-info" onclick="DeliveryUI.nativePrint()">
                                    <i class="bi bi-printer"></i> Print
                                </button>
                                <button type="button" class="btn btn-primary" onclick="DeliveryUI.printPurchase('${expense.id}')">
                                    <i class="bi bi-download"></i> Save PDF
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 bg-secondary-subtle overflow-auto" style="max-height: 90vh;">
                            <div id="purchasePrintArea" class="bg-white text-dark p-4 mx-auto my-5 shadow-lg" style="width: 720px; font-size: 9pt; box-sizing: border-box; border: 1px solid #dee2e6; color: #000 !important; background-color: #fff !important;">
                                <!-- Company Header -->
                                <div class="text-center border-bottom pb-3 mb-4" style="color: #000 !important;">
                                    <h2 class="fw-bold mb-1" style="color: #000 !important;">${companyName.toUpperCase()}</h2>
                                    <p class="mb-0 small" style="color: #000 !important;">No.232/233, Nageshwara Road, Athipet, Chennai - 600058</p>
                                    <p class="mb-0 small" style="color: #000 !important;">Work Address: ${workAddress}</p>
                                    <p class="mb-0 small fw-bold" style="color: #000 !important;">GSTIN: ${gstin} | PAN: ${pan} | IEC: ${iec}</p>
                                </div>

                                <!-- Purchase Title -->
                                <h3 class="text-center fw-bold text-uppercase mb-4" style="color: #000 !important;">PURCHASE</h3>

                                <!-- Bill Details -->
                                <div class="row mb-4" style="color: #000 !important;">
                                    <div class="col-7">
                                        <h6 class="text-uppercase text-muted small fw-bold mb-2" style="color: #6c757d !important;">BILL FROM:</h6>
                                        <h5 class="fw-bold mb-1" style="color: #000 !important;">${expense.vendorName || (expense.description ? expense.description.split(':')[0] : 'Unknown Vendor')}</h5>
                                        ${expense.vendorAddress ? `<p class="mb-0 small" style="color: #000 !important;">${expense.vendorAddress}</p>` : ''}
                                        ${expense.supplierInvoiceNo ? `<p class="mb-0 small mt-2" style="color: #000 !important;"><strong>Supplier Invoice No:</strong> ${expense.supplierInvoiceNo}</p>` : ''}
                                        ${expense.vendorGSTIN ? `<p class="mb-0 small" style="color: #000 !important;"><strong>GSTIN:</strong> ${expense.vendorGSTIN}</p>` : ''}
                                    </div>
                                    <div class="col-5 text-end">
                                        <table class="table table-sm table-borderless mb-0 w-auto ms-auto" style="color: #000 !important;">
                                            <tr><td class="text-muted pe-3 py-1" style="color: #6c757d !important;">Purchase No:</td><td class="fw-bold py-1" style="color: #000 !important;">${expense.id}</td></tr>
                                            <tr><td class="text-muted pe-3 py-1" style="color: #6c757d !important;">Date:</td><td class="fw-bold py-1" style="color: #000 !important;">${DataManager.formatDateDisplay(expense.date)}</td></tr>
                                            <tr><td class="text-muted pe-3 py-1" style="color: #6c757d !important;">Status:</td><td class="fw-bold py-1" style="color: #000 !important;"><span class="badge bg-${expense.status === 'Paid' ? 'success' : 'warning'}">${expense.status || 'Pending'}</span></td></tr>
                                            ${expense.supplierInvoiceNo ? `<tr><td class="text-muted pe-3 py-1" style="color: #6c757d !important;">Supplier Invoice No:</td><td class="fw-bold py-1" style="color: #000 !important;">${expense.supplierInvoiceNo}</td></tr>` : ''}
                                        </table>
                                    </div>
                                </div>

                                <!-- Items Table -->
                                <table class="table table-bordered border-dark mb-4 text-dark" style="table-layout: fixed; width: 100%; color: #000 !important; background-color: #fff !important;">
                                    <thead style="background-color: #eee !important;" class="text-dark">
                                        <tr class="text-center align-middle extra-small fw-bold" style="color: #000 !important; background-color: #eee !important; font-size: 8pt !important;">
                                            <th style="width: 4%; color: #000 !important; background-color: #eee !important;">#</th>
                                            <th style="width: 25%; color: #000 !important; background-color: #eee !important;">DESCRIPTION</th>
                                            <th style="width: 9%; color: #000 !important; background-color: #eee !important;">HSN</th>
                                            <th style="width: 7%; color: #000 !important; background-color: #eee !important;">QTY</th>
                                            <th style="width: 7%; color: #000 !important; background-color: #eee !important;">UNIT</th>
                                            <th style="width: 12%; color: #000 !important; background-color: #eee !important;">RATE</th>
                                            <th style="width: 8%; color: #000 !important; background-color: #eee !important;">DISC</th>
                                            <th style="width: 9%; color: #000 !important; background-color: #eee !important;">CGST%</th>
                                            <th style="width: 9%; color: #000 !important; background-color: #eee !important;">SGST%</th>
                                            <th style="width: 10%; color: #000 !important; background-color: #eee !important;">TOTAL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(expense.items && expense.items.length > 0) ? expense.items.map((it, idx) => {
                                            const itGstRate = parseFloat(it.gstRate) || 0;
                                            const cRate = itGstRate / 2;
                                            const sRate = itGstRate / 2;
                                            const cAmt = (it.amount * cRate / 100);
                                            const sAmt = (it.amount * sRate / 100);
                                            
                                            return `
                                            <tr class="align-middle text-dark" style="color: #000 !important; background-color: #fff !important; font-size: 8pt !important;">
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${idx + 1}</td>
                                                <td style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">
                                                    <div class="fw-bold" style="color: #000 !important;">${it.name || it.description}</div>
                                                </td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${it.hsn || '-'}</td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${it.quantity || 1}</td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">nos</td>
                                                <td class="text-end" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${(it.rate || 0).toFixed(2)}</td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">0%</td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${cRate.toFixed(1)}%</td>
                                                <td class="text-center" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${sRate.toFixed(1)}%</td>
                                                <td class="text-end fw-bold" style="color: #000 !important; background-color: #fff !important; border: 1px solid #000 !important; padding: 4px !important;">${(it.amount || 0).toFixed(2)}</td>
                                            </tr>
                                            `;
                                        }).join('') : `
                                            <tr class="align-middle text-dark" style="color: #000 !important; background-color: #fff !important; font-size: 8pt !important;">
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">1</td>
                                                <td style="color: #000 !important; border: 1px solid #000 !important;">
                                                    <div class="fw-bold" style="color: #000 !important;">${expense.description}</div>
                                                </td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">-</td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">1</td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">unit</td>
                                                <td class="text-end" style="color: #000 !important; border: 1px solid #000 !important;">${(expense.amount || 0).toFixed(2)}</td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">0%</td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">0%</td>
                                                <td class="text-center" style="color: #000 !important; border: 1px solid #000 !important;">0%</td>
                                                <td class="text-end fw-bold" style="color: #000 !important; border: 1px solid #000 !important;">${(expense.amount || 0).toFixed(2)}</td>
                                            </tr>
                                        `}
                                    </tbody>
                                    <tfoot>
                                        <tr style="color: #000 !important;">
                                            <td colspan="9" class="text-end border-0 pt-3 fw-bold small" style="color: #000 !important;">Subtotal:</td>
                                            <td class="text-end border-0 pt-3 fw-bold small" style="color: #000 !important;">₹${(expense.subtotal || expense.amount || 0).toFixed(2)}</td>
                                        </tr>
                                        ${(expense.cgst && expense.cgst > 0) ? `
                                        <tr style="color: #000 !important;">
                                            <td colspan="9" class="text-end border-0 py-1 small" style="color: #000 !important;">CGST Amt:</td>
                                            <td class="text-end border-0 py-1 small" style="color: #000 !important;">₹${expense.cgst.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        ${(expense.sgst && expense.sgst > 0) ? `
                                        <tr style="color: #000 !important;">
                                            <td colspan="9" class="text-end border-0 py-1 small" style="color: #000 !important;">SGST Amt:</td>
                                            <td class="text-end border-0 py-1 small" style="color: #000 !important;">₹${expense.sgst.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        ${(expense.igst && expense.igst > 0) ? `
                                        <tr style="color: #000 !important;">
                                            <td colspan="9" class="text-end border-0 py-1 small" style="color: #000 !important;">IGST Amt:</td>
                                            <td class="text-end border-0 py-1 small" style="color: #000 !important;">₹${expense.igst.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        <tr style="color: #000 !important;">
                                            <td colspan="9" class="text-end border-0 py-1 small" style="color: #000 !important;">Total Tax:</td>
                                            <td class="text-end border-0 py-1 small" style="color: #000 !important;">₹${((expense.cgst || 0) + (expense.sgst || 0) + (expense.igst || 0)).toFixed(2)}</td>
                                        </tr>
                                         <tr style="border: 2px solid #000; background-color: #f8f9fa !important; color: #000 !important;">
                                              <td colspan="9" class="text-end text-uppercase py-3 fw-bold" style="color: #000 !important; background-color: #f8f9fa !important;">Total Amount</td>
                                              <td class="text-end py-3 fs-6 fw-bold" style="color: #000 !important; background-color: #f8f9fa !important; padding-right: 15px !important;">₹${(expense.amount || 0).toFixed(2)}</td>
                                         </tr>
                                    </tfoot>
                                </table>

                                <!-- Footer -->
                                <div class="row mt-4">
                                    <div class="col-8">
                                        <p class="small text-muted mb-1">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
                                    </div>
                                    <div class="col-4 text-center mt-auto">
                                        <div class="mb-4 text-muted small">For ${companyName}</div>
                                        <div class="border-bottom border-dark mb-2 mx-auto" style="width: 150px; height: 40px;"></div>
                                        <p class="small fw-bold">Authorized Signatory</p>
                                    </div>
                                </div>

                                <div class="mt-4 text-center text-muted border-top pt-3">
                                    <small>This is a computer generated invoice and does not require a physical signature.</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('purchaseViewModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }

        // Insert modal HTML into DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('purchaseViewModal'));
        modal.show();
    },

    async printPurchase(id) {
        let element = document.getElementById('purchasePrintArea');
        if (!element) {
            this.viewPurchaseDetails(id);
            await new Promise(r => setTimeout(r, 200));
            element = document.getElementById('purchasePrintArea');
        }
    
        if (!element) {
            App.showNotification('Purchase print area not found', 'error');
            return;
        }
    
        const filename = `Purchase_${id}.pdf`;
        const opt = {
            margin: [0.3, 0.3, 0.3, 0.3],
            filename: filename,
            image: { type: 'jpeg', quality: 0.90 },
            html2canvas: { scale: 1.0, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
    
        if (typeof html2pdf !== 'undefined') {
            const btn = document.querySelector('#purchaseViewModal .btn-primary');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating PDF...';
    
            App.showNotification('Generating PDF...', 'info');
            
            try {
                const worker = html2pdf().set(opt).from(element);
    
                if (window.electronAPI && window.electronAPI.savePdf) {
                    const pdfBase64 = await worker.output('base64');
                    await window.electronAPI.savePdf({
                        blobBase64: pdfBase64,
                        filename: filename,
                        subfolder: 'Purchases'
                    });
                }
    
                // Open in professional browser viewer
                const blob = await worker.output('blob');
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                
            } catch (e) {
                console.error('PDF Generation Error:', e);
                App.showNotification('Error generating PDF', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        } else {
            window.print();
        }
    },

    recordNewPurchase() {
        const modalHtml = `
            <div class="modal fade" id="purchaseEntryModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content glass-panel text-white">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title text-success"><i class="bi bi-bag-plus me-2"></i>Record New Purchase (Inward)</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="purchaseEntryForm">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small text-muted">Purchase Date</label>
                                        <input type="date" class="form-control" id="purchaseDate" value="${new Date().toISOString().split('T')[0]}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small text-muted">Vendor Name</label>
                                        <input type="text" class="form-control" id="purchaseVendor" placeholder="e.g. ABC Trading Co" required>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small text-muted">Description / Bill Reference</label>
                                    <input type="text" class="form-control" id="purchaseDesc" placeholder="e.g. Material Purchase Bill #123" required>
                                </div>
                                <div class="table-responsive mb-3">
                                    <table class="table table-dark table-sm table-bordered border-secondary" id="purchaseItemsTable">
                                        <thead>
                                            <tr class="small">
                                                <th style="width: 45%">Item Description</th>
                                                <th>Qty</th>
                                                <th>Rate</th>
                                                <th>GST%</th>
                                                <th>Total</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody id="purchaseItemsBody">
                                            <tr>
                                                <td><input type="text" class="form-control form-control-sm" placeholder="Item name" required></td>
                                                <td><input type="number" class="form-control form-control-sm item-qty" value="1" min="0" step="any" required></td>
                                                <td><input type="number" class="form-control form-control-sm item-rate" value="0" min="0" step="any" required></td>
                                                <td>
                                                    <select class="form-select form-select-sm item-gst">
                                                        <option value="0">0%</option>
                                                        <option value="5">5%</option>
                                                        <option value="12">12%</option>
                                                        <option value="18" selected>18%</option>
                                                        <option value="28">28%</option>
                                                    </select>
                                                </td>
                                                <td class="text-end fw-bold pt-2 item-total">₹0.00</td>
                                                <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="this.closest('tr').remove(); DeliveryUI.recalcPurchaseTotal();"><i class="bi bi-trash"></i></button></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <button type="button" class="btn btn-sm btn-outline-success" onclick="DeliveryUI.addPurchaseItemRow()">
                                        <i class="bi bi-plus"></i> Add Item
                                    </button>
                                </div>
                                <div class="card bg-dark border-secondary">
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between mb-1 small">
                                            <span>Subtotal:</span>
                                            <span id="purchaseSubtotal">₹0.00</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-1 small">
                                            <span>GST Total:</span>
                                            <span id="purchaseGstTotal">₹0.00</span>
                                        </div>
                                        <hr class="border-secondary my-2">
                                        <div class="d-flex justify-content-between h5 mb-0 text-success">
                                            <span>Grand Total:</span>
                                            <span id="purchaseGrandTotal">₹0.00</span>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-success px-4" onclick="DeliveryUI.saveNewPurchase()">
                                <i class="bi bi-check-circle me-1"></i> Save Purchase Record
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('purchaseEntryModal');
        if (oldModal) {
            const inst = bootstrap.Modal.getInstance(oldModal);
            if (inst) inst.hide();
            oldModal.remove();
        }
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('purchaseEntryModal'));

        // Add event listeners for total calculation
        const form = document.getElementById('purchaseEntryForm');
        form.addEventListener('input', () => this.recalcPurchaseTotal());

        modal.show();
    },

    addPurchaseItemRow() {
        const body = document.getElementById('purchaseItemsBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="form-control form-control-sm" placeholder="Item name" required></td>
            <td><input type="number" class="form-control form-control-sm item-qty" value="1" min="0" step="any" required></td>
            <td><input type="number" class="form-control form-control-sm item-rate" value="0" min="0" step="any" required></td>
            <td>
                <select class="form-select form-select-sm item-gst">
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18" selected>18%</option>
                    <option value="28">28%</option>
                </select>
            </td>
            <td class="text-end fw-bold pt-2 item-total">₹0.00</td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="this.closest('tr').remove(); DeliveryUI.recalcPurchaseTotal();"><i class="bi bi-trash"></i></button></td>
        `;
        body.appendChild(row);
        this.recalcPurchaseTotal();
    },

    recalcPurchaseTotal() {
        const rows = document.querySelectorAll('#purchaseItemsBody tr');
        let subtotal = 0;
        let gstTotal = 0;

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
            const rate = parseFloat(row.querySelector('.item-rate').value) || 0;
            const gstRate = parseFloat(row.querySelector('.item-gst').value) || 0;

            const rowSubtotal = qty * rate;
            const rowGst = (rowSubtotal * gstRate) / 100;
            const rowTotal = rowSubtotal + rowGst;

            row.querySelector('.item-total').textContent = `₹${rowTotal.toFixed(2)}`;
            subtotal += rowSubtotal;
            gstTotal += rowGst;
        });

        document.getElementById('purchaseSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
        document.getElementById('purchaseGstTotal').textContent = `₹${gstTotal.toFixed(2)}`;
        document.getElementById('purchaseGrandTotal').textContent = `₹${(subtotal + gstTotal).toFixed(2)}`;
    },

    async saveNewPurchase() {
        const vendor = document.getElementById('purchaseVendor').value;
        const date = document.getElementById('purchaseDate').value;
        const desc = document.getElementById('purchaseDesc').value;

        if (!vendor || !date) {
            App.showNotification('Please fill vendor name and date', 'error');
            return;
        }

        const rows = document.querySelectorAll('#purchaseItemsBody tr');
        const items = [];
        let totalSubtotal = 0;
        let totalCgst = 0;
        let totalSgst = 0;

        rows.forEach(row => {
            const description = row.querySelector('input[type="text"]').value;
            const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
            const rate = parseFloat(row.querySelector('.item-rate').value) || 0;
            const gst = parseFloat(row.querySelector('.item-gst').value) || 0;

            if (description) {
                const sub = qty * rate;
                const gstAmt = (sub * gst) / 100;
                totalSubtotal += sub;
                // Simple split for CGST/SGST (assuming local purchase)
                totalCgst += gstAmt / 2;
                totalSgst += gstAmt / 2;

                items.push({
                    description,
                    quantity: qty,
                    rate,
                    taxPercent: gst,
                    amount: sub + gstAmt
                });
            }
        });

        if (items.length === 0) {
            App.showNotification('Please add at least one item', 'error');
            return;
        }

        const purchaseData = {
            date,
            vendorName: vendor,
            description: `${vendor}: ${desc}`,
            category: 'Purchase Material',
            amount: totalSubtotal + totalCgst + totalSgst,
            subtotal: totalSubtotal,
            cgst: totalCgst,
            sgst: totalSgst,
            igst: 0,
            items,
            source: 'local'
        };

        try {
            await ExpenseManager.saveExpense(purchaseData);
            App.showNotification('Purchase record saved successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('purchaseEntryModal')).hide();
            this.loadPurchases();
        } catch (err) {
            console.error(err);
            App.showNotification('Error saving purchase: ' + err.message, 'error');
        }
    },

    // --- Vouchers Section ---
    async loadVouchers() {
        const container = document.getElementById('vouchersContainer');
        if (!container) return;

        const vouchers = VoucherManager.getAllVouchers();
        const customers = CustomerManager.getAllCustomers();

        container.innerHTML = `
            <div class="card glass-panel border-0">
                <div class="card-header bg-transparent border-secondary d-flex justify-content-between align-items-center p-3">
                    <h5 class="mb-0 text-white"><i class="bi bi-wallet2 me-2 text-success"></i>Payment Vouchers</h5>
                    <button class="btn btn-primary btn-sm" onclick="DeliveryUI.showVoucherForm()">
                        <i class="bi bi-plus-lg me-1"></i> New Voucher
                    </button>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-dark table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Voucher #</th>
                                    <th>Date</th>
                                    <th>Customer</th>
                                    <th>Amount</th>
                                    <th>Mode</th>
                                    <th>Reference</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vouchers.length === 0 ? '<tr><td colspan="7" class="text-center p-4 text-muted">No vouchers found</td></tr>' : ''}
                                ${vouchers.reverse().map(v => `
                                    <tr>
                                        <td>${v.id}</td>
                                        <td>${v.date}</td>
                                        <td>${v.customerName}</td>
                                        <td class="text-success fw-bold">₹${v.amount.toLocaleString()}</td>
                                        <td><span class="badge bg-secondary">${(v.paymentMode || 'Unknown').toUpperCase()}</span></td>
                                        <td>
                                            <small class="text-muted">${v.referenceType !== 'general' ? `${v.referenceType}: ${v.referenceId}` : 'General'}</small>
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-outline-light me-1" onclick="DeliveryUI.viewVoucher('${v.id}')" title="View">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-danger" onclick="DeliveryUI.deleteVoucher('${v.id}')">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="mt-4">
                <h5 class="text-white mb-3">Outstanding Balances</h5>
                <div class="row g-3">
                    ${await Promise.all(customers.map(async c => {
            const balance = await VoucherManager.getOutstandingBalance(c.id);
            if (balance <= 0) return '';
            return `
                        <div class="col-md-4">
                            <div class="card glass-panel border-0 h-100">
                                <div class="card-body">
                                    <h6 class="text-muted small text-uppercase mb-2">${c.name}</h6>
                                    <h4 class="text-danger mb-0">₹${balance.toLocaleString()}</h4>
                                    <p class="small text-muted mb-0 mt-2">Outstanding Balance</p>
                                </div>
                            </div>
                        </div>`;
        })).then(results => results.join(''))}
                </div>
            </div>
        `;
    },

    showVoucherForm(initialCustomerId = null, initialCustomerName = '') {
        const customers = CustomerManager.getAllCustomers();
        const invoices = InvoiceManager.getAllInvoices();
        const challans = DeliveryManager.getAllChallans();

        // Build pending items list (pending invoices/challans)
        const pendingItems = [
            ...invoices.filter(i => i.status === 'pending').map(i => ({
                id: i.id,
                type: 'Invoice',
                label: `${i.id} - ${i.customerName} (₹${i.total.toFixed(2)})`,
                amount: i.total,
                customerId: i.customerId
            })),
            ...challans.filter(c => !c.invoiceId).map(c => ({
                id: c.id,
                type: 'Challan',
                label: `${c.id} - ${CustomerManager.getCustomer(c.customerId)?.name || 'Unknown'} (₹${c.total?.toFixed(2) || '0.00'})`,
                amount: c.total || 0,
                customerId: c.customerId
            }))
        ];

        const modalHtml = `
            <div class="modal fade" id="voucherModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content bg-dark text-white">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title">New Payment Voucher</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="voucherForm">
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Customer *</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-dark border-secondary"><i class="bi bi-search"></i></span>
                                            <input type="text" class="form-control bg-dark text-white border-secondary" 
                                                id="v_customerSearch" placeholder="Search customer..." 
                                                list="voucherCustomerList" autocomplete="off" required>
                                            <input type="hidden" id="v_customerId">
                                        </div>
                                        <datalist id="voucherCustomerList">
                                            ${customers.map(c => `<option value="${c.name}" data-id="${c.id}">${c.phone || ''}</option>`).join('')}
                                        </datalist>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Date *</label>
                                        <input type="date" class="form-control bg-dark text-white border-secondary" id="v_date" value="${new Date().toISOString().split('T')[0]}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Payment Mode</label>
                                        <select class="form-select bg-dark text-white border-secondary" id="v_paymentMode">
                                            <option value="cash">Cash</option>
                                            <option value="bank">Bank Transfer</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="upi">UPI</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">Select Pending Invoice/Challan (Optional)</label>
                                    <select class="form-select bg-dark text-white border-secondary" id="v_pendingItem">
                                        <option value="">-- Select to auto-fill amount --</option>
                                    </select>
                                    <small class="text-muted">Selecting a pending item will auto-fill the amount below.</small>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">Invoice/Challan Amount</label>
                                        <input type="number" class="form-control bg-dark text-white border-secondary" id="v_originalAmount" readonly placeholder="0.00">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Tax Deducted (TDS)</label>
                                        <input type="number" class="form-control bg-dark text-white border-secondary" id="v_taxDeducted" value="0" min="0" step="0.01">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Discount</label>
                                        <input type="number" class="form-control bg-dark text-white border-secondary" id="v_discount" value="0" min="0" step="0.01">
                                    </div>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Amount Paid *</label>
                                        <input type="number" class="form-control bg-dark text-white border-secondary fs-5 fw-bold" id="v_amount" required placeholder="Enter amount">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Reference ID (Optional)</label>
                                        <input type="text" class="form-control bg-dark text-white border-secondary" id="v_referenceId" placeholder="Cheque/UTR number">
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">Remarks</label>
                                    <textarea class="form-control bg-dark text-white border-secondary" id="v_remarks" rows="2" placeholder="Optional notes..."></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-success" onclick="DeliveryUI.saveVoucher()">Save Payment</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove old modal if exists
        const oldModal = document.getElementById('voucherModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Setup customer search
        const customerSearch = document.getElementById('v_customerSearch');
        customerSearch.addEventListener('input', () => {
            const value = customerSearch.value.trim();
            const found = customers.find(c => c.name === value);
            if (found) {
                document.getElementById('v_customerId').value = found.id;
                // Update pending items dropdown based on selected customer
                const pendingSelect = document.getElementById('v_pendingItem');
                const customerPending = pendingItems.filter(p => p.customerId === found.id);
                pendingSelect.innerHTML = '<option value="">-- Select to auto-fill amount --</option>' +
                    customerPending.map(p => `<option value="${p.id}" data-amount="${p.amount}" data-type="${p.type}">${p.label}</option>`).join('');
            }
        });

        // Setup pending item selection
        document.getElementById('v_pendingItem').addEventListener('change', (e) => {
            const selected = e.target.selectedOptions[0];
            if (selected && selected.value) {
                const amount = parseFloat(selected.dataset.amount) || 0;
                document.getElementById('v_originalAmount').value = amount.toFixed(2);
                document.getElementById('v_amount').value = amount.toFixed(2);
                document.getElementById('v_referenceId').value = selected.value;
            } else {
                document.getElementById('v_originalAmount').value = '';
            }
        });

        // Recalculate amount paid when tax/discount changes
        ['v_taxDeducted', 'v_discount'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                const original = parseFloat(document.getElementById('v_originalAmount').value) || 0;
                const tax = parseFloat(document.getElementById('v_taxDeducted').value) || 0;
                const discount = parseFloat(document.getElementById('v_discount').value) || 0;
                document.getElementById('v_amount').value = (original - tax - discount).toFixed(2);
            });
        });

        // Pre-fill if provided (e.g. from Ledger)
        if (initialCustomerId) {
            customerSearch.value = initialCustomerName;
            document.getElementById('v_customerId').value = initialCustomerId;
            customerSearch.dispatchEvent(new Event('input'));
        }

        const modal = new bootstrap.Modal(document.getElementById('voucherModal'));
        modal.show();
    },

    async saveVoucher() {
        const form = document.getElementById('voucherForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const customerId = document.getElementById('v_customerId').value;
        if (!customerId) {
            App.showNotification('Please select a customer from the list', 'error');
            return;
        }
        const customer = CustomerManager.getCustomer(customerId);

        const voucherData = {
            date: document.getElementById('v_date').value,
            customerId: customerId,
            customerName: customer ? customer.name : document.getElementById('v_customerSearch').value,
            amount: parseFloat(document.getElementById('v_amount').value) || 0,
            originalAmount: parseFloat(document.getElementById('v_originalAmount').value) || 0,
            taxDeducted: parseFloat(document.getElementById('v_taxDeducted').value) || 0,
            discount: parseFloat(document.getElementById('v_discount').value) || 0,
            paymentMode: document.getElementById('v_paymentMode').value,
            referenceId: document.getElementById('v_referenceId').value,
            remarks: document.getElementById('v_remarks').value
        };

        try {
            if (this.editingVoucherId) {
                // Update existing voucher
                const vouchers = DataManager.getData('vouchers') || [];
                const index = vouchers.findIndex(v => v.id === this.editingVoucherId);
                if (index !== -1) {
                    vouchers[index] = { ...vouchers[index], ...voucherData, updatedAt: new Date().toISOString() };
                    await DataManager.saveData('vouchers', vouchers);
                    App.showNotification('Voucher updated successfully!', 'success');
                }
                this.editingVoucherId = null;
            } else {
                // Create new voucher
                await VoucherManager.createVoucher(voucherData);

                // Update invoice status to 'paid' if this voucher references an invoice
                const refId = voucherData.referenceId;
                if (refId && refId.startsWith('INV-')) {
                    const invoice = InvoiceManager.getInvoice(refId);
                    if (invoice) {
                        await InvoiceManager.updateInvoice(refId, {
                            status: 'paid',
                            paymentDate: voucherData.date,
                            paymentMode: voucherData.paymentMode
                        });
                        App.showNotification(`Invoice ${refId} marked as PAID!`, 'success');
                    }
                }
                App.showNotification('Payment voucher saved!', 'success');
            }

            bootstrap.Modal.getInstance(document.getElementById('voucherModal')).hide();
            this.loadVouchers();
            this.loadHistory();
        } catch (error) {
            console.error(error);
            App.showNotification(error.message, 'error');
        }
    },

    async deleteVoucher(id) {
        if (!confirm('Are you sure you want to delete this voucher?')) return;
        try {
            await VoucherManager.deleteVoucher(id);
            App.showNotification('Voucher deleted', 'success');
            this.loadVouchers();
        } catch (error) {
            console.error(error);
            App.showNotification(error.message, 'error');
        }
    },

    // Edit Voucher
    editVoucher(voucherId) {
        const vouchers = DataManager.getData('vouchers') || [];
        const voucher = vouchers.find(v => v.id === voucherId);
        if (!voucher) {
            App.showNotification('Voucher not found', 'error');
            return;
        }

        // Open the voucher form first
        this.showVoucherForm();

        // Wait for modal to render, then populate fields
        setTimeout(() => {
            document.getElementById('v_customerSearch').value = voucher.customerName || '';
            document.getElementById('v_customerId').value = voucher.customerId || '';
            document.getElementById('v_date').value = voucher.date || '';
            document.getElementById('v_amount').value = voucher.amount || '';
            document.getElementById('v_originalAmount').value = voucher.originalAmount || '';
            document.getElementById('v_taxDeducted').value = voucher.taxDeducted || 0;
            document.getElementById('v_discount').value = voucher.discount || 0;
            document.getElementById('v_paymentMode').value = voucher.paymentMode || 'cash';
            document.getElementById('v_referenceId').value = voucher.referenceId || '';
            document.getElementById('v_remarks').value = voucher.remarks || '';

            // Store editing voucher ID for update
            this.editingVoucherId = voucherId;
            document.querySelector('#voucherModal .modal-title').textContent = 'Edit Payment Voucher';
        }, 200);
    },

    // Edit Challan - opens challan in editable form
    editChallan(challanId) {
        const challan = DeliveryManager.getChallan(challanId);
        if (!challan) {
            App.showNotification('Challan not found', 'error');
            return;
        }

        // Show create form section
        this.showSection('create');
        this.currentEditingChallan = challanId;

        // Populate form with existing data
        setTimeout(() => {
            document.getElementById('challanType').value = challan.type;
            document.getElementById('challanNumber').value = challan.id;
            document.getElementById('challanDate').value = challan.date;
            document.getElementById('referenceNumber').value = challan.referenceNumber || '';
            document.getElementById('customerSearch').value = challan.customerName || '';
            document.getElementById('customerId').value = challan.customerId;

            // Trigger type change to show/hide service fields
            this.toggleServiceFields();

            // Populate service fields if applicable
            if (challan.type === 'service') {
                document.getElementById('serviceLocation').value = challan.serviceLocation || '';
                document.getElementById('technicianId').value = challan.technicianId || '';
                document.getElementById('complaint').value = challan.complaint || '';
                document.getElementById('faultReported').value = challan.faultReported || '';
                document.getElementById('observations').value = challan.observations || '';
                document.getElementById('workDone').value = challan.workDone || '';
            }

            // Populate items
            const tbody = document.getElementById('itemsTableBody');
            if (tbody) tbody.innerHTML = '';
            (challan.items || []).forEach(item => this.addItemRow(item));

            // Set GST values
            document.getElementById('gstMode').checked = challan.gst && (challan.gst.cgst > 0 || challan.gst.sgst > 0);
            this.toggleGSTFields();
            this.calculateTotals();

            App.showNotification('Editing Challan: ' + challanId, 'info');
        }, 200);
    },

    // Edit Invoice - opens invoice in editable form  
    editInvoice(invoiceId) {
        const invoice = InvoiceManager.getInvoice(invoiceId);
        if (!invoice) {
            App.showNotification('Invoice not found', 'error');
            return;
        }

        // Show invoice form
        this.showInvoiceForm(invoice.type || 'with-bill');
        this.editingInvoiceId = invoiceId;

        setTimeout(() => {
            const elType = document.getElementById('invType');
            const elNumber = document.getElementById('invNumber');
            const elDate = document.getElementById('invDate');
            const elSearch = document.getElementById('invCustomerSearch');
            const elCust = document.getElementById('invCustomer');

            if (elType) elType.value = invoice.type || 'with-bill';
            if (elNumber) elNumber.value = invoice.id;
            if (elDate) elDate.value = invoice.date;
            if (elSearch) elSearch.value = invoice.customerName || '';
            if (elCust) elCust.value = invoice.customerId;

            // Populate items
            const tbody = document.getElementById('invItemsBody');
            const emptyRow = document.getElementById('invEmptyRow');
            if (emptyRow) emptyRow.remove();

            (invoice.items || []).forEach(item => this.addInvoiceItemRow(item));

            this.calculateInvoiceTotals();
            document.querySelector('#deliveryInvoicesSection h4')?.remove();
            App.showNotification('Editing Invoice: ' + invoiceId, 'info');
        }, 200);
    },

    // Edit Job Card
    editJobCard(jobCardId) {
        const jobCard = JobCardManager.getJobCard(jobCardId);
        if (!jobCard) {
            App.showNotification('Job Card not found', 'error');
            return;
        }

        this.showJobCardForm();
        this.editingJobCardId = jobCardId;

        setTimeout(() => {
            document.getElementById('jcNumber').value = jobCard.id;
            document.getElementById('jcCustomerSearch').value = jobCard.customerName || '';
            document.getElementById('jcCustomer').value = jobCard.customerId;
            document.getElementById('jcCustomerRef').value = jobCard.customerRef || '';
            document.getElementById('jcEquipment').value = jobCard.equipment || '';
            document.getElementById('jcModel').value = jobCard.model || '';
            document.getElementById('jcSerialNo').value = jobCard.serialNo || '';
            document.getElementById('jcComplaint').value = jobCard.complaint || '';
            document.getElementById('jcAccessories').value = jobCard.accessories || '';
            document.getElementById('jcRemarks').value = jobCard.remarks || '';

            App.showNotification('Editing Job Card: ' + jobCardId, 'info');
        }, 200);
    },


    // Add new category to datalist
    addNewCategory() {
        const newCategory = prompt('Enter new category name:');
        if (newCategory && newCategory.trim()) {
            const datalist = document.getElementById('categoryList');
            const option = document.createElement('option');
            option.value = newCategory.trim();
            datalist.appendChild(option);
            document.getElementById('materialCategory').value = newCategory.trim();
            App.showNotification(`Category "${newCategory}" added!`, 'success');
        }
    },

    // Add new brand to datalist
    addNewBrand() {
        const newBrand = prompt('Enter new brand name:');
        if (newBrand && newBrand.trim()) {
            const datalist = document.getElementById('brandList');
            const option = document.createElement('option');
            option.value = newBrand.trim();
            datalist.appendChild(option);
            document.getElementById('materialBrand').value = newBrand.trim();
            App.showNotification(`Brand "${newBrand}" added!`, 'success');
        }
    },

    loadPurchases() {
        const container = document.getElementById('purchasesContainer');
        if (!container) return;

        const allExpenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : [];
        const purchases = allExpenses.filter(e => (e.category || '').toLowerCase().includes('purchase'));

        container.innerHTML = `
            <div class="card glass-panel border-0 mb-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <h4 class="mb-0 text-success"><i class="bi bi-bag-check me-2"></i>Purchase Records (Inward)</h4>
                        <button class="btn btn-success" onclick="DeliveryUI.recordNewPurchase()">
                            <i class="bi bi-plus-circle me-1"></i> Record New Purchase
                        </button>
                    </div>
                </div>
            </div>

            <div class="table-responsive">
                <table class="table table-dark table-hover table-sm border-secondary align-middle">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Vendor / Description</th>
                            <th>Total Amount</th>
                            <th>Items</th>
                            <th>Source</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${purchases.length === 0 ? '<tr><td colspan="6" class="text-center p-5 text-muted">No purchase records found. Imports from BookKeeper will appear here.</td></tr>' :
                purchases.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => {
                    const vendor = p.description.split(':')[0] || 'Unknown Vendor';
                    return `
                                <tr>
                                    <td>${DataManager.formatDateDisplay(p.date)}</td>
                                    <td>
                                        <div class="fw-bold text-success">${vendor}</div>
                                        <small class="text-muted">${p.description}</small>
                                    </td>
                                    <td class="fw-bold">₹${(p.amount || 0).toFixed(2)}</td>
                                    <td>
                                        ${p.items && p.items.length > 0 ? `<span class="badge bg-secondary">${p.items.length} items</span>` : '<span class="text-muted small">No item detail</span>'}
                                    </td>
                                    <td><span class="badge bg-dark border border-secondary">${p.source === 'bookkeeper' ? 'BK Import' : 'Local'}</span></td>
                                    <td class="text-end">
                                        <button class="btn btn-sm btn-outline-info" onclick="DeliveryUI.viewPurchaseDetails('${p.id}')">
                                            <i class="bi bi-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" onclick="DeliveryUI.deleteGenericRecord('expense', '${p.id}')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

};

// Initialize when delivery view is shown
document.addEventListener('DOMContentLoaded', () => {
    // Wait for App to show delivery view
    const observer = new MutationObserver(() => {
        const deliveryView = document.getElementById('deliveryView');
        if (deliveryView && !deliveryView.classList.contains('d-none')) {
            DeliveryUI.init();
            observer.disconnect();
        }
    });

    const deliveryView = document.getElementById('deliveryView');
    if (deliveryView) {
        observer.observe(deliveryView, { attributes: true, attributeFilter: ['class'] });
    }
});
