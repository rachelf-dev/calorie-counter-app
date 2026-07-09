// זהו קובץ Routes שמנהל את פעולות ההרשמה וההתחברות. הוא מבצע ולידציה על הנתונים שמגיעים מהלקוח לפני שהם עוברים ל־Controller, וכך מונע הכנסת מידע לא תקין למערכת.
const express = require('express');
const { body } = require('express-validator');

const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

const registerValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('calorieGoal').optional().isInt({ min: 1 }).withMessage('Calorie goal must be a positive number'),
  body('age').optional().isInt({ min: 0 }).withMessage('Age must be a positive number'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be a positive number'),
  body('height').optional().isFloat({ min: 0 }).withMessage('Height must be a positive number'),
];

const loginValidators = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', registerValidators, validate, authController.register);
router.post('/login', loginValidators, validate, authController.login);

module.exports = router;
