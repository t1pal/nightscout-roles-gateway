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
    table.string('reassign_group_id');
    // table.
  
  })
  .then(function ( ) {
            // -- AND NOT (NEW.id IS NULL OR NEW.group_id IS NULL or NEW.policy_type IS NULL or NEW.policy_spec IS NULL)
            /*
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
      DECLARE
        prior site_policy_overview;
        candidate site_policy_overview;
        -- candidate record;
      BEGIN
        SELECT *
        INTO prior
        FROM site_policy_overview AS spo
        WHERE (((spo.expected_name = NEW.expected_name
              OR spo.site_id = NEW.site_id)
            AND spo.group_id = NEW.group_id) 
            OR spo.id = NEW.policy_id)
            AND spo.owner_ref = NEW.owner_ref
        ;
        SELECT
          anon.policy_id as id,
          anon.owner_ref,
          anon.expected_name,
          anon.site_id,
          COALESCE(anon.reassign_group_id, anon.group_id) as group_id,
          NULL as group_name,
          COALESCE(anon.policy_name, spo.policy_name) as policy_name,
          COALESCE(anon.policy_note, spo.policy_note) as policy_note,
          COALESCE(anon.policy_type, spo.policy_type) as policy_type,
          COALESCE(anon.policy_spec, spo.policy_spec) as policy_spec,
          0 as sort,
          COALESCE(anon.schedule_id, spo.schedule_id) as schedule_id,
          COALESCE(anon.schedule_name, spo.schedule_name) as schedule_name,
          COALESCE(anon.schedule_type, spo.schedule_type) as schedule_type,
          COALESCE(anon.fill_pattern, spo.fill_pattern) as fill_pattern,
          COALESCE(anon.schedule_segments, spo.schedule_segments) as schedule_segments,
          COALESCE(anon.schedule_description, spo.schedule_description) as schedule_description
        INTO candidate
        FROM (SELECT NEW.* LIMIT 1) AS anon
        LEFT JOIN site_policy_overview as spo
          ON spo.id = anon.policy_id
          AND spo.group_id = anon.group_id
        WHERE spo.id = NEW.policy_id
        ;

        /*
        */
        IF NEW.resort IS NOT NULL THEN
          -- candidate.sort := COALESCE(candidate.sort, 0) + NEW.resort;
          WITH count_max AS (

            SELECT cp.site_id, count(*) as count
            FROM site_policy_overview AS cp
            WHERE cp.site_id = NEW.site_id
            GROUP BY cp.site_id

          ), rules_per_site AS (

            SELECT cp.site_id,
            cp.group_id,
            count(group_id) AS dups,
            0 as min,
            row_number( ) OVER ( PARTITION BY cp.site_id ORDER BY cp.sort ) AS num
            FROM site_policy_overview as cp
            WHERE cp.site_id = NEW.site_id
            GROUP BY cp.site_id, cp.group_id, cp.sort

          ), groups_per_site AS (

            SELECT cp.id, groups.dups AS dups,
            groups.min,
            groups.num,
            cp.sort AS prev,
            groups.num + NEW.resort as add,
            groups.num - NEW.resort as sub,
            pp.count
            FROM site_policy_overview AS cp
            INNER JOIN rules_per_site AS groups
              ON groups.site_id = cp.site_id
              AND groups.group_id = cp.group_id
            INNER JOIN count_max as pp
              ON pp.site_id = cp.site_id
            WHERE cp.site_id = NEW.site_id
            ORDER BY cp.sort

          ), find_max AS (

            SELECT gs.*, cp.id as cp_id, cp.sort as cp_srt
            FROM site_policy_overview AS cp
            JOIN groups_per_site AS gs
              ON gs.id = cp.id
            WHERE cp.site_id = candidate.site_id

          ), updated_sorts AS (

            SELECT cp.id,
              cp.sort AS old_sort,
              CASE
              WHEN cp.id = candidate.id THEN
                find_max.add
              WHEN NEW.resort > 0 AND find_max.sub >= (candidate.sort) THEN
                find_max.sub
              WHEN NEW.resort < 0 AND find_max.sub >= (candidate.sort) THEN
                find_max.sub
              ELSE
                COALESCE(find_max.num, cp.sort, 0)
              END as new_sort
            FROM connection_policies as cp
            JOIN find_max
              ON find_max.id = cp.id
            WHERE cp.site_id = candidate.site_id
              -- AND cp.id != candidate.id

          )
          UPDATE connection_policies as cp
            SET sort = updated_sorts.new_sort

          FROM updated_sorts
          WHERE cp.site_id = candidate.site_id
            -- AND cp.id != candidate.id
            AND updated_sorts.id = cp.id
          ;
        END IF;

        IF NEW.reassign_group_id IS NOT NULL THEN
          NULL;
        END IF;

        IF candidate.id IS NOT NULL THEN
          UPDATE connection_policies 
            SET
            group_definition_id=candidate.group_id,
            -- expected_name=candidate.expected_name,
            policy_name=candidate.policy_name,
            policy_note=candidate.policy_note,
            policy_type=candidate.policy_type,
            policy_spec=candidate.policy_spec
            -- schedule_id=candidate.schedule_id,
            -- schedule_name=candidate.schedule_name,
            -- schedule_type=candidate.schedule_type,
            -- fill_pattern=candidate.fill_pattern,
            -- schedule_segments=candidate.schedule_segments,
            -- schedule_description=candidate.schedule_description
          FROM (SELECT candidate.*) as ignore
          WHERE connection_policies.id = candidate.id
          AND ignore.id = connection_policies.id
          AND prior.id IS NOT NULL
          -- AND ignore.id = site_policy_overview.id
          -- AND site_policy_overview.expected_name = candidate.expected_name
          -- AND site_policy_overview.group_id = candidate.group_id
          ;

          UPDATE scheduled_policies
            SET
            -- id=candidate.schedule_id,
            -- policy_id=candidate.candidate.id,
            schedule_nickname=candidate.schedule_name,
            schedule_type=candidate.schedule_type,
            fill_pattern=candidate.fill_pattern,
            schedule_segments=candidate.schedule_segments,
            schedule_description=candidate.schedule_description
          WHERE scheduled_policies.id = candidate.id
          AND prior.id IS NOT NULL
          AND prior.schedule_id IS NOT NULL
          ;

          INSERT INTO scheduled_policies (id, policy_id, schedule_nickname, schedule_type, fill_pattern, schedule_segments, schedule_description)
          SELECT
            candidate.schedule_id
          , NEW.policy_id
          , candidate.schedule_name
          , candidate.schedule_type
          , candidate.fill_pattern
          , candidate.schedule_segments
          , candidate.schedule_description
          WHERE prior.schedule_id != NEW.schedule_id
            AND prior.schedule_id IS NULL
            AND NEW.schedule_id IS NOT NULL
            AND NEW.schedule_type IS NOT NULL
            AND NEW.schedule_segments IS NOT NULL
            AND NEW.fill_pattern IS NOT NULL
          ;
        END IF;

        WITH new_values AS (
          SELECT candidate.*
        ),
        update_policy AS (
          SELECT candidate.*
          FROM
          site_policy_overview as _spo
            WHERE _spo.id = NEW.policy_id
              
        )
        INSERT INTO site_policy_overview

          (
            id,
            owner_ref,
            expected_name,
            site_id,
            group_id,
            group_name,
            policy_name,
            policy_note,
            policy_type,
            policy_spec,
            sort,
            schedule_id,
            schedule_name,
            schedule_type,
            fill_pattern,
            schedule_segments,
            schedule_description
          )

        SELECT
          new_values.id,
          new_values.owner_ref,
          new_values.expected_name,
          new_values.site_id,
          new_values.group_id,
          new_values.group_name,
          new_values.policy_name,
          new_values.policy_note,
          new_values.policy_type,
          new_values.policy_spec,
          new_values.sort,
          new_values.schedule_id,
          new_values.schedule_name,
          new_values.schedule_type,
          new_values.fill_pattern,
          new_values.schedule_segments,
          new_values.schedule_description
        FROM new_values
        WHERE NOT EXISTS (SELECT 1
          FROM update_policy
          WHERE update_policy.id = NEW.policy_id
        );
        RETURN NEW;
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
