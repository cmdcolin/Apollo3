import { createMikroOrmConfig } from '@apollo-annotation/entities'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { DynamicModule, Module } from '@nestjs/common'

@Module({})
export class ApolloMikroOrmModule {
  static forRoot(): DynamicModule {
    const dbBackend = process.env.DB_BACKEND
    if (!dbBackend || dbBackend === 'mongodb') {
      return { module: ApolloMikroOrmModule }
    }

    const dbType = dbBackend as 'postgresql' | 'sqlite' | 'mongo'
    const connectionUrl = process.env.DB_CONNECTION_URL ?? 'apollo3.sqlite'

    const config = createMikroOrmConfig(dbType, connectionUrl)

    return {
      module: ApolloMikroOrmModule,
      imports: [MikroOrmModule.forRoot({ ...config, scope: undefined })],
      global: true,
    }
  }
}
