'use strict';

const db = require('./database');

let initialized = false;

exports.mochaHooks = {
  async beforeAll() {
    if (!initialized) {
      await db.migrate();
      initialized = true;
    }
  },
  
  async afterAll() {
    await db.destroy();
  }
};
