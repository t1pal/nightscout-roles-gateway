
var axios = require('axios');
var url = require('url');
var path = require('path');
const _ = require('lodash');
const crypto = require('crypto');


function configure (opts, server, persist) {

  function list_available_nightscout_tokens (cfg) {
    var results = [ ];
    var shasum = crypto.createHash('sha1');
    shasum.update(cfg.api_secret);
    var remote = axios.create({
      baseURL: cfg.upstream_origin
    , headers: { 'API-SECRET': shasum.digest('hex') }
    });

    function audit (resolve, reject) {
      function respond (nightscout) {
        resolve(results);
      }

      function reply (nightscout) {
        results = results.concat(nightscout.data);
        resolve(results);
      }

      console.log("ABOUT TO REQUEST", cfg.upstream_origin, url.parse(cfg.upstream_origin));
      if (_.isEmpty(url.parse(cfg.upstream_origin).hostname)) {
        return resolve(results);
      }

      console.log("WILL REQUEST", cfg.upstream_origin);
      remote.get('/api/v2/authorization/subjects')
        .then(reply).catch(respond);

    }
    return new Promise(audit);
  }


  function factory (cfg) {

  }

  function fetch_tokens (req, res, next) {
    var opt = req.audit_request;
    list_available_nightscout_tokens(opt).then(function (tokens) {
      res.locals.tokens = tokens;
      next( );
    }).catch(next);
  }

  factory.handlers = {
    fetch_tokens
  };

  return factory;

}

module.exports = exports = configure;

