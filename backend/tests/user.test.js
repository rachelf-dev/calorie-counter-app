const fs = require('fs/promises');
const path = require('path');
const request = require('supertest');

const DailyLog = require('../models/DailyLog');
const User = require('../models/User');
const {
  app,
  createUser,
  createAdmin,
  signToken,
  authHeader,
  registerUser,
} = require('./helpers');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

describe('Users API', () => {
  describe('GET /api/users/profile', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/users/profile');

      expect(response.status).toBe(401);
    });

    it('returns profile for authenticated user', async () => {
      const user = await createUser({ email: 'profile@example.com' });
      const token = signToken(user);

      const response = await request(app)
        .get('/api/users/profile')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('profile@example.com');
      expect(response.body.password).toBeUndefined();
    });
  });

  describe('PUT /api/users/profile', () => {
    it('updates profile fields', async () => {
      const user = await createUser({ email: 'update@example.com' });
      const token = signToken(user);

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(token))
        .send({
          name: 'Updated Name',
          calorieGoal: 1800,
          age: 30,
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
      expect(response.body.calorieGoal).toBe(1800);
      expect(response.body.age).toBe(30);
    });

    it('updates today log targetCalories when calorieGoal changes', async () => {
      const user = await createUser({ email: 'goal-sync@example.com', calorieGoal: 2000 });
      const token = signToken(user);
      const today = new Date().toISOString().slice(0, 10);

      await DailyLog.create({
        userId: user._id,
        date: today,
        targetCalories: 2000,
        totalCaloriesConsumed: 0,
        items: [],
      });

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(token))
        .send({ calorieGoal: 2150 });

      expect(response.status).toBe(200);
      expect(response.body.calorieGoal).toBe(2150);

      const todayLog = await DailyLog.findOne({ userId: user._id, date: today });
      expect(todayLog.targetCalories).toBe(2150);
    });

    it('returns 400 for invalid profile payload', async () => {
      const user = await createUser({ email: 'invalid@example.com' });
      const token = signToken(user);

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(token))
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });
  });

  describe('PUT /api/users/profile/image', () => {
    beforeEach(async () => {
      await ensureUploadsDir();
    });

    it('uploads a profile image', async () => {
      const user = await createUser({ email: 'image@example.com' });
      const token = signToken(user);

      const response = await request(app)
        .put('/api/users/profile/image')
        .set(authHeader(token))
        .attach('image', Buffer.from('fake-image-content'), {
          filename: 'avatar.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body.profileImage).toMatch(/^\/uploads\/profile-/);

      const filename = path.basename(response.body.profileImage);
      await fs.unlink(path.join(UPLOADS_DIR, filename)).catch(() => {});
    });

    it('returns 400 when image file is missing', async () => {
      const user = await createUser({ email: 'no-image@example.com' });
      const token = signToken(user);

      const response = await request(app)
        .put('/api/users/profile/image')
        .set(authHeader(token));

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/profile image is required/i);
    });
  });

  describe('Admin user management', () => {
    it('returns 403 for non-admin on GET /api/users', async () => {
      const user = await createUser({ email: 'regular@example.com' });
      const token = signToken(user);

      const response = await request(app).get('/api/users').set(authHeader(token));

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/admin access required/i);
    });

    it('lists users for admin', async () => {
      await createUser({ email: 'listed@example.com' });
      const admin = await createAdmin();
      const token = signToken(admin);

      const response = await request(app).get('/api/users').set(authHeader(token));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body.every((entry) => entry.password === undefined)).toBe(true);
    });

    it('prevents admin from deleting their own account', async () => {
      const admin = await createAdmin();
      const token = signToken(admin);

      const response = await request(app)
        .delete(`/api/users/${admin._id}`)
        .set(authHeader(token));

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/cannot delete your own account/i);
    });

    it('prevents admin from changing their own role', async () => {
      const admin = await createAdmin();
      const token = signToken(admin);

      const response = await request(app)
        .put(`/api/users/${admin._id}/role`)
        .set(authHeader(token))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/cannot change your own role/i);
    });

    it('prevents demoting the last admin when another admin exists', async () => {
      const admin = await createAdmin({ email: 'admin1@example.com' });
      const lastAdmin = await createAdmin({ email: 'admin2@example.com' });
      await User.deleteOne({ _id: admin._id });

      const token = signToken(lastAdmin);

      const response = await request(app)
        .put(`/api/users/${lastAdmin._id}/role`)
        .set(authHeader(token))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/cannot change your own role/i);
    });

    it('allows admin to change another user role and delete user', async () => {
      const admin = await createAdmin();
      const target = await createUser({ email: 'target@example.com' });
      const token = signToken(admin);

      const roleResponse = await request(app)
        .put(`/api/users/${target._id}/role`)
        .set(authHeader(token))
        .send({ role: 'admin' });

      expect(roleResponse.status).toBe(200);
      expect(roleResponse.body.role).toBe('admin');

      const deleteResponse = await request(app)
        .delete(`/api/users/${target._id}`)
        .set(authHeader(token));

      expect(deleteResponse.status).toBe(200);

      const deletedUser = await User.findById(target._id);
      expect(deletedUser).toBeNull();
    });
  });
});
