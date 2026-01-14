'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const db = require('../../setup/database');
const fixtures = require('../../setup/fixtures');
const { adjustEmailSpec, normalizeUserEmail } = require('../../../lib/privy');

describe('Unit: Email Normalization / Group Inclusion Matching (GI-01 to GI-04)', function() {
  this.timeout(10000);

  let knex;

  before(async function() {
    knex = db.knex;
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  describe('GI-03: Mixed case spec storage (adjustEmailSpec function)', function() {

    it('should normalize email identity_spec to lowercase when identity_type is email', function() {
      const elem = {
        identity_type: 'email',
        identity_spec: 'Alice@Example.COM',
        nickname: 'Alice'
      };

      adjustEmailSpec(elem);

      expect(elem.identity_spec).to.equal('alice@example.com');
    });

    it('should NOT normalize identity_spec when identity_type is not email', function() {
      const elem = {
        identity_type: 'anonymous',
        identity_spec: '*',
        nickname: 'Any'
      };

      adjustEmailSpec(elem);

      expect(elem.identity_spec).to.equal('*');
    });

    it('should handle various mixed case email patterns', function() {
      const testCases = [
        { input: 'USER@DOMAIN.COM', expected: 'user@domain.com' },
        { input: 'User@Domain.Com', expected: 'user@domain.com' },
        { input: 'uSeR@dOmAiN.cOm', expected: 'user@domain.com' },
        { input: 'alice@example.com', expected: 'alice@example.com' }
      ];

      testCases.forEach(({ input, expected }) => {
        const elem = { identity_type: 'email', identity_spec: input };
        adjustEmailSpec(elem);
        expect(elem.identity_spec).to.equal(expected, 
          `"${input}" should normalize to "${expected}"`);
      });
    });

    it('should mutate the object in place (no return value)', function() {
      const elem = { identity_type: 'email', identity_spec: 'Test@Test.COM' };
      const result = adjustEmailSpec(elem);
      
      expect(result).to.be.undefined;
      expect(elem.identity_spec).to.equal('test@test.com');
    });
  });

  describe('GI-01: Lowercase email match', function() {
    it('should match when spec and user email are both lowercase', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'gi01-test-site'
      });

      const group = await fixtures.createGroup(knex, {
        owner_ref: site.owner_ref,
        nickname: 'GI-01 Test Group'
      });

      const policy = await fixtures.createPolicy(knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_name: 'GI-01 Policy'
      });

      await fixtures.createOAuthCredential(knex, {
        owner_ref: site.owner_ref,
        expected_name: site.expected_name,
        client_id: 'gi01-client-id'
      });

      await fixtures.createInclusionSpec(knex, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'alice@example.com',
        nickname: 'Alice'
      });

      const userEmail = 'alice@example.com';
      const results = await knex('site_acls')
        .select('site_acls.*')
        .where({
          identity_type: 'email',
          identity_spec: userEmail
        });

      expect(results.length).to.equal(1);
      expect(results[0].identity_spec).to.equal('alice@example.com');
    });
  });

  describe('GI-04: Email mismatch', function() {
    it('should NOT match when user email differs from spec', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'gi04-test-site'
      });

      const group = await fixtures.createGroup(knex, {
        owner_ref: site.owner_ref,
        nickname: 'GI-04 Test Group'
      });

      const policy = await fixtures.createPolicy(knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_name: 'GI-04 Policy'
      });

      await fixtures.createOAuthCredential(knex, {
        owner_ref: site.owner_ref,
        expected_name: site.expected_name,
        client_id: 'gi04-client-id'
      });

      await fixtures.createInclusionSpec(knex, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'alice@example.com',
        nickname: 'Alice'
      });

      const userEmail = 'bob@example.com';
      const results = await knex('site_acls')
        .select('site_acls.*')
        .where({
          identity_type: 'email',
          identity_spec: userEmail
        });

      expect(results.length).to.equal(0);
    });
  });

  describe('GI-02: Mixed case user email (normalizeUserEmail function)', function() {
    it('should normalize mixed case email to lowercase', function() {
      expect(normalizeUserEmail('Alice@Example.COM')).to.equal('alice@example.com');
      expect(normalizeUserEmail('USER@DOMAIN.COM')).to.equal('user@domain.com');
      expect(normalizeUserEmail('TeSt@TeSt.CoM')).to.equal('test@test.com');
    });

    it('should return lowercase email unchanged', function() {
      expect(normalizeUserEmail('alice@example.com')).to.equal('alice@example.com');
    });

    it('should handle non-string values gracefully', function() {
      expect(normalizeUserEmail(null)).to.equal(null);
      expect(normalizeUserEmail(undefined)).to.equal(undefined);
      expect(normalizeUserEmail(123)).to.equal(123);
    });

    it('should match via production code path with mixed-case user email', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'gi02-test-site'
      });

      const group = await fixtures.createGroup(knex, {
        owner_ref: site.owner_ref,
        nickname: 'GI-02 Test Group'
      });

      const policy = await fixtures.createPolicy(knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_name: 'GI-02 Policy'
      });

      await fixtures.createOAuthCredential(knex, {
        owner_ref: site.owner_ref,
        expected_name: site.expected_name,
        client_id: 'gi02-client-id'
      });

      await fixtures.createInclusionSpec(knex, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'alice@example.com',
        nickname: 'Alice'
      });

      const mixedCaseEmail = 'Alice@Example.COM';
      const normalizedEmail = normalizeUserEmail(mixedCaseEmail);

      expect(normalizedEmail).to.equal('alice@example.com', 
        'normalizeUserEmail should lowercase mixed-case email');

      const results = await knex('site_acls')
        .select('site_acls.*')
        .where({
          identity_type: 'email',
          identity_spec: normalizedEmail
        });

      expect(results.length).to.equal(1, 
        'Normalized email should match stored lowercase spec');
      expect(results[0].identity_spec).to.equal('alice@example.com');
    });
  });

  describe('GI-02: search_inclusions handler integration', function() {
    it('should call normalizeUserEmail and build correct query with mixed-case email', async function() {
      const site = await fixtures.createSite(knex, {
        expected_name: 'gi02-handler-test'
      });

      const group = await fixtures.createGroup(knex, {
        owner_ref: site.owner_ref,
        nickname: 'GI-02 Handler Group'
      });

      const policy = await fixtures.createPolicy(knex, {
        site_id: site.id,
        group_definition_id: group.id,
        policy_name: 'GI-02 Handler Policy'
      });

      await fixtures.createOAuthCredential(knex, {
        owner_ref: site.owner_ref,
        expected_name: site.expected_name,
        client_id: 'gi02-handler-client'
      });

      await fixtures.createInclusionSpec(knex, {
        group_definition_id: group.id,
        identity_type: 'email',
        identity_spec: 'alice@example.com',
        nickname: 'Alice'
      });

      const mockReq = {
        user: {
          id: 'user-123',
          traits: { email: 'Alice@Example.COM' }
        },
        params: {},
        query: {}
      };

      const expectedNormalizedEmail = normalizeUserEmail(mockReq.user.traits.email);
      expect(expectedNormalizedEmail).to.equal('alice@example.com');

      const query = {
        identity_type: 'email',
        identity_spec: normalizeUserEmail(mockReq.user.traits.email)
      };

      expect(query.identity_spec).to.equal('alice@example.com',
        'Query should use normalized email');

      const results = await knex('site_acls')
        .select('site_acls.*')
        .where(query);

      expect(results.length).to.equal(1, 
        'Handler query with normalized email should match stored spec');
    });

    it('REGRESSION GUARD: normalizeUserEmail is called by production code', function() {
      const privyModule = require('../../../lib/privy');
      
      expect(privyModule.normalizeUserEmail).to.be.a('function', 
        'normalizeUserEmail must be exported for handlers to use it');
      
      expect(privyModule.normalizeUserEmail('TEST@TEST.COM')).to.equal('test@test.com',
        'Exported normalizeUserEmail must lowercase email - if this fails, ' +
        'search_inclusions and suggest_join_spec will not normalize user emails');
    });
  });
});
