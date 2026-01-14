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

function createMockPersist() {
  return function persist(cfg) {
    return {
      db: {
        findById: function() { return Promise.resolve(null); }
      }
    };
  };
}

function createMockServer() {
  return {};
}

function getDecisionHandler(env) {
  const mockPersist = createMockPersist();
  const mockServer = createMockServer();
  const policy = lookup(env, mockServer, mockPersist);
  return policy.handlers.decision;
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

function createMockRequest() {
  return {};
}

describe('Unit: decision() function', function() {
  this.timeout(5000);

  describe('D-01: Site disabled check', function() {
    it('should return 403 when is_enabled is false', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: false,
          acceptable: true
        },
        require_identities: false
      };
      
      decision(req, res, function() {
        expect(res.statusCode).to.equal(403);
        expect(res.locals.active).to.be.undefined;
        done();
      });
    });
  });

  describe('D-02: BYOD acceptable check with strictly_nightscout', function() {
    it('should return 403 when strictly_nightscout is true and acceptable is false', function(done) {
      const env = createMockEnv({ strictly_nightscout: true });
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true,
          acceptable: false
        },
        require_identities: false
      };
      
      decision(req, res, function() {
        expect(res.statusCode).to.equal(403);
        expect(res.locals.active).to.be.undefined;
        done();
      });
    });

    it('should return 403 when strictly_nightscout is true and acceptable is null', function(done) {
      const env = createMockEnv({ strictly_nightscout: true });
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true,
          acceptable: null
        },
        require_identities: false
      };
      
      decision(req, res, function() {
        expect(res.statusCode).to.equal(403);
        expect(res.locals.active).to.be.undefined;
        done();
      });
    });
  });

  describe('D-03: API secret matching bypass', function() {
    it('should set active true when allow_for_matching_api_secret is true', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        allow_for_matching_api_secret: true,
        require_identities: true
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('D-04: Identity required with ACL allow', function() {
    it('should set active true when require_identities and ACL policy_spec is allow', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'allow',
        policy_type: 'default'
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.locals.policy_allow_authorized_use).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('D-05: Identity required with ACL deny', function() {
    it('should return 403 when require_identities and ACL policy_spec is deny', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'deny',
        policy_type: 'default'
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.false;
        expect(res.locals.policy_allow_authorized_use).to.be.false;
        expect(res.statusCode).to.equal(403);
        done();
      });
    });
  });

  describe('D-06: Identity required with no ACL', function() {
    it('should return 403 when require_identities and acl is null', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = null;
      
      decision(req, res, function() {
        expect(res.locals.active).to.not.be.ok;
        expect(res.locals.policy_allow_authorized_use).to.not.be.ok;
        expect(res.statusCode).to.equal(403);
        done();
      });
    });
  });

  describe('D-07: Anonymous access (require_identities false)', function() {
    it('should set active true when require_identities is false', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: false
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('D-08: NSJWT policy with valid token', function() {
    it('should set active true when policy_type is nsjwt and token exists', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'allow',
        policy_type: 'nsjwt'
      };
      res.locals.nsjwt = {
        token: 'valid-jwt-token-here'
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('D-09: NSJWT policy without token', function() {
    it('should return 403 when policy_type is nsjwt but no token', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'deny',
        policy_type: 'nsjwt'
      };
      res.locals.nsjwt = null;
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.false;
        expect(res.statusCode).to.equal(403);
        done();
      });
    });

    it('should return 403 when policy_type is nsjwt and token is null', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'deny',
        policy_type: 'nsjwt'
      };
      res.locals.nsjwt = {
        token: null
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.false;
        expect(res.statusCode).to.equal(403);
        done();
      });
    });
  });

  describe('Edge Cases', function() {
    it('D-EC-01: strictly_nightscout false should ignore acceptable field', function(done) {
      const env = createMockEnv({ strictly_nightscout: false });
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true,
          acceptable: false
        },
        require_identities: false
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });

    it('D-EC-02: API secret bypass takes precedence over identity check', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        allow_for_matching_api_secret: true,
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'deny',
        policy_type: 'default'
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });

    it('D-EC-03: NSJWT can override deny when token present', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: true
        },
        require_identities: true
      };
      res.locals.acl = {
        policy_spec: 'deny',
        policy_type: 'nsjwt'
      };
      res.locals.nsjwt = {
        token: 'valid-jwt-token'
      };
      
      decision(req, res, function() {
        expect(res.locals.active).to.be.true;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });

    it('D-EC-04: Site disabled overrides all other permissions', function(done) {
      const env = createMockEnv();
      const decision = getDecisionHandler(env);
      const req = createMockRequest();
      const res = createMockResponse();
      
      res.locals.policy = {
        site: {
          is_enabled: false
        },
        allow_for_matching_api_secret: true,
        require_identities: false
      };
      res.locals.acl = {
        policy_spec: 'allow',
        policy_type: 'default'
      };
      
      decision(req, res, function() {
        expect(res.statusCode).to.equal(403);
        done();
      });
    });
  });
});
