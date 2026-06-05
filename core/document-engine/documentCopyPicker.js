/**
 * Document Engine V3 — multi-select copy type picker (Original, Duplicate, …, None).
 */
const DocumentCopyPicker = {
    TOGGLE_ID: 'gtesDocCopyToggle',
    MENU_ID: 'gtesDocCopyMenu',
    WRAP_ID: 'gtesDocCopyPicker',

    _bound: false,

    _checkboxes() {
        const menu = document.getElementById(this.MENU_ID);
        if (!menu) return [];
        return Array.from(menu.querySelectorAll('[data-gtes-doc-copy]'));
    },

    _labelFor(value) {
        if (value === 'none') return 'None';
        const row = DocumentSettings.COPY_TYPES.find((t) => t.value === value);
        return row ? row.label : value;
    },

    _updateToggle(types) {
        const btn = document.getElementById(this.TOGGLE_ID);
        if (!btn) return;
        const normalized = DocumentSettings.normalizeCopyTypes(types);
        if (!normalized.length) {
            btn.textContent = 'Copy';
            return;
        }
        if (normalized.length === 1) {
            btn.textContent = this._labelFor(normalized[0]);
            return;
        }
        btn.textContent = `${normalized.length} copies`;
        btn.title = normalized.map((t) => this._labelFor(t)).join(', ');
    },

    read() {
        const checked = this._checkboxes()
            .filter((el) => el.checked)
            .map((el) => el.getAttribute('data-gtes-doc-copy'))
            .filter(Boolean);
        return DocumentSettings.normalizeCopyTypes(checked);
    },

    sync(types) {
        const normalized = DocumentSettings.normalizeCopyTypes(types);
        const set = new Set(normalized);
        this._checkboxes().forEach((el) => {
            const v = el.getAttribute('data-gtes-doc-copy');
            el.checked = set.has(v);
        });
        this._updateToggle(normalized);
    },

    _onCheckboxChange(changedEl) {
        const value = changedEl?.getAttribute('data-gtes-doc-copy');
        if (value === 'none' && changedEl.checked) {
            this._checkboxes().forEach((el) => {
                if (el.getAttribute('data-gtes-doc-copy') !== 'none') el.checked = false;
            });
        } else if (value !== 'none' && changedEl?.checked) {
            const none = this._checkboxes().find((el) => el.getAttribute('data-gtes-doc-copy') === 'none');
            if (none) none.checked = false;
        }
        let types = this.read();
        if (!types.length) {
            const original = this._checkboxes().find((el) => el.getAttribute('data-gtes-doc-copy') === 'original');
            if (original) original.checked = true;
            types = ['original'];
        }
        this._updateToggle(types);
        return types;
    },

    bind(engine) {
        if (this._bound) return;
        this._bound = true;
        this._checkboxes().forEach((el) => {
            el.addEventListener('change', () => {
                this._onCheckboxChange(el);
                engine._onCopyTypesChanged();
            });
        });
    }
};

window.DocumentCopyPicker = DocumentCopyPicker;
