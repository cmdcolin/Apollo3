# Local development

You'll need `yarn` to be installed.

## Quick start

```sh
yarn install
yarn start
```

This builds shared packages and starts the collaboration server on
http://localhost:3999, which serves both the API and the JBrowse UI.

By default, Apollo uses SQLite for local development. For PostgreSQL, set the
`DB_BACKEND=postgresql` and `DB_CONNECTION_URL=postgresql://...` environment
variables.

## In a container via Visual Studio Code

If you use Visual Studio Code, you can leverage the _Dev Containers_ extension.
You'll need `docker` to be installed.

- Open the Apollo3 project in Visual Studio Code.
- Use the _Dev Containers: Reopen in Container_ command in VS Code
  (`Ctrl + Shift + P` to search for commands).
- Use the _Task: Run Task -> Start_ command in VS Code

The dev container uses PostgreSQL by default.
