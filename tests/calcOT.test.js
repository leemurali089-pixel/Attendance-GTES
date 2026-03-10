// OT Calculation Tests
// Run these tests to verify calcOT() function

const DataManager = require('./data.js');

// Test Suite
const tests = [
    {
        name: "Standard OT - 1.5 hours",
        checkin: "09:00",
        checkout: "19:30",
        isOnDuty: true,
        shiftHours: 9,
        expected: 1.5
    },
    {
        name: "Overnight shift - 8 hours total",
        checkin: "22:00",
        checkout: "06:00",
        isOnDuty: true,
        shiftHours: 9,
        expected: 0 // 8 hours - 9 shift = 0 (no OT)
    },
    {
        name: "Overnight shift - 12 hours total",
        checkin: "22:00",
        checkout: "10:00",
        isOnDuty: true,
        shiftHours: 9,
        expected: 3.0 // 12 - 9 = 3
    },
    {
        name: "Holiday working - all hours are OT",
        checkin: "09:00",
        checkout: "17:00",
        isOnDuty: false,
        shiftHours: 9,
        expected: 8.0
    },
    {
        name: "Missing checkout - returns 0",
        checkin: "09:00",
        checkout: null,
        isOnDuty: true,
        shiftHours: 9,
        expected: 0
    },
    {
        name: "Exact shift hours - no OT",
        checkin: "09:00",
        checkout: "18:00",
        isOnDuty: true,
        shiftHours: 9,
        expected: 0
    },
    {
        name: "29 minute OT (rounds to 0.48)",
        checkin: "09:00",
        checkout: "18:29",
        isOnDuty: true,
        shiftHours: 9,
        expected: 0.48
    }
];

// Run tests
console.log("Running OT Calculation Tests...\n");
let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    const result = DataManager.calcOT(
        test.checkin,
        test.checkout,
        test.isOnDuty,
        test.shiftHours
    );

    const success = Math.abs(result - test.expected) < 0.01;

    if (success) {
        console.log(`✓ Test ${index + 1}: ${test.name}`);
        console.log(`  Result: ${result} (expected ${test.expected})`);
        passed++;
    } else {
        console.log(`✗ Test ${index + 1}: ${test.name}`);
        console.log(`  Result: ${result} (expected ${test.expected}) - FAILED`);
        failed++;
    }
    console.log();
});

console.log(`\n${passed}/${tests.length} tests passed`);
if (failed > 0) {
    console.log(`${failed} tests failed`);
    process.exit(1);
}
