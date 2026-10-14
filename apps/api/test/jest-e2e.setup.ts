// Les e2e démarrent AppModule réel (ConfigModule.forRoot charge le .env du
// développeur). Si ce .env contient de vraies clés Turnstile (prod/staging),
// /auth/login exigerait un token anti-bot que ces specs ne fournissent pas —
// cf. TurnstileService : « Absent = pas de contrôle (local / e2e) ». On
// neutralise donc ces variables avant le bootstrap de chaque suite e2e, sans
// toucher au fichier .env lui-même. Une chaîne vide (et non `delete`) est
// nécessaire : dotenv (chargé ensuite par ConfigModule.forRoot) ne réécrit
// jamais une variable déjà présente dans process.env, même vide — alors
// qu'une variable absente serait repeuplée depuis le .env réel.
process.env.TURNSTILE_SECRET_KEY = '';
process.env.TURNSTILE_SECRET = '';

// Même raison : une vraie WAVE_API_KEY en .env ferait appeler l'API Wave de
// production (création de vraies sessions checkout) à chaque run e2e. Les
// specs qui testent Wave fixent elles-mêmes WAVE_WEBHOOK_SECRET (déjà
// protégé par le même mécanisme dotenv) ; seule la clé API doit être neutralisée.
process.env.WAVE_API_KEY = '';

// Idem pour RESEND_API_KEY : une vraie clé en .env ferait envoyer de vrais
// e-mails (via Resend) à chaque run e2e — y compris vers des adresses
// factices (@test.local) qui rebondissent, et vers l'admin shop réel.
// ShopEmailService / AlertesMailer / StaffBriefingMailer basculent en mode
// mock (log uniquement) quand la clé est absente, donc neutraliser ici ne
// casse aucun test — ils vérifient le comportement applicatif, pas Resend.
process.env.RESEND_API_KEY = '';
