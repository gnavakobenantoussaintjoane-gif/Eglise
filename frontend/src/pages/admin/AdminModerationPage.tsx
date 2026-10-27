import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { TakedownRequest, Testimony } from '../../types';
import { Badge, Button, Modal, Select, Textarea } from '../../components/ui';
import { AdminHeading, TableShell } from '../../components/admin/AdminKit';
import { formatDateTime } from '../../utils/format';
import { cn } from '../../utils/cn';

type Tab = 'testimonies' | 'takedowns';

const TESTIMONY_STATUS_OPTIONS = [
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Publiés' },
  { value: 'rejected', label: 'Refusés' },
];

export function AdminModerationPage() {
  const [tab, setTab] = useState<Tab>('testimonies');

  return (
    <>
      <AdminHeading
        title="Modération"
        description="Validez les témoignages avant publication et traitez les demandes de retrait de photos."
      />

      <div className="mb-4 inline-flex rounded-xl border border-line bg-white p-1 text-sm">
        {(
          [
            { id: 'testimonies', label: 'Témoignages' },
            { id: 'takedowns', label: 'Retraits de photos' },
          ] as { id: Tab; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              tab === entry.id ? 'bg-brand text-white' : 'text-muted hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'testimonies' ? <TestimoniesPanel /> : <TakedownsPanel />}
    </>
  );
}

function TestimoniesPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [reader, setReader] = useState<Testimony | null>(null);

  const testimoniesQuery = useQuery({
    queryKey: ['admin', 'testimonies', status],
    queryFn: ({ signal }) =>
      api.get<{ testimonies: Testimony[] }>('/admin/testimonies', { status: status || undefined }, signal),
  });

  const moderateMutation = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' }) =>
      api.patch(`/admin/testimonies/${input.id}`, { status: input.status }),
    onSuccess: () => {
      toast.success('Témoignage traité.');
      setReader(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'testimonies'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'testimonies'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const testimonies = testimoniesQuery.data?.testimonies ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          aria-label="Filtrer par statut"
          options={TESTIMONY_STATUS_OPTIONS}
          placeholder="Tous les statuts"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          containerClassName="w-full sm:w-56"
        />
      </div>

      <TableShell
        columns={['Auteur', 'Titre', 'Extrait', 'Reçu le', 'Statut', 'Actions']}
        loading={testimoniesQuery.isLoading}
        empty={
          !testimoniesQuery.isLoading && testimonies.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                Aucun témoignage pour ce filtre.
              </td>
            </tr>
          ) : null
        }
      >
        {testimonies.map((testimony) => (
          <tr key={testimony.id}>
            <td className="px-4 py-3 text-sm text-ink">{testimony.authorName}</td>
            <td className="px-4 py-3 text-sm font-medium text-ink">{testimony.title}</td>
            <td className="px-4 py-3">
              <p className="max-w-sm truncate text-xs text-muted">{testimony.body}</p>
            </td>
            <td className="px-4 py-3 text-xs text-muted">{testimony.createdAt ? formatDateTime(testimony.createdAt) : '—'}</td>
            <td className="px-4 py-3">
              <Badge
                tone={
                  testimony.status === 'approved'
                    ? 'success'
                    : testimony.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {testimony.status === 'approved'
                  ? 'Publié'
                  : testimony.status === 'rejected'
                    ? 'Refusé'
                    : 'En attente'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setReader(testimony)}>
                  Lire
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => moderateMutation.mutate({ id: testimony.id, status: 'approved' })}
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => moderateMutation.mutate({ id: testimony.id, status: 'rejected' })}
                >
                  <X className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      <Modal
        open={Boolean(reader)}
        onClose={() => setReader(null)}
        title={reader?.title ?? ''}
        description={reader ? `Témoignage de ${reader.authorName}` : undefined}
        size="lg"
        footer={
          reader ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => moderateMutation.mutate({ id: reader.id, status: 'rejected' })}
                loading={moderateMutation.isPending}
              >
                Refuser
              </Button>
              <Button
                onClick={() => moderateMutation.mutate({ id: reader.id, status: 'approved' })}
                loading={moderateMutation.isPending}
              >
                Approuver et publier
              </Button>
            </div>
          ) : null
        }
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{reader?.body}</p>
      </Modal>
    </>
  );
}

function TakedownsPanel() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{ request: TakedownRequest; status: 'approved' | 'rejected' } | null>(
    null,
  );
  const [note, setNote] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['admin', 'takedown-requests'],
    queryFn: ({ signal }) => api.get<{ requests: TakedownRequest[] }>('/admin/takedown-requests', undefined, signal),
  });

  const decisionMutation = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected'; note?: string }) =>
      api.patch(`/admin/takedown-requests/${input.id}`, { status: input.status, note: input.note || undefined }),
    onSuccess: () => {
      toast.success('Demande de retrait traitée.');
      setDecision(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'takedown-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const requests = requestsQuery.data?.requests ?? [];

  return (
    <>
      <TableShell
        columns={['Demandeur', 'Motif', 'Cible', 'Reçue le', 'Statut', 'Actions']}
        loading={requestsQuery.isLoading}
        empty={
          !requestsQuery.isLoading && requests.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                Aucune demande de retrait.
              </td>
            </tr>
          ) : null
        }
      >
        {requests.map((request) => (
          <tr key={request.id} className="align-top">
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-ink">{request.requesterName}</p>
              <p className="text-xs text-muted">{request.requesterEmail}</p>
            </td>
            <td className="px-4 py-3">
              <p className="max-w-sm text-sm text-ink/80">{request.reason}</p>
            </td>
            <td className="px-4 py-3 text-xs text-muted">
              {request.photoId ? 'Photo' : null}
              {request.albumId ? ' Album' : null}
              {!request.photoId && !request.albumId ? '—' : null}
            </td>
            <td className="px-4 py-3 text-xs text-muted">{formatDateTime(request.createdAt)}</td>
            <td className="px-4 py-3">
              <Badge
                tone={
                  request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'
                }
              >
                {request.status === 'approved'
                  ? 'Retirée'
                  : request.status === 'rejected'
                    ? 'Refusée'
                    : 'En attente'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              {request.status === 'pending' ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDecision({ request, status: 'approved' }); setNote(''); }}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-danger" aria-hidden="true" /> Retirer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDecision({ request, status: 'rejected' }); setNote(''); }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Refuser
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted">Traitée</span>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.status === 'approved' ? 'Confirmer le retrait' : 'Refuser la demande'}
        description={
          decision?.status === 'approved'
            ? 'La photo sera définitivement supprimée de l’album.'
            : 'Le demandeur recevra une notification de refus.'
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Note interne (facultatif)"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            hint="Conservée dans le journal d’audit."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Annuler
            </Button>
            <Button
              variant={decision?.status === 'approved' ? 'danger' : 'primary'}
              loading={decisionMutation.isPending}
              onClick={() =>
                decision &&
                decisionMutation.mutate({ id: decision.request.id, status: decision.status, note })
              }
            >
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
