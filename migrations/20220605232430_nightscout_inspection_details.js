const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('nightscout_inspection_details', function (table) {
    table.comment("Details about a Nightscout site.");
    config.createMetadata(table, 'AuditDetail');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to an identity.");
    table.string('expected_name').notNullable( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('upstream_origin').notNullable( ).index( );
    // table.string('site_id').notNullable( ).index( );
    table.string('audit_id');
    table.string('group');
    table.string('property');
    table.string('criteria');
    table.string('outcome');
    table.boolean('passing');
    table.boolean('mandatory');
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
  return knex.schema.dropTable('nightscout_inspection_details')
  .then(function ( ) {
    return knex.raw(`

    `)
    .then(function (resp) {
    });
  });
  
  
};
