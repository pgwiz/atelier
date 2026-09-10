// ===================================================
// ATELIER CORE CLIENT CONTROLLER & SPA ROUTER
// ===================================================

const state = {
  activeView: 'projects',
  activeProjectId: parseInt(localStorage.getItem('atelier_active_project_id') || '1', 10),
  projects: [],
  activeProject: null,
  parts: [],
  attachments: [],
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
  initProjectSwitcher();
  initNavigation();
  initModals();
  initProjectsView();
  initPartsView();
  initMultiWorkspaceModals();
  initMediaViewerModal();
  initPromptsView();
  initCharactersView();
  initLinksView();
  initBoardsView();
  initSearchView();
  initBackupView();

  // Initial data load
  refreshAllData().then(() => {
    initHashRouting();
  });
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

// ===================================================
// PROJECT SWITCHER & NAVIGATION
// ===================================================

function initProjectSwitcher() {
  const switcherBtn = document.getElementById('project-switcher-btn');
  const dropdown = document.getElementById('project-switcher-dropdown');
  const closeBtn = document.getElementById('btn-close-project-dropdown');

  if (switcherBtn && dropdown) {
    switcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  }

  if (closeBtn && dropdown) {
    closeBtn.addEventListener('click', () => dropdown.classList.remove('open'));
  }

  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== switcherBtn) {
      dropdown.classList.remove('open');
    }
  });

  // Quick stat chips click -> navigate to that view
  document.querySelectorAll('.stat-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetView = chip.dataset.goto;
      if (targetView) {
        if (dropdown) dropdown.classList.remove('open');
        switchView(targetView);
      }
    });
  });

  const quickNewBtn = document.getElementById('btn-quick-new-project');
  if (quickNewBtn) {
    quickNewBtn.addEventListener('click', () => {
      if (dropdown) dropdown.classList.remove('open');
      openProjectModal();
    });
  }

  const gotoProjectsBtn = document.getElementById('btn-goto-projects-view');
  if (gotoProjectsBtn) {
    gotoProjectsBtn.addEventListener('click', () => {
      if (dropdown) dropdown.classList.remove('open');
      switchView('projects');
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
  if (viewName === 'projects') loadProjects();
  if (viewName === 'parts') {
    loadParts();
    loadAttachments();
  }
  if (viewName === 'prompts') loadPrompts();
  if (viewName === 'characters') loadCharacters();
  if (viewName === 'links') loadLinks();
  if (viewName === 'boards') {
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
  await loadProjects();
  await Promise.all([
    loadParts(),
    loadAttachments(),
    loadPrompts(),
    loadCharacters(),
    loadLinks(),
    loadBoards(),
    loadTags(),
  ]);
  updateSidebarBadges();
}

async function refreshActiveProjectProgress() {
  if (!state.activeProjectId) return;
  try {
    const res = await fetch(`/api/projects/${state.activeProjectId}`);
    if (res.ok) {
      const updated = await res.json();
      state.activeProject = updated;
      const idx = state.projects.findIndex((p) => p.id === updated.id);
      if (idx !== -1) state.projects[idx] = updated;
      updateProjectSwitcherUI();
      if (state.activeView === 'projects') renderProjectsGrid(state.projects);
    }
  } catch (err) {
    console.error('Failed to refresh project progress', err);
  }
}

function handleHashRoute() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#/projects/')) return;
  const raw = hash.replace('#/projects/', '');
  const parts = raw.split('/');
  const pid = parseInt(parts[0], 10);
  if (isNaN(pid)) return;

  const performNav = async () => {
    if (state.activeProjectId !== pid) {
      await switchProject(pid);
    }
    const section = parts[1];
    if (section === 'attachments' && parts[2]) {
      const attId = parseInt(parts[2], 10);
      switchView('parts');
      const att = state.attachments.find((a) => a.id === attId);
      if (att) openMediaViewer(att);
    } else if (section && ['projects', 'parts', 'prompts', 'characters', 'links', 'boards', 'search'].includes(section)) {
      switchView(section);
    }
  };

  performNav();
}

function initHashRouting() {
  window.addEventListener('hashchange', handleHashRoute);
  handleHashRoute();
}

function updateSidebarBadges() {
  const pBadge = document.getElementById('badge-projects');
  if (pBadge) pBadge.textContent = state.projects.length;
  const partsBadge = document.getElementById('badge-parts');
  if (partsBadge) partsBadge.textContent = state.parts.length;
  const prBadge = document.getElementById('badge-prompts');
  if (prBadge) prBadge.textContent = state.prompts.length;
  const chBadge = document.getElementById('badge-characters');
  if (chBadge) chBadge.textContent = state.characters.length;
  const liBadge = document.getElementById('badge-links');
  if (liBadge) liBadge.textContent = state.links.length;
  const boBadge = document.getElementById('badge-boards');
  if (boBadge) boBadge.textContent = state.boards.length;

  // Update quick stat chips
  const chipPr = document.getElementById('chip-prompts');
  if (chipPr) chipPr.textContent = state.prompts.length;
  const chipCh = document.getElementById('chip-characters');
  if (chipCh) chipCh.textContent = state.characters.length;
  const chipLi = document.getElementById('chip-links');
  if (chipLi) chipLi.textContent = state.links.length;
  const chipBo = document.getElementById('chip-boards');
  if (chipBo) chipBo.textContent = state.boards.length;
  const chipPa = document.getElementById('chip-parts');
  if (chipPa) chipPa.textContent = state.parts.length;
}

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((modal) => {
        modal.classList.remove('open');
      });
      const dropdown = document.getElementById('project-switcher-dropdown');
      if (dropdown) dropdown.classList.remove('open');
    }
  });
}

// ===================================================
// PROJECTS OPERATING SYSTEM CONTROLLER
// ===================================================

function initProjectsView() {
  const newBtn = document.getElementById('btn-new-project');
  if (newBtn) {
    newBtn.addEventListener('click', () => openProjectModal());
  }

  const importBtn = document.getElementById('btn-import-project-package');
  const importInput = document.getElementById('project-package-input');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleImportPackage(e.target.files[0]);
        importInput.value = '';
      }
    });
  }

  const searchInput = document.getElementById('filter-projects-search');
  if (searchInput) searchInput.addEventListener('input', () => filterProjects());

  const statusSelect = document.getElementById('filter-projects-status');
  if (statusSelect) statusSelect.addEventListener('change', () => filterProjects());

  const sortSelect = document.getElementById('filter-projects-sort');
  if (sortSelect) sortSelect.addEventListener('change', () => filterProjects());

  const formProject = document.getElementById('form-project');
  if (formProject) formProject.addEventListener('submit', handleProjectSubmit);
}

