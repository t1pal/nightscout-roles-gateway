
var axios = require('axios');
var url = require('url');
var path = require('path');
const _ = require('lodash');
const crypto = require('crypto');

  /*
  *
  status, synopsis,
  breakdown: passing, warning, problem
  results
    criterium
      name
      property
      criteria
      harness // evaluate
      outcome
      passing
      mandatory

  harness  property criteria
  validate $upstream_origin acceptable
  http     /api/v1/status.json  reachable
  http     /api/v1/status.json  Nighscout version
  http     /api/v1/entries.json  reachable
  http     /api/v1/entries.json  has_data optional
  http     /api/v1/treatments.json  reachable
  http     /api/v1/treatments.json  has_data optional
  http     /api/v1/devicestatus.json  reachable
  http     /api/v1/devicestatus.json  has_data optional
  http     /api/v1/profiles.json  reachable
  http     /api/v1/profiles.json  has_data optional
  security /api/v3/version  handshake

  validate $api_secret acceptable

  security /api/v1/status.json authenticated
  security /api/v1/experiments/test handshake
  security /api/v1/verifyauth handshake

  subjects /api/v2/authorization/subjects list
  subjects /api/v2/authorization/subjects with-vetted-list
  roles    /api/v2/authorization/roles with-vetted-list
  JWTS     /api/v2/authorization/request/token issue
  * 
  */

function check_api_secret_syntax (api_secret) {
  return api_secret.length > 11;
}

function static_analysis (cfg) {
  var results = [ ];
  var outcome = check_api_secret_syntax(cfg.api_secret);
  var info = {
    group: 'Nightscout API Secret',
    property: 'api secret',
    criteria: 'must be minimum length',
    outcome: `api secret length is ${cfg.api_secret.length}`,
    passing: outcome,
    mandatory: true
  };

  results.push(info);
  var link = url.parse(cfg.upstream_origin);
  results.push({
    group: 'Nightscout URL',
    property: 'url syntax',
    criteria: 'should have a hostname',
    outcome: `hostname is ${link.hostname}`,
    passing: link.hostname && link.hostname != "" && link.hostname.length && true,
    mandatory: true
  });
  return Promise.resolve(results);

}

function basic_api_inspection (cfg) {
  var results = [ ];
  var remote = axios.create({
    baseURL: cfg.upstream_origin
  });

  function audit (resolve, reject) {
    function analyze_response (nightscout) {
      console.log("ANALYZE NIGHTSCOUT REPSONES", nightscout, arguments);
      var status = nightscout.status || 'unreachable';
      results.push({
        group: 'Nightscout API',
        property: 'status endpoint',
        criteria: 'must be ok',
        outcome: `nightscout api status endpoint is ${status}`,
        passing: status == 200,
        mandatory: true

      });

      resolve(results);
    }

    console.log("ABOUT TO REQUEST", cfg.upstream_origin, url.parse(cfg.upstream_origin));
    if (_.isEmpty(url.parse(cfg.upstream_origin).hostname)) {
      results.push({
        group: 'Nightscout API',
        property: 'status endpoint',
        criteria: 'must be ok',
        outcome: 'nightscout api status endpoint is unreachable',
        passing: false,
        mandatory: true
      });
      return resolve(results);
    }

    console.log("WILL REQUEST", cfg.upstream_origin);
    remote.get('/api/v1/status.json')
      .then(analyze_response).catch(analyze_response);

  }
  return new Promise(audit);
}

function api_secret_api_inspection (cfg) {
  var results = [ ];
  var shasum = crypto.createHash('sha1');
  shasum.update(cfg.api_secret);
  var remote = axios.create({
    baseURL: cfg.upstream_origin
  , headers: { 'API-SECRET': shasum.digest('hex') }
  });

  function audit (resolve, reject) {
    function analyze_response (nightscout) {
      console.log("ANALYZE NIGHTSCOUT REPSONES", nightscout, arguments);
      var status = nightscout.status || 'unreachable';
      results.push({
        group: 'Nightscout API with API Secret',
        property: 'status endpoint',
        criteria: 'must be ok',
        outcome: `nightscout api status endpoint is ${status}`,
        passing: status == 200,
        mandatory: true

      });

      resolve(results);
    }

    console.log("ABOUT TO REQUEST", cfg.upstream_origin, url.parse(cfg.upstream_origin));
    if (_.isEmpty(url.parse(cfg.upstream_origin).hostname)) {
      results.push({
        group: 'Nightscout API with API Secret',
        property: 'status endpoint',
        criteria: 'must be ok',
        outcome: 'nightscout api status endpoint is unreachable',
        passing: false,
        mandatory: true
      });
      return resolve(results);
    }

    console.log("WILL REQUEST", cfg.upstream_origin);
    remote.get('/api/v1/status.json')
      .then(analyze_response).catch(analyze_response);

  }
  return new Promise(audit);
}


function configure ( ) {

  function harness (cfg) {

    var inspections = [
      static_analysis(cfg)
    , basic_api_inspection(cfg)
    , api_secret_api_inspection(cfg)
    ];

    return Promise.all(inspections).then(function (results) {
      return Promise.resolve(_.flatten(results));
    });

  }

  function create (cfg) {
    return harness(cfg);
  }


  function describe (findings, requirements) {
    var filter = _.curry(_.filter, 2)(findings);
    var details = {
      passing: filter({ passing: true }).length
    , warning: filter({ passing: false, mandatory: false }).length
    , rejects: filter({ passing: false, mandatory: true }).length
    };
    var acceptable = details.rejects == 0;
    var status = acceptable ? 'OK' : 'not ok';
    var admonition = 'Nightscout is ' + status + '.';
    if (details.warning) {
      var issue = details.warning > 1 ? 'details' : 'detail';
      admonition = admonition + `  There are ${details.warning} ${issue} that may indicate a need for additional action to work as expected.`;
    }
    var fatal = '';
    if (details.rejects) {
      var issue = details.rejects > 1 ? 'issues' : 'issue';
      fatal = `  There are ${details.rejects} serious ${issue} that require additional action in order to work.`;
    }

    var txt = `${admonition}${fatal}`;
    var result = { txt, status, acceptable, details };
    return Promise.resolve(result);

  }

  create.describe = describe;
  return create;

}
module.exports = exports = configure;
