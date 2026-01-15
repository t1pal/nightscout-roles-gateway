'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../../setup/database');
const fixtures = require('../../setup/fixtures');

describe('Unit: ACL Lookup Handlers (ACL-01 to ACL-04)', function() {
  this.timeout(30000);

  let env;
  let entities;
  let policies;
  let mockServer;

  before(async function() {
    await db.truncateAllData();
    
    env = require('../../../env');
    
    mockServer = {
      store: db.knex
    };
    
    entities = require('../../../lib/entities')(env, mockServer);
    policies = require('../../../lib/policies')(env, mockServer, entities);
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  function createMockReq(overrides = {}) {
    return {
      params: overrides.params || {},
      user: overrides.user || { id: 'test-user' },
      header: function(name) {
        const headers = overrides.headers || {};
        return headers[name] || headers[name.toLowerCase()];
      },
      site: overrides.site || {},
      ...overrides
    };
  }

  function createMockRes(overrides = {}) {
    return {
      locals: overrides.locals || {},
      status: function(code) { this.statusCode = code; return this; },
      statusCode: 200,
      ...overrides
    };
  }

  describe('get_acls handler (header-based lookup)', function() {
    
    describe('ACL-01: User has policy, no schedule', function() {
      it('should populate res.locals.acl with base policy_spec when x-policy-id header is set', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl01-site',
          require_identities: true
        });
        const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
        const policy = await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: group.id,
          policy_spec: 'allow',
          policy_type: 'default'
        });

        const req = createMockReq({
          headers: { 'x-policy-id': policy.id },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        let nextError = null;
        
        await new Promise((resolve, reject) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            nextError = err;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(nextError).to.be.undefined;
        expect(res.locals.acl).to.not.be.null;
        expect(res.locals.acl.policy_spec).to.equal('allow');
        expect(res.locals.acl.id).to.equal(policy.id);
      });
    });

    describe('ACL-02: User has policy with active schedule', function() {
      it('should populate res.locals.acl with overridden policy_spec from active schedule', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl02-site',
          require_identities: true
        });
        const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
        const policy = await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: group.id,
          policy_spec: 'base-deny',
          policy_type: 'default'
        });

        await fixtures.createSchedule(db.knex, {
          policy_id: policy.id,
          fill_pattern: 'scheduled-allow',
          schedule_segments: '0'
        });

        const req = createMockReq({
          headers: { 'x-policy-id': policy.id },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.not.be.null;
        expect(res.locals.acl.policy_spec).to.equal('scheduled-allow');
      });
    });

    describe('ACL-03: User has no matching policy (invalid x-policy-id)', function() {
      it('should set res.locals.acl to undefined when policy ID does not exist (ACL-03-Q01: undefined vs null quirk)', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl03-site',
          require_identities: true
        });

        const req = createMockReq({
          headers: { 'x-policy-id': 'nonexistent-policy-id-12345' },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.be.undefined;
      });
    });

    describe('ACL-04: Empty policy ID header', function() {
      it('should set res.locals.acl to null when x-policy-id is empty', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl04-site',
          require_identities: true
        });

        const req = createMockReq({
          headers: { 'x-policy-id': '' },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.be.null;
      });

      it('should set res.locals.acl to null when x-policy-id header is missing', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl04b-site',
          require_identities: true
        });

        const req = createMockReq({
          headers: {},
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.be.null;
      });

      it('should continue to next handler when policy ID is empty (allows anonymous access check)', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl04c-site',
          require_identities: false
        });

        const req = createMockReq({
          headers: {},
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        let nextError = null;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            nextError = err;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(nextError).to.be.undefined;
      });
    });

    describe('ACL Edge Cases', function() {
      it('should handle null policy ID in header', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl-null-site'
        });

        const req = createMockReq({
          headers: { 'x-policy-id': null },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.be.null;
      });

      it('should populate req.acl alongside res.locals.acl for backward compatibility', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'acl-compat-site',
          require_identities: true
        });
        const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
        const policy = await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: group.id,
          policy_spec: 'allow',
          policy_type: 'default'
        });

        const req = createMockReq({
          headers: { 'x-policy-id': policy.id },
          site: site
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        await new Promise((resolve) => {
          policies.handlers.get_acls(req, res, function(err) {
            resolve();
          });
        });

        expect(req.acl).to.not.be.undefined;
        expect(req.acl).to.deep.equal(res.locals.acl);
      });
    });
  });

  describe('get_acl_by_identity_param handler (subject + expected_name lookup)', function() {
    
    describe('ACL lookup via joined_groups join', function() {
      it('should find ACL when subject has joined group for the site', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const testSubject = 'test-subject-' + fixtures.generateId();
        
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'identity-acl-site',
          require_identities: true
        });
        const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
        const spec = await fixtures.createInclusionSpec(db.knex, {
          group_definition_id: group.id,
          identity_type: 'email',
          identity_spec: 'test@example.com'
        });
        const policy = await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: group.id,
          policy_spec: 'allow',
          policy_type: 'default'
        });
        await fixtures.createJoinedGroup(db.knex, {
          subject: testSubject,
          expected_name: site.expected_name,
          group_id: group.id,
          group_spec_id: spec.id,
          policy_id: policy.id
        });

        const req = createMockReq({
          params: { 
            subject: testSubject,
            expected_name: site.expected_name 
          },
          headers: {},
          site: site,
          user: { id: testSubject }
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acl_by_identity_param(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.not.be.null;
        expect(res.locals.acl.policy_spec).to.equal('allow');
      });

      it('should return undefined ACL when subject has no joined groups for site (ACL-03-Q01: undefined vs null quirk)', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const unknownSubject = 'unknown-subject-' + fixtures.generateId();
        
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'no-consent-site',
          require_identities: true
        });

        const req = createMockReq({
          params: { 
            subject: unknownSubject,
            expected_name: site.expected_name 
          },
          headers: {},
          site: site,
          user: { id: unknownSubject }
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        let nextCalled = false;
        
        await new Promise((resolve) => {
          policies.handlers.get_acl_by_identity_param(req, res, function(err) {
            nextCalled = true;
            resolve();
          });
        });

        expect(nextCalled).to.be.true;
        expect(res.locals.acl).to.be.undefined;
      });

      it('should apply schedule override when looking up by identity', async function() {
        const owner = 'owner-' + fixtures.generateId();
        const testSubject = 'schedule-subject-' + fixtures.generateId();
        
        const site = await fixtures.createSite(db.knex, { 
          owner_ref: owner,
          expected_name: 'schedule-identity-site',
          require_identities: true
        });
        const group = await fixtures.createGroup(db.knex, { owner_ref: owner });
        const spec = await fixtures.createInclusionSpec(db.knex, {
          group_definition_id: group.id,
          identity_type: 'email',
          identity_spec: 'scheduled@example.com'
        });
        const policy = await fixtures.createPolicy(db.knex, {
          site_id: site.id,
          group_definition_id: group.id,
          policy_spec: 'base-deny',
          policy_type: 'default'
        });
        
        await fixtures.createSchedule(db.knex, {
          policy_id: policy.id,
          fill_pattern: 'override-allow',
          schedule_segments: '0'
        });
        
        await fixtures.createJoinedGroup(db.knex, {
          subject: testSubject,
          expected_name: site.expected_name,
          group_id: group.id,
          group_spec_id: spec.id,
          policy_id: policy.id
        });

        const req = createMockReq({
          params: { 
            subject: testSubject,
            expected_name: site.expected_name 
          },
          headers: {},
          site: site,
          user: { id: testSubject }
        });
        const res = createMockRes({ locals: { policy: { site: site } } });
        
        await new Promise((resolve) => {
          policies.handlers.get_acl_by_identity_param(req, res, function(err) {
            resolve();
          });
        });

        expect(res.locals.acl).to.not.be.null;
        expect(res.locals.acl.policy_spec).to.equal('override-allow');
      });
    });
  });
});
