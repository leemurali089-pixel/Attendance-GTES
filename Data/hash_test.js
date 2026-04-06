const crypto = require('crypto');

const password = 'admin123';
const storedHash = '72345675a2559b416af8a7f8ff9f0380:ed0d4a1bb615c101dcaf7815c979f2a30555aaeb561c1b51824ecb1593072f3f8ca417e1d7bc28e5db735c02947fc1075b628134d41a86e58820dd9b8194d24d';

const [salt, originalHash] = storedHash.split(':');

crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
    if (err) throw err;
    const computedHash = derivedKey.toString('hex');
    console.log("Original: " + originalHash);
    console.log("Computed: " + computedHash);
    console.log("Match for 'admin123'? " + (computedHash === originalHash));
});

const defaultPass = 'gtes67';
crypto.pbkdf2(defaultPass, salt, 1000, 64, 'sha512', (err, derivedKey) => {
    const computedHash = derivedKey.toString('hex');
    console.log("Match for 'gtes67'? " + (computedHash === originalHash));
});


const try3 = 'gtes67@';
crypto.pbkdf2(try3, salt, 1000, 64, 'sha512', (err, derivedKey) => {
    const computedHash = derivedKey.toString('hex');
    console.log("Match for 'gtes67@'? " + (computedHash === originalHash));
});
