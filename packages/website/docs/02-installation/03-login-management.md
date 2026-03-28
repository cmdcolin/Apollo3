# Login management

Apollo uses **OpenID Connect (OIDC)** for user login. OIDC is a standard
protocol supported by Google, Microsoft, Keycloak, Auth0, Okta, GitLab, and
most institutional identity providers. Multiple providers can be configured
simultaneously.

Apollo also supports **REMOTE_USER** authentication for deployments behind a
reverse proxy (e.g. Apache with Shibboleth, nginx with LDAP/CAS), and a
**root login** for initial setup and emergency access.

## Set up an OIDC provider

To set up login, you'll need to register Apollo as an application with your
identity provider to get a **client ID** and **client secret**.

### Callback URL

When registering, set the callback/redirect URL to:

```
https://your-apollo-url/auth/oidc/{provider-name}/callback
```

For example, if your Apollo is at `https://apollo.example.edu` and you name
your Google provider `google`, the callback URL is:

```
https://apollo.example.edu/auth/oidc/google/callback
```

### Google setup

- Go to https://console.developers.google.com/
- Create or select a project
- Navigate to "APIs & Services" → "Credentials"
- Click "+ Create Credentials" → "OAuth client ID"
- Select "Web application"
- Add your Apollo URL as an authorized JavaScript origin
- Add the callback URL as an authorized redirect URI
- Note the Client ID and Client Secret

### Microsoft setup

- Go to https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
- Click "New registration"
- Select supported account types (multitenant recommended for broad access)
- Click "Register" and note the Application (client) ID
- Under "Client credentials", click "Add a certificate or secret"
- Create a new client secret and note the Value

### Keycloak / other OIDC providers

Any OIDC-compliant provider works. You just need:

- The **issuer URL** (the base URL that has a `.well-known/openid-configuration` endpoint)
- A **client ID** and **client secret** registered with that provider

### Configure Apollo

Set the `OIDC_PROVIDERS` environment variable to a JSON array:

```bash
OIDC_PROVIDERS='[
  {
    "name": "google",
    "displayName": "Google",
    "issuerUrl": "https://accounts.google.com",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret"
  }
]'
```

Multiple providers can be listed in the array. Each gets a "Sign in with
{displayName}" button on the login page.

For Docker secrets or mounted files, use `OIDC_PROVIDERS_FILE` instead to point
to a file containing the JSON.

Common issuer URLs:

| Provider  | Issuer URL                                            |
| --------- | ----------------------------------------------------- |
| Google    | `https://accounts.google.com`                         |
| Microsoft | `https://login.microsoftonline.com/{tenant-id}/v2.0`  |
| Keycloak  | `https://your-host/realms/{realm}`                    |
| Auth0     | `https://your-tenant.auth0.com`                       |
| Okta      | `https://your-org.okta.com`                           |

Restart the Apollo Collaboration Server after updating these values.

## REMOTE_USER (reverse proxy auth)

If Apollo runs behind a reverse proxy that handles authentication (Shibboleth,
CAS, LDAP), set:

```bash
REMOTE_USER_HEADER=X-Remote-User
```

The proxy must strip this header from incoming client requests to prevent
spoofing. Users are automatically logged in based on the header value.

## Root login

A password-based emergency login, disabled by default. Enable it with:

```bash
ALLOW_ROOT_USER=true
ROOT_USER_PASSWORD=your-strong-password
```

Access it at `/ui/root-login/`. Use it for initial setup, then disable it.
