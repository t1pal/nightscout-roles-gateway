
const KnexHelpers = require('knex-db-helpers');
const _ = require('lodash');

function config (opts, server) {
  var sites = {
    table: 'registered_sites',
    kind: 'Site',
    required: ['owner_ref', 'expected_name', 'upstream_origin' ],
    optional: [ 'nickname', 'is_enabled',  'require_identities', 'exempt_matching_api_secret', 'client_app', 'api_secret', 'admin_spec'],
    readonly: ['id', '_idx', 'created_at', 'updated_at', 'kind', ''],
    properties: {
    },
    forge: function (attrs) {
    }
  };

  var groups = {
    table: 'group_definitions',
    kind: 'Group',
    properties: {
    },
    forge: function (attrs) {
    }
  };

  var roles = {
    table: 'group_inclusion_specs',
    kind: 'Role',
    properties: {
    },
    forge: function (attrs) {
    }
  };

  var policies = {
    table: 'connection_policies',
    kind: 'Policy',
    properties: {
    },
    forge: function (attrs) {
    }
  };

  var schedules = {
    table: 'scheduled_policies',
    kind: 'Schedule',
    properties: {
    },
    forge: function (attrs) {
    }
  };

  function make (cfg) {
    var table = cfg.table;
    var db = new KnexHelpers(server.store, table);
    var knex = server.store(table);
    var entity = {db: db, knex, cfg };
    return entity;

  };

  var entities = {
    Site: make(sites),
    Group: make(groups),
    Role: make(roles),
    Policy: make(policies),
    Schedules: make(schedules)
  };

  make.entities = entities;

  function elect_entity_table (req, res, next) {
    req.entity = entities[req.params.table];
    next( );
  }

  function elect_entity (req, res, next) {
    req.entity = entities[req.params.kind];
    next( );
  }

  function get_entity_requirements (req, res, next) {
    var requirements = req.entity.cfg;
    res.locals.proposal = requirements;
    next( );

  }

  function propose_entity_insert (req, res, next) {
    var suggest = _.pick(req.body, req.entity.cfg.required);
    _.merge(suggest
      , _.pick(req.query, req.entity.cfg.required)
      , _.pick(req.body, req.entity.cfg.optional)
      , _.pick(req.query, req.entity.cfg.optional));
    suggest.kind = req.entity.cfg.kind;
    req.suggestion = suggest;
    res.locals.suggestion = suggestion;
    next( );

  }

  function propose_update (req, res, next) {
    var suggest = _.pick(req.body, req.entity.cfg.required);
    _.merge(suggest, _.pick(req.query, req.entity.cfg.required));
    _.merge(suggest, _.pick(req.body, req.entity.cfg.optional));
    _.merge(suggest, _.pick(req.query, req.entity.cfg.optional));
    var updates = _.omit(suggest, req.entity.cfg.readonly);
    req.updates = updates;
    next( );

  }

  function process_insert (req, res, next) {
    var fields = req.entity.cfg.forge(req.suggestion);
    req.entity.db.add(fields).then(function (inserted) {
      res.locals.inserted = inserted;
      next( );
    })
    .catch(next);
  }


  function process_update (req, res, next) {
    var fields = req.updates;
    var filter = { id: req.params.id };
    req.entity.db.update(fields, filter).then(function (inserted) {
      res.locals.inserted = inserted;
      next( );
    })
    .catch(next);;
  }


  make.handlers = {
    elect_entity_table
  , elect_entity
  , get_entity_requirements
  };

  return make;

}

module.exports = exports = config;
