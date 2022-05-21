
var env = {
  PORT: parseInt(process.env.PORT || '3883')
, HOSTNAME: process.env.BIND_IFACE || null
, KNEX_CONNECT: process.env.KNEX_CONNECT
, BACKEND_ENV: process.env.BACKEND_ENV
, kratos: {
  api: process.env.KRATOS_API || 'http://kratos-gw.service.consul:4433'
  }
};


module.exports = env;

if (!module.parent) {
  console.log(JSON.stringify(env));
}
