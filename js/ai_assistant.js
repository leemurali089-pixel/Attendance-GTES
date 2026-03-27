/**
 * Global AI Assistant Module (Omnipotent Router)
 * Handles Web Speech Recognition (Tamil) & translates intents via Gemini API
 */

const AIAssistant = {
    apiKey: 'AIzaSyAhcd0SihsLEmFFAh0zn342kLRXf1BlAVI', // Fresh API Key for Gemini
    isListening: false,
    currentRecognition: null,

    init() {
        console.log("Global AIAssistant initialized.");
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            console.error("Speech Recognition is not supported in this browser.");
            App.showNotification("Your browser does not support Voice Recognition.", "error");
            return false;
        }
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
                <p class="text-white-50 mt-2" id="aiOverlayTranscript">Translating your request...</p>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },

    hideOverlay() {
        const overlay = document.getElementById('aiProcessingOverlay');
        if (overlay) overlay.style.display = 'none';
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

    /**
     * Start listening globally
     */
    async startListeningGlobal(btn) {
        if (!this.init()) return;

        if (this.isListening && this.currentRecognition) {
            this.currentRecognition.stop();
            return;
        }

        this.setBtnState(btn, 'listening');

        const recognition = new window.SpeechRecognition();
        this.currentRecognition = recognition;
        recognition.lang = 'ta-IN'; // Tamil
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            this.isListening = true;
            App.showNotification("Listening in Tamil... Speak now", "info");
        };

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("Recognized text (Tamil):", transcript);
            
            this.setBtnState(btn, 'idle');
            this.showOverlay();
            this.updateOverlayText(`Recognized: "${transcript}"`);
            
            try {
                // Process with Gemini to get Intent
                const command = await this.processGlobalAI(transcript);
                console.log("AI Intent Router Resolved:", command);
                
                this.updateOverlayText(`Executing: ${command.action}...`);
                await this.executeGlobalAction(command);
                
            } catch (err) {
                console.error("AI Routing Error:", err);
                App.showNotification("Sorry, I could not understand the request.", "error");
            } finally {
                setTimeout(() => this.hideOverlay(), 1000);
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            App.showNotification(`Microphone error: ${event.error}`, "error");
            this.setBtnState(btn, 'idle');
            this.isListening = false;
        };

        recognition.onend = () => {
            this.isListening = false;
            this.setBtnState(btn, 'idle');
        };

        try {
            recognition.start();
        } catch(e) {
            console.error("Could not start recognition", e);
            this.setBtnState(btn, 'idle');
        }
    },

    async processGlobalAI(transcript) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
        const today = new Date().toISOString().split('T')[0];
        
        let prompt = `You are an omnipotent AI controller for the "MJS PrimeLogic" ERP system. 
You translate spoken Tamil requests into a strict JSON command to control the app remotely.

Current Date context: ${today}

Below are the possible App Actions you can return:

1. NAVIGATION
Use action: "navigate"
Parameters: "target" (can be: "dashboard", "hrms", "employees", "attendance", "salary", "admin", "tasks", "payments", "analytics", "accounting", "jobcards", "delivery")
Example Tamil: "Analytics page open pannu" -> {"action": "navigate", "target": "analytics"}
Example Tamil: "Homeikku po" -> {"action": "navigate", "target": "dashboard"}

2. MARK ATTENDANCE
Use action: "mark_attendance"
Parameters: "employeeName" (string), "status" (string: "present", "absent", "half-day")
Example Tamil: "Rajesh absent inniki" -> {"action": "mark_attendance", "parameters": {"employeeName": "Rajesh", "status": "absent"}}

3. CREATE TASK
Use action: "create_task"
Parameters: "partyName" (string), "narration" (english translation of task details), "followupDate" (YYYY-MM-DD), "taskType" ("normal" or "payment_followup")
Example Tamil: "Naalaikku Ramesh ku call panni payment kekanum" -> {"action":"create_task", "parameters":{"partyName":"Ramesh","narration":"Call and ask for payment","followupDate":"${this.calculateTomorrow()}","taskType":"payment_followup"}}

4. CREATE JOB CARD
Use action: "create_jobcard"
Parameters: "customerName" (string), "problem" (english translation of compaint), "equipment" (english translation of device/vehicle)
Example Tamil: "Vignesh laptop freeze aaguthu nu kuduthurukkar" -> {"action":"create_jobcard", "parameters":{"customerName":"Vignesh", "problem":"Laptop freezing issue", "equipment":"Laptop"}}

Return ONLY valid JSON. No markdown brackets. If the intent is completely impossible to match, return {"action": "unknown"}.

User Transcript: "${transcript}"`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);

        const data = await response.json();
        let resultText = data.candidates[0].content.parts[0].text;
        resultText = resultText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        
        return JSON.parse(resultText);
    },

    calculateTomorrow() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    },

    /**
     * Executes the translated Intent on the local application architecture
     */
    async executeGlobalAction(command) {
        if (!command || !command.action) return;

        switch (command.action) {
            case 'navigate':
                let target = command.target;
                if (target === 'dashboard' || target === 'landing') {
                    App.showLandingPage();
                } else if (target === 'hrms' || target === 'tasks' || target === 'payments' || target === 'analytics' || target === 'accounting') {
                    App.openModule(target);
                } else if (target === 'delivery' || target === 'jobcards') {
                    App.openModule('accounting'); // Temporary route to delivery entry
                    setTimeout(() => DeliveryUI.showLanding(), 500);
                    if (target === 'jobcards') setTimeout(() => DeliveryUI.showSection('jobcard'), 600);
                } else {
                    App.showView(target); // Fallback to direct view mapping
                }
                App.showNotification("Navigated via AI", "success");
                break;

            case 'create_task':
                App.openModule('tasks');
                setTimeout(() => {
                    TasksUI.showCreateModal({
                        partyName: command.parameters.partyName || '',
                        narration: command.parameters.narration || '',
                        type: command.parameters.taskType || 'normal'
                    });
                     // Set date immediately handling edge cases
                    setTimeout(() => {
                        const dateInput = document.getElementById('taskFollowupDate');
                        if (dateInput && command.parameters.followupDate) dateInput.value = command.parameters.followupDate;
                    }, 200);
                }, 400);
                break;

            case 'create_jobcard':
                App.openModule('accounting'); // Assume accounting holds delivery/jobcards
                setTimeout(() => {
                    DeliveryUI.showSection('jobcard');
                    setTimeout(() => {
                        DeliveryUI.showJobCardForm();
                        setTimeout(() => {
                            const params = command.parameters;
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
                // Smart auto-mark attendance for employee
                App.openModule('hrms');
                setTimeout(() => {
                    App.showView('attendance');
                    setTimeout(() => {
                        const params = command.parameters;
                        if (!params.employeeName) {
                            App.showNotification('Employee name missing for attendance', 'warning');
                            return;
                        }
                        
                        // Find employee rows matching name
                        const searchName = params.employeeName.toLowerCase();
                        let clicked = false;
                        document.querySelectorAll('.attendance-btn').forEach(btn => {
                            const tr = btn.closest('tr');
                            if (tr) {
                                const nameCell = tr.querySelector('.fw-bold.text-info');
                                if (nameCell && nameCell.innerText.toLowerCase().includes(searchName)) {
                                    // Match found, check if button is the correct status
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
                        else App.showNotification(`Could not find employee ${params.employeeName} to mark attendance`, 'warning');
                    }, 500);
                }, 400);
                break;

            default:
                App.showNotification("Action understood but not yet supported by AI router.", "warning");
                break;
        }
    }
};
