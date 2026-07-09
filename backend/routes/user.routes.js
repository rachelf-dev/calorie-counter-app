// זהו קובץ Routes שמנהל את פעולות המשתמשים. הוא משתמש ב־Middleware לאימות והרשאות, מבצע בדיקות תקינות על נתונים, ומאפשר למשתמשים לנהל את הפרופיל שלהם ולמנהלים לנהל משתמשים אחרים.
const express = require('express');
const { body, param } = require('express-validator');

const userController = require('../controllers/user.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');
const upload = require('../middleware/upload.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

const updateProfileValidators = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('calorieGoal').optional().isInt({ min: 1 }).withMessage('Calorie goal must be a positive number'),
  body('age').optional().isInt({ min: 0 }).withMessage('Age must be a positive number'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be a positive number'),
  body('height').optional().isFloat({ min: 0 }).withMessage('Height must be a positive number'),
];

const updateRoleValidators = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('role').isIn(['user', 'admin']).withMessage('Role must be user or admin'),
];

router.use(auth);

router.get('/profile', userController.getProfile);
router.put('/profile', updateProfileValidators, validate, userController.updateProfile);
router.put('/profile/image', upload.single('image'), userController.uploadProfileImage);

router.get('/', admin, userController.listUsers);
router.delete(
  '/:id',
  admin,
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
  userController.deleteUser
);
router.put('/:id/role', admin, updateRoleValidators, validate, userController.updateUserRole);

module.exports = router;