function getStatusBadgeClass(status) {
  const s = (status || 'Draft').toLowerCase().replace(/\s+/g, '-');
  return `badge-status-${s}`;
}

function getStatusDotColor(status) {
  switch ((status || 'Draft').toLowerCase()) {
    case 'in progress': return '#38bdf8';
    case 'review':
    case 'ready': return '#f59e0b';
    case 'completed':
    case 'done': return '#10b981';
    case 'archived': return '#71717a';
    default: return '#64748b';
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    state.projects = await res.json();

    // Resolve active project
    let current = state.projects.find((p) => p.id === state.activeProjectId);
    if (!current && state.projects.length > 0) {
      current = state.projects[0];
      state.activeProjectId = current.id;
      localStorage.setItem('atelier_active_project_id', current.id);
    }
    state.activeProject = current;

    // Update switcher UI
    updateProjectSwitcherUI();
    filterProjects();
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load projects', err);
  }
}

function updateProjectSwitcherUI() {
  const nameEl = document.getElementById('project-switcher-name');
  const statusEl = document.getElementById('project-switcher-status');
  const dotEl = document.getElementById('project-switcher-dot');

  if (state.activeProject) {
    if (nameEl) nameEl.textContent = state.activeProject.name;
    if (statusEl) {
      statusEl.textContent = state.activeProject.status;
      statusEl.className = `project-switcher-status badge badge-sm ${getStatusBadgeClass(state.activeProject.status)}`;
    }
    if (dotEl) {
      dotEl.style.backgroundColor = getStatusDotColor(state.activeProject.status);
    }
  }

  // Populate dropdown list
  const listEl = document.getElementById('dropdown-projects-list');
  if (listEl) {
    listEl.innerHTML = '';
    state.projects.forEach((p) => {
      const item = document.createElement('div');
      item.className = `dropdown-project-item ${p.id === state.activeProjectId ? 'active' : ''}`;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      item.appendChild(nameSpan);

      const statusSpan = document.createElement('span');
      statusSpan.className = `badge badge-sm ${getStatusBadgeClass(p.status)}`;
      statusSpan.textContent = p.status;
      item.appendChild(statusSpan);

      item.addEventListener('click', () => {
        const dropdown = document.getElementById('project-switcher-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        switchProject(p.id);
      });

      listEl.appendChild(item);
    });
  }
}

async function switchProject(projectId) {
  if (state.activeProjectId === projectId) return;
  state.activeProjectId = projectId;
  localStorage.setItem('atelier_active_project_id', projectId);

  await refreshAllData();
  const proj = state.projects.find((p) => p.id === projectId);
  if (proj) {
    showToast(`Switched workspace to "${proj.name}"`);
  }
}

function filterProjects() {
  const query = document.getElementById('filter-projects-search')?.value.toLowerCase().trim() || '';
  const statusFilter = document.getElementById('filter-projects-status')?.value || '';
  const sortBy = document.getElementById('filter-projects-sort')?.value || 'updated';

  let filtered = state.projects.filter((p) => {
    if (query) {
      const inName = p.name.toLowerCase().includes(query);
      const inDesc = p.description && p.description.toLowerCase().includes(query);
      if (!inName && !inDesc) return false;
    }
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'progress') return (b.progress_percent || 0) - (a.progress_percent || 0);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  renderProjectsGrid(filtered);
}

function renderProjectsGrid(projects) {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (projects.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-tree empty-icon"></i><p>No projects match your filter. Click "New Project" to start one.</p></div>';
    return;
  }

  projects.forEach((p) => {
    const card = document.createElement('div');
    card.className = `project-card ${p.id === state.activeProjectId ? 'active-workspace' : ''}`;

    // Header
    const top = document.createElement('div');
    top.className = 'project-card-top';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'project-card-name';
    title.textContent = p.name;
    titleGroup.appendChild(title);

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge badge-sm ${getStatusBadgeClass(p.status)}`;
    statusBadge.textContent = p.status;
    titleGroup.appendChild(statusBadge);

    top.appendChild(titleGroup);

    if (p.id === state.activeProjectId) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'badge badge-primary';
      activeBadge.innerHTML = '<i class="fa-solid fa-check"></i> Active';
      top.appendChild(activeBadge);
    }

    card.appendChild(top);

    // Description
    const desc = document.createElement('p');
    desc.className = 'project-card-desc';
    desc.textContent = p.description || 'No description provided.';
    card.appendChild(desc);

    // Progress Bar
    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';
    progressTrack.title = `Completion: ${p.progress_percent || 0}% (${p.completed_parts_count || 0} of ${p.parts_count || 0} parts done)`;
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${p.progress_percent || 0}%`;
    progressTrack.appendChild(progressFill);
    card.appendChild(progressTrack);

    // Stats
    const statsRow = document.createElement('div');
    statsRow.className = 'project-card-stats';

    const statParts = document.createElement('span');
    statParts.className = 'project-stat-pill';
    statParts.innerHTML = `<i class="fa-solid fa-film"></i> ${p.completed_parts_count || 0}/${p.parts_count || 0} Parts`;
    statsRow.appendChild(statParts);

    const statPrompts = document.createElement('span');
    statPrompts.className = 'project-stat-pill';
    statPrompts.innerHTML = `<i class="fa-solid fa-feather-pointed"></i> ${p.prompts_count || 0} Prompts`;
    statsRow.appendChild(statPrompts);

    const statChars = document.createElement('span');
    statChars.className = 'project-stat-pill';
    statChars.innerHTML = `<i class="fa-solid fa-users"></i> ${p.characters_count || 0} Characters`;
    statsRow.appendChild(statChars);

    const statLinks = document.createElement('span');
    statLinks.className = 'project-stat-pill';
    statLinks.innerHTML = `<i class="fa-solid fa-link"></i> ${p.links_count || 0} References`;
    statsRow.appendChild(statLinks);

    const statBoards = document.createElement('span');
    statBoards.className = 'project-stat-pill';
    statBoards.innerHTML = `<i class="fa-solid fa-chalkboard"></i> ${p.boards_count || 0} Boards`;
    statsRow.appendChild(statBoards);

    card.appendChild(statsRow);

    // Footer & Actions
    const footer = document.createElement('div');
    footer.className = 'project-card-footer';

    const dateSpan = document.createElement('div');
    dateSpan.className = 'project-card-dates';
    const cDate = p.created_at ? (p.created_at.split('T')[0] || p.created_at) : 'N/A';
    const uDate = p.updated_at ? (p.updated_at.split('T')[0] || p.updated_at) : 'N/A';
    dateSpan.innerHTML = `<span title="Created at">Created: ${cDate}</span> &bull; <span title="Last updated at">Updated: ${uDate}</span>`;
    footer.appendChild(dateSpan);

    const actions = document.createElement('div');
    actions.className = 'project-card-actions';

    if (p.id !== state.activeProjectId) {
      const selectBtn = document.createElement('button');
      selectBtn.className = 'btn btn-xs btn-primary';
      selectBtn.innerHTML = '<i class="fa-solid fa-check"></i> Select';
      selectBtn.title = 'Switch active workspace to this project';
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchProject(p.id);
      });
      actions.appendChild(selectBtn);
    }

    const folderBtn = document.createElement('button');
    folderBtn.className = 'btn btn-xs btn-outline';
    folderBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Open Folder';
    folderBtn.title = 'Open Project Folder';
    folderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProjectFolder(p.id);
    });
    actions.appendChild(folderBtn);

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'btn btn-xs btn-outline';
    reloadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Reload JSON';
    reloadBtn.title = 'Reload JSON (reconcile manifest from disk)';
    reloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      reloadProjectJson(p.id);
    });
    actions.appendChild(reloadBtn);

    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn btn-xs btn-outline';
    dupBtn.innerHTML = '<i class="fa-solid fa-clone"></i> Copy';
    dupBtn.title = 'Deep duplicate workspace';
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyProject(p.id);
    });
    actions.appendChild(dupBtn);

    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'btn btn-xs btn-outline';
    mergeBtn.innerHTML = '<i class="fa-solid fa-code-merge"></i> Merge';
    mergeBtn.title = 'Merge into another project';
    mergeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMergeModal(p.id);
    });
    actions.appendChild(mergeBtn);

    const transferBtn = document.createElement('button');
    transferBtn.className = 'btn btn-xs btn-outline';
    transferBtn.innerHTML = '<i class="fa-solid fa-arrows-split-up-and-left"></i> Transfer';
    transferBtn.title = 'Visual Transfer Workbench';
    transferBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTransferWorkbench(p.id);
    });
    actions.appendChild(transferBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-xs btn-outline';
    exportBtn.innerHTML = '<i class="fa-solid fa-download"></i> Zip';
    exportBtn.title = 'Export standalone package archive (.zip)';
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`/api/projects/${p.id}/export`, '_blank');
    });
    actions.appendChild(exportBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.title = 'Edit project details';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProjectModal(p);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn text-danger';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete project';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProject(p.id);
    });
    actions.appendChild(delBtn);

    footer.appendChild(actions);
    card.appendChild(footer);

    grid.appendChild(card);
  });
}

