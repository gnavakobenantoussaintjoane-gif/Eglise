import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';
import { MemberLayout } from '../layouts/MemberLayout';
import { AdminLayout } from '../layouts/AdminLayout';
import { FullPageLoader, RequireAdmin, RequireApproved, RequireAuth, RequireMedia, RequireStaff } from './guards';

/* Public */
import { HomePage } from '../pages/public/HomePage';
import { AboutPage } from '../pages/public/AboutPage';
import { SermonDetailPage, SermonsPage } from '../pages/public/SermonsPages';
import { EventDetailPage, EventsPage } from '../pages/public/EventsPages';
import { DepartmentDetailPage, DepartmentsPage } from '../pages/public/DepartmentsPages';
import { AlbumDetailPage, GalleryPage } from '../pages/public/GalleryPages';
import { AnnouncementsPage } from '../pages/public/AnnouncementsPage';
import { TestimoniesPage } from '../pages/public/TestimoniesPage';
import { PrayerPage } from '../pages/public/PrayerPage';
import { ContactPage } from '../pages/public/ContactPage';
import { PrivacyPage } from '../pages/public/PrivacyPage';
import { NotFoundPage } from '../pages/public/NotFoundPage';

/* Authentification */
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '../pages/auth/AuthPages';

/* Espace membre */
import { OnboardingPage } from '../pages/members/OnboardingPage';
import { MemberDashboardPage } from '../pages/members/MemberDashboardPage';
import { MemberProfilePage } from '../pages/members/MemberProfilePage';
import { MemberDepartmentsPage } from '../pages/members/MemberDepartmentsPage';
import { MemberAnnouncementsPage } from '../pages/members/MemberAnnouncementsPage';
import { MemberNotificationsPage } from '../pages/members/MemberNotificationsPage';
import { MemberEventsPage } from '../pages/members/MemberEventsPage';
import { MemberGalleryPage } from '../pages/members/MemberGalleryPage';
import { MemberTestimoniesPage } from '../pages/members/MemberTestimoniesPage';

