const { ipcRenderer } = require('electron');
const calcularEntregaInsulinaFn = window.calcularEntregaInsulina || require('./calculo-insulina').calcularEntregaInsulina;

// --- Controles de ventana ---
document.getElementById('btnClose').addEventListener('click', () => {
  ipcRenderer.send('window-close');
});

document.getElementById('btnMinimize').addEventListener('click', () => {
  ipcRenderer.send('window-minimize');
});

const btnMaximize = document.getElementById('btnMaximize');
btnMaximize.addEventListener('click', () => {
  ipcRenderer.send('window-toggle-maximize');
  setTimeout(syncMaximizeButtonState, 40);
});

// --- Elementos del DOM ---
const vialCapacityUIInput = document.getElementById('vialCapacityUI');
const administrationCountInput = document.getElementById('administrationCount');
const administrationsList = document.getElementById('administrationsList');
const dailyTotalBox = document.getElementById('dailyTotalBox');
const btnAddAdministration = document.getElementById('btnAddAdministration');
const btnRemoveAdministration = document.getElementById('btnRemoveAdministration');

const resultArea = document.getElementById('resultArea');
const footerNote = document.getElementById('footerNote');
const actionsRow = document.getElementById('actionsRow');
const btnClearAll = document.getElementById('btnClearAll');
const btnAddPatient = document.getElementById('btnAddPatient');
const btnToggleFarMode = document.getElementById('btnToggleFarMode');
const btnOpenUpdates = document.getElementById('btnOpenUpdates');
const calcCard = document.querySelector('.calc-card');
const updateNotificationDot = document.getElementById('updateNotificationDot');
const appVersionLabel = document.getElementById('appVersionLabel');
const updateStatusText = document.getElementById('updateStatusText');
const updateProgress = document.getElementById('updateProgress');
const updateProgressBar = document.getElementById('updateProgressBar');
const updateReleaseNotes = document.getElementById('updateReleaseNotes');
const btnInstallUpdate = document.getElementById('btnInstallUpdate');

const patientsList = document.getElementById('patientsList');
const patientsCount = document.getElementById('patientsCount');
const filterNameInput = document.getElementById('filterName');
const filterRutInput = document.getElementById('filterRut');
const clearFilterNameBtn = document.getElementById('clearFilterName');
const clearFilterRutBtn = document.getElementById('clearFilterRut');

const patientModal = document.getElementById('patientModal');
const modalPatientName = document.getElementById('modalPatientName');
const modalPatientRut = document.getElementById('modalPatientRut');
const modalRutLiveFeedback = document.getElementById('modalRutLiveFeedback');
const patientModalStatus = document.getElementById('patientModalStatus');
const btnSavePatient = document.getElementById('btnSavePatient');
const btnCancelPatient = document.getElementById('btnCancelPatient');

const confirmModal = document.getElementById('confirmModal');
const confirmModalText = document.getElementById('confirmModalText');
const btnConfirmOk = document.getElementById('btnConfirmOk');
const btnConfirmCancel = document.getElementById('btnConfirmCancel');
const updatePanelModal = document.getElementById('updatePanelModal');
const btnCloseUpdates = document.getElementById('btnCloseUpdates');
const forceUpdateModal = document.getElementById('forceUpdateModal');
const forceUpdateText = document.getElementById('forceUpdateText');
const btnForceInstallUpdate = document.getElementById('btnForceInstallUpdate');

// --- Configuración operativa de insulina ---
const DIAS_MINIMOS_TRATAMIENTO = 30;
const DIAS_MAXIMOS_FRASCO_ABIERTO = 42;
// Cambiar aquí si el CESFAM trabaja con otra capacidad base.
const CAPACIDAD_FRASCO_UI_POR_DEFECTO = 1000;
const MAX_ADMINISTRACIONES = 10;
const FERIADOS_FIJOS_CHILE_MM_DD = [
  '05-01', // Día Nacional del Trabajo
  '05-21', // Día de las Glorias Navales
  '06-21', // Día Nacional de los Pueblos Indígenas
  '06-29', // San Pedro y San Pablo
  '07-16', // Día de la Virgen del Carmen
  '08-15', // Asunción de la Virgen
  '09-18', // Independencia Nacional
  '09-19', // Glorias del Ejército
  '10-12', // Encuentro de Dos Mundos
  '11-01', // Día de Todos los Santos
  '12-08', // Inmaculada Concepción
  '12-25' // Navidad
];

/**
 * @typedef {{ id: string; nombre: string; dosisUI: number }} AdministracionUI
 */

// --- Persistencia local ---
const PATIENTS_STORAGE_KEY = 'cesfam_saved_patients_v1';
const FAR_MODE_STORAGE_KEY = 'cesfam_far_mode_enabled_v1';
const MAX_PATIENTS = 200;

let patients = [];
let selectedPatientId = '';
let filterName = '';
let filterRut = '';
let mandatoryUpdatePending = false;
let updateNotificationPending = false;
let administrationIdSequence = 1;
/** @type {AdministracionUI[]} */
let administracionesState = [];
let patientsPersistQueue = Promise.resolve();
let farModeEnabled = false;