function openProjectModal(project = null) {
  const titleEl = document.getElementById('project-modal-title');
  const idEl = document.getElementById('project-id');
  const nameInput = document.getElementById('project-name');
  const descInput = document.getElementById('project-description');
  const statusSelect = document.getElementById('project-status');

  if (project) {
    titleEl.textContent = 'Edit Workspace Project';
    idEl.value = project.id;
    nameInput.value = project.name || '';
    descInput.value = project.description || '';
    statusSelect.value = project.status || 'Draft';
  } else {
    titleEl.textContent = 'New Workspace Project';
    idEl.value = '';
    nameInput.value = '';
    descInput.value = '';
    statusSelect.value = 'Draft';
  }

  openModal('modal-project');
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('project-id').value;
  const payload = {
    name: document.getElementById('project-name').value.trim(),
    description: document.getElementById('project-description').value.trim() || null,
    status: document.getElementById('project-status').value,
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) throw new Error(await res.text());
    const project = await res.json();

    closeModal('modal-project');
    showToast(id ? 'Project updated successfully!' : 'Project created successfully!');
    if (!id) {
      state.activeProjectId = project.id;
      localStorage.setItem('atelier_active_project_id', project.id);
    }
    await refreshAllData();
  } catch (err) {
    console.error('Project save error', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function copyProject(id) {
  const newName = prompt('Enter a name for the duplicated project:');
  if (!newName || !newName.trim()) return;

  try {
    const res = await fetch(`/api/projects/${id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });

    if (!res.ok) throw new Error(await res.text());
    const cloned = await res.json();
    showToast(`Project duplicated as "${cloned.name}"!`);
    await loadProjects();
  } catch (err) {
    console.error('Failed to copy project', err);
    showToast(`Copy failed: ${err.message}`, 'error');
  }
}

async function reloadProjectJson(id) {
  try {
    const res = await fetch(`/api/projects/${id}/reload-json`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Project manifest synchronized from disk!');
    await refreshAllData();
  } catch (err) {
    console.error('Failed to reload project.json', err);
    showToast(`Reload failed: ${err.message}`, 'error');
  }
}

async function openProjectFolder(id) {
  try {
    const res = await fetch(`/api/projects/${id}/open-folder`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Revealed project folder in Explorer');
  } catch (err) {
    console.error('Failed to open project folder', err);
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function deleteProject(id) {
  if (state.projects.length <= 1) {
    showToast('Cannot delete the only project workspace', 'error');
    return;
  }
  if (!confirm('Are you sure you want to delete this project workspace and all its contents?')) return;

  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());

    showToast('Project workspace deleted');
    if (state.activeProjectId === id) {
      const remaining = state.projects.filter((p) => p.id !== id);
      state.activeProjectId = remaining[0]?.id || 1;
      localStorage.setItem('atelier_active_project_id', state.activeProjectId);
    }
    await refreshAllData();
  } catch (err) {
    console.error('Failed to delete project', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

async function handleImportPackage(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Importing package...');
    const res = await fetch('/api/projects/import', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const imported = await res.json();

    showToast(`Imported project "${imported.name}" successfully!`);
    state.activeProjectId = imported.id;
    localStorage.setItem('atelier_active_project_id', imported.id);
    await refreshAllData();
    switchView('projects');
  } catch (err) {
    console.error('Import package error', err);
    showToast(`Import failed: ${err.message}`, 'error');
  }
}

// ===================================================
// PRODUCTION PARTS & SCENES CONTROLLER
// ===================================================

function initPartsView() {
  const newPartBtn = document.getElementById('btn-new-part');
  if (newPartBtn) {
    newPartBtn.addEventListener('click', () => openPartModal());
  }

  const uploadMediaBtn = document.getElementById('btn-open-attachment-modal');
  if (uploadMediaBtn) {
    uploadMediaBtn.addEventListener('click', () => openAttachmentModal());
  }

  const quickUploadBtn = document.getElementById('btn-quick-upload-media');
  if (quickUploadBtn) {
    quickUploadBtn.addEventListener('click', () => openAttachmentModal());
  }

  const openFolderBtn = document.getElementById('btn-open-active-project-folder');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', () => openProjectFolder(state.activeProjectId));
  }

  const searchInput = document.getElementById('filter-parts-search');
  if (searchInput) searchInput.addEventListener('input', () => filterParts());

  const typeSelect = document.getElementById('filter-parts-type');
  if (typeSelect) typeSelect.addEventListener('change', () => filterParts());

  const statusSelect = document.getElementById('filter-parts-status');
  if (statusSelect) statusSelect.addEventListener('change', () => filterParts());

  const formPart = document.getElementById('form-part');
  if (formPart) formPart.addEventListener('submit', handlePartSubmit);

  const formLinkEntity = document.getElementById('form-link-entity');
  if (formLinkEntity) formLinkEntity.addEventListener('submit', handleLinkEntitySubmit);

  const linkTypeSelect = document.getElementById('link-entity-type');
  if (linkTypeSelect) {
    linkTypeSelect.addEventListener('change', () => populateLinkTargetDropdown());
  }

  const formAttachment = document.getElementById('form-attachment');
  if (formAttachment) formAttachment.addEventListener('submit', handleAttachmentSubmit);
}

async function loadParts() {
  try {
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/projects/${pid}/parts`);
    state.parts = await res.json();

    // Update progress banner
    const total = state.parts.length;
    const done = state.parts.filter((p) => p.status === 'Done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const bannerTitle = document.getElementById('parts-banner-title');
    if (bannerTitle) bannerTitle.textContent = `${state.activeProject?.name || 'Active Project'} Progress`;
    const bannerRatio = document.getElementById('parts-banner-ratio');
    if (bannerRatio) bannerRatio.textContent = `${done} of ${total} parts completed (${pct}%)`;
    const bannerFill = document.getElementById('parts-banner-fill');
    if (bannerFill) bannerFill.style.width = `${pct}%`;

    filterParts();
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load parts', err);
  }
}

function filterParts() {
  const query = document.getElementById('filter-parts-search')?.value.toLowerCase().trim() || '';
  const typeFilter = document.getElementById('filter-parts-type')?.value || '';
  const statusFilter = document.getElementById('filter-parts-status')?.value || '';

  const filtered = state.parts.filter((p) => {
    if (query) {
      const inTitle = p.title.toLowerCase().includes(query);
      const inNotes = p.notes && p.notes.toLowerCase().includes(query);
      const inDesc = p.description && p.description.toLowerCase().includes(query);
      if (!inTitle && !inNotes && !inDesc) return false;
    }
    if (typeFilter && p.part_type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  renderPartsList(filtered);
}

function renderPartsList(parts) {
  const listEl = document.getElementById('parts-timeline-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (parts.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-film empty-icon"></i><p>No production parts found. Click "New Part" to create one.</p></div>';
    return;
  }

  parts.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'part-card';

    // Top Header
    const top = document.createElement('div');
    top.className = 'part-card-top';

    const left = document.createElement('div');
    left.className = 'part-card-header-left';

    const seqBadge = document.createElement('span');
    seqBadge.className = 'part-sequence-badge';
    seqBadge.textContent = `#${p.order_index || idx + 1}`;
    left.appendChild(seqBadge);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge';
    const typeIcon = document.createElement('i');
    typeIcon.className = `fa-solid ${p.part_type === 'scene' ? 'fa-film' : p.part_type === 'chapter' ? 'fa-book-open' : p.part_type === 'voiceover' ? 'fa-microphone' : 'fa-note-sticky'}`;
    typeBadge.appendChild(typeIcon);
    typeBadge.appendChild(document.createTextNode(` ${p.part_type}`));
    left.appendChild(typeBadge);

    const title = document.createElement('h4');
    title.className = 'part-title';
    title.textContent = p.title;
    left.appendChild(title);

    top.appendChild(left);

    // Clickable Status Pill (Draft -> In Progress -> Ready -> Done)
    const statusPill = document.createElement('button');
    statusPill.type = 'button';
    statusPill.className = `part-status-badge ${getStatusBadgeClass(p.status)}`;
    statusPill.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${p.status}`;
    statusPill.title = 'Click to cycle status (Draft -> In Progress -> Ready -> Done)';
    statusPill.addEventListener('click', (e) => {
      e.stopPropagation();
      cyclePartStatus(p.id, p.status);
    });
    top.appendChild(statusPill);

    card.appendChild(top);

    // Script / Content notes
    if (p.notes || p.description) {
      const content = document.createElement('pre');
      content.className = 'part-content-text';
      content.textContent = p.notes || p.description;
      card.appendChild(content);
    }

    // Linked Entities Shelf
    const linkages = document.createElement('div');
    linkages.className = 'part-linked-entities';

    const entities = [];
    if (Array.isArray(p.linked_characters)) {
      p.linked_characters.forEach((c) => entities.push({ entity_type: 'character', entity_id: c.id, entity_title: c.name }));
    }
    if (Array.isArray(p.linked_prompts)) {
      p.linked_prompts.forEach((pr) => entities.push({ entity_type: 'prompt', entity_id: pr.id, entity_title: pr.title }));
    }
    if (Array.isArray(p.linked_links)) {
      p.linked_links.forEach((l) => entities.push({ entity_type: 'link', entity_id: l.id, entity_title: l.title || l.url }));
    }
    if (Array.isArray(p.linked_entities)) {
      p.linked_entities.forEach((ent) => entities.push(ent));
    }

    if (entities.length > 0) {
      entities.forEach((ent) => {
        const chip = document.createElement('span');
        chip.className = 'entity-link-chip';

        const entIcon = document.createElement('i');
        entIcon.className = `fa-solid ${ent.entity_type === 'character' ? 'fa-user' : ent.entity_type === 'prompt' ? 'fa-feather-pointed' : ent.entity_type === 'link' ? 'fa-link' : 'fa-chalkboard'}`;
        chip.appendChild(entIcon);

        chip.appendChild(document.createTextNode(` ${ent.entity_title || ent.entity_type}`));

        const removeBtn = document.createElement('span');
        removeBtn.className = 'chip-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Unlink asset';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          detachPartEntity(p.id, ent.entity_type, ent.entity_id);
        });
        chip.appendChild(removeBtn);

        linkages.appendChild(chip);
      });
    }

    const addLinkBtn = document.createElement('button');
    addLinkBtn.type = 'button';
    addLinkBtn.className = 'btn-add-linkage';
    addLinkBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Link Asset';
    addLinkBtn.addEventListener('click', () => openLinkEntityModal(p.id));
    linkages.appendChild(addLinkBtn);

    card.appendChild(linkages);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'part-card-footer';

    const info = document.createElement('span');
    info.textContent = p.completed_at ? `Done: ${p.completed_at.split('T')[0] || p.completed_at}` : `Updated: ${p.updated_at?.split('T')[0] || 'recently'}`;
    footer.appendChild(info);

    const actDiv = document.createElement('div');
    actDiv.style.display = 'flex';
    actDiv.style.gap = '0.4rem';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.title = 'Edit Part';
    editBtn.addEventListener('click', () => openPartModal(p));
    actDiv.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn text-danger';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete Part';
    delBtn.addEventListener('click', () => deletePart(p.id));
    actDiv.appendChild(delBtn);

    footer.appendChild(actDiv);
    card.appendChild(footer);

    listEl.appendChild(card);
  });
}

async function cyclePartStatus(partId, currentStatus) {
  const cycle = ['Draft', 'In Progress', 'Ready', 'Done'];
  const nextStatus = cycle[(cycle.indexOf(currentStatus) + 1) % cycle.length];

  try {
    const res = await fetch(`/api/parts/${partId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(`Part status updated to ${nextStatus}`);
    await loadParts();
  } catch (err) {
    console.error('Failed to update part status', err);
    showToast(`Status update failed: ${err.message}`, 'error');
  }
}

function openPartModal(part = null) {
  const titleEl = document.getElementById('part-modal-title');
  const idEl = document.getElementById('part-id');
  const titleInput = document.getElementById('part-title');
  const typeSelect = document.getElementById('part-type');
  const statusSelect = document.getElementById('part-status');
  const seqInput = document.getElementById('part-sequence');
  const contentInput = document.getElementById('part-content');

  if (part) {
    titleEl.textContent = 'Edit Production Part';
    idEl.value = part.id;
    titleInput.value = part.title || '';
    typeSelect.value = part.part_type || 'scene';
    statusSelect.value = part.status || 'Draft';
    seqInput.value = part.order_index || 1;
    contentInput.value = part.notes || part.description || '';
  } else {
    titleEl.textContent = 'New Production Part';
    idEl.value = '';
    titleInput.value = '';
    typeSelect.value = 'scene';
    statusSelect.value = 'Draft';
    seqInput.value = (state.parts.length + 1);
    contentInput.value = '';
  }

  openModal('modal-part');
}

async function handlePartSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('part-id').value;
  const payload = {
    title: document.getElementById('part-title').value.trim(),
    part_type: document.getElementById('part-type').value,
    status: document.getElementById('part-status').value,
    order_index: parseInt(document.getElementById('part-sequence').value, 10) || 1,
    notes: document.getElementById('part-content').value.trim() || null,
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/parts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`/api/projects/${state.activeProjectId}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) throw new Error(await res.text());
    closeModal('modal-part');
    showToast(id ? 'Part updated!' : 'Part created!');
    await loadParts();
  } catch (err) {
    console.error('Failed to save part', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deletePart(id) {
  if (!confirm('Are you sure you want to delete this production part?')) return;
  try {
    const res = await fetch(`/api/parts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Part deleted');
    await loadParts();
  } catch (err) {
    console.error('Failed to delete part', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

function openLinkEntityModal(partId) {
  document.getElementById('link-entity-part-id').value = partId;
  document.getElementById('link-entity-notes').value = '';
  document.getElementById('link-entity-type').value = 'character';
  populateLinkTargetDropdown();
  openModal('modal-link-entity');
}

function populateLinkTargetDropdown() {
  const type = document.getElementById('link-entity-type').value;
  const targetSelect = document.getElementById('link-entity-target');
  targetSelect.innerHTML = '';

  let items = [];
  if (type === 'character') {
    items = state.characters.map((c) => ({ id: c.id, label: c.name }));
  } else if (type === 'prompt') {
    items = state.prompts.map((p) => ({ id: p.id, label: p.title }));
  } else if (type === 'link') {
    items = state.links.map((l) => ({ id: l.id, label: l.title || l.url }));
  } else if (type === 'board') {
    items = state.boards.map((b) => ({ id: b.id, label: b.name }));
  }

  if (items.length === 0) {
    targetSelect.innerHTML = '<option value="">No items available in this category</option>';
    return;
  }

  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    targetSelect.appendChild(opt);
  });
}

async function handleLinkEntitySubmit(e) {
  e.preventDefault();
  const partId = document.getElementById('link-entity-part-id').value;
  const entityType = document.getElementById('link-entity-type').value;
  const entityId = parseInt(document.getElementById('link-entity-target').value, 10);
  const notes = document.getElementById('link-entity-notes').value.trim() || null;

  if (!entityId) {
    showToast('Please select a valid entity', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/parts/${partId}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: entityType,
        entity_id: entityId,
        notes,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    closeModal('modal-link-entity');
    showToast('Asset linked to part');
    await loadParts();
  } catch (err) {
    console.error('Failed to link entity', err);
    showToast(`Linking failed: ${err.message}`, 'error');
  }
}

async function detachPartEntity(partId, entityType, entityId) {
  try {
    const res = await fetch(`/api/parts/${partId}/entities/${entityType}/${entityId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
    showToast('Asset unlinked from part');
    await loadParts();
  } catch (err) {
    console.error('Failed to unlink entity', err);
    showToast(`Unlink failed: ${err.message}`, 'error');
  }
}

// ===================================================
// PROJECT MEDIA & CUSTOM ADDONS CONTROLLER
// ===================================================

async function loadAttachments() {
  try {
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/projects/${pid}/attachments`);
    state.attachments = await res.json();
    renderAttachmentsShelf(state.attachments);
  } catch (err) {
    console.error('Failed to load attachments', err);
  }
}

function renderAttachmentsShelf(attachments) {
  const shelf = document.getElementById('project-media-shelf');
  if (!shelf) return;
  shelf.innerHTML = '';

  if (attachments.length === 0) {
    shelf.innerHTML = '<div class="empty-state"><i class="fa-solid fa-cloud-arrow-up empty-icon"></i><p>No project media uploaded yet. Click "Upload Media" to add audio, scripts, or video.</p></div>';
    return;
  }

  attachments.forEach((att) => {
    const card = document.createElement('div');
    card.className = 'media-item-card';

    const top = document.createElement('div');
    top.className = 'media-item-top';

    const iconSpan = document.createElement('span');
    const isAudio = att.addon_type === 'audio' || (att.mime_type && att.mime_type.startsWith('audio/'));
    const isDoc = att.addon_type === 'document' || (att.mime_type && att.mime_type.includes('text')) || att.name.endsWith('.md');
    const isPdf = att.name.endsWith('.pdf');
    const isVideo = att.addon_type === 'video' || (att.mime_type && att.mime_type.startsWith('video/'));
    const isImg = att.addon_type === 'image' || (att.mime_type && att.mime_type.startsWith('image/'));

    let iconClass = 'fa-paperclip';
    if (isAudio) iconClass = 'fa-music';
    else if (isPdf) iconClass = 'fa-file-pdf';
    else if (isDoc) iconClass = 'fa-file-lines';
    else if (isVideo) iconClass = 'fa-video';
    else if (isImg) iconClass = 'fa-image';

    iconSpan.innerHTML = `<i class="fa-solid ${iconClass}"></i> `;
    top.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'media-item-name';
    nameSpan.textContent = att.name;
    nameSpan.title = att.name;
    top.appendChild(nameSpan);

    const actions = document.createElement('div');
    actions.className = 'media-item-actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-xs btn-primary';
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i> View';
    playBtn.addEventListener('click', () => openMediaViewer(att));
    actions.appendChild(playBtn);

    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn btn-xs btn-outline';
    revealBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
    revealBtn.title = 'Reveal in Explorer';
    revealBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/fs/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `projects/${att.project_id}/${att.file_path}` }),
        });
        if (res.ok) showToast('Revealed file in Explorer');
      } catch (e) {
        showToast('Failed to reveal file', 'error');
      }
    });
    actions.appendChild(revealBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn text-danger';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete attachment';
    delBtn.addEventListener('click', () => deleteAttachment(att.id));
    actions.appendChild(delBtn);

    top.appendChild(actions);
    card.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'media-item-meta';
    meta.textContent = `${formatBytes(att.file_size)} • ${att.addon_type || 'file'} ${att.notes ? '• ' + att.notes : ''}`;
    card.appendChild(meta);

    shelf.appendChild(card);
  });
}

function openAttachmentModal() {
  const partSelect = document.getElementById('attachment-part-select');
  if (partSelect) {
    partSelect.innerHTML = '<option value="">General Project Asset (No specific part)</option>';
    state.parts.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `#${p.order_index} - ${p.title}`;
      partSelect.appendChild(opt);
    });
  }

  document.getElementById('attachment-file-input').value = '';
  document.getElementById('attachment-notes').value = '';
  openModal('modal-attachment');
}

