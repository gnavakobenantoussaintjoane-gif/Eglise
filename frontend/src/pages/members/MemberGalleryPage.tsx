import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Images, Lock } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { Album, Pagination } from '../../types';
import {
  Alert,
  Badge,
  EmptyState,
  LoadingBlock,
  PaginationControls,
} from '../../components/ui';
import { AlbumCard } from '../../components/public/Cards';
import { ALBUM_ACCESS_LABEL, formatDate } from '../../utils/format';

interface AlbumListResponse {
  albums: Album[];
  pagination: Pagination;
}

export function MemberGalleryPage() {
  const [page, setPage] = useState(1);
  const albumsQuery = useQuery({
    queryKey: ['members', 'albums', page],
    queryFn: ({ signal }) => api.get<AlbumListResponse>('/members/albums', { page, perPage: 12 }, signal),
  });

  if (albumsQuery.isLoading) return <LoadingBlock label="Chargement de la galerie…" />;

  if (albumsQuery.isError) {
    return (
      <Alert tone="danger" title="Galerie indisponible">
        {albumsQuery.error instanceof ApiError ? albumsQuery.error.message : 'Réessayez dans un instant.'}
      </Alert>
    );
  }

  const albums = albumsQuery.data?.albums ?? [];
  const restricted = albums.filter((album) => album.access === 'restricted');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-dark">Galerie privée</h1>
        <p className="text-sm text-muted">
          Albums réservés aux membres et aux personnes autorisées par l’équipe média.
        </p>
      </header>

      {restricted.length > 0 ? (
        <Alert tone="info" title="Accès restreint">
          Certains albums sont visibles uniquement sur autorisation. Si un album vous manque, contactez l’équipe
          média.
        </Alert>
      ) : null}

      {albums.length === 0 ? (
        <EmptyState
          icon={<Images className="h-5 w-5" aria-hidden="true" />}
          title="Aucun album disponible"
          description="Les albums réservés aux membres apparaîtront ici."
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <div key={album.id} className="space-y-2">
                <AlbumCard album={album} />
                <div className="flex items-center justify-between px-1 text-xs text-muted">
                  <Badge tone={album.access === 'public' ? 'success' : 'warning'}>
                    <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                    {ALBUM_ACCESS_LABEL[album.access]}
                  </Badge>
                  <span>{album.eventDate ? formatDate(album.eventDate) : ''}</span>
                </div>
              </div>
            ))}
          </div>
          <PaginationControls
            page={albumsQuery.data?.pagination.page ?? 1}
            totalPages={albumsQuery.data?.pagination.totalPages ?? 1}
            onChange={setPage}
          />
        </>
      )}

      <p className="text-xs text-muted">
        Besoin d’un tirage ou d’une photo en haute définition ?{' '}
        <Link to="/contact" className="font-medium text-brand hover:text-brand-royal">
          Contactez l’équipe média
        </Link>
        .
      </p>
    </div>
  );
}
