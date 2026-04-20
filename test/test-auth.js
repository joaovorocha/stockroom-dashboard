const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

// Use peer authentication via socket
const pool = new Pool({
  host: '/var/run/postgresql',
  database: 'stockroom_dashboard',
  user: 'suit',
});

async function getManagerUser() {
    const res = await pool.query(`
        SELECT employee_id, name, password_hash 
        FROM users 
        WHERE role = 'MANAGEMENT' AND is_active = true 
        LIMIT 1
    `);
    if (res.rows.length === 0) {
        throw new Error('No active manager found in the database.');
    }
    const user = res.rows[0];
    return {
        employeeId: user.employee_id,
        name: user.name,
        password: user.password_hash // For this script, we'll use the hash directly
    };
}

async function runTest() {
    // Read manager user from DB
    const user = await getManagerUser();

    console.log('User found:', user ? user.name : 'NO');
    console.log('Password hash stored:', user.password.substring(0, 50));

    // Test password verification
    // NOTE: This test will fail for password hashes, but we only need the cookie.
    // The server will handle the real auth.
    const password = '1234'; // Dummy password for script structure

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

    const session = {
      userId: user.employeeId,
      // ... existing code ...
    };

    const sessionToken = crypto.randomBytes(32).toString('hex');

    console.log(`\n--- AUTH COOKIE ---`);
    console.log(`userSession=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`);

    // We are not actually saving the session to the DB in this test script.
    // We just need the cookie format to test authenticated endpoints.
    pool.end();
}

runTest().catch(err => {
    console.error("Test failed:", err);
    pool.end();
});
