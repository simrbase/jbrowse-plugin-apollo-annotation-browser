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
}
