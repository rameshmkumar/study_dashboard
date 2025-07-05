# 🚀 Deploy FocusFlow to Koyeb - Step by Step Guide

## Why Koyeb?
- ✅ **Completely FREE** (no credit card required)
- ✅ **Always online** (no cold starts or sleeping)
- ✅ **2 services free** (perfect for our single app)
- ✅ **512MB RAM** (more than enough for Flask)
- ✅ **2GB traffic/month** (plenty for personal use)
- ✅ **Global CDN** (fast worldwide)
- ✅ **Custom domains** included

---

## 📋 Pre-Deployment Checklist

Your FocusFlow app is already prepared with:
- ✅ `requirements.txt` - Python dependencies
- ✅ `Procfile` - Server startup command
- ✅ Environment variable support
- ✅ Production-ready Flask configuration
- ✅ Latest code pushed to GitHub

---

## 🔑 Environment Variables You'll Need

```
SECRET_KEY = LjUiTHrxUqRA7rzd6bM07hxGov0te09dM428pEONGvs
ENVIRONMENT = production
FLASK_ENV = production
WTF_CSRF_ENABLED = True
WTF_CSRF_TIME_LIMIT = 3600
```

---

## 🚀 Step-by-Step Deployment

### Step 1: Create Koyeb Account
1. Go to [koyeb.com](https://koyeb.com)
2. Click **"Sign up"**
3. Use GitHub to sign up (recommended for easy repo access)
4. **No credit card required!**

### Step 2: Connect GitHub Repository
1. In Koyeb dashboard, click **"Create App"**
2. Choose **"GitHub"** as source
3. Connect your GitHub account if not already connected
4. Select repository: **`rameshmkumar/study_dashboard`**
5. Choose branch: **`main`**

### Step 3: Configure Build Settings
Koyeb should auto-detect your Flask app, but verify these settings:

**Build Settings:**
- **Build command**: `pip install -r requirements.txt`
- **Run command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
- **Port**: `8000` (Koyeb will set the PORT environment variable)

### Step 4: Set Environment Variables
In the Koyeb app configuration, add these environment variables:

1. Click **"Environment variables"** section
2. Add each variable:

```
SECRET_KEY = LjUiTHrxUqRA7rzd6bM07hxGov0te09dM428pEONGvs
ENVIRONMENT = production
FLASK_ENV = production
WTF_CSRF_ENABLED = True
WTF_CSRF_TIME_LIMIT = 3600
```

### Step 5: Configure App Settings
- **App name**: `focusflow-app` (or your preferred name)
- **Region**: Choose closest to your location
- **Instance type**: **Nano** (free tier)
- **Scaling**: **1 instance** (free tier includes 1)

### Step 6: Deploy!
1. Review all settings
2. Click **"Deploy"**
3. Wait for deployment (usually 2-3 minutes)
4. Koyeb will provide you with a URL like: `https://focusflow-app-yourname.koyeb.app`

---

## 🔍 Post-Deployment Verification

After deployment, test these features:

### ✅ Essential Tests:
1. **Homepage loads**: Visit your Koyeb URL
2. **User registration**: Create a test account
3. **Login/logout**: Verify authentication works
4. **Create task**: Add a new task
5. **Start timer**: Test the server-side timer
6. **Add note**: Test the notes functionality
7. **Mobile view**: Check responsive design

### 🔧 If Something Doesn't Work:
1. **Check logs**: Koyeb dashboard → Your app → "Logs"
2. **Verify environment variables**: Make sure all are set correctly
3. **Database issues**: The app will create SQLite database automatically

---

## 📱 Database Information

Your FocusFlow app uses **SQLite** which will be created automatically:
- ✅ **Persistent storage** on Koyeb
- ✅ **Automatic database creation** on first run
- ✅ **All your tables** will be initialized automatically
- ✅ **No additional setup** required

---

## 🌐 Custom Domain (Optional)

To add your own domain:
1. Go to Koyeb dashboard → Your app → "Domains"
2. Click "Add domain"
3. Enter your domain name
4. Update your domain's DNS to point to Koyeb

---

## 📊 Monitoring Your App

Koyeb provides:
- **Real-time logs**
- **Performance metrics**
- **Traffic analytics**
- **Uptime monitoring**

Access these from your app dashboard.

---

## 🔧 Troubleshooting

### Common Issues:

**1. App won't start:**
- Check environment variables are set
- Verify SECRET_KEY is configured
- Check logs for Python errors

**2. Database errors:**
- The app automatically creates the database
- Check if sqlite3 is available (it should be)

**3. 502 Bad Gateway:**
- Usually means the app isn't binding to the correct port
- Verify the Procfile command is correct

**4. Environment variable issues:**
- Double-check all variables are set in Koyeb dashboard
- Restart the app after adding variables

---

## 🎉 You're Live!

Once deployed successfully, your FocusFlow app will be available 24/7 at your Koyeb URL!

### Features Working:
- ⏱️ **Server-side timer** - Continues even if you close browser
- 📝 **Task management** - Create, edit, track tasks
- 📊 **Analytics** - Focus efficiency metrics
- 📓 **Notes system** - Categorized notes
- 🎯 **Achievements** - Productivity tracking
- 📱 **Mobile responsive** - Perfect on phones
- 🔐 **User accounts** - Secure registration/login
- 🌙 **Themes** - Dark/light mode

**Enjoy your production-ready FocusFlow app!**

---

## 💡 Pro Tips

1. **Bookmark your app URL** for easy access
2. **Add to home screen** on mobile for app-like experience
3. **Monitor your traffic** to stay within the 2GB free limit
4. **Regular backups**: Export your data periodically
5. **Updates**: Push to GitHub to auto-deploy updates

Your app is now live and ready to help you stay focused and productive! 🎯