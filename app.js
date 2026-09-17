// ==================== API CONFIGURATION ====================
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://lively-mountain-fd1e.tcoronadogrupomainjobs.workers.dev';

async function api(path, options = {}) {
    const url = API_BASE + path;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// ==================== DATA MANAGEMENT ====================
let payments = [];
let editingId = null;
let currentOptionField = null;
let charts = {};
let currentSort = { field: null, asc: true };
let currentSortDash = { field: null, asc: true };
let dashFilteredData = null;

// Default options for dropdowns
const defaultOptions = {
    tipoPago: ['Viajes', 'Licencias', 'Tasas', 'Herramientas', 'Formación', 'Materiales', 'Servicios', 'Otros'],
    tarjeta: [],
    encargado: [],
    proyecto: [],
    evento: []
};

// Load data from API (with localStorage fallback)
async function loadData() {
    try {
        const [paymentsData, optionsData] = await Promise.all([
            api('/api/payments'),
            api('/api/options'),
        ]);
        payments = paymentsData;
        Object.keys(optionsData).forEach(key => {
            if (optionsData[key] && optionsData[key].length > 0) {
                defaultOptions[key] = optionsData[key];
            }
        });
    } catch (e) {
        console.warn('API not available, using localStorage:', e.message);
        const stored = localStorage.getItem('payments_data');
        if (stored) payments = JSON.parse(stored);
        const storedOptions = localStorage.getItem('payments_options');
        if (storedOptions) {
            const saved = JSON.parse(storedOptions);
            Object.keys(saved).forEach(key => { defaultOptions[key] = saved[key]; });
        }
    }
}

function saveLocal() {
    localStorage.setItem('payments_data', JSON.stringify(payments));
    localStorage.setItem('payments_options', JSON.stringify(defaultOptions));
}

async function saveData() {
    saveLocal();
}

async function savePayment(data) {
    try {
        await api('/api/payments', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    } catch (e) {
        console.warn('API save failed, using localStorage only');
        saveLocal();
    }
}

async function updatePaymentAPI(data) {
    try {
        await api(`/api/payments/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    } catch (e) {
        console.warn('API update failed, using localStorage only');
        saveLocal();
    }
}

async function deletePaymentAPI(id) {
    try {
        await api(`/api/payments/${id}`, {
            method: 'DELETE',
        });
    } catch (e) {
        console.warn('API delete failed, using localStorage only');
        saveLocal();
    }
}

async function importPaymentsAPI(paymentsArray) {
    try {
        await api('/api/payments/import', {
            method: 'POST',
            body: JSON.stringify(paymentsArray),
        });
    } catch (e) {
        console.warn('API import failed, using localStorage only');
        saveLocal();
    }
}

async function addOptionAPI(field, value) {
    try {
        await api('/api/options', {
            method: 'POST',
            body: JSON.stringify({ field, value }),
        });
    } catch (e) {
        console.warn('API option save failed');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ==================== FORM HANDLING ====================
function populateSelects() {
    ['tipoPago', 'tarjeta', 'encargado', 'proyecto', 'evento'].forEach(field => {
        const select = document.getElementById(field);
        const currentValue = select.value;
        const emptyLabel = field === 'evento' ? 'Ninguno' : 'Seleccionar...';
        select.innerHTML = `<option value="">${emptyLabel}</option>`;
        defaultOptions[field].sort().forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        if (currentValue) select.value = currentValue;
    });
    populateFilterSelects();
}

// ==================== MULTI-SELECT COMPONENT ====================
const multiSelectInstances = {};

function initMultiSelect(containerId, options, placeholder = 'Todos') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selected = new Set();

    container.innerHTML = `
        <div class="multi-select-trigger" onclick="toggleMultiSelect('${containerId}')">
            <span class="placeholder">${placeholder}</span>
            <span class="selected-count" style="display:none;">0</span>
            <span class="arrow"><i class="fas fa-chevron-down"></i></span>
        </div>
        <div class="multi-select-dropdown">
            <div class="multi-select-search">
                <input type="text" placeholder="Buscar..." oninput="filterMultiSelectOptions('${containerId}', this.value)">
            </div>
            <div class="multi-select-options" id="${containerId}_options"></div>
            <div class="multi-select-actions">
                <button class="ms-btn-selectall" onclick="selectAllMultiSelect('${containerId}')">Todos</button>
                <button class="ms-btn-clear" onclick="clearMultiSelect('${containerId}')">Ninguno</button>
            </div>
        </div>
    `;

    const optionsContainer = document.getElementById(`${containerId}_options`);
    options.sort().forEach(opt => {
        const div = document.createElement('div');
        div.className = 'multi-select-option';
        div.dataset.value = opt;
        const escapedId = containerId + '_opt_' + opt.replace(/[^a-zA-Z0-9_-]/g, '_');
        div.innerHTML = `
            <input type="checkbox" id="${escapedId}">
            <label for="${escapedId}">${escapeHtml(opt)}</label>
        `;
        optionsContainer.appendChild(div);
    });

    optionsContainer.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox') {
            const val = e.target.closest('.multi-select-option').dataset.value;
            toggleMultiSelectOption(containerId, val);
        }
    });

    multiSelectInstances[containerId] = { selected, container, options, placeholder };
}

function toggleMultiSelect(containerId) {
    const instance = multiSelectInstances[containerId];
    const dropdown = instance.container.querySelector('.multi-select-dropdown');
    const trigger = instance.container.querySelector('.multi-select-trigger');

    // Close all other dropdowns
    Object.keys(multiSelectInstances).forEach(id => {
        if (id !== containerId) {
            multiSelectInstances[id].container.querySelector('.multi-select-dropdown').classList.remove('open');
            multiSelectInstances[id].container.querySelector('.multi-select-trigger').classList.remove('active');
        }
    });

    dropdown.classList.toggle('open');
    trigger.classList.toggle('active');
}

function toggleMultiSelectOption(containerId, value) {
    const instance = multiSelectInstances[containerId];
    if (instance.selected.has(value)) {
        instance.selected.delete(value);
    } else {
        instance.selected.add(value);
    }
    updateMultiSelectDisplay(containerId);
}

function selectAllMultiSelect(containerId) {
    const instance = multiSelectInstances[containerId];
    instance.options.forEach(opt => instance.selected.add(opt));
    const checkboxes = document.querySelectorAll(`#${containerId}_options input[type="checkbox"]`);
    checkboxes.forEach(cb => cb.checked = true);
    updateMultiSelectDisplay(containerId);
}

function clearMultiSelect(containerId) {
    const instance = multiSelectInstances[containerId];
    if (instance) {
        instance.selected.clear();
        const checkboxes = instance.container.querySelectorAll('.multi-select-option input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        updateMultiSelectDisplay(containerId);
    } else {
        const el = document.getElementById(containerId);
        if (el) {
            el.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            const ph = el.querySelector('.placeholder');
            const ct = el.querySelector('.selected-count');
            if (ph) { ph.textContent = 'Todos'; ph.className = 'placeholder'; }
            if (ct) ct.style.display = 'none';
        }
    }
}

function filterMultiSelectOptions(containerId, query) {
    const options = document.querySelectorAll(`#${containerId}_options .multi-select-option`);
    const q = query.toLowerCase();
    options.forEach(opt => {
        opt.style.display = opt.dataset.value.toLowerCase().includes(q) ? 'flex' : 'none';
    });
}

function updateMultiSelectDisplay(containerId) {
    const instance = multiSelectInstances[containerId];
    if (!instance) return;
    const trigger = instance.container.querySelector('.multi-select-trigger');
    const placeholder = trigger.querySelector('.placeholder');
    const count = trigger.querySelector('.selected-count');

    if (instance.selected.size === 0) {
        placeholder.textContent = instance.placeholder || 'Todos';
        placeholder.className = 'placeholder';
        count.style.display = 'none';
    } else {
        placeholder.textContent = `${instance.selected.size} seleccionado${instance.selected.size > 1 ? 's' : ''}`;
        placeholder.className = '';
        count.style.display = 'inline-block';
        count.textContent = instance.selected.size;
    }
}

function getMultiSelectValues(containerId) {
    const instance = multiSelectInstances[containerId];
    return instance ? Array.from(instance.selected) : [];
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        Object.keys(multiSelectInstances).forEach(id => {
            multiSelectInstances[id].container.querySelector('.multi-select-dropdown').classList.remove('open');
            multiSelectInstances[id].container.querySelector('.multi-select-trigger').classList.remove('active');
        });
    }
});

function populateFilterSelects() {
    // Dashboard filters
    initMultiSelect('filterTipoPago_ms', defaultOptions.tipoPago || [], 'Todos');
    initMultiSelect('filterTarjeta_ms', defaultOptions.tarjeta || [], 'Todas');
    initMultiSelect('filterEncargado_ms', defaultOptions.encargado || [], 'Todos');
    initMultiSelect('filterProyecto_ms', defaultOptions.proyecto || [], 'Todos');
    initMultiSelect('filterEvento_ms', defaultOptions.evento || [], 'Todos');

    // Record table filters
    initMultiSelect('regFilterTipoPago_ms', defaultOptions.tipoPago || [], 'Todos');
    initMultiSelect('regFilterTarjeta_ms', defaultOptions.tarjeta || [], 'Todas');
    initMultiSelect('regFilterEncargado_ms', defaultOptions.encargado || [], 'Todos');
    initMultiSelect('regFilterProyecto_ms', defaultOptions.proyecto || [], 'Todos');
    initMultiSelect('regFilterEvento_ms', defaultOptions.evento || [], 'Todos');
}

// ==================== ADD NEW OPTIONS (EDITABLE FIELDS) ====================
function addNewOption(field) {
    currentOptionField = field;
    const titles = {
        tipoPago: 'Tipo de Pago',
        tarjeta: 'Tarjeta',
        encargado: 'Trabajador',
        proyecto: 'Proyecto',
        evento: 'Evento'
    };
    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-plus-circle"></i> Añadir Nuevo ${titles[field]}`;
    document.getElementById('newOptionInput').value = '';
    document.getElementById('optionModal').style.display = 'flex';
    document.getElementById('newOptionInput').focus();
}

function saveNewOption() {
    const input = document.getElementById('newOptionInput');
    const value = input.value.trim();
    if (!value) return;
    
    if (!defaultOptions[currentOptionField].includes(value)) {
        defaultOptions[currentOptionField].push(value);
        defaultOptions[currentOptionField].sort();
        addOptionAPI(currentOptionField, value);
        saveLocal();
        populateSelects();
        document.getElementById(currentOptionField).value = value;
    }
    closeModal();
}

function closeModal() {
    document.getElementById('optionModal').style.display = 'none';
    currentOptionField = null;
}

document.getElementById('newOptionInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveNewOption();
    }
});

// ==================== TABLE SORTING ====================
function sortTable(field) {
    if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.field = field;
        currentSort.asc = true;
    }
    document.querySelectorAll('#paymentsTable th').forEach(th => {
        const icon = th.querySelector('i');
        if (icon) icon.className = 'fas fa-sort';
    });
    const th = document.querySelector(`#paymentsTable th[onclick="sortTable('${field}')"]`);
    if (th) {
        const icon = th.querySelector('i');
        if (icon) icon.className = currentSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
    renderTable(regFilteredData);
}

function sortDash(field) {
    if (currentSortDash.field === field) {
        currentSortDash.asc = !currentSortDash.asc;
    } else {
        currentSortDash.field = field;
        currentSortDash.asc = true;
    }
    document.querySelectorAll('#dashboardTable th').forEach(th => {
        const icon = th.querySelector('i');
        if (icon) icon.className = 'fas fa-sort';
    });
    const th = document.querySelector(`#dashboardTable th[onclick="sortDash('${field}')"]`);
    if (th) {
        const icon = th.querySelector('i');
        if (icon) icon.className = currentSortDash.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
    renderDashboard(dashFilteredData);
}

function sortData(data, sortState) {
    if (!sortState.field) return data;
    const field = sortState.field;
    const asc = sortState.asc ? 1 : -1;
    return [...data].sort((a, b) => {
        let va = a[field] || '';
        let vb = b[field] || '';
        if (field === 'cantidad') {
            va = parseFloat(va) || 0;
            vb = parseFloat(vb) || 0;
            return (va - vb) * asc;
        }
        return String(va).localeCompare(String(vb), 'es') * asc;
    });
}

// ==================== TABLE RENDERING ====================
function renderTable(data = null) {
    const tbody = document.getElementById('paymentsBody');
    let records = data || payments;
    records = sortData(records, currentSort);
    
    if (records.length === 0) {
        tbody.innerHTML = '';
        document.getElementById('noDataMsg').style.display = 'block';
    } else {
        document.getElementById('noDataMsg').style.display = 'none';
        tbody.innerHTML = records.map((p, i) => `
            <tr data-id="${p.id}">
                <td>${i + 1}</td>
                <td class="editable-cell" data-field="fecha" ondblclick="startEdit(this)">${formatDate(p.fecha)}</td>
                <td class="editable-cell" data-field="concepto" ondblclick="startEdit(this)">${escapeHtml(p.concepto)}</td>
                <td class="editable-cell" data-field="proyecto" ondblclick="startEdit(this)">${escapeHtml(p.proyecto || '')}</td>
                <td class="editable-cell" data-field="evento" ondblclick="startEdit(this)">${escapeHtml(p.evento || '')}</td>
                <td class="editable-cell" data-field="tipoPago" ondblclick="startEdit(this)">${escapeHtml(p.tipoPago)}</td>
                <td class="editable-cell" data-field="tarjeta" ondblclick="startEdit(this)">${escapeHtml(p.tarjeta)}</td>
                <td class="editable-cell" data-field="cantidad" ondblclick="startEdit(this)" style="text-align:right;font-weight:600;">${formatCurrency(p.cantidad)}</td>
                <td class="editable-cell" data-field="encargado" ondblclick="startEdit(this)">${escapeHtml(p.encargado)}</td>
                <td class="editable-cell cell-truncate" data-field="observaciones" ondblclick="startEdit(this)" title="${escapeHtml(p.observaciones || '')}">${escapeHtml(p.observaciones || '-')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" onclick="editPayment('${p.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    updateSummary();
}

function updateSummary() {
    document.getElementById('totalRegistros').textContent = payments.length;
    const total = payments.reduce((sum, p) => sum + p.cantidad, 0);
    document.getElementById('totalCantidad').textContent = formatCurrency(total);
    document.getElementById('ticketMedio').textContent = payments.length > 0 ? formatCurrency(total / payments.length) : '€0.00';
    // Count unique events
    const eventos = new Set(payments.map(p => p.evento).filter(e => e && e.trim() !== ''));
    document.getElementById('totalEventos').textContent = eventos.size;
}

// ==================== INLINE EDITING ====================
function startEdit(cell) {
    if (cell.classList.contains('editing')) return;
    
    const row = cell.closest('tr');
    const id = row.dataset.id;
    const field = cell.dataset.field;
    const record = payments.find(p => p.id === id);
    if (!record) return;
    
    const currentValue = record[field];
    cell.classList.add('editing');
    
    if (field === 'tipoPago' || field === 'tarjeta' || field === 'encargado' || field === 'proyecto' || field === 'evento') {
        const select = document.createElement('select');
        const options = defaultOptions[field] || [];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === currentValue) option.selected = true;
            select.appendChild(option);
        });
        // Add current value if not in options
        if (currentValue && !options.includes(currentValue)) {
            const option = document.createElement('option');
            option.value = currentValue;
            option.textContent = currentValue;
            option.selected = true;
            select.appendChild(option);
        }
        cell.innerHTML = '';
        cell.appendChild(select);
        select.focus();
        select.addEventListener('blur', () => finishEdit(cell, id, field, select.value));
        select.addEventListener('change', () => finishEdit(cell, id, field, select.value));
    } else if (field === 'fecha') {
        const input = document.createElement('input');
        input.type = 'date';
        input.value = currentValue;
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.addEventListener('blur', () => finishEdit(cell, id, field, input.value));
        input.addEventListener('change', () => finishEdit(cell, id, field, input.value));
    } else if (field === 'cantidad') {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.value = currentValue;
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        input.addEventListener('blur', () => finishEdit(cell, id, field, parseFloat(input.value) || 0));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') finishEdit(cell, id, field, parseFloat(input.value) || 0);
        });
    } else if (field === 'observaciones') {
        const textarea = document.createElement('textarea');
        textarea.value = currentValue || '';
        textarea.rows = 3;
        textarea.style.width = '100%';
        textarea.style.minWidth = '150px';
        cell.innerHTML = '';
        cell.appendChild(textarea);
        textarea.focus();
        textarea.addEventListener('blur', () => finishEdit(cell, id, field, textarea.value.trim()));
    } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        input.addEventListener('blur', () => finishEdit(cell, id, field, input.value.trim()));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') finishEdit(cell, id, field, input.value.trim());
        });
    }
}

function finishEdit(cell, id, field, newValue) {
    cell.classList.remove('editing');
    const record = payments.find(p => p.id === id);
    if (record && record[field] !== newValue) {
        record[field] = newValue;
        updatePaymentAPI(record);
        saveLocal();
    }
    renderTable();
}

// ==================== CRUD OPERATIONS ====================
document.getElementById('paymentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const data = {
        id: editingId || generateId(),
        fecha: document.getElementById('fecha').value,
        concepto: document.getElementById('concepto').value.trim(),
        proyecto: document.getElementById('proyecto').value,
        evento: document.getElementById('evento').value,
        tipoPago: document.getElementById('tipoPago').value,
        tarjeta: document.getElementById('tarjeta').value,
        cantidad: parseFloat(document.getElementById('cantidad').value) || 0,
        encargado: document.getElementById('encargado').value,
        observaciones: document.getElementById('observaciones').value.trim()
    };
    
    if (editingId) {
        const index = payments.findIndex(p => p.id === editingId);
        if (index !== -1) payments[index] = data;
        editingId = null;
        document.getElementById('submitBtn').textContent = 'Guardar Registro';
        document.getElementById('cancelEditBtn').style.display = 'none';
        updatePaymentAPI(data);
    } else {
        payments.push(data);
        savePayment(data);
    }
    
    saveLocal();
    renderTable();
    this.reset();
    document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
});

function editPayment(id) {
    const record = payments.find(p => p.id === id);
    if (!record) return;
    
    editingId = id;
    document.getElementById('fecha').value = record.fecha;
    document.getElementById('concepto').value = record.concepto;
    document.getElementById('proyecto').value = record.proyecto || '';
    document.getElementById('evento').value = record.evento || '';
    document.getElementById('tipoPago').value = record.tipoPago;
    document.getElementById('tarjeta').value = record.tarjeta;
    document.getElementById('cantidad').value = record.cantidad;
    document.getElementById('encargado').value = record.encargado;
    document.getElementById('observaciones').value = record.observaciones || '';
    document.getElementById('submitBtn').textContent = 'Actualizar Registro';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('cancelEditBtn').addEventListener('click', function() {
    editingId = null;
    document.getElementById('paymentForm').reset();
    document.getElementById('submitBtn').textContent = 'Guardar Registro';
    this.style.display = 'none';
    document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
});

function deletePayment(id) {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    payments = payments.filter(p => p.id !== id);
    deletePaymentAPI(id);
    saveLocal();
    renderTable();
}

// ==================== SEARCH ====================
document.getElementById('searchInput').addEventListener('input', function() {
    const query = this.value.toLowerCase();
    if (!query) {
        renderTable();
        return;
    }
    const filtered = payments.filter(p =>
        p.fecha.toLowerCase().includes(query) ||
        p.concepto.toLowerCase().includes(query) ||
        (p.proyecto || '').toLowerCase().includes(query) ||
        (p.evento || '').toLowerCase().includes(query) ||
        p.tipoPago.toLowerCase().includes(query) ||
        p.tarjeta.toLowerCase().includes(query) ||
        p.encargado.toLowerCase().includes(query) ||
        (p.observaciones || '').toLowerCase().includes(query) ||
        p.cantidad.toString().includes(query)
    );
    renderTable(filtered);
});

// ==================== RECORD TABLE FILTERS ====================
let regFilteredData = null;

function applyRegFilters() {
    let filtered = [...payments];

    const fechaDesde = document.getElementById('regFilterFechaDesde').value;
    const fechaHasta = document.getElementById('regFilterFechaHasta').value;
    const tipoPago = getMultiSelectValues('regFilterTipoPago_ms');
    const tarjeta = getMultiSelectValues('regFilterTarjeta_ms');
    const encargado = getMultiSelectValues('regFilterEncargado_ms');
    const proyecto = getMultiSelectValues('regFilterProyecto_ms');
    const evento = getMultiSelectValues('regFilterEvento_ms');

    const hasFilters = fechaDesde || fechaHasta || tipoPago.length > 0 || tarjeta.length > 0 || 
                       encargado.length > 0 || proyecto.length > 0 || evento.length > 0;

    if (fechaDesde) filtered = filtered.filter(p => p.fecha >= fechaDesde);
    if (fechaHasta) filtered = filtered.filter(p => p.fecha <= fechaHasta);
    if (tipoPago.length > 0) filtered = filtered.filter(p => tipoPago.includes(p.tipoPago));
    if (tarjeta.length > 0) filtered = filtered.filter(p => tarjeta.includes(p.tarjeta));
    if (encargado.length > 0) filtered = filtered.filter(p => encargado.includes(p.encargado));
    if (proyecto.length > 0) filtered = filtered.filter(p => proyecto.includes(p.proyecto || ''));
    if (evento.length > 0) filtered = filtered.filter(p => evento.includes(p.evento || ''));

    regFilteredData = hasFilters ? filtered : null;
    renderTable(hasFilters ? filtered : null);

    // Show/hide status only when filters are active
    if (hasFilters) {
        document.getElementById('regFilterStatus').style.display = 'flex';
        document.getElementById('regFilteredCount').textContent = filtered.length;
        document.getElementById('regTotalCount').textContent = payments.length;
    } else {
        document.getElementById('regFilterStatus').style.display = 'none';
    }
}

function clearRegFilters() {
    document.getElementById('regFilterFechaDesde').value = '';
    document.getElementById('regFilterFechaHasta').value = '';
    Object.keys(multiSelectInstances).forEach(id => {
        if (!id.startsWith('regFilter')) return;
        const inst = multiSelectInstances[id];
        if (!inst) return;
        inst.selected.clear();
        const trig = inst.container.querySelector('.multi-select-trigger');
        if (trig) {
            const ph = trig.children[0];
            const ct = trig.children[1];
            if (ph) { ph.textContent = inst.placeholder || 'Todos'; ph.className = 'placeholder'; }
            if (ct) { ct.style.display = 'none'; ct.textContent = '0'; }
        }
        inst.container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('regFilterStatus').style.display = 'none';
    regFilteredData = null;
    renderTable();
}

// ==================== DASHBOARD ====================
function applyFilters() {
    let filtered = [...payments];
    
    const fechaDesde = document.getElementById('filterFechaDesde').value;
    const fechaHasta = document.getElementById('filterFechaHasta').value;
    const tipoPago = getMultiSelectValues('filterTipoPago_ms');
    const tarjeta = getMultiSelectValues('filterTarjeta_ms');
    const encargado = getMultiSelectValues('filterEncargado_ms');
    const proyecto = getMultiSelectValues('filterProyecto_ms');
    const evento = getMultiSelectValues('filterEvento_ms');
    
    if (fechaDesde) filtered = filtered.filter(p => p.fecha >= fechaDesde);
    if (fechaHasta) filtered = filtered.filter(p => p.fecha <= fechaHasta);
    if (tipoPago.length > 0) filtered = filtered.filter(p => tipoPago.includes(p.tipoPago));
    if (tarjeta.length > 0) filtered = filtered.filter(p => tarjeta.includes(p.tarjeta));
    if (encargado.length > 0) filtered = filtered.filter(p => encargado.includes(p.encargado));
    if (proyecto.length > 0) filtered = filtered.filter(p => proyecto.includes(p.proyecto || ''));
    if (evento.length > 0) filtered = filtered.filter(p => evento.includes(p.evento || ''));
    
    renderDashboard(filtered);
    dashFilteredData = filtered;
}

function clearFilters() {
    document.getElementById('filterFechaDesde').value = '';
    document.getElementById('filterFechaHasta').value = '';
    Object.keys(multiSelectInstances).forEach(id => {
        if (!id.startsWith('filter')) return;
        const inst = multiSelectInstances[id];
        if (!inst) return;
        inst.selected.clear();
        const trig = inst.container.querySelector('.multi-select-trigger');
        if (trig) {
            const ph = trig.children[0];
            const ct = trig.children[1];
            if (ph) { ph.textContent = inst.placeholder || 'Todos'; ph.className = 'placeholder'; }
            if (ct) { ct.style.display = 'none'; ct.textContent = '0'; }
        }
        inst.container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    renderDashboard(payments);
    dashFilteredData = null;
}

function printDashboard() {
    document.getElementById('printDate').textContent = new Date().toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    window.print();
}

function renderDashboard(data) {
    // KPIs
    const total = data.reduce((sum, p) => sum + p.cantidad, 0);
    const max = data.length > 0 ? Math.max(...data.map(p => p.cantidad)) : 0;
    const min = data.length > 0 ? Math.min(...data.map(p => p.cantidad)) : 0;
    
    document.getElementById('dashTotal').textContent = formatCurrency(total);
    document.getElementById('dashCount').textContent = data.length;
    document.getElementById('dashMax').textContent = formatCurrency(max);
    document.getElementById('dashMin').textContent = formatCurrency(min);
    
    // Table (sorted)
    const sorted = sortData(data, currentSortDash);
    const tbody = document.getElementById('dashboardBody');
    if (data.length === 0) {
        tbody.innerHTML = '';
        document.getElementById('noDashDataMsg').style.display = 'block';
    } else {
        document.getElementById('noDashDataMsg').style.display = 'none';
        tbody.innerHTML = sorted.map(p => `
            <tr>
                <td>${formatDate(p.fecha)}</td>
                <td>${escapeHtml(p.concepto)}</td>
                <td>${escapeHtml(p.proyecto || '')}</td>
                <td>${escapeHtml(p.evento || '')}</td>
                <td>${escapeHtml(p.tipoPago)}</td>
                <td>${escapeHtml(p.tarjeta)}</td>
                <td style="text-align:right;font-weight:600;">${formatCurrency(p.cantidad)}</td>
                <td>${escapeHtml(p.encargado)}</td>
                <td class="cell-truncate" title="${escapeHtml(p.observaciones || '')}">${escapeHtml(p.observaciones || '-')}</td>
            </tr>
        `).join('');
    }
    
    renderCharts(data);
}

function renderCharts(data) {
    // Destroy existing charts
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    
    if (data.length === 0) return;
    
    const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
    
    // Chart: Tipo de Pago
    const tipoData = aggregateBy(data, 'tipoPago');
    charts.tipo = new Chart(document.getElementById('chartTipoPago'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(tipoData),
            datasets: [{
                data: Object.values(tipoData),
                backgroundColor: colors.slice(0, Object.keys(tipoData).length)
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
    
    // Chart: Encargado
    const encargadoData = aggregateBy(data, 'encargado');
    charts.encargado = new Chart(document.getElementById('chartEncargado'), {
        type: 'bar',
        data: {
            labels: Object.keys(encargadoData),
            datasets: [{
                label: 'Total (€)',
                data: Object.values(encargadoData),
                backgroundColor: colors.slice(0, Object.keys(encargadoData).length)
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    
    // Chart: Tarjeta
    const tarjetaData = aggregateBy(data, 'tarjeta');
    charts.tarjeta = new Chart(document.getElementById('chartTarjeta'), {
        type: 'pie',
        data: {
            labels: Object.keys(tarjetaData),
            datasets: [{
                data: Object.values(tarjetaData),
                backgroundColor: colors.slice(0, Object.keys(tarjetaData).length)
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
    
    // Chart: Proyecto
    const proyectoData = aggregateBy(data, 'proyecto');
    // Filter out empty proyecto keys
    const filteredProyectoData = Object.fromEntries(
        Object.entries(proyectoData).filter(([k]) => k && k.trim() !== '')
    );
    if (Object.keys(filteredProyectoData).length > 0) {
        charts.proyecto = new Chart(document.getElementById('chartProyecto'), {
            type: 'bar',
            data: {
                labels: Object.keys(filteredProyectoData),
                datasets: [{
                    label: 'Total (€)',
                    data: Object.values(filteredProyectoData),
                    backgroundColor: colors.slice(0, Object.keys(filteredProyectoData).length)
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } else {
        // No project data
        const ctx = document.getElementById('chartProyecto').getContext('2d');
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de proyectos', ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
    
    // Chart: Evento
    const eventoData = aggregateBy(data, 'evento');
    const filteredEventoData = Object.fromEntries(
        Object.entries(eventoData).filter(([k]) => k && k.trim() !== '')
    );
    if (Object.keys(filteredEventoData).length > 0) {
        charts.evento = new Chart(document.getElementById('chartEvento'), {
            type: 'bar',
            data: {
                labels: Object.keys(filteredEventoData),
                datasets: [{
                    label: 'Total (€)',
                    data: Object.values(filteredEventoData),
                    backgroundColor: colors.slice(2, Object.keys(filteredEventoData).length + 2)
                }]
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    } else {
        const ctx2 = document.getElementById('chartEvento').getContext('2d');
        ctx2.fillStyle = '#6b7280';
        ctx2.font = '14px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('Sin datos de eventos', ctx2.canvas.width / 2, ctx2.canvas.height / 2);
    }
    
    // Chart: Monthly evolution
    const monthlyData = {};
    data.forEach(p => {
        const month = p.fecha.substring(0, 7); // YYYY-MM
        monthlyData[month] = (monthlyData[month] || 0) + p.cantidad;
    });
    const sortedMonths = Object.keys(monthlyData).sort();
    charts.mensual = new Chart(document.getElementById('chartMensual'), {
        type: 'line',
        data: {
            labels: sortedMonths.map(m => {
                const [y, mo] = m.split('-');
                const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                return `${monthNames[parseInt(mo) - 1]} ${y}`;
            }),
            datasets: [{
                label: 'Gasto Mensual (€)',
                data: sortedMonths.map(m => monthlyData[m]),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function aggregateBy(data, field) {
    return data.reduce((acc, p) => {
        acc[p[field]] = (acc[p[field]] || 0) + p.cantidad;
        return acc;
    }, {});
}

// ==================== EXPORT PDF ====================
function exportPDF() {
    const dataToExport = regFilteredData || payments;
    if (dataToExport.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Control de Pagos con Tarjeta de Crédito', 14, 22);
    doc.setFontSize(11);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 30);
    doc.text(`Total registros: ${dataToExport.length}`, 14, 36);
    doc.text(`Total cantidad: ${formatCurrency(dataToExport.reduce((s, p) => s + p.cantidad, 0))}`, 14, 42);
    
    doc.autoTable({
        startY: 50,
        head: [['Fecha', 'Concepto', 'Proyecto', 'Evento', 'Tipo de Pago', 'Tarjeta', 'Cantidad (€)', 'Encargado por', 'Observaciones']],
        body: dataToExport.map(p => [
            formatDate(p.fecha),
            p.concepto,
            p.proyecto || '',
            p.evento || '',
            p.tipoPago,
            p.tarjeta,
            formatCurrency(p.cantidad),
            p.encargado,
            p.observaciones || ''
        ]),
        foot: [['', '', '', '', '', '', 'TOTAL', formatCurrency(dataToExport.reduce((s, p) => s + p.cantidad, 0)), '']],
        footStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [243, 244, 246] }
    });
    
    doc.save('pagos_tarjeta_credito.pdf');
}

// ==================== EXPORT EXCEL ====================
function exportExcel() {
    const dataToExport = regFilteredData || payments;
    if (dataToExport.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const data = dataToExport.map(p => ({
        'Fecha': formatDate(p.fecha),
        'Concepto': p.concepto,
        'Proyecto': p.proyecto || '',
        'Evento': p.evento || '',
        'Tipo de Pago': p.tipoPago,
        'Tarjeta': p.tarjeta,
        'Cantidad (€)': p.cantidad,
        'Encargado por': p.encargado,
        'Observaciones': p.observaciones || ''
    }));
    
    // Add total row
    data.push({
        'Fecha': '',
        'Concepto': '',
        'Proyecto': '',
        'Evento': '',
        'Tipo de Pago': '',
        'Tarjeta': 'TOTAL',
        'Cantidad (€)': dataToExport.reduce((s, p) => s + p.cantidad, 0),
        'Encargado por': '',
        'Observaciones': ''
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
    
    // Auto-size columns
    const maxWidths = [12, 30, 15, 15, 15, 20, 30];
    ws['!cols'] = maxWidths.map(w => ({ wch: w }));
    
    XLSX.writeFile(wb, 'pagos_tarjeta_credito.xlsx');
}

// ==================== IMPORT EXCEL ====================
let importData = null;
let importHeaders = [];

function openImportModal() {
    document.getElementById('importModal').style.display = 'flex';
    document.getElementById('importFileInput').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('confirmImportBtn').style.display = 'none';
    importData = null;
    importHeaders = [];
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
    importData = null;
    importHeaders = [];
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            
            // First try with header detection
            let jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonData.length === 0) {
                alert('El archivo está vacío o no tiene datos válidos.');
                return;
            }

            importHeaders = Object.keys(jsonData[0]);
            
            // Check if first row looks like a title (few columns, single merged value)
            // If so, try reading with header row = 2
            const firstRow = jsonData[0];
            const values = Object.values(firstRow).filter(v => String(v).trim() !== '');
            if (values.length <= 2 && jsonData.length > 1) {
                // Likely a title row, try reading from row 2
                const jsonData2 = XLSX.utils.sheet_to_json(firstSheet, { defval: '', skipHidden: true });
                if (jsonData2.length > 1) {
                    // Check if second row has more consistent columns
                    const secondHeaders = Object.keys(jsonData2[1] || {});
                    if (secondHeaders.length >= importHeaders.length) {
                        jsonData = jsonData2.slice(1); // skip title row
                        importHeaders = secondHeaders;
                    }
                }
            }
            
            // Filter out rows that are completely empty
            jsonData = jsonData.filter(row => {
                const vals = Object.values(row).map(v => String(v).trim());
                return vals.some(v => v !== '');
            });

            importData = jsonData;
            renderImportPreview();
        } catch (err) {
            alert('Error al leer el archivo: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderImportPreview() {
    document.getElementById('importPreview').style.display = 'block';
    document.getElementById('confirmImportBtn').style.display = 'inline-block';
    document.getElementById('importCount').textContent = importData.length;

    // Render header
    const thead = document.getElementById('importPreviewHead');
    thead.innerHTML = '<tr>' + importHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';

    // Render first 5 rows
    const tbody = document.getElementById('importPreviewBody');
    tbody.innerHTML = importData.slice(0, 5).map(row =>
        '<tr>' + importHeaders.map(h => `<td>${escapeHtml(String(row[h]))}</td>`).join('') + '</tr>'
    ).join('');

    // Populate mapping selects
    const fields = [
        { id: 'mapFecha', label: 'Fecha' },
        { id: 'mapConcepto', label: 'Concepto' },
        { id: 'mapProyecto', label: 'Proyecto' },
        { id: 'mapEvento', label: 'Evento' },
        { id: 'mapTipoPago', label: 'Tipo de Pago' },
        { id: 'mapTarjeta', label: 'Tarjeta' },
        { id: 'mapCantidad', label: 'Cantidad' },
        { id: 'mapEncargado', label: 'Encargado por' },
        { id: 'mapObservaciones', label: 'Observaciones' }
    ];

    fields.forEach(f => {
        const select = document.getElementById(f.id);
        select.innerHTML = '<option value="">-- No mapear --</option>';
        importHeaders.forEach(h => {
            const option = document.createElement('option');
            option.value = h;
            option.textContent = h;
            // Auto-map by name similarity
            const hLower = h.toLowerCase();
            const fLower = f.label.toLowerCase();
            if (hLower.includes(fLower) || fLower.includes(hLower)) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    });
}

function parseExcelDate(value) {
    if (!value) return '';
    const str = String(value).trim();

    // Try DD/MM/YYYY or DD-MM-YYYY
    let match = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;

    // Try YYYY-MM-DD
    match = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

    // Try DD de Month YYYY (Spanish)
    const monthMap = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    match = str.match(/(\d{1,2})\s*(?:de\s+)?(\w+)(?:\s*(?:de\s+|del?\s+)?(\d{4}))?/i);
    if (match && monthMap[match[2].toLowerCase()]) {
        const year = match[3] || new Date().getFullYear();
        return `${year}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
    }

    // Try "20-21 de Mayo" style (ranges)
    match = str.match(/(\d{1,2})(?:\s*[-y]\s*\d{1,2})?\s+de\s+(\w+)/i);
    if (match && monthMap[match[2].toLowerCase()]) {
        const year = new Date().getFullYear();
        return `${year}-${monthMap[match[2].toLowerCase()]}-01`;
    }

    // Try as Excel serial date number
    if (!isNaN(value) && value > 40000 && value < 50000) {
        const excelDate = new Date((value - 25569) * 86400 * 1000);
        const y = excelDate.getFullYear();
        const m = String(excelDate.getMonth() + 1).padStart(2, '0');
        const d = String(excelDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    return str;
}

function parseExcelAmount(value) {
    if (typeof value === 'number') return value;
    const str = String(value).replace(/[€\s]/g, '').replace(',', '.').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

function confirmImport() {
    if (!importData || importData.length === 0) return;

    const mapFecha = document.getElementById('mapFecha').value;
    const mapConcepto = document.getElementById('mapConcepto').value;
    const mapProyecto = document.getElementById('mapProyecto').value;
    const mapEvento = document.getElementById('mapEvento').value;
    const mapTipoPago = document.getElementById('mapTipoPago').value;
    const mapTarjeta = document.getElementById('mapTarjeta').value;
    const mapCantidad = document.getElementById('mapCantidad').value;
    const mapEncargado = document.getElementById('mapEncargado').value;
    const mapObservaciones = document.getElementById('mapObservaciones').value;

    if (!mapFecha || !mapCantidad) {
        alert('Debes mapear al menos los campos Fecha y Cantidad.');
        return;
    }

    let imported = 0;
    importData.forEach(row => {
        const fecha = parseExcelDate(row[mapFecha]);
        if (!fecha) return;

        const newPayment = {
            id: generateId(),
            fecha: fecha,
            concepto: mapConcepto ? String(row[mapConcepto] || '').trim() : '',
            proyecto: mapProyecto ? String(row[mapProyecto] || '').trim() : '',
            evento: mapEvento ? String(row[mapEvento] || '').trim() : '',
            tipoPago: mapTipoPago ? String(row[mapTipoPago] || '').trim() : 'Otros',
            tarjeta: mapTarjeta ? String(row[mapTarjeta] || '').trim() : '',
            cantidad: parseExcelAmount(row[mapCantidad]),
            encargado: mapEncargado ? String(row[mapEncargado] || '').trim() : '',
            observaciones: mapObservaciones ? String(row[mapObservaciones] || '').trim() : ''
        };

        // Add new options to dropdowns if needed
        if (newPayment.tipoPago && !defaultOptions.tipoPago.includes(newPayment.tipoPago)) {
            defaultOptions.tipoPago.push(newPayment.tipoPago);
        }
        if (newPayment.tarjeta && !defaultOptions.tarjeta.includes(newPayment.tarjeta)) {
            defaultOptions.tarjeta.push(newPayment.tarjeta);
        }
        if (newPayment.encargado && !defaultOptions.encargado.includes(newPayment.encargado)) {
            defaultOptions.encargado.push(newPayment.encargado);
        }
        if (newPayment.proyecto && !defaultOptions.proyecto.includes(newPayment.proyecto)) {
            defaultOptions.proyecto.push(newPayment.proyecto);
        }
        if (newPayment.evento && !defaultOptions.evento.includes(newPayment.evento)) {
            defaultOptions.evento.push(newPayment.evento);
        }

        payments.push(newPayment);
        imported++;
    });

    defaultOptions.tipoPago.sort();
    defaultOptions.tarjeta.sort();
    defaultOptions.encargado.sort();
    defaultOptions.proyecto.sort();
    defaultOptions.evento.sort();

    saveLocal();
    importPaymentsAPI(payments);
    populateSelects();
    renderTable();
    closeImportModal();

    alert(`Se importaron ${imported} registros correctamente.`);
}

// ==================== BACKUP / RESTORE ====================
function toggleBackupMenu() {
    const menu = document.getElementById('backupMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-backup')) {
        const menu = document.getElementById('backupMenu');
        if (menu) menu.style.display = 'none';
    }
});

async function backupData() {
    let backup;
    try {
        backup = await api('/api/backup');
    } catch (e) {
        backup = {
            version: '1.0',
            date: new Date().toISOString(),
            payments: payments,
            options: defaultOptions
        };
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_pagos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('backupMenu').style.display = 'none';
    alert('Backup guardado correctamente.');
}

function exportAllData() {
    const data = {
        payments: payments,
        options: defaultOptions
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datos_pagos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('backupMenu').style.display = 'none';
}

async function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.payments && Array.isArray(data.payments)) {
                const count = data.payments.length;
                if (!confirm(`¿Restaurar ${count} registros? Se reemplazarán los datos actuales.`)) return;
                
                payments = data.payments;
                if (data.options) {
                    Object.keys(data.options).forEach(key => {
                        defaultOptions[key] = data.options[key];
                    });
                }

                // Send to API
                try {
                    await api('/api/backup', {
                        method: 'POST',
                        body: JSON.stringify({
                            payments: payments.map(p => ({
                                id: p.id,
                                fecha: p.fecha,
                                concepto: p.concepto,
                                proyecto: p.proyecto || '',
                                evento: p.evento || '',
                                tipoPago: p.tipoPago,
                                tarjeta: p.tarjeta,
                                cantidad: p.cantidad,
                                encargado: p.encargado,
                                observaciones: p.observaciones || '',
                            })),
                            options: Object.entries(defaultOptions).flatMap(([field, values]) =>
                                values.map(v => ({ field_name: field, value: v }))
                            ),
                        }),
                    });
                } catch (e) {
                    console.warn('API restore failed, using localStorage');
                }

                saveLocal();
                populateSelects();
                renderTable();
                alert(`Se restauraron ${count} registros correctamente.`);
            } else {
                alert('Formato de archivo no válido.');
            }
        } catch (err) {
            alert('Error al leer el archivo: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
    document.getElementById('backupMenu').style.display = 'none';
}

// ==================== TABS ====================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab).classList.add('active');
        
        if (this.dataset.tab === 'dashboard') {
            renderDashboard(payments);
        }
    });
});

// ==================== UTILITY FUNCTIONS ====================
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== INIT ====================
async function init() {
    await loadData();
    populateSelects();
    renderTable();
    document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
}

init();
