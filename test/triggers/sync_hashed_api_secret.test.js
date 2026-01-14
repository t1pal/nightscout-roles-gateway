'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const crypto = require('crypto');
const db = require('../setup/database');
const fixtures = require('../setup/fixtures');

describe('Trigger: sync_hashed_api_secret', function() {
  this.timeout(30000);

  before(async function() {
    await db.migrate();
    await db.truncateAllData();
  });

  afterEach(async function() {
    await db.truncateAllData();
  });

  function sha1Hash(secret) {
    return crypto.createHash('sha1').update(secret).digest('hex');
  }

  async function getSecret(siteId) {
    const rows = await db.knex('nightscout_secrets').where({ id: siteId });
    return rows[0] || null;
  }

  describe('INSERT trigger behavior', function() {
    it('TRG-HS-01: should create nightscout_secrets record on site INSERT with api_secret', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const apiSecret = 'test-api-secret-12345';
      const expectedHash = sha1Hash(apiSecret);

      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: apiSecret
      });

      const secret = await getSecret(site.id);
      
      expect(secret).to.not.be.null;
      expect(secret.id).to.equal(site.id);
      expect(secret.expected_name).to.equal(site.expected_name);
      expect(secret.hashed_api_secret).to.equal(expectedHash);
    });

    it('TRG-HS-02: should clear api_secret from registered_sites after INSERT', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const apiSecret = 'plaintext-secret-here';

      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: apiSecret
      });

      const siteRow = await db.knex('registered_sites').where({ id: site.id }).first();
      
      expect(siteRow.api_secret).to.equal('');
    });

    it('TRG-HS-03: should create nightscout_secrets record even with NULL api_secret', async function() {
      const owner = 'owner-' + fixtures.generateId();

      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: null
      });

      const secret = await getSecret(site.id);
      
      expect(secret).to.not.be.null;
      expect(secret.id).to.equal(site.id);
    });

    it('TRG-HS-04: should create nightscout_secrets record with empty string api_secret', async function() {
      const owner = 'owner-' + fixtures.generateId();

      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: ''
      });

      const secret = await getSecret(site.id);
      
      expect(secret).to.not.be.null;
      expect(secret.id).to.equal(site.id);
      expect(secret.hashed_api_secret).to.equal(sha1Hash(''));
    });
  });

  describe('UPDATE trigger behavior', function() {
    it('TRG-HS-05: should update hashed_api_secret when api_secret changes', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const originalSecret = 'original-secret-12345';
      const newSecret = 'new-updated-secret-67890';
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: originalSecret
      });

      const originalSecretRow = await getSecret(site.id);
      expect(originalSecretRow.hashed_api_secret).to.equal(sha1Hash(originalSecret));

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ api_secret: newSecret });

      const updatedSecretRow = await getSecret(site.id);
      expect(updatedSecretRow.hashed_api_secret).to.equal(sha1Hash(newSecret));
    });

    it('TRG-HS-06: should not fire trigger when non-api_secret fields change', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const apiSecret = 'stable-secret-12345';
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: apiSecret,
        nickname: 'Original Name'
      });

      const originalHash = (await getSecret(site.id)).hashed_api_secret;

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ nickname: 'Updated Name' });

      const currentHash = (await getSecret(site.id)).hashed_api_secret;
      expect(currentHash).to.equal(originalHash);
    });

    it('TRG-HS-07: should clear api_secret from registered_sites after UPDATE', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: 'initial-secret-12345'
      });

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ api_secret: 'new-plaintext-secret' });

      const siteRow = await db.knex('registered_sites').where({ id: site.id }).first();
      expect(siteRow.api_secret).to.equal('');
    });

    it('TRG-HS-08: should handle UPDATE to NULL api_secret', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: 'has-secret-initially'
      });

      await db.knex('registered_sites')
        .where({ id: site.id })
        .update({ api_secret: null });

      const secretRow = await getSecret(site.id);
      expect(secretRow).to.not.be.null;
    });
  });

  describe('DELETE trigger behavior', function() {
    it('TRG-HS-09: should delete nightscout_secrets record when site is deleted', async function() {
      const owner = 'owner-' + fixtures.generateId();
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: 'secret-to-be-deleted'
      });

      const secretBefore = await getSecret(site.id);
      expect(secretBefore).to.not.be.null;

      await db.knex('registered_sites').where({ id: site.id }).del();

      const secretAfter = await getSecret(site.id);
      expect(secretAfter).to.be.null;
    });
  });

  describe('Hash verification', function() {
    it('TRG-HS-10: should produce SHA1 hash matching JavaScript crypto output', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const testSecrets = [
        'simple',
        'MySecretPassword123!',
        'unicode-тест-密码',
        '  spaces around  ',
        '!@#$%^&*()_+-=[]{}|;:,.<>?'
      ];

      for (const secret of testSecrets) {
        const expectedHash = sha1Hash(secret);
        
        const site = await fixtures.createSite(db.knex, {
          owner_ref: owner,
          api_secret: secret
        });

        const secretRow = await getSecret(site.id);
        expect(secretRow.hashed_api_secret).to.equal(expectedHash, 
          `Hash mismatch for secret: "${secret}"`);

        await db.truncateAllData();
      }
    });

    it('TRG-HS-11: should handle max-length api_secret (255 chars)', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const maxSecret = 'a'.repeat(255);
      const expectedHash = sha1Hash(maxSecret);
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: maxSecret
      });

      const secretRow = await getSecret(site.id);
      expect(secretRow.hashed_api_secret).to.equal(expectedHash);
    });

    it('TRG-HS-14: documents api_secret column limit (varchar 255)', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const tooLongSecret = 'a'.repeat(256);
      
      let error = null;
      try {
        await fixtures.createSite(db.knex, {
          owner_ref: owner,
          api_secret: tooLongSecret
        });
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.include('too long');
      console.log('TRG-HS-14: api_secret column is varchar(255), longer values rejected');
    });
  });

  describe('Security properties', function() {
    it('TRG-HS-12: should never expose plaintext api_secret in registered_sites', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const sensitiveSecret = 'super-sensitive-key-12345';
      
      await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: sensitiveSecret
      });

      const allSites = await db.knex('registered_sites').select('*');
      
      for (const site of allSites) {
        expect(site.api_secret).to.not.equal(sensitiveSecret);
        expect(site.api_secret).to.equal('');
      }
    });

    it('TRG-HS-13: should store hashed secret in separate nightscout_secrets table', async function() {
      const owner = 'owner-' + fixtures.generateId();
      const apiSecret = 'my-api-secret-12345';
      
      const site = await fixtures.createSite(db.knex, {
        owner_ref: owner,
        api_secret: apiSecret
      });

      const secretRow = await db.knex('nightscout_secrets')
        .where({ id: site.id })
        .first();

      expect(secretRow).to.exist;
      expect(secretRow.hashed_api_secret).to.exist;
      expect(secretRow.hashed_api_secret).to.have.length(40);
    });
  });
});
