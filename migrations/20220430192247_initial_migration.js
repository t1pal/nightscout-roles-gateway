const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('registered_sites', function (table) {
    table.comment("Our list of registered Nightscout sites.");
    config.createMetadata(table, 'Site');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to the identity claiming ownership of this Nightscout site.");
    table.string('nickname')
      .comment("A nickname to use when displaying information about the site to the owner.");
    table.string('expected_name').notNullable( ).unique( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('upstream_origin')
      .comment("The upstream Nightscout site URL");
    table.boolean('is_enabled').defaultTo(true)
      .comment("Whether or not the proxy should enable this site.");
    table.string('nightscout_version')
      .comment("For vetting Nightscout information");
    table.boolean('require_identities').defaultTo(false)
      .comment("Whether or not to force visitors to this URL to sign in or not.");
    table.boolean('exempt_matching_api_secret').defaultTo(true)
      .comment("Whether or not requests with a matching API SECRET header can be exempt from other connection policy rules.");
    table.string('client_app')
      .comment("The app that created or manages this site for the user");
    table.string('api_secret')
      .comment("The API-SECRET of the Nightscout site.");
    table.string('hashed_api_secret').index( )
      .comment("The hashed API-SECRET of the Nightscout site.");
    table.string('admin_spec')
      .comment("TBD");
  })
  .then(function ( ) {
		return knex.raw(config.onUpdateTrigger('registered_sites'))
    .then(function ( ) {
      return knex.raw(`
        CREATE OR REPLACE FUNCTION set_hashed_api_secret() RETURNS trigger AS $$
        BEGIN
          IF tg_op = 'INSERT' OR tg_op = 'UPDATE' THEN
            NEW.hashed_api_secret = encode(digest(NEW.api_secret, 'sha1'), 'hex');
            RETURN NEW;
          END IF;
        END;
        $$ LANGUAGE plpgsql;



        CREATE TRIGGER registered_sites_hash_api_secret_insert
        BEFORE INSERT ON registered_sites
        FOR EACH ROW
        EXECUTE PROCEDURE set_hashed_api_secret();

        CREATE TRIGGER registered_sites_hash_api_secret_update
        BEFORE UPDATE ON registered_sites
        FOR EACH ROW
        WHEN ( NEW.api_secret IS DISTINCT FROM OLD.api_secret )
        EXECUTE PROCEDURE set_hashed_api_secret();
      `);
    });;
  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {

  return knex.schema.dropTable('registered_sites').then(function ( ) {
    return knex.raw(`
      DROP FUNCTION IF EXISTS set_hashed_api_secret() CASCADE;

      DROP TRIGGER IF EXISTS registered_sites_hash_api_secret_insert CASCADE;
      DROP TRIGGER IF EXISTS registered_sites_hash_api_secret_update CASCADE;
    `);
  });;
};
