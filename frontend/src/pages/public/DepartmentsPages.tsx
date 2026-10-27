import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Mail, MapPin, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Department } from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SkeletonGrid,
  Textarea,
} from '../../components/ui';
import { DepartmentCard } from '../../components/public/Cards';

type DepartmentWithMembership = Department & {
  membership?: { member_role: string; status: string } | null;
  hasPendingRequest?: boolean;
};

export function DepartmentsPage() {
  const departmentsQuery = useQuery({
    queryKey: ['public', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/public/departments', undefined, signal),
  });

  const departments = departmentsQuery.data?.departments ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Servir"
        title="Départements"
        description="Chorale, intercession, accueil, jeunesse… Trouvez l’équipe où vos dons seront utiles et où vous grandirez."
      />
      <section className="container-page py-12">
        {departmentsQuery.isLoading ? (
          <SkeletonGrid items={6} />
        ) : departments.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="Aucun département publié"
            description="Les équipes seront présentées prochainement."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((department) => (
              <DepartmentCard key={department.id} department={department} />
            ))}
          </div>
        )}

        <div className="mt-12 rounded-3xl border border-line bg-lavender/60 p-6 sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl space-y-1">
              <h2 className="font-display text-xl font-semibold text-brand-dark">Prêt à vous engager ?</h2>
              <p className="text-sm text-muted">
                Les demandes d’adhésion à un département sont ouvertes aux membres approuvés. Créez votre compte
                pour commencer.
              </p>
            </div>
            <Link to="/inscription">
              <Button>Devenir membre</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function DepartmentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isAuthenticated, isApproved } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const departmentQuery = useQuery({
    queryKey: ['public', 'department', slug],
    queryFn: ({ signal }) => api.get<Department>(`/public/departments/${slug}`, undefined, signal),
    enabled: Boolean(slug),
    retry: false,
  });

  const membershipQuery = useQuery({
    queryKey: ['members', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: DepartmentWithMembership[] }>('/members/departments', undefined, signal),
    enabled: isAuthenticated && isApproved,
  });

  if (departmentQuery.isLoading) {
    return (
      <div className="container-page py-20">
        <LoadingBlock label="Chargement du département…" />
      </div>
    );
  }

  if (departmentQuery.isError || !departmentQuery.data) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title="Département introuvable"
          description="Ce département n’est pas disponible."
          action={
            <Link to="/departements">
              <Button variant="outline">Tous les départements</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const department = departmentQuery.data;
  const membership = membershipQuery.data?.departments.find((item) => item.id === department.id);
  const alreadyMember = Boolean(membership?.membership);
  const pendingRequest = Boolean(membership?.hasPendingRequest) || sent;

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await api.post(`/members/departments/${department.id}/requests`, { message: message || undefined });
      setSent(true);
      setMessage('');
      toast.success('Votre demande a été envoyée aux responsables.');
      void queryClient.invalidateQueries({ queryKey: ['members', 'departments'] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible, réessayez.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Département" title={department.name} description={department.description ?? undefined}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" aria-hidden="true" /> {department.memberCount} membre(s)
          </span>
          {department.meetingDay || department.meetingTime ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {[department.meetingDay, department.meetingTime].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          {department.meetingLocation ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {department.meetingLocation}
            </span>
          ) : null}
          {department.leader ? (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-4 w-4" aria-hidden="true" /> {department.leader.fullName}
            </span>
          ) : null}
        </div>
      </PageHeader>

      <section className="container-page grid gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {department.imageUrl ? (
            <img src={department.imageUrl} alt="" className="w-full rounded-2xl object-cover" />
          ) : null}
          <div className="prose-church text-base leading-relaxed text-ink/80">
            {(department.mission ?? 'La mission de ce département sera précisée prochainement.')
              .split('\n')
              .filter(Boolean)
              .map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
          </div>
          {department.contact ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Mail className="h-4 w-4" aria-hidden="true" /> {department.contact}
            </p>
          ) : null}
          <Link to="/departements" className="text-sm font-medium text-brand hover:text-brand-royal">
            ← Tous les départements
          </Link>
        </div>

        <aside className="space-y-4">
          {!isAuthenticated ? (
            <div className="surface space-y-3 p-6">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Rejoindre cette équipe</h2>
              <p className="text-sm text-muted">
                Les demandes sont réservées aux membres de l’église. Créez votre compte puis soumettez votre
                inscription.
              </p>
              <Link to="/inscription">
                <Button block>Créer mon compte</Button>
              </Link>
              <Link to="/connexion" className="block text-center text-sm text-brand hover:text-brand-royal">
                J’ai déjà un compte
              </Link>
            </div>
          ) : !isApproved ? (
            <Alert tone="warning" title="Adhésion en attente de validation">
              Votre demande d’adhésion doit être validée avant de rejoindre un département.{' '}
              <Link to="/mon-inscription" className="font-semibold underline">
                Voir mon inscription
              </Link>
            </Alert>
          ) : alreadyMember ? (
            <Alert tone="success" title="Vous faites partie de cette équipe">
              Votre présence est enregistrée. Retrouvez les détails dans votre espace membre.
            </Alert>
          ) : pendingRequest ? (
            <Alert tone="info" title="Demande envoyée">
              Les responsables du département vont examiner votre demande. Vous serez notifié de la décision.
            </Alert>
          ) : (
            <form onSubmit={handleJoin} className="surface space-y-4 p-6">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Je souhaite rejoindre</h2>
              <Textarea
                label="Motivation (facultatif)"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Partagez brièvement ce qui vous attire dans ce service…"
              />
              <Button type="submit" block loading={sending} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                Envoyer ma demande
              </Button>
            </form>
          )}
        </aside>
      </section>
    </>
  );
}
