
var restify = require('restify');
var bunyan = require('bunyan');
var routes = require('./lib/routes');

function create (env, ctx) {

  var opts = { name: 'nightscout-roles-gateway' };
  var logger = bunyan.createLogger({
    name: 'audit',
    stream: process.stdout
  });
  opts.log = logger;
  var server = restify.createServer(opts);
  server.on('after', restify.plugins.auditLogger({
    log: logger,
    event: 'after',
    printLog : true
  })
  );

  server.store = ctx.store;
  server.use(restify.plugins.bodyParser({mapParams: true }));
  server.use(restify.plugins.queryParser( ));

  // mount routes
  routes(env, server);

  return server;

}

exports = create;

if (!module.parent) {
  var env = require('./env');
  require('./lib/bootevent')(env).acquire(function (ctx, next) {
    var server = create(env, ctx);
    server.log.info("env: %j", env);
    // bind to every interface by default
    var hostname = env.HOSTNAME || '0.0.0.0';
    ctx.server = server;
    server.listen(env.PORT, hostname);
    server.on('listening', function (ev) {
      this.log.info('%s serving %s on %s', this.name, this.url, this.address( ).port);
      next( );
    });
  }).boot(function booted (ctx) {
    ctx.server.log.info("done booting");
  });

}


