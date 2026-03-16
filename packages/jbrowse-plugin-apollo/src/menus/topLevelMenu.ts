import type {
  AbstractMenuManager,
  AbstractSessionModel,
} from '@jbrowse/core/util'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import LockIcon from '@mui/icons-material/Lock'
import LogoutIcon from '@mui/icons-material/Logout'
import RedoIcon from '@mui/icons-material/Redo'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import UndoIcon from '@mui/icons-material/Undo'
import VisibilityIcon from '@mui/icons-material/Visibility'

import {
  DownloadGFF3,
  LogOut,
  OpenLocalFile,
  ViewChangeLog,
  ViewCheckResults,
} from '../components'
import type { ApolloSessionModel } from '../session'

export function addTopLevelMenus(
  rootModel: AbstractMenuManager,
  readOnly: boolean,
) {
  if (!readOnly) {
    rootModel.appendToMenu('Apollo', {
      label: 'Edit',
      type: 'subMenu',
      icon: EditIcon,
      subMenu: [
        {
          label: 'Undo',
          icon: UndoIcon,
          onClick(session: ApolloSessionModel) {
            void session.apolloDataStore.changeManager.undoLastChange()
          },
        },
        {
          label: 'Redo',
          icon: RedoIcon,
          onClick(session: ApolloSessionModel) {
            void session.apolloDataStore.changeManager.redoLastChange()
          },
        },
        {
          label: 'Open local GFF3 file',
          icon: FileOpenIcon,
          onClick: (session: ApolloSessionModel) => {
            ;(session as unknown as AbstractSessionModel).queueDialog(
              (doneCallback) => [
                OpenLocalFile,
                {
                  session,
                  handleClose: () => {
                    doneCallback()
                  },
                  inMemoryFileDriver:
                    session.apolloDataStore.inMemoryFileDriver,
                },
              ],
            )
          },
        },
        {
          label: 'Lock/Unlock session',
          icon: LockIcon,
          onClick: (session: ApolloSessionModel) => {
            session.toggleLocked()
          },
        },
      ],
    })
  }

  rootModel.appendToMenu('Apollo', {
    label: 'View',
    type: 'subMenu',
    icon: VisibilityIcon,
    subMenu: [
      {
        label: 'Download GFF3',
        icon: DownloadIcon,
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              DownloadGFF3,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      },
      {
        label: 'Change log',
        icon: TrackChangesIcon,
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ViewChangeLog,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      },
      {
        label: 'Check results',
        icon: FactCheckIcon,
        onClick: (session: ApolloSessionModel) => {
          ;(session as unknown as AbstractSessionModel).queueDialog(
            (doneCallback) => [
              ViewCheckResults,
              {
                session,
                handleClose: () => {
                  doneCallback()
                },
              },
            ],
          )
        },
      },
    ],
  })

  rootModel.appendToMenu('Apollo', {
    label: 'Log out',
    icon: LogoutIcon,
    onClick: (session: ApolloSessionModel) => {
      ;(session as unknown as AbstractSessionModel).queueDialog(
        (doneCallback) => [
          LogOut,
          {
            session,
            handleClose: () => {
              doneCallback()
            },
          },
        ],
      )
    },
  })
}
