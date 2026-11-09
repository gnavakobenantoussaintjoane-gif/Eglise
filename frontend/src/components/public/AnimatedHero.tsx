import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { ArrowRight, CalendarDays, Clock, MapPin, PlayCircle, Sparkles, Users } from 'lucide-react';
import type { ChurchEvent, ChurchSettings, Department, Sermon, ServiceTime } from '../../types';
import { Button } from '../../components/ui';
import { formatDate } from '../../utils/format';

/** Signature de l'église telle qu'elle figure sur les supports imprimés. */
const SIGNATURE = 'Le Réveil par l’amour du Christ';

const FALLBACK_SERVICES: ServiceTime[] = [
  { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
  { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
  { label: 'Veillée de prière', day: 'Vendredi', time: '21h00' },
];

/**
 * Compteur animé.
 *
 * Le chiffre monte progressivement jusqu'à la valeur réelle : l'information
 * reste exacte (aucune valeur inventée), seule la présentation est animée.
 * Avec `prefers-reduced-motion`, la valeur s'affiche immédiatement.
 */
function useCountUp(target: number, duration = 1100): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced || target <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // Courbe d'accélération douce (ease-out cubic).
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return value;
}

function StatCounter({ value, label, icon: Icon }: { value: number; label: string; icon: typeof Users }) {
  const display = useCountUp(value);
  return (
    <div className="glass-dark rounded-2xl px-4 py-3">
      <Icon className="mb-2 h-4 w-4 text-gold" aria-hidden="true" />
      <dt className="text-[0.68rem] tracking-wide text-white/60 uppercase">{label}</dt>
      <dd className="font-display text-2xl font-semibold text-white tabular-nums">{display}</dd>
    </div>
  );
}

/** Bandeau des horaires : défilement continu, mis en pause au survol. */
function ServiceTicker({ services }: { services: { label?: string | null; day?: string | null; time?: string | null }[] }) {
  const items = services.length > 0 ? services : FALLBACK_SERVICES;
  const row = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden border-y border-white/10 bg-brand-dark/80 py-2.5"
      aria-label="Horaires des cultes"
    >
      <div className="ticker-track gap-8">
        {row.map((service, index) => (
          <span
            key={`${service.label}-${index}`}
            aria-hidden={index >= items.length}
            className="flex shrink-0 items-center gap-2 text-xs font-medium tracking-wide text-white/75 uppercase"
          >
            <Clock className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
            {service.label ?? 'Culte'}
            <span className="text-white/40">·</span>
            <span className="text-white/90">
              {[service.day, service.time].filter(Boolean).join(' ')}
            </span>
            <span className="ml-4 text-gold/60">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Slogans qui tournent sous le titre (messages de l'église, jamais inventés). */
function useRotatingMessage(messages: string[], delay = 4200): string {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || messages.length < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % messages.length), delay);
    return () => clearInterval(timer);
  }, [messages.length, delay, reduced]);

  return messages[index] ?? messages[0] ?? '';
}

export function AnimatedHero({
  settings,
  departments,
  sermons,
  events,
}: {
  settings: ChurchSettings;
  departments: Department[];
  sermons: Sermon[];
  events: ChurchEvent[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // Parallaxe : le fond bouge moins vite que le contenu au défilement.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const backgroundY = useSpring(useTransform(scrollYProgress, [0, 1], ['0%', '18%']), {
    stiffness: 70,
    damping: 22,
  });
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '-8%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const nextEvent = events[0];
  const serviceTimes = settings.serviceTimes.length > 0 ? settings.serviceTimes : FALLBACK_SERVICES;

  const rotating = useRotatingMessage(
    [
      settings.tagline ?? 'Une église évangélique à Abidjan',
      SIGNATURE,
      'Un peuple délivré, transformé par la révélation de la Parole.',
    ].filter(Boolean),
  );

  const stats = [
    { label: 'Départements', value: departments.length, icon: Users },
    { label: 'Prédications', value: sermons.length, icon: PlayCircle },
    { label: 'Rendez-vous', value: serviceTimes.length, icon: Clock },
  ];

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden bg-brand-dark text-white">
      {/* --- Fond : yeux du lion (visuel des affiches), parallaxe + voile dégradé --- */}
      <motion.div
        aria-hidden="true"
        style={{ y: reduced ? 0 : backgroundY }}
        className="absolute inset-0 -z-10"
      >
        <img
          src="/brand/hero-lion.jpg"
          alt=""
          className="h-full w-full scale-110 object-cover opacity-45"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/85 to-brand-dark" />
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(124,58,237,0.45),transparent_70%)]" />
      </motion.div>

      {/* Halos animés */}
      <div className="aurora-blob top-[-10%] left-[-6%] h-72 w-72 bg-brand-royal/60" aria-hidden="true" />
      <div
        className="aurora-blob right-[-8%] bottom-[-12%] h-80 w-80 bg-eagle/35 [animation-delay:-6s]"
        aria-hidden="true"
      />
      <div
        className="aurora-blob top-1/3 left-1/2 h-64 w-64 bg-gold/15 [animation-delay:-11s]"
        aria-hidden="true"
      />

      <motion.div
        style={reduced ? undefined : { y: contentY, opacity: contentOpacity }}
        className="container-page relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24"
      >
        {/* ---------------- Colonne texte ---------------- */}
        <div className="space-y-7">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[0.7rem] font-medium tracking-[0.18em] uppercase">
              <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> Bienvenue à la maison
            </span>
            <span className="hidden text-[0.7rem] tracking-[0.2em] text-white/50 uppercase sm:inline">
              Abidjan · Côte d’Ivoire
            </span>
          </motion.div>

          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance font-display text-4xl leading-[1.04] font-semibold sm:text-5xl lg:text-[3.6rem]"
            >
              <span className="text-brand-gradient">{settings.slogan}</span>
            </motion.h1>

            {/* Message qui tourne : garde le hero vivant sans figer un seul texte. */}
            <div className="min-h-[3.2rem] sm:min-h-[2.4rem]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={rotating}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="max-w-xl text-base leading-relaxed text-white/80 sm:text-lg"
                >
                  {rotating}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18 }}
            className="flex flex-wrap gap-3"
          >
            <Link to="/a-propos">
              <Button size="lg" variant="gold" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                Découvrir l’église
              </Button>
            </Link>
            <Link to="/predications">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/15"
                icon={<PlayCircle className="h-4 w-4" aria-hidden="true" />}
              >
                Voir les prédications
              </Button>
            </Link>
          </motion.div>

          <motion.dl
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.09, delayChildren: 0.28 } } }}
            className="grid gap-3 pt-2 sm:grid-cols-3"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <StatCounter value={stat.value} label={stat.label} icon={stat.icon} />
              </motion.div>
            ))}
          </motion.dl>
        </div>

        {/* ---------------- Colonne visuelle ---------------- */}
        <div className="relative">
          {/* Logo officiel, posé en médaillon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto mb-5 flex w-fit items-center gap-4 rounded-3xl border border-white/12 bg-white/[0.06] px-5 py-4 backdrop-blur-md"
          >
            <span className="halo absolute inset-0 -z-10 rounded-3xl bg-brand-royal/40 blur-2xl" aria-hidden="true" />
            <img
              src="/brand/logo-mark.png"
              alt="Logo de l’église La Forteresse de l’Éternel"
              className="float-soft h-16 w-16 object-contain drop-shadow-[0_8px_24px_rgba(76,29,149,0.55)] sm:h-20 sm:w-20"
              width={80}
              height={80}
            />
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold text-white">{settings.churchName}</p>
              <p className="mt-1 text-[0.7rem] tracking-[0.16em] text-gold/90 uppercase">
                Le Réveil par l’amour du Christ
              </p>
            </div>
          </motion.div>

          {/* Prochain rendez-vous */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="glass-dark rounded-3xl p-6"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-gold uppercase">
                Prochain rendez-vous
              </p>
            </div>
            {nextEvent ? (
              <div className="mt-3 space-y-3">
                <h2 className="font-display text-2xl font-semibold text-white">{nextEvent.title}</h2>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(nextEvent.startsAt)}
                  </span>
                  {nextEvent.location ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {nextEvent.location}
                    </span>
                  ) : null}
                </p>
                {nextEvent.description ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-white/70">
                    {nextEvent.description}
                  </p>
                ) : null}
                <Link
                  to={`/evenements/${nextEvent.slug}`}
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-white"
                >
                  Détails de l’événement
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/75">
                Rejoignez-nous ce dimanche pour le culte de célébration.
              </p>
            )}
          </motion.div>

          {/* Horaires */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 grid gap-3 rounded-3xl bg-white/95 p-5 text-ink shadow-xl"
          >
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-brand uppercase">
              Horaires des cultes
            </p>
            <ul className="space-y-2 text-sm">
              {serviceTimes.slice(0, 3).map((service, index) => (
                <motion.li
                  key={`${service.label}-${index}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.35 + index * 0.08 }}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-brand-dark">{service.label ?? 'Culte'}</span>
                  <span className="text-xs text-muted">
                    {[service.day, service.time].filter(Boolean).join(' · ')}
                  </span>
                </motion.li>
              ))}
            </ul>
            <Link to="/contact" className="text-xs font-semibold text-brand-royal hover:text-brand">
              Voir le plan d’accès →
            </Link>
          </motion.div>
        </div>
      </motion.div>

      <ServiceTicker services={serviceTimes} />
    </section>
  );
}
