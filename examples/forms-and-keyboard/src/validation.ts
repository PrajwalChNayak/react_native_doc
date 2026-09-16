/**
 * Validation kept as pure functions, separate from the components.
 *
 * That split is the reason this file has real tests: form logic that lives
 * inside a component can only be tested by rendering it, and rules that are
 * only exercised through the UI are the ones that rot.
 */

export type Field = 'name' | 'email' | 'password' | 'confirm';

export type Values = Record<Field, string>;

export type Errors = Partial<Record<Field, string>>;

export const EMPTY: Values = {name: '', email: '', password: '', confirm: ''};

/**
 * Deliberately permissive. Email syntax is not a useful gate — the only real
 * proof an address works is a message arriving at it — so this rejects the
 * shapes that are certainly wrong and lets the server decide the rest.
 */
export function isEmailish(value: string): boolean {
  const v = value.trim();
  if (v.length < 3) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

export function validateField(field: Field, values: Values): string | undefined {
  const value = values[field];
  switch (field) {
    case 'name':
      if (!value.trim()) return 'Enter your name.';
      return undefined;
    case 'email':
      if (!value.trim()) return 'Enter your email address.';
      if (!isEmailish(value)) return 'That does not look like an email address.';
      return undefined;
    case 'password':
      if (!value) return 'Choose a password.';
      // Length beats composition rules: it is the only requirement that
      // reliably increases work for an attacker without pushing people
      // towards "Password1!" and a sticky note.
      if (value.length < 12) return 'Use at least 12 characters.';
      return undefined;
    case 'confirm':
      if (!value) return 'Re-enter your password.';
      if (value !== values.password) return 'Passwords do not match.';
      return undefined;
  }
}

export const FIELD_ORDER: Field[] = ['name', 'email', 'password', 'confirm'];

export function validateAll(values: Values): Errors {
  const errors: Errors = {};
  for (const field of FIELD_ORDER) {
    const message = validateField(field, values);
    if (message) errors[field] = message;
  }
  return errors;
}

export function isValid(values: Values): boolean {
  return Object.keys(validateAll(values)).length === 0;
}

/** The first invalid field, so submit can focus it instead of just refusing. */
export function firstInvalidField(values: Values): Field | undefined {
  return FIELD_ORDER.find(field => validateField(field, values) !== undefined);
}
