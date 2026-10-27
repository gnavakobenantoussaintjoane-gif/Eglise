import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ImagePlus, Pencil, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type {
  Department,
  DepartmentMember,
  DepartmentNomination,
  DepartmentRequest,
  MemberListItem,
  Pagination,
} from '../../types';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';
import { AdminHeading, TableShell } from '../../components/admin/AdminKit';
import { formatDate, formatDateRange, formatRelative } from '../../utils/format';

/** Libellés lisibles des rôles internes à un département. */
const ROLE_LABELS: Record<string, string> = {
  leader: 'Responsable',
  assistant: 'Adjoint',
  member: 'Membre',
};

interface DepartmentFormState {
  id?: string;
  name: string;
  description: string;
  mission: string;
  leaderId: string;
  meetingDay: string;
  meetingTime: string;
  meetingLocation: string;
  contact: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: DepartmentFormState = {
  name: '',
  description: '',
  mission: '',
  leaderId: '',
  meetingDay: '',
  meetingTime: '',
  meetingLocation: '',
  contact: '',
  sortOrder: 0,
  isActive: true,
};

export function AdminDepartmentsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'departments' | 'requests'>('departments');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DepartmentFormState>(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<Department | null>(null);
  const [membersTarget, setMembersTarget] = useState<Department | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageDeptId, setImageDeptId] = useState<string | null>(null);

