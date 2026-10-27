import type { ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { Clock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Alert, Button, LoadingBlock, Spinner } from '../components/ui';

export function FullPageLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-7 w-7" />
      <p role="status" className="text-sm text-muted">
        {label}
      </p>
    </div>
  );
}

function loginRedirect(location: ReturnType<typeof useLocation>) {
  const target = `${location.pathname}${location.search}`;
  return `/connexion?redirect=${encodeURIComponent(target)}`;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader label="Vérification de la session…" />;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} replace />;
  return <>{children}</>;
}

export function RequireApproved({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isApproved, profile } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader label="Ouverture de votre espace…" />;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} replace />;
  if (!isApproved) {
    const suspended = profile?.status === 'suspended';
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-xl space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-lavender-deep text-brand">
            {suspended ? <ShieldAlert className="h-7 w-7" aria-hidden="true" /> : <Clock className="h-7 w-7" aria-hidden="true" />}
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-brand-dark">
              {suspended ? 'Votre compte est suspendu' : 'Votre accès est en attente de validation'}
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              {suspended
                ? 'Un administrateur a suspendu temporairement votre accès. Contactez le secrétariat de l’église pour en connaître les raisons.'
                : profile?.status === 'pending_review'
                  ? 'Votre demande d’adhésion a bien été reçue. Un responsable la vérifie : vous recevrez une notification dès qu’elle sera validée.'
                  : profile?.status === 'rejected'
                    ? `Votre demande n’a pas été retenue${profile.decisionNote ? ` : ${profile.decisionNote}` : ''}. Vous pouvez compléter votre profil et soumettre une nouvelle demande.`
                    : 'Complétez votre profil et soumettez votre demande pour accéder à l’espace membre.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/mon-inscription">
              <Button>Voir mon inscription</Button>
            </Link>
            <Link to="/">
              <Button variant="outline">Retour à l’accueil</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader label="Vérification de vos droits…" />;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} replace />;
  if (!isAdmin) {
    return (
      <div className="container-page py-20">
        <Alert tone="warning" title="Accès réservé à l’administration">
          Cette page est réservée aux administrateurs de l’église.
        </Alert>
        <div className="mt-6 flex gap-3">
          <Link to="/">
            <Button variant="outline">Retour à l’accueil</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireMedia({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin, isMedia } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader label="Vérification de vos droits…" />;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} replace />;
  if (!isAdmin && !isMedia) {
    return (
      <div className="container-page py-20">
        <Alert tone="warning" title="Espace réservé à l’équipe média">
          Seuls les membres de l’équipe média et les administrateurs peuvent gérer les albums.
        </Alert>
        <div className="mt-6">
          <Link to="/espace-membre">
            <Button variant="outline">Retour à mon espace</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin, canManageDepartments } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader label="Vérification de vos droits…" />;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} replace />;
  if (!isAdmin && !canManageDepartments) {
    return (
      <div className="container-page py-20">
        <Alert tone="warning" title="Espace réservé aux responsables">
          Seuls les administrateurs et les responsables de département peuvent gérer les départements.
        </Alert>
      </div>
    );
  }
  return <>{children}</>;
}

export { LoadingBlock };
