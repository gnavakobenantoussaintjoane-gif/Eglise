import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Input } from './Field';
import { Badge } from './Surface';

describe('Button', () => {
  it('affiche son libellé et réagit au clic', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('est désactivé et marqué occupé pendant le chargement', () => {
    render(<Button loading>Envoi</Button>);

    const button = screen.getByRole('button', { name: 'Envoi' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Input', () => {
  it('associe le label, l’aide et l’erreur au champ', () => {
    render(<Input label="Adresse e-mail" hint="Jamais partagée" error="Adresse invalide" />);

    const input = screen.getByLabelText('Adresse e-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide');
    expect(screen.queryByText('Jamais partagée')).toBeNull();
  });
});

describe('Badge', () => {
  it('rend le contenu avec le ton par défaut', () => {
    render(<Badge>En attente</Badge>);
    expect(screen.getByText('En attente')).toHaveClass('rounded-full');
  });
});
