# Apollo3

Monorepo for Apollo3 development

| Package                                                                | Description                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| [apollo-collaboration-server](./packages/apollo-collaboration-server/) | NestJS backend (serves API and JBrowse UI)                 |
| [apollo-common](./packages/apollo-common/)                             | Public base classes for developers creating Apollo plugins |
| [apollo-entities](./packages/apollo-entities/)                         | MikroORM entities and repository implementations           |
| [apollo-mst](./packages/apollo-mst/)                                   | MobX State Tree models                                     |
| [apollo-shared](./packages/apollo-shared/)                             | Internal code shared between server and client             |
| [jbrowse-plugin-apollo](./packages/jbrowse-plugin-apollo/)             | Client-side code (as a JBrowse 2 plugin)                   |

See [the contribution guide](./CONTRIBUTING.md) for instructions to developers.

To boot up the dev server, run:

```sh
pnpm start
```

This builds shared packages and starts the collaboration server, which serves
both the API and the JBrowse UI on http://localhost:3999. On first run, it
automatically seeds a demo database with sample assemblies (volvox and hg38).

Make sure you've run `pnpm install` first if you haven't already.
