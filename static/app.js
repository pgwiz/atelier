// ===================================================
// ATELIER CORE CLIENT CONTROLLER & SPA ROUTER
// ===================================================

const state = {
  activeView: 'prompts',
  prompts: [],
  characters: [],
  links: [],
  boards: [],
  tags: [],
  activeBoardId: null,
  activeSearchType: 'all',
  selectedTagFilter: null,
};

// ===================================================
// INITIALIZATION & SPA VIEW SWITCHING
// ===================================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initNavigation();
  initModals();
  initPromptsView();
  initCharactersView();
  initLinksView();
  initBoardsView();
  initSearchView();
  initBackupView();

  // Initial data load
  refreshAllData();
});

const THEMES = [
  { id: 'dark', name: 'Dark Slate' },
  { id: 'light', name: 'Crisp Light' },
  { id: 'sepia', name: 'Warm Sepia' },
  { id: 'pastel', name: 'Pastel Dream' },
  { id: 'cyberpunk', name: 'Cyberpunk Neon' },
];

function initTheme() {
  const savedTheme = localStorage.getItem('atelier_theme') || 'dark';
  applyTheme(savedTheme, false);

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const currentIndex = THEMES.findIndex(t => t.id === current);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      const nextTheme = THEMES[nextIndex];
      applyTheme(nextTheme.id, true);
    });
  }

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value, true);
    });
  }
}

function applyTheme(themeId, notify = false) {
  const themeObj = THEMES.find(t => t.id === themeId) || THEMES[0];
  document.documentElement.setAttribute('data-theme', themeObj.id);
  localStorage.setItem('atelier_theme', themeObj.id);

  const currentThemeLabel = document.getElementById('current-theme-name');
  if (currentThemeLabel) {
    currentThemeLabel.textContent = themeObj.name;
  }

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.title = `Theme: ${themeObj.name} (Click to switch)`;
  }

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect && themeSelect.value !== themeObj.id) {
    themeSelect.value = themeObj.id;
  }

  if (notify) {
    showToast(`Theme switched to ${themeObj.name}`);
  }
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const brandContainer = document.getElementById('brand-container');

  // Restore saved sidebar collapsed state
  const isCollapsed = localStorage.getItem('atelier_sidebar_collapsed') === 'true';
  if (isCollapsed && sidebar) {
    sidebar.classList.add('collapsed');
    updateBrandTitle(true);
  }

  function setSidebarCollapsed(collapsed) {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    localStorage.setItem('atelier_sidebar_collapsed', collapsed ? 'true' : 'false');
    updateBrandTitle(collapsed);
  }

  function updateBrandTitle(collapsed) {
    if (brandContainer) {
      brandContainer.title = collapsed ? 'Click to expand sidebar' : 'Atelier';
    }
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isNowCollapsed = !sidebar.classList.contains('collapsed');
      setSidebarCollapsed(isNowCollapsed);
    });
  }

  if (brandContainer && sidebar) {
    brandContainer.addEventListener('click', () => {
      // If navbar is compressed, clicking the brand icon expands it
      if (sidebar.classList.contains('collapsed')) {
        setSidebarCollapsed(false);
      }
    });
  }
}

function initNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;

  // Update nav buttons
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update view sections
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.remove('active');
  });

  const activeSection = document.getElementById(`view-${viewName}`);
  if (activeSection) {
    activeSection.classList.add('active');
  }

  // View-specific refreshes
  if (viewName === 'prompts') loadPrompts();
  if (viewName === 'characters') loadCharacters();
  if (viewName === 'links') loadLinks();
  if (viewName === 'boards') {
    // Show boards list by default
    document.getElementById('boards-list-container').style.display = 'block';
    document.getElementById('canvas-container').style.display = 'none';
    loadBoards();
  }
  if (viewName === 'search') {
    loadTags();
    performSearch();
  }
}

// Refresh all entity collections
async function refreshAllData() {
  await Promise.all([
    loadPrompts(),
    loadCharacters(),
    loadLinks(),
    loadBoards(),
    loadTags(),
  ]);
  updateSidebarBadges();
}

function updateSidebarBadges() {
  document.getElementById('badge-prompts').textContent = state.prompts.length;
  document.getElementById('badge-characters').textContent = state.characters.length;
  document.getElementById('badge-links').textContent = state.links.length;
  document.getElementById('badge-boards').textContent = state.boards.length;
}

// ===================================================
// PROMPTS CONTROLLER
// ===================================================

function initPromptsView() {
  document.getElementById('btn-new-prompt').addEventListener('click', () => {
    openPromptModal();
  });

  const searchInput = document.getElementById('filter-prompts-search');
  searchInput.addEventListener('input', () => filterPrompts());

  const catSelect = document.getElementById('filter-prompts-category');
  catSelect.addEventListener('change', () => filterPrompts());

  const charSelect = document.getElementById('filter-prompts-character');
  charSelect.addEventListener('change', () => filterPrompts());

  const favBtn = document.getElementById('filter-prompts-fav');
  favBtn.addEventListener('click', () => {
    favBtn.classList.toggle('active');
    filterPrompts();
  });

  document.getElementById('form-prompt').addEventListener('submit', handlePromptSubmit);
}

