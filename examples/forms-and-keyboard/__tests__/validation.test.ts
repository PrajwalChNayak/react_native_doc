import {
  EMPTY,
  firstInvalidField,
  isEmailish,
  isValid,
  validateAll,
  validateField,
  type Values,
} from '../src/validation';

const good: Values = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
  confirm: 'correct-horse-battery',
};

describe('isEmailish', () => {
  it('accepts ordinary addresses', () => {
    for (const v of ['a@b.co', 'ada@example.com', 'x.y+tag@sub.example.org']) {
      expect(isEmailish(v)).toBe(true);
    }
  });

  it('rejects the shapes that are certainly wrong', () => {
    for (const v of ['', 'ada', 'ada@', '@example.com', 'a b@c.com', 'a@@b.com', 'a@b']) {
      expect(isEmailish(v)).toBe(false);
    }
  });

  it('rejects a domain with a leading or trailing dot', () => {
    expect(isEmailish('a@.com')).toBe(false);
    expect(isEmailish('a@b.')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isEmailish('  ada@example.com  ')).toBe(true);
  });
});

describe('validateField', () => {
  it('passes every field on valid input', () => {
    expect(validateAll(good)).toEqual({});
    expect(isValid(good)).toBe(true);
  });

  it('reports every field on an empty form', () => {
    expect(Object.keys(validateAll(EMPTY)).sort()).toEqual([
      'confirm',
      'email',
      'name',
      'password',
    ]);
  });

  it('requires a password of at least 12 characters', () => {
    expect(validateField('password', {...good, password: 'short'})).toMatch(/12 characters/);
    expect(validateField('password', {...good, password: 'a'.repeat(12)})).toBeUndefined();
  });

  it('catches a mismatched confirmation', () => {
    const values = {...good, confirm: 'something-else'};
    expect(validateField('confirm', values)).toMatch(/do not match/);
  });

  it('treats a whitespace-only name as missing', () => {
    expect(validateField('name', {...good, name: '   '})).toMatch(/Enter your name/);
  });
});

describe('firstInvalidField', () => {
  it('returns undefined when the form is valid', () => {
    expect(firstInvalidField(good)).toBeUndefined();
  });

  it('returns fields in form order, so submit focuses the topmost problem', () => {
    expect(firstInvalidField(EMPTY)).toBe('name');
    expect(firstInvalidField({...EMPTY, name: 'Ada'})).toBe('email');
    expect(firstInvalidField({...good, password: 'short', name: ''})).toBe('name');
    expect(firstInvalidField({...good, confirm: 'nope'})).toBe('confirm');
  });
});
