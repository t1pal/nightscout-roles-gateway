
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


  var ACL = persist(acl_cfg);
  var Group = persist(group_cfg);
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
      var first = { identity_type: incoming.identity_type, identity_spec: incoming.identity_spec };
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

        console.log('maybe', incoming.includes.length);
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


  };

  return factory;

}

module.exports = exports = configure;