async function loadPrompts() {
  try {
    const res = await fetch('/api/prompts');
    state.prompts = await res.json();
    populateCategoryDropdown();
    populateCharacterDropdowns();
    renderPromptsList(state.prompts);
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load prompts', err);
  }
}

function populateCategoryDropdown() {
  const select = document.getElementById('filter-prompts-category');
  if (!select) return;

  const currentVal = select.value;
  const categories = new Set();
  state.prompts.forEach((p) => {
    if (p.category && p.category.trim()) categories.add(p.category.trim());
  });

  select.innerHTML = '<option value="">All Categories</option>';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  select.value = currentVal;
}

function populateCharacterDropdowns() {
  // Filter bar dropdown
  const filterSelect = document.getElementById('filter-prompts-character');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Characters</option>';
    state.characters.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = currentVal;
  }

  // Modal dropdown
  const modalSelect = document.getElementById('prompt-character');
  if (modalSelect) {
    modalSelect.innerHTML = '<option value="">None (Independent Prompt)</option>';
    state.characters.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      modalSelect.appendChild(opt);
    });
  }
}

function filterPrompts() {
  const query = document.getElementById('filter-prompts-search').value.toLowerCase().trim();
  const category = document.getElementById('filter-prompts-category').value;
  const characterId = document.getElementById('filter-prompts-character').value;
  const favOnly = document.getElementById('filter-prompts-fav').classList.contains('active');

  const filtered = state.prompts.filter((p) => {
    if (query) {
      const inTitle = p.title.toLowerCase().includes(query);
      const inBody = p.body.toLowerCase().includes(query);
      const inNotes = p.notes && p.notes.toLowerCase().includes(query);
      if (!inTitle && !inBody && !inNotes) return false;
    }
    if (category && p.category !== category) return false;
    if (characterId && String(p.character_id) !== characterId) return false;
    if (favOnly && !p.is_favorite) return false;
    return true;
  });

  renderPromptsList(filtered);
}

