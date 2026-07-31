import { Component } from 'react'
import { Button } from './ui'
import { isChunkLoadError, reloadForNewVersion } from '../lib/chunkReload.js'
import styles from './ErrorBoundary.module.css'

/**
 * ErrorBoundary — last line of defense against a render crash blanking the app.
 *
 * Class component on purpose: React 18 has no hook equivalent for
 * getDerivedStateFromError / componentDidCatch.
 *
 * Two failure shapes are handled:
 *
 * 1. Chunk-load failure (stale tab after a deploy — the hashed lazy chunk no
 *    longer exists on the server). We try reloadForNewVersion() once; while the
 *    reload is in flight we render a minimal "Actualizando…" state. If the
 *    helper refuses (it already reloaded moments ago, so reloading again would
 *    loop), we show the "new version available" fallback with a manual reload.
 * 2. Anything else — generic crash fallback.
 *
 * Mounted in App.jsx inside the providers and OUTSIDE the router's Suspense, and
 * imported statically so it always lives in the entry chunk (a lazily-loaded
 * boundary could not catch other chunks failing to load).
 */

const INITIAL_STATE = {
  hasError: false,
  error: null,
  isChunkError: false,
  // true once reloadForNewVersion() declined (already reloaded < 10s ago), so
  // the automatic path is exhausted and the user has to decide.
  reloadDeclined: false,
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = INITIAL_STATE
    this.handleReload = this.handleReload.bind(this)
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
      reloadDeclined: false,
    }
  }

  componentDidCatch(error, info) {
    console.error(
      '[ErrorBoundary] Unhandled render error:',
      error,
      '\nComponent stack:',
      info?.componentStack
    )

    if (isChunkLoadError(error) && !reloadForNewVersion()) {
      // Already reloaded recently and it failed again — stop auto-reloading and
      // hand control to the user instead of looping.
      this.setState({ reloadDeclined: true })
    }
  }

  handleReload() {
    window.location.reload()
  }

  render() {
    const { hasError, isChunkError, reloadDeclined } = this.state

    if (!hasError) return this.props.children

    // Chunk error with a reload already in flight: keep it quiet, the page is
    // about to be replaced anyway.
    if (isChunkError && !reloadDeclined) {
      return (
        <div className={styles.wrap} role="status" aria-live="polite">
          <p className={styles.updating}>Actualizando…</p>
        </div>
      )
    }

    const title = isChunkError ? 'Hay una versión nueva de WeBrief' : 'Algo salió mal'
    const body = isChunkError
      ? 'Recarga la página para continuar con la última versión.'
      : 'Ocurrió un error inesperado. Recarga la página para volver a intentarlo.'

    return (
      <div className={styles.wrap} role="alert">
        <div className={styles.panel}>
          <div className={styles.copy}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.body}>{body}</p>
          </div>
          <Button variant="primary" onClick={this.handleReload}>Recargar</Button>
        </div>
      </div>
    )
  }
}
