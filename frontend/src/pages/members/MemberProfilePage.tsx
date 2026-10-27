import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Department, Session } from '../../types';
import { Button, Card, Input } from '../../components/ui';
import { ProfileForm, type ProfileFormValues } from '../../components/members/ProfileForm';
import { MEMBER_STATUS_LABEL, ROLE_LABEL } from '../../utils/format';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
    newPassword: z
      .string()
      .min(10, 'Au moins 10 caractères.')
      .regex(/[A-Za-z]/, 'Au moins une lettre.')
      .regex(/[0-9]/, 'Au moins un chiffre.'),
    confirmPassword: z.string().min(1, 'Confirmez le nouveau mot de passe.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function MemberProfilePage() {
  const { profile, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const departmentsQuery = useQuery({
    queryKey: ['public', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/public/departments', undefined, signal),
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      api.patch<Session>('/auth/profile', {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || null,
        city: values.city || null,
        profession: values.profession || null,
        bio: values.bio || null,
        departmentInterestId: values.departmentInterestId || null,
        consentPhotos: values.consentPhotos,
        emailOptOut: !values.receiveEmails,
      }),
    onSuccess: async () => {
      toast.success('Profil mis à jour.');
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ['members', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });
  const passwordMutation = useMutation({
    mutationFn: (values: PasswordForm) =>
      api.patch('/auth/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success('Mot de passe modifié.');
      passwordForm.reset();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Modification impossible.'),
  });

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-dark">Mon profil</h1>
        <p className="text-sm text-muted">
          {profile.status ? MEMBER_STATUS_LABEL[profile.status] : ''} ·{' '}
          {profile.role ? ROLE_LABEL[profile.role] : 'Membre'}
        </p>
      </header>

      <Card>
        <ProfileForm
          profile={profile}
          departments={departmentsQuery.data?.departments ?? []}
          submitting={saveMutation.isPending}
          uploadingAvatar={uploading}
          onAvatarUpload={async (file) => {
            setUploading(true);
            try {
              const data = new FormData();
              data.append('avatar', file);
              await api.upload('/auth/avatar', data);
              await refresh();
              toast.success('Photo mise à jour.');
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.');
            } finally {
              setUploading(false);
            }
          }}
          onSubmit={(values) => saveMutation.mutate(values)}
        />
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-royal" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-brand-dark">Sécurité</h2>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
          noValidate
        >
          <Input
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            error={passwordForm.formState.errors.currentPassword?.message}
            {...passwordForm.register('currentPassword')}
          />
          <Input
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            error={passwordForm.formState.errors.newPassword?.message}
            {...passwordForm.register('newPassword')}
          />
          <Input
            label="Confirmer"
            type="password"
            autoComplete="new-password"
            error={passwordForm.formState.errors.confirmPassword?.message}
            {...passwordForm.register('confirmPassword')}
          />
          <div className="sm:col-span-3">
            <Button type="submit" loading={passwordMutation.isPending}>
              Changer mon mot de passe
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