  const departmentsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/admin/departments', undefined, signal),
  });

  const requestsQuery = useQuery({
    queryKey: ['admin', 'department-requests'],
    queryFn: ({ signal }) =>
      api.get<{ requests: DepartmentRequest[] }>('/admin/departments/requests', undefined, signal),
  });

  const approvedMembersQuery = useQuery({
    queryKey: ['admin', 'members', 'approved-options'],
    queryFn: ({ signal }) =>
      api.get<{ members: MemberListItem[]; pagination: Pagination }>(
        '/admin/members',
        { status: 'approved', perPage: 100 },
        signal,
      ),
    enabled: isAdmin,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'department-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['members', 'departments'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'departments'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: DepartmentFormState) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        mission: values.mission || null,
        leaderId: values.leaderId || null,
        meetingDay: values.meetingDay || null,
        meetingTime: values.meetingTime || null,
        meetingLocation: values.meetingLocation || null,
        contact: values.contact || null,
        sortOrder: Number(values.sortOrder) || 0,
        isActive: values.isActive,
      };
      return values.id
        ? api.patch<Department>(`/admin/departments/${values.id}`, payload)
        : api.post<Department>('/admin/departments', payload);
    },
    onSuccess: () => {
      toast.success('Département enregistré.');
      setFormOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/departments/${id}/archive`),
    onSuccess: () => {
      toast.success('Département archivé.');
      setArchiveTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const imageMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const data = new FormData();
      data.append('image', file);
      return api.upload<Department>(`/admin/departments/${id}/image`, data);
    },
    onSuccess: () => {
      toast.success('Image mise à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.'),
  });

  const requestMutation = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected'; note?: string }) =>
      api.patch(`/admin/departments/requests/${input.id}`, { status: input.status, note: input.note }),
    onSuccess: () => {
      toast.success('Demande traitée.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const departments = departmentsQuery.data?.departments ?? [];
  const requests = requestsQuery.data?.requests ?? [];
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  return (
    <>
      <AdminHeading
        title="Départements"
        description="Créez, modifiez, activez ou archivez les départements sans intervention technique. Les responsables ne voient que les leurs."
        actions={
          isAdmin ? (
            <Button
              size="sm"
              onClick={() => {
                setForm(EMPTY_FORM);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau département
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex gap-2">
        {[
          { key: 'departments' as const, label: `Départements (${departments.length})` },
          { key: 'requests' as const, label: `Demandes (${pendingRequests.length})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={
              tab === item.key
                ? 'rounded-full bg-brand px-4 py-2 text-sm font-medium text-white'
                : 'rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink/70 hover:bg-lavender'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'departments' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => {
            const manageable = isAdmin || department.canManage;
            return (
              <Card key={department.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-brand">{department.name}</h2>
                    <p className="text-xs text-muted">
                      {department.memberCount} membre(s)
                      {department.meetingDay ? ` · ${department.meetingDay}` : ''}
                    </p>
                  </div>
                  <Badge tone={department.archivedAt ? 'neutral' : department.isActive ? 'success' : 'warning'}>
                    {department.archivedAt ? 'Archivé' : department.isActive ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-sm text-muted">
                  {department.description ?? department.mission ?? 'Aucune description.'}
                </p>
                {department.leader?.fullName ? (
                  <p className="text-xs text-muted">Responsable : {department.leader.fullName}</p>
                ) : (
                  <p className="text-xs text-amber-700">Aucun responsable désigné.</p>
                )}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {manageable ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm({
                            id: department.id,
                            name: department.name,
                            description: department.description ?? '',
                            mission: department.mission ?? '',
                            leaderId: department.leader?.id ?? '',
                            meetingDay: department.meetingDay ?? '',
                            meetingTime: department.meetingTime ?? '',
                            meetingLocation: department.meetingLocation ?? '',
                            contact: department.contact ?? '',
                            sortOrder: department.sortOrder ?? 0,
                            isActive: department.isActive ?? true,
                          });
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifier
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMembersTarget(department)}>
                        <Users className="h-3.5 w-3.5" aria-hidden="true" /> Membres
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setImageDeptId(department.id);
                          imageInputRef.current?.click();
                        }}
                      >
                        <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Image
                      </Button>
                    </>
                  ) : null}
                  {isAdmin && !department.archivedAt ? (
                    <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(department)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Archiver
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <TableShell
          columns={['Membre', 'Département', 'Message', 'Statut', 'Date', 'Décision']}
          loading={requestsQuery.isLoading}
          empty={
            !requestsQuery.isLoading && requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  Aucune demande de département.
                </td>
              </tr>
            ) : null
          }
        >
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{request.memberName}</p>
                <p className="text-xs text-muted">{request.email}</p>
              </td>
              <td className="px-4 py-3 text-sm text-ink/80">{request.departmentName}</td>
              <td className="max-w-xs px-4 py-3 text-xs text-muted">{request.message ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge
                  tone={
                    request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'
                  }
                >
                  {request.status === 'approved' ? 'Acceptée' : request.status === 'rejected' ? 'Refusée' : 'En attente'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-muted">{formatRelative(request.createdAt)}</td>
              <td className="px-4 py-3">
                {request.status === 'pending' ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      loading={requestMutation.isPending}
                      onClick={() => requestMutation.mutate({ id: request.id, status: 'approved' })}
                    >
                      Accepter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={requestMutation.isPending}
                      onClick={() =>
                        requestMutation.mutate({
                          id: request.id,
                          status: 'rejected',
                          note: 'Demande refusée par le responsable.',
                        })
                      }
                    >
                      Refuser
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted">Traitée</span>
                )}
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && imageDeptId) imageMutation.mutate({ id: imageDeptId, file });
          event.target.value = '';
        }}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Modifier le département' : 'Nouveau département'}
        size="lg"
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.name.trim().length < 2) {
              toast.error('Le nom du département est requis.');
              return;
            }
            saveMutation.mutate(form);
          }}
        >
          <Input
            label="Nom"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <Textarea
            label="Mission"
            rows={3}
            value={form.mission}
            onChange={(event) => setForm({ ...form, mission: event.target.value })}
          />
          {isAdmin ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Responsable"
                placeholder="Aucun"
                options={(approvedMembersQuery.data?.members ?? []).map((member) => ({
                  value: member.id,
                  label: member.fullName || member.email,
                }))}
                value={form.leaderId}
                onChange={(event) => setForm({ ...form, leaderId: event.target.value })}
              />
              <Input
                label="Ordre d'affichage"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Jour de réunion"
              placeholder="Dimanche"
              value={form.meetingDay}
              onChange={(event) => setForm({ ...form, meetingDay: event.target.value })}
            />
            <Input
              label="Heure"
              placeholder="18h00 — 20h00"
              value={form.meetingTime}
              onChange={(event) => setForm({ ...form, meetingTime: event.target.value })}
            />
            <Input
              label="Lieu"
              placeholder="Salle annexe"
              value={form.meetingLocation}
              onChange={(event) => setForm({ ...form, meetingLocation: event.target.value })}
            />
          </div>
          <Input
            label="Contact"
            placeholder="Téléphone ou e-mail du responsable"
            value={form.contact}
            onChange={(event) => setForm({ ...form, contact: event.target.value })}
          />
          {isAdmin ? (
            <Checkbox
              label="Département actif (visible sur le site)"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archiver ce département ?"
        description={`« ${archiveTarget?.name ?? ''} » ne sera plus visible sur le site. Les historiques sont conservés.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiveMutation.isPending}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
      />

      <DepartmentMembersModal
        department={membersTarget}
        onClose={() => setMembersTarget(null)}
        approvedMembers={approvedMembersQuery.data?.members ?? []}
        onChanged={invalidate}
      />
    </>
  );
}

function DepartmentMembersModal({
  department,
  onClose,
  approvedMembers,
  onChanged,
}: {
  department: Department | null;
  onClose: () => void;
  approvedMembers: MemberListItem[];
  onChanged: () => void;
}) {
  const [profileId, setProfileId] = useState('');
  const [role, setRole] = useState<'leader' | 'assistant' | 'member'>('member');
  const [functionTitle, setFunctionTitle] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['admin', 'department-members', department?.id],
    queryFn: ({ signal }) =>
      api.get<{ members: DepartmentMember[] }>(
        `/admin/departments/${department?.id}/members`,
        undefined,
        signal,
      ),
    enabled: Boolean(department?.id),
  });

  // Historique chargé uniquement à la demande : la liste est potentiellement longue.
  const historyQuery = useQuery({
    queryKey: ['admin', 'department-nominations', department?.id],
    queryFn: ({ signal }) =>
      api.get<{ nominations: DepartmentNomination[] }>(
        `/admin/departments/${department?.id}/nominations`,
        undefined,
        signal,
      ),
    enabled: Boolean(department?.id) && showHistory,
  });

  const queryClient = useQueryClient();

  const refresh = () => {
    void membersQuery.refetch();
    void queryClient.invalidateQueries({
      queryKey: ['admin', 'department-nominations', department?.id],
    });
    onChanged();
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/departments/${department?.id}/members`, {
        profileId,
        role,
        functionTitle: functionTitle.trim() || undefined,
        startedOn: startedOn || undefined,
      }),
    onSuccess: () => {
      toast.success('Nomination enregistrée.');
      setProfileId('');
      setFunctionTitle('');
      setStartedOn('');
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'department-nominations', department?.id],
      });
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Ajout impossible.'),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/admin/departments/${department?.id}/members/${memberId}`),
    onSuccess: () => {
      toast.success('Fin de fonction enregistrée. L’historique est conservé.');
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const activeMembers = (membersQuery.data?.members ?? []).filter((member) =>
    member.fullName.toLowerCase().includes(search.toLowerCase()),
  );
  const nominations = historyQuery.data?.nominations ?? [];

  return (
    <Modal open={Boolean(department)} onClose={onClose} title={`Équipe — ${department?.name ?? ''}`} size="lg">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            label="Membre approuvé"
            placeholder="Choisir un membre"
            options={approvedMembers.map((member) => ({
              value: member.id,
              label: member.fullName || member.email,
            }))}
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
          />
          <Select
            label="Rôle dans le département"
            options={[
              { value: 'member', label: 'Membre' },
              { value: 'assistant', label: 'Assistant' },
              { value: 'leader', label: 'Responsable' },
            ]}
            value={role}
            onChange={(event) => setRole(event.target.value as 'leader' | 'assistant' | 'member')}
          />
          <Input
            label="Intitulé de la fonction (facultatif)"
            placeholder="Responsable louange"
            value={functionTitle}
            maxLength={120}
            onChange={(event) => setFunctionTitle(event.target.value)}
          />
          <Input
            label="Date de début (facultatif)"
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
            hint="La date du jour est utilisée si le champ est vide."
          />
        </div>
        <Button
          onClick={() => (profileId ? addMutation.mutate() : toast.error('Choisissez un membre.'))}
          loading={addMutation.isPending}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Nommer
        </Button>

        <Input
          label="Filtrer l'équipe"
          placeholder="Nom du membre…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {membersQuery.isLoading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : activeMembers.length === 0 ? (
          <p className="text-sm text-muted">Aucun membre actif dans ce département.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {activeMembers.map((member) => (
              <li key={member.profileId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{member.fullName}</p>
                  <p className="text-xs text-muted">
                    {member.functionTitle || ROLE_LABELS[member.role] || member.role}
                    {member.startedOn
                      ? ` · depuis le ${formatDate(member.startedOn)}`
                      : ` · depuis ${formatRelative(member.joinedAt)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(member.profileId)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Mettre fin
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-line">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-ink"
            onClick={() => setShowHistory((value) => !value)}
            aria-expanded={showHistory}
          >
            Historique des nominations
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform ${showHistory ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {showHistory && (
            <div className="border-t border-line px-4 py-3">
              {historyQuery.isLoading ? (
                <p className="text-sm text-muted">Chargement…</p>
              ) : nominations.length === 0 ? (
                <p className="text-sm text-muted">Aucune nomination enregistrée.</p>
              ) : (
                <ul className="space-y-2">
                  {nominations.map((nomination) => (
                    <li key={nomination.id} className="text-sm">
                      <span className="font-medium text-ink">{nomination.fullName}</span>
                      <span className="text-muted">
                        {' — '}
                        {nomination.functionTitle ||
                          ROLE_LABELS[nomination.memberRole] ||
                          nomination.memberRole}
                        {' · '}
                        {formatDateRange(nomination.startedOn, nomination.endedOn)}
                      </span>
                      {nomination.status === 'active' ? (
                        <Badge tone="success" className="ml-2">
                          En fonction
                        </Badge>
                      ) : (
                        <Badge tone="neutral" className="ml-2">
                          Terminée
                        </Badge>
                      )}
                      {nomination.endReason && (
                        <p className="text-xs text-muted">Motif : {nomination.endReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Seuls les membres dont l’inscription est approuvée peuvent être nommés. Une fin de
          fonction conserve la ligne d’historique.
        </p>
      </div>
    </Modal>
  );
}
