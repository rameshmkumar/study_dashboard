# FocusFlow Deployment Guide

## 🆓 **TRULY FREE** Hosting Options (Updated 2024)

### Option 1: Render (Recommended - Best Free Option)
**Completely free with persistent storage - no credit card required!**

#### Steps:
1. **Create Render Account**: Go to [render.com](https://render.com) - sign up free
2. **Connect GitHub Repository**
3. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub: `rameshmkumar/study_dashboard`
   - Name: `focusflow-app`
   - Branch: `main`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
4. **Set Environment Variables**:
   - `SECRET_KEY` = `LjUiTHrxUqRA7rzd6bM07hxGov0te09dM428pEONGvs`
   - `DATABASE_URL` = `sqlite:///var/data/focus_flow.db`
   - `ENVIRONMENT` = `production`
   - `FLASK_ENV` = `production`
5. **Add Persistent Disk** (for database):
   - Go to your service → "Disks"
   - Add disk: Mount path `/var/data`, Size 1GB (free)

#### Render Benefits:
- ✅ **750 hours/month** (31+ days) - completely free
- ✅ **1GB persistent storage** for your database
- ✅ **Custom domain** support
- ✅ **Automatic HTTPS**
- ⚠️ Spins down after 15 min (wakes up in ~30 seconds)

### Option 2: PythonAnywhere (Best for Always-On)
**Never sleeps - perfect for a production app that's always available!**

#### Steps:
1. **Create Account**: Go to [pythonanywhere.com](https://pythonanywhere.com)
2. **Upload Code**: Use Git or file upload
3. **Create Web App**:
   - Dashboard → "Web" → "Add new web app"
   - Choose Flask
   - Point to your `app.py`
4. **Set Environment Variables** in WSGI file
5. **Database**: SQLite works perfectly

#### PythonAnywhere Benefits:
- ✅ **Always online** - never sleeps
- ✅ **100MB storage** (enough for your app)
- ✅ **Custom domain** on paid plans
- ✅ **Easy SSH access**

### Option 3: Glitch (Great for Quick Testing)
**Simple deployment with live code editing!**

#### Steps:
1. **Go to Glitch**: Visit [glitch.com](https://glitch.com)
2. **Import from GitHub**: 
   - Click "New Project" → "Import from GitHub"
   - Enter: `https://github.com/rameshmkumar/study_dashboard`
3. **Set Environment Variables**: 
   - Create `.env` file in Glitch editor
   - Add your SECRET_KEY and other variables
4. **Auto-deploys**: Your app will be live immediately

#### Glitch Benefits:
- ✅ **1000 hours/month** free
- ✅ **Live code editing** in browser
- ✅ **Instant deployment**
- ⚠️ Sleeps after 5 minutes of inactivity

---

## 📊 **Comparison Table**

| Platform | Free Tier | Always On? | Storage | Best For |
|----------|-----------|------------|---------|----------|
| **Render** | 750h/month | No (sleeps 15min) | 1GB | Production apps |
| **PythonAnywhere** | Unlimited | Yes ✅ | 100MB | Always-on apps |
| **Glitch** | 1000h/month | No (sleeps 5min) | 200MB | Quick prototypes |

---

### Option 4: Render (Alternative Documentation)
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