async function handleAttachmentSubmit(e) {
  e.preventDefault();
  const fileInput = document.getElementById('attachment-file-input');
  if (!fileInput.files || !fileInput.files[0]) {
    showToast('Please select a file to upload', 'error');
    return;
  }

  const file = fileInput.files[0];
  const partId = document.getElementById('attachment-part-select').value;
  const notes = document.getElementById('attachment-notes').value.trim();

  const formData = new FormData();
  formData.append('file', file);
  if (partId) formData.append('part_id', partId);
  if (notes) formData.append('notes', notes);

  try {
    showToast('Uploading file...');
    const res = await fetch(`/api/projects/${state.activeProjectId}/attachments`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(await res.text());
    closeModal('modal-attachment');
    showToast('Media attachment uploaded successfully!');
    await loadAttachments();
  } catch (err) {
    console.error('Upload attachment error', err);
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}

async function deleteAttachment(id) {
  if (!confirm('Are you sure you want to delete this media attachment?')) return;
  try {
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Media attachment deleted');
    await loadAttachments();
  } catch (err) {
    console.error('Delete attachment error', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ===================================================
// MEDIA VIEWER MODAL CONTROLLER
// ===================================================

function initMediaViewerModal() {
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const speed = parseFloat(btn.dataset.speed || '1.0');
      const audioEl = document.getElementById('audio-playback-el');
      if (audioEl) audioEl.playbackRate = speed;
      const videoEl = document.getElementById('video-playback-el');
      if (videoEl) videoEl.playbackRate = speed;
    });
  });

  const scriptPre = document.getElementById('script-reader-pre');
  const copyBtn = document.getElementById('btn-script-copy');
  if (copyBtn && scriptPre) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(scriptPre.textContent || '');
      showToast('Text copied to clipboard!');
    });
  }

  let currentScriptFontSize = 13.5;
  const decFontBtn = document.getElementById('btn-script-font-dec');
  const incFontBtn = document.getElementById('btn-script-font-inc');
  if (decFontBtn && scriptPre) {
    decFontBtn.addEventListener('click', () => {
      if (currentScriptFontSize > 10) {
        currentScriptFontSize -= 1.5;
        scriptPre.style.fontSize = `${currentScriptFontSize}px`;
      }
    });
  }
  if (incFontBtn && scriptPre) {
    incFontBtn.addEventListener('click', () => {
      if (currentScriptFontSize < 24) {
        currentScriptFontSize += 1.5;
        scriptPre.style.fontSize = `${currentScriptFontSize}px`;
      }
    });
  }
}

