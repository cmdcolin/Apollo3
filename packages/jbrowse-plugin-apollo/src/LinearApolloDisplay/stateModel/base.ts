/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type PluginManager from '@jbrowse/core/PluginManager'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import { type AbstractSessionModel, getSession } from '@jbrowse/core/util'
import { addDisposer, getSnapshot, types } from '@jbrowse/mobx-state-tree'
import { autorun } from 'mobx'

import { FilterFeatures } from '../../components/FilterFeatures'
import type { ApolloSessionModel } from '../../session'
import { apolloDisplayBaseFactory } from '../../shared/apolloDisplayBaseFactory'
import { EditZoomThresholdDialog } from '../../util/displayUtils'

export function baseModelFactory(
  _pluginManager: PluginManager,
  configSchema: AnyConfigurationSchemaType,
) {
  return types
    .compose(
      'BaseLinearApolloDisplay',
      apolloDisplayBaseFactory(configSchema),
      types.model({
        type: types.literal('LinearApolloDisplay'),
        loadingState: false,
      }),
    )
    .views((self) => ({
      get height() {
        if (self.heightPreConfig) {
          return self.heightPreConfig
        }
        if (self.graphical && self.table) {
          return 400
        }
        if (self.graphical) {
          return 100
        }
        return 200
      },
      get loading() {
        return self.loadingState
      },
    }))
    .actions((self) => ({
      setLoading(loading: boolean) {
        self.loadingState = loading
      },
    }))
    .views((self) => {
      const { filteredFeatureTypes, trackMenuItems: superTrackMenuItems } = self
      return {
        trackMenuItems() {
          const { graphical, table, showCheckResults } = self
          return [
            ...superTrackMenuItems(),
            {
              type: 'subMenu',
              label: 'Appearance',
              subMenu: [
                {
                  label: 'Show graphical display',
                  type: 'radio',
                  checked: graphical && !table,
                  onClick: () => {
                    self.showGraphicalOnly()
                  },
                },
                {
                  label: 'Show table display',
                  type: 'radio',
                  checked: table && !graphical,
                  onClick: () => {
                    self.showTableOnly()
                  },
                },
                {
                  label: 'Show both graphical and table display',
                  type: 'radio',
                  checked: table && graphical,
                  onClick: () => {
                    self.showGraphicalAndTable()
                  },
                },
                {
                  label: 'Check Results',
                  type: 'checkbox',
                  checked: showCheckResults,
                  onClick: () => {
                    self.toggleShowCheckResults()
                  },
                },
                {
                  label: 'Change zoom threshold',
                  onClick: () => {
                    getSession(self).queueDialog((handleClose) => [
                      EditZoomThresholdDialog,
                      { model: self, handleClose },
                    ])
                  },
                },
              ],
            },
            {
              label: 'Filter features by type',
              onClick: () => {
                const session = self.session as unknown as ApolloSessionModel
                ;(self.session as unknown as AbstractSessionModel).queueDialog(
                  (doneCallback) => [
                    FilterFeatures,
                    {
                      session,
                      handleClose: () => {
                        doneCallback()
                      },
                      featureTypes: getSnapshot(filteredFeatureTypes),
                      onUpdate: (types: string[]) => {
                        self.updateFilteredFeatureTypes(types)
                      },
                    },
                  ],
                )
              },
            },
          ]
        },
      }
    })
    .actions((self) => ({
      afterAttach() {
        addDisposer(
          self,
          autorun(
            () => {
              if (!self.lgv.initialized || self.regionCannotBeRendered()) {
                return
              }
              self.setLoading(true)
              void (
                self.session as unknown as ApolloSessionModel
              ).apolloDataStore
                .loadFeatures(self.regions)
                .then(() => {
                  setTimeout(() => {
                    self.setLoading(false)
                  }, 1000)
                })
            },
            { name: 'LinearApolloDisplayLoadFeatures', delay: 1000 },
          ),
        )
      },
    }))
}
