import type { ReactNode } from "react";

export interface AppLayoutProps {
  header: ReactNode;
  body: ReactNode;
}

/** Page frame with named slots: the top bar goes to `header`, the page content to `body`. */
export function AppLayout({ header, body }: AppLayoutProps) {
  return (
    <div className="flex min-h-full flex-col bg-surface-alt text-foreground">
      <header className="relative bg-surface before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
        {header}
      </header>
      <main className="mx-auto w-full max-w-[1264px] flex-1 px-4 pb-6 pt-5 min-[640px]:px-8 min-[640px]:py-7">
        {body}
      </main>
    </div>
  );
}
