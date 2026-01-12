const crypto = require('crypto');
const fs = require('fs');

// Read users file
const usersData = JSON.parse(fs.readFileSync('/var/www/stockroom-dashboard/data/users.json', 'utf8'));
const user = usersData.users.find(u => u.employeeId === '30744');

console.log('User found:', user ? user.name : 'NO');
console.log('Password stored:', user.password.substring(0, 50));

// Test password verification
const password = '1234';

function verifyPassword(inputPassword, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    // Plain text comparison
    return inputPassword === storedHash;
  }

  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    
    const salt = Buffer.from(parts[1], 'base64');
    const storedHashBuf = Buffer.from(parts[2], 'base64');
    
    const derivedKey = crypto.scryptSync(inputPassword, salt, 64);
    
    return crypto.timingSafeEqual(storedHashBuf, derivedKey);
  } catch (e) {
    console.error('Error verifying:', e);
    return false;
  }
}

const result = verifyPassword(password, user.password);
console.log('Password verification result:', result);
