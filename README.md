# FocusFlow - Personal Productivity Dashboard

A comprehensive task management and productivity tracking application built with Flask, PostgreSQL, and vanilla JavaScript.

## Features

### 📋 Task Management
- Create, edit, and organize daily tasks
- Set task priorities, start times, and estimated durations
- Track task completion status (pending, in-progress, completed)
- Visual task scheduling with time-based organization

### ⏱️ Time Tracking
- Built-in timer with start/pause/stop functionality
- Automatic time tracking for tasks in progress
- Session-based timing with browser sync
- Time spent analytics and reporting

### 📊 Analytics & Insights
- Daily productivity summaries
- Time allocation across different task categories
- Progress visualization with charts
- Activity logging and history tracking

### 📝 Notes & Documentation
- Integrated note-taking system
- Link notes to specific dates and tasks
- Rich text editing capabilities
- Searchable note archive

### 🔒 Security Features
- User authentication and authorization
- CSRF protection for all forms
- Rate limiting to prevent abuse
- Session management with timeout
- Input validation and sanitization

## Tech Stack

**Backend:**
- Flask (Python web framework)
- PostgreSQL (Primary database)
- SQLite (Development/fallback database)
- Flask-Login (Authentication)
- Flask-WTF (CSRF protection)
- Flask-Limiter (Rate limiting)

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5 & CSS3
- Responsive design
- Chart.js for data visualization

**Infrastructure:**
- Docker containerization
- Environment-based configuration
- Production-ready deployment setup

## Installation

### Prerequisites
- Python 3.9+
- PostgreSQL 13+ (for production)
- Node.js (for frontend dependencies, optional)

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/focusflow.git
   cd focusflow
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database:**
   ```bash
   python app.py  # Auto-initializes database on first run
   ```

6. **Run the application:**
   ```bash
   python app.py
   ```

   Visit `http://localhost:5000` in your browser.

### Production Deployment

#### Using Docker

1. **Build and run with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

#### Manual Deployment

1. **Set production environment variables:**
   ```bash
   export FLASK_ENV=production
   export SECRET_KEY=your-secret-key
   export DATABASE_URL=postgresql://user:pass@host:port/dbname
   ```

2. **Run with Gunicorn:**
   ```bash
   gunicorn --bind 0.0.0.0:5000 app:app
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask secret key | Random generated |
| `DATABASE_URL` | PostgreSQL connection string | SQLite fallback |
| `FLASK_ENV` | Environment mode | `development` |
| `SESSION_COOKIE_SECURE` | HTTPS-only cookies | `False` |
| `SESSION_COOKIE_HTTPONLY` | HTTP-only cookies | `True` |
| `WTF_CSRF_TIME_LIMIT` | CSRF token timeout | `3600` |

### Database Configuration

The application supports both PostgreSQL and SQLite:
- **PostgreSQL**: Recommended for production
- **SQLite**: Used for development and testing

Database schema is automatically created on first run.

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /logout` - User logout
- `POST /register` - User registration

### Task Management
- `GET /api/user-tasks` - Get user's tasks
- `POST /api/user-tasks` - Create new task
- `PUT /api/user-tasks/<id>` - Update task
- `DELETE /api/user-tasks/<id>` - Delete task

### Timer Operations
- `POST /api/timer/start` - Start timer for task
- `POST /api/timer/pause` - Pause running timer
- `POST /api/timer/stop` - Stop timer and save time
- `POST /api/timer/sync` - Sync timer with server

### Analytics
- `GET /api/daily-summary` - Get daily productivity summary
- `GET /api/weekly-summary` - Get weekly analytics
- `GET /api/activity-log` - Get activity history

## Development

### Project Structure
```
focusflow/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── docker-compose.yml     # Docker configuration
├── static/
│   ├── css/              # Stylesheets
│   ├── js/               # JavaScript files
│   └── images/           # Static images
├── templates/            # HTML templates
├── schema.sql           # SQLite database schema
├── schema_postgresql.sql # PostgreSQL database schema
└── README.md            # This file
```

### Key Components

**Backend (app.py):**
- Flask application setup and configuration
- Database connection management
- API route handlers
- Authentication and security middleware
- Timer and task management logic

**Frontend (static/js/dashboard.js):**
- Task creation and management UI
- Timer functionality and synchronization
- Data visualization and charts
- Real-time updates and notifications

### Database Schema

**Core Tables:**
- `users` - User accounts and authentication
- `user_tasks` - Task management and tracking
- `notes` - User notes and documentation
- `activity_log` - User activity tracking

**Timer Fields:**
- `timer_start_time` - Current session start time
- `timer_session_id` - Unique session identifier
- `time_spent` - Total accumulated time
- `last_sync_time` - Last synchronization timestamp

## Features in Detail

### Task Management System
- **Smart Scheduling**: Tasks can be scheduled with start times and durations
- **Priority Management**: Three-level priority system (high, medium, low)
- **Status Tracking**: Real-time status updates (pending → in-progress → completed)
- **Category Organization**: Automatic categorization and grouping

### Timer System
- **Session Management**: Unique session IDs prevent timer conflicts
- **Browser Sync**: Timer state persists across browser tabs and sessions
- **Automatic Backup**: Regular server synchronization prevents data loss
- **Conflict Resolution**: Handles multiple timer sessions gracefully

### Analytics Dashboard
- **Daily Summaries**: Comprehensive productivity metrics
- **Time Allocation**: Visual breakdown of time spent by category
- **Progress Tracking**: Historical data and trends
- **Activity Logging**: Detailed audit trail of user actions

### Security Implementation
- **Input Validation**: Comprehensive sanitization of user inputs
- **SQL Injection Prevention**: Parameterized queries throughout
- **CSRF Protection**: Token-based request validation
- **Rate Limiting**: API endpoint protection against abuse
- **Session Security**: Secure cookie configuration and timeout

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions, issues, or contributions, please open an issue on GitHub or contact the maintainer.

---

Built with ❤️ for better productivity and focus management.