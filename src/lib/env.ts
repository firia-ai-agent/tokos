export function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    "http://127.0.0.1:43127"
  );
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
