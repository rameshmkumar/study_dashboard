# FocusFlow - Production Deployment Guide

This guide explains how to deploy FocusFlow to production platforms.

## Prerequisites

- Python 3.8+
- Git repository
- Production platform account (Render, Heroku, Railway, etc.)

## Environment Variables

Set the following environment variables in your production platform:

### Required
```bash
SECRET_KEY=your_super_secret_key_here_min_32_chars
FLASK_ENV=production
DATABASE_URL=sqlite:///./instance/focus_flow.db
```

### Optional (with defaults)
```bash
WTF_CSRF_ENABLED=True
WTF_CSRF_TIME_LIMIT=3600
RATELIMIT_STORAGE_URL=memory://
LOG_LEVEL=INFO
PORT=5000
```

## Platform-Specific Deployment

### Render

1. Connect your Git repository to Render
2. Create a new Web Service
3. Use the following settings:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Environment**: Python 3
4. Add environment variables in the Render dashboard
5. Deploy!

### Heroku

1. Install Heroku CLI and login
2. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```
3. Set environment variables:
   ```bash
   heroku config:set SECRET_KEY=your_secret_key
   heroku config:set FLASK_ENV=production
   ```
4. Deploy:
   ```bash
   git push heroku main
   ```

### Railway

1. Connect your Git repository to Railway
2. Add environment variables in Railway dashboard
3. Railway will automatically detect the Python app and deploy

## Database Setup

The app will automatically initialize the SQLite database on first run. No manual setup required.

## Security Features

✅ CSRF Protection  
✅ Rate Limiting  
✅ Security Headers  
✅ Input Validation  
✅ SQL Injection Protection  
✅ XSS Protection  
✅ Secure Session Management  

## Monitoring

- Health check endpoint: `/health`
- Logs are written to `logs/focusflow.log` and stdout
- Error tracking with proper HTTP status codes

## Performance

- Gunicorn WSGI server for production
- Database connection pooling via Flask-SQLAlchemy
- Static file caching headers
- Gzip compression (configured at platform level)

## Backup

For SQLite database backup, periodically copy the `instance/focus_flow.db` file to a secure location.

## Support

If you encounter issues during deployment, check:
1. Environment variables are set correctly
2. All dependencies are installed
3. Database permissions are correct
4. Health check endpoint returns 200 status