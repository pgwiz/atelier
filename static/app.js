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
  initCompoundModals();
  initProjectsView();
  initProjectHubView();
  initSettingsView();
  initBottomDock();
  initAiChatDrawer();
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
    loadSettingsUI();
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
    document.querySelectorAll('.project-card-dropdown.open').forEach((d) => {
      if (!d.contains(e.target) && !e.target.closest('.btn-card-more')) {
        d.classList.remove('open');
      }
    });
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

  // Update bottom dock buttons
  document.querySelectorAll('#bottom-dock .dock-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update view sections
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.remove('active');
    sec.style.display = 'none';
  });

  const activeSection = document.getElementById(`view-${viewName}`);
  if (activeSection) {
    activeSection.classList.add('active');
    activeSection.style.display = 'flex';
  }

  // View-specific refreshes
  if (viewName === 'projects') loadProjects();
  if (viewName === 'project-hub') renderProjectHub();
  if (viewName === 'settings') loadSettingsUI();
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
    } else if (section && ['projects', 'parts', 'prompts', 'characters', 'links', 'boards', 'search', 'settings', 'backup', 'project-hub'].includes(section)) {
      switchView(section);
    } else if (section === 'hub') {
      switchView('project-hub');
    } else {
      switchView('project-hub');
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const openModalEl = document.querySelector('.modal-overlay.open');
      if (openModalEl) {
        const form = openModalEl.querySelector('form');
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        } else {
          const primaryBtn = openModalEl.querySelector('.modal-footer .btn-primary, .modal-footer .btn-danger, #btn-execute-transfer, #btn-confirm-proceed');
          if (primaryBtn) {
            e.preventDefault();
            primaryBtn.click();
          }
        }
      }
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

      item.addEventListener('click', async () => {
        const dropdown = document.getElementById('project-switcher-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        await switchProject(p.id);
        if (state.activeView === 'projects') {
          switchView('project-hub');
        }
      });

      listEl.appendChild(item);
    });
  }
}

async function switchProject(projectId) {
  const numId = parseInt(projectId, 10);
  if (isNaN(numId)) return;
  const isSame = Number(state.activeProjectId) === numId && state.activeProject && Number(state.activeProject.id) === numId;
  state.activeProjectId = numId;
  localStorage.setItem('atelier_active_project_id', numId.toString());

  const proj = state.projects.find((p) => Number(p.id) === numId);
  if (proj) {
    state.activeProject = proj;
  }

  updateProjectSwitcherUI();
  updateAiDrawerProjectContext();

  if (!isSame) {
    await refreshAllData();
  }

  await refreshActiveProjectProgress();

  if (proj && !isSame) {
    showToast(`Switched workspace to "${proj.name}"`);
  }

  if (state.activeView === 'project-hub') {
    await renderProjectHub();
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
    card.style.cursor = 'pointer';
    card.addEventListener('click', async (e) => {
      if (e.target.closest('button, a, input, select, textarea, .dropdown-menu, .dropdown-item')) return;
      await switchProject(p.id);
      switchView('project-hub');
    });

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

    // Clickable Category Stat Chips
    const statsRow = document.createElement('div');
    statsRow.className = 'project-card-stats';

    const statParts = document.createElement('button');
    statParts.type = 'button';
    statParts.className = 'stat-chip-card';
    statParts.innerHTML = `<i class="fa-solid fa-film"></i> ${p.completed_parts_count || 0}/${p.parts_count || 0} Parts`;
    statParts.title = 'Open Production Parts';
    statParts.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('parts');
    });
    statsRow.appendChild(statParts);

    const statPrompts = document.createElement('button');
    statPrompts.type = 'button';
    statPrompts.className = 'stat-chip-card';
    statPrompts.innerHTML = `<i class="fa-solid fa-feather-pointed"></i> ${p.prompts_count || 0} Prompts`;
    statPrompts.title = 'Open Prompts';
    statPrompts.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('prompts');
    });
    statsRow.appendChild(statPrompts);

    const statChars = document.createElement('button');
    statChars.type = 'button';
    statChars.className = 'stat-chip-card';
    statChars.innerHTML = `<i class="fa-solid fa-users"></i> ${p.characters_count || 0} Cast`;
    statChars.title = 'Open Characters';
    statChars.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('characters');
    });
    statsRow.appendChild(statChars);

    const statLinks = document.createElement('button');
    statLinks.type = 'button';
    statLinks.className = 'stat-chip-card';
    statLinks.innerHTML = `<i class="fa-solid fa-link"></i> ${p.links_count || 0} Refs`;
    statLinks.title = 'Open References';
    statLinks.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('links');
    });
    statsRow.appendChild(statLinks);

    const statBoards = document.createElement('button');
    statBoards.type = 'button';
    statBoards.className = 'stat-chip-card';
    statBoards.innerHTML = `<i class="fa-solid fa-chalkboard"></i> ${p.boards_count || 0} Boards`;
    statBoards.title = 'Open Planning Boards';
    statBoards.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('boards');
    });
    statsRow.appendChild(statBoards);

    card.appendChild(statsRow);

    // Footer with Primary Open Project Button & Sleek 3-Dots Dropdown
    const footer = document.createElement('div');
    footer.className = 'project-card-footer';

    const dateSpan = document.createElement('div');
    dateSpan.className = 'project-card-dates';
    const cDate = p.created_at ? (p.created_at.split('T')[0] || p.created_at) : 'N/A';
    const uDate = p.updated_at ? (p.updated_at.split('T')[0] || p.updated_at) : 'N/A';
    dateSpan.innerHTML = `<span title="Created at">Created: ${cDate}</span> &bull; <span title="Last updated at">Updated: ${uDate}</span>`;
    footer.appendChild(dateSpan);

    const actions = document.createElement('div');
    actions.className = 'project-card-primary-action';

    // Prominent Primary "Open Project" Button -> Project Hub
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn btn-primary btn-sm btn-open-project';
    openBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Open Project';
    openBtn.title = 'Open dedicated Project Hub';
    openBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await switchProject(p.id);
      switchView('project-hub');
    });
    actions.appendChild(openBtn);

    // Sleek 3-Dots Action Dropdown
    const moreWrap = document.createElement('div');
    moreWrap.className = 'project-card-more-wrap';

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn-card-more';
    moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    moreBtn.title = 'Project Actions';

    const dropdown = document.createElement('div');
    dropdown.className = 'project-card-dropdown';

    const addItem = (icon, label, onClick, isDanger = false) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `project-card-dropdown-item ${isDanger ? 'danger' : ''}`;
      item.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${label}</span>`;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        onClick();
      });
      dropdown.appendChild(item);
    };

    addItem('fa-pen-to-square', 'Edit Details', () => openProjectModal(p));
    addItem('fa-folder-open', 'Open Folder', () => openProjectFolder(p.id));
    addItem('fa-rotate', 'Reload JSON', () => reloadProjectJson(p.id));
    addItem('fa-file-zipper', 'Export ZIP', () => window.open(`/api/projects/${p.id}/export`, '_blank'));
    addItem('fa-clone', 'Duplicate Project', () => copyProject(p.id));
    addItem('fa-code-merge', 'Merge Project', () => openMergeModal(p.id));
    addItem('fa-arrows-split-up-and-left', 'Transfer Workbench', () => openTransferWorkbench(p.id));

    const divider = document.createElement('div');
    divider.className = 'project-card-dropdown-divider';
    dropdown.appendChild(divider);

    addItem('fa-trash-can', 'Delete Project', () => deleteProject(p.id), true);

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.project-card-dropdown.open').forEach((d) => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
    });

    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(dropdown);
    actions.appendChild(moreWrap);

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
  const p = state.projects.find((proj) => proj.id === id);
  const defaultName = p ? `${p.name} (Copy)` : 'Duplicate Project';
  const newName = await showPromptDialog(
    'Duplicate Project',
    'Enter a name for the duplicated project workspace:',
    defaultName,
    'e.g. My Workspace V2'
  );
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
  const confirmed = await showConfirmDialog(
    'Delete Project Workspace',
    'Are you sure you want to delete this project workspace and all its contents?',
    'Delete Workspace',
    true
  );
  if (!confirmed) return;

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

  const sortSelect = document.getElementById('filter-parts-sort');
  if (sortSelect) sortSelect.addEventListener('change', () => filterParts());

  const aiSceneBtn = document.getElementById('btn-parts-ai-scene');
  if (aiSceneBtn) {
    aiSceneBtn.addEventListener('click', () => {
      openAiChatDrawer();
      const projName = state.activeProject?.name || 'this project';
      const prompt = `Draft 3 sequential production scene breakdown ideas for "${projName}" with duration, visual framing, and audio notes.`;
      appendAiMessage('user', prompt);
      sendAiChat(prompt);
    });
  }

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
  const sortBy = document.getElementById('filter-parts-sort')?.value || 'order';

  let filtered = state.parts.filter((p) => {
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

  if (sortBy === 'title') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortBy === 'status') {
    filtered.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
  } else {
    filtered.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }

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
  const confirmed = await showConfirmDialog(
    'Delete Production Part',
    'Are you sure you want to delete this production part?',
    'Delete Part',
    true
  );
  if (!confirmed) return;
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
  const confirmed = await showConfirmDialog(
    'Delete Media Attachment',
    'Are you sure you want to delete this media attachment? This file will be permanently removed.',
    'Delete Attachment',
    true
  );
  if (!confirmed) return;
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

  const sortSelect = document.getElementById('filter-prompts-sort');
  if (sortSelect) sortSelect.addEventListener('change', () => filterPrompts());

  document.getElementById('btn-prompts-ai-generate')?.addEventListener('click', () => {
    openAiChatDrawer();
    const p = 'Brainstorm 3 unique, high-detail cinematic prompts tailored for this project';
    appendAiMessage('user', p);
    sendAiChat(p);
  });

  document.getElementById('btn-prompt-ai-enhance')?.addEventListener('click', () => {
    const currentPrompt = document.getElementById('prompt-body')?.value.trim() || '';
    openAiChatDrawer();
    const req = currentPrompt
      ? `Enhance and optimize this prompt for highest visual quality and cinematic detail: "${currentPrompt}"`
      : 'Help brainstorm an exceptional directive prompt for this project';
    appendAiMessage('user', req);
    sendAiChat(req);
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
    filterPrompts();
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
  const query = document.getElementById('filter-prompts-search')?.value.toLowerCase().trim() || '';
  const category = document.getElementById('filter-prompts-category')?.value || '';
  const characterId = document.getElementById('filter-prompts-character')?.value || '';
  const sortBy = document.getElementById('filter-prompts-sort')?.value || 'recent';
  const favOnly = document.getElementById('filter-prompts-fav')?.classList.contains('active') || false;

  let filtered = state.prompts.filter((p) => {
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

  if (sortBy === 'title') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortBy === 'category') {
    filtered.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  } else {
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

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

  const promptToggle = document.getElementById('btn-toggle-prompt-advanced');
  const promptAdvanced = document.getElementById('prompt-advanced-options');
  const hasAdvanced = !!(prompt && (prompt.system_prompt || prompt.parameters || prompt.notes || prompt.character_id || prompt.model_used));
  if (promptAdvanced) {
    promptAdvanced.style.display = hasAdvanced ? 'block' : 'none';
  }
  if (promptToggle) {
    promptToggle.classList.toggle('expanded', hasAdvanced);
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
  const confirmed = await showConfirmDialog(
    'Delete Prompt',
    'Are you sure you want to delete this prompt template?',
    'Delete Prompt',
    true
  );
  if (!confirmed) return;
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

  document.getElementById('btn-characters-ai-persona')?.addEventListener('click', () => {
    openAiChatDrawer();
    const prompt = 'Generate a compelling character persona with visual traits and lore for this project';
    appendAiMessage('user', prompt);
    sendAiChat(prompt);
  });

  const searchInput = document.getElementById('filter-characters-search');
  const sortSelect = document.getElementById('filter-characters-sort');
  if (searchInput) searchInput.addEventListener('input', () => filterCharacters());
  if (sortSelect) sortSelect.addEventListener('change', () => filterCharacters());

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

function filterCharacters() {
  const q = document.getElementById('filter-characters-search')?.value.toLowerCase().trim() || '';
  const sortBy = document.getElementById('filter-characters-sort')?.value || 'name';

  let filtered = state.characters.filter((c) => {
    const inName = c.name.toLowerCase().includes(q);
    const inDesc = c.description && c.description.toLowerCase().includes(q);
    const inTraits = c.traits && c.traits.toLowerCase().includes(q);
    return !q || inName || inDesc || inTraits;
  });

  if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

  renderCharactersList(filtered);
}

async function loadCharacters() {
  try {
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/characters?project_id=${pid}`);
    state.characters = await res.json();
    filterCharacters();
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

  const charToggle = document.getElementById('btn-toggle-character-advanced');
  const charAdvanced = document.getElementById('character-advanced-options');
  const hasCharAdvanced = !!(character && (character.traits || character.notes));
  if (charAdvanced) {
    charAdvanced.style.display = hasCharAdvanced ? 'block' : 'none';
  }
  if (charToggle) {
    charToggle.classList.toggle('expanded', hasCharAdvanced);
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
  const confirmed = await showConfirmDialog(
    'Delete Character',
    'Are you sure you want to delete this character?',
    'Delete Character',
    true
  );
  if (!confirmed) return;
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

  const sortSelect = document.getElementById('filter-links-sort');
  if (sortSelect) sortSelect.addEventListener('change', () => filterLinks());

  document.getElementById('form-link').addEventListener('submit', handleLinkSubmit);
}

