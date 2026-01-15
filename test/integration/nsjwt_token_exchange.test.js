'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;
const http = require('http');
const axios = require('axios');
const restify = require('restify');

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

describe('Integration: NSJWT Token Exchange (AM-B05, AM-B06)', function() {
  this.timeout(30000);

  let testServer;
  let env;
  let store;
  let mockUpstreamServer;
  let mockUpstreamPort;

  function createMockUpstream(tokenBehavior = 'success') {
    return new Promise((resolve, reject) => {
      const mockServer = http.createServer((req, res) => {
        if (req.url.startsWith('/api/v2/authorization/request/')) {
          const policySpec = req.url.split('/').pop();
          
          if (tokenBehavior === 'success') {
            const now = Math.floor(Date.now() / 1000);
            const response = {
              token: 'mock-jwt-token-' + policySpec,
              iat: now,
              exp: now + 3600
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } else if (tokenBehavior === 'error') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
          } else if (tokenBehavior === 'timeout') {
            setTimeout(() => {
              res.writeHead(504);
              res.end();
            }, 5000);
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const port = mockServer.address().port;
        resolve({ server: mockServer, port });
      });

      mockServer.on('error', reject);
    });
  }

  async function lookupToken(acl, upstreamOrigin) {
    const httpClient = axios.create({ 
      baseURL: upstreamOrigin,
      timeout: 3000
    });
    const response = await httpClient.get('/api/v2/authorization/request/' + acl.policy_spec);
    return response.data;
  }

  before(async function() {
    env = require('../../env');
    store = require('../../lib/storage')(env);
    store.initialize();
    
    await store.migrate.rollback();
    await store.migrate.latest();

    testServer = restify.createServer({ name: 'nsjwt-test' });
    testServer.use(restify.plugins.queryParser());
    testServer.use(restify.plugins.bodyParser());

    testServer.get('/test/nsjwt/:subject/backend/for/:expected_name',
      asyncHandler(async function(req, res, next) {
        const subject = req.params.subject;
        const expectedName = req.params.expected_name;
        
        res.locals = res.locals || {};
        
        const siteRows = await store('registered_sites')
          .where('expected_name', expectedName)
          .first();
        
        if (!siteRows) {
          res.status(404);
          res.send({ error: 'Site not found' });
          return next(false);
        }
        req.site = siteRows;

        if (!req.site.is_enabled) {
          res.status(403);
          res.send({ error: 'Site disabled' });
          return next(false);
        }

        const aclRow = await store('unified_active_site_policies')
          .join('joined_groups', function() {
            this.on('joined_groups.group_id', 'unified_active_site_policies.group_id')
                .andOn('joined_groups.expected_name', 'unified_active_site_policies.expected_name');
          })
          .where({
            'unified_active_site_policies.expected_name': expectedName,
            'joined_groups.subject': subject
          })
          .select('unified_active_site_policies.*', 'joined_groups.subject')
          .first();

        res.locals.acl = aclRow || null;

        let active = false;
        let nsjwtToken = null;

        if (res.locals.acl) {
          if (res.locals.acl.policy_type === 'nsjwt') {
            try {
              nsjwtToken = await lookupToken(res.locals.acl, req.site.upstream_origin);
              res.locals.nsjwt = nsjwtToken;
              active = true;
            } catch (err) {
              active = false;
            }
          } else if (res.locals.acl.policy_spec && res.locals.acl.policy_spec !== 'deny') {
            active = true;
          }
        }

        if (active) {
          res.header('x-upstream-origin', req.site.upstream_origin);
          if (nsjwtToken && nsjwtToken.token) {
            res.header('x-nsjwt', nsjwtToken.token);
          }
          res.status(200);
          res.send({ active: true, policy_type: res.locals.acl?.policy_type });
        } else {
          res.status(403);
          res.send({ error: 'Access denied' });
        }
        next(false);
      })
    );
  });

  after(async function() {
    if (testServer) {
      testServer.close();
    }
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

  afterEach(async function() {
    if (mockUpstreamServer) {
      mockUpstreamServer.close();
      mockUpstreamServer = null;
    }
  });

  describe('AM-B05: NSJWT policy with valid token exchange', function() {
    it('should return 200 with X-NSJWT header when token exchange succeeds', async function() {
      const upstream = await createMockUpstream('success');
      mockUpstreamServer = upstream.server;
      mockUpstreamPort = upstream.port;

      const ownerRef = 'owner-amb05';
      const testSubject = 'test-subject-amb05';
      const upstreamOrigin = `http://127.0.0.1:${mockUpstreamPort}`;
      
      const site = await fixtures.createSite(store, {
        expected_name: 'nsjwt-site-amb05',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'NSJWT Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'nsjwt-user@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'nsjwt',
        policy_spec: 'readable'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/nsjwt-site-amb05`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', upstreamOrigin);
      expect(res).to.have.header('x-nsjwt');
      expect(res.headers['x-nsjwt']).to.include('mock-jwt-token-readable');
    });

    it('should return 200 for NSJWT policy with different policy_spec values', async function() {
      const upstream = await createMockUpstream('success');
      mockUpstreamServer = upstream.server;
      mockUpstreamPort = upstream.port;

      const ownerRef = 'owner-amb05-spec';
      const testSubject = 'test-subject-amb05-spec';
      const upstreamOrigin = `http://127.0.0.1:${mockUpstreamPort}`;
      
      const site = await fixtures.createSite(store, {
        expected_name: 'nsjwt-site-spec',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'NSJWT Spec Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'nsjwt-spec@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'nsjwt',
        policy_spec: 'careportal'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/nsjwt-site-spec`)
        .send();

      expect(res).to.have.status(200);
      expect(res.headers['x-nsjwt']).to.include('mock-jwt-token-careportal');
    });
  });

  describe('AM-B06: NSJWT policy when token exchange fails', function() {
    it('should return 403 when token exchange returns error', async function() {
      const upstream = await createMockUpstream('error');
      mockUpstreamServer = upstream.server;
      mockUpstreamPort = upstream.port;

      const ownerRef = 'owner-amb06';
      const testSubject = 'test-subject-amb06';
      const upstreamOrigin = `http://127.0.0.1:${mockUpstreamPort}`;
      
      const site = await fixtures.createSite(store, {
        expected_name: 'nsjwt-fail-site-amb06',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'NSJWT Fail Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'nsjwt-fail@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'nsjwt',
        policy_spec: 'readable'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/nsjwt-fail-site-amb06`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-nsjwt');
    });

    it('should return 403 when upstream is unreachable', async function() {
      const ownerRef = 'owner-amb06-unreachable';
      const testSubject = 'test-subject-amb06-unreachable';
      const upstreamOrigin = 'http://192.0.2.1:9999';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'nsjwt-unreachable-site',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'NSJWT Unreachable Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'nsjwt-unreachable@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'nsjwt',
        policy_spec: 'readable'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/nsjwt-unreachable-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('NSJWT vs default policy type', function() {
    it('should return 200 without X-NSJWT header for default policy type', async function() {
      const ownerRef = 'owner-default-type';
      const testSubject = 'test-subject-default';
      const upstreamOrigin = 'http://example.com';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'default-type-site',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Default Type Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'default@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'readable'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/default-type-site`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.not.have.header('x-nsjwt');
      expect(res.body.policy_type).to.equal('default');
    });

    it('should return 403 for deny policy spec regardless of policy type', async function() {
      const ownerRef = 'owner-deny-spec';
      const testSubject = 'test-subject-deny';
      const upstreamOrigin = 'http://example.com';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'deny-spec-site',
        upstream_origin: upstreamOrigin,
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Deny Spec Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'deny@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'deny'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(testServer)
        .get(`/test/nsjwt/${testSubject}/backend/for/deny-spec-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });
});
