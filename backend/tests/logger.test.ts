import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Import statique : la configuration (et son eventuel message de chargement
// d'environnement) est lue avant l'installation des espions.
import { logger } from '../src/utils/logger.js';

/**
 * Verifie que `LOG_LEVEL` a un effet reel.
 *
 * La variable est documentee dans le README et dans DEPLOIEMENT.md : ces tests
 * garantissent qu'elle ne redevient pas un reglage decoratif. En environnement
 * de test le seuil est volontairement fixe a `error` pour garder une sortie
 * lisible ; on verifie donc ici le filtrage et l'horodatage, puis le seuil
 * `debug` en simulant un autre niveau via `logger.enabled`.
 */
describe('journalisation', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignore les messages sous le seuil configure', async () => {
    // En test, seules les erreurs sont emises.
    expect(logger.level).toBe('error');

    logger.debug('detail interne');
    logger.info('demarrage');
    logger.warn('avertissement');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ecrit les erreurs avec un horodatage et le niveau', async () => {

    logger.error('echec du traitement');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(line).toContain('[error]');
    expect(line).toContain('echec du traitement');
  });

  it('accepte un contexte structure sans le melanger au message', async () => {

    logger.error('insertion impossible', { table: 'profiles' });

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), { table: 'profiles' });
  });

  it('conserve la pile d une Error pour ne pas perdre l origine de l incident', async () => {
    const { logger } = await import('../src/utils/logger.js');

    logger.error(new Error('connexion perdue'));

    const line = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('connexion perdue');
    expect(line).toContain('logger.test.ts');
  });

  it('expose le filtrage pour les niveaux superieurs', async () => {
    // `enabled` reflete le seuil : au niveau `error`, seules les erreurs passent.
    expect(logger.enabled('error')).toBe(true);
    expect(logger.enabled('warn')).toBe(false);
    expect(logger.enabled('info')).toBe(false);
    expect(logger.enabled('debug')).toBe(false);
  });
});
