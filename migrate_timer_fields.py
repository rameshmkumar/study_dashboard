#!/usr/bin/env python3
"""
Database migration script to add timer fields to existing FocusFlow databases.
Run this script to upgrade your existing database to support the new server-side timer.
"""

import sqlite3
import os
import sys

def migrate_database(db_path):
    """Add new timer fields to user_tasks table"""
    print(f"Migrating database at: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if the new columns already exist
        cursor.execute("PRAGMA table_info(user_tasks)")
        columns = [column[1] for column in cursor.fetchall()]
        
        new_columns = [
            ('timer_start_time', 'DATETIME'),
            ('timer_session_id', 'TEXT'),
            ('last_sync_time', 'DATETIME')
        ]
        
        # Add missing columns
        for column_name, column_type in new_columns:
            if column_name not in columns:
                print(f"Adding column: {column_name}")
                cursor.execute(f"ALTER TABLE user_tasks ADD COLUMN {column_name} {column_type}")
            else:
                print(f"Column {column_name} already exists, skipping...")
        
        # Update status column to include 'paused' if needed (this won't break existing data)
        print("Timer migration completed successfully!")
        
        conn.commit()
        conn.close()
        
    except sqlite3.Error as e:
        print(f"Database migration failed: {e}")
        sys.exit(1)

def main():
    # Check for database in instance folder
    instance_db = os.path.join(os.getcwd(), 'instance', 'focus_flow.db')
    
    if os.path.exists(instance_db):
        migrate_database(instance_db)
    else:
        print("No database found at instance/focus_flow.db")
        print("Please ensure your database exists before running migration.")
        print("You can create one by running: flask init-db")

if __name__ == "__main__":
    main()