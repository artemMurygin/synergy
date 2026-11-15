import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/features/auth";
import type { Profile } from "@/lib/schemas";
import { json, queryWrapper, stubFetch } from "@/test/helpers";
import { NavMenu } from "./NavMenu";

const employee: Profile = {
  id: "u1",
  login: "ivan",
  mustChangePassword: false,
  roles: [],
  fullName: "ivan",
  lastName: null,
  firstName: null,
  middleName: null,
  position: null,
  department: null,
};
const developer: Profile = { ...employee, login: "dev", roles: ["developer"] };
const admin: Profile = { ...employee, login: "adm", roles: ["admin"] };
const both: Profile = { ...employee, login: "both", roles: ["developer", "admin"] };
const named = (p: Profile): Profile => ({
  ...p,
  lastName: "Котова",
  firstName: "Анна",
  middleName: "Сергеевна",
  fullName: "Котова Анна Сергеевна",
});

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderMenu(profile: Profile) {
  useSessionStore.getState().signIn("tok", profile);
  const Wrapper = queryWrapper();
  render(
    <Wrapper>
      <MemoryRouter initialEntries={["/requests"]}>
        <NavMenu />
      </MemoryRouter>
    </Wrapper>,
  );
}

const queuePage = { items: [], total: 6, limit: 20, page: 0 };
const isBrand = (l: HTMLElement) => l.textContent?.startsWith("Портал") ?? false;
const linkNames = () =>
  screen
    .getAllByRole("link")
    .filter((l) => !isBrand(l))
    .map((l) => l.textContent);

