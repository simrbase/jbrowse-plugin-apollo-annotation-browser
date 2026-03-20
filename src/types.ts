export interface ChangeRecord {
  _id: string
  typeName: string
  changedIds: string[]
  assembly: string
  user: string
  createdAt: string
  updatedAt: string
}

export interface FeatureRecord {
  _id: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  refSeq: string
  attributes?: Record<string, string[]>
  children?: Record<string, FeatureRecord>
}

export interface RefSeqRecord {
  _id: string
  name: string
  assembly: string
}

export interface AssemblyRecord {
  _id: string
  name: string
  aliases?: string[]
}

export interface AnnotationRow {
  id: string
  parentId?: string
  depth: number
  name: string
  type: string
  assembly: string
  assemblyId: string
  refSeqName: string
  refSeqId: string
  min: number
  max: number
  strand?: 1 | -1
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  hasChildren: boolean
  // Stored at load time for use in FeatureAttributeChange oldAttributes.
  // NOTE: Option B (re-fetching attributes fresh on edit) would be safer in
  // multi-user environments where another curator may have changed attributes
  // between when this table loaded and when the user commits an edit. Option A
  // is simpler and acceptable for single-session use.
  attributes: Record<string, string[]>
}
