'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

const fixtures = require('../setup/fixtures');

describe('Integration: Owner API Endpoints', function() {
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

  describe('OWN-GRP-01: Groups Overview', function() {
    it('should return empty list when owner has no groups', async function() {
      const ownerRef = 'owner-grp01-empty';

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array').that.is.empty;
    });

    it('should return groups belonging to owner (via owner_group_usage view)', async function() {
      const ownerRef = 'owner-grp01-has-groups';

      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'grp01-site',
        upstream_origin: 'https://grp01.example.com'
      });

      const familyGroup = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Family Group'
      });
      const workGroup = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Work Group'
      });
      await fixtures.createGroup(store, {
        owner_ref: 'other-owner',
        nickname: 'Other Owner Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: familyGroup.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });
      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: workGroup.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array').with.lengthOf(2);
      const groupNames = res.body.data.map(g => g.group_name);
      expect(groupNames).to.include('Family Group');
      expect(groupNames).to.include('Work Group');
      expect(groupNames).to.not.include('Other Owner Group');
    });
  });

  describe('OWN-GRP-02: Create Group', function() {
    it('should create a new group with nickname', async function() {
      const ownerRef = 'owner-grp02-create';

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups`)
        .send({ nickname: 'New Test Group' });

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.inserted).to.be.an('object');
      expect(res.body.inserted.group).to.have.property('nickname', 'New Test Group');
      expect(res.body.inserted.group).to.have.property('owner_ref', ownerRef);
      expect(res.body.inserted.group).to.have.property('id');
    });

    it('should create group with initial includes (single)', async function() {
      const ownerRef = 'owner-grp02-with-include';

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups`)
        .send({
          nickname: 'Group With Member',
          identity_type: 'email',
          identity_spec: 'member@example.com'
        });

      expect(res).to.have.status(200);
      expect(res.body.inserted.group).to.have.property('nickname', 'Group With Member');
      expect(res.body.inserted.includes).to.be.an('array').with.lengthOf(1);
      expect(res.body.inserted.includes[0]).to.have.property('identity_type', 'email');
      expect(res.body.inserted.includes[0]).to.have.property('identity_spec', 'member@example.com');
    });

    it('should create group with multiple includes array', async function() {
      const ownerRef = 'owner-grp02-multi-include';

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups`)
        .send({
          nickname: 'Group With Members',
          includes: [
            { identity_type: 'email', identity_spec: 'user1@example.com' },
            { identity_type: 'email', identity_spec: 'user2@example.com' }
          ]
        });

      expect(res).to.have.status(200);
      expect(res.body.inserted.group).to.have.property('nickname', 'Group With Members');
      expect(res.body.inserted.includes).to.be.an('array').with.lengthOf(2);
    });
  });

  describe('OWN-GRP-03: Get Group Details', function() {
    it('should return group details with inclusion specs', async function() {
      const ownerRef = 'owner-grp03';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Detail Test Group'
      });
      
      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'detail@example.com'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups/${group.id}`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.results).to.have.property('data');
      expect(res.body.results.data).to.be.an('array').with.lengthOf(1);
    });
  });

  describe('OWN-GRP-04: Get Group Attributes', function() {
    it('should return group attributes via join', async function() {
      const ownerRef = 'owner-grp04';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Attributes Test Group'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups/${group.id}/attributes`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body).to.have.property('results');
    });
  });

  describe('OWN-GRP-05: Update Group Attributes', function() {
    it('should update group nickname', async function() {
      const ownerRef = 'owner-grp05';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Original Nickname'
      });

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups/${group.id}/attributes`)
        .send({ nickname: 'Updated Nickname' });

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.updated).to.have.property('nickname', 'Updated Nickname');
    });
  });

  describe('OWN-GRP-06: Delete Group', function() {
    it('should delete a group', async function() {
      const ownerRef = 'owner-grp06';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'To Be Deleted'
      });

      const res = await chai.request(server)
        .delete(`/api/v1/owner/${ownerRef}/groups/${group.id}`)
        .send();

      expect(res).to.have.status(204);

      const check = await store('group_definitions').where({ id: group.id }).first();
      expect(check).to.be.undefined;
    });
  });

  describe('OWN-INC-01: Add Group Inclusions', function() {
    it('should add inclusion spec to existing group', async function() {
      const ownerRef = 'owner-inc01';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Inclusion Test Group'
      });

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes`)
        .send({
          identity_type: 'email',
          identity_spec: 'newmember@example.com'
        });

      expect(res).to.have.status(200);
      expect(res.body.inserted).to.have.property('includes');
      expect(res.body.inserted.includes).to.be.an('array').with.lengthOf(1);
      expect(res.body.inserted.includes[0]).to.have.property('identity_spec', 'newmember@example.com');
    });

    it('should add inclusion with identity_type in URL', async function() {
      const ownerRef = 'owner-inc01-url';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Inclusion URL Test'
      });

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes/invite`)
        .send({
          identity_spec: 'magic-link-code'
        });

      expect(res).to.have.status(200);
      expect(res.body.inserted.includes[0]).to.have.property('identity_type', 'invite');
    });

    it('OWN-INC-Q01: email normalization adjust function does not return (quirk)', async function() {
      const ownerRef = 'owner-inc01-normalize';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Normalize Test'
      });

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes`)
        .send({
          identity_type: 'email',
          identity_spec: 'UPPERCASE@Example.COM'
        });

      expect(res).to.have.status(200);
      console.log('QUIRK OWN-INC-Q01: Email normalization intended but adjust() has no return.');
      console.log('Expected: uppercase@example.com');
      console.log('Actual:', res.body.inserted.includes[0].identity_spec);
      expect(res.body.inserted.includes[0]).to.have.property('identity_spec', 'UPPERCASE@Example.COM');
    });
  });

  describe('OWN-INC-02: Search Group Inclusions', function() {
    it('should search inclusions by identity_type', async function() {
      const ownerRef = 'owner-inc02';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Search Test Group'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'email-user@example.com'
      });
      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'invite',
        identity_spec: 'invite-code'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes/email`)
        .send();

      expect(res).to.have.status(200);
      expect(res.body.results.data).to.be.an('array').with.lengthOf(1);
      expect(res.body.results.data[0]).to.have.property('identity_type', 'email');
    });

    it('should search inclusions by identity_type and identity_spec', async function() {
      const ownerRef = 'owner-inc02-specific';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Specific Search Group'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'findme@example.com'
      });
      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'other@example.com'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes/email/findme@example.com`)
        .send();

      expect(res).to.have.status(200);
      expect(res.body.results.data).to.be.an('array').with.lengthOf(1);
      expect(res.body.results.data[0]).to.have.property('identity_spec', 'findme@example.com');
    });
  });

  describe('OWN-INC-03: Delete Group Inclusions', function() {
    it('should delete inclusion by identity_type and identity_spec', async function() {
      const ownerRef = 'owner-inc03';
      
      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Delete Inclusion Test'
      });

      await fixtures.createInclusionSpec(store, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'todelete@example.com'
      });

      const res = await chai.request(server)
        .delete(`/api/v1/owner/${ownerRef}/groups/${group.id}/includes/email/todelete@example.com`)
        .send();

      expect(res).to.have.status(204);

      const check = await store('group_inclusion_specs')
        .where({ group_definition_id: group.id, identity_spec: 'todelete@example.com' })
        .first();
      expect(check).to.be.undefined;
    });
  });

  describe('OWN-SYN-01: Synopsis Endpoints', function() {
    it('should return owner synopsis overview (requires at least one policy)', async function() {
      const ownerRef = 'owner-syn01';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'synopsis-site',
        upstream_origin: 'https://synopsis-ns.example.com'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Synopsis Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/synopsis`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array').with.lengthOf(1);
      expect(res.body.data[0]).to.have.property('expected_name', 'synopsis-site');
    });

    it('OWN-SYN-Q01: site without policies not in synopsis view (quirk)', async function() {
      const ownerRef = 'owner-syn01-nopolicy';
      
      await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'synopsis-nopolicy',
        upstream_origin: 'https://synopsis-nopolicy.example.com'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/synopsis`)
        .send();

      expect(res).to.have.status(200);
      console.log('QUIRK OWN-SYN-Q01: site_registration_synopsis is built from site_acls view.');
      console.log('Sites without connection_policies do not appear in synopsis.');
      expect(res.body.data).to.be.an('array').that.is.empty;
    });

    it('should return site-specific synopsis', async function() {
      const ownerRef = 'owner-syn01-site';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'synopsis-specific',
        upstream_origin: 'https://synopsis-specific.example.com',
        nickname: 'My CGM Site'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Site Synopsis Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/synopsis/synopsis-specific`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.have.property('expected_name', 'synopsis-specific');
      expect(res.body.data).to.have.property('nickname', 'My CGM Site');
    });

    it('should return empty for non-existent owner', async function() {
      const res = await chai.request(server)
        .get('/api/v1/owner/nonexistent-owner/synopsis')
        .send();

      expect(res).to.have.status(200);
      expect(res.body.data).to.be.an('array').that.is.empty;
    });
  });

  describe('OWN-ACL-01: ACL Endpoints', function() {
    it('should return owner ACLs', async function() {
      const ownerRef = 'owner-acl01';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'acl-site',
        upstream_origin: 'https://acl-ns.example.com'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'ACL Test Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/acl`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array');
    });

    it('should return site-specific ACLs', async function() {
      const ownerRef = 'owner-acl01-site';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'acl-site-specific',
        upstream_origin: 'https://acl-specific.example.com'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Site ACL Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/sites/acl-site-specific/acl`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array');
    });
  });

  describe('OWN-ACL-02: Available Unassigned Groups', function() {
    it('OWN-ACL-Q01: unassigned groups query returns from owner_group_usage (quirk)', async function() {
      const ownerRef = 'owner-acl02';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'unassigned-site',
        upstream_origin: 'https://unassigned-ns.example.com'
      });

      const assignedGroup = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Assigned Group'
      });
      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: assignedGroup.id,
        policy_type: 'default',
        policy_spec: 'allow'
      });

      await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Unassigned Group'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/sites/unassigned-site/available/groups`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.data).to.be.an('array');
      console.log('QUIRK OWN-ACL-Q01: get_groups_unassigned uses owner_group_usage view.');
      console.log('View is built from site_groups_with_policies - groups not in view means no data.');
      console.log('Groups without any policy never appear in owner_group_usage, so num_sites_used=0 filter returns nothing for truly unassigned groups.');
      console.log('Actual data:', res.body.data);
    });
  });

  describe('OWN-POL-01: Permission Assignment', function() {
    it('should get policy overview for site', async function() {
      const ownerRef = 'owner-pol01';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'policy-site',
        upstream_origin: 'https://policy-ns.example.com'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'Policy Test Group'
      });

      await fixtures.createPolicy(store, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'default',
        policy_spec: 'allow',
        policy_name: 'Viewer Access'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/sites/policy-site/assigned/permissions`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body).to.have.property('results');
    });

    it('should create a new policy assignment via permission_assignment_activities', async function() {
      const ownerRef = 'owner-pol01-create';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'policy-create-site',
        upstream_origin: 'https://policy-create.example.com'
      });

      const group = await fixtures.createGroup(store, {
        owner_ref: ownerRef,
        nickname: 'New Policy Group'
      });

      const res = await chai.request(server)
        .post(`/api/v1/owner/${ownerRef}/sites/policy-create-site/assigned/permissions`)
        .send({
          group_id: group.id,
          policy_type: 'default',
          policy_spec: 'allow',
          policy_name: 'Family Viewer Policy'
        });

      expect(res).to.have.status(200);
      expect(res).to.be.json;
      expect(res.body.inserted).to.have.property('payload');
    });
  });

  describe('OWN-SITE-01: Site-Level Endpoints', function() {
    it('should return site details via ACL endpoint', async function() {
      const ownerRef = 'owner-site01';
      
      const site = await fixtures.createSite(store, {
        owner_ref: ownerRef,
        expected_name: 'site-detail',
        upstream_origin: 'https://site-detail.example.com'
      });

      const res = await chai.request(server)
        .get(`/api/v1/owner/${ownerRef}/sites/site-detail`)
        .send();

      expect(res).to.have.status(200);
      expect(res).to.be.json;
    });
  });

});
