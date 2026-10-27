import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MailX, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import { Alert, Button, Card, LoadingBlock } from '../../components/ui';

interface UnsubscribeCheck {
  valid: boolean;
  maskedEmail?: string;
  alreadyUnsubscribed?: boolean;
  error?: { code: string; message: string };
}

interface UnsubscribeResult {
  ok: boolean;
  changed: boolean;
  maskedEmail: string;
  message: string;
}

/**
 * Page publique de désinscription des messages d'information.
 *
 * Accessible depuis un lien d'e-mail, sans connexion. Le jeton est signé et
 * vérifié par le serveur. La désinscription n'est appliquée qu'après un clic de
 * confirmation : un lien ouvert automatiquement par un antivirus ou un filtre
 * antispam ne désinscrit donc personne à son insu.
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState<UnsubscribeResult | null>(null);

  const checkQuery = useQuery({
    queryKey: ['public', 'unsubscribe', token],
    queryFn: async ({ signal }) => {
      // L'API répond 400 avec un corps JSON exploitable pour un lien invalide.
      try {
        return await api.get<UnsubscribeCheck>('/public/unsubscribe', { token }, signal);
      } catch (error) {
        if (error instanceof ApiError) {
          return { valid: false, error: { code: error.code, message: error.message } };
        }
        throw error;
      }
    },
    enabled: Boolean(token),
  });

  const mutation = useMutation({
    mutationFn: () => api.post<UnsubscribeResult>('/public/unsubscribe', { token }),
    onSuccess: (result) => setDone(result),
  });

  const errorMessage =
    !token
      ? 'Ce lien ne contient pas de jeton de désinscription.'
      : !checkQuery.data?.valid
        ? (checkQuery.data?.error?.message ?? 'Ce lien de désinscription est invalide.')
        : null;

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lavender text-brand">
            <MailX className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold text-brand-dark">
              Messages d’information
            </h1>
            <p className="text-sm text-muted">Gestion de votre abonnement aux e-mails</p>
          </div>
        </div>

        {checkQuery.isLoading ? (
          <LoadingBlock label="Vérification du lien…" />
        ) : done ? (
          <Alert tone="success" title="C’est noté">
            <p>{done.message}</p>
            <p className="mt-2 text-sm">
              Vous pouvez revenir sur votre choix à tout moment depuis « Mon profil », dans votre
              espace membre.
            </p>
          </Alert>
        ) : errorMessage ? (
          <Alert tone="danger" title="Lien inutilisable">
            <p>{errorMessage}</p>
            <p className="mt-2 text-sm">
              Vous pouvez aussi modifier votre préférence depuis{' '}
              <Link to="/espace-membre/profil" className="underline">
                votre profil
              </Link>{' '}
              après connexion.
            </p>
          </Alert>
        ) : checkQuery.data?.alreadyUnsubscribed ? (
          <Alert tone="info" title="Vous êtes déjà désinscrit">
            <p>
              L’adresse <strong>{checkQuery.data.maskedEmail}</strong> ne reçoit plus les messages
              d’information. Les messages indispensables à votre compte (réinitialisation du mot de
              passe, décision d’adhésion) continuent de vous être envoyés.
            </p>
          </Alert>
        ) : (
          <>
            <Alert tone="warning" title="Confirmer la désinscription">
              <p>
                L’adresse <strong>{checkQuery.data?.maskedEmail}</strong> ne recevra plus les
                annonces, événements et nouvelles de l’église.
              </p>
              <p className="mt-2 text-sm">
                Vous continuerez de recevoir les messages indispensables à votre compte
                (réinitialisation du mot de passe, décision d’adhésion).
              </p>
            </Alert>
            {mutation.isError ? (
              <Alert tone="danger" title="Action impossible">
                {mutation.error instanceof ApiError
                  ? mutation.error.message
                  : 'Réessayez dans quelques instants.'}
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
                icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              >
                Oui, me désinscrire
              </Button>
              <Link to="/">
                <Button variant="ghost">Non, rester abonné</Button>
              </Link>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Désinscription immédiate et sans justification. Aucune autre donnée n’est modifiée.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
