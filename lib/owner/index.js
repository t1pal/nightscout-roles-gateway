
function configure (opts, server, persist) {

  var acl_cfg = {
    table: 'site_acls',
    kind: 'ACL',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var group_cfg = {
    table: 'owner_group_usage',
    kind: 'Group',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var ACL = persist(acl_cfg);
  var Group = persist(group_cfg);

  function factory (cfg) {
    function handler (req, res, next) {
      next( );
    }
    return handler;
  }

  function get_owner_acls (req, res, next) {
    var query = { owner_ref: req.params.owner_ref };
    res.locals.query = query;
    ACL.db.findBy(query).then(function (acls) {
      res.locals.data = acls;
      next( );
    }).catch(next);

  }

  function get_site_acls (req, res, next) {
    var query = { owner_ref: req.params.owner_ref, expected_name: req.params.expected_name };
    res.locals.query = query;
    ACL.db.findBy(query).then(function (acls) {
      res.locals.data = acls;
      next( );
    }).catch(next);

  }

  function get_groups_overview (req, res, next) {
    var query = { owner_ref: req.params.owner_ref };
    res.locals.query = query;
    Group.db.findBy(query).then(function (groups) {
      res.locals.data = groups;
      next( );
    }).catch(next);
  }

  function get_group_details (req, res, next) {
    var query = { owner_ref: req.params.owner_ref
      , group_id : req.params.group_id || req.query.group_id
    };
    Group.db.findBy(query)
      .join('group_inclusion_specs', 'group_inclusion_specs.group_definition_id', 'owner_group_usage.group_id')
    .then(function (groups) {

      res.locals.data = groups;
      next( );
    }).catch(next);
  }

  factory.handlers = {
    get_owner_acls
  , get_site_acls
  , get_groups_overview
  , get_group_details


  };

  return factory;

}

module.exports = exports = configure;
