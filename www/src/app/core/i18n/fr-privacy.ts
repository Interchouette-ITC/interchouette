export const FR_PRIVACY = {
  title: 'Politique de confidentialité',
  updated: 'Dernière mise à jour : 18 août 2026',
  intro:
    'La présente politique de confidentialité décrit la manière dont Interchouette - ITC (« nous », « notre » ou « nos »), exploité par Gregory Roussac, collecte, utilise et protège les informations lorsque vous utilisez nos sites web, applications et services associés (les « Services »), y compris les intégrations avec des plateformes tierces telles que LinkedIn.',
  collectHeading: '1. Données que nous collectons',
  collectLead: 'Selon la façon dont vous interagissez avec les Services, nous pouvons collecter :',
  collectAccount:
    'Données de compte et de profil que vous fournissez ou autorisez (par ex. nom, adresse e-mail, photo de profil, identifiants de profil LinkedIn).',
  collectAuth:
    "Données d'authentification lorsque vous vous connectez via OAuth ou des fournisseurs similaires (jetons d'accès, jetons de rafraîchissement et métadonnées associées).",
  collectUsage:
    "Données d'usage telles que les pages visitées, les fonctionnalités utilisées, les horodatages et des informations techniques approximatives (type de navigateur, appareil, adresse IP), y compris via l'analytics si vous acceptez les cookies non essentiels.",
  collectChat:
    'Données du chat visiteur lorsque vous utilisez le chat du site : texte des messages, e-mail facultatif que vous laissez pour un suivi, et identifiants de session techniques nécessaires pour poursuivre la conversation.',
  collectComms: "Communications que vous nous envoyez (demandes d'assistance, e-mails).",
  collectGis:
    'Profil de connexion client (lorsque Google Sign-In est configuré) : nom, e-mail, photo de profil et identifiant subject Google, stockés uniquement dans ce navigateur.',
  collectSensitive:
    'Nous ne collectons pas intentionnellement de données personnelles sensibles au-delà de ce qui est nécessaire pour faire fonctionner les Services ou de ce que vous choisissez explicitement de partager.',
  cookiesHeading: '2. Cookies et technologies similaires',
  cookiesLeadBefore: 'Nous distinguons le stockage',
  cookiesEssential: 'essentiel',
  cookiesLeadMid: '(nécessaire au fonctionnement du site et du chat) des cookies',
  cookiesNonEssential: 'non essentiels',
  cookiesLeadAfter: "utilisés pour l'analytics.",
  cookiesGa:
    "Google Analytics 4 (identifiant de mesure sur ce site) peut déposer des cookies / identifiants pour comprendre le trafic agrégé. Il ne se charge qu'après que vous avez Accepté les cookies non essentiels dans la bannière de consentement. Si vous Refusez, nous ne chargeons pas cette balise analytics pour votre navigateur.",
  cookiesChat:
    "Le stockage du chat dans ce navigateur conserve un court jeton de reprise, les derniers messages (environ sept jours) et tout e-mail enregistré dans le formulaire. Ce cache est chiffré avec une clé liée à l'origine de ce site, afin qu'un regard occasionnel sur localStorage n'affiche pas le texte. Ce n'est pas un chiffrement de bout en bout. Oublier ce chat dans le panneau efface le cache local.",
  cookiesConsent:
    "Le choix de consentement lui-même est stocké localement afin que nous nous souvenions d'Accepter ou de Refuser.",
  cookiesCustomer:
    "La connexion client, lorsqu'elle est utilisée, stocke les champs de profil Google ci-dessus dans localStorage sous une clé du site. Effacer les données du site supprime cette session.",
  chatHeading: '3. Chat visiteur, Slack et e-mail facultatif',
  chatP:
    "Lorsque le chat est disponible, les messages peuvent être relayés à Gregory Roussac via Slack lorsqu'il est en ligne. Lorsqu'il est absent, les réponses peuvent être générées à partir de notes publiques Interchouette (y compris via Interchouette MCP) et peuvent utiliser OpenRouter pour des réponses de modèle de langage. Si vous laissez un e-mail dans le chat, nous l'utilisons uniquement pour que Greg puisse vous recontacter ; il est aussi conservé dans le stockage de votre navigateur comme ci-dessus jusqu'à ce que vous utilisiez Oublier ce chat ou effaciez les données du site.",
  gisHeading: '4. Connexion client (Google Sign-In)',
  gisP1:
    "Le site peut afficher un bouton Connexion client qui utilise Google Identity Services dans ce navigateur. Lorsqu'un identifiant client Google est configuré, Google affiche une fenêtre ; nous stockons ensuite votre nom, e-mail, photo de profil et identifiant subject Google dans ce navigateur uniquement. Nous n'envoyons pas le jeton Google vers les serveurs d'Interchouette. Cette connexion n'ouvre pas d'arrière-bureau privé, de portail client ou de compte Interchouette.",
  gisP2:
    "Tant qu'un identifiant client Google n'est pas configuré, le bouton est visible mais la connexion ne s'exécute pas. La déconnexion (lorsqu'elle est proposée) ou l'effacement des données du site supprime le profil stocké.",
  calHeading: '5. Prise de rendez-vous calendrier',
  calP: "La prise de rendez-vous utilise le planning public Google Calendar. Elle a lieu sur la page de Google, sous les conditions de Google. Ce site ne fait que lier vers cette page. Nous n'écrivons pas d'événements dans votre calendrier depuis les serveurs d'Interchouette.",
  whyHeading: '6. Pourquoi nous collectons des données',
  whyLead: 'Nous utilisons les données personnelles pour :',
  whyProvide: 'Fournir, maintenir et améliorer les Services ;',
  whyAuth: 'Authentifier les utilisateurs et gérer les comptes connectés (y compris LinkedIn) ;',
  whyChat: 'Faire fonctionner le chat visiteur et le suivi facultatif par e-mail ;',
  whyGis:
    'Mémoriser un profil de connexion client dans ce navigateur lorsque vous choisissez de vous connecter avec Google ;',
  whySupport: 'Répondre aux demandes et fournir une assistance ;',
  whySecurity: 'Surveiller la sécurité, prévenir les abus et respecter les obligations légales ;',
  whyAnalytics:
    "Comprendre l'usage agrégé (analytics) lorsque vous avez accepté les cookies non essentiels.",
  shareHeading: '7. Comment nous utilisons et partageons les données',
  shareLead:
    'Nous traitons les données uniquement aux fins ci-dessus. Nous ne vendons pas vos données personnelles. Nous pouvons partager des données limitées avec :',
  shareProviders:
    "Des prestataires qui nous aident à héberger, sécuriser ou exploiter les Services (sous des obligations de confidentialité appropriées), y compris l'hébergement et (si accepté) l'analytics ;",
  shareSlack:
    "Slack lorsque le chat en direct relaie un message visiteur vers l'espace de travail de Greg ;",
  shareOpenRouter:
    'OpenRouter lorsque le chat en mode absence utilise un modèle de langage (le texte du message est envoyé pour générer une réponse) ;',
  shareGoogle:
    "Google lorsque vous utilisez Sign-In ou ouvrez un planning de rendez-vous Calendar (ces flux s'exécutent dans l'interface de Google sous les conditions de Google) ;",
  sharePlatforms:
    'Les plateformes auxquelles vous vous connectez (par ex. LinkedIn), selon leurs conditions et les autorisations que vous accordez ;',
  shareAuthorities:
    "Les autorités lorsque la loi l'exige ou pour protéger nos droits et ceux des utilisateurs.",
  linkedinHeading: '8. Intégration LinkedIn',
  linkedinP:
    "Si vous autorisez l'accès LinkedIn, nous recevons uniquement les informations permises par les API de LinkedIn et votre consentement. Nous utilisons ces informations uniquement pour fournir les fonctionnalités que vous avez demandées. Vous pouvez révoquer l'accès à tout moment depuis les paramètres de votre compte LinkedIn et/ou en nous contactant.",
  retentionHeading: '9. Conservation',
  retentionLead:
    'Nous conservons les données personnelles seulement aussi longtemps que nécessaire aux fins décrites dans la présente politique, sauf si une durée plus longue est exigée par la loi. En particulier :',
  retentionChat:
    'Le cache du chat dans le navigateur est destiné à expirer après environ sept jours, ou plus tôt si vous utilisez Oublier ce chat ou effacez les données du site ;',
  retentionSlack:
    "Les fils de chat Slack et l'e-mail de suivi facultatif sont conservés aussi longtemps que nécessaire pour répondre et exploiter les Services, puis supprimés ou minimisés lorsqu'ils ne sont plus nécessaires ;",
  retentionGis:
    "Le profil de connexion client reste dans ce navigateur jusqu'à ce que vous vous déconnectiez ou effaciez les données du site ; Interchouette ne conserve pas de copie serveur de ce profil Google ;",
  retentionAnalytics:
    "Les données d'analytics (si vous avez accepté les cookies) suivent les paramètres de conservation du fournisseur d'analytics et notre configuration.",
  retentionEnd:
    'Lorsque les données ne sont plus nécessaires, nous les supprimons ou les anonymisons.',
  rightsHeading: '10. Vos droits et demandes de suppression',
  rightsLead: 'Selon votre lieu de résidence, vous pouvez avoir le droit de :',
  rightsAccess: 'Accéder aux données personnelles que nous détenons à votre sujet ;',
  rightsCorrect: 'Demander la correction de données inexactes ;',
  rightsDelete: 'Demander la suppression de vos données personnelles ;',
  rightsWithdraw: 'Retirer votre consentement ou déconnecter les intégrations tierces.',
  rightsEmail:
    "Pour demander un accès, une correction ou une suppression, envoyez un e-mail à contact@interchouette.net avec l'objet « Privacy request ». Nous répondrons dans un délai raisonnable.",
  securityHeading: '11. Sécurité',
  securityP:
    "Nous prenons des mesures techniques et organisationnelles raisonnables pour protéger les données personnelles. Aucune méthode de transmission ou de stockage n'est totalement sûre ; nous ne pouvons pas garantir une sécurité absolue.",
  childrenHeading: '12. Enfants',
  childrenP:
    "Les Services ne s'adressent pas aux enfants de moins de 16 ans. Nous ne collectons pas sciemment de données personnelles d'enfants. Si vous pensez qu'un enfant nous a fourni des données, contactez-nous et nous les supprimerons.",
  changesHeading: '13. Modifications',
  changesP:
    "Nous pouvons mettre à jour la présente politique de confidentialité de temps à autre. La date « Dernière mise à jour » en haut changera lorsque nous le ferons. L'usage continu des Services après des modifications signifie que vous acceptez la politique mise à jour.",
  contactHeading: '14. Contact',
  contactAbout: "À propos d'Interchouette - ITC",
  contactChat: "Discuter avec l'équipe :",
  contactChatLink: "n'hésitez pas",
  contactChatAfter: 'à ouvrir le chat du site.',
  strongAccount: 'Données de compte et de profil',
  strongAuth: "Données d'authentification",
  strongUsage: "Données d'usage",
  strongChat: 'Données du chat visiteur',
  strongComms: 'Communications',
  strongGis: 'Profil de connexion client',
  strongGa: 'Google Analytics 4',
  strongChatStore: 'Stockage du chat',
  strongProviders: 'Prestataires',
  strongSlack: 'Slack',
  strongOpenRouter: 'OpenRouter',
  strongGoogle: 'Google',
  strongPlatforms: 'Plateformes auxquelles vous vous connectez',
  strongAuthorities: 'Autorités',
} as const;
