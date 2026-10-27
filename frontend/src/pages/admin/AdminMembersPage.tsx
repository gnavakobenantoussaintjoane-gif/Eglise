import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, ShieldCheck, ShieldX, UserCheck, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { MemberDetail, MemberListItem, MemberStatus, Pagination } from '../../types';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Input,
  LoadingBlock,
  Modal,
  PaginationControls,
  Select,
  Textarea,
} from '../../components/ui';
import { AdminHeading, TableShell, Toolbar } from '../../components/admin/AdminKit';
import {
  MEMBER_STATUS_LABEL,
  MEMBER_STATUS_TONE,
  ROLE_LABEL,
  formatDateTime,
  formatRelative,
} from '../../utils/format';

interface MemberListResponse {
  members: MemberListItem[];
  pagination: Pagination;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(MEMBER_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

export function AdminMembersPage() {
  const [params, setParams] = useSearchParams();
  const detailId = params.get('detail');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<MemberStatus | ''>('pending_review');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ['admin', 'members', page, status, term],
    queryFn: ({ signal }) =>
      api.get<MemberListResponse>(
        '/admin/members',
        { page, perPage: 15, status: status || undefined, search: term || undefined },
        signal,
      ),
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'member', detailId],
    queryFn: ({ signal }) => api.get<MemberDetail>(`/admin/members/${detailId}`, undefined, signal),
    enabled: Boolean(detailId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'member'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' | 'suspended'; note?: string }) =>
      api.patch(`/admin/members/${input.id}/status`, { status: input.status, note: input.note }),
    onSuccess: () => {
      toast.success('Statut du membre mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { id: string; role: string }) =>
      api.patch(`/admin/members/${input.id}/role`, { role: input.role }),
    onSuccess: () => {
      toast.success('Rôle mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const members = membersQuery.data?.members ?? [];
  const pagination = membersQuery.data?.pagination;
  const detail = detailQuery.data;

  const closeDetail = () => {
    params.delete('detail');
    setParams(params, { replace: true });
  };

  return (
    <>
      <AdminHeading
        title="Membres & approbations"
        description="Chaque inscription est examinée manuellement. L’approbation ouvre l’espace membre : elle ne donne jamais de rôle administratif."
      >
        <Alert tone="info" title="Sécurité du processus">
          Le statut et le rôle ne peuvent pas être modifiés par le membre lui-même : la règle est appliquée par l’API et
          par un garde-fou en base de données.
        </Alert>
      </AdminHeading>

      <Toolbar>
        <form
          className="flex flex-1 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(search.trim());
            setPage(1);
          }}
          role="search"
        >
          <div className="min-w-[200px] flex-1">
            <Input
              label="Rechercher"
              placeholder="Nom, e-mail, ville…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              label="Statut"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as MemberStatus | '');
                setPage(1);
              }}
            />
          </div>
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" aria-hidden="true" /> Filtrer
          </Button>
        </form>
      </Toolbar>

      <TableShell
        columns={['Membre', 'Coordonnées', 'Statut', 'Rôle', 'Demande', '']}
        loading={membersQuery.isLoading}
        empty={
          !membersQuery.isLoading && members.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                Aucun membre ne correspond à ces critères.
              </td>
            </tr>
          ) : null
        }
      >
        {members.map((member) => (
          <tr key={member.id} className="align-middle hover:bg-lavender/30">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar firstName={member.firstName} lastName={member.lastName} src={member.photoUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{member.fullName || '(sans nom)'}</p>
                  <p className="truncate text-xs text-muted">{member.email}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3 text-xs text-muted">
              {member.city ?? '—'}
              <br />
              {member.phone ?? '—'}
            </td>
            <td className="px-4 py-3">
              <Badge tone={MEMBER_STATUS_TONE[member.status]}>{MEMBER_STATUS_LABEL[member.status]}</Badge>
            </td>
            <td className="px-4 py-3 text-xs text-ink/75">{ROLE_LABEL[member.role]}</td>
            <td className="px-4 py-3 text-xs text-muted">
              {member.submittedAt ? formatRelative(member.submittedAt) : '—'}
            </td>
            <td className="px-4 py-3 text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  params.set('detail', member.id);
                  setParams(params, { replace: true });
                }}
              >
                Examiner
              </Button>
            </td>
          </tr>
        ))}
      </TableShell>

      {pagination ? (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          onChange={setPage}
          className="mt-4"
        />
      ) : null}

      <MemberDetailModal
        open={Boolean(detailId)}
        onClose={closeDetail}
        detail={detail}
        loading={detailQuery.isLoading}
        onStatus={(status, note) => {
          if (detailId) statusMutation.mutate({ id: detailId, status, note });
        }}
        onRole={(role) => {
          if (detailId) roleMutation.mutate({ id: detailId, role });
        }}
        busy={statusMutation.isPending || roleMutation.isPending}
      />
    </>
  );
}

