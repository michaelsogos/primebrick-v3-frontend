import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import Counter from "./Counter.svelte";

describe("Smoke test: Svelte 5 runes + testing-library", () => {
  it("renders initial count and increments on click", async () => {
    const user = userEvent.setup();
    render(Counter, { props: { initial: 0 } });

    expect(screen.getByText("Count: 0")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /increment/i });
    await user.click(button);

    expect(screen.getByText("Count: 1")).toBeInTheDocument();
  });

  it("reacts to multiple clicks", async () => {
    const user = userEvent.setup();
    render(Counter, { props: { initial: 5 } });

    expect(screen.getByText("Count: 5")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /increment/i });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(screen.getByText("Count: 8")).toBeInTheDocument();
  });
});
