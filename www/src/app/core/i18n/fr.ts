import { FR_ABOUT } from './fr-about';
import { FR_CHAT } from './fr-chat';
import { FR_CONSENT } from './fr-consent';
import { FR_HOME } from './fr-home';
import { FR_PRIVACY } from './fr-privacy';
import { FR_TERMS } from './fr-terms';
import type { SiteCopy } from './en';

export const FR: SiteCopy = {
  headerBrand: 'Interchouette',
  headerHomeTitle: 'Accueil - interchouette.fr',
  headerNews: 'Actualités',
  headerSlack: 'Rejoindre Slack',
  headerLogin: 'Connexion client',
  headerLang: 'Langue',
  headerMenu: 'Menu',
  headerBookingCta: 'Prendre rendez-vous',
  headerMarquee:
    "★ Internet, c'est chouette ★ Rust · Wasm · Freelance ★ Interchouette - ITC ★ Gregory Roussac ★",
  footerHome: 'Accueil',
  footerAbout: 'À propos',
  footerPrivacy: 'Vie privée',
  footerTerms: 'CGU',
  homePromise: 'Développement pour les équipes produit.',
  homeSubtitle: 'Développeur freelance Rust - Wasm',
  newsTitle: 'Actualités',
  newsEmpty: "Pas encore d'articles.",
  loginTitle: 'Connexion client',
  loginGoogle: 'Se connecter avec Google',
  loginFakeClose: 'Fermer',
  accountTitle: 'Compte',
  accountStub: "L'espace client est en préparation.",
  accountSignIn: 'Connexion client',
  titleHome: 'Gregory Roussac - Développeur freelance Rust / Wasm - Interchouette - ITC',
  descHome:
    'Gregory Roussac, développeur freelance Rust et Wasm (Interchouette ITC). Contact, CV et liens.',
  titleNews: 'Actualités - Interchouette',
  titleSlack: "Rejoindre l'espace Slack Interchouette (s'ouvre dans un nouvel onglet)",
  descNews: 'Actualités Interchouette ITC.',
  titleLogin: 'Connexion client - Interchouette',
  descLogin: 'Connectez-vous à Interchouette avec Google. La session reste dans ce navigateur.',
  titleAccount: 'Compte - Interchouette',
  descAccount: 'Espace client Interchouette.',
  titleAbout: "À propos d'Interchouette - ITC",
  descAbout:
    'Interchouette - ITC : comment interchouette.net est construit (Angular, Rust, Docker, Cursor) et liens publics.',
  titlePrivacy: 'Politique de confidentialité - Interchouette',
  descPrivacy:
    'Politique de confidentialité des services Interchouette exploités par Gregory Roussac.',
  titleTerms: "Conditions d'utilisation - Interchouette",
  descTerms: "Conditions d'utilisation des sites et applications Interchouette.",
  titleCv: 'Gregory Roussac - CV',
  descCv:
    'Curriculum vitae of Gregory Roussac: Rust, Wasm, full-stack engineering experience and PDF download.',
  home: FR_HOME,
  consent: { ...FR_CONSENT, jokes: [...FR_CONSENT.jokes] },
  chat: {
    ...FR_CHAT,
    nudgeHooks: [...FR_CHAT.nudgeHooks],
    resumeNudgeHooks: [...FR_CHAT.resumeNudgeHooks],
  },
  about: FR_ABOUT,
  privacy: FR_PRIVACY,
  terms: FR_TERMS,
};