async function loadLinks() {
  try {
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/links?project_id=${pid}`);
    state.links = await res.json();
    filterLinks();
    updateSidebarBadges();
  } catch (err) {
    console.error('Failed to load links', err);
  }
}

function filterLinks() {
  const query = document.getElementById('filter-links-search')?.value.toLowerCase().trim() || '';
  const platform = document.getElementById('filter-links-platform')?.value.toLowerCase() || '';
  const sortBy = document.getElementById('filter-links-sort')?.value || 'recent';

  let filtered = state.links.filter((l) => {
    if (query) {
      const inTitle = l.title && l.title.toLowerCase().includes(query);
      const inUrl = l.url.toLowerCase().includes(query);
      const inDesc = l.description && l.description.toLowerCase().includes(query);
      if (!inTitle && !inUrl && !inDesc) return false;
    }
    if (platform && l.platform !== platform) return false;
    return true;
  });

  if (sortBy === 'title') {
    filtered.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url));
  } else if (sortBy === 'platform') {
    filtered.sort((a, b) => (a.platform || '').localeCompare(b.platform || ''));
  } else {
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

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
  const confirmed = await showConfirmDialog(
    'Delete Reference Link',
    'Are you sure you want to delete this reference link?',
    'Delete Link',
    true
  );
  if (!confirmed) return;
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

  const searchInput = document.getElementById('filter-boards-search');
  const styleSelect = document.getElementById('filter-boards-style');
  const sortSelect = document.getElementById('filter-boards-sort');
  if (searchInput) searchInput.addEventListener('input', () => filterBoards());
  if (styleSelect) styleSelect.addEventListener('change', () => filterBoards());
  if (sortSelect) sortSelect.addEventListener('change', () => filterBoards());

  document.getElementById('form-board').addEventListener('submit', handleBoardSubmit);
}

function filterBoards() {
  const query = document.getElementById('filter-boards-search')?.value.toLowerCase().trim() || '';
  const styleFilter = document.getElementById('filter-boards-style')?.value || '';
  const sortBy = document.getElementById('filter-boards-sort')?.value || 'updated';

  let filtered = state.boards.filter((b) => {
    const inName = b.name.toLowerCase().includes(query);
    const inStyle = b.canvas_style && b.canvas_style.toLowerCase().includes(query);
    if (query && !inName && !inStyle) return false;
    if (styleFilter && b.canvas_style !== styleFilter) return false;
    return true;
  });

  if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    filtered.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }

  renderBoardsList(filtered);
}

async function loadBoards() {
  try {
    const pid = state.activeProjectId || 1;
    const res = await fetch(`/api/boards?project_id=${pid}`);
    state.boards = await res.json();
    filterBoards();
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

const RANDOM_BOARD_NAMES = [
  "Episode 1 Visual Pitch",
  "Wardrobe & Costume Diagram",
  "Architectural Concept Board",
  "Spatial Planning Wireframe",
  "Cinematic Mood & Tone",
  "Editorial Brand Direction",
  "Production Set Design",
  "Material Palette Study",
  "Lighting & Atmosphere Map",
  "Exhibition Flow Layout"
];

function randomizeBoardName() {
  const input = document.getElementById('board-name');
  if (!input) return;
  const current = input.value.trim();
  const pool = RANDOM_BOARD_NAMES.filter((n) => n !== current);
  const chosen = pool[Math.floor(Math.random() * pool.length)] || RANDOM_BOARD_NAMES[0];
  input.value = chosen;
  updateBoardModalPreview();
  input.focus();
}

function applyBoardPreset(name, style, theme) {
  const nameInput = document.getElementById('board-name');
  const styleSelect = document.getElementById('board-style');
  const themeSelect = document.getElementById('board-theme');
  if (nameInput) nameInput.value = name;
  if (styleSelect) styleSelect.value = style;
  if (themeSelect) themeSelect.value = theme;
  updateBoardModalPreview();
  if (nameInput) nameInput.focus();
}

function updateBoardModalPreview() {
  const nameInput = document.getElementById('board-name');
  const styleSelect = document.getElementById('board-style');
  const themeSelect = document.getElementById('board-theme');

  const titleDisplay = document.getElementById('board-preview-title');
  const previewCanvas = document.getElementById('board-preview-canvas');
  const headerBar = document.getElementById('board-preview-header-bar');
  const swatch = document.getElementById('board-preview-accent-swatch');
  const themeBadge = document.getElementById('board-preview-theme-badge');
  const charCounter = document.getElementById('board-name-counter');

  if (!nameInput) return;

  const val = nameInput.value.trim();
  if (titleDisplay) {
    titleDisplay.textContent = val !== '' ? val : 'Untitled Planning Board';
  }

  if (charCounter) {
    charCounter.textContent = `${nameInput.value.length}/50`;
    charCounter.classList.toggle('visible', nameInput.value.length > 0);
  }

  const selectedGrid = styleSelect ? styleSelect.value : 'dot-grid';
  if (previewCanvas) {
    previewCanvas.className = `board-preview-canvas ${selectedGrid}`;
  }

  const selectedTheme = themeSelect ? themeSelect.value : 'default';
  const themeInfoMap = {
    'default': { bar: 'var(--primary)', badge: 'Default' },
    'dark': { bar: '#38bdf8', badge: 'Dark Slate' },
    'light': { bar: '#0284c7', badge: 'Crisp Light' },
    'sepia': { bar: '#9a442c', badge: 'Warm Sepia' },
    'pastel': { bar: '#4a5d4e', badge: 'Sage Pastel' },
    'cyberpunk': { bar: '#f43f5e', badge: 'Cyberpunk' }
  };
  const themeInfo = themeInfoMap[selectedTheme] || themeInfoMap['default'];

  if (headerBar) headerBar.style.backgroundColor = themeInfo.bar;
  if (swatch) swatch.style.backgroundColor = themeInfo.bar;
  if (themeBadge) themeBadge.textContent = themeInfo.badge;
}

function openBoardModal() {
  const nameInput = document.getElementById('board-name');
  const styleSelect = document.getElementById('board-style');
  const themeSelect = document.getElementById('board-theme');
  if (nameInput) nameInput.value = '';
  if (styleSelect) styleSelect.value = 'dot-grid';
  if (themeSelect) themeSelect.value = 'default';
  updateBoardModalPreview();
  openModal('modal-board');
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

async function handleBoardSubmit(e) {
  e.preventDefault();
  const payload = {
    project_id: state.activeProjectId || 1,
    name: document.getElementById('board-name').value.trim(),
    canvas_style: document.getElementById('board-style').value,
    theme: document.getElementById('board-theme').value,
  };

  if (!payload.name) {
    showToast('Board name is required', 'error');
    return;
  }

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
  const confirmed = await showConfirmDialog(
    'Delete Board',
    'Are you sure you want to delete this board? All cards and drawings will be deleted.',
    'Delete Board',
    true
  );
  if (!confirmed) return;
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

  if (activeTab === 'properties') {
    if (window.atelierCanvas && typeof window.atelierCanvas.renderDrawerProperties === 'function') {
      window.atelierCanvas.renderDrawerProperties(listContainer);
      return;
    }
  }

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
  if (!state.activeBoardId || !window.atelierCanvas) return;
  window.atelierCanvas.pinEntityAt(entityType, entityId);
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

// ===================================================
// PHASE 10: CONFIRMATION DIALOG & COMPOUND MODALS
// ===================================================

function showConfirmDialog(title, message, proceedText = 'Proceed', isDanger = true) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const proceedBtn = document.getElementById('btn-confirm-proceed') || document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    const inputGroup = document.getElementById('confirm-modal-input-group');

    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    if (inputGroup) inputGroup.style.display = 'none';
    if (titleEl) titleEl.textContent = title || 'Confirm Action';
    if (messageEl) messageEl.textContent = message;
    if (proceedBtn) {
      proceedBtn.innerHTML = `<i class="fa-solid ${isDanger ? 'fa-trash-can' : 'fa-check'}"></i> ${proceedText}`;
      proceedBtn.className = isDanger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
    }

    let resolved = false;
    const cleanup = () => {
      if (proceedBtn) proceedBtn.removeEventListener('click', onProceed);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      closeModal('modal-confirm');
    };

    const onProceed = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(false);
    };

    if (proceedBtn) proceedBtn.addEventListener('click', onProceed);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

    openModal('modal-confirm');
  });
}

function showPromptDialog(title, message, defaultValue = '', placeholder = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const proceedBtn = document.getElementById('btn-confirm-proceed') || document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    const inputGroup = document.getElementById('confirm-modal-input-group');
    const input = document.getElementById('confirm-modal-input');

    if (!modal || !inputGroup || !input) {
      resolve(window.prompt(message, defaultValue));
      return;
    }

    inputGroup.style.display = 'block';
    input.value = defaultValue || '';
    input.placeholder = placeholder || 'Enter value...';

    if (titleEl) titleEl.textContent = title || 'Input Required';
    if (messageEl) messageEl.textContent = message;
    if (proceedBtn) {
      proceedBtn.innerHTML = '<i class="fa-solid fa-check"></i> Continue';
      proceedBtn.className = 'btn btn-primary btn-sm';
    }

    let resolved = false;
    const cleanup = () => {
      if (proceedBtn) proceedBtn.removeEventListener('click', onProceed);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
      inputGroup.style.display = 'none';
      closeModal('modal-confirm');
    };

    const onProceed = () => {
      if (resolved) return;
      resolved = true;
      const val = input.value.trim();
      cleanup();
      resolve(val);
    };

    const onCancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onProceed();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    if (proceedBtn) proceedBtn.addEventListener('click', onProceed);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);

    openModal('modal-confirm');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}

function initCompoundModals() {
  const promptToggle = document.getElementById('btn-toggle-prompt-advanced');
  const promptAdvanced = document.getElementById('prompt-advanced-options');
  if (promptToggle && promptAdvanced) {
    promptToggle.addEventListener('click', () => {
      const isHidden = promptAdvanced.style.display === 'none';
      promptAdvanced.style.display = isHidden ? 'block' : 'none';
      promptToggle.classList.toggle('expanded', isHidden);
    });
  }

  const charToggle = document.getElementById('btn-toggle-character-advanced');
  const charAdvanced = document.getElementById('character-advanced-options');
  if (charToggle && charAdvanced) {
    charToggle.addEventListener('click', () => {
      const isHidden = charAdvanced.style.display === 'none';
      charAdvanced.style.display = isHidden ? 'block' : 'none';
      charToggle.classList.toggle('expanded', isHidden);
    });
  }
}

// ===================================================
// PHASE 10: DEDICATED PROJECT HUB CONTROLLER
// ===================================================

let projectActivityData = [];

function initProjectHubView() {
  const statusPill = document.getElementById('hub-project-status');
  if (statusPill) {
    statusPill.addEventListener('click', cycleProjectStatus);
  }

  const folderChip = document.getElementById('hub-folder-chip');
  if (folderChip) {
    folderChip.addEventListener('click', () => {
      if (state.activeProjectId) openProjectFolder(state.activeProjectId);
    });
  }

  const btnCopyPath = document.getElementById('btn-hub-copy-path');
  if (btnCopyPath) {
    btnCopyPath.addEventListener('click', () => {
      const folderEl = document.getElementById('hub-project-path');
      const text = folderEl ? folderEl.textContent : '';
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Folder path copied to clipboard!');
        }).catch(() => {
          showToast('Failed to copy to clipboard', 'error');
        });
      }
    });
  }

  const btnRevealFolder = document.getElementById('btn-hub-reveal-folder');
  if (btnRevealFolder) {
    btnRevealFolder.addEventListener('click', () => {
      if (state.activeProjectId) openProjectFolder(state.activeProjectId);
    });
  }

  const btnFolder = document.getElementById('btn-hub-open-folder');
  if (btnFolder) {
    btnFolder.addEventListener('click', () => {
      if (state.activeProjectId) openProjectFolder(state.activeProjectId);
    });
  }

  const btnReload = document.getElementById('btn-hub-reload-json');
  if (btnReload) {
    btnReload.addEventListener('click', () => {
      if (state.activeProjectId) reloadProjectJson(state.activeProjectId);
    });
  }

  const btnEdit = document.getElementById('btn-hub-edit-project');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      if (state.activeProject) openProjectModal(state.activeProject);
    });
  }

  const btnExport = document.getElementById('btn-hub-export-zip');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (state.activeProjectId) window.open(`/api/projects/${state.activeProjectId}/export`, '_blank');
    });
  }

  const btnAi = document.getElementById('btn-hub-open-ai');
  if (btnAi) {
    btnAi.addEventListener('click', () => {
      openAiChatDrawer();
    });
  }

  const btnAiPath = document.getElementById('btn-hub-ai-path');
  if (btnAiPath) {
    btnAiPath.addEventListener('click', () => {
      openAiChatDrawer();
      const projName = state.activeProject?.name || 'Active Project';
      const projPath = document.getElementById('hub-project-path')?.textContent?.trim() || 'data/projects/';
      const prompt = `Analyze project "${projName}" (Storage path: ${projPath}). Review our creative directives, production parts, characters, and assets. Provide strategic recommendations for what to develop next.`;
      appendAiMessage('user', prompt);
      sendAiChat(prompt);
    });
  }

  // 5 Category Directive Cards Navigation
  document.querySelectorAll('.hub-directive-card').forEach((card) => {
    card.addEventListener('click', () => {
      const target = card.dataset.goto || card.dataset.targetView;
      if (target) {
        if (target === 'parts') {
          const s = document.getElementById('filter-parts-search');
          if (s) s.value = '';
          const t = document.getElementById('filter-parts-type');
          if (t) t.value = '';
          const st = document.getElementById('filter-parts-status');
          if (st) st.value = '';
          const so = document.getElementById('filter-parts-sort');
          if (so) so.value = 'order';
        } else if (target === 'prompts') {
          const s = document.getElementById('filter-prompts-search');
          if (s) s.value = '';
          const c = document.getElementById('filter-prompts-category');
          if (c) c.value = '';
          const ch = document.getElementById('filter-prompts-character');
          if (ch) ch.value = '';
          const so = document.getElementById('filter-prompts-sort');
          if (so) so.value = 'recent';
          const fav = document.getElementById('filter-prompts-fav');
          if (fav) fav.classList.remove('active');
        } else if (target === 'characters') {
          const s = document.getElementById('filter-characters-search');
          if (s) s.value = '';
          const so = document.getElementById('filter-characters-sort');
          if (so) so.value = 'name';
        } else if (target === 'links') {
          const s = document.getElementById('filter-links-search');
          if (s) s.value = '';
          const p = document.getElementById('filter-links-platform');
          if (p) p.value = '';
          const so = document.getElementById('filter-links-sort');
          if (so) so.value = 'recent';
        } else if (target === 'boards') {
          const s = document.getElementById('filter-boards-search');
          if (s) s.value = '';
          const st = document.getElementById('filter-boards-style');
          if (st) st.value = '';
          const so = document.getElementById('filter-boards-sort');
          if (so) so.value = 'updated';
          const bl = document.getElementById('boards-list-container');
          if (bl) bl.style.display = 'block';
          const cc = document.getElementById('canvas-container');
          if (cc) cc.style.display = 'none';
        }
        switchView(target);
      }
    });
  });

  const sortSelect = document.getElementById('hub-activity-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderProjectActivityTimeline();
    });
  }
}

async function renderProjectHub() {
  const pid = parseInt(state.activeProjectId, 10);

  // Ensure state.activeProject matches state.activeProjectId
  if (!state.activeProject || Number(state.activeProject.id) !== pid) {
    state.activeProject = state.projects.find((p) => Number(p.id) === pid) || null;
  }

  // Always fetch fresh project details if we have an ID
  if (!isNaN(pid) && pid > 0) {
    try {
      const res = await fetch(`/api/projects/${pid}`);
      if (res.ok) {
        state.activeProject = await res.json();
        const pIdx = state.projects.findIndex((p) => Number(p.id) === pid);
        if (pIdx !== -1) {
          state.projects[pIdx] = state.activeProject;
        } else {
          state.projects.push(state.activeProject);
        }
      }
    } catch (err) {
      console.error('Failed to load active project for hub', err);
    }
  }

  // Fallback to first available project if none active
  if (!state.activeProject && state.projects.length > 0) {
    state.activeProject = state.projects[0];
    state.activeProjectId = state.activeProject.id;
    localStorage.setItem('atelier_active_project_id', state.activeProjectId.toString());
  }

  const p = state.activeProject;
  if (!p) {
    const nameEl = document.getElementById('hub-project-name');
    if (nameEl) nameEl.textContent = 'No Project Selected';
    const descEl = document.getElementById('hub-project-desc');
    if (descEl) descEl.textContent = 'Please select or create a project workspace to get started.';
    const pathEl = document.getElementById('hub-project-path');
    if (pathEl) pathEl.textContent = '-';
    const actList = document.getElementById('hub-activity-list');
    if (actList) actList.innerHTML = '<div class="activity-empty"><i class="fa-solid fa-folder-open"></i> No project selected. Create or select a project to view activity.</div>';
    return;
  }

  const nameEl = document.getElementById('hub-project-name');
  if (nameEl) nameEl.textContent = p.name || 'Untitled Project';

  const statusEl = document.getElementById('hub-project-status');
  if (statusEl) {
    statusEl.textContent = p.status || 'Draft';
    statusEl.className = `badge hub-status-pill ${getStatusBadgeClass(p.status)}`;
    statusEl.title = 'Click to cycle status: Draft -> In Progress -> Ready -> Done';
  }

  const dotEl = document.getElementById('hub-project-dot');
  if (dotEl) {
    dotEl.style.backgroundColor = getStatusDotColor(p.status);
  }

  const descEl = document.getElementById('hub-project-desc');
  if (descEl) descEl.textContent = p.description || 'Workspace overview and directives hub';

  const folderEl = document.getElementById('hub-project-path') || document.getElementById('hub-folder-name');
  if (folderEl) folderEl.textContent = p.folder_path || `data/projects/${p.id}/`;

  // Progress Bar
  const progressText = document.getElementById('hub-progress-text');
  const progressFill = document.getElementById('hub-progress-fill');
  const percent = p.progress_percent != null ? p.progress_percent : 0;
  const completedParts = p.completed_parts_count != null ? p.completed_parts_count : 0;
  const totalParts = p.parts_count != null ? p.parts_count : (state.parts ? state.parts.length : 0);
  if (progressText) {
    progressText.textContent = `${percent}% Complete (${completedParts}/${totalParts} Scenes Done)`;
  }
  if (progressFill) progressFill.style.width = `${percent}%`;

  // Directive Counts - safe against null values
  const countParts = document.getElementById('hub-count-parts');
  if (countParts) countParts.textContent = p.parts_count != null ? p.parts_count : (state.parts?.length || 0);
  const countPrompts = document.getElementById('hub-count-prompts');
  if (countPrompts) countPrompts.textContent = p.prompts_count != null ? p.prompts_count : (state.prompts?.length || 0);
  const countChars = document.getElementById('hub-count-characters');
  if (countChars) countChars.textContent = p.characters_count != null ? p.characters_count : (state.characters?.length || 0);
  const countLinks = document.getElementById('hub-count-links');
  if (countLinks) countLinks.textContent = p.links_count != null ? p.links_count : (state.links?.length || 0);
  const countBoards = document.getElementById('hub-count-boards');
  if (countBoards) countBoards.textContent = p.boards_count != null ? p.boards_count : (state.boards?.length || 0);

  // Load Activity Timeline
  loadProjectActivity();
}

async function cycleProjectStatus() {
  if (!state.activeProject) return;
  const cycle = ['Draft', 'In Progress', 'Ready', 'Done'];
  const current = state.activeProject.status || 'Draft';
  const idx = cycle.indexOf(current);
  const nextStatus = cycle[(idx + 1) % cycle.length];

  try {
    const res = await fetch(`/api/projects/${state.activeProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.activeProject.name,
        description: state.activeProject.description,
        status: nextStatus,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    state.activeProject = updated;
    const pIdx = state.projects.findIndex((p) => p.id === updated.id);
    if (pIdx !== -1) state.projects[pIdx] = updated;

    updateProjectSwitcherUI();
    renderProjectHub();
    showToast(`Project status changed to "${nextStatus}"`);
  } catch (err) {
    console.error('Failed to cycle status', err);
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function loadProjectActivity() {
  if (!state.activeProjectId) {
    const listEl = document.getElementById('hub-activity-list');
    if (listEl) listEl.innerHTML = '<div class="activity-empty"><i class="fa-solid fa-clock-rotate-left"></i> No active project selected.</div>';
    return;
  }
  const listEl = document.getElementById('hub-activity-list');
  if (listEl) listEl.innerHTML = '<div class="activity-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading recent activity...</div>';

  try {
    const res = await fetch(`/api/projects/${state.activeProjectId}/activity`);
    if (!res.ok) throw new Error(await res.text());
    projectActivityData = await res.json();
    renderProjectActivityTimeline();
  } catch (err) {
    console.error('Failed to load project activity', err);
    if (listEl) listEl.innerHTML = '<div class="activity-empty"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load activity feed.</div>';
  }
}

function renderProjectActivityTimeline() {
  const listEl = document.getElementById('hub-activity-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!projectActivityData || projectActivityData.length === 0) {
    listEl.innerHTML = '<div class="activity-empty"><i class="fa-solid fa-clock-rotate-left"></i> No recorded activity for this project yet. Create parts, prompts, or characters to see updates here.</div>';
    return;
  }

  const sortBy = document.getElementById('hub-activity-sort')?.value || 'recent';
  let sorted = [...projectActivityData];
  if (sortBy === 'type') {
    sorted.sort((a, b) => (a.entity_type || '').localeCompare(b.entity_type || ''));
  } else if (sortBy === 'title') {
    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else {
    sorted.sort((a, b) => {
      const timeA = new Date((a.timestamp || '').replace(' ', 'T')).getTime() || 0;
      const timeB = new Date((b.timestamp || '').replace(' ', 'T')).getTime() || 0;
      return timeB - timeA;
    });
  }

  sorted.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'activity-item';

    let iconClass = 'fa-cube';
    if (item.entity_type === 'part') iconClass = 'fa-film';
    else if (item.entity_type === 'prompt') iconClass = 'fa-feather-pointed';
    else if (item.entity_type === 'character') iconClass = 'fa-users';
    else if (item.entity_type === 'link') iconClass = 'fa-link';
    else if (item.entity_type === 'board') iconClass = 'fa-chalkboard';
    else if (item.entity_type === 'attachment') iconClass = 'fa-file';
    else if (item.entity_type === 'project') iconClass = 'fa-folder-open';

    const iconEl = document.createElement('div');
    iconEl.className = 'activity-icon';
    iconEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    row.appendChild(iconEl);

    const details = document.createElement('div');
    details.className = 'activity-details';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('span');
    titleEl.className = 'activity-entity-title';
    titleEl.textContent = item.title || 'Untitled';
    titleWrap.appendChild(titleEl);

    const typeSpan = document.createElement('span');
    typeSpan.className = 'badge badge-sm';
    typeSpan.style.marginLeft = '0.5rem';
    typeSpan.textContent = item.entity_type;
    titleWrap.appendChild(typeSpan);
    details.appendChild(titleWrap);

    if (item.details) {
      const detailEl = document.createElement('p');
      detailEl.className = 'activity-detail-text';
      detailEl.style.fontSize = '0.78rem';
      detailEl.style.color = 'var(--text-secondary)';
      detailEl.style.marginTop = '0.2rem';
      detailEl.textContent = item.details;
      details.appendChild(detailEl);
    }

    const metaWrap = document.createElement('div');
    metaWrap.style.display = 'flex';
    metaWrap.style.alignItems = 'center';
    metaWrap.style.gap = '0.5rem';
    metaWrap.style.marginTop = '0.25rem';

    const tag = document.createElement('span');
    const act = (item.action || 'updated').toLowerCase();
    tag.className = `activity-action-tag activity-action-${act}`;
    tag.textContent = act;
    metaWrap.appendChild(tag);

    const time = document.createElement('span');
    time.className = 'activity-timestamp';
    const raw = item.timestamp || '';
    const parts = raw.split(/[T ]/);
    const d = parts[0] || '';
    const t = (parts[1] || '').substring(0, 5);
    time.textContent = t ? `${d} ${t}` : d;
    metaWrap.appendChild(time);

    details.appendChild(metaWrap);
    row.appendChild(details);

    row.style.cursor = 'pointer';
    row.title = `Click to navigate to ${item.entity_type}`;
    row.addEventListener('click', () => {
      const viewMap = {
        part: 'parts',
        prompt: 'prompts',
        character: 'characters',
        link: 'links',
        board: 'boards',
        project: 'projects',
      };
      const targetView = viewMap[item.entity_type];
      if (targetView) switchView(targetView);
    });

    listEl.appendChild(row);
  });
}

// ===================================================
// PHASE 10: ADVANCED SETTINGS & AMBIENT ANIMATION
// ===================================================

async function loadSettingsUI() {
  try {
    const res = await fetch('/api/settings');
    let settings = {};
    if (res.ok) {
      settings = await res.json();
    }

    // AI Settings
    const providerSelect = document.getElementById('setting-ai-provider');
    if (providerSelect) providerSelect.value = settings.ai_provider || localStorage.getItem('atelier_ai_provider') || 'openrouter';

    const keyInput = document.getElementById('setting-ai-key');
    if (keyInput) keyInput.value = settings.ai_api_key || localStorage.getItem('atelier_ai_key') || '';

    const modelInput = document.getElementById('setting-ai-model');
    if (modelInput) modelInput.value = settings.ai_model || localStorage.getItem('atelier_ai_model') || 'anthropic/claude-3.5-sonnet';

    const baseUrlInput = document.getElementById('setting-ai-base-url');
    if (baseUrlInput) baseUrlInput.value = settings.ai_base_url || localStorage.getItem('atelier_ai_base_url') || '';

    const tempInput = document.getElementById('setting-ai-temperature');
    if (tempInput) tempInput.value = settings.ai_temperature || localStorage.getItem('atelier_ai_temperature') || '0.7';

    const maxTokensInput = document.getElementById('setting-ai-max-tokens');
    if (maxTokensInput) maxTokensInput.value = settings.ai_max_tokens || localStorage.getItem('atelier_ai_max_tokens') || '2048';

    const sysPromptInput = document.getElementById('setting-ai-system-prompt');
    if (sysPromptInput) sysPromptInput.value = settings.ai_system_prompt || localStorage.getItem('atelier_ai_system_prompt') || '';

    // Layout Mode
    const layoutMode = settings.layout_mode || localStorage.getItem('atelier_layout_mode') || 'sidebar';
    applyLayoutMode(layoutMode, false);

    // Chamfered Edges
    const chamfered = settings.chamfered_edges === 'true' || localStorage.getItem('atelier_chamfered') === 'true';
    applyChamferedMode(chamfered, false);

    // Ambient Background
    const ambientActive = settings.ambient_active === 'true' || localStorage.getItem('atelier_ambient_active') === 'true';
    const ambientColor = settings.ambient_color || localStorage.getItem('atelier_ambient_color') || '#dc2626';
    const ambientSpeed = settings.ambient_speed || localStorage.getItem('atelier_ambient_speed') || '8s';
    const ambientIntensity = settings.ambient_intensity || localStorage.getItem('atelier_ambient_intensity') || '0.15';
    applyAmbientSettings(ambientActive, ambientColor, ambientSpeed, ambientIntensity, false);

    // Theme Selector Grid sync
    const currentTheme = localStorage.getItem('atelier_theme') || 'dark';
    document.querySelectorAll('.theme-card-option').forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.theme === currentTheme);
    });

    updateAiDrawerProviderBadge();
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

function initSettingsView() {
  const providerSelect = document.getElementById('setting-ai-provider');
  const modelInput = document.getElementById('setting-ai-model');
  const baseUrlInput = document.getElementById('setting-ai-base-url');

  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const p = providerSelect.value;
      if (p === 'openrouter') {
        if (modelInput) modelInput.placeholder = 'anthropic/claude-3.5-sonnet';
        if (baseUrlInput) baseUrlInput.placeholder = 'https://openrouter.ai/api/v1';
      } else if (p === 'openai') {
        if (modelInput) modelInput.placeholder = 'gpt-4o';
        if (baseUrlInput) baseUrlInput.placeholder = 'https://api.openai.com/v1';
      } else if (p === 'anthropic') {
        if (modelInput) modelInput.placeholder = 'claude-3-5-sonnet-20241022';
        if (baseUrlInput) baseUrlInput.placeholder = 'https://api.anthropic.com/v1';
      } else if (p === 'gemini') {
        if (modelInput) modelInput.placeholder = 'gemini-1.5-flash';
        if (baseUrlInput) baseUrlInput.placeholder = 'https://generativelanguage.googleapis.com/v1beta';
      } else if (p === 'groq') {
        if (modelInput) modelInput.placeholder = 'llama-3.3-70b-versatile';
        if (baseUrlInput) baseUrlInput.placeholder = 'https://api.groq.com/openai/v1';
      } else if (p === 'ollama') {
        if (modelInput) modelInput.placeholder = 'llama3.2';
        if (baseUrlInput) baseUrlInput.placeholder = 'http://localhost:11434';
      }
    });
  }

  // Toggle Key Visibility
  const toggleKeyBtn = document.getElementById('btn-toggle-ai-key');
  const iconToggleKey = document.getElementById('icon-toggle-ai-key');
  const keyInput = document.getElementById('setting-ai-key');
  if (toggleKeyBtn && keyInput && iconToggleKey) {
    toggleKeyBtn.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      iconToggleKey.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });
  }

  // Save AI Settings Form
  const aiForm = document.getElementById('form-ai-settings');
  if (aiForm) {
    aiForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provider = providerSelect?.value || 'openrouter';
      const key = keyInput?.value.trim() || '';
      const model = modelInput?.value.trim() || '';
      const baseUrl = baseUrlInput?.value.trim() || '';
      const temp = document.getElementById('setting-ai-temperature')?.value.trim() || '';
      const maxTokens = document.getElementById('setting-ai-max-tokens')?.value.trim() || '';
      const sysPrompt = document.getElementById('setting-ai-system-prompt')?.value.trim() || '';

      localStorage.setItem('atelier_ai_provider', provider);
      localStorage.setItem('atelier_ai_key', key);
      localStorage.setItem('atelier_ai_model', model);
      localStorage.setItem('atelier_ai_base_url', baseUrl);
      localStorage.setItem('atelier_ai_temperature', temp);
      localStorage.setItem('atelier_ai_max_tokens', maxTokens);
      localStorage.setItem('atelier_ai_system_prompt', sysPrompt);

      try {
        await fetch('/api/settings/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              ai_provider: provider,
              ai_api_key: key,
              ai_model: model,
              ai_base_url: baseUrl,
              ai_temperature: temp,
              ai_max_tokens: maxTokens,
              ai_system_prompt: sysPrompt,
            },
          }),
        });
        showToast('AI Settings saved to local database');
        updateAiDrawerProviderBadge();
      } catch (err) {
        console.error('Failed to save settings', err);
        showToast('AI Settings saved locally');
      }
    });
  }

  // Test Connection
  const testBtn = document.getElementById('btn-test-ai-connection');
  const testStatus = document.getElementById('ai-test-status');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      if (!testStatus) return;
      testStatus.style.display = 'inline-flex';
      testStatus.className = 'connection-status-pill';
      testStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing connection...';

      const provider = providerSelect?.value || 'openrouter';
      const key = keyInput?.value.trim() || '';
      const model = modelInput?.value.trim() || '';
      const baseUrl = baseUrlInput?.value.trim() || '';
      const temp = document.getElementById('setting-ai-temperature')?.value.trim() || '';
      const maxTokens = document.getElementById('setting-ai-max-tokens')?.value.trim() || '';

      const testPayload = {
        provider,
        api_key: key,
        model,
        base_url: baseUrl,
        test_connection: true,
        messages: [{ role: 'user', content: 'Ping. Reply with "pong".' }],
      };
      if (temp) testPayload.temperature = parseFloat(temp);
      if (maxTokens) testPayload.max_tokens = parseInt(maxTokens, 10);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        testStatus.className = 'connection-status-pill success';
        testStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected (${provider}): ${data.model || 'OK'}`;
      } catch (err) {
        testStatus.className = 'connection-status-pill error';
        testStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message}`;
      }
    });
  }

  // Layout Mode Buttons
  const btnSidebar = document.getElementById('btn-layout-sidebar');
  const btnDock = document.getElementById('btn-layout-dock');
  if (btnSidebar && btnDock) {
    btnSidebar.addEventListener('click', () => applyLayoutMode('sidebar', true));
    btnDock.addEventListener('click', () => applyLayoutMode('dock', true));
  }

  // Chamfered Edges Toggle
  const chamferCheckbox = document.getElementById('setting-chamfered-edges');
  if (chamferCheckbox) {
    chamferCheckbox.addEventListener('change', (e) => {
      applyChamferedMode(e.target.checked, true);
    });
  }

  // Ambient Animation Controls
  const ambientCheckbox = document.getElementById('setting-ambient-active');
  const ambientCustomHex = document.getElementById('setting-ambient-custom-hex');
  const ambientSpeed = document.getElementById('setting-ambient-speed');
  const ambientIntensity = document.getElementById('setting-ambient-intensity');
  const ambientIntensityVal = document.getElementById('ambient-intensity-val');

  if (ambientCheckbox) {
    ambientCheckbox.addEventListener('change', (e) => {
      applyAmbientSettings(e.target.checked, ambientCustomHex?.value, ambientSpeed?.value, ambientIntensity?.value, true);
    });
  }

  document.querySelectorAll('.ambient-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ambient-preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const color = btn.dataset.color;
      if (ambientCustomHex) ambientCustomHex.value = color;
      applyAmbientSettings(ambientCheckbox?.checked, color, ambientSpeed?.value, ambientIntensity?.value, true);
    });
  });

  if (ambientCustomHex) {
    ambientCustomHex.addEventListener('input', (e) => {
      applyAmbientSettings(ambientCheckbox?.checked, e.target.value, ambientSpeed?.value, ambientIntensity?.value, true);
    });
  }

  if (ambientSpeed) {
    ambientSpeed.addEventListener('change', (e) => {
      applyAmbientSettings(ambientCheckbox?.checked, ambientCustomHex?.value, e.target.value, ambientIntensity?.value, true);
    });
  }

  if (ambientIntensity) {
    ambientIntensity.addEventListener('input', (e) => {
      const val = e.target.value;
      if (ambientIntensityVal) ambientIntensityVal.textContent = `${Math.round(val * 100)}%`;
      applyAmbientSettings(ambientCheckbox?.checked, ambientCustomHex?.value, ambientSpeed?.value, val, true);
    });
  }

  // Themes Grid Option Click
  document.querySelectorAll('.theme-card-option').forEach((card) => {
    card.addEventListener('click', () => {
      const theme = card.dataset.theme;
      applyTheme(theme, true);
      document.querySelectorAll('.theme-card-option').forEach((c) => c.classList.toggle('active', c.dataset.theme === theme));
    });
  });
}

