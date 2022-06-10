/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('reserved_expected_names').del()
  await knex('reserved_expected_names').insert([
    { reserved_name: '' }
  , { reserved_name: '% ' }
  , { reserved_name: ' %' }
  , { reserved_name: '% %' }
  // , { reserved_name: 'bad' }
  // , { reserved_name: 'bad' }
  ]);
};
