import { getRoot } from 'mobx-state-tree'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import type { SelectChangeEvent } from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  GridToolbar,
} from '@mui/x-data-grid'
import React, { useEffect, useState } from 'react'

import { useAnnotations } from './useAnnotations'
import type { AnnotationRow, AssemblyRecord } from './types'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
  handleClose(): void
}

export function BrowseAnnotationsDialog({ handleClose, session }: Props) {
  const { internetAccounts } = getRoot<ApolloRootModel>(session)
  const apolloInternetAccount = internetAccounts.find(
    (ia) => ia.type === 'ApolloInternetAccount',
  )
  if (!apolloInternetAccount) {
    throw new Error('No Apollo internet account found')
  }

  const { baseURL } = apolloInternetAccount
  const getFetcher = apolloInternetAccount.getFetcher.bind(apolloInternetAccount)

  // Fetch assemblies directly from the API so we have real MongoDB _ids
  const [assemblies, setAssemblies] = useState<AssemblyRecord[]>([])
  const [assemblyId, setAssemblyId] = useState<string>('')

  useEffect(() => {
    async function loadAssemblies() {
      const url = new URL('assemblies', baseURL).toString()
      const fetcher = getFetcher({ locationType: 'UriLocation', uri: url })
      const res = await fetcher(url)
      if (!res.ok) return
      const data: AssemblyRecord[] = await res.json()
      setAssemblies(data)
      if (data.length > 0) setAssemblyId(data[0]._id)
    }
    void loadAssemblies()
  }, [baseURL]) // eslint-disable-line react-hooks/exhaustive-deps

  const { rows, loading, error, hasMore, loadAll } = useAnnotations(
    baseURL,
    getFetcher,
    assemblyId || undefined,
  )

  function handleAssemblyChange(e: SelectChangeEvent<string>) {
    setAssemblyId(e.target.value)
  }

  function navigateTo(row: AnnotationRow) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const views: Array<{ type: string; navToLocString?: (loc: string) => void }> =
      session.views ?? []
    const linearView = views.find((v) => v.type === 'LinearGenomeView')
    if (!linearView?.navToLocString) return
    linearView.navToLocString(`${row.refSeqName}:${row.min + 1}..${row.max}`)
    handleClose()
  }

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 180, flex: 1 },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'location',
      headerName: 'Location',
      width: 220,
      valueGetter: (_value: unknown, row: AnnotationRow) =>
        `${row.refSeqName}:${(row.min + 1).toLocaleString()}–${row.max.toLocaleString()}`,
    },
    { field: 'createdBy', headerName: 'Created By', width: 140 },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 160,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleString() : '',
    },
    { field: 'modifiedBy', headerName: 'Last Modified By', width: 150 },
    {
      field: 'modifiedAt',
      headerName: 'Last Modified',
      width: 160,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleString() : '',
    },
    {
      field: 'navigate',
      headerName: '',
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<AnnotationRow>) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => navigateTo(params.row)}
        >
          Go to
        </Button>
      ),
    },
  ]

  return (
    <>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minWidth: 900,
          minHeight: 500,
        }}
      >
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="assembly-label">Assembly</InputLabel>
          <Select
            labelId="assembly-label"
            value={assemblyId}
            label="Assembly"
            onChange={handleAssemblyChange}
          >
            {assemblies.map((a) => (
              <MenuItem key={a._id} value={a._id}>
                {a.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Loading annotations…</Typography>
          </div>
        )}

        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}

        {!loading && !error && rows.length === 0 && assemblyId && (
          <Typography variant="body2" color="text.secondary">
            No annotations found for this assembly.
          </Typography>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            {hasMore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Typography variant="body2" color="text.secondary">
                  Showing most recent 500 annotations.
                </Typography>
                <Button size="small" onClick={loadAll}>
                  Load all
                </Button>
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
              }}
              density="compact"
              sx={{ flex: 1 }}
              getRowId={(row: AnnotationRow) => row.id}
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </>
  )
}
