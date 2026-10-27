import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Images, Lock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Album, Pagination, Photo } from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  PaginationControls,
  SkeletonGrid,
  Textarea,
} from '../../components/ui';
import { AlbumCard } from '../../components/public/Cards';
import { PhotoLightbox } from '../../components/public/PhotoLightbox';
import { ALBUM_ACCESS_LABEL, formatDate } from '../../utils/format';

interface AlbumListResponse {
  albums: Album[];
  pagination: Pagination;
}

export function GalleryPage() {
  const [page, setPage] = useState(1);
  const albumsQuery = useQuery({
    queryKey: ['public', 'albums', page],
    queryFn: ({ signal }) =>
      api.get<AlbumListResponse>('/public/albums', { page, perPage: 12 }, signal),
  });

  const albums = albumsQuery.data?.albums ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Galerie"
        title="Souvenirs de la maison"
        description="Cultes, conventions, sorties et moments de fraternité : les images de la vie de l’église."
      />
      <section className="container-page py-12">
        {albumsQuery.isLoading ? (
          <SkeletonGrid items={6} />
        ) : albumsQuery.isError ? (
          <Alert tone="danger" title="Galerie indisponible">
            {albumsQuery.error instanceof ApiError ? albumsQuery.error.message : 'Réessayez dans un instant.'}
          </Alert>
        ) : albums.length === 0 ? (
          <EmptyState
            icon={<Images className="h-5 w-5" aria-hidden="true" />}
            title="Aucun album publié"
            description="Les photos des dernières activités seront bientôt disponibles."
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
            <PaginationControls
              page={albumsQuery.data?.pagination.page ?? 1}
              totalPages={albumsQuery.data?.pagination.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}

        <p className="mt-10 rounded-2xl border border-line bg-lavender/50 p-4 text-xs leading-relaxed text-muted">
          Certains albums sont réservés aux membres approuvés ou à des personnes autorisées. Si vous apparaissez sur
          une photo et souhaitez son retrait, ouvrez l’album puis utilisez le lien « Demander un retrait ».
        </p>
      </section>
    </>
  );
}

export function AlbumDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const [takedown, setTakedown] = useState({ requesterName: '', requesterEmail: '', reason: '' });
  const [sending, setSending] = useState(false);

  const albumQuery = useQuery({
    queryKey: ['public', 'album', slug],
    queryFn: ({ signal }) => api.get<Album>(`/public/albums/${slug}`, undefined, signal),
    enabled: Boolean(slug),
    retry: false,
  });

  if (albumQuery.isLoading) {
    return (
      <div className="container-page py-20">
        <LoadingBlock label="Chargement de l’album…" />
      </div>
    );
  }

  if (albumQuery.isError || !albumQuery.data) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={<Lock className="h-5 w-5" aria-hidden="true" />}
          title="Album indisponible"
          description="Cet album est privé, réservé aux membres, ou n’existe plus."
          action={
            <Link to="/galerie">
              <Button variant="outline">Retour à la galerie</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const album = albumQuery.data;
  const photos: Photo[] = album.photos ?? [];

  const submitTakedown = async (event: React.FormEvent) => {
    event.preventDefault();
    if (takedown.requesterName.trim().length < 2 || !takedown.requesterEmail.includes('@') || takedown.reason.trim().length < 10) {
      toast.error('Merci d’indiquer votre nom, un e-mail valide et un motif (10 caractères minimum).');
      return;
    }
    setSending(true);
    try {
      await api.post('/public/gallery/takedown-requests', {
        albumId: album.id,
        requesterName: takedown.requesterName,
        requesterEmail: takedown.requesterEmail,
        reason: takedown.reason,
      });
      toast.success('Votre demande de retrait a été enregistrée.');
      setTakedownOpen(false);
      setTakedown({ requesterName: '', requesterEmail: '', reason: '' });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible, réessayez.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={album.category ?? 'Album'}
        title={album.title}
        description={album.description ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <Badge tone="brand">{album.photoCount} photo(s)</Badge>
          {album.eventDate ? <span>{formatDate(album.eventDate)}</span> : null}
          <Badge tone={album.access === 'public' ? 'success' : 'warning'}>{ALBUM_ACCESS_LABEL[album.access]}</Badge>
          <button
            type="button"
            onClick={() => setTakedownOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-royal"
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Demander un retrait
          </button>
        </div>
      </PageHeader>

      <section className="container-page py-12">
        <Link to="/galerie" className="text-sm font-medium text-brand hover:text-brand-royal">
          ← Toute la galerie
        </Link>

        {photos.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<Images className="h-5 w-5" aria-hidden="true" />}
            title="Album vide"
            description="Les photos seront ajoutées prochainement."
          />
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-lavender-deep"
                  aria-label={`Agrandir la photo ${index + 1}`}
                >
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={photo.caption ?? `Photo ${index + 1} de l’album ${album.title}`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-muted">Indisponible</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}

      <Modal
        open={takedownOpen}
        onClose={() => setTakedownOpen(false)}
        title="Demander le retrait d’une photo"
        description="Indiquez de quelle photo il s’agit et pourquoi vous souhaitez son retrait. Un administrateur traitera la demande."
        size="sm"
      >
        <form onSubmit={submitTakedown} className="space-y-4" noValidate>
          <Input
            label="Votre nom"
            required
            value={takedown.requesterName}
            onChange={(event) => setTakedown({ ...takedown, requesterName: event.target.value })}
          />
          <Input
            label="Votre e-mail"
            type="email"
            required
            value={takedown.requesterEmail}
            onChange={(event) => setTakedown({ ...takedown, requesterEmail: event.target.value })}
          />
          <Textarea
            label="Motif"
            required
            rows={4}
            placeholder="Précisez la photo concernée et la raison du retrait…"
            value={takedown.reason}
            onChange={(event) => setTakedown({ ...takedown, reason: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTakedownOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={sending}>
              Envoyer la demande
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
