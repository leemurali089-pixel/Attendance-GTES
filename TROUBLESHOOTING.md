# Troubleshooting Guide

## How to Open the Application

### Method 1: Direct File Opening (Easiest)
1. Navigate to the folder: `C:\Users\Dell\Dropbox\Attendance GTES`
2. Double-click on `index.html`
3. It should open in your default web browser

### Method 2: Right-Click and Open With
1. Right-click on `index.html`
2. Select "Open with" → Choose your browser (Chrome, Firefox, Edge, etc.)

### Method 3: Drag and Drop
1. Open your web browser
2. Drag the `index.html` file into the browser window

### Method 4: Using Browser Address Bar
1. Open your web browser
2. Press `Ctrl + L` (or click the address bar)
3. Type: `file:///C:/Users/Dell/Dropbox/Attendance GTES/index.html`
4. Press Enter

## Common Issues and Solutions

### Issue 1: Blank Page or Nothing Happens
**Solution:**
- Check browser console for errors (Press F12, go to Console tab)
- Make sure all files are in correct folders:
  - `index.html` in root folder
  - `css/style.css` in css folder
  - All `.js` files in `js` folder
- Try a different browser (Chrome recommended)

### Issue 2: "Script Error" or JavaScript Not Loading
**Solution:**
- Check internet connection (Bootstrap and icons load from CDN)
- Verify all JavaScript files exist in the `js` folder
- Check browser console (F12) for specific error messages

### Issue 3: Styles Not Loading
**Solution:**
- Verify `css/style.css` exists
- Check browser console for 404 errors
- Try refreshing the page (Ctrl + F5)

### Issue 4: "CORS Error" or "Blocked by Browser"
**Solution:**
- This shouldn't happen with localStorage, but if it does:
- Try using a local web server (see Method 5 below)

### Issue 5: Features Not Working
**Solution:**
- Open browser console (F12)
- Look for red error messages
- Check if localStorage is enabled in your browser
- Try clearing browser cache and reloading

## Method 5: Using a Local Web Server (Advanced)

If direct file opening doesn't work, use a local server:

### Option A: Using Python (if installed)
1. Open Command Prompt or PowerShell in the project folder
2. Run: `python -m http.server 8000`
3. Open browser and go to: `http://localhost:8000`

### Option B: Using Node.js (if installed)
1. Install http-server: `npm install -g http-server`
2. Open Command Prompt in project folder
3. Run: `http-server`
4. Open browser and go to the URL shown

### Option C: Using VS Code Live Server
1. Install "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

## Quick Test

To verify everything is working:
1. Open `index.html` in browser
2. Press F12 to open Developer Tools
3. Go to Console tab
4. You should see no red errors
5. The page should show the navigation bar with "Gas Tech Engineering Service"
6. Click on "Dashboard" - it should show statistics

## Still Having Issues?

1. **Check File Structure:**
   ```
   Attendance GTES/
   ├── index.html
   ├── css/
   │   └── style.css
   ├── js/
   │   ├── data.js
   │   ├── auth.js
   │   ├── app.js
   │   ├── employees.js
   │   ├── holidays.js
   │   ├── attendance.js
   │   ├── filterAttendance.js
   │   ├── advances.js
   │   ├── salary.js
   │   ├── employeeView.js
   │   ├── admin.js
   │   └── reports.js
   └── README.md
   ```

2. **Browser Requirements:**
   - Chrome 90+ (Recommended)
   - Firefox 88+
   - Edge 90+
   - Safari 14+

3. **Check Browser Console:**
   - Press F12
   - Look for any red error messages
   - Share the error message if you need help

## Contact

If you continue to have issues, please provide:
- Browser name and version
- Error messages from browser console (F12)
- Screenshot of what you see




