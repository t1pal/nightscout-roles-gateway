/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_policy_overview', function (view) {
    var select = knex.raw(`
      WITH group_policy_summary AS (
        SELECT id, owner_ref, expected_name, group_id, group_name
          , count(distinct(identity_type)) as identity_types
          , count(distinct(identity_spec)) as identity_specs
          , count(distinct(group_spec_id)) as group_spec_ids
          , count(distinct(group_id)) as groups
          , count(distinct(schedule_id)) as schedules
          , count(distinct(id)) as total
          , COALESCE(sort, 0) as sort

        FROM site_policy_details
        GROUP BY owner_ref, expected_name, id,
          group_id, group_name, sort
      )
      SELECT group_policy_summary.*,
        connection_policies.site_id,
        connection_policies.policy_name,
        connection_policies.policy_note,
        connection_policies.policy_type,
        connection_policies.policy_spec,
        scheduled_policies.id as schedule_id,
        scheduled_policies.schedule_nickname as schedule_name,
        scheduled_policies.fill_pattern,
        scheduled_policies.schedule_segments,
        scheduled_policies.schedule_description
      FROM group_policy_summary
      JOIN connection_policies
        ON connection_policies.id = group_policy_summary.id
      LEFT JOIN scheduled_policies
        ON scheduled_policies.policy_id = connection_policies.id
    `);
    return view.as(select);
  }).then(function ( ) {
    return knex.raw(`
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
    `).then(function (resp) {
    })
  });

  
};
