import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { Department, Profile } from '../../types';
import { Avatar, Button, Checkbox, Input, Select, Textarea } from '../ui';

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Prénom requis.').max(80),
  lastName: z.string().trim().min(2, 'Nom requis.').max(80),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  profession: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(1500, 'Présentation trop longue (1500 caractères).').optional(),
  departmentInterestId: z.string().optional(),
  consentPhotos: z.boolean(),
  // Case « recevoir les informations » : cochee par defaut, decochee = refus.
  receiveEmails: z.boolean(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileForm({
  profile,
  departments,
  onSubmit,
  submitting,
  onAvatarUpload,
  uploadingAvatar,
  disabled,
}: {
  profile: Profile;
  departments: Department[];
  onSubmit: (values: ProfileFormValues) => void;
  submitting?: boolean;
  onAvatarUpload?: (file: File) => void;
  uploadingAvatar?: boolean;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      city: profile.city ?? '',
      profession: profile.profession ?? '',
      bio: profile.bio ?? '',
      departmentInterestId: profile.departmentInterestId ?? '',
      consentPhotos: Boolean(profile.consentPhotos),
      receiveEmails: !profile.emailOptOut,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          firstName={profile.firstName}
          lastName={profile.lastName}
          src={profile.photoUrl}
          size="xl"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-brand-dark">Photo de profil</p>
          <p className="text-xs text-muted">JPG, PNG ou WebP — 5 Mo maximum.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && onAvatarUpload) onAvatarUpload(file);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={uploadingAvatar}
            disabled={!onAvatarUpload}
            onClick={() => fileRef.current?.click()}
            icon={<Upload className="h-4 w-4" aria-hidden="true" />}
          >
            Changer la photo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Prénom" required error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Nom" required error={errors.lastName?.message} {...register('lastName')} />
        <Input label="Téléphone" hint="Requis pour envoyer votre demande." error={errors.phone?.message} {...register('phone')} />
        <Input label="Ville / commune" hint="Requis pour envoyer votre demande." error={errors.city?.message} {...register('city')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Profession" error={errors.profession?.message} {...register('profession')} />
        <Select
          label="Département qui vous intéresse"
          placeholder="Aucun pour l’instant"
          options={departments.map((department) => ({ value: department.id, label: department.name }))}
          error={errors.departmentInterestId?.message}
          {...register('departmentInterestId')}
        />
      </div>

      <Textarea
        label="Présentation"
        rows={4}
        hint="Quelques mots sur votre parcours, visibles uniquement par les responsables."
        error={errors.bio?.message}
        {...register('bio')}
      />

      <Checkbox
        label="J’autorise l’église à utiliser mon image sur le site"
        description="Vous pouvez retirer ce consentement à tout moment."
        {...register('consentPhotos')}
      />

      <Checkbox
        label="Je souhaite recevoir les informations de l’église par e-mail"
        description="Annonces, événements et nouvelles de la communauté. Les messages indispensables à votre compte (réinitialisation du mot de passe, décision d’adhésion) vous seront envoyés dans tous les cas."
        {...register('receiveEmails')}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={disabled} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
          Enregistrer mon profil
        </Button>
      </div>
    </form>
  );
}
