import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Mail,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type {
  BroadcastResult,
  Department,
  EmailCampaign,
  MailStatus,
} from '../../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingBlock,
  Select,
  Textarea,
} from '../../components/ui';
import { AdminHeading, StatCard, TableShell } from '../../components/admin/AdminKit';
import { formatDateTime } from '../../utils/format';

/** Libellés d'audience : ce que voit l'administrateur, en français. */
const AUDIENCE_OPTIONS = [
  { value: 'approved', label: 'Tous les membres approuvés' },
  { value: 'role', label: 'Membres ayant un rôle précis' },
  { value: 'department', label: 'Membres d’un département' },
];

const ROLE_OPTIONS = [
  { value: 'member', label: 'Membres' },
  { value: 'department_leader', label: 'Responsables de département' },
  { value: 'media', label: 'Équipe média' },
  { value: 'admin', label: 'Administrateurs' },
];

interface FormState {
  subject: string;
  body: string;
  audience: 'approved' | 'all_members' | 'role' | 'department';
  role: string;
  departmentId: string;
  includeOptOut: boolean;
  sendNow: boolean;
}

const EMPTY_FORM: FormState = {
  subject: '',
  body: '',
  audience: 'approved',
  role: 'member',
  departmentId: '',
  includeOptOut: false,
  sendNow: true,
};

/**
 * Messagerie : envoi d'un message d'information à plusieurs membres et suivi
 * des envois. Les destinataires sont toujours calculés par le serveur à partir
 * de l'audience choisie : l'interface n'envoie jamais de liste d'adresses.
 */
