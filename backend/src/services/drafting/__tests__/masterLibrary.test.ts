import { describe, it, expect } from 'vitest';
import { parseClauseVersion, splitClauseByNumberedHeadings } from '../masterLibrary.js';

describe('master library helpers', () => {
  it('parses version from clause id', () => {
    expect(parseClauseVersion('clause_security_v3')).toBe('v3');
    expect(parseClauseVersion('clause_without_version')).toBe('v1');
  });

  it('splits clause text by numbered headings', () => {
    const parts = splitClauseByNumberedHeadings('1. One section text. 2. Two section text. 3. Three section text.');

    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({ heading: '1.', order: 1 });
    expect(parts[1]).toMatchObject({ heading: '2.', order: 2 });
    expect(parts[2]).toMatchObject({ heading: '3.', order: 3 });
  });

  it('returns a single part when no numbered heading exists', () => {
    const parts = splitClauseByNumberedHeadings('Unnumbered clause text only');

    expect(parts).toEqual([{ heading: null, text: 'Unnumbered clause text only', order: 1 }]);
  });
});
