'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

var chai = require('chai');
var chaiHttp = require('chai-http');
var expect = chai.expect;

chai.use(chaiHttp);

var env = require('../../env');
var store = require('../../lib/storage')(env);
var server = null;
var my = null;

describe("Integration Test", function ( ) {
  before(function (done) {
    var env = require('../../env');
    var store = require('../../lib/storage')(env);
    store.initialize( );
    my = { store };
    server = require('../../server')(env, my);
    store.migrate.rollback( )
        .then(function ( ) {
          store.migrate.latest( )
          .then(function ( ) {
            done( );
          })
        }).catch(done);
  });
  after(function (done) {
      my.store.migrate.rollback( )
        .then(function ( ) {
          my.store.destroy( );
          done( );
        })
        .catch(function (err) {
          done(err);
        });
  });

  describe("Site Registration", function ( ) {

  /*
  */

    var payload = {
      owner_ref: 'testowner0',
      expected_name: 'testsite0',
      upstream_origin: 'http://url0'
    };

    it ("proposing a new site should return suggestion", function (done) {

      var payload = {
        owner_ref: 'testowner0',
        expected_name: 'testsite0',
        upstream_origin: 'http://url0'
      };
      chai.request(server)
        .post('/api/v1/workflows/site/registrations/testsite0/propose')
        .send(payload)
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          console.log(res.body);
          done( );
        });

    });

    it ("registering a new site should return site registration details", function (done) {

      chai.request(server)
        .post('/api/v1/workflows/site/registrations/testsite0')
        .send(payload)
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          // console.log('CREATED AND SAVED', res.body);
          done( );
        });

    });

  });

  var payload = {
    owner_ref: 'testowner0',
    upstream_origin: 'http://url0'
  };
  var reg = { };
  describe("Site Registration Unique Constraints", function ( ) {
    before(function (done) {
      // store.destroy( );
      // store.initialize( );
      my = { store };
      server = require('../../server')(env, my);
      store.migrate.rollback( )
          .then(function ( ) {
            store.migrate.latest( )
            .then(function ( ) {
              chai.request(server)
                .post('/api/v1/workflows/site/registrations/testsite1')
                .send(payload)
                .end(function (err, res) {
                  expect(err).to.equal(null);
                  expect(res).to.have.status(200);
                  expect(res).to.be.json;
                  reg.workflow = res.body.workflow;
                  reg.Site = res.body.workflow.inserted.registration;
                  console.log('CREATED AND SAVED', res.body.workflow.inserted.registration);
                  done( );
                });
            })
          }).catch(done);
    });

    it ("registering a duplicate site should be rejected", function (done) {

      chai.request(server)
        .post('/api/v1/workflows/site/registrations/testsite1')
        .send(payload)
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          // console.log('CREATED AND SAVED', res.body);
          done( );
        });

    });

    it ("fetch registration details for existing site", function (done) {

      console.log("REG SITE", reg);
      chai.request(server)
        .get('/api/v1/workflows/site/registrations/' + reg.Site.owner_ref + '/testsite1')
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          // console.log('REGISTRATION DETAILS', res.body);
          done( );
        });

    });

    it ("factory reset for registration site", function (done) {

      console.log("REG SITE", reg);
      chai.request(server)
        .post('/api/v1/workflows/site/registrations/' + reg.Site.owner_ref + '/testsite1/factory-reset')
        .send({ factory_reset: 1, nickname: 'example nickname', upstream_origin: 'http://url1' })
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          console.log('FACTORY DETAILS', res.body);
          done( );
        });

    });

    after(function (done) {
        my.store.migrate.rollback( )
          .then(function ( ) {
            // my.store.destroy( );
            done( );
          })
          .catch(function (err) {
            done(err);
          });
    });
  });
});

