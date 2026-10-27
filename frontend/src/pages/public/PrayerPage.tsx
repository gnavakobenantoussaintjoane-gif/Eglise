import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, HandHeart, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import {
  Button,
  Card,
  Checkbox,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui';

const prayerSchema = z.object({
  fullName: z.string().trim().min(2, 'Votre nom est requis.').max(160),
  email: z.string().trim().email('Adresse e-mail invalide.').or(z.literal('')).optional(),
  phone: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  message: z
    .string()
    .trim()
    .min(10, 'Merci de préciser votre sujet (10 caractères minimum).')
    .max(4000, 'Message trop long (4000 caractères maximum).'),
  isAnonymous: z.boolean(),
});

type PrayerForm = z.infer<typeof prayerSchema>;

const CATEGORIES = [
  { value: 'Sante', label: 'Santé' },
  { value: 'Famille', label: 'Famille' },
  { value: 'Travail', label: 'Travail / études' },
  { value: 'Delivrance', label: 'Délivrance' },
  { value: 'Action de grace', label: 'Action de grâce' },
  { value: 'Autre', label: 'Autre' },
];

export function PrayerPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrayerForm>({
    resolver: zodResolver(prayerSchema),
    defaultValues: { isAnonymous: false, category: undefined, email: '', phone: '' },
  });

  const isAnonymous = watch('isAnonymous');

  const onSubmit = async (values: PrayerForm) => {
    try {
      await api.post('/public/prayer-requests', {
        fullName: values.fullName,
        email: values.email || undefined,
        phone: values.phone || undefined,
        category: values.category || undefined,
        message: values.message,
        isAnonymous: values.isAnonymous,
      });
      setSubmitted(true);
      reset();
      toast.success('Votre demande a été transmise à l’équipe de prière.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible, réessayez.');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Prière"
        title="Demander la prière"
        description="Notre équipe d’intercession prie chaque semaine pour les intentions reçues. Aucune demande n’est publiée."
      />

      <section className="container-page grid gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="surface space-y-4 p-6 sm:p-8">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-brand-dark">
              <HandHeart className="h-5 w-5 text-brand-royal" aria-hidden="true" /> Votre sujet de prière
            </h2>

            {submitted ? (
              <div className="space-y-4 rounded-2xl bg-emerald-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
                <p className="font-display text-lg font-semibold text-brand-dark">Demande transmise</p>
                <p className="text-sm text-muted">
                  Merci de votre confiance. Une équipe prie pour vous cette semaine.
                </p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Envoyer une autre demande
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <Input
                  label="Nom complet"
                  required
                  autoComplete="name"
                  error={errors.fullName?.message}
                  {...register('fullName')}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="E-mail (facultatif)"
                    type="email"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register('email')}
                  />
                  <Input
                    label="Téléphone (facultatif)"
                    autoComplete="tel"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />
                </div>
                <Select
                  label="Sujet"
                  placeholder="Choisir un sujet (facultatif)"
                  options={CATEGORIES}
                  error={errors.category?.message}
                  {...register('category')}
                />
                <Textarea
                  label="Votre demande"
                  required
                  rows={6}
                  placeholder="Écrivez librement ce que vous portez devant Dieu…"
                  error={errors.message?.message}
                  {...register('message')}
                />
                <Checkbox
                  label="Garder ma demande confidentielle"
                  description="Le nom et les coordonnées ne seront pas transmis à l’équipe de prière."
                  {...register('isAnonymous')}
                />
                {isAnonymous ? (
                  <p className="rounded-xl bg-lavender px-3 py-2 text-xs text-brand">
                    Votre nom reste nécessaire pour vous identifier en interne, mais votre demande sera traitée de
                    manière anonyme.
                  </p>
                ) : null}
                <Button type="submit" block loading={isSubmitting} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
                  Envoyer ma demande
                </Button>
              </form>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <Card className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Comment ça marche ?</h2>
            <ol className="space-y-3 text-sm text-muted">
              {[
                'Vous remplissez le formulaire, de manière nominative ou anonyme.',
                'La demande est transmise aux responsables de prière.',
                'Une équipe intercède pour vous chaque semaine.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lavender text-xs font-semibold text-brand">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>

          <Card className="space-y-2 bg-lavender/60">
            <Lock className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-brand-dark">Confidentialité</h2>
            <p className="text-sm leading-relaxed text-muted">
              Les demandes de prière ne sont jamais publiées sur le site. Seuls les responsables habilités y ont
              accès, dans le respect du secret pastoral.
            </p>
          </Card>
        </aside>
      </section>
    </>
  );
}
