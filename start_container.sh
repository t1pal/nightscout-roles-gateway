#!/bin/bash

echo starting container...
whoami
pwd
env
# ls -alh /etc/nginx
# export INTERNAL_PORT=3737
# export PORT=4747

# erb nginx.conf.erb | tee /etc/nginx/nginx.conf
#service nginx restart

# install and run
# npm install
function start_all ( ) {
./node_modules/.bin/knex --env $BACKEND_ENV migrate:status
./node_modules/.bin/knex --env $BACKEND_ENV migrate:latest
#$PM2-runtime -i 4 --no-autorestart 
node server.js


}
PM2=./node_modules/.bin/pm2

OP=${1-main}
echo ARGS: $0 $@
echo OP: $OP
case "${OP}" in
  sh|bash)
    set -- "$@"
    ;;
  knex)
    shift
    ./node_modules/.bin/knex $@
    ;;
  startall)
    # install and run
    start_all
    ;;
  main)
    # install and run
    node server.js
    ;;
  help)
    cat <<-EOT
    $0 - help

    Welcome to T1Pal Nightscout Roles Gateway Container Help
    Entry commands:
    * bash, sh - run bash
    * knex - run knex with rest of arguments
    * startall - run migration and start server
    * main - run the main dashboard web
    * help - show this help
EOT
    ;;
esac

