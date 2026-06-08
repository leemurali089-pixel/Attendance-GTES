/**
 * taskEngine.js — Task list + bulk create support
 */
(function (global) {
    'use strict';

    function _tasks() {
        if (typeof DataManager !== 'undefined' && DataManager.getData) {
            const t = DataManager.getData('gtes_tasks') || DataManager.getData('tasks');
            if (Array.isArray(t)) return t;
            if (t && Array.isArray(t.tasks)) return t.tasks;
        }
        return [];
    }

    const TaskEngine = {
        list: function (args) {
            args = args || {};
            let list = _tasks();
            if (args.status) {
                list = list.filter(function (t) { return t.status === args.status; });
            }
            return {
                ok: true,
                count: list.length,
                tasks: list.slice(0, 30),
                summary: list.length + ' tasks',
                sourceRefs: ['tasks']
            };
        }
    };

    global.TaskEngine = TaskEngine;
})(typeof window !== 'undefined' ? window : global);
