import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '../../services/api';
import type { AuditLog, Pagination } from '../../types';
import { Button, Input, LoadingBlock } from '../../components/ui';
import { AdminHeading, TableShell, Toolbar } from '../../components/admin/AdminKit';
import { formatDateTime } from '../../utils/format';

export function AdminAuditLogPage() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ['admin', 'audit-logs', applied, page],
    queryFn: ({ signal }) =>
      api.get<{ logs: AuditLog[]; pagination: Pagination }>(
        '/admin/audit-logs',
        { search: applied || undefined, page, perPage: 30 },
        signal,
      ),
  });

  const logs = logsQuery.data?.logs ?? [];
  const pagination = logsQuery.data?.pagination;

  return (
    <>
      <AdminHeading
        title="Journal d’audit"
        description="Traçabilité des actions sensibles : validations de membres, publications, finances, modération."
      />

      <Toolbar>
        <form
          className="flex w-full flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied(search.trim());
          }}
        >
          <Input
            aria-label="Rechercher dans le journal"
            placeholder="Email, action ou identifiant…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="min-w-[16rem] flex-1"
          />
          <Button type="submit" variant="outline" size="sm">
            <ScrollText className="h-4 w-4" aria-hidden="true" /> Rechercher
          </Button>
          {applied ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setApplied('');
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          ) : null}
        </form>
      </Toolbar>

      <TableShell
        columns={['Date', 'Action', 'Entité', 'Auteur', 'Détails']}
        loading={logsQuery.isLoading}
        empty={
          !logsQuery.isLoading && logs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                Aucune entrée dans le journal.
              </td>
            </tr>
          ) : null
        }
      >
        {logs.map((log) => (
          <tr key={log.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDateTime(log.createdAt)}</td>
            <td className="px-4 py-3">
              <code className="rounded bg-lavender px-1.5 py-0.5 font-mono text-xs text-brand">{log.action}</code>
            </td>
            <td className="px-4 py-3 text-xs text-muted">
              {log.entityType ?? '—'}
              {log.entityId ? <span className="block truncate font-mono text-[0.65rem]">{log.entityId}</span> : null}
            </td>
            <td className="px-4 py-3 text-xs text-muted">{log.actorEmail ?? 'système'}</td>
            <td className="px-4 py-3">
              {Object.keys(log.metadata ?? {}).length === 0 ? (
                <span className="text-xs text-muted">—</span>
              ) : (
                <pre className="max-w-xs overflow-x-auto rounded-lg bg-lavender/60 p-2 font-mono text-[0.65rem] text-ink/80">
                  {JSON.stringify(log.metadata, null, 1)}
                </pre>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      {logsQuery.isLoading ? <LoadingBlock label="Chargement du journal…" /> : null}

      {pagination && pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {pagination.page} sur {pagination.totalPages} · {pagination.total} entrée(s)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Précédent
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
