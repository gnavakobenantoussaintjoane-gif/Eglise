import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { MemberRestriction, RestrictionCode } from '../../types';
import { Alert, Badge, Button, Checkbox, Textarea } from '../ui';

/**
 * Panneau « Restrictions » de la fiche membre.
 *
 * Une restriction retire UNE possibilité précise à un membre approuvé, sans le
 * suspendre : il garde l'accès à son espace, mais ne peut plus, par exemple,
 * publier un témoignage. Le catalogue des restrictions vient du serveur pour
 * qu'il n'existe qu'une seule liste de référence.
 */
interface CatalogEntry {
  code: RestrictionCode;
  label: string;
  description: string;
}

export function MemberRestrictions({
  profileId,
  restrictions,
  disabled,
  onSaved,
}: {
  profileId: string;
  /** Restrictions déjà connues, issues de la fiche membre. */
  restrictions: { code: RestrictionCode; reason: string | null; createdAt: string }[];
  /** Vrai quand le membre n'est pas approuvé ou qu'il est administrateur. */
  disabled?: boolean;
  onSaved?: (entries: MemberRestriction[]) => void;
}) {
  const queryClient = useQueryClient();
  const catalogueQuery = useQuery({
    queryKey: ['admin', 'restrictions', 'catalog'],
    queryFn: ({ signal }) =>
      api.get<{ restrictions: CatalogEntry[] }>('/admin/restrictions/catalog', undefined, signal),
    staleTime: 5 * 60_000,
  });

  const activeCodes = useMemo(
    () => new Set(restrictions.map((entry) => entry.code)),
    [restrictions],
  );

  const [selected, setSelected] = useState<RestrictionCode[]>([...activeCodes]);
  const [reason, setReason] = useState(
    restrictions.find((entry) => entry.reason)?.reason ?? '',
  );

  // La fiche peut changer de membre : on recale la sélection sur ses données.
  useEffect(() => {
    setSelected([...activeCodes]);
    setReason(restrictions.find((entry) => entry.reason)?.reason ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, restrictions]);

  const mutation = useMutation({
    mutationFn: (codes: RestrictionCode[]) =>
      api.put<{ restrictions: MemberRestriction[]; added: string[]; removed: string[] }>(
        `/admin/members/${profileId}/restrictions`,
        { codes, reason: reason.trim() || null },
      ),
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.added.length > 0) parts.push(`${data.added.length} ajoutée(s)`);
      if (data.removed.length > 0) parts.push(`${data.removed.length} levée(s)`);
      toast.success(parts.length > 0 ? `Restrictions mises à jour : ${parts.join(', ')}.` : 'Aucun changement.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
      onSaved?.(data.restrictions);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Mise à jour impossible.'),
  });

  const toggle = (code: RestrictionCode) => {
    setSelected((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code],
    );
  };

  const changed =
    selected.length !== activeCodes.size || selected.some((code) => !activeCodes.has(code));
  const hasSelection = selected.length > 0;

  if (disabled) {
    return (
      <Alert tone="info" title="Restrictions indisponibles">
        Les restrictions ne s’appliquent qu’aux membres approuvés qui ne sont pas administrateurs.
      </Alert>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Ban className="h-4 w-4 text-brand-accent" aria-hidden="true" /> Restrictions ciblées
      </h3>
      <p className="text-xs text-muted">
        Retirez une possibilité précise sans suspendre le compte. Le membre conserve son accès et
        lit le motif dans son espace personnel.
      </p>

      {catalogueQuery.isLoading ? (
        <p className="text-sm text-muted">Chargement des restrictions…</p>
      ) : catalogueQuery.isError ? (
        <Alert tone="danger" title="Catalogue indisponible">
          Impossible de charger la liste des restrictions. Réessayez plus tard.
        </Alert>
      ) : (
        <div className="space-y-2.5">
          {(catalogueQuery.data?.restrictions ?? []).map((entry) => (
            <Checkbox
              key={entry.code}
              label={entry.label}
              description={entry.description}
              checked={selected.includes(entry.code)}
              onChange={() => toggle(entry.code)}
            />
          ))}
        </div>
      )}

      <Textarea
        label="Motif communiqué au membre"
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Ex. : propos blessants envers un autre membre."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={hasSelection ? 'danger' : 'outline'}
          loading={mutation.isPending}
          disabled={!changed}
          onClick={() => mutation.mutate(selected)}
        >
          {hasSelection ? 'Enregistrer les restrictions' : 'Lever toutes les restrictions'}
        </Button>
        {activeCodes.size > 0 ? (
          <Badge tone="warning">
            {activeCodes.size} restriction{activeCodes.size > 1 ? 's' : ''} active
            {activeCodes.size > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge tone="success">Aucune restriction</Badge>
        )}
      </div>

      {hasSelection && !reason.trim() ? (
        <p className="inline-flex items-start gap-1.5 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sans motif, le membre verra un message générique. Un motif clair évite les malentendus.
        </p>
      ) : null}

      <p className="text-xs text-muted">
        Les administrateurs ne peuvent pas être restreints : leur rôle se retire d’abord. Chaque
        changement est inscrit au journal d’audit.
      </p>
    </div>
  );
}
