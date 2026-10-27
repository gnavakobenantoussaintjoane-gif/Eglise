import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { hashPassword } from '../auth/password.js';
import { getStorage } from '../storage/index.js';
import { generateGradientPng, PALETTES } from './lib/png.js';
import { slugify } from '../utils/slug.js';

const DEMO_EMAIL_DOMAIN = 'demo.laforteresse.test';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  profession: string;
  status: 'profile_incomplete' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
  role: 'member' | 'department_leader' | 'media' | 'admin';
}

const DEMO_USERS: SeedUser[] = [
  {
    email: `marie.kouassi@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Marie',
    lastName: 'Kouassi',
    city: 'Abidjan — Cocody',
    phone: '+225 07 01 23 45 67',
    profession: 'Enseignante',
    status: 'approved',
    role: 'member',
  },
  {
    email: `jean.yao@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Jean',
    lastName: 'Yao',
    city: 'Abidjan — Yopougon',
    phone: '+225 05 44 22 11 00',
    profession: 'Ingenieur',
    status: 'approved',
    role: 'department_leader',
  },
  {
    email: `esther.diallo@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Esther',
    lastName: 'Diallo',
    city: 'Abidjan — Marcory',
    phone: '+225 01 88 77 66 55',
    profession: 'Photographe',
    status: 'approved',
    role: 'media',
  },
  {
    email: `paul.adjoumani@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Paul',
    lastName: 'Adjoumani',
    city: 'Abobo',
    phone: '+225 07 77 88 99 00',
    profession: 'Commercant',
    status: 'pending_review',
    role: 'member',
  },
  {
    email: `grace.bamba@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Grace',
    lastName: 'Bamba',
    city: 'Koumassi',
    phone: '+225 05 12 34 56 78',
    profession: 'Etudiante',
    status: 'pending_review',
    role: 'member',
  },
  {
    email: `samuel.kone@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Samuel',
    lastName: 'Kone',
    city: 'Treichville',
    phone: '+225 01 23 45 67 89',
    profession: 'Chauffeur',
    status: 'profile_incomplete',
    role: 'member',
  },
  {
    email: `ruth.assamoi@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Ruth',
    lastName: 'Assamoi',
    city: 'Abidjan — Plateau',
    phone: '+225 07 66 55 44 33',
    profession: 'Comptable',
    status: 'rejected',
    role: 'member',
  },
  {
    email: `daniel.ouattara@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Daniel',
    lastName: 'Ouattara',
    city: 'Bingerville',
    phone: '+225 05 99 88 77 66',
    profession: 'Mecanicien',
    status: 'suspended',
    role: 'member',
  },
];