function setMandatoryUpdateState(active) {
  mandatoryUpdatePending = Boolean(active);
  ipcRenderer.send('set-close-blocked-by-update', mandatoryUpdatePending);
}

function setUpdateNotification(visible) {
  updateNotificationPending = Boolean(visible);
  updateNotificationDot.classList.toggle('hidden', !updateNotificationPending);
}

function sanitizeIntInput(input, minValue) {
  const digits = sanitizeDigitsOnly(input.value);
  if (digits === '') {
    input.value = '';
    return;
  }

  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) {
    input.value = '';
    return;
  }

  const min = minValue ?? 0;
  const maxByInputId = {
    vialCapacityUI: 99999,
    administrationCount: MAX_ADMINISTRACIONES
  };
  const max = maxByInputId[input.id] ?? 999;
  const clamped = n < min ? min : n > max ? max : n;
  input.value = String(clamped);
}

function isPositiveIntRestrictedField(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el === vialCapacityUIInput || el === administrationCountInput) return true;
  return el.classList.contains('administration-dose');
}

/** Bloquea letras, signos, e, punto, etc.; solo dígitos (pegar se normaliza en `sanitizeIntInput`). */
function shouldBlockKeyInPositiveIntField(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const k = event.key;
  if (k.length !== 1) return false;
  return !/[0-9]/.test(k);
}

function normalizeRut(rut) {
  return rut.replace(/[.\-\s]/g, '').toUpperCase();
}

function sanitizeLettersOnly(value) {
  return value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, '');
}

function normalizePersonName(value) {
  return sanitizeLettersOnly(value).replace(/\s+/g, ' ').trim();
}

function hasNameAndLastName(value) {
  const parts = normalizePersonName(value).split(' ').filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => part.length >= 2);
}

function sanitizeDigitsOnly(value) {
  return value.replace(/\D/g, '');
}

function sanitizeRutTyping(value) {
  return value.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
}

function isValidRutLength(normalizedRut) {
  return normalizedRut.length >= 8 && normalizedRut.length <= 9;
}

