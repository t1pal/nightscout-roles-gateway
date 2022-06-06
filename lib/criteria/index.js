
const _ = require('lodash');
const Core = require('./core');

function configure (opts, server, persist) {

  /*
  *
  status, synopsis,
  breakdown: passing, warning, problem
  results
    criterium
      name
      property
      criteria
      evaluate
      outcome
      passing
      mandatory
  * 
  */

  var nightscout_secrets_cfg = {
    table: 'nightscout_secrets',
    kind: 'Group',
    required: [ ],
    search_singular: [ "id" ],
    mutable: [ ],
    readonly: [ 'id', 'owner_ref' ],
    properties: {
    }
  };

  var ns_details_cfg = {
    table: 'nightscout_inspection_details',
  };

  var ns_results_cfg = {
    table: 'nightscout_inspection_results',
  };

  var NightscoutSecrets = persist(nightscout_secrets_cfg);
  var AuditDetails = persist(ns_details_cfg);
  var AuditResults = persist(ns_results_cfg);

  const core = Core(opts);
  function factory (cfg) {

  }

  function triage (req, res, next) {
    var opt = req.audit_request;
    core(opt).then(function audited (findings) {
      return core.describe(findings, { }).then(function (synopsis) {
        res.locals.audit = findings;
        res.locals.synopsis = synopsis;
        next( );
      });
    }).catch(next);
  }

  function suggest_audit_config (req, res, next) {
    var audit_request = _.pick(_.merge({ }, req.body, req.query, req.params), ['upstream_origin', 'api_secret']);
    req.audit_request = audit_request;
    next( );

  }

  function existing_audit_config (req, res, next) {
    var registered = res.locals.registration;
    var query = {
      expected_name: registered.expected_name
    };
    NightscoutSecrets.db.findById(query.expected_name, '*', 'expected_name').then(function (found) {
      var audit_request = {
        upstream_origin: registered.upstream_origin
      , api_secret: found.api_secret
      };
      req.audit_request = audit_request;
      next( );
    }).catch(next);

  }

  function record_triaged_criteria (req, res, next) {
    var results_payload = _.clone(res.locals.synopsis);
    var details_payload = _.clone(res.locals.audit);
    var fields = {
      owner_ref: res.locals.registration.owner_ref
    , upstream_origin: res.locals.registration.upstream_origin
    , expected_name: res.locals.registration.expected_name
    , synopsis: results_payload.txt
    , status: results_payload.status
    , acceptable: results_payload.acceptable
    };
    fields.id = persist.genid( );
    var details = _.chain(details_payload)
      .map(function (elem, i) {
        elem.id = persist.genid( );
        elem.audit_id = fields.id;
        elem.owner_ref = fields.owner_ref;
        elem.expected_name = fields.expected_name;
        elem.upstream_origin = fields.upstream_origin;
        return elem
      }).valueOf( );
    res.locals.inserted = {
      audit: { request: details }
    , synopsis: { request: fields }
    };
    console.log("INSERT AUDIT", details);
    return AuditResults.db.add(fields).then(function (results_addition) {
      console.log("ADDED RESULTS", results_addition);
      res.locals.inserted.synopsis.reply = results_addition;
      return AuditDetails.db.add(details).then(function (details_addition) {
        res.locals.inserted.audit.reply = details_addition;
        next( );
      });
    }).catch(next);
  }

  function fetch_audit_summaries (req, res, next) {
    var query = _.pick(_.merge({ }, req.query, req.params), [ 'owner_ref', 'expected_name', 'audit_id' ]);
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    AuditResults.db.findBy(query).paginate(pagination).then(function (results) {
        res.locals.query = query;
        res.locals.pagination = pagination;
        res.locals.results = results;
        next( );
    }).catch(next);
  }

  function fetch_audit_details (req, res, next) {
    var query = _.pick(_.merge({ }, req.query, req.params), [ 'owner_ref',
      'expected_name', 'audit_id', 'upstream_origin', 'group', 'property',
      'outcome', 'criteria', 'passing' , 'mandatory']);
    var page_props = ['perPage', 'currentPage', 'from', 'to'];
    var pagination = _.pick(_.merge({ perPage: 10 }, req.query), page_props);
    AuditResults.db.findById(query.audit_id).then(function (summary) {
      AuditDetails.db.findBy(query).paginate(pagination).then(function (details) {
        core.describe(details.data, { }).then(function (synopsis) {
          res.locals.query = query;
          res.locals.pagination = pagination;
          res.locals.synopsis = _.merge(synopsis, summary);
          res.locals.audit = details.data;
          res.locals.results = details;
          next( );
        });
      });
    }).catch(next);
  }

  factory.handlers = {
    triage
  , suggest_audit_config
  , existing_audit_config
  , record_triaged_criteria
  , fetch_audit_summaries
  , fetch_audit_details
  };

  return factory;

}

module.exports = exports = configure;