async function openMediaViewer(att) {
  const titleEl = document.getElementById('media-viewer-title');
  const badgeEl = document.getElementById('media-viewer-badge');
  const downloadLink = document.getElementById('btn-media-download-link');
  const revealBtn = document.getElementById('btn-media-reveal');
  const permalinkBtn = document.getElementById('btn-media-permalink');

  titleEl.textContent = att.name;
  badgeEl.textContent = att.addon_type || 'file';

  const rawUrl = `/files/projects/${att.project_id}/${att.file_path}`;
  if (downloadLink) downloadLink.href = rawUrl;

  if (revealBtn) {
    revealBtn.onclick = async () => {
      try {
        const res = await fetch('/api/fs/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `projects/${att.project_id}/${att.file_path}` }),
        });
        if (res.ok) showToast('Revealed file in Explorer');
      } catch (e) {
        showToast('Failed to reveal file', 'error');
      }
    };
  }

  if (permalinkBtn) {
    permalinkBtn.onclick = () => {
      const fullUrl = `${window.location.origin}${window.location.pathname}#/projects/${att.project_id}/attachments/${att.id}`;
      navigator.clipboard.writeText(fullUrl);
      showToast('Permalink copied to clipboard!');
    };
  }

  // Hide all containers first
  document.getElementById('media-audio-player').style.display = 'none';
  document.getElementById('media-script-reader').style.display = 'none';
  document.getElementById('media-pdf-viewer').style.display = 'none';
  document.getElementById('media-video-player').style.display = 'none';
  document.getElementById('media-image-viewer').style.display = 'none';

  const mime = att.mime_type || '';
  const fname = att.name.toLowerCase();

  if (att.addon_type === 'audio' || mime.startsWith('audio/') || fname.endsWith('.mp3') || fname.endsWith('.wav') || fname.endsWith('.ogg')) {
    const audioDiv = document.getElementById('media-audio-player');
    const audioEl = document.getElementById('audio-playback-el');
    audioEl.src = rawUrl;
    audioEl.playbackRate = 1.0;
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b.dataset.speed === '1.0'));
    audioDiv.style.display = 'block';
  } else if (fname.endsWith('.pdf') || mime === 'application/pdf') {
    const pdfDiv = document.getElementById('media-pdf-viewer');
    const pdfFrame = document.getElementById('pdf-viewer-frame');
    pdfFrame.src = rawUrl;
    pdfDiv.style.display = 'block';
  } else if (att.addon_type === 'video' || mime.startsWith('video/') || fname.endsWith('.mp4') || fname.endsWith('.webm')) {
    const videoDiv = document.getElementById('media-video-player');
    const videoEl = document.getElementById('video-playback-el');
    videoEl.src = rawUrl;
    videoDiv.style.display = 'block';
  } else if (att.addon_type === 'image' || mime.startsWith('image/') || fname.endsWith('.png') || fname.endsWith('.jpg') || fname.endsWith('.webp')) {
    const imgDiv = document.getElementById('media-image-viewer');
    const imgEl = document.getElementById('image-playback-el');
    imgEl.src = rawUrl;
    imgDiv.style.display = 'block';
  } else {
    // Default text/document script reader
    const scriptDiv = document.getElementById('media-script-reader');
    const scriptPre = document.getElementById('script-reader-pre');
    scriptPre.textContent = 'Loading file contents...';
    scriptDiv.style.display = 'block';
    try {
      const res = await fetch(rawUrl);
      const text = await res.text();
      scriptPre.textContent = text;
    } catch (e) {
      scriptPre.textContent = `Error reading file: ${e.message}`;
    }
  }

  openModal('modal-media-viewer');
}

