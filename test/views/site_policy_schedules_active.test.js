'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('View: site_policy_schedules_active', function() {
  this.timeout(30000);

  before(async function() {
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  function getCurrentWeekSecondsUTC() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    return (dayOfWeek * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }

  async function getDbWeekSeconds() {
    const result = await db.rawQuery(`
      SELECT EXTRACT(EPOCH FROM 
        now() - (date_trunc('week', now() + interval '1 day') - interval '1 day')
      )::integer as week_seconds
    `);
    return result[0]?.week_seconds || 0;
  }

  describe('Time Window Filtering', function() {
    it('SPVA-01: should return segment containing current DB time', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, { owner_ref: owner });
      const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
      const policy = await fixtures.createPolicy(db.knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_spec: 'deny'
      });
      
      const dbSeconds = await getDbWeekSeconds();
      
      const segmentBefore = Math.max(0, dbSeconds - 1000);
      const segmentAfter = Math.min(604799, dbSeconds + 1000);
      
      const fillPattern = 'spec-a,spec-b,spec-c';
      const segmentBoundaries = [0, segmentBefore, segmentAfter];
      
      await fixtures.createSchedule(db.knex, {
        policy_id: policy.id,
        fill_pattern: fillPattern,
        schedule_segments: segmentBoundaries.join(',')
      });

      const fills = fillPattern.split(',');
      let expectedSpec = null;
      for (let i = 0; i < segmentBoundaries.length; i++) {
        const start = segmentBoundaries[i];
        const end = i + 1 < segmentBoundaries.length ? segmentBoundaries[i + 1] : 604801;
        if (start <= dbSeconds && dbSeconds < end) {
          expectedSpec = fills[i % fills.length];
          break;
        }
      }

      const activeRows = await db.queryView('site_policy_schedules_active', { policy_id: policy.id });
      
      console.log('SPVA-01: DB time (week seconds):', dbSeconds);
      console.log('SPVA-01: Segment boundaries:', segmentBoundaries);
      console.log('SPVA-01: Expected spec from fixture:', expectedSpec);
      console.log('SPVA-01: Active filter returns:', activeRows.length, 'rows');
      if (activeRows.length > 0) {
        console.log('SPVA-01: Actual spec returned:', activeRows[0].spec);
      }
      
      expect(activeRows).to.have.length(1);
      expect(activeRows[0].spec).to.equal(expectedSpec);
      expect(Number(activeRows[0].start)).to.be.at.most(dbSeconds);
      expect(Number(activeRows[0].end)).to.be.greaterThan(dbSeconds);
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
    it('SPVA-Q01: documents timezone and week anchor handling', async function() {
      const jsSeconds = getCurrentWeekSecondsUTC();
      const dbSeconds = await getDbWeekSeconds();
      
      const simpleCalc = await db.rawQuery(`
        SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - date_trunc('week', CURRENT_TIMESTAMP)))::integer as simple
      `);
      
      console.log('QUIRK SPVA-Q01: Week anchor handling');
      console.log('  JS week seconds (UTC, Sunday-based):', jsSeconds);
      console.log('  View week seconds (Sunday anchor):', dbSeconds);
      console.log('  PostgreSQL date_trunc (Monday anchor):', simpleCalc[0].simple);
      console.log('  NOTE: View uses custom Sunday-based week anchor:');
      console.log('    date_trunc(week, now() + 1 day) - 1 day');
      console.log('  This shifts the week start from Monday to Sunday.');
    });
  });
});
