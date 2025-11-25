# 🎯 Quick Start: Enable GitHub Pages

## Step-by-Step Instructions

### 1. Open Your Repository Settings
- Go to: https://github.com/leemurali089-pixel/Attendance-GTES
- Click the **Settings** tab (top right, near the repository name)

### 2. Navigate to Pages
- In the left sidebar, scroll down and click **Pages**

### 3. Configure Source
- Under **Build and deployment** section:
  - **Source**: Select "Deploy from a branch"
  - **Branch**: Select `main`
  - **Folder**: Select `/ (root)`
- Click **Save**

### 4. Wait for Deployment
- GitHub will show a message: "Your site is ready to be published"
- Wait 1-2 minutes for the first deployment
- Refresh the page to see the live URL

### 5. Access Your Live Site
Your site will be available at:
```
https://leemurali089-pixel.github.io/Attendance-GTES/
```

## ✅ Verification

1. Click the live URL
2. You should see your Attendance & Salary Management System
3. Test the login with default password: `admin123`
4. **IMPORTANT**: Change the admin password immediately!

## 🔄 Updating Your Live Site

After making any changes locally:
```bash
git add .
git commit -m "Your change description"
git push
```

The live site updates automatically in 1-2 minutes!

## 📱 Mobile Access

- Open the URL on your phone
- Add to home screen for app-like experience
- All data is stored locally on each device

## 🔒 Security Reminder

- Change default password (`admin123`) immediately
- All data is stored in browser localStorage
- No data is sent to any server
- Each user/device has separate data

## 🆘 Troubleshooting

**Site not loading?**
- Wait 2-3 minutes after enabling Pages
- Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
- Check deployment status in Settings → Pages

**404 Error?**
- Ensure branch is set to `main`
- Ensure folder is set to `/ (root)`
- Wait a few minutes and try again

## 📞 Need Help?

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment options and troubleshooting.
