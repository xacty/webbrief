import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import cn from './cn.js';
import styles from './Select.module.css';

/**
 * Select — custom listbox dropdown that replaces the native <select>.
 *
 * Backward-compatible API with the previous wrapper:
 *   - Props: label, helperText, error, required, disabled, fullWidth, id,
 *            placeholder, options, children, name, value, defaultValue,
 *            onChange, className, plus ...rest.
 *   - `onChange` receives a synthetic event-like object where
 *     `event.target.value` is the selected option value, so existing
 *     consumers like `onChange={(e) => setRole(e.target.value)}` keep
 *     working unchanged.
 *   - Accepts `<option>` (and `<optgroup>`) children, OR an `options` prop
 *     (`[{ value, label, disabled }]`). `options` wins when both are
 *     provided.
 *   - `forwardRef` forwards the ref to the trigger button.
 *
 * Behavior:
 *   - Trigger button shows the current option label + a chevron that
 *     rotates on open. Styled with shell tokens (border, focus ring,
 *     radius-2, surface bg). Disabled trigger does not open.
 *   - Listbox is portal'd to `document.body` so it escapes any ancestor
 *     `overflow:hidden` / stacking context. Position is computed from the
 *     trigger's `getBoundingClientRect()` with smart placement: opens
 *     below when there is room, above when not, otherwise the side with
 *     more room with a capped max-height.
 *   - Keyboard: Arrow Up/Down (with wrap), Home, End, Enter/Space to
 *     select, Esc to close. Disabled options are skipped during navigation.
 *   - ARIA: combobox / listbox / option with `aria-activedescendant`
 *     pointing at the focused option.
 *   - Hidden `<input type="hidden" name>` mirrors the current value so
 *     native form submit keeps working (native <select> did this for free).
 */
const LISTBOX_MAX_HEIGHT = 360; // px — keep in sync with .listbox max-height
const LISTBOX_OPTION_HEIGHT = 40; // estimate per option (matches real
//   ~37-40px = --wb-space-2 padding + --wb-text-sm × --wb-leading-sm)
const LISTBOX_PADDING = 8; // 2x var(--wb-space-1) (top + bottom padding)
const LISTBOX_GAP = 4; // gap between trigger and listbox

function isOptionElement(child) {
  return React.isValidElement(child) && child.type === 'option';
}

function isOptgroupElement(child) {
  return React.isValidElement(child) && child.type === 'optgroup';
}

// Extract a flat list of items (options + group headings) preserving DOM
// order. Group headings render as non-interactive labels in the listbox;
// they're skipped during keyboard navigation.
function extractItems(options, children) {
  if (Array.isArray(options)) {
    return options.map((o) => ({
      kind: 'option',
      value: o.value,
      label: o.label,
      disabled: Boolean(o.disabled),
    }));
  }
  const result = [];
  React.Children.forEach(children, (child) => {
    if (!child) return;
    if (isOptionElement(child)) {
      result.push({
        kind: 'option',
        value: child.props.value,
        label: child.props.children,
        disabled: Boolean(child.props.disabled),
      });
      return;
    }
    if (isOptgroupElement(child)) {
      const groupLabel = child.props.label ?? '';
      if (groupLabel) result.push({ kind: 'group', label: groupLabel });
      React.Children.forEach(child.props.children, (grandchild) => {
        if (!grandchild || !isOptionElement(grandchild)) return;
        result.push({
          kind: 'option',
          value: grandchild.props.value,
          label: grandchild.props.children,
          disabled: Boolean(grandchild.props.disabled),
        });
      });
    }
  });
  return result;
}

function valuesEqual(a, b) {
  // String coercion mirrors native <select>'s implicit-to-string conversion,
  // so `value={1}` matches `<option value="1">` like the native element.
  return String(a ?? '') === String(b ?? '');
}

