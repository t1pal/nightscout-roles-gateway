const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('scheduled_policies', function (table) {
    // table.string('id').notNullable( ).unique( ).index( );
    table.comment("Scheduled policies allow different permissions to be assigned to people based on the time of day, week, or month.")
    config.createMetadata(table, 'Schedule');
    table.string('policy_id').notNullable( ).index( )
      .comment("The policy tied to this schedule");
    table.string('schedule_nickname');
    table.string('schedule_type').defaultTo('week')
      .comment("Allow for multiple types of schedules.");
    table.text('fill_pattern')
      .comment("Specifies the way to assign allow vs deny or JWT to each time slice in the list of schedule segments.");
    table.text('schedule_segments')
      .comment("A list of time slices in seconds since the anchor");
    table.text('schedule_description');

  })
  .then(function ( ) {
    knex.raw(config.onUpdateTrigger('scheduled_policies'));
  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('scheduled_policies');

};
