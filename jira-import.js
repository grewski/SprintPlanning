/* CSV and date helpers are independent of the UI so imports can be validated before applying. */
function parseJiraCSV(text) {
    const rows = [];
    let row = [], value = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
            else if (char === '"') { quoted = false; closed = true; }
            else value += char;
        } else if (char === ',' || char === '\n' || char === '\r') {
            row.push(value); value = ''; closed = false;
            if (char !== ',') {
                if (row.some(cell => cell.trim())) rows.push(row);
                row = [];
                if (char === '\r' && text[i + 1] === '\n') i++;
            }
        } else if (char === '"' && value === '' && !closed) quoted = true;
        else {
            if (closed || char === '"') throw new Error('Malformed CSV quoting. Export the file again from Jira.');
            value += char;
        }
    }
    if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
    row.push(value);
    if (row.some(cell => cell.trim())) rows.push(row);
    const headers = (rows.shift() || []).map(cell => cell.trim().toLowerCase());
    const required = ['issue type', 'status', 'resolved'];
    for (const name of required) {
        if (headers.filter(header => header === name).length !== 1) throw new Error(`CSV must contain exactly one ${name} column.`);
    }
    if (!rows.length) throw new Error('The CSV contains no issues.');
    const pointsIndex = headers.findIndex(header => ['story points', 'story point estimate', 'custom field (story points)', 'custom field (story point estimate)'].includes(header));
    return rows.map((cells, index) => {
        if (cells.length !== headers.length) throw new Error(`CSV record ${index + 2} has the wrong number of columns.`);
        const get = name => cells[headers.indexOf(name)].trim();
        const type = get('issue type'), status = get('status'), resolved = get('resolved');
        if (!type || !status) throw new Error(`CSV record ${index + 2} is missing Issue Type or Status.`);
        const day = resolved ? parseJiraDay(resolved) : null;
        if (resolved && day === null) throw new Error(`Unsupported Resolved date in CSV record ${index + 2}: ${resolved}. Use dates such as 09/Oct/26 or 2026-10-09.`);
        const rawPoints = pointsIndex >= 0 ? cells[pointsIndex].trim() : '';
        const points = rawPoints !== '' && Number.isFinite(Number(rawPoints)) && Number(rawPoints) >= 0 ? Number(rawPoints) : null;
        return { type, status, day, points };
    });
}

function parseJiraDay(value) {
    let year, month, day;
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ]\d{2}:\d{2})/.exec(value);
    const jira = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}|\d{2})(?:$| \d{1,2}:\d{2})/.exec(value);
    if (iso) [, year, month, day] = iso.map(Number);
    else if (jira) {
        day = Number(jira[1]);
        month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(jira[2].toLowerCase()) + 1;
        year = Number(jira[3]);
        if (jira[3].length === 2) year += 2000;
    } else return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return month && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / 86400000 : null;
}

function calculateJiraInputs(issues, issueTypes, start, end, sprintDays, mode = 'throughput') {
    if (start === null || end === null || end < start || !Number.isInteger(sprintDays) || sprintDays < 1) throw new Error('Choose a valid date range and a positive whole number of days per sprint.');
    const days = end - start + 1;
    if (days % sprintDays !== 0) throw new Error('The inclusive date range must contain whole sprints. Adjust the dates or sprint length.');
    const count = days / sprintDays;
    if (count < 2 || count > 1000) throw new Error('Choose a date range containing between 2 and 1,000 whole sprints.');
    const throughput = Array(count).fill(0);
    let backlog = 0;
    for (const issue of issues) {
        if (!issueTypes.has(issue.type)) continue;
        const inBacklog = issue.status.toLowerCase() !== 'done';
        const inHistory = issue.day !== null && issue.day >= start && issue.day <= end;
        if (mode === 'velocity' && (inBacklog || inHistory) && !Number.isFinite(issue.points)) throw new Error('Velocity import requires a valid story-point estimate for every included backlog or resolved issue. Add estimates or choose throughput mode.');
        const amount = mode === 'velocity' ? issue.points : 1;
        if (inBacklog) backlog += amount;
        if (inHistory) throughput[Math.floor((issue.day - start) / sprintDays)] += amount;
    }
    return { throughput, backlog };
}

function jiraHistoryWindow(start, duration, today) {
    if (start === null || !Number.isFinite(start)) throw new Error('Choose a valid first-period start date.');
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) throw new Error('Choose a valid duration between 1 and 365 whole days.');
    const periods = Math.floor((today - start + 1) / duration);
    if (periods < 2) throw new Error('Fewer than two full historical periods are available. Import more history, choose a shorter duration, or enter a known earlier start date.');
    return { duration, end: start + periods * duration - 1, periods };
}

