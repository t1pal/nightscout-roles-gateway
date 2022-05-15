// Update with your config settings.

module.exports = {

  development: {
    client: 'sqlite3',
    connection: {
      filename: './dev.sqlite3'
    }
  },
  test: {
    client: 'postgresql',
    connection: 'postgres://test_nrg_u:test_nrg_p@hostedpg.service.consul/test_nrg',
    pool: {
      idleTimeoutMillis: 500,
      min: 0,
      max: 1
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },
  staging: {
    client: 'postgresql',
    connection: process.env.KNEX_CONNECT,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.KNEX_CONNECT,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  createMetadata: function (table, kind) {
    table.string('id').notNullable( ).unique( ).index( );
    table.increments('_idx').notNullable( ).unique( ).index( );
    table.timestamps(true, true);
    if (kind) {
      table.string('kind').notNullable( ).defaultTo(kind);
    }
  },
  onUpdateTrigger: table => `
    CREATE TRIGGER ${table}_updated_at
    BEFORE UPDATE ON ${table}
    FOR EACH ROW
    EXECUTE PROCEDURE on_update_timestamp();
  `

};
