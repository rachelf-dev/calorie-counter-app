// זהו Controller שמנהל את תהליך ההרשמה וההתחברות. בהרשמה הוא יוצר משתמש חדש ובודק שאין כפילות, ובהתחברות הוא מאמת את הסיסמה ויוצר JWT שמאפשר למשתמש גישה מאובטחת למערכת.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function buildAuthResponse(user) {
  return {
    token: signToken(user),
    user: user.toJSON(),
  };
}

async function register(req, res, next) {
  try {
    const { name, email, password, calorieGoal, age, gender, weight, height } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'user',
      ...(calorieGoal !== undefined && { calorieGoal }),
      ...(age !== undefined && { age }),
      ...(gender !== undefined && { gender }),
      ...(weight !== undefined && { weight }),
      ...(height !== undefined && { height }),
    });

    return res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findByEmailWithPassword(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
};
