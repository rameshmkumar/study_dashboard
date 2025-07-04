# 🎯 FocusFlow - Productivity Dashboard

A secure, feature-rich productivity application built with Flask that helps you track tasks, manage time, and maintain focus streaks.

## ✨ Features

- **Task Management**: Create, edit, and track daily tasks with time estimates
- **Pomodoro Timer**: Built-in timer with pause/resume functionality  
- **Progress Tracking**: Visual progress bars and completion statistics
- **Streak Tracking**: Daily completion streaks to maintain momentum
- **Notes System**: Create and organize daily notes by type
- **Analytics**: Detailed productivity analytics and achievements
- **User Profiles**: Secure user accounts with strong password policies
- **Dark/Light Theme**: Responsive design with theme switching

## 🛡️ Security Features

- **CSRF Protection**: All forms and API endpoints protected against CSRF attacks
- **Strong Password Policy**: Enforced complexity requirements (8+ chars, mixed case, numbers, special chars)
- **Rate Limiting**: API abuse prevention with intelligent rate limiting
- **Secure Headers**: Content Security Policy, XSS protection, and more
- **Session Security**: Secure session management with forced re-auth on password changes
- **Error Sanitization**: Safe error handling that doesn't expose sensitive information

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd focusflow
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env and set a strong SECRET_KEY
   ```

5. **Initialize database**
   ```bash
   python app.py
   # Database will be automatically created on first run
   ```

6. **Run the application**
   ```bash
   python app.py
   ```

Visit `http://localhost:5001` to access the application.

## 🌐 Free Deployment Options

### Railway (Recommended)

1. **Push to GitHub** (follow Git setup below)
2. **Connect Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Set Environment Variables**:
   ```
   SECRET_KEY=your_very_strong_random_secret_key_here
   FLASK_ENV=production
   ENVIRONMENT=production
   ```

4. **Deploy automatically** - Railway handles the rest!

### Alternative: Render

1. Go to [render.com](https://render.com) and connect GitHub
2. Create "New Web Service" from your repo
3. Configure:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
4. Add the same environment variables
5. Deploy

## 📝 Git Setup Guide

If you haven't set up Git yet:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Make initial commit
git commit -m "Initial commit: FocusFlow productivity app with security fixes"

# Add remote repository (replace with your GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/focusflow.git

# Push to GitHub
git push -u origin main
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SECRET_KEY` | Flask secret key for sessions | ⚠️ **Must set in production** | Yes |
| `FLASK_ENV` | Environment (development/production) | development | No |
| `DATABASE_URL` | Database connection string | SQLite local file | No |
| `WTF_CSRF_ENABLED` | Enable CSRF protection | True | No |
| `LOG_LEVEL` | Logging level | INFO | No |

⚠️ **CRITICAL**: Set a strong `SECRET_KEY` in production or the app will refuse to start!

## 📁 Project Structure

```
focusflow/
├── app.py                 # Main Flask application
├── schema.sql            # Database schema
├── requirements.txt      # Python dependencies
├── Procfile             # Deployment configuration
├── railway.json         # Railway-specific config
├── .env.example         # Environment variables template
├── static/
│   ├── css/
│   │   └── style.css    # Application styles
│   └── js/
│       └── dashboard.js # Frontend JavaScript
├── templates/           # Jinja2 templates
│   ├── layout.html     # Base template
│   ├── home.html       # Landing page
│   ├── login.html      # Login form
│   ├── signup.html     # Registration form
│   ├── dashboard.html  # Main app interface
│   ├── profile.html    # User profile
│   └── achievements.html
└── instance/           # Local database storage (git ignored)
```

## 🔐 Security Notes

- All user inputs are validated and sanitized
- Database queries use parameterized statements to prevent SQL injection
- CSRF tokens are required for all state-changing operations
- Rate limiting prevents API abuse
- Secure headers protect against common web vulnerabilities
- Strong password policies are enforced
- Session management follows security best practices

## 🐛 Troubleshooting

### Common Issues

1. **App won't start in production**
   - Check that `SECRET_KEY` is set to a strong, unique value
   - Verify all required environment variables are set

2. **Database errors**
   - Ensure the application has write permissions to the database location
   - Check that `schema.sql` exists and is valid

3. **CSRF errors on forms**
   - Ensure JavaScript is enabled for CSRF token handling
   - Check that `WTF_CSRF_ENABLED=True` in environment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Commit with descriptive messages
5. Push and create a Pull Request

## 📄 License

This project is open source. See LICENSE file for details.

## 🆘 Support

- **Issues**: Report bugs via GitHub Issues
- **Documentation**: Check this README and code comments
- **Security**: Report security issues privately to maintainers

---

**⚡ Ready to boost your productivity? Deploy FocusFlow today!**