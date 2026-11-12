# Astro CMS requirements

**Status:** Proposed MVP requirements  
**Product shape:** Static Astro site containing a build-time Git working repository. The browser edits and commits locally; the owner pushes from the console.

## 1. Goal

Provide an `/admin/` area where a site owner can edit menu definitions, blog posts, and generic content as plain text: YAML for menu data and Markdown/frontmatter for posts and generic pages. At build time, package the clean local Git repository at `HEAD` into the static site. The browser opens that embedded repository, makes local commits, and downloads the updated repository when the owner is done.

The browser MUST NOT connect to a Git remote in the MVP. The downloaded archive is a Git working repository; the owner uses native Git in the console to inspect and push it.

## 2. Current project baseline

The checked-in app is an Astro starter: one home page, a shared layout, and the `Welcome` component. It has no admin route, menu model, blog collection, or `src/content.config.ts`. `package.json` depends only on Astro and requires Node.js `>=22.23.4`; `astro.config.mjs` writes builds to ignored `dist/`.

The CMS work therefore needs to introduce its content model, admin route, and browser Git dependencies; it must not assume existing collections or menu files.

## 3. Product decisions captured

- **No remote checkout in the browser.** `npm run build` packages the committed local repository; it makes no network Git requests and requires a clean source working tree (generated output is excluded).
- **Browser-local Git is in scope.** The browser opens the embedded repository and may create multiple local commits on its current branch.
- **Remote push stays in the console.** The browser downloads the working repository; native Git in the console pushes it to the configured remote.
- **One branch in the MVP.** Use the branch checked out at build time. No branch switching, remote fetch/pull, or browser conflict resolution.
- **The `/admin/` namespace is reserved** for editing. Site content must not claim that route.
- **Text-first editing.** Menu configuration is YAML; blog and generic content are Markdown with frontmatter. No WYSIWYG editor or form-based content editor in the MVP.
- **GitHub REST push is future scope.** It requires a separate authentication, authorization, and error-handling design.

## 4. Users and primary workflow

Single site owner; one browser editing session at a time. No accounts, teams, roles, or collaboration in the MVP.

1. The owner commits all source changes, confirms the source working tree is clean (excluding generated output), and runs `npm run build` from a normal, non-bare Git working copy.
	2. The build emits the static website to `dist/` and embeds a portable Git working repository for the admin UI.
3. The owner opens `/admin/`; the browser loads that repository into persistent browser storage.
4. The owner edits menu YAML or Markdown content, then makes zero or more local Git commits in the browser.
5. The owner downloads the complete working repository, including `.git` and the working tree.
6. The owner unpacks it, verifies `git status` and `git log`, then pushes the current branch from the console.

No remote operation occurs while editing. If the remote has advanced, native Git reports a rejected push; the owner resolves it in the console and rebuilds the admin snapshot.

## 5. Content model

The MVP uses YAML for navigation data and Markdown content collections for posts and generic pages. Both are plain-text files editable in the admin; menus are not Markdown pages.

- **Menus:** `src/data/menus/main.yaml`. This is structured data consumed by a rendering component, not a page or route. Each menu item has a label and a destination (`href`); the menu definition itself has no URL.
- **Blog posts:** `src/content/blog/<slug>.md`. Frontmatter contains at least `title` and `pubDate`; optional fields include `description`, `draft`, and an explicit `slug`. The body is Markdown.
- **Generic content:** `src/content/pages/<slug>.md`. Frontmatter contains `title` and optional `description`; the body is Markdown.

Astro components render menu data into navigation links. Blog and page documents are rendered only by corresponding Astro page routes; neither a menu YAML file nor a content file automatically becomes a URL.

The MVP MUST list and edit existing menu, blog, and generic-content records and MUST support creating new menu YAML or Markdown content records as appropriate. Deletion behavior is an open decision; do not silently discard a file when it is absent from an export.

## 6. Functional requirements

### Build-time Git repository

- **REQ-01:** `npm run build` MUST require a clean source working tree (excluding generated output) and package the current local `HEAD`; it MUST NOT contact a Git remote.
- **REQ-02:** The embedded repository MUST contain a usable `.git` database (objects, refs, HEAD, index, and required config) plus the source tree from `HEAD`.
- **REQ-03:** Snapshot metadata MUST record the base `HEAD` SHA, current branch, build timestamp, file paths, sizes, and content hashes.
- **REQ-04:** The browser and downloaded archive MUST preserve existing commit history and binary files. Browser-created commits MUST be descendants of the embedded branch.
- **REQ-05:** Generated build output (`dist/`), `node_modules`, Astro caches, executable hooks, reflogs, credential helpers, credentials, and machine-local config MUST NOT enter the bundle. The export MUST retain the portable Git data needed to inspect history and create commits.
- **REQ-06:** The MVP MUST fail clearly on unsupported repository layouts/features (such as bare repositories, linked worktrees, object alternates, shallow history, submodules, or Git LFS) rather than produce a partial repository.

