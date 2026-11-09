import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Quote, Sparkles } from 'lucide-react';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import { Logo } from '../layout/Logo';

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { settings } = useChurchSettings();
  const reduced = useReducedMotion();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden overflow-hidden bg-brand-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Visuel des affiches de l'église, adouci pour rester lisible */}
        <img
          src="/brand/hero-lion.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/85 via-brand/75 to-brand-dark" aria-hidden="true" />
        <div className="aurora-blob top-[-10%] left-[-10%] h-72 w-72 bg-brand-royal/60" aria-hidden="true" />
        <div className="aurora-blob right-[-15%] bottom-[-10%] h-80 w-80 bg-eagle/30 [animation-delay:-7s]" aria-hidden="true" />

        <div className="relative">
          <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} inverted />
        </div>

        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 24 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative space-y-6"
        >
          <Quote className="h-10 w-10 text-gold" aria-hidden="true" />
          <p className="max-w-md font-display text-3xl leading-snug">
            « Venez à moi, vous tous qui êtes fatigués et chargés, et je vous donnerai du repos. »
          </p>
          <p className="text-sm text-white/70">Matthieu 11.28</p>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wide">
            <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
            Le Réveil par l’amour du Christ
          </p>
        </motion.div>

        <p className="relative text-sm text-white/60">
          {settings.tagline ?? 'Une église qui accueille, forme et envoie.'}
        </p>
      </div>

      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 16 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col justify-center bg-white px-5 py-12 sm:px-10 lg:px-16"
      >
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="lg:hidden">
            <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-brand-dark sm:text-3xl">{title}</h1>
            {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
          </div>
          {children}
          {footer ? <div className="text-sm text-muted">{footer}</div> : null}
          <Link to="/" className="block text-xs text-muted hover:text-brand">
            ← Retour au site public
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
