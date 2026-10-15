/**
 * Tema: "system" | "light" | "dark".
 * La preferenza è persistita dal kernel Rust (comando `get_config` / `set_config`) quando l'app
 * gira dentro Tauri; nel browser (prove visive) si usa localStorage.
 */

const STORAGE_KEY = "outlookai.theme";

function hasTauri() {
  return typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.core;
}

async function invokeIfAvailable(cmd, args) {
  if (!hasTauri()) return null;
  try {
    return await window.__TAURI__.core.invoke(cmd, args);
  } catch (err) {
    console.warn(`comando ${cmd} non disponibile:`, err);
    return null;
  }
}

let current = "system";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function resolved(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return media.matches ? "dark" : "light";
}

function paint() {
  document.documentElement.dataset.theme = resolved(current);
}

/** Imposta la preferenza e la persiste. */
export async function setTheme(pref) {
  current = pref === "light" || pref === "dark" ? pref : "system";
  paint();
  const saved = await invokeIfAvailable("set_config", { key: "theme", value: current });
  if (saved === null) localStorage.setItem(STORAGE_KEY, current);
}

export function getTheme() {
  return current;
}

/** Legge la preferenza persistita e la applica. `?theme=light|dark` forza il tema (prove visive). */
export async function initTheme() {
  const forced = new URLSearchParams(location.search).get("theme");
  if (forced === "light" || forced === "dark") {
    current = forced;
    paint();
    return;
  }
  const fromRust = await invokeIfAvailable("get_config", { key: "theme" });
  const value = fromRust ?? localStorage.getItem(STORAGE_KEY) ?? "system";
  current = value === "light" || value === "dark" ? value : "system";
  paint();
  media.addEventListener("change", () => {
    if (current === "system") paint();
  });
}

/** Esposto per prove visive e per il pannello impostazioni (task 8.2). */
window.setTheme = setTheme;