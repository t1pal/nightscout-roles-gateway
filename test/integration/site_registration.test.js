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
          // console.log('FACTORY DETAILS', res.body);
          done( );
        });

    });
    var saved_group;

    describe("groups exercise", function ( ) {

      var group_A_req = {
        nickname: "A Group A"
      , identity_type: 'invite'
      , identity_spec: 'magiclink0'
      };

      var group_B_req = {
        nickname: "B Group B"
      , includes : [
        { identity_type: 'facebook-group-member'
        , identity_spec: 'my-group'
        }
      , { identity_type: 'twitter-user'
        , identity_spec: '@me'
        }
      ]
      };

      var group_C_req = {
        nickname: "C Group C"
      , identity_type: 'email-example'
      , includes : {
        identity_spec: [ 'a@a.com', 'b@b.com' ]
      }
      };

      var group_D_req = {
        nickname: "D Group D"
      , includes : {
        identity_spec: [ 'a@a.com', 'b@b.com' ]
      , identity_type: [ 'email', 'email' ]
      }
      };

      var group_E_req = {
        nickname: "E Group E"
      , includes: {
        identity_type: 'invite'
      , identity_spec: 'magiclink0'
      }
      };


      // before(function ( ) { })
      it ("create a group", function (done) {
        chai.request(server)
          .post('/api/v1/owner/' + reg.Site.owner_ref + '/groups')
          .send(group_B_req)
          .end(function (err, res) {
            expect(err).to.equal(null);
            expect(res).to.have.status(200);
            expect(res).to.be.json;
            console.log('GROUP CREATE', res.body);
            saved_group = res.body.inserted;
            done( );
          });
      });


    });


    describe("some changes with existing site", function ( ) {
      // before(function ( ) { });
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