function applyLayoutMode(mode, save = false) {
  const isDock = mode === 'dock';
  document.body.classList.toggle('layout-dock-mode', isDock);
  document.getElementById('btn-layout-sidebar')?.classList.toggle('active', !isDock);
  document.getElementById('btn-layout-dock')?.classList.toggle('active', isDock);

  if (save) {
    localStorage.setItem('atelier_layout_mode', mode);
    fetch('/api/settings/layout_mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: mode }),
    }).catch(() => {});
    showToast(isDock ? 'Switched to Bottom Floating Dock layout' : 'Switched to Classic Sidebar layout');
  }
}

function applyChamferedMode(enabled, save = false) {
  document.body.classList.toggle('chamfered-mode', enabled);
  const cb = document.getElementById('setting-chamfered-edges');
  if (cb) cb.checked = enabled;

  if (save) {
    localStorage.setItem('atelier_chamfered', enabled ? 'true' : 'false');
    fetch('/api/settings/chamfered_edges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: enabled ? 'true' : 'false' }),
    }).catch(() => {});
    showToast(enabled ? 'Cyberpunk Chamfered Edges enabled' : 'Chamfered Edges disabled');
  }
}

function applyAmbientSettings(active, color, speed, intensity, save = false) {
  const c = color || '#dc2626';
  const s = speed || '8s';
  const i = parseFloat(intensity) || 0.15;

  document.body.classList.toggle('ambient-active', !!active);
  document.documentElement.style.setProperty('--ambient-color', c);
  document.documentElement.style.setProperty('--ambient-speed', s);
  document.documentElement.style.setProperty('--ambient-intensity-high', `${i}`);
  document.documentElement.style.setProperty('--ambient-intensity-low', `${(i * 0.25).toFixed(3)}`);

  const cb = document.getElementById('setting-ambient-active');
  if (cb) cb.checked = !!active;

  const hex = document.getElementById('setting-ambient-custom-hex');
  if (hex) hex.value = c;

  const sp = document.getElementById('setting-ambient-speed');
  if (sp) sp.value = s;

  const it = document.getElementById('setting-ambient-intensity');
  if (it) it.value = i;

  const itVal = document.getElementById('ambient-intensity-val');
  if (itVal) itVal.textContent = `${Math.round(i * 100)}%`;

  if (save) {
    localStorage.setItem('atelier_ambient_active', active ? 'true' : 'false');
    localStorage.setItem('atelier_ambient_color', c);
    localStorage.setItem('atelier_ambient_speed', s);
    localStorage.setItem('atelier_ambient_intensity', `${i}`);

    fetch('/api/settings/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          ambient_active: active ? 'true' : 'false',
          ambient_color: c,
          ambient_speed: s,
          ambient_intensity: `${i}`,
        },
      }),
    }).catch(() => {});
  }
}

