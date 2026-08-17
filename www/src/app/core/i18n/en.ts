import { EN_ABOUT } from './en-about';
import { EN_CHAT } from './en-chat';
import { EN_CONSENT } from './en-consent';
import { EN_HOME } from './en-home';
import { EN_PRIVACY } from './en-privacy';
import { EN_TERMS } from './en-terms';
import type { DeepLoose, SiteCopyLeafKey } from './copy-types';

export const EN = {
  headerBrand: 'Interchouette',
  headerHomeTitle: 'Home - interchouette.net',
  headerNews: 'News',
  headerLogin: 'Client login',
  headerMarquee:
    "★ Internet, c'est chouette ★ Rust · Wasm · Freelance ★ Interchouette - ITC ★ Gregory Roussac ★",
  footerHome: 'Home',
  footerAbout: 'About',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
  homePromise: 'Development for product teams.',
  homeSubtitle: 'Rust - Wasm Freelance Developer',
  newsTitle: 'News',
  newsEmpty: 'No posts yet.',
  loginTitle: 'Client login',
  loginGoogle: 'Sign in with Google',
  loginNotConfigured: 'Client login is not configured yet.',
  accountTitle: 'Account',
  accountStub: 'Customer space being prepared.',
  accountSignIn: 'Client login',
  titleHome: 'Gregory Roussac - Rust / Wasm Freelance Developer - Interchouette - ITC',
  descHome:
    'Gregory Roussac, Rust and Wasm freelance developer (Interchouette ITC). Contact, CV, and links.',
  titleNews: 'News - Interchouette',
  descNews: 'News from Interchouette ITC.',
  titleLogin: 'Client login - Interchouette',
  descLogin: 'Sign in to Interchouette with Google. The session stays in this browser.',
  titleAccount: 'Account - Interchouette',
  descAccount: 'Customer space for Interchouette.',
  titleAbout: 'About Interchouette - ITC',
  descAbout:
    'Interchouette - ITC: how interchouette.net is built (Angular, Rust, Docker, Cursor) and public links.',
  titlePrivacy: 'Privacy Policy - Interchouette',
  descPrivacy: 'Privacy Policy for Interchouette services operated by Gregory Roussac.',
  titleTerms: 'Terms of Service - Interchouette',
  descTerms: 'Terms of Service for Interchouette websites and applications.',
  titleCv: 'Gregory Roussac - CV',
  descCv:
    'Curriculum vitae of Gregory Roussac: Rust, Wasm, full-stack engineering experience and PDF download.',
  home: EN_HOME,
  consent: EN_CONSENT,
  chat: EN_CHAT,
  about: EN_ABOUT,
  privacy: EN_PRIVACY,
  terms: EN_TERMS,
} as const;

export type SiteCopy = DeepLoose<typeof EN>;
export type SiteCopyStringKey = SiteCopyLeafKey<SiteCopy>;
