
var axios = require('axios');
var url = require('url');
var path = require('path');
const _ = require('lodash');
const crypto = require('crypto');
const Keyv = require('keyv');


function configure (opts, server, persist) {

  var keyv_opts = {
    uri: opts.cache && typeof opts.cache.uri == 'string' && opts.cache.uri,
    // store: opts.cache && typeof.opts.cache.store !== 'string' && opts.cache.store,
    ttl: 28800 * 1000,
    namespace: 'gateway-nightscout-token-cache'
  };

  var cache = new Keyv(keyv_opts);

  function lookup_token (acl, upstream_origin) {

    var key = [acl.policy_spec, acl.subject].join('.');
    var http = axios.create({ baseURL: upstream_origin });
    function exchange (resolve, reject) {

      function fetch_exchange ( ) {
        console.log("NOT IN CACHE, WILL REQUEST NEW", key);
        return http.get('/api/v2/authorization/request/' + acl.policy_spec)
          .then(function (authorized) {
            var ttl = (authorized.data.exp - authorized.data.iat) * 1000;
            console.log("NEW TOKEN, putting in CACHE", key, ttl, authorized.data.token);
            var data = authorized.data;
            return cache.set(key, data, ttl)
              .then(function ( ) {
                return resolve(data);
              });
          }).catch(reject);

      }

      cache.get(key).then(function restored (value) {
        console.log("VALUE FROM CACHE", key, value.token);
        if (value) {
          return resolve(value);
        } else {
          return fetch_exchange( );
        }
        
      }).catch(fetch_exchange)
    }

    return new Promise(exchange);
  }

  function exchange_acl_token (req, res, next) {
    var acl = res.locals.acl;
    var upstream_origin = req.site.upstream_origin;
    console.log("EXCHANGING", acl ? [acl.policy_type == 'nsjwt', acl.policy_type, acl.policy_spec] : false);
    if (acl && acl.policy_type == 'nsjwt') {
      return lookup_token(acl, upstream_origin).then(function (token) {
        console.log("FOUND TOKEN", token);
        res.locals.nsjwt = token;
        next( );

      }).catch(next);


    } else {
      return next( );
    }

  }

  function set_acl_token_header (req, res, next) {
    var acl = res.locals.acl;
    if (res.locals.active && acl && acl.policy_type == 'nsjwt' && res.locals.nsjwt) {
      res.header('X-NSJWT', res.locals.nsjwt.token);
    }
    next( );

  }

  function factory ( ) {
  }

  factory.handlers = {
    exchange_acl_token
  , set_acl_token_header
  };

  return factory;

}

module.exports = exports = configure;


