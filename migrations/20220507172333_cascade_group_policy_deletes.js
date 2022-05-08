/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
        CREATE OR REPLACE FUNCTION delete_matching_inclusions() RETURNS trigger AS $$
        BEGIN
          DELETE FROM group_inclusion_specs WHERE group_definition_id = OLD.id;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION delete_matching_policy_data() RETURNS trigger AS $$
        BEGIN
          DELETE FROM scheduled_policies WHERE policy_id = OLD.id;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE TRIGGER delete_group_policy
        BEFORE DELETE ON group_definitions 
        FOR EACH ROW
        EXECUTE PROCEDURE delete_matching_inclusions();

        CREATE OR REPLACE TRIGGER delete_connection_policy
        BEFORE DELETE ON connection_policies
        FOR EACH ROW
        EXECUTE PROCEDURE delete_matching_policy_data();
  `).then(function ( ) {
  }); 
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    DROP TRIGGER IF EXISTS delete_group_policy ON group_definitions CASCADE; 
    DROP TRIGGER IF EXISTS delete_connection_policy ON connection_policies CASCADE;
    DROP FUNCTION IF EXISTS delete_matching_inclusions() CASCADE;
    DROP FUNCTION IF EXISTS delete_matching_policy_data() CASCADE;
  `).then(function ( ) {
  }); 
  
};
