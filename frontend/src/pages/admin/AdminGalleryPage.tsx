import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Download,
  Eye,
  ImagePlus,
  Images,
  Lock,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadBinary, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Album, AlbumGrant, MemberListItem, Pagination } from '../../types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';
import { AdminHeading, Toolbar } from '../../components/admin/AdminKit';
import {
  ALBUM_ACCESS_LABEL,
  ALBUM_STATUS_LABEL,
  formatDate,
  formatFileSize,
  toDateInputValue,
} from '../../utils/format';

interface AlbumFormState {
  id?: string;
  title: string;
  description: string;
  category: string;
  eventDate: string;
  access: 'public' | 'members' | 'restricted';
  status: 'draft' | 'published' | 'archived';
}

const EMPTY_ALBUM: AlbumFormState = {
  title: '',
  description: '',
  category: '',
  eventDate: '',
  access: 'members',
  status: 'draft',
};

export function AdminGalleryPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AlbumFormState>(EMPTY_ALBUM);
  const [managerAlbumId, setManagerAlbumId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Album | null>(null);

  const albumsQuery = useQuery({
    queryKey: ['admin', 'albums', statusFilter],
    queryFn: ({ signal }) =>
      api.get<{ albums: Album[]; pagination: Pagination }>(
        '/media/albums',
        { perPage: 60, status: statusFilter || undefined },
        signal,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'albums'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'albums'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: AlbumFormState) => {
      const payload = {
        title: values.title,
        description: values.description || null,
        category: values.category || null,
        eventDate: values.eventDate || null,
        access: values.access,
        status: values.status,
      };
      return values.id
        ? api.patch<Album>(`/media/albums/${values.id}`, payload)
        : api.post<Album>('/media/albums', payload);
    },
    onSuccess: () => {
      toast.success('Album enregistré.');
      setFormOpen(false);
      setForm(EMPTY_ALBUM);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; action: 'publish' | 'archive' }) =>
      api.post(`/media/albums/${input.id}/${input.action}`),
    onSuccess: () => {
      toast.success('Statut mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/media/albums/${id}`),
    onSuccess: () => {
      toast.success('Album supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const albums = albumsQuery.data?.albums ?? [];

  return (
    <>
      <AdminHeading
        title="Albums & photos"
        description="Publiez les photos des cultes et événements. Chaque album définit son niveau d’accès : public, membres ou restreint."
        actions={
          <Button size="sm" onClick={() => { setForm(EMPTY_ALBUM); setFormOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel album
          </Button>
        }
      />

      <Toolbar>
        <div className="w-52">
          <Select
            label="Statut"
            options={[
              { value: '', label: 'Tous' },
              { value: 'draft', label: 'Brouillons' },
              { value: 'published', label: 'Publiés' },
              { value: 'archived', label: 'Archivés' },
            ]}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          />
        </div>
        <p className="pb-2 text-xs text-muted">
          {albums.length} album(s) affiché(s) · RLS et vérifications serveur protègent les fichiers privés.
        </p>
      </Toolbar>

      {albumsQuery.isLoading ? (
        <p className="text-sm text-muted">Chargement des albums…</p>
      ) : albums.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted">
          Aucun album. Créez votre premier album pour publier des photos.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {albums.map((album) => (
            <Card key={album.id} className="flex flex-col gap-3">
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-lavender">
                {album.coverUrl ? (
                  <img src={album.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-brand/40">
                    <Images className="h-8 w-8" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute left-2 top-2 flex gap-1.5">
                  <Badge tone={album.status === 'published' ? 'success' : album.status === 'draft' ? 'warning' : 'neutral'}>
                    {ALBUM_STATUS_LABEL[album.status]}
                  </Badge>
                  <Badge tone={album.access === 'restricted' ? 'warning' : album.access === 'members' ? 'brand' : 'info'}>
                    {ALBUM_ACCESS_LABEL[album.access]}
                  </Badge>
                </div>
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-brand">{album.title}</h2>
                <p className="text-xs text-muted">
                  {album.photoCount} photo(s)
                  {album.eventDate ? ` · ${formatDate(album.eventDate)}` : ''}
                </p>
                {album.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{album.description}</p>
                ) : null}
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setManagerAlbumId(album.id)}>
                  <Images className="h-3.5 w-3.5" aria-hidden="true" /> Gérer les photos
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    {
                      setForm({
                        id: album.id,
                        title: album.title,
                        description: album.description ?? '',
                        category: album.category ?? '',
                        eventDate: toDateInputValue(album.eventDate),
                        access: album.access,
                        status: album.status,
                      });
                      setFormOpen(true);
                    }
                  }
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifier
                </Button>
                {album.status !== 'published' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate({ id: album.id, action: 'publish' })}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Publier
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate({ id: album.id, action: 'archive' })}
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archiver
                  </Button>
                )}
                {isAdmin ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(album)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Supprimer
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Modifier l’album' : 'Nouvel album'}
        size="lg"
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.title.trim().length < 2) {
              toast.error('Le titre est requis.');
              return;
            }
            saveMutation.mutate(form);
          }}
        >
          <Input
            label="Titre"
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Catégorie"
              placeholder="Culte, Jeunesse, Baptême…"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
            <Input
              label="Date de l'événement"
              type="date"
              value={form.eventDate}
              onChange={(event) => setForm({ ...form, eventDate: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Niveau d'accès"
              options={[
                { value: 'public', label: 'Public — visible par tous' },
                { value: 'members', label: 'Membres — inscription approuvée requise' },
                { value: 'restricted', label: 'Restreint — autorisation nominative' },
              ]}
              value={form.access}
              onChange={(event) =>
                setForm({ ...form, access: event.target.value as AlbumFormState['access'] })
              }
            />
            <Select
              label="Statut"
              options={[
                { value: 'draft', label: 'Brouillon' },
                { value: 'published', label: 'Publié' },
                { value: 'archived', label: 'Archivé' },
              ]}
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as AlbumFormState['status'] })
              }
            />
          </div>
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

      <AlbumManagerModal
        albumId={managerAlbumId}
        onClose={() => setManagerAlbumId(null)}
        onChanged={invalidate}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer définitivement cet album ?"
        description={`« ${deleteTarget?.title ?? ''} » et toutes ses photos seront supprimés du stockage. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

function AlbumManagerModal({
  albumId,
  onClose,
  onChanged,
}: {
  albumId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [grantProfileId, setGrantProfileId] = useState('');
  const [coverId, setCoverId] = useState<string | null>(null);

  const albumQuery = useQuery({
    queryKey: ['admin', 'album', albumId],
    queryFn: ({ signal }) => api.get<Album>(`/media/albums/${albumId}`, undefined, signal),
    enabled: Boolean(albumId),
  });

  const grantsQuery = useQuery({
    queryKey: ['admin', 'album-grants', albumId],
    queryFn: ({ signal }) => api.get<{ grants: AlbumGrant[] }>(`/media/albums/${albumId}/access`, undefined, signal),
    enabled: Boolean(albumId),
  });

  const approvedMembersQuery = useQuery({
    queryKey: ['admin', 'members', 'approved-options'],
    queryFn: ({ signal }) =>
      api.get<{ members: MemberListItem[] }>('/admin/members', { status: 'approved', perPage: 100 }, signal),
    enabled: Boolean(albumId) && albumQuery.data?.access === 'restricted',
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'album', albumId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'album-grants', albumId] });
    onChanged();
  };

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const data = new FormData();
      Array.from(files).forEach((file) => data.append('photos', file));
      return api.upload<{ photos: unknown[] }>(`/media/albums/${albumId}/photos`, data);
    },
    onSuccess: (result) => {
      toast.success(`${result.photos.length} photo(s) ajoutée(s).`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.'),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/media/photos/${photoId}`),
    onSuccess: () => {
      toast.success('Photo supprimée.');
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const coverMutation = useMutation({
    mutationFn: (photoId: string) => api.patch(`/media/albums/${albumId}`, { coverPhotoId: photoId }),
    onSuccess: () => {
      toast.success('Couverture mise à jour.');
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const grantMutation = useMutation({
    mutationFn: (profileId: string) => api.post(`/media/albums/${albumId}/access`, { profileId }),
    onSuccess: () => {
      toast.success('Accès accordé.');
      setGrantProfileId('');
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (profileId: string) => api.delete(`/media/albums/${albumId}/access/${profileId}`),
    onSuccess: () => {
      toast.success('Accès retiré.');
      refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const album = albumQuery.data;

  const handleDownload = async () => {
    if (!album) return;
    setDownloading(true);
    try {
      await downloadBinary(`/media/albums/${album.id}/download`, `${album.slug}.zip`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Téléchargement impossible.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={Boolean(albumId)}
      onClose={onClose}
      title={album ? `Album — ${album.title}` : 'Album'}
      description={
        album
          ? `${ALBUM_ACCESS_LABEL[album.access]} · ${album.photos?.length ?? 0} photo(s)`
          : undefined
      }
      size="xl"
    >
      {!album ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length) uploadMutation.mutate(event.target.files);
                event.target.value = '';
              }}
            />
            <Button onClick={() => uploadRef.current?.click()} loading={uploadMutation.isPending}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" /> Téléverser des photos
            </Button>
            <Button variant="outline" loading={downloading} onClick={handleDownload}>
              <Download className="h-4 w-4" aria-hidden="true" /> ZIP de l'album
            </Button>
            <Link to={`/galerie/${album.slug}`} target="_blank">
              <Button variant="ghost">
                <Eye className="h-4 w-4" aria-hidden="true" /> Voir la page publique
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted">
            Formats acceptés : JPG, PNG, WebP, AVIF, GIF — 25 Mo maximum par fichier, 12 fichiers par envoi. Le type
            réel est vérifié côté serveur.
          </p>

          {(album.photos?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-lavender/40 px-4 py-10 text-center">
              <ImagePlus className="mx-auto h-8 w-8 text-brand/40" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted">Aucune photo dans cet album.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {album.photos?.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="aspect-square bg-lavender">
                    {photo.url ? (
                      <img src={photo.url} alt={photo.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="truncate text-[0.7rem] text-muted">{photo.fileName}</p>
                    <p className="text-[0.7rem] text-muted">{formatFileSize(photo.sizeBytes)}</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] text-ink/70 hover:bg-lavender"
                        onClick={() => {
                          setCoverId(photo.id);
                          coverMutation.mutate(photo.id);
                        }}
                        aria-label={`Définir la photo ${photo.fileName} comme couverture`}
                      >
                        Couverture
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] text-danger hover:bg-red-50"
                        onClick={() => deletePhotoMutation.mutate(photo.id)}
                        aria-label={`Supprimer la photo ${photo.fileName}`}
                      >
                        Supprimer
                      </button>
                    </div>
                    {coverId === photo.id ? (
                      <p className="text-[0.65rem] text-success">Couverture demandée…</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {album.access === 'restricted' ? (
            <div className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Lock className="h-4 w-4 text-brand-accent" aria-hidden="true" /> Autorisations nominatives
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Select
                    label="Ajouter un membre"
                    placeholder="Choisir un membre approuvé"
                    options={(approvedMembersQuery.data?.members ?? []).map((member) => ({
                      value: member.id,
                      label: member.fullName || member.email,
                    }))}
                    value={grantProfileId}
                    onChange={(event) => setGrantProfileId(event.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={!grantProfileId}
                  loading={grantMutation.isPending}
                  onClick={() => grantMutation.mutate(grantProfileId)}
                >
                  <Users className="h-4 w-4" aria-hidden="true" /> Autoriser
                </Button>
              </div>
              {(grantsQuery.data?.grants ?? []).length === 0 ? (
                <p className="text-xs text-muted">Aucune autorisation : l’album n’est visible que par l’équipe média.</p>
              ) : (
                <ul className="space-y-1.5">
                  {grantsQuery.data?.grants.map((grant) => (
                    <li key={grant.profileId} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
                      <span className="text-sm text-ink/80">{grant.fullName || grant.email}</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-danger hover:underline"
                        onClick={() => revokeMutation.mutate(grant.profileId)}
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {album.access === 'public'
                ? 'Album public : accessible à tous, images servies par URL signée.'
                : 'Album membres : seuls les membres approuvés peuvent voir et télécharger les images.'}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
