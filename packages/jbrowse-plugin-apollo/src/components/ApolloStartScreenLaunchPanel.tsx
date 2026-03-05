/* eslint-disable @typescript-eslint/no-misused-promises */
import { Button } from '@mui/material'
import React, { useEffect, useState } from 'react'

import type PluginManager from '@jbrowse/core/PluginManager'

import { NewApolloProjectDialog } from './NewApolloProjectDialog'

export function ApolloStartScreenLaunchPanel({
  DefaultComponent,
  props,
}: {
  DefaultComponent: React.ComponentType<Record<string, unknown>>
  props: Record<string, unknown>
}) {
  const setPluginManager = props.setPluginManager as (pm: PluginManager) => void
  const loadPluginManager = props.loadPluginManager as (
    path: string,
  ) => Promise<PluginManager>
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
          loadPluginManager={loadPluginManager}
          setPluginManager={setPluginManager}
          onClose={() => {
            setDialogOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
