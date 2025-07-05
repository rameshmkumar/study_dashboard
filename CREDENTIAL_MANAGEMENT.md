# 🔐 FocusFlow Credential Management Guide

## 🚨 IMPORTANT: Never Commit Credentials to Git!

This guide shows you how to properly manage credentials for development and production.

## 📋 **Development Setup**

### Option 1: Using the Credential Script (Recommended)
```bash
# 1. Set credentials for current session
source ./set_credentials.sh

# 2. Run the application
python app.py
```

### Option 2: Manual Environment Variables
```bash
# 1. Set credentials manually
export SECRET_KEY="your-dev-secret-key"
export DATABASE_URL="your-supabase-url"

# 2. Run the application
python app.py
```

### Option 3: Create Personal .env.local (Advanced)
```bash
# 1. Create your personal credential file (ignored by git)
cp .env.example .env.local

# 2. Edit .env.local with your real credentials
nano .env.local

# 3. Load it before running
export $(cat .env.local | xargs)
python app.py
```

## 🚀 **Production Deployment (Koyeb)**

### Step 1: Generate New Production Secret Key
```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"
```

### Step 2: Set Environment Variables in Koyeb Dashboard

**Go to Koyeb → Your App → Settings → Environment Variables**

Add these variables:
```
DATABASE_URL=postgresql://username:password@host:port/database
SECRET_KEY=<PASTE_NEWLY_GENERATED_KEY_HERE>
FLASK_ENV=production
ENVIRONMENT=production
SESSION_COOKIE_SECURE=true
WTF_CSRF_ENABLED=true
```

### Step 3: Deploy
```bash
git add .
git commit -m "Deploy with secure credential management"
git push origin main
```

## 🛡️ **Security Best Practices**

### ✅ DO:
- Use environment variables for all secrets
- Generate new SECRET_KEY for production
- Use different credentials for dev/staging/prod
- Set SESSION_COOKIE_SECURE=true in production
- Use HTTPS in production

### ❌ DON'T:
- Commit `.env` files with real credentials
- Use the same SECRET_KEY everywhere
- Share credentials via chat/email
- Use weak passwords for database
- Use HTTP in production

## 🔍 **How to Check Your Setup**

### Verify Credentials Are Set:
```bash
echo "SECRET_KEY set: $([ -n "$SECRET_KEY" ] && echo "✅ YES" || echo "❌ NO")"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo "✅ YES" || echo "❌ NO")"
```

### Test Application:
```bash
python -c "from app import app; print('✅ App loads successfully')"
```

## 🆘 **Troubleshooting**

### App Won't Start:
```
Error: SECRET_KEY not set
```
**Solution**: Run `source ./set_credentials.sh` first

### Database Connection Failed:
```
Error: DATABASE_URL not set
```
**Solution**: Check your Supabase URL and credentials

### Session Errors:
```
Error: Invalid secret key
```
**Solution**: Generate a new SECRET_KEY

## 📱 **Quick Commands**

```bash
# Start development server
source ./set_credentials.sh && python app.py

# Check if credentials are set
env | grep -E "(SECRET_KEY|DATABASE_URL)"

# Generate new secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

**Remember**: The `set_credentials.sh` file contains your real credentials and should NEVER be committed to git!