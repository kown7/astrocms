const categoryNames = { menus: 'Menus', blog: 'Blog posts', content: 'Content' };
const screens = [...document.querySelectorAll('[data-screen]')];
const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
const editor = document.querySelector('[data-text-editor]');
const lineGutter = document.querySelector('[data-line-gutter]');
const toast = document.querySelector('[data-toast]');
const worker = new Worker(new URL('./admin-git.worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
const BASE_URL = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
let requestId = 0;
let toastTimer;
let files = [];
let statuses = [];
let commits = [];
let repository = null;
let currentView = 'overview';
let category = 'menus';
let selectedPath = '';
let savedText = '';
let isTextFile = false;
let imageUrl = '';
let fileFilter = '';

worker.addEventListener('message', ({ data }) => {
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.result);
});
worker.addEventListener('error', (event) => {
  for (const request of pending.values()) request.reject(new Error(event.message || 'The repository worker stopped unexpectedly.'));
  pending.clear();
});

function callWorker(type, payload = {}, transfer = []) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload: { baseUrl: BASE_URL, ...payload } }, transfer);
  });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4200);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function showScreen(name, activeView = name) {
  screens.forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
  navItems.forEach((item) => {
    const active = item.dataset.view === activeView;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const crumb = document.querySelector('[data-breadcrumb]');
  if (crumb) crumb.textContent = name === 'editor' ? (activeView === 'files' ? 'Files' : categoryNames[category]) : name === 'commits' ? 'Commit history' : 'Overview';
  currentView = activeView;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function kindFor(path) {
  if (path.startsWith('src/data/menus/')) return 'menus';
  if (path.startsWith('src/content/blog/')) return 'blog';
  if (path.startsWith('src/content/pages/')) return 'content';
  return '';
}

function statusFor(path) {
  const item = statuses.find((entry) => entry.path === path);
  if (!item) return 'Untracked';
  if (item.head === 0 && item.workdir !== 0) return 'Untracked';
  if (item.workdir === 0 && item.head !== 0) return 'Deleted';
  if (item.stage !== item.head && item.workdir !== item.stage) return 'Staged + modified';
  if (item.stage !== item.head) return 'Staged';
  if (item.workdir !== item.stage) return 'Modified';
  return 'Tracked';
}

function statusText(path) {
  const status = statusFor(path);
  return status === 'Tracked' ? 'Tracked in HEAD' : status;
}

function markFor(path) {
  if (/\.ya?ml$/i.test(path)) return ['Y', 'yaml-mark'];
  if (/\.(md|mdx|txt|astro|html|css|js|mjs|ts|json|toml|xml|svg)$/i.test(path)) return ['T', 'markdown-mark'];
  if (/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path)) return ['I', 'markdown-mark'];
  return ['F', 'markdown-mark'];
}

function updateLineNumbers() {
  if (!editor || !lineGutter) return;
  const count = Math.max(1, editor.value.split('\n').length);
  lineGutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join('\n');
}

function currentStatusLine() {
  if (!selectedPath) return 'Select a repository file';
  if (editor && isTextFile && editor.value !== savedText) return 'Unsaved editor changes';
  return statusText(selectedPath);
}

function updateEditorState() {
  const changed = Boolean(editor && isTextFile && selectedPath && editor.value !== savedText);
  const dot = document.querySelector('[data-dirty-indicator]');
  const status = document.querySelector('[data-editor-status]');
  const saveButton = document.querySelector('[data-action="save"]');
  if (dot) dot.hidden = !changed;
  if (status) status.textContent = currentStatusLine();
  if (saveButton) {
    saveButton.disabled = !selectedPath || !isTextFile;
    saveButton.textContent = changed ? 'Save to worktree' : 'Saved';
  }
  document.querySelectorAll('[data-action="rename"], [data-action="delete"]').forEach((button) => { button.disabled = !selectedPath; });
  const downloadButton = document.querySelector('[data-action="download-file"]');
  if (downloadButton) downloadButton.disabled = !selectedPath || isTextFile;
}

function renderFileList() {
  const list = document.querySelector('[data-file-list]');
  if (!list) return;
  const search = fileFilter.toLowerCase();
  const visibleFiles = files.filter(({ path }) => {
    const belongs = currentView === 'files' || kindFor(path) === category;
    return belongs && (!search || path.toLowerCase().includes(search));
  });
  list.replaceChildren();
  for (const file of visibleFiles) {
    const [label, markClass] = markFor(file.path);
    const row = document.createElement('button');
    row.className = 'file-row';
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(file.path === selectedPath));
    row.classList.toggle('is-selected', file.path === selectedPath);
    row.dataset.file = file.path;
    const mark = document.createElement('span');
    mark.className = `file-mark ${markClass}`;
    mark.textContent = label;
    const copy = document.createElement('span');
    copy.className = 'file-row-copy';
    const name = document.createElement('strong');
    name.textContent = file.path.split('/').at(-1);
    const info = document.createElement('small');
    const status = statusFor(file.path);
    info.textContent = status === 'Tracked' ? file.path : `${file.path} · ${status}`;
    copy.append(name, info);
    row.append(mark, copy);
    list.append(row);
  }
  const countLabel = `${visibleFiles.length} file${visibleFiles.length === 1 ? '' : 's'}`;
  setText('[data-visible-count]', countLabel);
  setText('[data-list-state]', statuses.some((item) => statusFor(item.path) !== 'Tracked') ? 'Worktree changes' : 'Local worktree');
  const categories = ['menus', 'blog', 'content'];
  for (const kind of categories) {
    const count = files.filter(({ path }) => kindFor(path) === kind).length;
    setText(`[data-category-count="${kind}"]`, String(count));
    setText(`[data-category-nav-count="${kind}"]`, String(count));
  }
}

function imageMime(path) {
  const ext = path.split('.').at(-1).toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml' })[ext] || 'application/octet-stream';
}

function revokeImageUrl() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = '';
}