function isValidRutChile(normalizedRut) {
  if (!isValidRutLength(normalizedRut)) return false;

  const body = normalizedRut.slice(0, -1);
  const dv = normalizedRut.slice(-1);

  if (!/^\d+$/.test(body)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;

  return computeDv(body) === dv;
}

function formatRutChile(rutValue) {
  const normalized = normalizeRut(rutValue);
  if (normalized.length < 2) return normalized;

  const body = normalized.slice(0, -1);
  const dv = normalized.slice(-1);
  const bodyWithDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${bodyWithDots}-${dv}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setActionsVisible(visible) {
  actionsRow.style.display = visible ? 'flex' : 'none';
}

function focusFirstResultCard() {
  const firstResultCard = resultArea.querySelector('.result-card[tabindex="0"]');
  if (firstResultCard instanceof HTMLElement) firstResultCard.focus();
}

function applyFarMode(enabled) {
  farModeEnabled = Boolean(enabled);
  document.body.classList.toggle('accessibility-far-mode', farModeEnabled);
  btnToggleFarMode.classList.toggle('is-active', farModeEnabled);
  btnToggleFarMode.setAttribute('aria-pressed', String(farModeEnabled));
  btnToggleFarMode.textContent = farModeEnabled ? 'Modo de lejos: ON' : 'Modo de lejos: OFF';
}

function loadFarModePreference() {
  const raw = localStorage.getItem(FAR_MODE_STORAGE_KEY);
  applyFarMode(raw === '1');
}

function formatNumber(value, decimals = 2) {
  return Number(value).toLocaleString('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

function getDeliveryDayInfo(fechaISO) {
  const parsed = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { nombreDia: 'desconocido', esHabil: false, estadoTexto: 'No hábil' };
  }

  const nombreDia = parsed.toLocaleDateString('es-CL', { weekday: 'long' });
  const day = parsed.getDay();
  const esHabil = day !== 0;
  const estadoTexto = day === 6 ? 'Hábil' : (esHabil ? 'Hábil' : 'No hábil');
  return { nombreDia, esHabil, estadoTexto };
}

function formatLongSpanishDate(fechaISO) {
  const parsed = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fechaISO;
  return parsed.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getTodayISODate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFeriadosChileISOByYear(year) {
  return FERIADOS_FIJOS_CHILE_MM_DD.map((mmdd) => `${year}-${mmdd}`);
}

function getFeriadosOperativosISO() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear + 1];
  return years.flatMap((year) => getFeriadosChileISOByYear(year));
}

function getDefaultAdministrationName(position) {
  if (position === 0) return 'AM';
  if (position === 1) return 'PM';
  return `Administración ${position + 1}`;
}

function getAdministrationVisualLabel(position) {
  if (position === 0) return 'Administración AM';
  if (position === 1) return 'Administración PM';
  return `Administración ${position + 1}`;
}

function createAdministration(initialName = '', initialDose = 0) {
  const position = administracionesState.length;
  const safeName = initialName.trim() || getDefaultAdministrationName(position);
  const safeDose = Number.isFinite(initialDose) && initialDose >= 0 ? initialDose : 0;
  const next = {
    id: `adm-${administrationIdSequence++}`,
    nombre: safeName,
    dosisUI: safeDose
  };
  administracionesState.push(next);
}

function syncAdministrationCountInput() {
  administrationCountInput.value = String(administracionesState.length);
  btnRemoveAdministration.disabled = administracionesState.length <= 1;
}

function renderAdministrationsInputs() {
  administrationsList.innerHTML = administracionesState.map((admin, index) => `
    <div class="administration-item administration-item-${index % 2 === 0 ? 'am' : 'pm'}" data-admin-id="${escapeHtml(admin.id)}">
      <div class="administration-item-header">${escapeHtml(getAdministrationVisualLabel(index))}</div>
      <div class="input-row">
        <input
          type="text"
          class="input-field text-left administration-name"
          value="${escapeHtml(admin.nombre)}"
          maxlength="30"
          placeholder="${escapeHtml(getDefaultAdministrationName(index))}"
        />
      </div>
      <div class="input-row">
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="input-field administration-dose"
          value="${admin.dosisUI > 0 ? String(admin.dosisUI) : ''}"
          placeholder="0"
        />
        <span class="input-unit">UI</span>
      </div>
    </div>
  `).join('');

  syncAdministrationCountInput();
}

function setAdministrationCount(nextCount) {
  const safeCount = Math.max(1, Math.min(MAX_ADMINISTRACIONES, Math.trunc(nextCount)));
  while (administracionesState.length < safeCount) createAdministration();
  while (administracionesState.length > safeCount) administracionesState.pop();
  renderAdministrationsInputs();
}

function getAdministracionesFromUI() {
  return administracionesState.map((admin, index) => {
    const row = administrationsList.querySelector(`[data-admin-id="${admin.id}"]`);
    if (!row) return { nombre: admin.nombre, dosisUI: admin.dosisUI };

    const nameInput = row.querySelector('.administration-name');
    const doseInput = row.querySelector('.administration-dose');

    const nextName = (nameInput?.value || '').trim() || getDefaultAdministrationName(index);
    const rawDose = Number(doseInput?.value);
    const nextDose = Number.isFinite(rawDose) && rawDose >= 0 ? Math.trunc(rawDose) : 0;

    admin.nombre = nextName;
    admin.dosisUI = nextDose;
    return { nombre: nextName, dosisUI: nextDose };
  });
}

function setModalStatus(message, type) {
  patientModalStatus.textContent = message || '';
  patientModalStatus.classList.remove('status-ok', 'status-warn', 'status-info');
  if (type) patientModalStatus.classList.add(type);
}

function setUpdaterStatus(message, type = 'info') {
  updateStatusText.textContent = message || '';
  updateStatusText.classList.remove('status-ok', 'status-warn', 'status-error');

  if (type === 'ok') updateStatusText.classList.add('status-ok');
  else if (type === 'warn') updateStatusText.classList.add('status-warn');
  else if (type === 'error') updateStatusText.classList.add('status-error');
}

function setUpdateProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  updateProgress.classList.remove('hidden');
  updateProgressBar.style.width = `${safePercent.toFixed(1)}%`;
}

function resetUpdateProgress() {
  updateProgress.classList.add('hidden');
  updateProgressBar.style.width = '0%';
}

function setUpdateReleaseNotes(rawText) {
  const notes = String(rawText || '').trim();
  updateReleaseNotes.textContent = notes || 'Sin novedades publicadas aún.';
}

async function syncMaximizeButtonState() {
  try {
    const maximized = await ipcRenderer.invoke('window-is-maximized');
    btnMaximize.innerHTML = maximized ? '&#10064;' : '&#9723;';
    btnMaximize.title = maximized ? 'Restaurar' : 'Maximizar';
  } catch {
    btnMaximize.innerHTML = '&#9723;';
    btnMaximize.title = 'Maximizar';
  }
}

async function loadAppVersionLabel() {
  try {
    const version = await ipcRenderer.invoke('get-app-version');
    appVersionLabel.textContent = `v${version || '-'}`;
  } catch {
    appVersionLabel.textContent = 'v-';
  }
}

function openForceUpdateModal(message, installReady = false) {
  setMandatoryUpdateState(true);
  forceUpdateText.textContent = message;
  btnForceInstallUpdate.disabled = !installReady;
  forceUpdateModal.classList.remove('hidden');
}

function openUpdatePanel() {
  updatePanelModal.classList.remove('hidden');
}

function closeUpdatePanel() {
  updatePanelModal.classList.add('hidden');
}

function setRutLiveFeedback(message, type) {
  modalRutLiveFeedback.textContent = message || '';
  modalRutLiveFeedback.classList.remove('is-ok', 'is-warn');
  if (type) modalRutLiveFeedback.classList.add(type);
}

function isCurrentRutValidForSave() {
  const normalizedRut = sanitizeRutTyping(normalizeRut(modalPatientRut.value));
  return isValidRutLength(normalizedRut) && isValidRutChile(normalizedRut);
}

function updateSavePatientButtonState() {
  btnSavePatient.disabled = !isCurrentRutValidForSave();
}

function updateRutLiveFeedback() {
  const normalizedRut = sanitizeRutTyping(normalizeRut(modalPatientRut.value));

  if (!normalizedRut) {
    setRutLiveFeedback('', null);
    updateSavePatientButtonState();
    return;
  }

  if (!isValidRutLength(normalizedRut)) {
    setRutLiveFeedback(`RUT incompleto: faltan digitos (${normalizedRut.length}/8-9).`, 'is-warn');
    updateSavePatientButtonState();
    return;
  }

  if (!isValidRutChile(normalizedRut)) {
    setRutLiveFeedback('RUT invalido: el digito verificador no coincide.', 'is-warn');
    updateSavePatientButtonState();
    return;
  }

  setRutLiveFeedback('RUT valido.', 'is-ok');
  updateSavePatientButtonState();
}

function getCurrentFormData() {
  const administraciones = getAdministracionesFromUI();
  const dosisDiariaTotal = administraciones.reduce((acc, item) => acc + item.dosisUI, 0);

  return {
    capacidadFrascoUI: parseInt(vialCapacityUIInput.value, 10) || 0,
    administraciones,
    dosisDiariaTotal
  };
}

// --- Calculo principal ---
function calculate() {
  const form = getCurrentFormData();
  dailyTotalBox.textContent = `Dosis diaria total: ${form.dosisDiariaTotal} UI`;
  footerNote.textContent = `Reglas activas: cobertura mínima ${DIAS_MINIMOS_TRATAMIENTO} días, frasco abierto máximo ${DIAS_MAXIMOS_FRASCO_ABIERTO} días, entrega de lunes a sábado (no domingos ni feriados).`;

  if (form.capacidadFrascoUI <= 0) {
    setActionsVisible(false);
    resultArea.innerHTML = '<p class="result-placeholder">Ingresa una capacidad de frasco mayor a 0 UI.</p>';
    return;
  }

  if (form.administraciones.length === 0) {
    setActionsVisible(false);
    resultArea.innerHTML = '<p class="result-placeholder">Debes ingresar al menos una administración.</p>';
    return;
  }

  if (form.administraciones.some((admin) => admin.dosisUI < 0)) {
    setActionsVisible(false);
    resultArea.innerHTML = '<p class="result-placeholder">No se permiten dosis negativas.</p>';
    return;
  }

  if (form.dosisDiariaTotal <= 0) {
    setActionsVisible(false);
    resultArea.innerHTML = '<p class="result-placeholder">La dosis diaria total debe ser mayor a 0 UI para calcular.</p>';
    return;
  }

  try {
    const fechaReferenciaISO = getTodayISODate();
    const feriadosOperativosISO = getFeriadosOperativosISO();
    const resultado = calcularEntregaInsulinaFn({
      administraciones: form.administraciones,
      capacidadFrascoUI: form.capacidadFrascoUI,
      diasMinimosTratamiento: DIAS_MINIMOS_TRATAMIENTO,
      diasMaximosFrascoAbierto: DIAS_MAXIMOS_FRASCO_ABIERTO,
      feriadosISO: feriadosOperativosISO
    });

    const warningsHtml = '';

    const entregaInfo = getDeliveryDayInfo(resultado.fechaProximaEntregaHabilISO);
    const fechaEntregaTexto = formatLongSpanishDate(resultado.fechaProximaEntregaHabilISO);
    const fechaReferenciaTexto = formatLongSpanishDate(fechaReferenciaISO);

    resultArea.innerHTML = `
      <div class="result-grid">
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Dosis diaria total</p>
          <p class="result-card-value result-number-lg">${formatNumber(resultado.dosisDiariaTotal, 0)} UI</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Días que rinde 1 frasco</p>
          <p class="result-card-value result-number-lg">${formatNumber(resultado.diasQueRindeUnFrasco, 0)}</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Frascos a entregar</p>
          <p class="result-card-value result-number-lg">${resultado.cantidadFrascos}</p>
          <p class="result-card-sub">Mínimo ${DIAS_MINIMOS_TRATAMIENTO} días</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Cobertura total</p>
          <p class="result-card-value result-number-lg">${formatNumber(resultado.diasCoberturaTotal, 0)} días</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Próxima entrega hábil</p>
          <p class="result-card-value">${escapeHtml(fechaEntregaTexto)}</p>
          <p class="result-card-sub">Calculado desde: ${escapeHtml(fechaReferenciaTexto)}</p>
          <p class="result-card-sub">Día de prox. entrega: ${escapeHtml(entregaInfo.nombreDia)} | ${escapeHtml(entregaInfo.estadoTexto)}</p>
          <p class="result-card-sub">Ajuste por no hábil: adelanto de ${formatNumber(resultado.diasNoHabilesAdicionales, 0)} días</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Tipo de jeringa</p>
          <p class="result-card-value">${escapeHtml(resultado.tipoJeringa)}</p>
          <p class="result-card-sub">Regla actual: &lt;50 UI = 50UI | 50 a 100 UI = 100UI (criterio operativo) | &gt;100 UI = 100UI</p>
        </div>
        <div class="result-card" tabindex="0">
          <p class="result-card-title">Jeringas a entregar</p>
          <p class="result-card-value result-number-lg">${resultado.cantidadJeringas}</p>
          <p class="result-card-sub">${resultado.administracionesDiarias} administraciones/día</p>
        </div>
      </div>
      ${warningsHtml}
    `;
    setActionsVisible(true);
  } catch (error) {
    setActionsVisible(false);
    resultArea.innerHTML = `<p class="result-placeholder">${escapeHtml(error.message || 'No se pudo calcular la entrega.')}</p>`;
  }
}

// --- Pacientes guardados (panel derecho) ---
async function loadPatientsFromStorage() {
  try {
    const filePatients = await ipcRenderer.invoke('patients-read');
    if (Array.isArray(filePatients) && filePatients.length > 0) {
      patients = filePatients.slice(0, MAX_PATIENTS);
      return;
    }

    const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    patients = Array.isArray(parsed) ? parsed.slice(0, MAX_PATIENTS) : [];

    // Migra de localStorage a archivo en primer inicio con datos existentes.
    if (patients.length > 0) {
      await ipcRenderer.invoke('patients-write', patients);
    }
  } catch {
    patients = [];
  }
}

function persistPatients() {
  const snapshot = patients.slice(0, MAX_PATIENTS);
  localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(snapshot));

  patientsPersistQueue = patientsPersistQueue
    .then(() => ipcRenderer.invoke('patients-write', snapshot))
    .catch((error) => {
      console.error('[patients] No se pudo guardar pacientes.json/backup:', error);
    });

  return patientsPersistQueue;
}

