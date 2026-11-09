import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Flame, HeartHandshake, Sparkles } from 'lucide-react';
import type { ChurchSettings } from '../../types';

/** Vision imprimée sur les supports de l'église (affiche « VISION : »). */
const VISION_TEXT =
  'Bâtir un peuple délivré, transformé par la révélation de la parole de Dieu, vivant pleinement leur héritage en Christ.';
const VISION_VERSE = 'Ézéchiel 37.10';

/**
 * Bloc « identité » : vision, mission et signature de l'église.
 *
 * Les textes repris des supports imprimés servent de valeur par défaut ; dès
 * qu'un administrateur renseigne la vision ou la mission dans les réglages,
 * ce sont ses mots qui s'affichent. Rien n'est figé dans le code.
 *
 * L'apparition se fait au défilement (`whileInView`), une seule fois, et reste
 * instantanée si la personne a demandé moins d'animations.
 */
export function VisionSignature({ settings }: { settings: ChurchSettings }) {
  const reduced = useReducedMotion();

  const items = [
    {
      key: 'vision',
      eyebrow: 'Vision',
      title: 'Notre vision',
      text: settings.vision?.trim() || VISION_TEXT,
      icon: Sparkles,
    },
    {
      key: 'mission',
      eyebrow: 'Mission',
      title: 'Notre mission',
      text:
        settings.mission?.trim() ||
        'Accueillir chaque personne, la former dans la Parole et l’envoyer servir selon ses talents.',
      icon: HeartHandshake,
    },
  ];

  const reveal = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 28 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <section className="relative isolate overflow-hidden bg-white py-16 sm:py-20">
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_100%_0%,rgba(109,40,217,0.08),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="container-page grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        {/* Signature visuelle : le logo officiel en grand */}
        <motion.div {...reveal} className="relative mx-auto w-full max-w-sm">
          <div className="absolute inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-royal/15 via-brand/10 to-gold/15 blur-2xl" aria-hidden="true" />
          <div className="rounded-[2rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
            <img
              src="/brand/logo.png"
              alt="La Forteresse de l’Éternel — le réveil par l’amour du Christ"
              className="mx-auto w-full max-w-[15rem] object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-center">
              <Flame className="h-4 w-4 text-flame" aria-hidden="true" />
              <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
                Le Réveil par l’amour du Christ
              </p>
            </div>
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div {...reveal} className="space-y-3">
            <p className="eyebrow">Notre identité</p>
            <h2 className="text-3xl font-semibold text-brand-dark sm:text-4xl">
              Une maison bâtie sur la Parole
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-muted">
              {settings.about?.trim() ||
                'La Forteresse de l’Éternel est une famille spirituelle qui croit à la puissance de la Parole de Dieu et à la transformation des vies par l’Évangile.'}
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {items.map(({ key, eyebrow, title, text, icon: Icon }, index) => (
              <motion.div
                key={key}
                {...reveal}
                transition={
                  reduced
                    ? undefined
                    : { duration: 0.7, delay: 0.1 + index * 0.12, ease: [0.22, 1, 0.36, 1] }
                }
                className="group relative overflow-hidden rounded-2xl border border-line bg-lavender/60 p-5 transition hover:border-brand/30 hover:bg-white hover:shadow-[var(--shadow-soft)]"
              >
                <span className="absolute top-0 right-0 h-16 w-16 translate-x-6 -translate-y-6 rounded-full bg-brand-royal/10 transition group-hover:bg-gold/20" aria-hidden="true" />
                <p className="text-[0.65rem] font-semibold tracking-[0.22em] text-brand-light uppercase">
                  {eyebrow}
                </p>
                <Icon className="mt-2 h-5 w-5 text-brand-royal" aria-hidden="true" />
                <h3 className="mt-2 font-display text-lg font-semibold text-brand-dark">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </motion.div>
            ))}
          </div>

          {/* Le verset des affiches, mis en valeur */}
          <motion.blockquote
            {...reveal}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand via-brand-royal to-brand-dark p-6 text-white"
          >
            <BookOpen className="h-6 w-6 text-gold" aria-hidden="true" />
            <p className="mt-3 font-display text-lg leading-snug sm:text-xl">
              « Je mettrai mon esprit en vous, et vous vivrez. »
            </p>
            <footer className="mt-2 text-xs tracking-wide text-white/70 uppercase">
              {VISION_VERSE} — la vision qui nous porte
            </footer>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/a-propos">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3.5 py-2 text-sm font-medium transition hover:bg-white/20">
                  Notre histoire
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
              <Link to="/departements">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3.5 py-2 text-sm font-medium transition hover:bg-white/20">
                  Rejoindre un département
                </span>
              </Link>
            </div>
          </motion.blockquote>
        </div>
      </div>
    </section>
  );
}
