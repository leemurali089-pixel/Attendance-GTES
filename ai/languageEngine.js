/**
 * Detects Tamil / English from user input and controls response language.
 */
const LanguageEngine = {
    _sessionLang: null,
    _tamilScriptDetected: false,

    TAMIL_SCRIPT_RE: /[\u0B80-\u0BFF]/,
    TAMIL_MARKERS: [
        'evlo', 'enna', 'pannu', 'podu', 'kaatu', 'seri', 'sari', 'aama', 'aamam',
        'illai', 'venda', 'innal', 'innalai', 'inniku', 'naalai', 'yaar', 'ukku',
        'ukka', 'solu', 'paru', 'eduthu', 'nillu', 'pending', 'niluvai', 'varugai',
        'sambalam', 'thask', 'invoice', 'customer'
    ],
    ENGLISH_REQUEST_RE: /\b(?:in\s+)?english\b|english\s+la|speak\s+english|reply\s+in\s+english|answer\s+in\s+english/i,
    TAMIL_REQUEST_RE: /\btamil\s+la\b|tamil\s+il|தமிழில்|tamil\s+only/i,

    detect(text) {
        const raw = String(text || '').trim();
        if (!raw) return this._sessionLang || 'en';

        if (this.ENGLISH_REQUEST_RE.test(raw)) {
            this._sessionLang = 'en';
            this._persist('en');
            return 'en';
        }
        if (this.TAMIL_REQUEST_RE.test(raw)) {
            this._sessionLang = 'ta';
            this._persist('ta');
            return 'ta';
        }

        if (this.TAMIL_SCRIPT_RE.test(raw)) {
            this._tamilScriptDetected = true;
            this._sessionLang = 'ta';
            this._persist('ta');
            return 'ta';
        }

        const t = raw.toLowerCase();
        const tanglishHits = this.TAMIL_MARKERS.filter((w) => t.includes(w)).length;
        if (tanglishHits >= 2 || (tanglishHits >= 1 && /\b(ku|ukku|pannu|podu|kaatu|evlo|enna)\b/.test(t))) {
            this._sessionLang = 'ta';
            this._persist('ta');
            return 'ta';
        }

        if (/^[a-z0-9\s.,!?'"-]+$/i.test(raw) && tanglishHits === 0) {
            this._sessionLang = 'en';
            return 'en';
        }

        this._sessionLang = this._sessionLang || 'ta';
        return this._sessionLang;
    },

    getResponseLang() {
        if (this._sessionLang) return this._sessionLang;
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        return s.responseLang === 'en' ? 'en' : 'ta';
    },

    getSpeechInputMode() {
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        return s.speechInputLang || 'auto';
    },

    setSpeechInputMode(mode) {
        const m = mode === 'ta' ? 'ta' : (mode === 'en' ? 'en' : 'auto');
        if (typeof MemoryManager !== 'undefined') {
            const s = MemoryManager.getSettings();
            s.speechInputLang = m;
            MemoryManager.saveSettings(s);
        }
        if (typeof VoiceDiagnostics !== 'undefined') VoiceDiagnostics.refresh();
    },

    cycleSpeechInputMode() {
        const order = ['auto', 'en', 'ta'];
        const cur = this.getSpeechInputMode();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        this.setSpeechInputMode(next);
        return next;
    },

    getSpeechRecognitionLang() {
        const mode = this.getSpeechInputMode();
        if (mode === 'en') return 'en-IN';
        if (mode === 'ta') return 'ta-IN';
        return this._tamilScriptDetected ? 'ta-IN' : 'en-IN';
    },

    getSpeechInputModeLabel() {
        const m = this.getSpeechInputMode();
        if (m === 'ta') return 'தமிழ் IN';
        if (m === 'en') return 'EN-IN';
        return 'Auto';
    },

    getSpeechSynthesisLang() {
        return this.getResponseLang() === 'ta' ? 'ta-IN' : 'en-IN';
    },

    setResponseLang(lang) {
        this._sessionLang = lang === 'en' ? 'en' : 'ta';
        this._persist(this._sessionLang);
    },

    _persist(lang) {
        if (typeof MemoryManager === 'undefined') return;
        const s = MemoryManager.getSettings();
        s.responseLang = lang;
        s.lastDetectedLang = lang;
        MemoryManager.saveSettings(s);
    },

    label(lang) {
        return (lang || this.getResponseLang()) === 'ta' ? 'தமிழ்' : 'English';
    },

    /** Tamil digit ௦-௯ → ASCII */
    TAMIL_DIGIT_MAP: { '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4', '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9' },

    TAMIL_NUMBER_WORDS: {
        'பூஜ்ஜியம்': 0, 'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4,
        'ஐந்து': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10
    },

    /** Map Tamil script tokens → Tanglish/English parse tokens */
    TAMIL_PHRASE_MAP: [
        ['இன்றைய சுருக்கம்', 'today summary'],
        ['இன்று என்ன நிலை', 'today summary'],
        ['daily summary', 'daily summary'],
        ['today briefing', 'today summary'],
        ['today summary', 'today summary'],
        ['அவான் ஆக்சிஜன்', 'avon oxygen'],
        ['அண்ணாதுரை', 'annadurai'],
        ['யார் வரவில்லை', 'yaar varala'],
        ['வரவில்லை', 'varala'],
        ['வருகை பட்டியல்', 'attendance list'],
        ['வருகை பதிவு செய்', 'attendance podu'],
        ['வருகை பதிவு', 'attendance podu'],
        ['நிலுவை எவ்வளவு', 'niluvai evlo'],
        ['நிலுவை', 'niluvai'],
        ['எவ்வளவு', 'evlo'],
        ['வருகை', 'attendance'],
        ['பட்டியல்', 'list'],
        ['பதிவு செய்', 'podu'],
        ['பதிவு', 'podu'],
        ['சம்பளம்', 'salary'],
        ['சுருக்கம்', 'summary'],
        ['இன்றைய', 'today'],
        ['இன்று', 'today inniku'],
        ['நேற்று', 'yesterday innal'],
        ['நாளை', 'tomorrow naalai'],
        ['இந்த மாதம்', 'this month'],
        ['இந்த மாத', 'this month'],
        ['கடந்த மாதம்', 'last month'],
        ['கடந்த மாத', 'last month'],
        ['யார்', 'yaar who']
    ],

    extractTamilNumber(text) {
        let s = String(text || '');
        s = s.replace(/[\u0BE6-\u0BEF]/g, (ch) => this.TAMIL_DIGIT_MAP[ch] || ch);
        for (const [word, val] of Object.entries(this.TAMIL_NUMBER_WORDS)) {
            if (s.includes(word)) return val;
        }
        const m = s.match(/\b(\d+(?:\.\d+)?)\b/);
        return m ? parseFloat(m[1]) : null;
    },

    /** Normalize Tamil script + date words before intent regex matching.
     *  @param {string} rawText - The raw text to normalize.
     *  @param {boolean} [isInternal=false] - When true (called from TamilCommandRegistry.normalize),
     *    skip the TamilCommandRegistry.normalize() call-back to prevent mutual recursion.
     */
    normalizeForParse(rawText, isInternal = false) {
        let s = String(rawText || '').trim();
        const slots = {};
        const hadTamilScript = this.TAMIL_SCRIPT_RE.test(s);

        if (hadTamilScript) {
            const sorted = this.TAMIL_PHRASE_MAP.slice().sort((a, b) => b[0].length - a[0].length);
            for (const [tamil, token] of sorted) {
                if (s.includes(tamil)) s = s.split(tamil).join(` ${token} `);
            }
            s = s.replace(/[\u0BE6-\u0BEF]/g, (ch) => this.TAMIL_DIGIT_MAP[ch] || ch);
        }

        const lower = s.toLowerCase();
        if (/\b(today|inniku|innalai|இன்று|இன்றைய)\b/i.test(s) || /\btoday\b/.test(lower)) slots.when = 'today';
        if (/\b(yesterday|innal|innalai|நேற்று)\b/i.test(s) || /\byesterday\b/.test(lower)) slots.when = 'yesterday';
        if (/\b(tomorrow|naalai|நாளை)\b/i.test(s) || /\btomorrow\b/.test(lower)) slots.when = 'tomorrow';
        if (/\b(this\s+month|இந்த\s*மாத)\b/i.test(s)) slots.monthScope = 'this_month';
        if (/\b(last\s+month|கடந்த\s*மாத)\b/i.test(s)) slots.monthOffset = -1;

        // Guard: when called internally (from TamilCommandRegistry.normalize → here),
        // skip calling TamilCommandRegistry.normalize() again to prevent mutual recursion.
        if (!isInternal && typeof TamilCommandRegistry !== 'undefined') {
            s = TamilCommandRegistry.normalize(s, true);
        } else {
            s = lower.replace(/[.,!?'\"`]/g, ' ').replace(/\s+/g, ' ').trim();
        }

        return { text: s, slots, hadTamilScript };
    },

    normalizeTamil(rawText) {
        return this.normalizeForParse(rawText).text;
    }
};

window.LanguageEngine = LanguageEngine;