describe("NavMenu", () => {
  it('shows "Новая идея", "Мои заявки", "Каталог" and "Роадмап" to a user without roles', () => {
    renderMenu(employee);
    expect(linkNames()).toEqual(["Новая идея", "Мои заявки", "Каталог", "Роадмап", "Поддержка"]);
    expect(screen.getByRole("link", { name: "Каталог" }).getAttribute("href")).toBe("/catalog");
    expect(screen.getByRole("link", { name: "Роадмап" }).getAttribute("href")).toBe("/roadmap");
    expect(screen.queryByRole("link", { name: "Архив" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Мои заявки" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it('adds "Очередь", "Навыки" and "Архив" for a developer', () => {
    stubFetch(() => json(queuePage));
    renderMenu(developer);
    expect(linkNames()).toEqual([
      "Новая идея",
      "Мои заявки",
      "Каталог",
      "Роадмап",
      "Поддержка",
      "Очередь",
      "Навыки",
      "Баги",
      "Архив",
    ]);
    expect(screen.getByRole("link", { name: "Архив" }).getAttribute("href")).toBe("/archive");
    expect(
      screen.getByRole("link", { name: "Очередь" }).getAttribute("href"),
    ).toBe("/queue");
  });

  it('links "Поддержка" to /bugs and "Баги" to /bugs/queue, "Баги" only for a developer', () => {
    stubFetch(() => json(queuePage));
    renderMenu(developer);
    expect(screen.getByRole("link", { name: "Поддержка" }).getAttribute("href")).toBe("/bugs");
    expect(screen.getByRole("link", { name: "Баги" }).getAttribute("href")).toBe("/bugs/queue");
    cleanup();
    renderMenu(employee);
    expect(screen.getByRole("link", { name: "Поддержка" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Баги" })).toBeNull();
  });

  it('highlights only "Баги" on /bugs/queue and "Поддержка" on /bugs and a bug card', () => {
    stubFetch(() => json(queuePage));
    const at = (path: string) => {
      cleanup();
      useSessionStore.getState().signIn("tok", developer);
      const Wrapper = queryWrapper();
      render(
        <Wrapper>
          <MemoryRouter initialEntries={[path]}>
            <NavMenu />
          </MemoryRouter>
        </Wrapper>,
      );
      const current = (name: string) => screen.getByRole("link", { name }).getAttribute("aria-current");
      return [current("Поддержка"), current("Баги")];
    };
    expect(at("/bugs/queue")).toEqual([null, "page"]);
    expect(at("/bugs")).toEqual(["page", null]);
    expect(at("/bugs/new")).toEqual(["page", null]);
    expect(at("/bugs/3f0c2d9e")).toEqual(["page", null]);
  });

  it("widens the step of the developer bar to 24 on a wide screen, the employee bar keeps its step", () => {
    stubFetch(() => json(queuePage));
    renderMenu(developer);
    const devUl = screen.getByRole("link", { name: "Роадмап" }).closest("ul") as HTMLElement;
    expect(devUl.className).toContain("xl:gap-6");
    expect(devUl.parentElement?.className).toContain("xl:gap-6");
    cleanup();
    renderMenu(employee);
    const empUl = screen.getByRole("link", { name: "Роадмап" }).closest("ul") as HTMLElement;
    expect(empUl.className).not.toContain("xl:gap-6");
    expect(empUl.parentElement?.className).not.toContain("xl:gap-6");
  });

  it("shows the user login and role", () => {
    renderMenu(employee);
    expect(screen.getAllByText("ivan").length).toBeGreaterThan(0);
    expect(screen.getByTitle("сотрудник")).toBeTruthy();
  });

  it('shows the queue size next to "Очередь" for a developer and never asks an employee for the queue', async () => {
    const dev = stubFetch(() => json(queuePage));
    renderMenu(developer);
    expect(await screen.findByText("6")).toBeTruthy();
    expect(dev.calls[0]).toMatchObject({
      method: "GET",
      path: "/portal/queue",
    });
    cleanup();
    const emp = stubFetch(() => json(queuePage));
    renderMenu(employee);
    expect(emp.calls).toHaveLength(0);
  });

  it("the mobile menu button opens the sections and closes them again", async () => {
    renderMenu(employee);
    const button = screen.getByRole("button", { name: "Меню" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(linkNames()).toEqual([
      "Новая идея",
      "Мои заявки",
      "Каталог",
      "Роадмап",
      "Поддержка",
      "Новая идея",
      "Мои заявки",
      "Каталог",
      "Роадмап",
      "Поддержка",
    ]);
    await userEvent.click(button);
    expect(linkNames()).toEqual(["Новая идея", "Мои заявки", "Каталог", "Роадмап", "Поддержка"]);
  });

  it("the logout button revokes the session on the server and clears the session", async () => {
    const { calls } = stubFetch(() => json({}));
    renderMenu(employee);
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await vi.waitFor(() =>
      expect(useSessionStore.getState().status).toBe("signedOut"),
    );
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/logout" });
  });

  it("shows an administrator without the developer role only the common and the admin sections", () => {
    const calls = stubFetch(() => json(queuePage)).calls;
    renderMenu(admin);
    expect(linkNames()).toEqual([
      "Новая идея",
      "Мои заявки",
      "Каталог",
      "Роадмап",
      "Поддержка",
      "Сотрудники",
      "Отделы",
    ]);
    expect(
      screen.getByRole("link", { name: "Сотрудники" }).getAttribute("href"),
    ).toBe("/admin/employees");
    expect(
      screen.getByRole("link", { name: "Отделы" }).getAttribute("href"),
    ).toBe("/admin/departments");
    expect(screen.queryByRole("link", { name: "Очередь" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Навыки" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Архив" })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("shows both sets of sections to a user with both roles, the groups labelled", () => {
    stubFetch(() => json(queuePage));
    renderMenu(both);
    expect(linkNames()).toEqual([
      "Новая идея",
      "Мои заявки",
      "Каталог",
      "Роадмап",
      "Поддержка",
      "Очередь",
      "Навыки",
      "Баги",
      "Архив",
      "Сотрудники",
      "Отделы",
    ]);
    expect(screen.getByRole("list", { name: "Разработка" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Администрирование" })).toBeTruthy();
  });

  it("does not show the admin sections to a developer", () => {
    stubFetch(() => json(queuePage));
    renderMenu(developer);
    expect(screen.queryByRole("link", { name: "Сотрудники" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Отделы" })).toBeNull();
  });

  it('keeps "Сотрудники" active on the creation form and on a card', () => {
    useSessionStore.getState().signIn("tok", admin);
    const Wrapper = queryWrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/admin/employees/e1"]}>
          <NavMenu />
        </MemoryRouter>
      </Wrapper>,
    );
    expect(
      screen.getByRole("link", { name: "Сотрудники" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Отделы" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("shows the full name instead of the login, with the full name in the title", () => {
    renderMenu(named(admin));
    const names = screen.getAllByText("Котова Анна Сергеевна");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.getAttribute("title")).toBe("Котова Анна Сергеевна");
    expect(screen.queryByText("adm")).toBeNull();
    expect(screen.getAllByText("КА").length).toBeGreaterThan(0);
  });

  it("shows the login for a user without a full name", () => {
    renderMenu({ ...employee, login: "user10", fullName: "user10" });
    expect(screen.getAllByText("user10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("US").length).toBeGreaterThan(0);
  });

  it.each([
    [employee, "сотрудник"],
    [developer, "разработчик"],
    [admin, "администратор"],
    [both, "разработчик, администратор"],
  ])("labels the role of %#", (profile, label) => {
    stubFetch(() => json(queuePage));
    renderMenu(profile);
    expect(screen.getByTitle(label)).toBeTruthy();
  });

  it("truncates a long name in the 1440 bar and in the 360 bar", () => {
    const long = "Константинопольская Александра Владимировна";
    renderMenu({ ...named(admin), fullName: long });
    const names = screen.getAllByText(long);
    expect(names.length).toBeGreaterThan(0);
    for (const element of names) {
      expect(element.className).toContain("truncate");
      expect(element.getAttribute("title")).toBe(long);
    }
    expect(screen.getByRole("button", { name: "Выйти" })).toBeTruthy();
  });

  it("the open mobile menu shows the full name, the role, the group captions and logout", async () => {
    stubFetch(() => json(queuePage));
    const long = "Константинопольская Александра Владимировна";
    renderMenu({ ...both, fullName: long, lastName: "Константинопольская", firstName: "Александра" });
    await userEvent.click(screen.getByRole("button", { name: "Меню" }));
    const menu = document.getElementById("mobile-menu") as HTMLElement;
    expect(menu.textContent).toContain(long);
    expect(menu.textContent).toContain("разработчик, администратор");
    expect(menu.textContent).toContain("Разработка");
    expect(menu.textContent).toContain("Администрирование");
    expect(
      Array.from(menu.querySelectorAll("a")).map((a) => a.textContent?.replace(/\d+$/, "")),
    ).toEqual(["Новая идея", "Мои заявки", "Каталог", "Роадмап", "Поддержка", "Очередь", "Навыки", "Баги", "Архив", "Сотрудники", "Отделы"]);
    expect(menu.querySelector("button")?.textContent).toContain("Выйти");
  });

  it("the mobile menu of an administrator has no developer group", async () => {
    renderMenu(admin);
    await userEvent.click(screen.getByRole("button", { name: "Меню" }));
    const menu = document.getElementById("mobile-menu") as HTMLElement;
    expect(menu.textContent).toContain("Администрирование");
    expect(menu.textContent).not.toContain("Разработка");
  });

  it("the compact bar: 56 high, 13/600 tabs with a 12 step, brand without Synergy, role only in the title", () => {
    stubFetch(() => json(queuePage));
    renderMenu(both);
    const bar = screen.getAllByRole("navigation", { name: "Разделы" })[0].parentElement as HTMLElement;
    expect(bar.className).toContain("h-14");
    expect(bar.className).toContain("px-3");
    const tab = screen.getByRole("link", { name: "Роадмап" });
    expect(tab.className).toContain("text-[13px]");
    expect(tab.closest("ul")?.className).toContain("gap-3");
    expect(screen.queryByText("Synergy")).toBeNull();
    const brand = screen.getAllByRole("link").find(isBrand) as HTMLElement;
    expect(brand.textContent).toBe("Портал разработки");
    expect(brand.querySelector("span.hidden")?.className).toContain("xl:inline");
    expect(screen.getByTitle("разработчик, администратор")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выйти" }).className).toContain("size-10");
  });
});
