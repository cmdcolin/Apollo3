# Administrators

In order to do things like add new assemblies, import annotations from a file,
and manage the roles of other users, you will need to be an administrator. This
means your user account will need to have the role of `Admin`.

## Setting up the first admin

When Apollo starts for the first time (or when no admin user exists), it
generates a one-time **setup token** and prints it to the server console log:

```
========================================================
No admin user found. Use the following URL to set up the
first admin account:

  /auth/setup?token=<random-token>

========================================================
```

To create your admin account:

1. Copy the full setup URL from the server log (e.g.
   `http://localhost:3999/auth/setup?token=abc123...`)
2. Visit that URL in your browser — you will be redirected to the home page
3. Sign in with Google or Microsoft — the account you sign in with will
   automatically become the admin
4. The setup token is consumed and cannot be reused

This approach ensures that only someone with access to the server console can
create the first admin account.

:::info Previous behavior

In earlier versions of Apollo, the first user to log in was automatically made
an administrator. This was convenient for local development but posed a security
risk in production: anyone who happened to visit the server first would become
admin. The setup token approach requires explicit access to the server logs,
which is a standard pattern used by self-hosted applications like Gitea and
Grafana.

:::

### Alternative: root user

There is also the option to have a single user, referred to as the "root user",
with an `Admin` role that is able to authenticate without logging in via OAuth.
This is meant to be used to simplify running CLI commands as an administrator.
By default this user is disabled, but can be enabled with the `ALLOW_ROOT_USER`
and `ROOT_USER_PASSWORD` options in the
[configuration options](../installation/configuration-options).

### Subsequent users

Any users who log in after the admin has been set up will be given the role
defined by `DEFAULT_NEW_USER_ROLE` in the
[configuration options](../installation/configuration-options) (defaults to
`none`). Users with role `none` will see a "pending approval" message until an
admin assigns them a role.

An administrator can manage user roles from the **Users** page at
`/admin/users/`, or through the Apollo menu in JBrowse.

## How to access administrator capabilities

There are two ways to access administrator capabilities in Apollo. The first is
through the web UI at `/admin/users/` for user management, and `/ui/` for
browsing organisms, assemblies, and recent changes.

The second way is through the menus in the JBrowse user interface. The top-level
"Apollo" menu has a sub-menu called "Admin" that appears for those logged in as
an administrator.

The Apollo CLI provides the same options as the GUI, but may be more useful for
users who want to automate administration tasks or keep a log of setup commands.

Each guide in this section will give instructions for both the GUI and the CLI,
if applicable.

## Common administrator actions

Here are some of the most commonly-performed administrator tasks, and links to
the guide that explains each one:

- [Adding assemblies](assemblies)
- [Importing annotation features](annotation-features)
- [Managing users](users)
- [Adding evidence tracks](evidence-tracks)
