
const KnexHelpers = require('knex-db-helpers');
const _ = require('lodash');
const SUID = require('short-unique-id');
const errors = require('restify-errors');

function config (opts, server) {
  var genid = new SUID({ length: 64, dictionary: 'hex'});

  const readonly_props = ['id', '_idx', 'created_at', 'updated_at', 'kind' ];
  var sites = {
    table: 'registered_sites',
    kind: 'Site',
    required: ['owner_ref', 'expected_name', 'upstream_origin' ],
    // optional: [ 'nickname', 'is_enabled',  'require_identities', 'exempt_matching_api_secret', 'client_app', 'api_secret', 'admin_spec'],
    search_singular: ['id', '_idx', 'expected_name'],
    mutable: [ 'nickname', 'is_enabled',  'require_identities', 'exempt_matching_api_secret', 'client_app', 'api_secret', 'admin_spec', 'upstream_origin'],
    readonly: ['owner_ref', 'expected_name', 'hashed_api_secret' ],
    properties: {
    }
  };

  var groups = {
    table: 'group_definitions',
    kind: 'Group',
    required: [ "owner_ref", "nickname" ],
    search_singular: [ "owner_ref", "id","_idx" ],
    mutable: [ "nickname", "long_name", "description", "deny_access" ],
    readonly: ['owner_ref' ],
    properties: {
    }
  };

  var roles = {
    table: 'group_inclusion_specs',
    kind: 'Role',
    required: [ "group_definition_id" ],
    search_singular: [ "group_definition_id" ],
    mutable: [ "nickname", "synopsis", "notes", "identity_type", "identity_spec" ],
    readonly: [ "group_definition_id" ],
    properties: {
    }
  };

  var policies = {
    table: 'connection_policies',
    kind: 'Policy',
    required: [ "site_id", "group_definition_id", "policy_name", "policy_type", "policy_spec" ],
    search_singular: [ ],
    mutable: [ "policy_name", "policy_note", "policy_type", "policy_spec" ],
    readonly: [ "site_id", "group_definition_id" ],
    properties: {
    }
  };

  var schedules = {
    table: 'scheduled_policies',
    kind: 'Schedule',
    required: [ "policy_id", "schedule_nickname", "fill_pattern", "schedule_segments" ],
    search_singular: [ "policy_id" ],
    mutable: [ "schedule_nickname", "schedule_type", "fill_pattern", "schedule_segments", "schedule_description" ],
    readonly: [ "policy_id" ],
    properties: {
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
    var payload = { };
    _.merge(payload, req.body, req.query);
    var disallowed = _.difference(readonly_props.concat(req.entity.cfg.readonly), req.entity.cfg.required);
    var banned = _.pick(payload, disallowed);
    var allowed = [].concat(req.entity.cfg.required).concat(req.entity.cfg.mutable);
    var suggest = _.pick(payload, allowed);
    console.log('inspecting insert', payload, suggest, banned, 'rejecting', !_.isEmpty(banned));
    if (!_.isEmpty(banned)) {
      var err = new errors.BadRequestError({message: 'disapplowed properties', info: banned, context: banned}, "disallowed properties");
      next(err);
      return;
    }
    suggest.kind = req.entity.cfg.kind;
    req.suggestion = suggest;
    res.locals.suggestion = suggest;
    next( );

  }

  function propose_update (req, res, next) {
    var payload = { };
    _.merge(payload, req.body, req.query);
    var banned = _.pick(payload, readonly_props.concat(req.entity.cfg.readonly));
    var allowed = [].concat(req.entity.cfg.mutable);
    var updates = _.pick(payload, allowed);
    if (!_.isEmpty(banned)) {
      var err = new errors.BadRequestError({message: 'disapplowed properties', info: banned, context: banned}, "disallowed properties");
      next(err);
      return;
    }
    req.updates = updates;
    next( );

  }

  function fetch_by_id (req, res, next) {
    var query = { id: req.params.id };
    res.locals.query = query;
    req.entity.db.findBy(query).then(function (found) {
      if (found.length != 1) {
        res.status(404);
      }
      res.locals.data = found[0];
      next( );
    })
    .catch(next);
  }

  function pull_result_prop (req, res, next) {
    res.locals = _.result(res.locals.data, req.params.attr);
    next( );
  }

  function filter_prop_update (req, res, next) {

    console.log("UPDATES", req.updates);
    console.log("changing only prop", req.params.attr);
    req.updates = _.pick(req.updates, req.params.attr);
    res.locals.data = req.updates;
    next( );
  }

  function process_insert (req, res, next) {
    var fields = _.cloneDeep(req.suggestion);
    // forge
    fields.id = genid( );
    console.log("INSERTING", fields);
    req.entity.db.add(fields).then(function (err) {
      console.log("INSERTED", arguments);
      if (err) {
        return next(err);
      }
      return req.entity.db.findById(fields.id).then(function (inserted) {

        res.locals.inserted = inserted;
        res.status(201);
        next( );
      });
    })
    .catch(next);
  }

  function exclude_readonly_prop_edits (req, res, next) {
    if (_.includes(readonly_props.concat(req.entity.cfg.readonly), req.params.attr)) {
      var err = new errors.BadRequestError({ info: req.params }, "cannot change read only property");
      return next(err);
    }
    next( );
  }

  function prepare_prop_delete_update (req, res, next) {
    var update = { };
    update[req.params.attr] = null;
    req.updates = update;
    res.locals.data = req.updates;
    next( );
  }

  function process_update_by_id (req, res, next) {
    var fields = _.cloneDeep(req.updates);
    var filter = { id: req.params.id };
    req.entity.db.update(fields, filter).then(function (err) {
      if (err) {
        return next(err);
      }
      res.locals.updated = fields;
      next( );
    })
    .catch(next);;
  }

  function process_delete_by_id (req, res, next) {
    var filter = { id: req.params.id };
    req.entity.db.remove(filter).then(function (removed) {
      res.locals.removed = removed;
      res.status(204);
      next(removed);
    })
    .catch(next);;
  }


  make.genid = genid;
  make.handlers = {
    elect_entity_table
  , elect_entity
  , get_entity_requirements
  , propose_entity_insert
  , propose_update
  , process_insert
  , process_update_by_id
  , fetch_by_id
  , process_delete_by_id
  , pull_result_prop
  , filter_prop_update
  , exclude_readonly_prop_edits
  , prepare_prop_delete_update
  };

  return make;

}

module.exports = exports = config;
