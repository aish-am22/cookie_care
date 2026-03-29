<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15DXEGjSljpdsxfbdDu3tMPORdVlSz5hQ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Database
DATABASE_URL=postgresql://...

# AI
GEMINI_API_KEY=your_gemini_api_key

# JWT — required, no defaults, app will not start without these
JWT_ACCESS_SECRET=<strong-random-secret-min-32-chars>
JWT_REFRESH_SECRET=<strong-random-secret-min-32-chars>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# Server
PORT=3001
NODE_ENV=development

# CORS (production only)
ALLOWED_ORIGINS=https://yourapp.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

### Cookie-based Refresh Token

The refresh token is stored in an **httpOnly** cookie (`refresh_token`) with the following settings:
- `httpOnly: true` — not accessible via JavaScript
- `secure: true` in production, `false` in development
- `sameSite: strict` in production, `lax` in development
- `path: /api/auth` — scoped to auth endpoints only
- `maxAge: 30 days`

