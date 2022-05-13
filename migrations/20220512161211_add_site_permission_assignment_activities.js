const config = require('../knexfile');
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('permission_assignment_activities', function (table) {
    table.comment("Activities to manage or assign scheduled group permissions for a site.");
    config.createMetadata(table, 'Activity');
    table.string('owner_ref').notNullable( ).index( )
      .comment("A reference to the identity claiming ownership of this Nightscout site.");
    table.string('expected_name').notNullable( ).index( )
      .comment("The front end vanity name becomes the prefix of the dns hostname used for this Nightscout site.");
    table.string('site_id').notNullable( ).index( );
    table.string('group_id').notNullable( ).index( );
    table.string('policy_id').notNullable( ).index( );
    table.string('schedule_id').index( );
    table.string('policy_name');
    table.integer('sort')
      .comment("Sort order for each group of site policies.");
    table.text('policy_note');
    table.string('policy_type')
      .comment("Policy types will be a keyword such as: access, deny, a JWT, or a schedule.");
    table.string('policy_spec')
      .comment("The declaration of the policy or reference to a scheduled policy.");
    table.string('schedule_name');
    table.string('schedule_type')
      .comment("Allow for multiple types of schedules.");
    table.text('fill_pattern')
      .comment("Specifies the way to assign allow vs deny or JWT to each time slice in the list of schedule segments.");
    table.text('schedule_segments')
      .comment("A list of time slices in seconds since the anchor");
    table.text('schedule_description');
    // assign, reassign (group), update (policy.*), delete
    table.string('operation').notNullable( ).defaultTo('assign');
    table.integer('resort')
      .comment("Re position the connection policy in the sort order");
    table.string('sites_site_id');
    table.string('groups_group_id');
    table.string('policies_policy_id');
    // table.
  
  })
  .then(function ( ) {
            // -- AND NOT (NEW.id IS NULL OR NEW.group_id IS NULL or NEW.policy_type IS NULL or NEW.policy_spec IS NULL)
            /*
        ),
        groups AS (
          SELECT id FROM group_definitions WHERE group_definitions.id = NEW.group_id;
        ),
        determine_operation (id, operation, policy_id, policies_policy_id, groups_group_id, sites_site_id
        ) AS (
        SELECT 
          NEW.id,
          CASE
            WHEN NEW.operation = 'delete' THEN
            'delete'
            WHEN policy_id != NEW.id THEN
            'update'
          ELSE
          -- WHEN policy_id = NEW.id THEN
            'add'
          END as operation,
          COALESCE(existing.id, NEW.id) as policy_id,
          existing.id as policies_policy_id,
          groups.id as groups_group_id,
          sites.id as sites_site_id
        FROM registered_sites as sites
          JOIN groups
            ON groups.owner_ref = sites.owner_ref
          INNER JOIN find_existing as existing
             ON existing.group_id = groups.id
            AND existing.site_id = sites.id
          WHERE sites.expected_name = NEW.expected_name
            AND groups.id = NEW.group_id
        
        )
        PERFORM (SELECT *
          FROM determine_operation
          WHERE determine_operation.id = NEW.id
          RETURNING * INTO NEW.*);
        PERFORM SELECT * from find_existing;
        IF FOUND THEN
          NEW.operation = 'foobar'
        END IF;
            */
    return knex.raw(`



      CREATE OR REPLACE FUNCTION before_insert_permission_assignment_activity()
      RETURNS TRIGGER AS $$
      DECLARE
        existing site_policy_overview;
        valid record;
      BEGIN
        WITH 
        find_existing  AS (
          SELECT *
          FROM site_policy_overview AS spo
          
          WHERE (((spo.expected_name = NEW.expected_name
              OR spo.site_id = NEW.site_id)
            AND spo.group_id = NEW.group_id) 
            OR spo.id = NEW.policy_id)
            AND spo.owner_ref = NEW.owner_ref
            
        ),
        groups AS (
          SELECT id, owner_ref FROM group_definitions WHERE group_definitions.id = NEW.group_id
        ),
        determine_operation (id, operation, policy_id, policies_policy_id, groups_group_id, sites_site_id
        ) AS (
        SELECT 
          NEW.id,
          CASE
            WHEN NEW.operation = 'delete' THEN
            'delete'
            WHEN prior.id != NEW.id THEN
            'update'
          WHEN prior.id IS NULL THEN
            'add'
          ELSE
          -- WHEN prior.id = NEW.id THEN
            '???'
          END as operation,
          COALESCE(prior.id, NEW.id) as policy_id,
          prior.id as policies_policy_id,
          groups.id as groups_group_id,
          sites.id as sites_site_id
        FROM registered_sites as sites
          JOIN groups
            ON groups.owner_ref = sites.owner_ref
          LEFT JOIN find_existing as prior
             ON prior.group_id = groups.id
            AND prior.site_id = sites.id
          WHERE sites.expected_name = NEW.expected_name
            AND groups.id = NEW.group_id
        )
        SELECT * INTO valid
          FROM determine_operation
          -- LEFT JOIN find_existing AS prior
        ;
        
        NEW.site_id = valid.sites_site_id;
        NEW.operation = valid.operation;
        NEW.policy_id = valid.policy_id;
        NEW.policies_policy_id = valid.policies_policy_id;
        NEW.groups_group_id = valid.groups_group_id;
        NEW.sites_site_id = valid.sites_site_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;


      CREATE OR REPLACE FUNCTION after_insert_permission_assignment_activity()
      RETURNS TRIGGER AS $$
      BEGIN
        CASE
        WHEN false THEN
          NULL;
        ELSE
          NULL;
        END;
        IF NEW.policy_id = NEW.id THEN
          -- INSERT FROM SELECT ... RETURNING ... INTO NEW;
          -- NEW.operation = 
          -- NEW.policy_id = 
          -- NEW.sites_site_id
          -- NEW.groups_group_id
          -- NEW.policies_policy_id
          NULL;
        ELSIF (false) THEN
          -- UPDATE ...
          -- NEW.policy_id = NEW.id;
          -- PERFORM SELECT ... RETURNING INTO NEW;
          -- NEW.policy_id = 
          -- NEW.sites_site_id
          -- NEW.groups_group_id
          -- NEW.policies_policy_id
          NULL;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE TRIGGER before_insertion_permission_activity_trigger
      BEFORE INSERT ON permission_assignment_activities
      FOR EACH ROW EXECUTE PROCEDURE before_insert_permission_assignment_activity();

      CREATE OR REPLACE TRIGGER after_insertion_permission_activity_trigger
      AFTER INSERT ON permission_assignment_activities
      FOR EACH ROW EXECUTE PROCEDURE after_insert_permission_assignment_activity();

    `)
    .then(function ( ) {
    });
  })
  ;
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('permission_assignment_activities')
  .then(function ( ) {
    return knex.raw(`
        DROP TRIGGER IF EXISTS before_insert_permission_assignment_activity ON permission_assignment_activities CASCADE;
        DROP TRIGGER IF EXISTS after_insert_permission_assignment_activity ON permission_assignment_activities CASCADE;

        DROP FUNCTION IF EXISTS before_insert_permission_assignment_activity() CASCADE;
        DROP FUNCTION IF EXISTS after_insert_permission_assignment_activity() CASCADE;

    `)
    .then(function (resp) {
    });
  });;
  
};
