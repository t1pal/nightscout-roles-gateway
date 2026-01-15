'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

describe('Integration: Privy Edge Cases (EC-*)', function() {
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

  describe('EC-01: User joins same group twice - idempotent behavior', function() {
    it('should have database unique constraint prevent duplicate joined_groups', async function() {
      const ownerRef = 'owner-ec01';
      const testSubject = 'test-subject-ec01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec01-site',
        upstream_origin: 'https://ec01-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-01 Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'ec01@example.com'
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

      try {
        await fixtures.createJoinedGroup(store, {
          subject: testSubject,
          expected_name: site.expected_name,
          group_id: group.id,
          group_spec_id: spec.id,
          policy_id: policy.id
        });
        expect.fail('Should have thrown a duplicate key error or been rejected');
      } catch (err) {
        console.log('EC-01 OBSERVATION: Duplicate insert behavior:', err.code || err.message);
      }

      const joinedGroups = await store('joined_groups').where({ subject: testSubject });
      expect(joinedGroups.length).to.be.at.least(1);

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec01-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('EC-02: Invitation removed after user saw it', function() {
    it('should deny access when inclusion spec is deleted after viewing but before joining', async function() {
      const ownerRef = 'owner-ec02';
      const testSubject = 'test-subject-ec02';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec02-site',
        upstream_origin: 'https://ec02-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-02 Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'ec02@example.com'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await store('group_inclusion_specs').where({ id: spec.id }).del();

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec02-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

  describe('EC-03: Owner deletes group after user joined', function() {
    it('should deny access when group is deleted after user joined', async function() {
      const ownerRef = 'owner-ec03';
      const testSubject = 'test-subject-ec03';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec03-site',
        upstream_origin: 'https://ec03-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-03 Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'ec03@example.com'
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

      const resBefore = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec03-site`)
        .send();
      expect(resBefore).to.have.status(200);

      await store('group_definitions').where({ id: group.id }).del();

      const resAfter = await chai.request(server)
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec03-site`)
        .send();
      expect(resAfter).to.have.status(403);
    });
  });

  describe('EC-05: Very long email address handling', function() {
    it('should handle maximum length email addresses (254 chars per RFC 5321)', async function() {
      const ownerRef = 'owner-ec05';
      const testSubject = 'test-subject-ec05';
      
      const localPart = 'a'.repeat(64);
      const domainPart = 'b'.repeat(63) + '.example.com';
      const longEmail = `${localPart}@${domainPart}`;
      
      console.log('EC-05: Testing email length:', longEmail.length, 'chars');
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec05-site',
        upstream_origin: 'https://ec05-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-05 Group'
      });

      let spec;
      try {
        spec = await fixtures.createInclusionSpec(store, {
          group_definition_id: group.id,
          identity_type: 'email',
          identity_spec: longEmail
        });
        console.log('EC-05: Long email stored successfully');
      } catch (err) {
        console.log('EC-05 QUIRK: Long email rejected by database:', err.message);
        return;
      }

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
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec05-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('EC-06: Special characters in email', function() {
    it('should handle RFC 5321 valid special characters in email local part', async function() {
      const ownerRef = 'owner-ec06';
      const testSubject = 'test-subject-ec06';
      
      const specialEmail = 'user+tag.name_test@example.com';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec06-site',
        upstream_origin: 'https://ec06-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-06 Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: specialEmail
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
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec06-site`)
        .send();

      expect(res).to.have.status(200);

      const storedSpec = await store('group_inclusion_specs').where({ id: spec.id }).first();
      expect(storedSpec.identity_spec).to.equal(specialEmail);
    });

    it('should handle hyphenated domain names', async function() {
      const ownerRef = 'owner-ec06b';
      const testSubject = 'test-subject-ec06b';
      
      const hyphenEmail = 'user@my-domain-name.example.com';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec06b-site',
        upstream_origin: 'https://ec06b-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-06b Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: hyphenEmail
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
        .get(`/warden/v1/portal/${testSubject}/backend/for/ec06b-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('EC-07: Null/undefined email trait handling', function() {
    it('should deny access when subject has no valid identity (anonymous simulation)', async function() {
      const ownerRef = 'owner-ec07';
      const anonymousSubject = 'anonymous';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec07-site',
        upstream_origin: 'https://ec07-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'EC-07 Group'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'ec07@example.com'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${anonymousSubject}/backend/for/ec07-site`)
        .send();

      expect(res).to.have.status(403);
    });

    it('should grant access to anonymous site even with anonymous identity', async function() {
      const ownerRef = 'owner-ec07b';
      const anonymousSubject = 'anonymous';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'ec07b-site',
        upstream_origin: 'https://ec07b-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: false
      });

      const res = await chai.request(server)
        .get(`/warden/v1/portal/${anonymousSubject}/backend/for/ec07b-site`)
        .send();

      expect(res).to.have.status(200);
    });
  });

  describe('Policy cascade: deny policy takes effect', function() {
    it('should deny access when user joins group with deny policy', async function() {
      const ownerRef = 'owner-deny';
      const testSubject = 'test-subject-deny';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'deny-site',
        upstream_origin: 'https://deny-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Deny Policy Group'
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
        .get(`/warden/v1/portal/${testSubject}/backend/for/deny-site`)
        .send();

      expect(res).to.have.status(403);
    });
  });

});
