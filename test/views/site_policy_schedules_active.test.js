'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('View: site_policy_schedules_active', function() {
  this.timeout(30000);

  before(async function() {
    await db.migrate();
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  function getCurrentWeekSeconds() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    return (dayOfWeek * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }

  describe('Time Window Filtering', function() {
    it('SPVA-01: should return only segments where current time is within window', async function() {
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
        fill_pattern: 'deny,allow,deny',
        schedule_segments: '0,1,604799'
      });

      const allRows = await db.queryView('site_policy_schedules', { policy_id: policy.id });
      const activeRows = await db.queryView('site_policy_schedules_active', { policy_id: policy.id });
      
      console.log('SPVA-01: Full schedule has', allRows.length, 'segments');
      console.log('SPVA-01: Active filter returns', activeRows.length, 'segments');
      
      expect(activeRows.length).to.be.at.most(allRows.length);
      
      const currentSeconds = getCurrentWeekSeconds();
      activeRows.forEach(row => {
        expect(Number(row.start)).to.be.at.most(currentSeconds);
        expect(Number(row.end)).to.be.greaterThan(currentSeconds);
      });
    });

    it('SPVA-02: should return the spec for the current time window', async function() {
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
        fill_pattern: 'always-active',
        schedule_segments: '0'
      });

      const activeRows = await db.queryView('site_policy_schedules_active', { policy_id: policy.id });
      
      expect(activeRows.length).to.be.greaterThan(0);
      expect(activeRows[0].spec).to.equal('always-active');
    });

    it('SPVA-03: should handle schedule spanning entire week', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id
      });
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: 'week-long-allow',
        schedule_segments: '0'
      });

      const activeRows = await db.queryView('site_policy_schedules_active', { policy_id: policy.id });
      
      expect(activeRows).to.have.length(1);
      expect(activeRows[0].spec).to.equal('week-long-allow');
    });
  });

  describe('Edge Cases', function() {
    it('SPVA-04: policies without schedules should not appear in active view', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'allow'
      });

      const activeRows = await db.queryView('site_policy_schedules_active', { policy_id: policy.id });
      
      expect(activeRows).to.have.length(0);
    });
  });

  describe('Quirks Documentation', function() {
    it('SPVA-Q01: documents timezone handling (uses database server time)', async function() {
      const currentSeconds = getCurrentWeekSeconds();
      
      const dbTime = await db.rawQuery(`
        SELECT EXTRACT(EPOCH FROM (
          CURRENT_TIMESTAMP - date_trunc('week', CURRENT_TIMESTAMP)
        ))::integer as week_seconds
      `);
      
      console.log('QUIRK SPVA-Q01: Timezone handling');
      console.log('  JS calculated week seconds (UTC):', currentSeconds);
      console.log('  DB calculated week seconds:', dbTime[0]?.week_seconds);
      console.log('  NOTE: Active schedule filtering uses DB server time, not client time');
    });
  });
});
