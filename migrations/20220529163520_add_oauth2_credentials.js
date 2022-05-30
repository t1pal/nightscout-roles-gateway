const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('oauth2_credentials', function (table) {
    table.comment("Oauth2 credentials for a site.");
    config.createMetadata(table, 'HydraClient');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to an identity.");
    table.string('expected_name').notNullable( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('client_id').notNullable( ).index( );
    table.string('client_secret').notNullable( ).index( );
    // table.string('site_id').notNullable( ).index( );
  })
  .then(function ( ) {
    return knex.raw(`
    `)
    .then(function ( ) {
    });

  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('oauth2_credentials')
  .then(function ( ) {
    return knex.raw(`

    `)
    .then(function (resp) {
    });
  });
  
};