async function seedDepartments(): Promise<Record<string, string>> {
  const db = getDatabase();
  const rows = [
    {
      name: 'Musique et louange',
      description:
        'Conduire l assemblee dans la louange et l adoration, avec excellence et humilite.',
      mission:
        'Former des musiciens et chanteurs disciples, coordonner les repetitions et servir lors des cultes.',
      day: 'Jeudi',
      time: '18h00 — 20h30',
      location: 'Salle de repetition',
      order: 1,
    },
    {
      name: 'Chorale',
      description: 'Un choeur au service de la Parole, pour edifier et evangeliser.',
      mission: 'Repeter chaque semaine et accompagner les grands rendez-vous de l eglise.',
      day: 'Samedi',
      time: '15h00 — 17h30',
      location: 'Temple principal',
      order: 2,
    },
    {
      name: 'Communication et medias',
      description: 'Rendre visible l action de Dieu : photos, videos, sonorisation, reseaux.',
      mission:
        'Couvrir les cultes et evenements, produire des contenus edifiants et proteger les donnees personnelles.',
      day: 'Vendredi',
      time: '19h00 — 20h30',
      location: 'Regie media',
      order: 3,
    },
    {
      name: 'Intercession',
      description: 'Veiller dans la priere pour l eglise, la ville et les nations.',
      mission: 'Animer les nuits de priere, porter les sujets confidentiels et soutenir les familles.',
      day: 'Mardi',
      time: '05h00 — 06h30',
      location: 'Salle de priere',
      order: 4,
    },
    {
      name: 'Jeunesse',
      description: 'Accompagner les jeunes dans une foi vivante et engagee.',
      mission: 'Organiser rencontres, camps et mentorat, dans un cadre sain et fraternel.',
      day: 'Samedi',
      time: '16h00 — 18h00',
      location: 'Salle annexe',
      order: 5,
    },
    {
      name: 'Accueil',
      description: 'Faire de chaque personne accueillie une place trouvee dans la maison de Dieu.',
      mission: 'Preparer le temple, accueillir, orienter et suivre les nouveaux venus.',
      day: 'Dimanche',
      time: '07h15 — 11h00',
      location: 'Entree du temple',
      order: 6,
    },
    {
      name: 'Evangelisation',
      description: 'Aller vers les quartiers annoncer l Evangile avec respect et audace.',
      mission: 'Organiser les sorties, former les equipes et accompagner les nouveaux convertis.',
      day: 'Samedi',
      time: '09h00 — 12h00',
      location: 'Depart du temple',
      order: 7,
    },
    {
      name: 'Enseignement biblique',
      description: 'Affermir l eglise dans la saine doctrine et la lecture des Ecritures.',
      mission: 'Preparer les etudes bibliques, former les moniteurs et produire des supports fiables.',
      day: 'Mercredi',
      time: '18h30 — 20h00',
      location: 'Salle annexe',
      order: 8,
    },
    {
      name: 'Action sociale',
      description: 'Servir les vulnerables au nom du Christ, avec dignite et discretion.',
      mission: 'Identifier les besoins, organiser les visites et coordonner les collectes solidaires.',
      day: 'Dimanche',
      time: '12h00 — 13h00',
      location: 'Bureau diaconal',
      order: 9,
    },
    {
      name: 'Protocole',
      description: 'Assurer l ordre, la securite et la logistique des rassemblements.',
      mission: 'Organiser les places, accompagner les invites et veiller a la securite.',
      day: 'Dimanche',
      time: '07h00 — 11h30',
      location: 'Temple principal',
      order: 10,
    },
  ];

  const ids: Record<string, string> = {};
  for (const row of rows) {
    const { rows: inserted } = await db.query<{ id: string }>(
      `insert into public.departments
         (name, slug, description, mission, meeting_day, meeting_time, meeting_location, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (slug) do update set description = excluded.description
       returning id`,
      [
        row.name,
        slugify(row.name),
        row.description,
        row.mission,
        row.day,
        row.time,
        row.location,
        row.order,
      ],
    );
    ids[slugify(row.name)] = inserted[0].id;
  }
  return ids;
}

