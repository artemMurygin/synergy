import { useEffect, useId, useState, type FormEvent } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuthErrorCode } from "./auth.api";

export interface LoginFormError {
  code: AuthErrorCode;
  retryAfterSec?: number;
}

export interface LoginFormProps {
  onSubmit: (login: string, password: string) => void;
  isSubmitting: boolean;
  error: LoginFormError | null;
  warning?: string;
  retryAfterSec?: number;
}

const COUNTDOWN_TICK_MS = 1000;

function resolveLockSec(
  error: LoginFormError | null,
  retryAfterSec?: number,
): number {
  const fromError =
    error?.code === "RATE_LIMITED" ? error.retryAfterSec : undefined;
  const resolved = fromError ?? retryAfterSec ?? 0;
  return resolved > 0 ? Math.ceil(resolved) : 0;
}

function useCountdown(initialSec: number): number {
  const [remainingSec, setRemainingSec] = useState(initialSec);

  useEffect(() => {
    setRemainingSec(initialSec);
    if (initialSec <= 0) return undefined;
    const timerId = setInterval(() => {
      setRemainingSec((current) => Math.max(0, current - 1));
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timerId);
  }, [initialSec]);

  return remainingSec;
}

interface NoticeProps {
  title: string;
  text: string;
}

function Notice({ title, text }: NoticeProps) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3"
    >
      <CircleAlert
        aria-hidden
        className="size-[18px] shrink-0 text-brand-red"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="text-xs leading-[1.4] text-[#3a3a3a]">{text}</p>
      </div>
    </div>
  );
}

export function LoginForm({
  onSubmit,
  isSubmitting,
  error,
  warning,
  retryAfterSec,
}: LoginFormProps) {
  const loginId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const lockSec = resolveLockSec(error, retryAfterSec);
  const remainingSec = useCountdown(lockSec);
  const isLocked = remainingSec > 0;
  const isInvalidCredentials = error?.code === "INVALID_CREDENTIALS";
  const isOtherError =
    error !== null && !isInvalidCredentials && error.code !== "RATE_LIMITED";
  const hasNotice = Boolean(warning) || isLocked || isOtherError;
  const isFormDisabled = isSubmitting || isLocked;
  const hasInput = login.trim() !== "" && password !== "";
  const canSubmit = hasInput && !isFormDisabled;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(login.trim(), password);
  };

  return (
    <div className="@container flex min-h-full w-full items-center justify-center bg-surface-alt">
      <div className="flex w-full justify-center p-8 @max-[600px]:p-0">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex w-full max-w-[440px] flex-col gap-7 rounded-lg border bg-surface p-10 @max-[600px]:gap-6 @max-[600px]:p-8"
        >
          <div className="flex flex-col gap-2">
            <span className="font-display text-[15px] font-bold text-brand-red @max-[600px]:hidden">
              Synergy
            </span>
            <h1 className="font-display text-[28px] font-bold text-ink @max-[600px]:text-[22px]">
              Вход в Control Center
            </h1>
            {hasNotice ? null : (
              <p className="text-sm leading-[1.4] text-ink-60">
                Введите логин и пароль, которые выдал администратор.
              </p>
            )}
          </div>

          {warning ? (
            <Notice
              title="Выход выполнен только на этом компьютере"
              text={warning}
            />
          ) : null}
          {isLocked ? (
            <Notice
              title="Слишком много попыток входа"
              text={`Повторите через ${remainingSec} с. Форма разблокируется автоматически.`}
            />
          ) : null}
          {isOtherError ? (
            <Notice
              title="Не удалось выполнить вход"
              text="Попробуйте ещё раз немного позже."
            />
          ) : null}

          <div className="flex flex-col gap-4">
            <div
              className={cn("flex flex-col gap-1.5", isLocked && "opacity-50")}
            >
              <label
                htmlFor={loginId}
                className="text-[13px] font-semibold text-ink"
              >
                Логин
              </label>
              <Input
                id={loginId}
                name="login"
                autoComplete="username"
                placeholder="name@synergy.ru"
                value={login}
                disabled={isFormDisabled}
                onChange={(event) => setLogin(event.target.value)}
                className={cn(
                  "h-[52px] rounded-md border-border-strong px-4 text-[15px] text-ink placeholder:text-ink-40",
                  isLocked && "disabled:opacity-100",
                )}
              />
            </div>
            <div
              className={cn("flex flex-col gap-1.5", isLocked && "opacity-50")}
            >
              <label
                htmlFor={passwordId}
                className="text-[13px] font-semibold text-ink"
              >
                Пароль
              </label>
              <div className="relative">
                <Input
                  id={passwordId}
                  name="password"
                  type={isPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  value={password}
                  disabled={isFormDisabled}
                  aria-invalid={isInvalidCredentials}
                  aria-describedby={isInvalidCredentials ? errorId : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  className={cn(
                    "h-[52px] rounded-md border-border-strong pl-4 pr-11 text-[15px] text-ink placeholder:text-ink-40",
                    isInvalidCredentials && "border-brand-red",
                    isLocked && "disabled:opacity-100",
                  )}
                />
                <button
                  type="button"
                  aria-label={
                    isPasswordVisible ? "Скрыть пароль" : "Показать пароль"
                  }
                  disabled={isFormDisabled}
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  className="absolute inset-y-0 right-4 flex items-center text-ink-60"
                >
                  {isPasswordVisible ? (
                    <EyeOff aria-hidden className="size-[18px]" />
                  ) : (
                    <Eye aria-hidden className="size-[18px]" />
                  )}
                </button>
              </div>
              {isInvalidCredentials ? (
                <p
                  id={errorId}
                  className="text-xs font-semibold text-brand-red"
                >
                  Неверный логин или пароль
                </p>
              ) : null}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "h-12 w-full rounded-lg px-6 text-[15px] font-semibold shadow-[0_8px_4px_rgba(102,0,0,0.2)]",
              isLocked &&
                "bg-surface-sunken text-ink-60 opacity-100 shadow-none disabled:opacity-100",
            )}
          >
            {isLocked ? `Повторить через ${remainingSec} с` : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
