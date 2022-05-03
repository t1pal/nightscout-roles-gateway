/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('nightscout_secrets', function (table) {
    table.increments('_id');
    table.string('id').notNullable( ).unique( ).index( );
    table.string('expected_name').notNullable( ).unique( ).index( );
    table.string('api_secret').index( );
    table.string('hashed_api_secret').index( )
      .comment("The hashed API-SECRET of the Nightscout site.");
  }).then(function ( ) {
    return knex.raw(`
        CREATE OR REPLACE FUNCTION sync_hashed_api_secret() RETURNS trigger AS $$
        BEGIN
          IF tg_op = 'INSERT' THEN
            INSERT INTO nightscout_secrets ( id, expected_name, api_secret, hashed_api_secret )
            VALUES (NEW.id, NEW.expected_name, NEW.api_secret, encode(digest(NEW.api_secret, 'sha1'), 'hex'));
            IF NEW.api_secret IS NOT NULL THEN NEW.api_secret = ''; END IF;
            RETURN NEW;
            
          ELSIF tg_op = 'DELETE' THEN
            DELETE FROM nightscout_secrets WHERE id = OLD.id;
            RETURN OLD;

          ELSIF tg_op = 'UPDATE' THEN
            UPDATE nightscout_secrets SET
              api_secret = NEW.api_secret,
              hashed_api_secret = encode(digest(NEW.api_secret, 'sha1'), 'hex')
              WHERE nightscout_secrets.id = NEW.id
                AND nightscout_secrets.expected_name = NEW.expected_name
            ;
            IF NOT FOUND THEN
              INSERT INTO nightscout_secrets ( id, expected_name, api_secret, hashed_api_secret )
              VALUES (NEW.id, NEW.expected_name, NEW.api_secret, encode(digest(NEW.api_secret, 'sha1'), 'hex'));
            END IF;
            IF NEW.api_secret IS NOT NULL THEN NEW.api_secret = ''; END IF;
            RETURN NEW;
          END IF;
        END;
        $$ LANGUAGE plpgsql;



        CREATE TRIGGER registered_sites_sync_nightscout_secrets_insert
        BEFORE INSERT OR DELETE ON registered_sites
        FOR EACH ROW
        EXECUTE PROCEDURE sync_hashed_api_secret();

        CREATE TRIGGER registered_sites_sync_nightscout_secrets_update
        BEFORE UPDATE ON registered_sites
        FOR EACH ROW
        WHEN ( NEW.api_secret IS DISTINCT FROM OLD.api_secret )
        EXECUTE PROCEDURE sync_hashed_api_secret();
    `);
  });;
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    DROP TRIGGER IF EXISTS registered_sites_sync_nightscout_secrets_insert ON registered_sites;
    DROP TRIGGER IF EXISTS registered_sites_sync_nightscout_secrets_update ON registered_sites;
    DROP FUNCTION IF EXISTS sync_hashed_api_secret();
  `).then(function ( ) {
    return knex.schema.dropTable('nightscout_secrets') ;
  });
  
};
