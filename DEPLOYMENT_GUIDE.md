# FocusFlow Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Railway (Recommended)
Railway offers the best free tier for Flask applications with persistent storage.

#### Steps:
1. **Create Railway Account**: Go to [railway.app](https://railway.app) and sign up
2. **Connect GitHub**: Link your GitHub account
3. **Push to GitHub**: 
   ```bash
   git add .
   git commit -m "🛡️ Ready for Railway deployment"
   git push origin main
   ```
4. **Deploy on Railway**:
   - Click "Deploy from GitHub repo"
   - Select your FocusFlow repository
   - Railway will auto-detect the Flask app
5. **Set Environment Variables**:
   - Go to your project settings
   - Add: `SECRET_KEY` = `your_strong_secret_key_here`
   - Add: `ENVIRONMENT` = `production`
   - Add: `FLASK_ENV` = `production`

#### Railway Configuration:
- ✅ Automatically uses `railway.json` and `Procfile`
- ✅ 500 hours/month free tier
- ✅ 1GB persistent storage
- ✅ Custom domain support

---

### Option 2: Render
Great alternative with 750 hours/month but spins down after inactivity.

#### Steps:
1. **Create Render Account**: Go to [render.com](https://render.com)
2. **Connect GitHub Repository**
3. **Create Web Service**:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
4. **Set Environment Variables**:
   - `SECRET_KEY` = `your_strong_secret_key_here`
   - `DATABASE_URL` = `sqlite:///var/data/focus_flow.db`
   - `ENVIRONMENT` = `production`
   - `FLASK_ENV` = `production`
5. **Add Persistent Disk** (for database):
   - Mount path: `/var/data`
   - Size: 1GB (free)

---

### Option 3: Fly.io
Good performance with 3 free apps.

#### Steps:
1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `fly auth login`
3. **Launch App**: `fly launch` (in project directory)
4. **Set Secrets**:
   ```bash
   fly secrets set SECRET_KEY=your_strong_secret_key_here
   fly secrets set ENVIRONMENT=production
   fly secrets set FLASK_ENV=production
   ```
5. **Deploy**: `fly deploy`

---

## 🔐 Security Setup

### Generate Strong Secret Key:
```python
import secrets
print(secrets.token_urlsafe(32))
```

### Required Environment Variables:
- `SECRET_KEY`: Strong random string (REQUIRED)
- `ENVIRONMENT`: Set to `production`
- `FLASK_ENV`: Set to `production`
- `DATABASE_URL`: Platform-specific database path

---

## 📁 Project Structure
```
FocusFlow/
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── Procfile           # For Railway/Heroku
├── railway.json       # Railway configuration
├── static/            # CSS, JS files
├── templates/         # HTML templates
└── instance/          # Local database (not deployed)
```

---

## ✅ Pre-Deployment Checklist

- [x] Dependencies listed in `requirements.txt`
- [x] `Procfile` configured for gunicorn
- [x] Environment variables documented
- [x] Database initialization handled
- [x] Security configurations set
- [x] CSRF protection enabled
- [x] Rate limiting configured

---

## 🧪 Testing Your Deployment

After deployment, test these features:
1. **User Registration/Login**
2. **Task Creation and Timer**
3. **Notes System**
4. **Analytics Dashboard**
5. **Mobile Responsiveness**

---

## 🔧 Troubleshooting

### Common Issues:
1. **Database not persisting**: Ensure persistent storage is configured
2. **SECRET_KEY error**: Set a strong SECRET_KEY environment variable
3. **CSRF errors**: Verify WTF_CSRF_ENABLED is set correctly
4. **App won't start**: Check logs for dependency issues

### Getting Logs:
- **Railway**: View in dashboard
- **Render**: Real-time logs in dashboard
- **Fly.io**: `fly logs`

---

## 🎉 Post-Deployment

1. **Custom Domain**: Most platforms offer free subdomains
2. **HTTPS**: Automatically enabled on all platforms
3. **Monitoring**: Set up uptime monitoring
4. **Backup**: Export your database periodically

---

## 💡 Pro Tips

- Railway has the most generous free tier for storage
- Render spins down after 15 minutes of inactivity
- Fly.io offers the best performance but limited to 3 apps
- All platforms provide automatic HTTPS and custom domains

Choose Railway for the best overall free experience!