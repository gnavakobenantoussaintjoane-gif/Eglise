import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Download, ImagePlus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { ChurchEvent, EventRegistration, Pagination } from '../../types';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Textarea,
} from '../../components/ui';
import { AdminHeading, TableShell } from '../../components/admin/AdminKit';
import { formatDateRange, formatDateTime, toDateTimeInputValue } from '../../utils/format';

interface EventFormState {
  id?: string;
  title: string;
  description: string;
  category: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  registrationOpen: boolean;
  isPublished: boolean;
}

const EMPTY: EventFormState = {
  title: '',
  description: '',
  category: '',
  location: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
  registrationOpen: false,
  isPublished: false,
};

export function AdminEventsPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EventFormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<ChurchEvent | null>(null);
  const [registrationsTarget, setRegistrationsTarget] = useState<ChurchEvent | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverEventId, setCoverEventId] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: ({ signal }) =>
      api.get<{ events: ChurchEvent[]; pagination: Pagination }>('/admin/events', { perPage: 60 }, signal),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'events'] });
    void queryClient.invalidateQueries({ queryKey: ['members', 'events'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: EventFormState) => {
      const payload = {
        title: values.title,
        description: values.description || null,
        category: values.category || null,
        location: values.location || null,
        startsAt: values.startsAt,
        endsAt: values.endsAt || null,
        capacity: values.capacity ? Number(values.capacity) : null,
        registrationOpen: values.registrationOpen,
        isPublished: values.isPublished,
      };
      return values.id
        ? api.patch<ChurchEvent>(`/admin/events/${values.id}`, payload)
        : api.post<ChurchEvent>('/admin/events', payload);
    },
    onSuccess: () => {
      toast.success('Événement enregistré.');
      setFormOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const publishMutation = useMutation({
    mutationFn: (input: { id: string; isPublished: boolean }) =>
      api.patch(`/admin/events/${input.id}`, { isPublished: input.isPublished }),
    onSuccess: () => {
      toast.success('Publication mise à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${id}`),
    onSuccess: () => {
      toast.success('Événement supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const coverMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const data = new FormData();
      data.append('image', file);
      return api.upload<ChurchEvent>(`/admin/events/${id}/cover`, data);
    },
    onSuccess: () => {
      toast.success('Visuel mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.'),
  });

  const events = eventsQuery.data?.events ?? [];

  return (
    <>
      <AdminHeading
        title="Événements"
        description="Créez les rendez-vous de l’église, ouvrez les inscriptions et suivez les participants."
        actions={
          <Button size="sm" onClick={() => { setForm(EMPTY); setFormOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel événement
          </Button>
        }
      />

      <TableShell
        columns={['Événement', 'Dates', 'Lieu', 'Inscriptions', 'Statut', 'Actions']}
        loading={eventsQuery.isLoading}
        empty={
          !eventsQuery.isLoading && events.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                Aucun événement.
              </td>
            </tr>
          ) : null
        }
      >
        {events.map((event) => (
          <tr key={event.id}>
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-ink">{event.title}</p>
              <p className="text-xs text-muted">{event.category ?? '—'}</p>
            </td>
            <td className="px-4 py-3 text-xs text-muted">{formatDateRange(event.startsAt, event.endsAt)}</td>
            <td className="px-4 py-3 text-xs text-muted">{event.location ?? '—'}</td>
            <td className="px-4 py-3 text-xs">
              {event.registrationOpen ? (
                <Badge tone="success">
                  {event.registeredCount}
                  {event.capacity ? ` / ${event.capacity}` : ''}
                </Badge>
              ) : (
                <Badge tone="neutral">Fermées</Badge>
              )}
            </td>
            <td className="px-4 py-3">
              <Badge tone={event.isPublished ? 'success' : 'warning'}>
                {event.isPublished ? 'Publié' : 'Brouillon'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setRegistrationsTarget(event)}>
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Inscrits
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCoverEventId(event.id);
                    coverInputRef.current?.click();
                  }}
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm({
                      id: event.id,
                      title: event.title,
                      description: event.description ?? '',
                      category: event.category ?? '',
                      location: event.location ?? '',
                      startsAt: toDateTimeInputValue(event.startsAt),
                      endsAt: event.endsAt ? toDateTimeInputValue(event.endsAt) : '',
                      capacity: event.capacity ? String(event.capacity) : '',
                      registrationOpen: event.registrationOpen,
                      isPublished: event.isPublished,
                    });
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => publishMutation.mutate({ id: event.id, isPublished: !event.isPublished })}
                >
                  {event.isPublished ? 'Dépublier' : 'Publier'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(event)}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && coverEventId) coverMutation.mutate({ id: coverEventId, file });
          event.target.value = '';
        }}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Modifier l’événement' : 'Nouvel événement'}
        size="lg"
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.title.trim().length < 2 || !form.startsAt) {
              toast.error('Titre et date de début sont requis.');
              return;
            }
            saveMutation.mutate(form);
          }}
        >
          <Input label="Titre" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <Textarea label="Description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Catégorie" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            <Input label="Lieu" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Début"
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
            />
            <Input
              label="Fin"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Capacité (facultatif)"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            />
            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  checked={form.registrationOpen}
                  onChange={(event) => setForm({ ...form, registrationOpen: event.target.checked })}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />
                Ouvrir les inscriptions
              </label>
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(event) => setForm({ ...form, isPublished: event.target.checked })}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />
                Publier sur le site
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
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
        open={Boolean(deleteTarget)}
        title="Supprimer cet événement ?"
        description={`« ${deleteTarget?.title ?? ''} » et ses inscriptions seront supprimés.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <RegistrationsModal event={registrationsTarget} onClose={() => setRegistrationsTarget(null)} />
    </>
  );
}

function RegistrationsModal({ event, onClose }: { event: ChurchEvent | null; onClose: () => void }) {
  const registrationsQuery = useQuery({
    queryKey: ['admin', 'registrations', event?.id],
    queryFn: ({ signal }) =>
      api.get<{ registrations: EventRegistration[] }>(
        `/admin/events/${event?.id}/registrations`,
        undefined,
        signal,
      ),
    enabled: Boolean(event?.id),
  });

  const registrations = registrationsQuery.data?.registrations ?? [];
  const seats = registrations
    .filter((registration) => registration.status === 'confirmed')
    .reduce((sum, registration) => sum + registration.seats, 0);

  return (
    <Modal
      open={Boolean(event)}
      onClose={onClose}
      title={`Inscriptions — ${event?.title ?? ''}`}
      description={event ? `${formatDateRange(event.startsAt, event.endsAt)} · ${seats} place(s) confirmée(s)` : undefined}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <a href={`/api/v1/admin/events/${event?.id}/registrations/export`} download>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" aria-hidden="true" /> Exporter en CSV
            </Button>
          </a>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Capacité : {event?.capacity ?? 'non limitée'}
          </span>
        </div>

        {registrationsQuery.isLoading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : registrations.length === 0 ? (
          <p className="text-sm text-muted">Aucune inscription pour cet événement.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {registrations.map((registration) => (
              <li key={registration.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{registration.fullName}</p>
                  <p className="text-xs text-muted">
                    {registration.email}
                    {registration.phone ? ` · ${registration.phone}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{registration.seats} place(s)</p>
                  <p>{formatDateTime(registration.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
