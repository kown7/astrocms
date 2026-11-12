# Astro CMS UX mock

An interactive mock of the proposed browser-based Astro content editor. Open `/admin/` to explore the Menus, Blog posts, Content, and Commit history flows.

The current UI uses sample data. Editing, local commits, the embedded Git repository, and ZIP export are simulated only; no files are changed and no Git or remote requests are made.

## Run locally

Requires Node.js `>=22.23.4`.

```sh
npm install
npm run dev
```

Open `http://localhost:4321/admin/`.

`npm run build` writes the static site to the Git-ignored `dist/` folder. GitHub Actions builds with `ASTRO_BASE=/astrocms` and deploys `dist/` to Pages on pushes to `main`; set the repository’s Pages source to **GitHub Actions**.
