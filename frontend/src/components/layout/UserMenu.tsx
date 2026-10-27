import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../ui';
import { cn } from '../../utils/cn';

export function UserMenu() {
  const { profile, isAdmin, isApproved, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!profile) return null;

  const spaceLink = isAdmin ? '/admin' : isApproved ? '/espace-membre' : '/mon-inscription';

  const handleLogout = async () => {
    try {
      await logout();
      queryClient.clear();
      toast.success('Vous êtes déconnecté.');
      setOpen(false);
    } catch {
      toast.error('Déconnexion impossible, réessayez.');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-2.5 pl-1 transition hover:border-brand/40"
      >
        <Avatar firstName={profile.firstName} lastName={profile.lastName} src={profile.photoUrl} size="sm" />
        <span className="hidden max-w-[9rem] truncate text-sm font-medium text-ink sm:block">
          {profile.firstName}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{profile.fullName}</p>
            <p className="truncate text-xs text-muted">{profile.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link
            to={spaceLink}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink transition hover:bg-lavender"
          >
            {isAdmin ? <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> : <UserRound className="h-4 w-4" aria-hidden="true" />}
            {isAdmin ? 'Administration' : isApproved ? 'Mon espace membre' : 'Mon inscription'}
          </Link>
          <Link
            to={isApproved ? '/espace-membre/profil' : '/mon-inscription'}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink transition hover:bg-lavender"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" /> Mon profil
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  );
}
