import readline from 'node:readline';

/**
 * Saisie interactive au terminal.
 *
 * Le mot de passe est lu avec l'echo desactive : il n'apparait ni a l'ecran, ni
 * dans l'historique du shell, ni dans la liste des processus (contrairement a un
 * mot de passe passe en argument de commande).
 */

/** Interface interne utilisee pour couper l'echo de readline. */
interface MutableReadline {
  _writeToOutput?: (value: string) => void;
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function question(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (hidden) {
      // Neutralise l'affichage des caracteres saisis.
      const mutable = rl as unknown as MutableReadline;
      mutable._writeToOutput = () => undefined;
      process.stdout.write(prompt);
    }

    rl.question(hidden ? '' : prompt, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.on('error', reject);
  });
}

export function askText(prompt: string): Promise<string> {
  return question(prompt, false);
}

export function askHidden(prompt: string): Promise<string> {
  return question(prompt, true);
}

/** Refuse de continuer si le terminal n'est pas interactif (pipe, CI). */
export function requireInteractive(scriptName: string): void {
  if (!isInteractive()) {
    console.error(
      [
        `[${scriptName}] Terminal interactif requis.`,
        'Le mot de passe doit etre saisi a la main pour ne jamais transiter par un',
        'argument de commande, une variable d enregistree ou un fichier.',
        'Relancez la commande directement dans un terminal.',
      ].join('\n'),
    );
    process.exit(2);
  }
}
