# Shoply – E-commerce Store (Firebase Auth + Firestore)

HTML, CSS and JavaScript frontend with Firebase Authentication and Cloud Firestore as the backend and database.
Features: product listings with search and categories, product details, shopping cart, register/login, checkout and order history.
No build step and no server: the `public/` folder is the whole site.

## 1. Firebase setup (project: ecomweb-a96f2)
1. **Authentication > Sign-in method:** enable **Email/Password**.
2. **Firestore Database:** click Create database (production mode, any region).
3. **Firestore > Rules:** paste the contents of `firestore.rules`, replace `YOUR_ADMIN_EMAIL@example.com` with your own email, and Publish.
4. Open the site and **register with that same admin email**: the 12 sample products are saved to Firestore automatically. (Until then, everyone, logged in or not, sees the same built-in catalog, so the store is never empty.)

## 2. Deploy to Vercel
1. Push this folder to GitHub.
2. Vercel > Add New > Project > import the repo. Leave build settings empty (`vercel.json` already points to `public`). Deploy.
3. **Firebase > Authentication > Settings > Authorized domains:** add your Vercel domain (e.g. `your-app.vercel.app`). Without this, login fails on the live site.

CLI alternative: `npm i -g vercel`, then run `vercel` in this folder.

## Run locally
`npx serve public` then open the printed localhost address (localhost is already an authorized domain).

## Firestore data
- `products/{id}`: name, description, price, category, emoji, color, order
- `users/{uid}`: name, email
- `orders/{id}`: userId, items[], total, address, status, createdAt
