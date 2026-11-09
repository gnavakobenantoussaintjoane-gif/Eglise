import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Apparition douce au défilement.
 *
 * Utilisé pour rythmer les sections du site public sans jamais retarder la
 * lecture : l'animation ne se joue qu'une fois et disparaît complètement si la
 * personne a demandé moins de mouvement (réglage système).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
