import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/features/auth";
import { NavMenu } from "@/features/shell";
import type { Profile } from "@/lib/schemas";
import { json, queryWrapper, stubFetch } from "@/test/helpers";
import { AppLayout } from "./AppLayout";

const base: Profile = {
  id: "u1",
  login: "user10",
  mustChangePassword: false,
  roles: [],
  fullName: "user10",
  lastName: null,
  firstName: null,
  middleName: null,
  position: null,
  department: null,
};
const both: Profile = {
  ...base,
  login: "kotova",
  roles: ["developer", "admin"],
  lastName: "Котова",
  firstName: "Анна",
  middleName: "Сергеевна",
  fullName: "Котова Анна Сергеевна",
};

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState());
  stubFetch(() => json({ items: [], total: 0, limit: 20, page: 0 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLayout(profile: Profile) {
  useSessionStore.getState().signIn("tok", profile);
  const Wrapper = queryWrapper();
  render(
    <Wrapper>
      <MemoryRouter>
        <AppLayout header={<NavMenu />} body={<p>body-slot</p>} />
      </MemoryRouter>
    </Wrapper>,
  );
  return within(screen.getByRole("banner"));
}

describe("AppLayout", () => {
  it("puts the header slot into the banner and the body slot into main", () => {
    render(<AppLayout header={<p>top-slot</p>} body={<p>body-slot</p>} />);
    expect(
      within(screen.getByRole("banner")).getByText("top-slot"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("main")).getByText("body-slot"),
    ).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByText("top-slot")).toBeNull();
  });

  it("shows the full name of the user in the header instead of the login", () => {
    const header = renderLayout(both);
    expect(header.getAllByText("Котова Анна Сергеевна").length).toBeGreaterThan(0);
    expect(header.queryByText("kotova")).toBeNull();
  });

  it("shows the login for a user without the full name", () => {
    const header = renderLayout(base);
    expect(header.getAllByText("user10").length).toBeGreaterThan(0);
  });

  it("labels the roles as \"администратор\" and \"разработчик, администратор\"", () => {
    expect(renderLayout({ ...base, roles: ["admin"] }).getByTitle("администратор")).toBeTruthy();
    cleanup();
    expect(renderLayout(both).getByTitle("разработчик, администратор")).toBeTruthy();
  });

  it("truncates a long name in the 360 px bar without breaking the layout", () => {
    const long = "Константинопольская Александра Владимировна";
    const header = renderLayout({ ...both, fullName: long });
    const names = header.getAllByText(long);
    const narrow = names.find((n) => n.className.includes("flex-1"));
    expect(narrow).toBeTruthy();
    expect(narrow?.className).toContain("min-w-0");
    expect(narrow?.className).toContain("truncate");
    expect(narrow?.getAttribute("title")).toBe(long);
    expect(header.getByRole("button", { name: "Меню" })).toBeTruthy();
    expect(header.getByRole("button", { name: "Выйти" })).toBeTruthy();
  });
});