/* Administration (chargement différé : le public ne télécharge pas le back-office) */
const AdminDashboardPage = lazy(() =>
  import('../pages/admin/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })),
);
const AdminMembersPage = lazy(() =>
  import('../pages/admin/AdminMembersPage').then((module) => ({ default: module.AdminMembersPage })),
);
const AdminEmailsPage = lazy(() =>
  import('../pages/admin/AdminEmailsPage').then((module) => ({ default: module.AdminEmailsPage })),
);
const AdminDepartmentsPage = lazy(() =>
  import('../pages/admin/AdminDepartmentsPage').then((module) => ({ default: module.AdminDepartmentsPage })),
);
const AdminGalleryPage = lazy(() =>
  import('../pages/admin/AdminGalleryPage').then((module) => ({ default: module.AdminGalleryPage })),
);
const AdminSermonsPage = lazy(() =>
  import('../pages/admin/AdminSermonsPage').then((module) => ({ default: module.AdminSermonsPage })),
);
const AdminEventsPage = lazy(() =>
  import('../pages/admin/AdminEventsPage').then((module) => ({ default: module.AdminEventsPage })),
);
const AdminAnnouncementsPage = lazy(() =>
  import('../pages/admin/AdminAnnouncementsPage').then((module) => ({ default: module.AdminAnnouncementsPage })),
);
const AdminPrayerPage = lazy(() =>
  import('../pages/admin/AdminPrayerPage').then((module) => ({ default: module.AdminPrayerPage })),
);
const AdminModerationPage = lazy(() =>
  import('../pages/admin/AdminModerationPage').then((module) => ({ default: module.AdminModerationPage })),
);
const AdminSettingsPage = lazy(() =>
  import('../pages/admin/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })),
);
const AdminFinancePage = lazy(() =>
  import('../pages/admin/AdminFinancePage').then((module) => ({ default: module.AdminFinancePage })),
);
const AdminAuditLogPage = lazy(() =>
  import('../pages/admin/AdminAuditLogPage').then((module) => ({ default: module.AdminAuditLogPage })),
);

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageLoader label="Chargement de l’espace d’administration…" />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Site public */}
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="a-propos" element={<AboutPage />} />
        <Route path="predications" element={<SermonsPage />} />
        <Route path="predications/:slug" element={<SermonDetailPage />} />
        <Route path="evenements" element={<EventsPage />} />
        <Route path="evenements/:slug" element={<EventDetailPage />} />
        <Route path="departements" element={<DepartmentsPage />} />
        <Route path="departements/:slug" element={<DepartmentDetailPage />} />
        <Route path="galerie" element={<GalleryPage />} />
        <Route path="galerie/:slug" element={<AlbumDetailPage />} />
        <Route path="annonces" element={<AnnouncementsPage />} />
        <Route path="temoignages" element={<TestimoniesPage />} />
        <Route path="priere" element={<PrayerPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="confidentialite" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Authentification */}
      <Route path="inscription" element={<RegisterPage />} />
      <Route path="connexion" element={<LoginPage />} />
      <Route path="mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
      <Route
        path="mon-inscription"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      {/* Espace membre (compte approuvé requis) */}
      <Route
        path="espace-membre"
        element={
          <RequireApproved>
            <MemberLayout />
          </RequireApproved>
        }
      >
        <Route index element={<MemberDashboardPage />} />
        <Route path="profil" element={<MemberProfilePage />} />
        <Route path="departements" element={<MemberDepartmentsPage />} />
        <Route path="annonces" element={<MemberAnnouncementsPage />} />
        <Route path="notifications" element={<MemberNotificationsPage />} />
        <Route path="galerie" element={<MemberGalleryPage />} />
        <Route path="evenements" element={<MemberEventsPage />} />
        <Route path="temoignages" element={<MemberTestimoniesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Espace média : gestion des albums déléguée à l'équipe média */}
      <Route
        path="media"
        element={
          <RequireMedia>
            <Deferred>
              <AdminGalleryPage />
            </Deferred>
          </RequireMedia>
        }
      />
      <Route
        path="media/galerie"
        element={
          <RequireMedia>
            <Deferred>
              <AdminGalleryPage />
            </Deferred>
          </RequireMedia>
        }
      />

      {/* Départements : responsables de département (RequireStaff) */}
      <Route
        path="departements/gestion"
        element={
          <RequireStaff>
            <Deferred>
              <AdminDepartmentsPage />
            </Deferred>
          </RequireStaff>
        }
      />

      {/* Administration */}
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route
          index
          element={
            <Deferred>
              <AdminDashboardPage />
            </Deferred>
          }
        />
        <Route
          path="membres"
          element={
            <Deferred>
              <AdminMembersPage />
            </Deferred>
          }
        />
        <Route
          path="departements"
          element={
            <Deferred>
              <AdminDepartmentsPage />
            </Deferred>
          }
        />
        <Route
          path="messagerie"
          element={
            <Deferred>
              <AdminEmailsPage />
            </Deferred>
          }
        />
        <Route
          path="galerie"
          element={
            <Deferred>
              <AdminGalleryPage />
            </Deferred>
          }
        />
        <Route
          path="predications"
          element={
            <Deferred>
              <AdminSermonsPage />
            </Deferred>
          }
        />
        <Route
          path="evenements"
          element={
            <Deferred>
              <AdminEventsPage />
            </Deferred>
          }
        />
        <Route
          path="annonces"
          element={
            <Deferred>
              <AdminAnnouncementsPage />
            </Deferred>
          }
        />
        <Route
          path="priere"
          element={
            <Deferred>
              <AdminPrayerPage />
            </Deferred>
          }
        />
        <Route
          path="temoignages"
          element={
            <Deferred>
              <AdminModerationPage />
            </Deferred>
          }
        />
        <Route
          path="moderation"
          element={<Navigate to="/admin/temoignages" replace />}
        />
        <Route
          path="parametres"
          element={
            <Deferred>
              <AdminSettingsPage />
            </Deferred>
          }
        />
        <Route
          path="finances"
          element={
            <Deferred>
              <AdminFinancePage />
            </Deferred>
          }
        />
        <Route
          path="journal"
          element={
            <Deferred>
              <AdminAuditLogPage />
            </Deferred>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