// ===================================================
// PHASE 10: BOTTOM DOCK & AI ASSISTANT DRAWER
// ===================================================

function initBottomDock() {
  document.querySelectorAll('#bottom-dock .dock-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  const btnAi = document.getElementById('dock-btn-ai');
  if (btnAi) btnAi.addEventListener('click', openAiChatDrawer);

  const expandToggle = document.getElementById('btn-dock-expand');
  const expandDrawer = document.getElementById('dock-expand-drawer');
  const chevron = document.getElementById('dock-expand-chevron');
  const closeDrawerBtn = document.getElementById('btn-close-dock-drawer');

  if (expandToggle && expandDrawer) {
    expandToggle.addEventListener('click', () => {
      const isOpen = expandDrawer.classList.toggle('open');
      if (chevron) chevron.className = isOpen ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
      if (isOpen) updateDockDrawerContent();
    });
  }

  if (closeDrawerBtn && expandDrawer) {
    closeDrawerBtn.addEventListener('click', () => {
      expandDrawer.classList.remove('open');
      if (chevron) chevron.className = 'fa-solid fa-chevron-up';
    });
  }

  document.getElementById('dock-btn-open-hub')?.addEventListener('click', () => {
    expandDrawer?.classList.remove('open');
    switchView('project-hub');
  });

  document.getElementById('dock-btn-quick-new-part')?.addEventListener('click', () => {
    expandDrawer?.classList.remove('open');
    openPartModal();
  });

  document.getElementById('dock-btn-quick-new-prompt')?.addEventListener('click', () => {
    expandDrawer?.classList.remove('open');
    openPromptModal();
  });

  document.getElementById('dock-btn-quick-open-folder')?.addEventListener('click', () => {
    if (state.activeProjectId) openProjectFolder(state.activeProjectId);
  });
}

function updateDockDrawerContent() {
  const p = state.activeProject;
  if (!p) return;

  const nameEl = document.getElementById('dock-drawer-project-name');
  if (nameEl) nameEl.textContent = p.name;

  const statusEl = document.getElementById('dock-drawer-project-status');
  if (statusEl) {
    statusEl.textContent = p.status || 'Draft';
    statusEl.className = `badge badge-sm ${getStatusBadgeClass(p.status)}`;
  }

  const chipPa = document.getElementById('dock-chip-parts');
  if (chipPa) chipPa.innerHTML = `<i class="fa-solid fa-film"></i> ${state.parts.length} Parts`;

  const chipPr = document.getElementById('dock-chip-prompts');
  if (chipPr) chipPr.innerHTML = `<i class="fa-solid fa-feather-pointed"></i> ${state.prompts.length} Prompts`;

  const chipCh = document.getElementById('dock-chip-characters');
  if (chipCh) chipCh.innerHTML = `<i class="fa-solid fa-users"></i> ${state.characters.length} Cast`;

  const chipLi = document.getElementById('dock-chip-links');
  if (chipLi) chipLi.innerHTML = `<i class="fa-solid fa-link"></i> ${state.links.length} Refs`;

  const chipBo = document.getElementById('dock-chip-boards');
  if (chipBo) chipBo.innerHTML = `<i class="fa-solid fa-chalkboard"></i> ${state.boards.length} Boards`;
}

function initAiChatDrawer() {
  const drawer = document.getElementById('ai-chat-drawer');
  const closeBtn = document.getElementById('btn-close-ai-drawer');
  const clearBtn = document.getElementById('btn-clear-ai-chat');
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const navAiTrigger = document.getElementById('nav-ai-assistant-trigger');
  const btnSidebarAi = document.getElementById('btn-sidebar-ai');

  if (navAiTrigger) {
    navAiTrigger.addEventListener('click', openAiChatDrawer);
  }
  if (btnSidebarAi) {
    btnSidebarAi.addEventListener('click', openAiChatDrawer);
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', closeAiChatDrawer);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const msgs = document.getElementById('ai-chat-messages');
      if (msgs) {
        msgs.innerHTML = `
          <div class="ai-message assistant intro">
            <div class="ai-message-bubble">
              <p><strong>Conversation cleared.</strong> What shall we brainstorm or create next for <em>${state.activeProject ? state.activeProject.name : 'this project'}</em>?</p>
              <div class="ai-quick-suggestions">
                <button type="button" class="ai-suggestion-chip" data-prompt="Brainstorm 3 unique scene ideas for this project"><i class="fa-solid fa-film"></i> 3 Scene Ideas</button>
                <button type="button" class="ai-suggestion-chip" data-prompt="Generate a compelling character persona with visual traits and lore"><i class="fa-solid fa-users"></i> Character Persona</button>
                <button type="button" class="ai-suggestion-chip" data-prompt="Write a detailed cinematic Midjourney v6 lighting prompt"><i class="fa-solid fa-feather-pointed"></i> Cinematic Prompt</button>
              </div>
            </div>
          </div>
        `;
        wireAiQuickSuggestions();
      }
    });
  }

  wireAiQuickSuggestions();

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form?.dispatchEvent(new Event('submit'));
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      appendAiMessage('user', text);
      await sendAiChat(text);
    });
  }
}

