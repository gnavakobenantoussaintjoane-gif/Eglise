import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareQuote, Quote, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Testimony } from '../../types';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '../../components/ui';
import { TestimonyCard } from '../../components/public/Cards';

const testimonySchema = z.object({
  title: z.string().trim().min(3, 'Un titre est requis.').max(160),
  body: z.string().trim().min(20, 'Merci de détailler votre témoignage (20 caractères minimum).').max(6000),
  authorName: z.string().trim().max(120).optional(),
  isPublic: z.boolean(),
});

type TestimonyForm = z.infer<typeof testimonySchema>;

export function TestimoniesPage() {
  const { isAuthenticated, isApproved } = useAuth();
  const queryClient = useQueryClient();
  const [sent, setSent] = useState(false);

  const testimoniesQuery = useQuery({
    queryKey: ['public', 'testimonies'],
    queryFn: ({ signal }) => api.get<{ testimonies: Testimony[] }>('/public/testimonies', undefined, signal),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TestimonyForm>({
    resolver: zodResolver(testimonySchema),
    defaultValues: { isPublic: true, authorName: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: TestimonyForm) =>
      api.post('/members/testimonies', {
        title: values.title,
        body: values.body,
        authorName: values.authorName || undefined,
        isPublic: values.isPublic,
      }),
    onSuccess: () => {
      toast.success('Merci ! Votre témoignage sera publié après modération.');
      setSent(true);
      reset({ title: '', body: '', authorName: '', isPublic: true });
      void queryClient.invalidateQueries({ queryKey: ['public', 'testimonies'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible, réessayez.'),
  });

  const testimonies = testimoniesQuery.data?.testimonies ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Témoignages"
        title="Ce que Dieu fait"
        description="Des histoires vraies, partagées pour encourager et fortifier la foi. Chaque témoignage est relu avant publication."
      />

      <section className="container-page grid gap-8 py-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {testimoniesQuery.isLoading ? (
            <LoadingBlock label="Chargement des témoignages…" />
          ) : testimonies.length === 0 ? (
            <EmptyState
              icon={<Quote className="h-5 w-5" aria-hidden="true" />}
              title="Aucun témoignage publié"
              description="Les premiers témoignages apparaîtront bientôt ici."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {testimonies.map((testimony) => (
                <TestimonyCard key={testimony.id} testimony={testimony} />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {!isAuthenticated ? (
            <Card className="space-y-3">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Partager un témoignage</h2>
              <p className="text-sm text-muted">
                Les témoignages sont réservés aux membres connectés, afin de vérifier les informations avant
                publication.
              </p>
              <Link to="/connexion?redirect=%2Ftemoignages">
                <Button block>Se connecter</Button>
              </Link>
              <Link to="/inscription" className="block text-center text-sm text-brand hover:text-brand-royal">
                Créer un compte
              </Link>
            </Card>
          ) : !isApproved ? (
            <Alert tone="warning" title="Adhésion en attente">
              Votre compte doit être approuvé pour publier un témoignage.{' '}
              <Link to="/mon-inscription" className="font-semibold underline">
                Voir mon inscription
              </Link>
            </Alert>
          ) : sent ? (
            <Card className="space-y-3 text-center">
              <MessageSquareQuote className="mx-auto h-9 w-9 text-brand-royal" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-brand-dark">Merci pour votre témoignage</h2>
              <p className="text-sm text-muted">
                Il sera publié dès qu’un responsable l’aura validé. Vous pouvez suivre son statut depuis votre
                espace membre.
              </p>
              <Button variant="outline" onClick={() => setSent(false)}>
                Écrire un autre témoignage
              </Button>
              <Link to="/espace-membre/temoignages" className="block text-sm text-brand hover:text-brand-royal">
                Voir mes témoignages
              </Link>
            </Card>
          ) : (
            <Card className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Partager un témoignage</h2>
              <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
                <Input label="Titre" required error={errors.title?.message} {...register('title')} />
                <Textarea
                  label="Votre témoignage"
                  required
                  rows={6}
                  placeholder="Racontez ce que Dieu a fait dans votre vie…"
                  error={errors.body?.message}
                  {...register('body')}
                />
                <Input
                  label="Nom affiché (facultatif)"
                  hint="Par défaut, votre prénom et nom de profil seront utilisés."
                  error={errors.authorName?.message}
                  {...register('authorName')}
                />
                <Checkbox
                  label="J’autorise la publication de mon témoignage sur le site"
                  {...register('isPublic')}
                />
                <Button
                  type="submit"
                  block
                  loading={mutation.isPending}
                  icon={<Send className="h-4 w-4" aria-hidden="true" />}
                >
                  Envoyer mon témoignage
                </Button>
              </form>
            </Card>
          )}

          <Card className="space-y-2 bg-lavender/60">
            <h2 className="font-display text-base font-semibold text-brand-dark">Modération bienveillante</h2>
            <p className="text-sm leading-relaxed text-muted">
              Un responsable vérifie chaque témoignage (respect des personnes, cohérence). Vous pouvez demander la
              modification ou le retrait de votre texte à tout moment.
            </p>
          </Card>
        </aside>
      </section>
    </>
  );
}
