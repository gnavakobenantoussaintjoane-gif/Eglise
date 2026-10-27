import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileAudio, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Pagination, Sermon } from '../../types';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Textarea,
} from '../../components/ui';
import { AdminHeading, TableShell } from '../../components/admin/AdminKit';
import { formatDate, toDateInputValue } from '../../utils/format';

interface SermonFormState {
  id?: string;
  title: string;
  speaker: string;
  series: string;
  scripture: string;
  summary: string;
  preachedOn: string;
  videoUrl: string;
  isPublished: boolean;
}

const EMPTY: SermonFormState = {
  title: '',
  speaker: '',
  series: '',
  scripture: '',
  summary: '',
  preachedOn: toDateInputValue(new Date()),
  videoUrl: '',
  isPublished: false,
};

export function AdminSermonsPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SermonFormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Sermon | null>(null);
  const [mediaTarget, setMediaTarget] = useState<{ id: string; kind: 'audio' | 'document' } | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const sermonsQuery = useQuery({
    queryKey: ['admin', 'sermons'],
    queryFn: ({ signal }) =>
      api.get<{ sermons: Sermon[]; pagination: Pagination }>('/admin/sermons', { perPage: 50 }, signal),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'sermons'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'sermons'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: SermonFormState) => {
      const payload = {
        title: values.title,
        speaker: values.speaker,
        series: values.series || null,
        scripture: values.scripture || null,
        summary: values.summary || null,
        preachedOn: values.preachedOn || undefined,
        videoUrl: values.videoUrl || null,
        isPublished: values.isPublished,
      };
      return values.id
        ? api.patch<Sermon>(`/admin/sermons/${values.id}`, payload)
        : api.post<Sermon>('/admin/sermons', payload);
    },
    onSuccess: () => {
      toast.success('Prédication enregistrée.');
      setFormOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const publishMutation = useMutation({
    mutationFn: (input: { id: string; isPublished: boolean }) =>
      api.patch(`/admin/sermons/${input.id}`, { isPublished: input.isPublished }),
    onSuccess: () => {
      toast.success('Publication mise à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/sermons/${id}`),
    onSuccess: () => {
      toast.success('Prédication supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const mediaMutation = useMutation({
    mutationFn: async ({ id, kind, file }: { id: string; kind: 'audio' | 'document'; file: File }) => {
      const data = new FormData();
      data.append('file', file);
      return api.upload<Sermon>(`/admin/sermons/${id}/media?kind=${kind}`, data);
    },
    onSuccess: () => {
      toast.success('Fichier ajouté.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.'),
  });

  const sermons = sermonsQuery.data?.sermons ?? [];

  return (
    <>
      <AdminHeading
        title="Prédications"
        description="Publiez les messages, ajoutez l’audio et les notes. Seules les prédications publiées apparaissent sur le site public."
        actions={
          <Button size="sm" onClick={() => { setForm(EMPTY); setFormOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle prédication
          </Button>
        }
      />

      <TableShell
        columns={['Titre', 'Prédicateur', 'Date', 'Médias', 'Statut', 'Actions']}
        loading={sermonsQuery.isLoading}
        empty={
          !sermonsQuery.isLoading && sermons.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                Aucune prédication enregistrée.
              </td>
            </tr>
          ) : null
        }
      >
        {sermons.map((sermon) => (
          <tr key={sermon.id}>
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-ink">{sermon.title}</p>
              <p className="text-xs text-muted">{sermon.scripture ?? '—'}</p>
            </td>
            <td className="px-4 py-3 text-sm text-ink/80">{sermon.speaker}</td>
            <td className="px-4 py-3 text-xs text-muted">{sermon.preachedOn ? formatDate(sermon.preachedOn) : '—'}</td>
            <td className="px-4 py-3 text-xs">
              <div className="flex gap-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] hover:bg-lavender"
                  onClick={() => { setMediaTarget({ id: sermon.id, kind: 'audio' }); mediaInputRef.current?.click(); }}
                >
                  <FileAudio className="h-3 w-3" aria-hidden="true" /> {sermon.audioUrl ? 'Remplacer' : 'Audio'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] hover:bg-lavender"
                  onClick={() => { setMediaTarget({ id: sermon.id, kind: 'document' }); mediaInputRef.current?.click(); }}
                >
                  <FileText className="h-3 w-3" aria-hidden="true" /> {sermon.documentUrl ? 'Remplacer' : 'PDF'}
                </button>
              </div>
            </td>
            <td className="px-4 py-3">
              <Badge tone={sermon.isPublished ? 'success' : 'warning'}>
                {sermon.isPublished ? 'Publiée' : 'Brouillon'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm({
                      id: sermon.id,
                      title: sermon.title,
                      speaker: sermon.speaker,
                      series: sermon.series ?? '',
                      scripture: sermon.scripture ?? '',
                      summary: sermon.summary ?? '',
                      preachedOn: toDateInputValue(sermon.preachedOn),
                      videoUrl: sermon.videoUrl ?? '',
                      isPublished: sermon.isPublished,
                    });
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => publishMutation.mutate({ id: sermon.id, isPublished: !sermon.isPublished })}
                >
                  {sermon.isPublished ? 'Dépublier' : 'Publier'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(sermon)}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      <input
        ref={mediaInputRef}
        type="file"
        className="sr-only"
        accept={
          mediaTarget?.kind === 'audio'
            ? 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm'
            : 'application/pdf'
        }
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && mediaTarget) mediaMutation.mutate({ ...mediaTarget, file });
          event.target.value = '';
        }}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Modifier la prédication' : 'Nouvelle prédication'}
        size="lg"
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.title.trim().length < 2 || form.speaker.trim().length < 2) {
              toast.error('Titre et prédicateur sont requis.');
              return;
            }
            saveMutation.mutate(form);
          }}
        >
          <Input label="Titre" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Prédicateur" required value={form.speaker} onChange={(event) => setForm({ ...form, speaker: event.target.value })} />
            <Input label="Série" value={form.series} onChange={(event) => setForm({ ...form, series: event.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Passage biblique" value={form.scripture} onChange={(event) => setForm({ ...form, scripture: event.target.value })} />
            <Input
              label="Date de prédication"
              type="date"
              value={form.preachedOn}
              onChange={(event) => setForm({ ...form, preachedOn: event.target.value })}
            />
          </div>
          <Input
            label="Lien vidéo (YouTube, etc.)"
            type="url"
            placeholder="https://…"
            value={form.videoUrl}
            onChange={(event) => setForm({ ...form, videoUrl: event.target.value })}
          />
          <Textarea label="Résumé" rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => setForm({ ...form, isPublished: event.target.checked })}
              className="h-4 w-4 accent-[var(--brand-accent)]"
            />
            Publier immédiatement sur le site
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
        title="Supprimer cette prédication ?"
        description={`« ${deleteTarget?.title ?? ''} » et ses fichiers audio/documents seront supprimés.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