function renderPromptsList(prompts) {
  const grid = document.getElementById('prompts-grid');
  grid.innerHTML = '';

  if (prompts.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-feather-pointed empty-icon"></i><p>No prompts found. Click "New Prompt" to add one.</p></div>';
    return;
  }

  prompts.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'card-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = p.title;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Favorite button
    const favBtn = document.createElement('button');
    favBtn.className = `action-icon-btn ${p.is_favorite ? 'active' : ''}`;
    favBtn.innerHTML = p.is_favorite ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    favBtn.title = p.is_favorite ? 'Favorited' : 'Add to favorites';
    favBtn.addEventListener('click', () => togglePromptFavorite(p.id));
    actions.appendChild(favBtn);

    // Copy Prompt text
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-icon-btn';
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyBtn.title = 'Copy prompt to clipboard';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(p.body);
      showToast('Prompt copied to clipboard!');
    });
    actions.appendChild(copyBtn);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    editBtn.title = 'Edit prompt';
    editBtn.addEventListener('click', () => openPromptModal(p));
    actions.appendChild(editBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete prompt';
    delBtn.addEventListener('click', () => deletePrompt(p.id));
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = p.body;
    card.appendChild(body);

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'card-meta';

    if (p.category) {
      const catBadge = document.createElement('span');
      catBadge.className = 'badge badge-primary';
      const catIcon = document.createElement('i');
      catIcon.className = 'fa-solid fa-tag';
      catBadge.appendChild(catIcon);
      catBadge.appendChild(document.createTextNode(` ${p.category}`));
      meta.appendChild(catBadge);
    }

    if (p.character_name) {
      const charBadge = document.createElement('span');
      charBadge.className = 'badge';
      const cIcon = document.createElement('i');
      cIcon.className = 'fa-solid fa-user';
      charBadge.appendChild(cIcon);
      charBadge.appendChild(document.createTextNode(` ${p.character_name}`));
      meta.appendChild(charBadge);
    }

    if (p.model_used) {
      const modelBadge = document.createElement('span');
      modelBadge.className = 'badge';
      const mIcon = document.createElement('i');
      mIcon.className = 'fa-solid fa-microchip';
      modelBadge.appendChild(mIcon);
      modelBadge.appendChild(document.createTextNode(` ${p.model_used}`));
      meta.appendChild(modelBadge);
    }

    card.appendChild(meta);

    // Tags
    if (p.tags && p.tags.length > 0) {
      const tagsList = document.createElement('div');
      tagsList.className = 'tags-list';
      p.tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${t}`;
        chip.addEventListener('click', () => {
          switchView('search');
          searchByTag(t);
        });
        tagsList.appendChild(chip);
      });
      card.appendChild(tagsList);
    }

    grid.appendChild(card);
  });
}

function openPromptModal(prompt = null) {
  const titleEl = document.getElementById('prompt-modal-title');
  const idEl = document.getElementById('prompt-id');
  const titleInput = document.getElementById('prompt-title');
  const bodyInput = document.getElementById('prompt-body');
  const systemInput = document.getElementById('prompt-system');
  const catInput = document.getElementById('prompt-category');
  const charSelect = document.getElementById('prompt-character');
  const modelInput = document.getElementById('prompt-model');
  const paramsInput = document.getElementById('prompt-parameters');
  const notesInput = document.getElementById('prompt-notes');
  const tagsInput = document.getElementById('prompt-tags');
  const favInput = document.getElementById('prompt-favorite');

  populateCharacterDropdowns();

  if (prompt) {
    titleEl.textContent = 'Edit Prompt';
    idEl.value = prompt.id;
    titleInput.value = prompt.title || '';
    bodyInput.value = prompt.body || '';
    systemInput.value = prompt.system_prompt || '';
    catInput.value = prompt.category || '';
    charSelect.value = prompt.character_id || '';
    modelInput.value = prompt.model_used || '';
    paramsInput.value = prompt.parameters || '';
    notesInput.value = prompt.notes || '';
    tagsInput.value = (prompt.tags || []).join(', ');
    favInput.checked = prompt.is_favorite || false;
  } else {
    titleEl.textContent = 'New Prompt';
    idEl.value = '';
    titleInput.value = '';
    bodyInput.value = '';
    systemInput.value = '';
    catInput.value = '';
    charSelect.value = '';
    modelInput.value = '';
    paramsInput.value = '';
    notesInput.value = '';
    tagsInput.value = '';
    favInput.checked = false;
  }

  openModal('modal-prompt');
}

async function handlePromptSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('prompt-id').value;

  const rawParams = document.getElementById('prompt-parameters').value.trim();
  let parsedParams = null;
  if (rawParams) {
    try {
      parsedParams = JSON.parse(rawParams);
    } catch {
      parsedParams = rawParams;
    }
  }

  const tags = document.getElementById('prompt-tags').value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const charVal = document.getElementById('prompt-character').value;

  const payload = {
    title: document.getElementById('prompt-title').value.trim(),
    body: document.getElementById('prompt-body').value.trim(),
    system_prompt: document.getElementById('prompt-system').value.trim() || null,
    category: document.getElementById('prompt-category').value.trim() || null,
    character_id: charVal ? parseInt(charVal, 10) : null,
    model_used: document.getElementById('prompt-model').value.trim() || null,
    parameters: parsedParams,
    notes: document.getElementById('prompt-notes').value.trim() || null,
    tags,
    is_favorite: document.getElementById('prompt-favorite').checked,
  };

  try {
    if (id) {
      // Update
      const res = await fetch(`/api/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Prompt updated successfully');
    } else {
      // Create
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Prompt created successfully');
    }

    closeModal('modal-prompt');
    await loadPrompts();
  } catch (err) {
    console.error('Failed to save prompt', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function togglePromptFavorite(id) {
  try {
    const res = await fetch(`/api/prompts/${id}/favorite`, { method: 'POST' });
    if (res.ok) {
      await loadPrompts();
    }
  } catch (err) {
    console.error('Failed to toggle favorite', err);
  }
}

async function deletePrompt(id) {
  if (!confirm('Are you sure you want to delete this prompt?')) return;
  try {
    const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Prompt deleted');
      await loadPrompts();
    }
  } catch (err) {
    console.error('Failed to delete prompt', err);
    showToast('Failed to delete prompt', 'error');
  }
}

// ===================================================
// CHARACTERS CONTROLLER
// ===================================================

function initCharactersView() {
  document.getElementById('btn-new-character').addEventListener('click', () => {
    openCharacterModal();
  });

  const searchInput = document.getElementById('filter-characters-search');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = state.characters.filter((c) => {
      const inName = c.name.toLowerCase().includes(q);
      const inDesc = c.description && c.description.toLowerCase().includes(q);
      const inTraits = c.traits && c.traits.toLowerCase().includes(q);
      return inName || inDesc || inTraits;
    });
    renderCharactersList(filtered);
  });

  // Avatar upload handling
  const avatarZone = document.getElementById('character-avatar-zone');
  const fileInput = document.getElementById('character-file-input');

  avatarZone.addEventListener('click', () => fileInput.click());

  avatarZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    avatarZone.style.borderColor = 'var(--border-focus)';
  });

  avatarZone.addEventListener('dragleave', () => {
    avatarZone.style.borderColor = '';
  });

  avatarZone.addEventListener('drop', (e) => {
    e.preventDefault();
    avatarZone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadCharacterAvatar(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadCharacterAvatar(e.target.files[0]);
    }
  });

  document.getElementById('form-character').addEventListener('submit', handleCharacterSubmit);
}

