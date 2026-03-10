/**
 * Inventory Management Module
 * Handles material/inventory tracking for service operations
 */

const InventoryManager = {
    async init() {
        await DataManager.init();
        console.log('InventoryManager initialized');
    },

    /**
     * Generate next material ID
     */
    generateMaterialId() {
        const inventory = DataManager.getData('inventory') || [];
        if (inventory.length === 0) return 'MAT-0001';

        const lastId = inventory[inventory.length - 1].id;
        const num = parseInt(lastId.split('-')[1]) + 1;
        return `MAT-${num.toString().padStart(4, '0')}`;
    },

    /**
     * Add new material to inventory
     */
    async addMaterial(materialData) {
        const inventory = DataManager.getData('inventory') || [];

        // Check for duplicate name
        const existing = inventory.find(m =>
            m.name.toLowerCase() === materialData.name.toLowerCase()
        );
        if (existing) {
            throw new Error('Material with this name already exists');
        }

        const material = {
            id: materialData.id || this.generateMaterialId(),
            name: materialData.name,
            description: materialData.description || '',
            unit: materialData.unit || 'pcs',
            category: materialData.category || 'General',
            subcategory: materialData.subcategory || '',
            brand: materialData.brand || '',
            hsnCode: materialData.hsnCode || '',
            gstRate: materialData.gstRate || 'GST@18%',
            mrp: parseFloat(materialData.mrp) || 0,
            purchaseRate: parseFloat(materialData.purchaseRate) || 0,
            rate: parseFloat(materialData.rate) || 0, // Sale Rate
            openingStock: parseFloat(materialData.openingStock) || 0,
            currentStock: parseFloat(materialData.currentStock) || parseFloat(materialData.openingStock) || 0,
            minStock: parseFloat(materialData.moq) || parseFloat(materialData.minStock) || 0,
            moq: parseFloat(materialData.moq) || 0,
            status: materialData.status || 'active',
            source: materialData.source || 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        inventory.push(material);
        await DataManager.saveData('inventory', inventory);
        return material;
    },

    /**
     * Upsert material (Add or Update by Name)
     */
    async upsertMaterial(materialData) {
        const inventory = DataManager.getData('inventory') || [];
        const existingIndex = inventory.findIndex(m =>
            (m.name || '').toLowerCase().trim() === (materialData.name || '').toLowerCase().trim()
        );

        if (existingIndex !== -1) {
            // Update existing
            inventory[existingIndex] = {
                ...inventory[existingIndex],
                ...materialData,
                updatedAt: new Date().toISOString()
            };
            await DataManager.saveData('inventory', inventory);
            return inventory[existingIndex];
        } else {
            // Add new
            return await this.addMaterial(materialData);
        }
    },

    /**
     * Update material
     */
    async updateMaterial(materialId, updates) {
        const inventory = DataManager.getData('inventory') || [];
        const index = inventory.findIndex(m => m.id === materialId);

        if (index === -1) {
            throw new Error('Material not found');
        }

        // Check for rename and sync Raw Data (Preservation)
        const oldName = inventory[index].name;
        const newName = updates.name;
        if (newName && newName !== oldName) {
            await this.syncRawDataOnRename(oldName, newName);
        }

        inventory[index] = {
            ...inventory[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await DataManager.saveData('inventory', inventory);
        return inventory[index];
    },

    /**
     * Sync Raw Data on Item Rename
     * Preserves custom columns by updating the key in the raw storage
     */
    async syncRawDataOnRename(oldName, newName) {
        if (!oldName || !newName) return;

        try {
            const allRawParams = await DataManager.loadData(DataManager.KEYS.IMPORT_RAW);
            if (!allRawParams || !allRawParams['inventory']) return; // No raw data to sync

            const rawRows = allRawParams['inventory'];
            let modified = false;

            // Iterate and find the matching row
            for (const row of rawRows) {
                const d = row.data;
                // Identify the Name Key (Item Name, Name, Product Name, etc.)
                // We check the value match
                const nameKey = Object.keys(d).find(k => d[k] === oldName);

                if (nameKey) {
                    d[nameKey] = newName; // Update Value
                    modified = true;
                    console.log(`[Inventory] Synced Raw Data: Renamed '${oldName}' to '${newName}' in field '${nameKey}'`);
                    break; // Assume unique name
                }
            }

            if (modified) {
                await DataManager.saveData(DataManager.KEYS.IMPORT_RAW, allRawParams);
            }
        } catch (e) {
            console.error('Failed to sync raw data on rename:', e);
            // Don't block the main update
        }
    },

    /**
     * Add stock
     */
    async addStock(materialId, quantity, remarks = '') {
        const material = this.getMaterial(materialId);
        if (!material) throw new Error('Material not found');

        const newStock = material.currentStock + parseFloat(quantity);
        await this.updateMaterial(materialId, { currentStock: newStock });

        // Log transaction
        await this.logTransaction({
            materialId,
            type: 'in',
            quantity: parseFloat(quantity),
            remarks,
            date: new Date().toISOString()
        });

        return newStock;
    },

    /**
     * Remove stock
     */
    async removeStock(materialId, quantity, remarks = '') {
        const material = this.getMaterial(materialId);
        if (!material) throw new Error('Material not found');

        const newStock = material.currentStock - parseFloat(quantity);
        if (newStock < 0) {
            console.warn(`Insufficient stock for ${material.name}. Current: ${material.currentStock}, Requested: ${quantity}. Proceeding with negative stock.`);
        }

        await this.updateMaterial(materialId, { currentStock: newStock });

        // Log transaction
        await this.logTransaction({
            materialId,
            type: 'out',
            quantity: parseFloat(quantity),
            remarks,
            date: new Date().toISOString()
        });

        return newStock;
    },

    /**
     * Log inventory transaction
     */
    async logTransaction(transaction) {
        const transactions = DataManager.getData('inventoryTransactions') || [];
        transactions.push({
            id: `TXN-${Date.now()}`,
            ...transaction
        });
        await DataManager.saveData('inventoryTransactions', transactions);
    },

    /**
     * Get material by ID
     */
    getMaterial(materialId) {
        const inventory = DataManager.getData('inventory') || [];
        return inventory.find(m => m.id === materialId);
    },

    /**
     * Get all materials
     */
    getAllMaterials(includeHidden = false) {
        const inventory = DataManager.getData('inventory') || [];
        if (includeHidden) return inventory;
        return inventory.filter(i => !i.isHidden);
    },

    /**
     * Get low stock materials
     */
    getLowStockMaterials() {
        const inventory = this.getAllMaterials();
        return inventory.filter(m => m.currentStock <= m.minStock);
    },

    /**
     * Search materials
     */
    searchMaterials(query) {
        const inventory = this.getAllMaterials();
        const lowerQuery = query.toLowerCase();

        return inventory.filter(material =>
            material.name.toLowerCase().includes(lowerQuery) ||
            material.id.toLowerCase().includes(lowerQuery)
        );
    },

    /**
     * Delete material
     */
    async deleteMaterial(materialId) {
        const inventory = DataManager.getData('inventory') || [];
        const filtered = inventory.filter(m => m.id !== materialId);
        await DataManager.saveData('inventory', filtered);
    },

    /**
     * Get transaction history for a material
     */
    getTransactionHistory(materialId) {
        const transactions = DataManager.getData('inventoryTransactions') || [];
        return transactions.filter(t => t.materialId === materialId);
    }
};
