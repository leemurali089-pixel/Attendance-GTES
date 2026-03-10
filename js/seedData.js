/**
 * Seed Data Module for MJS PrimeLogic
 * Populates the system with BookKeeper-exact sample data.
 */

const SeedData = {
    /**
     * Seed everything: Inventory, Services, Purchases, Sales, Vouchers
     */
    async seedSystem() {
        console.log('[Seed] Initializing system with BookKeeper seed data...');

        // 1. Seed Inventory
        const inventoryData = [
            {
                id: 'MAT-SEED-1',
                name: '1" Ball Valve With End Fittings',
                unit: 'nos',
                currentStock: -262,
                openingStock: -72,
                rate: 0,
                purchaseRate: 0,
                hsnCode: '84811000',
                gstRate: 'IGST@18%',
                category: 'default',
                subcategory: 'default',
                description: 'NA',
                moq: 50,
                mrp: 0,
                type: 'product',
                source: 'seed'
            },
            {
                id: 'MAT-SEED-2',
                name: '100.00mm×50.00mm×2.90mm MS ERW RT Tube',
                unit: 'Kilogram',
                currentStock: 1391.8,
                openingStock: 0,
                rate: 0,
                purchaseRate: 0,
                hsnCode: '730690',
                gstRate: 'GST@18%',
                category: 'default',
                subcategory: 'default',
                description: 'NA',
                moq: 50,
                mrp: 0,
                type: 'product',
                source: 'seed'
            },
            {
                id: 'MAT-SEED-3',
                name: '1st Stage Compressor Cooler',
                unit: 'nos',
                currentStock: -1,
                openingStock: 0,
                rate: 0,
                purchaseRate: 0,
                hsnCode: '8419',
                gstRate: 'IGST@18%',
                category: 'default',
                subcategory: 'default',
                description: 'NA',
                moq: 50,
                mrp: 0,
                type: 'product',
                source: 'seed'
            },
            {
                id: 'SRV-SEED-1',
                name: 'Transport',
                unit: 'nos',
                description: 'Transport Service',
                gstRate: 'GST@18%',
                rate: 0,
                hsnCode: '9965',
                type: 'service',
                source: 'seed',
                isHidden: true
            },
            {
                id: 'SRV-SEED-2',
                name: 'Packing',
                unit: 'nos',
                description: 'NA',
                gstRate: 'GST@18%',
                rate: 0,
                hsnCode: '9985',
                type: 'service',
                source: 'seed',
                isHidden: true
            }
        ];

        // 2. Seed Services
        const serviceData = [
            {
                id: 'SRV-SEED-1',
                name: 'Transport',
                unit: 'nos',
                description: 'Transport Service',
                gstRate: 'GST@18%',
                rate: 0,
                hsnCode: '9965',
                type: 'service',
                source: 'seed'
            },
            {
                id: 'SRV-SEED-2',
                name: 'Packing',
                unit: 'nos',
                description: 'NA',
                gstRate: 'GST@18%',
                rate: 0,
                hsnCode: '9985',
                type: 'service',
                source: 'seed'
            }
        ];

        // 3. Seed Purchases (Expenses)
        const purchaseData = [
            {
                id: 'PUR1',
                vendorName: 'Supplier A',
                date: '2017-10-25',
                totalAmount: 385,
                roundOff: -0.18,
                status: 'paid',
                narration: 'This is sample purchase 1',
                billNo: 'Supp1',
                items: [
                    { name: 'Item1', description: 'Item1 Description', quantity: 11, rate: 10, amount: 110, discount: 10, gst: 18 },
                    { name: 'Item2', description: 'Item2 Description', quantity: 12, rate: 10, amount: 120, discount: 15, gst: 12 },
                    { name: 'Item3', description: 'Item3 Description', quantity: 13, rate: 10, amount: 130, discount: 20, gst: 28 },
                    { name: 'Packing', description: 'Gift Packing', quantity: 1, rate: 20, amount: 20, discount: 0, gst: 5 }
                ],
                source: 'seed'
            }
        ];

        // 4. Seed Sales (Invoices)
        const salesData = [
            {
                id: 'SAL1',
                customerName: 'Customer A',
                date: '2017-10-25',
                totalAmount: 385,
                roundOff: -0.18,
                status: 'paid',
                narration: 'This is sample sales 1',
                invoiceNo: 'Cust1',
                items: [
                    { name: 'Item1', description: 'Item1 Description', quantity: 11, rate: 10, amount: 110, discount: 10, gst: 18 },
                    { name: 'Item2', description: 'Item2 Description', quantity: 12, rate: 10, amount: 120, discount: 15, gst: 12 },
                    { name: 'Packing', description: 'Gift Packing', quantity: 1, rate: 20, amount: 20, discount: 0, gst: 5 }
                ],
                source: 'seed'
            }
        ];

        // 5. Seed Vouchers (Receipts/Payments)
        const voucherData = [
            {
                id: 'RCPT-001',
                type: 'receipt',
                partyName: 'NewTech Auto',
                date: new Date().toISOString().split('T')[0],
                amount: 5000,
                paymentMode: 'Bank',
                narration: 'Receipt from customer (Seed)',
                reference: 'SAL-001',
                source: 'seed'
            },
            {
                id: 'PAY-001',
                type: 'payment',
                partyName: 'ABC Steels',
                date: new Date().toISOString().split('T')[0],
                amount: 30000,
                paymentMode: 'Bank',
                narration: 'Payment to supplier (Seed)',
                reference: 'INV1023',
                source: 'seed'
            }
        ];

        // Save to DataManager
        await DataManager.saveData('inventory', inventoryData);
        await DataManager.saveData('gtes_services', serviceData);
        await DataManager.saveData(DataManager.KEYS.EXPENSES, purchaseData);
        await DataManager.saveData('invoices', salesData);
        await DataManager.saveData('vouchers', voucherData);

        console.log('[Seed] System initialized successfully.');
        return true;
    }
};

window.SeedData = SeedData;
