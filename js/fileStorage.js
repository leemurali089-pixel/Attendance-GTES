// File Storage Module - Firebase Realtime Database Integration
const FileStorage = {
    isCloudReady: false,
    _permissionDeniedHintShown: false,
    _realtimeListenersAttached: false,
    /** Keys we are writing to disk to mirror RTDB → ignore matching fs.watch invalidation (see syncManager). */
    _mirrorWriteKeys: new Set(),
    /** Debounced RTDB upload queue: key -> { timer, data, lastQueuedAt } */
    _pendingCloudSets: new Map(),
    /** Debounced RTDB listener applies (key -> timer id). */
    _remoteApplyTimers: new Map(),

    _rtdbHeavyMirrorKeys() {
        if (this._rtdbHeavyMirrorKeySet) return this._rtdbHeavyMirrorKeySet;
        const s = new Set(['invoices', 'vouchers', 'customers', 'purchases', 'gtes_expenses', 'gtes_attendance', 'inventory', 'inventoryTransactions']);
        try {
            const DM = window.DataManager;
            if (DM && DM.KEYS) {
                [DM.KEYS.INVOICES, DM.KEYS.VOUCHERS, DM.KEYS.EXPENSES, DM.KEYS.ATTENDANCE, DM.KEYS.CHALLANS].filter(Boolean).forEach((k) => s.add(k));
            }
        } catch (_) { /* ignore */ }
        this._rtdbHeavyMirrorKeySet = s;
        return s;
    },

    _scheduleRemoteApply(key, snap) {
        const exists = snap.exists();
        const val = exists ? snap.val() : null;
        const prev = this._remoteApplyTimers.get(key);
        if (prev && prev.timer) clearTimeout(prev.timer);
        const syncing = !!(window.SyncManager && window.SyncManager.status === 'syncing');
        const delay = syncing ? 780 : 220;
        const timer = setTimeout(() => {
            this._remoteApplyTimers.delete(key);
            this._applyRemoteSnapshot(key, { exists, val });
        }, delay);
        this._remoteApplyTimers.set(key, { timer, exists, val });
    },

    _applyRemoteSnapshot(key, payload) {
        const DM = window.DataManager;
        if (!DM || !DM.KEYS) return;
        const { exists, val } = payload || {};
        try {
            if (!exists) {
                DM.invalidateDataCache(key);
                const arrKeys = typeof DM._keysStoredAsArrays === 'function' ? DM._keysStoredAsArrays() : null;
                let emptyMirror = null;
                if (key === 'gtes_users' || (arrKeys && arrKeys.has(key))) {
                    emptyMirror = [];
                }
                DM._cache[key] = emptyMirror;
                DM._trustedCacheKeys.add(key);
                if (key === DM.KEYS.ATTENDANCE && typeof DM._clearAttendanceDerivedCaches === 'function') {
                    DM._clearAttendanceDerivedCaches();
                }
                DM._emitDataChangedEvent(key, 'firebase-listener');
                this._mirrorRemoteToDisk(key, emptyMirror == null ? {} : emptyMirror);
                if (typeof DM._mirrorToLocalOrIDB === 'function') {
                    void DM._mirrorToLocalOrIDB(key, Array.isArray(emptyMirror) ? emptyMirror : []).catch(() => {});
                }
                return;
            }
            const toStore = typeof DM.coerceRealtimeSnapshotValue === 'function'
                ? DM.coerceRealtimeSnapshotValue(key, val)
                : val;
            DM._cache[key] = toStore;
            if (DM.KEYS && key === DM.KEYS.CHALLANS) {
                DM._cache['challans'] = toStore;
            }
            DM._trustedCacheKeys.add(key);
            if (key === DM.KEYS.ATTENDANCE && typeof DM._clearAttendanceDerivedCaches === 'function') {
                DM._clearAttendanceDerivedCaches();
            }
            const emitKey = DM.KEYS && key === DM.KEYS.CHALLANS ? 'challans' : key;
            DM._emitDataChangedEvent(emitKey, 'firebase-listener');
            this._mirrorRemoteToDisk(key, toStore);
            if (typeof DM._mirrorToLocalOrIDB === 'function') {
                void DM._mirrorToLocalOrIDB(key, toStore).catch(() => {});
            }
        } catch (e) {
            console.warn('[FileStorage] Realtime merge failed:', key, e && e.message);
        }
    },

    _mirrorRemoteToDisk(key, toStore) {
        if (!window.electronAPI) return;
        const heavy = this._rtdbHeavyMirrorKeys();
        const syncing = !!(window.SyncManager && window.SyncManager.status === 'syncing');
        const deferDisk = syncing && heavy.has(key);
        const run = () => {
            FileStorage.markMirrorWriteFromRtdb(key);
            window.electronAPI.saveData(key, toStore)
                .then((res) => {
                    if (!res || !res.success) FileStorage.unmarkMirrorWriteFromRtdb(key);
                })
                .catch((e) => {
                    FileStorage.unmarkMirrorWriteFromRtdb(key);
                    console.warn('[FileStorage] Mirror RTDB to local disk failed:', key, e && e.message);
                });
        };
        if (deferDisk) {
            setTimeout(run, 2800);
        } else {
            run();
        }
    },

    markMirrorWriteFromRtdb(key) {
        if (key) this._mirrorWriteKeys.add(key);
    },
    unmarkMirrorWriteFromRtdb(key) {
        if (key) this._mirrorWriteKeys.delete(key);
    },
    /** @returns {boolean} true if this file change was our RTDB→disk mirror (consume one-shot). */
    consumeMirrorWriteFromRtdb(baseKey) {
        if (!baseKey || !this._mirrorWriteKeys.has(baseKey)) return false;
        this._mirrorWriteKeys.delete(baseKey);
        return true;
    },

    /**
     * Large JSON list keys: after local/IDB persistence, uploading the full array to RTDB can take
     * seconds and block the next paint. Match attendance: fire-and-forget .set; local copy is
     * already safe on Electron; web has DataManager's IndexedDB mirror.
     */
    _deferredRtdbKeys() {
        if (this._deferredRtdbKeySet) return this._deferredRtdbKeySet;
        // For "sync on every edit across all devices", treat all realtime watch keys
        // as deferred background uploads (debounced) to avoid UI lag.
        const s = new Set();
        try {
            const DM = window.DataManager;
            if (DM && typeof DM.getRealtimeWatchKeys === 'function') {
                DM.getRealtimeWatchKeys().forEach((k) => s.add(k));
            } else if (DM && DM.KEYS) {
                // Fallback minimal set
                const K = DM.KEYS;
                [K.ATTENDANCE, K.VOUCHERS, K.INVOICES, K.EXPENSES, K.EMPLOYEES].filter(Boolean).forEach((k) => s.add(k));
            }
        } catch (_) { /* ignore */ }
        this._deferredRtdbKeySet = s;
        return s;
    },

    /** Keys that must reach Firebase quickly for desktop ↔ web sync. */
    _priorityCloudSyncKeys() {
        if (this._priorityCloudKeySet) return this._priorityCloudKeySet;
        const s = new Set(['invoices', 'vouchers', 'customers', 'purchases', 'gtes_expenses', 'challans', 'gtes_challans']);
        try {
            const DM = window.DataManager;
            if (DM && DM.KEYS) {
                if (DM.KEYS.INVOICES) s.add(DM.KEYS.INVOICES);
                if (DM.KEYS.VOUCHERS) s.add(DM.KEYS.VOUCHERS);
                if (DM.KEYS.EXPENSES) s.add(DM.KEYS.EXPENSES);
                if (DM.KEYS.CHALLANS) s.add(DM.KEYS.CHALLANS);
            }
        } catch (_) { /* ignore */ }
        this._priorityCloudKeySet = s;
        return s;
    },

    _scheduleCloudSet(key, data, opts = {}) {
        const priority = this._priorityCloudSyncKeys().has(key);
        const debounceMs = Number(opts.debounceMs ?? (priority ? 380 : 500));
        const prev = this._pendingCloudSets.get(key);
        if (prev && prev.timer) clearTimeout(prev.timer);
        const next = {
            data,
            lastQueuedAt: Date.now(),
            timer: setTimeout(() => {
                // Fire-and-forget upload; onRemote listener on other devices will update their local mirrors.
                try {
                    window.db.ref(key).set(data)
                        .then(() => console.log(`✅ Cloud Sync [${key}]: Success`))
                        .catch((error) => console.error(`🚨 Cloud Sync Failed for ${key}:`, error));
                } catch (e) {
                    console.error(`🚨 Cloud Sync Failed for ${key}:`, e);
                } finally {
                    const cur = this._pendingCloudSets.get(key);
                    if (cur && cur.data === data) this._pendingCloudSets.delete(key);
                }
            }, Math.max(0, debounceMs))
        };
        this._pendingCloudSets.set(key, next);
    },

    async flushPendingCloudWrites(timeoutMs = 2000) {
        if (!this.isCloudReady || !window.db) return;
        const entries = Array.from(this._pendingCloudSets.entries());
        if (!entries.length) return;
        // Clear timers and push immediately
        this._pendingCloudSets.clear();
        const start = Date.now();
        const pushes = entries.map(([key, v]) => {
            try {
                if (v && v.timer) clearTimeout(v.timer);
                return window.db.ref(key).set(v.data);
            } catch (e) {
                return Promise.reject(e);
            }
        });
        try {
            await Promise.race([
                Promise.allSettled(pushes),
                new Promise((resolve) => setTimeout(resolve, Math.max(0, timeoutMs)))
            ]);
        } catch (_) { /* ignore */ }
        const elapsed = Date.now() - start;
        if (elapsed > timeoutMs) {
            console.warn('[FileStorage] flushPendingCloudWrites timed out');
        }
    },

    async init() {
        if (typeof window.db === 'undefined') {
            console.error("Realtime DB not initialized.");
            return false;
        }
        // Finish Firebase Anonymous Auth before any RTDB read, or security
        // rules that require `auth != null` will deny every path.
        if (window.firebaseAuthReady) {
            try {
                const ar = await window.firebaseAuthReady;
                if (!ar || !ar.ok) {
                    console.warn(
                        '[FileStorage] Firebase Anonymous Auth did not succeed — cloud sync may show permission_denied. ' +
                        'Enable Anonymous in Firebase Console (Authentication → Sign-in method).'
                    );
                }
            } catch (e) {
                console.warn('[FileStorage] firebaseAuthReady error:', e && e.message);
            }
        }
        this.isCloudReady = true;
        console.log("☁️ Realtime Database cloud connection active.");
        // Best-effort flush on page/app close so last edits are not lost.
        if (!this._flushHooked) {
            this._flushHooked = true;
            window.addEventListener('beforeunload', () => {
                try { void this.flushPendingCloudWrites(1500); } catch (_) { }
            });
        }
        // Defer RTDB listeners until after first paint + boot grace (large snapshots block the main thread).
        const attachDelay = () => {
            try {
                this.attachRealtimeListeners();
            } catch (e) {
                console.warn('[FileStorage] attachRealtimeListeners error:', e && e.message);
            }
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => setTimeout(attachDelay, 5000), { timeout: 12000 });
        } else {
            setTimeout(attachDelay, 8000);
        }
        return true;
    },

    /**
     * Live sync: when another device writes to RTDB, refresh local cache + UI.
     * Requires database rules that allow auth != null (see database.rules.json).
     */
    attachRealtimeListeners() {
        if (this._realtimeListenersAttached || !window.db || !this.isCloudReady) return;
        const DM = window.DataManager;
        if (!DM || !DM.KEYS) return;

        const watchKeys = typeof DM.getRealtimeWatchKeys === 'function'
            ? DM.getRealtimeWatchKeys()
            : [DM.KEYS.ATTENDANCE, DM.KEYS.EMPLOYEES, 'gtes_users'];

        const onRemote = (key, snap) => {
            try {
                this._scheduleRemoteApply(key, snap);
            } catch (e) {
                console.warn('[FileStorage] Realtime schedule failed:', key, e && e.message);
            }
        };

        const errOnce = (key, err) => {
            const code = err && (err.code || err.message || '');
            const denied = String(code).indexOf('PERMISSION') !== -1 || String(code).indexOf('permission') !== -1;
            if (denied && !FileStorage._permissionDeniedHintShown) {
                FileStorage._permissionDeniedHintShown = true;
                console.warn(
                    '[FileStorage] Realtime Database rules denied access. Publish rules from database.rules.json ' +
                    '(see database.rules.README.txt in the repo). Until then, cloud sync and live updates are disabled.'
                );
            }
        };

        watchKeys.forEach((key) => {
            try {
                window.db.ref(key).on(
                    'value',
                    (snap) => onRemote(key, snap),
                    (err) => errOnce(key, err)
                );
            } catch (e) {
                console.warn('[FileStorage] Could not attach listener for', key, e && e.message);
            }
        });

        this._realtimeListenersAttached = true;
        console.log('[FileStorage] Realtime listeners attached for:', watchKeys.join(', '));
    },

    async saveData(key, data) {
        let localSuccess = false;
        // Handle Electron first (Local Persistence)
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.saveData(key, data);
                if (result && result.success) {
                    console.log(`✅ Local File Sync [${key}]: Success`);
                    localSuccess = true;
                } else {
                    console.error(`🚨 Local File Sync Failed for ${key}:`, result?.error);
                }
            } catch (err) {
                console.error(`🚨 Electron IPC Error during save for ${key}:`, err);
            }
        }

        // Handle Cloud Persistence
        if (!this.isCloudReady) {
            if (!window.electronAPI) {
                console.warn("Cloud DB not ready. Saving to localStorage.");
                localStorage.setItem(key, JSON.stringify(data));
                return true; // Data was persisted; callers must not treat this as failure
            }
            return localSuccess; // Electron file write only — reflect actual file result
        }

        const deferSet = this._deferredRtdbKeys();
        const canUpload = (window.electronAPI ? localSuccess : true);
        if (canUpload) {
            // Always background-upload for realtime cross-device sync; debounced to avoid lag.
            const isDeferred = deferSet.has(key);
            const priority = this._priorityCloudSyncKeys().has(key);
            this._scheduleCloudSet(key, data, {
                debounceMs: priority ? 380 : (isDeferred ? 400 : 280)
            });
            return true;
        }
        return localSuccess;
    },

    async loadData(key) {
        // Handle Electron first
        let localData = null;
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.loadData(key);
                if (result && result.success) {
                    // If the main process returned a raw string (optimization for large files), parse it here
                    if (result.isRaw && typeof result.data === 'string') {
                        try {
                            localData = JSON.parse(result.data);
                        } catch (pe) {
                            console.error(`[FileStorage] Failed to parse raw data for '${key}':`, pe);
                            localData = null;
                        }
                    } else {
                        localData = result.data;
                    }
                } else if (result && !result.success) {
                    console.warn(`[FileStorage] Local File load failed for '${key}':`, result?.error);
                }
                // Missing local file / first run: no warning — cloud fetch below is normal.
            } catch (err) {
                console.error(`[FileStorage] Electron IPC Error during load for ${key}:`, err);
            }
        }

        if (!this.isCloudReady) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                console.warn(`[FileStorage] Corrupt localStorage for '${key}', ignoring:`, e);
                return null;
            }
        }

        const DM = window.DataManager;
        const arrayKey =
            !!(DM && typeof DM._keysStoredAsArrays === 'function' && DM._keysStoredAsArrays().has(key));
        const toArr = (v) => {
            if (!arrayKey || !DM || typeof DM.coerceJsonArray !== 'function') return v;
            return DM.coerceJsonArray(v);
        };

        try {
            // Routine; use debug so DevTools default level stays quiet (enable Verbose to see).
            console.debug(`[FileStorage] Fetching '${key}' from Realtime Database…`);
            const snapshot = await window.db.ref(key).once('value');
            if (!snapshot.exists()) {
                return arrayKey ? toArr(localData) : localData;
            }

            const cloudRaw = snapshot.val();
            const cloudArr = arrayKey ? toArr(cloudRaw) : cloudRaw;

            if (window.electronAPI) {
                const locArr = arrayKey ? toArr(localData) : localData;
                if (
                    arrayKey &&
                    Array.isArray(locArr) &&
                    Array.isArray(cloudArr) &&
                    DM &&
                    typeof DM._mergeRecordArraysById === 'function'
                ) {
                    return DM._mergeRecordArraysById(locArr, cloudArr, key);
                }
                if (arrayKey && Array.isArray(cloudArr)) return cloudArr;
                if (arrayKey && Array.isArray(locArr)) return locArr;
                return cloudArr;
            }

            return cloudArr;
        } catch (error) {
            const code = error && error.code;
            const msg = error && error.message ? String(error.message) : '';
            const denied = code === 'PERMISSION_DENIED' || msg.indexOf('permission_denied') !== -1;
            if (denied) {
                if (!FileStorage._permissionDeniedHintShown) {
                    FileStorage._permissionDeniedHintShown = true;
                    console.warn(
                        `[FileStorage] permission_denied for Realtime Database (example: ${key}). ` +
                        'Anonymous auth is working, but Database Rules must allow authenticated users. ' +
                        'In Firebase Console → Realtime Database → Rules, publish the JSON from database.rules.json ' +
                        '(see database.rules.README.txt in this repository).'
                    );
                } else {
                    console.debug(`[FileStorage] permission_denied for '${key}' (rules not updated yet)`);
                }
            } else {
                console.error(`Error loading ${key} from Cloud:`, error);
            }
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                console.warn(`[FileStorage] Corrupt localStorage fallback for '${key}':`, e);
                return localData;
            }
        }
    }
};
