import { Ban } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Bandeau affiché dans l'espace membre quand une ou plusieurs possibilités
 * ont été retirées au membre.
 *
 * Le motif est celui saisi par l'administrateur : le membre comprend ce qui lui
 * est refusé au lieu de rencontrer une erreur sans explication.
 */
export function RestrictionNotice() {
  const { restrictions } = useAuth();
  if (restrictions.length === 0) return null;

  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm text-ink"
    >
      <p className="flex items-center gap-2 font-semibold text-warning">
        <Ban className="h-4 w-4" aria-hidden="true" />
        Certaines possibilités de votre compte sont restreintes
      </p>
      <ul className="mt-2 space-y-1.5">
        {restrictions.map((restriction) => (
          <li key={restriction.code} className="text-ink/80">
            <span className="font-medium">{restriction.label}</span>
            {restriction.reason ? (
              <span className="text-muted"> — motif : {restriction.reason}</span>
            ) : (
              <span className="text-muted"> — contactez un responsable pour connaître le motif.</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Votre accès à l’espace membre reste actif. Ces restrictions peuvent être levées par
        l’administration.
      </p>
    </div>
  );
}