const Select = forwardRef(function Select(
  {
    label,
    helperText,
    error,
    required = false,
    disabled = false,
    fullWidth = true,
    id,
    placeholder,
    options,
    children,
    name,
    value,
    defaultValue,
    onChange,
    className,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const selectId = id ?? reactId;
  const labelId = `${selectId}-label`;
  const listboxId = `${selectId}-listbox`;
  const optionIdPrefix = `${selectId}-option`;

  const errorText = typeof error === 'string' && error.length > 0 ? error : null;
  const errorFlag = Boolean(error);
  const helperOrError =
    errorText ?? (errorFlag && !helperText ? 'Campo inválido' : helperText);
  const helperId = helperOrError ? `${selectId}-helper` : undefined;

  // Items list (flat, includes group headings).
  const items = useMemo(
    () => extractItems(options, children),
    [options, children]
  );
  // Indices of selectable (non-group, non-disabled) options.
  const enabledIndexes = useMemo(
    () =>
      items
        .map((it, idx) => (it.kind === 'option' && !it.disabled ? idx : -1))
        .filter((i) => i >= 0),
    [items]
  );

  // Controlled vs uncontrolled value tracking.
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() =>
    defaultValue !== undefined ? defaultValue : ''
  );
  const currentValue = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [position, setPosition] = useState(null);

  const triggerRef = useRef(null);
  const listboxRef = useRef(null);

  // Expose the trigger button as the forwarded ref (matches Button/Input
  // patterns in the shell).
  useImperativeHandle(ref, () => triggerRef.current, []);

  // Find the currently-selected option (first match wins; mirrors native
  // <select> semantics).
  const selectedItemIndex = items.findIndex(
    (it) => it.kind === 'option' && valuesEqual(it.value, currentValue)
  );
  const selectedItem =
    selectedItemIndex >= 0 ? items[selectedItemIndex] : null;

  // Compute the trigger label: selected option label, else placeholder,
  // else empty.
  const showsPlaceholder = !selectedItem;
  const triggerLabel = selectedItem ? selectedItem.label : placeholder || '';

  // Compute portal position + smart placement for the listbox.
  const computePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;

    const optionCount = items.filter((it) => it.kind === 'option').length;
    const estimatedHeight = Math.min(
      LISTBOX_MAX_HEIGHT,
      Math.max(optionCount, 1) * LISTBOX_OPTION_HEIGHT + LISTBOX_PADDING
    );

    const availableBelow = vh - rect.bottom - LISTBOX_GAP;
    const availableAbove = rect.top - LISTBOX_GAP;

    let placement = 'bottom';
    let maxHeight = LISTBOX_MAX_HEIGHT;

    if (availableBelow >= estimatedHeight) {
      placement = 'bottom';
    } else if (availableAbove >= estimatedHeight) {
      placement = 'top';
    } else if (availableAbove > availableBelow) {
      placement = 'top';
      maxHeight = Math.max(
        LISTBOX_OPTION_HEIGHT + LISTBOX_PADDING,
        availableAbove
      );
    } else {
      placement = 'bottom';
      maxHeight = Math.max(
        LISTBOX_OPTION_HEIGHT + LISTBOX_PADDING,
        availableBelow
      );
    }

    // For bottom placement we anchor the listbox TOP at trigger.bottom + GAP.
    // For top placement we anchor the listbox BOTTOM at vh - (trigger.top -
    // GAP) — using `bottom` instead of `top` so the listbox's actual rendered
    // height (which is shorter than our worst-case estimate) does not leave
    // a phantom gap above the trigger. CSS `bottom` lets the box size itself
    // from its content; `top` would lock in the estimated height.
    return {
      placement,
      top: placement === 'bottom' ? rect.bottom + LISTBOX_GAP : null,
      bottom: placement === 'top' ? vh - rect.top + LISTBOX_GAP : null,
      left: rect.left,
      width: rect.width,
      maxHeight,
    };
  }, [items]);

  // Sync position when opening; close on viewport changes (scroll/resize).
  // Closing is simpler than re-anchoring and avoids "listbox follows page"
  // visual glitches during fast scroll.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    const next = computePosition();
    if (next) setPosition(next);

    function closeOnScroll(event) {
      // CRITICAL: ignore scroll events that originate from inside the
      // listbox itself. The focus-on-hover handler triggers
      // scrollIntoView on options, which fires a scroll event. With the
      // capture flag below, this listener catches those internal
      // scrolls and would close the dropdown — making it impossible to
      // hover options. Only close on scrolls of ancestor scroll
      // containers (page scroll, modal body scroll, etc.).
      const listbox = listboxRef.current;
      if (listbox && (listbox === event.target || listbox.contains(event.target))) {
        return;
      }
      setOpen(false);
    }

    function closeOnResize() {
      setOpen(false);
    }

    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open, computePosition]);

  // When opening: focus the currently-selected option (or the first
  // enabled option if none / placeholder).
  useEffect(() => {
    if (!open) return;
    if (
      selectedItemIndex >= 0 &&
      items[selectedItemIndex]?.kind === 'option' &&
      !items[selectedItemIndex]?.disabled
    ) {
      setFocusedIndex(selectedItemIndex);
    } else {
      setFocusedIndex(enabledIndexes[0] ?? -1);
    }
    // We only want this to fire on open transitions (and when items
    // identity changes while open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items]);

  // Click-outside + Escape global handlers.
  useEffect(() => {
    if (!open) return undefined;

    function onDocMouseDown(event) {
      const trigger = triggerRef.current;
      const listbox = listboxRef.current;
      if (trigger && trigger.contains(event.target)) return;
      if (listbox && listbox.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus?.();
      }
    }

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Scroll the focused option into view inside the listbox as the user
  // navigates with the keyboard.
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const listbox = listboxRef.current;
    if (!listbox) return;
    const node = listbox.querySelector(
      `[data-select-option-index="${focusedIndex}"]`
    );
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [open, focusedIndex]);

  const commitValue = useCallback(
    (newValue) => {
      if (!isControlled) setInternalValue(newValue);
      if (typeof onChange === 'function') {
        const syntheticEvent = {
          target: { name, value: newValue },
          currentTarget: { name, value: newValue },
        };
        onChange(syntheticEvent);
      }
    },
    [isControlled, name, onChange]
  );

  const handleSelectIndex = useCallback(
    (index) => {
      const item = items[index];
      if (!item || item.kind !== 'option' || item.disabled) return;
      commitValue(item.value);
      setOpen(false);
      triggerRef.current?.focus?.();
    },
    [items, commitValue]
  );

  function moveFocus(direction) {
    if (enabledIndexes.length === 0) return;
    const currentPos = enabledIndexes.indexOf(focusedIndex);
    if (currentPos === -1) {
      setFocusedIndex(
        direction > 0
          ? enabledIndexes[0]
          : enabledIndexes[enabledIndexes.length - 1]
      );
      return;
    }
    const nextPos =
      (currentPos + direction + enabledIndexes.length) % enabledIndexes.length;
    setFocusedIndex(enabledIndexes[nextPos]);
  }

  function handleTriggerKeyDown(event) {
    if (disabled) return;
    if (!open) {
      // Opening shortcuts: Down/Up/Enter/Space open the listbox.
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    // Open: keyboard navigation.
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        if (enabledIndexes.length > 0) setFocusedIndex(enabledIndexes[0]);
        break;
      case 'End':
        event.preventDefault();
        if (enabledIndexes.length > 0) {
          setFocusedIndex(enabledIndexes[enabledIndexes.length - 1]);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0) handleSelectIndex(focusedIndex);
        break;
      case 'Escape':
        // Handle locally so an enclosing Modal does not also close on the
        // same keystroke. stopPropagation prevents bubbling to a document
        // keydown listener (e.g. Modal's).
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case 'Tab':
        // Close on Tab so focus moves naturally to the next focusable.
        setOpen(false);
        break;
      default:
        break;
    }
  }

  function handleTriggerClick(event) {
    if (disabled) return;
    event.preventDefault();
    setOpen((current) => !current);
  }

  const activeDescendantId =
    open && focusedIndex >= 0 ? `${optionIdPrefix}-${focusedIndex}` : undefined;

  const listboxStyle = position
    ? {
        position: 'fixed',
        // Either `top` (bottom placement) or `bottom` (top placement) is
        // set — never both. The unset one is omitted so CSS auto-sizes the
        // listbox height to its actual content.
        ...(position.top !== null ? { top: position.top } : {}),
        ...(position.bottom !== null ? { bottom: position.bottom } : {}),
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
      }
    : null;

  const hasItems = items.some((it) => it.kind === 'option');

  return (
    <div
      className={cn(
        styles.field,
        fullWidth && styles.fullWidth,
        errorFlag && styles.hasError,
        className
      )}
    >
      {label && (
        <label
          id={labelId}
          htmlFor={selectId}
          className={styles.label}
          onClick={() => {
            if (!disabled) triggerRef.current?.focus?.();
          }}
        >
          {label}
          {required && (
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          )}
        </label>
      )}

      <button
        {...rest}
        ref={triggerRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-activedescendant={activeDescendantId}
        aria-required={required ? 'true' : undefined}
        aria-invalid={errorFlag ? 'true' : undefined}
        aria-describedby={helperId}
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className={cn(styles.trigger, open && styles.triggerOpen)}
      >
        <span
          className={cn(
            styles.triggerLabel,
            showsPlaceholder && styles.triggerPlaceholder
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={styles.triggerChevron}
        />
      </button>

      {/* Hidden input mirrors the value for native form submission, just
          like the previous native <select> did automatically. */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={currentValue ?? ''}
          aria-hidden="true"
        />
      )}

      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            tabIndex={-1}
            style={listboxStyle}
            className={styles.listbox}
            // Keyboard handling lives on the trigger button (which keeps
            // focus while the listbox is open). We mirror it here too so
            // arrow keys still work if the listbox somehow gets focus.
            onKeyDown={handleTriggerKeyDown}
          >
            {!hasItems && (
              <li
                role="option"
                aria-disabled="true"
                aria-selected="false"
                className={cn(styles.option, styles.optionDisabled)}
              >
                <span className={styles.optionLabel}>Sin opciones</span>
              </li>
            )}
            {items.map((item, index) => {
              if (item.kind === 'group') {
                return (
                  <li
                    key={`group-${index}`}
                    role="presentation"
                    className={styles.groupLabel}
                  >
                    {item.label}
                  </li>
                );
              }
              const isSelected = valuesEqual(item.value, currentValue);
              const isFocused = index === focusedIndex;
              const optionId = `${optionIdPrefix}-${index}`;
              return (
                <li
                  key={`opt-${index}-${String(item.value)}`}
                  id={optionId}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={item.disabled || undefined}
                  data-select-option-index={index}
                  className={cn(
                    styles.option,
                    isSelected && styles.optionSelected,
                    isFocused && !item.disabled && styles.optionFocused,
                    item.disabled && styles.optionDisabled
                  )}
                  onMouseEnter={() => {
                    if (!item.disabled) setFocusedIndex(index);
                  }}
                  onMouseDown={(event) => {
                    // Prevent the trigger from losing focus + the doc
                    // mousedown handler from closing the listbox before
                    // we can commit.
                    event.preventDefault();
                  }}
                  onClick={() => handleSelectIndex(index)}
                >
                  <span className={styles.optionLabel}>{item.label}</span>
                  {isSelected && (
                    <Check
                      size={14}
                      aria-hidden="true"
                      className={styles.optionCheckmark}
                    />
                  )}
                </li>
              );
            })}
          </ul>,
          document.body
        )}

      {helperOrError && (
        <span
          id={helperId}
          className={cn(styles.helper, errorFlag && styles.helperError)}
        >
          {helperOrError}
        </span>
      )}
    </div>
  );
});

// Ergonomic children-form helper kept for backward compatibility.
Select.Option = function Option(props) {
  return <option {...props}>{props.children}</option>;
};

export default Select;