async function loadCharacters() {
  try {
    const res = await fetch('/api/characters');
    state.characters = await res.json();
    renderCharactersList(state.characters);
    populateCharacterDropdowns();
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load characters', err);
  }
}

function renderCharactersList(characters) {
  const grid = document.getElementById('characters-grid');
  grid.innerHTML = '';

  if (characters.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users empty-icon"></i><p>No characters yet. Click "New Character" to create a persona.</p></div>';
    return;
  }

  characters.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'card character-card';

    // Image avatar
    if (c.image_path) {
      const img = document.createElement('img');
      img.className = 'character-avatar';
      img.src = c.image_path;
      img.alt = c.name;
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'character-avatar-placeholder';
      placeholder.innerHTML = '<i class="fa-solid fa-user"></i>';
      card.appendChild(placeholder);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'card-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = c.name;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    editBtn.title = 'Edit character';
    editBtn.addEventListener('click', () => openCharacterModal(c));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete character';
    delBtn.addEventListener('click', () => deleteCharacter(c.id));
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // Traits
    if (c.traits) {
      const traitsEl = document.createElement('div');
      traitsEl.className = 'badge badge-primary';
      const tIcon = document.createElement('i');
      tIcon.className = 'fa-solid fa-wand-magic-sparkles';
      traitsEl.appendChild(tIcon);
      traitsEl.appendChild(document.createTextNode(` ${c.traits}`));
      card.appendChild(traitsEl);
    }

    // Description
    if (c.description) {
      const descEl = document.createElement('div');
      descEl.className = 'card-body';
      descEl.textContent = c.description;
      card.appendChild(descEl);
    }

    // Prompts count
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = `${c.prompts_count || 0} linked prompts`;
    card.appendChild(meta);

    // Tags
    if (c.tags && c.tags.length > 0) {
      const tagsList = document.createElement('div');
      tagsList.className = 'tags-list';
      c.tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${t}`;
        chip.addEventListener('click', () => {
          switchView('search');
          searchByTag(t);
        });
        tagsList.appendChild(chip);
      });
      card.appendChild(tagsList);
    }

    grid.appendChild(card);
  });
}

function openCharacterModal(character = null) {
  const titleEl = document.getElementById('character-modal-title');
  const idEl = document.getElementById('character-id');
  const nameInput = document.getElementById('character-name');
  const descInput = document.getElementById('character-description');
  const traitsInput = document.getElementById('character-traits');
  const notesInput = document.getElementById('character-notes');
  const tagsInput = document.getElementById('character-tags');
  const imagePathInput = document.getElementById('character-image-path');
  const avatarPreview = document.getElementById('avatar-preview-container');

  if (character) {
    titleEl.textContent = 'Edit Character';
    idEl.value = character.id;
    nameInput.value = character.name || '';
    descInput.value = character.description || '';
    traitsInput.value = character.traits || '';
    notesInput.value = character.notes || '';
    tagsInput.value = (character.tags || []).join(', ');
    imagePathInput.value = character.image_path || '';

    if (character.image_path) {
      avatarPreview.innerHTML = `<img src="${character.image_path}" alt="Avatar">`;
    } else {
      avatarPreview.innerHTML = '<span class="upload-prompt-text"><i class="fa-solid fa-cloud-arrow-up"></i> Click or drop image to upload</span>';
    }
  } else {
    titleEl.textContent = 'New Character';
    idEl.value = '';
    nameInput.value = '';
    descInput.value = '';
    traitsInput.value = '';
    notesInput.value = '';
    tagsInput.value = '';
    imagePathInput.value = '';
    avatarPreview.innerHTML = '<span class="upload-prompt-text"><i class="fa-solid fa-cloud-arrow-up"></i> Click or drop image to upload</span>';
  }

  openModal('modal-character');
}

async function uploadCharacterAvatar(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    document.getElementById('character-image-path').value = data.url;
    document.getElementById('avatar-preview-container').innerHTML = `<img src="${data.url}" alt="Uploaded Avatar">`;
    showToast('Image uploaded successfully');
  } catch (err) {
    console.error('Avatar upload failed', err);
    showToast('Failed to upload image', 'error');
  }
}

async function handleCharacterSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('character-id').value;

  const tags = document.getElementById('character-tags').value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const payload = {
    name: document.getElementById('character-name').value.trim(),
    description: document.getElementById('character-description').value.trim() || null,
    traits: document.getElementById('character-traits').value.trim() || null,
    notes: document.getElementById('character-notes').value.trim() || null,
    image_path: document.getElementById('character-image-path').value.trim() || null,
    tags,
  };

  try {
    if (id) {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Character updated');
    } else {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Character created');
    }

    closeModal('modal-character');
    await loadCharacters();
  } catch (err) {
    console.error('Failed to save character', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteCharacter(id) {
  if (!confirm('Are you sure you want to delete this character?')) return;
  try {
    const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Character deleted');
      await loadCharacters();
    }
  } catch (err) {
    console.error('Failed to delete character', err);
    showToast('Failed to delete character', 'error');
  }
}

// ===================================================
// REFERENCE LINKS CONTROLLER
// ===================================================

function initLinksView() {
  document.getElementById('btn-new-link').addEventListener('click', () => {
    openLinkModal();
  });

  const searchInput = document.getElementById('filter-links-search');
  searchInput.addEventListener('input', () => filterLinks());

  const platformSelect = document.getElementById('filter-links-platform');
  platformSelect.addEventListener('change', () => filterLinks());

  document.getElementById('form-link').addEventListener('submit', handleLinkSubmit);
}

async function loadLinks() {
  try {
    const res = await fetch('/api/links');
    state.links = await res.json();
    renderLinksList(state.links);
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load links', err);
  }
}

function filterLinks() {
  const query = document.getElementById('filter-links-search').value.toLowerCase().trim();
  const platform = document.getElementById('filter-links-platform').value.toLowerCase();

  const filtered = state.links.filter((l) => {
    if (query) {
      const inTitle = l.title && l.title.toLowerCase().includes(query);
      const inUrl = l.url.toLowerCase().includes(query);
      const inDesc = l.description && l.description.toLowerCase().includes(query);
      if (!inTitle && !inUrl && !inDesc) return false;
    }
    if (platform && l.platform !== platform) return false;
    return true;
  });

  renderLinksList(filtered);
}

function renderLinksList(links) {
  const grid = document.getElementById('links-grid');
  grid.innerHTML = '';

  if (links.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-link empty-icon"></i><p>No reference links yet. Click "Add Reference Link" to save one.</p></div>';
    return;
  }

  links.forEach((l) => {
    const card = document.createElement('div');
    card.className = 'card';

    // Thumbnail
    if (l.thumbnail_url) {
      const thumb = document.createElement('img');
      thumb.className = 'link-thumbnail';
      thumb.src = l.thumbnail_url;
      thumb.alt = l.title || 'Link preview';
      thumb.loading = 'lazy';
      card.appendChild(thumb);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'card-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = l.title || l.url;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Open link
    const openBtn = document.createElement('a');
    openBtn.className = 'action-icon-btn';
    openBtn.href = l.url;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
    openBtn.title = 'Open link';
    actions.appendChild(openBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    editBtn.title = 'Edit link';
    editBtn.addEventListener('click', () => openLinkModal(l));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete link';
    delBtn.addEventListener('click', () => deleteLink(l.id));
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // Platform badge & url
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (l.platform) {
      const pBadge = document.createElement('span');
      pBadge.className = 'badge badge-primary';
      pBadge.textContent = l.platform.toUpperCase();
      meta.appendChild(pBadge);
    }
    card.appendChild(meta);

    // Description
    if (l.description) {
      const descEl = document.createElement('div');
      descEl.className = 'card-body';
      descEl.textContent = l.description;
      card.appendChild(descEl);
    }

    // Tags
    if (l.tags && l.tags.length > 0) {
      const tagsList = document.createElement('div');
      tagsList.className = 'tags-list';
      l.tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${t}`;
        chip.addEventListener('click', () => {
          switchView('search');
          searchByTag(t);
        });
        tagsList.appendChild(chip);
      });
      card.appendChild(tagsList);
    }

    grid.appendChild(card);
  });
}

