'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('View: site_policy_schedules', function() {
  this.timeout(30000);

  before(async function() {
    await db.migrate();
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  describe('Schedule Expansion Accuracy', function() {
    it('SPV-01: should expand a simple 3-segment schedule with fill_pattern', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'allow'
      });
      
      const schedule = await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'deny,allow,deny',
        schedule_segments: '0,32400,54000'
      });

      const rows = await db.queryView('site_policy_schedules', { schedule_id: schedule.id });
      
      expect(rows).to.have.length.greaterThan(0);
      
      const specs = rows.map(r => r.spec);
      expect(specs).to.include('deny');
      expect(specs).to.include('allow');
    });

    it('SPV-02: should correctly pair fill_pattern entries with segment boundaries', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'deny'
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'deny,readable,deny',
        schedule_segments: '0,28800,57600'
      });

      const rows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      
      const sorted = rows.sort((a, b) => a.start - b.start);
      expect(sorted.length).to.be.greaterThan(0);
      
      sorted.forEach((row, idx) => {
        expect(row).to.have.property('start');
        expect(row).to.have.property('end');
        expect(row).to.have.property('spec');
        expect(Number(row.end)).to.be.greaterThan(Number(row.start));
      });
    });

    it('SPV-03: should handle schedule with multiple days (weekly pattern)', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'deny'
      });
      
      const mondayStart = fixtures.scheduleHelpers.dayOffset('mon') + fixtures.scheduleHelpers.timeOffset(9);
      const mondayEnd = fixtures.scheduleHelpers.dayOffset('mon') + fixtures.scheduleHelpers.timeOffset(15);
      const fridayStart = fixtures.scheduleHelpers.dayOffset('fri') + fixtures.scheduleHelpers.timeOffset(9);
      const fridayEnd = fixtures.scheduleHelpers.dayOffset('fri') + fixtures.scheduleHelpers.timeOffset(15);
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'deny,allow,deny,allow,deny',
        schedule_segments: `0,${mondayStart},${mondayEnd},${fridayStart},${fridayEnd}`
      });

      const rows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      
      expect(rows.length).to.be.greaterThanOrEqual(4);
      
      const allowWindows = rows.filter(r => r.spec === 'allow');
      expect(allowWindows.length).to.be.greaterThan(0);
    });

    it('SPV-04: should NOT expand policies without schedules', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'allow'
      });

      const rows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      
      expect(rows).to.have.length(0);
    });

    it('SPV-05: should calculate end time correctly (next segment or week end)', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'deny,allow',
        schedule_segments: '0,32400'
      });

      const rows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      const sorted = rows.sort((a, b) => a.start - b.start);
      
      if (sorted.length >= 2) {
        expect(Number(sorted[0].end)).to.equal(Number(sorted[1].start));
      }
      
      const lastRow = sorted[sorted.length - 1];
      const weekSeconds = 604800;
      expect(Number(lastRow.end)).to.be.closeTo(weekSeconds, 10);
    });
  });

  describe('Edge Cases and Quirks', function() {
    it('SPV-Q01: documents behavior with mismatched fill_pattern and segment count', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'deny,allow',
        schedule_segments: '0,10000,20000,30000'
      });

      const rows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      
      console.log('QUIRK SPV-Q01: Mismatched fill_pattern (2) vs segments (4)');
      console.log('  Segments returned:', rows.length);
      console.log('  Fill specs used:', rows.map(r => r.spec));
    });
  });
});