### Admin editor and local commits

- **REQ-07:** The built site MUST contain a static admin route at `/admin/`; `/admin` SHOULD resolve to that canonical route on supported hosts.
- **REQ-08:** The admin UI MUST provide Menus, Blog posts, and Content views backed by the embedded repository.
- **REQ-09:** The editor MUST edit raw YAML menu data and Markdown/frontmatter content as text.
- **REQ-10:** Saving MUST update the browser’s local working tree. The user MUST be able to stage the intended files and create local commits with a message and author identity.
- **REQ-11:** Browser repository state, including local commits, SHOULD survive reload using IndexedDB-backed storage. The UI MUST show the current branch and changed-file status.
- **REQ-12:** Git operations MUST be local only. The MVP MUST NOT fetch, pull, push, or send remote credentials.

### Export and console workflow

- **REQ-13:** The owner MUST be able to download a ZIP containing the current working tree and usable `.git` repository, including browser-created commits.
- **REQ-14:** The archive MUST omit executable hooks and credentials. It MUST preserve a credential-free remote URL when safe; otherwise the owner can set the remote in the console.
- **REQ-15:** Unpacking the download MUST produce a directory that native Git recognizes, so the owner can inspect `git status`/`git log` and push from the console.
- **REQ-16:** If the remote has advanced, a non-fast-forward push MUST be left to native Git; the MVP MUST NOT force-push or silently rewrite history.

### Static hosting and paths

- **REQ-17:** The default `npm run build` output in `dist/` MUST work when served from that directory root, including `python3 -m http.server`.
- **REQ-18:** The GitHub Pages project site at `/astrocms/` MUST render from the `dist/` artifact. The default local build MUST NOT be globally hard-coded to `/astrocms`.
- **REQ-19:** The path behavior MUST be verified against generated HTML, CSS, JavaScript, and favicon URLs. If Astro cannot produce one path-independent artifact reliably, provide an explicit deploy-specific build profile rather than breaking the default local workflow.

Generated `dist/` output MUST remain untracked. GitHub Actions deploys the `dist/` artifact; do not commit generated site output to the source repository.

## 7. Security and privacy requirements

The MVP is static. `/admin/` is a route, **not an access-control boundary**. Every file placed in the generated snapshot is downloadable by anyone who can access the static site. Including `.git` exposes the repository history, not just the current source files.

- **REQ-20:** Public deployment MUST only include a repository whose entire included history and working tree are safe for public download. Deleted secrets may remain in Git objects.
- **REQ-21:** `.git/config` MUST NOT contain embedded passwords, tokens, credential helpers, or private local paths. Hooks MUST be omitted from the export.
- **REQ-22:** The build MUST fail or prominently warn on known sensitive file paths. Filename checks cannot prove the repository is secret-free; the owner MUST review the history before public deployment.
- **REQ-23:** Encryption is not protection if the decryption key is bundled in the same static site. Private repositories require a key supplied out-of-band or an authenticated server architecture.
- **REQ-24:** The browser MUST NOT receive remote Git credentials in the MVP.

## 8. Out of scope for the MVP

- Remote clone/fetch/pull/push in the browser and GitHub REST API push.
- Branch switching, multi-user access, permissions, locking, and browser conflict resolution.
- WYSIWYG editing, rich block editing, Astro component/code editing, and build preview of unsaved drafts.
- Treating the static `/admin/` path as private.

## 9. Acceptance criteria

1. A clean `npm run build` produces the static site and a portable Git repository snapshot under `dist/` without network Git calls.
2. Serving `dist/` with `python3 -m http.server` loads the site and `/admin/` with all required assets.
3. The GitHub Pages build at `/astrocms/` loads the same admin UI and its assets; the default build remains root-servable.
4. The admin can edit menu YAML and blog/generic-content Markdown, save across reloads, and create multiple local commits on the embedded branch.
5. Downloading and unpacking the export yields a valid Git working copy whose log contains those browser-created commits and whose status reflects the current working tree.
6. The export contains no credential-bearing Git config or executable hooks. It never pushes automatically.
7. A stale base or unsupported repository layout is surfaced rather than silently overwritten or partially exported.