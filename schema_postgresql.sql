-- PostgreSQL Schema for FocusFlow
-- Drop tables if they exist to ensure a clean slate (optional, for development)
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS user_notes CASCADE;
DROP TABLE IF EXISTS daily_entries CASCADE;
DROP TABLE IF EXISTS user_tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-defined tasks table
CREATE TABLE user_tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    entry_date DATE NOT NULL, -- YYYY-MM-DD (using DATE type)
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIME, -- HH:MM (using TIME type)
    duration_minutes INTEGER, -- For display and planning
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, in-progress, completed, paused
    time_spent BIGINT NOT NULL DEFAULT 0, -- Store time in milliseconds
    timer_start_time TIMESTAMP, -- When current timer session started
    timer_session_id VARCHAR(100), -- Unique session ID for current timer
    last_sync_time TIMESTAMP, -- Last time timer was synced with server
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Daily notes (user-specific) - Updated to support multiple notes per day
CREATE TABLE daily_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    entry_date DATE NOT NULL,
    notes TEXT,
    UNIQUE (user_id, entry_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Individual notes table for multiple notes per day
CREATE TABLE user_notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    entry_date DATE NOT NULL, -- YYYY-MM-DD
    title VARCHAR(255),
    content TEXT NOT NULL,
    note_type VARCHAR(20) DEFAULT 'general', -- general, reflection, idea, reminder
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Activity log (user-specific)
CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    task_db_id INTEGER, -- Optional: link activity to a specific task
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (task_db_id) REFERENCES user_tasks (id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_user_tasks_user_date ON user_tasks(user_id, entry_date);
CREATE INDEX idx_user_notes_user_date ON user_notes(user_id, entry_date);
CREATE INDEX idx_activity_log_user_timestamp ON activity_log(user_id, timestamp);
CREATE INDEX idx_daily_entries_user_date ON daily_entries(user_id, entry_date);