# BitLock

BitLock est un coffre-fort numérique local construit avec Nuxt 3 et SQLite. Les secrets sont chiffrés dans le navigateur avec AES-256-GCM avant d’être enregistrés ; le mot de passe maître n’est jamais stocké par le serveur.

## Fonctions

- mots de passe, liens, notes sécurisées, clés crypto et codes de récupération ;
- compte local par username, sans adresse e-mail, avec indice révélé uniquement après un échec de connexion ;
- codes TOTP RFC 6238 générés localement ;
- coffres multiples, dossiers, tags, favoris et recherche ;
- vérification chiffrée du mot de passe maître et verrouillage automatique ;
- déverrouillage local par passkey WebAuthn PRF quand l’appareil le supporte ;
- écran de confidentialité et effacement programmé du presse-papiers ;
- audit local des mots de passe faibles et réutilisés ;
- historique chiffré et restauration des versions ;
- sauvegardes intégralement chiffrées au format `.bitlock` ;
- transfert hors ligne par paquet chiffré, fichier ou QR ;
- extension Chrome/Chromium locale dans [`extension/`](extension/) ;
- interface française et anglaise, sans analytics ni dépendance à un moteur de recherche.

## Lancer le projet

```bash
bun install
copy .env.example .env
bun run dev
```

Le script de développement initialise et migre automatiquement `./data/bitlock.db`, puis ouvre l’application sur `http://localhost:3000`.

## Validation

```bash
bun run test
bun run build
```

`bun run test` exécute les contrôles qualité, cryptographiques, i18n et TypeScript avec les dépendances locales du projet. Après un build, lancer le serveur Bun avec :

```bash
bun run .output/server/index.mjs
```

Le test API `bun run test:smoke` s’exécute contre un serveur déjà lancé. Il crée un compte temporaire, vérifie le défi d’indice, la connexion, les coffres, notes, tags, statistiques, versions, rotation du mot de passe maître et révocation du jeton d’extension, puis supprime toutes ses données.

## Configuration

```env
NUXT_SESSION_PASSWORD=une-valeur-aleatoire-de-32-caracteres-minimum
DB_PATH=./data/bitlock.db
APP_URL=http://localhost:3000
```

## Sécurité

- chiffrement : AES-256-GCM avec IV aléatoire de 96 bits ;
- dérivation : PBKDF2-HMAC-SHA-256, 100 000 itérations, sel aléatoire de 128 bits ;
- authentification : mot de passe d’au moins 12 caractères, limité à 72 octets UTF-8 pour rester compatible avec bcrypt, coût 12 et session chiffrée `nuxt-auth-utils` ;
- rotation : données, historique et vérificateur du mot de passe maître sont remplacés dans une seule transaction ;
- historique : les favoris ne créent pas de version parasite et les 50 versions les plus récentes sont conservées ;
- API : réponses privées non mises en cache, contrôle d’origine sur les mutations et limitation des routes sensibles ;
- sauvegardes et transferts : enveloppes chiffrées et versionnées ;
- stockage local : SQLite, aucun analytics et aucun service Google/Bing.

La perte du mot de passe maître rend les secrets chiffrés irrécupérables. La passkey locale est isolée par compte et doit être recréée après une modification du mot de passe maître.

## Extension locale

Dans BitLock, ouvrir **Paramètres → Sécurité → Extension navigateur locale** et générer un jeton révocable. Ensuite, ouvrir `chrome://extensions`, activer le mode développeur, choisir « Charger l’extension non empaquetée », puis sélectionner le dossier [`extension/`](extension/). Ce dossier est l’intégration fournie avec BitLock ; le projet voisin `Kipit-extension` reste également compatible avec les entrées versionnées et l’ancien format JSON. L’extension conserve uniquement ce jeton, demande le mot de passe maître à chaque utilisation et ne le stocke jamais.

## Licence

MIT — Tensor Team
