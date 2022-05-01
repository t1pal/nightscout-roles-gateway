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
./node_modules/.bin/knex --env $BACKEND_ENV migrate:status
./node_modules/.bin/knex --env $BACKEND_ENV migrate:latest
PM2=./node_modules/.bin/pm2
PORT=$INTERNAL_PORT $PM2-runtime -i 4 --no-autorestart server.js

