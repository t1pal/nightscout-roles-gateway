/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
    CREATE OR REPLACE FUNCTION on_update_timestamp() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS
    $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$;


    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE OR REPLACE FUNCTION sha1_encode (bytea) returns text AS $$
      SELECT encode(digest($1, 'sha1'), 'hex')
    $$ LANGUAGE SQL STRICT IMMUTABLE;
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    DROP FUNCTION IF EXISTS on_update_timestamp() CASCADE;
    DROP FUNCTION IF EXISTS sha1_encode() CASCADE;
  `);
};

