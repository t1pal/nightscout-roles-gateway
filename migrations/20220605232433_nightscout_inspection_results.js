const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('nightscout_inspection_results', function (table) {
    table.comment("Certificate of Nightscout authenticity for a site.");
    config.createMetadata(table, 'Nightscout');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to an identity.");
    table.string('expected_name').notNullable( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('upstream_origin').notNullable( ).index( );
    // table.string('site_id').notNullable( ).index( );
    table.string('synopsis').defaultTo('');
    table.string('status').defaultTo('');
    table.boolean('acceptable').defaultTo(false);
  })
  .then(function ( ) {
    return knex.raw(`
    `)
    .then(function ( ) {
      return knex.raw(config.onUpdateTrigger('nightscout_inspection_results'));
    });

  });
  
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('nightscout_inspection_results')
  .then(function ( ) {
    return knex.raw(`

    `)
    .then(function (resp) {
    });
  });
  
};