function renderPatientsList() {
  updateAddPatientButton();

  if (patients.length === 0) {
    patientsCount.textContent = `0/${MAX_PATIENTS} pacientes`;
    patientsCount.classList.remove('is-full');
    patientsList.innerHTML = '<p class="records-empty">No hay pacientes guardados.</p>';
    return;
  }

  const nameQuery = filterName.trim().toLowerCase();
  const rutQuery = normalizeRut(filterRut).toLowerCase();

  const filtered = patients.filter((p) => {
    const nameOk = nameQuery === '' || p.name.toLowerCase().includes(nameQuery);
    const rutOk = rutQuery === '' || normalizeRut(p.rut).toLowerCase().includes(rutQuery);
    return nameOk && rutOk;
  });

  const isFiltering = nameQuery !== '' || rutQuery !== '';
  const atCapacity = patients.length >= MAX_PATIENTS;

  if (isFiltering) {
    patientsCount.textContent = `${filtered.length} de ${patients.length} pacientes`;
  } else if (atCapacity) {
    patientsCount.textContent = `${patients.length}/${MAX_PATIENTS} pacientes (limite alcanzado)`;
  } else {
    patientsCount.textContent = `${patients.length}/${MAX_PATIENTS} pacientes`;
  }
  patientsCount.classList.toggle('is-full', atCapacity && !isFiltering);

  if (filtered.length === 0) {
    patientsList.innerHTML = '<p class="records-empty">Sin resultados para la búsqueda.</p>';
    return;
  }

  const html = filtered.map((p) => {
    const activeClass = p.id === selectedPatientId ? 'active' : '';
    const dosisDiaria = Number.isFinite(p.dosisDiariaTotal) ? p.dosisDiariaTotal : 0;
    const administraciones = Array.isArray(p.administraciones) ? p.administraciones.length : 0;
    const summary = `Frasco ${p.capacidadFrascoUI || 0} UI | ${dosisDiaria} UI/día | ${administraciones} admin/día`;

    return `
      <div class="patient-item ${activeClass}">
        <button type="button" class="patient-load" data-id="${escapeHtml(p.id)}">
          <span class="patient-name">${escapeHtml(p.name)}</span>
          <span class="patient-rut">${escapeHtml(formatRutChile(p.rut))}</span>
          <span class="patient-summary">${escapeHtml(summary)}</span>
        </button>
        <button type="button" class="patient-delete" data-id="${escapeHtml(p.id)}">Eliminar</button>
      </div>
    `;
  }).join('');

  patientsList.innerHTML = html;
}

