
function configure (opts, server, persist) {

  var synopsis_cfg = {
    table: 'site_registration_synopsis',
    kind: 'synopsis',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var Synopsis = persist(synopsis_cfg);

  function factory (cfg) {
    function handler (req, res, next) {
      next( );
    }
    return handler;
  }

  function get_owner_overview (req, res, next) {
    var query = { owner_ref: req.params.owner_ref };
    res.locals.query = query;
    Synopsis.db.findBy(query).then(function (overview) {
      res.locals.data = overview;
      next( );
    }).catch(next);

  }

  function get_site_overview (req, res, next) {
    var query = { owner_ref: req.params.owner_ref, expected_name: req.params.expected_name };
    res.locals.query = query;
    var cols = ['site_registration_synopsis.*'
      , 'registered_sites.nickname'
      , 'registered_sites.upstream_origin'
      , 'registered_sites.is_enabled'
      , 'registered_sites.require_identities'
      , 'registered_sites.exempt_matching_api_secret'
      ];
    Synopsis.db.findById(query.expected_name, cols, 'site_registration_synopsis.expected_name').join('registered_sites', 'registered_sites.id', 'site_registration_synopsis.id').then(function (overview) {
      res.locals.data = overview;
      next( );
    }).catch(next);

  }

  factory.handlers = {
    get_owner_overview
  , get_site_overview

  };

  return factory;

}

module.exports = exports = configure;
