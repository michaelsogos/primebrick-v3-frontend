import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { ScoreGauge } from '@primebrick/ui';

describe("ScoreGauge", () => {
  it("renders a missing score as a red dash instead of disappearing", () => {
    const { container } = render(ScoreGauge, { props: { value: null, label: "Speed" } });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(container.querySelectorAll("circle")[1]).toHaveAttribute("stroke", "#ef4444");
  });

  it("renders a numeric score with its value", () => {
    render(ScoreGauge, { props: { value: 4.8, label: "Rank" } });

    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
  });
});
