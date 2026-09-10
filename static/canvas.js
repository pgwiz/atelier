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

    this.isDraggingSvg = false;
    this.svgDragLastWorldPos = null;

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
    this.svgSelectionGroup = document.getElementById('svg-selection-group');

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
      window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
      this.viewport.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

      this.viewport.addEventListener('dragstart', (e) => {
        if (this.currentTool !== 'select') {
          e.preventDefault();
        }
      });

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

    // Stop pointerdown propagation from floating controls to prevent unwanted drawing
    document.querySelectorAll('#canvas-tools, #canvas-palette, #canvas-stroke-width, .canvas-history-controls, .canvas-zoom-controls, .canvas-navbar, .canvas-drawer').forEach((ctrl) => {
      ctrl.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

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

        // If an SVG element is currently selected, update its color
        if (this.selectedElement) {
          const elem = this.drawingData.find((d) => d.id === this.selectedElement);
          if (elem) {
            elem.color = this.currentColor;
            this.renderDrawingElements();
            this.renderSvgSelectionOutline();
            this.debounceSaveDrawing();
          }
        }

        // If a card is currently selected, update its color
        if (this.selectedCardId) {
          const card = this.items.find((i) => i.id === this.selectedCardId);
          if (card) {
            card.color = this.currentColor;
            const cardEl = document.getElementById(`card-${card.id}`);
            if (cardEl) {
              if (card.entity_type === 'note') {
                cardEl.style.backgroundColor = card.color;
              } else {
                cardEl.style.borderColor = card.color;
                cardEl.style.borderTopColor = card.color;
              }
            }
            this.saveCardColor(card);
          }
        }
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

    // Inline editable board title (no browser prompt)
    if (this.boardTitle) {
      this.boardTitle.title = 'Click to rename board';
      this.boardTitle.addEventListener('click', () => {
        if (this.boardTitle.querySelector('input')) return;
        const currentName = this.board?.name || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input form-input-dense';
        input.style.width = '240px';
        input.style.display = 'inline-block';
        input.style.fontSize = '0.95rem';
        input.style.fontWeight = '700';
        input.value = currentName;

        this.boardTitle.textContent = '';
        this.boardTitle.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newName = input.value.trim();
          if (newName && newName !== currentName && this.board) {
            this.board.name = newName;
            this.boardTitle.textContent = newName;
            this.saveBoardSettings();
            if (window.showToast) window.showToast(`Board renamed to "${newName}"`);
          } else {
            this.boardTitle.textContent = currentName;
          }
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            committed = true;
            this.boardTitle.textContent = currentName;
          }
        });

        input.addEventListener('blur', commit);
      });
    }
  }

  loadBoard(board, items) {
    if (!this.viewport || !this.svg || !this.svgDrawingGroup) {
      this.initDOMElements();
    }
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
    this.updateCursor();
  }

  updateCursor() {
    if (!this.viewport) return;
    if (this.isPanning) {
      this.viewport.style.cursor = 'grabbing';
    } else if (this.isSpacePressed) {
      this.viewport.style.cursor = 'grab';
    } else if (this.currentTool === 'pen' || this.currentTool === 'rect' || this.currentTool === 'ellipse' || this.currentTool === 'connector') {
      this.viewport.style.cursor = 'crosshair';
    } else if (this.currentTool === 'text') {
      this.viewport.style.cursor = 'text';
    } else if (this.currentTool === 'sticky') {
      this.viewport.style.cursor = 'cell';
    } else if (this.isDraggingSvg || this.isDraggingCard) {
      this.viewport.style.cursor = 'move';
    } else {
      this.viewport.style.cursor = 'default';
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
    if (this.activeInlineEditor && this.activeInlineEditor.editor) {
      const screenPos = this.worldToScreen(this.activeInlineEditor.worldX, this.activeInlineEditor.worldY);
      const rect = this.viewport.getBoundingClientRect();
      this.activeInlineEditor.editor.style.left = `${screenPos.x - rect.left - 6}px`;
      this.activeInlineEditor.editor.style.top = `${screenPos.y - rect.top - 4}px`;
      const fontSize = Math.max(12, Math.round(18 * this.zoom));
      this.activeInlineEditor.editor.style.fontSize = `${fontSize}px`;
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
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

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
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const step = e.shiftKey ? 20 : (e.altKey ? 1 : 10);
      const dx = (e.key === 'ArrowLeft' ? -step : (e.key === 'ArrowRight' ? step : 0));
      const dy = (e.key === 'ArrowUp' ? -step : (e.key === 'ArrowDown' ? step : 0));

      if (this.selectedElement) {
        e.preventDefault();
        const elem = this.drawingData.find((d) => d.id === this.selectedElement);
        if (elem) {
          if (elem.type === 'rect' || elem.type === 'text') {
            elem.x += dx;
            elem.y += dy;
          } else if (elem.type === 'ellipse') {
            elem.cx += dx;
            elem.cy += dy;
          } else if (elem.type === 'stroke' && elem.points) {
            elem.points.forEach((pt) => {
              pt.x += dx;
              pt.y += dy;
            });
          }
          this.renderDrawingElements();
          this.debounceSaveDrawing();
        }
        return;
      }

      if (this.selectedCardId) {
        e.preventDefault();
        const card = this.items.find((i) => i.id === this.selectedCardId);
        if (card) {
          card.pos_x += dx;
          card.pos_y += dy;
          const cardEl = document.getElementById(`card-${card.id}`);
          if (cardEl) {
            cardEl.style.left = `${card.pos_x}px`;
            cardEl.style.top = `${card.pos_y}px`;
          }
          this.renderConnectors();
          this.saveCardPosition(card);
        }
        return;
      }
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
        this.updateCursor();
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

    // Ignore clicks on floating UI controls or toolbar buttons
    if (e.target.closest('#canvas-tools, #canvas-palette, #canvas-stroke-width, .canvas-history-controls, .canvas-zoom-controls, .canvas-navbar, .canvas-drawer, .canvas-inline-editor')) {
      return;
    }

    // Capture pointer so drawing gestures never get lost on fast moves
    try {
      if (this.viewport) this.viewport.setPointerCapture(e.pointerId);
    } catch (_) {}

    if (this.currentTool !== 'select') {
      e.preventDefault();
    }

    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (this.currentTool === 'select') {
      const targetSvg = e.target.closest('#canvas-svg path, #canvas-svg rect, #canvas-svg ellipse, #canvas-svg text');
      if (targetSvg && targetSvg.id && targetSvg.id !== 'canvas-grid-pattern' && this.drawingData.some((d) => d.id === targetSvg.id)) {
        this.selectSvgElement(targetSvg.id);
        this.isDraggingSvg = true;
        this.svgDragLastWorldPos = worldPos;
        this.updateCursor();
        return;
      }

      if (!e.target.closest('.board-card') && !targetSvg) {
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
      const targetText = e.target.closest('#canvas-svg text');
      if (targetText && targetText.id) {
        const elem = this.drawingData.find((d) => d.id === targetText.id);
        if (elem) {
          this.promptForText(elem.x, elem.y, elem);
          this.setTool('select');
          return;
        }
      }
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

    if (this.isDraggingSvg && this.selectedElement) {
      const dx = worldPos.x - this.svgDragLastWorldPos.x;
      const dy = worldPos.y - this.svgDragLastWorldPos.y;
      this.svgDragLastWorldPos = worldPos;

      const elem = this.drawingData.find((d) => d.id === this.selectedElement);
      if (elem) {
        if (elem.type === 'rect' || elem.type === 'text') {
          elem.x += dx;
          elem.y += dy;
        } else if (elem.type === 'ellipse') {
          elem.cx += dx;
          elem.cy += dy;
        } else if (elem.type === 'stroke' && elem.points) {
          elem.points.forEach((pt) => {
            pt.x += dx;
            pt.y += dy;
          });
        }
        this.renderDrawingElements();
      }
      return;
    }

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
    try {
      if (this.viewport && this.viewport.hasPointerCapture(e.pointerId)) {
        this.viewport.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (this.isPanning) {
      this.isPanning = false;
      this.updateCursor();
      return;
    }

    if (this.isDraggingSvg) {
      this.isDraggingSvg = false;
      this.debounceSaveDrawing();
      this.updateCursor();
      return;
    }

    if (this.isDraggingCard && this.draggedCard) {
      const card = this.draggedCard;
      this.isDraggingCard = false;
      this.draggedCard = null;
      this.saveCardPosition(card);
      this.updateCursor();
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
            color: this.currentColor || '#3b82f6',
            width: this.currentStrokeWidth || 2,
          };
          this.pushDrawingElement(stroke);
        } else if (this.activeStrokePoints.length === 1) {
          // Single tap/click creates a clean dot
          const pt = this.activeStrokePoints[0];
          const stroke = {
            id: 'stroke-' + Date.now(),
            type: 'stroke',
            points: [pt, { x: pt.x + 0.1, y: pt.y + 0.1 }],
            color: this.currentColor || '#3b82f6',
            width: Math.max((this.currentStrokeWidth || 2) * 2, 4),
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
    const rawType = (item.entity_type || 'note').toLowerCase();
    const entityType = ['prompt', 'character', 'link', 'part', 'note'].includes(rawType) ? rawType : 'note';
    el.className = `board-card card-${entityType} ${entityType === 'note' ? 'sticky-note' : ''}`;
    el.id = `card-${item.id}`;
    el.style.left = `${item.pos_x}px`;
    el.style.top = `${item.pos_y}px`;
    el.style.width = `${Math.max(item.width || 240, 200)}px`;
    el.style.height = `${Math.max(item.height || 160, 120)}px`;
    el.style.zIndex = `${item.z_index || 1}`;

    if (item.color) {
      if (entityType === 'note') {
        el.style.backgroundColor = item.color;
      } else {
        el.style.borderColor = item.color;
        el.style.borderTopColor = item.color;
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
    if (entityType === 'prompt') iconClass = 'fa-feather-pointed';
    else if (entityType === 'character') iconClass = 'fa-users';
    else if (entityType === 'link') iconClass = 'fa-link';
    else if (entityType === 'part') iconClass = 'fa-film';
    cIcon.className = `fa-solid ${iconClass}`;
    typeBadge.appendChild(cIcon);
    typeBadge.appendChild(document.createTextNode(` ${entityType}`));
    header.appendChild(typeBadge);

    const fallbackTitle = entityType === 'note' ? 'Sticky Note' : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} #${item.entity_id || item.id}`;
    const resolvedTitle = item.entity_title || item.title || fallbackTitle;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'board-card-title';
    titleSpan.textContent = resolvedTitle;
    titleSpan.title = resolvedTitle;
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

    if (entityType === 'note') {
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
      const resolvedImage = item.entity_image || item.image || item.image_path || item.thumbnail_url || null;
      if (resolvedImage) {
        const img = document.createElement('img');
        img.className = 'board-card-img';
        img.src = resolvedImage;
        img.alt = resolvedTitle;
        img.loading = 'lazy';
        body.appendChild(img);
      }
      let pSubtitle = null;
      const resolvedSubtitle = item.entity_subtitle || item.snippet || item.body || item.description || '';
      if (resolvedSubtitle) {
        pSubtitle = document.createElement('p');
        pSubtitle.textContent = resolvedSubtitle;
        body.appendChild(pSubtitle);
      }
      if (entityType === 'part' && item.entity_id) {
        const statusPill = document.createElement('button');
        statusPill.type = 'button';
        let currentStatus = 'Draft';
        if (resolvedSubtitle && resolvedSubtitle.includes('\u2022')) {
          currentStatus = resolvedSubtitle.split('\u2022')[1].trim();
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
              if (resolvedSubtitle && pSubtitle) {
                const parts = resolvedSubtitle.split('\u2022');
                const updatedSub = `${parts[0].trim()} \u2022 ${nextStatus}`;
                item.entity_subtitle = updatedSub;
                pSubtitle.textContent = updatedSub;
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
      const rawTags = Array.isArray(item.entity_tags) ? item.entity_tags : (Array.isArray(item.tags) ? item.tags : []);
      if (rawTags.length > 0) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'tags-list';
        for (const t of rawTags.slice(0, 3)) {
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
      if (this.currentTool !== 'select') return;
      if (e.target.closest('.card-resize-handle') || e.target.closest('.connector-anchor') || e.target.closest('.action-icon-btn') || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.stopPropagation();
      this.selectCard(item.id);

      this.isDraggingCard = true;
      this.draggedCard = item;
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      this.dragOffset = {
        x: worldPos.x - item.pos_x,
        y: worldPos.y - item.pos_y,
      };
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

    let targetX = posX;
    let targetY = posY;
    if (targetX === undefined || targetY === undefined) {
      const rect = this.viewport ? this.viewport.getBoundingClientRect() : { width: 800, height: 600, left: 0, top: 0 };
      const centerWorld = this.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const offset = (this.items.length % 6) * 24;
      targetX = centerWorld.x - 120 + offset;
      targetY = centerWorld.y - 80 + offset;
    }

    const payload = {
      entity_type: entityType,
      entity_id: entityId,
      pos_x: Math.round(targetX),
      pos_y: Math.round(targetY),
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

    if (this.selectedElement) {
      this.renderSvgSelectionOutline();
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
    text.setAttribute('dominant-baseline', 'hanging');
    text.setAttribute('stroke', 'transparent');
    text.setAttribute('stroke-width', '10px');
    text.setAttribute('paint-order', 'stroke fill');
    text.id = elem.id;
    text.style.cursor = 'pointer';
    text.style.userSelect = 'none';

    const lines = (elem.text || '').split('\n');
    if (lines.length <= 1) {
      text.textContent = elem.text || '';
    } else {
      text.textContent = '';
      lines.forEach((line, i) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', elem.x);
        tspan.setAttribute('dy', i === 0 ? '0' : '1.3em');
        tspan.textContent = line || ' ';
        text.appendChild(tspan);
      });
    }

    text.addEventListener('pointerdown', (e) => {
      if (this.currentTool === 'text') {
        e.stopPropagation();
        this.promptForText(elem.x, elem.y, elem);
        this.setTool('select');
      }
    });

    text.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentTool === 'select') {
        this.selectSvgElement(elem.id);
      }
    });

    text.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForText(elem.x, elem.y, elem);
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
    if (!this.svgActiveStrokeGroup || this.activeStrokePoints.length === 0) return;

    let d;
    if (this.activeStrokePoints.length === 1) {
      const p = this.activeStrokePoints[0];
      d = `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
    } else {
      d = `M ${this.activeStrokePoints[0].x} ${this.activeStrokePoints[0].y}`;
      for (let i = 1; i < this.activeStrokePoints.length; i++) {
        d += ` L ${this.activeStrokePoints[i].x} ${this.activeStrokePoints[i].y}`;
      }
    }

    this.svgActiveStrokeGroup.innerHTML = `
      <path d="${d}" fill="none" stroke="${this.currentColor || '#3b82f6'}" stroke-width="${this.currentStrokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"/>
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
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56, 189, 248, 0.08)" stroke="${this.currentColor || '#3b82f6'}" stroke-width="${this.currentStrokeWidth || 2}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'ellipse') {
      const cx = (this.activeShapeStart.x + worldPos.x) / 2;
      const cy = (this.activeShapeStart.y + worldPos.y) / 2;
      const rx = Math.abs(worldPos.x - this.activeShapeStart.x) / 2;
      const ry = Math.abs(worldPos.y - this.activeShapeStart.y) / 2;

      this.svgActiveStrokeGroup.innerHTML = `
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(56, 189, 248, 0.08)" stroke="${this.currentColor || '#3b82f6'}" stroke-width="${this.currentStrokeWidth || 2}" stroke-dasharray="3 3"/>
      `;
    }
  }

  clearActiveStroke() {
    if (this.svgActiveStrokeGroup) this.svgActiveStrokeGroup.innerHTML = '';
  }

  promptForText(x, y, existingElem = null) {
    // Commit any currently open editor before opening a new one
    if (this.activeInlineEditor) {
      this.activeInlineEditor.commit();
      this.activeInlineEditor = null;
    }

    // Clean up any remaining editor DOM nodes
    document.querySelectorAll('.canvas-inline-editor').forEach((el) => el.remove());

    const editor = document.createElement('textarea');
    editor.className = 'canvas-inline-editor';
    editor.placeholder = 'Type text here...';
    editor.value = existingElem ? (existingElem.text || '') : '';

    const screenPos = this.worldToScreen(x, y);
    const rect = this.viewport.getBoundingClientRect();
    editor.style.left = `${screenPos.x - rect.left - 6}px`;
    editor.style.top = `${screenPos.y - rect.top - 4}px`;
    const fontSize = Math.max(12, Math.round(18 * this.zoom));
    editor.style.fontSize = `${fontSize}px`;
    editor.style.lineHeight = '1.3';

    const adjustSize = () => {
      editor.style.height = 'auto';
      editor.style.height = `${Math.max(38, editor.scrollHeight)}px`;
      const val = editor.value || '';
      const lines = val.split('\n');
      const longestLine = lines.reduce((max, l) => Math.max(max, l.length), 0);
      const charWidth = Math.max(8, Math.round(11 * this.zoom));
      const approxWidth = Math.max(140, Math.min(600, (longestLine + 3) * charWidth));
      editor.style.width = `${approxWidth}px`;
    };
    editor.addEventListener('input', adjustSize);

    // Stop events inside the editor from bubbling to canvas stage
    editor.addEventListener('pointerdown', (e) => e.stopPropagation());
    editor.addEventListener('pointerup', (e) => e.stopPropagation());
    editor.addEventListener('mousedown', (e) => e.stopPropagation());
    editor.addEventListener('click', (e) => e.stopPropagation());
    editor.addEventListener('dblclick', (e) => e.stopPropagation());

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      this.activeInlineEditor = null;
      const text = editor.value.trim();
      editor.remove();

      if (text) {
        if (existingElem) {
          existingElem.text = text;
          this.renderDrawingElements();
          this.selectSvgElement(existingElem.id);
          this.debounceSaveDrawing();
        } else {
          const labelElem = {
            id: 'text-' + Date.now(),
            type: 'text',
            x,
            y,
            text,
            color: this.currentColor,
          };
          this.pushDrawingElement(labelElem);
          this.selectSvgElement(labelElem.id);
        }
      } else if (existingElem) {
        const idx = this.drawingData.findIndex((e) => e.id === existingElem.id);
        if (idx !== -1) {
          this.drawingData.splice(idx, 1);
          this.renderDrawingElements();
          this.deselectSvgElement();
          this.debounceSaveDrawing();
        }
      }
    };

    this.activeInlineEditor = {
      editor,
      worldX: x,
      worldY: y,
      commit,
    };

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.activeInlineEditor = null;
        editor.remove();
        if (existingElem) {
          this.renderDrawingElements();
          this.selectSvgElement(existingElem.id);
        }
      }
    });

    editor.addEventListener('blur', () => {
      commit();
    });

    this.viewport.appendChild(editor);
    adjustSize();
    setTimeout(() => {
      editor.focus();
      if (existingElem) {
        editor.select();
      }
    }, 25);
  }

  // Selection & History
  selectSvgElement(elementId) {
    this.selectedElement = elementId;
    this.deselectCard();
    this.renderSvgSelectionOutline();
  }

  deselectSvgElement() {
    this.selectedElement = null;
    if (this.svgSelectionGroup) {
      this.svgSelectionGroup.innerHTML = '';
    }
  }

  renderSvgSelectionOutline() {
    if (!this.svgSelectionGroup) return;
    this.svgSelectionGroup.innerHTML = '';
    if (!this.selectedElement) return;

    const elem = this.drawingData.find((d) => d.id === this.selectedElement);
    if (!elem) return;

    if (elem.type === 'rect') {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', elem.x - 3);
      rect.setAttribute('y', elem.y - 3);
      rect.setAttribute('width', elem.w + 6);
      rect.setAttribute('height', elem.h + 6);
      rect.setAttribute('rx', 4);
      rect.setAttribute('class', 'svg-selection-outline');
      this.svgSelectionGroup.appendChild(rect);
    } else if (elem.type === 'ellipse') {
      const ell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ell.setAttribute('cx', elem.cx);
      ell.setAttribute('cy', elem.cy);
      ell.setAttribute('rx', elem.rx + 3);
      ell.setAttribute('ry', elem.ry + 3);
      ell.setAttribute('class', 'svg-selection-outline');
      this.svgSelectionGroup.appendChild(ell);
    } else if (elem.type === 'stroke' && elem.points && elem.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of elem.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      const pad = (elem.width || 2) + 4;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', minX - pad);
      rect.setAttribute('y', minY - pad);
      rect.setAttribute('width', Math.max(12, maxX - minX + pad * 2));
      rect.setAttribute('height', Math.max(12, maxY - minY + pad * 2));
      rect.setAttribute('rx', 4);
      rect.setAttribute('class', 'svg-selection-outline');
      this.svgSelectionGroup.appendChild(rect);
    } else if (elem.type === 'text') {
      const textEl = document.getElementById(elem.id);
      let bbox = null;
      if (textEl) {
        try {
          bbox = textEl.getBBox();
        } catch (_) {}
      }
      const lines = (elem.text || '').split('\n');
      const maxLineLen = Math.max(...lines.map((l) => l.length), 4);
      const lineCount = lines.length;

      const x = (bbox && bbox.width > 0) ? bbox.x - 4 : elem.x - 4;
      const y = (bbox && bbox.height > 0) ? bbox.y - 3 : elem.y - 3;
      const w = (bbox && bbox.width > 0) ? bbox.width + 8 : Math.max(40, maxLineLen * 11 + 10);
      const h = (bbox && bbox.height > 0) ? bbox.height + 6 : Math.max(26, lineCount * 24 + 4);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', 4);
      rect.setAttribute('class', 'svg-selection-outline');
      this.svgSelectionGroup.appendChild(rect);
    } else if (elem.type === 'connector') {
      const connEl = document.getElementById(elem.id);
      if (connEl) {
        const clone = connEl.cloneNode(true);
        clone.removeAttribute('id');
        clone.setAttribute('class', 'svg-selection-outline');
        clone.setAttribute('stroke-width', (elem.width || 2) + 2);
        clone.removeAttribute('marker-end');
        this.svgSelectionGroup.appendChild(clone);
      }
    }
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

  saveCardColor(card) {
    if (!this.board) return;
    fetch(`/api/boards/${this.board.id}/items/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color: card.color,
      }),
    }).catch((err) => console.error('Failed to save card color', err));
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
