import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, LogIn, MailCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';

const emailField = z.string().trim().min(3).email('Adresse e-mail invalide.');
const passwordField = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
  .max(200)
  .regex(/[A-Za-z]/, 'Il doit contenir au moins une lettre.')
  .regex(/[0-9]/, 'Il doit contenir au moins un chiffre.');

/* Connexion ---------------------------------------------------------------- */

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Mot de passe requis.'),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const submit = async (values: LoginForm) => {
    setError(null);
    try {
      const session = await login(values);
      const target = redirect && redirect.startsWith('/') ? redirect : null;
      if (target) {
        navigate(target, { replace: true });
      } else if (session.profile?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (session.permissions?.canAccessMembersArea) {
        navigate('/espace-membre', { replace: true });
      } else {
        navigate('/mon-inscription', { replace: true });
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Connexion impossible, réessayez.';
      setError(message);
      toast.error(message);
    }
  };

  return (
    <AuthShell
      title="Connexion à votre espace"
      description="Entrez vos identifiants pour accéder à votre espace membre ou à l’administration."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-semibold text-brand hover:text-brand-royal">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Input
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="relative">
          <Input
            label="Mot de passe"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-9 right-3 rounded p-1 text-muted hover:text-brand"
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <Link to="/mot-de-passe-oublie" className="text-sm text-brand hover:text-brand-royal">
            Mot de passe oublié ?
          </Link>
          <Link to="/mon-inscription" className="text-sm text-muted hover:text-brand">
            Suivre mon inscription
          </Link>
        </div>
        <Button type="submit" block loading={isSubmitting} icon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
          Se connecter
        </Button>
      </form>
    </AuthShell>
  );
}

/* Inscription -------------------------------------------------------------- */

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Prénom requis.').max(80),
    lastName: z.string().trim().min(2, 'Nom requis.').max(80),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Confirmez votre mot de passe.'),
    phone: z.string().trim().max(40).optional(),
    city: z.string().trim().max(120).optional(),
    acceptPrivacy: z.boolean().refine((value) => value === true, {
      message: 'Vous devez accepter la politique de confidentialité.',
    }),
    consentPhotos: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { consentPhotos: false, acceptPrivacy: false },
  });

  const submit = async (values: RegisterForm) => {
    setError(null);
    try {
      await createAccount({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        city: values.city || undefined,
      });
      if (values.consentPhotos) {
        await api.patch('/auth/profile', { consentPhotos: true }).catch(() => undefined);
      }
      toast.success('Compte créé ! Complétez votre profil pour envoyer votre demande.');
      navigate('/mon-inscription', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fieldErrors = caught.fieldErrors;
        let handled = false;
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (['firstName', 'lastName', 'email', 'password', 'phone', 'city'].includes(field)) {
            setFieldError(field as keyof RegisterForm, { message });
            handled = true;
          }
        }
        setError(caught.message);
        if (!handled) toast.error(caught.message);
      } else {
        setError('Inscription impossible, réessayez.');
      }
    }
  };

  return (
    <AuthShell
      title="Créer mon compte"
      description="Quelques informations suffisent pour commencer votre parcours d’adhésion."
      footer={
        <>
          Déjà inscrit ?{' '}
          <Link to="/connexion" className="font-semibold text-brand hover:text-brand-royal">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Prénom" required autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Nom" required autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <Input
          label="Adresse e-mail"
          type="email"
          required
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Téléphone" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
          <Input label="Ville / commune" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
        </div>
        <Input
          label="Mot de passe"
          type="password"
          required
          autoComplete="new-password"
          hint="10 caractères minimum, avec au moins une lettre et un chiffre."
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirmer le mot de passe"
          type="password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Checkbox
          label={
            <>
              J’accepte la{' '}
              <Link to="/confidentialite" className="font-medium text-brand underline">
                politique de confidentialité
              </Link>{' '}
              et le traitement de mes données.
            </>
          }
          error={errors.acceptPrivacy?.message}
          {...register('acceptPrivacy')}
        />
        <Checkbox
          label="J’autorise l’église à utiliser mon image sur le site (facultatif)"
          {...register('consentPhotos')}
        />
        <Button type="submit" block loading={isSubmitting} icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
          Créer mon compte
        </Button>
      </form>
    </AuthShell>
  );
}

/* Mot de passe oublié ------------------------------------------------------ */

const forgotSchema = z.object({ email: emailField });
type ForgotForm = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const submit = async (values: ForgotForm) => {
    try {
      const result = await api.post<{ devResetUrl?: string }>('/auth/forgot-password', { email: values.email });
      setSent(true);
      setDevLink(result.devResetUrl ?? null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Envoi impossible, réessayez.');
    }
  };

  return (
    <AuthShell
      title="Mot de passe oublié"
      description="Indiquez votre adresse e-mail : nous vous enverrons un lien pour définir un nouveau mot de passe."
      footer={
        <Link to="/connexion" className="font-semibold text-brand hover:text-brand-royal">
          Retour à la connexion
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success" title="Demande enregistrée">
            Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être généré.
          </Alert>
          {devLink ? (
            <Alert tone="info" title="Mode développement">
              Aucun e-mail n’est envoyé en local. Utilisez ce lien :{' '}
              <a href={devLink} className="font-semibold break-all underline">
                {devLink}
              </a>
            </Alert>
          ) : null}
          <Button variant="outline" block onClick={() => setSent(false)}>
            Recommencer
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <Input
            label="Adresse e-mail"
            type="email"
            required
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" block loading={isSubmitting} icon={<MailCheck className="h-4 w-4" aria-hidden="true" />}>
            Recevoir le lien
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* Réinitialisation --------------------------------------------------------- */

const resetSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Confirmez votre mot de passe.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });
type ResetForm = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const submit = async (values: ResetForm) => {
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      toast.success('Mot de passe mis à jour. Vous pouvez vous connecter.');
      navigate('/connexion', { replace: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Réinitialisation impossible.');
    }
  };

  return (
    <AuthShell
      title="Nouveau mot de passe"
      description="Choisissez un mot de passe solide et unique pour votre compte."
      footer={
        <Link to="/connexion" className="font-semibold text-brand hover:text-brand-royal">
          Retour à la connexion
        </Link>
      }
    >
      {!token ? (
        <Alert tone="danger" title="Lien invalide">
          Ce lien de réinitialisation est incomplet. Demandez un nouveau lien depuis la page « Mot de passe oublié ».
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <Input
            label="Nouveau mot de passe"
            type="password"
            required
            autoComplete="new-password"
            hint="10 caractères minimum, avec au moins une lettre et un chiffre."
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirmer le mot de passe"
            type="password"
            required
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" block loading={isSubmitting} icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}>
            Enregistrer le mot de passe
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
