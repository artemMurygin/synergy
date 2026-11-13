import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { queueQuery } from "@/features/decision";
import { useSession } from "@/features/auth";
import { cn } from "@/lib/utils";

const COMMON = [
  { to: "/ideas/new", label: "Новая идея" },
  { to: "/requests", label: "Мои заявки" },
];
const DEVELOPER = [
  { to: "/queue", label: "Очередь" },
  { to: "/skills", label: "Навыки" },
];

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Icon({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Bulb({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Icon>
  );
}

function Mark({ size, icon }: { size: number; icon: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-sm bg-brand-red text-white"
      style={{ width: size, height: size }}
    >
      <Bulb size={icon} />
    </span>
  );
}

function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-[13px] font-semibold text-ink-80"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 items-center rounded-pill bg-brand-red px-[7px] text-[11px] font-bold text-white">
      {count}
    </span>
  );
}

const LogoutIcon = () => (
  <Icon size={18}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Icon>
);

/** Top bar: brand, sections by role, the user and logout; a menu button on narrow screens. */
export function NavMenu() {
  const { profile, roles, logout } = useSession();
  const [open, setOpen] = useState(false);
  const isDeveloper = roles.includes("developer");
  const queue = useQuery({ ...queueQuery(0), enabled: isDeveloper });
  const queueCount = queue.data?.total ?? 0;
  const items = isDeveloper ? [...COMMON, ...DEVELOPER] : COMMON;
  const roleLabel = isDeveloper ? "разработчик" : "сотрудник";
  const initials = (profile?.login ?? "").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="hidden h-16 items-center gap-10 px-8 lg:flex">
        <div className="flex items-center gap-2.5">
          <Mark size={32} icon={18} />
          <div className="flex min-w-[269px] flex-col">
            <p className="font-display text-[17px] leading-[22px] font-bold text-ink">
              Портал разработки ИИ-агентов
            </p>
            <p className="text-[11px] leading-[13px] text-ink-60">Synergy</p>
          </div>
        </div>
        <nav aria-label="Разделы" className="h-full flex-1">
          <ul className="flex h-full gap-7">
            {items.map((item) => (
              <li key={item.to} className="h-full">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "relative box-border flex h-full items-center gap-2 border-b-2 border-transparent text-sm leading-4 font-semibold text-ink-60 hover:text-ink",
                      FOCUS,
                      isActive && "border-brand-red text-ink",
                    )
                  }
                >
                  {item.label}
                  {item.to === "/queue" && queueCount > 0 ? (
                    <CountBadge count={queueCount} />
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <Avatar initials={initials} size={36} />
          <div className="flex flex-col gap-px">
            <span className="max-w-40 truncate text-[13px] leading-[15px] font-semibold text-ink">
              {profile?.login}
            </span>
            <span className="text-[11px] leading-[13px] text-ink-60">
              {roleLabel}
            </span>
          </div>
          <button
            type="button"
            aria-label="Выйти"
            title="Выйти"
            onClick={() => void logout()}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md text-ink-60 hover:bg-surface-sunken hover:text-ink",
              FOCUS,
            )}
          >
            <LogoutIcon />
          </button>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Mark size={28} icon={16} />
          <p className="font-display text-base leading-5 font-bold text-ink">
            Портал разработки
          </p>
          <div className="flex-1" />
          <Avatar initials={initials} size={32} />
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md text-ink",
              FOCUS,
            )}
          >
            <Icon size={20}>
              {open ? (
                <>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </>
              ) : (
                <>
                  <path d="M4 12h16" />
                  <path d="M4 6h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </Icon>
          </button>
        </div>
        {open ? (
          <div id="mobile-menu" className="border-t border-border px-4 py-3">
            <p className="pb-2 text-[13px] text-ink-60">
              <span className="font-semibold text-ink">{profile?.login}</span> ·{" "}
              {roleLabel}
            </p>
            <nav aria-label="Разделы">
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex h-11 items-center gap-2 border-l-2 border-transparent pl-3 text-sm font-semibold text-ink-60",
                          FOCUS,
                          isActive && "border-brand-red text-ink",
                        )
                      }
                    >
                      {item.label}
                      {item.to === "/queue" && queueCount > 0 ? (
                        <CountBadge count={queueCount} />
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <button
              type="button"
              onClick={() => void logout()}
              className={cn(
                "mt-2 flex h-11 w-full items-center gap-2 pl-3 text-sm font-semibold text-ink-60 hover:text-ink",
                FOCUS,
              )}
            >
              <LogoutIcon />
              Выйти
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
