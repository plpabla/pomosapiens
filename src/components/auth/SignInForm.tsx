import React, { useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

export default function SignInForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address";
    }
    if (!password) {
      next.password = "Password is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Your password"
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Signing in..." icon={<LogIn className="size-4" />}>
        Sign in
      </SubmitButton>

      <div className="relative my-2 flex items-center">
        <div className="border-charred flex-1 border-t" />
        <span className="text-ash mx-3 text-xs">or</span>
        <div className="border-charred flex-1 border-t" />
      </div>

      <a
        href="/api/auth/oauth"
        className="border-charred bg-ember text-off-white hover:bg-charred flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm transition"
      >
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </a>
    </form>
  );
}
