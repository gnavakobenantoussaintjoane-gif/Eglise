import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Department, MemberStatus, Session } from '../../types';
import { Alert, Badge, Button, Card, LoadingBlock, PageHeader } from '../../components/ui';
import { ProfileForm, type ProfileFormValues } from '../../components/members/ProfileForm';
import { MEMBER_STATUS_LABEL, formatDateTime } from '../../utils/format';
import { cn } from '../../utils/cn';
import { AuthShell } from '../../components/auth/AuthShell';

interface HistoryEntry {
  status: MemberStatus;
  note: string | null;
  createdAt: string;
}

const STEPS: { status: MemberStatus[]; label: string; description: string }[] = [
  {
    status: ['profile_incomplete'],
    label: 'Profil à compléter',
    description: 'Renseignez vos coordonnées pour que les responsables puissent vous joindre.',
  },
  {
    status: ['pending_review'],
    label: 'Demande envoyée',
    description: 'Votre demande est en cours d’examen par un administrateur.',
  },
  {
    status: ['approved'],
    label: 'Adhésion validée',
    description: 'Vous avez accès à l’espace membre et aux départements.',
  },
];

export function OnboardingPage() {
  const { profile, refresh, isLoading } = useAuth();
  const status = profile?.status ?? null;
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const departmentsQuery = useQuery({
    queryKey: ['public', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/public/departments', undefined, signal),
    enabled: Boolean(profile),
  });

  const historyQuery = useQuery({
    queryKey: ['auth', 'history'],
    queryFn: ({ signal }) => api.get<{ history: HistoryEntry[] }>('/auth/me/history', undefined, signal),
    enabled: Boolean(profile),
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      api.patch<Session>('/auth/profile', {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || null,
        city: values.city || null,
        profession: values.profession || null,
        bio: values.bio || null,
        departmentInterestId: values.departmentInterestId || null,
        consentPhotos: values.consentPhotos,
      }),
    onSuccess: async () => {
      toast.success('Profil enregistré.');
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ['auth', 'history'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post<Session>('/auth/profile/submit'),
    onSuccess: async () => {
      toast.success('Votre demande a été envoyée aux responsables.');
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ['auth', 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Envoi impossible.'),
  });

  if (isLoading) {
    return (
      <div className="container-page py-20">
        <LoadingBlock label="Chargement de votre inscription…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <AuthShell
        title="Suivre mon inscription"
        description="Connectez-vous pour consulter l’état de votre demande d’adhésion."
      >
        <Link to="/connexion?redirect=%2Fmon-inscription">
          <Button block>Se connecter</Button>
        </Link>
      </AuthShell>
    );
  }

  const missing: string[] = [];
  if (!profile.phone?.trim()) missing.push('téléphone');
  if (!profile.city?.trim()) missing.push('ville');

  const canSubmit = status === 'profile_incomplete' || status === 'rejected';
  const history = historyQuery.data?.history ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Mon inscription"
        title={`Bonjour ${profile.firstName}`}
        description="Complétez votre profil, envoyez votre demande et suivez son avancement."
        actions={
          status === 'approved' ? (
            <Link to="/espace-membre">
              <Button>Accéder à mon espace</Button>
            </Link>
          ) : (
            <Badge tone={status === 'rejected' ? 'danger' : status === 'pending_review' ? 'warning' : 'neutral'}>
              {status ? MEMBER_STATUS_LABEL[status] : 'Inscription'}
            </Badge>
          )
        }
      />

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-brand-dark">Mes informations</h2>
            <ProfileForm
              profile={profile}
              departments={departmentsQuery.data?.departments ?? []}
              submitting={saveMutation.isPending}
              onAvatarUpload={async (file) => {
                setUploading(true);
                try {
                  const data = new FormData();
                  data.append('avatar', file);
                  await api.upload('/auth/avatar', data);
                  await refresh();
                  toast.success('Photo mise à jour.');
                } catch (error) {
                  toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.');
                } finally {
                  setUploading(false);
                }
              }}
              uploadingAvatar={uploading}
              onSubmit={(values) => saveMutation.mutate(values)}
            />
          </Card>

          {status === 'pending_review' ? (
            <Alert tone="info" title="Votre demande est en cours d’examen">
              Un administrateur va vérifier votre profil. Vous recevrez une notification dès que la décision sera
              prise. Vous pouvez continuer à modifier vos informations en attendant.
            </Alert>
          ) : null}

          {status === 'rejected' ? (
            <Alert tone="danger" title="Votre demande n’a pas été retenue">
              {profile.decisionNote ?? 'Complétez votre profil puis soumettez une nouvelle demande.'}
            </Alert>
          ) : null}

          {status === 'suspended' ? (
            <Alert tone="warning" title="Compte suspendu">
              Contactez un responsable de l’église pour rétablir votre accès.
            </Alert>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Étapes de mon adhésion</h2>
            <ol className="space-y-4">
              {STEPS.map((step, index) => {
                const done =
                  step.status.includes('approved') && status === 'approved'
                    ? true
                    : status === 'approved' || step.status.includes(status ?? 'profile_incomplete');
                return (
                  <li key={step.label} className="flex gap-3">
                    <span className="mt-0.5">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                      ) : (
                        <Circle className="h-5 w-5 text-line" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className={cn('text-sm font-semibold', done ? 'text-brand-dark' : 'text-muted')}>
                        {index + 1}. {step.label}
                      </p>
                      <p className="text-xs text-muted">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {canSubmit ? (
              <div className="space-y-3 border-t border-line pt-4">
                {missing.length > 0 ? (
                  <p className="text-xs text-warning">
                    Renseignez votre {missing.join(' et votre ')} pour pouvoir envoyer votre demande.
                  </p>
                ) : null}
                <Button
                  block
                  loading={submitMutation.isPending}
                  disabled={missing.length > 0}
                  onClick={() => submitMutation.mutate()}
                  icon={<Send className="h-4 w-4" aria-hidden="true" />}
                >
                  Envoyer ma demande d’adhésion
                </Button>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Historique</h2>
            {historyQuery.isLoading ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted">Aucune décision enregistrée pour l’instant.</p>
            ) : (
              <ol className="space-y-3">
                {history.map((entry) => (
                  <li key={`${entry.status}-${entry.createdAt}`} className="flex gap-3">
                    <span className="mt-0.5">
                      {entry.status === 'approved' ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : entry.status === 'pending_review' ? (
                        <Clock className="h-4 w-4 text-warning" aria-hidden="true" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-muted" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{MEMBER_STATUS_LABEL[entry.status]}</p>
                      <p className="text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                      {entry.note ? <p className="text-xs text-muted">{entry.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
