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

describe('Integration: Portal Endpoint Identity Access (E2E-Q03)', function() {
  // Coverage: AM-B01 to AM-B04, MC-01, MC-03 (partial Mode B tests)
  // NOT covered: AM-B05/AM-B06 (NSJWT token exchange - requires mock token endpoint)
  // MC-02 pending: E2E-Q02 async timing issue in matches_api_secret
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

  describe('AM-B01: Identity required, user has ACL allow', function() {
    it('should return 200 when subject has joined group with allow policy', async function() {
      const ownerRef = 'owner-amb01';
      const testSubject = 'test-subject-amb01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-amb01',
        upstream_origin: 'https://protected-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Family Viewers'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'viewer@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/protected-site-amb01`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://protected-ns.example.com');
    });
  });

  describe('AM-B02: Identity required, user has ACL deny', function() {
    it('should return 403 when subject has joined group with deny policy', async function() {
      const ownerRef = 'owner-amb02';
      const testSubject = 'test-subject-amb02';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-amb02',
        upstream_origin: 'https://protected-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Blocked Users'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'blocked@example.com'
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

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/protected-site-amb02`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('AM-B03: Identity required, no session (unknown subject)', function() {
    it('should return 403 when subject has no joined groups', async function() {
      const ownerRef = 'owner-amb03';
      const unknownSubject = 'unknown-subject-amb03';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-amb03',
        upstream_origin: 'https://protected-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${unknownSubject}/backend/for/protected-site-amb03`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('AM-B04: Identity required, session but no ACL (no joined_groups record)', function() {
    it('should return 403 when subject exists but has not joined any groups for this site', async function() {
      const ownerRef = 'owner-amb04';
      const testSubject = 'test-subject-amb04';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'protected-site-amb04',
        upstream_origin: 'https://protected-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Some Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'someone@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/protected-site-amb04`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('MC-01: Identity user with escape available (Mode B+C)', function() {
    it('should return 200 via identity when user has ACL allow (even if escape is available)', async function() {
      const ownerRef = 'owner-mc01';
      const testSubject = 'test-subject-mc01';
      const apiSecret = 'testsupersecret123';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'hybrid-site-mc01',
        upstream_origin: 'https://hybrid-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Identity Users'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'user@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/hybrid-site-mc01`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://hybrid-ns.example.com');
    });
  });

  describe('MC-02: Device with API-SECRET via portal (Mode B+C)', function() {
    it.skip('should return 200 via API-SECRET bypass even without identity consent (E2E-Q02: async handler timing issue)', async function() {
      const ownerRef = 'owner-mc02';
      const unknownSubject = 'unknown-device-mc02';
      const apiSecret = 'testsupersecret123';
      const hashedSecret = sha1Hash(apiSecret);
      
      const site = await fixtures.createSite(store, {
        expected_name: 'hybrid-site-mc02',
        upstream_origin: 'https://hybrid-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${unknownSubject}/backend/for/hybrid-site-mc02`)
        .set('API-SECRET', hashedSecret)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://hybrid-ns.example.com');
    });
  });

  describe('MC-03: No credentials (Mode B+C)', function() {
    it('should return 403 when no identity consent and no API-SECRET', async function() {
      const ownerRef = 'owner-mc03';
      const unknownSubject = 'unknown-subject-mc03';
      const apiSecret = 'testsupersecret123';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'hybrid-site-mc03',
        upstream_origin: 'https://hybrid-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true,
        exempt_matching_api_secret: true,
        api_secret: apiSecret
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${unknownSubject}/backend/for/hybrid-site-mc03`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('Portal with anonymous site', function() {
    it('should return 200 for anonymous site even with arbitrary subject', async function() {
      const ownerRef = 'owner-anon';
      const anySubject = 'any-subject';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'anon-site-portal',
        upstream_origin: 'https://public-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: false
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${anySubject}/backend/for/anon-site-portal`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://public-ns.example.com');
    });
  });

  describe('Portal with disabled site', function() {
    it('should return 403 for disabled site regardless of subject consent', async function() {
      const ownerRef = 'owner-disabled';
      const testSubject = 'test-subject-disabled';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'disabled-site-portal',
        upstream_origin: 'https://disabled-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: false,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Some Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'user@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/disabled-site-portal`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });

  describe('ACL-02: Schedule override via portal endpoint', function() {
    it('should use schedule-overridden policy_spec when schedule is active', async function() {
      const ownerRef = 'owner-acl02-portal';
      const testSubject = 'test-subject-acl02-portal';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'schedule-site-portal',
        upstream_origin: 'https://schedule-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Scheduled Access Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'scheduled@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'deny'
      });

      await fixtures.createSchedule(store, {
        policy_id: policy.id,
        fill_pattern: 'allow',
        schedule_segments: '0'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/schedule-site-portal`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://schedule-ns.example.com');
    });

    it('should use base policy_spec when schedule is not active', async function() {
      const ownerRef = 'owner-acl02-inactive';
      const testSubject = 'test-subject-acl02-inactive';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'inactive-schedule-site',
        upstream_origin: 'https://inactive-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Inactive Schedule Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'inactive@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'deny'
      });

      await fixtures.createSchedule(store, {
        policy_id: policy.id,
        fill_pattern: 'allow',
        schedule_segments: '999999999'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/inactive-schedule-site`)
        .send();

      expect(res).to.have.status(403);
      expect(res).to.not.have.header('x-upstream-origin');
    });
  });
});
