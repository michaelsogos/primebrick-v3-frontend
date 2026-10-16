import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import OtpInput from "$lib/components/otp-input/otp-input.svelte";
import { useOtpInput } from "$lib/composables/useOtpInput.svelte";

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) throw new Error("OtpInput hidden input not found");
  return input;
}

describe("OtpInput", () => {
  it("accepts digits only", async () => {
    const user = userEvent.setup();
    const { container } = render(OtpInput, { props: { autofocus: false } });
    const input = getInput(container);

    await user.type(input, "a1b2c3x");
    expect(input.value).toBe("123");
  });

  it("auto-submits when all cells are filled by typing", async () => {
    const user = userEvent.setup();
    const onsubmit = vi.fn();
    const { container } = render(OtpInput, { props: { autofocus: false, onsubmit } });
    const input = getInput(container);

    await user.type(input, "12345");
    expect(onsubmit).not.toHaveBeenCalled();

    await user.type(input, "6");
    expect(onsubmit).toHaveBeenCalledTimes(1);
    expect(onsubmit).toHaveBeenCalledWith("123456");
  });

  it("fills all cells on paste and auto-submits", async () => {
    const onsubmit = vi.fn();
    const { container } = render(OtpInput, { props: { autofocus: false, onsubmit } });
    const input = getInput(container);

    // Simulate an authenticator-app paste with separators/spaces.
    fireEvent.paste(input, { clipboardData: { getData: () => "123 456" } });
    await vi.waitFor(() => {
      expect(input.value).toBe("123456");
    });
    expect(onsubmit).toHaveBeenCalledWith("123456");
  });

  it("submits on Enter", async () => {
    const user = userEvent.setup();
    const onsubmit = vi.fn();
    const { container } = render(OtpInput, { props: { autofocus: false, onsubmit } });
    const input = getInput(container);

    await user.type(input, "123456");
    onsubmit.mockClear();
    await user.keyboard("{Enter}");
    expect(onsubmit).toHaveBeenCalledWith("123456");
  });

  it("does not submit on Enter while disabled", async () => {
    const onsubmit = vi.fn();
    const { container } = render(OtpInput, {
      props: { autofocus: false, value: "123456", onsubmit, disabled: true },
    });
    const input = getInput(container);

    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onsubmit).not.toHaveBeenCalled();
  });
});

describe("useOtpInput", () => {
  it("requestSubmit forwards the code to onSubmit", () => {
    const onSubmit = vi.fn();
    const otp = useOtpInput({ onSubmit });
    otp.code = "123456";
    otp.requestSubmit();
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("suppresses submit while disabled", () => {
    const onSubmit = vi.fn();
    let busy = true;
    const otp = useOtpInput({ onSubmit, disabled: () => busy });
    otp.code = "123456";
    otp.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();

    busy = false;
    otp.requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("tracks completeness and resets", () => {
    const otp = useOtpInput({ onSubmit: vi.fn() });
    expect(otp.complete).toBe(false);
    otp.code = "12345";
    expect(otp.complete).toBe(false);
    otp.code = "123456";
    expect(otp.complete).toBe(true);
    otp.reset();
    expect(otp.code).toBe("");
    expect(otp.complete).toBe(false);
  });
});