function wireAiQuickSuggestions() {
  document.querySelectorAll('.ai-suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.prompt;
      if (p) {
        appendAiMessage('user', p);
        sendAiChat(p);
      }
    });
  });
}

function openAiChatDrawer() {
  const drawer = document.getElementById('ai-chat-drawer');
  if (drawer) {
    drawer.classList.add('open');
    updateAiDrawerProjectContext();
    updateAiDrawerProviderBadge();
    document.getElementById('ai-chat-input')?.focus();
  }
}

function closeAiChatDrawer() {
  document.getElementById('ai-chat-drawer')?.classList.remove('open');
}

function updateAiDrawerProjectContext() {
  const nameEl = document.getElementById('ai-context-project-name');
  if (nameEl) nameEl.textContent = state.activeProject ? state.activeProject.name : 'No Active Project';
}

function updateAiDrawerProviderBadge() {
  const badge = document.getElementById('ai-provider-badge');
  if (badge) {
    const provider = localStorage.getItem('atelier_ai_provider') || 'openrouter';
    badge.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '-9999px';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed', err);
  } finally {
    document.body.removeChild(textArea);
  }
  return success;
}

let lastAiUserPrompt = '';

function appendAiMessage(role, content, actions = false) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = `ai-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'ai-message-bubble';

  if (role === 'assistant') {
    let escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Format markdown elements safely
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    bubble.innerHTML = `<p>${escaped}</p>`;

    if (actions) {
      const actionRow = document.createElement('div');
      actionRow.className = 'ai-message-actions';

      const btnCopy = document.createElement('button');
      btnCopy.type = 'button';
      btnCopy.className = 'ai-action-btn';
      btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
      btnCopy.title = 'Copy response text to clipboard';
      btnCopy.addEventListener('click', async () => {
        const ok = await copyToClipboard(content);
        if (ok) {
          btnCopy.classList.add('copied');
          btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(() => {
            btnCopy.classList.remove('copied');
            btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
          }, 2000);
        } else {
          showToast('Failed to copy to clipboard', 'error');
        }
      });
      actionRow.appendChild(btnCopy);

      const btnSavePrompt = document.createElement('button');
      btnSavePrompt.type = 'button';
      btnSavePrompt.className = 'ai-action-btn';
      btnSavePrompt.innerHTML = '<i class="fa-solid fa-feather-pointed"></i> Save as Prompt';
      btnSavePrompt.addEventListener('click', () => {
        openPromptModal({
          title: 'AI Generated Prompt',
          body: content,
        });
      });
      actionRow.appendChild(btnSavePrompt);

      const btnSaveChar = document.createElement('button');
      btnSaveChar.type = 'button';
      btnSaveChar.className = 'ai-action-btn';
      btnSaveChar.innerHTML = '<i class="fa-solid fa-users"></i> Save as Character';
      btnSaveChar.addEventListener('click', () => {
        openCharacterModal({
          name: 'AI Character',
          description: content.substring(0, 200),
          traits: content,
        });
      });
      actionRow.appendChild(btnSaveChar);

      const btnSavePart = document.createElement('button');
      btnSavePart.type = 'button';
      btnSavePart.className = 'ai-action-btn';
      btnSavePart.innerHTML = '<i class="fa-solid fa-film"></i> Add Scene Part';
      btnSavePart.addEventListener('click', () => {
        openPartModal({
          title: 'AI Draft Scene',
          notes: content,
          part_type: 'scene',
        });
      });
      actionRow.appendChild(btnSavePart);

      const btnAddToProj = document.createElement('button');
      btnAddToProj.type = 'button';
      btnAddToProj.className = 'ai-action-btn';
      btnAddToProj.innerHTML = '<i class="fa-solid fa-folder-plus"></i> Add to Project';
      btnAddToProj.title = 'Append content to active project';
      btnAddToProj.addEventListener('click', () => {
        if (state.activeProject) {
          openProjectModal(state.activeProject);
          const descEl = document.getElementById('project-description');
          if (descEl) {
            descEl.value = descEl.value ? descEl.value + '\n\n' + content : content;
          }
          showToast(`Appended to "${state.activeProject.name}" description`);
        } else {
          showToast('No active project selected', 'error');
        }
      });
      actionRow.appendChild(btnAddToProj);

      const btnRegenerate = document.createElement('button');
      btnRegenerate.type = 'button';
      btnRegenerate.className = 'ai-action-btn';
      btnRegenerate.innerHTML = '<i class="fa-solid fa-rotate"></i> Regenerate';
      btnRegenerate.title = 'Regenerate response for last prompt';
      btnRegenerate.addEventListener('click', () => {
        if (lastAiUserPrompt) {
          appendAiMessage('user', lastAiUserPrompt);
          sendAiChat(lastAiUserPrompt);
        } else {
          showToast('No previous user prompt to regenerate', 'warning');
        }
      });
      actionRow.appendChild(btnRegenerate);

      bubble.appendChild(actionRow);
    }
  } else {
    bubble.textContent = content;
  }

  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

async function sendAiChat(userText) {
  lastAiUserPrompt = userText;
  const container = document.getElementById('ai-chat-messages');
  const typingMsg = document.createElement('div');
  typingMsg.className = 'ai-message assistant';
  typingMsg.id = 'ai-typing-indicator';
  typingMsg.innerHTML = '<div class="ai-message-bubble"><i class="fa-solid fa-spinner fa-spin"></i> Thinking...</div>';
  container.appendChild(typingMsg);
  container.scrollTop = container.scrollHeight;

  const provider = localStorage.getItem('atelier_ai_provider') || 'openrouter';
  const apiKey = localStorage.getItem('atelier_ai_key') || '';
  const model = localStorage.getItem('atelier_ai_model') || '';
  const baseUrl = localStorage.getItem('atelier_ai_base_url') || '';
  const tempStr = localStorage.getItem('atelier_ai_temperature');
  const temperature = tempStr ? parseFloat(tempStr) : undefined;
  const maxTokensStr = localStorage.getItem('atelier_ai_max_tokens');
  const max_tokens = maxTokensStr ? parseInt(maxTokensStr, 10) : undefined;
  const customDirective = localStorage.getItem('atelier_ai_system_prompt') || '';
  const customContext = customDirective ? ` Custom Directives: ${customDirective}.` : '';

  const projectContext = state.activeProject
    ? `Active Project: "${state.activeProject.name}" (Status: ${state.activeProject.status}, Description: ${state.activeProject.description || 'None'}).`
    : '';

  const messages = [
    {
      role: 'system',
      content: `You are Atelier AI, a creative studio assistant for social media management, cinematic production, prompts, and visual character lore. ${projectContext}${customContext} Keep responses focused, structured, and actionable.`,
    },
    {
      role: 'user',
      content: userText,
    },
  ];

  const payload = {
    provider,
    api_key: apiKey,
    model,
    base_url: baseUrl,
    messages,
  };
  if (temperature !== undefined && !isNaN(temperature)) payload.temperature = temperature;
  if (max_tokens !== undefined && !isNaN(max_tokens)) payload.max_tokens = max_tokens;

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    typingMsg.remove();

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }

    const data = await res.json();
    appendAiMessage('assistant', data.content, true);
  } catch (err) {
    typingMsg.remove();
    appendAiMessage('assistant', `Failed to generate AI response: ${err.message}. Check your provider settings in Settings tab.`);
  }
}

