import { ConfigurationSchema } from '@jbrowse/core/configuration'
import { ElementId } from '@jbrowse/core/util/types/mst'
import { types } from 'mobx-state-tree'

export const configSchema = ConfigurationSchema('ApolloAnnotationBrowserWidget', {})

export const stateModel = types.model('ApolloAnnotationBrowserWidget', {
  id: ElementId,
  type: types.literal('ApolloAnnotationBrowserWidget'),
  assembly: types.string,      // MongoDB ObjectId
  assemblyName: types.string,  // human-readable name
})
