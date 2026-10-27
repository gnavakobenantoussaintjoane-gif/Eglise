import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDateRange,
  formatFileSize,
  formatNumber,
  initials,
  toDateInputValue,
  toDateTimeInputValue,
} from './format';

describe('utils/format', () => {
  it('formate les montants en francs CFA', () => {
    const formatted = formatCurrency(150000, 'XOF');
    expect(formatted).toContain('150');
    expect(formatted).toContain('F');
  });

  it('retombe sur un suffixe lisible si la devise est inconnue', () => {
    expect(formatCurrency(1000, 'ZZZZ')).toContain('ZZZZ');
  });

  it('formate les nombres à la française', () => {
    expect(formatNumber(12345).replace(/\u202f|\s/g, ' ')).toBe('12 345');
  });

  it('affiche une plage horaire sur une même journée', () => {
    const label = formatDateRange('2026-03-15T09:00:00.000Z', '2026-03-15T11:30:00.000Z');
    expect(label).toContain('·');
    expect(label).not.toContain('→');
  });

  it('affiche deux dates distinctes pour une plage multi-jours', () => {
    const label = formatDateRange('2026-03-15T09:00:00.000Z', '2026-03-17T11:30:00.000Z');
    expect(label).toContain('→');
  });

  it('mesure les fichiers en octets, kilo-octets et méga-octets', () => {
    expect(formatFileSize(512)).toBe('512 o');
    expect(formatFileSize(2048)).toBe('2 Ko');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 Mo');
  });

  it('prépare les valeurs des champs date', () => {
    expect(toDateInputValue('2026-01-09T18:30:00.000Z')).toMatch(/^2026-01-0[89]$/);
    expect(toDateInputValue(null)).toBe('');
    expect(toDateTimeInputValue('2026-01-09T18:30:00.000Z')).toMatch(/^2026-01-0[89]T\d{2}:\d{2}$/);
    expect(toDateTimeInputValue(undefined)).toBe('');
  });

  it('calcule les initiales', () => {
    expect(initials('Marie', 'Kouassi')).toBe('MK');
    expect(initials('  ', undefined)).toBe('?');
  });
});
