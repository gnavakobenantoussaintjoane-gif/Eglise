import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, MailOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { Notification } from '../../types';
import { Badge, Button, EmptyState, LoadingBlock } from '../../components/ui';
import { formatRelative } from '../../utils/format';
import { cn } from '../../utils/cn';

export function MemberNotificationsPage() {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ signal }) => api.get<{ notifications: Notification[] }>('/members/notifications', undefined, signal),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['members', 'dashboard'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/members/notifications/${id}/read`),
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.post('/members/notifications/read-all'),
    onSuccess: () => {
      toast.success('Toutes les notifications sont marquées comme lues.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  if (notificationsQuery.isLoading) return <LoadingBlock label="Chargement des notifications…" />;

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-brand-dark">Notifications</h1>
          <p className="text-sm text-muted">
            {unread > 0 ? `${unread} notification(s) non lue(s).` : 'Tout est lu.'}
          </p>
        </div>
        {unread > 0 ? (
          <Button
            variant="outline"
            size="sm"
            loading={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
            icon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
          >
            Tout marquer comme lu
          </Button>
        ) : null}
      </header>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          title="Aucune notification"
          description="Vous serez informé des décisions concernant vos demandes et de la vie de l’église."
        />
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                'surface flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between',
                !notification.readAt && 'border-brand/30 bg-lavender/30',
              )}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-brand-dark">{notification.title}</p>
                  {!notification.readAt ? <Badge tone="brand">Nouveau</Badge> : null}
                </div>
                {notification.body ? <p className="text-sm text-muted">{notification.body}</p> : null}
                <p className="text-xs text-muted">{formatRelative(notification.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {notification.link ? (
                  <Link to={notification.link} onClick={() => !notification.readAt && markReadMutation.mutate(notification.id)}>
                    <Button size="sm" variant="ghost">
                      Ouvrir
                    </Button>
                  </Link>
                ) : null}
                {!notification.readAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markReadMutation.mutate(notification.id)}
                    icon={<MailOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Lu
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
