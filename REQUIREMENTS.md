# Astro CMS requirements

**Status:** MVP implementation complete; verification passed
**Product shape:** Static Astro site containing a build-time `.git` snapshot. The browser checks out `HEAD`, edits and commits locally, then downloads the full working repository for a console push.

## 1. Goal

Provide an `/admin/` area where a site owner can browse and edit the full repository: text files as raw text, and binary assets through preview/replace/download controls. Focused Menus, Blog posts, and Content views make YAML menus and Markdown/frontmatter easy to find, while a general Files view exposes the rest of the repository. At build time, package the clean local `.git` directory into the static site. The browser checks out the embedded `HEAD` to materialize the working tree, makes local commits, and downloads the updated repository when the owner is done.

The browser MUST NOT connect to a Git remote in the MVP. The downloaded archive is a Git working repository; the owner uses native Git in the console to inspect and push it.

## 2. Project baseline

The project began as an Astro 7 starter with one homepage and no CMS routes or content collections. The CMS uses Astro’s static output under `dist/`, adds menu and Markdown content collections plus `/admin/`, and keeps Git operations in browser-backed storage without a server adapter.

## 3. Product decisions captured

- **No remote checkout in the browser.** `npm run build` packages only the `.git` directory from the committed local repository; it makes no network Git requests and requires a clean source working tree (generated output is excluded).
- **Browser-local checkout and Git are in scope.** On first initialization, the browser opens the embedded `.git` repository in empty persistent storage and force-checks out the recorded branch and `HEAD`; it then preserves that working tree and may create multiple local commits on the branch.
- **Remote push stays in the console.** The browser downloads the checked-out working tree together with `.git`; native Git in the console pushes it to the configured remote.
- **One branch in the MVP.** Use the branch checked out at build time. No branch switching, remote fetch/pull, or browser conflict resolution.
- **The `/admin/` namespace is reserved** for editing. Site content must not claim that route.
- **Full repository editing.** The Files view covers repository text and binary files; content-specific views are shortcuts, not restrictions. Text remains directly editable; common images are previewable and replaceable. No WYSIWYG editor in the MVP.
- **GitHub REST push is future scope.** It requires a separate authentication, authorization, and error-handling design.

## 4. Users and primary workflow

Single site owner; one browser editing session at a time. No accounts, teams, roles, or collaboration in the MVP.

1. The owner commits all source changes, confirms the source working tree is clean (excluding generated output), and runs `npm run build` from a normal, non-bare Git working copy.
2. The build emits the static website to `dist/` and an archive containing `.git` only.
3. The owner opens `/admin/`; on first initialization, the browser loads `.git` into empty persistent storage and force-checks out the recorded branch at `HEAD`, recreating the tracked working tree. Reloads reuse saved state rather than checking out over local edits.
4. The owner edits menu YAML or Markdown content, then makes zero or more local Git commits in the browser.
5. The owner downloads the complete working repository, including `.git` and the checked-out working tree.
6. The owner unpacks it, verifies `git status` and `git log`, then pushes the current branch from the console.

No remote operation occurs while editing. If the remote has advanced, native Git reports a rejected push; the owner resolves it in the console and rebuilds the admin snapshot.

## 5. Content model

The MVP uses YAML for navigation data and Markdown content collections for posts and generic pages. Both are plain-text files editable in the admin; menus are not Markdown pages.

- **Menus:** `src/data/menus/main.yaml`. This is structured data consumed by a rendering component, not a page or route. Each menu item has a label and a destination (`href`); the menu definition itself has no URL.
- **Blog posts:** `src/content/blog/<slug>.md`. Frontmatter contains at least `title` and `pubDate`; optional fields include `description`, `draft`, and an explicit `slug`. The body is Markdown.
- **Generic content:** `src/content/pages/<slug>.md`. Frontmatter contains `title` and optional `description`; the body is Markdown.

Astro components render menu data into navigation links. Blog and page documents are rendered only by corresponding Astro page routes; neither a menu YAML file nor a content file automatically becomes a URL.

The MVP MUST list and edit existing menu, blog, and generic-content records and MUST support creating them at the corresponding paths. The Files view MUST allow explicit delete, rename, and move operations with confirmation; absence from an export MUST never imply deletion.

## 6. Functional requirements

### Build-time Git repository

- **REQ-01:** `npm run build` MUST require a clean source working tree (excluding generated output) and package the current local `.git` state; it MUST NOT contact a Git remote.
- **REQ-02:** The embedded archive MUST contain a usable `.git` directory (objects, refs, HEAD, index, and required config) but MUST NOT duplicate the checked-out working tree. On first initialization into an empty browser filesystem, the browser MUST force-checkout the recorded `HEAD` to materialize tracked files.
- **REQ-03:** Snapshot metadata MUST record its schema version, base `HEAD` SHA, current branch, and build timestamp; publish a small sidecar so persisted browser workspaces can detect when a newer base is deployed.
- **REQ-04:** Browser checkout and downloaded export MUST preserve existing commit history and binary files. Browser-created commits MUST be descendants of the embedded branch.
- **REQ-05:** The current `HEAD` MUST NOT track generated output (`dist/`), `node_modules`, Astro caches, or generated snapshot artifacts (`base-git.zip` and `snapshot.json`). These paths MUST be ignored and absent from the source worktree before build; the complete Git history may still contain older generated files.
- **REQ-06:** The MVP MUST fail clearly on unsupported repository layouts/features (such as bare repositories, linked worktrees, object alternates, shallow history, submodules, or Git LFS) rather than produce a partial repository.

