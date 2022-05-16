/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_policy_schedules_active', function (view) {
    var select = knex.raw(`
      SELECT *,
        now( ) - (date_trunc('week', now( ) + interval '1 day') - interval '1 day') AS since_anchor,
        EXTRACT( EPOCH FROM now( ) - (date_trunc('week', now( ) + interval '1 day') - interval '1 day')) AS seconds_since_anchor
        FROM site_policy_schedules AS sps
        WHERE
          sps.start <=
          EXTRACT( EPOCH FROM 
            now( ) - (date_trunc('week', now( ) + interval '1 day') - interval '1 day'))
          AND (sps.end IS NULL
          OR
          EXTRACT( EPOCH FROM 
            now( ) - (date_trunc('week', now( ) + interval '1 day') - interval '1 day'))
            < sps.end
          )
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
  return knex.schema.dropViewIfExists('site_policy_schedules_active').then(function ( ) {

    return knex.raw(`
    `);
  });
  
};
