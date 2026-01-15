'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const crypto = require('crypto');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

function sha1Hash(secret) {
  return crypto.createHash('sha1').update(secret).digest('hex');
}

describe('Integration: Warden E2E Flow', function() {
  this.timeout(15000);

  let server;
  let env;
  let store;
  let my;

  before(async function() {
    if (process.env.SKIP_KRATOS_TESTS) {
      this.skip();
      return;
    }
    env = require('../../env');
    store = require('../../lib/storage')(env);
    store.initialize();
    my = { store };
    server = require('../../server')(env, my);
    await store.migrate.rollback();
    await store.migrate.latest();
  });

  after(async function() {
    if (store) {
      await store.migrate.rollback();
      store.destroy();
    }
  });

  beforeEach(async function() {
    await store.raw('TRUNCATE TABLE registered_sites CASCADE');
    await store.raw('TRUNCATE TABLE group_definitions CASCADE');
    await store.raw('TRUNCATE TABLE nightscout_authenticity_records CASCADE');
  });

  describe('E2E-01: Anonymous access to public site', function() {
    it('should return 200 with x-upstream-origin when require_identities is false', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'public-site-e2e01',
        upstream_origin: 'https://my-nightscout.example.com',
        is_enabled: true,
        require_identities: false
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/public-site-e2e01')
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://my-nightscout.example.com');
    });
  });

  describe('E2E-02: Identity access with valid consent', function() {
    it.skip('should return 200 when authenticated user has consent to site (requires Kratos mock server)', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-e2e02',
        upstream_origin: 'https://protected-ns.example.com',
        is_enabled: true,
        require_identities: true
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/protected-site-e2e02')
        .set('Cookie', 'ory_kratos_session=test-session-with-consent')
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://protected-ns.example.com');
    });
  });

  describe('E2E-03: Identity access without consent', function() {
    it.skip('should return 403 when authenticated user lacks consent to site (requires Kratos mock server)', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-e2e03',
        upstream_origin: 'https://protected-ns.example.com',
        is_enabled: true,
        require_identities: true
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/protected-site-e2e03')
        .set('Cookie', 'ory_kratos_session=test-session-without-consent')
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('E2E-04: Legacy device with API-SECRET header', function() {
    it.skip('should return 200 when API-SECRET matches and exempt_matching_api_secret is true (tested via portal route in api_secret_middleware.test.js)', async function() {
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      const site = await fixtures.createSite(store, {
        expected_name: 'legacy-device-e2e04',
        upstream_origin: 'https://legacy-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/legacy-device-e2e04')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://legacy-ns.example.com');
    });

    it('should return 403 when API-SECRET does not match', async function() {
      const apiSecret = 'testsupersecret123';
      const site = await fixtures.createSite(store, {
        expected_name: 'legacy-device-e2e04b',
        upstream_origin: 'https://legacy-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const wrongHash = sha1Hash('wrongsecret123456');
      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/legacy-device-e2e04b')
        .set('API-SECRET', wrongHash)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('E2E-05: Disabled site', function() {
    it('should return 403 when site is disabled regardless of other settings', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'disabled-site-e2e05',
        upstream_origin: 'https://disabled-ns.example.com',
        is_enabled: false,
        require_identities: false
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/disabled-site-e2e05')
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('E2E-06: BYOD site without validation', function() {
    let originalStrictlyNightscout;

    before(function() {
      originalStrictlyNightscout = env.upstream.strictly_nightscout;
      env.upstream.strictly_nightscout = true;
    });

    after(function() {
      env.upstream.strictly_nightscout = originalStrictlyNightscout;
    });

    it('should return 403 when site has no authenticity record in strictly_nightscout mode', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'byod-unvalidated-e2e06',
        upstream_origin: 'https://byod-ns.example.com',
        is_enabled: true,
        require_identities: false
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/byod-unvalidated-e2e06')
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });

    it('should return 200 when site has acceptable authenticity record', async function() {
      const site = await fixtures.createSite(store, {
        expected_name: 'byod-validated-e2e06',
        upstream_origin: 'https://byod-valid-ns.example.com',
        is_enabled: true,
        require_identities: false
      });

      await fixtures.createAuthenticityRecord(store, {
        expected_name: 'byod-validated-e2e06',
        upstream_origin: 'https://byod-valid-ns.example.com',
        status: 'ok',
        acceptable: true
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/byod-validated-e2e06')
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://byod-valid-ns.example.com');
    });
  });
});
