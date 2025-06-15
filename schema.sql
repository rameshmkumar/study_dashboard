-- Drop tables if they exist to ensure a clean slate (optional, for development)
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS daily_entries;
DROP TABLE IF EXISTS user_tasks;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User-defined tasks table
CREATE TABLE IF NOT EXISTS user_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL, -- YYYY-MM-DD
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT, -- HH:MM (for display and ordering)
    duration_minutes INTEGER, -- For display and planning
    status TEXT NOT NULL DEFAULT 'pending', -- pending, in-progress, completed
    time_spent INTEGER NOT NULL DEFAULT 0, -- Store time in milliseconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Daily notes (user-specific)
CREATE TABLE IF NOT EXISTS daily_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    notes TEXT,
    UNIQUE (user_id, entry_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Activity log (user-specific)
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    task_db_id INTEGER, -- Optional: link activity to a specific task
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (task_db_id) REFERENCES user_tasks (id) ON DELETE SET NULL
);