function loadPatient(id) {
  const patient = patients.find((p) => p.id === id);
  if (!patient) return;

  selectedPatientId = id;
  const administracionesPaciente = Array.isArray(patient.administraciones) ? patient.administraciones : [];
  administracionesState = [];
  administrationIdSequence = 1;
  administracionesPaciente.forEach((admin) => {
    createAdministration(admin?.nombre || '', Number(admin?.dosisUI) || 0);
  });
  if (administracionesState.length === 0) {
    createAdministration('AM', 0);
    createAdministration('PM', 0);
  }

  vialCapacityUIInput.value = patient.capacidadFrascoUI ? String(patient.capacidadFrascoUI) : '';
  renderAdministrationsInputs();

  calculate();
  renderPatientsList();
}

let _confirmCallback = null;

function openConfirmModal(message, onConfirm) {
  confirmModalText.textContent = message;
  _confirmCallback = onConfirm;
  confirmModal.classList.remove('hidden');
  btnConfirmOk.focus();
}

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
  _confirmCallback = null;
}

function deletePatient(id) {
  const patient = patients.find((p) => p.id === id);
  if (!patient) return;

  openConfirmModal(
    `Vas a eliminar a ${patient.name} (${formatRutChile(patient.rut)}). Esta accion no se puede deshacer.`,
    () => {
      patients = patients.filter((p) => p.id !== id);
      if (selectedPatientId === id) selectedPatientId = '';
      persistPatients();
      renderPatientsList();
    }
  );
}

