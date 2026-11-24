/**
 * Firebase App + App Check singleton. Browser only.
 * App Check is initialized before any other Firebase service because Firebase AI Logic enforces it.
 */
import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";

// NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline them at build time.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY ?? "";
const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY ?? "";
const appCheckDebug = process.env.NEXT_PUBLIC_APPCHECK_DEBUG === "true";

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only initialized in the browser.");
  }
  if (app) return app;
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Copy .env.example to .env.local and fill it in.");
  }

  app = getApps()[0] ?? initializeApp(firebaseConfig);

  if (appCheckDebug) {
    // A fixed token from .env.local is shared by every local browser, but only in development builds,
    // so it can never ship to production. Otherwise the SDK generates one and prints it in the console.
    const fixedToken = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN : undefined;
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      fixedToken || true;
  }

  // In debug mode tokens come from the debug exchange, so reCAPTCHA is only loaded when a site key exists.
  // reCAPTCHA Enterprise is preferred: it is created and registered from the command line and scores invisibly.
  const provider = recaptchaEnterpriseSiteKey
    ? new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey)
    : recaptchaSiteKey
      ? new ReCaptchaV3Provider(recaptchaSiteKey)
      : appCheckDebug
      ? new CustomProvider({
          getToken: () => Promise.reject(new Error("App Check debug mode: provider not used.")),
        })
      : null;

  if (provider) {
    appCheck = initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  }

  return app;
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheck;
}

export function appCheckMode(): "debug" | "recaptcha-enterprise" | "recaptcha-v3" | "disabled" {
  if (appCheckDebug) return "debug";
  if (recaptchaEnterpriseSiteKey) return "recaptcha-enterprise";
  return recaptchaSiteKey ? "recaptcha-v3" : "disabled";
}
