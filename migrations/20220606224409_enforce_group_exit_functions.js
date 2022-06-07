/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
        CREATE OR REPLACE FUNCTION force_leave_group() RETURNS trigger AS $$
        BEGIN
          DELETE FROM joined_groups WHERE group_spec_id = OLD.id;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;


        CREATE OR REPLACE TRIGGER delete_inclusion_specs_policy
        AFTER DELETE ON group_inclusion_specs
        FOR EACH ROW
        EXECUTE PROCEDURE force_leave_group();

  `)

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    DROP TRIGGER IF EXISTS delete_inclusion_specs_policy ON group_inclusion_specs CASCADE;
    DROP FUNCTION IF EXISTS force_leave_group() CASCADE;
  `)

  
};
