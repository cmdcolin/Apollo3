import type PluginManager from '@jbrowse/core/PluginManager'
import { Button } from '@mui/material'
import React, { useEffect, useState } from 'react'

import { NewApolloProjectDialog } from './NewApolloProjectDialog'

interface StartScreenProps {
  setPluginManager: (pm: PluginManager) => void
  loadPluginManager: (path: string) => Promise<PluginManager>
}

export function ApolloStartScreenLaunchPanel({
  DefaultComponent,
  props,
}: {
  DefaultComponent: React.ComponentType<Record<string, unknown>>
  props: StartScreenProps
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    function handler() {
      setDialogOpen(true)
    }
    document.addEventListener('apollo-open-new-project-dialog', handler)
    return () => {
      document.removeEventListener('apollo-open-new-project-dialog', handler)
    }
  }, [])

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button
          variant="contained"
          color="secondary"
          style={{ display: 'block', margin: 5 }}
          onClick={() => {
            setDialogOpen(true)
          }}
        >
          Open GFF3 + FASTA as Apollo project
        </Button>
      </div>
      <DefaultComponent {...props} />
      {dialogOpen ? (
        <NewApolloProjectDialog
          loadPluginManager={props.loadPluginManager}
          setPluginManager={props.setPluginManager}
          onClose={() => {
            setDialogOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
