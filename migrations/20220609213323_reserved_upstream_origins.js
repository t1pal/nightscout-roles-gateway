const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('reserved_upstream_origin', function (table) {
    table.comment("A list of upstreams that cannot be used.");
    config.createMetadata(table, 'ReservedUpstream');
    table.string('reserved_upstream').notNullable( );
    table.string('reason');
    table.string('source');
  })
  .then(function ( ) {
    return knex.raw(`
        CREATE OR REPLACE FUNCTION hash_id_upstream() RETURNS trigger AS $$
        BEGIN
        IF NEW.id IS NULL THEN
          NEW.id := encode(digest(NEW.reserved_upstream, 'sha1'), 'hex');
        END IF;
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION check_site_reserved_upstream() RETURNS trigger AS $$
        BEGIN
        IF EXISTS(SELECT * FROM reserved_upstream_origin WHERE NEW.upstream_origin SIMILAR TO reserved_upstream_origin.reserved_upstream) THEN
          RAISE EXCEPTION 'cannot be a reserved upstream_origin: %', NEW.upstream_origin;
        END IF;
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER auto_id_reserved_upstream_insert
        BEFORE INSERT ON reserved_upstream_origin
        FOR EACH ROW
        EXECUTE PROCEDURE hash_id_upstream();

        CREATE TRIGGER check_reserved_upstream_origin_registered_site_insert
        BEFORE INSERT ON registered_sites
        FOR EACH ROW
        EXECUTE PROCEDURE check_site_reserved_upstream();

        CREATE TRIGGER check_reserved_upstream_origin_registered_site_update
        BEFORE UPDATE ON registered_sites
        FOR EACH ROW
        WHEN (NEW.upstream_origin IS DISTINCT FROM OLD.upstream_origin)
        EXECUTE PROCEDURE check_site_reserved_upstream();
    `)
    .then(function ( ) {
      return knex.raw(config.onUpdateTrigger('reserved_upstream_origin'));
    });
  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('reserved_upstream_origin')
  .then(function ( ) {
    return knex.raw(`
    DROP TRIGGER IF EXISTS check_reserved_upstream_origin_registered_site_insert ON registered_sites;
    DROP TRIGGER IF EXISTS check_reserved_upstream_origin_registered_site_update ON registered_sites;
    DROP TRIGGER IF EXISTS auto_id_reserved_upstream_insert ON reserved_upstream_origin;
    DROP FUNCTION IF EXISTS check_site_reserved_upstream();
    DROP FUNCTION IF EXISTS hash_id_upstream();

    `)
    .then(function (resp) {
    });
  });

};
