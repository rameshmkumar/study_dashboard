import sqlite3
import json
from flask import Flask, render_template, request, jsonify, g, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

# --- App Configuration ---
DATABASE = 'instance/focus_flow.db' # Store DB in instance folder
SECRET_KEY = 'your_very_secret_key_here' # Change this!

app = Flask(__name__)
app.config['DATABASE'] = DATABASE
app.config['SECRET_KEY'] = SECRET_KEY

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login' # Redirect to 'login' view if @login_required fails

# --- Datetime Handling for SQLite ---
def adapt_datetime(dt_obj):
    return dt_obj.isoformat()

def convert_timestamp(ts_bytes):
    return datetime.fromisoformat(ts_bytes.decode('utf-8'))

sqlite3.register_adapter(datetime, adapt_datetime)
sqlite3.register_converter("timestamp", convert_timestamp)
sqlite3.register_converter("datetime", convert_timestamp)

# --- Database Helper Functions ---
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON") # Enable foreign key constraint enforcement
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()
    print("Database initialized.")

@app.cli.command('init-db')
def init_db_command():
    init_db()
    print('Initialized the database.')

# --- User Model for Flask-Login ---
class User(UserMixin):
    def __init__(self, id, username, email, password_hash):
        self.id = id
        self.username = username
        self.email = email
        self.password_hash = password_hash

@login_manager.user_loader
def load_user(user_id):
    db = get_db()
    user_data = db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    if user_data:
        return User(user_data['id'], user_data['username'], user_data['email'], user_data['password_hash'])
    return None

# --- Routes ---
@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('home.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        db = get_db()
        user_by_username = db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        user_by_email = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()

        if user_by_username:
            flash('Username already exists.', 'error')
        elif user_by_email:
            flash('Email address already registered.', 'error')
        else:
            password_hash = generate_password_hash(password, method='pbkdf2:sha256')
            db.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                       (username, email, password_hash))
            db.commit()
            flash('Account created successfully! Please log in.', 'success')
            return redirect(url_for('login'))
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = True if request.form.get('remember') else False

        db = get_db()
        user_data = db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()

        if not user_data or not check_password_hash(user_data['password_hash'], password):
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))
        
        user_obj = User(user_data['id'], user_data['username'], user_data['email'], user_data['password_hash'])
        login_user(user_obj, remember=remember)
        flash('Logged in successfully!', 'success')
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
    return render_template('dashboard.html', username=current_user.username)

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        # Example: Update password
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')

        if not check_password_hash(current_user.password_hash, current_password):
            flash('Current password incorrect.', 'error')
        elif new_password != confirm_password:
            flash('New passwords do not match.', 'error')
        elif len(new_password) < 6: # Basic validation
             flash('New password must be at least 6 characters long.', 'error')
        else:
            new_password_hash = generate_password_hash(new_password, method='pbkdf2:sha256')
            db = get_db()
            db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_password_hash, current_user.id))
            db.commit()
            # Update current_user object in session (or re-login)
            current_user.password_hash = new_password_hash 
            flash('Password updated successfully.', 'success')
        return redirect(url_for('profile'))
        
    return render_template('profile.html', user=current_user)

# --- API Endpoints (User Specific) ---

@app.route('/api/daily-summary', methods=['GET'])
@login_required
def get_daily_summary():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    db = get_db()
    
    tasks_cursor = db.execute(
        """SELECT id, title, description, start_time, duration_minutes, status, time_spent 
           FROM user_tasks 
           WHERE user_id = ? AND entry_date = ? 
           ORDER BY start_time, created_at""", 
        (current_user.id, date_str)
    )
    tasks = [dict(row) for row in tasks_cursor]

    entry_cursor = db.execute('SELECT notes FROM daily_entries WHERE user_id = ? AND entry_date = ?', (current_user.id, date_str))
    daily_entry = entry_cursor.fetchone()
    notes = daily_entry['notes'] if daily_entry else ''

    log_cursor = db.execute(
        "SELECT message, timestamp as 'timestamp [timestamp]', task_db_id FROM activity_log WHERE user_id = ? AND date(timestamp) = ? ORDER BY timestamp DESC", 
        (current_user.id, date_str)
    )
    activity_log = [{'message': row['message'], 'timestamp': row['timestamp'].isoformat(), 'task_db_id': row['task_db_id']} for row in log_cursor]
    
    # Streak Calculation (simplified for now, based on any completed task for consecutive days)
    # A more robust streak would check if *all* essential daily tasks were completed.
    streak_dates_cursor = db.execute(
        """SELECT DISTINCT entry_date FROM user_tasks 
           WHERE user_id = ? AND status = 'completed' 
           ORDER BY entry_date DESC""", (current_user.id,)
    )
    completed_dates_str = [row['entry_date'] for row in streak_dates_cursor]
    
    current_streak = 0
    if completed_dates_str:
        today_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Check if today is in completed_dates_str (or if streak continues from yesterday)
        # This simple check is for days a task was completed.
        # A true "daily streak" might require tasks to be completed *on* that specific day.
        
        last_streak_date = None
        for completed_date_str in completed_dates_str:
            completed_date_obj = datetime.strptime(completed_date_str, '%Y-%m-%d').date()
            if last_streak_date is None: # First completed day in the list
                if completed_date_obj == today_obj or completed_date_obj == today_obj - timedelta(days=1): # Check today or yesterday
                    current_streak = 1
                    last_streak_date = completed_date_obj
                else: # Gap too large from today
                    break 
            elif last_streak_date - timedelta(days=1) == completed_date_obj:
                current_streak += 1
                last_streak_date = completed_date_obj
            elif last_streak_date == completed_date_obj : # multiple tasks on same day
                continue
            else: # Streak broken
                break
        # If today itself has a completed task, and no prior streak, it's 1
        if current_streak == 0 and date_str in completed_dates_str:
            current_streak = 1


    return jsonify({
        'tasks': tasks,
        'notes': notes,
        'activityLog': activity_log,
        'streak': current_streak
    })

