# Orbit — Astro CMS prototype

An interactive front-end mock for a browser-based workspace for Astro repositories. The current UI uses sample data only; repository access, Git operations, browser storage, file uploads, and site preview are not connected.

## Run locally

Requires Node.js `>=22.23.4`.

```sh
npm install
npm run dev
npm run build
```

The production build is written to `docs/`.

## Prototype surfaces

- Overview, pages, repository files, media, Git changes, activity, and settings.
- Sample code editor, diff review, repository connection dialog, and site preview.
- UI actions identify themselves as mock interactions and do not send Git requests.

The mock is built with Astro and native browser JavaScript; no UI framework is required.
