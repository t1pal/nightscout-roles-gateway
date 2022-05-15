'use strict';

process.env.NODE_ENV = 'test';
process.env.BACKEND_ENV = 'test';

var chai = require('chai');
var chaiHttp = require('chai-http');
var expect = chai.expect;

chai.use(chaiHttp);

describe("Integration Test", function ( ) {
  var server = null;
  var my = null;

  before(function (done) {
    var env = require('../../env');
    var store = require('../../lib/storage')(env);
    store.initialize( );
    my = { store };
    server = require('../../server')(env, my);
    console.log("OK00??");
      done( );
    /*
    return require('../../lib/bootevent')(env).acquire(function (ctx, next) {
      server = require('../../server')(env, ctx);
      my = ctx;
      process.nextTick(next);

    }).boot(function ( ) {
      done( );
    });
    */
  });

  after(function (done) {
    // require('../../lib/storage').reset(done);
    // my.store.destroy(done);
    my.store.destroy( );
    done( );
  });
  /*
  */

  describe("Health Check Test", function ( ) {
    it ("should return status ok", function (done) {

      chai.request(server)
        .get('/api/v1/status')
        .end(function (err, res) {
          expect(err).to.equal(null);
          expect(res).to.have.status(200);
          done( );
        });

    });
  });
});

