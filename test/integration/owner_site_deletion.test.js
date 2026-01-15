'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

describe('Integration: Owner API Site Deletion Cascade (OWN-SITE-DEL)', function() {
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
    await store.raw('TRUNCATE TABLE joined_groups CASCADE');
    await store.raw('TRUNCATE TABLE oauth2_credentials CASCADE');
    await store.raw('TRUNCATE TABLE scheduled_policies CASCADE');
    await store.raw('TRUNCATE TABLE connection_policies CASCADE');
    await store.raw('TRUNCATE TABLE group_inclusion_specs CASCADE');
    await store.raw('TRUNCATE TABLE group_definitions CASCADE');
    await store.raw('TRUNCATE TABLE nightscout_secrets CASCADE');
    await store.raw('TRUNCATE TABLE registered_sites CASCADE');
  });

  describe('OWN-SITE-DEL-Q01: Site deletion does NOT cascade to policies', function() {
    it('QUIRK: policies are NOT cascade deleted when site is deleted (no FK constraint)', async function() {
      const ownerRef = 'owner-del01';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'del01-site',
        upstream_origin: 'https://del01-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'DEL-01 Group'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const policiesBefore = await store('connection_policies').where({ site_id: site.id });
      expect(policiesBefore).to.have.lengthOf(1);

      await store('registered_sites').where({ id: site.id }).del();

      const policiesAfter = await store('connection_policies').where({ id: policy.id });
      console.log('QUIRK OWN-SITE-DEL-Q01: connection_policies NOT cascade deleted from site.');
      console.log('connection_policies.site_id references registered_sites.id');
      console.log('but there is no ON DELETE CASCADE foreign key constraint.');
      console.log('Orphaned policies remain:', policiesAfter.length);
      expect(policiesAfter).to.have.lengthOf(1);

      const groupAfter = await store('group_definitions').where({ id: group.id }).first();
      expect(groupAfter).to.exist;
    });
  });

  describe('OWN-SITE-DEL-Q02: joined_groups NOT cascade deleted from site', function() {
    it('QUIRK: joined_groups are NOT cascade deleted when site is deleted', async function() {
      const ownerRef = 'owner-del02';
      const testSubject = 'test-subject-del02';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'del02-site',
        upstream_origin: 'https://del02-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true,
        require_identities: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'DEL-02 Group'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'del02@example.com'
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

      const joinedBefore = await store('joined_groups').where({ expected_name: site.expected_name });
      expect(joinedBefore).to.have.lengthOf(1);

      await store('registered_sites').where({ id: site.id }).del();

      const joinedAfter = await store('joined_groups').where({ expected_name: site.expected_name });
      console.log('QUIRK OWN-SITE-DEL-Q02: joined_groups NOT cascade deleted via expected_name.');
      console.log('Orphaned joined_groups remain:', joinedAfter.length);
      expect(joinedAfter).to.have.lengthOf(1);
    });
  });

  describe('OWN-SITE-DEL-Q03: oauth2_credentials NOT cascade deleted', function() {
    it('QUIRK: oauth2_credentials are NOT cascade deleted when site is deleted', async function() {
      const ownerRef = 'owner-del03';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'del03-site',
        upstream_origin: 'https://del03-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true
      });

      await fixtures.createOAuthCredential(store, {
        owner_ref: ownerRef,
        expected_name: site.expected_name,
        client_id: 'del03-client-id'
      });

      const credsBefore = await store('oauth2_credentials').where({ expected_name: site.expected_name });
      expect(credsBefore).to.have.lengthOf(1);

      await store('registered_sites').where({ id: site.id }).del();

      const credsAfter = await store('oauth2_credentials').where({ expected_name: site.expected_name });
      console.log('QUIRK OWN-SITE-DEL-Q03: oauth2_credentials NOT cascade deleted.');
      console.log('Orphaned credentials remain:', credsAfter.length);
      expect(credsAfter).to.have.lengthOf(1);
    });
  });

  describe('OWN-SITE-DEL-01: Policy deletion cascades to schedules (via trigger)', function() {
    it('should cascade delete scheduled_policies when policy is deleted', async function() {
      const ownerRef = 'owner-pol-del';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'pol-del-site',
        upstream_origin: 'https://pol-del-ns.example.com',
        owner_ref: ownerRef,
        is_enabled: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Policy Delete Group'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const schedule = await fixtures.createSchedule(store, {
        policy_id: policy.id,
        fill_pattern: 'allow',
        schedule_segments: '0'
      });

      const schedulesBefore = await store('scheduled_policies').where({ policy_id: policy.id });
      expect(schedulesBefore).to.have.lengthOf(1);

      await store('connection_policies').where({ id: policy.id }).del();

      const schedulesAfter = await store('scheduled_policies').where({ id: schedule.id });
      expect(schedulesAfter).to.have.lengthOf(0);
    });
  });

  describe('OWN-SITE-DEL-02: Group deletion cascades to inclusions (via trigger)', function() {
    it('should cascade delete group_inclusion_specs when group is deleted', async function() {
      const ownerRef = 'owner-grp-del';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Group Delete Test'
      });

      const spec = await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'grp-del@example.com'
      });

      const specsBefore = await store('group_inclusion_specs').where({ group_definition_id: group.id });
      expect(specsBefore).to.have.lengthOf(1);

      await store('group_definitions').where({ id: group.id }).del();

      const specsAfter = await store('group_inclusion_specs').where({ id: spec.id });
      expect(specsAfter).to.have.lengthOf(0);
    });
  });

  describe('OWN-SITE-DEL-Q04: Group deletion does NOT cascade to policies', function() {
    it('QUIRK: connection_policies are NOT cascade deleted when group is deleted', async function() {
      const ownerRef = 'owner-grp-pol-del';
      
      const site = await fixtures.createSite(store, {
        expected_name: 'grp-pol-del-site',
        upstream_origin: 'https://grp-pol-del.example.com',
        owner_ref: ownerRef,
        is_enabled: true
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Group Policy Delete Test'
      });

      const policy = await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const policiesBefore = await store('connection_policies').where({ group_definition_id: group.id });
      expect(policiesBefore).to.have.lengthOf(1);

      await store('group_definitions').where({ id: group.id }).del();

      const policiesAfter = await store('connection_policies').where({ id: policy.id });
      console.log('QUIRK OWN-SITE-DEL-Q04: connection_policies NOT cascade deleted from group.');
      console.log('The trigger delete_group_policy deletes inclusions, not policies.');
      console.log('Orphaned policies remain:', policiesAfter.length);
      expect(policiesAfter).to.have.lengthOf(1);

      const siteAfter = await store('registered_sites').where({ id: site.id }).first();
      expect(siteAfter).to.exist;
    });
  });

  describe('CASCADE BEHAVIOR SUMMARY', function() {
    it('documents the actual cascade behavior in the system', function() {
      console.log('');
      console.log('=== CASCADE BEHAVIOR SUMMARY ===');
      console.log('');
      console.log('WORKING CASCADES (via triggers):');
      console.log('  - group_definitions DELETE → group_inclusion_specs (trigger: delete_group_policy)');
      console.log('  - connection_policies DELETE → scheduled_policies (trigger: delete_connection_policy)');
      console.log('  - connection_policies DELETE → joined_groups (trigger: delete_connection_policy_triggers_group_quits)');
      console.log('');
      console.log('MISSING CASCADES (quirks - leaves orphaned data):');
      console.log('  - registered_sites DELETE → connection_policies (OWN-SITE-DEL-Q01)');
      console.log('  - registered_sites DELETE → joined_groups (OWN-SITE-DEL-Q02)');
      console.log('  - registered_sites DELETE → oauth2_credentials (OWN-SITE-DEL-Q03)');
      console.log('  - group_definitions DELETE → connection_policies (OWN-SITE-DEL-Q04)');
      console.log('');
      console.log('RECOMMENDATION: Site deletion should be done via application logic');
      console.log('that explicitly deletes policies first to trigger proper cascades.');
      console.log('');
      
      expect(true).to.be.true;
    });
  });

});
