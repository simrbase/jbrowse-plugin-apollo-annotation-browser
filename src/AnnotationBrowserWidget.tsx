import { getRoot } from 'mobx-state-tree'
import { observer } from 'mobx-react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  type GridRenderEditCellParams,
  useGridApiContext,
  GridToolbar,
} from '@mui/x-data-grid'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

// Edit cell that preserves the row's indentation during inline editing
function IndentedEditCell({ depth, params }: { depth: number; params: GridRenderEditCellParams<AnnotationRow> }) {
  const apiRef = useGridApiContext()
  return (
    <input
      autoFocus
      style={{ paddingLeft: depth * 24, width: '100%', border: 'none', outline: 'none', font: 'inherit', background: 'transparent' }}
      value={String(params.value ?? '')}
      onChange={(e) => {
        void apiRef.current.setEditCellValue({ id: params.id, field: params.field, value: e.target.value })
      }}
    />
  )
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

  const { rows: allRows, loading, error, hasMore, loadAll, updateRow, refresh } = useAnnotations(
    baseURL,
    getFetcher,
    assembly,
  )

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => { refresh() }, 30_000)
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh])

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filter: show top-level rows always; show child rows only if parent is expanded
  const rows = useMemo(
    () => allRows.filter((r) => r.depth === 0 || expandedIds.has(r.parentId ?? '')),
    [allRows, expandedIds],
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

  // Save an edited name back to Apollo via FeatureAttributeChange.
  // Uses attributes stored at load time as oldAttributes (Option A).
  // Option B — re-fetching the feature fresh before submitting — would be
  // safer in multi-user environments where another curator may have changed
  // attributes between when this table loaded and when the edit is committed.
  async function processRowUpdate(newRow: AnnotationRow, oldRow: AnnotationRow): Promise<AnnotationRow> {
    if (newRow.name === oldRow.name) return newRow

    const oldAttributes = { ...oldRow.attributes }
    const newAttributes = { ...oldRow.attributes, Name: [newRow.name] }

    const url = new URL('changes', baseURL).toString()
    const fetcher = getFetcher({ locationType: 'UriLocation', uri: url })
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typeName: 'FeatureAttributeChange',
        assembly: oldRow.assemblyId,
        changedIds: [oldRow.id],
        featureId: oldRow.id,
        oldAttributes,
        newAttributes,
      }),
    })

    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Failed to save name: ${msg}`)
    }

    // Patch allRows so the edit survives expand/collapse recomputes
    const updated = { ...newRow, attributes: newAttributes }
    updateRow(newRow.id, { name: newRow.name, attributes: newAttributes })
    return updated
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
    {
      field: 'expand',
      headerName: '',
      width: 36,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<AnnotationRow>) => {
        const row = params.row
        if (!row.hasChildren) return null
        const expanded = expandedIds.has(row.id)
        return (
          <IconButton size="small" onClick={() => toggleExpand(row.id)}>
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        )
      },
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 160,
      flex: 1,
      editable: true,
      renderCell: (params: GridRenderCellParams<AnnotationRow>) => (
        <span style={{ paddingLeft: params.row.depth * 24 }}>
          {params.row.name}
        </span>
      ),
      // Preserve indentation while editing
      renderEditCell: (params: GridRenderEditCellParams<AnnotationRow>) => (
        <IndentedEditCell params={params} depth={params.row.depth} />
      ),
    },
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" style={{ flex: 1 }}>
          Assembly: {assemblyName}
        </Typography>
        <Tooltip title={autoRefresh ? 'Auto-refresh on (every 30s) — click to disable' : 'Enable auto-refresh (every 30s)'}>
          <IconButton
            size="small"
            onClick={() => setAutoRefresh((v) => !v)}
            color={autoRefresh ? 'primary' : 'default'}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Refresh now">
          <span>
            <IconButton size="small" onClick={() => refresh()} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </div>

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
              columns: { columnVisibilityModel: { createdAt: false } },
            }}
            density="compact"
            style={{ flex: 1 }}
            getRowId={(row: AnnotationRow) => row.id}
            getRowClassName={(params) =>
              (params.row as AnnotationRow).depth > 0 ? 'child-row' : ''
            }
            sx={{
              '& .child-row': { backgroundColor: 'action.hover' },
            }}
            processRowUpdate={processRowUpdate}
            onProcessRowUpdateError={(error: unknown) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const session = getRoot<any>(model)
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              session.notify(String(error), 'error')
            }}
          />
        </>
      )}
    </div>
  )
})
