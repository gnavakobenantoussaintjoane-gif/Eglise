import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Download, Mic, PlayCircle } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { Pagination, Sermon } from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  PaginationControls,
  SkeletonGrid,
} from '../../components/ui';
import { SermonCard } from '../../components/public/Cards';
import { formatDate } from '../../utils/format';

interface SermonListResponse {
  sermons: Sermon[];
  pagination: Pagination;
}

export function SermonsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const sermonsQuery = useQuery({
    queryKey: ['public', 'sermons', { query, page }],
    queryFn: ({ signal }) =>
      api.get<SermonListResponse>(
        '/public/sermons',
        { page, perPage: 9, search: query || undefined },
        signal,
      ),
  });

  return (
    <>
      <PageHeader
        eyebrow="La Parole"
        title="Prédications"
        description="Réécoutez les messages prêchés à La Forteresse : audio, notes et références bibliques."
      />

      <section className="container-page py-12">
        <form
          className="mb-8 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Input
            label="Rechercher"
            placeholder="Titre, prédicateur ou passage…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:w-80"
          />
          <Button type="submit" variant="outline">
            Rechercher
          </Button>
          {query ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setQuery('');
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          ) : null}
        </form>

        {sermonsQuery.isLoading ? (
          <SkeletonGrid items={6} />
        ) : sermonsQuery.isError ? (
          <Alert tone="danger" title="Prédications indisponibles">
            {sermonsQuery.error instanceof ApiError ? sermonsQuery.error.message : 'Réessayez dans un instant.'}
          </Alert>
        ) : sermonsQuery.data && sermonsQuery.data.sermons.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
            title="Aucune prédication trouvée"
            description={query ? 'Essayez un autre mot-clé.' : 'Les messages seront publiés prochainement.'}
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sermonsQuery.data?.sermons.map((sermon) => (
                <SermonCard key={sermon.id} sermon={sermon} />
              ))}
            </div>
            <PaginationControls
              page={sermonsQuery.data?.pagination.page ?? 1}
              totalPages={sermonsQuery.data?.pagination.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}

export function SermonDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const sermonQuery = useQuery({
    queryKey: ['public', 'sermon', slug],
    queryFn: ({ signal }) => api.get<Sermon>(`/public/sermons/${slug}`, undefined, signal),
    enabled: Boolean(slug),
    retry: false,
  });

  const relatedQuery = useQuery({
    queryKey: ['public', 'sermons', 'related', sermonQuery.data?.series],
    queryFn: ({ signal }) =>
      api.get<SermonListResponse>(
        '/public/sermons',
        { perPage: 3, series: sermonQuery.data?.series ?? undefined },
        signal,
      ),
    enabled: Boolean(sermonQuery.data?.series),
  });

  if (sermonQuery.isLoading) {
    return (
      <div className="container-page py-20">
        <LoadingBlock label="Chargement du message…" />
      </div>
    );
  }

  if (sermonQuery.isError || !sermonQuery.data) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
          title="Message introuvable"
          description="Cette prédication n’est pas disponible ou n’a pas encore été publiée."
          action={
            <Link to="/predications">
              <Button variant="outline">Retour aux prédications</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const sermon = sermonQuery.data;
  const related = (relatedQuery.data?.sermons ?? []).filter((item) => item.slug !== sermon.slug);

  return (
    <>
      <PageHeader eyebrow={sermon.series ?? 'Prédication'} title={sermon.title} description={sermon.scripture ?? undefined}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Mic className="h-4 w-4" aria-hidden="true" /> {sermon.speaker}
          </span>
          {sermon.preachedOn ? <span>{formatDate(sermon.preachedOn)}</span> : null}
          <Link to="/predications" className="inline-flex items-center gap-1.5 font-medium text-brand hover:text-brand-royal">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Toutes les prédications
          </Link>
        </div>
      </PageHeader>

      <section className="container-page grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="space-y-6">
          {sermon.summary ? (
            <div className="prose-church text-base leading-relaxed text-ink/80">
              {sermon.summary.split('\n').filter(Boolean).map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Le résumé de ce message n’est pas encore disponible.</p>
          )}

          {sermon.documentUrl ? (
            <a href={sermon.documentUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" icon={<Download className="h-4 w-4" aria-hidden="true" />}>
                Télécharger les notes
              </Button>
            </a>
          ) : null}
        </article>

        <aside className="space-y-6">
          {sermon.audioUrl ? (
            <div className="surface space-y-3 p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-brand-dark">
                <PlayCircle className="h-5 w-5 text-brand-royal" aria-hidden="true" /> Écouter le message
              </h2>
              <audio controls preload="none" src={sermon.audioUrl} className="w-full">
                Votre navigateur ne prend pas en charge la lecture audio.
              </audio>
            </div>
          ) : null}

          {sermon.videoUrl ? (
            <div className="surface space-y-3 p-5">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Voir la vidéo</h2>
              <a href={sermon.videoUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" block>
                  Ouvrir la vidéo
                </Button>
              </a>
            </div>
          ) : null}

          <div className="surface space-y-3 p-5">
            <h2 className="font-display text-lg font-semibold text-brand-dark">À méditer</h2>
            <p className="text-sm leading-relaxed text-muted">
              « Que la parole de Christ habite parmi vous abondamment » (Colossiens 3.16). Prenez un moment cette
              semaine pour relire le passage et prier.
            </p>
            <Link to="/priere">
              <Button variant="ghost">Demander la prière</Button>
            </Link>
          </div>
        </aside>
      </section>

      {related.length > 0 ? (
        <section className="container-page pb-16">
          <h2 className="mb-6 font-display text-2xl font-semibold text-brand-dark">Dans la même série</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <SermonCard key={item.id} sermon={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
