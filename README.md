# Gas Tech Engineering Service - Attendance & Salary Management System

A comprehensive web-based attendance and salary management system built with HTML, CSS, and JavaScript.

## 🌐 Live Demo

**Coming Soon:** `https://leemurali089-pixel.github.io/Attendance-GTES/`

> **Note:** See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions on deploying your own instance.

## ✨ Features

### 1. Employee Management
- Add, edit, delete, and view employees
- Track Date of Joining and Date of Relieving
- Filter active employees automatically

### 2. Attendance Management
- Year-wise attendance database (April–March financial year)
- Track check-in/check-out times (30-minute intervals)
- Support for overnight shifts
- Status tracking: Present, Paid Leave, Unpaid Leave, Half Day, Holiday, H-Working
- Automatic OT hours calculation
- Holiday and Sunday auto-detection with color highlighting

### 3. Monthly Filter Attendance View
- Filter attendance by month-year
- Edit check-in, check-out, status, and over-time
- Real-time sync with main attendance database
- Auto-calculation of OT hours

### 4. Holiday Management
- Create, edit, and delete holidays
- Automatic Sunday detection
- Integration with attendance system

### 5. Advance/Loan Tracking
- Record employee advances
- Monthly aggregation for salary calculations
- Full CRUD operations

### 6. Salary/Payroll Module
- Monthly salary calculations per employee
- Automatic calculation of:
  - Base Pay (based on paid days)
  - OT Pay (based on OT hours and rate)
  - Final Salary (Base Pay + OT Pay - Advances)
- Month-year selector
- Base salary management per employee

### 7. Employee Views
- **Monthly View**: Detailed monthly attendance and salary breakdown
- **Annual View**: Financial year summary with totals

### 8. Admin Panel
- Central management section
- OT rate configuration
- Base salary management
- Admin password change
- System information
- Backup and restore functionality

### 9. PDF Report Generation
- Monthly PDF reports with company details
- Annual PDF reports (financial year)
- Professional formatting with company header/footer

### 10. Backup System
- Export all data to JSON format
- Import backup files
- Yearly backup file naming convention

## Technology Stack

- **HTML5**: Structure
- **CSS3**: Styling with custom styles
- **Bootstrap 5**: Responsive UI framework
- **Bootstrap Icons**: Icon library
- **Vanilla JavaScript**: Application logic
- **localStorage**: Data persistence
- **html2pdf.js**: Client-side PDF generation

## Installation

1. Download or clone all files to a web server directory
2. Ensure all files maintain the following structure:
   ```
   /
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

3. Open `index.html` in a modern web browser
4. The system will initialize with default settings

## Default Credentials

- **Admin Password**: `admin123`
- Change the password immediately after first login via Admin Panel

## Usage Guide

### Adding Employees
1. Navigate to **Employees** section
2. Click **Add New Employee**
3. Fill in Name, Date of Joining, and optionally Date of Relieving
4. Save

### Marking Attendance
1. Go to **Attendance** section
2. Select the date
3. Click **Add Record**
4. Select employee, enter check-in/check-out times, status, and over-time
5. OT hours are calculated automatically
6. Save

### Filtering Attendance by Month
1. Navigate to **Filter Attendance**
2. Select month-year from dropdown
3. Edit fields directly in the table
4. Changes sync automatically to main attendance

### Managing Holidays
1. Go to **Holidays** section
2. Add holidays with date and reason
3. Sundays are automatically detected

### Recording Advances
1. Navigate to **Advances** section
2. Click **Add Advance**
3. Select employee, date, and amount
4. Save

### Calculating Salary
1. Go to **Salary** section (requires admin password)
2. Select month-year
3. View calculated salary for all employees
4. Set base salary for employees if not set
5. Download PDF reports

### Viewing Employee Details
1. Click **View Details** from employee list or salary table
2. Switch between Monthly and Annual views
3. View detailed attendance and salary breakdown

### Admin Functions
1. Click **Admin Panel** (requires password)
2. Configure OT rate
3. Manage base salaries
4. Change admin password
5. Export/Import backups

## Company Information

The system includes the following company details in all reports:

- **Company Name**: Gas Tech Engineering Service
- **Registered Address**: No.232/233, Nageshwara Road, Athipet, Chennai – 600058
- **Work Address**: 236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai – 600058
- **Emails**: gastechengservice@gmail.com, rajmohan67raj@gmail.com
- **Phones**: +91 96000 19839, +91 95662 02896
- **GSTIN**: 33AFXPR3235A3ZF
- **PAN**: AFXPR3235A
- **IEC**: AFXPR3235A

## Data Storage

All data is stored in browser's localStorage. This means:
- Data persists between browser sessions
- Data is specific to the browser/device
- Clearing browser data will delete all records
- Regular backups are recommended

## Backup Recommendations

1. Export backup regularly (monthly recommended)
2. Store backups in secure location
3. Backup file naming: `Attendance_Backup_Apr-YYYY-Mar-YYYY.json`
4. Test restore functionality periodically

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Edge
- Safari
- Opera

## Security Notes

- Admin password is stored in localStorage (not encrypted)
- For production use, consider implementing server-side authentication
- Regular backups are essential
- Do not share admin password

## Support

For issues or questions, contact:
- Email: gastechengservice@gmail.com
- Phone: +91 96000 19839

## License

Proprietary - Gas Tech Engineering Service

