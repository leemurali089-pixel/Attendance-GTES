/**
 * operationsAgent.js — Tasks + daily briefing
 */
(function (global) {
    'use strict';

    const OperationsAgent = {
        id: 'operationsAgent',
        handle: function (intent, args, ctx) {
            if (intent === 'task.bulkCreate' && typeof SandboxEngine !== 'undefined') {
                return SandboxEngine.run('task.bulkCreate', args, ctx);
            }
            if (intent === 'task.list' && typeof TaskEngine !== 'undefined') {
                return Promise.resolve(TaskEngine.list(args));
            }
            if (intent === 'briefing.daily' && typeof ProactiveEngine !== 'undefined') {
                return Promise.resolve(ProactiveEngine.getDailyBriefing());
            }
            return FunctionEngine.invoke(intent, args, ctx);
        }
    };

    global.OperationsAgent = OperationsAgent;
})(typeof window !== 'undefined' ? window : global);
