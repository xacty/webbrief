/**
 * Public surface for components/ui/.
 *
 * Re-exports the 6 shared primitives delivered in Phase 2 (UI-03).
 * The internal class-name helper is intentionally NOT re-exported
 * — it is internal-only per the Phase 2 UI-SPEC
 * (§"File Layout" + §"Public Surface").
 *
 * Consumers import from this barrel:
 *   import { Button, Modal, Input } from '../../components/ui';
 *
 * Tree-shake friendly: every component is its own file, every export is
 * a named re-export with no side effects in this index.
 */

export { default as Button } from './Button.jsx';
export { default as Input } from './Input.jsx';
export { default as Select } from './Select.jsx';
export { default as Modal } from './Modal.jsx';
export { default as Card } from './Card.jsx';
export { default as Badge } from './Badge.jsx';
export { default as KebabMenu } from './KebabMenu.jsx';
export { default as HelpPopover } from './HelpPopover.jsx';
