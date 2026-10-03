import {
  validPassword,
  validUsername,
  normalizeUsername,
} from "../lib/validation";

type Reply = {
  error?: string;
  redirect?: string;
  hasPasscode?: boolean;
  methods?: string[];
};
export async function api(
  action: string,
  body: Record<string, unknown> = {},
): Promise<Reply> {
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Zahari-Client": "web" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Reply;
  if (!response.ok)
    throw new Error(
      result.error ?? "That request did not finish. Please try again.",
    );
  return result;
}
function message(form: Element, text: string, success = false) {
  const status = form.querySelector<HTMLElement>(".form-status");
  if (status) {
    status.textContent = text;
    status.classList.toggle("success", success);
  }
}
function confirmPassword(form: HTMLFormElement) {
  const password = form.querySelector<HTMLInputElement>('[name="password"]');
  const confirmation = form.querySelector<HTMLInputElement>("[data-confirm]");
  confirmation?.setCustomValidity(
    confirmation.value && password?.value !== confirmation.value
      ? "The passwords do not match."
      : "",
  );
}
document
  .querySelectorAll<HTMLButtonElement>("[data-show-password]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.parentElement!.querySelector("input")!;
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
      const label =
        document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)
          ?.textContent ?? "password";
      button.setAttribute(
        "aria-label",
        `${input.type === "password" ? "Show" : "Hide"} ${label.toLowerCase()}`,
      );
    });
  });
document
  .querySelectorAll<HTMLInputElement>("[data-password-check]")
  .forEach((input) => {
    input.addEventListener("input", () => {
      const valid = validPassword(input.value);
      const hint = input
        .closest(".field")!
        .querySelector<HTMLElement>("[data-password-hint]")!;
      hint.textContent = valid
        ? "Password meets the requirements."
        : "7–18 characters, with a letter and a number.";
      hint.className = input.value ? (valid ? "valid" : "invalid") : "";
      input.setCustomValidity(
        input.value && !valid
          ? "Use 7–18 characters with a letter and a number."
          : "",
      );
      if (input.form) confirmPassword(input.form);
    });
  });
document
  .querySelectorAll<HTMLInputElement>("[data-confirm]")
  .forEach((input) =>
    input.addEventListener(
      "input",
      () => input.form && confirmPassword(input.form),
    ),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-generate-passcode]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".field")!.querySelector("input")!;
      const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
      // Rejection sampling avoids modulo bias with this alphabet.
      let value = "";
      while (value.length < 8) {
        const byte = crypto.getRandomValues(new Uint8Array(1))[0];
        if (byte < Math.floor(256 / alphabet.length) * alphabet.length)
          value += alphabet[byte % alphabet.length];
      }
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button.textContent = "Generated — use Show, then save it safely";
    });
  });
const username = document.querySelector<HTMLInputElement>(
  "[data-availability]",
);
if (username) {
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  const hint = document.querySelector<HTMLElement>("[data-username-hint]")!;
  username.addEventListener("input", () => {
    clearTimeout(timer);
    controller?.abort();
    username.setCustomValidity("");
    hint.className = "";
    const value = normalizeUsername(username.value);
    if (!validUsername(value)) {
      hint.textContent = "3–24 letters, numbers or underscores.";
      return;
    }
    hint.textContent = "Checking availability…";
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/auth/availability?username=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as {
          error?: string;
          available?: boolean;
        };
        if (normalizeUsername(username.value) !== value) return;
        if (!response.ok) {
          hint.textContent =
            result.error ?? "We’ll check your username when you submit.";
          return;
        }
        hint.textContent = result.available
          ? "This username is available."
          : "That username is already taken.";
        hint.className = result.available ? "valid" : "invalid";
        username.setCustomValidity(
          result.available ? "" : "Choose a different username.",
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          hint.textContent = "We’ll check your username when you submit.";
      }
    }, 400);
  });
}
document
  .querySelectorAll<HTMLFormElement>("form[data-auth-action]")
  .forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      confirmPassword(form);
      if (!form.reportValidity()) return;
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      if (button.disabled) return;
      button.disabled = true;
      form.setAttribute("aria-busy", "true");
      message(form, "One moment…");
      const body: Record<string, unknown> = Object.fromEntries(
        new FormData(form),
      );
      delete body.confirmation;
      delete body.saved;
      if (form.hasAttribute("data-disable-passcode")) body.disable = true;
      try {
        const result = await api(form.dataset.authAction!, body);
        if (result.redirect) {
          window.location.assign(result.redirect);
          return;
        }
        message(form, "Recovery settings saved.", true);
        window.location.reload();
      } catch (error) {
        message(
          form,
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
        );
      } finally {
        button.disabled = false;
        form.removeAttribute("aria-busy");
      }
    });
  });
document
  .querySelector<HTMLButtonElement>("[data-logout]")
  ?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await api("logout");
      window.location.assign("/");
    } catch {
      const status = document.querySelector<HTMLElement>("#global-status")!;
      status.hidden = false;
      status.textContent = "Sign out did not finish. Please try again.";
      button.disabled = false;
    }
  });
const recovery = document.querySelector<HTMLElement>("[data-recovery]");
if (recovery) {
  let account = "";
  const forms = [
    ...recovery.querySelectorAll<HTMLFormElement>("[data-recover-stage]"),
  ];
  const method = recovery.querySelector(
    "#method",
  ) as unknown as HTMLSelectElement;
  method.addEventListener("change", () => {
    recovery.querySelector<HTMLElement>("[data-verification-input]")!.hidden =
      method.value !== "passcode";
  });
  forms.forEach((form, index) =>
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      confirmPassword(form);
      if (!form.reportValidity()) return;
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      if (button.disabled) return;
      button.disabled = true;
      message(form, "One moment…");
      const body = Object.fromEntries(new FormData(form));
      if (index === 0) account = String(body.username ?? "");
      else body.username = account;
      try {
        const result = await api(`recover/${form.dataset.recoverStage}`, body);
        if (result.redirect) {
          window.location.assign(result.redirect);
          return;
        }
        if (index === 0 && !result.methods?.includes("passcode"))
          throw new Error("No recovery method is available.");
        form.hidden = true;
        form.reset();
        message(form, "");
        const next = forms[index + 1];
        next.hidden = false;
        recovery.querySelector<HTMLElement>(
          "[data-recovery-step]",
        )!.textContent = `STEP ${index + 2} OF 3`;
        recovery.querySelector<HTMLElement>("[data-recovery-restart]")!.hidden =
          false;
        next.querySelector<HTMLElement>("input, select")?.focus();
      } catch (error) {
        message(
          form,
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
        );
      } finally {
        button.disabled = false;
      }
    }),
  );
}
