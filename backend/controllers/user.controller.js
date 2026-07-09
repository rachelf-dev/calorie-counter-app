// זהו Controller שמנהל את כל פעולות המשתמשים: צפייה ועדכון פרופיל, העלאת תמונה, ניהול משתמשים על ידי Admin ושמירה על כללי אבטחה כמו מניעת מחיקת המנהל האחרון או שינוי הרשאות עצמיות.
const fs = require('fs/promises');
const path = require('path');

const User = require('../models/User');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

async function removeProfileImageFile(profileImage) {
  if (!profileImage) {
    return;
  }

  const filename = path.basename(profileImage);
  const filePath = path.join(UPLOADS_DIR, filename);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user.toJSON());
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, calorieGoal, age, gender, weight, height } = req.body;

    if (name !== undefined) {
      user.name = name;
    }

    if (calorieGoal !== undefined) {
      user.calorieGoal = calorieGoal;
    }

    if (age !== undefined) {
      user.age = age;
    }

    if (gender !== undefined) {
      user.gender = gender;
    }

    if (weight !== undefined) {
      user.weight = weight;
    }

    if (height !== undefined) {
      user.height = height;
    }

    await user.save();

    return res.status(200).json(user.toJSON());
  } catch (error) {
    return next(error);
  }
}

async function uploadProfileImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Profile image is required' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const previousImage = user.profileImage;
    const profileImage = `/uploads/${req.file.filename}`;

    user.profileImage = profileImage;
    await user.save();

    if (previousImage && previousImage !== profileImage) {
      await removeProfileImageFile(previousImage);
    }

    return res.status(200).json(user.toJSON());
  } catch (error) {
    return next(error);
  }
}

async function listUsers(_req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    return res.status(200).json(users.map((user) => user.toJSON()));
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });

      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin user' });
      }
    }

    await removeProfileImageFile(user.profileImage);
    await user.deleteOne();

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin' && role === 'user') {
      const adminCount = await User.countDocuments({ role: 'admin' });

      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot demote the last admin user' });
      }
    }

    user.role = role;
    await user.save();

    return res.status(200).json(user.toJSON());
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  uploadProfileImage,
  listUsers,
  deleteUser,
  updateUserRole,
};
