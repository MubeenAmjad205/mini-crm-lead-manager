const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Lead = require('../src/models/Lead');

describe('Mini CRM API Suite', () => {
  let authToken;
  let refreshToken;
  let adminToken;
  let sampleLeadId;

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Lead.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('Authentication Endpoints', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'password123',
          role: 'user'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('jane@example.com');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should prevent duplicate email registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate Jane',
          email: 'jane@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('should login and return tokens', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      authToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should refresh access token using valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();

      authToken = response.body.data.accessToken;
    });

    it('should reject unauthenticated access to me endpoint', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe('jane@example.com');
    });

    it('should register an admin user for RBAC verification', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Admin Boss',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin'
        });

      expect(response.status).toBe(201);
      adminToken = response.body.data.accessToken;
    });
  });

  describe('Lead Management Endpoints', () => {
    it('should reject lead creation without authentication', async () => {
      const response = await request(app)
        .post('/api/leads')
        .send({
          name: 'Alex Lead',
          email: 'alex@example.com',
          phone: '+1 555-0199'
        });

      expect(response.status).toBe(401);
    });

    it('should validate required fields when creating a lead via Zod', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'M'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should validate lead status enum via Zod', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Bad Status Lead',
          email: 'bad@status.com',
          phone: '+1 555-1234',
          status: 'invalid_status'
        });

      expect(response.status).toBe(400);
    });

    it('should create leads matching the PDF schema specification', async () => {
      const leadPayload = {
        name: 'Sarah Connor',
        email: 'sarah@cyberdyne.com',
        phone: '+1 555-9021',
        status: 'new',
        assignedTo: 'Agent Smith'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send(leadPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(leadPayload.name);
      expect(response.body.data.email).toBe(leadPayload.email);
      expect(response.body.data.status).toBe('new');
      expect(response.body.data.assignedTo).toBe('Agent Smith');
      expect(response.body.data.createdAt).toBeDefined();

      sampleLeadId = response.body.data._id;
    });

    it('should prevent duplicate lead creation with same email', async () => {
      const duplicatePayload = {
        name: 'Sarah Connor Duplicate',
        email: 'sarah@cyberdyne.com',
        phone: '+1 555-9999',
        status: 'new',
        assignedTo: 'Other Agent'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send(duplicatePayload);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should create additional leads for filtering and pagination', async () => {
      const extraLeads = [
        { name: 'John Matrix', email: 'john@commando.org', phone: '+1 555-1111', status: 'contacted', assignedTo: 'Agent Smith' },
        { name: 'Ellen Ripley', email: 'ripley@weyland.com', phone: '+1 555-2222', status: 'converted', assignedTo: 'Agent Jones' },
        { name: 'Arthur Dent', email: 'arthur@galaxy.guide', phone: '+1 555-3333', status: 'new', assignedTo: 'Unassigned' },
        { name: 'Ford Prefect', email: 'ford@betelgeuse.net', phone: '+1 555-4444', status: 'contacted', assignedTo: 'Agent Smith' }
      ];

      for (const lead of extraLeads) {
        await request(app)
          .post('/api/leads')
          .set('Authorization', `Bearer ${authToken}`)
          .send(lead);
      }
    });

    it('should return paginated leads with metadata', async () => {
      const response = await request(app)
        .get('/api/leads?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.leads.length).toBe(2);
      expect(response.body.data.pagination.total).toBe(5);
      expect(response.body.data.pagination.totalPages).toBe(3);
      expect(response.body.data.pagination.hasNextPage).toBe(true);
    });

    it('should filter leads by status', async () => {
      const response = await request(app)
        .get('/api/leads?status=converted')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.leads.length).toBe(1);
      expect(response.body.data.leads[0].name).toBe('Ellen Ripley');
    });

    it('should search leads by query string', async () => {
      const response = await request(app)
        .get('/api/leads?search=galaxy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.leads.length).toBe(1);
      expect(response.body.data.leads[0].name).toBe('Arthur Dent');
    });

    it('should update lead status', async () => {
      const response = await request(app)
        .patch(`/api/leads/${sampleLeadId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'contacted' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('contacted');
    });

    it('should return basic analytics metrics', async () => {
      const response = await request(app)
        .get('/api/leads/analytics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(5);
      expect(response.body.data.statusCounts).toBeDefined();
      expect(typeof response.body.data.conversionRate).toBe('number');
      expect(Array.isArray(response.body.data.recentLeads)).toBe(true);
    });

    it('should allow deletion of a lead', async () => {
      const response = await request(app)
        .delete(`/api/leads/${sampleLeadId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const verifyResponse = await request(app)
        .get(`/api/leads/${sampleLeadId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(verifyResponse.status).toBe(404);
    });
  });
});
