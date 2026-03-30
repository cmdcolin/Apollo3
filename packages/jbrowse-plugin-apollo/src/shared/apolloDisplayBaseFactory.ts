/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { AnnotationFeature } from '@apollo-annotation/mst'
import {
  type AnyConfigurationSchemaType,
  ConfigurationReference,
} from '@jbrowse/core/configuration'
import { BaseDisplay } from '@jbrowse/core/pluggableElementTypes'
import {
  type AbstractSessionModel,
  type SessionWithWidgets,
  getContainingView,
  getSession,
} from '@jbrowse/core/util'
import { getParentRenderProps } from '@jbrowse/core/util/tracks'
import { cast, types } from '@jbrowse/mobx-state-tree'
import type { LinearGenomeViewModel } from '@jbrowse/plugin-linear-genome-view'

import type { ApolloSessionModel, HoveredFeature } from '../session'
import { getRole, isReadOnly } from '../util'

const minDisplayHeight = 20

export function apolloDisplayBaseFactory(
  configSchema: AnyConfigurationSchemaType,
) {
  return BaseDisplay.props({
    configuration: ConfigurationReference(configSchema),
    graphical: true,
    table: false,
    showCheckResults: true,
    zoomThreshold: 200,
    heightPreConfig: types.maybe(
      types.refinement(
        'displayHeight',
        types.number,
        (n) => n >= minDisplayHeight,
      ),
    ),
    filteredFeatureTypes: types.array(types.string),
  })
    .views((self) => {
      const { configuration, renderProps: superRenderProps } = self
      return {
        renderProps() {
          return {
            ...superRenderProps(),
            ...getParentRenderProps(self),
            config: configuration.renderer,
          }
        },
      }
    })
    .volatile(() => ({
      scrollTop: 0,
    }))
    .views((self) => ({
      get lgv() {
        return getContainingView(self) as unknown as LinearGenomeViewModel
      },
      get height() {
        return self.heightPreConfig ?? 200
      },
      get zoomThresholdSetting() {
        return self.zoomThreshold
      },
    }))
    .views((self) => ({
      get rendererTypeName() {
        return self.configuration.renderer.type
      },
      get session() {
        return getSession(self) as unknown as ApolloSessionModel
      },
      get regions() {
        const regions = self.lgv.dynamicBlocks.contentBlocks.map(
          ({ assemblyName, end, refName, start }) => ({
            assemblyName,
            refName,
            start: Math.round(start),
            end: Math.round(end),
          }),
        )
        return regions
      },
      regionCannotBeRendered(/* region */) {
        if (self.lgv && self.lgv.bpPerPx >= self.zoomThreshold) {
          return 'Zoom in to see annotations'
        }
        return
      },
    }))
    .views((self) => ({
      get role() {
        const session = self.session as unknown as ApolloSessionModel
        return getRole(session)
      },
      get readOnly() {
        return isReadOnly(self.session as unknown as ApolloSessionModel)
      },
      get featureService() {
        return (self.session as unknown as ApolloSessionModel).apolloDataStore
          .featureService
      },
      getAssemblyId(assemblyName: string) {
        const { assemblyManager } =
          self.session as unknown as AbstractSessionModel
        const assembly = assemblyManager.get(assemblyName)
        if (!assembly) {
          throw new Error(`Could not find assembly named ${assemblyName}`)
        }
        return assembly.name
      },
      get selectedFeature(): AnnotationFeature | undefined {
        return (self.session as unknown as ApolloSessionModel)
          .apolloSelectedFeature
      },
      get hoveredFeature(): HoveredFeature | undefined {
        return (self.session as unknown as ApolloSessionModel)
          .apolloHoveredFeature
      },
    }))
    .actions((self) => ({
      setScrollTop(scrollTop: number) {
        self.scrollTop = scrollTop
      },
      setHeight(displayHeight: number) {
        self.heightPreConfig = Math.max(displayHeight, minDisplayHeight)
        return self.height
      },
      resizeHeight(distance: number) {
        const oldHeight = self.height
        const newHeight = this.setHeight(self.height + distance)
        return newHeight - oldHeight
      },
      showGraphicalOnly() {
        self.graphical = true
        self.table = false
      },
      showTableOnly() {
        self.graphical = false
        self.table = true
      },
      showGraphicalAndTable() {
        self.graphical = true
        self.table = true
      },
      toggleShowCheckResults() {
        self.showCheckResults = !self.showCheckResults
      },
      updateFilteredFeatureTypes(types: string[]) {
        self.filteredFeatureTypes = cast(types)
      },
      setZoomThresholdSetting({ zoomThreshold }: { zoomThreshold: number }) {
        self.zoomThreshold = zoomThreshold
      },
    }))
    .actions((self) => ({
      setSelectedFeature(feature?: AnnotationFeature) {
        ;(
          self.session as unknown as ApolloSessionModel
        ).apolloSetSelectedFeature(feature)
      },
      setHoveredFeature(hoveredFeature?: HoveredFeature) {
        ;(
          self.session as unknown as ApolloSessionModel
        ).apolloSetHoveredFeature(hoveredFeature)
      },
      showFeatureDetailsWidget(
        feature: AnnotationFeature,
        customWidgetNameAndId?: [string, string],
      ) {
        const [region] = self.regions
        const { assemblyName, refName } = region
        const assembly = self.getAssemblyId(assemblyName)
        if (!assembly) {
          return
        }
        const { session } = self
        const [widgetName, widgetId] = customWidgetNameAndId ?? [
          'ApolloFeatureDetailsWidget',
          'apolloFeatureDetailsWidget',
        ]
        const apolloFeatureWidget = (
          session as unknown as SessionWithWidgets
        ).addWidget(widgetName, widgetId, {
          feature,
          assembly,
          refName,
        })
        ;(session as unknown as SessionWithWidgets).showWidget(
          apolloFeatureWidget,
        )
      },
    }))
}
