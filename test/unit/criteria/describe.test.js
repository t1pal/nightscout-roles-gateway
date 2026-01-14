'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const configure = require('../../../lib/criteria/core');

describe('Unit: describe() function', function() {
  this.timeout(5000);

  let criteria;

  before(function() {
    criteria = configure();
  });

  describe('DS-01: All passing results', function() {
    it('should return status OK and acceptable true when all criteria pass', async function() {
      const findings = [
        { group: 'Nightscout API Secret', property: 'api secret', passing: true, mandatory: true },
        { group: 'Nightscout URL', property: 'url syntax', passing: true, mandatory: true },
        { group: 'Nightscout API', property: 'status endpoint', passing: true, mandatory: true }
      ];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('OK');
      expect(result.acceptable).to.be.true;
      expect(result.details.passing).to.equal(3);
      expect(result.details.warning).to.equal(0);
      expect(result.details.rejects).to.equal(0);
      expect(result.txt).to.equal('Nightscout is OK.');
    });
  });

  describe('DS-02: One mandatory failure', function() {
    it('should return status not ok and acceptable false when one mandatory criterion fails', async function() {
      const findings = [
        { group: 'Nightscout API Secret', property: 'api secret', passing: false, mandatory: true },
        { group: 'Nightscout URL', property: 'url syntax', passing: true, mandatory: true },
        { group: 'Nightscout API', property: 'status endpoint', passing: true, mandatory: true }
      ];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('not ok');
      expect(result.acceptable).to.be.false;
      expect(result.details.passing).to.equal(2);
      expect(result.details.warning).to.equal(0);
      expect(result.details.rejects).to.equal(1);
      expect(result.txt).to.include('not ok');
      expect(result.txt).to.include('1 serious issue');
    });
  });

  describe('DS-03: Optional warning only', function() {
    it('should return status OK and acceptable true when only non-mandatory criteria fail', async function() {
      const findings = [
        { group: 'Nightscout API Secret', property: 'api secret', passing: true, mandatory: true },
        { group: 'Nightscout URL', property: 'url syntax', passing: true, mandatory: true },
        { group: 'Nightscout API', property: 'optional data', passing: false, mandatory: false }
      ];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('OK');
      expect(result.acceptable).to.be.true;
      expect(result.details.passing).to.equal(2);
      expect(result.details.warning).to.equal(1);
      expect(result.details.rejects).to.equal(0);
      expect(result.txt).to.include('Nightscout is OK');
      expect(result.txt).to.include('1 detail');
      expect(result.txt).to.include('may indicate');
    });
  });

  describe('DS-04: Multiple mandatory failures', function() {
    it('should mention multiple serious issues when 2+ mandatory criteria fail', async function() {
      const findings = [
        { group: 'Nightscout API Secret', property: 'api secret', passing: false, mandatory: true },
        { group: 'Nightscout URL', property: 'url syntax', passing: false, mandatory: true },
        { group: 'Nightscout API', property: 'status endpoint', passing: true, mandatory: true }
      ];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('not ok');
      expect(result.acceptable).to.be.false;
      expect(result.details.passing).to.equal(1);
      expect(result.details.warning).to.equal(0);
      expect(result.details.rejects).to.equal(2);
      expect(result.txt).to.include('2 serious issues');
    });
  });

  describe('DS-05: Mixed results (passing, warning, and fatal)', function() {
    it('should correctly categorize mixed results with both warnings and rejects', async function() {
      const findings = [
        { group: 'Nightscout API Secret', property: 'api secret', passing: true, mandatory: true },
        { group: 'Nightscout URL', property: 'url syntax', passing: true, mandatory: true },
        { group: 'Nightscout API', property: 'status endpoint', passing: false, mandatory: true },
        { group: 'Nightscout API', property: 'optional data', passing: false, mandatory: false }
      ];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('not ok');
      expect(result.acceptable).to.be.false;
      expect(result.details.passing).to.equal(2);
      expect(result.details.warning).to.equal(1);
      expect(result.details.rejects).to.equal(1);
      expect(result.txt).to.include('not ok');
      expect(result.txt).to.include('1 detail');
      expect(result.txt).to.include('1 serious issue');
    });
  });

  describe('Edge Cases', function() {
    it('DS-EC-01: should handle empty findings array', async function() {
      const findings = [];

      const result = await criteria.describe(findings);

      expect(result.status).to.equal('OK');
      expect(result.acceptable).to.be.true;
      expect(result.details.passing).to.equal(0);
      expect(result.details.warning).to.equal(0);
      expect(result.details.rejects).to.equal(0);
      expect(result.txt).to.equal('Nightscout is OK.');
    });

    it('DS-EC-02: should use plural "details" for multiple warnings', async function() {
      const findings = [
        { group: 'Test', property: 'prop1', passing: false, mandatory: false },
        { group: 'Test', property: 'prop2', passing: false, mandatory: false },
        { group: 'Test', property: 'prop3', passing: false, mandatory: false }
      ];

      const result = await criteria.describe(findings);

      expect(result.acceptable).to.be.true;
      expect(result.details.warning).to.equal(3);
      expect(result.txt).to.include('3 details');
    });

    it('DS-EC-03: should return a Promise', function() {
      const findings = [{ passing: true, mandatory: true }];
      const result = criteria.describe(findings);
      
      expect(result).to.be.a('promise');
    });
  });
});
