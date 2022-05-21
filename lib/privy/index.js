
const _ = require('lodash');

function configure (opts, server, persist) {

  var Kratos = require('@ory/kratos-client');
  var sdk = new Kratos.V0alpha2Api(new Kratos.Configuration({
    basePath: opts.kratos.api
  }));

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

  var join_group_cfg = {
    table: 'joined_groups',
    kind: 'Group',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var ACL = persist(acl_cfg);
  var JoinGroup = persist(join_group_cfg);
  var GroupDefinitions = persist.entities.Group;

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


  function suggest_generic_inclusion_payload (req, res, next) {
    var incoming = _.merge({}, req.body, req.query, req.params);
    console.log("INCOMING", incoming);
    var keepers = [ 'nickname', 'synopsis', 'notes' ];
    var required = [ 'identity_type', 'identity_spec' ];
    var prop_names = keepers.concat(required);
    var defaults = _.merge({
      group_definition_id: req.params.group_id
    }, _.pick(incoming, required));
    var candidates = [ ];
    function has_props (elem) {
      return elem.identity_spec;
    }
    if (_.isObject(incoming.includes) && has_props(incoming.includes)) {
      candidates.push(_.pick(incoming.includes, prop_names));
    }
    if (incoming.identity_spec && incoming.identity_spec) {
      candidates.push(_.pick(incoming, prop_names));
    }
    if (_.isArray(incoming.includes) && _.every(incoming.includes, has_props)) {
      candidates = candidates.concat(incoming.includes);
    }
    var make = _.unary(_.curry(glean)(persist.entities.Role.cfg));
    var merge = _.unary(_.curry(_.assign, 2)(_, defaults));
    var includes = _.chain(candidates)
      .map(make)
      .map(merge)
      ;
    res.locals.suggestion = { includes };
    return next( );

  }

  function store_group_inclusions (req, res, next) {
    var inclusions = _.chain(res.locals.suggestion.includes)
      .map(function (elem, i) {
        elem.id = persist.genid( );
        return elem
      }).valueOf( );
    return persist.entities.Role.db.add(inclusions).then(function (err) {
      // res.locals.inserted = inserted;
      res.locals.inserted = {
        includes: inclusions
      };
      next( );
    })
    .catch(next);
  }

  function search_inclusions (req, res, next) {
    var required = ['identity_type', 'identity_spec'];
    console.log('user', req.user);
    var query = {
      identity_type: 'email',
      identity_spec: req.user.traits.email
    };

    console.log("QUERY", req.query);
    res.locals.query = query;
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    return ACL.db.findBy(query).paginate(pagination).then(function (includes) {
      res.locals.query = query;
      res.locals.pagination = pagination;
      res.locals.results = includes;
      next( );
    });

  }

  function suggest_join_spec (req, res, next) {
    var required = [ 'group_id', 'group_spec_id', 'policy_id', 'expected_name'];
    var incoming = _.merge({ }, req.body, req.query, req.params);
    console.log('user', req.user);
    var defaults = {
      identity_type: 'email',
      identity_spec: req.user.traits.email
    };
    var query = _.merge({ }, _.pick(incoming, required), defaults);
    var props = { subject: req.user.id };

    console.log("QUERY", req.query);
    res.locals.query = query;
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    var glean = _.unary(_.curry(_.pick, 2)(_, required));
    var assign = _.unary(_.curry(_.assign, 2)(_, props));
    return ACL.db.findBy(query).limit(1).then(function (includes) {
      console.log("FOUND", includes);
      res.locals.join = _.chain(includes).map(glean).map(assign);
      next( );
    });

  }

  function record_joined_group (req, res, next) {
    function genid (o) {
      o.id = persist.genid( );
      return o;
    }
    var payload = _(res.locals.join).map(genid).valueOf( );
    JoinGroup.db.add(payload).then(function (err) {
      res.locals.err = err;
      res.locals.inserted = payload;
      next(err);

    }).catch(next);

  }

  function privy_id (req, res, next) {
    var id = req.params.identity;
    sdk.adminGetIdentity(id)
      .then(function (result) {
        console.log("RESULT", result.data);
        res.locals.identity = req.user = result.data;
        next( );
      })
      .catch(next);
  }

  factory.handlers = {
    privy_id
  , suggest_generic_inclusion_payload
  , store_group_inclusions
  , search_inclusions
  , suggest_join_spec
  , record_joined_group


  };

  return factory;

}

module.exports = exports = configure;
