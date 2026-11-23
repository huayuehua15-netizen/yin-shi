# Contributing to Cadence

Thank you for contributing to Cadence!

## Development Workflow

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run tests & type checks**

   ```bash
   npm test
   npm run lint
   ```

3. **Run local dev server**

   ```bash
   npm run dev
   ```

## Guidelines

- Keep business logic (analytics, formatting, validation) in pure modules under `src/utils/` or `server/` with matching `*.test.ts` unit tests using `node:test`.
- Keep Gemini API calls strictly server-side in `server.ts`. Never expose `GEMINI_API_KEY` to client code.
- Ensure `npm test`, `npm run lint`, and `npm run build` pass cleanly before opening a pull request.
