// ===================================================
// ATELIER HYBRID CORKBOARD & VECTOR DIAGRAMMING ENGINE
// ===================================================

class AtelierCanvas {
  constructor() {
    this.board = null;
    this.items = [];
    this.drawingData = []; // [{ type: 'stroke'|'rect'|'ellipse'|'connector'|'text', ... }]
    this.undoStack = [];
    this.redoStack = [];

    // Camera state
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;

    // Active tool state
    this.currentTool = 'select'; // 'select' | 'sticky' | 'pen' | 'rect' | 'ellipse' | 'connector' | 'text'
    this.currentColor = '#3b82f6';
    this.currentStrokeWidth = 2;
    this.selectedCardId = null;
    this.selectedElement = null; // for SVG elements

    // Interaction tracking
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.isSpacePressed = false;

    this.isDrawing = false;
    this.activeStrokePoints = [];
    this.activeShapeStart = null;
    this.activeConnector = null;

    this.isDraggingCard = false;
    this.draggedCard = null;
    this.dragOffset = { x: 0, y: 0 };

    this.isResizingCard = false;
    this.resizingCard = null;
    this.resizeStart = { x: 0, y: 0, w: 0, h: 0 };

    // Debounce timers
    this.cameraSaveTimer = null;
    this.drawingSaveTimer = null;

    this.initDOMElements();
    this.initEventListeners();
  }

  initDOMElements() {
    this.viewport = document.getElementById('canvas-stage-wrapper');
    this.world = document.getElementById('canvas-world');
    this.svg = document.getElementById('canvas-svg');
    this.cardsContainer = document.getElementById('canvas-cards');

    this.svgConnectorsGroup = document.getElementById('svg-connectors-group');
    this.svgShapesGroup = document.getElementById('svg-shapes-group');
    this.svgDrawingGroup = document.getElementById('svg-drawing-group');
    this.svgTextGroup = document.getElementById('svg-text-group');
    this.svgActiveStrokeGroup = document.getElementById('svg-active-stroke-group');

    this.zoomIndicator = document.getElementById('zoom-indicator');
    this.boardTitle = document.getElementById('canvas-board-name');
    this.backdropSelect = document.getElementById('canvas-style-select');
    this.themeSelect = document.getElementById('board-theme-select');
  }

