
const _ = require('lodash');
const hydraClient = require('@ory/hydra-client');

function configure (opts, server, persist) {

  var hydra_config = new hydraClient.Configuration({ basePath: opts.hydra.api });
  var hydraAdmin = new hydraClient.AdminApi(hydra_config);

  var oauth_clients = {
    table: 'oauth2_credentials',
    kind: 'OAuth2Client',
    required: ['owner_ref', 'expected_name' ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var Clients = persist(oauth_clients);

  function factory (cfg) {
    function handler (req, res, next) {
      next( );
    }
    return handler;
  }

  function suggest_new_client (req, res, next) {
    var required = [ 'owner_ref', 'expected_name'];
    var apex = opts.gateway.apex;
    var www = opts.gateway.www;
    var incoming = _.merge({ }, req.body, req.query, req.params);
    var tenant = `${incoming.expected_name}.${apex}`
    var defaults = {
      audience: [ tenant, www + `/invitations/${incoming.expected_name}` ]
    , client_name: '' + incoming.expected_name
    // , client_uri: ''
    , metadata: { expected_name: incoming.expected_name, owner_ref: incoming.owner_ref }
    , owner: incoming.owner_ref
    , redirect_uris: [
      www + `/invitations/${incoming.expected_name}/rsvp` 
    // , www + `/portal/${incoming.expected_name}` 
    // , `https://${tenant}`
    ]
    // , response_types: [ ]
    , scope: 'openid email offline profile rsvp'
    , sector_identifier_url: opts.self.api + `/api/v1/owner/${incoming.owner_ref}/sites/${incoming.expected_name}/oauth/sector_identifier`
    , subject_type: 'pairwise'
    , token_endpoint_auth_method: 'client_secret_post'
    // , tos_uri: ''
    // , policy_uri: ''
    // , logo_uri: ''
    };
    res.locals.default_client = defaults;
    res.locals.incoming = incoming;
    res.locals.suggestion = defaults;
    next( );

  }

  function fetch_callback_urls (req, res, next) {
    res.json(res.locals.suggestion.redirect_uris);

  }

  function create_hydra_client (req, res, next) {
    var payload = res.locals.suggestion;
    hydraAdmin.createOAuth2Client(payload).then(function (client_resp) {
      res.locals.client = client_resp.data;
      next( );

    }).catch(next);

  }

  function record_new_client (req, res, next) {
    var prop_names = ['owner_ref', 'expected_name', 'client_id', 'client_secret' ];
    var payload = _.merge({ id: persist.genid( ) }
      , _.pick(res.locals.incoming, prop_names)
      , _.pick(res.locals.client, prop_names)
      );
    Clients.db.add(payload).then(function (err) {
      res.locals.inserted = payload;
      next( );
    }).catch(next);;
  }

  function remove_oauth_hydra_clients (req, res, next) {
    var removals = _.map(res.locals.results.data, function (elem) {
      function remove ( ) {
        return hydraAdmin.deleteOAuth2Client(elem.client_id)
      }
      return remove;
    });
    Promise.all(removals).then(function (removed) {
      var finished = _.map(removed, function (o) { return o.data; });
      console.log("REMOVED", finished.length, finished);
      next( );

    }).catch(function (errors) {
      console.log("COULD NOT FINISH REMOVING CLIENTS FROM HYDRA.", errors);
      next( );
    });
  }


  function find_oath_clients (req, res, next) {
    var prop_names = ['owner_ref', 'expected_name', 'client_id' ];
    var incoming = _.merge({ }, req.body, req.query, req.params);
    var query = _.pick(incoming, prop_names);

    Clients.db.findBy(query).then(function (clients) {
      res.locals.results = { data: clients };
      next( );
    }).catch(next);;
  }

  function find_oath_client_by_id (req, res, next) {
    var prop_names = ['owner_ref', 'expected_name', 'client_id' ];
    var incoming = _.merge({ }, req.body, req.query, req.params);
    var query = _.pick(incoming, prop_names);

    Clients.db.findById(query.client_id, '*', 'client_id').then(function (clients) {
      res.locals.results = { data: clients };
      next( );
    }).catch(next);;
  }




  factory.handlers = {
    suggest_new_client
  , create_hydra_client
  , record_new_client
  , find_oath_clients
  , remove_oauth_hydra_clients
  , find_oath_client_by_id
  , fetch_callback_urls
  // , 
  };

  return factory;

}

module.exports = exports = configure;
