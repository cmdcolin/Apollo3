import {
  Operation,
  type SerializedOperation,
  type ServerDataStore,
} from '@apollo-annotation/common'

interface SerializedGetAssembliesOperation extends SerializedOperation {
  typeName: 'GetAssembliesOperation'
}

export class GetAssembliesOperation extends Operation {
  typeName = 'GetAssembliesOperation' as const

  toJSON(): SerializedGetAssembliesOperation {
    const { typeName } = this
    return { typeName }
  }

  async executeOnServer(backend: ServerDataStore) {
    return backend.assemblyRepository.findAll()
  }
}
