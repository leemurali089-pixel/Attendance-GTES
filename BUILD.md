# Building Desktop EXE - Complete Guide

## Prerequisites

1. **Node.js** (Download from https://nodejs.org/)
   - Version 18 or higher recommended
   - Includes npm (package manager)

2. **Windows** (for building .exe files)

## Step-by-Step Build Instructions

### 1. Install Dependencies

Open Command Prompt or PowerShell in the project folder:

```bash
cd "c:\Users\Dell\Dropbox\Attendance GTES"
npm install
```

This will install:
- Electron (desktop app framework)
- Electron Builder (packaging tool)

**Wait time:** 2-5 minutes depending on internet speed

---

### 2. Test the Application

Before building, test if it works:

```bash
npm start
```

This opens the app in development mode. Test all features:
- ✅ Add employees
- ✅ Mark attendance
- ✅ Calculate salary
- ✅ Check if data saves to `Data/` folder

**Press Ctrl+C** to stop the app.

---

### 3. Build the EXE

#### Option A: Installer (Recommended)

```bash
npm run build:win
```

Creates an installer in `dist/` folder:
- `GTES Attendance System Setup 1.0.0.exe` (installer)

**Build time:** 3-5 minutes

#### Option B: Portable EXE

```bash
npm run build:portable
```

Creates a portable .exe in `dist/` folder:
- `GTES Attendance System 1.0.0.exe` (no installation needed)

**Build time:** 2-3 minutes

---

## Installation & Usage

### Using the Installer

1. Double-click `GTES Attendance System Setup 1.0.0.exe`
2. Follow installation wizard
3. Creates desktop shortcut
4. Installs to `C:\Program Files\GTES Attendance System\`

### Using Portable Version

1. Copy `GTES Attendance System 1.0.0.exe` anywhere
2. Double-click to run
3. No installation needed
4. Perfect for USB drives

---

## Data Storage

### Where Data is Saved

When running as EXE, data is saved to:
```
c:\Users\Dell\Dropbox\Attendance GTES\Data\
├── gtes_employees.json
├── gtes_attendance.json
├── gtes_holidays.json
├── gtes_advances.json
├── gtes_settings.json
└── gtes_admin_password.json
```

### Cross-Device Sync

Since data is in Dropbox:
1. **Device A**: Make changes → Data saves to Dropbox folder
2. **Dropbox**: Syncs files to cloud
3. **Device B**: Open app → Loads latest data from Dropbox

**Sync is automatic via Dropbox!**

---

## Distribution

### Share with Others

#### Method 1: Installer
1. Share `GTES Attendance System Setup 1.0.0.exe`
2. They install on their computer
3. Each user has their own data (not synced)

#### Method 2: Portable + Dropbox
1. Share portable .exe
2. Tell them to place it in their Dropbox folder
3. Data syncs across their devices

---

## Troubleshooting

### Build Errors

**Error: "npm not found"**
- Install Node.js from https://nodejs.org/
- Restart Command Prompt

**Error: "Cannot find module"**
```bash
npm install
```

**Error: "Permission denied"**
- Run Command Prompt as Administrator

### Runtime Errors

**App won't start**
- Check if `Data/` folder exists
- Check Windows Defender/Antivirus

**Data not syncing**
- Ensure Dropbox is running
- Check Dropbox sync status
- Wait a few seconds for sync

**Can't save data**
- Check folder permissions
- Ensure Dropbox folder is writable

---

## Advanced Options

### Custom Icon

1. Replace `icon.ico` with your icon
2. Rebuild the app

### Change App Name

Edit `package.json`:
```json
"productName": "Your App Name"
```

### Auto-Update

Add to `package.json`:
```json
"publish": {
  "provider": "github",
  "owner": "leemurali089-pixel",
  "repo": "Attendance-GTES"
}
```

---

## File Structure

```
Attendance GTES/
├── dist/                    # Built .exe files (after build)
├── Data/                    # JSON data files
├── js/                      # Application code
├── css/                     # Styles
├── index.html               # Main HTML
├── main.js                  # Electron main process
├── preload.js               # Electron preload script
├── package.json             # Project configuration
├── icon.ico                 # App icon
└── node_modules/            # Dependencies (after npm install)
```

---

## Quick Reference

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build installer
npm run build:win

# Build portable
npm run build:portable
```

---

## Support

For build issues:
- Check Node.js version: `node --version`
- Check npm version: `npm --version`
- Clear cache: `npm cache clean --force`
- Reinstall: Delete `node_modules/` and run `npm install`

For application issues:
- Email: gastechengservice@gmail.com
- Phone: +91 96000 19839
