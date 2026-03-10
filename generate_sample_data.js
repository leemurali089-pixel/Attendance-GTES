const fs = require('fs').promises;
const path = require('path');

const DATA_FOLDER = path.join(__dirname, 'Data');

async function generateSampleData() {
    try {
        await fs.mkdir(DATA_FOLDER, { recursive: true });

        // 1. Employees
        const employees = [];
        const designations = ['Developer', 'Designer', 'Manager', 'HR', 'Accountant'];
        const departments = ['IT', 'Design', 'Management', 'Human Resources', 'Finance'];

        for (let i = 1; i <= 20; i++) {
            employees.push({
                id: `EMP${String(i).padStart(3, '0')}`,
                name: `Employee ${i}`,
                designation: designations[Math.floor(Math.random() * designations.length)],
                department: departments[Math.floor(Math.random() * departments.length)],
                basicSalary: 30000 + Math.floor(Math.random() * 50000),
                joinDate: '2025-01-01',
                status: 'Active',
                phone: `98765432${String(i).padStart(2, '0')}`,
                email: `emp${i}@example.com`,
                address: `Address for Employee ${i}`
            });
        }

        await fs.writeFile(path.join(DATA_FOLDER, 'gtes_employees.json'), JSON.stringify(employees, null, 2));
        console.log('Generated 20 employees.');

        // 2. Attendance (for current month)
        const attendance = [];
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth(); // 0-indexed
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateObj = new Date(year, month, day);

            // Skip Sundays
            if (dateObj.getDay() === 0) continue;

            employees.forEach(emp => {
                // Randomize status
                const rand = Math.random();
                let status = 'Present';
                let checkIn = '09:00';
                let checkOut = '18:00';

                if (rand > 0.9) {
                    status = 'Absent';
                    checkIn = '-';
                    checkOut = '-';
                } else if (rand > 0.85) {
                    status = 'Paid Leave';
                    checkIn = '-';
                    checkOut = '-';
                } else if (rand > 0.8) {
                    status = 'H-Working';
                    checkIn = '09:00';
                    checkOut = '13:00';
                }

                // Randomize times slightly
                if (status === 'Present') {
                    const inMin = Math.floor(Math.random() * 30);
                    const outMin = Math.floor(Math.random() * 30);
                    checkIn = `09:${String(inMin).padStart(2, '0')}`;
                    checkOut = `18:${String(outMin).padStart(2, '0')}`;
                }

                attendance.push({
                    id: `${emp.id}_${dateStr}`,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    date: dateStr,
                    status: status,
                    checkIn: checkIn,
                    checkOut: checkOut,
                    overtime: status === 'Present' && Math.random() > 0.7 ? 'Yes' : 'No',
                    remarks: ''
                });
            });
        }

        await fs.writeFile(path.join(DATA_FOLDER, 'gtes_attendance.json'), JSON.stringify(attendance, null, 2));
        console.log(`Generated attendance records for ${year}-${month + 1}.`);

        console.log('Sample data generation complete.');

    } catch (error) {
        console.error('Error generating sample data:', error);
    }
}

generateSampleData();
