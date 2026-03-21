// sync_users.js - Upload gtes_users.json to Firebase Realtime Database
// Run: node sync_users.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const FIREBASE_URL = 'mjs-primelogic-default-rtdb.asia-southeast1.firebasedatabase.app';
const USERS_FILE = path.join(__dirname, 'Data', 'gtes_users.json');

function putToFirebase(key, data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname: FIREBASE_URL,
            path: `/${key}.json`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`✅ Successfully synced '${key}' to Firebase`);
                    resolve(responseData);
                } else {
                    console.error(`❌ Failed to sync '${key}': HTTP ${res.statusCode}`);
                    reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function syncUsers() {
    console.log('🔄 Syncing user accounts to Firebase...');
    
    if (!fs.existsSync(USERS_FILE)) {
        console.error('❌ gtes_users.json not found at:', USERS_FILE);
        process.exit(1);
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log(`📋 Found ${users.length} user(s) to sync:`);
    users.forEach(u => console.log(`   - ${u.username} (${u.role})`));

    await putToFirebase('gtes_users', users);
    console.log('\n🎉 User sync complete! You can now log in to the PWA at:');
    console.log('   https://mjsprimelogic.netlify.app');
    console.log('\n📝 Login credentials:');
    users.forEach(u => console.log(`   Username: ${u.username} | Use your desktop app password`));
}

syncUsers().catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
});
