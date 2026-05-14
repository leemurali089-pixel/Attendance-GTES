/**
 * Centralized global loader: percentage, estimated time remaining, stage text, a11y updates.
 * Used for cold boot (App.init) and view transitions (App.showView).
 */
(function (global) {
    const MODE_SIMPLE = 'simple';
    const MODE_BOOT = 'boot';
    const MODE_PAGE = 'page';

    /** Linear extrapolation from current %; capped so tiny % does not show absurd ETAs. */
    const ETA_CAP_SEC = 600;

    function _formatEtaRemaining(elapsedSec, pct) {
        if (pct >= 100) return 'Done';
        if (pct >= 98) return '~a few seconds';
        if (pct < 2) {
            return 'Estimating…';
        }
        const p = pct / 100;
        let rem = elapsedSec / p - elapsedSec;
        if (!Number.isFinite(rem) || rem < 0) return '—';
        const capped = rem > ETA_CAP_SEC;
        rem = Math.min(rem, ETA_CAP_SEC);
        if (rem < 8) return `~${Math.max(0, Math.round(rem))}s left`;
        if (rem < 90) return `~${Math.round(rem)}s left`;
        const m = Math.floor(rem / 60);
        const s = Math.round(rem % 60);
        const base = `~${m}m ${String(s).padStart(2, '0')}s left`;
        return capped ? `${base} (or more)` : base;
    }

    function _liveEtaPhrase(etaShort, pct) {
        if (pct >= 100) return 'complete';
        if (pct >= 98) return 'about a few seconds remaining';
        if (pct < 2) return 'estimating time remaining';
        if (etaShort === '—') return 'time remaining unknown';
        if (etaShort === 'Estimating…' || etaShort === 'Done') return etaShort === 'Done' ? 'complete' : 'estimating time remaining';
        const t = etaShort
            .replace(/^~\s*/, '')
            .replace(/\s*\(or more\)$/, '')
            .trim()
            .replace(/\s+left$/i, '')
            .trim();
        return `about ${t} remaining`;
    }

    const GTESLoadProgress = {
        MODE_SIMPLE,
        MODE_BOOT,
        MODE_PAGE,

        _mode: MODE_SIMPLE,
        _elapsedTimer: null,
        _synthTimer: null,
        _elapsedStart: 0,
        _synthPct: 4,
        _currentPct: 0,

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
                eta: document.getElementById('globalLoaderEta') || document.getElementById('globalLoaderElapsed'),
                live: document.getElementById('globalLoaderLive'),
            };
        },

        setProgress(pct, stageText) {
            const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
            this._currentPct = n;
            const stage = stageText != null ? String(stageText) : 'Loading…';
            const { pEl, bar, st, live, eta } = this._els();
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
            const elapsedSec =
                this._elapsedTimer == null ? 0 : Math.max(0, (performance.now() - this._elapsedStart) / 1000);
            const etaShort = _formatEtaRemaining(elapsedSec, n);
            if (eta) eta.textContent = etaShort;
            if (live && (this._mode === MODE_BOOT || this._mode === MODE_PAGE)) {
                live.textContent = `${stage}. ${n}% complete. ${_liveEtaPhrase(etaShort, n)}.`;
            }
        },

        _tickElapsed() {
            const elapsedSec =
                this._elapsedTimer == null ? 0 : Math.max(0, (performance.now() - this._elapsedStart) / 1000);
            const n = this._currentPct;
            const etaShort = _formatEtaRemaining(elapsedSec, n);
            const el = document.getElementById('globalLoaderEta') || document.getElementById('globalLoaderElapsed');
            if (el) el.textContent = etaShort;
            if (this._mode === MODE_BOOT || this._mode === MODE_PAGE) {
                const { st, live } = this._els();
                const safeN = Number.isFinite(n) ? n : 0;
                const stage = st ? st.textContent : 'Loading…';
                if (live) live.textContent = `${stage}. ${safeN}% complete. ${_liveEtaPhrase(etaShort, safeN)}.`;
            }
        },

        startElapsed() {
            this.stopElapsed();
            this._elapsedStart = performance.now();
            this._currentPct = 0;
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
                this.startElapsed();
                this.setProgress(4, stage);
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
