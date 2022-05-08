
const _ = require('lodash');

function configure (opts, server, persist) {

  var schema = {
    mutable: [ ].concat(persist.entities.Site.mutable),
    required: [ 'owner_ref', 'expected_name', 'upstream_origin' ],
    readonly: [ 'owner_ref', 'expected_name' ],
    banned: ['id'],
    defaults: {
      defaultGroup: {
        nickname: "Default"
      , audience: "all"
      , permission: "allow"
      }

    }

  };
  function factory (cfg) {
    function handler (req, res, next) {
      next( );
    }
    return handler;
  }

  function suggest_registration (req, res, next) {
    var incoming = { };
    _.merge(incoming, req.body, req.query, req.params);

    var banned = _.pick(incoming, schema.banned);
    if (!_.isEmpty(banned)) {
      res.status(400);
      res.json({ banned });
      next(new Error(banned));
    }

    var missing = _.difference(schema.required, _.keys(_.pick(incoming, schema.required)));
    if (!_.isEmpty(missing)) {
      res.status(400);
      res.json({ missing: missing });
      next(new Error(missing));

    }

    var payload = incoming;
    var defaultGroup = _.merge({ }, schema.defaults, req.body, req.query, req.params).defaultGroup;
    var group = { owner_ref: payload.owner_ref, nickname: defaultGroup.nickname };
    var inclusion = { identity_type: 'anonymous', identity_spec: defaultGroup.audience };
    var policy = { policy_name: group.nickname, policy_type: 'default', policy_spec: defaultGroup.permission };
    var registration_request = {
      id: null
    , owner_ref: payload.owner_ref
    , expected_name: payload.expected_name
    , upstream_origin: payload.upstream_origin
    , api_secret: payload.api_secret || null
    , group_id: null
    , group_name: group.nickname
    , group_spec_id: null
    , identity_type: inclusion.identity_type
    , identity_spec: inclusion.identity_spec
    , policy_id: null
    , policy_name: policy.policy_name
    , policy_type: policy.policy_type
    , policy_spec: policy.policy_spec

    };

    res.locals.suggestion = req.registration = { Site: payload, Group: group, Role: inclusion, Policy: policy, Request: registration_request };
    next( );
  }

  var registration_cfg = {
    table: 'site_registration_initializations',
    kind: 'Site',
    required: schema.required,
    search_singular: [ "id" ],
    mutable: schema.mutable, // .concat([ ])
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };
  var Registrations = persist(registration_cfg);
  // server.store('')

  function insert_new_site_registration (req, res, next) {
    if (res.locals.registration) {
      res.status(400);
      var err = new Error("pre-existing");
      res.json({ok: false, err });
      return next(err);
    }
    var payload = _.clone(req.registration.Request);
    payload.id = persist.genid( );
    payload.group_id = persist.genid( );
    payload.group_spec_id = persist.genid( );
    payload.policy_id = persist.genid( );
    Registrations.db.add(payload).then(function (new_registration) {
      console.log("INSERTED Site", payload, new_registration, arguments);
      Registrations.db.findById(payload.id).then(function (new_site) {
        res.locals.workflow = {
          type: 'registration',
          payload: payload,

          inserted: {
            error: new_registration,
            registration: new_site
          }
        };
        next( );
      }).catch(next);
    }).catch(next);
  }

  function insert_new_site_registration_old (req, res, next) {
    if (res.locals.registration) {
      res.status(400);
      var err = new Error("pre-existing");
      res.json({ok: false, err });
      return next(err);
    }

    var site = req.registration.Site;
    site.id = persist.genid( );
    persist.entities.Site.db.add(site).then(function (new_site) {
      console.log("INSERTED Site", site, arguments);
      var group = req.registration.Group;

      group.id = persist.genid( );
      persist.entities.Group.db.add(group).then(function (new_group) {
        console.log("INSERTED Group", group, arguments);
        var role = req.registration.Role;

        role.id = persist.genid( );
        role.group_definition_id = group.id;
        persist.entities.Role.db.add(role).then(function (new_role) {
          console.log("INSERTED Role", role, arguments);
          var policy = req.registration.Policy;

          policy.id = persist.genid( );
          policy.site_id = site.id;
          policy.group_definition_id = group.id;
          persist.entities.Policy.db.add(policy).then(function (new_policy) {
            console.log("INSERTED Policy", policy, arguments);
            res.locals.workflow = {
              type: 'registration',
              inserted: {
                site: new_site,
                group: new_group,
                role: new_role,
                policy: new_policy
              }
            };
            next( );
          }).catch(next);

        }).catch(next);

      }).catch(next);

    }).catch(next);

  }

  function find_existing (req, res, next) {
    var query = { owner_ref: req.params.owner_ref, expected_name: req.params.expected_name };
    persist.entities.Site.db.findById(query.expected_name, '*', 'expected_name').andWhere(query).then(function (registration) {
      res.locals.registration = registration;
      next( );
    }).catch(next);

  }

  function delete_resources_for_reset (req, res, next) {
    var existing = res.locals.registration;
    var site = {
      resource: {
        role: {
          id: existing.id
        },
        policy: {
          site_id: existing.id
        },
        schedules: {
          'scheduled_policies.site_id': existing.id
        }
      }
    };

    persist.entities.Policy.db.remove(site.resource.policy).then(function (num) {
    });

  }

  function perform_factory_reset (req, res, next) {
    if (res.locals.registration) {
      console.log("REGISTERED factory reset for", res.locals.registration);
    }
    var payload = _.clone(req.registration.Request);
    payload.id = res.locals.registration.id;
    payload.group_id = persist.genid( );
    payload.group_spec_id = persist.genid( );
    payload.policy_id = persist.genid( );
    payload.factory_reset = 1;
    console.log("REQUEST FOR RESET", payload);
    var filter = { owner_ref: payload.owner_ref, expected_name: req.params.expected_name };
    res.locals.reset_request = payload;
    Registrations.db.update(payload, filter).then(function (new_registration) {
      console.log("ERROR", new_registration);
      Registrations.db.findById(payload.id).then(function (new_site) {
        console.log('RESETTED', new_site);
        res.locals.workflow = {
          type: 'registration',
          payload: payload,

          updated: {
            error: new_registration,
            registration: new_site
          }
        };
        next( );
      }).catch(next);

    }).catch(next);
  }


  function update_registration (req, res, next) {
    var fields = _.pick(_.cloneDeep(req.registration), schema.mutable);
    var filter = { owner_ref: req.params.owner_ref, expected_name: req.params.expected_name };
    persist.entities.Site.db.update(fields, filter).then(function (updated) {
      res.locals.updated = fields;
      res.locals.registration = updated;
      next( );
    })
    .catch(next);;

  }

  factory.handlers = {
    suggest_registration
  , insert_new_site_registration
  , update_registration
  , find_existing
  , perform_factory_reset
  };

  return factory;

}

module.exports = exports = configure;
