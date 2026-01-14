'use strict';

const chai = require('chai');
const expect = chai.expect;
const db = require('../../setup/database');
const fixtures = require('../../setup/fixtures');

const knexConfig = require('../../../knexfile');
const env = require('../../../env')();

const lookup = require('../../../lib/policies');

describe('Unit: find_expected_name handler', function() {
  this.timeout(30000);
  
  let knex;
  let policies;
  let persist;
  
  before(async function() {
    knex = db.knex;
    await db.migrate();
    
    const storage = require('../../../lib/storage');
    persist = storage(knex);
    policies = lookup(env, null, persist);
  });
  
  beforeEach(async function() {
    await db.truncateAllData();
  });
  
  after(async function() {
    await db.destroy();
  });
  
  function createMockReq(expectedName) {
    return {
      params: {
        expected_name: expectedName
      },
      site: null
    };
  }
  
  function createMockRes() {
    return {
      locals: {}
    };
  }

  describe('SL-01: Valid site lookup', function() {
    it('should populate req.site with site record when expected_name exists', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'testsite',
        is_enabled: true,
        require_identities: false
      });
      
      const req = createMockReq('testsite');
      const res = createMockRes();
      
      await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(err) {
          if (err && !Array.isArray(err)) {
            return reject(err);
          }
          resolve(err);
        });
      });
      
      expect(req.site).to.exist;
      expect(req.site.expected_name).to.equal('testsite');
      expect(req.site.id).to.equal(site.id);
      expect(req.site.is_enabled).to.equal(true);
    });
  });

  describe('SL-02: Unknown site', function() {
    it('should call next with empty array when expected_name not found', async function() {
      const req = createMockReq('nonexistent-site');
      const res = createMockRes();
      
      const nextArg = await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(rows) {
          resolve(rows);
        });
      });
      
      expect(nextArg).to.be.an('array');
      expect(nextArg).to.have.length(0);
      expect(req.site).to.be.null;
    });
  });

  describe('SL-03: BYOD site with authenticity record', function() {
    it('should include confirmed_upstream, status, acceptable fields from authenticity record', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'byod-good',
        upstream_origin: 'https://user-ns.example.com',
        is_enabled: true
      });
      
      await fixtures.createAuthenticityRecord(knex, {
        owner_ref: site.owner_ref,
        expected_name: 'byod-good',
        upstream_origin: 'https://user-ns.example.com',
        status: 'ok',
        acceptable: true
      });
      
      const req = createMockReq('byod-good');
      const res = createMockRes();
      
      await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(err) {
          if (err && !Array.isArray(err)) {
            return reject(err);
          }
          resolve(err);
        });
      });
      
      expect(req.site).to.exist;
      expect(req.site.expected_name).to.equal('byod-good');
      expect(req.site.confirmed_upstream).to.equal('https://user-ns.example.com');
      expect(req.site.status).to.equal('ok');
      expect(req.site.acceptable).to.equal(true);
    });

    it('should include acceptable: false when authenticity check failed', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'byod-bad',
        upstream_origin: 'https://fake-ns.example.com',
        is_enabled: true
      });
      
      await fixtures.createAuthenticityRecord(knex, {
        owner_ref: site.owner_ref,
        expected_name: 'byod-bad',
        upstream_origin: 'https://fake-ns.example.com',
        status: 'failed',
        acceptable: false
      });
      
      const req = createMockReq('byod-bad');
      const res = createMockRes();
      
      await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(err) {
          if (err && !Array.isArray(err)) {
            return reject(err);
          }
          resolve(err);
        });
      });
      
      expect(req.site).to.exist;
      expect(req.site.expected_name).to.equal('byod-bad');
      expect(req.site.acceptable).to.equal(false);
    });
  });

  describe('SL-04: BYOD site without authenticity check', function() {
    it('should have null acceptable when no authenticity record exists', async function() {
      await fixtures.createSite(knex, {
        expected_name: 'byod-unchecked',
        upstream_origin: 'https://unchecked-ns.example.com',
        is_enabled: true
      });
      
      const req = createMockReq('byod-unchecked');
      const res = createMockRes();
      
      await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(err) {
          if (err && !Array.isArray(err)) {
            return reject(err);
          }
          resolve(err);
        });
      });
      
      expect(req.site).to.exist;
      expect(req.site.expected_name).to.equal('byod-unchecked');
      expect(req.site.acceptable).to.be.null;
      expect(req.site.confirmed_upstream).to.be.null;
      expect(req.site.status).to.be.null;
    });
  });

  describe('SL-05: Multiple sites (data integrity issue)', function() {
    it('should call next with rows array when multiple rows returned', async function() {
      const site1 = await fixtures.createSite(knex, {
        expected_name: 'duplicate-site',
        is_enabled: true
      });
      
      await knex.raw(`
        INSERT INTO registered_sites (id, owner_ref, expected_name, upstream_origin, is_enabled, require_identities, exempt_matching_api_secret)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        fixtures.generateId(),
        'owner-2',
        'duplicate-site',
        'https://ns2.example.com',
        true,
        false,
        false
      ]);
      
      const req = createMockReq('duplicate-site');
      const res = createMockRes();
      
      const nextArg = await new Promise((resolve, reject) => {
        policies.handlers.find_expected_name(req, res, function(rows) {
          resolve(rows);
        });
      });
      
      expect(nextArg).to.be.an('array');
      expect(nextArg).to.have.length(2);
      expect(req.site).to.be.null;
    });
  });
});