// --- Modal: agregar paciente (opcional) ---
function updateAddPatientButton() {
  const atCapacity = patients.length >= MAX_PATIENTS;
  btnAddPatient.disabled = atCapacity;
  btnAddPatient.classList.toggle('is-disabled', atCapacity);
  btnAddPatient.title = atCapacity
    ? `Limite alcanzado (${MAX_PATIENTS} pacientes). Elimina alguno para agregar otro.`
    : '';
}

function openPatientModal() {
  if (patients.length >= MAX_PATIENTS) {
    return;
  }
  setModalStatus('', null);
  setRutLiveFeedback('', null);
  modalPatientName.value = '';
  modalPatientRut.value = '';
  updateSavePatientButtonState();
  patientModal.classList.remove('hidden');
  modalPatientName.focus();
}

function closePatientModal() {
  patientModal.classList.add('hidden');
}

function savePatientFromModal() {
  if (patients.length >= MAX_PATIENTS) {
    setModalStatus(`Limite alcanzado: ya hay ${MAX_PATIENTS} pacientes guardados. Elimina alguno para agregar uno nuevo.`, 'status-warn');
    return;
  }

  const name = normalizePersonName(modalPatientName.value);
  const rut = modalPatientRut.value.trim();

  if (!name || !rut) {
    setModalStatus('Debes completar nombre y RUT.', 'status-warn');
    return;
  }

  if (!hasNameAndLastName(name)) {
    setModalStatus('Debes ingresar nombre y apellido (al menos dos palabras validas).', 'status-warn');
    return;
  }

  const normalizedRut = sanitizeRutTyping(normalizeRut(rut));
  if (!isValidRutLength(normalizedRut)) {
    setModalStatus('RUT invalido: debe tener entre 8 y 9 caracteres (sin puntos ni guion).', 'status-warn');
    return;
  }

  if (!isValidRutChile(normalizedRut)) {
    setModalStatus('RUT invalido: verifica el numero y digito verificador.', 'status-warn');
    return;
  }
  const formattedRut = formatRutChile(normalizedRut);

  const existingPatient = patients.find((p) => p.id === normalizedRut);
  if (existingPatient) {
    setModalStatus(`Ese RUT ya existe: corresponde a ${existingPatient.name}.`, 'status-warn');
    return;
  }

  const form = getCurrentFormData();
  if (form.capacidadFrascoUI <= 0 || form.dosisDiariaTotal <= 0) {
    setModalStatus('Primero ingresa un calculo valido para guardar.', 'status-warn');
    return;
  }

  const record = {
    id: normalizedRut,
    name,
    rut: formattedRut,
    capacidadFrascoUI: form.capacidadFrascoUI,
    administraciones: form.administraciones,
    dosisDiariaTotal: form.dosisDiariaTotal,
    savedAt: Date.now()
  };

  patients.unshift(record);
  patients = patients.slice(0, MAX_PATIENTS);

  selectedPatientId = normalizedRut;
  persistPatients();
  renderPatientsList();

  setModalStatus('Paciente guardado en tu equipo.', 'status-ok');
  setTimeout(closePatientModal, 400);
}

function clearAllFields() {
  vialCapacityUIInput.value = String(CAPACIDAD_FRASCO_UI_POR_DEFECTO);
  administracionesState = [];
  administrationIdSequence = 1;
  createAdministration('AM', 0);
  createAdministration('PM', 0);
  renderAdministrationsInputs();

  selectedPatientId = '';
  calculate();
  renderPatientsList();
  vialCapacityUIInput.focus();
}

// --- Eventos ---
[vialCapacityUIInput, administrationCountInput].forEach((input) => {
  input.addEventListener('input', () => {
    if (input === vialCapacityUIInput) sanitizeIntInput(input, 1);
    else if (input === administrationCountInput) sanitizeIntInput(input, 1);

    if (input === administrationCountInput) {
      setAdministrationCount(parseInt(administrationCountInput.value, 10) || 1);
    }

    calculate();
  });
});

administrationsList.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.classList.contains('administration-dose')) sanitizeIntInput(target, 0);
  if (target.classList.contains('administration-name')) {
    target.value = target.value.replace(/\s{2,}/g, ' ').slice(0, 30);
  }
  calculate();
});

if (calcCard instanceof HTMLElement) {
  calcCard.addEventListener('keydown', (event) => {
    if (isPositiveIntRestrictedField(event.target) && shouldBlockKeyInPositiveIntField(event)) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter') return;
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.type === 'button') return;
    event.preventDefault();
    calculate();
    focusFirstResultCard();
  });
}

btnAddAdministration.addEventListener('click', () => {
  if (administracionesState.length >= MAX_ADMINISTRACIONES) return;
  createAdministration();
  renderAdministrationsInputs();
  calculate();
});

