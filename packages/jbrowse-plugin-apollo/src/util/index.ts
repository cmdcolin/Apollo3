import { readConfObject } from '@jbrowse/core/configuration'
import {
  type IAnyStateTreeNode,
  type Instance,
  getRoot,
} from '@jbrowse/mobx-state-tree'

import type ApolloPluginConfigurationSchema from '../config'

export async function createFetchErrorMessage(
  response: Response,
  additionalText?: string,
) {
  let errorMessage
  try {
    errorMessage = await response.text()
  } catch {
    errorMessage = ''
  }
  const responseMessage = `${response.status} ${response.statusText}${
    errorMessage ? ` (${errorMessage})` : ''
  }`
  return `${additionalText ? `${additionalText} — ` : ''}${responseMessage}`
}

function getPluginConfiguration(session: IAnyStateTreeNode) {
  const { jbrowse } = getRoot(session)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return jbrowse.configuration.ApolloPlugin as Instance<
    typeof ApolloPluginConfigurationSchema
  >
}

export function getBaseURL(session: IAnyStateTreeNode) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'baseURL') as string
}

export function getRole(session: IAnyStateTreeNode) {
  const pluginConfiguration = getPluginConfiguration(session)
  return (readConfObject(pluginConfiguration, 'role') as string) || undefined
}

export function isAuthenticated(session: IAnyStateTreeNode) {
  const role = getRole(session)
  return Boolean(role) && role !== 'none'
}

export function isReadOnly(session: IAnyStateTreeNode) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'readOnly') as boolean
}

export function canEdit(session: IAnyStateTreeNode) {
  return isAuthenticated(session) && !isReadOnly(session)
}

export function isAnalysisToolAvailable(
  session: IAnyStateTreeNode,
  toolName: string,
) {
  const role = getRole(session)
  if (role !== 'user' && role !== 'admin') {
    return false
  }
  const pluginConfiguration = getPluginConfiguration(session)
  const tools = readConfObject(
    pluginConfiguration,
    'availableAnalysisTools',
  ) as string[]
  return tools.includes(toolName)
}

export function getUserId(session: IAnyStateTreeNode) {
  const pluginConfiguration = getPluginConfiguration(session)
  return (readConfObject(pluginConfiguration, 'userId') as string) || undefined
}

export * from './loadAssemblyIntoClient'
export * from './annotationFeatureUtils'
export * from './glyphUtils'
export * from './mouseEventsUtils'