### Admin editor and local commits

- **REQ-07:** The built site MUST contain a static admin route at `/admin/`; `/admin` SHOULD resolve to that canonical route on supported hosts.
- **REQ-08:** The admin UI MUST provide Menus, Blog posts, Content, and Files views backed by the embedded repository. Files MUST expose all checked-out repository paths, not only CMS content files.
- **REQ-09:** The editor MUST edit raw YAML menus, Markdown/frontmatter, and other text files. It MUST support uploading/replacing and downloading binary assets and previewing common image formats.
- **REQ-10:** The user MUST be able to create, rename/move, and explicitly delete repository files; destructive operations MUST require confirmation. Saving MUST update the browser’s local working tree. The user MUST be able to stage intended changes and create local commits with a message and author identity.
- **REQ-11:** Browser repository state, including local commits, SHOULD survive reload using IndexedDB-backed storage. The UI MUST show the current branch and changed-file status, MUST NOT re-checkout over a saved working tree, and MUST warn if the deployed snapshot base differs from the persisted workspace.
- **REQ-12:** Git operations MUST be local only. The MVP MUST NOT fetch, pull, push, or send remote credentials.

### Export and console workflow

- **REQ-13:** The owner MUST be able to download a ZIP containing the current working tree and usable `.git` repository, including browser-created commits.
- **REQ-14:** The initial snapshot and export MUST preserve repository configuration needed for native Git. The browser MUST NOT use it for remote operations; the owner pushes from the console using their Git credentials.
- **REQ-15:** Unpacking the download MUST produce a directory that native Git recognizes, so the owner can inspect `git status`/`git log` and push from the console.
- **REQ-16:** If the remote has advanced, a non-fast-forward push MUST be left to native Git; the MVP MUST NOT force-push or silently rewrite history.

### Static hosting and paths

- **REQ-17:** The default `npm run build` output in `dist/` MUST work when served from that directory root, including `python3 -m http.server`.
- **REQ-18:** The GitHub Pages project site at `/astrocms/` MUST render from the `dist/` artifact. The default local build MUST NOT be globally hard-coded to `/astrocms`.
- **REQ-19:** The path behavior MUST be verified against generated HTML, CSS, JavaScript, and favicon URLs. If Astro cannot produce one path-independent artifact reliably, provide an explicit deploy-specific build profile rather than breaking the default local workflow.

Generated `dist/` output MUST remain untracked. GitHub Actions deploys the `dist/` artifact; do not commit generated site output to the source repository.

## 7. Public snapshot decision

The `.git` snapshot is a public static asset. It includes Git history and refs; the browser checks out the current `HEAD`, but older or otherwise unrendered repository data remains in the archive. This is an accepted MVP tradeoff. `/admin/` is not an access-control boundary.

- **REQ-20:** The build MUST package the Git state needed for browser checkout and local commits; the checked-out source tree MUST be materialized from Git objects, not copied into the initial snapshot.
- **REQ-21:** The browser MUST NOT fetch, pull, push, or use remote Git credentials in the MVP.
- **REQ-22:** The downloaded export MUST contain both `.git` and the checked-out working tree so native Git can inspect and push it.
- **REQ-23:** The MVP has no encryption or authentication gate for the snapshot; a key bundled in the static site would not be private.

## 8. Out of scope for the MVP

- Remote clone/fetch/pull/push in the browser and GitHub REST API push.
- Branch switching, multi-user access, permissions, locking, and browser conflict resolution.
- WYSIWYG editing, rich block editing, and build preview of unsaved drafts.
- Treating the static `/admin/` path as private.

## 9. Acceptance criteria

1. A clean `npm run build` produces the static site and a `.git`-only repository snapshot under `dist/` without network Git calls.
2. Serving `dist/` with `python3 -m http.server` loads the site and `/admin/` with all required assets.
3. The GitHub Pages build at `/astrocms/` loads the same admin UI and its assets; the default build remains root-servable.
4. On first initialization, the admin force-checks out the embedded branch at `HEAD`; it then lists and edits arbitrary repository text files, supports confirmed file creation/rename/move/delete and binary asset replacement/download, preserves edits across reloads, and creates multiple local commits.
5. Downloading and unpacking the export yields a valid Git working copy whose log contains those browser-created commits and whose status reflects the current working tree.
6. The export can be inspected with native Git and pushed from the console; the browser never pushes automatically.
7. A stale base or unsupported repository layout is surfaced rather than silently overwritten or partially exported.