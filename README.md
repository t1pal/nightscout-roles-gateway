
# Nightscout Roles Gateway

A cloud-native RBAC controller for Nightscout.
`NRG` provides a REST API to store and enforce scheduled group policies for
registered Nightscout sites.  It is designed to be run in cloud native
environments in orchestration with load balancers like NGINX using the
`auth_request` and other resources to provide services.

This is a microservice for managing sites, groups, and scheduling permissions
types.  When a request for `<expected_name>.example.com`, this API allows the
load balancer to verify the authenticity of the site, the athenticity of the
user accessing the site, and the authorization the user has for that site.
When the registered site's configuration for the `expected_name` resolves to an
active resource with an authentic authorization for a specific use, the service
provides the upstream URI for reverse proxy in the `x-upstream-origin` response
header.  NGINX or similar load balancers should use this information to
continue the response processing.

There are controls for setting up basic default connection policies to a
proxied site, including active vs inactive.
Owners of registered sites can define groups defined by many inclusion types
and specifications.  These definitions might include users claiming ownership
over identity schema traits such as verified name, email, phone number, or
organization membership. These traits are communicated over oauth2.0 protocol,
for example using ORY Kratos and ORY Hydra.  When a logged in user claims owner
over these traits while visiting a a registered site, it forms a mapping to the
type of authorization permitted for that user.  These authorization permissions
may be binary such as `allow` and `deny`, or may include specific Nighscout
JWT, and may be expressed on a weekly schedule.

The gateway _TODO:will be/is_ Nightscout-aware, and will require use of the
`API_SECRET` along with site registration in order to work properly.  The
`API_SECRET` is used to verify the authenticity of the registered Nightscout
site, to triage and manage JWT authorizations, and to enable classic mobile
uploaders when the `exempt_matching_api_secret` property for a registered site
is set to true.

## Example Use Cases
The goal is to enable a dashboard UI to easily configure the following policies
using the REST APIs available from this microservice.

### Personal sharing
Allow me to publish my Nightscout for anyone who has the link or not.

### School health tech
The school health aide should be able to look during the school week, add entries
during school hours, and have limited or no access on the weekends.

### Social sharing
Share with a list of my twitter friends and people from my Facebook group, let them read.

### The special event
Allow everyone to read my glucose during while I run a marathon, but not other times.

### The special guest
Allow the babysitter to add treatments this weekend, but deny all other times.

### Organizational roles
Allow my health care provider from my clinic to access reports any time, and
keep an activity log for me to manage individuals who impugn my data
rights.

### BYOD Ownership
Allow any of "my" devices with any of my secrets to represent me as the
Nightscout owner.

## Side Effect Goals

Enable additional brokerage services for Nightscout community:
* IFTTT
* Twilio/Glucose2Phone
* pushover
* 




