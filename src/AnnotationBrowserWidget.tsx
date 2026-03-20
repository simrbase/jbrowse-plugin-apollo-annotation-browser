import { getRoot } from 'mobx-state-tree'
import { observer } from 'mobx-react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  GridToolbar,
} from '@mui/x-data-grid'
import React, { useCallback } from 'react'

import { useAnnotations } from './useAnnotations'
import type { AnnotationRow } from './types'
import type { Instance } from 'mobx-state-tree'
import type { stateModel } from './model'

interface ApolloInternetAccount {
  type: string
  baseURL: string
  getFetcher(loc: { locationType: string; uri: string }): (
    url: string,
    opts?: RequestInit,
  ) => Promise<Response>
}

interface ApolloRootModel {
  internetAccounts: ApolloInternetAccount[]
}

interface Props {
  model: Instance<typeof stateModel>
}

export const AnnotationBrowserWidget = observer(function AnnotationBrowserWidget({
  model,
}: Props) {
  const { assembly, assemblyName } = model

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { internetAccounts } = getRoot<ApolloRootModel>(model as any)
  const apolloInternetAccount = internetAccounts.find(
    (ia) => ia.type === 'ApolloInternetAccount',
  )
  if (!apolloInternetAccount) {
    return <Typography color="error">No Apollo internet account found.</Typography>
  }

  const { baseURL } = apolloInternetAccount
  // useCallback prevents a new function reference on every render,
  // which would cause useAnnotations' useEffect to loop infinitely
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getFetcher = useCallback(
    apolloInternetAccount.getFetcher.bind(apolloInternetAccount),
    [apolloInternetAccount],
  )

  const { rows, loading, error, hasMore, loadAll } = useAnnotations(
    baseURL,
    getFetcher,
    assembly,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function navigateTo(row: AnnotationRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = getRoot<any>(model)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const views: Array<{ type: string; navToLocString?: (loc: string) => void }> =
      session.session?.views ?? session.views ?? []
    const linearView = views.find((v) => v.type === 'LinearGenomeView')
    linearView?.navToLocString?.(`${row.refSeqName}:${row.min + 1}..${row.max}`)
  }

  const columns: GridColDef[] = [
    {
      field: 'navigate',
      headerName: '',
      width: 75,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<AnnotationRow>) => (
        <Button size="small" variant="outlined" onClick={() => navigateTo(params.row)}>
          Go to
        </Button>
      ),
    },
    { field: 'name', headerName: 'Name', width: 160, flex: 1 },
    { field: 'type', headerName: 'Type', width: 110 },

    {
      field: 'location',
      headerName: 'Location',
      width: 200,
      valueGetter: (_value: unknown, row: AnnotationRow) =>
        `${row.refSeqName}:${(row.min + 1).toLocaleString()}–${row.max.toLocaleString()}`,
    },
    { field: 'createdBy', headerName: 'Created By', width: 130 },
    { field: 'modifiedBy', headerName: 'Last Modified By', width: 150 },
    {
      field: 'modifiedAt',
      headerName: 'Last Modified',
      width: 160,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleString() : '',
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 160,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleString() : '',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 520, padding: 8, gap: 8 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Assembly: {assemblyName}
      </Typography>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading annotations…</Typography>
        </div>
      )}

      {error && (
        <Typography color="error" variant="body2">{error}</Typography>
      )}

      {!loading && !error && rows.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No annotations found for {assemblyName}.
        </Typography>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          {hasMore && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Typography variant="body2" color="text.secondary">
                Showing most recent 500 annotations.
              </Typography>
              <Button size="small" onClick={loadAll}>Load all</Button>
            </div>
          )}
          <DataGrid
            rows={rows}
            columns={columns}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true } }}
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              columns: { columnVisibilityModel: { createdAt: false, type: false } },
            }}
            density="compact"
            style={{ flex: 1 }}
            getRowId={(row: AnnotationRow) => row.id}
          />
        </>
      )}
    </div>
  )
})
