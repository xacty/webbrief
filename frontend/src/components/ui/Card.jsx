import React from 'react';
import cn from './cn.js';
import styles from './Card.module.css';

export default function Card({
  as: As = 'div',
  padding = 'md',
  shadow = 'sm',
  radius = 'lg',
  interactive = false,
  className,
  children,
  onClick,
  ...rest
}) {
  const isInteractive = interactive || As === 'button';
  // When rendering as a <button>, default type='button' so a Card never
  // accidentally submits a parent <form>.
  const buttonProps = As === 'button' ? { type: rest.type ?? 'button' } : null;

  return (
    <As
      className={cn(
        styles.card,
        styles[`padding_${padding}`],
        styles[`shadow_${shadow}`],
        styles[`radius_${radius}`],
        isInteractive && styles.interactive,
        className
      )}
      onClick={onClick}
      {...buttonProps}
      {...rest}
    >
      {children}
    </As>
  );
}
