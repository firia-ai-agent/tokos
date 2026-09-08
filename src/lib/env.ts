const LOCAL_APP_URL = "http://127.0.0.1:43127";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

// A preview deploy can inherit a loopback NEXT_PUBLIC_APP_URL / AUTH_URL (e.g. from a
// leaked .env.local), which would send Stripe/e-sign return URLs off the preview host.
function isLoopback(url: string) {
  const value = url.toLowerCase();
  return value.includes("127.0.0.1") || value.includes("localhost");
}

export function appUrl() {
  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL]) {
    const value = candidate?.trim();
    if (!value || isLoopback(value)) continue;
    return stripTrailingSlash(value);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl && !isLoopback(vercelUrl)) {
    return stripTrailingSlash(`https://${vercelUrl}`);
  }

  return LOCAL_APP_URL;
}

export function isDemoMode() {
  if (process.env.DEMO_MODE === "false") return false;
  return (
    process.env.DEMO_MODE === "true" ||
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.DROPBOX_SIGN_API_KEY ||
    !process.env.RESEND_API_KEY
  );
}

export function hasStripe() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function hasDropboxSign() {
  return Boolean(process.env.DROPBOX_SIGN_API_KEY);
}

export function hasResend() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function hasS3() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID);
}