function openLinkModal(link = null) {
  const titleEl = document.getElementById('link-modal-title');
  const idEl = document.getElementById('link-id');
  const urlInput = document.getElementById('link-url');
  const titleInput = document.getElementById('link-title');
  const platformInput = document.getElementById('link-platform');
  const descInput = document.getElementById('link-description');
  const thumbInput = document.getElementById('link-thumbnail');
  const tagsInput = document.getElementById('link-tags');

  if (link) {
    titleEl.textContent = 'Edit Reference Link';
    idEl.value = link.id;
    urlInput.value = link.url || '';
    titleInput.value = link.title || '';
    platformInput.value = link.platform || '';
    descInput.value = link.description || '';
    thumbInput.value = link.thumbnail_url || '';
    tagsInput.value = (link.tags || []).join(', ');
  } else {
    titleEl.textContent = 'New Reference Link';
    idEl.value = '';
    urlInput.value = '';
    titleInput.value = '';
    platformInput.value = '';
    descInput.value = '';
    thumbInput.value = '';
    tagsInput.value = '';
  }

  openModal('modal-link');
}

async function handleLinkSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('link-id').value;

  const tags = document.getElementById('link-tags').value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const payload = {
    url: document.getElementById('link-url').value.trim(),
    title: document.getElementById('link-title').value.trim() || null,
    platform: document.getElementById('link-platform').value.trim() || null,
    description: document.getElementById('link-description').value.trim() || null,
    thumbnail_url: document.getElementById('link-thumbnail').value.trim() || null,
    tags,
  };

  try {
    if (id) {
      const res = await fetch(`/api/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Link updated');
    } else {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Link created (metadata fetched if YouTube)');
    }

    closeModal('modal-link');
    await loadLinks();
  } catch (err) {
    console.error('Failed to save link', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteLink(id) {
  if (!confirm('Are you sure you want to delete this reference link?')) return;
  try {
    const res = await fetch(`/api/links/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Link deleted');
      await loadLinks();
    }
  } catch (err) {
    console.error('Failed to delete link', err);
    showToast('Failed to delete link', 'error');
  }
}

