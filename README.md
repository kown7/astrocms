# Astro CMS

A local-first CMS for Astro. Edit the repository in `/admin/`, create local Git commits in the browser, then download the working repository and push from your console. The browser never connects to a Git remote.

At development start, `npm run dev` creates a `.git`-only snapshot from the current `HEAD` (allowing a dirty worktree). `npm run build` requires a clean working tree and packages the current Git metadata into `public/admin/base-git.zip`, alongside `public/admin/snapshot.json`; the browser checks out that commit to materialize the files.

## Run locally

Requires Node.js `>=22.23.4` and npm `>=9.6.5`.

```sh
npm install
npm run dev
```

Open `http://localhost:4321/admin/`.

`npm run build` writes the static site to the Git-ignored `dist/` folder. GitHub Actions builds with `ASTRO_BASE=/astrocms` and deploys `dist/` to Pages on pushes to `main`; set the repository’s Pages source to **GitHub Actions**. The build requires a normal, non-bare Git working copy with full history and a named branch.

After editing, download the repository ZIP from the admin UI. Unpack it and use `git status`, `git log`, and `git push origin <branch>` from your console. Local commits remain in the browser until exported.