function MemberDetailModal({
  open,
  onClose,
  detail,
  loading,
  onStatus,
  onRole,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  detail: MemberDetail | undefined;
  loading: boolean;
  onStatus: (status: 'approved' | 'rejected' | 'suspended', note?: string) => void;
  onRole: (role: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  const [role, setRole] = useState('');

  const status = detail?.status;
  const canApprove = status === 'pending_review' || status === 'rejected' || status === 'suspended';
  const canReject = status === 'pending_review' || status === 'suspended';
  const canSuspend = status === 'approved';
  const canChangeRole = status === 'approved';

  return (
    <Modal open={open} onClose={onClose} title="Fiche du membre" size="lg">
      {loading || !detail ? (
        <LoadingBlock label="Chargement de la fiche…" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar firstName={detail.firstName} lastName={detail.lastName} src={detail.photoUrl} size="lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-display text-lg font-semibold text-brand">{detail.fullName || '(sans nom)'}</p>
              <p className="text-sm text-muted">{detail.email}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {status ? <Badge tone={MEMBER_STATUS_TONE[status]}>{MEMBER_STATUS_LABEL[status]}</Badge> : null}
                {detail.role ? <Badge tone="neutral">{ROLE_LABEL[detail.role]}</Badge> : null}
                {detail.consentPhotos ? <Badge tone="success">Photos acceptées</Badge> : <Badge tone="warning">Photos non acceptées</Badge>}
              </div>
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Téléphone</dt>
              <dd className="text-ink/80">{detail.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Ville</dt>
              <dd className="text-ink/80">{detail.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Profession</dt>
              <dd className="text-ink/80">{detail.profession ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Département souhaité</dt>
              <dd className="text-ink/80">
                {detail.departments.find((department) => department.id === detail.departmentInterestId)?.name ?? '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Présentation</dt>
              <dd className="whitespace-pre-line text-ink/80">{detail.bio ?? '—'}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Départements</h3>
            {detail.departments.length === 0 ? (
              <p className="text-sm text-muted">Aucun département.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {detail.departments.map((department) => (
                  <li key={department.id}>
                    <Badge tone="brand">
                      {department.name} · {department.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Historique des décisions</h3>
            {detail.history.length === 0 ? (
              <p className="text-sm text-muted">Aucune décision enregistrée.</p>
            ) : (
              <ol className="space-y-2">
                {detail.history.map((entry, index) => (
                  <li key={`${entry.createdAt}-${index}`} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MEMBER_STATUS_TONE[entry.status]}>{MEMBER_STATUS_LABEL[entry.status]}</Badge>
                      <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
                      {entry.actorName ? <span className="text-xs text-muted">par {entry.actorName}</span> : null}
                    </div>
                    {entry.note ? <p className="mt-1 text-xs text-ink/70">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {canChangeRole ? (
            <div className="space-y-2 rounded-xl border border-line p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck className="h-4 w-4 text-brand-accent" aria-hidden="true" /> Rôle et permissions
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Select
                    label="Role"
                    options={ROLE_OPTIONS}
                    value={role || detail.role || 'member'}
                    onChange={(event) => setRole(event.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={busy || (role || detail.role) === detail.role}
                  onClick={() => onRole(role || detail.role || 'member')}
                >
                  Appliquer le rôle
                </Button>
              </div>
              <p className="text-xs text-muted">
                Un responsable de département ne gère que les départements auxquels il est rattaché.
              </p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">Décision</h3>
            {(canReject || canSuspend) ? (
              <Textarea
                label={canSuspend ? 'Motif de la suspension (visible par le membre)' : 'Motif du refus (obligatoire)'}
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {canApprove ? (
                <Button loading={busy} onClick={() => onStatus('approved', note || undefined)}>
                  <Check className="h-4 w-4" aria-hidden="true" /> Approuver
                </Button>
              ) : null}
              {canReject ? (
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={!note.trim()}
                  onClick={() => onStatus('rejected', note.trim())}
                >
                  <UserX className="h-4 w-4" aria-hidden="true" /> Refuser
                </Button>
              ) : null}
              {canSuspend ? (
                <Button
                  variant="outline"
                  loading={busy}
                  onClick={() => onStatus('suspended', note || undefined)}
                >
                  <ShieldX className="h-4 w-4" aria-hidden="true" /> Suspendre
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" aria-hidden="true" /> Fermer
              </Button>
            </div>
            {status === 'profile_incomplete' ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Ce membre n’a pas encore soumis sa demande.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
