import React from 'react';
import cn from './cn.js';
import styles from './Badge.module.css';

export default function Badge({
  variant = 'neutral',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}) {
  return (
    <span
      className={cn(
        styles.badge,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        className
      )}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
