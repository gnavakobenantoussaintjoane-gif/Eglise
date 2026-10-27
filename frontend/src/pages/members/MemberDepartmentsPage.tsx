import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Department, DepartmentRequest } from '../../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Modal,
  Textarea,
} from '../../components/ui';
import { formatDate } from '../../utils/format';

type DepartmentWithMembership = Department & {
  membership?: { member_role: string; status: string } | null;
  hasPendingRequest?: boolean;
};

export function MemberDepartmentsPage() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<DepartmentWithMembership | null>(null);
  const [message, setMessage] = useState('');

  const departmentsQuery = useQuery({
    queryKey: ['members', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: DepartmentWithMembership[] }>('/members/departments', undefined, signal),
  });

  const requestsQuery = useQuery({
    queryKey: ['members', 'department-requests'],
    queryFn: ({ signal }) =>
      api.get<{ requests: DepartmentRequest[] }>('/members/departments/requests', undefined, signal),
  });

  const joinMutation = useMutation({
    mutationFn: (input: { id: string; message?: string }) =>
      api.post(`/members/departments/${input.id}/requests`, { message: input.message }),
    onSuccess: () => {
      toast.success('Votre demande a été envoyée aux responsables.');
      setTarget(null);
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['members', 'departments'] });
      void queryClient.invalidateQueries({ queryKey: ['members', 'department-requests'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Envoi impossible.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/members/departments/requests/${id}`),
    onSuccess: () => {
      toast.success('Demande annulée.');
      void queryClient.invalidateQueries({ queryKey: ['members', 'departments'] });
      void queryClient.invalidateQueries({ queryKey: ['members', 'department-requests'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Annulation impossible.'),
  });

  if (departmentsQuery.isLoading) return <LoadingBlock label="Chargement des départements…" />;

  const departments = departmentsQuery.data?.departments ?? [];
  const requests = requestsQuery.data?.requests ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-dark">Mes départements</h1>
        <p className="text-sm text-muted">
          Rejoignez une équipe de service et suivez l’état de vos demandes.
        </p>
      </header>

      {requests.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-brand-dark">Mes demandes</h2>
          <ul className="divide-y divide-line">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{request.departmentName}</p>
                  <p className="text-xs text-muted">
                    Envoyée {formatDate(request.createdAt)}
                    {request.decisionNote ? ` · ${request.decisionNote}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'
                    }
                  >
                    {request.status === 'approved' ? 'Acceptée' : request.status === 'rejected' ? 'Refusée' : 'En attente'}
                  </Badge>
                  {request.status === 'pending' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(request.id)}
                      icon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
                    >
                      Annuler
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {departments.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title="Aucun département disponible"
          description="Les équipes seront ouvertes prochainement."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {departments.map((department) => {
            const member = Boolean(department.membership);
            const pending = Boolean(department.hasPendingRequest);
            return (
              <Card key={department.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-brand-dark">{department.name}</h2>
                  {member ? (
                    <Badge tone="success">Membre</Badge>
                  ) : pending ? (
                    <Badge tone="warning">En attente</Badge>
                  ) : null}
                </div>
                {department.description ? (
                  <p className="line-clamp-3 text-sm text-muted">{department.description}</p>
                ) : null}
                <p className="text-xs text-muted">
                  {[department.meetingDay, department.meetingTime].filter(Boolean).join(' · ') || 'Horaires à venir'} ·{' '}
                  {department.memberCount} membre(s)
                </p>
                <div className="mt-auto">
                  {member ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Vous servez dans cette équipe
                    </span>
                  ) : pending ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                      <Clock className="h-4 w-4" aria-hidden="true" /> Demande en cours d’examen
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setTarget(department)}>
                      Rejoindre ce département
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Rejoindre ${target?.name ?? ''}`}
        description="Votre demande sera transmise aux responsables du département."
        size="sm"
      >
        <div className="space-y-4">
          <Alert tone="info">
            Un responsable examinera votre demande. Vous serez notifié de la décision.
          </Alert>
          <Textarea
            label="Motivation (facultatif)"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Annuler
            </Button>
            <Button
              loading={joinMutation.isPending}
              onClick={() => target && joinMutation.mutate({ id: target.id, message: message || undefined })}
            >
              Envoyer ma demande
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
