const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('connection_policies', function (table) {
    // table.string('id').notNullable( ).unique( ).index( );
    table.comment("Connection policies govern which authorizations will be granted to which identities by mapping Nightscout sites, to group definitions, and permission specifications on an optional schedule.");
    config.createMetadata(table, 'Policy');
    table.string('site_id').notNullable( ).index( );
    table.string('group_definition_id').notNullable( ).index( );
    table.string('policy_name');
    table.text('policy_note');
    table.string('policy_type')
      .comment("Policy types will be a keyword such as: access, deny, a JWT, or a schedule.");
    table.string('policy_spec')
      .comment("The declaration of the policy or reference to a scheduled policy.");
    table.integer('sort')
      .comment("Sort order for each group of site policies.");
  })
  .then(function ( ) {
    return knex.raw(`
        CREATE OR REPLACE FUNCTION initialize_connection_policy_sort() RETURNS trigger AS $$
        BEGIN
          IF NEW.sort IS NULL THEN
            NEW.sort = COALESCE((SELECT count(*) FROM connection_policies
            WHERE site_id = NEW.site_id
            GROUP BY site_id
            ), 0) ;
          END IF;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER initialize_connection_policy_sort_insert
        BEFORE INSERT ON connection_policies
        FOR EACH ROW
        EXECUTE PROCEDURE initialize_connection_policy_sort();


    `).then(function ( ) {
      return knex.raw(config.onUpdateTrigger('connection_policies'));
    });
  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('connection_policies');

};
