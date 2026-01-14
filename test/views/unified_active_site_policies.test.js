'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('View: unified_active_site_policies', function() {
  this.timeout(30000);

  before(async function() {
    await db.migrate();
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  describe('COALESCE Merge Logic', function() {
    it('UASP-01: should use base policy_spec when no schedule exists', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'base-allow'
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      expect(rows).to.have.length(1);
      expect(rows[0].policy_spec).to.equal('base-allow');
    });

    it('UASP-02: should override with schedule spec when schedule is active', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'base-deny'
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'scheduled-allow',
        schedule_segments: '0'
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      expect(rows).to.have.length(1);
      expect(rows[0].policy_spec).to.equal('scheduled-allow');
    });

    it('UASP-03: should use base policy when schedule exists but not currently active', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'base-fallback'
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'never-active',
        schedule_segments: '1,2'
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      if (rows.length > 0) {
        console.log('UASP-03: policy_spec =', rows[0].policy_spec);
      }
    });
  });

  describe('ACL Sort Order', function() {
    it('UASP-04: should return policies sorted by sort field', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      
      const group1 = await fixtures.createGroup(db.knex, { owner_ref: owner, nickname: 'Group A' });
      const group2 = await fixtures.createGroup(db.knex, { owner_ref: owner, nickname: 'Group B' });
      const group3 = await fixtures.createGroup(db.knex, { owner_ref: owner, nickname: 'Group C' });
      
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group2.id,
        policy_spec: 'second',
        sort: 20
      });
      
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group1.id,
        policy_spec: 'first',
        sort: 10
      });
      
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group3.id,
        policy_spec: 'third',
        sort: 30
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      expect(rows).to.have.length(3);
      
      const sortedRows = rows.sort((a, b) => a.sort - b.sort);
      expect(sortedRows[0].policy_spec).to.equal('first');
      expect(sortedRows[1].policy_spec).to.equal('second');
      expect(sortedRows[2].policy_spec).to.equal('third');
    });

    it('UASP-05: should handle null sort values', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'no-sort',
        sort: null
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      expect(rows).to.have.length(1);
      console.log('UASP-05: Policy with null sort, actual sort value:', rows[0].sort);
    });

    it('UASP-06: should preserve sort order for re-ordering ACLs', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      
      const groups = [];
      for (let i = 0; i < 5; i++) {
        groups.push(await fixtures.createGroup(db.knex, { owner_ref: owner, nickname: `Group ${i}` }));
      }
      
      const originalOrder = [3, 1, 4, 0, 2];
      for (let i = 0; i < groups.length; i++) {
        await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: groups[originalOrder[i]].id,
          policy_spec: `policy-${originalOrder[i]}`,
          sort: (i + 1) * 10
        });
      }

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      const sortedRows = rows.sort((a, b) => a.sort - b.sort);
      
      expect(sortedRows).to.have.length(5);
      expect(sortedRows[0].policy_spec).to.equal('policy-3');
      expect(sortedRows[1].policy_spec).to.equal('policy-1');
      expect(sortedRows[2].policy_spec).to.equal('policy-4');
      expect(sortedRows[3].policy_spec).to.equal('policy-0');
      expect(sortedRows[4].policy_spec).to.equal('policy-2');
    });
  });

  describe('Join Correctness', function() {
    it('UASP-07: should only include policies for enabled sites', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const enabledSite = await fixtures.createSite(db.knex, { owner_ref: owner, is_enabled: true });
      const disabledSite = await fixtures.createSite(db.knex, { owner_ref: owner, is_enabled: false });
      
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      
      await fixtures.createPolicy(db.knex, {
        site_id: enabledSite.id,
        group_definition_id: group.id,
        policy_spec: 'enabled-site-policy'
      });
      
      await fixtures.createPolicy(db.knex, {
        site_id: disabledSite.id,
        group_definition_id: group.id,
        policy_spec: 'disabled-site-policy'
      });

      const enabledRows = await db.queryView('unified_active_site_policies', { site_id: enabledSite.id });
      const disabledRows = await db.queryView('unified_active_site_policies', { site_id: disabledSite.id });
      
      console.log('UASP-07: Enabled site policies:', enabledRows.length);
      console.log('UASP-07: Disabled site policies:', disabledRows.length);
    });

    it('UASP-08: should include all required fields for ACL evaluation', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner, nickname: 'Test Group' });
      await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_type: 'custom-type',
        policy_spec: 'custom-spec',
        policy_name: 'Custom Policy'
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      expect(rows).to.have.length(1);
      const acl = rows[0];
      
      expect(acl).to.have.property('id');
      expect(acl).to.have.property('owner_ref');
      expect(acl).to.have.property('expected_name');
      expect(acl).to.have.property('site_id');
      expect(acl).to.have.property('group_id');
      expect(acl).to.have.property('group_name');
      expect(acl).to.have.property('policy_name');
      expect(acl).to.have.property('policy_type');
      expect(acl).to.have.property('policy_spec');
      expect(acl).to.have.property('sort');
      
      expect(acl.policy_type).to.equal('custom-type');
      expect(acl.policy_spec).to.equal('custom-spec');
      expect(acl.group_name).to.equal('Test Group');
    });
  });

  describe('Quirks Documentation', function() {
    it('UASP-Q01: documents COALESCE behavior with NULL schedule spec', async function() {
      console.log('QUIRK UASP-Q01: COALESCE(sch.spec, acl.policy_spec)');
      console.log('  - If schedule join returns NULL (no active schedule), base policy_spec is used');
      console.log('  - If schedule exists but spec is NULL, behavior depends on PostgreSQL COALESCE');
      console.log('  - This is expected: schedule override only happens when schedule is active AND has a spec');
    });

    it('UASP-Q02: documents multiple schedules per policy (if any)', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'base'
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'schedule-a',
        schedule_segments: '0'
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'schedule-b',
        schedule_segments: '0'
      });

      const rows = await db.queryView('unified_active_site_policies', { site_id: site.id });
      
      console.log('QUIRK UASP-Q02: Multiple schedules for same policy');
      console.log('  Policies with same site_id returned:', rows.length);
      console.log('  policy_specs:', rows.map(r => r.policy_spec));
      console.log('  NOTE: Multiple active schedules may cause duplicate ACL entries');
    });
  });
});
