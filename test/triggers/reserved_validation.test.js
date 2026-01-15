'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('Trigger: Reserved Name/Upstream Validation', function() {
  this.timeout(30000);

  before(async function() {
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.knex('reserved_expected_names').del();
    await db.truncateAllData();
  });

  describe('check_site_reserved_name (INSERT)', function() {
    it('TRG-RN-01: should allow site with non-reserved name', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'my-valid-site-name'
      });

      expect(site).to.exist;
      expect(site.expected_name).to.equal('my-valid-site-name');
    });

    it('TRG-RN-02: should block site with exact reserved name', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'admin',
        reason: 'System reserved',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      
      let error = null;
      try {
        await fixtures.createSite(db.knex, {
          owner_ref: owner,
          expected_name: 'admin'
        });
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.include('reserved name');
    });

    it('TRG-RN-03: should block site matching reserved name pattern', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'api%',
        reason: 'API namespace reserved',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      
      let error = null;
      try {
        await fixtures.createSite(db.knex, {
          owner_ref: owner,
          expected_name: 'api-v1-endpoint'
        });
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.include('reserved name');
    });

    it('TRG-RN-04: should allow name that is similar but not matching pattern', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'system%',
        reason: 'System namespace',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'my-system-site'
      });

      expect(site).to.exist;
    });
  });

  describe('check_site_reserved_name (UPDATE)', function() {
    it('TRG-RN-05: should block UPDATE that changes name to reserved name', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'restricted',
        reason: 'Reserved',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'original-valid-name'
      });

      let error = null;
      try {
        await db.knex('registered_sites')
          .where({ id: site.id })
          .update({ expected_name: 'restricted' });
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.include('reserved name');
    });

    it('TRG-RN-06: should allow UPDATE when name stays the same', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'blocked',
        reason: 'Reserved',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'my-valid-name'
      });

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ nickname: 'Updated Nickname' });

      const updatedSite = await db.knex('registered_sites').where({ id: site.id }).first();
      expect(updatedSite.nickname).to.equal('Updated Nickname');
    });

    it('TRG-RN-07: should allow UPDATE to a different non-reserved name', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'forbidden',
        reason: 'Reserved',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'original-name'
      });

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ expected_name: 'new-valid-name' });

      const updatedSite = await db.knex('registered_sites').where({ id: site.id }).first();
      expect(updatedSite.expected_name).to.equal('new-valid-name');
    });
  });

  describe('hash_id_reservation (auto-ID generation)', function() {
    it('TRG-RN-08: should auto-generate ID for reserved_expected_names on INSERT', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: 'auto-id-test',
        reason: 'Testing auto ID',
        source: 'test'
      });

      const row = await db.knex('reserved_expected_names')
        .where({ reserved_name: 'auto-id-test' })
        .first();

      expect(row.id).to.exist;
      expect(row.id).to.have.length(40);
    });

    it('TRG-RN-09: should not override explicitly provided ID', async function() {
      const explicitId = 'my-explicit-id-12345';
      
      await db.knex('reserved_expected_names').insert({
        id: explicitId,
        reserved_name: 'explicit-id-test',
        reason: 'Testing explicit ID',
        source: 'test'
      });

      const row = await db.knex('reserved_expected_names')
        .where({ reserved_name: 'explicit-id-test' })
        .first();

      expect(row.id).to.equal(explicitId);
    });
  });

  describe('Reserved name pattern matching', function() {
    it('TRG-RN-10: should support SQL SIMILAR TO patterns', async function() {
      await db.knex('reserved_expected_names').insert({
        reserved_name: '(www|cdn|api)%',
        reason: 'Infrastructure prefixes',
        source: 'test'
      });

      const owner = 'owner-' + fixtures.generateId();
      
      const testCases = [
        { name: 'www-mysite', shouldFail: true },
        { name: 'cdn-assets', shouldFail: true },
        { name: 'api-gateway', shouldFail: true },
        { name: 'mywww-site', shouldFail: false },
        { name: 'regular-site', shouldFail: false }
      ];

      for (const tc of testCases) {
        let error = null;
        try {
          await fixtures.createSite(db.knex, {
            owner_ref: owner,
            expected_name: tc.name
          });
        } catch (e) {
          error = e;
        }

        if (tc.shouldFail) {
          expect(error, `Expected "${tc.name}" to be blocked`).to.exist;
        } else {
          expect(error, `Expected "${tc.name}" to be allowed`).to.be.null;
        }

        await db.knex('registered_sites').where({ expected_name: tc.name }).del();
      }
    });
  });

  describe('Edge cases', function() {
    it('TRG-RN-11: should handle empty reserved names table', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        expected_name: 'any-name-works'
      });

      expect(site).to.exist;
    });

    it('TRG-RN-12: should handle multiple reserved patterns (any match blocks)', async function() {
      await db.knex('reserved_expected_names').insert([
        { reserved_name: 'admin%', reason: 'Admin reserved', source: 'test' },
        { reserved_name: '%internal%', reason: 'Internal reserved', source: 'test' },
        { reserved_name: 'root', reason: 'Root reserved', source: 'test' }
      ]);

      const owner = 'owner-' + fixtures.generateId();

      let adminError = null;
      try {
        await fixtures.createSite(db.knex, { owner_ref: owner, expected_name: 'admin-panel' });
      } catch (e) { adminError = e; }

      let internalError = null;
      try {
        await fixtures.createSite(db.knex, { owner_ref: owner, expected_name: 'my-internal-site' });
      } catch (e) { internalError = e; }

      let rootError = null;
      try {
        await fixtures.createSite(db.knex, { owner_ref: owner, expected_name: 'root' });
      } catch (e) { rootError = e; }

      expect(adminError).to.exist;
      expect(internalError).to.exist;
      expect(rootError).to.exist;
    });
  });
});
