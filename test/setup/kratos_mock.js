'use strict';

function createKratosMock(identities = {}) {
  const mockSdk = {
    toSession: function(token, cookie) {
      return new Promise((resolve, reject) => {
        const sessionCookie = cookie || '';
        const sessionId = sessionCookie.match(/ory_kratos_session=([^;]+)/);
        
        if (sessionId && identities[sessionId[1]]) {
          resolve({
            data: {
              id: sessionId[1],
              identity: identities[sessionId[1]]
            }
          });
        } else {
          const error = new Error('Unauthorized');
          error.response = {
            status: '401',
            data: { error: 'session_inactive' }
          };
          reject(error);
        }
      });
    },

    adminGetIdentity: function(id) {
      return new Promise((resolve, reject) => {
        if (identities[id]) {
          resolve({ data: identities[id] });
        } else {
          const error = new Error('Not found');
          error.response = { status: '404', data: {} };
          reject(error);
        }
      });
    }
  };

  return mockSdk;
}

function patchPrivyModule(env, server, persist) {
  const originalPrivy = require('../../lib/privy/index');
  
  return function patchedPrivy(opts, srv, pst) {
    const privy = originalPrivy(opts, srv, pst);
    
    const mockSdk = createKratosMock({});
    
    privy.handlers.kratos_whoami = function kratos_whoami_mock(req, res, next) {
      const cookie = req.header('Cookie') || '';
      const sessionId = cookie.match(/ory_kratos_session=([^;]+)/);
      
      if (sessionId && req._testIdentities && req._testIdentities[sessionId[1]]) {
        res.locals.session = { id: sessionId[1], identity: req._testIdentities[sessionId[1]] };
        res.locals.identity = req.user = req._testIdentities[sessionId[1]];
      } else {
        req.user = {
          id: 'anonymous',
          traits: { email: '*' }
        };
        res.locals.session = null;
      }
      next();
    };
    
    return privy;
  };
}

function createAnonymousKratosMiddleware() {
  return function kratos_whoami_mock(req, res, next) {
    req.user = {
      id: 'anonymous',
      traits: { email: '*' }
    };
    res.locals.session = null;
    next();
  };
}

module.exports = {
  createKratosMock,
  patchPrivyModule,
  createAnonymousKratosMiddleware
};
