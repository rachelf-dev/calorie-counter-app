// זהו סקריפט שמאתחל משתמש מנהל במערכת. הוא קורא את פרטי המנהל מקובץ הסביבה, בודק אם המשתמש כבר קיים,
//  יוצר אותו או מעדכן הרשאות, ומוודא שהחיבור למסד הנתונים נסגר בצורה תקינה.
require('dotenv').config();

const connectDB = require('../config/db');
const User = require('../models/User');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }

  if (password.length < 6) {
    throw new Error('ADMIN_PASSWORD must be at least 6 characters');
  }

  await connectDB();

  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    if (existingAdmin.role !== 'admin') {
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      console.log(`Updated existing user to admin: ${email}`);
    } else {
      console.log(`Admin user already exists: ${email}`);
    }

    await mongooseDisconnect();
    return;
  }

  await User.create({
    name,
    email,
    password,
    role: 'admin',
  });

  console.log(`Admin user created: ${email}`);

  await mongooseDisconnect();
}

async function mongooseDisconnect() {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

seedAdmin().catch(async (error) => {
  console.error('Failed to seed admin user:', error.message);

  try {
    await mongooseDisconnect();
  } catch {
    // Ignore disconnect errors after a failed seed.
  }

  process.exit(1);
});
