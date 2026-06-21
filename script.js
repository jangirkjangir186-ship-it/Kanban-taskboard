/* ================================================
   KANBANFLOW — Full Featured Kanban Script
   ================================================ */

const STORAGE_KEY = 'kanbanflow_v2';
const COLUMNS = ['todo', 'inprogress', 'done'];

// ── Default seed tasks ──────────────────────────────────────────────────
const SEED_TASKS = [
  {
    id: 'seed-1',
    title: 'Design system wireframes',
    desc: 'Create initial layout mockups for the new dashboard.',
    priority: 'high',
    label: 'design',
    due: '',
    status: 'todo',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'seed-2',
    title: 'Implement drag-and-drop',
    desc: 'Use HTML5 Drag & Drop API across Kanban columns.',
    priority: 'high',
    label: 'feature',
    due: '',
    status: 'inprogress',
    createdAt: Date.now() - 86400000,
  },
  {
    id: 'seed-3',
    title: 'Write unit tests',
    desc: 'Cover core utility functions and state management.',
    priority: 'medium',
    label: 'test',
    due: '',
    status: 'inprogress',
    createdAt: Date.now() - 43200000,
  },
  {
    id: 'seed-4',
    title: 'Setup project repository',
    desc: 'Branch protection rules, PR templates, issue labels.',
    priority: 'low',
    label: 'docs',
    due: '',
    status: 'done',
    createdAt: Date.now() - 172800000,
  },
  {
    id: 'seed-5',
    title: 'Fix navigation bug',
    desc: 'Mobile menu fails to close on link click.',
    priority: 'medium',
    label: 'bug',
    due: '',
    status: 'done',
    createdAt: Date.now() - 259200000,
  },
];

// ── State ────────────────────────────────────────────────────────────────────
let tasks = loadTasks();
let editingTaskId = null;   // null → add mode, string → edit mode
let pendingStatus = 'todo'; // column to add into
let draggedId = null;
let taskToDeleteId = null;

// ── Persistence ──────────────────────────────────────────────────────────────
function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch (_) { }
  return SEED_TASKS;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueDateClass(iso) {
  if (!iso) return '';
  const now = new Date();
  const due = new Date(iso + 'T00:00:00');
  const diff = (due - now) / 86400000;
  if (diff < 0) return 'overdue';
  if (diff < 3) return 'due-soon';
  return '';
}

