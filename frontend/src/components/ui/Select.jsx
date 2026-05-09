import React, { forwardRef, useId } from 'react';
import cn from './cn.js';
import styles from './Select.module.css';

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

  const errorText = typeof error === 'string' && error.length > 0 ? error : null;
  const errorFlag = Boolean(error);
  const helperOrError =
    errorText ?? (errorFlag && !helperText ? 'Campo inválido' : helperText);
  const helperId = helperOrError ? `${selectId}-helper` : undefined;

  // If `options` prop is passed, it wins over children (UI-SPEC §3 explicit rule).
  const optionNodes = options
    ? options.map((o) => (
        <option key={String(o.value)} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))
    : children;

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
        <label htmlFor={selectId} className={styles.label}>
          {label}
          {required && (
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          )}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-required={required ? 'true' : undefined}
        aria-invalid={errorFlag ? 'true' : undefined}
        aria-describedby={helperId}
        className={styles.select}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {optionNodes}
      </select>
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

// Ergonomic children-form support: <Select.Option value="a">A</Select.Option>
Select.Option = function Option(props) {
  return <option {...props}>{props.children}</option>;
};

export default Select;
