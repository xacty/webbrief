import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// FakeSelection — pinta un rango con CSS custom (gris) cuando el editor pierde
// la DOM selection nativa pero queremos seguir mostrándole al usuario qué texto
// estaba seleccionado. Se usa al abrir el right-click context menu: el browser
// limpia la selección visual nativa, pero nosotros mantenemos el rango con esta
// decoration para que el usuario sepa sobre qué texto va a actuar el menú.
//
// Comandos:
//   editor.commands.setFakeSelection({ from, to })
//   editor.commands.clearFakeSelection()

export const fakeSelectionKey = new PluginKey('wbFakeSelection')

export const FakeSelection = Extension.create({
  name: 'fakeSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: fakeSelectionKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(fakeSelectionKey)
            if (meta === false) return null
            if (meta && typeof meta.from === 'number' && typeof meta.to === 'number') {
              return { from: meta.from, to: meta.to }
            }
            if (value && tr.docChanged) {
              return {
                from: tr.mapping.map(value.from),
                to: tr.mapping.map(value.to),
              }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const value = fakeSelectionKey.getState(state)
            if (!value) return null
            const from = Math.min(value.from, value.to)
            const to = Math.max(value.from, value.to)
            if (from === to) return null
            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, { class: 'wb-fake-selection' }),
            ])
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setFakeSelection:
        ({ from, to }) =>
        ({ tr, dispatch, view }) => {
          if (typeof from !== 'number' || typeof to !== 'number') return false
          if (dispatch) view.dispatch(tr.setMeta(fakeSelectionKey, { from, to }))
          return true
        },
      clearFakeSelection:
        () =>
        ({ tr, dispatch, view }) => {
          if (dispatch) view.dispatch(tr.setMeta(fakeSelectionKey, false))
          return true
        },
    }
  },
})