async function seedUser(user: SeedUser, password: string | null): Promise<string> {
  const db = getDatabase();
  const existing = await db.query<{ id: string }>(
    'select id from public.profiles where lower(email) = lower($1)',
    [user.email],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const hash = password ? await hashPassword(password) : null;
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), $3) returning id`,
      [
        user.email,
        hash,
        JSON.stringify({ first_name: user.firstName, last_name: user.lastName }),
      ],
    );
    const id = rows[0].id;
    await tx.query(
      `insert into public.profiles
         (id, email, first_name, last_name, city, phone, profession, status, role,
          submitted_at, reviewed_at, consent_photos)
       values ($1,$2,$3,$4,$5,$6,$7,$8::public.member_status,$9::public.app_role,
         case when $8::text = 'profile_incomplete' then null else now() end,
         case when $8::text in ('approved','rejected','suspended') then now() else null end,
         true)`,
      [
        id,
        user.email,
        user.firstName,
        user.lastName,
        user.city,
        user.phone,
        user.profession,
        user.status,
        user.role,
      ],
    );
    await tx.query(
      `insert into public.membership_history (profile_id, status, note)
       values ($1, $2::public.member_status, 'Donnees de demonstration')`,
      [id, user.status],
    );
    return id;
  });
}

async function seedAlbums(): Promise<void> {
  const db = getDatabase();
  const existing = await db.query<{ total: string }>('select count(*)::text as total from public.albums');
  if (Number(existing.rows[0]?.total ?? 0) > 0) return;

  const albums = [
    {
      title: 'Culte de celebration — Octobre',
      description:
        'Retour en images sur un dimanche de louange, d ecoute de la Parole et de ferveur.',
      category: 'Culte',
      access: 'public' as const,
      status: 'published' as const,
      eventDate: daysAgo(12),
      photos: 6,
    },
    {
      title: 'Retraite des jeunes — Abidjan',
      description: 'Trois jours de retraite, de partage et de priere pour la jeunesse de l eglise.',
      category: 'Jeunesse',
      access: 'members' as const,
      status: 'published' as const,
      eventDate: daysAgo(40),
      photos: 4,
    },
    {
      title: 'Baptemes — Promotion privee',
      description: 'Album restreint : acces reserve aux personnes autorisees par l equipe media.',
      category: 'Bapteme',
      access: 'restricted' as const,
      status: 'published' as const,
      eventDate: daysAgo(70),
      photos: 3,
    },
    {
      title: 'Preparation de la convention',
      description: 'Brouillon en cours de tri par l equipe media.',
      category: 'Evenement',
      access: 'members' as const,
      status: 'draft' as const,
      eventDate: null,
      photos: 2,
    },
  ];

  const storage = getStorage();
  let paletteIndex = 0;

  for (const album of albums) {
    const { rows } = await db.query<{ id: string; slug: string }>(
      `insert into public.albums
         (title, slug, description, category, event_date, access, status, published_at)
       values ($1,$2,$3,$4,$5::date,$6::public.album_access_level,$7::public.album_status,
         case when $7::text = 'published' then now() - interval '2 days' else null end)
       returning id, slug`,
      [
        album.title,
        slugify(album.title),
        album.description,
        album.category,
        album.eventDate,
        album.access,
        album.status,
      ],
    );
    const albumRow = rows[0];
    let coverId: string | null = null;

    for (let index = 0; index < album.photos; index += 1) {
      const palette = PALETTES[paletteIndex % PALETTES.length];
      paletteIndex += 1;
      const png = generateGradientPng(1280, 853, palette[0], palette[1], index + 1);
      const storagePath = `albums/${albumRow.id}/${slugify(album.title)}-${index + 1}.png`;
      await storage.save(storagePath, png, 'image/png');
      const { rows: photoRows } = await db.query<{ id: string }>(
        `insert into public.photos
           (album_id, storage_path, file_name, mime_type, size_bytes, caption, taken_at, sort_order)
         values ($1,$2,$3,'image/png',$4,$5, now() - ($6 || ' days')::interval, $7)
         returning id`,
        [
          albumRow.id,
          storagePath,
          `${slugify(album.title)}-${index + 1}.png`,
          png.length,
          `${album.title} — photo ${index + 1}`,
          String(5 + index),
          index,
        ],
      );
      if (!coverId) coverId = photoRows[0].id;
    }

    if (coverId) {
      await db.query('update public.albums set cover_photo_id = $2 where id = $1', [
        albumRow.id,
        coverId,
      ]);
    }
  }
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function seedContent(departmentIds: Record<string, string>): Promise<void> {
  const db = getDatabase();

  const settings = await db.query<{ total: string }>(
    'select count(*)::text as total from public.church_settings',
  );
  if (Number(settings.rows[0]?.total ?? 0) > 0) {
    await db.query(
      `update public.church_settings set
         church_name = 'La Forteresse de l''Éternel',
         slogan = 'Un refuge, une famille, une mission',
         tagline = 'Église évangélique à Abidjan — un lieu où chacun est accueilli, formé et envoyé.',
         about = 'La Forteresse de l''Éternel est une église évangélique née d''un petit groupe de prière à Abidjan. Nous croyons que la Parole de Dieu transforme les vies, restaure les familles et redonne espérance aux quartiers. Notre assemblée rassemble des hommes, des femmes et des jeunes de toutes origines, unis par la foi en Jésus-Christ.',
         vision = 'Être une église où chaque personne rencontre la présence de Dieu, grandit dans la Parole et devient actrice de la mission dans sa famille, son quartier et sa ville.',
         mission = 'Accueillir sans condition, enseigner la saine doctrine, former des disciples, servir les plus vulnérables et annoncer l''Évangile avec respect et courage.',
         address = 'Rue des Palmiers, Cocody Angré',
         city = 'Abidjan',
         country = 'Côte d''Ivoire',
         phone = '+225 07 00 00 00 00',
         whatsapp = '+225 07 00 00 00 00',
         email = 'contact@laforteresse.example',
         social_links = $1::jsonb,
         service_times = $2::jsonb
       where id = 1`,
      [
        JSON.stringify({
          facebook: 'https://facebook.com/laforteressedeleternel',
          youtube: 'https://youtube.com/@laforteressedeleternel',
          instagram: 'https://instagram.com/laforteressedeleternel',
        }),
        JSON.stringify([
          {
            label: 'Culte de célébration',
            day: 'Dimanche',
            time: '08h00 — 10h30',
            location: 'Temple principal',
          },
          {
            label: 'Culte du soir',
            day: 'Dimanche',
            time: '17h00 — 19h00',
            location: 'Temple principal',
          },
          {
            label: 'Étude biblique',
            day: 'Mercredi',
            time: '18h30 — 20h00',
            location: 'Salle annexe',
          },
          {
            label: 'Nuit de prière',
            day: 'Vendredi',
            time: '21h00 — 00h00',
            location: 'Temple principal',
          },
        ]),
      ],
    );
  }

  const sermons = await db.query<{ total: string }>(
    'select count(*)::text as total from public.sermons',
  );
  if (Number(sermons.rows[0]?.total ?? 0) === 0) {
    const items = [
      {
        title: 'La forteresse, c est Lui',
        speaker: 'Pasteur Emmanuel Bationo',
        series: 'Refuges et promesses',
        scripture: 'Psaume 18 : 1-3',
        summary:
          'Quand tout vacille, Dieu demeure un rocher. Cette predication explore la confiance concrete au quotidien.',
        date: daysAgo(7),
      },
      {
        title: 'Une maison de priere pour les nations',
        speaker: 'Pasteur Emmanuel Bationo',
        series: 'Refuges et promesses',
        scripture: 'Ésaïe 56 : 7',
        summary:
          'La priere n est pas une activite annexe : elle est la respiration de l eglise et la porte ouverte aux nations.',
        date: daysAgo(21),
      },
      {
        title: 'Servir sans bruit',
        speaker: 'Sœur Rachelle Nguessan',
        series: 'Le discipulat ordinaire',
        scripture: 'Marc 10 : 43-45',
        summary:
          'Le service discret faconne un caractere solide. Un appel a la fidelite dans les petites choses.',
        date: daysAgo(35),
      },
    ];
    for (const item of items) {
      await db.query(
        `insert into public.sermons
           (title, slug, speaker, series, scripture, summary, preached_on, is_published)
         values ($1,$2,$3,$4,$5,$6,$7::date,true)`,
        [
          item.title,
          slugify(item.title),
          item.speaker,
          item.series,
          item.scripture,
          item.summary,
          item.date,
        ],
      );
    }
  }

  const events = await db.query<{ total: string }>(
    'select count(*)::text as total from public.events',
  );
  if (Number(events.rows[0]?.total ?? 0) === 0) {
    const items = [
      {
        title: 'Convention annuelle — Foi et persévérance',
        description:
          'Trois jours de conférences, d ateliers et de veillée. Inscrivez-vous pour recevoir les informations pratiques et le programme détaillé.',
        category: 'Convention',
        location: 'Temple principal — Cocody',
        startsAt: futureIso(18, 9),
        endsAt: futureIso(20, 17),
        capacity: 400,
        registrationOpen: true,
      },
      {
        title: 'Soirée de louange et adoration',
        description: 'Une soirée entièrement consacrée à la louange, avec la chorale et la jeunesse.',
        category: 'Louange',
        location: 'Temple principal — Cocody',
        startsAt: futureIso(6, 19),
        endsAt: futureIso(6, 22),
        capacity: 250,
        registrationOpen: true,
      },
      {
        title: 'Séminaire couples et familles',
        description:
          'Un samedi pour consolider la communication et la paix dans le foyer. Places limitées.',
        category: 'Famille',
        location: 'Salle annexe',
        startsAt: futureIso(27, 9),
        endsAt: futureIso(27, 15),
        capacity: 120,
        registrationOpen: true,
      },
      {
        title: "Journée de l'enfant",
        description: 'Jeux, ateliers créatifs et enseignement pour les enfants de 4 à 12 ans.',
        category: 'Famille',
        location: 'Cour du temple',
        startsAt: futureIso(-21, 9),
        endsAt: futureIso(-21, 15),
        capacity: null,
        registrationOpen: false,
      },
    ];
    for (const item of items) {
      await db.query(
        `insert into public.events
           (title, slug, description, category, location, starts_at, ends_at, capacity,
            registration_open, is_published)
         values ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,true)`,
        [
          item.title,
          slugify(item.title),
          item.description,
          item.category,
          item.location,
          item.startsAt,
          item.endsAt,
          item.capacity,
          item.registrationOpen,
        ],
      );
    }
  }

  const announcements = await db.query<{ total: string }>(
    'select count(*)::text as total from public.announcements',
  );
  if (Number(announcements.rows[0]?.total ?? 0) === 0) {
    const items = [
      {
        title: 'Convention annuelle : inscriptions ouvertes',
        body: 'Les inscriptions pour la convention annuelle sont ouvertes sur la page Événements. Pensez à réserver votre place avant le 15 du mois.',
        audience: 'public',
        pinned: true,
      },
      {
        title: 'Soirée de prière pour les familles',
        body: 'Vendredi à 21h00 : veillée de prière pour les familles, les jeunes et la ville. Ouvert à tous.',
        audience: 'public',
        pinned: false,
      },
      {
        title: 'Réunion des responsables de départements',
        body: 'Les responsables et assistants de départements se retrouvent samedi à 16h00 en salle annexe. Présence indispensable.',
        audience: 'members',
        pinned: false,
      },
    ];
    for (const item of items) {
      await db.query(
        `insert into public.announcements (title, body, audience, is_pinned, published_at)
         values ($1,$2,$3,$4, now() - interval '1 day')`,
        [item.title, item.body, item.audience, item.pinned],
      );
    }
  }

  const testimonies = await db.query<{ total: string }>(
    'select count(*)::text as total from public.testimonies',
  );
  if (Number(testimonies.rows[0]?.total ?? 0) === 0) {
    const items = [
      {
        author: 'Marie K.',
        title: 'Une paix retrouvée dans la maison',
        body: 'Après plusieurs mois de tensions, nous avons commencé à prier ensemble chaque soir. Dieu a restauré la paix dans notre foyer, doucement mais réellement.',
        status: 'approved',
      },
      {
        author: 'Un jeune du quartier',
        title: 'Une orientation inattendue',
        body: 'Je cherchais un stage sans espoir. Après la prière du mercredi, une porte s est ouverte dans une entreprise à deux rues de chez moi.',
        status: 'approved',
      },
      {
        author: 'Jean Y.',
        title: 'Guérison après la veillée',
        body: 'Je suis venu à la veillée avec de fortes douleurs. Depuis ce soir-là, je dors sans douleur. Je rends grâce à Dieu.',
        status: 'pending',
      },
    ];
    for (const item of items) {
      await db.query(
        `insert into public.testimonies (author_name, title, body, status, is_public, moderated_at)
         values ($1,$2,$3,$4::public.testimony_status,true,
                 case when $4::text = 'approved' then now() else null end)`,
        [item.author, item.title, item.body, item.status],
      );
    }
  }

  const prayers = await db.query<{ total: string }>(
    'select count(*)::text as total from public.prayer_requests',
  );
  if (Number(prayers.rows[0]?.total ?? 0) === 0) {
    await db.query(
      `insert into public.prayer_requests (full_name, email, category, message, is_private)
       values
         ('Visiteur anonyme', null, 'Sante', 'Priere pour une guerison et pour la paix dans ma famille.', true),
         ('Esther D.', 'esther@example.test', 'Famille', 'Priere pour mon mari et nos deux enfants.', true)`,
    );
  }

  // Membres de departements et demandes
  if (Object.keys(departmentIds).length > 0) {
    const linked = await db.query<{ total: string }>(
      'select count(*)::text as total from public.department_members',
    );
    if (Number(linked.rows[0]?.total ?? 0) === 0) {
      const { rows: profiles } = await db.query<{ id: string; first_name: string; status: string }>(
        'select id, first_name, status from public.profiles order by created_at asc',
      );
      const approved = profiles.filter((profile) => profile.status === 'approved');
      const musicId = departmentIds['musique-et-louange'];
      const mediaId = departmentIds['communication-et-medias'];
      const youthId = departmentIds['jeunesse'];

      if (approved[0] && musicId) {
        await db.query(
          `insert into public.department_members (department_id, profile_id, member_role)
           values ($1,$2,'member') on conflict do nothing`,
          [musicId, approved[0].id],
        );
      }
      if (approved[1] && musicId) {
        await db.query(
          `insert into public.department_members (department_id, profile_id, member_role)
           values ($1,$2,'leader') on conflict do nothing`,
          [musicId, approved[1].id],
        );
        await db.query('update public.departments set leader_id = $2 where id = $1', [
          musicId,
          approved[1].id,
        ]);
      }
      if (approved[2] && mediaId) {
        await db.query(
          `insert into public.department_members (department_id, profile_id, member_role)
           values ($1,$2,'leader') on conflict do nothing`,
          [mediaId, approved[2].id],
        );
        await db.query('update public.departments set leader_id = $2 where id = $1', [
          mediaId,
          approved[2].id,
        ]);
      }

      const pending = profiles.filter((profile) => profile.status === 'pending_review');
      if (pending[0] && youthId) {
        await db.query(
          `insert into public.department_requests (department_id, profile_id, message)
           values ($1,$2,'Je souhaite servir dans la jeunesse.')`,
          [youthId, pending[0].id],
        );
      }
    }
  }
}

function futureIso(days: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function main() {
  const db = getDatabase();
  const force = process.argv.includes('--force');
  await runMigrations({ silent: true });

  const marker = await db.query<{ total: string }>(
    'select count(*)::text as total from public.departments',
  );
  const alreadySeeded = Number(marker.rows[0]?.total ?? 0) > 0;

  if (alreadySeeded && !force && !env.SEED_DEMO_DATA) {
    console.log('[seed] donnees deja presentes — utilisez --force pour re-seeder.');
    await closeDatabase();
    return;
  }

  if (!env.SEED_DEMO_DATA && !force && !process.argv.includes('--demo')) {
    console.log(
      '[seed] SEED_DEMO_DATA=false : aucun jeu de demonstration ajoute.\n' +
        'Activez SEED_DEMO_DATA=true dans backend/.env ou lancez `npm run db:seed -- --force`.',
    );
    await closeDatabase();
    return;
  }

  console.log('[seed] insertion des donnees de demonstration...');
  const departmentIds = await seedDepartments();

  const demoPassword =
    process.env.SEED_DEMO_PASSWORD && process.env.SEED_DEMO_PASSWORD.length >= 10
      ? process.env.SEED_DEMO_PASSWORD
      : randomBytes(12).toString('base64url');
  const exposePassword = !process.env.SEED_DEMO_PASSWORD;

  for (const user of DEMO_USERS) {
    const id = await seedUser(user, demoPassword);
    if (user.role === 'media') {
      const mediaId = departmentIds['communication-et-medias'];
      if (mediaId) {
        await db.query(
          `insert into public.department_members (department_id, profile_id, member_role)
           values ($1,$2,'leader') on conflict do nothing`,
          [mediaId, id],
        );
      }
    }
  }

  await seedContent(departmentIds);
  await seedAlbums();

  console.log('[seed] termine.');
  console.log(`[seed] comptes de demonstration : *@${DEMO_EMAIL_DOMAIN} (${DEMO_USERS.length})`);
  if (exposePassword) {
    console.log(`[seed] mot de passe commun des comptes de demonstration : ${demoPassword}`);
    console.log('[seed] ces comptes ne doivent exister qu en developpement.');
  }
  console.log(
    '[seed] administrateur : lancez `npm run create-admin -- <email> <mot-de-passe>` (aucun admin par defaut).',
  );

  await closeDatabase();
}

main().catch(async (error) => {
  console.error('[seed] echec', error);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
