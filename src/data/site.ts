export const site = {
  name: { en: 'DentalMind', fa: 'دنتال‌مایند' },
  repo: 'https://github.com/dentaldetect/dentalmind.github.io',
  // Fill in when available; empty values hide the related buttons.
  appUrl: '', // live DentalMind web app (e.g. the Vercel deployment)
  // Shared backend (C:\git\sites-api). Set PUBLIC_API_BASE at build time (repo variable in CI).
  // Empty → demo form falls back to GitHub issues, no newsletter, demo shows the example only.
  api: (import.meta.env.PUBLIC_API_BASE ?? '').replace(/\/$/, ''),
  eyeScreeningUrl: 'https://healthcareirainian.github.io/IranianHealthcare.github.io/articles/diabetic-retinopathy-screening/',
  healthPortalUrl: 'https://healthcareirainian.github.io/IranianHealthcare.github.io/',
};
