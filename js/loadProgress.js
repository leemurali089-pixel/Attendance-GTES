/**
 * Centralized global loader: percentage, elapsed time, stage text, a11y updates.
 * Used for cold boot (App.init) and view transitions (App.showView).
 */
(function (global) {
    const MODE_SIMPLE = 'simple';
    const MODE_BOOT = 'boot';
    const MODE_PAGE = 'page';

    const GTESLoadProgress = {
        MODE_SIMPLE,
        MODE_BOOT,
        MODE_PAGE,

        _mode: MODE_SIMPLE,
        _elapsedTimer: null,
        _synthTimer: null,
        _elapsedStart: 0,
        _synthPct: 4,

        getMode() {
            return this._mode;
        },

        _loader() {
            return document.getElementById('globalLoader');
        },

        _els() {
            return {
                pEl: document.getElementById('globalLoaderPct'),
                bar: document.getElementById('globalLoaderProgressBar'),
                st: document.getElementById('globalLoaderStage'),
                elp: document.getElementById('globalLoaderElapsed'),
                live: document.getElementById('globalLoaderLive'),
            };
        },

        setProgress(pct, stageText) {
            const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
            const stage = stageText != null ? String(stageText) : 'Loading…';
            const { pEl, bar, st, live, elp } = this._els();
            if (pEl) {
                pEl.textContent = `${n}%`;
                pEl.setAttribute('aria-label', `${n} percent`);
            }
            if (bar) {
                bar.style.width = `${n}%`;
                bar.setAttribute('aria-valuenow', String(n));
                bar.setAttribute('aria-valuetext', `${stage}, ${n} percent`);
            }
            if (st) st.textContent = stage;
            const elapsedTxt = elp ? elp.textContent.trim() : '';
            if (live && (this._mode === MODE_BOOT || this._mode === MODE_PAGE)) {
                live.textContent = `${stage}. ${n}% complete. Elapsed ${elapsedTxt || '0.0s'}.`;
            }
        },

        _tickElapsed() {
            const el = document.getElementById('globalLoaderElapsed');
            if (el) el.textContent = `${((performance.now() - this._elapsedStart) / 1000).toFixed(1)}s`;
            if (this._mode === MODE_BOOT || this._mode === MODE_PAGE) {
                const { pEl, st, live, elp } = this._els();
                const n = pEl ? parseInt(String(pEl.textContent).replace(/[^\d]/g, ''), 10) : 0;
                const safeN = Number.isFinite(n) ? n : 0;
                const stage = st ? st.textContent : 'Loading…';
                const elapsedTxt = elp ? elp.textContent.trim() : '';
                if (live) live.textContent = `${stage}. ${safeN}% complete. Elapsed ${elapsedTxt || '0.0s'}.`;
            }
        },

        startElapsed() {
            this.stopElapsed();
            this._elapsedStart = performance.now();
            this._tickElapsed();
            this._elapsedTimer = setInterval(() => this._tickElapsed(), 200);
        },

        stopElapsed() {
            if (this._elapsedTimer) {
                clearInterval(this._elapsedTimer);
                this._elapsedTimer = null;
            }
        },

        startSyntheticPageProgress() {
            this.stopSyntheticPageProgress();
            this._synthPct = Math.min(88, Math.max(4, this._synthPct));
            this._synthTimer = setInterval(() => {
                if (this._mode !== MODE_PAGE) return;
                const cap = 88;
                if (this._synthPct >= cap) return;
                this._synthPct = Math.min(cap, this._synthPct + Math.random() * 8 + 2);
                const { st } = this._els();
                const label = st ? st.textContent : 'Loading…';
                this.setProgress(Math.round(this._synthPct), label);
            }, 400);
        },

        stopSyntheticPageProgress() {
            if (this._synthTimer) {
                clearInterval(this._synthTimer);
                this._synthTimer = null;
            }
        },

        /**
         * @param {'simple'|'boot'|'page'} mode
         * @param {{ stage?: string }} [opts]
         */
        enter(mode, opts) {
            const loader = this._loader();
            if (!loader) return;
            this._mode = mode;
            if (mode === MODE_SIMPLE) {
                loader.classList.remove('gtes-loader-detailed', 'gtes-loader-page');
                loader.setAttribute('aria-busy', 'false');
                this.stopElapsed();
                this.stopSyntheticPageProgress();
                return;
            }
            loader.classList.add('gtes-loader-detailed');
            loader.setAttribute('aria-busy', 'true');
            if (mode === MODE_PAGE) {
                loader.classList.add('gtes-loader-page');
                this._synthPct = 4;
                const stage = (opts && opts.stage) || 'Opening…';
                this.setProgress(4, stage);
                this.startElapsed();
                this.startSyntheticPageProgress();
            } else if (mode === MODE_BOOT) {
                loader.classList.remove('gtes-loader-page');
                this.startElapsed();
            }
        },

        completePage() {
            if (this._mode !== MODE_PAGE) return;
            this.stopSyntheticPageProgress();
            this.setProgress(100, 'Ready');
        },

        leave() {
            this.stopElapsed();
            this.stopSyntheticPageProgress();
            const loader = this._loader();
            if (loader) {
                loader.classList.remove('gtes-loader-detailed', 'gtes-loader-page');
                loader.setAttribute('aria-busy', 'false');
            }
            this._mode = MODE_SIMPLE;
        },
    };

    global.GTESLoadProgress = GTESLoadProgress;
})(typeof window !== 'undefined' ? window : globalThis);