function clearSelectedFile() {
  revokeImageUrl();
  selectedPath = '';
  savedText = '';
  isTextFile = false;
  if (editor) { editor.value = ''; editor.disabled = true; }
  document.querySelector('[data-text-panel]').hidden = false;
  document.querySelector('[data-binary-panel]').hidden = true;
  document.querySelector('[data-image-preview]').hidden = true;
  setText('[data-editor-filename]', 'Select a file');
  setText('[data-editor-path]', '');
  setText('[data-editor-mark]', 'F');
  setText('[data-language]', '—');
  updateLineNumbers();
  updateEditorState();
  renderFileList();
}

async function mayLeaveCurrentFile() {
  if (!selectedPath || !editor || !isTextFile || editor.value === savedText) return true;
  if (!window.confirm('Save your unsaved editor changes before continuing? Choose Cancel to stay on this file.')) return false;
  await saveSelected();
  return true;
}

async function openFile(path) {
  if (path === selectedPath) return;
  if (!(await mayLeaveCurrentFile())) return;
  try {
    const result = await callWorker('read', { path });
    revokeImageUrl();
    selectedPath = result.path;
    isTextFile = result.isText;
    const filename = path.split('/').at(-1);
    const [markValue, markClass] = markFor(path);
    const mark = document.querySelector('[data-editor-mark]');
    setText('[data-editor-filename]', filename);
    setText('[data-editor-path]', path);
    if (mark) { mark.textContent = markValue; mark.className = `file-mark ${markClass}`; }
    const extension = path.split('.').at(-1).toUpperCase();
    setText('[data-language]', result.isText ? (extension || 'TEXT') : 'BINARY');
    if (result.isText) {
      document.querySelector('[data-text-panel]').hidden = false;
      document.querySelector('[data-binary-panel]').hidden = true;
      if (editor) { editor.disabled = false; editor.value = result.text; }
      savedText = result.text;
    } else {
      if (editor) { editor.value = ''; editor.disabled = true; }
      document.querySelector('[data-text-panel]').hidden = true;
      document.querySelector('[data-binary-panel]').hidden = false;
      const image = document.querySelector('[data-image-preview]');
      const message = document.querySelector('[data-binary-message]');
      const bytes = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
      if (/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(path)) {
        imageUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(path) }));
        image.src = imageUrl;
        image.hidden = false;
        message.textContent = `${result.size.toLocaleString()} bytes · image preview`;
      } else {
        image.hidden = true;
        image.removeAttribute('src');
        message.textContent = `Binary file · ${result.size.toLocaleString()} bytes. Download or replace this asset.`;
      }
    }
    updateLineNumbers();
    updateEditorState();
    renderFileList();
  } catch (error) {
    showToast(`Could not open file: ${error.message}`);
  }
}

async function saveSelected() {
  if (!selectedPath || !editor || !isTextFile) return;
  await callWorker('write', { path: selectedPath, contents: editor.value });
  savedText = editor.value;
  await refreshRepository();
  updateEditorState();
  showToast('Saved to the local repository worktree.');
}

