// Central report store. Every change to the report goes through this reducer
// as an immutable update, so object identity changes whenever data changes and
// React memoization (TopBar search/notifications, view lists) stays correct.
// This replaces the old pattern of mutating the report in place and forcing
// re-renders with a tick counter.

export function reportReducer(report, action) {
  switch (action.type) {
    case 'load':
      return action.report;

    // Operator actioned a queue item (forward / release / apply).
    case 'action_item': {
      const human_queue = (report.snapshot.human_queue || []).map((i) =>
        i.workflow_task_id === action.id ? { ...i, _actioned: true, _actionLabel: action.label } : i
      );
      return { ...report, snapshot: { ...report.snapshot, human_queue } };
    }

    // Human intervention on a closed run: append a trace stage to the run and
    // add a pending INTERVENTION item to the human queue, atomically.
    case 'intervene': {
      const scenarios = (report.scenarios || []).map((s) =>
        s.id === action.runId
          ? { ...s, _reopened: true, stages: [...(s.stages || []), action.stage] }
          : s
      );
      const human_queue = [...(report.snapshot.human_queue || []), action.item];
      return { ...report, scenarios, snapshot: { ...report.snapshot, human_queue } };
    }

    default:
      return report;
  }
}

/* ── selectors ── */
export const findQueueItem = (report, id) =>
  (report?.snapshot?.human_queue || []).find((i) => i.workflow_task_id === id) || null;

export const findScenario = (report, id) =>
  (report?.scenarios || []).find((s) => s.id === id) || null;

export const interventionCount = (report) =>
  (report?.snapshot?.human_queue || []).filter((i) => i.type === 'INTERVENTION').length;

/* ── operator notes, persisted across reloads (session-scoped before) ── */
const NOTES_KEY = 'wig-notes';
export function loadNote(taskId) {
  try { return (JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {})[taskId] || ''; } catch { return ''; }
}
export function saveNote(taskId, text) {
  try {
    const all = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {};
    if (text.trim()) all[taskId] = text; else delete all[taskId];
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch { /* private mode etc. — note stays in memory only */ }
}
