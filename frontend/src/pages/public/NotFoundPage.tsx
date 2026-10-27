import { Link } from 'react-router-dom';
import { Compass, House } from 'lucide-react';
import { Button } from '../../components/ui';

export function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-lavender text-brand">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.2em] text-brand-light uppercase">Erreur 404</p>
        <h1 className="text-3xl font-semibold text-brand-dark">Cette page n’existe pas</h1>
        <p className="mx-auto max-w-md text-sm text-muted">
          Le lien est peut-être obsolète ou la page a été déplacée. Revenez à l’accueil pour continuer votre visite.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/">
          <Button icon={<House className="h-4 w-4" aria-hidden="true" />}>Retour à l’accueil</Button>
        </Link>
        <Link to="/contact">
          <Button variant="outline">Nous contacter</Button>
        </Link>
      </div>
    </div>
  );
}
