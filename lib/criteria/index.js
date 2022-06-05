
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

  factory.handlers = {
    triage
  , suggest_audit_config
  };

  return factory;

}

module.exports = exports = configure;

