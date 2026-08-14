import styles from './MorphingToolbar.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Shell genérico de "barra persistente que muta" (O2.a — extraído del
 * `.bar`/`.left`/`.right` de `library/LibraryToolbar.jsx`, iteración UX F1
 * punto 3). UNA sola barra, siempre montada, con `min-height` fija — nunca
 * se desmonta/remonta, así que no hay reflow del contenido al entrar/salir
 * de un modo alterno (p. ej. selección) — ver DESIGN-SYSTEM.md §"Stable
 * layouts — no jumpy reflows".
 *
 * Este componente NO decide qué mostrar en cada estado — sólo provee el
 * contenedor + los dos slots posicionales `left`/`right` + el modificador
 * visual `selected` (borde/sombra "atención" cuando hay algo elegido). El
 * caller (LibraryToolbar hoy; ProjectsPage en Ola 2) arma el contenido de
 * cada slot según su propio estado — típicamente alternando entre una
 * variante "idle" (orden/filtro) y una "selección" (acciones bulk) del
 * lado izquierdo y/o derecho, de ahí "muta".
 */
export default function MorphingToolbar({ selected = false, left, right, label = 'Herramientas' }) {
  return (
    <div className={cx(styles.bar, selected && styles.barSelected)} role="toolbar" aria-label={label}>
      <div className={styles.left}>{left}</div>
      <div className={styles.right}>{right}</div>
    </div>
  )
}
