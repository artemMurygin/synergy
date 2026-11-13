import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppLayout } from "./AppLayout";

afterEach(cleanup);

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
});