export function AdminEmailsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');

  const statusQuery = useQuery({
    queryKey: ['admin', 'emails', 'status'],
    queryFn: ({ signal }) => api.get<MailStatus>('/admin/emails/status', undefined, signal),
  });

  const campaignsQuery = useQuery({
    queryKey: ['admin', 'emails', 'campaigns'],
    queryFn: ({ signal }) =>
      api.get<{ campaigns: EmailCampaign[] }>('/admin/emails/campaigns', undefined, signal),
  });

  const departmentsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: ({ signal }) =>
      api.get<{ departments: Department[] }>('/admin/departments', undefined, signal),
  });

  const config = statusQuery.data?.config;
  const outbox = statusQuery.data?.outbox;

  /** Estimation du nombre de destinataires, affichée avant l'envoi. */
  const audienceHint = useMemo(() => {
    if (form.audience === 'role') {
      return `Envoi aux ${ROLE_OPTIONS.find((option) => option.value === form.role)?.label.toLowerCase() ?? 'membres'} approuvés.`;
    }
    if (form.audience === 'department') {
      const department = departmentsQuery.data?.departments.find(
        (entry) => entry.id === form.departmentId,
      );
      return department
        ? `Envoi aux membres actifs du département « ${department.name} ».`
        : 'Choisissez un département.';
    }
    return 'Envoi à tous les membres dont l’inscription est approuvée.';
  }, [form.audience, form.role, form.departmentId, departmentsQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'emails'] });
  };

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<{ subject: string; html: string }>('/admin/emails/preview', {
        subject: form.subject,
        body: form.body,
      }),
    onSuccess: (data) => setPreviewHtml(data.html),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Aperçu impossible.'),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post<BroadcastResult>('/admin/emails/broadcast', {
        subject: form.subject,
        body: form.body,
        audience: form.audience,
        role: form.audience === 'role' ? form.role : undefined,
        departmentId: form.audience === 'department' ? form.departmentId : undefined,
        includeOptOut: form.includeOptOut,
        sendNow: form.sendNow,
      }),
    onSuccess: (result) => {
      setConfirmOpen(false);
      setForm(EMPTY_FORM);
      setPreviewHtml(null);
      toast.success(
        `${result.sent} message(s) envoyé(s) sur ${result.recipients} destinataire(s).` +
          (result.failed > 0 ? ` ${result.failed} en attente de nouvelle tentative.` : ''),
      );
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible.'),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/admin/emails/test', { email: testEmail }),
    onSuccess: () => toast.success('Message de test envoyé. Vérifiez la boîte de réception.'),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Envoi du test impossible.'),
  });

  const flushMutation = useMutation({
    mutationFn: () =>
      api.post<{ attempted: number; sent: number; failed: number }>('/admin/emails/flush'),
    onSuccess: (report) => {
      if (report.attempted === 0) toast.info('Aucun message en attente.');
      else toast.success(`${report.sent} envoyé(s), ${report.failed} en échec.`);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Traitement impossible.'),
  });

  const canSubmit = form.subject.trim().length >= 3 && form.body.trim().length >= 10;

  if (statusQuery.isLoading) return <LoadingBlock label="Chargement de la messagerie…" />;

  return (
    <>
      <AdminHeading
        title="Messagerie"
        description="Envoyez une information aux membres : annonce, rappel d’événement, nouvelle de la communauté. Les messages partent par le fournisseur configuré, et chaque envoi est conservé dans l’historique."
      />

      {config?.warning ? (
        <Alert tone="warning" title="Envoi réel désactivé" className="mb-5" role="alert">
          {config.warning}
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Messages envoyés"
          value={outbox?.sent ?? 0}
          hint="Depuis la mise en service"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="En attente"
          value={outbox?.pending ?? 0}
          hint="Seront envoyés automatiquement"
          tone="warning"
          icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="En échec"
          value={outbox?.failed ?? 0}
          hint="Nouvelles tentatives épuisées"
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Méthode d’envoi"
          value={
            config?.driver === 'smtp'
              ? 'SMTP'
              : config?.driver === 'log'
                ? 'Journal'
                : config?.driver === 'off'
                  ? 'Désactivé'
                  : 'Test'
          }
          hint={config?.fromAddress ?? '—'}
          tone="info"
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
        />
      </div>

      {outbox?.lastError ? (
        <Alert tone="danger" className="mb-5" title="Dernière erreur d’envoi">
          {outbox.lastError}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Nouveau message</h2>

          <Input
            label="Objet"
            placeholder="Culte spécial dimanche 8h"
            value={form.subject}
            maxLength={160}
            onChange={(event) => setForm((state) => ({ ...state, subject: event.target.value }))}
          />

          <Textarea
            label="Message"
            rows={8}
            placeholder="Écrivez votre message. Laissez une ligne vide entre deux paragraphes."
            value={form.body}
            maxLength={8000}
            onChange={(event) => setForm((state) => ({ ...state, body: event.target.value }))}
            hint={`${form.body.length} / 8000 caractères`}
          />

          <Select
            label="Destinataires"
            options={AUDIENCE_OPTIONS}
            value={form.audience}
            onChange={(event) =>
              setForm((state) => ({
                ...state,
                audience: event.target.value as FormState['audience'],
              }))
            }
            hint={audienceHint}
          />

          {form.audience === 'role' ? (
            <Select
              label="Rôle concerné"
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(event) => setForm((state) => ({ ...state, role: event.target.value }))}
            />
          ) : null}

          {form.audience === 'department' ? (
            <Select
              label="Département concerné"
              placeholder="Choisir un département"
              options={(departmentsQuery.data?.departments ?? [])
                .filter((department) => department.isActive !== false)
                .map((department) => ({ value: department.id, label: department.name }))}
              value={form.departmentId}
              onChange={(event) =>
                setForm((state) => ({ ...state, departmentId: event.target.value }))
              }
            />
          ) : null}

          <Checkbox
            label="Inclure les membres qui ont refusé les messages d’information"
            description="À utiliser uniquement pour une information indispensable : le refus d’un membre doit sinon être respecté."
            checked={form.includeOptOut}
            onChange={(event) =>
              setForm((state) => ({ ...state, includeOptOut: event.target.checked }))
            }
          />

          <Checkbox
            label="Envoyer immédiatement"
            description="Si cette option est décochée, les messages sont mis en file et partent au prochain traitement automatique."
            checked={form.sendNow}
            onChange={(event) => setForm((state) => ({ ...state, sendNow: event.target.checked }))}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => previewMutation.mutate()}
              loading={previewMutation.isPending}
              disabled={!canSubmit}
            >
              Aperçu
            </Button>
            <Button
              disabled={!canSubmit || (form.audience === 'department' && !form.departmentId)}
              onClick={() => setConfirmOpen(true)}
              icon={<Send className="h-4 w-4" aria-hidden="true" />}
            >
              Envoyer
            </Button>
          </div>

          {previewHtml ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Aperçu du message</p>
              <iframe
                title="Aperçu de l’e-mail"
                className="h-96 w-full rounded-xl border border-line bg-white"
                sandbox=""
                srcDoc={previewHtml}
              />
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Vérifier la configuration</h2>
            <p className="text-sm text-muted">
              Envoyez un message de contrôle à votre adresse pour confirmer que le fournisseur
              fonctionne. Aucun message n’est conservé dans l’historique.
            </p>
            <Input
              label="Adresse de test"
              type="email"
              placeholder="pasteur@exemple.org"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <Button
              variant="outline"
              loading={testMutation.isPending}
              disabled={!testEmail.includes('@') || !config?.configured}
              onClick={() => testMutation.mutate()}
            >
              Envoyer le test
            </Button>
            {!config?.configured ? (
              <p className="text-xs text-muted">
                Aucun fournisseur n’est configuré : renseignez les variables <code>MAIL_*</code> et{' '}
                <code>SMTP_*</code> puis redémarrez le service.
              </p>
            ) : null}

            <div className="border-t border-line pt-3">
              <Button
                variant="ghost"
                size="sm"
                loading={flushMutation.isPending}
                onClick={() => flushMutation.mutate()}
                icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              >
                Traiter la file maintenant
              </Button>
              <p className="mt-1 text-xs text-muted">
                Relance les messages en attente et les échecs temporaires.
              </p>
            </div>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-display text-lg font-semibold">Bon à savoir</h2>
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                Les destinataires sont calculés par le serveur : votre sélection ne contient jamais
                d’adresses saisies à la main.
              </li>
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                Les messages de compte (réinitialisation du mot de passe, décision d’adhésion)
                partent toujours, même si un membre a refusé les informations.
              </li>
              <li className="flex gap-2">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                Un envoi qui échoue est retenté automatiquement, puis signalé en échec.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-semibold">Historique des messages</h2>
        {campaignsQuery.isLoading ? (
          <LoadingBlock label="Chargement de l’historique…" />
        ) : (campaignsQuery.data?.campaigns ?? []).length === 0 ? (
          <EmptyState
            title="Aucun message envoyé"
            description="Votre premier message d’information apparaîtra ici avec le détail des envois."
          />
        ) : (
          <TableShell columns={['Objet', 'Audience', 'Envois', 'Date']}>
            {(campaignsQuery.data?.campaigns ?? []).map((campaign) => (
              <tr key={campaign.id} className="border-t border-line">
                <td className="px-4 py-3 text-sm text-ink">{campaign.subject}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {AUDIENCE_OPTIONS.find((option) => option.value === campaign.audience)?.label ??
                    campaign.audience}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="success">{campaign.sent} envoyé(s)</Badge>
                    {campaign.pending > 0 ? <Badge tone="warning">{campaign.pending} en attente</Badge> : null}
                    {campaign.failed > 0 ? <Badge tone="danger">{campaign.failed} en échec</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {formatDateTime(campaign.createdAt)}
                  {campaign.createdByName ? ` · ${campaign.createdByName}` : ''}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Envoyer ce message ?"
        description={`${audienceHint} Un e-mail ne peut pas être annulé après l’envoi.`}
        confirmLabel="Envoyer maintenant"
        loading={sendMutation.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => sendMutation.mutate()}
      />
    </>
  );
}
