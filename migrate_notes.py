#!/usr/bin/env python3
"""
Database migration script to add user_notes table for enhanced notes functionality.
"""

import sqlite3
import os
import sys

def migrate_database(db_path):
    """Add user_notes table for individual notes"""
    print(f"Migrating database at: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if user_notes table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_notes'")
        table_exists = cursor.fetchone()
        
        if not table_exists:
            print("Creating user_notes table...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    entry_date TEXT NOT NULL,
                    title TEXT,
                    content TEXT NOT NULL,
                    note_type TEXT DEFAULT 'general',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            """)
            print("user_notes table created successfully!")
        else:
            print("user_notes table already exists, skipping...")
        
        conn.commit()
        conn.close()
        print("Notes migration completed successfully!")
        
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

if __name__ == "__main__":
    main()