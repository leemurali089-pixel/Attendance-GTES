/**
 * Browser localStorage is limited (~5MB). This app caches large datasets
 * under keys like gtes_*, invoices, vouchers — when full, Firebase SDK
 * cannot persist internal keys (e.g. firebase:previous_websocket_failure)
 * and throws QuotaExceededError, breaking Realtime Database.
 *
 * Run BEFORE firebase.initializeApp (see firebaseConfig.js).
 */
(function () {
    'use strict';

    const PROTECTED_KEYS = new Set([
        'theme',
        'gtes_device_id'
    ]);

    function canWriteTest() {
        const k = '__gtes_quota_probe__';
        try {
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Free enough space for Firebase + small prefs. Safe to call multiple times.
     */
    function gtesEnsureLocalStorageHeadroom() {
        if (typeof localStorage === 'undefined') return;

        if (canWriteTest()) return;

        // 1) Drop Firebase internal cache keys (safe; not auth session).
        try {
            const kill = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.indexOf('firebase:') === 0 && key.indexOf('firebase:authUser:') !== 0) {
                    kill.push(key);
                }
            }
            kill.forEach(function (k) {
                try {
                    localStorage.removeItem(k);
                } catch (_) { /* ignore */ }
            });
        } catch (_) { /* ignore */ }

        if (canWriteTest()) {
            console.warn('[Storage] Freed localStorage by removing non-auth firebase:* cache keys.');
            return;
        }

        // 2) Remove largest app data blobs (re-fetched from Realtime DB on next load).
        const entries = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || PROTECTED_KEYS.has(key)) continue;
                if (key.indexOf('firebase:authUser:') === 0) continue;
                let v = '';
                try {
                    v = localStorage.getItem(key) || '';
                } catch (_) {
                    continue;
                }
                entries.push({ key: key, size: key.length + v.length });
            }
        } catch (_) {
            return;
        }

        entries.sort(function (a, b) {
            return b.size - a.size;
        });

        for (let j = 0; j < entries.length; j++) {
            try {
                localStorage.removeItem(entries[j].key);
                console.warn('[Storage] Removed large localStorage key to free quota:', entries[j].key);
            } catch (_) { /* ignore */ }
            if (canWriteTest()) return;
        }

        if (!canWriteTest()) {
            console.error(
                '[Storage] localStorage still full after eviction. Clear site data for this origin in browser settings, ' +
                'or use the desktop app (files are not limited by browser quota).'
            );
        }
    }

    window.gtesEnsureLocalStorageHeadroom = gtesEnsureLocalStorageHeadroom;
})();
