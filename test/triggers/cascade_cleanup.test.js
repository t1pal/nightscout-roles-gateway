'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('Trigger: Cascade Cleanup', function() {
  this.timeout(30000);

  before(async function() {
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  describe('remove_joined_groups_via_policy (connection_policies DELETE)', function() {
    it('TRG-CC-01: should delete joined_groups when connection_policy is deleted', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id 
      });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const joinedBefore = await db.knex('joined_groups').where({ policy_id: policy.id });
      expect(joinedBefore).to.have.length(1);

      await db.knex('connection_policies').where({ id: policy.id }).del();

      const joinedAfter = await db.knex('joined_groups').where({ policy_id: policy.id });
      expect(joinedAfter).to.have.length(0);
    });

    it('TRG-CC-02: should only delete joined_groups for the deleted policy', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group1 = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const group2 = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec1 = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group1.id 
      });
      const spec2 = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group2.id 
      });
      const policy1 = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group1.id
      });
      const policy2 = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group2.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        expected_name: site.expected_name,
        group_id: group1.id,
        group_spec_id: spec1.id,
        policy_id: policy1.id
      });
      await fixtures.createJoinedGroup(db.knex, {
        expected_name: site.expected_name,
        group_id: group2.id,
        group_spec_id: spec2.id,
        policy_id: policy2.id
      });

      await db.knex('connection_policies').where({ id: policy1.id }).del();

      const remainingJoined = await db.knex('joined_groups');
      expect(remainingJoined).to.have.length(1);
      expect(remainingJoined[0].policy_id).to.equal(policy2.id);
    });

    it('TRG-CC-03: should handle policy with no joined_groups gracefully', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await db.knex('connection_policies').where({ id: policy.id }).del();

      const policies = await db.knex('connection_policies').where({ id: policy.id });
      expect(policies).to.have.length(0);
    });
  });

  describe('force_leave_group (group_inclusion_specs DELETE)', function() {
    it('TRG-CC-04: should delete joined_groups when inclusion_spec is deleted', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id 
      });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const joinedBefore = await db.knex('joined_groups').where({ group_spec_id: spec.id });
      expect(joinedBefore).to.have.length(1);

      await db.knex('group_inclusion_specs').where({ id: spec.id }).del();

      const joinedAfter = await db.knex('joined_groups').where({ group_spec_id: spec.id });
      expect(joinedAfter).to.have.length(0);
    });

    it('TRG-CC-05: should only delete joined_groups for the specific spec', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec1 = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id,
        identity_spec: 'alice@example.com'
      });
      const spec2 = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id,
        identity_spec: 'bob@example.com'
      });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        subject: 'alice-id',
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec1.id,
        policy_id: policy.id
      });
      await fixtures.createJoinedGroup(db.knex, {
        subject: 'bob-id',
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec2.id,
        policy_id: policy.id
      });

      await db.knex('group_inclusion_specs').where({ id: spec1.id }).del();

      const remainingJoined = await db.knex('joined_groups');
      expect(remainingJoined).to.have.length(1);
      expect(remainingJoined[0].group_spec_id).to.equal(spec2.id);
    });

    it('TRG-CC-06: should delete multiple joined_groups for the same spec', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id
      });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        subject: 'user-1',
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });
      await fixtures.createJoinedGroup(db.knex, {
        subject: 'user-2',
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      const joinedBefore = await db.knex('joined_groups').where({ group_spec_id: spec.id });
      expect(joinedBefore).to.have.length(2);

      await db.knex('group_inclusion_specs').where({ id: spec.id }).del();

      const joinedAfter = await db.knex('joined_groups');
      expect(joinedAfter).to.have.length(0);
    });
  });

  describe('Cascade chain verification', function() {
    it('TRG-CC-07: documents cascade behavior when group is deleted', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const spec = await fixtures.createInclusionSpec(db.knex, { 
        group_definition_id: group.id 
      });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });

      await fixtures.createJoinedGroup(db.knex, {
        expected_name: site.expected_name,
        group_id: group.id,
        group_spec_id: spec.id,
        policy_id: policy.id
      });

      console.log('TRG-CC-07: Testing cascade when group_definitions is deleted');
      console.log('  - Before: 1 joined_group, 1 spec, 1 policy, 1 group');
      
      await db.knex('group_definitions').where({ id: group.id }).del();

      const remainingJoined = await db.knex('joined_groups');
      const remainingSpecs = await db.knex('group_inclusion_specs').where({ group_definition_id: group.id });
      const remainingPolicies = await db.knex('connection_policies').where({ group_definition_id: group.id });
      
      console.log('  - After group delete:');
      console.log('    - joined_groups remaining:', remainingJoined.length);
      console.log('    - inclusion_specs remaining:', remainingSpecs.length);
      console.log('    - connection_policies remaining:', remainingPolicies.length);
    });
  });
});
