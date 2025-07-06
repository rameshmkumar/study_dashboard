import json
import logging
import sys
import re
import psycopg2
import psycopg2.extras
from flask import Flask, render_template, request, jsonify, g, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import datetime, timedelta, date
import os
from dotenv import load_dotenv
from urllib.parse import urlparse

# Load environment variables
load_dotenv()

# --- App Configuration ---
# Database Configuration: PostgreSQL (Supabase)
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    # Parse the database URL for PostgreSQL connection
    url = urlparse(DATABASE_URL)
    DATABASE_CONFIG = {
        'host': url.hostname,
        'port': url.port or 5432,
        'database': url.path[1:],  # Remove leading '/'
        'user': url.username,
        'password': url.password,
        'sslmode': 'require'  # Required for most cloud databases
    }
    print(f"Using PostgreSQL database: {DATABASE_CONFIG['host']}")
else:
    # Fallback for local development (you'll need local PostgreSQL)
    DATABASE_CONFIG = {
        'host': 'localhost',
        'port': 5432,
        'database': 'focusflow_dev',
        'user': 'postgres',
        'password': 'password'
    }
    print("Warning: Using local PostgreSQL database for development")


# Flask App Initialization
app = Flask(__name__)

# Production Configuration
app.config['DATABASE_CONFIG'] = DATABASE_CONFIG
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a_very_strong_random_secret_key_for_dev_only_123!')
app.config['WTF_CSRF_ENABLED'] = os.environ.get('WTF_CSRF_ENABLED', 'True').lower() == 'true'
app.config['WTF_CSRF_TIME_LIMIT'] = int(os.environ.get('WTF_CSRF_TIME_LIMIT', '3600'))

# Session Security Configuration
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
app.config['SESSION_COOKIE_HTTPONLY'] = os.environ.get('SESSION_COOKIE_HTTPONLY', 'True').lower() == 'true'
app.config['SESSION_COOKIE_SAMESITE'] = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)  # 2 hour session timeout

# Security Check - Fail if using default SECRET_KEY in production
if app.config['SECRET_KEY'] == 'a_very_strong_random_secret_key_for_dev_only_123!':
    if os.environ.get('FLASK_ENV') == 'production' or os.environ.get('ENVIRONMENT') == 'production':
        app.logger.critical("CRITICAL SECURITY ERROR: Default SECRET_KEY detected in production environment!")
        app.logger.critical("Application will not start. Please set a strong SECRET_KEY environment variable.")
        print("CRITICAL SECURITY ERROR: Default SECRET_KEY detected in production!")
        print("Set a strong SECRET_KEY environment variable before starting the application.")
        sys.exit(1)
    else:
        print("WARNING: Using default SECRET_KEY. This is only safe in development!")

# Production middleware for proxy handling (Render, Heroku, etc.)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Initialize security extensions
csrf = CSRFProtect(app)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["1000 per day", "200 per hour"],  # Increased for better scalability (was 200/day, 50/hour)
    storage_uri=os.environ.get('RATELIMIT_STORAGE_URL', 'memory://')
)
limiter.init_app(app)

# Production Logging Configuration
if not app.debug:
    log_level = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper())
    
    # Create file handler for production logs
    if not os.path.exists('logs'):
        os.mkdir('logs')
    
    file_handler = logging.FileHandler('logs/focusflow.log')
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(log_level)
    app.logger.addHandler(file_handler)
    
    # Also log to console for cloud platforms
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(log_level)
    app.logger.addHandler(stream_handler)
    
    app.logger.setLevel(log_level)
    app.logger.info('FocusFlow startup')


# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- PostgreSQL Database Connection ---

# --- Security Helper Functions ---
def handle_database_error(e, operation, user_message="An error occurred. Please try again."):
    """Safely handle database errors without exposing sensitive information"""
    error_id = f"err_{int(datetime.now().timestamp())}"
    # Security: Never log sensitive data or full error details
    app.logger.error(f"Database error [{error_id}] during {operation}: {type(e).__name__}")
    return user_message, error_id

def safe_error_response(message="An error occurred. Please try again.", status_code=500):
    """Return a safe error response for API endpoints"""
    return jsonify({"error": message}), status_code

