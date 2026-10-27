import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Photo } from '../../types';
import { formatDate } from '../../utils/format';

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const photo = photos[index];

  const go = useCallback(
    (direction: 1 | -1) => {
      const next = (index + direction + photos.length) % photos.length;
      onIndexChange(next);
    },
    [index, photos.length, onIndexChange],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', handleKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [go, onClose]);

  if (!photo) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} sur ${photos.length}`}
      className="fixed inset-0 z-50 flex flex-col bg-brand-dark/95 p-4 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between text-white">
        <p className="text-sm text-white/70">
          {index + 1} / {photos.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Fermer la visionneuse"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {photos.length > 1 ? (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Photo précédente"
            className="absolute left-0 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        ) : null}

        {photo.url ? (
          <img
            src={photo.url}
            alt={photo.caption ?? `Photo ${index + 1}`}
            className="max-h-[75vh] max-w-full rounded-xl object-contain"
          />
        ) : (
          <p className="text-sm text-white/70">Image indisponible.</p>
        )}

        {photos.length > 1 ? (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Photo suivante"
            className="absolute right-0 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 text-center text-sm text-white/80">
        {photo.caption ? <p>{photo.caption}</p> : null}
        {photo.takenAt ? <p className="text-xs text-white/50">{formatDate(photo.takenAt)}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
