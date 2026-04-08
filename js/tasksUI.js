/**
 * Tasks Management UI Module
 */

const TasksUI = {
    async _getTaskVisibilityContext() {
        const currentUser = await UserManager.getCurrentUser();
        const isAdmin = !!(currentUser && currentUser.role === UserManager.ROLES.ADMIN);
        return { currentUser, isAdmin };
    },

    _filterVisibleTasks(tasks, ctx) {
        const list = Array.isArray(tasks) ? tasks : [];
        if (ctx?.isAdmin) return list;
        const uname = String(ctx?.currentUser?.username || '').trim().toLowerCase();
        if (!uname) return [];
        return list.filter((t) => String(t?.assignedTo || '').trim().toLowerCase() === uname);
    },

    _getActiveAssignableUsers(users, currentUser, preserveUsername = '') {
        const all = Array.isArray(users) ? users : [];
        const active = all.filter((u) => u && u.isActive !== false);
        const preserve = String(preserveUsername || '').trim();
        if (preserve && !active.some((u) => u.username === preserve)) {
            const hit = all.find((u) => u && u.username === preserve);
            if (hit) active.push(hit);
        }
        // Stable ordering: active users first, "me" appears with suffix in UI.
        return active.sort((a, b) => String(a.fullName || a.username).localeCompare(String(b.fullName || b.username)));
    },

    async init() {
        console.log('TasksUI initialized');
    },

    currentFilter: 'pending', // 'pending', 'completed', 'all'

    async load() {
        this.renderTasks();
    },

    /**
     * Main Tasks View
     */
    async renderTasks() {
        const container = document.getElementById('tasksView');
        if (!container) return;

        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const ctx = await this._getTaskVisibilityContext();
        const visibleTasks = this._filterVisibleTasks(tasks, ctx);
        
        // Filter tasks based on current selection
        let filteredTasks = [...visibleTasks];
        if (this.currentFilter === 'pending') {
            filteredTasks = filteredTasks.filter(t => t.status === 'open');
        } else if (this.currentFilter === 'completed') {
            filteredTasks = filteredTasks.filter(t => t.status === 'completed');
        }

        // Sort tasks: Open first, then by date desc
        const sortedTasks = filteredTasks.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'open' ? -1 : 1;
            }
            return new Date(b.followupDate + 'T' + (b.followupTime || '00:00')) - new Date(a.followupDate + 'T' + (a.followupTime || '00:00'));
        });

        const now = new Date();

        container.innerHTML = `
            <div class="container-fluid py-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 class="mb-0 fw-bold text-white"><i class="bi bi-card-checklist text-warning me-2"></i> Task Management</h2>
                        <p class="text-white-50 mb-0">Track follow-ups, schedules, and assignments</p>
                    </div>
                    <div class="d-flex gap-2">
                        <div class="btn-group btn-group-sm me-2" role="group">
                            <button class="btn ${this.currentFilter === 'pending' ? 'btn-warning' : 'btn-outline-warning'}" onclick="TasksUI.setFilter('pending')">Pending</button>
                            <button class="btn ${this.currentFilter === 'completed' ? 'btn-warning' : 'btn-outline-warning'}" onclick="TasksUI.setFilter('completed')">Completed</button>
                            <button class="btn ${this.currentFilter === 'all' ? 'btn-warning' : 'btn-outline-warning'}" onclick="TasksUI.setFilter('all')">All</button>
                        </div>
                        <button class="btn btn-warning fw-bold shadow-sm" onclick="TasksUI.showCreateModal()">
                            <i class="bi bi-plus-lg me-1"></i> New Task
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                            <i class="bi bi-grid-fill"></i>
                        </button>
                    </div>
                </div>

                <div class="card glass-panel border-secondary overflow-hidden shadow">
                    <div class="table-responsive">
                        <table class="table table-dark table-hover mb-0 align-middle">
                            <thead class="bg-dark text-white-50 small uppercase tracking-wider">
                                <tr>
                                    <th class="ps-4" style="width: 60px;">Status</th>
                                    <th>Task Description</th>
                                    <th>Related Party</th>
                                    <th>Assigned To</th>
                                    <th>Due Date & Time</th>
                                    <th class="text-end pe-4">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedTasks.length === 0 ? `
                                    <tr>
                                        <td colspan="6" class="p-5 text-center text-muted">
                                            <i class="bi bi-inbox fs-1 d-block mb-3 opacity-25"></i>
                                            All caught up! No pending tasks.
                                        </td>
                                    </tr>
                                ` : sortedTasks.map(task => {
                                    const isOverdue = this.isOverdue(task);
                                    const isToday = task.followupDate === now.toISOString().split('T')[0];
                                    
                                    return `
                                    <tr class="${task.status === 'completed' ? 'opacity-50' : ''} cursor-pointer" onclick="if(event.target.type !== 'checkbox' && !event.target.closest('button')) TasksUI.viewTaskDetail('${task.id}')">
                                        <td class="ps-4">
                                            <div class="form-check">
                                                <input class="form-check-input custom-checkbox" type="checkbox" ${task.status === 'completed' ? 'checked' : ''} 
                                                    onclick="event.stopPropagation()" onchange="TasksUI.toggleTaskStatus('${task.id}')">
                                            </div>
                                        </td>
                                        <td>
                                            <div class="${task.status === 'completed' ? 'text-decoration-line-through text-muted' : 'fw-bold'} text-truncate" style="max-width: 300px;">
                                                ${task.narration}
                                            </div>
                                            <div class="d-flex gap-2 mt-1">
                                                <span class="badge bg-secondary bg-opacity-25 text-white-50 fw-normal" style="font-size: 0.65rem;">
                                                    ${task.type === 'payment_followup' ? 'Payment Follow-up' : 'Normal Task'}
                                                </span>
                                                <span class="text-white-50" style="font-size: 0.65rem;">${this.getTimeLabel(task)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="text-white">${task.partyName || '—'}</div>
                                            <div class="small text-white-50">${task.partyId || ''}</div>
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="avatar-sm bg-info bg-opacity-25 text-info rounded-circle me-2 d-flex align-items-center justify-content-center" style="width:24px; height:24px; font-size:10px;">
                                                    ${(task.assignedToName || task.assignedTo || '?')[0].toUpperCase()}
                                                </div>
                                                <span class="small">${task.assignedToName || task.assignedTo}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="${isOverdue ? 'text-danger fw-bold' : (isToday ? 'text-warning fw-bold' : 'text-white')}">
                                                <i class="bi bi-clock me-1"></i> ${this.formatDateTime(task.followupDate, task.followupTime)}
                                            </div>
                                            ${isOverdue ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" style="font-size:0.6rem;">OVERDUE</span>' : ''}
                                            ${isToday && !isOverdue ? '<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25" style="font-size:0.6rem;">TODAY</span>' : ''}
                                        </td>
                                        <td class="text-end pe-4">
                                            <button class="btn btn-icon btn-sm btn-outline-light border-0" onclick="TasksUI.viewTaskDetail('${task.id}')">
                                                <i class="bi bi-chevron-right"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `}).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    setFilter(filter) {
        this.currentFilter = filter;
        this.renderTasks();
    },

    addHistory(task, action, details = '') {
        if (!task.history) task.history = [];
        task.history.push({
            time: new Date().toISOString(),
            action: action,
            details: details,
            user: UserManager.currentUser?.username || 'admin'
        });
    },

    /**
     * Create Task Modal
     */
    async showCreateModal(defaults = {}) {
        const users = await UserManager.getUsers();
        const currentUser = await UserManager.getCurrentUser();
        const assignableUsers = this._getActiveAssignableUsers(users, currentUser, defaults.assignedTo || '');
        
        // Create modal element if it doesn't exist
        let modalEl = document.getElementById('taskCreateModal');
        if (modalEl) { bootstrap.Modal.getInstance(modalEl)?.dispose(); modalEl.remove(); }
        
        modalEl = document.createElement('div');
        modalEl.id = 'taskCreateModal';
        modalEl.className = 'modal fade';
        modalEl.setAttribute('tabindex', '-1');
        document.body.appendChild(modalEl);

        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content glass-panel border-secondary text-white shadow-lg">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title fw-bold"><i class="bi bi-plus-circle text-warning me-2"></i>Create New Task</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-4">
                        <form id="taskCreateForm">
                            <input type="hidden" id="taskBulkPartyIds" value="${(defaults.bulkPartyIds || []).join(',')}">
                            <div class="mb-3">
                                <label class="form-label text-white-50 small uppercase tracking-wider fw-bold">Task Type</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="taskTypeOpt" id="taskTypeNormal" value="normal" ${defaults.type !== 'payment_followup' ? 'checked' : ''} onchange="document.getElementById('taskType').value=this.value; TasksUI.handleCreateModalModeChange()">
                                    <label class="btn btn-outline-info btn-sm fw-bold" for="taskTypeNormal">
                                        <i class="bi bi-card-text me-1"></i> Normal Task
                                    </label>
                                    
                                    <input type="radio" class="btn-check" name="taskTypeOpt" id="taskTypePayment" value="payment_followup" ${defaults.type === 'payment_followup' ? 'checked' : ''} onchange="document.getElementById('taskType').value=this.value; TasksUI.handleCreateModalModeChange()">
                                    <label class="btn btn-outline-info btn-sm fw-bold" for="taskTypePayment">
                                        <i class="bi bi-cash-stack me-1"></i> Payment Follow-up
                                    </label>
                                </div>
                                <input type="hidden" id="taskType" value="${defaults.type || 'normal'}">
                            </div>

                            <div class="mb-3" id="taskCreatePartyRow">
                                <label class="mb-1 small fw-bold text-white">Select or type Party Name</label>
                                <div class="position-relative">
                                    <input type="text" id="taskPartySearchInput" 
                                        class="form-control fw-bold" 
                                        style="background:#0d1117; border:1px solid #58a6ff; color:#e6edf3; font-size:.95rem;"
                                        value="${defaults.partyName || ''}" ${defaults.partyName ? 'readonly' : ''} 
                                        placeholder="${defaults.bulkPartyIds ? 'Bulk Selection Active' : 'Search party...'}" autocomplete="off">
                                    <div id="taskPartyDropdown" class="list-group position-absolute w-100 shadow-lg d-none" 
                                        style="z-index:2000; max-height:220px; overflow-y:auto; background:#161b22; border:1px solid #30363d; border-radius:8px; top:calc(100% + 4px); left:0;"></div>
                                </div>
                                <input type="hidden" id="taskPartyId" value="${defaults.partyId || ''}">
                                <input type="hidden" id="taskPartyName" value="${defaults.partyName || ''}">
                                ${defaults.bulkPartyIds ? `<div class="small text-warning mt-1"><i class="bi bi-info-circle me-1"></i> Creating separate tasks for ${defaults.bulkPartyIds.length} customers</div>` : ''}
                            </div>

                            <div id="taskCreateBillsContainer" class="mb-3 d-none"></div>

                            <div class="mb-3">
                                <label class="form-label text-white-50 small uppercase tracking-wider fw-bold">Narration / Task Details</label>
                                <textarea id="taskNarration" class="form-control bg-dark border-secondary text-white" rows="3" placeholder="Enter task details..." required>${defaults.narration || ''}</textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label text-white-50 small uppercase tracking-wider fw-bold">Assign To</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-dark border-secondary text-white-50"><i class="bi bi-person-badge"></i></span>
                                    <select id="taskAssignedTo" class="form-select bg-dark border-secondary text-white">
                                        ${assignableUsers.map(u => `<option value="${u.username}" ${(defaults.assignedTo ? u.username === defaults.assignedTo : (currentUser && u.username === currentUser.username)) ? 'selected' : ''}>${u.username} ${currentUser && u.username === currentUser.username ? '(Me)' : ''}</option>`).join('')}
                                    </select>
                                </div>
                            </div>

                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label text-white-50 small uppercase tracking-wider fw-bold">Follow-up Date</label>
                                    <input type="date" id="taskFollowupDate" class="form-control bg-dark border-secondary text-white" 
                                        value="${new Date().toISOString().split('T')[0]}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label text-white-50 small uppercase tracking-wider fw-bold">Follow-up Time</label>
                                    <input type="time" id="taskFollowupTime" class="form-control bg-dark border-secondary text-white" 
                                        value="10:00">
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-warning px-4 fw-bold" onclick="TasksUI.saveTask()">
                            <i class="bi bi-save me-1"></i> Save Task
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Setup Party Search Dropdown
        if (!defaults.partyName) {
            this.setupPartySearch();
        }

        // Initialize display state
        this.handleCreateModalModeChange();
    },

    setupPartySearch() {
        const searchInput = document.getElementById('taskPartySearchInput');
        const dropdown = document.getElementById('taskPartyDropdown');
        if (!searchInput || !dropdown) return;

        // Fetch all parties including fallback if CustomerManager isn't available
        const allParties = typeof CustomerManager !== 'undefined' 
            ? CustomerManager.getAllCustomers() 
            : (DataManager.getData('customers') || []);
            
        let activeIdx = -1;

        const renderDropdown = (query) => {
            const q = (query || '').toLowerCase().trim();
            activeIdx = -1;
            
            const matches = q 
                ? allParties.filter(p => 
                    (p.name || '').toLowerCase().includes(q) || 
                    String(p.phone || '').includes(q) ||
                    (p.id || '').toLowerCase().includes(q)
                  )
                : allParties;

            const limitedMatches = matches.slice(0, 60);

            if (limitedMatches.length === 0 && q.length > 0) {
                dropdown.innerHTML = '<div class="px-3 py-2 small" style="color:#8b949e;">No matching parties found</div>';
                dropdown.classList.remove('d-none');
                return;
            }



            dropdown.innerHTML = limitedMatches.map((p, i) => `
                <button type="button" 
                    class="list-group-item list-group-item-action border-0 d-flex justify-content-between align-items-center taskPartyItem" 
                    style="background:#161b22; color:#e6edf3; font-size:.88rem; padding:8px 12px;"
                    onclick="TasksUI.selectParty('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
                    onmouseenter="this.style.background='#1f2937'"
                    onmouseleave="this.style.background=this.classList.contains('active-item')?'#0d47a1':'#161b22'">
                    <span class="fw-bold text-info">${p.name}</span>
                    <small style="color:#8b949e;">${p.phone || ''}</small>
                </button>
            `).join('');
            dropdown.classList.remove('d-none');
        };

        let searchTimeout = null;
        searchInput.addEventListener('input', (e) => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderDropdown(e.target.value), 150);
        });
        searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.taskPartyItem');
            if (!items.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].click();
                return;
            } else if (e.key === 'Escape') {
                dropdown.classList.add('d-none');
                return;
            } else { return; }

            items.forEach((el, i) => {
                const active = i === activeIdx;
                el.classList.toggle('active-item', active);
                el.style.background = active ? '#0d47a1' : '#161b22';
                el.style.color = active ? '#fff' : '#e6edf3';
            });
            if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        });
    },

    async selectParty(id, name) {
        const searchInput = document.getElementById('taskPartySearchInput');
        const idInput = document.getElementById('taskPartyId');
        const nameInput = document.getElementById('taskPartyName');
        const dropdown = document.getElementById('taskPartyDropdown');

        searchInput.value = name;
        idInput.value = id;
        nameInput.value = name;
        dropdown.classList.add('d-none');

        // Trigger bill fetch if applicable
        this.handleCreateModalModeChange();
    },

    handleCreateModalModeChange() {
        const taskTypeInput = document.getElementById('taskType');
        if (!taskTypeInput) return;
        const taskType = taskTypeInput.value;
        const partyRow = document.getElementById('taskCreatePartyRow');
        const billsContainer = document.getElementById('taskCreateBillsContainer');
        const partyId = document.getElementById('taskPartyId').value;

        if (taskType === 'payment_followup') {
            if (partyRow) partyRow.classList.remove('d-none');
            if (partyId && !document.getElementById('taskBulkPartyIds').value) {
                if (billsContainer) billsContainer.classList.remove('d-none');
                this.updateCreateModalBills(partyId);
            } else {
                if (billsContainer) billsContainer.classList.add('d-none');
            }
        } else {
            if (partyRow) partyRow.classList.add('d-none');
            if (billsContainer) {
                billsContainer.classList.add('d-none');
                billsContainer.innerHTML = '';
            }
            // Clear party selected if switching back to normal to avoid accidental link
            const pidInput = document.getElementById('taskPartyId');
            const pnameInput = document.getElementById('taskPartyName');
            const psearchInput = document.getElementById('taskPartySearchInput');
            
            if (pidInput) pidInput.value = '';
            if (pnameInput) pnameInput.value = '';
            if (psearchInput && !psearchInput.readOnly) psearchInput.value = '';
        }
    },

    async updateCreateModalBills(partyId) {
        const container = document.getElementById('taskCreateBillsContainer');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-info"></div> Loading bills...</div>';

        try {
            const allInvoices = await InvoiceManager.getInvoicesWithBalance();
            const searchPartyId = (partyId || '').toLowerCase().trim();
            const searchPartyName = (document.getElementById('taskPartyName')?.value || document.getElementById('taskPartySearchInput')?.value || '').toLowerCase().trim();
            
            const task = this.currentTask || {};
            const taskPartyName = (task.partyName || '').toLowerCase().trim();

            let customerInvoices = allInvoices.filter(inv => {
                const invId = (inv.customerId || '').toLowerCase().trim();
                const invName = (inv.customerName || '').toLowerCase().trim();
                const invKey = (invId || 'ID') + '::' + (invName || 'NAME');
                
                // Match by ID, Name, Composite Key, or Task Metadata
                const match = (searchPartyId && invId === searchPartyId) || 
                              (searchPartyName && invName === searchPartyName) || 
                              (searchPartyId && invKey.toLowerCase() === searchPartyId) ||
                              (taskPartyName && (invName === taskPartyName || invId === taskPartyName));
                
                return match && inv.balance > 0.05;
            });

            // Deduplicate by ID to prevent double entries
            const uniqueMap = new Map();
            customerInvoices.forEach(inv => {
                if (!uniqueMap.has(inv.id)) uniqueMap.set(inv.id, inv);
            });
            customerInvoices = Array.from(uniqueMap.values());

            if (customerInvoices.length === 0) {
                container.innerHTML = `<div class="alert alert-info py-2 small m-0">No pending bills found for ${searchPartyName || 'this customer'}.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="p-2 border border-secondary rounded-3 bg-dark bg-opacity-50">
                    <div class="d-flex justify-content-between align-items-center mb-2 px-2">
                        <label class="text-white-50 small uppercase tracking-wider fw-bold m-0">Pending Bills</label>
                        <div class="form-check m-0">
                            <input class="form-check-input small" type="checkbox" id="taskBillSelectAll" onchange="TasksUI.toggleAllCreateBills(this.checked)">
                            <label class="form-check-label text-white-50 small" for="taskBillSelectAll">Select All</label>
                        </div>
                    </div>
                    <div class="list-group list-group-flush border-top border-secondary border-opacity-25" style="max-height: 150px; overflow-y: auto;">
                        ${customerInvoices.map(inv => `
                            <div class="list-group-item bg-transparent border-0 px-2 py-1 d-flex align-items-center">
                                <input class="form-check-input task-bill-checkbox me-2" type="checkbox" 
                                    value="${inv.invoiceNo}" 
                                    data-amount="${inv.balance}"
                                    data-total="${inv.total}"
                                    id="bill_${inv.id}"
                                    onchange="TasksUI.updateNarrationFromBills()">
                                <label class="form-check-label small text-white flex-grow-1" for="bill_${inv.id}">
                                    ${inv.invoiceNo} <span class="text-white-50 ms-2">Bal: ₹${inv.balance.toLocaleString('en-IN')} <small>(of ₹${inv.total.toLocaleString('en-IN')})</small></span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-danger py-2 small m-0">Error fetching bills</div>`;
        }
    },

    toggleAllCreateBills(checked) {
        document.querySelectorAll('.task-bill-checkbox').forEach(cb => {
            cb.checked = checked;
        });
        this.updateNarrationFromBills();
    },

    updateNarrationFromBills() {
        const narrationArea = document.getElementById('taskNarration');
        const checkboxes = document.querySelectorAll('.task-bill-checkbox:checked');
        const partyName = document.getElementById('taskPartyName').value || document.getElementById('taskPartySearchInput').value;
        
        if (checkboxes.length === 0) {
            if (partyName) narrationArea.value = `Payment follow-up for ${partyName}`;
            return;
        }

        let totalPending = 0;
        let totalBillValue = 0;
        const billsStrings = [];
        
        checkboxes.forEach(cb => {
            const pending = parseFloat(cb.getAttribute('data-amount'));
            const full = parseFloat(cb.getAttribute('data-total'));
            totalPending += pending;
            totalBillValue += full;
            billsStrings.push(`${cb.value} (Bill: ₹${full.toLocaleString('en-IN')}, Bal: ₹${pending.toLocaleString('en-IN')})`);
        });

        narrationArea.value = `Payment follow-up for ${partyName}:\nBills: ${billsStrings.join(', ')}\nTotal balance: ₹${totalPending.toLocaleString('en-IN')} (Total Outstanding: ₹${totalBillValue.toLocaleString('en-IN')})`;
    },

    async saveTask() {
        const narration = document.getElementById('taskNarration').value;
        if (!narration) {
            alert('Please enter task narration');
            return;
        }

        const partyId = document.getElementById('taskPartyId').value;
        const partyName = document.getElementById('taskPartyName').value || document.getElementById('taskPartySearchInput').value;
        const assignedTo = document.getElementById('taskAssignedTo').value;
        const followupDate = document.getElementById('taskFollowupDate').value;
        const followupTime = document.getElementById('taskFollowupTime').value;
        const bulkIdsStr = document.getElementById('taskBulkPartyIds').value;
        const taskType = document.getElementById('taskType').value;

        const users = await UserManager.getUsers();
        const assignedUser = users.find(u => u.username === assignedTo && u.isActive !== false);
        if (!assignedUser) {
            App.showNotification('Please assign task to an active user', 'warning');
            return;
        }
        const assignedToName = assignedUser ? assignedUser.username : assignedTo;

        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        
        if (bulkIdsStr) {
            // Create one task for each customer in the bulk list
            const bulkIds = bulkIdsStr.split(',');
            bulkIds.forEach((bid, idx) => {
                // Handle composite keys from PaymentsUI (id::name)
                const [cid, cname] = bid.includes('::') ? bid.split('::') : [bid, ''];
                const customer = CustomerManager.getCustomer(cid);
                
                const newTask = {
                    id: 'TASK-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substr(2, 5),
                    type: taskType,
                    narration,
                    partyId: cid,
                    partyName: customer ? customer.name : (cname || partyName),
                    assignedTo,
                    assignedToName,
                    followupDate,
                    followupTime,
                    status: 'open',
                    createdAt: new Date().toISOString(),
                    history: []
                };
                this.addHistory(newTask, 'Task Created', `Initial task for ${newTask.partyName}`);
                tasks.push(newTask);
            });
        } else {
            // Create a single task
            const newTask = {
                id: 'TASK-' + Date.now(),
                type: taskType,
                narration,
                partyId,
                partyName,
                assignedTo,
                assignedToName,
                followupDate,
                followupTime,
                status: 'open',
                createdAt: new Date().toISOString(),
                history: []
            };
            this.addHistory(newTask, 'Task Created', `Initial task created`);
            tasks.push(newTask);
        }

        await DataManager.saveData(DataManager.KEYS.TASKS, tasks);

        bootstrap.Modal.getInstance(document.getElementById('taskCreateModal')).hide();
        App.showNotification(bulkIdsStr ? `Created ${bulkIdsStr.split(',').length} tasks` : 'Task created successfully', 'success');
        
        // Refresh appropriate view
        if (App.currentView === 'tasks') {
            this.renderTasks();
        } else if (App.currentView === 'payments') {
            PaymentsUI.renderPaymentFollowup();
        }
    },

    /**
     * View Task Details
     */
    async viewTaskDetail(taskId) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const ctx = await this._getTaskVisibilityContext();
        if (!ctx.isAdmin) {
            const uname = String(ctx.currentUser?.username || '').trim().toLowerCase();
            if (!uname || String(task.assignedTo || '').trim().toLowerCase() !== uname) {
                App.showNotification('You can only view tasks assigned to you', 'warning');
                return;
            }
        }

        const customer = task.partyId ? CustomerManager.getCustomer(task.partyId) : null;
        const users = this._getActiveAssignableUsers(await UserManager.getUsers(), ctx.currentUser, task.assignedTo || '');
        const isOverdue = this.isOverdue(task);

        let modalEl = document.getElementById('taskDetailModal');
        let isNew = false;
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'taskDetailModal';
            modalEl.className = 'modal fade';
            modalEl.setAttribute('tabindex', '-1');
            document.body.appendChild(modalEl);
            isNew = true;
        }

        // Preserve fullscreen state if already open
        const isFullscreen = modalEl.querySelector('.modal-dialog')?.classList.contains('modal-fullscreen');

        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered ${isFullscreen ? 'modal-fullscreen' : 'modal-xl'} animate__animated animate__fadeIn">
                <div class="modal-content glass-panel border-secondary text-white shadow-lg">
                    <div class="modal-header border-secondary">
                        <div class="d-flex align-items-center">
                            <h5 class="modal-title fw-bold me-3">Task Details</h5>
                            <span class="badge ${task.status === 'completed' ? 'bg-success' : (isOverdue ? 'bg-danger' : 'bg-warning')}">
                                ${task.status === 'completed' ? 'Completed' : (isOverdue ? 'Overdue' : 'Open')}
                            </span>
                        </div>
                        <div class="d-flex align-items-center">
                            <button type="button" class="btn btn-sm btn-outline-light me-2 border-0" onclick="TasksUI.toggleModalExpansion()" title="Expand / Shrink">
                                <i class="bi bi-arrows-fullscreen"></i>
                            </button>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                    </div>
                    <div class="modal-body p-4">
                        <div class="row g-4">
                            <div class="col-md-7">
                                <div class="mb-4">
                                    <label class="text-white-50 small uppercase tracking-wider mb-1">Narration / Details</label>
                                    <textarea id="taskDetailNarration" class="form-control bg-dark border-secondary text-white fs-5" rows="3" onblur="TasksUI.handleNarrationUpdate('${task.id}', this.value)">${task.narration}</textarea>
                                    <div class="small text-muted mt-1">Click outside to save changes</div>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="text-white-50 small uppercase tracking-wider mb-1">Related Party</label>
                                    <div class="d-flex align-items-center p-2 bg-dark border border-secondary rounded-3">
                                        <div class="flex-grow-1">
                                            <div class="fw-bold fs-5">${task.partyName || 'N/A'}</div>
                                            <div class="small text-white-50">${customer ? customer.id : ''}</div>
                                        </div>
                                        ${customer && customer.phone ? `
                                            <a href="tel:${customer.phone}" class="btn btn-outline-info btn-sm">
                                                <i class="bi bi-telephone"></i> ${customer.phone}
                                            </a>
                                        ` : ''}
                                    </div>
                                    <div id="taskDetailBillsContainer" class="mt-2 d-none"></div>
                                </div>
                                
                                <div class="mt-4 pt-3 border-top border-secondary border-opacity-25">
                                    <label class="text-white-50 small uppercase tracking-wider mb-2 d-flex align-items-center">
                                        <i class="bi bi-pencil-square me-2"></i> Action Note / completion Message
                                    </label>
                                    <textarea id="taskActionNote" class="form-control bg-dark border-secondary text-white small" rows="2" placeholder="Write a note about rescheduling or closing this task..."></textarea>
                                </div>
                            </div>
                            
                            <div class="col-md-5">
                                <div class="card bg-dark border-secondary h-100 p-3 shadow-sm">
                                    <h6 class="fw-bold mb-3 border-bottom border-secondary pb-2">Actions & Schedule</h6>
                                    
                                    <div class="d-grid gap-2">
                                        ${task.status === 'open' ? `
                                            <button class="btn btn-success fw-bold py-2 mb-3" onclick="TasksUI.toggleTaskStatus('${task.id}', true)">
                                                <i class="bi bi-check-circle me-2"></i> Mark Completed
                                            </button>
                                            
                                            <div class="p-3 bg-dark bg-opacity-50 border border-secondary rounded-3">
                                                <div class="small text-white-50 mb-3 uppercase tracking-wider small">Reschedule Task</div>
                                                
                                                <div class="mb-3">
                                                    <label class="small text-white-50 mb-1">New Date</label>
                                                    <input type="date" id="taskDetailDate" class="form-control form-control-sm bg-dark border-secondary text-white" value="${task.followupDate}">
                                                </div>
                                                <div class="mb-3">
                                                    <label class="small text-white-50 mb-1">New Time</label>
                                                    <input type="time" id="taskDetailTime" class="form-control form-control-sm bg-dark border-secondary text-white" value="${task.followupTime || '10:00'}">
                                                </div>
                                                
                                                <div class="d-flex gap-2 mb-2">
                                                    <button class="btn btn-outline-warning btn-sm flex-grow-1" onclick="TasksUI.postponeTask('${task.id}', 1, 'day')">
                                                        Next Day
                                                    </button>
                                                    <button class="btn btn-warning btn-sm flex-grow-1 fw-bold" onclick="TasksUI.confirmReschedule('${task.id}')">
                                                        Apply Custom
                                                    </button>
                                                </div>
                                            </div>
                                        ` : `
                                            <button class="btn btn-outline-light fw-bold py-2" onclick="TasksUI.toggleTaskStatus('${task.id}', false)">
                                                <i class="bi bi-arrow-counterclockwise me-2"></i> Re-open Task
                                            </button>
                                        `}
                                        
                                        <button class="btn btn-outline-success fw-bold py-2 border-success border-opacity-50" onclick="TasksUI.applyAndShareUpdate('${task.id}')">
                                            <i class="bi bi-whatsapp me-2"></i> Apply and Share update to WhatsApp
                                        </button>
                                        
                                        <div class="mt-auto pt-3 border-top border-secondary">
                                            <div class="row g-2">
                                                <div class="col-6">
                                                     <button class="btn btn-outline-danger w-100 btn-sm" onclick="TasksUI.deleteTask('${task.id}', true)">
                                                        Delete
                                                    </button>
                                                </div>
                                                <div class="col-6">
                                                     <select id="taskDetailAssignedTo" class="form-select form-select-sm bg-dark border-secondary text-white" onchange="TasksUI.updateTaskField('${task.id}', 'assignedTo', this.value)">
                                                        ${users.map(u => `<option value="${u.username}" ${task.assignedTo === u.username ? 'selected' : ''}>${u.username}</option>`).join('')}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    ${task.type === 'payment_followup' && task.partyId ? `
                                        <div class="mt-4 p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-3">
                                            <div class="small fw-bold text-primary mb-2 text-center">PAYMENT FOLLOW-UP</div>
                                            <button class="btn btn-primary btn-sm w-100" onclick="TasksUI.togglePendingBills('${task.id}', '${task.partyId}')">
                                                <i class="bi bi-receipt me-2"></i> View Pending Bills
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- History Section -->
                        <div class="mt-4 border-top border-secondary pt-4">
                            <h6 class="text-white-50 small uppercase tracking-wider mb-3"><i class="bi bi-clock-history me-2"></i> Task History</h6>
                            <div class="history-timeline" style="max-height: 200px; overflow-y: auto;">
                                ${(!task.history || task.history.length === 0) ? `
                                    <div class="text-muted small ps-3 border-start border-secondary">No history available for this task.</div>
                                ` : task.history.slice().reverse().map(log => `
                                    <div class="history-item mb-3 ps-3 border-start border-warning border-opacity-50">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <span class="fw-bold text-info small">${log.action}</span>
                                            <span class="text-white-50" style="font-size: 0.7rem;">${new Date(log.time).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div class="small text-white-75">${log.details}</div>
                                        <div class="text-white-50" style="font-size: 0.65rem;">Updated by: ${log.user || 'System'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (isNew) {
            new bootstrap.Modal(modalEl).show();
        } else {
            // If already open, just refresh content. Bootstrap will handle focus.
            // But we might need to manually trigger show() to ensure backdrop etc.
            bootstrap.Modal.getInstance(modalEl).show();
        }
    },

    async updateTaskField(taskId, field, value) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            const ctx = await this._getTaskVisibilityContext();
            if (!ctx.isAdmin) {
                const uname = String(ctx.currentUser?.username || '').trim().toLowerCase();
                if (!uname || String(tasks[index].assignedTo || '').trim().toLowerCase() !== uname) {
                    App.showNotification('You can only update tasks assigned to you', 'warning');
                    return;
                }
            }
            const oldValue = tasks[index][field];
            if (oldValue === value) return;

            tasks[index][field] = value;
            if (field === 'assignedTo') {
                const users = await UserManager.getUsers();
                const assignedUser = users.find(u => u.username === value && u.isActive !== false);
                if (!assignedUser) {
                    App.showNotification('Task can only be assigned to an active user', 'warning');
                    return;
                }
                tasks[index].assignedToName = assignedUser ? assignedUser.username : value;
                this.addHistory(tasks[index], 'Reassigned', `Task assigned to ${tasks[index].assignedToName}`);
            } else {
                this.addHistory(tasks[index], 'Field Updated', `${field} changed from ${oldValue} to ${value}`);
            }

            await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
            this.renderTasks();
            this.viewTaskDetail(taskId); // Refresh history view
        }
    },

    async handleNarrationUpdate(taskId, newNarration) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1 && tasks[index].narration !== newNarration) {
            this.addHistory(tasks[index], 'Narration Updated', `Old: ${tasks[index].narration.substring(0, 30)}...`);
            tasks[index].narration = newNarration;
            await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
            App.showNotification('Task description updated', 'success');
            this.renderTasks();
            this.viewTaskDetail(taskId);
        }
    },

    async postponeTask(taskId, amount, unit) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            const task = tasks[index];
            const currentDue = new Date(task.followupDate + 'T' + (task.followupTime || '10:00'));
            
            const note = document.getElementById('taskActionNote')?.value || '';
            const oldDate = task.followupDate;
            const oldTime = task.followupTime;

            if (unit === 'day') {
                currentDue.setDate(currentDue.getDate() + amount);
            } else if (unit === 'hour') {
                currentDue.setHours(currentDue.getHours() + amount);
            }
            
            task.followupDate = currentDue.toISOString().split('T')[0];
            task.followupTime = currentDue.toTimeString().split(' ')[0].substring(0, 5);
            
            this.addHistory(task, 'Task Rescheduled', `Rescheduled from ${oldDate} ${oldTime} to ${task.followupDate} ${task.followupTime}.${note ? ' Note: ' + note : ''}`);

            await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
            App.showNotification(`Task rescheduled to ${this.formatDateTime(task.followupDate, task.followupTime)}`, 'success');
            
            // Re-render modal if open
            this.viewTaskDetail(taskId);
            this.renderTasks();
        }
    },

    async confirmReschedule(taskId) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const index = tasks.findIndex(t => t.id === taskId);
        if (index === -1) return;

        const newDate = document.getElementById('taskDetailDate').value;
        const newTime = document.getElementById('taskDetailTime').value;
        const note = document.getElementById('taskActionNote')?.value || '';

        if (!newDate) {
            App.showNotification('Please select a valid date', 'warning');
            return;
        }

        const task = tasks[index];
        const oldDate = task.followupDate;
        const oldTime = task.followupTime;

        task.followupDate = newDate;
        task.followupTime = newTime || '10:00';

        this.addHistory(task, 'Task Rescheduled', `Manually rescheduled from ${oldDate} ${oldTime} to ${task.followupDate} ${task.followupTime}.${note ? ' Note: ' + note : ''}`);

        await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
        App.showNotification(`Task rescheduled to ${this.formatDateTime(task.followupDate, task.followupTime)}`, 'success');
        
        this.renderTasks();
        this.viewTaskDetail(taskId);
    },

    toggleModalExpansion() {
        const dialog = document.querySelector('#taskDetailModal .modal-dialog');
        if (!dialog) return;
        
        if (dialog.classList.contains('modal-fullscreen')) {
            dialog.classList.remove('modal-fullscreen');
            dialog.classList.add('modal-xl');
        } else {
            dialog.classList.remove('modal-xl');
            dialog.classList.add('modal-fullscreen');
        }
    },

    async togglePendingBills(taskId, partyId) {
        const container = document.getElementById('taskDetailBillsContainer');
        if (!container) return;

        if (!container.classList.contains('d-none')) {
            container.classList.add('d-none');
            return;
        }

        container.classList.remove('d-none');
        container.innerHTML = '<div class="p-3 text-center"><div class="spinner-border spinner-border-sm text-info"></div> Loading bills...</div>';

        try {
            const allInvoices = await InvoiceManager.getInvoicesWithBalance();
            const searchParty = (partyId || '').toLowerCase().trim();
            
            // Get current task details for fuzzy name matching
            const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
            const task = tasks.find(t => t.id === taskId) || {};
            const taskPartyName = (task.partyName || '').toLowerCase().trim();
            
            // Comprehensive matching against ID, Name, and Composite Key
            const customerInvoices = allInvoices.filter(inv => {
                const invId = (inv.customerId || '').toLowerCase().trim();
                const invName = (inv.customerName || '').toLowerCase().trim();
                const invKey = (invId || 'ID') + '::' + (invName || 'NAME');
                
                return (invId === searchParty || 
                        invName === searchParty || 
                        invKey.toLowerCase() === searchParty ||
                        (taskPartyName && (invName === taskPartyName || invId === taskPartyName))) 
                        && inv.balance > 0.05;
            });

            if (customerInvoices.length === 0) {
                container.innerHTML = '<div class="alert alert-info py-2 small m-0">No pending bills found for this customer.</div>';
                return;
            }

            container.innerHTML = `
                <div class="card bg-dark border-secondary overflow-hidden mt-2">
                    <div class="table-responsive" style="max-height: 250px;">
                        <table class="table table-dark table-sm table-hover mb-0 small">
                            <thead class="bg-black text-white-50">
                                <tr>
                                    <th class="ps-2">Invoice</th>
                                    <th>Date</th>
                                    <th class="text-end">Pending</th>
                                    <th class="text-end pe-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customerInvoices.map(inv => `
                                    <tr>
                                        <td class="ps-2">${inv.invoiceNo}</td>
                                        <td>${new Date(inv.date).toLocaleDateString()}</td>
                                        <td class="text-end text-info fw-bold">₹${inv.balance.toLocaleString('en-IN')}</td>
                                        <td class="text-end pe-2">
                                            <button class="btn btn-link btn-sm p-0 text-info" onclick="InvoicesUI.previewInvoice('${inv.id}')">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-danger py-2 small m-0">Error loading bills: ${err.message}</div>`;
        }
    },

    goToCustomerBills(partyId) {
        if (typeof PaymentsUI !== 'undefined') {
            App.showView('payments');
            // partyId might be the groupKey or customerId. PaymentsUI.renderCustomerDetails handles both via fallback.
            PaymentsUI.renderCustomerDetails(btoa(partyId));
        } else {
            App.showNotification('Payments module not loaded', 'error');
        }
    },

    async toggleTaskStatus(taskId, forceComplete = null) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            const ctx = await this._getTaskVisibilityContext();
            if (!ctx.isAdmin) {
                const uname = String(ctx.currentUser?.username || '').trim().toLowerCase();
                if (!uname || String(tasks[index].assignedTo || '').trim().toLowerCase() !== uname) {
                    App.showNotification('You can only update tasks assigned to you', 'warning');
                    return;
                }
            }
            const newStatus = forceComplete !== null 
                ? (forceComplete ? 'completed' : 'open')
                : (tasks[index].status === 'open' ? 'completed' : 'open');
            
            const note = document.getElementById('taskActionNote')?.value || '';
            tasks[index].status = newStatus;
            tasks[index].completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
            
            this.addHistory(tasks[index], newStatus === 'completed' ? 'Task Completed' : 'Task Re-opened', 
                (newStatus === 'completed' ? 'Marked as finished' : 'Returned to pending backlog') + (note ? '. Note: ' + note : ''));

            await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
            
            const modal = document.getElementById('taskDetailModal');
            if (modal && bootstrap.Modal.getInstance(modal)) {
                this.viewTaskDetail(taskId);
            }
            this.renderTasks();
        }
    },

    async deleteTask(taskId, isFromModal = false) {
        if (!confirm('Are you sure you want to delete this task?')) return;
        
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const taskToDelete = tasks.find(t => t.id === taskId);
        const ctx = await this._getTaskVisibilityContext();
        if (taskToDelete && !ctx.isAdmin) {
            const uname = String(ctx.currentUser?.username || '').trim().toLowerCase();
            if (!uname || String(taskToDelete.assignedTo || '').trim().toLowerCase() !== uname) {
                App.showNotification('You can only delete tasks assigned to you', 'warning');
                return;
            }
        }
        
        if (taskToDelete) {
            // Add to Recycle Bin
            const recycleBin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
            taskToDelete.deletedAt = new Date().toISOString();
            taskToDelete._recordType = 'task'; // Changed from originalType so Recycle Bin UI finds it
            recycleBin.push(taskToDelete);
            await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, recycleBin);
        }

        const filtered = tasks.filter(t => t.id !== taskId);
        await DataManager.saveData(DataManager.KEYS.TASKS, filtered);
        
        if (isFromModal) {
            bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide();
        }
        this.renderTasks();
    },

    async restoreTask(taskId) {
        const recycleBin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const itemIdx = recycleBin.findIndex(r => r.id === taskId && r._recordType === 'task');
        if (itemIdx === -1) throw new Error("Task not found in recycle bin");
        
        const taskToRestore = recycleBin.splice(itemIdx, 1)[0];
        delete taskToRestore.deletedAt;
        delete taskToRestore._recordType;
        
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        tasks.push(taskToRestore);
        
        await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, recycleBin);
        
        // Refresh UI if task view is active
        if (App.currentView === 'tasks') {
            this.renderTasks();
        }
    },

    formatDateTime(dateStr, timeStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        return `${date} at ${timeStr || '10:00'}`;
    },

    getTimeLabel(task) {
        const created = new Date(task.createdAt).toLocaleDateString();
        return `Created: ${created}`;
    },

    isOverdue(task) {
        if (task.status === 'completed') return false;
        const now = new Date();
        const due = new Date(task.followupDate + 'T' + (task.followupTime || '00:00'));
        return due < now;
    },

    async applyAndShareUpdate(taskId) {
        if (typeof WhatsAppService === 'undefined') {
            App.showNotification('WhatsApp Service not loaded', 'error');
            return;
        }

        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // 1. If task is open, apply the custom reschedule logic first
        if (task.status === 'open') {
            const newDate = document.getElementById('taskDetailDate')?.value;
            const newTime = document.getElementById('taskDetailTime')?.value;
            
            if (newDate) {
                // We use the same logic as confirmReschedule but without the extra viewTaskDetail refresh here
                // to avoid flickering before WhatsApp opens.
                const oldDate = task.followupDate;
                const oldTime = task.followupTime;
                const note = document.getElementById('taskActionNote')?.value || '';

                task.followupDate = newDate;
                task.followupTime = newTime || '10:00';

                this.addHistory(task, 'Task Rescheduled', `Manually rescheduled from ${oldDate} ${oldTime} to ${task.followupDate} ${task.followupTime}.${note ? ' Note: ' + note : ''}`);
                await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
                App.showNotification(`Task rescheduled and ready to share`, 'success');
                
                // Refresh list in background
                this.renderTasks();
            }
        }

        // 2. Generate and share the message
        const latestNote = document.getElementById('taskActionNote')?.value || '';
        const msg = WhatsAppService.formatTaskMessage(task, latestNote);
        WhatsAppService.shareMessage(msg);
        
        // 3. Refresh modal to show updated history after small delay (to not interrupt window.open)
        setTimeout(() => this.viewTaskDetail(taskId), 500);
    }
};

window.TasksUI = TasksUI;
