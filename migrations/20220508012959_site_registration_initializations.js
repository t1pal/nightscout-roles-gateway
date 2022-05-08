/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createViewOrReplace('site_registration_initializations', function (view) {
    // view.columns([]);
    var select = knex('site_registration_synopsis').select([
      'site_registration_synopsis.*'
    , knex.raw("'' as api_secret")
    , 'registered_sites.client_app'
    , 'registered_sites.nickname as site_name'
    , 'registered_sites.upstream_origin'
    , 'site_acls.group_id'
    , 'site_acls.group_name'
    , 'site_acls.group_spec_id'
    , 'site_acls.identity_type'
    , 'site_acls.identity_spec'
    , 'site_acls.policy_id'
    , 'site_acls.policy_name'
    , 'site_acls.policy_type'
    , 'site_acls.policy_spec'
    , knex.raw('0 as factory_reset')
    ])
      .join('registered_sites', 'registered_sites.id', 'site_registration_synopsis.id')
      .join('site_acls', function () {
        this.on(function ( ) {
          this.on('registered_sites.id', 'site_acls.id');
          this.andOn('site_acls.policy_type', knex.raw('?', ['default']))
        });
      })
    ;

    return view.as(select);
  }).then(function ( ) {
    return knex.raw(`
        SELECT 1;

        CREATE OR REPLACE FUNCTION factory_reset_site_registration() RETURNS trigger AS $$
        BEGIN
          IF NEW.factory_reset > 0 AND NEW.id = OLD.id AND NEW.owner_ref = OLD.owner_ref THEN
            DELETE FROM group_definitions 
              WHERE id IN (SELECT DISTINCT group_id FROM
                 owner_group_usage
                 WHERE owner_group_usage.group_id = group_definitions.id
                  AND owner_group_usage.owner_ref = NEW.owner_ref
                  AND owner_group_usage.num_sites_used < 1);

            DELETE FROM group_definitions
              WHERE id IN (SELECT DISTINCT group_id FROM
                site_acls
                WHERE site_acls.group_id = group_definitions.id
                  AND site_acls.id = NEW.id);

            DELETE FROM connection_policies
              WHERE id IN (SELECT DISTINCT policy_id FROM
                site_acls
                WHERE site_acls.policy_id = connection_policies.id
                  AND site_acls.id = NEW.id);
            DELETE FROM connection_policies 
              WHERE id IN (SELECT DISTINCT policy_id FROM
                site_acls
                WHERE site_acls.policy_id = connection_policies.id
                  AND site_acls.owner_ref = NEW.owner_ref
                  AND site_acls.id is NULL);

            UPDATE registered_sites
              SET
                upstream_origin = COALESCE(NEW.upstream_origin, OLD.upstream_origin)
              , api_secret = COALESCE(NEW.api_secret, OLD.api_secret)
              , nickname = COALESCE(NEW.site_name, OLD.site_name)
              WHERE
                id = NEW.id
              ;
            INSERT INTO group_definitions (id, owner_ref, nickname)
              VALUES (
                COALESCE(NEW.group_id, OLD.group_id)
              , NEW.owner_ref
              , COALESCE(NEW.group_name, OLD.group_name, 'Default')
              );
            INSERT INTO group_inclusion_specs (id, group_definition_id, identity_type, identity_spec)
              VALUES (
                COALESCE(NEW.group_spec_id, OLD.group_spec_id)
              , COALESCE(NEW.group_id, OLD.group_id)
              , COALESCE(NEW.identity_type, OLD.identity_type, 'anonymous')
              , COALESCE(NEW.identity_spec, OLD.identity_spec, 'all')
              );
            INSERT INTO connection_policies (id, site_id, group_definition_id, policy_name, policy_type, policy_spec)
              VALUES (
                COALESCE(NEW.policy_id, OLD.policy_id)
              , NEW.id
              , COALESCE(NEW.group_id, OLD.group_id)
              , COALESCE(NEW.policy_name, OLD.policy_name, 'Default')
              , COALESCE(NEW.policy_type, OLD.policy_type, 'allow')
              , COALESCE(NEW.policy_spec, OLD.policy_spec, 'allow')
              );
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION initialize_site_registration() RETURNS trigger AS $$
        BEGIN
          INSERT INTO registered_sites
            (id, owner_ref, expected_name, upstream_origin, nickname, client_app, api_secret)
          VALUES (
            NEW.id
          , NEW.owner_ref
          , NEW.expected_name
          , NEW.upstream_origin
          , NEW.site_name
          , NEW.client_app
          , NEW.api_secret
          );

          INSERT INTO group_definitions (id, owner_ref, nickname)
          VALUES (
            NEW.group_id
          , NEW.owner_ref
          , COALESCE(NEW.group_name, 'Default')
          );
          INSERT INTO group_inclusion_specs (id, group_definition_id, identity_type, identity_spec)
          VALUES (
            NEW.group_spec_id
          , NEW.group_id
          , COALESCE(NEW.identity_type, 'anonymous')
          , COALESCE(NEW.identity_spec, 'all')
          );
          INSERT INTO connection_policies (id, site_id, group_definition_id, policy_name, policy_type, policy_spec)
          VALUES (
            NEW.policy_id
          , NEW.id
          , NEW.group_id
          , COALESCE(NEW.policy_name, 'Default')
          , COALESCE(NEW.policy_type, 'default')
          , COALESCE(NEW.policy_spec, 'allow')
          );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER initialize_site_registration_insert_trigger
        INSTEAD OF INSERT ON site_registration_initializations
        FOR EACH ROW
        EXECUTE PROCEDURE initialize_site_registration();

        CREATE TRIGGER factory_reset_site_registration_update_trigger
        INSTEAD OF UPDATE ON site_registration_initializations
        FOR EACH ROW
        EXECUTE PROCEDURE factory_reset_site_registration();


    `).then(function (res) {

    });
  });
  
  
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropViewIfExists('site_registration_initializations', function (view) {
  }).then(function ( ) {
    return knex.raw(`SELECT 1;

        DROP FUNCTION IF EXISTS initialize_site_registration() CASCADE;
        DROP TRIGGER IF EXISTS initialize_site_registration_insert_trigger ON site_registration_initializations CASCADE;

        DROP FUNCTION IF EXISTS factory_reset_site_registration() CASCADE;
        DROP TRIGGER IF EXISTS factory_reset_site_registration_update_trigger ON site_registration_initializations CASCADE;
    `).then(function (res) {
    });
  });
  
};
