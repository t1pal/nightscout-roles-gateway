FROM ubuntu:bionic
MAINTAINER Ben West <bewest@medicaldatanetworks.com>

ENV DEBIAN_FRONTEND noninteractive
ENV PORT=3883
EXPOSE 3883

RUN apt-get update -y
RUN apt-get install -y wget curl git sudo
RUN curl -sL https://deb.nodesource.com/setup_16.x | sudo bash -

RUN apt-get update
RUN apt-get install -y python software-properties-common nodejs build-essential nginx ruby
RUN npm install -g n
RUN n 16
RUN n prune
RUN npm install -g node-gyp

ADD . /app

WORKDIR /app

RUN cd /app && rm -rf node_modules
RUN cd /app && npm install
RUN /app/setup_docker_guest.sh

ENV UPSTREAM_POLICY "nightscout"

ENTRYPOINT ["/app/start_container.sh"]
CMD []
