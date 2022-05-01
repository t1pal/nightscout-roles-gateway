
var env = {
  PORT: parseInt(process.env.PORT || '3883')
, HOSTNAME: process.env.BIND_IFACE || null
, KNEX_CONNECT: process.env.KNEX_CONNECT
, BACKEND_ENV: process.env.BACKEND_ENV
};

module.exports = env;

if (!module.parent) {
  console.log(JSON.stringify(env));
}
