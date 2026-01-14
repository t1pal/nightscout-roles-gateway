'use strict';

const knexConfig = require('../../knexfile');
let knex = null;

function getKnex() {
  if (!knex) {
    knex = require('knex')(knexConfig.test);
  }
  return knex;
}

const database = {
  get knex() {
    return getKnex();
  },

  async migrate() {
    await getKnex().migrate.latest();
  },

  async rollback() {
    await getKnex().migrate.rollback(null, true);
  },

  async reset() {
    await this.rollback();
    await this.migrate();
  },

  async destroy() {
    if (knex) {
      await knex.destroy();
      knex = null;
    }
  },

  async truncateTables(tables) {
    for (const table of tables) {
      await getKnex().raw(`TRUNCATE TABLE ${table} CASCADE`);
    }
  },

  async truncateAllData() {
    const coreTables = [
      'joined_groups',
      'permission_assignment_activities',
      'scheduled_policies',
      'connection_policies',
      'group_inclusion_specs',
      'group_definitions',
      'nightscout_secrets',
      'nightscout_inspection_results',
      'nightscout_inspection_details',
      'nightscout_authenticity_records',
      'registered_sites'
    ];
    
    for (const table of coreTables) {
      try {
        await getKnex().raw(`TRUNCATE TABLE ${table} CASCADE`);
      } catch (e) {
      }
    }
  },

  async queryView(viewName, where = {}) {
    let query = getKnex()(viewName);
    if (Object.keys(where).length > 0) {
      query = query.where(where);
    }
    return query.select('*');
  },

  async rawQuery(sql, bindings = []) {
    const result = await getKnex().raw(sql, bindings);
    return result.rows;
  }
};

module.exports = database;
