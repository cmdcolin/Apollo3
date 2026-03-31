import { ConfigurationSchema } from '@jbrowse/core/configuration'
import { types } from '@jbrowse/mobx-state-tree'

import { OntologyRecordConfiguration } from './OntologyManager'

const ApolloPluginConfigurationSchema = ConfigurationSchema('ApolloPlugin', {
  ontologies: types.array(OntologyRecordConfiguration),
  featureTypeOntologyName: {
    description: 'Name of the feature type ontology',
    type: 'string',
    defaultValue: 'Sequence Ontology',
  },
  hasRole: {
    description: 'Flag used internally by jbrowse-plugin-apollo',
    type: 'boolean',
    defaultValue: false,
  },
  baseURL: {
    description: 'Location of Apollo collaboration server',
    type: 'string',
    defaultValue: '',
  },
  role: {
    description: 'User role returned by server',
    type: 'string',
    defaultValue: '',
  },
  readOnly: {
    description: 'Whether the user has read-only access (no editing)',
    type: 'boolean',
    defaultValue: false,
  },
  availableAnalysisTools: {
    description: 'List of analysis tool names available on the server',
    type: 'stringArray',
    defaultValue: [],
  },
  userId: {
    description: 'User ID returned by server',
    type: 'string',
    defaultValue: '',
  },
  userSessionId: {
    description: 'User session ID for WebSocket deduplication',
    type: 'string',
    defaultValue: '',
  },
  geneBackgroundColor: {
    description: 'Color for feature background',
    type: 'string',
    defaultValue: 'jexl:geneBackgroundColor(featureType)',
    contextVariable: ['featureType'],
  },
})

export default ApolloPluginConfigurationSchema
