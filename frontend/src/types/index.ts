/** Types partages avec l'API (contrats JSON en camelCase). */

export type AppRole = 'member' | 'department_leader' | 'media' | 'admin';
export type MemberStatus = 'profile_incomplete' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type AlbumAccess = 'public' | 'members' | 'restricted';
export type AlbumStatus = 'draft' | 'published' | 'archived';

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  whatsapp?: string;
  tiktok?: string;
  [key: string]: string | undefined;
}

export interface ServiceTime {
  label?: string;
  day?: string;
  time?: string;
  location?: string;
  [key: string]: string | undefined;
}

export interface ChurchSettings {
  churchName: string;
  slogan: string;
  tagline: string | null;
  about: string | null;
  vision: string | null;
  mission: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  socialLinks: SocialLinks;
  serviceTimes: ServiceTime[];
  logoUrl: string | null;
  heroUrl: string | null;
  colors: { primary: string; royal: string; accent: string };
  updatedAt: string;
}

export interface Permissions {
  isAdmin: boolean;
  isMedia: boolean;
  isApproved: boolean;
  canAccessMembersArea: boolean;
  canManageGallery: boolean;
  canManageDepartments: boolean;
}

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string | null;
  city?: string | null;
  profession?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  departmentInterestId?: string | null;
  status?: MemberStatus;
  role?: AppRole;
  consentPhotos?: boolean;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string;
}

export interface Session {
  profile: Profile | null;
  permissions: Permissions | null;
  status: MemberStatus | null;
}

export interface DepartmentLeader {
  id: string;
  fullName: string;
}

export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  imageUrl: string | null;
  leader: DepartmentLeader | null;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingLocation: string | null;
  contact: string | null;
  sortOrder?: number;
  isActive?: boolean;
  archivedAt?: string | null;
  memberCount: number;
  createdAt?: string;
  /** Renseigné par l'API pour les responsables de département (non-admin). */
  canManage?: boolean;
}

export interface DepartmentMember {
  profileId: string;
  fullName: string;
  city: string | null;
  role: string;
  status: string;
  /** Début de la période d'exercice en cours (AAAA-MM-JJ). */
  startedOn: string | null;
  /** Intitulé libre de la fonction (« Responsable louange »…). */
  functionTitle: string | null;
  joinedAt: string;
}

/** Ligne d'historique des nominations d'un département. */
export interface DepartmentNomination {
  id: string;
  departmentId: string | null;
  departmentName: string;
  profileId: string;
  fullName: string;
  memberRole: string;
  functionTitle: string | null;
  startedOn: string;
  endedOn: string | null;
  status: 'active' | 'ended';
  endReason: string | null;
  appointedByName: string | null;
  createdAt: string;
}

export interface DepartmentRequest {
  id: string;
  departmentId: string;
  departmentName: string;
  departmentSlug?: string;
  departmentImageUrl?: string | null;
  profileId?: string;
  memberName?: string;
  memberEmail?: string;
  /** Champ renvoyé par l'API d'administration. */
  email?: string;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
  decisionNote?: string | null;
  hasPendingRequest?: boolean;
}

export interface Photo {
  id: string;
  url: string | null;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  takenAt: string | null;
  sortOrder?: number;
  createdAt?: string;
}

export interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  eventDate: string | null;
  access: AlbumAccess;
  status: AlbumStatus;
  coverUrl: string | null;
  photoCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  photos?: Photo[];
  downloadEnabled: boolean;
}

export interface AlbumGrant {
  profileId: string;
  fullName: string;
  email?: string;
  createdAt: string;
}

export interface Sermon {
  id: string;
  title: string;
  slug: string;
  speaker: string;
  series: string | null;
  scripture: string | null;
  summary: string | null;
  preachedOn: string | null;
  audioUrl: string | null;
  documentUrl: string | null;
  videoUrl: string | null;
  isPublished: boolean;
  createdAt: string;
}

export interface ChurchEvent {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  registrationOpen: boolean;
  coverUrl: string | null;
  isPublished: boolean;
  registeredCount: number;
  remainingSeats: number | null;
  isRegistered?: boolean;
  createdAt?: string;
}

export interface Registration {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  seats: number;
  status: string;
  note?: string | null;
  createdAt: string;
}

/** Alias historique utilisé par les écrans d'administration. */
export type EventRegistration = Registration;

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'public' | 'members';
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface Testimony {
  id: string;
  authorName: string;
  title: string;
  body: string;
  status?: 'pending' | 'approved' | 'rejected';
  isPublic?: boolean;
  createdAt?: string;
  moderatedAt?: string | null;
}

export interface PrayerRequest {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  message: string;
  isAnonymous: boolean;
  status: 'new' | 'in_prayer' | 'closed';
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface MemberListItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  city: string | null;
  profession: string | null;
  status: MemberStatus;
  role: AppRole;
  photoUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MembershipHistoryEntry {
  id?: number;
  status: MemberStatus;
  note: string | null;
  createdAt: string;
  actorEmail?: string | null;
  actorName?: string | null;
}

export interface MemberDetail extends MemberListItem {
  bio: string | null;
  consentPhotos: boolean;
  departmentInterestId: string | null;
  decisionNote: string | null;
  lastLoginAt?: string | null;
  history: MembershipHistoryEntry[];
  departments: { id: string; name: string; slug?: string; role: string; joinedAt?: string }[];
}

export interface AuditLog {
  id: number | string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TakedownRequest {
  id: string;
  photoId: string | null;
  albumId: string | null;
  requesterName: string;
  requesterEmail: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface FinanceSummary {
  contributions: number;
  expenses: number;
  balance: number;
  currency: string;
  byCategory: { category: string; total: number }[];
}

export interface Contribution {
  id: string;
  donorName: string;
  amount: number;
  currency: string;
  method: string;
  category: string;
  receivedOn: string;
  note: string | null;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  currency: string;
  category: string;
  spentOn: string;
  note: string | null;
}

export interface AdminDashboard {
  members: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    suspended: number;
    incomplete: number;
  };
  departments: { active: number; leadersActive: number };
  albums: { total: number; published: number; photos: number };
  sermons: { published: number };
  events: { upcoming: number };
  prayerRequests: { new: number };
  testimonies: { pending: number };
  takedownRequests: { pending: number };
  finance: { contributions: number; expenses: number; balance: number; currency: string };
  signupTrend: { month: string; total: number }[];
  pendingMembers: {
    id: string;
    fullName: string;
    email: string;
    city: string | null;
    submittedAt: string | null;
  }[];
  recentActivity: {
    action: string;
    entityType: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[];
}

export interface MemberDashboard {
  profile: Profile;
  departments: { id: string; name: string; slug: string; role: string }[];
  unreadNotifications: number;
  upcomingEvents: ChurchEvent[];
  announcements: Announcement[];
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    details?: { issues?: { path: string; message: string }[] } | unknown;
  };
}
