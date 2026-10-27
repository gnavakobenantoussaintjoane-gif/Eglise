import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Announcement, Pagination } from '../../types';
import { Badge, Button, ConfirmDialog, Input, Modal, Select, Textarea } from '../../components/ui';
import { AdminHeading, TableShell, Toolbar } from '../../components/admin/AdminKit';
import { formatDate, toDateInputValue, toDateTimeInputValue } from '../../utils/format';

interface AnnouncementFormState {
  id?: string;
  title: string;
  body: string;
  audience: 'public' | 'members';
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string;
}

const EMPTY: AnnouncementFormState = {
  title: '',
  body: '',
  audience: 'public',
  isPinned: false,
  publishedAt: '',
  expiresAt: '',
};

const AUDIENCE_OPTIONS = [
  { value: 'public', label: 'Tout public' },
  { value: 'members', label: 'Membres uniquement' },
];

export function AdminAnnouncementsPage() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementFormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const announcementsQuery = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: ({ signal }) =>
      api.get<{ announcements: Announcement[]; pagination: Pagination }>(
        '/admin/announcements',
        { perPage: 50 },
        signal,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['members', 'announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: AnnouncementFormState) => {
      const payload = {
        title: values.title,
        body: values.body,
        audience: values.audience,
        isPinned: values.isPinned,
        publishedAt: values.publishedAt ? new Date(values.publishedAt).toISOString() : undefined,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      };
      return values.id
        ? api.patch<Announcement>(`/admin/announcements/${values.id}`, payload)
        : api.post<Announcement>('/admin/announcements', payload);
    },
    onSuccess: () => {
      toast.success('Annonce enregistrée.');
      setFormOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/announcements/${id}`),
    onSuccess: () => {
      toast.success('Annonce supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const pinMutation = useMutation({
    mutationFn: (input: { id: string; isPinned: boolean }) =>
      api.patch(`/admin/announcements/${input.id}`, { isPinned: input.isPinned }),
    onSuccess: () => {
      toast.success('Épinglage mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const announcements = (announcementsQuery.data?.announcements ?? []).filter(
    (announcement) => !audience || announcement.audience === audience,
  );

  return (
    <>
      <AdminHeading
        title="Annonces"
        description="Communiquez avec l’assemblée : annonces publiques ou réservées à l’espace membre."
        actions={
          <Button size="sm" onClick={() => { setForm(EMPTY); setFormOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle annonce
          </Button>
        }
      />

      <Toolbar>
        <Select
          aria-label="Filtrer par audience"
          options={AUDIENCE_OPTIONS}
          placeholder="Toutes les audiences"
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          containerClassName="w-full sm:w-64"
        />
      </Toolbar>

      <TableShell
        columns={['Titre', 'Audience', 'Publication', 'Expiration', 'Actions']}
        loading={announcementsQuery.isLoading}
        empty={
          !announcementsQuery.isLoading && announcements.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                Aucune annonce.
              </td>
            </tr>
          ) : null
        }
      >
        {announcements.map((announcement) => (
          <tr key={announcement.id}>
            <td className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {announcement.isPinned ? <Pin className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> : null}
                {announcement.title}
              </p>
              <p className="mt-0.5 line-clamp-2 max-w-md text-xs text-muted">{announcement.body}</p>
            </td>
            <td className="px-4 py-3">
              <Badge tone={announcement.audience === 'public' ? 'info' : 'brand'}>
                {announcement.audience === 'public' ? 'Public' : 'Membres'}
              </Badge>
            </td>
            <td className="px-4 py-3 text-xs text-muted">{formatDate(announcement.publishedAt)}</td>
            <td className="px-4 py-3 text-xs text-muted">
              {announcement.expiresAt ? formatDate(announcement.expiresAt) : '—'}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => pinMutation.mutate({ id: announcement.id, isPinned: !announcement.isPinned })}
                >
                  {announcement.isPinned ? 'Désépingler' : 'Épingler'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm({
                      id: announcement.id,
                      title: announcement.title,
                      body: announcement.body,
                      audience: announcement.audience,
                      isPinned: announcement.isPinned,
                      publishedAt: toDateTimeInputValue(announcement.publishedAt),
                      expiresAt: announcement.expiresAt ? toDateTimeInputValue(announcement.expiresAt) : '',
                    });
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(announcement)}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Modifier l’annonce' : 'Nouvelle annonce'}
        size="lg"
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.title.trim().length < 2 || form.body.trim().length < 5) {
              toast.error('Titre et contenu sont requis.');
              return;
            }
            saveMutation.mutate(form);
          }}
        >
          <Input label="Titre" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <Textarea label="Contenu" rows={6} required value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Audience"
              options={AUDIENCE_OPTIONS}
              value={form.audience}
              onChange={(event) => setForm({ ...form, audience: event.target.value as 'public' | 'members' })}
            />
            <Input
              label="Expiration (facultatif)"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </div>
          <Input
            label="Publication programmée (facultatif)"
            hint={`Laisser vide pour publier immédiatement (${toDateInputValue(new Date())}).`}
            type="datetime-local"
            value={form.publishedAt}
            onChange={(event) => setForm({ ...form, publishedAt: event.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(event) => setForm({ ...form, isPinned: event.target.checked })}
              className="h-4 w-4 accent-[var(--brand-accent)]"
            />
            Épingler en haut de la liste
          </label>
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
        title="Supprimer cette annonce ?"
        description={`« ${deleteTarget?.title ?? ''} » sera définitivement supprimée.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
