#!/usr/bin/env python3

import requests
import json
from datetime import datetime, timedelta
from pathlib import Path
import os
import sys

# -----------------------------------
# CONFIGURATION FROM ENVIRONMENT
# -----------------------------------

api_key = os.getenv("TORN_API_KEY")
faction_id = os.getenv("FACTION_ID")

if not api_key or not faction_id:
    print("ERROR: Set TORN_API_KEY and FACTION_ID environment variables")
    sys.exit(1)

try:
    faction_id = int(faction_id)
except ValueError:
    print("ERROR: FACTION_ID must be a number")
    sys.exit(1)

# -----------------------------------
# CLASS DEFINITION
# -----------------------------------

class TornActivityTracker:
    
    def __init__(self, api_key, faction_id, data_dir="data"):
        self.api_key = api_key
        self.faction_id = faction_id
        self.data_dir = Path(data_dir)
        self.base_url = "https://api.torn.com"
        
        self.data_dir.mkdir(exist_ok=True)
        
        self.activity_file = self.data_dir / "activity.json"
        self.members_file = self.data_dir / "members.json"
    
    # -----------------------------------
    # JSON UTILITY METHODS
    # -----------------------------------
    
    def load_json(self, filepath):
        if not filepath.exists():
            return {}
        
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    
    def save_json(self, filepath, data):
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    # -----------------------------------
    # API METHODS
    # -----------------------------------
    
    def fetch_faction_data(self):
        url = f"{self.base_url}/faction/{self.faction_id}?selections=basic&key={self.api_key}"
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching faction data: {e}")
            return None
    
    # -----------------------------------
    # ACTIVITY LOGGING
    # -----------------------------------
    
    def log_activity_snapshot(self):
        data = self.fetch_faction_data()
        
        if not data or "members" not in data:
            print("Failed to fetch valid faction data")
            return False
        
        activity_log = self.load_json(self.activity_file)
        
        query_time = datetime.now().isoformat()
        snapshot = {
            "timestamp": query_time,
            "members": {}
        }
        
        members_data = self.load_json(self.members_file)
        
        for user_id, member_info in data["members"].items():
            user_id_str = str(int(user_id))
            
            name = member_info.get("name", "Unknown")
            level = member_info.get("level", 0)
            days = member_info.get("days_in_faction", 0)
            
            members_data[user_id_str] = {
                "name": name,
                "level": level,
                "days_in_faction": days
            }
            
            last_action = member_info.get("last_action", {})
            last_action_timestamp = last_action.get("timestamp", 0)
            last_action_relative = last_action.get("relative", "Unknown")
            status = last_action.get("status", "Unknown")
            
            snapshot["members"][user_id_str] = {
                "last_action_timestamp": last_action_timestamp,
                "last_action_relative": last_action_relative,
                "status": status
            }
        
        # -----------------------------------
        # DATA PERSISTENCE
        # -----------------------------------
        
        if "snapshots" not in activity_log:
            activity_log["snapshots"] = []
        
        activity_log["snapshots"].append(snapshot)
        
        if len(activity_log["snapshots"]) > 2880:
            activity_log["snapshots"] = activity_log["snapshots"][-2880:]
        
        self.save_json(self.activity_file, activity_log)
        self.save_json(self.members_file, members_data)
        
        logged_count = len(snapshot["members"])
        print(f"[{query_time}] Logged activity for {logged_count} members")
        return True
    
    # -----------------------------------
    # DASHBOARD GENERATION
    # -----------------------------------
    
    def generate_html_dashboard(self, output_file="index.html"):
        activity_log = self.load_json(self.activity_file)
        members_data = self.load_json(self.members_file)
        snapshots = activity_log.get("snapshots", [])
        
        if not snapshots:
            print("No activity data yet. Run the tracker first.")
            return False
        
        summary = self.get_activity_summary(days=7)
        
        sorted_members = sorted(
            summary.items(),
            key=lambda x: x[1]["last_seen_timestamp"],
            reverse=True
        )
        
        # -----------------------------------
        // BUILD MEMBER TABLE ROWS
        # -----------------------------------
        
        member_rows = ""
        for user_id, data in sorted_members:
            minutes_ago = (datetime.now() - datetime.fromtimestamp(data["last_seen_timestamp"])).total_seconds() / 60
            
            if minutes_ago < 60:
                status_class = "status-active"
                status_text = "Online"
            elif minutes_ago < 1440:
                status_class = "status-warning"
                status_text = "Today"
            else:
                status_class = "status-inactive"
                status_text = "Offline"
            
            member_rows += f"""
            <tr class="member-row" data-user-id="{user_id}">
                <td><strong>{data['name']}</strong></td>
                <td>{data['last_seen_relative']}</td>
                <td>{data['days_active']} days</td>
                <td><span class="status {status_class}">{status_text}</span></td>
                <td><a href="#" class="details-link" onclick="showActivity('{user_id}', '{data['name']}'); return false;">View</a></td>
            </tr>
            """
        
        # -----------------------------------
        // CALCULATE DASHBOARD STATISTICS
        # -----------------------------------
        
        last_poll = snapshots[-1]["timestamp"] if snapshots else "Never"
        active_24h = sum(1 for m in summary.values() if (datetime.now() - datetime.fromtimestamp(m["last_seen_timestamp"])).total_seconds() / 3600 < 24)
        logged_days = (datetime.fromisoformat(snapshots[-1]["timestamp"]).date() - datetime.fromisoformat(snapshots[0]["timestamp"]).date()).days + 1
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Torn Faction Activity Tracker</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="main-wrapper">
        <div class="container">
            <h1>⚔️ Faction Activity</h1>
            
            <div class="controls">
                <label>Time Range:</label>
                <select id="timeRange" onchange="updateDashboard()">
                    <option value="1">Last 24 Hours</option>
                    <option value="7" selected>Last 7 Days</option>
                    <option value="14">Last 14 Days</option>
                    <option value="30">Last 30 Days</option>
                </select>
                
                <label style="margin-left: 20px;">Search:</label>
                <input type="text" id="searchBox" placeholder="Filter by name..." onkeyup="filterMembers()">
            </div>
            
            <div class="summary">
                <div class="faction-card">
                    <div class="faction-name">Total Members</div>
                    <div class="score">{len(summary)}</div>
                </div>
                <div class="faction-card">
                    <div class="faction-name">Active (24h)</div>
                    <div class="score">{active_24h}</div>
                </div>
                <div class="faction-card">
                    <div class="faction-name">Data Logged</div>
                    <div class="score">{logged_days} days</div>
                </div>
                <div class="faction-card">
                    <div class="faction-name">Last Poll</div>
                    <div class="score" style="font-size: 0.9em;">{last_poll.split('T')[1][:5]}</div>
                </div>
            </div>
            
            <h2 style="margin: 25px 0 15px 0; color: #ff8c00; font-size: 1.1em;">Members</h2>
            <table class="deadline-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Last Seen</th>
                        <th>Days Active</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="membersTable">
                    {member_rows}
                </tbody>
            </table>
            
            <div id="activityDetail" class="activity-detail hidden">
                <button class="close-btn" onclick="closeActivity()">✕</button>
                <h4>Activity Timeline for <span id="memberName"></span></h4>
                <div class="activity-timeline" id="timeline"></div>
            </div>
            
            <div class="last-updated">
                Data last updated: {last_poll}
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>
"""
        
        with open(output_file, 'w') as f:
            f.write(html)
        
        print(f"Dashboard generated: {output_file}")
        return True
    
    # -----------------------------------
    // DATA ANALYSIS
    # -----------------------------------
    
    def get_activity_summary(self, days=7):
        activity_log = self.load_json(self.activity_file)
        members_data = self.load_json(self.members_file)
        snapshots = activity_log.get("snapshots", [])
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        recent_snapshots = [s for s in snapshots if s["timestamp"] > cutoff_date]
        
        summary = {}
        
        for user_id, member_info in members_data.items():
            member_activity = []
            
            for snapshot in recent_snapshots:
                if user_id in snapshot["members"]:
                    activity = snapshot["members"][user_id]
                    member_activity.append({
                        "timestamp": snapshot["timestamp"],
                        **activity
                    })
            
            if member_activity:
                most_recent = member_activity[-1]
                most_recent_ts = most_recent["last_action_timestamp"]
                
                active_dates = set()
                for activity in member_activity:
                    if activity["last_action_timestamp"] > 0:
                        date = datetime.fromtimestamp(activity["last_action_timestamp"]).date()
                        active_dates.add(str(date))
                
                summary[user_id] = {
                    "name": member_info["name"],
                    "level": member_info["level"],
                    "days_in_faction": member_info["days_in_faction"],
                    "last_seen_timestamp": most_recent_ts,
                    "last_seen_relative": most_recent["last_action_relative"],
                    "days_active": len(active_dates),
                    "total_polls": len(member_activity)
                }
        
        return summary

# -----------------------------------
// MAIN EXECUTION
# -----------------------------------

if __name__ == "__main__":
    tracker = TornActivityTracker(api_key, faction_id)
    success = tracker.log_activity_snapshot()
    
    if success:
        tracker.generate_html_dashboard()
        print("\n✓ Activity logged and dashboard updated")
        sys.exit(0)
    else:
        print("\n✗ Failed to log activity")
        sys.exit(1)