// ===================================================
// MULTI-WORKSPACE MERGE & TRANSFER WORKBENCH
// ===================================================

function initMultiWorkspaceModals() {
  const formMerge = document.getElementById('form-merge');
  if (formMerge) formMerge.addEventListener('submit', handleMergeSubmit);

  const transferSourceSelect = document.getElementById('transfer-source-select');
  if (transferSourceSelect) {
    transferSourceSelect.addEventListener('change', () => renderTransferSourceItems());
  }

  const transferTargetSelect = document.getElementById('transfer-target-select');
  if (transferTargetSelect) {
    transferTargetSelect.addEventListener('change', () => renderTransferTargetSummary());
  }

  const transferSelectAllBtn = document.getElementById('btn-transfer-select-all');
  if (transferSelectAllBtn) {
    transferSelectAllBtn.addEventListener('click', () => {
      const cbs = document.querySelectorAll('.transfer-item-checkbox');
      const allChecked = Array.from(cbs).every((cb) => cb.checked);
      cbs.forEach((cb) => (cb.checked = !allChecked));
    });
  }

  const executeTransferBtn = document.getElementById('btn-execute-transfer');
  if (executeTransferBtn) {
    executeTransferBtn.addEventListener('click', () => handleExecuteTransfer());
  }
}

function openMergeModal(sourceId) {
  const sourceProj = state.projects.find((p) => p.id === sourceId);
  document.getElementById('merge-source-id').value = sourceId;
  document.getElementById('merge-source-label').textContent = sourceProj ? sourceProj.name : `Project #${sourceId}`;

  const targetSelect = document.getElementById('merge-target-select');
  targetSelect.innerHTML = '';

  const candidates = state.projects.filter((p) => p.id !== sourceId);
  if (candidates.length === 0) {
    showToast('No other project available to merge into', 'error');
    return;
  }

  candidates.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.status})`;
    targetSelect.appendChild(opt);
  });

  openModal('modal-merge');
}

async function handleMergeSubmit(e) {
  e.preventDefault();
  const sourceId = document.getElementById('merge-source-id').value;
  const targetId = parseInt(document.getElementById('merge-target-select').value, 10);
  const renameConflicts = document.getElementById('merge-rename-conflicts').checked;
  const copyMedia = document.getElementById('merge-copy-media').checked;

  try {
    showToast('Merging workspace...');
    const res = await fetch(`/api/projects/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_project_id: targetId,
        rename_conflicts: renameConflicts,
        copy_media: copyMedia,
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    closeModal('modal-merge');
    showToast(`Merged successfully! ${result.merged_prompts} prompts, ${result.merged_parts} parts.`);
    state.activeProjectId = targetId;
    localStorage.setItem('atelier_active_project_id', targetId);
    await refreshAllData();
  } catch (err) {
    console.error('Merge error', err);
    showToast(`Merge failed: ${err.message}`, 'error');
  }
}

