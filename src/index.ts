import Plugin from '@jbrowse/core/Plugin'
import PluginManager from '@jbrowse/core/PluginManager'
import { WidgetType } from '@jbrowse/core/pluggableElementTypes'
import { isAbstractMenuManager } from '@jbrowse/core/util'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import { getRoot } from 'mobx-state-tree'
import React from 'react'

import { version } from '../package.json'
import { AnnotationBrowserWidget } from './AnnotationBrowserWidget'
import { AssemblyPickerDialog } from './AssemblyPickerDialog'
import { configSchema, stateModel } from './model'
import type { AssemblyRecord } from './types'

export default class ApolloAnnotationBrowserPlugin extends Plugin {
  name = 'ApolloAnnotationBrowserPlugin'
  version = version

  install(pluginManager: PluginManager) {
    pluginManager.addWidgetType(() => {
      return new WidgetType({
        name: 'ApolloAnnotationBrowserWidget',
        heading: 'Browse annotations',
        configSchema,
        stateModel,
        ReactComponent: AnnotationBrowserWidget,
      })
    })
  }

  configure(pluginManager: PluginManager) {
    if (!isAbstractMenuManager(pluginManager.rootModel)) return

    pluginManager.rootModel.appendToMenu('Apollo', {
      label: 'Browse Annotations',
      icon: FormatListBulletedIcon,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClick(session: any) {
        // Get Apollo internet account
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { internetAccounts } = getRoot<{ internetAccounts: Array<{
          type: string
          baseURL: string
          getFetcher(loc: { locationType: string; uri: string }): (url: string, opts?: RequestInit) => Promise<Response>
        }> }>(session)
        const ia = internetAccounts.find((a) => a.type === 'ApolloInternetAccount')
        if (!ia) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          session.notify('No Apollo internet account found.', 'error')
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const assemblyName: string | undefined = session.views?.[0]?.assemblyNames?.[0]

        function openWidget(match: AssemblyRecord) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const widget = session.addWidget(
            'ApolloAnnotationBrowserWidget',
            'apolloAnnotationBrowserWidget',
            { assembly: match._id, assemblyName: match.name },
          )
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          session.showWidget(widget)
        }

        if (!assemblyName) {
          // No assembly open — show picker dialog
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          session.queueDialog((handleClose: () => void) =>
            [AssemblyPickerDialog, {
              baseURL: ia.baseURL,
              getFetcher: ia.getFetcher.bind(ia),
              handleClose,
              onSelect: openWidget,
            }]
          )
          return
        }

        const url = new URL('assemblies', ia.baseURL).toString()
        const fetcher = ia.getFetcher({ locationType: 'UriLocation', uri: url })
        fetcher(url)
          .then((r) => r.json())
          .then((assemblies: Array<{ _id: string; name: string }>) => {
            const match = assemblies.find((a) => a.name === assemblyName || a._id === assemblyName)
            if (!match) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              session.notify(`Could not find assembly "${assemblyName}" in Apollo.`, 'warning')
              return
            }
            openWidget(match)
          })
          .catch((e: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            session.notify(`Failed to load assemblies: ${String(e)}`, 'error')
          })
      },
    })
  }
}
