const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('nightscout_authenticity_records', function (table) {
    table.comment("Certificate of Nightscout authenticity for a site.");
    config.createMetadata(table, 'AuthenticityRecord');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to an identity.");
    table.string('expected_name').notNullable( ).unique( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('upstream_origin').notNullable( ).index( );
    // table.string('site_id').notNullable( ).index( );
    table.string('status').notNullable( ).defaultTo('');
    table.boolean('acceptable').notNullable( ).defaultTo(false);
  })
  .then(function ( ) {
    return knex.raw(`
        CREATE OR REPLACE FUNCTION upsert_nightscout_results_certificate() RETURNS trigger AS $$
        DECLARE
          prior nightscout_authenticity_records;
        BEGIN
          SELECT *
          INTO prior
          FROM nightscout_authenticity_records AS nar
          WHERE nar.expected_name = NEW.expected_name
              AND nar.owner_ref = NEW.owner_ref
          ;

          WITH convert as (
            SELECT
              NEW.id,
              NEW.owner_ref,
              NEW.expected_name,
              NEW.upstream_origin,
              NEW.status,
              NEW.acceptable

          ), updates as (
            UPDATE nightscout_authenticity_records as nar
              SET
                id=uv.id,
                upstream_origin=uv.upstream_origin,
                status=uv.status,
                acceptable=uv.acceptable
              FROM convert as uv
              WHERE EXISTS(SELECT prior.*)
                AND nar.expected_name=uv.expected_name
                AND nar.owner_ref=uv.owner_ref
              RETURNING *
          )
          INSERT INTO nightscout_authenticity_records
            (
              id,
              owner_ref,
              expected_name,
              upstream_origin,
              status,
              acceptable
            )
            SELECT
              *
            FROM convert 
            WHERE NOT EXISTS(SELECT * FROM updates)
          ;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;


        CREATE OR REPLACE TRIGGER nightscout_inspection_results_certificate_insert
        AFTER INSERT ON nightscout_inspection_results
        FOR EACH ROW
        EXECUTE PROCEDURE upsert_nightscout_results_certificate();

        CREATE OR REPLACE FUNCTION invalidate_previous_result_certificates() RETURNS trigger AS $$
        BEGIN
          DELETE FROM nightscout_authenticity_records
            WHERE expected_name = NEW.expected_name;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;


        CREATE OR REPLACE TRIGGER upstream_origin_changes_invalidate_results_certificate_trigger
        AFTER UPDATE ON registered_sites
        FOR EACH ROW
        WHEN ( NEW.upstream_origin IS DISTINCT FROM OLD.upstream_origin )
        EXECUTE PROCEDURE invalidate_previous_result_certificates();

    `)
    .then(function ( ) {
      return knex.raw(config.onUpdateTrigger('nightscout_authenticity_records'));
    });

  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('nightscout_authenticity_records')
  .then(function ( ) {
    return knex.raw(`
      DROP TRIGGER IF EXISTS nightscout_inspection_results_certificate_insert ON nightscout_inspection_results CASCADE;
      DROP FUNCTION IF EXISTS upsert_nightscout_results_certificate() CASCADE;
    `)
    .then(function (resp) {
    });
  });
  
};
