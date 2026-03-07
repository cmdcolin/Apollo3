# Apollo3

Monorepo for Apollo3 development

| Package                                                                | Description                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| [apollo-collaboration-server](./packages/apollo-collaboration-server/) | Server-side code                                           |
| [apollo-common](./packages/apollo-common/)                             | Public base classes for developers creating Apollo plugins |
| [apollo-mst](./packages/apollo-mst/)                                   | mobx-state-tree models                                     |
| [apollo-schemas](./packages/apollo-schemas/)                           | MongoDB schemas                                            |
| [apollo-shared](./packages/apollo-shared/)                             | Internal code shared between server and client             |
| [jbrowse-plugin-apollo](./packages/jbrowse-plugin-apollo/)             | Client-side code (as a JBrowse 2 plugin)                   |

See [the contribution guide](./CONTRIBUTING.md) for instructions to developers.

● To boot up the dev server, run:

yarn start

This runs three things in parallel:

1. start:shared — builds/watches @apollo-annotation/shared
2. start:server — starts the collaboration server
   (@apollo-annotation/collaboration-server)
3. start:plugin — starts the JBrowse plugin
   (@apollo-annotation/jbrowse-plugin-apollo)

Make sure you've run yarn install first if you haven't already.
