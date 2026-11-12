const files = {
  'src/data/menus/main.yaml': `title: Main navigation
items:
  - label: Home
    href: /
  - label: Journal
    href: /journal/
  - label: About
    href: /about/
  - label: Contact
    href: /contact/
`,
  'src/content/blog/field-notes.md': `---
title: Field notes: spring
pubDate: 2026-03-18
description: A few things we noticed this season.
draft: false
---

The light is changing again, and the garden is waking up.

This is a sample post in the embedded repository snapshot.
`,
  'src/content/blog/studio-journal.md': `---
title: From the studio
pubDate: 2026-02-26
description: A note from the people behind the work.
---

A small update from the studio.
`,
  'src/content/blog/weekend-notes.md': `---
title: A slower weekend
pubDate: 2026-02-04
description: A few places worth taking your time.
---

Some places invite you to slow down.
`,
  'src/content/pages/about.md': `---
title: About the studio
description: A little about who we are.
---

# Good design starts with listening.

We are a small independent studio making thoughtful spaces for everyday life.
`,
  'src/content/pages/contact.md': `---
title: Contact
description: Start a conversation.
---

# Tell us what you’re imagining.

Email us at hello@example.com.
`,
};

const categoryNames = { menus: 'Menus', blog: 'Blog posts', content: 'Content' };
const screens = [...document.querySelectorAll('[data-screen]')];
const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
const editor = document.querySelector('[data-text-editor]');
const lineGutter = document.querySelector('[data-line-gutter]');
const toast = document.querySelector('[data-toast]');
const localCommits = [];
const drafts = new Map();
const savedDrafts = new Map();
let category = 'menus';
let selectedPath = 'src/data/menus/main.yaml';
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3300);
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
  if (crumb) crumb.textContent = name === 'editor' ? categoryNames[category] : name === 'commits' ? 'Commit history' : 'Overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateLineNumbers() {
  if (!editor || !lineGutter) return;
  const count = Math.max(1, editor.value.split('\n').length);
  lineGutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join('\n');
}

function updateEditorState() {
  if (!editor) return;
  const base = files[selectedPath] ?? '';
  const value = drafts.has(selectedPath) ? drafts.get(selectedPath) : base;
  const saved = savedDrafts.has(selectedPath) ? savedDrafts.get(selectedPath) : base;
  const changed = value !== base;
  const dirty = value !== saved;
  const dot = document.querySelector('[data-dirty-indicator]');
  const status = document.querySelector('[data-editor-status]');
  const saveButton = document.querySelector('[data-action="save"]');
  if (dot) dot.hidden = !dirty && !changed;
  if (status) status.textContent = dirty ? 'Unsaved local draft' : changed ? 'Saved draft · not committed' : 'Snapshot file';
  if (saveButton) saveButton.textContent = dirty ? 'Save draft' : changed ? 'Draft saved' : 'Save draft';
}

function openFile(path) {
  if (!(path in files)) {
    showToast('This file is only represented in the sample tree.');
    return;
  }
  selectedPath = path;
  if (editor) editor.value = drafts.has(path) ? drafts.get(path) : files[path];
  document.querySelectorAll('[data-file]').forEach((row) => {
    const selected = row.dataset.file === path;
    row.classList.toggle('is-selected', selected);
    row.setAttribute('aria-selected', String(selected));
  });
  const filename = path.split('/').at(-1);
  const title = document.querySelector('[data-editor-filename]');
  const pathLabel = document.querySelector('[data-editor-path]');
  const mark = document.querySelector('[data-editor-mark]');
  const language = document.querySelector('[data-language]');
  if (title) title.textContent = filename;
  if (pathLabel) pathLabel.textContent = path;
  if (mark) {
    const yaml = path.endsWith('.yaml');
    mark.textContent = yaml ? 'Y' : 'M';
    mark.className = `file-mark ${yaml ? 'yaml-mark' : 'markdown-mark'}`;
  }
  if (language) language.textContent = path.endsWith('.yaml') ? 'YAML' : 'Markdown';
  updateLineNumbers();
  updateEditorState();
  showScreen('editor', category);
}

