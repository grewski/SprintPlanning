let calendarResults = [];
let calendarMonth;
const calendarDayMs = 86400000;

function deliveryProbability(results, elapsedDays, sprintDays) {
    if (!results.length || elapsedDays < 0) return null;
    const completedSprints = Math.floor(elapsedDays / sprintDays);
    // Results are sorted. Find the number of simulations delivered by this date.
    let low = 0, high = results.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (results[middle] <= completedSprints) low = middle + 1;
        else high = middle;
    }
    return low / results.length * 100;
}

function firstGreenDate(results, start, sprintDays) {
    if (!results.length || !Number.isFinite(start) || !Number.isInteger(sprintDays) || sprintDays < 1 || sprintDays > 365) return null;
    // The first sample beyond 85% gives the first strictly green completion date.
    const sprints = results[Math.floor(results.length * 0.85)];
    return new Date(start + Math.max(0, sprints * sprintDays - 1) * calendarDayMs);
}

function firstGreenMonth(results, start, sprintDays) {
    const date = firstGreenDate(results, start, sprintDays);
    if (!date) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function focusGreenMonth() {
    const month = firstGreenMonth(calendarResults, document.getElementById('forecastStart').valueAsNumber, Number(document.getElementById('forecastDays').value));
    if (month) calendarMonth = month;
}

function setCalendarResults(results) {
    calendarResults = results;
    focusGreenMonth();
    renderDeliveryCalendar();
}

function calendarMarker(kind, label) {
    const marker = document.createElement('span');
    marker.className = 'calendar-marker';
    marker.title = label;
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', kind === 'pin'
        ? 'M12 1a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z'
        : 'M4 2h2v2c5-4 9 4 15 0v12c-6 4-10-4-15 0v7H4z');
    svg.append(path); marker.append(svg);
    return marker;
}

function renderDeliveryCalendar() {
    const container = document.getElementById('deliveryCalendar');
    const message = document.getElementById('calendarMessage');
    const start = document.getElementById('forecastStart').valueAsNumber;
    const days = Number(document.getElementById('forecastDays').value);
    container.replaceChildren();
    const monthLabel = date => date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const lastMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 3, 1));
    document.getElementById('calendarMonth').textContent = `${monthLabel(calendarMonth)} – ${monthLabel(lastMonth)}`;
    if (!Number.isFinite(start) || !Number.isInteger(days) || days < 1 || days > 365) {
        message.textContent = 'Choose a forecast start date and a sprint length between 1 and 365 days.';
        return;
    }
    message.textContent = calendarResults.length ? '' : 'Run forecast to see delivery probabilities.';
    const now = new Date();
    const todayDate = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const greenDate = firstGreenDate(calendarResults, start, days)?.getTime();
    for (let monthIndex = 0; monthIndex < 4; monthIndex++) {
        const month = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + monthIndex, 1));
        const section = document.createElement('section');
        section.className = 'calendar-month';
        const title = document.createElement('h3');
        title.textContent = monthLabel(month);
        const grid = document.createElement('div');
        grid.className = 'delivery-calendar';
        section.append(title, grid);
        container.append(section);
        for (const name of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
            const heading = document.createElement('div');
            heading.className = 'calendar-weekday'; heading.textContent = name; grid.append(heading);
        }
        const offset = (month.getUTCDay() + 6) % 7;
        for (let i = 0; i < offset; i++) {
            const spacer = document.createElement('div'); spacer.setAttribute('aria-hidden', 'true'); grid.append(spacer);
        }
        const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
        for (let day = 1; day <= count; day++) {
            const date = Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day);
            const elapsed = Math.floor((date - start) / calendarDayMs) + 1;
            const probability = date < start ? null : deliveryProbability(calendarResults, elapsed, days);
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            const number = document.createElement('span'); number.textContent = day;
            const dayHeading = document.createElement('div');
            dayHeading.className = 'calendar-day-heading';
            const markers = document.createElement('span');
            markers.className = 'calendar-markers';
            if (date === todayDate) {
                markers.append(calendarMarker('pin', 'Today'));
                cell.setAttribute('aria-current', 'date');
            }
            if (date === greenDate) markers.append(calendarMarker('flag', 'First date above 85% delivery probability'));
            dayHeading.append(number, markers);
            const value = document.createElement('strong');
            value.textContent = probability === null ? '—' : `${probability > 99.9 && probability < 100 ? '>99.9' : Number(probability.toFixed(1))}%`;
            if (probability !== null) cell.classList.add(probability > 85 ? 'calendar-green' : probability >= 50 ? 'calendar-amber' : 'calendar-red');
            cell.setAttribute('aria-label', `${new Date(date).toISOString().slice(0, 10)}: ${probability === null ? 'No forecast' : value.textContent + ' chance of delivery by this date'}`);
            cell.append(dayHeading, value); grid.append(cell);
        }
    }
}

if (typeof module !== 'undefined') module.exports = { deliveryProbability, firstGreenMonth, firstGreenDate };
if (typeof document !== 'undefined') {
    const today = new Date();
    const start = document.getElementById('forecastStart');
    start.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    calendarMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
    start.addEventListener('change', () => {
        if (Number.isFinite(start.valueAsNumber)) {
            const date = new Date(start.valueAsNumber);
            calendarMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        }
        focusGreenMonth();
        renderDeliveryCalendar();
    });
    document.getElementById('forecastDays').addEventListener('input', () => {
        focusGreenMonth();
        renderDeliveryCalendar();
    });
    for (const [id, direction] of [['previousMonth', -4], ['nextMonth', 4]]) {
        document.getElementById(id).addEventListener('click', () => {
            calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + direction);
            renderDeliveryCalendar();
        });
    }
    const tabs = ['distribution', 'calendar'];
    function selectTab(selected) {
        if (selected === 'calendar') {
            focusGreenMonth();
            renderDeliveryCalendar();
        }
        for (const name of tabs) {
            const tab = document.getElementById(`${name}Tab`);
            tab.setAttribute('aria-selected', String(name === selected));
            tab.tabIndex = name === selected ? 0 : -1;
            document.getElementById(`${name}Panel`).hidden = name !== selected;
        }
        if (selected === 'distribution' && typeof chartInstanceRel !== 'undefined' && chartInstanceRel) chartInstanceRel.resize();
    }
    for (const name of tabs) {
        const tab = document.getElementById(`${name}Tab`);
        tab.addEventListener('click', () => selectTab(name));
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs.find(item => item !== name);
            selectTab(next); document.getElementById(`${next}Tab`).focus();
        });
    }
}
