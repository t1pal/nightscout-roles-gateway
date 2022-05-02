
const schemaInspector = require('knex-schema-inspector').default;
const Entities = require('./entities/');

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
  var entities = Entities(env, server);

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

  var noOp = [ status_ok ];

  server.use(make_locals( ));
  server.get('/api/v1/status', status_ok);
  server.get('/api/v1/status/database', check_database, locals_results( ));
  server.get('/api/v1/about/server', server_debug, locals_results( ));
  server.get('/api/v1/about/database', inspect_database, locals_results( ));
  server.get('/api/v1/about/database/:table', inspect_table_info, inspect_table_columns, locals_results( ));

  server.get('/api/v1/entities/', noOp);
  server.get('/api/v1/entities/:table', noOp);
  server.get('/api/v1/entities/:table/filter', noOp);
  server.get('/api/v1/entities/:table/by/:attr/:value', noOp);
  server.get('/api/v1/search/entities', noOp);

  server.post('/api/v1/entities/:table', noOp);

  server.get('/api/v1/kinds/:kind', noOp);
  server.get('/api/v1/kinds/:kind/by/:attr/:value', noOp);

  server.get('/api/v1/kinds/search', noOp);

  server.get('/api/v1/kinds/:kind/proposal', entities.handlers.elect_entity, entities.handlers.get_entity_requirements, locals_results( ));
  server.post('/api/v1/kinds/:kind/proposal', entities.handlers.elect_entity, entities.handlers.get_entity_requirements, locals_results( ));
  server.put('/api/v1/kinds/:kind/proposal', entities.handlers.elect_entity, entities.handlers.get_entity_requirements, locals_results( ));

  server.post('/api/v1/objects/:kind', noOp);

  server.get('/api/v1/objects/:kind/:id', noOp);
  server.put('/api/v1/objects/:kind/:id', noOp);
  server.post('/api/v1/objects/:kind/:id', noOp);
  server.patch('/api/v1/objects/:kind/:id', noOp);
  server.del('/api/v1/objects/:kind/:id', noOp);

  server.get('/api/v1/objects/:kind/:id/props', noOp);
  server.get('/api/v1/objects/:kind/:id/props/:attr', noOp);
  server.put('/api/v1/objects/:kind/:id/props/:attr', noOp);
  server.post('/api/v1/objects/:kind/:id/props/:attr', noOp);
  server.patch('/api/v1/objects/:kind/:id/props/:attr', noOp);
  server.del('/api/v1/objects/:kind/:id/props/:attr', noOp);

  server.get('/api/v1/worfklows/manage/groups/registration/:kind', noOp);
  server.post('/api/v1/worfklows/manage/groups/registration/:kind', noOp);
  server.head('/warden/', noOp);
  server.get('/warden/v1/information/groups/for/me', noOp);
  server.get('/warden/v1/my/groups', noOp);
  server.get('/warden/v1/my/groups/:id', noOp);
  server.get('/warden/v1/my/groups/:id/info', noOp);
  server.get('/warden/v1/my/groups/:id/specs', noOp);
  server.get('/warden/v1/my/groups/:id/specs/:spec_id', noOp);
  // server.get('/warden/v1/my/groups/:id/specs/:spec_id', noOp);
  server.get('/warden/v1/my/sites', noOp);
  server.get('/warden/v1/my/sites/:id', noOp);
  // server.get('/warden/v1/my/sites/:id/', noOp);
  server.get('/warden/v1/my/permissions', noOp);
  server.get('/warden/v1/site/permissions', noOp);

}
module.exports = exports = mount;

