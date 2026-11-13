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
};
const developer: Profile = { ...employee, login: "dev", roles: ["developer"] };

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
const linkNames = () => screen.getAllByRole("link").map((l) => l.textContent);

describe("NavMenu", () => {
  it('shows only "Новая идея" and "Мои заявки" to a user without roles', () => {
    renderMenu(employee);
    expect(linkNames()).toEqual(["Новая идея", "Мои заявки"]);
    expect(
      screen
        .getByRole("link", { name: "Мои заявки" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it('adds "Очередь" and "Навыки" for a developer', () => {
    stubFetch(() => json(queuePage));
    renderMenu(developer);
    expect(linkNames()).toEqual([
      "Новая идея",
      "Мои заявки",
      "Очередь",
      "Навыки",
    ]);
    expect(
      screen.getByRole("link", { name: "Очередь" }).getAttribute("href"),
    ).toBe("/queue");
  });

  it("shows the user login and role", () => {
    renderMenu(employee);
    expect(screen.getByText("ivan")).toBeTruthy();
    expect(screen.getByText("сотрудник")).toBeTruthy();
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
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Новая идея",
      "Мои заявки",
      "Новая идея",
      "Мои заявки",
    ]);
    await userEvent.click(button);
    expect(linkNames()).toEqual(["Новая идея", "Мои заявки"]);
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
});