btnRemoveAdministration.addEventListener('click', () => {
  if (administracionesState.length <= 1) return;
  administracionesState.pop();
  renderAdministrationsInputs();
  calculate();
});

btnClearAll.addEventListener('click', clearAllFields);
btnAddPatient.addEventListener('click', openPatientModal);
btnToggleFarMode.addEventListener('click', () => {
  const nextEnabled = !farModeEnabled;
  applyFarMode(nextEnabled);
  localStorage.setItem(FAR_MODE_STORAGE_KEY, nextEnabled ? '1' : '0');
});
btnCancelPatient.addEventListener('click', closePatientModal);
btnSavePatient.addEventListener('click', savePatientFromModal);
btnOpenUpdates.addEventListener('click', openUpdatePanel);
btnCloseUpdates.addEventListener('click', closeUpdatePanel);
btnInstallUpdate.addEventListener('click', () => {
  setUpdateNotification(false);
  ipcRenderer.send('allow-close-for-update-install');
  setMandatoryUpdateState(false);
  ipcRenderer.send('install-update-now');
});
btnForceInstallUpdate.addEventListener('click', () => {
  setUpdateNotification(false);
  btnForceInstallUpdate.disabled = true;
  forceUpdateText.textContent = 'Instalando actualización. La app se reiniciará...';
  ipcRenderer.send('allow-close-for-update-install');
  setMandatoryUpdateState(false);
  ipcRenderer.send('install-update-now');
});

ipcRenderer.on('updater-status', (_event, payload) => {
  if (!payload || typeof payload.message !== 'string') return;
  setUpdaterStatus(payload.message, payload.type);
  if (mandatoryUpdatePending && payload.type === 'error') {
    forceUpdateText.textContent = `No se pudo completar la actualización: ${payload.message}`;
    btnForceInstallUpdate.disabled = false;
  }
});

ipcRenderer.on('updater-update-available', (_event, payload) => {
  setUpdateNotification(true);
  const versionLabel = payload?.version ? ` ${payload.version}` : '';
  setUpdateReleaseNotes(payload?.releaseNotes);
  openForceUpdateModal(
    `Se encontró una nueva versión${versionLabel}. La descarga comienza automáticamente y será obligatoria para continuar.`,
    false
  );
});

ipcRenderer.on('updater-progress', (_event, payload) => {
  if (!payload) return;
  setUpdateProgress(payload.percent);
  setUpdaterStatus(`Descargando actualización... ${Math.floor(payload.percent || 0)}%`, 'info');
  if (mandatoryUpdatePending) {
    forceUpdateText.textContent = `Descargando actualización obligatoria... ${Math.floor(payload.percent || 0)}%`;
  }
});

ipcRenderer.on('updater-downloaded', (_event, payload) => {
  setUpdateNotification(true);
  setUpdateProgress(100);
  const versionLabel = payload?.version ? ` ${payload.version}` : '';
  setUpdateReleaseNotes(payload?.releaseNotes);
  setUpdaterStatus(`Actualización${versionLabel} descargada. Puedes instalar ahora.`, 'ok');
  openForceUpdateModal(
    `Actualización${versionLabel} lista. Debes instalar ahora para seguir usando la app.`,
    true
  );
  btnInstallUpdate.classList.remove('hidden');
});

ipcRenderer.on('updater-no-update', () => {
  setUpdateNotification(false);
});

ipcRenderer.on('force-update-close-blocked', () => {
  if (!mandatoryUpdatePending) return;
  forceUpdateText.textContent = 'Debes actualizar para cerrar o continuar usando la aplicación.';
  forceUpdateModal.classList.remove('hidden');
});

modalPatientName.addEventListener('input', () => {
  const cleaned = sanitizeLettersOnly(modalPatientName.value).replace(/\s{2,}/g, ' ');
  if (cleaned !== modalPatientName.value) modalPatientName.value = cleaned;
});

modalPatientRut.addEventListener('input', () => {
  const cleaned = sanitizeRutTyping(modalPatientRut.value);
  modalPatientRut.value = formatRutChile(cleaned);
  updateRutLiveFeedback();
});

patientModal.addEventListener('click', (e) => {
  if (e.target === patientModal) closePatientModal();
});

updatePanelModal.addEventListener('click', (e) => {
  if (e.target === updatePanelModal) closeUpdatePanel();
});

btnConfirmOk.addEventListener('click', () => {
  const cb = _confirmCallback;
  closeConfirmModal();
  try {
    if (cb) cb();
  } catch (err) {
    console.error('[confirmModal] Error en callback de confirmacion:', err);
  }
});

btnConfirmCancel.addEventListener('click', closeConfirmModal);

confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) closeConfirmModal();
    else if (!updatePanelModal.classList.contains('hidden')) closeUpdatePanel();
    else if (!patientModal.classList.contains('hidden')) closePatientModal();
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    ipcRenderer.send('open-devtools');
  }
});

window.addEventListener('resize', () => {
  syncMaximizeButtonState();
});

