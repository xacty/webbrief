import { Mark, mergeAttributes } from '@tiptap/core'

// CommentMark — envuelve un rango de texto con `<span data-comment-id="<uuid>">`.
// El id se persiste en el HTML guardado, así la mark sobrevive al autosave/reload
// y ProseMirror la mueve junto con el texto cuando el documento se edita.
//
// Comandos:
//   editor.chain().focus().setComment(commentId).run()
//   editor.chain().focus().unsetComment(commentId).run()    // remueve sólo las marks con ese id
//   editor.chain().focus().unsetAllComments().run()         // remueve todas las marks de comment
//
// Los hooks de UI (toolbar/popover/panel) usan estos comandos. La identificación
// del thread vive en el backend; la mark sólo sirve para anclar visual y posicionalmente.

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  exitable: true,
  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'wb-comment',
      },
      onCommentClick: null,
    }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {}
          return { 'data-comment-id': attributes.commentId }
        },
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-comment-resolved') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.resolved) return {}
          return { 'data-comment-resolved': 'true' }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
        getAttrs: (element) => ({
          commentId: element.getAttribute('data-comment-id'),
          resolved: element.getAttribute('data-comment-resolved') === 'true',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId) =>
        ({ commands }) => {
          if (!commentId) return false
          return commands.setMark(this.name, { commentId, resolved: false })
        },

      unsetComment:
        (commentId) =>
        ({ tr, state, dispatch }) => {
          if (!commentId) return false
          let touched = false
          state.doc.descendants((node, pos) => {
            if (!node.marks?.length) return
            for (const mark of node.marks) {
              if (mark.type.name !== 'comment') continue
              if (mark.attrs.commentId !== commentId) continue
              const from = pos
              const to = pos + node.nodeSize
              tr.removeMark(from, to, mark.type)
              touched = true
            }
          })
          if (touched && dispatch) dispatch(tr)
          return touched
        },

      unsetAllComments:
        () =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks.comment
          if (!markType) return false
          let touched = false
          state.doc.descendants((node, pos) => {
            if (!node.marks?.length) return
            for (const mark of node.marks) {
              if (mark.type !== markType) continue
              tr.removeMark(pos, pos + node.nodeSize, markType)
              touched = true
            }
          })
          if (touched && dispatch) dispatch(tr)
          return touched
        },

      markCommentResolved:
        (commentId, resolved = true) =>
        ({ tr, state, dispatch }) => {
          if (!commentId) return false
          const markType = state.schema.marks.comment
          if (!markType) return false
          let touched = false
          state.doc.descendants((node, pos) => {
            if (!node.marks?.length) return
            for (const mark of node.marks) {
              if (mark.type !== markType) continue
              if (mark.attrs.commentId !== commentId) continue
              const from = pos
              const to = pos + node.nodeSize
              tr.removeMark(from, to, markType)
              tr.addMark(from, to, markType.create({ commentId, resolved }))
              touched = true
            }
          })
          if (touched && dispatch) dispatch(tr)
          return touched
        },
    }
  },
})

// Helper para extraer todos los commentIds presentes en el documento actual.
// Útil para detectar comentarios "huérfanos" (existen en DB pero no en el doc).
export function getCommentIdsInDoc(editor) {
  if (!editor) return new Set()
  const ids = new Set()
  editor.state.doc.descendants((node) => {
    if (!node.marks?.length) return
    for (const mark of node.marks) {
      if (mark.type.name === 'comment' && mark.attrs.commentId) {
        ids.add(mark.attrs.commentId)
      }
    }
  })
  return ids
}

// Encuentra la posición (from, to) del primer rango con un commentId dado.
// Devuelve null si la mark no está en el documento.
export function findCommentRange(editor, commentId) {
  if (!editor || !commentId) return null
  let result = null
  editor.state.doc.descendants((node, pos) => {
    if (result) return false
    if (!node.marks?.length) return
    for (const mark of node.marks) {
      if (mark.type.name === 'comment' && mark.attrs.commentId === commentId) {
        result = { from: pos, to: pos + node.nodeSize }
        return false
      }
    }
  })
  return result
}
