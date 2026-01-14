'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;

const lookup = require('../../../lib/policies/index');

function createMockEnv(overrides = {}) {
  return {
    upstream: {
      strictly_nightscout: overrides.strictly_nightscout || false
    }
  };
}

function createMockPersist(dbMockResult) {
  const persist = function persist(cfg) {
    return {
      db: {
        findById: function() { return Promise.resolve(null); }
      }
    };
  };
  
  persist.entities = {
    Site: {
      db: {
        findById: function(hashValue, select, where) {
          return {
            andWhere: function(conditions) {
              return {
                join: function(table, col1, col2) {
                  return Promise.resolve(dbMockResult);
                }
              };
            }
          };
        }
      }
    }
  };
  
  return persist;
}

function createMockServer() {
  return {};
}

function getMatchesApiSecretHandler(env, dbMockResult) {
  const mockPersist = createMockPersist(dbMockResult);
  const mockServer = createMockServer();
  const policy = lookup(env, mockServer, mockPersist);
  return policy.handlers.matches_api_secret;
}

function createMockResponse() {
  const res = {
    locals: {
      policy: {},
      acl: null,
      nsjwt: null
    },
    statusCode: 200,
    status: function(code) {
      this.statusCode = code;
      return this;
    }
  };
  return res;
}

function createMockRequest(site, headers = {}) {
  return {
    site: site,
    header: function(name, defaultValue) {
      return headers[name] || defaultValue;
    }
  };
}

describe('Unit: matches_api_secret() function (AS-01 to AS-07)', function() {
  this.timeout(5000);

  describe('AS-01: Valid secret, all conditions met', function() {
    it('should set has_matching_api_secret and allow_for_matching_api_secret to true', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = { expected_name: 'testsite' };
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.true;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.true;
        done();
      });
    });
  });

  describe('AS-02: Valid secret but escape disabled', function() {
    it('should set has_matching_api_secret true but allow_for_matching_api_secret false', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: false
      };
      
      const dbResult = { expected_name: 'testsite' };
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.true;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('AS-03: Valid secret but site disabled', function() {
    it('should set has_matching_api_secret false when join fails (site disabled)', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: false,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('AS-04: Wrong secret hash', function() {
    it('should set has_matching_api_secret false when hash does not match', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'wrong-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('AS-05: No API-SECRET header', function() {
    it('should set has_matching_api_secret false when no header provided', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, {});
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('AS-06: No secret registered for site', function() {
    it('should set has_matching_api_secret false when no entry exists for site', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('AS-07: Secret for different site', function() {
    it('should set has_matching_api_secret false when secret belongs to different site', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = { expected_name: 'othersite' };
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        done();
      });
    });
  });

  describe('Fallback Behavior Tests (AS-FB01 to AS-FB03)', function() {
    
    it('AS-FB01: Secret matches but escape disabled - should continue to identity check', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: false
      };
      
      const dbResult = { expected_name: 'testsite' };
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'valid-sha1-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.allow_for_matching_api_secret).to.be.false;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });

    it('AS-FB02: Secret does not match - should continue to identity check', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, { 'API-SECRET': 'invalid-hash' });
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });

    it('AS-FB03: No secret provided - should continue to identity check', function(done) {
      const site = {
        id: 1,
        expected_name: 'testsite',
        is_enabled: true,
        exempt_matching_api_secret: true
      };
      
      const dbResult = null;
      const env = createMockEnv();
      const handler = getMatchesApiSecretHandler(env, dbResult);
      
      const req = createMockRequest(site, {});
      const res = createMockResponse();
      res.locals.policy = { site: site };
      
      handler(req, res, function() {
        expect(res.locals.policy.has_matching_api_secret).to.be.false;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });
});
