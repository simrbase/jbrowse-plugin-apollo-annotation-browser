import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import React, { useEffect, useState } from 'react'

import type { AssemblyRecord } from './types'

type Fetcher = (url: string, opts?: RequestInit) => Promise<Response>
type GetFetcher = (loc: { locationType: string; uri: string }) => Fetcher

interface Props {
  baseURL: string
  getFetcher: GetFetcher
  handleClose: () => void
  onSelect: (assembly: AssemblyRecord) => void
}

export function AssemblyPickerDialog({ baseURL, getFetcher, handleClose, onSelect }: Props) {
  const [assemblies, setAssemblies] = useState<AssemblyRecord[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = new URL('assemblies', baseURL).toString()
    const fetcher = getFetcher({ locationType: 'UriLocation', uri: url })
    fetcher(url)
      .then((r) => r.json() as Promise<AssemblyRecord[]>)
      .then((data) => {
        setAssemblies(data)
        if (data.length > 0) setSelected(data[0]._id)
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [baseURL, getFetcher])

  function handleConfirm() {
    const match = assemblies.find((a) => a._id === selected)
    if (match) onSelect(match)
    handleClose()
  }

  return (
    <>
      <DialogTitle>Browse Annotations</DialogTitle>
      <DialogContent sx={{ minWidth: 320, pt: 1 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Select an assembly to browse annotations:
        </Typography>
        {loading ? (
          <CircularProgress size={20} />
        ) : (
          <FormControl fullWidth size="small">
            <InputLabel id="assembly-picker-label">Assembly</InputLabel>
            <Select
              labelId="assembly-picker-label"
              value={selected}
              label="Assembly"
              onChange={(e: SelectChangeEvent<string>) => { setSelected(e.target.value) }}
            >
              {assemblies.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!selected}>
          Browse
        </Button>
      </DialogActions>
    </>
  )
}
