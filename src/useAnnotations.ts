import { useEffect, useState } from 'react'

import type { AnnotationRow, AssemblyRecord, ChangeRecord, FeatureRecord, RefSeqRecord } from './types'

type Fetcher = (url: string, opts?: RequestInit) => Promise<Response>
type GetFetcher = (loc: { locationType: string; uri: string }) => Fetcher

const ANNOTATION_TYPES = new Set([
  'AddFeatureChange',
  'AddFeaturesFromFileChange',
])

const EDIT_TYPES = new Set([
  'AddFeatureChange',
  'AddFeaturesFromFileChange',
  'FeatureAttributeChange',
  'LocationEndChange',
  'LocationStartChange',
  'MergeExonsChange',
  'MergeTranscriptsChange',
  'SplitExonChange',
  'StrandChange',
  'TypeChange',
])

const DELETE_TYPE = 'DeleteFeatureChange'

export interface UseAnnotationsResult {
  rows: AnnotationRow[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadAll: () => void
  updateRow: (id: string, updates: Partial<AnnotationRow>) => void
}

export function useAnnotations(
  baseURL: string,
  getFetcher: GetFetcher,
  assemblyId: string | undefined,
  defaultLimit = 500,
): UseAnnotationsResult {
  const [rows, setRows] = useState<AnnotationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState<number | undefined>(defaultLimit)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!assemblyId) return
    let cancelled = false

    async function apiFetch(path: string, opts?: RequestInit) {
      const url = new URL(path, baseURL).toString()
      const fetcher = getFetcher({ locationType: 'UriLocation', uri: url })
      const res = await fetcher(url, opts)
      if (!res.ok) throw new Error(`Apollo API error ${res.status}: ${path}`)
      return res.json()
    }

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // 1. Fetch changes (most recent first)
        const limitParam = limit ? `&limit=${limit}` : ''
        const allChanges: ChangeRecord[] = await apiFetch(
          `changes?assembly=${assemblyId}&sort=desc${limitParam}`,
        )

        if (limit && allChanges.length >= limit) {
          setHasMore(true)
        } else {
          setHasMore(false)
        }

        // 2. Collect deleted feature IDs
        const deletedIds = new Set<string>()
        for (const c of allChanges) {
          if (c.typeName === DELETE_TYPE) {
            for (const id of c.changedIds) deletedIds.add(id)
          }
        }

        // 3. Build per-featureId audit map (oldest first = creation, newest = last edit)
        const creationMap = new Map<string, { user: string; createdAt: string }>()
        const modifiedMap = new Map<string, { user: string; modifiedAt: string }>()

        const changesOldFirst = [...allChanges].reverse()
        for (const c of changesOldFirst) {
          for (const fid of c.changedIds) {
            if (ANNOTATION_TYPES.has(c.typeName) && !creationMap.has(fid)) {
              creationMap.set(fid, { user: c.user, createdAt: c.createdAt })
            }
            if (EDIT_TYPES.has(c.typeName)) {
              modifiedMap.set(fid, { user: c.user, modifiedAt: c.updatedAt ?? c.createdAt })
            }
          }
        }

        // 4. Annotation IDs = created + not deleted
        const annotationIds = [...creationMap.keys()].filter(
          (id) => !deletedIds.has(id),
        )

        if (annotationIds.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false) }
          return
        }

        // 5. Fetch assembly + refSeq info
        const assemblies: AssemblyRecord[] = await apiFetch('assemblies')
        const assembly = assemblies.find((a) => a._id === assemblyId)
        const assemblyName = assembly?.name ?? assemblyId

        const refSeqs: RefSeqRecord[] = await apiFetch(`refSeqs?assembly=${assemblyId}`)
        const refSeqMap = new Map(refSeqs.map((r) => [r._id, r.name]))

        // 6. Fetch feature details in batches of 200
        const BATCH = 200
        const features: FeatureRecord[] = []
        for (let i = 0; i < annotationIds.length; i += BATCH) {
          const batch = annotationIds.slice(i, i + BATCH)
          const url = new URL('features/getByIds', baseURL).toString()
          const fetcher = getFetcher({ locationType: 'UriLocation', uri: url })
          const res = await fetcher(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ featureIds: batch, topLevel: true }),
          })
          if (!res.ok) continue
          const data: FeatureRecord[] = await res.json()
          features.push(...data)
        }

        // 7. Build rows (genes + mRNA children)
        function featureName(f: FeatureRecord): string {
          return (
            f.attributes?.['Name']?.[0] ??
            f.attributes?.['name']?.[0] ??
            ''
          )
        }

        function buildChildRows(
          parent: FeatureRecord,
          parentId: string,
          creation: { user: string; createdAt: string },
          modified: { user: string; modifiedAt: string },
          asmName: string,
        ): AnnotationRow[] {
          if (!parent.children) return []
          return Object.values(parent.children).map((child) => ({
            id: child._id,
            parentId,
            depth: 1,
            name: featureName(child),
            type: child.type,
            assembly: asmName,
            assemblyId: assemblyId ?? '',
            refSeqName: refSeqMap.get(child.refSeq) ?? child.refSeq,
            refSeqId: child.refSeq,
            min: child.min,
            max: child.max,
            strand: child.strand,
            createdBy: creation.user,
            createdAt: creation.createdAt,
            modifiedBy: modified.user,
            modifiedAt: modified.modifiedAt,
            hasChildren: false,
            attributes: child.attributes ?? {},
          }))
        }

        const result: AnnotationRow[] = []
        const asmName = assemblyName ?? assemblyId ?? ''
        for (const f of features) {
          const fid = f._id
          const creation = creationMap.get(fid) ?? { user: 'unknown', createdAt: '' }
          const modified = modifiedMap.get(fid) ?? { user: creation.user, modifiedAt: creation.createdAt }
          const childCount = f.children ? Object.keys(f.children).length : 0

          result.push({
            id: fid,
            parentId: undefined,
            depth: 0,
            name: featureName(f),
            type: f.type,
            assembly: asmName,
            assemblyId: assemblyId ?? '',
            refSeqName: refSeqMap.get(f.refSeq) ?? f.refSeq,
            refSeqId: f.refSeq,
            min: f.min,
            max: f.max,
            strand: f.strand,
            createdBy: creation.user,
            createdAt: creation.createdAt,
            modifiedBy: modified.user,
            modifiedAt: modified.modifiedAt,
            hasChildren: childCount > 0,
            attributes: f.attributes ?? {},
          })

          result.push(...buildChildRows(f, fid, creation, modified, asmName))
        }

        result.sort(
          (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
        )

        if (!cancelled) { setRows(result); setLoading(false) }
      } catch (e) {
        if (!cancelled) { setError(String(e)); setLoading(false) }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [baseURL, getFetcher, assemblyId, limit])

  function updateRow(id: string, updates: Partial<AnnotationRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r))
  }

  return { rows, loading, error, hasMore, loadAll: () => setLimit(undefined), updateRow }
}
