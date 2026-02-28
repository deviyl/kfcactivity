// -----------------------------------
// DATA INITIALIZATION
// -----------------------------------

let activityData = {};
let membersData = {};

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
        
        renderDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('membersTable').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888; padding: 40px;">Error loading data. Run tracker first.</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', initializeDashboard);

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
    
    const days = parseInt(document.getElementById('timeRange').value);
    const summary = getActivitySummary(days);
    
    renderStats(summary, snapshots);
    renderMembers(summary);
}

function getActivitySummary(days) {
    const snapshots = activityData.snapshots || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const summary = {};
    
    for (const userId in membersData) {
        const member = membersData[userId];
        const memberActivity = [];
        
        for (const snapshot of snapshots) {
            if (new Date(snapshot.timestamp) < cutoffDate) continue;
            if (snapshot.members[userId]) {
                memberActivity.push({
                    timestamp: snapshot.timestamp,
                    ...snapshot.members[userId]
                });
            }
        }
        
        if (memberActivity.length > 0) {
            const mostRecent = memberActivity[memberActivity.length - 1];
            const activeDates = new Set();
            
            for (const activity of memberActivity) {
                if (activity.last_action_timestamp > 0) {
                    const date = new Date(activity.last_action_timestamp * 1000).toLocaleDateString();
                    activeDates.add(date);
                }
            }
            
            summary[userId] = {
                name: member.name,
                level: member.level,
                days_in_faction: member.days_in_faction,
                last_seen_timestamp: mostRecent.last_action_timestamp,
                last_seen_relative: mostRecent.last_action_relative,
                days_active: activeDates.size,
                total_polls: memberActivity.length
            };
        }
    }
    
    return summary;
}

function renderStats(summary, snapshots) {
    const lastPoll = snapshots[snapshots.length - 1].timestamp;
    const lastPollTime = new Date(lastPoll).toLocaleString();
    
    const active24h = Object.values(summary).filter(m => {
        const minutesAgo = (Date.now() - m.last_seen_timestamp * 1000) / 60000;
        return minutesAgo < 1440;
    }).length;
    
    const firstDate = new Date(snapshots[0].timestamp);
    const lastDate = new Date(snapshots[snapshots.length - 1].timestamp);
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
            <div class="score" style="font-size: 0.9em;">${new Date(lastPoll).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        </div>
    `;
    
    document.getElementById('lastUpdated').textContent = `Data last updated: ${lastPollTime}`;
}

function renderMembers(summary) {
    const sorted = Object.entries(summary).sort((a, b) => b[1].last_seen_timestamp - a[1].last_seen_timestamp);
    
    let html = '';
    
    for (const [userId, data] of sorted) {
        const minutesAgo = (Date.now() - data.last_seen_timestamp * 1000) / 60000;
        
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
                <td><strong>${data.name}</strong></td>
                <td>${data.last_seen_relative}</td>
                <td>${data.days_active}</td>
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
// ACTIVITY DISPLAY
// -----------------------------------

function showActivity(userId, name) {
    const snapshots = activityData.snapshots || [];
    const daysRange = parseInt(document.getElementById('timeRange').value);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysRange);
    
    let memberActivity = [];
    
    for (const snapshot of snapshots) {
        if (new Date(snapshot.timestamp) < cutoffDate) continue;
        if (snapshot.members[userId]) {
            memberActivity.push({
                timestamp: snapshot.timestamp,
                ...snapshot.members[userId]
            });
        }
    }
    
    memberActivity = memberActivity.reverse();
    
    let html = '';
    for (const activity of memberActivity) {
        const time = new Date(activity.timestamp);
        const timeStr = time.toLocaleString();
        
        html += `
            <div class="activity-entry">
                <div class="activity-time">${timeStr}</div>
                <div class="activity-relative">Last seen: ${activity.last_action_relative}</div>
                <div class="activity-status">Status: ${activity.status}</div>
            </div>
        `;
    }
    
    document.getElementById('memberName').textContent = name;
    document.getElementById('timeline').innerHTML = html || '<div style="color: #888; padding: 20px;">No activity data</div>';
    document.getElementById('activityDetail').classList.remove('hidden');
}

// -----------------------------------
// ACTIVITY CLOSE
// -----------------------------------

function closeActivity() {
    document.getElementById('activityDetail').classList.add('hidden');
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
// DASHBOARD UPDATE
// -----------------------------------

function updateDashboard() {
    renderDashboard();
}

// -----------------------------------
// KEY EVENT LISTENERS
// -----------------------------------

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeActivity();
    }
});
