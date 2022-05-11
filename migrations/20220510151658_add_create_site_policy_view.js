/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_policy_details', function (view) {
    // view.columns([]);
    var select = knex('connection_policies').select([
      'registered_sites.id as site_id'
    , 'registered_sites.owner_ref as owner_ref'
    , 'connection_policies.created_at as created_at'
    , 'connection_policies.updated_at as updated_at'
    , 'registered_sites.nickname as nickname'
    , 'registered_sites.expected_name as expected_name'
    , 'registered_sites.upstream_origin as upstream_origin'
    , 'registered_sites.is_enabled as is_enabled'
    , 'registered_sites.require_identities as require_identities'
    , 'registered_sites.exempt_matching_api_secret as exempt_matching_api_secret'
    , 'registered_sites.client_app as client_app'
    , 'connection_policies.id as id'
    , 'group_definitions.id as group_id'
    , 'group_definitions.nickname as group_name'
    , 'group_definitions.deny_access as group_deny_access'
    , 'group_inclusion_specs.id as group_spec_id'
    , 'group_inclusion_specs.nickname as group_spec_nickname'
    , 'group_inclusion_specs.identity_type as identity_type'
    , 'group_inclusion_specs.identity_spec as identity_spec'
    , 'connection_policies.id as policy_id'
    , 'connection_policies.policy_name as policy_name'
    , 'connection_policies.policy_note as policy_note'
    , 'connection_policies.policy_type as policy_type'
    , 'connection_policies.policy_spec as policy_spec'
    , 'connection_policies.sort as sort'
    , 'scheduled_policies.id as schedule_id'
    , 'scheduled_policies.schedule_nickname as schedule_nickname'
    , 'scheduled_policies.schedule_type as schedule_type'
    , 'scheduled_policies.fill_pattern as fill_pattern'
    , 'scheduled_policies.schedule_segments as schedule_segments'
    , 'scheduled_policies.schedule_description'
    ])
      .leftJoin('group_definitions', 'group_definitions.id', 'connection_policies.group_definition_id')
      .leftJoin('group_inclusion_specs', 'group_definitions.id', 'group_inclusion_specs.group_definition_id')
      .leftJoin('registered_sites', 'connection_policies.site_id', 'registered_sites.id')
      .leftJoin('scheduled_policies', 'connection_policies.id', 'scheduled_policies.policy_id');
    return view.as(select);
  }).then(function ( ) {
    return knex.raw(`

        SELECT 1;
        CREATE OR REPLACE FUNCTION create_site_policy_details() RETURNS trigger AS $$
        BEGIN
          WITH new_policy_values (id, expected_name, group_id, policy_name, policy_note, policy_type, policy_spec) AS (VALUES (
            NEW.id
          , NEW.expected_name
          , NEW.group_id
          , COALESCE(NEW.policy_name, 'Default')
          , COALESCE(NEW.policy_note)
          , COALESCE(NEW.policy_type, 'default')
          , COALESCE(NEW.policy_spec, 'allow')
          ))
          INSERT INTO connection_policies (id, site_id, group_definition_id, policy_name, policy_note, policy_type, policy_spec)
          SELECT
            new_policy_values.id
          , sites.id as site_id
          , groups.id as group_definition_id
          , new_policy_values.policy_name
          , new_policy_values.policy_note
          , new_policy_values.policy_type
          , new_policy_values.policy_spec
          FROM new_policy_values
          INNER JOIN registered_sites as sites
            ON sites.expected_name = new_policy_values.expected_name
          INNER JOIN group_definitions as groups
            ON groups.id = new_policy_values.group_id
          WHERE (sites.expected_name = NEW.expected_name OR NEW.site_id = sites.id)
            AND sites.owner_ref = NEW.owner_ref
            AND NOT (NEW.id IS NULL OR NEW.group_id IS NULL or NEW.policy_type IS NULL or NEW.policy_spec IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM connection_policies
                WHERE groups.id = connection_policies.group_definition_id
                  AND sites.expected_name = NEW.expected_name
                  AND sites.id = connection_policies.site_id
              )
          ;

          IF (NEW.schedule_type IS NOT NULL AND NEW.fill_pattern is NOT NULL AND NEW.schedule_segments is NOT NULL) THEN
          WITH new_schedule_values (id, policy_id, schedule_name, schedule_type, fill_pattern, schedule_segments, schedule_description) AS (VALUES (
            NEW.schedule_id
          , NEW.id
          , NEW.expected_name
          , NEW.group_id
          , COALESCE(NEW.schedule_name)
          , COALESCE(NEW.schedule_type)
          , COALESCE(NEW.fill_pattern)
          , COALESCE(NEW.schedule_segments)
          , COALESCE(NEW.schedule_description)
          ))
          INSERT INTO scheduled_policies (id, policy_id, schedule_nickname, schedule_type, fill_pattern, schedule_segments, schedule_description)
          SELECT
            new_schedule_values.id
          , policies.id
          , new_schedule_values.schedule_name
          , new_schedule_values.schedule_type
          , new_schedule_values.fill_pattern
          , new_schedule_values.schedule_segments
          , new_schedule_values.schedule_description
          FROM new_schedule_values
          INNER JOIN connection_policies as policies
            ON policies.id = new_schedule_values.policy_id
          INNER JOIN registered_sites as sites
            ON sites.expected_name = new_schedule_values.expected_name
            AND sites.id = policies.site_id
          INNER JOIN group_definitions as groups
            ON groups.id = new_policy_values.group_id
            AND groups.id = policies.group_id
          WHERE sites.expected_name = NEW.expected_name
            AND groups.id = NEW.group_id
            AND policies.id IS NOT NULL
            AND sites.owner_ref = NEW.owner_ref;

          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION update_site_policy_details() RETURNS trigger AS $$
        BEGIN
          IF NEW.group_id IS NULL AND (NEW.id IS NOT NULL
            OR NEW.expected_name IS NOT NULL) THEN
            DELETE FROM connection_policies
              WHERE id IN (SELECT id
                FROM site_policy_details
                WHERE id = NEW.id
                  OR (group_id = NEW.group_id
                  AND expected_name = NEW.expected_name
                  )
                  OR (group_id = NEW.group_id
                  AND site_id = NEW.site_id
                  )
              );
            RETURN OLD;
          END IF;
          WITH updated_policy_values (id, expected_name, group_id, policy_name, policy_note, policy_type, policy_spec) AS (VALUES (
            COALESCE(OLD.id, NEW.id)
          , COALESCE(OLD.expected_name, NEW.expected_name)
          , COALESCE(NEW.group_id, OLD.group_id)
          , COALESCE(NEW.policy_name, OLD.policy_name, 'Default')
          , COALESCE(NEW.policy_note, OLD.policy_note)
          , COALESCE(NEW.policy_type, OLD.policy_type, 'default')
          , COALESCE(NEW.policy_spec, OLD.policy_spec, 'allow')
          ))
          UPDATE connection_policies
          SET
            group_definition_id=candidate.group_definition_id,
            policy_name=candidate.policy_name, policy_note=candidate.policy_note, policy_type=candidate.policy_type, policy_spec=candidate.policy_spec
          FROM ( SELECT
            upv.group_id as group_definition_id,
            upv.policy_name, upv.policy_note, upv.policy_type, upv.policy_spec
          FROM site_policy_details
          JOIN updated_policy_values as upv
            ON upv.expected_name = site_policy_details.expected_name
            AND upv.site_id = site_policy_details.site_id
            AND upv.group_id = site_policy_details.group_id
          WHERE (
            (NEW.site_id = site_policy_details.site_id
            OR (site_policy_details.group_id = NEW.group_id
              AND (site_policy_details.expected_name = NEW.expected_name
              OR site_policy_details.expected_name = OLD.expected_name)
            ))
            OR site_policy_details.id = NEW.id
            )
            AND NEW.owner_ref = site_policy_details.owner_ref
          ) as candidate;

          IF (OLD.schedule_id IS DISTINCT FROM NEW.schedule_id) THEN
          WITH updated_schedule_values (id, policy_id, schedule_name, schedule_type, fill_pattern, schedule_segments, schedule_description) AS (VALUES (
            COALESCE(OLD.schedule_id, NEW.schedule_id)
          , COALESCE(OLD.id, NEW.id)
          , COALESCE(NEW.schedule_name, OLD.schedule_name)
          , COALESCE(NEW.schedule_type, OLD.schedule_type)
          , COALESCE(NEW.fill_pattern, OLD.fill_pattern)
          , COALESCE(NEW.schedule_segments, OLD.schedule_segments)
          , COALESCE(NEW.schedule_description, OLD.description)
          ))
          UPDATE scheduled_policies
          SET
            schedule_name=candidate.schedule_name,
            schedule_type=candidate.schedule_type,
            fill_pattern=candidate.fill_pattern,
            schedule_segments=candidate.schedule_segments,
            schedule_description=candidate.schedule_description
          FROM ( SELECT
            usv.schedule_name, usv.schedule_type,
            usv.fill_pattern, usv.schedule_segments,
            usv.schedule_description
          FROM
            site_policy_details
          JOIN updated_schedule_values as usv
            ON usv.policy_id = site_policy_details.id
          WHERE (
            (NEW.site_id = site_policy_details.site_id
            OR (site_policy_details.group_id = NEW.group_id
              AND (site_policy_details.expected_name = NEW.expected_name
              OR site_policy_details.expected_name = OLD.expected_name)
            ))
            OR site_policy_details.id = NEW.id
            )
            AND NEW.owner_ref = site_policy_details.owner_ref
            AND site_policy_details.id IS NOT NULL
            OR site_policy_details.schedule_id = NEW.schedule_id
          ) AS candidate ;

          DELETE FROM scheduled_policies WHERE id IN (
            SELECT DISTINCT(schedule_id)
            FROM site_policy_details
            WHERE id IS NULL AND schedule_id IS NOT NULL
          ) ;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER initialize_site_policy_details_insert_trigger
        INSTEAD OF INSERT ON site_policy_details
        FOR EACH ROW
        EXECUTE PROCEDURE create_site_policy_details();

        CREATE TRIGGER upsert_site_policy_details_update_trigger
        INSTEAD OF UPDATE ON site_policy_details
        FOR EACH ROW
        EXECUTE PROCEDURE update_site_policy_details();

        CREATE TRIGGER upsert_site_policy_details_insert_trigger
        BEFORE UPDATE ON site_policy_details
        FOR EACH STATEMENT
        EXECUTE PROCEDURE create_site_policy_details();

    `).then(function (resp) {
      return knex.raw(`
      `).then(function (resp) {
      });

    })


  });

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_policy_details', function (view) {
  }).then(function ( ) {
    return knex.raw(`SELECT 1;

        DROP FUNCTION IF EXISTS create_site_policy_details() CASCADE;
        DROP TRIGGER IF EXISTS initialize_site_policy_details_insert_trigger ON site_policy_details CASCADE;

        DROP FUNCTION IF EXISTS update_site_policy_details() CASCADE;
        DROP TRIGGER IF EXISTS upsert_site_policy_details_update_trigger ON site_policy_details CASCADE;
    `).then(function (res) {
    });

  });
  
};
