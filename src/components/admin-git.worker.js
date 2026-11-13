import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import { unzipSync, zipSync } from 'fflate';
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

const FS_NAME = 'astro-cms-admin-repository';
const REPO_DIR = '/repo';
const WORKSPACE_DIR = '/workspace-meta';
const READY_FILE = `${WORKSPACE_DIR}/initialized.json`;
const fs = new LightningFS();
const pfs = fs.promises;
let initialized;
let snapshot;
let publishedSnapshot = null;
let queue = Promise.resolve();

function repoPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw new Error('Enter a repository-relative path.');
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Paths cannot contain empty, current, or parent-directory segments.');
  }
  if (segments.includes('.git')) {
    throw new Error('The .git directory is reserved for Git metadata.');
  }
  return segments.join('/');
}

function zipPath(value) {
  const path = value.replace(/^\.\//, '').replace(/\\/g, '/');
  const parts = path.split('/');
  if (!path || path.startsWith('/') || parts.some((part) => part === '..' || part === '.')) return null;
  return path;
}

async function mkdirp(directory) {
  if (!directory || directory === '/') return;
  const parts = directory.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try { await pfs.mkdir(current); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function comparePublishedSnapshot(baseUrl) {
  publishedSnapshot = null;
  const sidecarUrl = new URL('admin/snapshot.json', new URL(baseUrl, self.location.origin));
  let response;
  try { response = await fetch(sidecarUrl, { cache: 'no-cache' }); } catch { return; }
  if (!response.ok) return;
  const latest = await response.json();
  if (latest?.snapshotVersion !== 1) {
    throw new Error(`Unsupported repository snapshot version: ${latest?.snapshotVersion ?? 'missing'}.`);
  }
  if (!latest.baseSha || !latest.branch) throw new Error('The published snapshot metadata is missing its branch or base commit.');
  publishedSnapshot = latest;
}

async function ensureInitialized(baseUrl) {
  if (initialized) return initialized;
  initialized = (async () => {
    await fs.init(FS_NAME);

    let saved;
    try {
      saved = await pfs.readFile(READY_FILE, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved !== undefined) {
      snapshot = JSON.parse(saved);
      if (snapshot?.snapshotVersion !== 1) {
        throw new Error(`Unsupported saved repository snapshot version: ${snapshot?.snapshotVersion ?? 'missing'}.`);
      }
      if (!snapshot.baseSha || !snapshot.branch) throw new Error('Saved repository metadata is missing its branch or base commit.');
      await git.resolveRef({ fs, dir: REPO_DIR, ref: 'HEAD' });
      await comparePublishedSnapshot(baseUrl);
      return;
    }

    await comparePublishedSnapshot(baseUrl);
    let existingRepoEntries = [];
    try {
      existingRepoEntries = await pfs.readdir(REPO_DIR);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existingRepoEntries.length) {
      throw new Error('Repository data exists without its initialization marker. Refusing to overwrite it; export the repository or clear this browser workspace manually.');
    }

    await mkdirp(REPO_DIR);
    const archiveUrl = new URL('admin/base-git.zip', new URL(baseUrl, self.location.origin));
    const response = await fetch(archiveUrl);
    if (!response.ok) throw new Error(`Could not load the repository snapshot (${response.status}).`);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const metadataBytes = archive['snapshot.json'];
    if (!metadataBytes) throw new Error('The repository archive is missing snapshot.json.');
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
    if (metadata?.snapshotVersion !== 1) {
      throw new Error(`Unsupported repository snapshot version: ${metadata?.snapshotVersion ?? 'missing'}.`);
    }
    if (!metadata.branch || !metadata.baseSha) throw new Error('The repository snapshot is missing its branch or base commit.');
    if (publishedSnapshot && (metadata.baseSha !== publishedSnapshot.baseSha || metadata.branch !== publishedSnapshot.branch)) {
      throw new Error('The repository ZIP does not match the published snapshot metadata. Reload and try again.');
    }

    let gitEntries = 0;
    for (const [entryName, contents] of Object.entries(archive)) {
      const safeName = zipPath(entryName);
      if (!safeName || safeName.endsWith('/') || !safeName.startsWith('.git/')) continue;
      const relative = safeName.slice('.git/'.length);
      if (!relative) continue;
      const path = `${REPO_DIR}/.git/${relative}`;
      await mkdirp(path.slice(0, path.lastIndexOf('/')));
      await pfs.writeFile(path, contents);
      gitEntries++;
    }
    if (!gitEntries) throw new Error('The repository archive does not contain a Git database.');

    await git.checkout({ fs, dir: REPO_DIR, ref: metadata.branch, force: true });
    await pfs.flush();
    const checkedOutHead = await git.resolveRef({ fs, dir: REPO_DIR, ref: 'HEAD' });
    if (checkedOutHead !== metadata.baseSha) {
      throw new Error('The snapshot branch does not point at its declared base commit.');
    }
    snapshot = {
      snapshotVersion: metadata.snapshotVersion,
      baseSha: metadata.baseSha,
      branch: metadata.branch,
      builtAt: metadata.builtAt,
    };
    await mkdirp(WORKSPACE_DIR);
    await pfs.writeFile(READY_FILE, JSON.stringify(snapshot), 'utf8');
    await pfs.flush();
    await comparePublishedSnapshot(baseUrl);
  })().catch((error) => {
    initialized = null;
    throw error;
  });
  return initialized;
}

async function listFiles() {
  const files = [];
  async function visit(directory) {
    for (const name of await pfs.readdir(directory)) {
      if (directory === REPO_DIR && name === '.git') continue;
      const fullPath = `${directory}/${name}`;
      const stat = await pfs.lstat(fullPath);
      if (stat.isDirectory()) await visit(fullPath);
      else if (stat.isFile() || stat.isSymbolicLink()) {
        const path = fullPath.slice(REPO_DIR.length + 1);
        files.push({ path, size: stat.size });
      }
    }
  }
  await visit(REPO_DIR);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function status() {
  const matrix = await git.statusMatrix({ fs, dir: REPO_DIR });
  return matrix.map(([path, head, workdir, stage]) => ({ path, head, workdir, stage }));
}

async function metadata() {
  const branch = await git.currentBranch({ fs, dir: REPO_DIR, fullname: false });
  const headSha = await git.resolveRef({ fs, dir: REPO_DIR, ref: 'HEAD' });
  const isStale = publishedSnapshot && (snapshot.baseSha !== publishedSnapshot.baseSha || snapshot.branch !== publishedSnapshot.branch);
  return { ...snapshot, branch: branch || snapshot.branch, headSha, staleBase: Boolean(isStale) };
}

async function readFile(path) {
  path = repoPath(path);
  const bytes = await pfs.readFile(`${REPO_DIR}/${path}`);
  let text = null;
  if (!bytes.includes(0)) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* Binary data is returned unchanged. */ }
  }
  return { path, size: bytes.byteLength, isText: text !== null, text, bytes: text === null ? bytes : null };
}

async function writeFile(path, contents) {
  path = repoPath(path);
  const bytes = typeof contents === 'string' ? contents : new Uint8Array(contents);
  const absolute = `${REPO_DIR}/${path}`;
  await mkdirp(absolute.slice(0, absolute.lastIndexOf('/')));
  let mode;
  try {
    const stat = await pfs.lstat(absolute);
    if (stat.isFile()) mode = stat.mode & 0o777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await pfs.writeFile(absolute, bytes, mode === undefined ? {} : { mode });
  await pfs.flush();
  return { path, size: bytes.byteLength };
}

async function removeFile(path) {
  path = repoPath(path);
  await pfs.unlink(`${REPO_DIR}/${path}`);
  await pfs.flush();
  return { path };
}

async function renameFile(from, to) {
  from = repoPath(from);
  to = repoPath(to);
  const target = `${REPO_DIR}/${to}`;
  if (from !== to) {
    try {
      await pfs.lstat(target);
      throw new Error(`The destination already exists: ${to}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await mkdirp(target.slice(0, target.lastIndexOf('/')));
  await pfs.rename(`${REPO_DIR}/${from}`, target);
  await pfs.flush();
  return { from, to };
}

async function log() {
  const entries = await git.log({ fs, dir: REPO_DIR });
  return entries.map(({ oid, commit }) => ({
    oid,
    message: commit.message.trim(),
    author: commit.author.name,
    email: commit.author.email,
    timestamp: commit.author.timestamp,
  }));
}

async function commit({ message, authorName, authorEmail }) {
  const commitMessage = String(message || '').trim();
  const name = String(authorName || '').trim();
  const email = String(authorEmail || '').trim();
  if (!commitMessage || !name || !email) throw new Error('Commit message, author name, and author email are required.');
  const matrix = await git.statusMatrix({ fs, dir: REPO_DIR });
  const changed = matrix.filter(([, head, workdir, stage]) => head !== workdir || head !== stage);
  if (!changed.length) throw new Error('There are no changes to commit.');
  for (const [path, head, workdir, stage] of changed) {
    if (workdir === 0 && head !== 0) {
      if (stage !== 0) await git.remove({ fs, dir: REPO_DIR, filepath: path });
    } else if (workdir !== 0) {
      await git.add({ fs, dir: REPO_DIR, filepath: path });
    }
  }
  const oid = await git.commit({
    fs,
    dir: REPO_DIR,
    message: commitMessage,
    author: { name, email },
    committer: { name, email },
  });
  await pfs.flush();
  return { oid, message: commitMessage, author: name, email, timestamp: Math.floor(Date.now() / 1000) };
}

async function exportRepository() {
  const zipEntries = {};
  async function visit(directory) {
    for (const name of await pfs.readdir(directory)) {
      const fullPath = `${directory}/${name}`;
      const stat = await pfs.lstat(fullPath);
      if (stat.isDirectory()) {
        await visit(fullPath);
      } else if (stat.isFile() || stat.isSymbolicLink()) {
        const relative = fullPath.slice(REPO_DIR.length + 1);
        const symlink = stat.isSymbolicLink();
        const contents = symlink
          ? new TextEncoder().encode(await pfs.readlink(fullPath))
          : await pfs.readFile(fullPath);
        const permissions = stat.mode & 0o777;
        const mode = symlink ? 0o120777 : 0o100000 | permissions;
        zipEntries[relative] = [contents, { os: 3, attrs: mode * 65536 }];
      }
    }
  }
  await visit(REPO_DIR);
  await pfs.flush();
  return zipSync(zipEntries, { level: 0 });
}

async function handle(type, payload) {
  if (type !== 'init') await ensureInitialized(payload.baseUrl);
  switch (type) {
    case 'init':
      await ensureInitialized(payload.baseUrl);
      return { metadata: await metadata(), files: await listFiles(), status: await status(), log: await log() };
    case 'list': return listFiles();
    case 'read': return readFile(payload.path);
    case 'write': return writeFile(payload.path, payload.contents);
    case 'remove': return removeFile(payload.path);
    case 'rename': return renameFile(payload.from, payload.to);
    case 'status': return status();
    case 'log': return log();
    case 'metadata': return metadata();
    case 'commit': return commit(payload);
    case 'export': return exportRepository();
    default: throw new Error(`Unknown repository operation: ${type}`);
  }
}

self.addEventListener('message', (event) => {
  const { id, type, payload = {} } = event.data;
  queue = queue.then(() => handle(type, payload)).then((result) => {
    const transfer = result instanceof Uint8Array ? [result.buffer] : [];
    self.postMessage({ id, result }, transfer);
  }).catch((error) => {
    self.postMessage({ id, error: error?.message || String(error) });
  });
});
