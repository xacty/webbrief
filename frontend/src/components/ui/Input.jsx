import React, { forwardRef, useId, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import cn from './cn.js';
import styles from './Input.module.css';

const Input = forwardRef(function Input(
  {
    type = 'text',
    label,
    helperText,
    error,
    icon = null,
    iconPosition = 'left',
    fullWidth = true,
    required = false,
    disabled = false,
    id,
    className,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const [revealed, setRevealed] = useState(false);
  const warnedRef = useRef(false);

  const isPassword = type === 'password';

  // Password reserves the right slot for the eye toggle. If caller asked for
  // iconPosition='right' on a password input, downgrade to 'left' and warn once.
  let effectiveIconPosition = iconPosition;
  if (isPassword && iconPosition === 'right') {
    effectiveIconPosition = 'left';
    if (!warnedRef.current && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[Input] iconPosition=right is ignored when type=password (eye toggle reserves the right slot)'
      );
      warnedRef.current = true;
    }
  }

  const effectiveType = isPassword && revealed ? 'text' : type;

  // Helper / error text resolution
  const errorText = typeof error === 'string' && error.length > 0 ? error : null;
  const errorFlag = Boolean(error);
  const helperOrError =
    errorText ?? (errorFlag && !helperText ? 'Campo inválido' : helperText);
  const helperId = helperOrError ? `${inputId}-helper` : undefined;

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
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && (
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          )}
        </label>
      )}
      <div
        className={cn(
          styles.inputWrapper,
          icon && styles[`hasIcon_${effectiveIconPosition}`],
          isPassword && styles.hasPasswordToggle
        )}
      >
        {icon && (
          <span
            aria-hidden="true"
            className={cn(styles.icon, styles[`icon_${effectiveIconPosition}`])}
          >
            {icon}
          </span>
        )}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={effectiveType}
          disabled={disabled}
          required={required}
          aria-required={required ? 'true' : undefined}
          aria-invalid={errorFlag ? 'true' : undefined}
          aria-describedby={helperId}
          className={styles.input}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.passwordToggle}
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={revealed}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setRevealed((v) => !v)}
            tabIndex={disabled ? -1 : 0}
            disabled={disabled}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
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

export default Input;