function suggestJiraStart(issues, issueTypes, duration, today) {
    let earliest = null;
    for (const issue of issues) {
        if (issueTypes.has(issue.type) && Number.isFinite(issue.day) && (earliest === null || issue.day < earliest)) earliest = issue.day;
    }
    if (earliest === null) return null;
    if (!Number.isInteger(duration) || duration < 1 || duration > 365 || !Number.isFinite(today)) return earliest;
    // Anchor full periods to today so recent resolved work is included.
    const periods = Math.max(2, Math.ceil((today - earliest + 1) / duration));
    return today - periods * duration + 1;
}

if (typeof module !== 'undefined') module.exports = { parseJiraCSV, parseJiraDay, calculateJiraInputs, jiraHistoryWindow, suggestJiraStart };

if (typeof document !== 'undefined') {
    let issues = [];
    let fileVersion = 0;
    let manualStart = false;
    const el = id => document.getElementById(id);
    const error = el('jiraError');
    const dateString = day => new Date(day * 86400000).toISOString().slice(0, 10);
    const selectedTypes = () => new Set([...el('jiraTypes').querySelectorAll('input:checked')].map(input => input.value));
    function useSuggestedStart() {
        if (manualStart) return;
        const now = new Date();
        const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
        const start = suggestJiraStart(issues, selectedTypes(), Number(el('forecastDays').value), today);
        el('jiraStart').value = start === null ? '' : dateString(start);
        el('jiraStartHint').textContent = start === null
            ? 'No resolved issues in the selected types. Enter a known historical start date or change the selection.'
            : 'Suggested periods end today, cover the earliest selected Resolved date, and include at least two periods. Earlier periods without resolutions count as zero; confirm the export covers that history. Adjust to actual sprint dates if needed.';
        updateImportDuration();
    }
    el('jiraTypes').addEventListener('change', useSuggestedStart);
    el('jiraSuggestStart').addEventListener('click', () => {
        manualStart = false;
        useSuggestedStart();
    });
    function updateImportDuration() {
        const start = parseJiraDay(el('jiraStart').value);
        const duration = Number(el('forecastDays').value);
        el('jiraDuration').textContent = start !== null && Number.isInteger(duration) && duration >= 1 && duration <= 365
            ? `First period: ${dateString(start)} to ${dateString(start + duration - 1)} (${duration} days).`
            : 'Choose a valid start date and duration between 1 and 365 whole days.';
    }
    el('jiraStart').addEventListener('input', () => {
        manualStart = true;
        el('jiraStartHint').textContent = 'Using your chosen start date.';
        updateImportDuration();
    });
    el('forecastDays').addEventListener('input', () => {
        if (issues.length && !manualStart) useSuggestedStart();
        else updateImportDuration();
    });
    updateImportDuration();
    el('jiraFile').addEventListener('change', async event => {
        const version = ++fileVersion;
        el('jiraOptions').hidden = true;
        el('jiraSummary').textContent = '';
        error.textContent = '';
        const file = event.target.files[0];
        if (!file) return;
        try {
            const parsed = parseJiraCSV(await file.text());
            if (version !== fileVersion) return;
            issues = parsed;
            const types = [...new Set(issues.map(issue => issue.type))].sort();
            el('jiraTypes').replaceChildren();
            for (const type of types) {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.value = type; checkbox.checked = true;
                label.append(checkbox, document.createTextNode(type));
                el('jiraTypes').append(label);
            }
            el('jiraOptions').hidden = false;
            el('jiraSuggestStart').hidden = false;
            useSuggestedStart();
            el('jiraSummary').textContent = `${issues.length} issues loaded. Choose types and dates, then apply.`;
        } catch (err) { if (version === fileVersion) error.textContent = err.message; }
    });
    el('jiraApply').addEventListener('click', () => {
        try {
            const selected = id => new Set([...el(id).querySelectorAll('input:checked')].map(input => input.value));
            const now = new Date();
            const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
            const start = parseJiraDay(el('jiraStart').value);
            const history = jiraHistoryWindow(start, Number(el('forecastDays').value), today);
            const result = calculateJiraInputs(issues, selected('jiraTypes'), start, history.end, history.duration, forecastMode());
            el('forecastDays').value = history.duration;
            el('velocities').value = result.throughput.join(', ');
            el('prodBacklog').value = result.backlog;
            error.textContent = '';
            el('jiraSummary').textContent = `Applied ${result.throughput.reduce((a, b) => a + b, 0)} completed ${forecastUnits()} across ${result.throughput.length} ${forecastMode() === 'velocity' ? 'sprints' : 'periods'} of ${history.duration} days (through ${dateString(history.end)}); ${result.backlog} backlog ${forecastUnits()}. Run forecast to update results.`;
            destroyPreviousCharts();
            for (const id of ['releaseMetric']) el(id).textContent = '—';
            for (const id of ['releaseResults']) el(id).textContent = 'Run forecast with imported data';
            el('formError').textContent = '';
        } catch (err) { error.textContent = err.message; }
    });
}
