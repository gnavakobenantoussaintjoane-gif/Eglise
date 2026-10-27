import { Camera, Database, Eye, Mail, ShieldCheck } from 'lucide-react';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import { PageHeader } from '../../components/ui';

const SECTIONS = [
  {
    icon: Database,
    title: 'Données que nous collectons',
    body: [
      'Lors de la création d’un compte, nous enregistrons votre nom, votre adresse e-mail, votre mot de passe (stocké sous forme chiffrée) ainsi que les informations de votre profil que vous choisissez de renseigner (téléphone, ville, profession, présentation).',
      'Les demandes de prière et les témoignages peuvent être déposés de manière anonyme. Les coordonnées transmises ne sont visibles que par l’équipe pastorale concernée.',
    ],
  },
  {
    icon: Eye,
    title: 'Ce qui est visible publiquement',
    body: [
      'Seules les informations que vous avez explicitement renseignées dans votre présentation publique (nom, photo si vous l’avez autorisée, ville, profession) peuvent apparaître dans les pages de l’église.',
      'Votre adresse e-mail et votre numéro de téléphone ne sont jamais publiés. Ils ne sont accessibles qu’aux administrateurs habilités.',
    ],
  },
  {
    icon: Camera,
    title: 'Photos et consentement',
    body: [
      'Des photos peuvent être prises lors des cultes et activités. Chaque membre peut indiquer son consentement à l’utilisation de son image dans son profil.',
      'Si vous apparaissez sur une photo et souhaitez son retrait, utilisez le formulaire « Demander le retrait » disponible dans les albums ou écrivez-nous : la photo est retirée après vérification.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Sécurité et conservation',
    body: [
      'Les accès sont protégés par mot de passe et les sessions sont chiffrées. Les actions sensibles (approbation de membres, publication de contenus, finances) sont journalisées.',
      'Les données sont conservées le temps de votre adhésion. Vous pouvez demander la correction ou la suppression de votre compte à tout moment.',
    ],
  },
];

export function PrivacyPage() {
  const { settings } = useChurchSettings();

  return (
    <>
      <PageHeader
        eyebrow="Confidentialité"
        title="Vos données, vos photos"
        description="Nous nous engageons à protéger votre vie privée et à vous permettre de garder la maîtrise de votre image."
      />
      <section className="container-page space-y-6 py-14">
        <div className="grid gap-5 lg:grid-cols-2">
          {SECTIONS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="surface space-y-2 p-6">
              <Icon className="h-6 w-6 text-brand-royal" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-brand-dark">{title}</h2>
              {body.map((paragraph) => (
                <p key={paragraph.slice(0, 20)} className="text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-lavender/60 p-6">
          <div className="flex flex-wrap items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-brand" aria-hidden="true" />
            <div>
              <h2 className="font-display text-lg font-semibold text-brand-dark">Exercer vos droits</h2>
              <p className="mt-1 text-sm text-muted">
                Pour toute demande d’accès, de rectification ou de suppression de vos données, contactez le
                secrétariat de {settings.churchName}
                {settings.email ? (
                  <>
                    {' '}
                    à{' '}
                    <a href={`mailto:${settings.email}`} className="font-medium text-brand-royal hover:text-brand">
                      {settings.email}
                    </a>
                  </>
                ) : null}
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
