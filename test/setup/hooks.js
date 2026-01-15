'use strict';

const db = require('./database');

let initialized = false;

exports.mochaHooks = {
  async beforeAll() {
    if (!initialized) {
      const knex = db.knex;
      
      // Clear any stale migration locks before running migrations
      try {
        await knex.raw(`
          UPDATE knex_migrations_lock SET is_locked = 0 WHERE is_locked = 1
        `);
      } catch (e) {
        // Lock table might not exist yet on first run - that's fine
      }
      
      await db.migrate();
      initialized = true;
    }
  },
  
  async afterAll() {
    await db.destroy();
  }
};