function renderRecentFiles() {
  const container = document.querySelector('[data-recent-files]');
  if (!container) return;
  const recent = files.filter(({ path }) => /\.(md|mdx|txt|ya?ml|astro|html|css|js|mjs|ts|json|toml)$/i.test(path)).slice(0, 3);
  container.replaceChildren();
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'subheading';
    empty.textContent = 'No text files found in this repository.';
    container.append(empty);
    return;
  }
  for (const { path } of recent) {
    const [markText, markClass] = markFor(path);
    const row = document.createElement('button');
    row.className = 'recent-file';
    row.type = 'button';
    row.dataset.openFile = path;
    const mark = document.createElement('span');
    mark.className = `file-mark ${markClass}`;
    mark.textContent = markText;
    const label = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = path.split('/').at(-1);
    const location = document.createElement('small');
    location.textContent = path;
    label.append(name, location);
    const state = document.createElement('span');
    state.className = 'recent-time';
    state.textContent = statusFor(path);
    row.append(mark, label, state);
    container.append(row);
  }
}

function renderMetadata() {
  if (!repository) return;
  const { branch, baseSha, builtAt, headSha } = repository;
  const shortBase = baseSha ? baseSha.slice(0, 12) : '—';
  setText('[data-sidebar-branch]', branch || 'Detached HEAD');
  setText('[data-sidebar-sha]', shortBase);
  setText('[data-overview-branch]', branch || 'Detached HEAD');
  setText('[data-overview-base]', shortBase);
  setText('[data-overview-built]', builtAt ? new Date(builtAt).toLocaleString() : '—');
  setText('[data-push-branch]', branch || 'HEAD');
  setText('[data-history-branch]', branch || 'Detached HEAD');
  setText('[data-history-base]', shortBase);
  setText('[data-export-branch]', branch || 'Detached HEAD');
  setText('[data-export-base]', shortBase);
  setText('[data-push-command]', `git push origin ${branch || 'HEAD'}`);
  const staleWarning = document.querySelector('[data-stale-warning]');
  if (staleWarning) {
    staleWarning.hidden = !repository.staleBase;
    staleWarning.textContent = repository.staleBase ? 'A newer build snapshot is available. Your saved browser repository was not replaced.' : '';
  }
  setText('[data-sidebar-state]', headSha && baseSha && headSha !== baseSha ? `HEAD ${headSha.slice(0, 7)}` : 'Clean at build time');
}

function renderCommits() {
  const list = document.querySelector('[data-history-list]');
  if (!list) return;
  list.replaceChildren();
  setText('[data-history-count]', `${commits.length} commit${commits.length === 1 ? '' : 's'} in history`);
  setText('[data-commit-count]', String(commits.length));
  const hasChanges = statuses.some((item) => statusFor(item.path) !== 'Tracked');
  setText('[data-worktree-status]', hasChanges ? 'WORKTREE CHANGES' : 'CLEAN WORKTREE');
  commits.forEach((commit, index) => {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    const node = document.createElement('span');
    node.className = `history-node${index === 0 ? ' current-node' : ''}`;
    const body = document.createElement('div');
    body.className = 'history-entry-body';
    const message = document.createElement('strong');
    message.textContent = commit.message || '(no commit message)';
    const description = document.createElement('p');
    description.textContent = index === 0 ? 'Current HEAD' : 'Local repository commit';
    const meta = document.createElement('div');
    const hash = document.createElement('code');
    hash.textContent = commit.oid.slice(0, 10);
    const author = document.createElement('span');
    author.textContent = commit.author || commit.email || 'Unknown author';
    const date = document.createElement('span');
    date.textContent = new Date(commit.timestamp * 1000).toLocaleString();
    for (const [position, item] of [hash, author, date].entries()) {
      if (position) {
        const separator = document.createElement('span');
        separator.textContent = '·';
        meta.append(separator);
      }
      meta.append(item);
    }
    body.append(message, description, meta);
    entry.append(node, body);
    if (index < commits.length - 1) {
      const line = document.createElement('span');
      line.className = 'history-branch-line';
      entry.append(line);
    }
    list.append(entry);
  });
}

async function refreshRepository(initial = false) {
  if (initial) {
    const result = await callWorker('init', { baseUrl: BASE_URL });
    repository = result.metadata;
    files = result.files;
    statuses = result.status;
    commits = result.log;
  } else {
    const [nextFiles, nextStatus, nextMeta, nextLog] = await Promise.all([
      callWorker('list'), callWorker('status'), callWorker('metadata'), callWorker('log'),
    ]);
    files = nextFiles;
    statuses = nextStatus;
    repository = nextMeta;
    commits = nextLog;
  }
  renderMetadata();
  renderFileList();
  renderRecentFiles();
  renderCommits();
  updateEditorState();
  setText('[data-repository-state]', `${files.length} files ready in this browser`);
}

