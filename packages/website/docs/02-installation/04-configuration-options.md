# Server configuration

```sh
##############
## REQUIRED ##
##############

# URL
URL=http://localhost:3999

# Name of your server (shown during the login process)
NAME=My Apollo Server

# Database backend: sqlite, postgresql, or mongo (defaults to sqlite)
DB_BACKEND=postgresql
# Database connection URL
# For SQLite: a file path (e.g. apollo.sqlite)
# For PostgreSQL: postgresql://user:password@host:5432/dbname
# For MongoDB: mongodb://host:27017/dbname
DB_CONNECTION_URL=postgresql://apollo:password@localhost:5432/apolloDb
# Alternatively, can be a path to a file with the connection URL
# DB_CONNECTION_URL_FILE=/run/secrets/db-connection-url

# Legacy MongoDB connection (used when DB_BACKEND=mongo)
# MONGODB_URI=mongodb://127.0.0.1:27017/apolloDb
# Alternatively, can be a path to a file with the URI
# MONGODB_URI_FILE=/run/secrets/mongodb-uri

# Output folder for uploaded files
FILE_UPLOAD_FOLDER=./test/uploaded

# Secret used to encode JWT tokens
JWT_SECRET=84b5edd3-6c4e-42f3-9711-2f294c07df19
# Alternatively, can be a path to a file with the client secret
# JWT_SECRET_FILE=/run/secrets/jwt-secret

# Secret used to encode express sessions
SESSION_SECRET=g9fGaRuw06T7hs960Tm7KYyfcFaYEIaG9jfFnVEQ4QyFXmq7
# Alternatively, can be a path to a file with the session secret
# SESSION_SECRET_FILE=/run/secrets/session-secret

###########################################################################
## To enable users to log in, configure one or more OIDC providers,     ##
## REMOTE_USER header auth, or root user login.                         ##
###########################################################################

# OIDC login providers (JSON array). See docs/authentication.md for details.
# OIDC_PROVIDERS=[{"name":"google","displayName":"Google","issuerUrl":"https://accounts.google.com","clientId":"...","clientSecret":"..."}]
# Alternatively, can be a path to a file with the JSON array
# OIDC_PROVIDERS_FILE=/run/secrets/oidc-providers

# Trusted reverse proxy header for auto-login (e.g. Shibboleth, CAS, LDAP)
# REMOTE_USER_HEADER=X-Remote-User

##############
## OPTIONAL ##
##############

# Description of what is hosted on your server
# DESCRIPTION=My organizations Apollo server

# URL (relative or absolute) of the Apollo JBrowse plugin.
# Defaults to relative URL 'apollo.js'
# PLUGIN_LOCATION=apollo.js
# URL (relative or absolute) of a feature ontology JSON file.
# Defaults to relative URL 'sequence_ontology.json'
# FEATURE_TYPE_ONTOLOGY_LOCATION=sequence_ontology.json

# Comma-separated list of attributes in features to treat as ids
# These will be added to feature documents' "indexedIds"
# Defaults to gff_id
# INDEXED_IDS=gff_id,gene_id,transcript_id,exon_id

# Application port, defaults to 3999
# PORT=3999

# Enable all CORS requests, defaults to true
# CORS=true

# Comma-separated list of log levels to output
# Possible values are: error, warn, log, debug, verbose.
# Defaults to error,warn,log
# LOG_LEVELS=error,warn,log

# Reference sequence chunk size, defaults to 262144 (256 KiB)
# CHUNK_SIZE=262144

# Default new user role, possible values are admin, user, readOnly, and none
# Defaults to none
# DEFAULT_NEW_USER_ROLE=none

# Whether to broadcast users locations, defaults to true
# BROADCAST_USER_LOCATION=true

# Whether to allow a root user that can log in with a name and password. All
# other users must sign in with an authentication provider.
# Defaults to false
# ALLOW_ROOT_USER=false
# The root user password, required if ALLOW_ROOT_USER is true
# ROOT_USER_PASSWORD=password
# Alternatively, can be a path to a file with the root user password
# ROOT_USER_PASSWORD_FILE=/run/secrets/root-user-password

# Comma-separated list of Apollo plugins to use
# PLUGIN_URLS=https://example.com/apollo-plugin-example.umd.production.min.js
# Alternatively, can be a path to a file with a list of plugin URLs, one URL per
# line
# PLUGIN_URLS_FILE=/data/plugin-urls

# HTTP/HTTPS proxy for OAuth requests, if your server is behind a proxy
# OAUTH_HTTP_PROXY=http://proxy.example.com:8080

# Comma-separated list of additional origins allowed for post-login redirects.
# Only needed when the client is served from a different origin than the API
# (e.g. a Vite dev server). In production this is typically not needed.
# ALLOWED_REDIRECT_ORIGINS=http://localhost:5173
```
