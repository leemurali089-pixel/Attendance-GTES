// File Storage Module - Firebase Realtime Database Integration
const FileStorage = {
    isCloudReady: false,
    _permissionDeniedHintShown: false,
    _realtimeListenersAttached: false,
    /** Keys we are writing to disk to mirror RTDB → ignore matching fs.watch invalidation (see syncManager). */
    _mirrorWriteKeys: new Set(),

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
        const s = new Set();
        if (window.DataManager && window.DataManager.KEYS) {
            const K = window.DataManager.KEYS;
            if (K.ATTENDANCE) s.add(K.ATTENDANCE);
            if (K.VOUCHERS) s.add(K.VOUCHERS);
            if (K.INVOICES) s.add(K.INVOICES);
            if (K.EXPENSES) s.add(K.EXPENSES);
        }
        this._deferredRtdbKeySet = s;
        return s;
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
        // Defer dozens of .on('value') listeners to the next task so the UI can paint (login form)
        // before the browser processes every subscription callback in one long synchronous stretch.
        setTimeout(() => {
            try {
                this.attachRealtimeListeners();
            } catch (e) {
                console.warn('[FileStorage] attachRealtimeListeners error:', e && e.message);
            }
        }, 0);
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
                if (!snap.exists()) {
                    DM.invalidateDataCache(key);
                    const arrKeys = typeof DM._keysStoredAsArrays === 'function' ? DM._keysStoredAsArrays() : null;
                    let emptyMirror = null;
                    if (key === 'gtes_users' || (arrKeys && arrKeys.has(key))) {
                        emptyMirror = [];
                    } else {
                        emptyMirror = null;
                    }
                    DM._cache[key] = emptyMirror;
                    DM._trustedCacheKeys.add(key);
                    if (key === DM.KEYS.ATTENDANCE && typeof DM._clearAttendanceDerivedCaches === 'function') {
                        DM._clearAttendanceDerivedCaches();
                    }
                    DM._emitDataChangedEvent(key, 'firebase-listener');
                    if (window.electronAPI) {
                        const payload = emptyMirror == null ? {} : emptyMirror;
                        FileStorage.markMirrorWriteFromRtdb(key);
                        window.electronAPI.saveData(key, payload)
                            .then((res) => {
                                if (!res || !res.success) FileStorage.unmarkMirrorWriteFromRtdb(key);
                            })
                            .catch((e) => {
                                FileStorage.unmarkMirrorWriteFromRtdb(key);
                                console.warn('[FileStorage] Mirror empty RTDB to local disk failed:', key, e && e.message);
                            });
                    }
                    if (typeof DM._mirrorToLocalOrIDB === 'function') {
                        void DM._mirrorToLocalOrIDB(key, Array.isArray(emptyMirror) ? emptyMirror : []).catch(() => {});
                    }
                    return;
                }
                // Do not invalidate before assigning: clearing the cache lets a concurrent loadData()
                // fall through to Electron/local JSON and repopulate stale rows before this write lands.
                const val = snap.val();
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

                // Electron: keep local JSON in sync with RTDB so loadData() + file watcher never
                // re-merge stale on-disk rows over fresher cloud edits from another device.
                if (window.electronAPI) {
                    FileStorage.markMirrorWriteFromRtdb(key);
                    window.electronAPI.saveData(key, toStore)
                        .then((res) => {
                            if (!res || !res.success) FileStorage.unmarkMirrorWriteFromRtdb(key);
                        })
                        .catch((e) => {
                            FileStorage.unmarkMirrorWriteFromRtdb(key);
                            console.warn('[FileStorage] Mirror RTDB to local disk failed:', key, e && e.message);
                        });
                }
                if (typeof DM._mirrorToLocalOrIDB === 'function') {
                    void DM._mirrorToLocalOrIDB(key, toStore).catch(() => {});
                }
            } catch (e) {
                console.warn('[FileStorage] Realtime merge failed:', key, e && e.message);
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
        const deferRtdb =
            deferSet.has(key) && ((window.electronAPI && localSuccess) || !window.electronAPI);
        if (deferRtdb) {
            window.db
                .ref(key)
                .set(data)
                .then(() => console.log(`✅ Cloud Sync [${key}]: Success`))
                .catch((error) => {
                    console.error(`🚨 Cloud Sync Failed for ${key}:`, error);
                    if (!window.electronAPI) {
                        try {
                            localStorage.setItem(key, JSON.stringify(data));
                        } catch (e) {
                            console.warn(`[FileStorage] localStorage fallback for '${key}' failed:`, e);
                        }
                    }
                });
            return true;
        }

        try {
            await window.db.ref(key).set(data);
            console.log(`✅ Cloud Sync [${key}]: Success`);
            return true;
        } catch (error) {
            console.error(`🚨 Cloud Sync Failed for ${key}:`, error);
            if (!window.electronAPI) {
                localStorage.setItem(key, JSON.stringify(data));
            }
            return localSuccess; // Still return true if local succeeded but cloud failed (partial success)
        }
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

        try {
            // Routine; use debug so DevTools default level stays quiet (enable Verbose to see).
            console.debug(`[FileStorage] Fetching '${key}' from Realtime Database…`);
            const snapshot = await window.db.ref(key).once('value');
            if (snapshot.exists()) {
                const cloudVal = snapshot.val();
                // If we're on desktop and have both local + cloud, prefer merged/newer for array datasets.
                if (window.electronAPI && localData != null) {
                    if (Array.isArray(localData) && Array.isArray(cloudVal) && window.DataManager && typeof window.DataManager._mergeRecordArraysById === 'function') {
                        return window.DataManager._mergeRecordArraysById(localData, cloudVal);
                    }
                    // For non-array (or if merge is not possible), prefer cloud as source of truth.
                    return cloudVal;
                }
                return cloudVal;
            }
            // No cloud value; fall back to local if any.
            return localData;
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
