
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
    Synopsis.db.findById(query.expected_name, '*', 'expected_name').then(function (overview) {
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
