const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('group_inclusion_specs', function (table) {
    // table.string('group_inclusion_id').notNullable( ).unique( ).index( );
    table.comment("Rules for including identities in groups.");
    config.createMetadata(table, 'Role');
    table.string('group_definition_id').notNullable( ).index( )
      .comment("The rule for including identities belongs to this group.");
    table.string('nickname')
    table.string('synopsis');
    table.text('notes');
    table.string('identity_type').index( )
      .comment("The type of identity spec. Eg one of the keywords: email, email lists, FB group, references to other groups");
    table.text('identity_spec')
      .comment("The content fo the spec.  Eg: the email address, or identifier of the Facebook Group, or reference to internal group id.");
  })
  .then(function ( ) {
    return knex.raw(config.onUpdateTrigger('group_inclusion_specs'));
  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('group_inclusion_specs');

};