async function openTransferWorkbench(sourceId = null) {
  const srcSelect = document.getElementById('transfer-source-select');
  const tgtSelect = document.getElementById('transfer-target-select');
  srcSelect.innerHTML = '';
  tgtSelect.innerHTML = '';

  const sId = sourceId || state.activeProjectId;
  state.projects.forEach((p) => {
    const opt1 = document.createElement('option');
    opt1.value = p.id;
    opt1.textContent = p.name;
    if (p.id === sId) opt1.selected = true;
    srcSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = p.id;
    opt2.textContent = p.name;
    if (p.id !== sId) opt2.selected = true;
    tgtSelect.appendChild(opt2);
  });

  await renderTransferSourceItems();
  renderTransferTargetSummary();
  openModal('modal-transfer');
}

async function renderTransferSourceItems() {
  const container = document.getElementById('transfer-items-list');
  if (!container) return;
  container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted);">Loading items...</div>';

  const srcId = parseInt(document.getElementById('transfer-source-select').value, 10);

  try {
    const [pRes, cRes, lRes, bRes, partsRes] = await Promise.all([
      fetch(`/api/prompts?project_id=${srcId}`),
      fetch(`/api/characters?project_id=${srcId}`),
      fetch(`/api/links?project_id=${srcId}`),
      fetch(`/api/boards?project_id=${srcId}`),
      fetch(`/api/projects/${srcId}/parts`),
    ]);

    const prompts = await pRes.json();
    const characters = await cRes.json();
    const links = await lRes.json();
    const boards = await bRes.json();
    const parts = await partsRes.json();

    container.innerHTML = '';

    const addGroup = (title, items, type, nameKey) => {
      if (items.length === 0) return;
      const grpTitle = document.createElement('div');
      grpTitle.className = 'transfer-group-title';
      grpTitle.textContent = `${title} (${items.length})`;
      container.appendChild(grpTitle);

      items.forEach((item) => {
        const row = document.createElement('label');
        row.className = 'transfer-item-row';
        row.innerHTML = `
          <input type="checkbox" class="transfer-item-checkbox" data-type="${type}" data-id="${item.id}">
          <span>${item[nameKey] || 'Untitled'}</span>
        `;
        container.appendChild(row);
      });
    };

    addGroup('Prompts', prompts, 'prompt', 'title');
    addGroup('Characters', characters, 'character', 'name');
    addGroup('References', links, 'link', 'title');
    addGroup('Boards', boards, 'board', 'name');
    addGroup('Parts', parts, 'part', 'title');

    if (container.children.length === 0) {
      container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 1rem 0;">Source workspace has no items.</div>';
    }
  } catch (err) {
    container.innerHTML = `<div style="font-size: 0.8rem; color: var(--danger);">Failed to load source items: ${err.message}</div>`;
  }
}

