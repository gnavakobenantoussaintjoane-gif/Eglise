import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquareQuote, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, LoadingBlock, Textarea } from '../../components/ui';
import { formatDate } from '../../utils/format';

const schema = z.object({
  title: z.string().trim().min(3, 'Un titre est requis.').max(160),
  body: z.string().trim().min(20, 'Merci de détailler votre témoignage (20 caractères minimum).').max(6000),
  isPublic: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface MyTestimony {
  id: string;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  isPublic: boolean;
  createdAt: string;
}

export function MemberTestimoniesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const testimoniesQuery = useQuery({
    queryKey: ['members', 'testimonies', 'mine'],
    queryFn: ({ signal }) => api.get<{ testimonies: MyTestimony[] }>('/members/testimonies/mine', undefined, signal),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isPublic: true },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('/members/testimonies', {
        title: values.title,
        body: values.body,
        isPublic: values.isPublic,
      }),
    onSuccess: () => {
      toast.success('Merci ! Votre témoignage sera publié après modération.');
      setShowForm(false);
      reset({ title: '', body: '', isPublic: true });
      void queryClient.invalidateQueries({ queryKey: ['members', 'testimonies'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Envoi impossible.'),
  });

  if (testimoniesQuery.isLoading) return <LoadingBlock label="Chargement de vos témoignages…" />;

  const testimonies = testimoniesQuery.data?.testimonies ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-brand-dark">Mes témoignages</h1>
          <p className="text-sm text-muted">Racontez ce que Dieu a fait : chaque témoignage est relu avant publication.</p>
        </div>
        <Button onClick={() => setShowForm((value) => !value)} icon={<MessageSquareQuote className="h-4 w-4" aria-hidden="true" />}>
          {showForm ? 'Masquer le formulaire' : 'Écrire un témoignage'}
        </Button>
      </header>

      {showForm ? (
        <Card className="space-y-4">
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
            <Input label="Titre" required error={errors.title?.message} {...register('title')} />
            <Textarea
              label="Votre témoignage"
              required
              rows={6}
              error={errors.body?.message}
              {...register('body')}
            />
            <Checkbox label="J’autorise la publication sur le site" {...register('isPublic')} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={mutation.isPending} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
                Envoyer
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {testimonies.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="h-5 w-5" aria-hidden="true" />}
          title="Aucun témoignage"
          description="Partagez votre première histoire pour encourager la communauté."
        />
      ) : (
        <ul className="space-y-4">
          {testimonies.map((testimony) => (
            <li key={testimony.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-brand-dark">{testimony.title}</h2>
                  <Badge
                    tone={
                      testimony.status === 'approved' ? 'success' : testimony.status === 'rejected' ? 'danger' : 'warning'
                    }
                  >
                    {testimony.status === 'approved'
                      ? 'Publié'
                      : testimony.status === 'rejected'
                        ? 'Refusé'
                        : 'En attente de validation'}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{testimony.body}</p>
                <p className="text-xs text-muted">
                  Envoyé le {formatDate(testimony.createdAt)} · {testimony.isPublic ? 'Public' : 'Privé'}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Alert tone="info">
        Vous pouvez demander la modification ou le retrait d’un témoignage déjà publié en contactant un responsable.
      </Alert>
    </div>
  );
}