// ===================================================
// BOARDS & WORKSPACE CANVAS CONTROLLER
// ===================================================

function initBoardsView() {
  document.getElementById('btn-new-board').addEventListener('click', () => {
    openBoardModal();
  });

  document.getElementById('btn-board-back').addEventListener('click', () => {
    exitCanvasView();
  });

  document.getElementById('btn-delete-active-board').addEventListener('click', () => {
    if (state.activeBoardId) deleteBoard(state.activeBoardId);
  });

  document.getElementById('btn-export-board-json').addEventListener('click', () => {
    if (state.activeBoardId) {
      window.open(`/api/boards/${state.activeBoardId}/export`, '_blank');
    }
  });

  // Drawer toggle and drawer search
  const drawer = document.getElementById('canvas-drawer');
  const toggleDrawerBtn = document.getElementById('btn-toggle-drawer');
  const closeDrawerBtn = document.getElementById('btn-close-drawer');

  toggleDrawerBtn.addEventListener('click', () => drawer.classList.toggle('open'));
  closeDrawerBtn.addEventListener('click', () => drawer.classList.remove('open'));

  document.querySelectorAll('.drawer-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.drawer-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderDrawerItems();
    });
  });

  document.getElementById('drawer-search-input').addEventListener('input', () => {
    renderDrawerItems();
  });

  document.getElementById('form-board').addEventListener('submit', handleBoardSubmit);
}

async function loadBoards() {
  try {
    const res = await fetch('/api/boards');
    state.boards = await res.json();
    renderBoardsList(state.boards);
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load boards', err);
  }
}

function renderBoardsList(boards) {
  const grid = document.getElementById('boards-grid');
  grid.innerHTML = '';

  if (boards.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-chalkboard empty-icon"></i><p>No boards yet. Click "Create Board" to start a visual workspace.</p></div>';
    return;
  }

  boards.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';

    const header = document.createElement('div');
    header.className = 'card-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = b.name;
    header.appendChild(titleEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete board';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBoard(b.id);
    });
    header.appendChild(delBtn);

    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const styleBadge = document.createElement('span');
    styleBadge.className = 'badge badge-primary';
    const styleIcon = document.createElement('i');
    styleIcon.className = 'fa-solid fa-shapes';
    styleBadge.appendChild(styleIcon);
    styleBadge.appendChild(document.createTextNode(` ${b.canvas_style}`));
    meta.appendChild(styleBadge);

    const themeBadge = document.createElement('span');
    themeBadge.className = 'badge';
    const themeIcon = document.createElement('i');
    themeIcon.className = 'fa-solid fa-palette';
    themeBadge.appendChild(themeIcon);
    themeBadge.appendChild(document.createTextNode(` ${b.theme}`));
    meta.appendChild(themeBadge);

    const countBadge = document.createElement('span');
    countBadge.className = 'badge';
    const countIcon = document.createElement('i');
    countIcon.className = 'fa-solid fa-note-sticky';
    countBadge.appendChild(countIcon);
    countBadge.appendChild(document.createTextNode(` ${b.items_count || 0} pinned cards`));
    meta.appendChild(countBadge);

    card.appendChild(meta);

    // Open board on click
    card.addEventListener('click', () => openCanvasBoard(b.id));

    grid.appendChild(card);
  });
}

async function openCanvasBoard(boardId) {
  try {
    const [boardRes, itemsRes] = await Promise.all([
      fetch(`/api/boards/${boardId}`),
      fetch(`/api/boards/${boardId}/items`),
    ]);

    if (!boardRes.ok || !itemsRes.ok) throw new Error('Failed to fetch board data');

    const board = await boardRes.json();
    const items = await itemsRes.json();

    state.activeBoardId = boardId;

    document.getElementById('boards-list-container').style.display = 'none';
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.style.display = 'flex';

    window.atelierCanvas.loadBoard(board, items);
    renderDrawerItems();
  } catch (err) {
    console.error('Failed to open board', err);
    showToast('Failed to open board', 'error');
  }
}

function exitCanvasView() {
  state.activeBoardId = null;
  document.getElementById('canvas-container').style.display = 'none';
  document.getElementById('boards-list-container').style.display = 'block';
  loadBoards();
}

