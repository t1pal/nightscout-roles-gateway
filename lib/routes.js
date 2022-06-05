
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

  const jsonpath = require('jsonpath-plus');

  function locals_results (opts) {
    return function format_locals (req, res, next) {
      var locals = res.locals;
      if (true || opts && opts.full_domain) {
        jsonpath.JSONPath({path: '$..expected_name', json:  locals, callback: function handle (value, type, payload) {
          payload.parent.full_domain = `${value}.${env.gateway.apex}`;
          console.log("FIXING?", value, type, payload);
        } });
      }
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


  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/factory-reset', registrations.handlers.suggest_registration, registrations.handlers.find_existing, registrations.handlers.perform_factory_reset, locals_results( ));

  server.post('/api/v1/workflows/site/registrations/:owner_ref/:expected_name/props', registrations.handlers.suggest_registration, registrations.handlers.update_registration, locals_results( ));

  // server.post('/api/v1/sites/:id', noOp);
  /*
  * Owner Admin Workflows
  */

  var synopsis = require('./synopsis')(env, server, entities);

  server.get('/api/v1/owner/:owner_ref/synopsis', synopsis.handlers.get_owner_overview, locals_results({full_domain: true }));
  server.get('/api/v1/owner/:owner_ref/synopsis/:expected_name', synopsis.handlers.get_site_overview, locals_results( ));

  var owner = require('./owner/')(env, server, entities);
  server.get('/api/v1/owner/:owner_ref/acl', owner.handlers.get_owner_acls, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/acl', owner.handlers.get_site_acls, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/groups', owner.handlers.get_groups_unassigned, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/sites/:expected_name',  owner.handlers.get_site_acls, locals_results( ));

  var clients = require('./clients/')(env, server, entities);
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/clients'
    , clients.handlers.find_oath_clients
    , locals_results( ));
  server.post('/api/v1/owner/:owner_ref/sites/:expected_name/available/clients'
    , clients.handlers.suggest_new_client
    , clients.handlers.create_hydra_client
    , clients.handlers.record_new_client
    , locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/clients/:client_id'
    , clients.handlers.find_oath_client_by_id
    , locals_results( ));
  server.get('/api/v1/clients/:client_id'
    , clients.handlers.find_oath_client_by_id
    , locals_results( ));
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/oauth/sector_identifier'
    , clients.handlers.suggest_new_client
    , clients.handlers.fetch_callback_urls
    );
  // server.del('/api/v1/owner/:owner_ref/sites/:expected_name/available/clients/:client_id', owner.handlers.get_groups_unassigned, locals_results( ));
  // server.post('/api/v1/owner/:owner_ref/sites/:expected_name/available/clients/:client_id/props/:attr', owner.handlers.get_groups_unassigned, locals_results( ));

  /**
   * Groups Admin API
  **/
  server.get('/api/v1/owner/:owner_ref/groups', owner.handlers.get_groups_overview, locals_results( ));
  // create a new group
  server.post('/api/v1/owner/:owner_ref/groups', entities.handlers.set_entity('Group'), entities.handlers.propose_entity_insert, owner.handlers.suggest_group_payload, owner.handlers.create_user_group, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/groups/:group_id', owner.handlers.get_group_details, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/groups/:group_id/attributes', owner.handlers.get_group_attributes, locals_results( ));
  // update a group
  server.post('/api/v1/owner/:owner_ref/groups/:group_id/attributes', entities.handlers.set_entity('Group'), entities.handlers.propose_update, owner.handlers.suggest_group_payload, owner.handlers.update_user_group, locals_results( ));

  // Add an inclusion spec to a group.
  server.post('/api/v1/owner/:owner_ref/groups/:group_id/includes', owner.handlers.suggest_generic_inclusion_payload, owner.handlers.store_group_inclusions, locals_results( ));
  server.post('/api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type', owner.handlers.suggest_generic_inclusion_payload, owner.handlers.store_group_inclusions, locals_results( ));

  server.get('/api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type', owner.handlers.search_inclusions, locals_results( ));
  server.get('/api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type/:identity_spec', owner.handlers.search_inclusions, locals_results( ));
  server.del('/api/v1/owner/:owner_ref/groups/:group_id/includes/:identity_type/:identity_spec', owner.handlers.remove_inclusions, locals_results( ));
  server.del('/api/v1/owner/:owner_ref/groups/:group_id', owner.handlers.remove_user_group, locals_results( ));

  /**
   */
   // assign policy to group
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions', owner.handlers.get_policy_overview, locals_results( ));
  server.post('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions', owner.handlers.suggest_policy_payload, owner.handlers.create_suggested_policy, locals_results( ));
  // server.post('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/permissions', owner.handlers.suggest_policy_payload, owner.handlers.create_suggested_policy, locals_results( ));

  /**
   * TODO: Permissions Admin API


  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/assigned/groups', noOp);

  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/tokens', noOp);
  server.get('/api/v1/owner/:owner_ref/sites/:expected_name/available/permissions', noOp);


  server.head('/warden/', noOp);
  **/


  /**
   * TODO: Nightscout API
   // check/update Nightscout critera (URL, SSL, std-api-v1, std-api-v2, std-api-v3, API-SECRET, std-jwt)
   // recheck on demand, when set API-SECRET
   // assign tokens to Nightscout
   // get cached token[s]
  server.get('/api/v1/authentic/:owner_ref/nightscout/:expected_name/criteria', noOp);
  server.post('/api/v1/authentic/:owner_ref/nightscout/:expected_name/criteria', noOp);
   **/

  var criteria = require('./criteria/')(env, server, entities);
  server.post('/api/v1/nightscout/audit'
    , criteria.handlers.suggest_audit_config
    , criteria.handlers.triage
    , locals_results( )
    );


  /**
   * TODO: Warden API  API
   // replace with cached/active/refreshed token?
   // replace with cached/active/refreshed NS token?
  **/


  /**
   * TODO: Activity API
   // view my activity
   // see sites available
   // see group memberships
   // see group invites
   // accept group invite
   // reject group invite
   // leave group
  **/

  var privy = require('./privy/')(env, server, entities);
  server.get('/api/v1/privy/:identity/', privy.handlers.privy_id, locals_results( ));
  server.get('/api/v1/privy/:identity/groups/available', privy.handlers.privy_id, privy.handlers.search_inclusions, locals_results( ));
  server.get('/api/v1/privy/:identity/groups/available/:expected_name', privy.handlers.privy_id, privy.handlers.search_inclusions, locals_results( ));
  server.get('/api/v1/privy/:identity/groups/available/details/:group_id', privy.handlers.privy_id, privy.handlers.search_inclusions, locals_results( ));

  server.get('/api/v1/privy/:identity/consents/available/:client_id', privy.handlers.privy_id, privy.handlers.invitations_by_client_id, locals_results( ));

  server.post('/api/v1/privy/:identity/groups/joined', privy.handlers.privy_id, privy.handlers.suggest_join_spec, privy.handlers.record_joined_group, locals_results( ));
  server.post('/api/v1/privy/:identity/groups/joined/:group_id', privy.handlers.privy_id, privy.handlers.suggest_join_spec, privy.handlers.record_joined_group, locals_results( ));

  server.get('/api/v1/privy/:identity/groups/joined', privy.handlers.privy_id, privy.handlers.search_joined_groups, locals_results( ));
  server.get('/api/v1/privy/:identity/groups/joined/:group_id', privy.handlers.privy_id, privy.handlers.search_joined_groups, locals_results( ));
  server.del('/api/v1/privy/:identity/groups/joined/:group_id', privy.handlers.privy_id, privy.handlers.exit_joined_group, locals_results( ));
  server.get('/api/v1/privy/:identity/activity/log', noOp);


  // verify_expected_name, authenticate_identity, check_authorization, mutate_request
  
  server.get('/warden/v1/active/backend/for/:expected_name', policies.handlers.find_expected_name, privy.handlers.kratos_whoami, policies.handlers.get_acl_by_identity_param, policies( ), policies.handlers.deny_site_prefs, policies.handlers.matches_api_secret, policies.handlers.decision, policies.handlers.specify_upstream_handler, locals_results( ));
  server.head('/warden/v1/active/backend/for/:expected_name', policies.handlers.find_expected_name, privy.handlers.kratos_whoami, policies.handlers.get_acl_by_identity_param, policies( ), policies.handlers.deny_site_prefs, policies.handlers.matches_api_secret, policies.handlers.decision, policies.handlers.specify_upstream_handler, locals_results( ));

  server.get('/warden/v1/portal/:subject/backend/for/:expected_name', policies.handlers.find_expected_name, policies.handlers.get_acl_by_identity_param, policies( ), policies.handlers.deny_site_prefs, policies.handlers.matches_api_secret, policies.handlers.decision, policies.handlers.specify_upstream_handler, locals_results( ));

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


}
module.exports = exports = mount;

