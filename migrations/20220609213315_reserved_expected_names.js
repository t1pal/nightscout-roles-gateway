const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('reserved_expected_names', function (table) {
    table.comment("A list of names that are not allowed.");
    config.createMetadata(table, 'ReservedName');
    table.string('reserved_name').notNullable( );
    table.string('reason');
    table.string('source');
  })
  .then(function ( ) {
    return knex.raw(`

        CREATE OR REPLACE FUNCTION hash_id_reservation() RETURNS trigger AS $$
        BEGIN
        IF NEW.id IS NULL THEN
          NEW.id := encode(digest(NEW.reserved_name, 'sha1'), 'hex');
        END IF;
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION check_site_reserved_name() RETURNS trigger AS $$
        BEGIN
        IF EXISTS(SELECT * FROM reserved_expected_names WHERE NEW.expected_name SIMILAR TO reserved_expected_names.reserved_name) THEN
          RAISE EXCEPTION 'cannot be a reserved name: %', NEW.expected_name;
        END IF;
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE TRIGGER auto_id_reserved_name_insert
        BEFORE INSERT ON reserved_expected_names
        FOR EACH ROW
        EXECUTE PROCEDURE hash_id_reservation();

        CREATE OR REPLACE TRIGGER check_reserved_names_registered_site_insert
        BEFORE INSERT ON registered_sites
        FOR EACH ROW
        EXECUTE PROCEDURE check_site_reserved_name();

        CREATE OR REPLACE TRIGGER check_reserved_names_registered_site_update
        BEFORE UPDATE ON registered_sites
        FOR EACH ROW
        WHEN (NEW.expected_name IS DISTINCT FROM OLD.expected_name)
        EXECUTE PROCEDURE check_site_reserved_name();

    CREATE OR REPLACE FUNCTION sha1_encode (bytea) returns text AS $$
      SELECT encode(digest($1, 'sha1'), 'hex')
    $$ LANGUAGE SQL STRICT IMMUTABLE;


    `)
    .then(function ( ) {
      return knex.raw(config.onUpdateTrigger('reserved_expected_names'));
    });
  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('reserved_expected_names')
  .then(function ( ) {
    return knex.raw(`
    DROP TRIGGER IF EXISTS check_reserved_names_registered_site_insert ON registered_sites;
    DROP TRIGGER IF EXISTS check_reserved_names_registered_site_update ON registered_sites;
    DROP TRIGGER IF EXISTS auto_id_reserved_name_insert ON reserved_expected_names;
    DROP FUNCTION IF EXISTS check_site_reserved_name();
    DROP FUNCTION IF EXISTS hash_id_reservation();

    `)
    .then(function (resp) {
    });
  });

};
