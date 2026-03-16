import type {
  AbstractMenuManager,
  AbstractSessionModel,
} from '@jbrowse/core/util'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import InputIcon from '@mui/icons-material/Input'

import { ImportFeatures } from '../components'
import type { ApolloSessionModel } from '../session'

export function addTopLevelAdminMenus(rootModel: AbstractMenuManager) {
  rootModel.appendToMenu('Apollo', {
    label: 'Admin',
    type: 'subMenu',
    icon: AdminPanelSettingsIcon,
    subMenu: [
      {
        label: 'Import features',
        icon: InputIcon,
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ImportFeatures,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
                changeManager: session.apolloDataStore.changeManager,
              },
            ],
          )
        },
      },
    ],
  })
}
