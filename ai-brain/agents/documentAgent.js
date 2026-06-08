/**
 * documentAgent.js — Invoice/challan preview
 */
(function (global) {
    'use strict';

    const DocumentAgentBrain = {
        id: 'documentAgent',
        handle: function (intent, args, ctx) {
            if (typeof DocumentEngineBrain !== 'undefined') {
                return Promise.resolve(DocumentEngineBrain.preview(args));
            }
            return FunctionEngine.invoke(intent, args, ctx);
        }
    };

    global.DocumentAgentBrain = DocumentAgentBrain;
})(typeof window !== 'undefined' ? window : global);
