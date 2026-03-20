# jbrowse-plugin-apollo-annotation-browser

A JBrowse 2 plugin that adds an **Annotation Browser** drawer widget to [Apollo](https://github.com/GMOD/Apollo3). It shows all user-submitted annotations across an assembly in a searchable, sortable table — including who created and last modified each annotation, when, and where on the genome.

## Features

- **Browse all annotations** for any Apollo assembly in a compact drawer table
- **See who annotated what**: creator, last modifier, and last modified timestamp
- **Navigate to any annotation** with a single "Go to" click — jumps the linear genome view to that feature
- **Quick filter / search** via the built-in toolbar search box
- **Assembly picker**: if no assembly is open in the viewer, prompts you to select one from a dropdown
- **Toggleable columns**: Type and Created columns are hidden by default but can be turned on via the column menu
- Works with Apollo's authentication — no extra credentials needed

## Usage

1. Open JBrowse with an Apollo instance loaded
2. Click the **Apollo** menu → **Browse Annotations**
   - If an assembly is already open in the viewer, it loads annotations for that assembly immediately
   - If no assembly is open, a dialog appears to select one
3. The annotation table opens in the right-hand drawer
4. Click **Go to** on any row to navigate the genome view to that feature

## Table Columns

| Column | Default | Notes |
|--------|---------|-------|
| Go to | ✅ | Navigates the genome view to the feature |
| Name | ✅ | Feature name |
| Type | hidden | Feature type (e.g. gene, mRNA) — toggle on via column menu |
| Location | ✅ | `refSeq:start–end` |
| Created By | ✅ | User who first created the annotation |
| Last Modified By | ✅ | User who most recently edited it |
| Last Modified | ✅ | Timestamp of most recent edit |
| Created | hidden | Creation timestamp — toggle on via column menu |

## Deployment

Build the plugin and deploy using [apollo-tools](https://github.com/simrbase/apollo-tools):

```bash
cd /data/src/jbrowse-plugin-apollo-annotation-browser
npm install
npm run build

# Deploy to all Apollo instances
apollo-add-plugin /data/src/jbrowse-plugin-apollo-annotation-browser

# Deploy to a single instance
apollo-add-plugin /data/src/jbrowse-plugin-apollo-annotation-browser -i stern
```

The script copies the built JS to each instance's web directory and registers the plugin in `*-config.json`.

## Development

Requires Node.js ≥ 18.

```bash
npm install       # install deps
npm run build     # production build → dist/
npm start         # dev server with watch
```

## How It Works

The plugin uses Apollo's `/changes` API endpoint to find all `AddFeatureChange` and `AddFeaturesFromFileChange` events for the selected assembly. It resolves full feature details (name, type, location) via `/features/getByIds`, then builds a table showing the creator (first change per feature) and last modifier (most recent change). Deleted features are automatically excluded.

## License

MIT