function renderTransferTargetSummary() {
  const summary = document.getElementById('transfer-target-summary');
  if (!summary) return;
  const tgtId = parseInt(document.getElementById('transfer-target-select').value, 10);
  const tgt = state.projects.find((p) => p.id === tgtId);

  if (!tgt) {
    summary.innerHTML = '<p>No target selected</p>';
    return;
  }

  summary.innerHTML = `
    <h4 style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 0.9rem;">${tgt.name}</h4>
    <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${tgt.description || 'No description'}</p>
    <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.6;">
      <div>Status: <strong>${tgt.status}</strong></div>
      <div>Existing Prompts: <strong>${tgt.prompts_count || 0}</strong></div>
      <div>Existing Cast: <strong>${tgt.characters_count || 0}</strong></div>
      <div>Existing Boards: <strong>${tgt.boards_count || 0}</strong></div>
      <div>Existing Parts: <strong>${tgt.parts_count || 0}</strong></div>
    </div>
  `;
}

async function handleExecuteTransfer() {
  const srcId = parseInt(document.getElementById('transfer-source-select').value, 10);
  const tgtId = parseInt(document.getElementById('transfer-target-select').value, 10);

  if (srcId === tgtId) {
    showToast('Source and target workspace must be different', 'error');
    return;
  }

  const mode = document.querySelector('input[name="transfer-mode"]:checked')?.value || 'copy';

  const selectedCheckboxes = document.querySelectorAll('.transfer-item-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    showToast('Please select at least one item to transfer', 'error');
    return;
  }

  const items = Array.from(selectedCheckboxes).map((cb) => ({
    entity_type: cb.dataset.type,
    entity_id: parseInt(cb.dataset.id, 10),
  }));

  try {
    showToast('Transferring items...');
    const res = await fetch('/api/projects/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_project_id: srcId,
        target_project_id: tgtId,
        items,
        mode,
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    closeModal('modal-transfer');
    showToast(`Transferred ${result.transferred_count} items successfully!`);
    await refreshAllData();
  } catch (err) {
    console.error('Transfer execution error', err);
    showToast(`Transfer failed: ${err.message}`, 'error');
  }
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
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/prompts?project_id=${pid}`);
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
      payload.project_id = state.activeProjectId || 1;
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
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/characters?project_id=${pid}`);
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
      payload.project_id = state.activeProjectId || 1;
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
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/links?project_id=${pid}`);
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
      payload.project_id = state.activeProjectId || 1;
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
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/boards?project_id=${pid}`);
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
    project_id: state.activeProjectId || 1,
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
  } else if (activeTab === 'parts') {
    items = (state.parts || []).map((p) => ({
      entity_type: 'part',
      entity_id: p.id,
      title: `#${p.order_index || 1} ${p.title}`,
      snippet: `${p.part_type} [${p.status}]`,
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
    let iconClass = 'fa-link';
    if (item.entity_type === 'prompt') iconClass = 'fa-feather-pointed';
    else if (item.entity_type === 'character') iconClass = 'fa-user';
    else if (item.entity_type === 'part') iconClass = 'fa-film';
    dIcon.className = `fa-solid ${iconClass}`;
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
