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

describe('Integration: API-SECRET Middleware (AS-* specs)', function() {
  this.timeout(15000);

  let server;
  let env;
  let store;
  let my;

  before(async function() {
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

  describe('AS-01: Valid secret with all conditions met', function() {
    it('should set allow_for_matching_api_secret true when valid hash, enabled, and exempt', async function() {
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      await fixtures.createSite(store, {
        expected_name: 'as01-site',
        upstream_origin: 'https://as01-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/as01-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://as01-ns.example.com');
    });
  });

  describe('AS-02: Valid secret but escape disabled', function() {
    it('should return 403 when exempt_matching_api_secret is false', async function() {
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      await fixtures.createSite(store, {
        expected_name: 'as02-site',
        upstream_origin: 'https://as02-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: false,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/as02-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('AS-03: Valid secret but site disabled', function() {
    it('should return 403 when site is disabled even with valid secret', async function() {
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      await fixtures.createSite(store, {
        expected_name: 'as03-site',
        upstream_origin: 'https://as03-ns.example.com',
        is_enabled: false,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/as03-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('AS-04: Wrong secret hash', function() {
    it('should return 403 when API-SECRET hash does not match', async function() {
      const apiSecret = 'testsupersecret123';
      const wrongHash = sha1Hash('wrongsecret12345');
      
      await fixtures.createSite(store, {
        expected_name: 'as04-site',
        upstream_origin: 'https://as04-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/as04-site')
        .set('API-SECRET', wrongHash)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('AS-05: No API-SECRET header', function() {
    it('should return 403 when no API-SECRET header and require_identities is true', async function() {
      const apiSecret = 'testsupersecret123';
      
      await fixtures.createSite(store, {
        expected_name: 'as05-site',
        upstream_origin: 'https://as05-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/as05-site')
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('AS-FB01: Secret matches but escape disabled - falls through to identity check', function() {
    it('should allow access if require_identities is false even when escape disabled', async function() {
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      await fixtures.createSite(store, {
        expected_name: 'asfb01-site',
        upstream_origin: 'https://asfb01-ns.example.com',
        is_enabled: true,
        require_identities: false,
        exempt_matching_api_secret: false,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/asfb01-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://asfb01-ns.example.com');
    });
  });

  describe('MC-02: Mode B+C - Device with API-SECRET bypasses identity requirement', function() {
    it('should return 200 when valid API-SECRET bypasses require_identities', async function() {
      const apiSecret = 'deviceapisecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      await fixtures.createSite(store, {
        expected_name: 'mc02-site',
        upstream_origin: 'https://mc02-ns.example.com',
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get('/warden/v1/active/backend/for/mc02-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://mc02-ns.example.com');
    });
  });
});
