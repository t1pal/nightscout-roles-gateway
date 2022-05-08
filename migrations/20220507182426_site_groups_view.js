/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * select s.expected_name, s.upstream_origin, g.nickname, i.identity_type, i.identity_spec, r.policy_name, r.policy_type, r.policy_spec, r.*, g.*, i.* 
 from group_definitions as g
  LEFT JOIN  connection_policies as r
    on g.id = r.group_definition_id
  LEFT JOIN group_inclusion_specs as i
    on i.group_definition_id = g.id
  LEFT JOIN registered_sites as s
    on r.site_id = s.id
  LEFT JOIN scheduled_policies as sp
    on sp.policy_id = r.id ;

 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_groups_with_policies', function (view) {
    // view.columns([]);
    var select = knex('group_definitions').select([
      'registered_sites.id as id'
    , 'registered_sites.owner_ref as owner_ref'
    , 'registered_sites.created_at as created_at'
    , 'registered_sites.updated_at as updated_at'
    , 'registered_sites.nickname as nickname'
    , 'registered_sites.expected_name as expected_name'
    , 'registered_sites.upstream_origin as upstream_origin'
    , 'registered_sites.is_enabled as is_enabled'
    , 'registered_sites.require_identities as require_identities'
    , 'registered_sites.exempt_matching_api_secret as exempt_matching_api_secret'
    , 'registered_sites.client_app as client_app'
    , 'group_definitions.id as group_id'
    , 'group_definitions.nickname as group_name'
    , 'group_definitions.deny_access as group_deny_access'
    , 'group_inclusion_specs.id as group_spec_id'
    , 'group_inclusion_specs.nickname as group_spec_nickname'
    , 'group_inclusion_specs.identity_type as identity_type'
    , 'group_inclusion_specs.identity_spec as identity_spec'
    , 'connection_policies.id as policy_id'
    , 'connection_policies.policy_name as policy_name'
    , 'connection_policies.policy_type as policy_type'
    , 'connection_policies.policy_spec as policy_spec'
    , 'scheduled_policies.id as schedule_id'
    , 'scheduled_policies.schedule_nickname as schedule_nickname'
    , 'scheduled_policies.schedule_type as schedule_type'
    , 'scheduled_policies.fill_pattern as fill_pattern'
    , 'scheduled_policies.schedule_segments as schedule_segments'
    ])
      .leftJoin('connection_policies', 'group_definitions.id', 'connection_policies.group_definition_id')
      .leftJoin('group_inclusion_specs', 'group_definitions.id', 'group_inclusion_specs.group_definition_id')
      .leftJoin('registered_sites', 'connection_policies.site_id', 'registered_sites.id')
      .leftJoin('scheduled_policies', 'connection_policies.id', 'scheduled_policies.policy_id');
    return view.as(select);
  }).then(function ( ) {
  });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_groups_with_policies', function (view) {
  }).then(function ( ) {
  });
  
};
