/**
 * memoryEngine.js — Short-term conversation memory
 * Wraps legacy MemoryManager.
 */
(function (global) {
    'use strict';

    const MemoryEngine = {
        remember: function (role, text, meta) {
            if (typeof ConversationHistory !== 'undefined' && ConversationHistory.add) {
                ConversationHistory.add(role, text, meta);
            }
        },

        getRecent: function (limit) {
            limit = limit || 10;
            if (typeof ConversationHistory !== 'undefined' && ConversationHistory.getRecent) {
                return ConversationHistory.getRecent(limit);
            }
            return [];
        },

        clear: function () {
            if (typeof ConversationHistory !== 'undefined' && ConversationHistory.clear) {
                ConversationHistory.clear();
            }
        }
    };

    global.MemoryEngine = MemoryEngine;
})(typeof window !== 'undefined' ? window : global);
