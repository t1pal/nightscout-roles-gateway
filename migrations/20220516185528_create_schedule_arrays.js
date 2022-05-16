/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  
  return knex.schema.createViewOrReplace('site_policy_schedules', function (view) {
    var select = knex.raw(`
      WITH fill_raw AS (
        SELECT spo.schedule_id as id,
          spo.id as policy_id,
          UNNEST( string_to_array(spo.fill_pattern, ',')) AS spec
        FROM site_policy_overview AS spo
        WHERE spo.schedule_id IS NOT NULL
        AND spo.fill_pattern IS NOT NULL
        AND spo.schedule_segments IS NOT NULL

      ),
      fill_idx AS (
        SELECT fr.*,
          row_number( ) OVER (
            PARTITION BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as fill_num,
          count(*) OVER (
            PARTITION BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as total
        FROM fill_raw AS fr
      ),
      baseline AS (
        SELECT spo.schedule_id as id,
        spo.owner_ref,
        spo.expected_name,
        spo.site_id,
        spo.group_id,
        spo.id as policy_id,
        spo.policy_name,
        spo.policy_spec,
        spo.policy_type,
        spo.schedule_id,
        spo.schedule_name,
        UNNEST( CAST(string_to_array(spo.schedule_segments, ',') AS INT[])) AS slice
        FROM site_policy_overview AS spo
        WHERE spo.schedule_id IS NOT NULL
        AND spo.fill_pattern IS NOT NULL
        AND spo.schedule_segments IS NOT NULL

      ),
      with_segments AS (
        SELECT *,
          row_number( ) OVER (
            PARTITION BY schedule_id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) AS num,
          baseline.slice as start,
          COALESCE(lead(baseline.slice, 1) OVER (
            PARTITION BY schedule_id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ), EXTRACT(EPOCH FROM interval '1 week 1 second' ) ) as end
          
        FROM baseline
      ),
      combine_filled_segments AS (
        SELECT slices.*,
          fill_idx.spec,
          fill_idx.fill_num,
          fill_idx.total,
          (slices.num % (fill_idx.total + 1)) as chosen_idx
          FROM with_segments as slices
          INNER JOIN fill_idx
            ON fill_idx.fill_num = (slices.num % (fill_idx.total + 1))
          
      )
      SELECT *
      FROM combine_filled_segments
      `);
    return view.as(select);

  }).then(function ( ) {

  });
  /*
  // Not needed thanks to
  // array_to_string
  // string_to_array(str, split)
  // array_to_string(arr, join)
  return knex.schema.alterTable('scheduled_policies', function (table) {
    table.specificType('fill_pattern', 'string ARRAY')
      .comment('Fill pattern to use')
      .alter( );
    table.specificType('schedule_segments', 'integer ARRAY')
      .comment('list of slices composing the schedule')
      .alter( );

  }).then(function ( ) {
    return knex.raw(`
    `);
  });
  */
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_policy_schedules').then(function ( ) {

    return knex.raw(`
    `);
  });
  
};
