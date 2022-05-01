var Knex = require('knex');
var configs = require('../knexfile.js');

let _knex = null;

function storage (env, ready) {
  if (_knex) return _knex;
  var mode = env.BACKEND_ENV || 'development';
  var config = configs[mode];
  if (env.KNEX_CONNECT) {
    config.connection = env.KNEX_CONNECT;
  }

  console.log("KNEX CONFIG", config);
  _knex = Knex(config);
  if (ready && ready.call) {
    _knex.raw('SELECT 1 as ok').then(function (resp) {
      console.log("DATABASE CONNECTED", resp);
      if (resp && resp.rows.length == 1 &&  resp.rows[0].ok == 1) {
        ready(null, _knex);
      } else {
        ready({ err: "DATABASE NOT OK" }, null);
      }
    });
  }
  return _knex;
};


module.exports = exports = storage;

