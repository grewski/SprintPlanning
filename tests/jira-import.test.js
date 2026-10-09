const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseJiraCSV, parseJiraDay, calculateJiraInputs } = require('../jira-import.js');
const header = 'Issue Type,Status,Resolved,Summary\r\n';
test('CSV supports BOM, CRLF, multiline fields, commas and escaped quotes', () => {
    const issues = parseJiraCSV('\uFEFF' + header + 'Task,Done,09/Oct/26 11:22 AM,"A, B\r\n""quoted"""\r\nStory,To Do,,Other');
    assert.equal(issues.length, 2);
    assert.equal(issues[0].day, parseJiraDay('2026-10-09'));
    assert.equal(issues[1].day, null);
});
test('shared issue-type filter, inclusive boundaries, zero periods and status-based backlog', () => {
    const issues = parseJiraCSV(header + 'Task,Done,01/Oct/26,A\nStory,In Progress,04/Oct/26,B\nTask,To Do,,C\nSubtask,Done,03/Oct/26,D\nTask,Done,30/Sep/26,E');
    assert.deepEqual(calculateJiraInputs(issues, new Set(['Story']), parseJiraDay('2026-10-01'), parseJiraDay('2026-10-04'), 1), { throughput: [0, 0, 0, 1], backlog: 1 });
    assert.deepEqual(calculateJiraInputs(issues, new Set(), parseJiraDay('2026-10-01'), parseJiraDay('2026-10-04'), 2), { throughput: [0, 0], backlog: 0 });
});
test('invalid files and invalid dates fail clearly', () => {
    for (const csv of ['', 'Status,Resolved\nDone,', header + 'Task,Done,bad,A', header + 'Task,Done,,"open', header + 'Task,Done,', header + ',Done,,A']) assert.throws(() => parseJiraCSV(csv));
    assert.equal(parseJiraDay('31/Feb/26'), null);
    assert.equal(parseJiraDay('2026-02-29'), null);
    assert.notEqual(parseJiraDay('29/Feb/24'), null);
    assert.equal(parseJiraDay('10/09/2026'), null);
});
test('partial periods and insufficient history are rejected', () => {
    assert.throws(() => calculateJiraInputs([], new Set(), 0, 14, 14));
    assert.throws(() => calculateJiraInputs([], new Set(), 0, 13, 14));
    assert.throws(() => calculateJiraInputs([], new Set(), null, 13, 14));
});

test('velocity sums story points while throughput counts the same issues', () => {
    const issues = parseJiraCSV('Issue Type,Status,Resolved,Custom field (Story point estimate)\nTask,Done,01/Oct/26,7\nTask,To Do,,15\nStory,In Progress,,8');
    const types = new Set(['Task', 'Story']);
    const start = parseJiraDay('2026-10-01');
    assert.deepEqual(calculateJiraInputs(issues, types, start, start + 27, 14, 'velocity'), { throughput: [7, 0], backlog: 23 });
    assert.deepEqual(calculateJiraInputs(issues, types, start, start + 27, 14), { throughput: [1, 0], backlog: 2 });
});
test('velocity rejects missing estimates only for issues included in the calculation', () => {
    const issues = parseJiraCSV(header + 'Task,To Do,,A');
    assert.throws(() => calculateJiraInputs(issues, new Set(['Task']), 0, 27, 14, 'velocity'), /story-point estimate/);
    assert.deepEqual(calculateJiraInputs(issues, new Set(['Story']), 0, 27, 14, 'velocity'), { throughput: [0, 0], backlog: 0 });
});

test('start and duration define historical periods and exclude an incomplete final period', () => {
    const { jiraHistoryWindow } = require('../jira-import');
    const start = parseJiraDay('2026-07-18');
    const firstEnd = parseJiraDay('2026-07-31');
    const today = parseJiraDay('2026-10-09');
    assert.deepEqual(jiraHistoryWindow(start, 14, today), { duration: 14, end: today, periods: 6 });
    assert.deepEqual(jiraHistoryWindow(start, 14, today - 1), { duration: 14, end: today - 14, periods: 5 });
    assert.throws(() => jiraHistoryWindow(start, 14, firstEnd), /two full/);
    assert.throws(() => jiraHistoryWindow(start, 0, today), /valid/);
});

test('start suggestion uses the earliest resolved date only among selected types', () => {
    const { suggestJiraStart } = require('../jira-import');
    const issues = [{ type: 'Task', day: 20 }, { type: 'Story', day: 5 }, { type: 'Task', day: null }, { type: 'Task', day: 10 }];
    assert.equal(suggestJiraStart(issues, new Set(['Task'])), 10);
    assert.equal(suggestJiraStart(issues, new Set(['Task', 'Story'])), 5);
    assert.equal(suggestJiraStart(issues, new Set(['Bug'])), null);
    assert.equal(suggestJiraStart([{ type: 'Task', day: null }], new Set(['Task'])), null);
});

test('suggestion includes recent completions in two full periods ending today', () => {
    const { suggestJiraStart, jiraHistoryWindow } = require('../jira-import');
    const today = parseJiraDay('2026-10-09');
    const types = new Set(['Task']);
    const start = suggestJiraStart([{ type: 'Task', day: today }], types, 7, today);
    assert.equal(start, parseJiraDay('2026-09-26'));
    assert.deepEqual(jiraHistoryWindow(start, 7, today), { duration: 7, end: today, periods: 2 });
    const earlier = today - 30;
    const aligned = suggestJiraStart([{ type: 'Task', day: earlier }], types, 7, today);
    assert.ok(aligned <= earlier);
    assert.equal(jiraHistoryWindow(aligned, 7, today).end, today);
});
