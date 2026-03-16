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

export function isReadOnly(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'readOnly') as boolean
}

export function isTiberiusAvailable(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return readConfObject(pluginConfiguration, 'tiberiusAvailable') as boolean
}

export function getUserId(session: ApolloSessionModel) {
  const pluginConfiguration = getPluginConfiguration(session)
  return (readConfObject(pluginConfiguration, 'userId') as string) || undefined
}

export function apolloFetch(url: string | URL, init?: RequestInit) {
  return fetch(url, { ...init, credentials: 'same-origin' })
}

export * from './loadAssemblyIntoClient'
export * from './annotationFeatureUtils'
export * from './glyphUtils'
export * from './mouseEventsUtils'
