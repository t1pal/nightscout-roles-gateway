
const schemaInspector = require('knex-schema-inspector').default;
const Entities = require('./entities/');
const Policies = require('./policies/');

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
  var policies = Policies(entities);


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

  function head_ok (req, res, next) {
    res.send(200);
    next( );
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

  server.post('/api/v1/objects/:kind', entities.handlers.elect_entity, entities.handlers.propose_entity_insert, entities.handlers.process_insert, locals_results( ));

  var common = [ entities.handlers.elect_entity ];
  var handle_update = [ entities.handlers.propose_update, entities.handlers.process_update_by_id ];
  var fetch_entity = [ ].concat(common).concat([entities.handlers.fetch_by_id]);

  server.get('/api/v1/objects/:kind/:id', common, entities.handlers.fetch_by_id, locals_results( ));
  server.put('/api/v1/objects/:kind/:id', common, handle_update, locals_results( ));
  server.post('/api/v1/objects/:kind/:id', common, handle_update, locals_results( ));
  server.patch('/api/v1/objects/:kind/:id', common, handle_update, locals_results( ));
  server.del('/api/v1/objects/:kind/:id', common, entities.handlers.process_delete_by_id, locals_results( ));

  server.get('/api/v1/objects/:kind/:id/props/:attr', fetch_entity, entities.handlers.pull_result_prop, locals_results( ));
  var update_prop = [ entities.handlers.exclude_readonly_prop_edits, entities.handlers.propose_update, entities.handlers.filter_prop_update, entities.handlers.process_update_by_id, entities.handlers.pull_result_prop ];
  var delete_prop = [ entities.handlers.exclude_readonly_prop_edits, entities.handlers.prepare_prop_delete_update, entities.handlers.process_update_by_id, entities.handlers.pull_result_prop];

  server.put('/api/v1/objects/:kind/:id/props/:attr', common, update_prop, locals_results( ));
  server.post('/api/v1/objects/:kind/:id/props/:attr', common, update_prop, locals_results( ));
  server.patch('/api/v1/objects/:kind/:id/props/:attr', common, update_prop, locals_results( ));
  server.del('/api/v1/objects/:kind/:id/props/:attr', common, delete_prop, locals_results( ));

  /*
  * Workflows API
  */

  /*
  * Register a new Site Workflow
  */

  var registrations = require('./registrations/')(env, server, entities);
  server.get('/api/v1/workflows/site/registrations', registrations.handlers.suggest_registration, locals_results( ));
  server.post('/api/v1/workflows/site/registrations', registrations.handlers.suggest_registration, registrations.handlers.find_existing, registrations.handlers.insert_new_site_registration, locals_results( ));
  server.get('/api/v1/workflows/site/registrations/:expected_name', registrations.handlers.suggest_registration, locals_results( ));
  server.post('/api/v1/workflows/site/registrations/:expected_name/propose', registrations.handlers.suggest_registration, locals_results( ));
  server.post('/api/v1/workflows/site/registrations/:expected_name', registrations.handlers.suggest_registration, registrations.handlers.find_existing, registrations.handlers.insert_new_site_registration, locals_results( ));


  server.get('/api/v1/workflows/site/registrations/:owner_ref/:expected_name', registrations.handlers.find_existing, locals_results( ));


  server.get('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/criteria', noOp);
  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/criteria', noOp);
  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/criteria/audits/:requirement', noOp);
  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/factory-reset', registrations.handlers.suggest_registration, registrations.handlers.find_existing, registrations.handlers.perform_factory_reset, locals_results( ));

  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/props', registrations.handlers.suggest_registration, registrations.handlers.update_registration, locals_results( ));

  // server.post('/api/v1/sites/:id', noOp);
  /*
  * Owner Admin Workflows
  */

  var synopsis = require('./synopsis')(env, server, entities);

  server.get('/api/v1/owner/:owner_ref/synopsis', synopsis.handlers.get_owner_overview, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/synopsis/:expected_name', synopsis.handlers.get_site_overview, locals_results( ));

  var owner = require('./owner/')(env, server, entities);
  server.get('/api/v1/owner/:owner_ref/acl', owner.handlers.get_owner_acls, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/acl', owner.handlers.get_site_acls, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions', owner.handlers.get_site_acls, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/groups', owner.handlers.get_groups_unassigned, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/sites/:expected_name',  owner.handlers.get_site_acls, locals_results( ));

  /**
   * Groups Admin API
  **/
  server.get('/api/v1/owner/:owner_ref/groups', owner.handlers.get_groups_overview, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/groups/:group_id', owner.handlers.get_group_details, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));
  /**
   * TODO: Groups Admin API

  // Add an attribute/inclusion spec to a group.
  server.post('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));

  // Get, post, patch, put, delete a particular group inclusion spec.
  server.get('/api/v1/owner/:owner_ref/groups/:group_id/attributes/:group_spec_id', owner.handlers.get_group_details, locals_results( ));

  // create a new group
  server.post('/api/v1/owner/:owner_ref/groups', owner.handlers.get_groups_overview, locals_results( ));
  // post, patch, put, delete a particular group
  server.post('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));
  server.put('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));
  server.patch('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));
  server.del('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_details, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/groups/:group_id/attributes/:group_spec_id', owner.handlers.get_group_details, locals_results( ));

  server.post('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions', noOp);
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/groups', noOp);

  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/tokens', noOp);
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/permissions', noOp);


  server.head('/warden/', noOp);
  **/
  /**
   * TODO: Policy Admin API
   // create schedule
   // edit schedule
   // assign policy to group
  **/

  // verify_expected_name, authenticate_identity, check_authorization, mutate_request
  
  server.get('/warden/v1/active/backend/for/:expected_name', policies.handlers.find_expected_name, policies( ), policies.handlers.deny_site_prefs, policies.handlers.matches_api_secret, policies.handlers.decision, policies.handlers.specify_upstream_handler, locals_results( ));
  server.head('/warden/v1/active/backend/for/:expected_name', policies.handlers.find_expected_name, policies( ), policies.handlers.deny_site_prefs, policies.handlers.matches_api_secret, policies.handlers.decision, policies.handlers.specify_upstream_handler, locals_results( ));
  server.get('/warden/v1/active/session/for/:expected_name', noOp);
  server.get('/warden/v1/allowed/identity/for/:expected_name', noOp);
  server.get('/warden/v1/allowed/permission/for/:expected_name', noOp);
  server.get('/warden/v1/rbac/for/:expected_name', noOp);
  server.get('/warden/v1/authenticate/me/for/:expected_name', noOp);

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

