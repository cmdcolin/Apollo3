/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type PluginManager from '@jbrowse/core/PluginManager'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import { doesIntersect2 } from '@jbrowse/core/util'
import { type Instance, addDisposer, types } from '@jbrowse/mobx-state-tree'
import { type Theme, createTheme } from '@mui/material'
import { autorun } from 'mobx'

import { layoutsModelFactory } from './layouts'

export function renderingModelFactory(
  pluginManager: PluginManager,
  configSchema: AnyConfigurationSchemaType,
) {
  const LinearApolloDisplayLayouts = layoutsModelFactory(
    pluginManager,
    configSchema,
  )

  return LinearApolloDisplayLayouts.named('LinearApolloDisplayRendering')
    .props({
      apolloRowHeight: 20,
      detailsMinHeight: 200,
      detailsHeight: 200,
      lastRowTooltipBufferHeight: 40,
      isShown: true,
      filteredTranscripts: types.array(types.string),
    })
    .volatile(() => ({
      canvas: null as HTMLCanvasElement | null,
      overlayCanvas: null as HTMLCanvasElement | null,
      theme: createTheme(),
    }))
    .views((self) => ({
      get featuresHeight() {
        return (
          (self.highestRow + 1) * self.apolloRowHeight +
          self.lastRowTooltipBufferHeight
        )
      },
    }))
    .actions((self) => ({
      toggleShown() {
        self.isShown = !self.isShown
      },
      setDetailsHeight(newHeight: number) {
        self.detailsHeight = self.isShown
          ? Math.max(
              Math.min(newHeight, self.height - 100),
              Math.min(self.height, self.detailsMinHeight),
            )
          : newHeight
      },
      setCanvas(canvas: HTMLCanvasElement | null) {
        self.canvas = canvas
      },
      setOverlayCanvas(canvas: HTMLCanvasElement | null) {
        self.overlayCanvas = canvas
      },
      setTheme(theme: Theme) {
        self.theme = theme
      },
    }))
    .actions((self) => ({
      afterAttach() {
        addDisposer(
          self,
          autorun(
            () => {
              const { canvas, featureLayouts, featuresHeight, lgv } = self
              if (!lgv.initialized || self.regionCannotBeRendered()) {
                return
              }
              const { displayedRegions, dynamicBlocks } = lgv

              const ctx = canvas?.getContext('2d')
              if (!ctx) {
                return
              }
              ctx.clearRect(0, 0, dynamicBlocks.totalWidthPx, featuresHeight)
              for (const [idx, featureLayout] of featureLayouts.entries()) {
                const displayedRegion = displayedRegions[idx]
                for (const [row, featureLayoutRow] of featureLayout.entries()) {
                  for (const [featureRow, featureId] of featureLayoutRow) {
                    const feature = self.getAnnotationFeatureById(featureId)
                    if (featureRow > 0 || !feature) {
                      continue
                    }
                    if (
                      !doesIntersect2(
                        displayedRegion.start,
                        displayedRegion.end,
                        feature.min,
                        feature.max,
                      )
                    ) {
                      continue
                    }
                    self.getGlyph(feature).draw(ctx, feature, row, self, idx)
                  }
                }
              }
            },
            { name: 'LinearApolloDisplayRenderFeatures' },
          ),
        )
      },
    }))
}

export type LinearApolloDisplayRenderingModel = ReturnType<
  typeof renderingModelFactory
>
// eslint disable because of
// https://mobx-state-tree.js.org/tips/typescript#using-a-mst-type-at-design-time
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LinearApolloDisplayRendering extends Instance<LinearApolloDisplayRenderingModel> {}