function selectCategory(next) {
  if (!categoryNames[next]) return;
  category = next;
  document.querySelectorAll('[data-category]').forEach((tab) => {
    const active = tab.dataset.category === next;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const heading = document.querySelector('[data-editor-heading]');
  const description = document.querySelector('[data-editor-description]');
  const listHeading = document.querySelector('[data-list-heading]');
  if (heading) heading.textContent = categoryNames[next];
  if (listHeading) listHeading.textContent = categoryNames[next];
  if (description) description.textContent = next === 'menus' ? 'Edit navigation labels and destinations as plain YAML.' : next === 'blog' ? 'Write posts as Markdown with YAML frontmatter.' : 'Edit general site copy as Markdown.';
  const rows = [...document.querySelectorAll('[data-file]')];
  rows.forEach((row) => { row.hidden = row.dataset.kind !== next; });
  const visible = rows.filter((row) => !row.hidden);
  const count = document.querySelector('[data-visible-count]');
  if (count) count.textContent = `${visible.length} file${visible.length === 1 ? '' : 's'}`;
  if (visible[0]) openFile(visible[0].dataset.file);
  else showScreen('editor', next);
}

function renderCommits() {
  const list = document.querySelector('[data-history-list]');
  const heading = document.querySelector('[data-history-count]');
  const badge = document.querySelector('[data-commit-count]');
  if (heading) heading.textContent = `${3 + localCommits.length} commits in snapshot`;
  if (badge) badge.textContent = String(3 + localCommits.length);
  if (!list) return;
  list.querySelectorAll('[data-mock-commit]').forEach((item) => item.remove());
  localCommits.forEach((commit) => {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.dataset.mockCommit = 'true';
    const node = document.createElement('span');
    node.className = 'history-node current-node';
    const body = document.createElement('div');
    body.className = 'history-entry-body';
    const message = document.createElement('strong');
    message.textContent = commit.message;
    const description = document.createElement('p');
    description.textContent = 'Simulated local commit · not written to Git';
    const meta = document.createElement('div');
    const hash = document.createElement('code');
    hash.textContent = commit.hash;
    const author = document.createElement('span');
    author.textContent = commit.author;
    const time = document.createElement('span');
    time.textContent = 'just now';
    for (const [index, item] of [hash, author, time].entries()) {
      if (index) {
        const separator = document.createElement('span');
        separator.textContent = '·';
        meta.append(separator);
      }
      meta.append(item);
    }
    body.append(message, description, meta);
    entry.append(node, body);
    list.prepend(entry);
  });
}

function handleAction(action) {
  switch (action) {
    case 'save':
      if (!editor) return;
      drafts.set(selectedPath, editor.value);
      savedDrafts.set(selectedPath, editor.value);
      updateEditorState();
      showToast('Mock only — this draft is not stored in Git or across reloads.');
      break;
    case 'commit':
      openDialog('commit');
      break;
    case 'download':
      openDialog('download');
      break;
    case 'mock-download':
      closeDialog('download');
      showToast('Mock only — no repository ZIP was created.');
      break;
    case 'new-file':
      openDialog('new-file');
      break;
    case 'flow-help':
      showScreen('commits', 'commits');
      break;
    default:
      showToast('This control is a visual prototype.');
  }
}

function openDialog(name) {
  const dialog = document.querySelector(`[data-dialog="${name}"]`);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

function closeDialog(name) {
  const dialog = document.querySelector(`[data-dialog="${name}"]`);
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
}

function createSampleFile(title, kind) {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-content';
  const extension = kind === 'menus' ? 'yaml' : 'md';
  const base = kind === 'menus' ? 'src/data/menus' : kind === 'blog' ? 'src/content/blog' : 'src/content/pages';
  const path = `${base}/${slug}.${extension}`;
  if (path in files) {
    showToast('A sample file with that name already exists.');
    return;
  }
  files[path] = kind === 'menus'
    ? `title: ${title}\nitems:\n  - label: Home\n    href: /\n`
    : `---\ntitle: ${title}\npubDate: 2026-11-11\n---\n\nWrite your content here.\n`;
  const row = document.createElement('button');
  row.className = 'file-row';
  row.type = 'button';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  row.dataset.file = path;
  row.dataset.kind = kind;
  const mark = document.createElement('span');
  mark.className = `file-mark ${kind === 'menus' ? 'yaml-mark' : 'markdown-mark'}`;
  mark.textContent = kind === 'menus' ? 'Y' : 'M';
  const copy = document.createElement('span');
  copy.className = 'file-row-copy';
  const filename = document.createElement('strong');
  filename.textContent = `${slug}.${extension}`;
  const label = document.createElement('small');
  label.textContent = title;
  copy.append(filename, label);
  row.append(mark, copy);
  document.querySelector('.file-list')?.append(row);
  selectCategory(kind);
  openFile(path);
  showToast('Sample file added to the mock only.');
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const view = target.closest('[data-view]');
  if (view instanceof HTMLElement) {
    event.preventDefault();
    const name = view.dataset.view || 'overview';
    if (categoryNames[name]) selectCategory(name);
    else showScreen(name, name);
    return;
  }
  const categoryTab = target.closest('[data-category]');
  if (categoryTab instanceof HTMLElement) {
    selectCategory(categoryTab.dataset.category || 'menus');
    return;
  }
  const file = target.closest('[data-file]');
  if (file instanceof HTMLElement) {
    selectedPath = file.dataset.file || '';
    openFile(selectedPath);
    return;
  }
  const close = target.closest('[data-close]');
  if (close) { closeDialog(close.closest('dialog')?.dataset.dialog || ''); return; }
  const action = target.closest('[data-action]');
  if (action instanceof HTMLElement) handleAction(action.dataset.action || '');
});

document.querySelector('[data-commit-form]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
  const message = String(new FormData(form).get('message') || '').trim();
  const rawAuthor = String(new FormData(form).get('author') || '').trim();
  const author = rawAuthor.replace(/\s*<.*>$/, '') || 'Local author';
  const hash = `mock${String(localCommits.length + 1).padStart(4, '0')}`;
  localCommits.unshift({ message, author, hash });
  if (editor) {
    drafts.set(selectedPath, editor.value);
    savedDrafts.set(selectedPath, editor.value);
    updateEditorState();
  }
  closeDialog('commit');
  renderCommits();
  showToast('Mock only — no Git commit was written.');
});

document.querySelector('[data-new-file-form]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
  const data = new FormData(form);
  const kind = String(data.get('category') || 'blog');
  const title = String(data.get('title') || '').trim();
  closeDialog('new-file');
  createSampleFile(title, kind);
  form.reset();
});

document.querySelector('[data-file-search]')?.addEventListener('input', (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  const query = input.value.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('[data-file]').forEach((row) => {
    const matches = row.dataset.kind === category && row.textContent.toLowerCase().includes(query);
    row.hidden = !matches;
    if (matches) visible++;
  });
  const count = document.querySelector('[data-visible-count]');
  if (count) count.textContent = `${visible} file${visible === 1 ? '' : 's'}`;
});

editor?.addEventListener('input', () => {
  if (!editor) return;
  drafts.set(selectedPath, editor.value);
  updateLineNumbers();
  updateEditorState();
});
editor?.addEventListener('scroll', () => {
  if (editor && lineGutter) lineGutter.scrollTop = editor.scrollTop;
});

document.querySelectorAll('[data-dialog]').forEach((dialog) => {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
});

function initializeEditor() {
  if (editor) editor.value = files[selectedPath];
  document.querySelectorAll('[data-file]').forEach((row) => { row.hidden = row.dataset.kind !== category; });
  updateLineNumbers();
  updateEditorState();
}

initializeEditor();
