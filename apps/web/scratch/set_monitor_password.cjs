const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'saegroup-c6487'
    });
}

async function setPassword() {
  const email = process.argv[2];
  const password = process.argv[3];
  
  if (!email || !password) {
      console.error("Usage: node set_monitor_password.cjs <email> <password>");
      process.exit(1);
  }
  
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: password });
    console.log(`Password updated for ${email}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const newUser = await admin.auth().createUser({ email: email, password: password });
      console.log(`User created: ${email}`);
    } else {
      console.error('Error:', err.message);
    }
  }
}
setPassword();