def validate_password(password):
    """
    Validate password strength according to security best practices
    Returns (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if len(password) > 128:
        return False, "Password must be less than 128 characters long"
    
    # Check for at least one lowercase letter
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    # Check for at least one uppercase letter
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    # Check for at least one digit
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    
    # Check for at least one special character
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character (!@#$%^&*(),.?\":{}|<>)"
    
    # Check for common weak passwords
    weak_passwords = ['password', '12345678', 'qwerty123', 'admin123', 'letmein123']
    if password.lower() in weak_passwords:
        return False, "Password is too common. Please choose a more secure password"
    
    return True, ""

def validate_timer_request(data, required_fields):
    """Validate timer API requests for security"""
    if not data:
        return False, "Invalid request data"
    
    for field in required_fields:
        if field not in data or not data[field]:
            return False, f"Missing required field: {field}"
    
    # Validate session_id format (should be session_timestamp_randomstring)
    session_id = data.get('session_id')
    if session_id and not re.match(r'^session_\d+_[a-z0-9]+$', session_id):
        return False, "Invalid session ID format"
    
    # Validate task_id is integer
    task_id = data.get('task_id')
    if task_id and not isinstance(task_id, int) and not str(task_id).isdigit():
        return False, "Invalid task ID format"
    
    return True, ""

def serialize_task_data(task_dict):
    """Convert task data for JSON serialization"""
    if not task_dict:
        return task_dict
    
    # Convert time objects to strings
    if task_dict.get('start_time'):
        task_dict['start_time'] = str(task_dict['start_time'])
    if task_dict.get('timer_start_time'):
        task_dict['timer_start_time'] = task_dict['timer_start_time'].isoformat() if hasattr(task_dict['timer_start_time'], 'isoformat') else str(task_dict['timer_start_time'])
    if task_dict.get('last_sync_time'):
        task_dict['last_sync_time'] = task_dict['last_sync_time'].isoformat() if hasattr(task_dict['last_sync_time'], 'isoformat') else str(task_dict['last_sync_time'])
    if task_dict.get('created_at'):
        task_dict['created_at'] = task_dict['created_at'].isoformat() if hasattr(task_dict['created_at'], 'isoformat') else str(task_dict['created_at'])
    if task_dict.get('updated_at'):
        task_dict['updated_at'] = task_dict['updated_at'].isoformat() if hasattr(task_dict['updated_at'], 'isoformat') else str(task_dict['updated_at'])
    
    return task_dict

# --- Database Helper Functions ---
def execute_query(query, params=None, fetch_one=False, fetch_all=False):
    """Helper function to execute PostgreSQL queries"""
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    
    try:
        cursor.execute(query, params)
        
        if fetch_one:
            result = cursor.fetchone()
            cursor.close()
            return result
        elif fetch_all:
            result = cursor.fetchall()
            cursor.close()
            return result
        else:
            # For INSERT/UPDATE/DELETE operations
            db.commit()
            cursor.close()
            return cursor.rowcount
            
    except Exception as e:
        db.rollback()
        cursor.close()
        raise e

def get_db():
    if 'db' not in g:
        try:
            g.db = psycopg2.connect(**app.config['DATABASE_CONFIG'])
            g.db.autocommit = False  # Use transactions
        except psycopg2.Error as e:
            print(f"Error connecting to PostgreSQL database: {e}")
            raise
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    # Initialize PostgreSQL database with schema
    try:
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            
            # Read and execute PostgreSQL schema
            with app.open_resource('schema_postgresql.sql', mode='r') as f:
                schema_sql = f.read()
                
            # Execute the schema (PostgreSQL handles multiple statements)
            cursor.execute(schema_sql)
            db.commit()
            cursor.close()
            
        print(f"PostgreSQL database initialized successfully at {app.config['DATABASE_CONFIG']['host']}")
    except Exception as e:
        print(f"Error during PostgreSQL database initialization: {e}")
        print(f"Database config: {app.config.get('DATABASE_CONFIG', 'Not Set')}")
        raise


@app.cli.command('init-db')
def init_db_command():
    init_db()
    # No print needed here as init_db() already prints

# Auto-initialize database on startup (for production deployments)
def ensure_database_initialized():
    """Ensure PostgreSQL database schema is initialized on app startup"""
    try:
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            
            # Check if users table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'users'
                );
            """)
            tables_exist = cursor.fetchone()[0]
            cursor.close()
            
            if not tables_exist:
                print("PostgreSQL database schema not found. Auto-initializing...")
                init_db()
                print("Database auto-initialization completed successfully.")
            else:
                print("PostgreSQL database schema already exists.")
                
    except Exception as e:
        print(f"Error during database initialization check: {e}")
        # Try to initialize anyway
        try:
            with app.app_context():
                init_db()
            print("Database auto-initialization completed successfully.")
        except Exception as init_error:
            print(f"Error during database auto-initialization: {init_error}")
            app.logger.error(f"Database initialization failed: {init_error}")

# Initialize database on import (when gunicorn starts the app)
ensure_database_initialized()

# --- User Model for Flask-Login ---
class User(UserMixin):
    def __init__(self, id, username, email, created_at=None): # Removed password_hash for security
        self.id = id
        self.username = username
        self.email = email
        self.created_at = created_at # Store it
        # NOTE: password_hash deliberately excluded for security

@login_manager.user_loader
def load_user(user_id):
    # Security: Only load necessary user data, exclude password_hash
    user_data = execute_query('SELECT id, username, email, created_at FROM users WHERE id = %s', (user_id,), fetch_one=True)
    if user_data:
        # Convert created_at if it's a string from the DB, otherwise use as is if already datetime
        created_at_val = user_data['created_at']
        if isinstance(created_at_val, str):
             try:
                created_at_val = datetime.fromisoformat(created_at_val)
             except ValueError: # Fallback if not ISO format, though schema.sql uses DATETIME DEFAULT CURRENT_TIMESTAMP
                created_at_val = None # Or handle error appropriately
        return User(user_data['id'], user_data['username'], user_data['email'], created_at_val)
    return None

# --- Routes (Home, Auth) ---
@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('home.html')