  initEventListeners() {
    // Keyboard events
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));

    // Pointer & Drag events on canvas viewport
    if (this.viewport) {
      this.viewport.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
      window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
      window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
      this.viewport.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

      this.viewport.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      this.viewport.addEventListener('drop', (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data.entity_type && data.entity_id) {
              const worldPos = this.screenToWorld(e.clientX, e.clientY);
              this.pinEntityAt(data.entity_type, data.entity_id, worldPos.x - 120, worldPos.y - 80);
            }
          } catch (err) {
            console.error('Failed to parse dropped item', err);
          }
        }
      });
    }

    // Canvas tools buttons
    document.querySelectorAll('#canvas-tools .tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.setTool(tool);
      });
    });

    // Color dots
    document.querySelectorAll('#canvas-palette .color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#canvas-palette .color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        this.currentColor = dot.dataset.color;
      });
    });

    // Stroke widths
    document.querySelectorAll('.stroke-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stroke-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentStrokeWidth = parseInt(btn.dataset.width, 10);
      });
    });

    // Undo / Redo / Delete
    document.getElementById('btn-canvas-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-canvas-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-canvas-delete-selected')?.addEventListener('click', () => this.deleteSelected());

    // Zoom controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.adjustZoom(1.2));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.adjustZoom(1 / 1.2));
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => this.resetZoom());
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.fitAll());

    // Backdrop and theme selectors
    if (this.backdropSelect) {
      this.backdropSelect.addEventListener('change', (e) => {
        this.setBackdrop(e.target.value);
        this.saveBoardSettings();
      });
    }

    if (this.themeSelect) {
      this.themeSelect.addEventListener('change', (e) => {
        this.setBoardTheme(e.target.value);
        this.saveBoardSettings();
      });
    }

    // Editable title
    if (this.boardTitle) {
      this.boardTitle.addEventListener('click', () => {
        const newName = prompt('Rename board:', this.board?.name || '');
        if (newName && newName.trim()) {
          this.board.name = newName.trim();
          this.boardTitle.textContent = this.board.name;
          this.saveBoardSettings();
        }
      });
    }
  }

  loadBoard(board, items) {
    this.board = board;
    this.items = items || [];
    this.drawingData = Array.isArray(board.drawing_data) ? board.drawing_data : [];
    this.undoStack = [];
    this.redoStack = [];

    this.panX = board.pan_x || 0;
    this.panY = board.pan_y || 0;
    this.zoom = board.zoom || 1.0;

    if (this.boardTitle) this.boardTitle.textContent = board.name;
    if (this.backdropSelect) this.backdropSelect.value = board.canvas_style || 'dot-grid';
    if (this.themeSelect) this.themeSelect.value = board.theme || 'default';

    this.setBackdrop(board.canvas_style || 'dot-grid');
    this.setBoardTheme(board.theme || 'default');

    this.applyTransform();
    this.renderAll();
  }

  setTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('#canvas-tools .tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    if (tool !== 'select') {
      this.deselectCard();
      this.deselectSvgElement();
    }
  }

  setBackdrop(style) {
    if (!this.viewport) return;
    this.viewport.className = `canvas-stage-wrapper ${style}`;
  }

  setBoardTheme(theme) {
    if (!this.viewport) return;
    if (theme && theme !== 'default') {
      this.viewport.setAttribute('data-theme', theme);
    } else {
      this.viewport.removeAttribute('data-theme');
    }
  }

  // Coordinate Conversion
  screenToWorld(screenX, screenY) {
    const rect = this.viewport.getBoundingClientRect();
    const clientX = screenX - rect.left;
    const clientY = screenY - rect.top;
    return {
      x: (clientX - this.panX) / this.zoom,
      y: (clientY - this.panY) / this.zoom,
    };
  }

  worldToScreen(worldX, worldY) {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: worldX * this.zoom + this.panX + rect.left,
      y: worldY * this.zoom + this.panY + rect.top,
    };
  }

  applyTransform() {
    if (!this.world) return;
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = `${Math.round(this.zoom * 100)}%`;
    }
    this.debounceSaveCamera();
  }

  // Zoom & Pan
  adjustZoom(factor, centerX, centerY) {
    const oldZoom = this.zoom;
    const newZoom = Math.min(Math.max(oldZoom * factor, 0.15), 4.0);

    const rect = this.viewport.getBoundingClientRect();
    const cx = centerX !== undefined ? centerX - rect.left : rect.width / 2;
    const cy = centerY !== undefined ? centerY - rect.top : rect.height / 2;

    this.panX = cx - (cx - this.panX) * (newZoom / oldZoom);
    this.panY = cy - (cy - this.panY) * (newZoom / oldZoom);
    this.zoom = newZoom;

    this.applyTransform();
  }

  resetZoom() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.applyTransform();
  }

  fitAll() {
    if (this.items.length === 0 && this.drawingData.length === 0) {
      this.resetZoom();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const item of this.items) {
      minX = Math.min(minX, item.pos_x);
      minY = Math.min(minY, item.pos_y);
      maxX = Math.max(maxX, item.pos_x + item.width);
      maxY = Math.max(maxY, item.pos_y + item.height);
    }

    for (const elem of this.drawingData) {
      if (elem.points && elem.points.length > 0) {
        for (const pt of elem.points) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
      } else if (elem.x !== undefined) {
        minX = Math.min(minX, elem.x);
        minY = Math.min(minY, elem.y);
        maxX = Math.max(maxX, elem.x + (elem.w || 100));
        maxY = Math.max(maxY, elem.y + (elem.h || 50));
      }
    }

    const pad = 80;
    const contentW = maxX - minX + pad * 2;
    const contentH = maxY - minY + pad * 2;

    const rect = this.viewport.getBoundingClientRect();
    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;

    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);
    this.panX = (rect.width - (maxX + minX) * this.zoom) / 2;
    this.panY = (rect.height - (maxY + minY) * this.zoom) / 2;

    this.applyTransform();
  }

  handleWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.adjustZoom(factor, e.clientX, e.clientY);
    } else {
      // Pan
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.applyTransform();
    }
  }

  handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      this.isSpacePressed = true;
      if (this.viewport) this.viewport.style.cursor = 'grab';
    } else if (e.key === 'v' || e.key === 'V') {
      this.setTool('select');
    } else if (e.key === 'p' || e.key === 'P') {
      this.setTool('pen');
    } else if (e.key === 'r' || e.key === 'R') {
      this.setTool('rect');
    } else if (e.key === 'o' || e.key === 'O') {
      this.setTool('ellipse');
    } else if (e.key === 'c' || e.key === 'C') {
      this.setTool('connector');
    } else if (e.key === 't' || e.key === 'T') {
      this.setTool('text');
    } else if (e.key === 'n' || e.key === 'N') {
      this.setTool('sticky');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Escape') {
      this.setTool('select');
    }
  }

  handleKeyUp(e) {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
      if (this.viewport && !this.isPanning) {
        this.viewport.style.cursor = 'default';
      }
    }
  }

  // Pointer Handling
  handlePointerDown(e) {
    if (e.button === 1 || this.isSpacePressed) {
      // Middle click or space pan
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      if (this.viewport) this.viewport.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return; // Only primary button for drawing/selecting

    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (this.currentTool === 'select') {
      if (!e.target.closest('.board-card') && !e.target.closest('path, rect, ellipse, text')) {
        this.deselectCard();
        this.deselectSvgElement();
      }
    } else if (this.currentTool === 'sticky') {
      this.createStickyAt(worldPos.x, worldPos.y);
      this.setTool('select');
    } else if (this.currentTool === 'pen') {
      this.isDrawing = true;
      this.activeStrokePoints = [worldPos];
      this.renderActiveStroke();
    } else if (this.currentTool === 'rect' || this.currentTool === 'ellipse') {
      this.isDrawing = true;
      this.activeShapeStart = worldPos;
    } else if (this.currentTool === 'text') {
      this.promptForText(worldPos.x, worldPos.y);
      this.setTool('select');
    }
  }

  handlePointerMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.applyTransform();
      return;
    }

    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (this.isDraggingCard && this.draggedCard) {
      const newX = worldPos.x - this.dragOffset.x;
      const newY = worldPos.y - this.dragOffset.y;
      this.draggedCard.pos_x = newX;
      this.draggedCard.pos_y = newY;

      const cardEl = document.getElementById(`card-${this.draggedCard.id}`);
      if (cardEl) {
        cardEl.style.left = `${newX}px`;
        cardEl.style.top = `${newY}px`;
      }
      this.renderConnectors();
      return;
    }

    if (this.isResizingCard && this.resizingCard) {
      const dx = worldPos.x - this.resizeStart.x;
      const dy = worldPos.y - this.resizeStart.y;
      const newW = Math.max(140, this.resizeStart.w + dx);
      const newH = Math.max(80, this.resizeStart.h + dy);

      this.resizingCard.width = newW;
      this.resizingCard.height = newH;

      const cardEl = document.getElementById(`card-${this.resizingCard.id}`);
      if (cardEl) {
        cardEl.style.width = `${newW}px`;
        cardEl.style.height = `${newH}px`;
      }
      this.renderConnectors();
      return;
    }

    if (this.isDrawing) {
      if (this.currentTool === 'pen') {
        this.activeStrokePoints.push(worldPos);
        this.renderActiveStroke();
      } else if (this.currentTool === 'rect' || this.currentTool === 'ellipse') {
        this.renderActiveShapePreview(worldPos);
      }
    }

    if (this.activeConnector) {
      this.renderActiveConnectorPreview(worldPos);
    }
  }

  handlePointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.viewport) {
        this.viewport.style.cursor = this.isSpacePressed ? 'grab' : 'default';
      }
      return;
    }

    if (this.isDraggingCard && this.draggedCard) {
      const card = this.draggedCard;
      this.isDraggingCard = false;
      this.draggedCard = null;
      this.saveCardPosition(card);
      return;
    }

    if (this.isResizingCard && this.resizingCard) {
      const card = this.resizingCard;
      this.isResizingCard = false;
      this.resizingCard = null;
      this.saveCardDimensions(card);
      return;
    }

    if (this.isDrawing) {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      this.isDrawing = false;

      if (this.currentTool === 'pen') {
        if (this.activeStrokePoints.length > 1) {
          const stroke = {
            id: 'stroke-' + Date.now(),
            type: 'stroke',
            points: [...this.activeStrokePoints],
            color: this.currentColor,
            width: this.currentStrokeWidth,
          };
          this.pushDrawingElement(stroke);
        }
        this.activeStrokePoints = [];
        this.clearActiveStroke();
      } else if (this.currentTool === 'rect' && this.activeShapeStart) {
        const x = Math.min(this.activeShapeStart.x, worldPos.x);
        const y = Math.min(this.activeShapeStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - this.activeShapeStart.x);
        const h = Math.abs(worldPos.y - this.activeShapeStart.y);

        if (w > 5 && h > 5) {
          const rect = {
            id: 'rect-' + Date.now(),
            type: 'rect',
            x,
            y,
            w,
            h,
            color: this.currentColor,
            width: this.currentStrokeWidth,
          };
          this.pushDrawingElement(rect);
        }
        this.activeShapeStart = null;
        this.clearActiveStroke();
      } else if (this.currentTool === 'ellipse' && this.activeShapeStart) {
        const cx = (this.activeShapeStart.x + worldPos.x) / 2;
        const cy = (this.activeShapeStart.y + worldPos.y) / 2;
        const rx = Math.abs(worldPos.x - this.activeShapeStart.x) / 2;
        const ry = Math.abs(worldPos.y - this.activeShapeStart.y) / 2;

        if (rx > 5 && ry > 5) {
          const ellipse = {
            id: 'ellipse-' + Date.now(),
            type: 'ellipse',
            cx,
            cy,
            rx,
            ry,
            color: this.currentColor,
            width: this.currentStrokeWidth,
          };
          this.pushDrawingElement(ellipse);
        }
        this.activeShapeStart = null;
        this.clearActiveStroke();
      }
    }

    if (this.activeConnector) {
      const activeConn = this.activeConnector;
      this.cancelActiveConnector();

      const targetAnchor = document.elementFromPoint(e.clientX, e.clientY)?.closest('.connector-anchor');
      if (targetAnchor) {
        const toCardId = parseInt(targetAnchor.dataset.cardId, 10);
        const toAnchor = targetAnchor.dataset.anchor;
        if (toCardId && toCardId !== activeConn.fromCardId) {
          this.connectCards(activeConn.fromCardId, activeConn.fromAnchor, toCardId, toAnchor);
        }
      } else {
        const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.board-card');
        if (targetCard) {
          const toCardId = parseInt(targetCard.id.replace('card-', ''), 10);
          if (toCardId && toCardId !== activeConn.fromCardId) {
            this.connectCards(activeConn.fromCardId, activeConn.fromAnchor, toCardId, 'left');
          }
        }
      }
      return;
    }
  }

  // Cards Rendering
  renderCards() {
    if (!this.cardsContainer) return;
    this.cardsContainer.innerHTML = '';

    for (const item of this.items) {
      const cardEl = this.createCardElement(item);
      this.cardsContainer.appendChild(cardEl);
    }
  }

  createCardElement(item) {
    const el = document.createElement('div');
    el.className = `board-card ${item.entity_type === 'note' ? 'sticky-note' : ''}`;
    el.id = `card-${item.id}`;
    el.style.left = `${item.pos_x}px`;
    el.style.top = `${item.pos_y}px`;
    el.style.width = `${item.width}px`;
    el.style.height = `${item.height}px`;
    el.style.zIndex = `${item.z_index}`;

    if (item.color) {
      if (item.entity_type === 'note') {
        el.style.backgroundColor = item.color;
      } else {
        el.style.borderColor = item.color;
      }
    }

    // Four Connector Anchor Ports
    const anchors = ['top', 'bottom', 'left', 'right'];
    for (const anchor of anchors) {
      const port = document.createElement('div');
      port.className = `connector-anchor anchor-${anchor}`;
      port.dataset.anchor = anchor;
      port.dataset.cardId = item.id;
      port.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.startConnectorDrag(item.id, anchor, e);
      });
      el.appendChild(port);
    }

    // Card Header
    const header = document.createElement('div');
    header.className = 'board-card-header';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'board-card-type-badge';
    const cIcon = document.createElement('i');
    let iconClass = 'fa-note-sticky';
    if (item.entity_type === 'prompt') iconClass = 'fa-feather-pointed';
    else if (item.entity_type === 'character') iconClass = 'fa-users';
    else if (item.entity_type === 'link') iconClass = 'fa-link';
    else if (item.entity_type === 'part') iconClass = 'fa-film';
    cIcon.className = `fa-solid ${iconClass}`;
    typeBadge.appendChild(cIcon);
    typeBadge.appendChild(document.createTextNode(` ${item.entity_type}`));
    header.appendChild(typeBadge);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'board-card-title';
    titleSpan.textContent = item.entity_title || (item.entity_type === 'note' ? 'Sticky Note' : 'Card');
    header.appendChild(titleSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-icon-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    delBtn.title = 'Remove card';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteCardItem(item.id);
    });
    header.appendChild(delBtn);
    el.appendChild(header);

    // Card Body
    const body = document.createElement('div');
    body.className = 'board-card-body';

    if (item.entity_type === 'note') {
      const textarea = document.createElement('textarea');
      textarea.className = 'sticky-textarea';
      textarea.value = item.note_text || '';
      textarea.placeholder = 'Type your note...';
      textarea.addEventListener('input', (e) => {
        item.note_text = e.target.value;
        this.debounceSaveNoteText(item);
      });
      body.appendChild(textarea);
    } else {
      if (item.entity_image) {
        const img = document.createElement('img');
        img.className = 'board-card-img';
        img.src = item.entity_image;
        img.loading = 'lazy';
        body.appendChild(img);
      }
      let pSubtitle = null;
      if (item.entity_subtitle) {
        pSubtitle = document.createElement('p');
        pSubtitle.textContent = item.entity_subtitle;
        body.appendChild(pSubtitle);
      }
      if (item.entity_type === 'part' && item.entity_id) {
        const statusPill = document.createElement('button');
        statusPill.type = 'button';
        let currentStatus = 'Draft';
        if (item.entity_subtitle && item.entity_subtitle.includes('\u2022')) {
          currentStatus = item.entity_subtitle.split('\u2022')[1].trim();
        }
        const statusSlug = currentStatus.toLowerCase().replace(/\s+/g, '-');
        statusPill.className = `part-status-badge badge-status-${statusSlug}`;
        statusPill.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${currentStatus}`;
        statusPill.title = 'Click to cycle status (Draft -> In Progress -> Ready -> Done)';
        statusPill.addEventListener('pointerdown', (e) => e.stopPropagation());
        statusPill.addEventListener('click', async (e) => {
          e.stopPropagation();
          const cycle = ['Draft', 'In Progress', 'Ready', 'Done'];
          const idx = cycle.indexOf(currentStatus);
          const nextStatus = cycle[(idx + 1) % cycle.length];
          try {
            const res = await fetch(`/api/parts/${item.entity_id}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: nextStatus })
            });
            if (res.ok) {
              currentStatus = nextStatus;
              const nextSlug = nextStatus.toLowerCase().replace(/\s+/g, '-');
              statusPill.className = `part-status-badge badge-status-${nextSlug}`;
              statusPill.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${nextStatus}`;
              if (item.entity_subtitle && pSubtitle) {
                const parts = item.entity_subtitle.split('\u2022');
                item.entity_subtitle = `${parts[0].trim()} \u2022 ${nextStatus}`;
                pSubtitle.textContent = item.entity_subtitle;
              }
              if (typeof showToast === 'function') {
                showToast(`Part updated to ${nextStatus}`);
              }
              if (typeof refreshActiveProjectProgress === 'function') {
                refreshActiveProjectProgress();
              }
            }
          } catch (err) {
            console.error('Failed to cycle part status', err);
          }
        });
        body.appendChild(statusPill);
      }
      if (item.entity_tags && item.entity_tags.length > 0) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'tags-list';
        for (const t of item.entity_tags.slice(0, 3)) {
          const chip = document.createElement('span');
          chip.className = 'tag-chip';
          chip.textContent = `#${t}`;
          tagsWrap.appendChild(chip);
        }
        body.appendChild(tagsWrap);
      }
    }
    el.appendChild(body);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'card-resize-handle';
    resizeHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isResizingCard = true;
      this.resizingCard = item;
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      this.resizeStart = {
        x: worldPos.x,
        y: worldPos.y,
        w: item.width,
        h: item.height,
      };
    });
    el.appendChild(resizeHandle);

    // Card Selection & Dragging
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.card-resize-handle') || e.target.closest('.connector-anchor') || e.target.closest('.action-icon-btn') || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.stopPropagation();
      this.selectCard(item.id);

      if (this.currentTool === 'select') {
        this.isDraggingCard = true;
        this.draggedCard = item;
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        this.dragOffset = {
          x: worldPos.x - item.pos_x,
          y: worldPos.y - item.pos_y,
        };
      }
    });

    return el;
  }

  selectCard(cardId) {
    this.selectedCardId = cardId;
    this.deselectSvgElement();
    document.querySelectorAll('.board-card').forEach((c) => c.classList.remove('selected'));
    const cardEl = document.getElementById(`card-${cardId}`);
    if (cardEl) cardEl.classList.add('selected');
  }

  deselectCard() {
    this.selectedCardId = null;
    document.querySelectorAll('.board-card').forEach((c) => c.classList.remove('selected'));
  }

  // Sticky notes
  createStickyAt(x, y) {
    const noteData = {
      entity_type: 'note',
      note_text: 'New thought...',
      pos_x: x - 100,
      pos_y: y - 75,
      width: 200,
      height: 150,
      color: '#fef08a',
    };

    fetch(`/api/boards/${this.board.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noteData),
    })
      .then((res) => res.json())
      .then((createdItem) => {
        this.items.push(createdItem);
        this.renderCards();
        this.selectCard(createdItem.id);
      })
      .catch((err) => console.error('Failed to create sticky note', err));
  }

  pinEntityAt(entityType, entityId, posX, posY) {
    if (!this.board) return;
    const payload = {
      entity_type: entityType,
      entity_id: entityId,
      pos_x: posX,
      pos_y: posY,
      width: 240,
      height: 160,
    };

    fetch(`/api/boards/${this.board.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create board item');
        return res.json();
      })
      .then((createdItem) => {
        this.items.push(createdItem);
        this.renderCards();
        this.selectCard(createdItem.id);
        if (typeof showToast === 'function') {
          showToast(`Pinned ${entityType} to canvas`);
        }
      })
      .catch((err) => console.error('Failed to pin entity at position', err));
  }

  // Connector Anchors
  startConnectorDrag(cardId, anchor, e) {
    const card = this.items.find((i) => i.id === cardId);
    if (!card) return;

    this.activeConnector = {
      fromCardId: cardId,
      fromAnchor: anchor,
    };
  }

  renderActiveConnectorPreview(worldPos) {
    if (!this.activeConnector || !this.svgActiveStrokeGroup) return;

    const fromCard = this.items.find((i) => i.id === this.activeConnector.fromCardId);
    if (!fromCard) return;

    const fromPoint = this.getCardAnchorPoint(fromCard, this.activeConnector.fromAnchor);
    const pathD = this.calculateConnectorPath(fromPoint, worldPos, this.activeConnector.fromAnchor, 'left');

    this.svgActiveStrokeGroup.innerHTML = `
      <path d="${pathD}" fill="none" stroke="${this.currentColor}" stroke-width="${this.currentStrokeWidth}" stroke-dasharray="4 4" marker-end="url(#arrowhead)"/>
    `;
  }

  cancelActiveConnector() {
    this.activeConnector = null;
    if (this.svgActiveStrokeGroup) this.svgActiveStrokeGroup.innerHTML = '';
  }

  connectCards(fromCardId, fromAnchor, toCardId, toAnchor) {
    if (fromCardId === toCardId) return;

    const connector = {
      id: 'conn-' + Date.now(),
      type: 'connector',
      fromCardId,
      fromAnchor,
      toCardId,
      toAnchor,
      color: this.currentColor,
      width: this.currentStrokeWidth,
    };

    this.pushDrawingElement(connector);
    this.cancelActiveConnector();
  }

  getCardAnchorPoint(card, anchor) {
    const x = card.pos_x;
    const y = card.pos_y;
    const w = card.width;
    const h = card.height;

    switch (anchor) {
      case 'top':
        return { x: x + w / 2, y };
      case 'bottom':
        return { x: x + w / 2, y: y + h };
      case 'left':
        return { x, y: y + h / 2 };
      case 'right':
        return { x: x + w, y: y + h / 2 };
      default:
        return { x: x + w / 2, y: y + h / 2 };
    }
  }

  calculateConnectorPath(p1, p2, fromAnchor = 'right', toAnchor = 'left') {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const curvature = Math.max(30, Math.min(dist * 0.5, 160));

    let cx1 = p1.x;
    let cy1 = p1.y;
    let cx2 = p2.x;
    let cy2 = p2.y;

    switch (fromAnchor) {
      case 'right': cx1 += curvature; break;
      case 'left':  cx1 -= curvature; break;
      case 'top':   cy1 -= curvature; break;
      case 'bottom': cy1 += curvature; break;
      default: cx1 += curvature; break;
    }

    switch (toAnchor) {
      case 'right': cx2 += curvature; break;
      case 'left':  cx2 -= curvature; break;
      case 'top':   cy2 -= curvature; break;
      case 'bottom': cy2 += curvature; break;
      default: cx2 -= curvature; break;
    }

    return `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
  }

  // SVG Renderers
  renderAll() {
    this.renderCards();
    this.renderDrawingElements();
  }

  renderDrawingElements() {
    if (!this.svgDrawingGroup || !this.svgConnectorsGroup || !this.svgShapesGroup || !this.svgTextGroup) return;

    this.svgDrawingGroup.innerHTML = '';
    this.svgConnectorsGroup.innerHTML = '';
    this.svgShapesGroup.innerHTML = '';
    this.svgTextGroup.innerHTML = '';

    for (const elem of this.drawingData) {
      if (elem.type === 'stroke') {
        this.renderStrokeElement(elem);
      } else if (elem.type === 'rect') {
        this.renderRectElement(elem);
      } else if (elem.type === 'ellipse') {
        this.renderEllipseElement(elem);
      } else if (elem.type === 'connector') {
        this.renderConnectorElement(elem);
      } else if (elem.type === 'text') {
        this.renderTextElement(elem);
      }
    }
  }

  renderStrokeElement(elem) {
    if (!elem.points || elem.points.length === 0) return;

    let d = `M ${elem.points[0].x} ${elem.points[0].y}`;
    for (let i = 1; i < elem.points.length; i++) {
      d += ` L ${elem.points[i].x} ${elem.points[i].y}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', elem.color || '#3b82f6');
    path.setAttribute('stroke-width', elem.width || 2);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.id = elem.id;

    path.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgDrawingGroup.appendChild(path);
  }

  renderRectElement(elem) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', elem.x);
    rect.setAttribute('y', elem.y);
    rect.setAttribute('width', elem.w);
    rect.setAttribute('height', elem.h);
    rect.setAttribute('fill', 'rgba(56, 189, 248, 0.05)');
    rect.setAttribute('stroke', elem.color || '#3b82f6');
    rect.setAttribute('stroke-width', elem.width || 2);
    rect.setAttribute('rx', 4);
    rect.id = elem.id;

    rect.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgShapesGroup.appendChild(rect);
  }

  renderEllipseElement(elem) {
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', elem.cx);
    ellipse.setAttribute('cy', elem.cy);
    ellipse.setAttribute('rx', elem.rx);
    ellipse.setAttribute('ry', elem.ry);
    ellipse.setAttribute('fill', 'rgba(56, 189, 248, 0.05)');
    ellipse.setAttribute('stroke', elem.color || '#3b82f6');
    ellipse.setAttribute('stroke-width', elem.width || 2);
    ellipse.id = elem.id;

    ellipse.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgShapesGroup.appendChild(ellipse);
  }

  renderConnectorElement(elem) {
    const card1 = this.items.find((i) => i.id === elem.fromCardId);
    const card2 = this.items.find((i) => i.id === elem.toCardId);
    if (!card1 || !card2) return;

    const p1 = this.getCardAnchorPoint(card1, elem.fromAnchor || 'right');
    const p2 = this.getCardAnchorPoint(card2, elem.toAnchor || 'left');
    const d = this.calculateConnectorPath(p1, p2, elem.fromAnchor || 'right', elem.toAnchor || 'left');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', elem.color || '#3b82f6');
    path.setAttribute('stroke-width', elem.width || 2);
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.id = elem.id;

    path.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgConnectorsGroup.appendChild(path);
  }

  renderTextElement(elem) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', elem.x);
    text.setAttribute('y', elem.y);
    text.setAttribute('fill', elem.color || '#f8fafc');
    text.setAttribute('font-size', '18px');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = elem.text || '';
    text.id = elem.id;

    text.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgTextGroup.appendChild(text);
  }

  renderConnectors() {
    if (!this.svgConnectorsGroup) return;
    this.svgConnectorsGroup.innerHTML = '';

    for (const elem of this.drawingData) {
      if (elem.type === 'connector') {
        this.renderConnectorElement(elem);
      }
    }
  }

  renderActiveStroke() {
    if (!this.svgActiveStrokeGroup || this.activeStrokePoints.length < 2) return;

    let d = `M ${this.activeStrokePoints[0].x} ${this.activeStrokePoints[0].y}`;
    for (let i = 1; i < this.activeStrokePoints.length; i++) {
      d += ` L ${this.activeStrokePoints[i].x} ${this.activeStrokePoints[i].y}`;
    }

    this.svgActiveStrokeGroup.innerHTML = `
      <path d="${d}" fill="none" stroke="${this.currentColor}" stroke-width="${this.currentStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }

  renderActiveShapePreview(worldPos) {
    if (!this.svgActiveStrokeGroup || !this.activeShapeStart) return;

    if (this.currentTool === 'rect') {
      const x = Math.min(this.activeShapeStart.x, worldPos.x);
      const y = Math.min(this.activeShapeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - this.activeShapeStart.x);
      const h = Math.abs(worldPos.y - this.activeShapeStart.y);

      this.svgActiveStrokeGroup.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${this.currentColor}" stroke-width="${this.currentStrokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'ellipse') {
      const cx = (this.activeShapeStart.x + worldPos.x) / 2;
      const cy = (this.activeShapeStart.y + worldPos.y) / 2;
      const rx = Math.abs(worldPos.x - this.activeShapeStart.x) / 2;
      const ry = Math.abs(worldPos.y - this.activeShapeStart.y) / 2;

      this.svgActiveStrokeGroup.innerHTML = `
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${this.currentColor}" stroke-width="${this.currentStrokeWidth}" stroke-dasharray="3 3"/>
      `;
    }
  }

  clearActiveStroke() {
    if (this.svgActiveStrokeGroup) this.svgActiveStrokeGroup.innerHTML = '';
  }

  promptForText(x, y) {
    const text = prompt('Enter floating text label:');
    if (text && text.trim()) {
      const labelElem = {
        id: 'text-' + Date.now(),
        type: 'text',
        x,
        y,
        text: text.trim(),
        color: this.currentColor,
      };
      this.pushDrawingElement(labelElem);
    }
  }

  // Selection & History
  selectSvgElement(elementId) {
    this.selectedElement = elementId;
    this.deselectCard();

    // Reset styles on all SVG elements
    this.svg.querySelectorAll('path, rect, ellipse, text').forEach((el) => {
      el.style.stroke = '';
      el.style.filter = '';
    });

    const el = document.getElementById(elementId);
    if (el) {
      el.style.stroke = '#ec4899';
      el.style.filter = 'drop-shadow(0 0 4px #ec4899)';
    }
  }

  deselectSvgElement() {
    this.selectedElement = null;
    this.svg.querySelectorAll('path, rect, ellipse, text').forEach((el) => {
      el.style.stroke = '';
      el.style.filter = '';
    });
  }

  pushDrawingElement(elem) {
    this.undoStack.push({ type: 'draw', element: elem });
    this.redoStack = [];
    this.drawingData.push(elem);
    this.renderDrawingElements();
    this.debounceSaveDrawing();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const action = this.undoStack.pop();

    if (action.type === 'draw') {
      const idx = this.drawingData.findIndex((e) => e.id === action.element.id);
      if (idx !== -1) {
        const removed = this.drawingData.splice(idx, 1)[0];
        this.redoStack.push({ type: 'draw', element: removed });
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      }
    } else if (action.type === 'delete_draw') {
      this.drawingData.push(action.element);
      this.redoStack.push({ type: 'delete_draw', element: action.element });
      this.renderDrawingElements();
      this.debounceSaveDrawing();
    }
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const action = this.redoStack.pop();

    if (action.type === 'draw') {
      this.drawingData.push(action.element);
      this.undoStack.push(action);
      this.renderDrawingElements();
      this.debounceSaveDrawing();
    } else if (action.type === 'delete_draw') {
      const idx = this.drawingData.findIndex((e) => e.id === action.element.id);
      if (idx !== -1) {
        const removed = this.drawingData.splice(idx, 1)[0];
        this.undoStack.push({ type: 'delete_draw', element: removed });
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      }
    }
  }

  deleteSelected() {
    if (this.selectedCardId) {
      this.deleteCardItem(this.selectedCardId);
      this.deselectCard();
      return;
    }

    if (this.selectedElement) {
      const idx = this.drawingData.findIndex((e) => e.id === this.selectedElement);
      if (idx !== -1) {
        const removed = this.drawingData.splice(idx, 1)[0];
        this.undoStack.push({ type: 'delete_draw', element: removed });
        this.renderDrawingElements();
        this.deselectSvgElement();
        this.debounceSaveDrawing();
      }
    }
  }

  deleteCardItem(itemId) {
    if (!this.board) return;

    fetch(`/api/boards/${this.board.id}/items/${itemId}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then(() => {
        this.items = this.items.filter((i) => i.id !== itemId);
        // Also remove any connectors referencing this card
        this.drawingData = this.drawingData.filter((d) => d.fromCardId !== itemId && d.toCardId !== itemId);
        this.renderAll();
        this.debounceSaveDrawing();
      })
      .catch((err) => console.error('Failed to delete board item', err));
  }

  // Persistence Debouncers
  debounceSaveCamera() {
    clearTimeout(this.cameraSaveTimer);
    this.cameraSaveTimer = setTimeout(() => {
      if (!this.board) return;
      fetch(`/api/boards/${this.board.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pan_x: this.panX,
          pan_y: this.panY,
          zoom: this.zoom,
        }),
      }).catch((err) => console.error('Failed to save camera', err));
    }, 400);
  }

  debounceSaveDrawing() {
    clearTimeout(this.drawingSaveTimer);
    this.drawingSaveTimer = setTimeout(() => {
      if (!this.board) return;
      fetch(`/api/boards/${this.board.id}/drawing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing_data: this.drawingData }),
      }).catch((err) => console.error('Failed to save drawing', err));
    }, 300);
  }

  saveBoardSettings() {
    if (!this.board) return;
    fetch(`/api/boards/${this.board.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.board.name,
        theme: this.themeSelect?.value || 'default',
        canvas_style: this.backdropSelect?.value || 'dot-grid',
      }),
    }).catch((err) => console.error('Failed to save board settings', err));
  }

  saveCardPosition(card) {
    if (!this.board) return;
    fetch(`/api/boards/${this.board.id}/items/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pos_x: card.pos_x,
        pos_y: card.pos_y,
      }),
    }).catch((err) => console.error('Failed to save card position', err));
  }

  saveCardDimensions(card) {
    if (!this.board) return;
    fetch(`/api/boards/${this.board.id}/items/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: card.width,
        height: card.height,
      }),
    }).catch((err) => console.error('Failed to save card dimensions', err));
  }

  debounceSaveNoteText(card) {
    clearTimeout(card._noteTimer);
    card._noteTimer = setTimeout(() => {
      if (!this.board) return;
      fetch(`/api/boards/${this.board.id}/items/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: card.note_text }),
      }).catch((err) => console.error('Failed to save note text', err));
    }, 400);
  }
}

window.atelierCanvas = new AtelierCanvas();
