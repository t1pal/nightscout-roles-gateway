
const schemaInspector = require('knex-schema-inspector').default;

function mount (env, server) {

  var endpoint = {
    method: 'get',
    spec: {
      name: '',
      path: ''
    },
    middleware: [ ],
    handler: [ ]
  };

  var inspector = schemaInspector(server.store);

  function check_database (req, res, next) {
    server.store.raw("SELECT 1 as ok;").then(function (results) {
      var result = results.rowCount == 1 ? results.rows[0] : results;
      res.locals = result;
      next( );
    }).catch(next);
  }

  function inspect_database (req, res, next) {
    inspector.tables( ).then(function (results) {
      res.locals = results;
      next( );
    }).catch(next);
  }

  function inspect_table_info (req, res, next) {
    inspector.tableInfo(req.params.table).then(function (results) {
      res.locals.info = results;
      next( );
    }).catch(next);
  }

  function inspect_table_columns (req, res, next) {
    inspector.columnInfo(req.params.table).then(function (results) {
      res.locals.columns = results;
      next( );
    }).catch(next);
  }

  function locals_results ( ) {
    return function format_locals (req, res, next) {
      res.json(res.locals);
      next( );
    }
  }

  function server_debug (req, res, next) {
    res.locals = server.getDebugInfo( );
    next( );
  }

  function status_ok (req, res, next) {
    res.json({ok: true});
    next( );
  }

  function make_locals ( ) {
    return function set_locals (req, res, next) {
      res.locals = { };
      next( );
    }
  }

  server.use(make_locals( ));
  server.get('/api/v1/status', status_ok);
  server.get('/api/v1/status/database', check_database, locals_results( ));
  server.get('/api/v1/about/server', server_debug, locals_results( ));
  server.get('/api/v1/about/database', inspect_database, locals_results( ));
  server.get('/api/v1/about/database/:table', inspect_table_info, inspect_table_columns, locals_results( ));

}
module.exports = exports = mount;

