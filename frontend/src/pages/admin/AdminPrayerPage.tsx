import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandHeart } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Pagination, PrayerRequest } from '../../types';
import { Badge, Button, Select } from '../../components/ui';
import { AdminHeading, StatCard, TableShell, Toolbar } from '../../components/admin/AdminKit';
import { formatDateTime } from '../../utils/format';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nouvelle' },
  { value: 'in_prayer', label: 'En prière' },
  { value: 'closed', label: 'Clôturée' },
];

const STATUS_LABEL: Record<PrayerRequest['status'], string> = {
  new: 'Nouvelle',
  in_prayer: 'En prière',
  closed: 'Clôturée',
};

const STATUS_TONE: Record<PrayerRequest['status'], 'warning' | 'info' | 'neutral'> = {
  new: 'warning',
  in_prayer: 'info',
  closed: 'neutral',
};

export function AdminPrayerPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['admin', 'prayer-requests', status],
    queryFn: ({ signal }) =>
      api.get<{ requests: PrayerRequest[]; pagination: Pagination }>(
        '/admin/prayer-requests',
        { perPage: 50, status: status || undefined },
        signal,
      ),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: PrayerRequest['status'] }) =>
      api.patch(`/admin/prayer-requests/${input.id}`, { status: input.status }),
    onSuccess: () => {
      toast.success('Statut mis à jour.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'prayer-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const requests = requestsQuery.data?.requests ?? [];
  const newCount = requests.filter((request) => request.status === 'new').length;

  return (
    <>
      <AdminHeading
        title="Requêtes de prière"
        description="Accompagnez chaque demande reçue depuis le site. Les demandes anonymes n’affichent aucune coordonnée."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Demandes affichées" value={requests.length} icon={<HandHeart className="h-5 w-5" />} />
        <StatCard label="Nouvelles" value={newCount} tone="warning" />
        <StatCard label="En prière" value={requests.filter((request) => request.status === 'in_prayer').length} tone="info" />
      </div>

      <Toolbar>
        <Select
          aria-label="Filtrer par statut"
          options={STATUS_OPTIONS}
          placeholder="Tous les statuts"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          containerClassName="w-full sm:w-56"
        />
      </Toolbar>

      <TableShell
        columns={['Demandeur', 'Message', 'Reçue le', 'Statut', 'Suivi']}
        loading={requestsQuery.isLoading}
        empty={
          !requestsQuery.isLoading && requests.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                Aucune demande de prière.
              </td>
            </tr>
          ) : null
        }
      >
        {requests.map((request) => (
          <tr key={request.id} className="align-top">
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-ink">
                {request.isAnonymous ? 'Anonyme' : request.fullName}
              </p>
              {!request.isAnonymous ? (
                <p className="text-xs text-muted">
                  {request.email ?? '—'}
                  {request.phone ? ` · ${request.phone}` : ''}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3">
              <p className="max-w-lg whitespace-pre-line text-sm text-ink/80">{request.message}</p>
              {request.category ? <p className="mt-1 text-xs text-muted">Sujet : {request.category}</p> : null}
            </td>
            <td className="px-4 py-3 text-xs text-muted">{formatDateTime(request.createdAt)}</td>
            <td className="px-4 py-3">
              <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {request.status !== 'in_prayer' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate({ id: request.id, status: 'in_prayer' })}
                  >
                    En prière
                  </Button>
                ) : null}
                {request.status !== 'closed' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate({ id: request.id, status: 'closed' })}
                  >
                    Clôturer
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate({ id: request.id, status: 'new' })}
                  >
                    Rouvrir
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
