

function lookup (persist) {

  function policy (cfg) {
    return function handler (req, res, next) {
      console.log("SETUP POLICY");
      res.locals.policy = {
        site: req.site
      , has_schedules: false
      , require_identities: req.site.require_identities

      };
      next( );

    }
  }

  function find_expected_name (req, res, next) {
    var query = { expected_name: req.params.expected_name };
    persist.entities.Site.db.findBy(query).then(function (rows) {
      if (rows.length == 1) {
        req.site = rows[0];
        next( );
        return;
      }
      next(rows);
    }).catch(next);
  }


  function decision (req, res, next) {
    var active = res.locals.policy.site.is_enabled;
    if (!active) {
      res.status(403);
      return next( );
    }
    if (res.locals.policy.allow_for_matching_api_secret) {
      active = true;
    } else if (res.locals.policy.require_identities) {
      active = res.locals.policy_allow_authorized_use;
    }
    res.locals.active = active;
    if (!active) {
      res.status(403);
    }
    next( );

  }

  function matches_api_secret (req, res, next) {
    res.locals.policy.matches_api_secret = req.header('API-SECRET') == res.locals.policy.site.hashed_api_secret;
    res.locals.policy.allow_for_matching_api_secret = res.locals.policy.matches_api_secret && res.locals.policy.site.exempt_matching_api_secret;
    next( );
  }

  function deny_site_prefs (req, res, next) {
    if (res.locals.policy.site.is_enabled) {
      return next( );
    } else {
      res.status(403);
      next();
    }
  }

  function specify_upstream_handler (res, res, next) {
    if (res.locals.active) {
      res.header('x-upstream-origin', res.locals.policy.site.upstream_origin);

    }
    next( );

  }

  var handlers = {
    find_expected_name
  , deny_site_prefs
  , matches_api_secret
  , decision
  , specify_upstream_handler
  // ,
  };

  policy.handlers = handlers;

  return policy;

}
module.exports = exports = lookup;