function labelColor(label) {
  const map = {
    feature: '#818cf8',
    bug: '#f87171',
    design: '#c084fc',
    docs: '#34d399',
    test: '#fbbf24',
  };
  return map[label] || '#818cf8';
}

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(message, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span>${escHtml(message)}`;
  const container = document.getElementById('toastContainer');
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }, 2800);
}

// ── Stats & Progress ──────────────────────────────────────────────────────────
function updateStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('total-count').textContent = total;
  document.getElementById('progress-pct').textContent = `${pct}%`;
  document.getElementById('globalProgressBar').style.width = `${pct}%`;
}

// ── Card HTML ────────────────────────────────────────────────────────────────
function buildCardHTML(t) {
  const dueCls = dueDateClass(t.due);
  const dueTxt = t.due ? formatDate(t.due) : '';

  const labelBadge = t.label
    ? `<span class="label-badge" style="background:${labelColor(t.label)}22;color:${labelColor(t.label)};border-color:${labelColor(t.label)}44">${escHtml(t.label)}</span>`
    : '';

  const footer = dueTxt ? `
    <div class="card-footer">
      <span class="card-due ${dueCls}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${escHtml(dueTxt)}${dueCls === 'overdue' ? ' · Overdue' : dueCls === 'due-soon' ? ' · Due soon' : ''}
      </span>
      <span class="card-drag-handle" title="Drag to move">⠿</span>
    </div>` : `
    <div class="card-footer" style="justify-content:flex-end">
      <span class="card-drag-handle" title="Drag to move">⠿</span>
    </div>`;

  return `
    <div class="task-card"
         draggable="true"
         data-id="${escHtml(t.id)}"
         data-priority="${escHtml(t.priority)}"
         id="card-${escHtml(t.id)}"
         tabindex="0"
         aria-label="Task: ${escHtml(t.title)}, priority ${escHtml(t.priority)}"
    >
      <div class="card-top">
        <div class="card-badges">
          <span class="priority-badge ${t.priority}">${escHtml(t.priority)}</span>
          ${labelBadge}
        </div>
        <div class="card-actions">
          <button class="card-action-btn edit-btn" data-id="${escHtml(t.id)}" title="Edit task" aria-label="Edit task">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="card-action-btn delete delete-btn" data-id="${escHtml(t.id)}" title="Delete task" aria-label="Delete task">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="card-title">${escHtml(t.title)}</div>
      ${t.desc ? `<div class="card-desc">${escHtml(t.desc)}</div>` : ''}
      ${footer}
    </div>
  `;
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  COLUMNS.forEach(status => {
    const list = document.getElementById('list-' + status);
    const empty = document.getElementById('empty-' + status);
    const items = tasks.filter(t => t.status === status);

    document.getElementById('count-' + status).textContent = items.length;

    // Remove old cards (keep empty-state element)
    Array.from(list.children).forEach(child => {
      if (!child.classList.contains('empty-state')) child.remove();
    });

    // Show / hide empty state
    if (items.length === 0) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      items.forEach(t => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildCardHTML(t);
        const card = wrapper.firstElementChild;
        list.appendChild(card);
      });
    }
  });

  attachCardEvents();
  updateStats();
}

// ── Card Events ───────────────────────────────────────────────────────────────
function attachCardEvents() {
  document.querySelectorAll('.task-card').forEach(card => {
    // Drag start
    card.addEventListener('dragstart', e => {
      draggedId = card.dataset.id;
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    // Drag end
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedId = null;
      document.querySelectorAll('.drag-ghost').forEach(g => g.remove());
    });

    // Keyboard: Enter to edit
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') openModal('edit', card.dataset.id);
    });
  });

  // Edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openModal('edit', btn.dataset.id);
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeleteConfirm(btn.dataset.id);
    });
  });
}

// ── Drop Zones (set up once) ──────────────────────────────────────────────────
document.querySelectorAll('.card-list').forEach(list => {
  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.classList.add('drag-over');
  });

  list.addEventListener('dragleave', e => {
    // Only remove class when leaving the list itself (not a child)
    if (!list.contains(e.relatedTarget)) {
      list.classList.remove('drag-over');
    }
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    list.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain') || draggedId;
    if (!id) return;

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newStatus = list.dataset.status;
    const oldStatus = task.status;

    if (newStatus === oldStatus) return; // no change

    task.status = newStatus;
    save();
    render();

    const statusLabels = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
    toast(`Moved to ${statusLabels[newStatus]}`, 'info');
  });
});

// ── Add Task Buttons ──────────────────────────────────────────────────────────
document.querySelectorAll('.col-add-btn').forEach(btn => {
  btn.addEventListener('click', () => openModal('add', null, btn.dataset.status));
});

// ── Modal Logic ───────────────────────────────────────────────────────────────
function openModal(mode, taskId, status) {
  editingTaskId = mode === 'edit' ? taskId : null;
  pendingStatus = status || 'todo';

  const titleEl = document.getElementById('taskTitle');
  const descEl = document.getElementById('taskDesc');
  const priorityEl = document.getElementById('taskPriority');
  const labelEl = document.getElementById('taskLabel');
  const dueEl = document.getElementById('taskDue');
  const modalTitle = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('modalSaveTxt');

  if (mode === 'edit') {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    titleEl.value = t.title;
    descEl.value = t.desc || '';
    priorityEl.value = t.priority;
    labelEl.value = t.label || '';
    dueEl.value = t.due || '';
    modalTitle.textContent = 'Edit Task';
    saveBtn.textContent = 'Save Changes';
  } else {
    titleEl.value = '';
    descEl.value = '';
    priorityEl.value = 'medium';
    labelEl.value = '';
    dueEl.value = '';
    modalTitle.textContent = 'Add Task';
    saveBtn.textContent = 'Add Task';
  }

  updateCharCounts();
  document.getElementById('modalBackdrop').classList.add('open');
  setTimeout(() => titleEl.focus(), 60);
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  editingTaskId = null;
}

// Char counts
function updateCharCounts() {
  const title = document.getElementById('taskTitle');
  const desc = document.getElementById('taskDesc');
  document.getElementById('titleCount').textContent = `${title.value.length}/100`;
  document.getElementById('descCount').textContent = `${desc.value.length}/300`;
}

document.getElementById('taskTitle').addEventListener('input', updateCharCounts);
document.getElementById('taskDesc').addEventListener('input', updateCharCounts);

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', e => {
  if (e.target.id === 'modalBackdrop') closeModal();
});

document.getElementById('modalSave').addEventListener('click', () => {
  const title = document.getElementById('taskTitle').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const label = document.getElementById('taskLabel').value;
  const due = document.getElementById('taskDue').value;

  if (!title) {
    document.getElementById('taskTitle').focus();
    document.getElementById('taskTitle').style.borderColor = 'var(--red)';
    setTimeout(() => {
      document.getElementById('taskTitle').style.borderColor = '';
    }, 1500);
    return;
  }

  if (editingTaskId) {
    const t = tasks.find(x => x.id === editingTaskId);
    if (t) Object.assign(t, { title, desc, priority, label, due });
    toast('Task updated', 'success');
  } else {
    tasks.push({ id: uid(), title, desc, priority, label, due, status: pendingStatus, createdAt: Date.now() });
    toast('Task added', 'success');
  }

  save();
  render();
  closeModal();
});

// Enter key submits modal
document.getElementById('taskTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('modalSave').click();
});

// ── Delete Confirm ────────────────────────────────────────────────────────────
function openDeleteConfirm(taskId) {
  taskToDeleteId = taskId;
  const t = tasks.find(x => x.id === taskId);
  document.getElementById('deleteTaskName').textContent = t ? `"${t.title}"` : 'this task';
  document.getElementById('deleteBackdrop').classList.add('open');
}

document.getElementById('deleteCancel').addEventListener('click', () => {
  document.getElementById('deleteBackdrop').classList.remove('open');
  taskToDeleteId = null;
});

document.getElementById('deleteBackdrop').addEventListener('click', e => {
  if (e.target.id === 'deleteBackdrop') {
    document.getElementById('deleteBackdrop').classList.remove('open');
    taskToDeleteId = null;
  }
});

document.getElementById('deleteConfirm').addEventListener('click', () => {
  if (!taskToDeleteId) return;
  tasks = tasks.filter(t => t.id !== taskToDeleteId);
  save();
  render();
  document.getElementById('deleteBackdrop').classList.remove('open');
  toast('Task deleted', 'error');
  taskToDeleteId = null;
});

// ── Clear All ─────────────────────────────────────────────────────────────────
document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (tasks.length === 0) return;
  if (!confirm(`Delete all ${tasks.length} task${tasks.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
  tasks = [];
  save();
  render();
  toast('All tasks cleared', 'error');
});

// ── Keyboard shortcut: N to add task ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('deleteBackdrop').classList.remove('open');
  }
  // 'n' opens add modal when no modal is open and not typing
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
    const active = document.activeElement;
    const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT';
    if (!isInput && !document.getElementById('modalBackdrop').classList.contains('open')) {
      openModal('add', null, 'todo');
    }
  }
});

// ── Initial Render ────────────────────────────────────────────────────────────
render();