@app.route('/signup', methods=['GET', 'POST'])
@limiter.limit("10 per hour", methods=['POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        user_by_username = execute_query('SELECT id FROM users WHERE username = %s', (username,), fetch_one=True)
        user_by_email = execute_query('SELECT id FROM users WHERE email = %s', (email,), fetch_one=True)

        if user_by_username:
            flash('Username already exists.', 'error')
        elif user_by_email:
            flash('Email address already registered.', 'error')
        else:
            # Validate password strength
            is_valid, password_error = validate_password(password)
            if not is_valid:
                flash(password_error, 'error')
            else:
                password_hash = generate_password_hash(password, method='pbkdf2:sha256')
                try:
                    execute_query('INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)',
                               (username, email, password_hash))
                    flash('Account created successfully! Please log in.', 'success')
                    return redirect(url_for('login'))
                except psycopg2.Error as e:
                    user_message, error_id = handle_database_error(e, "user signup")
                    flash(user_message, 'error')


    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("20 per hour", methods=['POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = True if request.form.get('remember') else False

        # Security: Only get password_hash for verification, don't store it
        user_data = execute_query('SELECT id, username, email, password_hash, created_at FROM users WHERE username = %s', (username,), fetch_one=True)

        if not user_data or not check_password_hash(user_data['password_hash'], password):
            # Security: Add delay to prevent timing attacks
            import time
            time.sleep(0.5)
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))
        
        # Security: Regenerate session to prevent session fixation
        from flask import session
        session.regenerate = True
        
        created_at_val = user_data['created_at']
        if isinstance(created_at_val, str):
            created_at_val = datetime.fromisoformat(created_at_val)

        # Security: Create user object without password_hash
        user_obj = User(user_data['id'], user_data['username'], user_data['email'], created_at_val)
        login_user(user_obj, remember=remember)
        
        # Security: Log successful login
        app.logger.info(f"Successful login for user: {username} (ID: {user_data['id']})")
        
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('home'))

@app.route('/dashboard')
@login_required
def dashboard():
    # You could pass username or other details if needed by the template directly
    return render_template('dashboard.html', username=current_user.username)

@app.route('/achievements')
@login_required
def achievements():
    return render_template('achievements.html', username=current_user.username)

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')

        if not check_password_hash(current_user.password_hash, current_password):
            flash('Current password incorrect.', 'error')
        elif new_password != confirm_password:
            flash('New passwords do not match.', 'error')
        else:
            # Validate new password strength
            is_valid, password_error = validate_password(new_password)
            if not is_valid:
                flash(password_error, 'error')
            else:
                new_password_hash = generate_password_hash(new_password, method='pbkdf2:sha256')
                try:
                    execute_query('UPDATE users SET password_hash = %s WHERE id = %s', (new_password_hash, current_user.id))
                    
                    # Log the password change for security audit
                    app.logger.info(f"Password changed for user ID: {current_user.id}, username: {current_user.username}")
                    
                    # Force re-authentication for security
                    logout_user()
                    flash('Password updated successfully. Please log in with your new password.', 'success')
                    return redirect(url_for('login'))
                except psycopg2.Error as e:
                    user_message, error_id = handle_database_error(e, "password update")
                    flash(user_message, 'error')
        return redirect(url_for('profile'))
        
    return render_template('profile.html', user=current_user) # Pass the full user object

# --- API Endpoints (User Specific) ---
@app.route('/api/csrf-token', methods=['GET'])
@login_required
def get_csrf_token():
    """Provide CSRF token for JavaScript API calls"""
    from flask_wtf.csrf import generate_csrf
    return jsonify({'csrf_token': generate_csrf()})

@app.route('/api/daily-summary', methods=['GET'])
@login_required
@limiter.limit("60 per minute")  # Allow frequent data refresh but prevent abuse
def get_daily_summary():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    tasks_raw = execute_query(
        """SELECT id, title, description, start_time, duration_minutes, status, time_spent,
                  timer_start_time, timer_session_id, last_sync_time
           FROM user_tasks 
           WHERE user_id = %s AND entry_date = %s 
           ORDER BY CASE WHEN start_time IS NULL THEN 1 ELSE 0 END, start_time, created_at""", 
        (current_user.id, date_str), fetch_all=True
    )
    
    # Convert time objects to strings for JSON serialization
    tasks = []
    if tasks_raw:
        for row in tasks_raw:
            task = dict(row)
            # Convert time objects to strings
            if task.get('start_time'):
                task['start_time'] = str(task['start_time'])
            if task.get('timer_start_time'):
                task['timer_start_time'] = task['timer_start_time'].isoformat() if hasattr(task['timer_start_time'], 'isoformat') else str(task['timer_start_time'])
            if task.get('last_sync_time'):
                task['last_sync_time'] = task['last_sync_time'].isoformat() if hasattr(task['last_sync_time'], 'isoformat') else str(task['last_sync_time'])
            tasks.append(task)

    daily_entry = execute_query('SELECT notes FROM daily_entries WHERE user_id = %s AND entry_date = %s', (current_user.id, date_str), fetch_one=True)
    notes = daily_entry['notes'] if daily_entry else ''

    activity_log_data_raw = execute_query(
        "SELECT message, timestamp, task_db_id FROM activity_log WHERE user_id = %s AND DATE(timestamp) = DATE(%s) ORDER BY timestamp DESC", 
        (current_user.id, date_str), fetch_all=True
    )
    activity_log_data = [{'message': row['message'], 'timestamp': row['timestamp'].isoformat(), 'task_db_id': row['task_db_id']} for row in activity_log_data_raw] if activity_log_data_raw else []
    
    completed_dates_raw = execute_query(
        """SELECT DISTINCT entry_date FROM user_tasks 
           WHERE user_id = %s AND status = 'completed' 
           ORDER BY entry_date DESC""", (current_user.id,), fetch_all=True
    )
    completed_dates_str = [row['entry_date'] for row in completed_dates_raw] if completed_dates_raw else []
    
    current_streak = 0
    if completed_dates_str:
        today_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        last_streak_date = None
        # Iterate through unique completed dates, from most recent
        unique_sorted_completed_dates = sorted(list(set(d if isinstance(d, date) else datetime.strptime(d, '%Y-%m-%d').date() for d in completed_dates_str)), reverse=True)

        for completed_date_obj in unique_sorted_completed_dates:
            if completed_date_obj > today_obj: # Ignore future completed dates (should not happen)
                continue

            if last_streak_date is None: # First relevant completed day we are checking
                if completed_date_obj == today_obj:
                    current_streak = 1
                    last_streak_date = completed_date_obj
                elif completed_date_obj == today_obj - timedelta(days=1): # Streak from yesterday
                    current_streak = 1 # Will be incremented if more historical dates match
                    last_streak_date = completed_date_obj
                # If neither today nor yesterday, streak is 0 unless older dates form a sequence up to yesterday
            elif last_streak_date - timedelta(days=1) == completed_date_obj:
                current_streak += 1
                last_streak_date = completed_date_obj
            else: # Streak broken
                # If the first date we found was yesterday, and now there's a gap, current_streak is already 1
                # If the first date was today, and now there's a gap, current_streak is 1.
                # If there was a sequence leading up to 'last_streak_date' and now it's broken, stop.
                break 
        
        # If the loop finished and last_streak_date was today, current_streak is already correct.
        # If today has a completed task but the loop didn't set streak (e.g., no tasks yesterday), ensure it's at least 1.
        if current_streak == 0 and today_obj in unique_sorted_completed_dates:
             current_streak = 1


    return jsonify({
        'tasks': tasks,
        'notes': notes,
        'activityLog': activity_log_data,
        'streak': current_streak
    })

@app.route('/api/user-tasks', methods=['POST'])
@login_required
@limiter.limit("30 per minute")  # Prevent rapid task creation spam
def create_task():
    data = request.json
    try:
        execute_query(
            """INSERT INTO user_tasks (user_id, entry_date, title, description, start_time, duration_minutes, status, time_spent)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (current_user.id, data['entry_date'], data['title'], data.get('description', ''), 
             data.get('start_time') or None, data.get('duration_minutes') or None, 'pending', 0)
        )
        
        # Get the new task data
        new_task_data = execute_query("SELECT * FROM user_tasks WHERE user_id = %s AND entry_date = %s ORDER BY id DESC LIMIT 1", 
                                     (current_user.id, data['entry_date']), fetch_one=True)
        # Serialize for JSON
        serialized_task = serialize_task_data(dict(new_task_data)) if new_task_data else {}
        return jsonify(serialized_task), 201
    except psycopg2.Error as e:
        handle_database_error(e, "task creation")
        return safe_error_response("Failed to create task")


@app.route('/api/user-tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    data = request.json
    task_check = execute_query("SELECT id FROM user_tasks WHERE id = %s AND user_id = %s", (task_id, current_user.id), fetch_one=True)
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404
    try:
        execute_query(
            """UPDATE user_tasks SET 
               title = %s, description = %s, start_time = %s, duration_minutes = %s, status = %s, time_spent = %s
               WHERE id = %s AND user_id = %s""",
            (data['title'], data.get('description', ''), data.get('start_time') or None, data.get('duration_minutes') or None,
             data['status'], data['time_spent'], task_id, current_user.id)
        )
        updated_task_data = execute_query("SELECT * FROM user_tasks WHERE id = %s", (task_id,), fetch_one=True)
        # Serialize for JSON
        serialized_task = serialize_task_data(dict(updated_task_data)) if updated_task_data else {}
        return jsonify(serialized_task)
    except psycopg2.Error as e:
        handle_database_error(e, "task update")
        return safe_error_response("Failed to update task")

@app.route('/api/user-tasks/<int:task_id>/status', methods=['PUT'])
@login_required
def update_task_status_and_time(task_id):
    data = request.json
    task_check = execute_query("SELECT id FROM user_tasks WHERE id = %s AND user_id = %s", (task_id, current_user.id), fetch_one=True)
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404
    try:    
        execute_query(
            "UPDATE user_tasks SET status = %s, time_spent = %s WHERE id = %s AND user_id = %s",
            (data['status'], data['time_spent'], task_id, current_user.id)
        )
        return jsonify({'status': 'success', 'message': 'Task status and time updated.'})
    except psycopg2.Error as e:
        handle_database_error(e, "task status update")
        return safe_error_response("Failed to update task status")


@app.route('/api/user-tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task_check = execute_query("SELECT id FROM user_tasks WHERE id = %s AND user_id = %s", (task_id, current_user.id), fetch_one=True)
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404
    try:
        execute_query("DELETE FROM user_tasks WHERE id = %s AND user_id = %s", (task_id, current_user.id))
        return jsonify({'status': 'success', 'message': 'Task deleted.'}), 200 # 200 or 204
    except psycopg2.Error as e:
        handle_database_error(e, "task deletion")
        return safe_error_response("Failed to delete task")


@app.route('/api/notes/save', methods=['POST'])
@login_required
def save_notes_api():
    data = request.json
    try:
        execute_query(
            """INSERT INTO daily_entries (user_id, entry_date, notes)
               VALUES (%s, %s, %s)
               ON CONFLICT(user_id, entry_date) DO UPDATE SET notes = excluded.notes""",
            (current_user.id, data['date'], data['notes'])
        )
        return jsonify({'status': 'success'})
    except psycopg2.Error as e:
        handle_database_error(e, "notes save")
        return safe_error_response("Failed to save notes")

# --- Enhanced Notes API ---
@app.route('/api/user-notes', methods=['POST'])
@login_required
@limiter.limit("20 per minute")  # Prevent rapid note creation spam
def create_note():
    data = request.json
    title = data.get('title', '')
    content = data.get('content', '')
    note_type = data.get('note_type', 'general')
    entry_date = data.get('entry_date', datetime.now().strftime('%Y-%m-%d'))
    
    if not content.strip():
        return jsonify({"error": "Note content is required"}), 400
    
    try:
        execute_query(
            """INSERT INTO user_notes (user_id, entry_date, title, content, note_type)
               VALUES (%s, %s, %s, %s, %s)""",
            (current_user.id, entry_date, title, content, note_type)
        )
        
        # Get the created note
        note = execute_query(
            "SELECT * FROM user_notes WHERE user_id = %s AND entry_date = %s ORDER BY created_at DESC LIMIT 1", 
            (current_user.id, entry_date), fetch_one=True
        )
        
        # Serialize for JSON
        serialized_note = serialize_task_data(dict(note)) if note else {}
        return jsonify(serialized_note), 201
    except psycopg2.Error as e:
        handle_database_error(e, "note creation")
        return safe_error_response("Failed to create note")

@app.route('/api/user-notes', methods=['GET'])
@login_required
def get_notes():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    notes_raw = execute_query(
        """SELECT id, title, content, note_type, created_at, updated_at
           FROM user_notes 
           WHERE user_id = %s AND entry_date = %s 
           ORDER BY created_at DESC""",
        (current_user.id, date_str), fetch_all=True
    )
    # Serialize notes for JSON
    notes = [serialize_task_data(dict(row)) for row in notes_raw] if notes_raw else []
    
    return jsonify({'notes': notes, 'date': date_str})

@app.route('/api/user-notes/<int:note_id>', methods=['PUT'])
@login_required
def update_note(note_id):
    data = request.json
    
    # Verify note belongs to user
    note_check = execute_query(
        "SELECT id FROM user_notes WHERE id = %s AND user_id = %s", 
        (note_id, current_user.id), fetch_one=True
    )
    
    if not note_check:
        return jsonify({"error": "Note not found or unauthorized"}), 404
    
    try:
        execute_query(
            """UPDATE user_notes SET 
               title = %s, content = %s, note_type = %s, updated_at = %s
               WHERE id = %s AND user_id = %s""",
            (data.get('title', ''), data['content'], data.get('note_type', 'general'),
             datetime.now(), note_id, current_user.id)
        )
        
        # Get updated note
        updated_note = execute_query(
            "SELECT * FROM user_notes WHERE id = %s", (note_id,), fetch_one=True
        )
        
        # Serialize for JSON
        serialized_note = serialize_task_data(dict(updated_note)) if updated_note else {}
        return jsonify(serialized_note)
    except psycopg2.Error as e:
        handle_database_error(e, "note update")
        return safe_error_response("Failed to update note")

@app.route('/api/user-notes/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    # Verify note belongs to user
    note_check = execute_query(
        "SELECT id FROM user_notes WHERE id = %s AND user_id = %s", 
        (note_id, current_user.id), fetch_one=True
    )
    
    if not note_check:
        return jsonify({"error": "Note not found or unauthorized"}), 404
    
    try:
        execute_query("DELETE FROM user_notes WHERE id = %s AND user_id = %s", 
                  (note_id, current_user.id))
        return jsonify({'status': 'success', 'message': 'Note deleted'}), 200
    except psycopg2.Error as e:
        handle_database_error(e, "note deletion")
        return safe_error_response("Failed to delete note")

@app.route('/api/analytics', methods=['GET'])
@login_required
def get_analytics():
    # Get user's task statistics
    total_tasks_result = execute_query(
        "SELECT COUNT(*) as total FROM user_tasks WHERE user_id = %s", (current_user.id,), fetch_one=True
    )
    total_tasks = total_tasks_result['total'] if total_tasks_result else 0
    
    completed_tasks_result = execute_query(
        "SELECT COUNT(*) as completed FROM user_tasks WHERE user_id = %s AND status = 'completed'", 
        (current_user.id,), fetch_one=True
    )
    completed_tasks = completed_tasks_result['completed'] if completed_tasks_result else 0
    
    # Get total time worked (in minutes)
    total_time_result = execute_query(
        "SELECT SUM(time_spent) as total_time FROM user_tasks WHERE user_id = %s", (current_user.id,), fetch_one=True
    )
    total_time_ms = total_time_result['total_time'] if total_time_result and total_time_result['total_time'] else 0
    total_time_hours = total_time_ms / (1000 * 60 * 60)  # Convert to hours
    
    # Get productivity by day of week (PostgreSQL version)
    productivity_data = execute_query("""
        SELECT 
            CASE EXTRACT(DOW FROM entry_date::date)
                WHEN 0 THEN 'Sunday'
                WHEN 1 THEN 'Monday' 
                WHEN 2 THEN 'Tuesday'
                WHEN 3 THEN 'Wednesday'
                WHEN 4 THEN 'Thursday'
                WHEN 5 THEN 'Friday'
                WHEN 6 THEN 'Saturday'
            END as day_name,
            COUNT(*) as tasks_completed,
            SUM(time_spent) as time_spent
        FROM user_tasks 
        WHERE user_id = %s AND status = 'completed'
        GROUP BY EXTRACT(DOW FROM entry_date::date)
        ORDER BY EXTRACT(DOW FROM entry_date::date)
    """, (current_user.id,), fetch_all=True)
    
    productivity_by_day = [dict(row) for row in productivity_data] if productivity_data else []
    
    # Get current streak
    streak_data = execute_query("""
        SELECT DISTINCT entry_date FROM user_tasks 
        WHERE user_id = %s AND status = 'completed' 
        ORDER BY entry_date DESC
    """, (current_user.id,), fetch_all=True)
    
    completed_dates = [str(row['entry_date']) for row in streak_data] if streak_data else []
    current_streak = calculate_streak(completed_dates)
    
    # Get monthly activity (last 12 months) - PostgreSQL version
    monthly_data = execute_query("""
        SELECT 
            TO_CHAR(entry_date::date, 'YYYY-MM') as month,
            COUNT(*) as tasks_completed,
            SUM(time_spent) as time_spent
        FROM user_tasks 
        WHERE user_id = %s AND status = 'completed'
        GROUP BY TO_CHAR(entry_date::date, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 12
    """, (current_user.id,), fetch_all=True)
    
    monthly_activity = [dict(row) for row in monthly_data] if monthly_data else []
    
    # Get achievements
    achievements = calculate_achievements(current_user.id, total_tasks, completed_tasks, total_time_hours, current_streak)
    
    return jsonify({
        'totalTasks': total_tasks,
        'completedTasks': completed_tasks,
        'totalTimeHours': round(total_time_hours, 1),
        'currentStreak': current_streak,
        'productivityByDay': productivity_by_day,
        'monthlyActivity': monthly_activity,
        'achievements': achievements
    })

def calculate_streak(completed_dates):
    if not completed_dates:
        return 0
    
    from datetime import datetime, timedelta, date
    today = datetime.now().date()
    current_streak = 0
    
    # Convert strings to dates and sort
    dates = sorted([datetime.strptime(d, '%Y-%m-%d').date() for d in completed_dates], reverse=True)
    
    # Check for current streak
    for i, date in enumerate(dates):
        expected_date = today - timedelta(days=i)
        if date == expected_date:
            current_streak += 1
        else:
            break
    
    return current_streak

def calculate_achievements(user_id, total_tasks, completed_tasks, total_hours, streak):
    achievements = []
    
    # Task-based achievements
    if completed_tasks >= 1:
        achievements.append({"name": "First Step", "description": "Complete your first task", "icon": "<i class='fas fa-bullseye'></i>", "unlocked": True})
    if completed_tasks >= 10:
        achievements.append({"name": "Getting Started", "description": "Complete 10 tasks", "icon": "<i class='fas fa-chart-line'></i>", "unlocked": True})
    if completed_tasks >= 50:
        achievements.append({"name": "Productive", "description": "Complete 50 tasks", "icon": "<i class='fas fa-rocket'></i>", "unlocked": True})
    if completed_tasks >= 100:
        achievements.append({"name": "Task Master", "description": "Complete 100 tasks", "icon": "<i class='fas fa-crown'></i>", "unlocked": True})
    
    # Time-based achievements  
    if total_hours >= 1:
        achievements.append({"name": "Focused Hour", "description": "Work for 1 hour total", "icon": "<i class='fas fa-clock'></i>", "unlocked": True})
    if total_hours >= 10:
        achievements.append({"name": "Dedicated", "description": "Work for 10 hours total", "icon": "<i class='fas fa-dumbbell'></i>", "unlocked": True})
    if total_hours >= 100:
        achievements.append({"name": "Century Club", "description": "Work for 100 hours total", "icon": "<i class='fas fa-trophy'></i>", "unlocked": True})
    
    # Streak-based achievements
    if streak >= 3:
        achievements.append({"name": "Consistent", "description": "3-day streak", "icon": "<i class='fas fa-fire'></i>", "unlocked": True})
    if streak >= 7:
        achievements.append({"name": "Weekly Warrior", "description": "7-day streak", "icon": "<i class='fas fa-bolt'></i>", "unlocked": True})
    if streak >= 30:
        achievements.append({"name": "Monthly Master", "description": "30-day streak", "icon": "<i class='fas fa-star'></i>", "unlocked": True})
    
    return achievements

@app.route('/api/profile/stats', methods=['GET'])
@login_required
def get_profile_stats():
    """Get comprehensive profile statistics for the user"""
    
    # Get total tasks
    total_tasks_result = execute_query(
        "SELECT COUNT(*) as total FROM user_tasks WHERE user_id = %s", (current_user.id,), fetch_one=True
    )
    total_tasks = total_tasks_result['total'] if total_tasks_result else 0
    
    # Get completed tasks
    completed_tasks_result = execute_query(
        "SELECT COUNT(*) as completed FROM user_tasks WHERE user_id = %s AND status = 'completed'", 
        (current_user.id,), fetch_one=True
    )
    completed_tasks = completed_tasks_result['completed'] if completed_tasks_result else 0
    
    # Get total time worked (in hours)
    total_time_result = execute_query(
        "SELECT SUM(time_spent) as total_time FROM user_tasks WHERE user_id = %s", (current_user.id,), fetch_one=True
    )
    total_time_ms = total_time_result['total_time'] if total_time_result and total_time_result['total_time'] else 0
    total_hours = round(total_time_ms / (1000 * 60 * 60), 1)
    
    # Get current streak
    streak_data = execute_query("""
        SELECT DISTINCT entry_date FROM user_tasks 
        WHERE user_id = %s AND status = 'completed' 
        ORDER BY entry_date DESC
    """, (current_user.id,), fetch_all=True)
    completed_dates = [str(row['entry_date']) for row in streak_data] if streak_data else []
    current_streak = calculate_streak(completed_dates)
    
    # Calculate longest streak
    longest_streak = calculate_longest_streak(completed_dates)
    
    # Get achievements count
    achievements = calculate_achievements(current_user.id, total_tasks, completed_tasks, total_hours, current_streak)
    achievements_count = len([a for a in achievements if a['unlocked']])
    
    return jsonify({
        'totalTasks': total_tasks,
        'completedTasks': completed_tasks,
        'totalHours': total_hours,
        'currentStreak': current_streak,
        'longestStreak': longest_streak,
        'achievementsCount': achievements_count
    })

def calculate_longest_streak(completed_dates):
    """Calculate the longest streak from completed dates"""
    if not completed_dates:
        return 0
    
    # Convert strings to dates and sort
    dates = sorted([datetime.strptime(d, '%Y-%m-%d').date() for d in completed_dates])
    
    if not dates:
        return 0
    
    longest_streak = 1
    current_streak = 1
    
    for i in range(1, len(dates)):
        if dates[i] == dates[i-1] + timedelta(days=1):
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        else:
            current_streak = 1
    
    return longest_streak

@app.route('/api/activity/log', methods=['POST'])
@login_required
def log_activity_api():
    data = request.json
    try:
        execute_query(
            "INSERT INTO activity_log (user_id, message, timestamp, task_db_id) VALUES (%s, %s, %s, %s)",
            (current_user.id, data['message'], datetime.now(), data.get('task_db_id'))
        )
        return jsonify({'status': 'success'})
    except psycopg2.Error as e:
        handle_database_error(e, "activity logging")
        return safe_error_response("Failed to log activity")

# --- Timer Management API ---
@app.route('/api/timer/start', methods=['POST'])
@login_required
@csrf.exempt  # Will handle CSRF in the function
def start_timer():
    data = request.json
    
    # Security: Validate request data
    is_valid, error_msg = validate_timer_request(data, ['task_id', 'session_id'])
    if not is_valid:
        return jsonify({"error": error_msg}), 400
    
    task_id = int(data.get('task_id'))  # Convert to int after validation
    session_id = data.get('session_id')
    
    # Verify task belongs to user
    task = execute_query("SELECT id, status FROM user_tasks WHERE id = %s AND user_id = %s", 
                     (task_id, current_user.id), fetch_one=True)
    if not task:
        return jsonify({"error": "Task not found or unauthorized"}), 404
    
    if task['status'] == 'completed':
        return jsonify({"error": "Cannot start timer for completed task"}), 400
    
    try:
        # Stop any other running timers for this user and clean up stale sessions
        execute_query(
            """UPDATE user_tasks SET 
               status = CASE WHEN status = 'in-progress' THEN 'paused' ELSE status END,
               timer_start_time = NULL, 
               timer_session_id = NULL,
               last_sync_time = NULL
               WHERE user_id = %s AND (timer_start_time IS NOT NULL OR timer_session_id IS NOT NULL)""",
            (current_user.id,)
        )
        
        # Start the new timer
        now = datetime.now()
        execute_query(
            """UPDATE user_tasks SET 
               status = 'in-progress',
               timer_start_time = %s,
               timer_session_id = %s,
               last_sync_time = %s
               WHERE id = %s AND user_id = %s""",
            (now, session_id, now, task_id, current_user.id)
        )
        
        return jsonify({
            'status': 'success',
            'timer_start_time': now.isoformat(),
            'session_id': session_id
        })
    except psycopg2.Error as e:
        handle_database_error(e, "timer start")
        return safe_error_response("Failed to start timer")

@app.route('/api/timer/pause', methods=['POST'])
@login_required
@csrf.exempt  # Will handle CSRF in the function
def pause_timer():
    data = request.json
    task_id = data.get('task_id')
    session_id = data.get('session_id')
    
    if not task_id or not session_id:
        return jsonify({"error": "task_id and session_id are required"}), 400
    
    # Get current timer state
    task = execute_query(
        """SELECT timer_start_time, timer_session_id, time_spent 
           FROM user_tasks 
           WHERE id = %s AND user_id = %s AND timer_session_id = %s""",
        (task_id, current_user.id, session_id), fetch_one=True
    )
    
    if not task or not task['timer_start_time']:
        return jsonify({"error": "No active timer found for this task"}), 400
    
    try:
        # Calculate elapsed time
        # Handle both datetime objects and ISO strings
        if isinstance(task['timer_start_time'], str):
            start_time = datetime.fromisoformat(task['timer_start_time'])
        else:
            start_time = task['timer_start_time']
        elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        new_time_spent = task['time_spent'] + elapsed_ms
        
        # Pause the timer
        execute_query(
            """UPDATE user_tasks SET 
               status = 'paused',
               time_spent = %s,
               timer_start_time = NULL,
               timer_session_id = NULL,
               last_sync_time = %s
               WHERE id = %s AND user_id = %s""",
            (new_time_spent, datetime.now(), task_id, current_user.id)
        )
        
        return jsonify({
            'status': 'success',
            'time_spent': new_time_spent,
            'elapsed_in_session': elapsed_ms
        })
    except psycopg2.Error as e:
        handle_database_error(e, "timer pause")
        return safe_error_response("Failed to pause timer")

@app.route('/api/timer/stop', methods=['POST'])
@login_required
@csrf.exempt  # Will handle CSRF in the function
def stop_timer():
    data = request.json
    task_id = data.get('task_id')
    session_id = data.get('session_id')
    
    if not task_id or not session_id:
        return jsonify({"error": "task_id and session_id are required"}), 400
    
    # Get current timer state
    task = execute_query(
        """SELECT timer_start_time, timer_session_id, time_spent, title 
           FROM user_tasks 
           WHERE id = %s AND user_id = %s AND timer_session_id = %s""",
        (task_id, current_user.id, session_id), fetch_one=True
    )
    
    if not task:
        return jsonify({"error": "Task not found or session mismatch"}), 400
    
    try:
        # Calculate elapsed time if timer was running
        elapsed_ms = 0
        if task['timer_start_time']:
            # Handle both datetime objects and ISO strings
            if isinstance(task['timer_start_time'], str):
                start_time = datetime.fromisoformat(task['timer_start_time'])
            else:
                start_time = task['timer_start_time']
            elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        new_time_spent = task['time_spent'] + elapsed_ms
        
        # Stop the timer and mark as completed
        execute_query(
            """UPDATE user_tasks SET 
               status = 'completed',
               time_spent = %s,
               timer_start_time = NULL,
               timer_session_id = NULL,
               last_sync_time = %s
               WHERE id = %s AND user_id = %s""",
            (new_time_spent, datetime.now(), task_id, current_user.id)
        )
        
        # Log the completion
        execute_query(
            "INSERT INTO activity_log (user_id, message, timestamp, task_db_id) VALUES (%s, %s, %s, %s)",
            (current_user.id, f"Completed task: {task['title']}", datetime.now(), task_id)
        )
        
        return jsonify({
            'status': 'success',
            'time_spent': new_time_spent,
            'elapsed_in_session': elapsed_ms
        })
    except psycopg2.Error as e:
        handle_database_error(e, "timer stop")
        return safe_error_response("Failed to stop timer")

@app.route('/api/timer/sync', methods=['POST'])
@login_required
@csrf.exempt  # Will handle CSRF in the function
@limiter.limit("1000 per minute")  # Support concurrent timer sessions (was 120)
def sync_timer():
    data = request.json
    task_id = data.get('task_id')
    session_id = data.get('session_id')
    
    if not task_id or not session_id:
        return jsonify({"error": "task_id and session_id are required"}), 400
    
    # Get current timer state
    task = execute_query(
        """SELECT timer_start_time, timer_session_id, time_spent, status, title
           FROM user_tasks 
           WHERE id = %s AND user_id = %s""",
        (task_id, current_user.id), fetch_one=True
    )
    
    if not task:
        return jsonify({"error": "Task not found"}), 404
    
    # Check if session is still valid
    if task['timer_session_id'] != session_id:
        return jsonify({
            'status': 'session_invalid',
            'message': 'Timer session is no longer valid'
        }), 200
    
    # Calculate current elapsed time
    current_elapsed_ms = 0
    if task['timer_start_time'] and task['status'] == 'in-progress':
        # Handle both datetime objects and ISO strings
        if isinstance(task['timer_start_time'], str):
            start_time = datetime.fromisoformat(task['timer_start_time'])
        else:
            start_time = task['timer_start_time']
        current_elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
    
    try:
        # Update last sync time
        execute_query(
            "UPDATE user_tasks SET last_sync_time = %s WHERE id = %s AND user_id = %s",
            (datetime.now(), task_id, current_user.id)
        )
        
        return jsonify({
            'status': 'success',
            'task_status': task['status'],
            'time_spent': task['time_spent'],
            'current_session_elapsed': current_elapsed_ms,
            'total_display_time': task['time_spent'] + current_elapsed_ms,
            'timer_start_time': task['timer_start_time']
        })
    except psycopg2.Error as e:
        handle_database_error(e, "timer sync")
        return safe_error_response("Failed to sync timer")

@app.route('/api/timer/cleanup', methods=['POST'])
@login_required
@csrf.exempt
def cleanup_timer():
    data = request.json
    
    # Security: Validate request data
    is_valid, error_msg = validate_timer_request(data, ['task_id', 'session_id'])
    if not is_valid:
        return jsonify({"error": error_msg}), 400
    
    task_id = int(data.get('task_id'))
    session_id = data.get('session_id')
    
    # Verify task belongs to user
    task = execute_query("SELECT id FROM user_tasks WHERE id = %s AND user_id = %s", 
                         (task_id, current_user.id), fetch_one=True)
    if not task:
        return jsonify({"error": "Task not found or unauthorized"}), 404
    
    try:
        # Clean up stale timer session
        execute_query(
            """UPDATE user_tasks SET 
               status = CASE WHEN status = 'in-progress' THEN 'paused' ELSE status END,
               timer_start_time = NULL, 
               timer_session_id = NULL,
               last_sync_time = NULL
               WHERE id = %s AND user_id = %s AND timer_session_id = %s""",
            (task_id, current_user.id, session_id)
        )
        
        return jsonify({'status': 'success'})
    except psycopg2.Error as e:
        handle_database_error(e, "timer cleanup")
        return safe_error_response("Failed to cleanup timer")

@app.route('/api/timer/status/<int:task_id>', methods=['GET'])
@login_required
@limiter.limit("1000 per minute")  # Support concurrent timer sessions (was 120)
def get_timer_status(task_id):
    task = execute_query(
        """SELECT status, time_spent, timer_start_time, timer_session_id, title
           FROM user_tasks 
           WHERE id = %s AND user_id = %s""",
        (task_id, current_user.id), fetch_one=True
    )
    
    if not task:
        return jsonify({"error": "Task not found"}), 404
    
    # Calculate current elapsed time if timer is running
    current_elapsed_ms = 0
    if task['timer_start_time'] and task['status'] == 'in-progress':
        # Handle both datetime objects and ISO strings
        if isinstance(task['timer_start_time'], str):
            start_time = datetime.fromisoformat(task['timer_start_time'])
        else:
            start_time = task['timer_start_time']
        current_elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
    
    return jsonify({
        'task_id': task_id,
        'status': task['status'],
        'time_spent': task['time_spent'],
        'current_session_elapsed': current_elapsed_ms,
        'total_display_time': task['time_spent'] + current_elapsed_ms,
        'timer_start_time': task['timer_start_time'],
        'session_id': task['timer_session_id'],
        'title': task['title']
    })

# This part is for running with `python app.py` locally
# Gunicorn will not use this when deployed on Render.
# --- Production Security Headers ---
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # Content Security Policy - Allow necessary external resources
    csp_policy = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "  # unsafe-inline needed for inline scripts
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
    response.headers['Content-Security-Policy'] = csp_policy
    
    # Additional security headers
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    
    return response

# --- Error Handlers ---
@app.errorhandler(404)
def not_found_error(error):
    app.logger.warning(f'404 error: {request.url}')
    return render_template('errors/404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'500 error: {error}')
    db = g.pop('db', None)
    if db is not None:
        db.rollback()
    return render_template('errors/500.html'), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    app.logger.warning(f'Rate limit exceeded: {request.remote_addr}')
    return jsonify({'error': 'Rate limit exceeded', 'message': str(e.description)}), 429

# --- Health Check Endpoint ---
@app.route('/health')
@limiter.exempt
def health_check():
    try:
        # Simple database health check
        execute_query('SELECT 1', fetch_one=True)
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'version': '1.0.0'
        }), 200
    except Exception as e:
        app.logger.error(f'Health check failed: {e}')
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 503

# --- Keep-Alive Endpoint (for uptime monitoring) ---
@app.route('/ping')
@limiter.exempt
def ping():
    """Simple ping endpoint for uptime monitoring services"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat()
    }), 200

# Note: Rate limiting is applied via decorators on existing routes

if __name__ == '__main__':
    # PostgreSQL database is initialized automatically via ensure_database_initialized()
    # No need for local file checks since we're using cloud database

    # Run with different settings for development vs production
    if os.environ.get('FLASK_ENV') == 'production':
        app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
    else:
        app.run(debug=True, port=5001)