@app.route('/api/user-tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    db = get_db()
    cursor = db.execute(
        """INSERT INTO user_tasks (user_id, entry_date, title, description, start_time, duration_minutes, status, time_spent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (current_user.id, data['entry_date'], data['title'], data.get('description', ''), 
         data.get('start_time'), data.get('duration_minutes'), 'pending', 0)
    )
    db.commit()
    new_task_id = cursor.lastrowid
    
    # Fetch the newly created task to return it
    new_task_data = db.execute("SELECT * FROM user_tasks WHERE id = ?", (new_task_id,)).fetchone()
    
    return jsonify(dict(new_task_data)), 201

@app.route('/api/user-tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    data = request.json
    db = get_db()
    # Ensure task belongs to current user
    task_check = db.execute("SELECT id FROM user_tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id)).fetchone()
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404

    db.execute(
        """UPDATE user_tasks SET 
           title = ?, description = ?, start_time = ?, duration_minutes = ?, status = ?, time_spent = ?
           WHERE id = ? AND user_id = ?""",
        (data['title'], data.get('description', ''), data.get('start_time'), data.get('duration_minutes'),
         data['status'], data['time_spent'], task_id, current_user.id)
    )
    db.commit()
    updated_task_data = db.execute("SELECT * FROM user_tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(dict(updated_task_data))

@app.route('/api/user-tasks/<int:task_id>/status', methods=['PUT'])
@login_required
def update_task_status_and_time(task_id):
    data = request.json # Expecting { status: "...", time_spent: NNN }
    db = get_db()
    task_check = db.execute("SELECT id FROM user_tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id)).fetchone()
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404
        
    db.execute(
        "UPDATE user_tasks SET status = ?, time_spent = ? WHERE id = ? AND user_id = ?",
        (data['status'], data['time_spent'], task_id, current_user.id)
    )
    db.commit()
    return jsonify({'status': 'success', 'message': 'Task status and time updated.'})


@app.route('/api/user-tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    db = get_db()
    task_check = db.execute("SELECT id FROM user_tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id)).fetchone()
    if not task_check:
        return jsonify({"error": "Task not found or unauthorized"}), 404

    db.execute("DELETE FROM user_tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
    db.commit()
    return jsonify({'status': 'success', 'message': 'Task deleted.'}), 200


@app.route('/api/notes/save', methods=['POST'])
@login_required
def save_notes_api(): # Renamed to avoid conflict if you had an old save_notes route
    data = request.json
    db = get_db()
    db.execute(
        """INSERT INTO daily_entries (user_id, entry_date, notes)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, entry_date) DO UPDATE SET notes = excluded.notes""",
        (current_user.id, data['date'], data['notes'])
    )
    db.commit()
    return jsonify({'status': 'success'})

@app.route('/api/activity/log', methods=['POST'])
@login_required
def log_activity_api(): # Renamed
    data = request.json
    db = get_db()
    db.execute(
        "INSERT INTO activity_log (user_id, message, timestamp, task_db_id) VALUES (?, ?, ?, ?)",
        (current_user.id, data['message'], datetime.now(), data.get('task_db_id'))
    )
    db.commit()
    return jsonify({'status': 'success'})


if __name__ == '__main__':
    import os
    # Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass # Already exists
    
    # Initialize DB if it doesn't exist
    if not os.path.exists(app.config['DATABASE']):
        with app.app_context(): # Need app context for init_db
            init_db()

    app.run(debug=True, port=5001)