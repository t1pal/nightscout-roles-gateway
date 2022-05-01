'use strict';

function boot (env, language) {

  function startBoot (ctx, next) {

    console.log('Executing startBoot');

    ctx.runtimeState = 'booting';
    ctx.settings = env.settings;
    next();
  }

  function checkEnv (ctx, next) {

    console.log('Executing checkEnv');
    next();
  }

  function setupStorage (ctx, next) {

    console.log('Executing setupStorage');

    if (hasBootErrors(ctx)) {
      return next();
    }

    try {
        require('./storage')(env, function ready(err, store) {
          if (err) {
            console.info('ERROR CONNECTING TO DATABASE', err);
            ctx.bootErrors = ctx.bootErrors || [ ];
            ctx.bootErrors.push({'desc': 'Unable to connect to database', err: err.message});
          }
          console.log('Storage system ready');
          ctx.store = store;
          next();
        });
    } catch (err) {
      console.info('ERROR CONNECTING TO DATABASE', err);
      ctx.bootErrors = ctx.bootErrors || [ ];
      ctx.bootErrors.push({'desc': 'Unable to connect to database', err: err.message});
      next();
    }
  }




  function finishBoot (ctx, next) {

    console.log('Executing finishBoot');

    if (hasBootErrors(ctx)) {
      return next();
    }

    ctx.runtimeState = 'booted';

    next( );
  }

  return require('bootevent')( )
    .acquire(startBoot)
    .acquire(checkEnv)
    .acquire(setupStorage)
    .acquire(finishBoot);
}

module.exports = boot;

