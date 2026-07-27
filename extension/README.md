# Extension BitLock Local

1. Lancez BitLock sur `http://localhost:3000` et connectez-vous.
2. Dans **Paramètres → Sécurité → Extension navigateur locale**, générez un jeton.
3. Ouvrez `chrome://extensions`, activez le mode développeur puis « Charger l’extension non empaquetée ».
4. Sélectionnez ce dossier `extension/`, ouvrez l’extension et collez le jeton.

L’extension demande le mot de passe maître à chaque utilisation, déchiffre uniquement en mémoire et remplit le site actif. Elle conserve seulement le jeton révocable dans le stockage local de Chrome, ne contacte aucun service externe et ne stocke jamais le mot de passe maître.
