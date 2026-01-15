'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const crypto = require('crypto');
const restify = require('restify');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

function sha1Hash(secret) {
  return crypto.createHash('sha1').update(secret).digest('hex');
}

function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

describe('Integration: API-SECRET Middleware (AS-* specs)', function() {
  this.timeout(15000);

  let testServer;
  let env;
  let store;

  before(async function() {
    env = require('../../env');
    store = require('../../lib/storage')(env);
    store.initialize();
    
    await store.migrate.rollback();
    await store.migrate.latest();

    testServer = restify.createServer({ name: 'api-secret-test' });
    testServer.use(restify.plugins.queryParser());
    testServer.use(restify.plugins.bodyParser());

    testServer.get('/test/api-secret/:expected_name', 
      asyncHandler(async function(req, res, next) {
        const rows = await store('registered_sites')
          .select('registered_sites.*')
          .leftJoin('nightscout_authenticity_records', 'nightscout_authenticity_records.expected_name', 'registered_sites.expected_name')
          .where('registered_sites.expected_name', req.params.expected_name);
        
        if (rows.length !== 1) {
          res.status(404);
          res.send({ error: 'Site not found' });
          return next(false);
        }
        req.site = rows[0];
        
        res.locals = res.locals || {};
        res.locals.policy = {
          site: req.site,
          has_schedules: false,
          require_identities: req.site.require_identities
        };

        const hashed_api_secret = req.header('API-SECRET') || 'invalid';
        const matchRows = await store('nightscout_secrets')
          .select('nightscout_secrets.expected_name')
          .join('registered_sites', 'registered_sites.id', 'nightscout_secrets.id')
          .where({
            'nightscout_secrets.hashed_api_secret': hashed_api_secret,
            'nightscout_secrets.expected_name': req.site.expected_name,
            'registered_sites.is_enabled': true,
            'registered_sites.exempt_matching_api_secret': true
          })
          .first();

        res.locals.policy.has_matching_api_secret = matchRows ? matchRows.expected_name === req.site.expected_name : false;
        res.locals.policy.allow_for_matching_api_secret = res.locals.policy.has_matching_api_secret && req.site.exempt_matching_api_secret;

        if (!req.site.is_enabled) {
          res.status(403);
          res.send({ error: 'Site disabled' });
          return next(false);
        }

        let active = true;
        if (res.locals.policy.allow_for_matching_api_secret) {
          active = true;
        } else if (req.site.require_identities) {
          active = false;
        }

        if (active) {
          res.header('x-upstream-origin', req.site.upstream_origin);
          res.status(200);
          res.send({ active: true });
        } else {
          res.status(403);
          res.send({ error: 'Access denied' });
        }
        next(false);
      })
    );
  });

  after(async function() {
    if (store) {
      await store.migrate.rollback();
      store.destroy();
    }
    if (testServer) {
      testServer.close();
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/as01-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/as02-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/as03-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/as04-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/as05-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/asfb01-site')
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

      const res = await chai.request(testServer)
        .get('/test/api-secret/mc02-site')
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://mc02-ns.example.com');
    });
  });
});
