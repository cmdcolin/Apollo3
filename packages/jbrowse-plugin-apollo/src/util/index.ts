import { readConfObject } from '@jbrowse/core/configuration'
import { type Instance, getRoot } from '@jbrowse/mobx-state-tree'

import type ApolloPluginConfigurationSchema from '../config'
import type { ApolloSessionModel } from '../session'
import type { ApolloRootModel } from '../types'

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

function getPluginConfiguration(session: ApolloSessionModel) {
  const { jbrowse } = getRoot<ApolloRootModel>(session)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return jbrowse.configuration.ApolloPlugin as Instance<
    typeof ApolloPluginConfigurationSchema
  >
}

export function getBaseURL(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'baseURL') as string
}

export function getRole(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return (readConfObject(pluginConfiguration, 'role') as string) || undefined
}

export function isAuthenticated(session: ApolloSessionModel) {
  const role = getRole(session)
  return Boolean(role) && role !== 'none'
}

export function isReadOnly(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'readOnly') as boolean
}

export function canEdit(session: ApolloSessionModel) {
  return isAuthenticated(session) && !isReadOnly(session)
}

export function isAnalysisToolAvailable(
  session: ApolloSessionModel,
  toolName: string,
) {
  if (!isAuthenticated(session)) {
    return false
  }
  const pluginConfiguration = getPluginConfiguration(session)
  const tools = readConfObject(
    pluginConfiguration,
    'availableAnalysisTools',
  ) as string[]
  return tools.includes(toolName)
}

export function getUserId(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return (readConfObject(pluginConfiguration, 'userId') as string) || undefined
}

export * from './loadAssemblyIntoClient'
export * from './annotationFeatureUtils'
export * from './glyphUtils'
export * from './mouseEventsUtils'
