const crypto = require('crypto');
const fs = require('fs');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Read users file
const usersFilePath = '/var/www/stockroom-dashboard/data/users.json';
const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));

// Reset all passwords to "1234"
const newPassword = '1234';
let count = 0;

usersData.users.forEach(user => {
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false; // Don't force password change
  count++;
});

// Save back
fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

console.log(`✅ Reset ${count} user passwords to "${newPassword}"`);
console.log('Users can now log in with employee ID and password "1234"');
