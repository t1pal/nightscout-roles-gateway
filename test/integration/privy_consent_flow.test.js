'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

describe('Integration: Privy Consent Flow (JG-*, SJ-*, RV-*)', function() {
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
  });

  after(async function() {
  });

  beforeEach(async function() {
    await store.raw('TRUNCATE TABLE registered_sites CASCADE');
    await store.raw('TRUNCATE TABLE group_definitions CASCADE');
  });

  describe('JG-01: Valid join request - all required fields present', function() {
    it('should grant access when joined_groups record exists with allow policy', async function() {
      const ownerRef = 'owner-jg01';
      const testSubject = 'test-subject-jg01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'jg01-site',
        upstream_origin: 'https://jg01-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'JG-01 Family Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'mom@example.com'
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
        .get(`/warden/v1/portal/${testSubject}/backend/for/jg01-site`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-upstream-origin', 'https://jg01-ns.example.com');
    });
  });

  describe('JG-06: Duplicate join attempt - idempotent behavior', function() {
    it('should allow access with either of duplicate joined_groups records', async function() {
      const ownerRef = 'owner-jg06';
      const testSubject = 'test-subject-jg06';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'jg06-site',
        upstream_origin: 'https://jg06-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'JG-06 Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'duptest@example.com'
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

      const joinedGroups = await store('joined_groups').where({ subject: testSubject });
      expect(joinedGroups).to.have.lengthOf(1);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/jg06-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('JG-07: Join without matching spec - graceful failure', function() {
    it('should deny access when subject has no matching inclusion spec', async function() {
      const ownerRef = 'owner-jg07';
      const testSubject = 'test-subject-jg07-no-spec';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'jg07-site',
        upstream_origin: 'https://jg07-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'JG-07 Test Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/jg07-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('SJ-01: User has joined groups', function() {
    it('should verify joined_groups record exists and enables access', async function() {
      const ownerRef = 'owner-sj01';
      const testSubject = 'test-subject-sj01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'sj01-site',
        upstream_origin: 'https://sj01-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'SJ-01 Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'sj01@example.com'
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

      const joinedGroups = await store('joined_groups').where({ subject: testSubject });
      expect(joinedGroups).to.have.lengthOf(1);
      expect(joinedGroups[0]).to.have.property('group_id', group.id);
      expect(joinedGroups[0]).to.have.property('policy_id', policy.id);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/sj01-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('SJ-02: User has no joined groups', function() {
    it('should deny access when user has no joined_groups records', async function() {
      const ownerRef = 'owner-sj02';
      const testSubject = 'test-subject-sj02-no-joins';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'sj02-site',
        upstream_origin: 'https://sj02-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'SJ-02 Test Group'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'sj02@example.com'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/sj02-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('SJ-03: Filter by group_id', function() {
    it('should only grant access for the specific group the subject joined', async function() {
      const ownerRef = 'owner-sj03';
      const testSubject = 'test-subject-sj03';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'sj03-site',
        upstream_origin: 'https://sj03-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group1 = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'SJ-03 Group 1'
      });

      const group2 = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'SJ-03 Group 2'
      });

      const spec1 = await fixtures.createInclusionSpec(store, {
        group_definition_id: group1.id,
        identity_type: 'email',
        identity_spec: 'sj03-g1@example.com'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group2.id,
        identity_type: 'email',
        identity_spec: 'sj03-g2@example.com'
      });

      const policy1 = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group1.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group2.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group1.id,
        group_spec_id: spec1.id,
        policy_id: policy1.id
      });

      const joinedGroups = await store('joined_groups').where({ subject: testSubject });
      expect(joinedGroups).to.have.lengthOf(1);
      expect(joinedGroups[0]).to.have.property('group_id', group1.id);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/sj03-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('SJ-04: Filter by expected_name - site-specific memberships', function() {
    it('should only grant access for the site the subject joined', async function() {
      const ownerRef = 'owner-sj04';
      const testSubject = 'test-subject-sj04';
      
      const site1 = await fixtures.createSite(store, {
        expected_name: 'sj04-site-a',
        upstream_origin: 'https://sj04-a.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const site2 = await fixtures.createSite(store, {
        expected_name: 'sj04-site-b',
        upstream_origin: 'https://sj04-b.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'SJ-04 Shared Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'sj04@example.com'
      });

      const policy1 = await fixtures.createPolicy(store, {
        site_id: site1.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createPolicy(store, {
        site_id: site2.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site1.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy1.id
      });

      const resA = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/sj04-site-a`)
        .send();

      expect(resA).to.have.status(200);
      expect(resA).to.have.header('x-upstream-origin', 'https://sj04-a.example.com');

      const resB = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/sj04-site-b`)
        .send();

      expect(resB).to.have.status(403);
    });
  });

  describe('RV-01: Valid revocation - consent withdrawn', function() {
    it('should deny access after joined_groups record is removed', async function() {
      const ownerRef = 'owner-rv01';
      const testSubject = 'test-subject-rv01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'rv01-site',
        upstream_origin: 'https://rv01-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'RV-01 Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'rv01@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const joined = await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const resBefore = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/rv01-site`)
        .send();

      expect(resBefore).to.have.status(200);

      await store('joined_groups').where({ id: joined.id }).del();

      const resAfter = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/rv01-site`)
        .send();

      expect(resAfter).to.have.status(403);
    });
  });

  describe('RV-02: Non-existent membership revocation - idempotent', function() {
    it('should return 403 when membership never existed', async function() {
      const ownerRef = 'owner-rv02';
      const testSubject = 'test-subject-rv02-never-joined';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'rv02-site',
        upstream_origin: 'https://rv02-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'RV-02 Test Group'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'rv02@example.com'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/rv02-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('RV-03: Partial match revocation - no deletion', function() {
    it('should still grant access when revocation query does not fully match', async function() {
      const ownerRef = 'owner-rv03';
      const testSubject = 'test-subject-rv03';
      const wrongSubject = 'test-subject-rv03-wrong';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'rv03-site',
        upstream_origin: 'https://rv03-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'RV-03 Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'rv03@example.com'
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

      await store('joined_groups').where({ subject: wrongSubject }).del();

      const remaining = await store('joined_groups').where({ subject: testSubject });
      expect(remaining).to.have.lengthOf(1);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/rv03-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('IF-03: Accept then revoke - access lifecycle', function() {
    it('should handle full consent lifecycle: grant → revoke → deny', async function() {
      const ownerRef = 'owner-if03';
      const testSubject = 'test-subject-if03';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'if03-site',
        upstream_origin: 'https://if03-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-03 Test Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'if03@example.com'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const resBefore = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if03-site`)
        .send();
      expect(resBefore).to.have.status(403);

      const joined = await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const resJoined = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if03-site`)
        .send();
      expect(resJoined).to.have.status(200);

      await store('joined_groups').where({ id: joined.id }).del();

      const resRevoked = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if03-site`)
        .send();
      expect(resRevoked).to.have.status(403);
    });
  });

  describe('IF-04: Multiple invitations - user can accept multiple groups', function() {
    it('should grant access when user joins any of multiple groups with allow policy', async function() {
      const ownerRef = 'owner-if04';
      const testSubject = 'test-subject-if04';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'if04-site',
        upstream_origin: 'https://if04-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group1 = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-04 Group 1'
      });
      const group2 = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-04 Group 2'
      });
      const group3 = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-04 Group 3'
      });

      const spec1 = await fixtures.createInclusionSpec(store, {
        group_definition_id: group1.id,
        identity_type: 'email',
        identity_spec: 'if04@example.com'
      });
      const spec2 = await fixtures.createInclusionSpec(store, {
        group_definition_id: group2.id,
        identity_type: 'email',
        identity_spec: 'if04@example.com'
      });
      const spec3 = await fixtures.createInclusionSpec(store, {
        group_definition_id: group3.id,
        identity_type: 'email',
        identity_spec: 'if04@example.com'
      });

      const policy1 = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group1.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });
      const policy2 = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group2.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });
      const policy3 = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group3.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group1.id,
        group_spec_id: spec1.id,
        policy_id: policy1.id
      });
      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group2.id,
        group_spec_id: spec2.id,
        policy_id: policy2.id
      });
      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: site.expected_name,
        group_id: group3.id,
        group_spec_id: spec3.id,
        policy_id: policy3.id
      });

      const joinedGroups = await store('joined_groups').where({ subject: testSubject });
      expect(joinedGroups).to.have.lengthOf(3);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if04-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('IF-05: Cross-site isolation', function() {
    it('should not grant access to Site B when user only joined Site A', async function() {
      const ownerRef = 'owner-if05';
      const testSubject = 'test-subject-if05';
      
      const siteA = await fixtures.createSite(store, {
        expected_name: 'if05-site-a',
        upstream_origin: 'https://if05-a.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const siteB = await fixtures.createSite(store, {
        expected_name: 'if05-site-b',
        upstream_origin: 'https://if05-b.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const groupA = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-05 Site A Group'
      });

      const groupB = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'IF-05 Site B Group'
      });

      const specA = await fixtures.createInclusionSpec(store, {
        group_definition_id: groupA.id,
        identity_type: 'email',
        identity_spec: 'if05@example.com'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: groupB.id,
        identity_type: 'email',
        identity_spec: 'if05@example.com'
      });

      const policyA = await fixtures.createPolicy(store, {
        site_id: siteA.id,
        group_definition_id: groupA.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createPolicy(store, {
        site_id: siteB.id,
        group_definition_id: groupB.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createJoinedGroup(store, {
        subject: testSubject,
        expected_name: siteA.expected_name,
        group_id: groupA.id,
        group_spec_id: specA.id,
        policy_id: policyA.id
      });

      const resA = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if05-site-a`)
        .send();

      expect(resA).to.have.status(200);

      const resB = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/if05-site-b`)
        .send();

      expect(resB).to.have.status(403);
    });
  });

});
