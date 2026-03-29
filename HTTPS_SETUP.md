# Configuration HTTPS pour PayUnit (Développement)

PayUnit exige des URLs HTTPS pour les webhooks. Voici comment configurer HTTPS en développement :

## Option 1: Utiliser ngrok (Recommandé)

1. **Installer ngrok :**
   ```bash
   npm install -g ngrok
   ```

2. **Démarrer votre serveur API :**
   ```bash
   cd api
   npm run dev
   ```

3. **Créer un tunnel HTTPS :**
   ```bash
   ngrok http 8080
   ```

4. **Copier l'URL HTTPS générée par ngrok** (ex: `https://abc123.ngrok.io`)

5. **Mettre à jour le .env :**
   ```env
   BACKEND_URL=https://abc123.ngrok.io
   PAYUNIT_NOTIFY_URL=https://abc123.ngrok.io/api/webhooks/payunit
   ```

## Option 2: Utiliser un domaine de production

Si vous avez un domaine avec HTTPS en production :

```env
BACKEND_URL=https://votredomaine.com
PAYUNIT_NOTIFY_URL=https://votredomaine.com/api/webhooks/payunit
```

## Option 3: Utiliser localhost.run

```bash
# Installer ssh et utiliser localhost.run
ssh -R 80:localhost:8080 localhost.run
```

Puis utiliser l'URL HTTPS fournie.

## Test du webhook

Une fois HTTPS configuré, testez avec :

```bash
curl https://your-https-url.com/api/webhooks/test
```

Le webhook devrait répondre avec un message de confirmation.