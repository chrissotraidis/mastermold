export type MasterMoldCommandHandoff = {
  label: string;
  href: string;
  createdAt: number;
};

const MASTER_MOLD_COMMAND_HANDOFF_KEY = "master-mold-command-handoff";
export const MASTER_MOLD_COMMAND_HANDOFF_EVENT = "master-mold-command-handoff";
export const MASTER_MOLD_COMMAND_HANDOFF_PARAM = "mm_command";

export function hrefWithMasterMoldCommandHandoff(action: { label: string; href: string }) {
  const url = new URL(action.href, "http://mastermold.local");
  url.searchParams.set(MASTER_MOLD_COMMAND_HANDOFF_PARAM, action.label);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function rememberMasterMoldCommandHandoff(action: { label: string; href: string }) {
  if (typeof window === "undefined") return;

  const handoff = {
    label: action.label,
    href: action.href,
    createdAt: Date.now(),
  } satisfies MasterMoldCommandHandoff;

  try {
    window.sessionStorage.setItem(MASTER_MOLD_COMMAND_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts; routing still works.
  }

  const event =
    typeof window.CustomEvent === "function"
      ? new CustomEvent<MasterMoldCommandHandoff>(MASTER_MOLD_COMMAND_HANDOFF_EVENT, { detail: handoff })
      : Object.assign(new Event(MASTER_MOLD_COMMAND_HANDOFF_EVENT), { detail: handoff });
  window.dispatchEvent(event);
}

export function consumeMasterMoldCommandHandoff(): MasterMoldCommandHandoff | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(MASTER_MOLD_COMMAND_HANDOFF_KEY);
    window.sessionStorage.removeItem(MASTER_MOLD_COMMAND_HANDOFF_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MasterMoldCommandHandoff>;
    if (!parsed.label || !parsed.href || typeof parsed.createdAt !== "number") return null;
    if (Date.now() - parsed.createdAt > 8000) return null;

    return {
      label: parsed.label,
      href: parsed.href,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
