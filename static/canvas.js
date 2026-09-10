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
    this.currentTool = 'select'; // 'select' | 'sticky' | 'pen' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'line' | 'arrow' | 'connector' | 'text'
    this.currentShapeType = 'rect';
    this.currentColor = '#3b82f6';
    this.currentStrokeWidth = 2;
    this.selectedCardId = null;
    this.selectedElement = null; // for SVG elements
    this.clipboardItem = null;
    this.lastMouseWorldPos = { x: 0, y: 0 };
    this.rightClickStart = null;

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

    // Phase 11 UI Components
    this.propertiesPanel = document.getElementById('canvas-properties-panel');
    this.propertiesContent = document.getElementById('properties-panel-content');
    this.propBadgeType = document.getElementById('prop-badge-type');
    this.contextMenu = document.getElementById('canvas-context-menu');
    this.shapesFlyout = document.getElementById('shapes-flyout');
    this.activeShapeIcon = document.getElementById('active-shape-icon');
    this.exportMenu = document.getElementById('canvas-export-menu');
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
      this.viewport.addEventListener('contextmenu', (e) => e.preventDefault());

      this.viewport.addEventListener('dragstart', (e) => {
        if (this.currentTool !== 'select') {
          e.preventDefault();
        }
      });

      this.viewport.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      this.viewport.addEventListener('drop', async (e) => {
        e.preventDefault();
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        // Check for dropped image files from desktop/OS
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          for (const file of e.dataTransfer.files) {
            if (file.type && file.type.startsWith('image/')) {
              await this.uploadAndPinImage(file, file.name, worldPos);
              return;
            }
          }
        }

        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data.entity_type && data.entity_id) {
              this.pinEntityAt(data.entity_type, data.entity_id, worldPos.x - 120, worldPos.y - 80);
            }
          } catch (err) {
            console.error('Failed to parse dropped item', err);
          }
        }
      });
    }

    // Stop pointerdown propagation from floating controls to prevent unwanted drawing
    document.querySelectorAll('#canvas-tools, #canvas-palette, #canvas-stroke-width, .canvas-history-controls, .canvas-zoom-controls, .canvas-navbar, .canvas-drawer, .canvas-properties-panel, .canvas-context-menu, .shapes-flyout-popover, .canvas-export-menu').forEach((ctrl) => {
      ctrl.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // Track mouse world position
    window.addEventListener('mousemove', (e) => {
      if (this.viewport) {
        this.lastMouseWorldPos = this.screenToWorld(e.clientX, e.clientY);
      }
    });

    // Clipboard paste event listener (image pasting, text pasting, element pasting)
    window.addEventListener('paste', (e) => this.handlePaste(e));

    // Shapes Flyout Menu Toggle
    document.getElementById('btn-tool-shapes')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.shapesFlyout) {
        const isHidden = this.shapesFlyout.style.display === 'none';
        this.shapesFlyout.style.display = isHidden ? 'block' : 'none';
      }
    });

    // Shapes flyout selection buttons
    document.querySelectorAll('.shape-flyout-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const shape = btn.dataset.shape;
        this.setShapeTool(shape);
        if (this.shapesFlyout) this.shapesFlyout.style.display = 'none';
      });
    });

    // Properties panel toggle & close buttons
    document.getElementById('btn-toggle-properties')?.addEventListener('click', () => {
      if (this.propertiesPanel) {
        const isHidden = this.propertiesPanel.style.display === 'none';
        this.propertiesPanel.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) this.updatePropertiesPanel();
      }
    });

    document.getElementById('btn-close-properties-panel')?.addEventListener('click', () => {
      if (this.propertiesPanel) this.propertiesPanel.style.display = 'none';
    });

    // Export dropdown toggle & buttons
    document.getElementById('btn-export-dropdown-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.exportMenu) {
        const isHidden = this.exportMenu.style.display === 'none';
        this.exportMenu.style.display = isHidden ? 'flex' : 'none';
      }
    });

    document.getElementById('btn-export-board-png')?.addEventListener('click', () => {
      if (this.exportMenu) this.exportMenu.style.display = 'none';
      this.exportBoardAsPng();
    });

    document.getElementById('btn-export-board-svg')?.addEventListener('click', () => {
      if (this.exportMenu) this.exportMenu.style.display = 'none';
      this.exportBoardAsSvg();
    });

    // Dismiss popovers and context menu on outside click
    window.addEventListener('click', (e) => {
      if (!e.target.closest('#shapes-tool-container') && this.shapesFlyout) {
        this.shapesFlyout.style.display = 'none';
      }
      if (!e.target.closest('.canvas-export-dropdown-wrap') && this.exportMenu) {
        this.exportMenu.style.display = 'none';
      }
      if (!e.target.closest('.canvas-context-menu')) {
        this.closeContextMenu();
      }
    });

    // Canvas tools buttons
    document.querySelectorAll('#canvas-tools .tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'shapes-menu') {
          // If shape tool was already active, toggle flyout; otherwise activate current shape
          if (this.currentTool === this.currentShapeType) {
            if (this.shapesFlyout) {
              const isHidden = this.shapesFlyout.style.display === 'none';
              this.shapesFlyout.style.display = isHidden ? 'block' : 'none';
            }
          } else {
            this.setShapeTool(this.currentShapeType || 'rect');
          }
        } else {
          this.setTool(tool);
        }
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

  setShapeTool(shape) {
    this.currentShapeType = shape;
    document.querySelectorAll('.shape-flyout-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.shape === shape);
    });
    const iconMap = {
      rect: 'fa-square',
      ellipse: 'fa-circle',
      triangle: 'fa-caret-up',
      diamond: 'fa-diamond',
      star: 'fa-star',
      line: 'fa-minus',
      arrow: 'fa-arrow-right',
    };
    if (this.activeShapeIcon) {
      this.activeShapeIcon.className = `fa-solid ${iconMap[shape] || 'fa-square'}`;
    }
    this.setTool(shape);
  }

  setTool(tool) {
    this.currentTool = tool;
    const isShapeTool = ['rect', 'ellipse', 'triangle', 'diamond', 'star', 'line', 'arrow'].includes(tool);

    document.querySelectorAll('#canvas-tools .tool-btn').forEach((btn) => {
      if (btn.dataset.tool === 'shapes-menu') {
        btn.classList.toggle('active', isShapeTool);
      } else {
        btn.classList.toggle('active', btn.dataset.tool === tool);
      }
    });

    if (isShapeTool) {
      this.currentShapeType = tool;
      document.querySelectorAll('.shape-flyout-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.shape === tool);
      });
      const iconMap = {
        rect: 'fa-square',
        ellipse: 'fa-circle',
        triangle: 'fa-caret-up',
        diamond: 'fa-diamond',
        star: 'fa-star',
        line: 'fa-minus',
        arrow: 'fa-arrow-right',
      };
      if (this.activeShapeIcon) {
        this.activeShapeIcon.className = `fa-solid ${iconMap[tool] || 'fa-square'}`;
      }
    }

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
    } else if (this.currentTool === 'pen' || ['rect', 'ellipse', 'triangle', 'diamond', 'star', 'line', 'arrow', 'connector'].includes(this.currentTool)) {
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
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.copySelected();
    } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.pasteCopiedItem(this.lastMouseWorldPos);
    } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.duplicateSelected();
    } else if (e.key === 'v' || e.key === 'V') {
      this.setTool('select');
    } else if (e.key === 'p' || e.key === 'P') {
      this.setTool('pen');
    } else if (e.key === 'r' || e.key === 'R') {
      this.setShapeTool('rect');
    } else if (e.key === 'o' || e.key === 'O') {
      this.setShapeTool('ellipse');
    } else if (e.key === 'l' || e.key === 'L') {
      this.setShapeTool('line');
    } else if (e.key === 'a' || e.key === 'A') {
      this.setShapeTool('arrow');
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
          if (['rect', 'text', 'triangle', 'diamond', 'star'].includes(elem.type)) {
            elem.x += dx;
            elem.y += dy;
          } else if (elem.type === 'ellipse') {
            elem.cx += dx;
            elem.cy += dy;
          } else if (elem.type === 'line' || elem.type === 'arrow') {
            elem.x1 += dx;
            elem.y1 += dy;
            elem.x2 += dx;
            elem.y2 += dy;
          } else if (elem.type === 'stroke' && elem.points) {
            elem.points.forEach((pt) => {
              pt.x += dx;
              pt.y += dy;
            });
          }
          this.renderDrawingElements();
          this.debounceSaveDrawing();
          this.updatePropertiesPanel();
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
          this.updatePropertiesPanel();
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
      this.closeContextMenu();
      if (this.shapesFlyout) this.shapesFlyout.style.display = 'none';
      if (this.exportMenu) this.exportMenu.style.display = 'none';
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
    if (e.button === 1 || e.button === 2 || this.isSpacePressed) {
      // Middle click, right click, or space pan (drag the notebook/canvas)
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      if (e.button === 2) {
        this.rightClickStart = {
          clientX: e.clientX,
          clientY: e.clientY,
          target: e.target,
          hasMoved: false,
        };
      }
      if (this.viewport) this.viewport.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return; // Only primary button for drawing/selecting

    // Ignore clicks on floating UI controls or toolbar buttons
    if (e.target.closest('#canvas-tools, #canvas-palette, #canvas-stroke-width, .canvas-history-controls, .canvas-zoom-controls, .canvas-navbar, .canvas-drawer, .canvas-properties-panel, .canvas-context-menu, .shapes-flyout-popover, .canvas-export-menu, .canvas-inline-editor')) {
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
      const targetSvg = e.target.closest('#canvas-svg path, #canvas-svg rect, #canvas-svg ellipse, #canvas-svg line, #canvas-svg polygon, #canvas-svg text');
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
        this.closeContextMenu();
      }
    } else if (this.currentTool === 'sticky') {
      this.createStickyAt(worldPos.x, worldPos.y);
      this.setTool('select');
    } else if (this.currentTool === 'pen') {
      this.isDrawing = true;
      this.activeStrokePoints = [worldPos];
      this.renderActiveStroke();
    } else if (['rect', 'ellipse', 'triangle', 'diamond', 'star', 'line', 'arrow'].includes(this.currentTool)) {
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
      if (this.rightClickStart) {
        const dist = Math.hypot(e.clientX - this.rightClickStart.clientX, e.clientY - this.rightClickStart.clientY);
        if (dist > 4) this.rightClickStart.hasMoved = true;
      }
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
        if (['rect', 'text', 'triangle', 'diamond', 'star'].includes(elem.type)) {
          elem.x += dx;
          elem.y += dy;
        } else if (elem.type === 'ellipse') {
          elem.cx += dx;
          elem.cy += dy;
        } else if (elem.type === 'line' || elem.type === 'arrow') {
          elem.x1 += dx;
          elem.y1 += dy;
          elem.x2 += dx;
          elem.y2 += dy;
        } else if (elem.type === 'stroke' && elem.points) {
          elem.points.forEach((pt) => {
            pt.x += dx;
            pt.y += dy;
          });
        }
        this.renderDrawingElements();
        this.updatePropertiesPanel();
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
      this.updatePropertiesPanel();
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
      this.updatePropertiesPanel();
      return;
    }

    if (this.isDrawing) {
      if (this.currentTool === 'pen') {
        this.activeStrokePoints.push(worldPos);
        this.renderActiveStroke();
      } else {
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

    if (this.rightClickStart) {
      const dist = Math.hypot(e.clientX - this.rightClickStart.clientX, e.clientY - this.rightClickStart.clientY);
      if (dist <= 4 && !this.rightClickStart.hasMoved) {
        this.handleRightClick(e);
      }
      this.rightClickStart = null;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.updateCursor();
      this.debounceSaveCamera();
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
      } else if (['rect', 'triangle', 'diamond', 'star'].includes(this.currentTool) && this.activeShapeStart) {
        const x = Math.min(this.activeShapeStart.x, worldPos.x);
        const y = Math.min(this.activeShapeStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - this.activeShapeStart.x);
        const h = Math.abs(worldPos.y - this.activeShapeStart.y);

        if (w > 5 && h > 5) {
          const shapeElem = {
            id: `${this.currentTool}-${Date.now()}`,
            type: this.currentTool,
            x,
            y,
            w,
            h,
            color: this.currentColor,
            width: this.currentStrokeWidth,
            fill: 'rgba(56, 189, 248, 0.05)',
          };
          this.pushDrawingElement(shapeElem);
          this.selectSvgElement(shapeElem.id);
        }
        this.activeShapeStart = null;
        this.clearActiveStroke();
        this.setTool('select');
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
            fill: 'rgba(56, 189, 248, 0.05)',
          };
          this.pushDrawingElement(ellipse);
          this.selectSvgElement(ellipse.id);
        }
        this.activeShapeStart = null;
        this.clearActiveStroke();
        this.setTool('select');
      } else if ((this.currentTool === 'line' || this.currentTool === 'arrow') && this.activeShapeStart) {
        const dist = Math.hypot(worldPos.x - this.activeShapeStart.x, worldPos.y - this.activeShapeStart.y);
        if (dist > 5) {
          const lineElem = {
            id: `${this.currentTool}-${Date.now()}`,
            type: this.currentTool,
            x1: this.activeShapeStart.x,
            y1: this.activeShapeStart.y,
            x2: worldPos.x,
            y2: worldPos.y,
            color: this.currentColor,
            width: this.currentStrokeWidth,
          };
          this.pushDrawingElement(lineElem);
          this.selectSvgElement(lineElem.id);
        }
        this.activeShapeStart = null;
        this.clearActiveStroke();
        this.setTool('select');
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
        if (e.button !== 0) return;
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
      if (e.button !== 0) return;
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
      if (e.button !== 0) return; // Only primary button drags/selects card; right-click pans notebook
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

  selectCard(cardId, updateProps = true) {
    this.selectedCardId = cardId;
    this.deselectSvgElement(false);
    document.querySelectorAll('.board-card').forEach((c) => c.classList.remove('selected'));
    const cardEl = document.getElementById(`card-${cardId}`);
    if (cardEl) cardEl.classList.add('selected');
    if (updateProps) this.updatePropertiesPanel();
  }

  deselectCard(updateProps = true) {
    this.selectedCardId = null;
    document.querySelectorAll('.board-card').forEach((c) => c.classList.remove('selected'));
    if (updateProps) this.updatePropertiesPanel();
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

  calculateStarPoints(x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.42;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return pts.join(' ');
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
      } else if (elem.type === 'triangle') {
        this.renderTriangleElement(elem);
      } else if (elem.type === 'diamond') {
        this.renderDiamondElement(elem);
      } else if (elem.type === 'star') {
        this.renderStarElement(elem);
      } else if (elem.type === 'line') {
        this.renderLineElement(elem);
      } else if (elem.type === 'arrow') {
        this.renderArrowElement(elem);
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
    path.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) path.setAttribute('stroke-dasharray', '6 4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.classList.add('canvas-svg-item');
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
    rect.setAttribute('fill', elem.fill || 'rgba(56, 189, 248, 0.05)');
    rect.setAttribute('stroke', elem.color || '#3b82f6');
    rect.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) rect.setAttribute('stroke-dasharray', '6 4');
    rect.setAttribute('rx', 4);
    rect.classList.add('canvas-svg-item');
    rect.id = elem.id;

    rect.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    rect.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForShapeText(elem);
    });

    this.svgShapesGroup.appendChild(rect);

    if (elem.text) {
      this.renderShapeText(elem, elem.x + elem.w / 2, elem.y + elem.h / 2);
    }
  }

  renderEllipseElement(elem) {
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', elem.cx);
    ellipse.setAttribute('cy', elem.cy);
    ellipse.setAttribute('rx', elem.rx);
    ellipse.setAttribute('ry', elem.ry);
    ellipse.setAttribute('fill', elem.fill || 'rgba(56, 189, 248, 0.05)');
    ellipse.setAttribute('stroke', elem.color || '#3b82f6');
    ellipse.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) ellipse.setAttribute('stroke-dasharray', '6 4');
    ellipse.classList.add('canvas-svg-item');
    ellipse.id = elem.id;

    ellipse.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    ellipse.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForShapeText(elem);
    });

    this.svgShapesGroup.appendChild(ellipse);

    if (elem.text) {
      this.renderShapeText(elem, elem.cx, elem.cy);
    }
  }

  renderTriangleElement(elem) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = `${elem.x + elem.w / 2},${elem.y} ${elem.x + elem.w},${elem.y + elem.h} ${elem.x},${elem.y + elem.h}`;
    poly.setAttribute('points', points);
    poly.setAttribute('fill', elem.fill || 'rgba(56, 189, 248, 0.05)');
    poly.setAttribute('stroke', elem.color || '#3b82f6');
    poly.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) poly.setAttribute('stroke-dasharray', '6 4');
    poly.classList.add('canvas-svg-item');
    poly.id = elem.id;

    poly.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    poly.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForShapeText(elem);
    });

    this.svgShapesGroup.appendChild(poly);

    if (elem.text) {
      this.renderShapeText(elem, elem.x + elem.w / 2, elem.y + elem.h * 0.62);
    }
  }

  renderDiamondElement(elem) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = `${elem.x + elem.w / 2},${elem.y} ${elem.x + elem.w},${elem.y + elem.h / 2} ${elem.x + elem.w / 2},${elem.y + elem.h} ${elem.x},${elem.y + elem.h / 2}`;
    poly.setAttribute('points', points);
    poly.setAttribute('fill', elem.fill || 'rgba(56, 189, 248, 0.05)');
    poly.setAttribute('stroke', elem.color || '#3b82f6');
    poly.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) poly.setAttribute('stroke-dasharray', '6 4');
    poly.classList.add('canvas-svg-item');
    poly.id = elem.id;

    poly.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    poly.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForShapeText(elem);
    });

    this.svgShapesGroup.appendChild(poly);

    if (elem.text) {
      this.renderShapeText(elem, elem.x + elem.w / 2, elem.y + elem.h / 2);
    }
  }

  renderStarElement(elem) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = this.calculateStarPoints(elem.x, elem.y, elem.w, elem.h);
    poly.setAttribute('points', points);
    poly.setAttribute('fill', elem.fill || 'rgba(56, 189, 248, 0.05)');
    poly.setAttribute('stroke', elem.color || '#3b82f6');
    poly.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) poly.setAttribute('stroke-dasharray', '6 4');
    poly.classList.add('canvas-svg-item');
    poly.id = elem.id;

    poly.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    poly.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.promptForShapeText(elem);
    });

    this.svgShapesGroup.appendChild(poly);

    if (elem.text) {
      this.renderShapeText(elem, elem.x + elem.w / 2, elem.y + elem.h / 2);
    }
  }

  renderLineElement(elem) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', elem.x1);
    line.setAttribute('y1', elem.y1);
    line.setAttribute('x2', elem.x2);
    line.setAttribute('y2', elem.y2);
    line.setAttribute('stroke', elem.color || '#3b82f6');
    line.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('stroke-linecap', 'round');
    line.classList.add('canvas-svg-item');
    line.id = elem.id;

    line.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgShapesGroup.appendChild(line);
  }

  renderArrowElement(elem) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', elem.x1);
    line.setAttribute('y1', elem.y1);
    line.setAttribute('x2', elem.x2);
    line.setAttribute('y2', elem.y2);
    line.setAttribute('stroke', elem.color || '#3b82f6');
    line.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.classList.add('canvas-svg-item');
    line.id = elem.id;

    line.addEventListener('click', (e) => {
      if (this.currentTool === 'select') {
        e.stopPropagation();
        this.selectSvgElement(elem.id);
      }
    });

    this.svgShapesGroup.appendChild(line);
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
    path.setAttribute('stroke-width', elem.stroke_width || elem.width || 2);
    if (elem.dash) path.setAttribute('stroke-dasharray', '6 4');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.classList.add('canvas-svg-item');
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
    text.setAttribute('font-size', `${elem.font_size || 18}px`);
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.setAttribute('dominant-baseline', 'hanging');
    text.setAttribute('stroke', 'transparent');
    text.setAttribute('stroke-width', '10px');
    text.setAttribute('paint-order', 'stroke fill');
    text.classList.add('canvas-svg-item');
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

  renderShapeText(elem, cx, cy) {
    if (!elem.text) return;
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', cx);
    textEl.setAttribute('y', cy);
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'central');
    textEl.setAttribute('fill', elem.text_color || this.getContrastColor(elem.fill || '#0f172a'));
    textEl.setAttribute('font-size', `${elem.font_size || 14}px`);
    textEl.setAttribute('font-weight', '600');
    textEl.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    textEl.classList.add('shape-embedded-text');
    textEl.style.pointerEvents = 'none';
    textEl.style.userSelect = 'none';

    const lines = (elem.text || '').split('\n');
    if (lines.length <= 1) {
      textEl.textContent = elem.text;
    } else {
      const lineHeight = (elem.font_size || 14) * 1.3;
      const totalH = (lines.length - 1) * lineHeight;
      const startY = cy - totalH / 2;
      lines.forEach((line, i) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', cx);
        tspan.setAttribute('y', startY + i * lineHeight);
        tspan.textContent = line || ' ';
        textEl.appendChild(tspan);
      });
    }
    this.svgShapesGroup.appendChild(textEl);
  }

  getContrastColor(colorStr) {
    if (!colorStr || colorStr.startsWith('rgba') || colorStr === 'transparent') {
      return '#f8fafc';
    }
    if (colorStr.startsWith('#')) {
      const hex = colorStr.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq >= 150 ? '#0f172a' : '#f8fafc';
    }
    return '#f8fafc';
  }

  promptForShapeText(elem) {
    let cx = elem.x !== undefined ? elem.x + (elem.w || 100) / 2 : (elem.cx || 100);
    let cy = elem.y !== undefined ? elem.y + (elem.h || 100) / 2 : (elem.cy || 100);
    const existing = elem.text || '';

    if (this.activeInlineEditor) {
      this.activeInlineEditor.commit();
      this.activeInlineEditor = null;
    }
    document.querySelectorAll('.canvas-inline-editor').forEach((el) => el.remove());

    const editor = document.createElement('textarea');
    editor.className = 'canvas-inline-editor';
    editor.placeholder = 'Type shape label...';
    editor.value = existing;

    const screenPos = this.worldToScreen(cx, cy);
    const rect = this.viewport.getBoundingClientRect();
    const width = Math.max(130, Math.min(320, (elem.w ? elem.w * this.zoom - 16 : 160)));
    editor.style.left = `${screenPos.x - rect.left - width / 2}px`;
    editor.style.top = `${screenPos.y - rect.top - 20}px`;
    editor.style.width = `${width}px`;
    editor.style.fontSize = `${Math.max(12, Math.round((elem.font_size || 14) * this.zoom))}px`;
    editor.style.textAlign = 'center';

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      this.activeInlineEditor = null;
      elem.text = editor.value.trim();
      editor.remove();
      this.renderDrawingElements();
      this.renderSvgSelectionOutline();
      this.debounceSaveDrawing();
      this.updatePropertiesPanel();
    };

    this.activeInlineEditor = { editor, worldX: cx, worldY: cy, commit };

    editor.addEventListener('pointerdown', (e) => e.stopPropagation());
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.activeInlineEditor = null;
        editor.remove();
      }
    });
    editor.addEventListener('blur', commit);

    this.viewport.appendChild(editor);
    setTimeout(() => {
      editor.focus();
      editor.select();
    }, 25);
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

    const strokeColor = this.currentColor || '#3b82f6';
    const strokeWidth = this.currentStrokeWidth || 2;

    if (this.currentTool === 'rect') {
      const x = Math.min(this.activeShapeStart.x, worldPos.x);
      const y = Math.min(this.activeShapeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - this.activeShapeStart.x);
      const h = Math.abs(worldPos.y - this.activeShapeStart.y);

      this.svgActiveStrokeGroup.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56, 189, 248, 0.08)" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'ellipse') {
      const cx = (this.activeShapeStart.x + worldPos.x) / 2;
      const cy = (this.activeShapeStart.y + worldPos.y) / 2;
      const rx = Math.abs(worldPos.x - this.activeShapeStart.x) / 2;
      const ry = Math.abs(worldPos.y - this.activeShapeStart.y) / 2;

      this.svgActiveStrokeGroup.innerHTML = `
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(56, 189, 248, 0.08)" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'triangle') {
      const x = Math.min(this.activeShapeStart.x, worldPos.x);
      const y = Math.min(this.activeShapeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - this.activeShapeStart.x);
      const h = Math.abs(worldPos.y - this.activeShapeStart.y);
      const pts = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;

      this.svgActiveStrokeGroup.innerHTML = `
        <polygon points="${pts}" fill="rgba(56, 189, 248, 0.08)" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'diamond') {
      const x = Math.min(this.activeShapeStart.x, worldPos.x);
      const y = Math.min(this.activeShapeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - this.activeShapeStart.x);
      const h = Math.abs(worldPos.y - this.activeShapeStart.y);
      const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;

      this.svgActiveStrokeGroup.innerHTML = `
        <polygon points="${pts}" fill="rgba(56, 189, 248, 0.08)" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'star') {
      const x = Math.min(this.activeShapeStart.x, worldPos.x);
      const y = Math.min(this.activeShapeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - this.activeShapeStart.x);
      const h = Math.abs(worldPos.y - this.activeShapeStart.y);
      const pts = this.calculateStarPoints(x, y, w, h);

      this.svgActiveStrokeGroup.innerHTML = `
        <polygon points="${pts}" fill="rgba(56, 189, 248, 0.08)" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'line') {
      this.svgActiveStrokeGroup.innerHTML = `
        <line x1="${this.activeShapeStart.x}" y1="${this.activeShapeStart.y}" x2="${worldPos.x}" y2="${worldPos.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>
      `;
    } else if (this.currentTool === 'arrow') {
      this.svgActiveStrokeGroup.innerHTML = `
        <line x1="${this.activeShapeStart.x}" y1="${this.activeShapeStart.y}" x2="${worldPos.x}" y2="${worldPos.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="3 3" marker-end="url(#arrowhead)"/>
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
  selectSvgElement(elementId, updateProps = true) {
    this.selectedElement = elementId;
    this.deselectCard(false);
    this.renderSvgSelectionOutline();
    if (updateProps) this.updatePropertiesPanel();
  }

  deselectSvgElement(updateProps = true) {
    this.selectedElement = null;
    if (this.svgSelectionGroup) {
      this.svgSelectionGroup.innerHTML = '';
    }
    if (updateProps) this.updatePropertiesPanel();
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
    } else if (['triangle', 'diamond', 'star'].includes(elem.type)) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', elem.x - 4);
      rect.setAttribute('y', elem.y - 4);
      rect.setAttribute('width', elem.w + 8);
      rect.setAttribute('height', elem.h + 8);
      rect.setAttribute('rx', 4);
      rect.setAttribute('class', 'svg-selection-outline');
      this.svgSelectionGroup.appendChild(rect);
    } else if (elem.type === 'line' || elem.type === 'arrow') {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', elem.x1);
      line.setAttribute('y1', elem.y1);
      line.setAttribute('x2', elem.x2);
      line.setAttribute('y2', elem.y2);
      line.setAttribute('class', 'svg-selection-outline');
      line.setAttribute('stroke-width', (elem.stroke_width || elem.width || 2) + 4);
      this.svgSelectionGroup.appendChild(line);
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
      this.updatePropertiesPanel();
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
        this.updatePropertiesPanel();
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
        this.updatePropertiesPanel();
      })
      .catch((err) => console.error('Failed to delete board item', err));
  }

  // ===================================================
  // CONTEXT MENU (STATIONARY RIGHT-CLICK ACTIONS)
  // ===================================================

  handleRightClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const targetCard = e.target.closest('.board-card');
    let cardId = null;
    if (targetCard) {
      cardId = parseInt(targetCard.id.replace('card-', ''), 10);
    }

    let svgId = null;
    const targetSvg = e.target.closest('#canvas-svg path, #canvas-svg rect, #canvas-svg ellipse, #canvas-svg line, #canvas-svg polygon, #canvas-svg text');
    if (targetSvg && targetSvg.id && targetSvg.id !== 'canvas-grid-pattern' && this.drawingData.some((d) => d.id === targetSvg.id)) {
      svgId = targetSvg.id;
    }

    this.openContextMenu(e.clientX, e.clientY, cardId, svgId);
  }

  openContextMenu(screenX, screenY, cardId = null, svgId = null) {
    if (!this.contextMenu) return;
    this.contextMenu.innerHTML = '';

    if (cardId) {
      this.selectCard(cardId);
      this.renderCardContextMenu(cardId);
    } else if (svgId) {
      this.selectSvgElement(svgId);
      this.renderSvgContextMenu(svgId);
    } else {
      this.renderBoardContextMenu();
    }

    this.contextMenu.style.display = 'flex';

    // Position menu within viewport bounds
    const pad = 10;
    const menuW = 210;
    const menuH = 260;
    let posX = screenX;
    let posY = screenY;

    if (posX + menuW > window.innerWidth - pad) {
      posX = window.innerWidth - menuW - pad;
    }
    if (posY + menuH > window.innerHeight - pad) {
      posY = window.innerHeight - menuH - pad;
    }

    this.contextMenu.style.left = `${Math.max(pad, posX)}px`;
    this.contextMenu.style.top = `${Math.max(pad, posY)}px`;
  }

  closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
      this.contextMenu.innerHTML = '';
    }
  }

  createContextMenuItem(icon, text, shortcut, onClick, isDanger = false) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `context-menu-item ${isDanger ? 'danger' : ''}`;

    const left = document.createElement('span');
    left.className = 'context-menu-left';
    left.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
    item.appendChild(left);

    if (shortcut) {
      const sc = document.createElement('span');
      sc.className = 'context-menu-shortcut';
      sc.textContent = shortcut;
      item.appendChild(sc);
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeContextMenu();
      if (typeof onClick === 'function') onClick();
    });

    return item;
  }

  createContextMenuDivider() {
    const div = document.createElement('div');
    div.className = 'context-menu-divider';
    return div;
  }

  createContextMenuColors(onColorSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-colors';
    const colors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecaca', '#38bdf8', '#334155'];
    colors.forEach((c) => {
      const dot = document.createElement('div');
      dot.className = 'context-color-dot';
      dot.style.backgroundColor = c;
      dot.title = c;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeContextMenu();
        if (typeof onColorSelect === 'function') onColorSelect(c);
      });
      wrap.appendChild(dot);
    });
    return wrap;
  }

  applyColorToSelected(color) {
    this.currentColor = color;
    if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        card.color = color;
        const cardEl = document.getElementById(`card-${card.id}`);
        if (cardEl) {
          if (card.entity_type === 'note') {
            cardEl.style.backgroundColor = color;
          } else {
            cardEl.style.borderColor = color;
            cardEl.style.borderTopColor = color;
          }
        }
        this.saveCardColor(card);
        this.updatePropertiesPanel();
      }
    } else if (this.selectedElement) {
      const elem = this.drawingData.find((d) => d.id === this.selectedElement);
      if (elem) {
        elem.color = color;
        this.renderDrawingElements();
        this.renderSvgSelectionOutline();
        this.debounceSaveDrawing();
        this.updatePropertiesPanel();
      }
    }
  }

  renderCardContextMenu(cardId) {
    const card = this.items.find((i) => i.id === cardId);
    if (!card) return;

    this.contextMenu.appendChild(this.createContextMenuItem('fa-copy', 'Copy', 'Ctrl+C', () => this.copySelected()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-clone', 'Duplicate', 'Ctrl+D', () => this.duplicateSelected()));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuItem('fa-arrow-up', 'Bring Forward', '', () => this.bringForward()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-arrow-down', 'Send Backward', '', () => this.sendBackward()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-angles-up', 'Bring to Front', '', () => this.bringToFront()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-angles-down', 'Send to Back', '', () => this.sendToBack()));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuColors((color) => this.applyColorToSelected(color)));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuItem('fa-trash-can', 'Delete Card', 'Del', () => this.deleteSelected(), true));
  }

  renderSvgContextMenu(svgId) {
    const elem = this.drawingData.find((d) => d.id === svgId);
    if (!elem) return;

    if (['rect', 'ellipse', 'triangle', 'diamond', 'star'].includes(elem.type)) {
      this.contextMenu.appendChild(this.createContextMenuItem('fa-font', 'Edit Label', '', () => this.promptForShapeText(elem)));
    } else if (elem.type === 'text') {
      this.contextMenu.appendChild(this.createContextMenuItem('fa-font', 'Edit Text', '', () => this.promptForText(elem.x, elem.y, elem)));
    }

    this.contextMenu.appendChild(this.createContextMenuItem('fa-copy', 'Copy', 'Ctrl+C', () => this.copySelected()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-clone', 'Duplicate', 'Ctrl+D', () => this.duplicateSelected()));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuItem('fa-arrow-up', 'Bring Forward', '', () => this.bringForward()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-arrow-down', 'Send Backward', '', () => this.sendBackward()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-angles-up', 'Bring to Front', '', () => this.bringToFront()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-angles-down', 'Send to Back', '', () => this.sendToBack()));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuColors((color) => this.applyColorToSelected(color)));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuItem('fa-trash-can', 'Delete Element', 'Del', () => this.deleteSelected(), true));
  }

  renderBoardContextMenu() {
    if (this.clipboardItem) {
      this.contextMenu.appendChild(this.createContextMenuItem('fa-paste', 'Paste', 'Ctrl+V', () => this.pasteCopiedItem(this.lastMouseWorldPos)));
      this.contextMenu.appendChild(this.createContextMenuDivider());
    }

    this.contextMenu.appendChild(this.createContextMenuItem('fa-note-sticky', 'New Sticky Note', 'N', () => this.createStickyAt(this.lastMouseWorldPos.x, this.lastMouseWorldPos.y)));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-font', 'Add Text', 'T', () => this.promptForText(this.lastMouseWorldPos.x, this.lastMouseWorldPos.y)));
    this.contextMenu.appendChild(this.createContextMenuDivider());

    this.contextMenu.appendChild(this.createContextMenuItem('fa-expand', 'Fit to View', '', () => this.fitAll()));
    this.contextMenu.appendChild(this.createContextMenuItem('fa-rotate', 'Reset Zoom', '', () => this.resetZoom()));
  }

  // ===================================================
  // LAYER ORDERING (BRING FORWARD / SEND BACKWARD)
  // ===================================================

  bringForward() {
    if (this.selectedElement) {
      const idx = this.drawingData.findIndex((d) => d.id === this.selectedElement);
      if (idx !== -1 && idx < this.drawingData.length - 1) {
        const item = this.drawingData.splice(idx, 1)[0];
        this.drawingData.splice(idx + 1, 0, item);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
        this.updatePropertiesPanel();
      }
    } else if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        card.z_index = (card.z_index || 1) + 1;
        const el = document.getElementById(`card-${card.id}`);
        if (el) el.style.zIndex = `${card.z_index}`;
        this.saveCardZIndex(card);
        this.updatePropertiesPanel();
      }
    }
  }

  sendBackward() {
    if (this.selectedElement) {
      const idx = this.drawingData.findIndex((d) => d.id === this.selectedElement);
      if (idx > 0) {
        const item = this.drawingData.splice(idx, 1)[0];
        this.drawingData.splice(idx - 1, 0, item);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
        this.updatePropertiesPanel();
      }
    } else if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        card.z_index = Math.max(1, (card.z_index || 1) - 1);
        const el = document.getElementById(`card-${card.id}`);
        if (el) el.style.zIndex = `${card.z_index}`;
        this.saveCardZIndex(card);
        this.updatePropertiesPanel();
      }
    }
  }

  bringToFront() {
    if (this.selectedElement) {
      const idx = this.drawingData.findIndex((d) => d.id === this.selectedElement);
      if (idx !== -1 && idx < this.drawingData.length - 1) {
        const item = this.drawingData.splice(idx, 1)[0];
        this.drawingData.push(item);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
        this.updatePropertiesPanel();
      }
    } else if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        const maxZ = this.items.reduce((max, i) => Math.max(max, i.z_index || 1), 1);
        card.z_index = maxZ + 1;
        const el = document.getElementById(`card-${card.id}`);
        if (el) el.style.zIndex = `${card.z_index}`;
        this.saveCardZIndex(card);
        this.updatePropertiesPanel();
      }
    }
  }

  sendToBack() {
    if (this.selectedElement) {
      const idx = this.drawingData.findIndex((d) => d.id === this.selectedElement);
      if (idx > 0) {
        const item = this.drawingData.splice(idx, 1)[0];
        this.drawingData.unshift(item);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
        this.updatePropertiesPanel();
      }
    } else if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        const minZ = this.items.reduce((min, i) => Math.min(min, i.z_index || 1), 1);
        card.z_index = Math.max(1, minZ - 1);
        const el = document.getElementById(`card-${card.id}`);
        if (el) el.style.zIndex = `${card.z_index}`;
        this.saveCardZIndex(card);
        this.updatePropertiesPanel();
      }
    }
  }

  saveCardZIndex(card) {
    if (!this.board) return;
    fetch(`/api/boards/${this.board.id}/items/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ z_index: card.z_index }),
    }).catch((err) => console.error('Failed to save card z_index', err));
  }

  // ===================================================
  // CLIPBOARD COPY / PASTE / DUPLICATE / IMAGE PASTE
  // ===================================================

  copySelected() {
    if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        this.clipboardItem = {
          type: 'card',
          data: JSON.parse(JSON.stringify(card)),
        };
        if (typeof showToast === 'function') showToast('Card copied to clipboard');
      }
    } else if (this.selectedElement) {
      const elem = this.drawingData.find((d) => d.id === this.selectedElement);
      if (elem) {
        this.clipboardItem = {
          type: 'svg',
          data: JSON.parse(JSON.stringify(elem)),
        };
        if (typeof showToast === 'function') showToast('Element copied to clipboard');
      }
    }
  }

  duplicateSelected() {
    this.copySelected();
    this.pasteCopiedItem(null, 30, 30);
  }

  pasteCopiedItem(pos = null, offX = 30, offY = 30) {
    if (!this.clipboardItem) return;

    if (this.clipboardItem.type === 'svg') {
      const original = this.clipboardItem.data;
      const clone = JSON.parse(JSON.stringify(original));
      clone.id = `${clone.type}-${Date.now()}`;

      if (pos) {
        if (clone.x !== undefined) {
          clone.x = pos.x;
          clone.y = pos.y;
        } else if (clone.cx !== undefined) {
          clone.cx = pos.x;
          clone.cy = pos.y;
        } else if (clone.x1 !== undefined) {
          const dx = pos.x - clone.x1;
          const dy = pos.y - clone.y1;
          clone.x1 += dx;
          clone.y1 += dy;
          clone.x2 += dx;
          clone.y2 += dy;
        } else if (clone.points && clone.points.length > 0) {
          const dx = pos.x - clone.points[0].x;
          const dy = pos.y - clone.points[0].y;
          clone.points.forEach((p) => {
            p.x += dx;
            p.y += dy;
          });
        }
      } else {
        if (clone.x !== undefined) {
          clone.x += offX;
          clone.y += offY;
        } else if (clone.cx !== undefined) {
          clone.cx += offX;
          clone.cy += offY;
        } else if (clone.x1 !== undefined) {
          clone.x1 += offX;
          clone.y1 += offY;
          clone.x2 += offX;
          clone.y2 += offY;
        } else if (clone.points) {
          clone.points.forEach((p) => {
            p.x += offX;
            p.y += offY;
          });
        }
      }

      this.pushDrawingElement(clone);
      this.selectSvgElement(clone.id);
      if (typeof showToast === 'function') showToast('Pasted element');
    } else if (this.clipboardItem.type === 'card') {
      const card = this.clipboardItem.data;
      const targetX = pos ? pos.x : card.pos_x + offX;
      const targetY = pos ? pos.y : card.pos_y + offY;

      const payload = {
        entity_type: card.entity_type,
        entity_id: card.entity_id,
        note_text: card.note_text,
        color: card.color,
        pos_x: Math.round(targetX),
        pos_y: Math.round(targetY),
        width: card.width || 240,
        height: card.height || 160,
      };

      fetch(`/api/boards/${this.board.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((createdItem) => {
          this.items.push(createdItem);
          this.renderCards();
          this.selectCard(createdItem.id);
          if (typeof showToast === 'function') showToast('Pasted card');
        })
        .catch((err) => console.error('Failed to paste card', err));
    }
  }

  async handlePaste(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await this.uploadAndPinImage(file, 'clipboard-image.png', this.lastMouseWorldPos);
          return;
        }
      }
    }

    if (this.clipboardItem) {
      e.preventDefault();
      this.pasteCopiedItem(this.lastMouseWorldPos);
      return;
    }

    const text = e.clipboardData?.getData('text');
    if (text && text.trim()) {
      e.preventDefault();
      const clean = text.trim();
      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        const projectId = (window.state && window.state.activeProjectId) ? window.state.activeProjectId : 1;
        fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            url: clean,
            title: clean,
          }),
        })
          .then((res) => res.json())
          .then((link) => {
            this.pinEntityAt('link', link.id, this.lastMouseWorldPos.x - 120, this.lastMouseWorldPos.y - 80);
          })
          .catch(() => {
            this.createStickyNoteWithText(clean, this.lastMouseWorldPos.x, this.lastMouseWorldPos.y);
          });
      } else {
        this.createStickyNoteWithText(clean, this.lastMouseWorldPos.x, this.lastMouseWorldPos.y);
      }
    }
  }

  createStickyNoteWithText(text, x, y) {
    if (!this.board) return;
    const noteData = {
      entity_type: 'note',
      note_text: text,
      pos_x: Math.round(x - 100),
      pos_y: Math.round(y - 75),
      width: Math.min(320, Math.max(220, text.length * 4)),
      height: Math.min(300, Math.max(160, (text.split('\n').length + 2) * 28)),
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
        if (typeof showToast === 'function') showToast('Created sticky note from clipboard');
      })
      .catch((err) => console.error('Failed to create sticky note from paste', err));
  }

  async uploadAndPinImage(file, name, pos) {
    try {
      if (typeof showToast === 'function') showToast('Uploading image to board...');
      const formData = new FormData();
      formData.append('file', file, name || 'pasted-image.png');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to upload image file');
      const uploadData = await res.json();

      const projectId = (window.state && window.state.activeProjectId) ? window.state.activeProjectId : 1;
      const linkRes = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          url: uploadData.url,
          title: name || 'Pasted Image',
          thumbnail_url: uploadData.url,
          platform: 'image',
        }),
      });
      if (!linkRes.ok) throw new Error('Failed to create image link');
      const link = await linkRes.json();

      const targetX = pos ? pos.x - 120 : 100;
      const targetY = pos ? pos.y - 80 : 100;
      this.pinEntityAt('link', link.id, targetX, targetY);
      if (typeof showToast === 'function') showToast('Image pinned to canvas');
    } catch (err) {
      console.error('Failed to upload and pin image', err);
      if (typeof showToast === 'function') showToast(`Image paste error: ${err.message}`, 'error');
    }
  }

  // ===================================================
  // PROPERTIES PANEL & DRAWER PROPERTIES TAB
  // ===================================================

  updatePropertiesPanel() {
    if (this.propertiesPanel && this.propertiesPanel.style.display !== 'none' && this.propertiesContent) {
      this.renderPropertiesContent(this.propertiesContent, this.propBadgeType);
    }
    const activeDrawerTab = document.querySelector('.drawer-tab.active')?.dataset.drawerTab;
    if (activeDrawerTab === 'properties') {
      const drawerList = document.getElementById('drawer-items-list');
      if (drawerList) {
        this.renderPropertiesContent(drawerList);
      }
    }
  }

  renderDrawerProperties(container) {
    this.renderPropertiesContent(container);
  }

  renderPropertiesContent(container, badgeEl = null) {
    if (!container) return;
    container.innerHTML = '';

    if (this.selectedCardId) {
      const card = this.items.find((i) => i.id === this.selectedCardId);
      if (card) {
        if (badgeEl) badgeEl.textContent = (card.entity_type || 'card').toUpperCase();
        this.renderCardProperties(container, card);
        return;
      }
    }

    if (this.selectedElement) {
      const elem = this.drawingData.find((d) => d.id === this.selectedElement);
      if (elem) {
        if (badgeEl) badgeEl.textContent = (elem.type || 'element').toUpperCase();
        this.renderSvgProperties(container, elem);
        return;
      }
    }

    if (badgeEl) badgeEl.textContent = 'BOARD';
    this.renderBoardProperties(container);
  }

  renderCardProperties(container, card) {
    const rawType = (card.entity_type || 'note').toUpperCase();

    // Section 1: Dimensions
    const secCoords = document.createElement('div');
    secCoords.className = 'prop-section';
    secCoords.innerHTML = `<span class="prop-section-label">Position & Size</span>`;

    const rowPos = document.createElement('div');
    rowPos.className = 'prop-row-2col';
    rowPos.innerHTML = `
      <div class="prop-input-wrap"><span class="prop-prefix">X</span><input type="number" class="prop-input" id="prop-card-x" value="${Math.round(card.pos_x)}"></div>
      <div class="prop-input-wrap"><span class="prop-prefix">Y</span><input type="number" class="prop-input" id="prop-card-y" value="${Math.round(card.pos_y)}"></div>
    `;
    secCoords.appendChild(rowPos);

    const rowDim = document.createElement('div');
    rowDim.className = 'prop-row-2col';
    rowDim.innerHTML = `
      <div class="prop-input-wrap"><span class="prop-prefix">W</span><input type="number" class="prop-input" id="prop-card-w" value="${Math.round(card.width || 240)}"></div>
      <div class="prop-input-wrap"><span class="prop-prefix">H</span><input type="number" class="prop-input" id="prop-card-h" value="${Math.round(card.height || 160)}"></div>
    `;
    secCoords.appendChild(rowDim);
    container.appendChild(secCoords);

    // Wire position / dimension inputs
    const cardEl = document.getElementById(`card-${card.id}`);
    rowPos.querySelector('#prop-card-x').addEventListener('change', (e) => {
      card.pos_x = parseFloat(e.target.value) || 0;
      if (cardEl) cardEl.style.left = `${card.pos_x}px`;
      this.saveCardPosition(card);
      this.renderConnectors();
    });
    rowPos.querySelector('#prop-card-y').addEventListener('change', (e) => {
      card.pos_y = parseFloat(e.target.value) || 0;
      if (cardEl) cardEl.style.top = `${card.pos_y}px`;
      this.saveCardPosition(card);
      this.renderConnectors();
    });
    rowDim.querySelector('#prop-card-w').addEventListener('change', (e) => {
      card.width = Math.max(140, parseFloat(e.target.value) || 240);
      if (cardEl) cardEl.style.width = `${card.width}px`;
      this.saveCardDimensions(card);
      this.renderConnectors();
    });
    rowDim.querySelector('#prop-card-h').addEventListener('change', (e) => {
      card.height = Math.max(80, parseFloat(e.target.value) || 160);
      if (cardEl) cardEl.style.height = `${card.height}px`;
      this.saveCardDimensions(card);
      this.renderConnectors();
    });

    // Section 2: Color
    const secColor = document.createElement('div');
    secColor.className = 'prop-section';
    secColor.innerHTML = `<span class="prop-section-label">Accent Color</span>`;
    const swatches = document.createElement('div');
    swatches.className = 'prop-swatches';
    const cardColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecaca', '#38bdf8', '#334155'];
    cardColors.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = `prop-swatch ${card.color === c ? 'active' : ''}`;
      sw.style.backgroundColor = c;
      sw.addEventListener('click', () => {
        swatches.querySelectorAll('.prop-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        this.applyColorToSelected(c);
      });
      swatches.appendChild(sw);
    });
    secColor.appendChild(swatches);
    container.appendChild(secColor);

    // Section 3: Note Content (if note)
    if (card.entity_type === 'note') {
      const secText = document.createElement('div');
      secText.className = 'prop-section';
      secText.innerHTML = `<span class="prop-section-label">Sticky Content</span>`;
      const textarea = document.createElement('textarea');
      textarea.className = 'prop-textarea';
      textarea.value = card.note_text || '';
      textarea.placeholder = 'Type note text...';
      textarea.addEventListener('input', (e) => {
        card.note_text = e.target.value;
        const domNote = cardEl?.querySelector('.sticky-textarea');
        if (domNote) domNote.value = card.note_text;
        this.debounceSaveNoteText(card);
      });
      secText.appendChild(textarea);
      container.appendChild(secText);
    }

    // Section 4: Layer Ordering
    const secLayer = document.createElement('div');
    secLayer.className = 'prop-section';
    secLayer.innerHTML = `<span class="prop-section-label">Layer Stacking</span>`;
    const btnGroup = document.createElement('div');
    btnGroup.className = 'prop-btn-group';

    const btnFwd = document.createElement('button');
    btnFwd.className = 'prop-btn';
    btnFwd.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Forward';
    btnFwd.addEventListener('click', () => this.bringForward());

    const btnBack = document.createElement('button');
    btnBack.className = 'prop-btn';
    btnBack.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Backward';
    btnBack.addEventListener('click', () => this.sendBackward());

    btnGroup.appendChild(btnFwd);
    btnGroup.appendChild(btnBack);
    secLayer.appendChild(btnGroup);
    container.appendChild(secLayer);

    // Section 5: Delete Action
    const secDel = document.createElement('div');
    secDel.className = 'prop-section';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.style.width = '100%';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete Card';
    delBtn.addEventListener('click', () => this.deleteSelected());
    secDel.appendChild(delBtn);
    container.appendChild(secDel);
  }

  renderSvgProperties(container, elem) {
    const isGeomShape = ['rect', 'ellipse', 'triangle', 'diamond', 'star'].includes(elem.type);
    const isLineOrArrow = ['line', 'arrow'].includes(elem.type);

    // Section 1: Dimensions / Coordinates
    const secCoords = document.createElement('div');
    secCoords.className = 'prop-section';
    secCoords.innerHTML = `<span class="prop-section-label">Geometry</span>`;

    if (elem.type === 'rect' || elem.type === 'triangle' || elem.type === 'diamond' || elem.type === 'star') {
      const row1 = document.createElement('div');
      row1.className = 'prop-row-2col';
      row1.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">X</span><input type="number" class="prop-input" id="prop-svg-x" value="${Math.round(elem.x)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">Y</span><input type="number" class="prop-input" id="prop-svg-y" value="${Math.round(elem.y)}"></div>
      `;
      const row2 = document.createElement('div');
      row2.className = 'prop-row-2col';
      row2.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">W</span><input type="number" class="prop-input" id="prop-svg-w" value="${Math.round(elem.w)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">H</span><input type="number" class="prop-input" id="prop-svg-h" value="${Math.round(elem.h)}"></div>
      `;
      secCoords.appendChild(row1);
      secCoords.appendChild(row2);

      row1.querySelector('#prop-svg-x').addEventListener('change', (e) => {
        elem.x = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row1.querySelector('#prop-svg-y').addEventListener('change', (e) => {
        elem.y = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-w').addEventListener('change', (e) => {
        elem.w = Math.max(10, parseFloat(e.target.value) || 20);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-h').addEventListener('change', (e) => {
        elem.h = Math.max(10, parseFloat(e.target.value) || 20);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
    } else if (elem.type === 'ellipse') {
      const row1 = document.createElement('div');
      row1.className = 'prop-row-2col';
      row1.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">CX</span><input type="number" class="prop-input" id="prop-svg-cx" value="${Math.round(elem.cx)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">CY</span><input type="number" class="prop-input" id="prop-svg-cy" value="${Math.round(elem.cy)}"></div>
      `;
      const row2 = document.createElement('div');
      row2.className = 'prop-row-2col';
      row2.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">RX</span><input type="number" class="prop-input" id="prop-svg-rx" value="${Math.round(elem.rx)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">RY</span><input type="number" class="prop-input" id="prop-svg-ry" value="${Math.round(elem.ry)}"></div>
      `;
      secCoords.appendChild(row1);
      secCoords.appendChild(row2);

      row1.querySelector('#prop-svg-cx').addEventListener('change', (e) => {
        elem.cx = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row1.querySelector('#prop-svg-cy').addEventListener('change', (e) => {
        elem.cy = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-rx').addEventListener('change', (e) => {
        elem.rx = Math.max(5, parseFloat(e.target.value) || 10);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-ry').addEventListener('change', (e) => {
        elem.ry = Math.max(5, parseFloat(e.target.value) || 10);
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
    } else if (isLineOrArrow) {
      const row1 = document.createElement('div');
      row1.className = 'prop-row-2col';
      row1.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">X1</span><input type="number" class="prop-input" id="prop-svg-x1" value="${Math.round(elem.x1)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">Y1</span><input type="number" class="prop-input" id="prop-svg-y1" value="${Math.round(elem.y1)}"></div>
      `;
      const row2 = document.createElement('div');
      row2.className = 'prop-row-2col';
      row2.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">X2</span><input type="number" class="prop-input" id="prop-svg-x2" value="${Math.round(elem.x2)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">Y2</span><input type="number" class="prop-input" id="prop-svg-y2" value="${Math.round(elem.y2)}"></div>
      `;
      secCoords.appendChild(row1);
      secCoords.appendChild(row2);

      row1.querySelector('#prop-svg-x1').addEventListener('change', (e) => {
        elem.x1 = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row1.querySelector('#prop-svg-y1').addEventListener('change', (e) => {
        elem.y1 = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-x2').addEventListener('change', (e) => {
        elem.x2 = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row2.querySelector('#prop-svg-y2').addEventListener('change', (e) => {
        elem.y2 = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
    } else if (elem.type === 'text') {
      const row1 = document.createElement('div');
      row1.className = 'prop-row-2col';
      row1.innerHTML = `
        <div class="prop-input-wrap"><span class="prop-prefix">X</span><input type="number" class="prop-input" id="prop-svg-x" value="${Math.round(elem.x)}"></div>
        <div class="prop-input-wrap"><span class="prop-prefix">Y</span><input type="number" class="prop-input" id="prop-svg-y" value="${Math.round(elem.y)}"></div>
      `;
      secCoords.appendChild(row1);

      row1.querySelector('#prop-svg-x').addEventListener('change', (e) => {
        elem.x = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      row1.querySelector('#prop-svg-y').addEventListener('change', (e) => {
        elem.y = parseFloat(e.target.value) || 0;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
    }
    container.appendChild(secCoords);

    // Section 2: Stroke & Line Style
    const secStroke = document.createElement('div');
    secStroke.className = 'prop-section';
    secStroke.innerHTML = `<span class="prop-section-label">Stroke & Color</span>`;

    const swatches = document.createElement('div');
    swatches.className = 'prop-swatches';
    const strokeColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f8fafc', '#64748b'];
    strokeColors.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = `prop-swatch ${elem.color === c ? 'active' : ''}`;
      sw.style.backgroundColor = c;
      sw.addEventListener('click', () => {
        swatches.querySelectorAll('.prop-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        this.applyColorToSelected(c);
      });
      swatches.appendChild(sw);
    });
    secStroke.appendChild(swatches);

    const rowWidth = document.createElement('div');
    rowWidth.className = 'prop-row';
    rowWidth.style.marginTop = '0.35rem';
    rowWidth.innerHTML = `
      <div class="prop-btn-group" style="flex: 1;">
        <button class="prop-btn ${(elem.stroke_width || elem.width || 2) === 1 ? 'active' : ''}" data-w="1">1px</button>
        <button class="prop-btn ${(elem.stroke_width || elem.width || 2) === 2 ? 'active' : ''}" data-w="2">2px</button>
        <button class="prop-btn ${(elem.stroke_width || elem.width || 2) === 4 ? 'active' : ''}" data-w="4">4px</button>
        <button class="prop-btn ${(elem.stroke_width || elem.width || 2) === 8 ? 'active' : ''}" data-w="8">8px</button>
      </div>
      <button class="prop-btn ${elem.dash ? 'active' : ''}" id="btn-prop-dash" title="Toggle dashed line" style="flex: 0 0 60px;">
        <i class="fa-solid fa-ellipsis"></i> Dash
      </button>
    `;
    rowWidth.querySelectorAll('[data-w]').forEach((btn) => {
      btn.addEventListener('click', () => {
        rowWidth.querySelectorAll('[data-w]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const w = parseInt(btn.dataset.w, 10);
        elem.stroke_width = w;
        elem.width = w;
        this.renderDrawingElements();
        this.renderSvgSelectionOutline();
        this.debounceSaveDrawing();
      });
    });
    rowWidth.querySelector('#btn-prop-dash')?.addEventListener('click', (e) => {
      elem.dash = !elem.dash;
      e.currentTarget.classList.toggle('active', elem.dash);
      this.renderDrawingElements();
      this.renderSvgSelectionOutline();
      this.debounceSaveDrawing();
    });
    secStroke.appendChild(rowWidth);
    container.appendChild(secStroke);

    // Section 3: Fill Color (for geometric shapes)
    if (isGeomShape) {
      const secFill = document.createElement('div');
      secFill.className = 'prop-section';
      secFill.innerHTML = `<span class="prop-section-label">Shape Fill</span>`;

      const fillSwatches = document.createElement('div');
      fillSwatches.className = 'prop-swatches';
      const fills = [
        { label: 'Subtle Sky', val: 'rgba(56, 189, 248, 0.08)' },
        { label: 'Soft Green', val: 'rgba(16, 185, 129, 0.12)' },
        { label: 'Soft Amber', val: 'rgba(245, 158, 11, 0.12)' },
        { label: 'Soft Purple', val: 'rgba(139, 92, 246, 0.12)' },
        { label: 'Soft Rose', val: 'rgba(239, 68, 68, 0.12)' },
        { label: 'Dark Slate', val: 'rgba(15, 23, 42, 0.6)' },
        { label: 'Transparent', val: 'transparent' },
      ];
      fills.forEach((f) => {
        const sw = document.createElement('div');
        sw.className = `prop-swatch ${elem.fill === f.val ? 'active' : ''}`;
        sw.style.backgroundColor = f.val === 'transparent' ? 'rgba(255,255,255,0.05)' : f.val;
        sw.title = f.label;
        sw.addEventListener('click', () => {
          fillSwatches.querySelectorAll('.prop-swatch').forEach((s) => s.classList.remove('active'));
          sw.classList.add('active');
          elem.fill = f.val;
          this.renderDrawingElements();
          this.debounceSaveDrawing();
        });
        fillSwatches.appendChild(sw);
      });
      secFill.appendChild(fillSwatches);
      container.appendChild(secFill);
    }

    // Section 4: Shape Text / Text Element Content
    if (isGeomShape || elem.type === 'text') {
      const secText = document.createElement('div');
      secText.className = 'prop-section';
      secText.innerHTML = `<span class="prop-section-label">${isGeomShape ? 'Shape Label' : 'Text Content'}</span>`;

      const textarea = document.createElement('textarea');
      textarea.className = 'prop-textarea';
      textarea.value = elem.text || '';
      textarea.placeholder = isGeomShape ? 'Type centered shape text...' : 'Type text content...';
      textarea.addEventListener('input', (e) => {
        elem.text = e.target.value;
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      secText.appendChild(textarea);

      const rowFont = document.createElement('div');
      rowFont.className = 'prop-row';
      rowFont.style.marginTop = '0.35rem';
      rowFont.innerHTML = `
        <div class="prop-input-wrap" style="flex: 1;">
          <span class="prop-prefix">Font Size</span>
          <input type="number" class="prop-input" id="prop-font-size" value="${elem.font_size || (isGeomShape ? 14 : 18)}">
        </div>
      `;
      rowFont.querySelector('#prop-font-size').addEventListener('change', (e) => {
        elem.font_size = Math.max(10, Math.min(72, parseInt(e.target.value, 10) || 14));
        this.renderDrawingElements();
        this.debounceSaveDrawing();
      });
      secText.appendChild(rowFont);
      container.appendChild(secText);
    }

    // Section 5: Layer Stacking
    const secLayer = document.createElement('div');
    secLayer.className = 'prop-section';
    secLayer.innerHTML = `<span class="prop-section-label">Layer Stacking</span>`;
    const btnGroup = document.createElement('div');
    btnGroup.className = 'prop-btn-group';

    const btnFwd = document.createElement('button');
    btnFwd.className = 'prop-btn';
    btnFwd.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Forward';
    btnFwd.addEventListener('click', () => this.bringForward());

    const btnBack = document.createElement('button');
    btnBack.className = 'prop-btn';
    btnBack.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Backward';
    btnBack.addEventListener('click', () => this.sendBackward());

    btnGroup.appendChild(btnFwd);
    btnGroup.appendChild(btnBack);
    secLayer.appendChild(btnGroup);
    container.appendChild(secLayer);

    // Section 6: Delete
    const secDel = document.createElement('div');
    secDel.className = 'prop-section';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.style.width = '100%';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete Element';
    delBtn.addEventListener('click', () => this.deleteSelected());
    secDel.appendChild(delBtn);
    container.appendChild(secDel);
  }

  renderBoardProperties(container) {
    if (!this.board) {
      container.innerHTML = '<div class="prop-empty-hint">No active board loaded.</div>';
      return;
    }

    const secInfo = document.createElement('div');
    secInfo.className = 'prop-section';
    secInfo.innerHTML = `
      <span class="prop-section-label">Board Properties</span>
      <div class="prop-input-wrap">
        <span class="prop-prefix">Name</span>
        <input type="text" class="prop-input" id="prop-board-name" value="${this.escapeXml(this.board.name || '')}">
      </div>
    `;
    secInfo.querySelector('#prop-board-name').addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        this.board.name = val;
        if (this.boardTitle) this.boardTitle.textContent = val;
        this.saveBoardSettings();
      }
    });
    container.appendChild(secInfo);

    const secStats = document.createElement('div');
    secStats.className = 'prop-section';
    secStats.innerHTML = `
      <span class="prop-section-label">Board Overview</span>
      <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.25rem;">
        <div><i class="fa-solid fa-layer-group"></i> ${this.items.length} Pinned Cards</div>
        <div><i class="fa-solid fa-shapes"></i> ${this.drawingData.length} Vector Elements</div>
        <div><i class="fa-solid fa-magnifying-glass"></i> Zoom Level: ${Math.round(this.zoom * 100)}%</div>
      </div>
    `;
    container.appendChild(secStats);

    const secActions = document.createElement('div');
    secActions.className = 'prop-section';
    secActions.innerHTML = `<span class="prop-section-label">Quick Actions</span>`;
    const btnFit = document.createElement('button');
    btnFit.className = 'btn btn-secondary btn-sm';
    btnFit.style.width = '100%';
    btnFit.innerHTML = '<i class="fa-solid fa-expand"></i> Fit Canvas View';
    btnFit.addEventListener('click', () => this.fitAll());

    const btnExportPng = document.createElement('button');
    btnExportPng.className = 'btn btn-primary btn-sm';
    btnExportPng.style.width = '100%';
    btnExportPng.style.marginTop = '0.35rem';
    btnExportPng.innerHTML = '<i class="fa-solid fa-file-image"></i> Export Board as PNG';
    btnExportPng.addEventListener('click', () => this.exportBoardAsPng());

    secActions.appendChild(btnFit);
    secActions.appendChild(btnExportPng);
    container.appendChild(secActions);
  }

  // ===================================================
  // BOARD IMAGE EXPORT (PNG RETINA 2X & VECTOR SVG)
  // ===================================================

  getBoardContentBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const item of this.items) {
      minX = Math.min(minX, item.pos_x);
      minY = Math.min(minY, item.pos_y);
      maxX = Math.max(maxX, item.pos_x + (item.width || 240));
      maxY = Math.max(maxY, item.pos_y + (item.height || 160));
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
        maxY = Math.max(maxY, elem.y + (elem.h || 100));
      } else if (elem.cx !== undefined) {
        minX = Math.min(minX, elem.cx - (elem.rx || 50));
        minY = Math.min(minY, elem.cy - (elem.ry || 50));
        maxX = Math.max(maxX, elem.cx + (elem.rx || 50));
        maxY = Math.max(maxY, elem.cy + (elem.ry || 50));
      } else if (elem.x1 !== undefined) {
        minX = Math.min(minX, elem.x1, elem.x2);
        minY = Math.min(minY, elem.y1, elem.y2);
        maxX = Math.max(maxX, elem.x1, elem.x2);
        maxY = Math.max(maxY, elem.y1, elem.y2);
      }
    }

    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = 800; maxY = 600;
    }

    const pad = 60;
    return {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(600, maxX - minX + pad * 2),
      h: Math.max(400, maxY - minY + pad * 2),
    };
  }

  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  drawWrappedText(ctx, text, x, y, maxW, lineH, maxLines = 8) {
    if (!text) return;
    const lines = text.split('\n');
    let lineIdx = 0;

    for (const rawLine of lines) {
      if (lineIdx >= maxLines) break;
      const words = rawLine.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxW && currentLine) {
          ctx.fillText(currentLine, x, y + lineIdx * lineH);
          lineIdx++;
          if (lineIdx >= maxLines) break;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine && lineIdx < maxLines) {
        ctx.fillText(currentLine, x, y + lineIdx * lineH);
        lineIdx++;
      }
    }
  }

  exportBoardAsPng() {
    const bounds = this.getBoardContentBounds();
    const scale = 2; // High-res retina rendering
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bounds.w * scale);
    canvas.height = Math.round(bounds.h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.translate(-bounds.x, -bounds.y);

    // 1. Draw Backdrop
    const backdropStyle = this.board?.canvas_style || 'dot-grid';
    let bgColor = '#0b0f19';
    let dotColor = '#1f2937';

    if (backdropStyle === 'corkboard') {
      bgColor = '#2b1d14';
      dotColor = '#3d2b1f';
    } else if (backdropStyle === 'blueprint') {
      bgColor = '#0d233a';
      dotColor = '#1a3a5f';
    } else if (backdropStyle === 'dark-graph') {
      bgColor = '#080c14';
      dotColor = '#1e293b';
    } else if (backdropStyle === 'clean-white') {
      bgColor = '#f8fafc';
      dotColor = '#e2e8f0';
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

    // Draw grid dots
    ctx.fillStyle = dotColor;
    const gridStep = 24;
    const startX = Math.floor(bounds.x / gridStep) * gridStep;
    const startY = Math.floor(bounds.y / gridStep) * gridStep;
    for (let gx = startX; gx < bounds.x + bounds.w; gx += gridStep) {
      for (let gy = startY; gy < bounds.y + bounds.h; gy += gridStep) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Draw Vector Drawing Elements
    for (const elem of this.drawingData) {
      ctx.save();
      const strokeW = elem.stroke_width || elem.width || 2;
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = elem.color || '#3b82f6';
      if (elem.dash) ctx.setLineDash([6, 4]);

      if (elem.type === 'stroke' && elem.points && elem.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(elem.points[0].x, elem.points[0].y);
        for (let i = 1; i < elem.points.length; i++) {
          ctx.lineTo(elem.points[i].x, elem.points[i].y);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      } else if (elem.type === 'rect') {
        this.drawRoundedRect(ctx, elem.x, elem.y, elem.w, elem.h, 4);
        ctx.fillStyle = elem.fill || 'rgba(56, 189, 248, 0.05)';
        ctx.fill();
        ctx.stroke();
        if (elem.text) {
          ctx.font = `600 ${elem.font_size || 14}px sans-serif`;
          ctx.fillStyle = elem.text_color || this.getContrastColor(elem.fill || '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(elem.text, elem.x + elem.w / 2, elem.y + elem.h / 2);
        }
      } else if (elem.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(elem.cx, elem.cy, elem.rx, elem.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = elem.fill || 'rgba(56, 189, 248, 0.05)';
        ctx.fill();
        ctx.stroke();
        if (elem.text) {
          ctx.font = `600 ${elem.font_size || 14}px sans-serif`;
          ctx.fillStyle = elem.text_color || this.getContrastColor(elem.fill || '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(elem.text, elem.cx, elem.cy);
        }
      } else if (elem.type === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(elem.x + elem.w / 2, elem.y);
        ctx.lineTo(elem.x + elem.w, elem.y + elem.h);
        ctx.lineTo(elem.x, elem.y + elem.h);
        ctx.closePath();
        ctx.fillStyle = elem.fill || 'rgba(56, 189, 248, 0.05)';
        ctx.fill();
        ctx.stroke();
        if (elem.text) {
          ctx.font = `600 ${elem.font_size || 14}px sans-serif`;
          ctx.fillStyle = elem.text_color || this.getContrastColor(elem.fill || '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(elem.text, elem.x + elem.w / 2, elem.y + elem.h * 0.62);
        }
      } else if (elem.type === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(elem.x + elem.w / 2, elem.y);
        ctx.lineTo(elem.x + elem.w, elem.y + elem.h / 2);
        ctx.lineTo(elem.x + elem.w / 2, elem.y + elem.h);
        ctx.lineTo(elem.x, elem.y + elem.h / 2);
        ctx.closePath();
        ctx.fillStyle = elem.fill || 'rgba(56, 189, 248, 0.05)';
        ctx.fill();
        ctx.stroke();
        if (elem.text) {
          ctx.font = `600 ${elem.font_size || 14}px sans-serif`;
          ctx.fillStyle = elem.text_color || this.getContrastColor(elem.fill || '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(elem.text, elem.x + elem.w / 2, elem.y + elem.h / 2);
        }
      } else if (elem.type === 'star') {
        const starPts = this.calculateStarPoints(elem.x, elem.y, elem.w, elem.h).split(' ');
        ctx.beginPath();
        starPts.forEach((p, i) => {
          const [px, py] = p.split(',').map(Number);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = elem.fill || 'rgba(56, 189, 248, 0.05)';
        ctx.fill();
        ctx.stroke();
        if (elem.text) {
          ctx.font = `600 ${elem.font_size || 14}px sans-serif`;
          ctx.fillStyle = elem.text_color || this.getContrastColor(elem.fill || '#0f172a');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(elem.text, elem.x + elem.w / 2, elem.y + elem.h / 2);
        }
      } else if (elem.type === 'line' || elem.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(elem.x1, elem.y1);
        ctx.lineTo(elem.x2, elem.y2);
        ctx.stroke();
        if (elem.type === 'arrow') {
          const angle = Math.atan2(elem.y2 - elem.y1, elem.x2 - elem.x1);
          ctx.fillStyle = elem.color || '#3b82f6';
          ctx.beginPath();
          ctx.moveTo(elem.x2, elem.y2);
          ctx.lineTo(elem.x2 - 12 * Math.cos(angle - Math.PI / 6), elem.y2 - 12 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(elem.x2 - 12 * Math.cos(angle + Math.PI / 6), elem.y2 - 12 * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      } else if (elem.type === 'connector') {
        const card1 = this.items.find((i) => i.id === elem.fromCardId);
        const card2 = this.items.find((i) => i.id === elem.toCardId);
        if (card1 && card2) {
          const p1 = this.getCardAnchorPoint(card1, elem.fromAnchor || 'right');
          const p2 = this.getCardAnchorPoint(card2, elem.toAnchor || 'left');
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const curv = Math.max(30, Math.min(dist * 0.5, 160));
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.bezierCurveTo(p1.x + curv, p1.y, p2.x - curv, p2.y, p2.x, p2.y);
          ctx.stroke();
        }
      } else if (elem.type === 'text') {
        ctx.font = `600 ${elem.font_size || 18}px sans-serif`;
        ctx.fillStyle = elem.color || '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const lines = (elem.text || '').split('\n');
        lines.forEach((l, i) => {
          ctx.fillText(l, elem.x, elem.y + i * ((elem.font_size || 18) * 1.3));
        });
      }
      ctx.restore();
    }

    // 3. Draw Cards (Sorted by Z-Index)
    const sortedCards = [...this.items].sort((a, b) => (a.z_index || 1) - (b.z_index || 1));
    for (const card of sortedCards) {
      ctx.save();
      const x = card.pos_x;
      const y = card.pos_y;
      const w = card.width || 240;
      const h = card.height || 160;

      // Card shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      if (card.entity_type === 'note') {
        // Sticky Note
        ctx.fillStyle = card.color || '#fef08a';
        this.drawRoundedRect(ctx, x, y, w, h, 6);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('STICKY NOTE', x + 12, y + 20);

        ctx.font = '13px sans-serif';
        this.drawWrappedText(ctx, card.note_text || '', x + 12, y + 42, w - 24, 18);
      } else {
        // Entity Card
        ctx.fillStyle = '#111827';
        this.drawRoundedRect(ctx, x, y, w, h, 6);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = card.color || '#3b82f6';
        ctx.lineWidth = 1.5;
        this.drawRoundedRect(ctx, x, y, w, h, 6);
        ctx.stroke();

        // Card Header Bar
        ctx.fillStyle = '#1f2937';
        this.drawRoundedRect(ctx, x + 1, y + 1, w - 2, 28, 5);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px sans-serif';
        const typeLabel = (card.entity_type || 'CARD').toUpperCase();
        ctx.fillText(typeLabel, x + 10, y + 18);

        const title = card.entity_title || card.title || `${typeLabel} #${card.entity_id || card.id}`;
        ctx.font = '600 12px sans-serif';
        ctx.fillText(title.length > 22 ? `${title.slice(0, 22)}...` : title, x + 70, y + 18);

        const subtitle = card.entity_subtitle || card.snippet || '';
        if (subtitle) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '11px sans-serif';
          this.drawWrappedText(ctx, subtitle, x + 10, y + 48, w - 20, 16, 5);
        }
      }
      ctx.restore();
    }

    // 4. Trigger PNG Download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = (this.board?.name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.download = `${cleanName}-canvas.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('Exported board as PNG image');
    }, 'image/png');
  }

  escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  exportBoardAsSvg() {
    const bounds = this.getBoardContentBounds();
    const backdropStyle = this.board?.canvas_style || 'dot-grid';
    let bgColor = '#0b0f19';
    if (backdropStyle === 'corkboard') bgColor = '#2b1d14';
    else if (backdropStyle === 'blueprint') bgColor = '#0d233a';
    else if (backdropStyle === 'dark-graph') bgColor = '#080c14';
    else if (backdropStyle === 'clean-white') bgColor = '#f8fafc';

    let svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svgStr += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" width="${bounds.w}" height="${bounds.h}">\n`;
    svgStr += `  <defs>\n`;
    svgStr += `    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">\n`;
    svgStr += `      <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>\n`;
    svgStr += `    </marker>\n`;
    svgStr += `  </defs>\n`;

    // Background
    svgStr += `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${bgColor}"/>\n`;

    // Vectors
    svgStr += `  <g id="drawings">\n`;
    for (const elem of this.drawingData) {
      const stroke = elem.color || '#3b82f6';
      const width = elem.stroke_width || elem.width || 2;
      const dash = elem.dash ? ' stroke-dasharray="6 4"' : '';

      if (elem.type === 'stroke' && elem.points && elem.points.length > 0) {
        let d = `M ${elem.points[0].x} ${elem.points[0].y}`;
        for (let i = 1; i < elem.points.length; i++) {
          d += ` L ${elem.points[i].x} ${elem.points[i].y}`;
        }
        svgStr += `    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash}/>\n`;
      } else if (elem.type === 'rect') {
        const fill = elem.fill || 'rgba(56, 189, 248, 0.05)';
        svgStr += `    <rect x="${elem.x}" y="${elem.y}" width="${elem.w}" height="${elem.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
        if (elem.text) {
          svgStr += `    <text x="${elem.x + elem.w / 2}" y="${elem.y + elem.h / 2}" text-anchor="middle" dominant-baseline="central" fill="${this.escapeXml(elem.text_color || '#f8fafc')}" font-size="${elem.font_size || 14}px" font-weight="600">${this.escapeXml(elem.text)}</text>\n`;
        }
      } else if (elem.type === 'ellipse') {
        const fill = elem.fill || 'rgba(56, 189, 248, 0.05)';
        svgStr += `    <ellipse cx="${elem.cx}" cy="${elem.cy}" rx="${elem.rx}" ry="${elem.ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
        if (elem.text) {
          svgStr += `    <text x="${elem.cx}" y="${elem.cy}" text-anchor="middle" dominant-baseline="central" fill="${this.escapeXml(elem.text_color || '#f8fafc')}" font-size="${elem.font_size || 14}px" font-weight="600">${this.escapeXml(elem.text)}</text>\n`;
        }
      } else if (elem.type === 'triangle') {
        const pts = `${elem.x + elem.w / 2},${elem.y} ${elem.x + elem.w},${elem.y + elem.h} ${elem.x},${elem.y + elem.h}`;
        const fill = elem.fill || 'rgba(56, 189, 248, 0.05)';
        svgStr += `    <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
        if (elem.text) {
          svgStr += `    <text x="${elem.x + elem.w / 2}" y="${elem.y + elem.h * 0.62}" text-anchor="middle" dominant-baseline="central" fill="${this.escapeXml(elem.text_color || '#f8fafc')}" font-size="${elem.font_size || 14}px" font-weight="600">${this.escapeXml(elem.text)}</text>\n`;
        }
      } else if (elem.type === 'diamond') {
        const pts = `${elem.x + elem.w / 2},${elem.y} ${elem.x + elem.w},${elem.y + elem.h / 2} ${elem.x + elem.w / 2},${elem.y + elem.h} ${elem.x},${elem.y + elem.h / 2}`;
        const fill = elem.fill || 'rgba(56, 189, 248, 0.05)';
        svgStr += `    <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
        if (elem.text) {
          svgStr += `    <text x="${elem.x + elem.w / 2}" y="${elem.y + elem.h / 2}" text-anchor="middle" dominant-baseline="central" fill="${this.escapeXml(elem.text_color || '#f8fafc')}" font-size="${elem.font_size || 14}px" font-weight="600">${this.escapeXml(elem.text)}</text>\n`;
        }
      } else if (elem.type === 'star') {
        const pts = this.calculateStarPoints(elem.x, elem.y, elem.w, elem.h);
        const fill = elem.fill || 'rgba(56, 189, 248, 0.05)';
        svgStr += `    <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
        if (elem.text) {
          svgStr += `    <text x="${elem.x + elem.w / 2}" y="${elem.y + elem.h / 2}" text-anchor="middle" dominant-baseline="central" fill="${this.escapeXml(elem.text_color || '#f8fafc')}" font-size="${elem.font_size || 14}px" font-weight="600">${this.escapeXml(elem.text)}</text>\n`;
        }
      } else if (elem.type === 'line') {
        svgStr += `    <line x1="${elem.x1}" y1="${elem.y1}" x2="${elem.x2}" y2="${elem.y2}" stroke="${stroke}" stroke-width="${width}"${dash}/>\n`;
      } else if (elem.type === 'arrow') {
        svgStr += `    <line x1="${elem.x1}" y1="${elem.y1}" x2="${elem.x2}" y2="${elem.y2}" stroke="${stroke}" stroke-width="${width}"${dash} marker-end="url(#arrowhead)"/>\n`;
      } else if (elem.type === 'text') {
        svgStr += `    <text x="${elem.x}" y="${elem.y}" fill="${stroke}" font-size="${elem.font_size || 18}px" font-weight="600" dominant-baseline="hanging">${this.escapeXml(elem.text)}</text>\n`;
      }
    }
    svgStr += `  </g>\n`;

    // Cards
    svgStr += `  <g id="cards">\n`;
    for (const card of this.items) {
      const isNote = card.entity_type === 'note';
      const cardBg = isNote ? (card.color || '#fef08a') : '#111827';
      const cardStroke = card.color || '#3b82f6';
      const title = card.entity_title || card.title || (isNote ? 'Sticky Note' : 'Card');

      svgStr += `    <g transform="translate(${card.pos_x}, ${card.pos_y})">\n`;
      svgStr += `      <rect width="${card.width || 240}" height="${card.height || 160}" rx="6" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.5"/>\n`;
      if (isNote) {
        svgStr += `      <text x="12" y="24" fill="#1e293b" font-size="12px" font-weight="bold">STICKY NOTE</text>\n`;
        svgStr += `      <text x="12" y="48" fill="#334155" font-size="12px">${this.escapeXml(card.note_text || '')}</text>\n`;
      } else {
        svgStr += `      <rect width="${(card.width || 240) - 2}" height="28" rx="4" fill="#1f2937" x="1" y="1"/>\n`;
        svgStr += `      <text x="10" y="19" fill="#f8fafc" font-size="12px" font-weight="600">${this.escapeXml(title)}</text>\n`;
        if (card.entity_subtitle || card.snippet) {
          svgStr += `      <text x="10" y="48" fill="#94a3b8" font-size="11px">${this.escapeXml(card.entity_subtitle || card.snippet)}</text>\n`;
        }
      }
      svgStr += `    </g>\n`;
    }
    svgStr += `  </g>\n`;
    svgStr += `</svg>`;

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanName = (this.board?.name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `${cleanName}-canvas.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('Exported board as SVG vector file');
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
