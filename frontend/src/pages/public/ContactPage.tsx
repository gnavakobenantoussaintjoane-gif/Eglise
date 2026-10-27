import { Link } from 'react-router-dom';
import { Clock, Facebook, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import { Button, Card, PageHeader } from '../../components/ui';

export function ContactPage() {
  const { settings } = useChurchSettings();
  const serviceTimes = settings.serviceTimes.length > 0
    ? settings.serviceTimes
    : [
        { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
        { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
        { label: 'Veillée de prière', day: 'Vendredi', time: '21h00' },
      ];

  const address = [settings.address, settings.city, settings.country].filter(Boolean).join(', ');
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || 'Abidjan, Côte d’Ivoire')}`;

  const socials = [
    { key: 'facebook', href: settings.socialLinks.facebook, Icon: Facebook, label: 'Facebook' },
    { key: 'instagram', href: settings.socialLinks.instagram, Icon: Instagram, label: 'Instagram' },
    { key: 'youtube', href: settings.socialLinks.youtube, Icon: Youtube, label: 'YouTube' },
  ].filter((item) => Boolean(item.href));

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Parlons-nous"
        description="Une question, une visite à préparer, un besoin particulier ? L’équipe de l’église est disponible."
      />

      <section className="container-page grid gap-8 py-12 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2">
            <MapPin className="h-5 w-5 text-brand-royal" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-brand-dark">Nous trouver</h2>
            <p className="text-sm text-muted">{address || 'Abidjan, Côte d’Ivoire'}</p>
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium text-brand hover:text-brand-royal"
            >
              Ouvrir dans Google Maps →
            </a>
          </Card>

          <Card className="space-y-2">
            <Phone className="h-5 w-5 text-brand-royal" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-brand-dark">Téléphone</h2>
            {settings.phone ? (
              <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="text-sm text-muted hover:text-brand">
                {settings.phone}
              </a>
            ) : (
              <p className="text-sm text-muted">Numéro communiqué prochainement.</p>
            )}
            {settings.whatsapp ? (
              <a
                href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Écrire sur WhatsApp
              </a>
            ) : null}
          </Card>

          <Card className="space-y-2">
            <Mail className="h-5 w-5 text-brand-royal" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-brand-dark">E-mail</h2>
            {settings.email ? (
              <a href={`mailto:${settings.email}`} className="text-sm break-all text-muted hover:text-brand">
                {settings.email}
              </a>
            ) : (
              <p className="text-sm text-muted">Adresse e-mail communiquée prochainement.</p>
            )}
          </Card>

          <Card className="space-y-2">
            <Clock className="h-5 w-5 text-brand-royal" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-brand-dark">Horaires</h2>
            <ul className="space-y-1 text-sm text-muted">
              {serviceTimes.map((service, index) => (
                <li key={`${service.label}-${index}`}>
                  {service.label ?? 'Culte'} · {[service.day, service.time].filter(Boolean).join(' ')}
                </li>
              ))}
            </ul>
          </Card>

          {socials.length > 0 ? (
            <Card className="space-y-3 sm:col-span-2">
              <h2 className="font-display text-lg font-semibold text-brand-dark">Suivez la vie de l’église</h2>
              <div className="flex flex-wrap gap-2">
                {socials.map(({ key, href, Icon, label }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-brand transition hover:bg-lavender"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 bg-brand-dark text-white">
            <h2 className="font-display text-xl font-semibold">Une demande précise ?</h2>
            <p className="text-sm leading-relaxed text-white/75">
              Pour une demande de prière, un témoignage ou une adhésion, des formulaires dédiés vous permettent
              d’être accompagné rapidement.
            </p>
            <div className="grid gap-2">
              <Link to="/priere">
                <Button block variant="gold">
                  Demander la prière
                </Button>
              </Link>
              <Link to="/inscription">
                <Button block variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15">
                  Devenir membre
                </Button>
              </Link>
              <Link to="/temoignages">
                <Button block variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15">
                  Partager un témoignage
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Première visite ?</h2>
            <p className="text-sm leading-relaxed text-muted">
              Présentez-vous à l’équipe d’accueil dès votre arrivée : un membre vous accompagnera pour découvrir
              l’église, les enfants sont pris en charge et un temps de convivialité suit le culte.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
