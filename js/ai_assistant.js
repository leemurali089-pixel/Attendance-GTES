/**
 * Global AI Assistant Module (Conversational Intent Router)
 * Handles Web Speech Recognition & translates intents via Gemini API with Memory
 */

const AIAssistant = {
    apiKey: 'AIzaSyAmohl6pxn9OjD02Kft-MwE4pteYWklzjI', // Default Key
    isListening: false,
    currentRecognition: null,
    conversationHistory: [], // Keeps track of context

    async init() {
        console.log("Global AIAssistant initialized.");
        
        // Load saved API key if available
        const savedSettings = DataManager.getData('ai_settings');
        if (savedSettings && savedSettings.apiKey) {
            this.apiKey = savedSettings.apiKey;
        }

        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            console.error("Speech Recognition is not supported in this browser.");
            App.showNotification("Your browser does not support Voice Recognition.", "error");
            return false;
        }
        // Warm up voices
        if (window.speechSynthesis) speechSynthesis.getVoices();
        return true;
    },

    showOverlay() {
        let overlay = document.getElementById('aiProcessingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'aiProcessingOverlay';
            overlay.className = 'ai-processing-overlay';
            overlay.innerHTML = `
                <div class="spinner-grow text-primary mb-3" style="width: 4rem; height: 4rem;" role="status"></div>
                <h2>AI Assistant is thinking...</h2>
                <div class="mt-3 w-75">
                    <input type="text" id="aiManualInput" class="form-control form-control-lg rounded-pill text-center" placeholder="Type command if mic fails..." style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">
                </div>
                <p class="text-white-50 mt-2" id="aiOverlayTranscript">Translating your request...</p>
                <div class="mt-4">
                    <button class="btn btn-outline-light rounded-pill px-4 mx-2" title="Settings" onclick="AIAssistant.showSettings()">
                        <i class="bi bi-gear-fill"></i>
                    </button>
                    <button class="btn btn-outline-light rounded-pill px-4 mx-2" onclick="AIAssistant.handleManualSubmit()">
                        <i class="bi bi-send me-1"></i> Send
                    </button>
                    <button class="btn btn-outline-light rounded-pill px-4 mx-2" onclick="AIAssistant.stopAll()">
                        <i class="bi bi-x-circle me-1"></i> Cancel
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);

            // Handle Enter key for manual input
            overlay.querySelector('#aiManualInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleManualSubmit();
            });
        }
        overlay.style.display = 'flex';
        const input = document.getElementById('aiManualInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    },

    async handleManualSubmit() {
        const input = document.getElementById('aiManualInput');
        if (!input || !input.value.trim()) return;
        
        const text = input.value.trim();
        this.updateOverlayText(`🧠 Processing: "${text}"`);
        this.conversationHistory.push(`User: ${text}`);
        this.trimHistory();
        
        try {
            const command = await this.processGlobalAI();
            await this.executeGlobalAction(command, document.getElementById('globalAIBtn'));
        } catch (err) {
            console.error("Manual AI Error:", err);
            this.speak("மன்னிக்கவும், எனக்கு புரியவில்லை.");
        }
    },

    async showSettings() {
        const newKey = prompt("Enter your Gemini API Key:", this.apiKey);
        if (newKey && newKey.trim()) {
            this.apiKey = newKey.trim();
            await DataManager.saveData('ai_settings', { apiKey: this.apiKey });
            App.showNotification("AI Settings Updated! Please refresh if it fails.", "success");
            this.updateOverlayText(`✅ New API key saved!\nReady to process: "${this.apiKey.substring(0, 10)}..."`);
        }
    },

    hideOverlay() {
        const overlay = document.getElementById('aiProcessingOverlay');
        if (overlay) overlay.style.display = 'none';
        this.setBtnState(document.getElementById('globalAIBtn'), 'idle');
    },

    updateOverlayText(text) {
        const p = document.getElementById('aiOverlayTranscript');
        if (p) p.innerText = text;
    },

    setBtnState(btn, state) {
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (state === 'listening') {
            btn.classList.add('listening');
            if (icon) icon.className = 'bi bi-mic-fill';
        } else {
            btn.classList.remove('listening');
            if (icon) icon.className = 'bi bi-magic';
        }
    },

    stopAll() {
        if (this.currentRecognition) this.currentRecognition.stop();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        this.conversationHistory = [];
        this.hideOverlay();
    },

    speak(text, callback) {
        if (!window.speechSynthesis) {
            if (callback) callback();
            return;
        }
        
        this.conversationHistory.push(`AI: ${text}`);
        this.trimHistory();

        this.updateOverlayText(`🗣️ Speaking: "${text}"`);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ta-IN'; // Tamil
        utterance.rate = 1.0;
        
        const voices = speechSynthesis.getVoices();
        const tamilVoice = voices.find(v => v.lang.includes('ta') || v.lang.includes('ta-IN'));
        if (tamilVoice) utterance.voice = tamilVoice;

        utterance.onend = () => { if (callback) callback(); };
        utterance.onerror = () => { if (callback) callback(); };

        window.speechSynthesis.speak(utterance);
    },

    trimHistory() {
        if (this.conversationHistory.length > 6) {
            this.conversationHistory.shift();
        }
    },

    /**
     * Start listening globally
     */
    async startListeningGlobal(btn) {
        // Mobile Permission & HTTPS Check
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile && !isSecure) {
            App.showNotification("Voice features require a secure (HTTPS) connection on mobile.", "warning");
            return;
        }

        if (!btn) btn = document.getElementById('globalAIBtn');
        if (!this.init()) return;

        // If clicking while listening/speaking, cancel it
        if (this.isListening) {
            this.stopAll();
            return;
        }

        if (window.speechSynthesis) window.speechSynthesis.cancel(); // Stop talking if we click mic

        this.setBtnState(btn, 'listening');
        this.showOverlay();
        this.updateOverlayText("Listening... \n(காது கொடுத்து கேட்கிறேன்)");

        const recognition = new window.SpeechRecognition();
        this.currentRecognition = recognition;
        recognition.lang = 'ta-IN'; 
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            this.isListening = true;
        };

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("Recognized text (Tamil):", transcript);
            
            this.setBtnState(btn, 'idle');
            this.updateOverlayText(`🧠 Thinking about: "${transcript}"`);
            
            this.conversationHistory.push(`User: ${transcript}`);
            this.trimHistory();

            try {
                const command = await this.processGlobalAI();
                console.log("AI Intent Router Resolved:", command);
                
                await this.executeGlobalAction(command, btn);
                
            } catch (err) {
                console.error("AI Routing Error:", err);
                this.speak("மன்னிக்கவும், எனக்கு புரியவில்லை. மீண்டும் சொல்லுங்கள்.", () => {
                    this.hideOverlay();
                });
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            this.isListening = false;
            this.setBtnState(btn, 'idle');
            
            if (event.error === 'network') {
                this.updateOverlayText("🚫 Microphone unavailable (Network Error).\nPlease type your command below:");
            } else if (event.error !== 'aborted') {
                this.updateOverlayText(`⚠️ Mic Error: ${event.error}. Please type instead:`);
            }
            // DO NOT hideOverlay() - Allow user to type!
        };

        recognition.onend = () => {
            this.isListening = false;
            // The overlay might stay open if we are processing or speaking
        };

        try {
            recognition.start();
        } catch(e) {
            console.error("Could not start recognition", e);
            this.setBtnState(btn, 'idle');
            this.hideOverlay();
        }
    },

    async processGlobalAI() {
        const models = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
        let lastErr = null;

        for (const model of models) {
            try {
                return await this.fetchGemini(model);
            } catch (err) {
                lastErr = err;
                console.warn(`Model ${model} failed, trying next...`, err);
                // Continue to next model even on 429, because quotas can be per-model
                continue;
            }
        }
        
        // Final failure diagnostic
        console.error("All AI models failed. Fetching list of available models for this key...");
        this.listAvailableModels().catch(() => {});
        throw lastErr;
    },

    async listAvailableModels() {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            console.log("AUTHORIZED MODELS FOR THIS KEY:", data.models?.map(m => m.name) || "None/Error");
            if (data.error) console.error("Model Listing Error:", data.error.message);
        } catch(e) { console.error("Could not fetch models list:", e); }
    },

    async fetchGemini(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;
        const today = new Date().toISOString().split('T')[0];
        
        let prompt = `You are a conversational Voice Assistant for "MJS PrimeLogic" ERP system.
You understand spoken Tamil and control the app via JSON commands.

IMPORTANT: You keep track of a conversation history. If the user's latest message doesn't contain all required data to complete an action, you must return a "clarify" action to ask them for the missing info in Tamil.

Current Date: ${today}

Conversation History (Oldest to Newest):
${this.conversationHistory.join('\n')}

Based on the history and the latest user message, figure out the intent. 
If information is missing (e.g., creating a task but no name/details), DO NOT guess. 
Instead, return: {"action": "clarify", "speechResponse": "யார் பேரில் டாஸ்க் உருவாக்க வேண்டும் என்று சொல்லுங்கள்"}

Possible Final Actions:

1. NAVIGATION
Use action: "navigate"
Parameters: "target" (can be: "dashboard", "hrms", "employees", "attendance", "salary", "admin", "tasks", "payments", "analytics", "jobcards", "delivery")
Example Tamil: "Analytics page open pannu" -> {"action": "navigate", "target": "analytics", "speechResponse": "அனலிட்டிக்ஸ் பக்கம் திறக்கப்படுகிறது"}

2. MARK ATTENDANCE
Use action: "mark_attendance"
Parameters: "employeeName" (string), "status" ("present", "absent", "half-day")
Example Tamil: "Rajesh absent inniki" -> {"action": "mark_attendance", "parameters": {"employeeName": "Rajesh", "status": "absent"}, "speechResponse": "ராஜேஷுக்கு ஆப்சென்ட் போடப்பட்டது"}

3. CREATE TASK
Required Parameters: "partyName" (string), "narration" (english translation)
Optional Parameters: "followupDate" (YYYY-MM-DD), "taskType" ("normal" or "payment_followup")
If required params are missing, return "clarify"!
Example: {"action":"create_task", "parameters":{"partyName":"Ramesh","narration":"Call and ask for payment","followupDate":"${this.calculateTomorrow()}","taskType":"payment_followup"}, "speechResponse": "ரமேஷ் பேரில் டாஸ்க் உருவாக்கப்பட்டது"}

4. CREATE JOB CARD
Required Parameters: "customerName" (string), "equipment" (english translation)
Optional Parameters: "problem" (english translation)
If required params missing, return "clarify"!
Example: {"action":"create_jobcard", "parameters":{"customerName":"Vignesh", "problem":"Laptop freezing issue", "equipment":"Laptop"}, "speechResponse": "விக்னேஷ் பேரில் ஜாப் கார்டு உருவாக்கப்பட்டது"}

Output strictly ONLY raw JSON.`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                console.error("Gemini API Full Error:", errorBody);
                const msg = errorBody.error?.message || response.statusText;
                throw new Error(`Gemini API error (${response.status}): ${msg}`);
            }

            const data = await response.json();
            let resultText = data.candidates[0].content.parts[0].text;
            resultText = resultText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
            
            return JSON.parse(resultText);
        } catch (err) {
            console.error("processGlobalAI Exception:", err);
            throw err;
        }
    },

    calculateTomorrow() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    },

    /**
     * Executes the translated Intent on the local application architecture
     */
    async executeGlobalAction(command, btn) {
        if (!command || !command.action) return;

        // Ensure we speak the response aloud
        const responseText = command.speechResponse || "சரி, செய்கிறேன்.";

        if (command.action === 'clarify') {
            // Conversational loop: AI speaks the question, then automatically listens again!
            this.speak(responseText, () => {
                this.hideOverlay();
                this.startListeningGlobal(btn);
            });
            return;
        }

        // For terminal actions, speak first, then execute UI naturally
        this.speak(responseText, () => {
            this.hideOverlay();
        });

        switch (command.action) {
            case 'navigate':
                let target = command.target;
                if (target === 'dashboard' || target === 'landing') {
                    App.showLandingPage();
                } else if (target === 'hrms' || target === 'tasks' || target === 'payments' || target === 'analytics' || target === 'accounting') {
                    App.openModule(target);
                } else if (target === 'delivery' || target === 'jobcards') {
                    App.openModule('accounting');
                    setTimeout(() => DeliveryUI.showLanding(), 500);
                    if (target === 'jobcards') setTimeout(() => DeliveryUI.showSection('jobcard'), 600);
                } else {
                    App.showView(target);
                }
                break;

            case 'create_task':
                App.openModule('tasks');
                setTimeout(() => {
                    TasksUI.showCreateModal({
                        partyName: command.parameters?.partyName || '',
                        narration: command.parameters?.narration || '',
                        type: command.parameters?.taskType || 'normal'
                    });
                     // Set date immediately handling edge cases
                    setTimeout(() => {
                        const dateInput = document.getElementById('taskFollowupDate');
                        if (dateInput && command.parameters?.followupDate) dateInput.value = command.parameters.followupDate;
                    }, 200);
                }, 400);
                break;

            case 'create_jobcard':
                App.openModule('accounting');
                setTimeout(() => {
                    DeliveryUI.showSection('jobcard');
                    setTimeout(() => {
                        DeliveryUI.showJobCardForm();
                        setTimeout(() => {
                            const params = command.parameters || {};
                            const searchInput = document.getElementById('jcCustomerSearch');
                            if (searchInput && params.customerName) {
                                searchInput.value = params.customerName;
                                searchInput.focus();
                                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            if (params.problem) {
                                const probInput = document.getElementById('jcComplaint');
                                if (probInput) probInput.value = params.problem;
                            }
                            if (params.equipment) {
                                const eqInput = document.getElementById('jcEquipment');
                                if (eqInput) eqInput.value = params.equipment;
                            }
                        }, 300);
                    }, 200);
                }, 400);
                break;
                
            case 'mark_attendance':
                App.openModule('hrms');
                setTimeout(() => {
                    App.showView('attendance');
                    setTimeout(() => {
                        const params = command.parameters || {};
                        if (!params.employeeName) return;
                        
                        const searchName = params.employeeName.toLowerCase();
                        let clicked = false;
                        document.querySelectorAll('.attendance-btn').forEach(btn => {
                            const tr = btn.closest('tr');
                            if (tr) {
                                const nameCell = tr.querySelector('.fw-bold.text-info');
                                if (nameCell && nameCell.innerText.toLowerCase().includes(searchName)) {
                                    const isPresentBtn = btn.classList.contains('btn-outline-success');
                                    const isAbsentBtn = btn.classList.contains('btn-outline-danger');
                                    const isHalfDayBtn = btn.classList.contains('btn-outline-warning');
                                    
                                    if (params.status === 'present' && isPresentBtn) { btn.click(); clicked = true; }
                                    else if (params.status === 'absent' && isAbsentBtn) { btn.click(); clicked = true; }
                                    else if (params.status === 'half-day' && isHalfDayBtn) { btn.click(); clicked = true; }
                                }
                            }
                        });
                        if (clicked) App.showNotification(`Attendance marked for ${params.employeeName}`, 'success');
                    }, 500);
                }, 400);
                break;
        }
    }
};
