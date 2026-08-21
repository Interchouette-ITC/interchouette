import { NL_ABOUT } from './nl-about';
import { NL_CHAT } from './nl-chat';
import { NL_CONSENT } from './nl-consent';
import { NL_HOME } from './nl-home';
import { NL_NEWS } from './nl-news';
import { NL_PRIVACY } from './nl-privacy';
import { NL_TERMS } from './nl-terms';
import type { SiteCopy } from './en';

export const NL: SiteCopy = {
  headerBrand: 'Interchouette',
  headerHomeTitle: 'Home - interchouette.nl',
  headerNews: 'Nieuws',
  headerSlack: 'Slack joinen',
  headerLogin: 'Klantlogin',
  headerLang: 'Taal',
  headerMenu: 'Menu',
  headerBookingCta: 'Afspraak maken',
  headerMarquee:
    "★ Internet, c'est chouette ★ Rust · Wasm · Freelance ★ Interchouette - ITC ★ Gregory Roussac ★",
  footerHome: 'Home',
  footerAbout: 'Over',
  footerPrivacy: 'Privacy',
  footerTerms: 'AV',
  homePromise: 'Ontwikkeling voor productteams.',
  homeSubtitle: 'Rust - Wasm freelance-ontwikkelaar',
  newsTitle: 'Nieuws',
  newsEmpty: 'Nog geen berichten.',
  loginTitle: 'Klantlogin',
  loginGoogle: 'Inloggen met Google',
  loginFakeClose: 'Sluiten',
  accountTitle: 'Account',
  accountStub: 'De klantruimte wordt voorbereid.',
  accountSignIn: 'Klantlogin',
  titleHome: 'Gregory Roussac - Rust / Wasm freelance-ontwikkelaar - Interchouette - ITC',
  descHome:
    'Gregory Roussac, freelance-ontwikkelaar in Rust en Wasm (Interchouette ITC). Contact, CV en links.',
  titleNews: 'Nieuws - Interchouette',
  titleArchive: 'Nieuwsarchief - Interchouette',
  titleSlack: 'Word lid van de Interchouette Slack-workspace (opent in een nieuw tabblad)',
  descNews: 'Nieuws van Interchouette ITC.',
  descArchive: 'Wekelijkse gearchiveerde Interchouette-nieuwssnapshots.',
  titleLogin: 'Klantlogin - Interchouette',
  descLogin: 'Log in bij Interchouette met Google. De sessie blijft in deze browser.',
  titleAccount: 'Account - Interchouette',
  descAccount: 'Klantruimte van Interchouette.',
  titleAbout: 'Over Interchouette - ITC',
  descAbout:
    'Interchouette - ITC: hoe interchouette.net is gebouwd (Angular, Rust, Docker, Cursor) en openbare links.',
  titlePrivacy: 'Privacybeleid - Interchouette',
  descPrivacy: 'Privacybeleid voor Interchouette-diensten, geëxploiteerd door Gregory Roussac.',
  titleTerms: 'Algemene voorwaarden - Interchouette',
  descTerms: 'Algemene voorwaarden voor websites en toepassingen van Interchouette.',
  titleCv: 'Gregory Roussac - CV',
  descCv:
    'Curriculum vitae of Gregory Roussac: Rust, Wasm, full-stack engineering experience and PDF download.',
  home: NL_HOME,
  consent: { ...NL_CONSENT, jokes: [...NL_CONSENT.jokes] },
  chat: {
    ...NL_CHAT,
    nudgeHooks: [...NL_CHAT.nudgeHooks],
    resumeNudgeHooks: [...NL_CHAT.resumeNudgeHooks],
  },
  about: NL_ABOUT,
  privacy: NL_PRIVACY,
  terms: NL_TERMS,
  news: NL_NEWS,
};
