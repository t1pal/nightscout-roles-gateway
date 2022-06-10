/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('disallowed_site_info', function (view) {
    view.columns(['reserved_name', 'reserved_origin']);
    var select = knex.raw(`
      SELECT
        reserved_name, '' as upstream_origin
        FROM reserved_expected_names
      UNION
      SELECT
        '' as expected_name, reserved_upstream
        FROM reserved_upstream_origin
      UNION
      SELECT
        expected_name, ''
        FROM registered_sites

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
  return knex.schema.dropViewIfExists('disallowed_site_info').then(function ( ) {

    return knex.raw(`
    `);
  });
  
};
