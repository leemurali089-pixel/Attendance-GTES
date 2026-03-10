/**
 * Bank Statement Import Helper
 * Parses CSV and handles transaction mapping
 */

const BankImportHelper = {
    /**
     * Parse CSV text into array of objects or rows
     */
    parseCSV(text) {
        if (!text) return [];

        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return [];

        // Simple CSV parser that handles quotes
        const parseLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseLine(lines[0]);
        const data = lines.slice(1).map(line => parseLine(line));

        return { headers, data };
    },

    /**
     * Auto-detect columns (Date, Description, Amount, Type)
     */
    detectColumns(headers) {
        const mapping = {
            date: -1,
            description: -1,
            amount: -1,
            type: -1,
            credit: -1,
            debit: -1
        };

        headers.forEach((h, i) => {
            const header = h.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

            if (header.includes('date') || header === 'value date' || header.includes('tran date') || header.includes('post date')) {
                if (mapping.date === -1) mapping.date = i;
            } else if (
                header === 'narration' ||
                header === 'narrations' ||
                header === 'particulars' ||
                header === 'particular' ||
                header.includes('desc') ||
                header.includes('narrat') ||
                header.includes('detail') ||
                header.includes('information') ||
                header.includes('transaction remark') ||
                header.includes('payment info') ||
                header.includes('pay info') ||
                header.includes('transaction info') ||
                header.includes('memo') ||
                header.includes('notes') ||
                header.includes('notation') ||
                header.includes('toward') ||
                header.includes('beneficiary')
            ) {
                if (mapping.description === -1) mapping.description = i;
            } else if (header.includes('credit') || header === 'cr') {
                mapping.credit = i;
            } else if (header.includes('debit') || header === 'dr') {
                mapping.debit = i;
            } else if (header.includes('amount') || header.includes('value') || header === 'amt') {
                if (mapping.amount === -1) mapping.amount = i;
            } else if (header.includes('type') || header.includes('txn type')) {
                mapping.type = i;
            }
            // Note: Chq No, Ref No, UTR, Balance etc. are intentionally ignored
        });

        // Fallback: if no description column found, pick the header with the longest
        // average text content in data (most likely to be narration/description)
        // We do this in mapToTransactions if description is still -1.
        return mapping;
    },

    /**
     * Convert raw rows to standard transaction objects
     */
    mapToTransactions(data, mapping) {
        const getVal = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') return parseFloat(v.replace(/,/g, '')) || 0;
            return 0;
        };

        // FALLBACK: If no description column was found by header detection,
        // scan the first 5 rows and pick the column whose values are the longest text
        // (and not a number/date) — most likely the narration/description column.
        if (mapping.description === -1 && data.length > 0) {
            const skipCols = new Set([mapping.date, mapping.amount, mapping.credit, mapping.debit, mapping.type].filter(c => c !== -1));
            const sampleRows = data.slice(0, Math.min(5, data.length));
            let bestCol = -1;
            let bestAvgLen = 0;

            sampleRows[0].forEach((_, colIdx) => {
                if (skipCols.has(colIdx)) return;
                let avgLen = 0;
                sampleRows.forEach(row => {
                    const cell = String(row[colIdx] || '').trim();
                    // Skip if purely numeric
                    if (!isNaN(parseFloat(cell)) && isFinite(cell.replace(/,/g, ''))) return;
                    avgLen += cell.length;
                });
                avgLen /= sampleRows.length;
                if (avgLen > bestAvgLen) {
                    bestAvgLen = avgLen;
                    bestCol = colIdx;
                }
            });

            if (bestCol !== -1) {
                console.log(`BankImportHelper: Using column index ${bestCol} as description (fallback)`);
                mapping.description = bestCol;
            }
        }

        return data.map(row => {
            let amount = 0;
            let type = 'unknown';

            if (mapping.amount !== -1) {
                amount = getVal(row[mapping.amount]);
            } else if (mapping.credit !== -1 && mapping.debit !== -1) {
                const credit = getVal(row[mapping.credit]);
                const debit = getVal(row[mapping.debit]);
                if (credit > 0) {
                    amount = credit;
                    type = 'credit';
                } else {
                    amount = debit;
                    type = 'debit';
                }
            }

            // Try to normalize date
            let rawDate = row[mapping.date] || '';
            let date = this.parseDate(rawDate);

            const description = mapping.description !== -1 ? (row[mapping.description] || '') : '';

            return {
                date: date,
                rawDate: rawDate,
                description: String(description).trim(),
                amount: Math.abs(amount),
                type: type === 'unknown' ? (amount < 0 ? 'debit' : 'credit') : type,
                originalRow: row
            };
        });
    },

    /**
     * Simple date parser for common formats (DD/MM/YYYY, YYYY-MM-DD, etc)
     */
    parseDate(dateStr) {
        if (!dateStr) return new Date();

        // Handle Excel numeric dates (serial numbers)
        if (typeof dateStr === 'number') {
            // Excel dates are days since Dec 30, 1899
            return new Date(Math.round((dateStr - 25569) * 86400 * 1000));
        }

        // Handle Date objects
        if (dateStr instanceof Date) {
            return dateStr;
        }

        // Convert to string for regex matching
        const str = String(dateStr).trim();

        // Try DD/MM/YYYY
        const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dmy) {
            const day = parseInt(dmy[1]);
            const month = parseInt(dmy[2]) - 1;
            let year = parseInt(dmy[3]);
            if (year < 100) year += 2000;
            return new Date(year, month, day);
        }

        // Try standard new Date()
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;

        return new Date();
    }
};

window.BankImportHelper = BankImportHelper;
