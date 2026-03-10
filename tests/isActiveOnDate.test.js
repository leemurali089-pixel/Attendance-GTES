// isActiveOnDate() Tests
// Run these tests to verify employee active date filtering

const DataManager = require('./data.js');

// Test Suite
const tests = [
    {
        name: "Employee active on today (no relieving)",
        employee: {
            name: "Test Employee",
            dateOfJoining: "2024-01-01",
            dateOfRelieving: null
        },
        checkDate: new Date(),
        expected: true
    },
    {
        name: "Employee not yet joined",
        employee: {
            name: "Future Employee",
            dateOfJoining: "2099-01-01",
            dateOfRelieving: null
        },
        checkDate: new Date(),
        expected: false
    },
    {
        name: "Employee resigned - checking date before relieving",
        employee: {
            name: "Resigned Employee",
            dateOfJoining: "2024-01-01",
            dateOfRelieving: "2024-06-15"
        },
        checkDate: "2024-06-15", // On the relieving date
        expected: true
    },
    {
        name: "Employee resigned - checking date after relieving",
        employee: {
            name: "Resigned Employee",
            dateOfJoining: "2024-01-01",
            dateOfRelieving: "2024-06-15"
        },
        checkDate: "2024-06-16", // Day after relieving
        expected: false
    },
    {
        name: "Employee resigned - checking date on joining day",
        employee: {
            name: "Test Employee",
            dateOfJoining: "2024-06-15",
            dateOfRelieving: "2024-06-15"
        },
        checkDate: "2024-06-15", // Same day join and relieve
        expected: true
    },
    {
        name: "Employee with no dateOfJoining - returns false",
        employee: {
            name: "Invalid Employee"
        },
        checkDate: new Date(),
        expected: false
    },
    {
        name: "Null employee - returns false",
        employee: null,
        checkDate: new Date(),
        expected: false
    }
];

// Run tests
console.log("Running isActiveOnDate() Tests...\n");
let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    const result = DataManager.isActiveOnDate(test.employee, test.checkDate);

    const success = result === test.expected;

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
