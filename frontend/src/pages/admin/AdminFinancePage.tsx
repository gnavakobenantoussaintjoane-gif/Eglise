import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingDown, TrendingUp, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Contribution, Expense, FinanceSummary, Pagination } from '../../types';
import { Badge, Button, ConfirmDialog, Input, Modal, Select, Textarea } from '../../components/ui';
import { AdminHeading, StatCard, TableShell } from '../../components/admin/AdminKit';
import { formatCurrency, formatDate, toDateInputValue } from '../../utils/format';
import { cn } from '../../utils/cn';

type Tab = 'contributions' | 'expenses';

const METHOD_OPTIONS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'autre', label: 'Autre' },
];

const CATEGORY_OPTIONS = [
  { value: 'dime', label: 'Dîme' },
  { value: 'offrande', label: 'Offrande' },
  { value: 'don', label: 'Don' },
  { value: 'projet', label: 'Projet' },
  { value: 'autre', label: 'Autre' },
];

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((option) => [option.value, option.label]),
);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
);

export function AdminFinancePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('contributions');
  const [contributionOpen, setContributionOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: Tab; id: string; label: string } | null>(null);

  const [contribution, setContribution] = useState({
    donorName: '',
    amount: '',
    method: 'especes',
    category: 'offrande',
    receivedOn: toDateInputValue(new Date()),
    note: '',
  });
  const [expense, setExpense] = useState({
    label: '',
    amount: '',
    category: 'fonctionnement',
    spentOn: toDateInputValue(new Date()),
    note: '',
  });

  const summaryQuery = useQuery({
    queryKey: ['admin', 'finance', 'summary'],
    queryFn: ({ signal }) => api.get<FinanceSummary>('/admin/finance/summary', undefined, signal),
  });

  const contributionsQuery = useQuery({
    queryKey: ['admin', 'finance', 'contributions'],
    queryFn: ({ signal }) =>
      api.get<{ items: Contribution[]; pagination: Pagination }>(
        '/admin/finance/contributions',
        { perPage: 50 },
        signal,
      ),
  });

  const expensesQuery = useQuery({
    queryKey: ['admin', 'finance', 'expenses'],
    queryFn: ({ signal }) =>
      api.get<{ items: Expense[]; pagination: Pagination }>('/admin/finance/expenses', { perPage: 50 }, signal),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const contributionMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/finance/contributions', {
        donorName: contribution.donorName,
        amount: Number(contribution.amount),
        currency: summaryQuery.data?.currency ?? 'XOF',
        method: contribution.method,
        category: contribution.category,
        receivedOn: contribution.receivedOn || undefined,
        note: contribution.note || undefined,
      }),
    onSuccess: () => {
      toast.success('Contribution enregistrée.');
      setContributionOpen(false);
      setContribution({
        donorName: '',
        amount: '',
        method: 'especes',
        category: 'offrande',
        receivedOn: toDateInputValue(new Date()),
        note: '',
      });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const expenseMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/finance/expenses', {
        label: expense.label,
        amount: Number(expense.amount),
        currency: summaryQuery.data?.currency ?? 'XOF',
        category: expense.category,
        spentOn: expense.spentOn || undefined,
        note: expense.note || undefined,
      }),
    onSuccess: () => {
      toast.success('Dépense enregistrée.');
      setExpenseOpen(false);
      setExpense({
        label: '',
        amount: '',
        category: 'fonctionnement',
        spentOn: toDateInputValue(new Date()),
        note: '',
      });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (target: { kind: Tab; id: string }) =>
      api.delete(`/admin/finance/${target.kind === 'contributions' ? 'contributions' : 'expenses'}/${target.id}`),
    onSuccess: () => {
      toast.success('Ligne supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const summary = summaryQuery.data;
  const currency = summary?.currency ?? 'XOF';
  const contributions = contributionsQuery.data?.items ?? [];
  const expenses = expensesQuery.data?.items ?? [];

  return (
    <>
      <AdminHeading
        title="Finances"
        description="Suivi interne des contributions et des dépenses. Ces montants ne sont jamais publiés sur le site."
        actions={
          <Button
            size="sm"
            onClick={() => (tab === 'contributions' ? setContributionOpen(true) : setExpenseOpen(true))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {tab === 'contributions' ? 'Nouvelle contribution' : 'Nouvelle dépense'}
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Contributions"
          value={formatCurrency(summary?.contributions ?? 0, currency)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Dépenses"
          value={formatCurrency(summary?.expenses ?? 0, currency)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="danger"
        />
        <StatCard
          label="Solde"
          value={formatCurrency(summary?.balance ?? 0, currency)}
          icon={<Wallet className="h-5 w-5" />}
          tone={(summary?.balance ?? 0) >= 0 ? 'brand' : 'danger'}
        />
      </div>

      {summary && summary.byCategory.length > 0 ? (
        <div className="surface mb-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Contributions par catégorie</h2>
          <ul className="space-y-2">
            {summary.byCategory.map((entry) => {
              const max = Math.max(...summary.byCategory.map((item) => item.total), 1);
              return (
                <li key={entry.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{CATEGORY_LABEL[entry.category] ?? entry.category}</span>
                    <span className="text-muted">{formatCurrency(entry.total, currency)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-lavender">
                    <div
                      className="h-full rounded-full bg-brand-accent"
                      style={{ width: `${Math.round((entry.total / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mb-4 inline-flex rounded-xl border border-line bg-white p-1 text-sm">
        {(
          [
            { id: 'contributions', label: 'Contributions' },
            { id: 'expenses', label: 'Dépenses' },
          ] as { id: Tab; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium transition',
              tab === entry.id ? 'bg-brand text-white' : 'text-muted hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'contributions' ? (
        <TableShell
          columns={['Donateur', 'Catégorie', 'Moyen', 'Date', 'Montant', 'Actions']}
          loading={contributionsQuery.isLoading}
          empty={
            !contributionsQuery.isLoading && contributions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  Aucune contribution enregistrée.
                </td>
              </tr>
            ) : null
          }
        >
          {contributions.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 text-sm text-ink">{entry.donorName}</td>
              <td className="px-4 py-3">
                <Badge tone="info">{CATEGORY_LABEL[entry.category] ?? entry.category}</Badge>
              </td>
              <td className="px-4 py-3 text-xs text-muted">{METHOD_LABEL[entry.method] ?? entry.method}</td>
              <td className="px-4 py-3 text-xs text-muted">{formatDate(entry.receivedOn)}</td>
              <td className="px-4 py-3 text-sm font-semibold text-ink">
                {formatCurrency(entry.amount, entry.currency)}
              </td>
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDeleteTarget({ kind: 'contributions', id: entry.id, label: entry.donorName })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </td>
            </tr>
          ))}
        </TableShell>
      ) : (
        <TableShell
          columns={['Libellé', 'Catégorie', 'Date', 'Montant', 'Note', 'Actions']}
          loading={expensesQuery.isLoading}
          empty={
            !expensesQuery.isLoading && expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  Aucune dépense enregistrée.
                </td>
              </tr>
            ) : null
          }
        >
          {expenses.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 text-sm text-ink">{entry.label}</td>
              <td className="px-4 py-3">
                <Badge tone="neutral">{entry.category}</Badge>
              </td>
              <td className="px-4 py-3 text-xs text-muted">{formatDate(entry.spentOn)}</td>
              <td className="px-4 py-3 text-sm font-semibold text-ink">
                {formatCurrency(entry.amount, entry.currency)}
              </td>
              <td className="px-4 py-3 text-xs text-muted">{entry.note ?? '—'}</td>
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget({ kind: 'expenses', id: entry.id, label: entry.label })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                </Button>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <Modal open={contributionOpen} onClose={() => setContributionOpen(false)} title="Nouvelle contribution">
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (contribution.donorName.trim().length < 2 || !(Number(contribution.amount) > 0)) {
              toast.error('Nom et montant valides sont requis.');
              return;
            }
            contributionMutation.mutate();
          }}
        >
          <Input
            label="Donateur"
            required
            value={contribution.donorName}
            onChange={(event) => setContribution({ ...contribution, donorName: event.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Montant"
              type="number"
              min={0}
              step="1"
              required
              value={contribution.amount}
              onChange={(event) => setContribution({ ...contribution, amount: event.target.value })}
            />
            <Select
              label="Catégorie"
              options={CATEGORY_OPTIONS}
              value={contribution.category}
              onChange={(event) => setContribution({ ...contribution, category: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Moyen de paiement"
              options={METHOD_OPTIONS}
              value={contribution.method}
              onChange={(event) => setContribution({ ...contribution, method: event.target.value })}
            />
            <Input
              label="Date de réception"
              type="date"
              value={contribution.receivedOn}
              onChange={(event) => setContribution({ ...contribution, receivedOn: event.target.value })}
            />
          </div>
          <Textarea
            label="Note"
            rows={2}
            value={contribution.note}
            onChange={(event) => setContribution({ ...contribution, note: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setContributionOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={contributionMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Nouvelle dépense">
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (expense.label.trim().length < 2 || !(Number(expense.amount) > 0)) {
              toast.error('Libellé et montant valides sont requis.');
              return;
            }
            expenseMutation.mutate();
          }}
        >
          <Input
            label="Libellé"
            required
            value={expense.label}
            onChange={(event) => setExpense({ ...expense, label: event.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Montant"
              type="number"
              min={0}
              step="1"
              required
              value={expense.amount}
              onChange={(event) => setExpense({ ...expense, amount: event.target.value })}
            />
            <Input
              label="Catégorie"
              value={expense.category}
              onChange={(event) => setExpense({ ...expense, category: event.target.value })}
            />
          </div>
          <Input
            label="Date de la dépense"
            type="date"
            value={expense.spentOn}
            onChange={(event) => setExpense({ ...expense, spentOn: event.target.value })}
          />
          <Textarea
            label="Note"
            rows={2}
            value={expense.note}
            onChange={(event) => setExpense({ ...expense, note: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setExpenseOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={expenseMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer cette ligne ?"
        description={`« ${deleteTarget?.label ?? ''} » sera retiré des totaux. L’opération est journalisée.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ kind: deleteTarget.kind, id: deleteTarget.id })}
      />
    </>
  );
}