patientsList.addEventListener('click', (event) => {
  const loadBtn = event.target.closest('.patient-load');
  if (loadBtn) {
    loadPatient(loadBtn.dataset.id);
    return;
  }

  const deleteBtn = event.target.closest('.patient-delete');
  if (deleteBtn) {
    deletePatient(deleteBtn.dataset.id);
  }
});

// --- Filtros de búsqueda de pacientes ---
function updateFilterClearVisibility() {
  filterNameInput.parentElement.classList.toggle('has-value', filterName !== '');
  filterRutInput.parentElement.classList.toggle('has-value', filterRut !== '');
}

filterNameInput.addEventListener('input', () => {
  const cleaned = sanitizeLettersOnly(filterNameInput.value);
  if (cleaned !== filterNameInput.value) filterNameInput.value = cleaned;
  filterName = cleaned;
  updateFilterClearVisibility();
  renderPatientsList();
});

filterRutInput.addEventListener('input', () => {
  const cleaned = sanitizeDigitsOnly(filterRutInput.value);
  if (cleaned !== filterRutInput.value) filterRutInput.value = cleaned;
  filterRut = cleaned;
  updateFilterClearVisibility();
  renderPatientsList();
});

clearFilterNameBtn.addEventListener('click', () => {
  filterNameInput.value = '';
  filterName = '';
  updateFilterClearVisibility();
  renderPatientsList();
  filterNameInput.focus();
});

clearFilterRutBtn.addEventListener('click', () => {
  filterRutInput.value = '';
  filterRut = '';
  updateFilterClearVisibility();
  renderPatientsList();
  filterRutInput.focus();
});

// --- Utilidades ---
function computeDv(numStr) {
  let sum = 0;
  let multiplier = 2;
  for (let i = numStr.length - 1; i >= 0; i--) {
    sum += parseInt(numStr[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return '0';
  if (mod === 10) return 'K';
  return String(mod);
}

// --- Seed de pacientes de prueba (solo desarrollo) ---
// Atajo: Ctrl+Shift+D genera 100 pacientes de prueba.
function generateTestPatients(count) {
  const available = MAX_PATIENTS - patients.length;
  if (available <= 0) {
    return;
  }
  const targetCount = Math.min(count, available);

  const firstNames = [
    'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Camila', 'Jose', 'Carla',
    'Diego', 'Sofia', 'Andres', 'Valentina', 'Matias', 'Javiera', 'Cristobal',
    'Francisca', 'Felipe', 'Constanza', 'Ignacio', 'Fernanda', 'Tomas', 'Isidora',
    'Sebastian', 'Paulina', 'Rodrigo', 'Catalina', 'Alejandro', 'Monica', 'Pablo',
    'Victoria'
  ];
  const lastNames = [
    'Gonzalez', 'Munoz', 'Rojas', 'Diaz', 'Perez', 'Soto', 'Contreras', 'Silva',
    'Martinez', 'Sepulveda', 'Morales', 'Fuentes', 'Araya', 'Espinoza', 'Castillo',
    'Tapia', 'Vega', 'Reyes', 'Cortes', 'Flores', 'Gutierrez', 'Torres', 'Pizarro',
    'Lagos', 'Ortiz', 'Campos', 'Navarro', 'Bravo', 'Salazar', 'Carrasco'
  ];

  const usedRuts = new Set(patients.map((p) => p.id));
  const usedNames = new Set(patients.map((p) => p.name));
  const generated = [];

  let safety = 0;
  while (generated.length < targetCount && safety < targetCount * 20) {
    safety++;
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln1 = lastNames[Math.floor(Math.random() * lastNames.length)];
    const ln2 = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${fn} ${ln1} ${ln2}`;
    if (usedNames.has(fullName)) continue;

    const body = String(5000000 + Math.floor(Math.random() * 20000000));
    const dv = computeDv(body);
    const rutId = `${body}${dv}`;
    if (usedRuts.has(rutId)) continue;

    usedRuts.add(rutId);
    usedNames.add(fullName);

    const doseAM = 5 + Math.floor(Math.random() * 35);
    const dosePM = 5 + Math.floor(Math.random() * 35);
    const administraciones = [
      { nombre: 'AM', dosisUI: doseAM },
      { nombre: 'PM', dosisUI: dosePM }
    ];

    generated.push({
      id: rutId,
      name: fullName,
      rut: formatRutChile(rutId),
      capacidadFrascoUI: CAPACIDAD_FRASCO_UI_POR_DEFECTO,
      administraciones,
      dosisDiariaTotal: doseAM + dosePM,
      savedAt: Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
    });
  }

  patients = [...generated, ...patients].slice(0, MAX_PATIENTS);
  persistPatients();
  renderPatientsList();
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    generateTestPatients(100);
  }
});

// --- Init ---
if (!vialCapacityUIInput.value) {
  vialCapacityUIInput.value = String(CAPACIDAD_FRASCO_UI_POR_DEFECTO);
}
createAdministration('AM', 0);
createAdministration('PM', 0);
renderAdministrationsInputs();

async function initializeApp() {
  loadFarModePreference();
  await loadPatientsFromStorage();
  renderPatientsList();
  calculate();
  setUpdateReleaseNotes('');
  loadAppVersionLabel();
  syncMaximizeButtonState();
}

initializeApp();
