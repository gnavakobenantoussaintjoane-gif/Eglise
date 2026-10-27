import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Palette, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { ChurchSettings, ServiceTime } from '../../types';
import { Button, Card, Input, SectionHeading, Textarea } from '../../components/ui';
import { AdminHeading } from '../../components/admin/AdminKit';
import { cn } from '../../utils/cn';

interface SettingsFormState {
  churchName: string;
  slogan: string;
  tagline: string;
  about: string;
  vision: string;
  mission: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  whatsapp: string;
  email: string;
  facebook: string;
  instagram: string;
  youtube: string;
  serviceTimes: ServiceTime[];
  colorPrimary: string;
  colorRoyal: string;
  colorAccent: string;
}

function fromSettings(settings: ChurchSettings): SettingsFormState {
  return {
    churchName: settings.churchName,
    slogan: settings.slogan,
    tagline: settings.tagline ?? '',
    about: settings.about ?? '',
    vision: settings.vision ?? '',
    mission: settings.mission ?? '',
    address: settings.address ?? '',
    city: settings.city ?? '',
    country: settings.country ?? '',
    phone: settings.phone ?? '',
    whatsapp: settings.whatsapp ?? '',
    email: settings.email ?? '',
    facebook: settings.socialLinks.facebook ?? '',
    instagram: settings.socialLinks.instagram ?? '',
    youtube: settings.socialLinks.youtube ?? '',
    serviceTimes: settings.serviceTimes ?? [],
    colorPrimary: settings.colors.primary,
    colorRoyal: settings.colors.royal,
    colorAccent: settings.colors.accent,
  };
}

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsFormState | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: ({ signal }) => api.get<ChurchSettings>('/admin/settings', undefined, signal),
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(fromSettings(settingsQuery.data));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (values: SettingsFormState) => {
      const socialLinks = Object.fromEntries(
        Object.entries({
          facebook: values.facebook,
          instagram: values.instagram,
          youtube: values.youtube,
        }).filter(([, value]) => value.trim().length > 0),
      );
      return api.patch<ChurchSettings>('/admin/settings', {
        churchName: values.churchName,
        slogan: values.slogan,
        tagline: values.tagline || null,
        about: values.about || null,
        vision: values.vision || null,
        mission: values.mission || null,
        address: values.address || null,
        city: values.city || null,
        country: values.country || null,
        phone: values.phone || null,
        whatsapp: values.whatsapp || null,
        email: values.email || null,
        socialLinks,
        serviceTimes: values.serviceTimes.filter((time) => (time.label ?? '').trim() && (time.time ?? '').trim()),
        colorPrimary: values.colorPrimary,
        colorRoyal: values.colorRoyal,
        colorAccent: values.colorAccent,
      });
    },
    onSuccess: () => {
      toast.success('Paramètres enregistrés.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const brandingMutation = useMutation({
    mutationFn: async ({ kind, file }: { kind: 'logo' | 'hero'; file: File }) => {
      const data = new FormData();
      data.append('image', file);
      return api.upload<ChurchSettings>(`/admin/settings/${kind}`, data);
    },
    onSuccess: () => {
      toast.success('Image mise à jour.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Téléversement impossible.'),
  });

  if (settingsQuery.isLoading || !form) {
    return (
      <>
        <AdminHeading title="Paramètres" description="Identité, coordonnées et apparence du site." />
        <p className="text-sm text-muted">Chargement…</p>
      </>
    );
  }

  const settings = settingsQuery.data;
  const update = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <>
      <AdminHeading
        title="Paramètres de l’église"
        description="Ces informations alimentent l’en-tête, le pied de page et la page « À propos »."
        actions={
          <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
            <Save className="h-4 w-4" aria-hidden="true" /> Enregistrer
          </Button>
        }
      />

      <div className="space-y-6">
        <Card className="space-y-4 p-5">
          <SectionHeading title="Identité" description="Nom, slogan et présentation de l’église." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nom de l’église" required value={form.churchName} onChange={(event) => update('churchName', event.target.value)} />
            <Input label="Slogan" required value={form.slogan} onChange={(event) => update('slogan', event.target.value)} />
          </div>
          <Input label="Accroche" value={form.tagline} onChange={(event) => update('tagline', event.target.value)} />
          <Textarea label="À propos" rows={4} value={form.about} onChange={(event) => update('about', event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Textarea label="Vision" rows={3} value={form.vision} onChange={(event) => update('vision', event.target.value)} />
            <Textarea label="Mission" rows={3} value={form.mission} onChange={(event) => update('mission', event.target.value)} />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeading title="Coordonnées" description="Affichées sur la page contact." />
          <Input label="Adresse" value={form.address} onChange={(event) => update('address', event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Ville" value={form.city} onChange={(event) => update('city', event.target.value)} />
            <Input label="Pays" value={form.country} onChange={(event) => update('country', event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Téléphone" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            <Input label="WhatsApp" value={form.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} />
            <Input label="E-mail" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Facebook" placeholder="https://…" value={form.facebook} onChange={(event) => update('facebook', event.target.value)} />
            <Input label="Instagram" placeholder="https://…" value={form.instagram} onChange={(event) => update('instagram', event.target.value)} />
            <Input label="YouTube" placeholder="https://…" value={form.youtube} onChange={(event) => update('youtube', event.target.value)} />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeading
            title="Horaires des cultes"
            description="Ajoutez les rendez-vous hebdomadaires affichés sur le site."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update('serviceTimes', [
                    ...form.serviceTimes,
                    { label: '', day: 'Dimanche', time: '' },
                  ])
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter
              </Button>
            }
          />
          {form.serviceTimes.length === 0 ? (
            <p className="text-sm text-muted">Aucun horaire renseigné.</p>
          ) : (
            <ul className="space-y-2">
              {form.serviceTimes.map((service, index) => (
                <li key={index} className="flex flex-wrap items-end gap-2">
                  <Input
                    label={index === 0 ? 'Intitulé' : undefined}
                    aria-label="Intitulé du culte"
                    value={service.label}
                    onChange={(event) => {
                      const next = [...form.serviceTimes];
                      next[index] = { ...service, label: event.target.value };
                      update('serviceTimes', next);
                    }}
                    containerClassName="min-w-[12rem] flex-1"
                  />
                  <Input
                    label={index === 0 ? 'Jour' : undefined}
                    aria-label="Jour"
                    value={service.day ?? ''}
                    onChange={(event) => {
                      const next = [...form.serviceTimes];
                      next[index] = { ...service, day: event.target.value };
                      update('serviceTimes', next);
                    }}
                    containerClassName="w-32"
                  />
                  <Input
                    label={index === 0 ? 'Heure' : undefined}
                    aria-label="Heure"
                    value={service.time}
                    onChange={(event) => {
                      const next = [...form.serviceTimes];
                      next[index] = { ...service, time: event.target.value };
                      update('serviceTimes', next);
                    }}
                    containerClassName="w-28"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Supprimer cet horaire"
                    onClick={() => update('serviceTimes', form.serviceTimes.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeading title="Apparence" description="Couleurs de la charte et visuels du site." />
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['colorPrimary', 'Couleur principale'],
                ['colorRoyal', 'Couleur secondaire'],
                ['colorAccent', 'Couleur d’accent'],
              ] as [keyof SettingsFormState, string][]
            ).map(([key, label]) => (
              <label key={key} className="space-y-1.5 text-sm font-medium text-ink">
                <span className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-muted" aria-hidden="true" /> {label}
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    value={String(form[key])}
                    onChange={(event) => update(key, event.target.value as SettingsFormState[typeof key])}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white"
                    aria-label={label}
                  />
                  <span className="font-mono text-xs text-muted">{String(form[key])}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="block text-sm font-medium text-ink">Logo</span>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-line bg-lavender',
                    !settings?.logoUrl && 'text-muted',
                  )}
                >
                  {settings?.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo actuel" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                  Remplacer
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-medium text-ink">Image d’accueil</span>
              <div className="flex items-center gap-3">
                <div className="h-16 w-24 overflow-hidden rounded-xl border border-line bg-lavender">
                  {settings?.heroUrl ? (
                    <img src={settings.heroUrl} alt="Visuel d’accueil actuel" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => heroInputRef.current?.click()}>
                  Remplacer
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) brandingMutation.mutate({ kind: 'logo', file });
          event.target.value = '';
        }}
      />
      <input
        ref={heroInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) brandingMutation.mutate({ kind: 'hero', file });
          event.target.value = '';
        }}
      />
    </>
  );
}
