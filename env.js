
var env = {
  PORT: parseInt(process.env.PORT || '3883')
, HOSTNAME: process.env.BIND_IFACE || null
, KNEX_CONNECT: process.env.KNEX_CONNECT
, BACKEND_ENV: process.env.BACKEND_ENV
, kratos: {
  api: process.env.KRATOS_API || 'http://kratos-gw.service.consul:4433'
  }
, hydra: {
  api: process.env.HYDRA_API || 'http://hydra-gw-admin.service.consul:4445'

  }
, gateway: {
    apex: process.env.GATEWAY_APEX || 'gateway.dummy0'
  , www: process.env.GATEWAY_WWW || 'https://gateway.dummy0'
  }
, self: {
    api: process.env.SELF_API || 'http://api.dummy0:3883'
  }
};


module.exports = env;

if (!module.parent) {
  console.log(JSON.stringify(env));
}
