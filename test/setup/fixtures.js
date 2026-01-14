'use strict';

const ShortUniqueId = require('short-unique-id');
const uid = new ShortUniqueId({ length: 10 });

function generateId() {
  return uid.randomUUID();
}

const fixtures = {
  generateId,

  createSite(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      owner_ref: overrides.owner_ref || 'test-owner-' + generateId(),
      expected_name: overrides.expected_name || 'test-site-' + generateId(),
      upstream_origin: overrides.upstream_origin || 'https://test-ns-' + generateId() + '.example.com',
      is_enabled: overrides.is_enabled !== undefined ? overrides.is_enabled : true,
      require_identities: overrides.require_identities !== undefined ? overrides.require_identities : false,
      exempt_matching_api_secret: overrides.exempt_matching_api_secret !== undefined ? overrides.exempt_matching_api_secret : false,
      ...overrides
    };
    
    return knex('registered_sites').insert(data).returning('*').then(rows => rows[0]);
  },

  createGroup(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      owner_ref: overrides.owner_ref || 'test-owner-' + generateId(),
      nickname: overrides.nickname || 'Test Group ' + generateId(),
      deny_access: overrides.deny_access !== undefined ? overrides.deny_access : false,
      ...overrides
    };
    
    return knex('group_definitions').insert(data).returning('*').then(rows => rows[0]);
  },

  createInclusionSpec(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      group_definition_id: overrides.group_definition_id,
      identity_type: overrides.identity_type || 'email',
      identity_spec: overrides.identity_spec || 'test-' + generateId() + '@example.com',
      nickname: overrides.nickname || 'Test Spec',
      ...overrides
    };
    
    return knex('group_inclusion_specs').insert(data).returning('*').then(rows => rows[0]);
  },

  createPolicy(knex, overrides = {}) {
    if (!overrides.site_id) {
      throw new Error('createPolicy requires site_id');
    }
    if (!overrides.group_definition_id) {
      throw new Error('createPolicy requires group_definition_id');
    }
    const id = overrides.id || generateId();
    const data = {
      id,
      site_id: overrides.site_id,
      group_definition_id: overrides.group_definition_id,
      policy_type: overrides.policy_type || 'default',
      policy_spec: overrides.policy_spec || 'allow',
      policy_name: overrides.policy_name || 'Test Policy ' + generateId(),
      policy_note: overrides.policy_note || '',
      sort: overrides.sort,
      ...overrides
    };
    
    return knex('connection_policies').insert(data).returning('*').then(rows => rows[0]);
  },

  createSchedule(knex, overrides = {}) {
    if (!overrides.policy_id) {
      throw new Error('createSchedule requires policy_id');
    }
    const id = overrides.id || generateId();
    const data = {
      id,
      policy_id: overrides.policy_id,
      schedule_type: overrides.schedule_type || 'week',
      fill_pattern: overrides.fill_pattern || 'deny,allow,deny',
      schedule_segments: overrides.schedule_segments || '0,32400,54000',
      schedule_nickname: overrides.schedule_nickname || 'Test Schedule ' + generateId(),
      ...overrides
    };
    
    return knex('scheduled_policies').insert(data).returning('*').then(rows => rows[0]);
  },

  createJoinedGroup(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      subject: overrides.subject || 'test-subject-' + generateId(),
      expected_name: overrides.expected_name,
      group_id: overrides.group_id,
      group_spec_id: overrides.group_spec_id,
      policy_id: overrides.policy_id,
      ...overrides
    };
    
    return knex('joined_groups').insert(data).returning('*').then(rows => rows[0]);
  },

  createOAuthCredential(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      owner_ref: overrides.owner_ref || 'test-owner-' + generateId(),
      expected_name: overrides.expected_name || 'test-site-' + generateId(),
      client_id: overrides.client_id || 'client-' + generateId(),
      client_secret: overrides.client_secret || 'secret-' + generateId(),
      ...overrides
    };
    
    return knex('oauth2_credentials').insert(data).returning('*').then(rows => rows[0]);
  },

  createAuthenticityRecord(knex, overrides = {}) {
    const id = overrides.id || generateId();
    const data = {
      id,
      owner_ref: overrides.owner_ref || 'test-owner-' + generateId(),
      expected_name: overrides.expected_name,
      upstream_origin: overrides.upstream_origin || 'https://test-ns-' + generateId() + '.example.com',
      status: overrides.status !== undefined ? overrides.status : 'ok',
      acceptable: overrides.acceptable !== undefined ? overrides.acceptable : true,
      ...overrides
    };
    
    if (!data.expected_name) {
      throw new Error('createAuthenticityRecord requires expected_name');
    }
    
    return knex('nightscout_authenticity_records').insert(data).returning('*').then(rows => rows[0]);
  },

  scheduleHelpers: {
    SECONDS_IN_DAY: 86400,
    SECONDS_IN_WEEK: 604800,
    SECONDS_IN_HOUR: 3600,

    dayOffset(day) {
      const days = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      return (days[day.toLowerCase()] || 0) * this.SECONDS_IN_DAY;
    },

    timeOffset(hours, minutes = 0) {
      return (hours * 3600) + (minutes * 60);
    },

    buildSegments(windows) {
      const offsets = windows.map(w => {
        const dayOff = this.dayOffset(w.day);
        const timeOff = this.timeOffset(w.hour, w.minute || 0);
        return dayOff + timeOff;
      });
      return offsets.sort((a, b) => a - b).join(',');
    },

    mondayToFriday9to3() {
      return {
        fill_pattern: 'deny,allow,deny',
        schedule_segments: this.buildSegments([
          { day: 'mon', hour: 9 },
          { day: 'mon', hour: 15 }
        ])
      };
    }
  }
};

module.exports = fixtures;
