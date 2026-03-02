// -----------------------------------
// DATA INITIALIZATION
// -----------------------------------

let activityData = {};
let membersData = {};
let activityChart = null;
let currentDaysRange = 1;
let currentUserId = null;
let chartBaseDate = new Date();

// -----------------------------------
// INITIALIZATION ON PAGE LOAD
// -----------------------------------

async function initializeDashboard() {
    try {
        const activityResponse = await fetch('data/activity.json');
        const membersResponse = await fetch('data/members.json');
        
        if (activityResponse.ok) {
            activityData = await activityResponse.json();
        } else {
            console.warn('No activity data found');
        }
        
        if (membersResponse.ok) {
            membersData = await membersResponse.json();
        } else {
            console.warn('No members data found');
        }
        
        updateFactionName();
        renderDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('membersTable').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888; padding: 40px;">Error loading data. Run tracker first.</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', initializeDashboard);

// -----------------------------------
// FACTION NAME DISPLAY
// -----------------------------------

function updateFactionName() {
    const factionName = activityData.faction_name || "Faction";
    document.querySelector('h1').textContent = `⚔️ ${factionName} Activity Tracker`;
}

// -----------------------------------
// UTILITY - FORMAT UTC TIME
// -----------------------------------

function parseUTC(isoString) {
    return new Date(isoString + 'Z');
}

function formatUTC(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatUTCShort(date) {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    
    return `${month}/${day} ${hours}:${minutes}`;
}

// -----------------------------------
// DASHBOARD RENDERING
// -----------------------------------

function renderDashboard() {
    const snapshots = activityData.snapshots || [];
    
    if (snapshots.length === 0) {
        document.getElementById('membersTable').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888; padding: 40px;">No data yet. Tracker will populate this.</td></tr>';
        updateStats();
        return;
    }
    
    const summary = getActivitySummary();
    
    renderStats(summary, snapshots);
    renderMembers(summary);
}

function getActivitySummary() {
    const snapshots = activityData.snapshots || [];
    const summary = {};
    
    for (const userId in membersData) {
        const member = membersData[userId];
        const memberActivity = [];
        
        for (const snapshot of snapshots) {
            if (snapshot.members[userId]) {
                memberActivity.push({
                    timestamp: snapshot.timestamp,
                    ...snapshot.members[userId]
                });
            }
        }
        
        if (memberActivity.length > 0) {
            const mostRecent = memberActivity[memberActivity.length - 1];
            // -----------------------------------
            // ONLINE PINGS IN LAST 7 DAYS (168 HOURS)
            // -----------------------------------
            
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setHours(sevenDaysAgo.getHours() - 168);
            
            let onlinePingsLast7Days = 0;
            for (const activity of memberActivity) {
                const snapshotDate = parseUTC(activity.timestamp);
                if (snapshotDate < sevenDaysAgo) continue;
                
                // Check if user was online at this snapshot
                const lastActionTime = new Date(activity.last_action_timestamp * 1000);
                const timeDiffSeconds = (snapshotDate - lastActionTime) / 1000;
                const wasOnline = timeDiffSeconds >= 0 && timeDiffSeconds <= 900;
                
                if (wasOnline) {
                    onlinePingsLast7Days++;
                }
            }
            
            summary[userId] = {
                name: member.name,
                level: member.level,
                days_in_faction: member.days_in_faction,
                last_seen_timestamp: mostRecent.last_action_timestamp,
                last_seen_relative: mostRecent.last_action_relative,
                pings_last_7_days: onlinePingsLast7Days,
                total_polls: memberActivity.length
            };
        }
    }
    
    return summary;
}

function renderStats(summary, snapshots) {
    const lastPoll = parseUTC(snapshots[snapshots.length - 1].timestamp);
    const lastPollTime = formatUTC(lastPoll);
    
    const active24h = Object.values(summary).filter(m => {
        const now = Date.now();
        const lastActionMs = m.last_seen_timestamp * 1000;
        const minutesAgo = (now - lastActionMs) / 60000;
        return minutesAgo < 1440;
    }).length;
    
    const firstDate = parseUTC(snapshots[0].timestamp);
    const lastDate = parseUTC(snapshots[snapshots.length - 1].timestamp);
    const loggedDays = Math.floor((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
    
    document.querySelector('.summary').innerHTML = `
        <div class="faction-card">
            <div class="faction-name">Total Members</div>
            <div class="score">${Object.keys(summary).length}</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Active (24h)</div>
            <div class="score">${active24h}</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Data Logged</div>
            <div class="score">${loggedDays} days</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Last Poll</div>
            <div class="score" style="font-size: 0.9em;">${formatUTCShort(lastPoll)}</div>
        </div>
    `;
    
    document.getElementById('lastUpdated').textContent = `Data last updated: ${lastPollTime} UTC`;
}

function renderMembers(summary) {
    const sorted = Object.entries(summary).sort((a, b) => b[1].last_seen_timestamp - a[1].last_seen_timestamp);
    
    let html = '';
    
    for (const [userId, data] of sorted) {
        const now = Date.now();
        const lastActionMs = data.last_seen_timestamp * 1000;
        const minutesAgo = (now - lastActionMs) / 60000;
        
        let statusClass = 'status-inactive';
        let statusText = 'Offline';
        
        if (minutesAgo < 60) {
            statusClass = 'status-active';
            statusText = 'Online';
        } else if (minutesAgo < 1440) {
            statusClass = 'status-warning';
            statusText = 'Today';
        }
        
        html += `
            <tr class="member-row" data-user-id="${userId}">
                <td><a href="https://www.torn.com/profiles.php?XID=${userId}" target="_blank" class="member-link"><strong>${data.name}</strong></a></td>
                <td>${data.last_seen_relative}</td>
                <td>${data.pings_last_7_days}</td>
                <td><span class="status ${statusClass}">${statusText}</span></td>
                <td><a href="#" class="details-link" onclick="showActivity('${userId}', '${data.name}'); return false;">View</a></td>
            </tr>
        `;
    }
    
    document.getElementById('membersTable').innerHTML = html || '<tr><td colspan="5" style="text-align: center; color: #888; padding: 40px;">No members found</td></tr>';
}

function updateStats() {
    document.querySelector('.summary').innerHTML = `
        <div class="faction-card">
            <div class="faction-name">Total Members</div>
            <div class="score">-</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Active (24h)</div>
            <div class="score">-</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Data Logged</div>
            <div class="score">-</div>
        </div>
        <div class="faction-card">
            <div class="faction-name">Last Poll</div>
            <div class="score" style="font-size: 0.9em;">-</div>
        </div>
    `;
    
    document.getElementById('lastUpdated').textContent = 'Data last updated: Loading...';
}

// -----------------------------------
// ACTIVITY DISPLAY WITH GRAPH
// -----------------------------------

function showActivity(userId, name) {
    currentUserId = userId;
    currentDaysRange = 1;
    chartBaseDate = new Date();
    loadActivityChart();
}

function loadActivityChart() {
    const snapshots = activityData.snapshots || [];
    
    // -----------------------------------
    // BUILD DATE RANGE FROM CALENDAR DAYS
    // -----------------------------------
    
    // Set base date to midnight UTC
    const baseDate = new Date(Date.UTC(chartBaseDate.getUTCFullYear(), chartBaseDate.getUTCMonth(), chartBaseDate.getUTCDate(), 0, 0, 0));
    
    // Go back currentDaysRange-1 days from base date
    const cutoffDate = new Date(baseDate);
    cutoffDate.setDate(cutoffDate.getDate() - (currentDaysRange - 1));
    
    // Extend base date to end of day (23:59:59)
    const endOfDay = new Date(baseDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setSeconds(endOfDay.getSeconds() - 1);
    
    let memberActivity = [];
    
    for (const snapshot of snapshots) {
        const snapshotDate = parseUTC(snapshot.timestamp);
        if (snapshotDate < cutoffDate) continue;
        if (snapshotDate > endOfDay) continue;
        if (snapshot.members[currentUserId]) {
            memberActivity.push({
                timestamp: snapshot.timestamp,
                ...snapshot.members[currentUserId]
            });
        }
    }
    
    memberActivity.sort((a, b) => parseUTC(a.timestamp) - parseUTC(b.timestamp));
    
    if (memberActivity.length === 0) {
        document.getElementById('activityChart').parentElement.innerHTML = '<p style="color: #888; padding: 20px;">No activity data available for this period</p>';
        renderDateRangeInput();
        updateNavInfo();
        return;
    }
    
    renderActivityChart(memberActivity);
    renderActivityTimeline(memberActivity);
    renderDateRangeInput();
    updateNavInfo();
    
    document.getElementById('activityDetail').classList.remove('hidden');
}

function renderActivityChart(memberActivity) {
    const labels = [];
    const data = [];
    
    // -----------------------------------
    // BUILD CALENDAR FROM FULL CALENDAR DAYS
    // -----------------------------------
    
    // Set base date to midnight UTC
    const baseDate = new Date(Date.UTC(chartBaseDate.getUTCFullYear(), chartBaseDate.getUTCMonth(), chartBaseDate.getUTCDate(), 0, 0, 0));
    
    // Go back currentDaysRange-1 days (so 1 = today, 2 = today+yesterday, etc)
    const calendarStart = new Date(baseDate);
    calendarStart.setDate(calendarStart.getDate() - (currentDaysRange - 1));
    
    // Create map of activity by 15-min interval
    const activityMap = {};
    for (const activity of memberActivity) {
        const pollTime = parseUTC(activity.timestamp);
        const roundedTime = roundDownTo15Minutes(pollTime);
        const key = roundedTime.getTime();
        
        if (!activityMap[key]) {
            const lastActionTime = new Date(activity.last_action_timestamp * 1000);
            const timeDiffSeconds = (pollTime - lastActionTime) / 1000;
            const isOnline = timeDiffSeconds >= 0 && timeDiffSeconds <= 900;
            
            activityMap[key] = {
                time: roundedTime,
                isOnline: isOnline
            };
        }
    }
    
    // Build chart from calendar start to base date 23:45
    const endOfDay = new Date(baseDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setSeconds(endOfDay.getSeconds() - 1);
    
    let currentTime = new Date(calendarStart);
    while (currentTime < endOfDay) {
        const key = currentTime.getTime();
        
        if (activityMap[key]) {
            labels.push(formatUTCShort(activityMap[key].time));
            data.push(activityMap[key].isOnline ? 1 : 0);
        }
        
        // Move to next 15-min interval
        currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
    }
    
    const ctx = document.getElementById('activityChart');
    
    if (activityChart) {
        activityChart.destroy();
    }
    
    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Online Status',
                data: data,
                borderColor: '#ff4500',
                backgroundColor: 'rgba(255, 69, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff8c00',
                pointBorderColor: '#ff4500',
                pointRadius: 4,
                pointHoverRadius: 6,
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ff8c00'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1,
                    ticks: {
                        color: '#ff8c00',
                        stepSize: 1,
                        callback: function(value) {
                            return value === 1 ? 'Online' : 'Offline';
                        }
                    },
                    grid: {
                        color: '#333'
                    }
                },
                x: {
                    ticks: {
                        color: '#ff8c00',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: '#333'
                    }
                }
            }
        }
    });
}

// -----------------------------------
// TIMESTAMP ROUNDING
// -----------------------------------

function roundDownTo15Minutes(date) {
    const ms = 1000 * 60 * 15;
    return new Date(Math.floor(date.getTime() / ms) * ms);
}

function renderActivityTimeline(memberActivity) {
    let html = `
        <div class="timeline-header" onclick="toggleTimeline()">
            <span style="color: #ff8c00; cursor: pointer; font-weight: bold;">📋 Poll Details (${memberActivity.length} snapshots)</span>
        </div>
        <div class="timeline-content" id="timelineContent" style="display: none;">
    `;
    
    for (const activity of memberActivity.reverse()) {
        const pollTime = parseUTC(activity.timestamp);
        const utcTime = formatUTC(pollTime);
        const lastActionTime = new Date(activity.last_action_timestamp * 1000);
        const lastActionUTC = formatUTC(lastActionTime);
        
        html += `
            <div class="activity-entry">
                <div class="activity-time">Poll at: ${utcTime} UTC</div>
                <div class="activity-relative">Last seen from poll: ${activity.last_action_relative}</div>
                <div class="activity-detail-time">Last action: ${lastActionUTC} UTC</div>
                <div class="activity-status">Status: ${activity.status}</div>
            </div>
        `;
    }
    
    html += `</div>`;
    
    document.getElementById('timeline').innerHTML = html;
}

function renderDateRangeInput() {
    let html = `
        <div class="date-range-input-container">
            <label for="daysInput">Load data for past </label>
            <input type="number" id="daysInput" min="1" max="60" value="${currentDaysRange}" placeholder="1">
            <label for="daysInput"> days</label>
            <button onclick="loadCustomDateRange()">Load Data</button>
        </div>
    `;
    
    document.getElementById('dateRangeContainer').innerHTML = html;
}

function loadCustomDateRange() {
    const input = document.getElementById('daysInput').value;
    const days = parseInt(input);
    
    if (isNaN(days) || days < 1) {
        alert('Please enter a valid number of days (1-60)');
        return;
    }
    
    currentDaysRange = days;
    chartBaseDate = new Date();
    loadActivityChart();
}

function toggleTimeline() {
    const content = document.getElementById('timelineContent');
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
}

function updateNavInfo() {
    const baseDate = new Date(Date.UTC(chartBaseDate.getUTCFullYear(), chartBaseDate.getUTCMonth(), chartBaseDate.getUTCDate()));
    const startDate = new Date(baseDate);
    startDate.setDate(startDate.getDate() - (currentDaysRange - 1));
    
    const formatDate = (date) => {
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${month}/${day}`;
    };
    
    const navInfo = document.getElementById('navInfo');
    if (currentDaysRange === 1) {
        navInfo.textContent = formatDate(baseDate);
    } else {
        navInfo.textContent = `${formatDate(startDate)} to ${formatDate(baseDate)}`;
    }
}

function navChartPrevious() {
    chartBaseDate.setDate(chartBaseDate.getDate() - currentDaysRange);
    loadActivityChart();
}

function navChartNext() {
    chartBaseDate.setDate(chartBaseDate.getDate() + currentDaysRange);
    loadActivityChart();
}

// -----------------------------------
// ACTIVITY CLOSE
// -----------------------------------

function closeActivity() {
    document.getElementById('activityDetail').classList.add('hidden');
    if (activityChart) {
        activityChart.destroy();
        activityChart = null;
    }
    currentUserId = null;
    chartBaseDate = new Date();
}

// -----------------------------------
// MEMBER FILTERING
// -----------------------------------

function filterMembers() {
    const query = document.getElementById('searchBox').value.toLowerCase();
    const rows = document.querySelectorAll('.member-row');
    
    rows.forEach(row => {
        const name = row.querySelector('td').textContent.toLowerCase();
        row.style.display = name.includes(query) ? '' : 'none';
    });
}

// -----------------------------------
// KEY EVENT LISTENERS
// -----------------------------------

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeActivity();
    }
});