function openBoardModal() {
  document.getElementById('board-name').value = '';
  document.getElementById('board-style').value = 'dot-grid';
  document.getElementById('board-theme').value = 'default';
  openModal('modal-board');
}

async function handleBoardSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('board-name').value.trim(),
    canvas_style: document.getElementById('board-style').value,
    theme: document.getElementById('board-theme').value,
  };

  try {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const newBoard = await res.json();

    closeModal('modal-board');
    await loadBoards();
    openCanvasBoard(newBoard.id);
  } catch (err) {
    console.error('Failed to create board', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteBoard(id) {
  if (!confirm('Are you sure you want to delete this board? All cards and drawings will be deleted.')) return;
  try {
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Board deleted');
      if (state.activeBoardId === id) {
        exitCanvasView();
      } else {
        await loadBoards();
      }
    }
  } catch (err) {
    console.error('Failed to delete board', err);
    showToast('Failed to delete board', 'error');
  }
}

// Drawer items rendering and pinning to canvas
function renderDrawerItems() {
  const listContainer = document.getElementById('drawer-items-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const activeTab = document.querySelector('.drawer-tab.active')?.dataset.drawerTab || 'prompts';
  const query = document.getElementById('drawer-search-input')?.value.toLowerCase().trim() || '';

  let items = [];
  if (activeTab === 'prompts') {
    items = state.prompts.map((p) => ({
      entity_type: 'prompt',
      entity_id: p.id,
      title: p.title,
      snippet: p.body,
    }));
  } else if (activeTab === 'characters') {
    items = state.characters.map((c) => ({
      entity_type: 'character',
      entity_id: c.id,
      title: c.name,
      snippet: c.description || c.traits || 'Character',
    }));
  } else if (activeTab === 'links') {
    items = state.links.map((l) => ({
      entity_type: 'link',
      entity_id: l.id,
      title: l.title || l.url,
      snippet: l.url,
    }));
  }

  if (query) {
    items = items.filter((i) => i.title.toLowerCase().includes(query) || i.snippet.toLowerCase().includes(query));
  }

  if (items.length === 0) {
    listContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 1rem 0;">No items found.</div>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'drawer-item-card';

    const title = document.createElement('div');
    title.className = 'drawer-item-title';
    const dIcon = document.createElement('i');
    dIcon.className = `fa-solid ${item.entity_type === 'prompt' ? 'fa-feather-pointed' : item.entity_type === 'character' ? 'fa-user' : 'fa-link'}`;
    title.appendChild(dIcon);
    title.appendChild(document.createTextNode(` ${item.title}`));
    card.appendChild(title);

    const snippet = document.createElement('div');
    snippet.className = 'drawer-item-snippet';
    snippet.textContent = item.snippet;
    card.appendChild(snippet);

    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      }));
    });

    card.addEventListener('click', () => {
      pinItemToBoard(item.entity_type, item.entity_id);
    });

    listContainer.appendChild(card);
  });
}

