import { FacebookError } from "@/lib/facebook/errors";

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com"]);
const POST_PATHS = [
  /^\/share\/[a-zA-Z0-9]+\/?$/,
  /^\/share\/p\/[a-zA-Z0-9]+\/?$/,
  /^\/(?:[^/]+\/)*posts\/[^/]+\/?$/,
  /^\/(?:permalink|story)\.php$/,
  /^\/photo(?:\.php|\/)?$/,
];

export function isAllowedFacebookUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && FACEBOOK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isFacebookVideoUrl(value: string) {
  try {
    const path = new URL(value).pathname;
    return (
      /^\/share\/v\//.test(path) ||
      /^\/(?:reel|watch)(?:\/|$)/.test(path) ||
      /\/videos\//.test(path)
    );
  } catch {
    return false;
  }
}

export function normalizeFacebookPostUrl(input: unknown) {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2_048) {
    throw new FacebookError("INVALID_URL", "Introduce una URL de Facebook válida.", 400);
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FacebookError("INVALID_URL", "Introduce una URL de Facebook válida.", 400);
  }

  if (!isAllowedFacebookUrl(url.href) || url.username || url.password || url.port) {
    throw new FacebookError(
      "INVALID_URL",
      "La URL debe corresponder a una publicación de facebook.com.",
      400,
    );
  }

  if (isFacebookVideoUrl(url.href)) {
    throw new FacebookError("INVALID_URL", "Los videos no forman parte de este piloto.", 400);
  }

  if (!POST_PATHS.some((pattern) => pattern.test(url.pathname))) {
    throw new FacebookError(
      "INVALID_URL",
      "La URL debe corresponder a una publicación de facebook.com.",
      400,
    );
  }

  const needsPostId = /\/(?:permalink|story)\.php$/.test(url.pathname);
  if (needsPostId && !url.searchParams.has("story_fbid")) {
    throw new FacebookError("INVALID_URL", "La URL no identifica una publicación.", 400);
  }

  if (/^\/photo(?:\.php|\/)?$/.test(url.pathname) && !url.searchParams.has("fbid")) {
    throw new FacebookError("INVALID_URL", "La URL no identifica una imagen.", 400);
  }

  url.protocol = "https:";
  url.hostname = "www.facebook.com";
  url.hash = "";
  url.searchParams.delete("mibextid");
  return url.href;
}

const PAGE_PATH = /^\/(?!share\/|posts\/|permalink\.php|story\.php|photo|reel|watch|videos)[a-zA-Z0-9.\-_]+\/?$/;

/** Valida una URL de página/perfil (para leer su publicación más reciente), no de un post puntual. */
export function normalizeFacebookPageUrl(input: unknown) {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2_048) {
    throw new FacebookError("INVALID_URL", "Introduce una URL de página de Facebook válida.", 400);
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FacebookError("INVALID_URL", "Introduce una URL de página de Facebook válida.", 400);
  }

  if (!isAllowedFacebookUrl(url.href) || url.username || url.password || url.port) {
    throw new FacebookError(
      "INVALID_URL",
      "La URL debe corresponder a una página de facebook.com.",
      400,
    );
  }

  const isProfilePhp = url.pathname === "/profile.php" && url.searchParams.has("id");
  if (!isProfilePhp && !PAGE_PATH.test(url.pathname)) {
    throw new FacebookError(
      "INVALID_URL",
      "La URL debe ser una página/perfil (ej. facebook.com/NombreDeLaPagina), no un post puntual.",
      400,
    );
  }

  url.protocol = "https:";
  url.hostname = "www.facebook.com";
  url.hash = "";
  url.searchParams.delete("mibextid");
  return url.href;
}
