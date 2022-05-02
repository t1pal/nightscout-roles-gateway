const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('group_definitions', function (table) {
    // table.string('group_definition_id').notNullable( ).unique( ).index( );
    table.comment("Definitions for managing groups for users.");
    config.createMetadata(table, 'Group');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to the identity who authors this group.");
    table.string('nickname')
      .comment("A nickname for this group.");
    table.string('long_name')
      .comment("A longer name for this group.");
    table.text('description');
    table.boolean('deny_access').defaultTo(false)
      .comment("Whether or not this group is used to deny access instead of grant access.");
    // /table.boolean('allow_discovery').defaultTo(false);
  })
  .then(function ( ) {
    return knex.raw(config.onUpdateTrigger('group_definitions'));
  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('group_definitions');

};