async function pinItemToBoard(entityType, entityId) {
  if (!state.activeBoardId) return;

  // Place card near canvas center
  const centerWorld = window.atelierCanvas.screenToWorld(
    window.innerWidth / 2,
    window.innerHeight / 2
  );

  const payload = {
    entity_type: entityType,
    entity_id: entityId,
    pos_x: centerWorld.x - 120,
    pos_y: centerWorld.y - 80,
    width: 240,
    height: 160,
  };

  try {
    const res = await fetch(`/api/boards/${state.activeBoardId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const createdItem = await res.json();

    window.atelierCanvas.items.push(createdItem);
    window.atelierCanvas.renderCards();
    window.atelierCanvas.selectCard(createdItem.id);
    showToast(`Pinned ${entityType} to canvas`);
  } catch (err) {
    console.error('Failed to pin item', err);
    showToast('Failed to pin item to board', 'error');
  }
}

// ===================================================
// UNIFIED SEARCH & TAGS CONTROLLER
// ===================================================

function initSearchView() {
  const searchInput = document.getElementById('unified-search-input');
  searchInput.addEventListener('input', debounce(() => performSearch(), 250));

  document.querySelectorAll('.type-filter-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-filter-pills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeSearchType = btn.dataset.searchType;
      performSearch();
    });
  });

  document.getElementById('search-fav-only').addEventListener('change', () => {
    performSearch();
  });
}

async function loadTags() {
  try {
    const res = await fetch('/api/tags');
    state.tags = await res.json();
    renderTagCloud(state.tags);
  } catch (err) {
    console.error('Failed to load tags', err);
  }
}

function renderTagCloud(tags) {
  const cloud = document.getElementById('tag-cloud-container');
  cloud.innerHTML = '';

  if (tags.length === 0) {
    cloud.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted);">No tags yet. Add tags to prompts, characters, or links!</div>';
    return;
  }

  tags.forEach((t) => {
    const chip = document.createElement('button');
    chip.className = `cloud-tag-chip ${state.selectedTagFilter === t.name ? 'active' : ''}`;
    chip.innerHTML = `<span>#${t.name}</span><span class="cloud-tag-count">${t.count}</span>`;
    chip.addEventListener('click', () => {
      if (state.selectedTagFilter === t.name) {
        state.selectedTagFilter = null;
        chip.classList.remove('active');
      } else {
        state.selectedTagFilter = t.name;
        document.querySelectorAll('.cloud-tag-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      }
      performSearch();
    });
    cloud.appendChild(chip);
  });
}

function searchByTag(tagName) {
  state.selectedTagFilter = tagName;
  document.getElementById('unified-search-input').value = '';
  document.querySelectorAll('.cloud-tag-chip').forEach((c) => {
    c.classList.toggle('active', c.querySelector('span').textContent === `#${tagName}`);
  });
  performSearch();
}

async function performSearch() {
  const query = document.getElementById('unified-search-input').value.trim();
  const favOnly = document.getElementById('search-fav-only').checked;
  const tag = state.selectedTagFilter || '';

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (tag) params.set('tag', tag);
  if (state.activeSearchType !== 'all') params.set('type', state.activeSearchType);
  if (favOnly) params.set('favorite', 'true');

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    const results = await res.json();
    renderSearchResults(results);
  } catch (err) {
    console.error('Search failed', err);
  }
}

function renderSearchResults(results) {
  const summary = document.getElementById('search-results-summary');
  const grid = document.getElementById('search-results-grid');

  summary.textContent = `Found ${results.length} matching item${results.length === 1 ? '' : 's'}`;
  grid.innerHTML = '';

  if (results.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass empty-icon"></i><p>No items matched your query.</p></div>';
    return;
  }

  results.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.title = `Click to view ${r.entity_type}`;

    if (r.image_path) {
      const img = document.createElement('img');
      img.className = 'link-thumbnail';
      img.src = r.image_path;
      img.loading = 'lazy';
      card.appendChild(img);
    }

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = r.title;
    header.appendChild(title);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge badge-primary';
    const sIcon = document.createElement('i');
    sIcon.className = `fa-solid ${r.entity_type === 'prompt' ? 'fa-feather-pointed' : r.entity_type === 'character' ? 'fa-user' : 'fa-link'}`;
    typeBadge.appendChild(sIcon);
    typeBadge.appendChild(document.createTextNode(` ${r.entity_type.toUpperCase()}`));
    header.appendChild(typeBadge);

    card.appendChild(header);

    card.addEventListener('click', async () => {
      if (r.entity_type === 'prompt') {
        switchView('prompts');
        const res = await fetch(`/api/prompts/${r.id}`);
        if (res.ok) openPromptModal(await res.json());
      } else if (r.entity_type === 'character') {
        switchView('characters');
        const res = await fetch(`/api/characters/${r.id}`);
        if (res.ok) openCharacterModal(await res.json());
      } else if (r.entity_type === 'link') {
        switchView('links');
        const res = await fetch(`/api/links/${r.id}`);
        if (res.ok) openLinkModal(await res.json());
      }
    });

    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = r.snippet;
    card.appendChild(body);

    if (r.tags && r.tags.length > 0) {
      const tagsList = document.createElement('div');
      tagsList.className = 'tags-list';
      r.tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${t}`;
        tagsList.appendChild(chip);
      });
      card.appendChild(tagsList);
    }

    grid.appendChild(card);
  });
}

// ===================================================
// BACKUP & PORTABILITY CONTROLLER
// ===================================================

function initBackupView() {
  // JSON Restore
  const jsonInput = document.getElementById('json-file-input');
  jsonInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const text = await file.text();
        const json = JSON.parse(text);

        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        showBackupOutput(data);
        showToast('JSON database restored successfully!');
        await refreshAllData();
      } catch (err) {
        console.error('JSON restore error', err);
        showToast(`Restore failed: ${err.message}`, 'error');
      }
    }
  });

  // ZIP Archive Restore
  const zipInput = document.getElementById('zip-file-input');
  zipInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('archive', file);

      try {
        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        showBackupOutput(data);
        showToast('Full project archive restored successfully!');
        await refreshAllData();
      } catch (err) {
        console.error('Archive restore error', err);
        showToast(`Restore failed: ${err.message}`, 'error');
      }
    }
  });
}

function showBackupOutput(data) {
  const card = document.getElementById('backup-status-card');
  const output = document.getElementById('backup-status-output');
  if (card && output) {
    card.style.display = 'block';
    output.textContent = JSON.stringify(data, null, 2);
  }
}

// ===================================================
// UTILITY FUNCTIONS
// ===================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = document.createElement('i');
  icon.className = `fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`;
  toast.appendChild(icon);
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}
