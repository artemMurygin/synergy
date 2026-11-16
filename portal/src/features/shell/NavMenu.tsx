import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router";
import { queueQuery } from "@/features/decision";
import { useSession } from "@/features/auth";
import { initials as initialsFor } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface Item {
  to: string;
  label: string;
  /** A sub-path that belongs to another item: this one is not active there although `to` is its prefix. */
  excludePath?: string;
}
interface Group {
  key: "main" | "developer" | "admin";
  /** Caption of the group in the mobile menu and `aria-label` of its list; the common group has no caption. */
  caption: string | null;
  items: Item[];
}

const MAIN: Group = {
  key: "main",
  caption: null,
  items: [
    { to: "/ideas/new", label: "Новая идея" },
    { to: "/requests", label: "Мои заявки" },
    { to: "/catalog", label: "Каталог" },
    { to: "/roadmap", label: "Роадмап" },
    { to: "/bugs", label: "Поддержка", excludePath: "/bugs/queue" },
  ],
};
const DEVELOPER: Group = {
  key: "developer",
  caption: "Разработка",
  items: [
    { to: "/queue", label: "Очередь" },
    { to: "/skills", label: "Навыки" },
    { to: "/bugs/queue", label: "Баги" },
    { to: "/archive", label: "Архив" },
  ],
};
const ADMIN: Group = {
  key: "admin",
  caption: "Администрирование",
  items: [
    { to: "/admin/employees", label: "Сотрудники" },
    { to: "/admin/departments", label: "Отделы" },
  ],
};

/** A nav link that stays inactive on the sub-path of a sibling item (`/bugs` on `/bugs/queue`). */
function SectionLink({
  item,
  className,
  onClick,
  children,
}: {
  item: Item;
  className: (active: boolean) => string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const excluded =
    item.excludePath !== undefined &&
    (pathname === item.excludePath || pathname.startsWith(`${item.excludePath}/`));
  if (excluded) {
    return (
      <Link to={item.to} onClick={onClick} className={className(false)}>
        {children}
      </Link>
    );
  }
  return (
    <NavLink to={item.to} onClick={onClick} className={({ isActive }) => className(isActive)}>
      {children}
    </NavLink>
  );
}

/** "разработчик, администратор": the roles are independent, so the label lists every one of them. */
function roleLabel(isDeveloper: boolean, isAdmin: boolean): string {
  const labels = [isDeveloper ? "разработчик" : null, isAdmin ? "администратор" : null].filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "сотрудник";
}

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

function Avatar({ initials, size, className }: { initials: string; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-[13px] font-semibold text-ink-80",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function CountBadge({ count, compact }: { count: number; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill bg-brand-red font-bold text-white",
        compact ? "h-[18px] px-1.5 text-[10px]" : "h-5 px-[7px] text-[11px]",
      )}
    >
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

/** Top bar: brand, sections by role in groups, the user and logout; a menu button on narrow screens. */
export function NavMenu() {
  const { profile, roles, logout } = useSession();
  const [open, setOpen] = useState(false);
  const isDeveloper = roles.includes("developer");
  const isAdmin = roles.includes("admin");
  const queue = useQuery({ ...queueQuery(0), enabled: isDeveloper });
  const queueCount = queue.data?.total ?? 0;
  const groups = [MAIN, ...(isDeveloper ? [DEVELOPER] : []), ...(isAdmin ? [ADMIN] : [])];
  const role = roleLabel(isDeveloper, isAdmin);
  const fullName = profile?.fullName || profile?.login || "";
  const initials = initialsFor(fullName);

  const badge = (item: Item, compact = false) =>
    item.to === "/queue" && queueCount > 0 ? <CountBadge count={queueCount} compact={compact} /> : null;

  return (
    <>
      <div className="hidden h-14 items-center gap-4 px-3 lg:flex">
        <NavLink
          to="/requests"
          className={cn("flex h-10 shrink-0 items-center gap-2 rounded-md", FOCUS)}
        >
          <Mark size={28} icon={16} />
          <span className="font-display text-[15px] leading-[19px] font-bold whitespace-nowrap text-ink">
            Портал<span className="hidden xl:inline"> разработки</span>
          </span>
        </NavLink>
        <nav aria-label="Разделы" className="h-full min-w-0 flex-1">
          <div className={cn("flex h-full items-stretch gap-3", isDeveloper && "xl:gap-6")}>
            {groups.map((group, index) => (
              <Fragment key={group.key}>
                {index > 0 ? (
                  <span aria-hidden="true" className="flex items-center">
                    <span className="h-4 w-px bg-border" />
                  </span>
                ) : null}
                <ul aria-label={group.caption ?? "Основное"} className={cn("flex h-full gap-3", isDeveloper && "xl:gap-6")}>
                  {group.items.map((item) => (
                    <li key={item.to} className="h-full">
                      <SectionLink
                        item={item}
                        className={(active) =>
                          cn(
                            "relative box-border flex h-full items-center gap-1.5 border-b-2 border-transparent text-[13px] leading-4 font-semibold whitespace-nowrap text-ink-60 hover:text-ink",
                            FOCUS,
                            active && "border-brand-red text-ink",
                          )
                        }
                      >
                        {item.label}
                        {badge(item, true)}
                      </SectionLink>
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
          </div>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <div title={role} className="flex h-10 items-center gap-2">
            <Avatar initials={initials} size={32} className="text-xs" />
            <span
              title={fullName}
              className="max-w-24 truncate text-[13px] leading-[15px] font-semibold text-ink xl:max-w-40"
            >
              {fullName}
            </span>
          </div>
          <button
            type="button"
            aria-label="Выйти"
            title="Выйти"
            onClick={() => void logout()}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-md text-ink-60 hover:bg-surface-sunken hover:text-ink",
              FOCUS,
            )}
          >
            <LogoutIcon />
          </button>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="flex h-14 items-center gap-2.5 pr-2 pl-4">
          <Mark size={28} icon={16} />
          <p className="hidden font-display text-base leading-5 font-bold text-ink min-[400px]:block">
            Портал разработки
          </p>
          <span
            title={fullName}
            className="min-w-0 flex-1 truncate text-[13px] leading-[15px] font-semibold text-ink"
          >
            {fullName}
          </span>
          <Avatar initials={initials} size={32} />
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink",
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
          <div id="mobile-menu" className="border-t border-border pt-2 pb-3">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar initials={initials} size={40} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm leading-4 font-semibold break-words text-ink">
                  {fullName}
                </span>
                <span className="text-xs leading-[14px] text-ink-60">{role}</span>
              </div>
            </div>
            <nav aria-label="Разделы">
              {groups.map((group) => (
                <div key={group.key}>
                  {group.caption ? (
                    <p className="px-4 pt-3.5 pb-1.5 text-[11px] leading-[13px] font-bold tracking-[0.6px] text-ink-60 uppercase">
                      {group.caption}
                    </p>
                  ) : null}
                  <ul aria-label={group.caption ?? "Основное"} className="flex flex-col">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <SectionLink
                          item={item}
                          onClick={() => setOpen(false)}
                          className={(active) =>
                            cn(
                              "flex h-12 items-center gap-2 px-4 text-[15px] font-semibold text-ink",
                              FOCUS,
                              active && "bg-brand-red-soft text-brand-red",
                            )
                          }
                        >
                          {item.label}
                          {badge(item)}
                        </SectionLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => void logout()}
              className={cn(
                "mt-2 flex h-12 w-full items-center gap-2.5 border-t border-border px-4 text-[15px] font-semibold text-ink-80 hover:text-ink",
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
