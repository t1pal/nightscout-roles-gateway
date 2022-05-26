
const _ = require('lodash');

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

  var site_policy_details_cfg = {
    table: 'permission_assignment_activities',
    kind: 'ScheduledGroupPolicy',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var site_policy_overview_cfg = {
    table: 'site_policy_overview',
    kind: 'ScheduledGroupPolicies',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };


  var ACL = persist(acl_cfg);
  var Group = persist(group_cfg);
  var GroupDefinitions = persist.entities.Group;
  var SitePolicyDetails = persist(site_policy_details_cfg);
  var SitePolicyOverview = persist(site_policy_overview_cfg);

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

  function get_groups_unassigned (req, res, next) {
    var query = { owner_ref: req.params.owner_ref, num_sites_used: 0 };
    res.locals.query = query;
    Group.db.findBy(query).then(function (groups) {
      res.locals.data = groups;
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
    var pagination = {
      perPage: 10
    };
    Group.db.findBy(query)
      .join('group_inclusion_specs', 'group_inclusion_specs.group_definition_id', 'owner_group_usage.group_id')
    .paginate(pagination)
    .then(function (groups) {

      res.locals.query = query;
      res.locals.pagination = pagination;
      res.locals.results = groups;
      next( );
    }).catch(next);
  }


  function glean (cfg, attrs) {
    var allowed = [].concat(cfg.mutable);
    var updates = _.pick(attrs, allowed);
    var disallowed = persist.readonly_props.concat(cfg.readonly);
    if (cfg.strict) {

    }
    return updates;
  }

  function forge (cfg, attrs) {
    var allowed = [].concat(cfg.required).concat(cfg.mutable);
    var suggest = _.pick(attrs, allowed);
    var disallowed = _.difference(persist.readonly_props.concat(cfg.readonly), cfg.required);
    if (cfg.strict) {

    }
    return suggest;
  }

  function suggest_policy_payload (req, res, next) {
    var incoming = _.merge({}, req.body, req.query, req.params);
    var keepers = [ 'nickname', 'synopsis', 'notes', 'policy_name', 'policy_note', 'schedule_type', 'fill_pattern', 'schedule_segments', 'resort', 'reassign_group_id', 'policy_id', 'operation' ];
    var required = [ 'owner_ref', 'expected_name', 'group_id', 'policy_type', 'policy_spec' ];
    var prop_names = keepers.concat(required);
    var defaults = {
      // group_definition_id: req.params.group_id
      // site_id: incoming.id
    };
    var candidate =_.merge({ }, _.pick(incoming, required), defaults, _.pick(incoming, keepers));
    res.locals.suggestion = candidate;
    next( );

  }

  function get_policy_overview (req, res, next) {
    var query = _.pick(_.merge({ }, req.query, req.params), [ 'owner_ref', 'expected_name' ]);
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    SitePolicyOverview.db.findBy(query)
      .orderBy('sort', 'DESC')
      .paginate(pagination)
      .then(function (policies) {
        res.locals.query = query;
        res.locals.pagination = pagination;
        res.locals.results = policies;
        next( );
      });

  }

  function create_suggested_policy (req, res, next) {
    var payload = _.clone(res.locals.suggestion);
    var filter = _.pick(_.merge({}, req.body, req.query, req.params), ['owner_ref', 'expected_name', 'group_id', 'id']);
    payload.id = persist.genid( );
    if (!_.some([payload.schedule_type, payload.schedule_segments, payload.fill_pattern], _.isEmpty)) {
      payload.schedule_id = persist.genid( );
    }
    payload.id = persist.genid( );
    if (_.isEmpty(_.pick(payload, ['owner_ref', 'expected_name', 'group_id', 'policy_type', 'policy_spec'])) || req.query.dryrun) {
      res.locals.payload = payload;
      return next( );
    }
    console.log('UPSERTING', payload, filter);
    SitePolicyDetails.db.add(payload).then(function (err) {
      res.locals.inserted = {
        err
      , payload 
      };
      next(err);

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
    var required = ['group_definition_id', 'identity_type', 'identity_spec'];
    var query = {
      group_definition_id: req.params.group_id
    };
    console.log("QUERY", req.query);
    query = _.pick(_.merge(query, req.query, req.params), required);
    res.locals.query = query;
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    return persist.entities.Role.db.findBy(query).paginate(pagination).then(function (includes) {
      res.locals.query = query;
      res.locals.pagination = pagination;
      res.locals.results = includes;
      next( );
    });

  }

  function remove_inclusions (req, res, next) {
    var required = ['group_definition_id', 'identity_type', 'identity_spec'];
    var query = {
      group_definition_id: req.params.group_id
    };
    query = _.pick(_.merge(query, req.query, req.params), required);
    res.locals.query = query;
    return persist.entities.Role.db.remove(query).then(function (includes) {
      res.status(204);
      res.locals.removed = includes;
      next( );
    });

  }

  function remove_user_group (req, res, next) {
    var required = ['id'];
    var query = {
      id: req.params.group_id
    };
    query = _.pick(_.merge(query, req.query, req.params), required);
    res.locals.query = query;
    return persist.entities.Group.db.remove(query).then(function (includes) {
      res.status(204);
      res.locals.removed = includes;
      next( );
    });

  }

  function suggest_group_payload (req, res, next) {
    res.locals.suggestion.owner_ref = req.params.owner_ref;
    var incoming = _.merge({}, req.body, req.query, req.params);
    var candidate = {
      group: _.clone(res.locals.suggestion)
    , includes: [ ]
    };
    var first = { identity_type: incoming.identity_type, identity_spec: incoming.identity_spec };
    if (first.identity_spec && first.identity_spec) {
      candidate.includes.push(first);
    }
    if (!_.isObject(incoming.includes)
      && _.isString(incoming.includes.identity_type)
      && _.isString(incoming.includes.identity_spec)) {
      first = { identity_type: incoming.identity_type, identity_spec: incoming.identity_spec };
    }
    if (!_.isEmpty(incoming.includes)) {
      if (_.isArray(incoming.includes.identity_type) && _.isArray(incoming.includes.identity_spec) && incoming.includes.identity_type.length == incoming.includes.identity_spec.length) {
        candidate.includes = candidate.includes.concat(_.fill(Array(incoming.includes.identity_type.length), 0).map(function (elem, i) {
          return {
            identity_type: incoming.includes.identity_type[i]
          , identity_spec: incoming.includes.identity_spec[i]
          };
        }));

      } else {

        candidate.includes = candidate.includes.concat(_.filter(incoming.includes, 'identity_spec'));

      }
    }
    console.log("INCOMING INCLUDES", candidate.includes);
    // var merge = _.unary(_.curry(_.assign, 2)(_, _.clone(candidate.group)));
    // var merge = _.assign(_.result, _.clone(candidate.group));
    var make = _.unary(_.curry(glean)(persist.entities.Role.cfg));
    var includes = _.chain(candidate.includes)
      .map(make)
      // .map(merge)
      ;
    candidate.includes = includes;
    res.locals.suggestion = candidate;


    next( );

  }

  function create_user_group (req, res, next) {
    var fields = _.clone(res.locals.suggestion.group);
    fields.id = persist.genid( );
    var inclusions = _.chain(res.locals.suggestion.includes)
      .map(function (elem, i) {
        elem.id = persist.genid( );
        elem.group_definition_id = fields.id;
        return elem
      }).valueOf( );
    if (_.isEmpty(fields) || req.query.dryrun) {
      res.locals.payload = { group: fields, includes: inclusions };
      return next( );
    }

    GroupDefinitions.db.add(fields).then(function (err) {
      if (err) {
        return next(err);
      }
      return req.entity.db.findById(fields.id).then(function (inserted) {

        res.locals.inserted = inserted;
        return persist.entities.Role.db.add(inclusions).then(function (err) {
          // res.locals.inserted = inserted;
          res.locals.inserted = {
            group: inserted
          , includes: inclusions
          };
          next( );
        })
        .catch(next);

      }).catch(next);
    })
    .catch(next);
  }

  factory.handlers = {
    get_owner_acls
  , get_site_acls
  , get_groups_overview
  , get_group_details
  , get_groups_unassigned
  , suggest_group_payload
  , create_user_group
  , suggest_generic_inclusion_payload
  , store_group_inclusions
  , search_inclusions
  , remove_inclusions
  , remove_user_group
  , suggest_policy_payload
  , create_suggested_policy
  , get_policy_overview


  };

  return factory;

}

module.exports = exports = configure;
