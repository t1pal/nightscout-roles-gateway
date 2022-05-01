var knex = require('knex');
var configs = require('../knexfile.js');

function storage (env) {
  var mode = env.BACKEND_ENV || 'development';
  var config = configs[mode];
  if (env.KNEX_CONNECT) {
    config.connection = env.KNEX_CONNECT;
  }

  console.log("KNEX CONFIG", config);
  return knex(config);
};


module.exports = exports = storage;

