/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_policy_overview', function (view) {
    var stuff = `
    `;
    var select = knex.raw(`
      WITH group_policy_summary AS (
        SELECT owner_ref, expected_name, group_id -- , group_name
          , count(distinct(identity_type)) as identity_types
          , count(distinct(identity_spec)) as identity_specs
          , count(distinct(group_spec_id)) as group_spec_ids
          , count(distinct(group_id)) as groups
          , count(distinct(schedule_id)) as schedules
          , count(distinct(id)) as total
          -- , COALESCE(sort, 0) as sort

        FROM site_policy_details
        GROUP BY owner_ref, expected_name, -- id,
          group_id  -- , group_name, sort
      )
      SELECT
        connection_policies.id,
        groups.owner_ref,
        sites.expected_name,
        connection_policies.site_id,
        connection_policies.group_definition_id as group_id,
        groups.nickname as group_name,
        connection_policies.policy_name,
        connection_policies.policy_note,
        connection_policies.policy_type,
        connection_policies.policy_spec,
        connection_policies.sort,
        scheduled_policies.id as schedule_id,
        scheduled_policies.schedule_nickname as schedule_name,
        scheduled_policies.schedule_type as schedule_type,
        scheduled_policies.fill_pattern,
        scheduled_policies.schedule_segments,
        scheduled_policies.schedule_description,
        policies.identity_types,
        policies.identity_specs,
        policies.groups,
        policies.schedules,
        policies.total
      FROM connection_policies
      JOIN group_definitions as groups
        ON groups.id = connection_policies.group_definition_id
      JOIN registered_sites as sites
        ON sites.id = connection_policies.site_id
      INNER JOIN group_policy_summary AS policies
        ON policies.group_id = groups.id
        AND policies.expected_name = sites.expected_name
      LEFT JOIN scheduled_policies
        ON scheduled_policies.policy_id = connection_policies.id
      ORDER BY sort
    `);
    return view.as(select);
  }).then(function ( ) {
    return knex.raw(`

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
            AND groups.owner_ref = sites.owner_ref
          WHERE (sites.expected_name = NEW.expected_name OR NEW.site_id = sites.id)
            AND sites.owner_ref = NEW.owner_ref
            AND NOT (NEW.id IS NULL OR NEW.group_id IS NULL or NEW.policy_type IS NULL or NEW.policy_spec IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM site_policy_overview AS _spo
                WHERE _spo.group_id = NEW.group_id
                  AND _spo.expected_name = NEW.expected_name
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
                FROM site_policy_overview
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
          FROM site_policy_overview
          JOIN updated_policy_values as upv
            ON upv.expected_name = site_policy_overview.expected_name
            AND upv.group_id = site_policy_overview.group_id
          WHERE (
            (NEW.site_id = site_policy_overview.site_id
            OR (site_policy_overview.group_id = NEW.group_id
              AND (site_policy_overview.expected_name = NEW.expected_name
              OR site_policy_overview.expected_name = OLD.expected_name)
            ))
            OR site_policy_overview.id = NEW.id
            )
            AND NEW.owner_ref = site_policy_overview.owner_ref
          ) as candidate
          -- RETURNING id INTO NEW.id
          ;

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
            site_policy_overview as spo
          JOIN updated_schedule_values as usv
            ON usv.policy_id = site_policy_overview.id
          WHERE (
            (NEW.site_id = spo.site_id
            OR (spo.group_id = NEW.group_id
              AND (spo.expected_name = NEW.expected_name
              OR spo.expected_name = OLD.expected_name)
            ))
            OR spo.id = NEW.id
            )
            AND NEW.owner_ref = spo.owner_ref
            AND spo.id IS NOT NULL
            OR spo.schedule_id = NEW.schedule_id
          ) AS candidate
          ;

          DELETE FROM scheduled_policies WHERE id IN (
            SELECT DISTINCT(schedule_id)
            FROM site_policy_overview
            WHERE id IS NULL AND schedule_id IS NOT NULL
          ) ;
          END IF;
          -- IF NOT FOUND THEN NULL; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION get_site_policy_detail_id() RETURNS trigger AS $$
        BEGIN
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS initialize_site_policy_details_insert_trigger ON site_policy_details CASCADE;
        DROP TRIGGER IF EXISTS upsert_site_policy_details_update_trigger ON site_policy_details CASCADE;

        CREATE TRIGGER initialize_site_policy_overview_insert_trigger
        INSTEAD OF INSERT ON site_policy_overview
        FOR EACH ROW
        EXECUTE PROCEDURE create_site_policy_details();

        CREATE TRIGGER upsert_site_policy_overview_update_trigger
        INSTEAD OF UPDATE ON site_policy_overview
        FOR EACH ROW
        EXECUTE PROCEDURE update_site_policy_details();


    `).then(function (resp) {
    })


  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_policy_overview', function (view) {
    return knex.raw(`
        DROP TRIGGER IF EXISTS initialize_site_policy_overview_insert_trigger ON site_policy_overview CASCADE;
        DROP TRIGGER IF EXISTS upsert_site_policy_details_update_trigger ON site_policy_overview CASCADE;

    `).then(function (resp) {
    })
  });

  
};
