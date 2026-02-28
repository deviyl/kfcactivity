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
# MAIN EXECUTION
# -----------------------------------

if __name__ == "__main__":
    tracker = TornActivityTracker(api_key, faction_id)
    success = tracker.log_activity_snapshot()
    
    if success:
        print("\n✓ Activity logged successfully")
        sys.exit(0)
    else:
        print("\n✗ Failed to log activity")
        sys.exit(1)
