/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('unified_active_site_policies', function (view) {
    var select = knex.raw(`
      SELECT
        acl.id,
        acl.owner_ref,
        acl.expected_name,
        acl.site_id,
        acl.group_id,
        acl.group_name,
        acl.policy_name,
        acl.policy_note,
        COALESCE(acl.policy_type) AS policy_type,
        COALESCE(sch.spec, acl.policy_spec) AS policy_spec,
        acl.sort

      FROM site_policy_overview AS acl
      LEFT JOIN site_policy_schedules_active AS sch
        ON acl.schedule_id = sch.id
      JOIN registered_sites AS sites
        ON sites.id = acl.site_id

      `);
    return view.as(select);

  }).then(function ( ) {

  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('unified_active_site_policies').then(function ( ) {

    return knex.raw(`
    `);
  });
  
};
