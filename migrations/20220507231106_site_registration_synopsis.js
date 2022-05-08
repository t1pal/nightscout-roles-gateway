/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_registration_synopsis', function (view) {
    // view.columns([]);
    var select = knex('site_acls').select([
      'id'
    , 'owner_ref'
    , 'expected_name'
    , knex.raw('count(distinct(group_id)) as groups_assigned')
    , knex.raw('count(distinct(group_spec_id)) as roles_defined')
    , knex.raw('count(distinct(policy_id)) as policies_defined')
    , knex.raw('count(distinct(schedule_id)) as schedules_defined')
    , knex.raw('count(*) as total')
    ])
      .groupBy('id', 'owner_ref', 'expected_name')
    ;

    return view.as(select);
  }).then(function ( ) {
  });
  
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_registration_synopsis', function (view) {
  }).then(function ( ) {
  });
  
};
