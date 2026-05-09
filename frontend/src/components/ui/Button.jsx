import React, { forwardRef, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import cn from './cn.js';
import styles from './Button.module.css';

const ICON_SIZES = { sm: 14, md: 16, lg: 18 };

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    icon = null,
    iconPosition = 'left',
    fullWidth = false,
    onClick,
    className,
    children,
    ...rest
  },
  ref
) {
  const warnedRef = useRef(false);

  // Icon-only buttons require either children or aria-label
  if (
    !loading &&
    (children == null || children === '' || (Array.isArray(children) && children.length === 0)) &&
    !rest['aria-label'] &&
    !warnedRef.current
  ) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Button] icon-only buttons require either children or aria-label');
    }
    warnedRef.current = true;
  }

  const isDisabled = disabled || loading;
  const iconSize = ICON_SIZES[size] || ICON_SIZES.md;

  const iconNode = icon ? (
    <span aria-hidden="true" className={styles.icon}>
      {icon}
    </span>
  ) : null;

  const labelNode =
    children != null && children !== '' ? (
      <span className={styles.label} aria-hidden={loading || undefined}>
        {children}
      </span>
    ) : null;

  return (
    <button
      ref={ref}
      {...rest}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        styles.btn,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        loading && styles.loading,
        fullWidth && styles.fullWidth,
        className
      )}
    >
      {iconPosition === 'right' ? (
        <>
          {labelNode}
          {iconNode}
        </>
      ) : (
        <>
          {iconNode}
          {labelNode}
        </>
      )}
      {loading && (
        <>
          <span className={styles.spinner} aria-hidden="true">
            <Loader2 size={iconSize} />
          </span>
          <span className={styles.srOnly}>Cargando…</span>
        </>
      )}
    </button>
  );
});

export default Button;
