/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { changeRegistry } from '@apollo-annotation/common'
import type { AnnotationFeature } from '@apollo-annotation/mst'
import { makeStyles } from '@jbrowse/core/util/tss-react'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid'
import React, { useEffect, useState } from 'react'

import type { ApolloSessionModel } from '../session'
import { createFetchErrorMessage, getBaseURL } from '../util'

import { Dialog } from './Dialog'

interface FeatureChangeLogProps {
  session: ApolloSessionModel
  handleClose(): void
  feature: AnnotationFeature
}

const useStyles = makeStyles()((theme) => ({
  changeTextarea: {
    fontFamily: 'monospace',
    width: 600,
    resize: 'none',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  featureInfo: {
    padding: theme.spacing(1, 5),
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
}))

/** Walk up the parent chain to the root feature (gene). */
function getRootFeature(feature: AnnotationFeature): AnnotationFeature {
  let current = feature
  while (current.parent) {
    current = current.parent
  }
  return current
}

function getFeatureDisplayName(feature: AnnotationFeature): string {
  const name = feature.attributes.get('gff_name')?.join(', ')
  const id = feature.attributes.get('gff_id')?.join(', ')
  return name ?? id ?? feature._id
}

export function FeatureChangeLog({
  feature,
  handleClose,
  session,
}: FeatureChangeLogProps) {
  const baseURL = getBaseURL(session)
  const { classes } = useStyles()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [displayGridData, setDisplayGridData] = useState<GridRowsProp[]>([])

  const rootFeature = getRootFeature(feature)
  const featureName = getFeatureDisplayName(feature)
  const rootName = getFeatureDisplayName(rootFeature)
  const isRoot = rootFeature._id === feature._id

  const gridColumns: GridColDef[] = [
    { field: 'sequence' },
    {
      field: 'typeName',
      headerName: 'Change type',
      width: 220,
      type: 'singleSelect',
      valueOptions: [...changeRegistry.changes.keys()],
    },
    {
      field: 'changes',
      headerName: 'Change JSON',
      width: 600,
      renderCell: ({ value }) => (
        <textarea
          className={classes.changeTextarea}
          value={JSON.stringify(value)}
          readOnly
        />
      ),
    },
    { field: 'user', headerName: 'User', width: 140 },
    {
      field: 'createdAt',
      headerName: 'Time',
      width: 160,
      type: 'dateTime',
      valueGetter: (value: string | null | undefined) =>
        value ? new Date(value) : null,
    },
  ]

  useEffect(() => {
    async function fetchChanges() {
      const url = new URL('changes', baseURL)
      url.searchParams.set('featureId', rootFeature._id)
      const uri = url.toString()
      const response = await fetch(uri, {
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
      if (!response.ok) {
        const newErrorMessage = await createFetchErrorMessage(
          response,
          'Error when retrieving feature history',
        )
        setErrorMessage(newErrorMessage)
        return
      }
      const data = await response.json()
      setDisplayGridData(data)
    }
    fetchChanges().catch((error) => {
      setErrorMessage(String(error))
    })
  }, [baseURL, rootFeature])

  const title = isRoot
    ? `Feature history: ${feature.type} ${featureName}`
    : `Feature history: ${feature.type} ${featureName} (gene: ${rootName})`

  return (
    <Dialog
      open
      fullScreen
      title={title}
      handleClose={handleClose}
      data-testid="feature-changelog"
    >
      <Typography className={classes.featureInfo}>
        Showing all changes to {rootFeature.type} <strong>{rootName}</strong>{' '}
        and its children (
        {feature.type === rootFeature.type
          ? ''
          : `including ${feature.type} ${featureName} and other subfeatures`}
        ) &nbsp;&mdash; {rootFeature.min + 1}..{rootFeature.max} on{' '}
        {rootFeature.refSeq}
      </Typography>
      <DialogContent>
        <DataGrid
          pagination
          rows={displayGridData}
          columns={gridColumns}
          getRowId={(row) => row._id}
          showToolbar
          initialState={{
            sorting: { sortModel: [{ field: 'sequence', sort: 'desc' }] },
            columns: { columnVisibilityModel: { sequence: false } },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
      {errorMessage ? (
        <DialogContent>
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