function categoryFolder() {
  return category === 'menus' ? 'src/data/menus/' : category === 'blog' ? 'src/content/blog/' : 'src/content/pages/';
}

function openDialog(name) {
  const dialog = document.querySelector(`[data-dialog="${name}"]`);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

function closeDialog(name) {
  const dialog = document.querySelector(`[data-dialog="${name}"]`);
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
}

function handleAction(action) {
  switch (action) {
    case 'save': void saveSelected().catch((error) => showToast(`Save failed: ${error.message}`)); break;
    case 'commit': openDialog('commit'); break;
    case 'download': openDialog('download'); break;
    case 'export': void exportRepository(); break;
    case 'new-file':
      if (document.querySelector('[data-new-file-form]')) {
        const input = document.querySelector('[name="path"]');
        if (input && !input.value && currentView !== 'files') input.value = `${categoryFolder()}new-file.${category === 'menus' ? 'yaml' : 'md'}`;
        openDialog('new-file');
      }
      break;
    case 'rename': void renameSelected(); break;
    case 'delete': void deleteSelected(); break;
    case 'upload': document.querySelector('[data-upload-input]')?.click(); break;
    case 'download-file': void downloadSelectedFile(); break;
    case 'flow-help': void selectView('commits'); break;
    default: break;
  }
}

async function exportRepository() {
  try {
    if (editor && selectedPath && isTextFile && editor.value !== savedText) {
      if (!window.confirm('Save unsaved editor changes before exporting?')) return;
      await callWorker('write', { path: selectedPath, contents: editor.value });
      savedText = editor.value;
      await refreshRepository();
    }
    const data = await callWorker('export');
    const blob = new Blob([data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'repository.zip';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeDialog('download');
    showToast('Repository ZIP downloaded with the current worktree and Git history.');
  } catch (error) {
    showToast(`Export failed: ${error.message}`);
  }
}

async function downloadSelectedFile() {
  if (!selectedPath) return;
  try {
    const result = await callWorker('read', { path: selectedPath });
    const content = result.isText ? result.text : result.bytes;
    const blob = new Blob([content], { type: result.isText ? 'text/plain;charset=utf-8' : imageMime(selectedPath) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = selectedPath.split('/').at(-1);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showToast(`Download failed: ${error.message}`);
  }
}

async function renameSelected() {
  if (!selectedPath || !(await mayLeaveCurrentFile())) return;
  const from = selectedPath;
  const to = window.prompt('New repository-relative path', from);
  if (to === null || !to.trim() || to.trim() === from) return;
  if (!window.confirm(`Rename ${from} to ${to.trim()}?`)) return;
  try {
    await callWorker('rename', { from, to: to.trim() });
    selectedPath = '';
    await refreshRepository();
    await openFile(to.trim());
    showToast('File renamed in the local worktree.');
  } catch (error) {
    showToast(`Rename failed: ${error.message}`);
  }
}

async function deleteSelected() {
  if (!selectedPath || !(await mayLeaveCurrentFile())) return;
  const path = selectedPath;
  if (!window.confirm(`Delete ${path} from the local worktree? This change will be included in the next commit.`)) return;
  try {
    await callWorker('remove', { path });
    clearSelectedFile();
    await refreshRepository();
    showToast('File deleted from the local worktree.');
  } catch (error) {
    showToast(`Delete failed: ${error.message}`);
  }
}

async function selectView(name) {
  if (['menus', 'blog', 'content', 'files'].includes(name)) {
    if (!(await mayLeaveCurrentFile())) return;
    if (name === 'files') {
      document.querySelector('.category-tabs').hidden = true;
      setText('[data-editor-heading]', 'Files');
      setText('[data-list-heading]', 'Files');
      setText('[data-editor-description]', 'Browse and edit any text or asset file in the local repository.');
      showScreen('editor', 'files');
    } else {
      category = name;
      document.querySelector('.category-tabs').hidden = false;
      document.querySelectorAll('[data-category]').forEach((tab) => {
        const active = tab.dataset.category === category;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      setText('[data-editor-heading]', categoryNames[name]);
      setText('[data-list-heading]', categoryNames[name]);
      setText('[data-editor-description]', name === 'menus' ? 'Edit menu files in the local working tree.' : name === 'blog' ? 'Edit blog posts from the repository.' : 'Edit content pages from the repository.');
      showScreen('editor', name);
    }
    fileFilter = '';
    const search = document.querySelector('[data-file-search]');
    if (search) search.value = '';
    renderFileList();
    const first = files.find(({ path }) => name === 'files' || kindFor(path) === category);
    if (first) await openFile(first.path);
    else clearSelectedFile();
    return;
  }
  if (!(await mayLeaveCurrentFile())) return;
  if (name === 'commits') {
    showScreen('commits', 'commits');
    return;
  }
  showScreen('overview', 'overview');
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const view = target.closest('[data-view]');
  if (view instanceof HTMLElement) {
    event.preventDefault();
    void selectView(view.dataset.view || 'overview');
    return;
  }
  const categoryTab = target.closest('[data-category]');
  if (categoryTab instanceof HTMLElement) {
    void selectView(categoryTab.dataset.category || 'menus');
    return;
  }
  const file = target.closest('[data-file]');
  if (file instanceof HTMLElement) {
    void openFile(file.dataset.file || '');
    return;
  }
  const recent = target.closest('[data-open-file]');
  if (recent instanceof HTMLElement) {
    void selectView('files').then(() => openFile(recent.dataset.openFile || ''));
    return;
  }
  const close = target.closest('[data-close]');
  if (close) { closeDialog(close.closest('dialog')?.dataset.dialog || ''); return; }
  const action = target.closest('[data-action]');
  if (action instanceof HTMLElement) handleAction(action.dataset.action || '');
});

document.querySelector('[data-file-search]')?.addEventListener('input', (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  fileFilter = input.value.trim();
  renderFileList();
});

editor?.addEventListener('input', () => {
  updateLineNumbers();
  updateEditorState();
});
editor?.addEventListener('scroll', () => {
  if (editor && lineGutter) lineGutter.scrollTop = editor.scrollTop;
});

document.querySelector('[data-commit-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
  const data = new FormData(form);
  try {
    if (editor && isTextFile && editor.value !== savedText) {
      await callWorker('write', { path: selectedPath, contents: editor.value });
      savedText = editor.value;
    }
    const commit = await callWorker('commit', {
      message: String(data.get('message') || ''),
      authorName: String(data.get('authorName') || ''),
      authorEmail: String(data.get('authorEmail') || ''),
    });
    closeDialog('commit');
    form.reset();
    await refreshRepository();
    showToast(`Created commit ${commit.oid.slice(0, 10)}.`);
  } catch (error) {
    showToast(`Commit failed: ${error.message}`);
  }
});

document.querySelector('[data-new-file-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
  if (!(await mayLeaveCurrentFile())) return;
  const data = new FormData(form);
  const path = String(data.get('path') || '').trim();
  if (files.some((file) => file.path === path)) {
    showToast('That repository path already exists. Choose a new path.');
    return;
  }
  try {
    await callWorker('write', { path, contents: String(data.get('content') || '') });
    closeDialog('new-file');
    form.reset();
    selectedPath = '';
    await refreshRepository();
    showScreen('editor', currentView);
    await openFile(path);
    showToast('New text file created in the local worktree.');
  } catch (error) {
    showToast(`Could not create file: ${error.message}`);
  }
});

document.querySelector('[data-upload-input]')?.addEventListener('change', async (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
  const file = input.files[0];
  if (!(await mayLeaveCurrentFile())) { input.value = ''; return; }
  const requestedPath = window.prompt('Repository path for this asset. Keep the current path to replace it, or enter a new path.', selectedPath || file.name);
  if (!requestedPath || !requestedPath.trim()) { input.value = ''; return; }
  const path = requestedPath.trim();
  if (files.some((entry) => entry.path === path) && !window.confirm(`Replace ${path} with ${file.name}?`)) { input.value = ''; return; }
  try {
    const buffer = await file.arrayBuffer();
    await callWorker('write', { path, contents: buffer }, [buffer]);
    selectedPath = '';
    await refreshRepository();
    await openFile(path);
    showToast('Asset uploaded to the local worktree.');
  } catch (error) {
    showToast(`Upload failed: ${error.message}`);
  } finally {
    input.value = '';
  }
});

document.querySelectorAll('[data-dialog]').forEach((dialog) => {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
});

async function initializeEditor() {
  try {
    await refreshRepository(true);
    showScreen('overview', 'overview');
  } catch (error) {
    setText('[data-repository-state]', 'Repository initialization failed');
    setText('[data-sidebar-state]', 'Initialization failed');
    showToast(`Could not open repository: ${error.message}`);
  }
}

void initializeEditor();
