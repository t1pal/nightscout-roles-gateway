const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('joined_groups', function (table) {
    table.comment("Activities to manage or assign scheduled group permissions for a site.");
    config.createMetadata(table, 'RoleBindings');
    table.string('subject').notNullable( ).index( )
      .comment("A reference to an identity.");
    table.string('expected_name').notNullable( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('group_id').notNullable( ).index( );
    table.string('group_spec_id').notNullable( ).index( );
    table.string('policy_id').notNullable( ).index( );
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
  return knex.schema.dropTable('joined_groups')
  .then(function ( ) {
    return knex.raw(`

    `)
    .then(function (resp) {
    });
  });
  
};
