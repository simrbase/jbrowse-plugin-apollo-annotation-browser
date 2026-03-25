import { useEffect, useRef, useState } from 'react'

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
const POLL_INTERVAL_MS = 10_000

export interface UseAnnotationsResult {
  rows: AnnotationRow[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadAll: () => void
  updateRow: (id: string, updates: Partial<AnnotationRow>) => void
  refresh: () => void
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
  const [loadVersion, setLoadVersion] = useState(0)

  // Track the most-recent change ID after each full load.
  // A ref avoids stale-closure issues inside the polling interval.
  const lastChangeIdRef = useRef<string | null>(null)

  // Always keep a current reference to getFetcher so the polling interval
  // can use it without being in the interval's dependency array (which would
  // restart the timer on every MobX reaction that touches apolloInternetAccount).
  const getFetcherRef = useRef(getFetcher)
  useEffect(() => { getFetcherRef.current = getFetcher }, [getFetcher])

  // ── Full data load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!assemblyId) return
    let cancelled = false

    async function apiFetch(path: string, opts?: RequestInit) {
      const url = new URL(path, baseURL).toString()
      const fetcher = getFetcherRef.current({ locationType: 'UriLocation', uri: url })
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

        // Remember the latest change ID for the poll watcher
        lastChangeIdRef.current = allChanges[0]?._id ?? null

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
          const fetcher = getFetcherRef.current({ locationType: 'UriLocation', uri: url })
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
  // getFetcher intentionally omitted — we use getFetcherRef to avoid
  // infinite loops caused by MobX recreating the function reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, assemblyId, limit, loadVersion])

  // ── Lightweight change-detection poll ────────────────────────────────────
  // Every POLL_INTERVAL_MS, fetch only the 1 most-recent change.
  // If its ID differs from what was seen after the last full load, trigger one.
  useEffect(() => {
    if (!assemblyId) return

    const timer = setInterval(async () => {
      try {
        const url = new URL(`changes?assembly=${assemblyId}&sort=desc&limit=1`, baseURL).toString()
        const fetcher = getFetcherRef.current({ locationType: 'UriLocation', uri: url })
        const res = await fetcher(url)
        if (!res.ok) return
        const changes = await res.json() as ChangeRecord[]
        const latestId = changes[0]?._id
        if (!latestId) return

        if (lastChangeIdRef.current === null) {
          // Not yet set by a full load — initialise without triggering reload
          lastChangeIdRef.current = latestId
        } else if (latestId !== lastChangeIdRef.current) {
          // New change detected — trigger a full reload
          setLoadVersion((v) => v + 1)
        }
      } catch {
        // Silently ignore transient poll errors
      }
    }, POLL_INTERVAL_MS)

    return () => { clearInterval(timer) }
  }, [baseURL, assemblyId])

  function updateRow(id: string, updates: Partial<AnnotationRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r))
  }

  return {
    rows,
    loading,
    error,
    hasMore,
    loadAll: () => setLimit(undefined),
    updateRow,
    refresh: () => setLoadVersion((v) => v + 1),
  }
}
