/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('owner_group_usage', function (view) {
    // view.columns([]);
    var select = knex('site_acls').select([
      'owner_ref'
    , 'group_id'
    , 'group_name'
    , knex.raw('count(*) as total')
    , knex.raw('count(distinct(id)) as num_sites_used')
    , knex.raw('count(distinct(policy_id)) as num_policy_used')
    ])
      .groupBy('owner_ref', 'group_id', 'group_name')
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
  return knex.schema.dropViewIfExists('owner_group_usage', function (view) {
  }).then(function ( ) {
  });
  
};
