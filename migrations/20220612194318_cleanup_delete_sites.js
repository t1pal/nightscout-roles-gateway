/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
        CREATE OR REPLACE FUNCTION delete_site_resources() RETURNS trigger AS $$
        BEGIN
          DELETE FROM group_definitions
            WHERE id IN (SELECT DISTINCT group_id FROM
              site_acls
              WHERE site_acls.group_id = group_definitions.id
                AND site_acls.id = OLD.id);
          DELETE FROM connection_policies WHERE site_id = OLD.id;
          DELETE FROM registered_sites WHERE id = OLD.id;
          DELETE FROM nightscout_inspection_details WHERE expected_name = OLD.expected_name and owner_ref = OLD.owner_ref;
          DELETE FROM nightscout_inspection_results WHERE expected_name = OLD.expected_name and owner_ref = OLD.owner_ref;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION remove_joined_groups_via_policy() RETURNS trigger AS $$
        BEGIN
          DELETE FROM joined_groups WHERE policy_id = OLD.id;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER delete_site_triggers_removing_resources
        INSTEAD OF DELETE ON site_registration_initializations
        FOR EACH ROW
        EXECUTE PROCEDURE delete_site_resources();

        CREATE TRIGGER delete_connection_policy_triggers_group_quits
        AFTER DELETE ON connection_policies
        FOR EACH ROW
        EXECUTE PROCEDURE remove_joined_groups_via_policy();
  `).then(function ( ) {
  }); 

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
  return knex.raw(`
    DROP TRIGGER IF EXISTS delete_site_resources ON site_registration_initializations CASCADE; 
    DROP TRIGGER IF EXISTS delete_connection_policy_triggers_group_quits ON connection_policies CASCADE;
    DROP FUNCTION IF EXISTS delete_site_resources() CASCADE;
    DROP FUNCTION IF EXISTS remove_joined_groups_via_policy() CASCADE;
  `).then(function ( ) {
  }); 
  
};
