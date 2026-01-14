'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const { static_analysis, check_api_secret_syntax } = require('../../lib/criteria/core');

describe('Unit: static_analysis', function() {
  this.timeout(5000);

  describe('API Secret Syntax Validation', function() {

    it('SA-01: should pass for valid API secret (12+ chars)', async function() {
      const cfg = {
        api_secret: 'mysupersecret123',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const secretResult = results.find(r => r.property === 'api secret');

      expect(secretResult).to.exist;
      expect(secretResult.passing).to.be.true;
      expect(secretResult.mandatory).to.be.true;
      expect(secretResult.outcome).to.include('16');
    });

    it('SA-02: should pass for minimum length (12 chars)', async function() {
      const cfg = {
        api_secret: 'exactly12chr',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const secretResult = results.find(r => r.property === 'api secret');

      expect(secretResult.passing).to.be.true;
      expect(secretResult.outcome).to.include('12');
    });

    it('SA-03: should fail for too short (11 chars)', async function() {
      const cfg = {
        api_secret: 'only11chars',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const secretResult = results.find(r => r.property === 'api secret');

      expect(secretResult.passing).to.be.false;
      expect(secretResult.mandatory).to.be.true;
      expect(secretResult.outcome).to.include('11');
    });

    it('SA-04: should fail for empty string', async function() {
      const cfg = {
        api_secret: '',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const secretResult = results.find(r => r.property === 'api secret');

      expect(secretResult.passing).to.be.false;
      expect(secretResult.mandatory).to.be.true;
      expect(secretResult.outcome).to.include('0');
    });

    it('SA-05: should pass for very long secret', async function() {
      const cfg = {
        api_secret: 'a'.repeat(256),
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const secretResult = results.find(r => r.property === 'api secret');

      expect(secretResult.passing).to.be.true;
      expect(secretResult.outcome).to.include('256');
    });

    it('check_api_secret_syntax: boundary check at 11 vs 12', function() {
      expect(check_api_secret_syntax('12345678901')).to.be.false;
      expect(check_api_secret_syntax('123456789012')).to.be.true;
    });
  });

  describe('URL Syntax Validation', function() {

    it('SA-06: should pass for valid HTTPS URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult).to.exist;
      expect(urlResult.passing).to.be.true;
      expect(urlResult.mandatory).to.be.true;
      expect(urlResult.outcome).to.include('ns.example.com');
    });

    it('SA-07: should pass for valid HTTP URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'http://ns.example.com'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.true;
      expect(urlResult.outcome).to.include('ns.example.com');
    });

    it('SA-08: should pass for URL with path', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com/nightscout'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.true;
      expect(urlResult.outcome).to.include('ns.example.com');
    });

    it('SA-09: should pass for URL with port', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com:8080'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.true;
      expect(urlResult.outcome).to.include('ns.example.com');
    });

    it('SA-10: should fail for empty URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: ''
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.false;
      expect(urlResult.mandatory).to.be.true;
    });

    it('SA-11: should fail for missing protocol', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'ns.example.com'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.false;
    });

    it('SA-12: should fail for invalid URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'not-a-url'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.false;
    });

    it('should return boolean false (not null) for invalid URLs', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: ''
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.equal(false);
      expect(typeof urlResult.passing).to.equal('boolean');
    });

    it('SA-13: should pass for localhost URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'http://localhost:1337'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.true;
      expect(urlResult.outcome).to.include('localhost');
    });

    it('SA-14: should pass for IP address URL', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'http://192.168.1.1:1337'
      };
      const results = await static_analysis(cfg);
      const urlResult = results.find(r => r.property === 'url syntax');

      expect(urlResult.passing).to.be.true;
      expect(urlResult.outcome).to.include('192.168.1.1');
    });
  });

  describe('Result Structure', function() {

    it('should return exactly 2 results for valid input', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);

      expect(results).to.have.length(2);
    });

    it('should return results with required properties', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);

      results.forEach(result => {
        expect(result).to.have.property('group');
        expect(result).to.have.property('property');
        expect(result).to.have.property('criteria');
        expect(result).to.have.property('outcome');
        expect(result).to.have.property('passing');
        expect(result).to.have.property('mandatory');
      });
    });

    it('should have correct group names', async function() {
      const cfg = {
        api_secret: 'validsecret123',
        upstream_origin: 'https://ns.example.com'
      };
      const results = await static_analysis(cfg);

      const groups = results.map(r => r.group);
      expect(groups).to.include('Nightscout API Secret');
      expect(groups).to.include('Nightscout URL');
    });
  });
});
