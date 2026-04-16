const { ipcRenderer } = require('electron');

// --- Controles de ventana ---
document.getElementById('btnClose').addEventListener('click', () => {
  ipcRenderer.send('window-close');
});

document.getElementById('btnMinimize').addEventListener('click', () => {
  ipcRenderer.send('window-minimize');
});

// --- Elementos del DOM ---
const totalPillsInput = document.getElementById('totalPills');
const doseAMInput = document.getElementById('doseAM');
const dosePMInput = document.getElementById('dosePM');

const resultArea = document.getElementById('resultArea');
const footerNote = document.getElementById('footerNote');
const actionsRow = document.getElementById('actionsRow');
const btnClearAll = document.getElementById('btnClearAll');
const btnAddPatient = document.getElementById('btnAddPatient');
const updateStatusText = document.getElementById('updateStatusText');
const updateProgress = document.getElementById('updateProgress');
const updateProgressBar = document.getElementById('updateProgressBar');
const btnCheckUpdate = document.getElementById('btnCheckUpdate');
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

// --- Persistencia local ---
const PATIENTS_STORAGE_KEY = 'cesfam_saved_patients_v1';
const MAX_PATIENTS = 200;

let patients = [];
let selectedPatientId = '';
let filterName = '';
let filterRut = '';

// --- Nombres de meses en espanol ---
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function sanitizeIntInput(input, minValue) {
  if (input.value === '') return;

  const n = Math.trunc(Number(input.value));
  if (!Number.isFinite(n)) {
    input.value = String(minValue ?? 0);
    return;
  }

  const min = minValue ?? 0;
  const max = input.id === 'totalPills' ? 99999 : 99;
  const clamped = n < min ? min : n > max ? max : n;
  input.value = String(clamped);
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
  return {
    totalPills: parseInt(totalPillsInput.value, 10) || 0,
    doseAM: parseInt(doseAMInput.value, 10) || 0,
    dosePM: parseInt(dosePMInput.value, 10) || 0
  };
}

// --- Calculo principal ---
function calculate() {
  const total = parseInt(totalPillsInput.value, 10) || 0;
  const am = parseInt(doseAMInput.value, 10) || 0;
  const pm = parseInt(dosePMInput.value, 10) || 0;
  const perDay = am + pm;

  footerNote.textContent = total > 0
    ? `Calculo basado en ${total} comprimidos por caja`
    : 'Calculo basado en - comprimidos por caja';

  if (perDay === 0 || total === 0) {
    setActionsVisible(false);
    resultArea.innerHTML = `<p class="result-placeholder">
      ${total === 0
        ? 'Ingresa la cantidad de comprimidos por caja'
        : 'Ingresa la dosis de la manana y/o tarde para calcular'}
    </p>`;
    return;
  }

  const fullDays = Math.floor(total / perDay);
  const consumed = fullDays * perDay;
  const leftover = total - consumed;

  if (fullDays === 0) {
    setActionsVisible(true);
    resultArea.innerHTML = `
      <div class="result-main">
        <div class="result-badge badge-warning badge-insufficient">
          <div class="insufficient-line">
            No alcanzan los comprimidos: con AM+PM = ${perDay}, la caja tiene
          </div>
          <div class="insufficient-num">
            <span class="num-red">${total}</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + Math.max(fullDays - 1, 0));

  const dayNum = endDate.getDate();
  const monthName = MESES[endDate.getMonth()];
  const yearEnd = endDate.getFullYear();
  const currentYear = today.getFullYear();
  const yearLabel = yearEnd !== currentYear ? ` ${yearEnd}` : '';

  let leftoverBadge = '';
  let leftoverReason = '';

  if (leftover > 0) {
    leftoverBadge = `
      <div class="result-badge badge-leftover">
        Sobran ${leftover} comp. el ultimo dia
      </div>`;

    leftoverReason = `
      <p class="leftover-reason">
        Esto pasa porque la dosis diaria es <strong>${perDay}</strong> comp. en total, y
        <strong>${total}</strong> comp. por caja no se divide exactamente por esa cantidad.
      </p>
    `;
  } else {
    leftoverBadge = `
      <div class="result-badge badge-success">
        Sin sobrante - caja exacta
      </div>`;
  }

  resultArea.innerHTML = `
    <div class="result-main">
      <div class="result-days">${fullDays}</div>
      <div class="result-days-label">dias de duracion</div>
      <div class="result-date-row">
        <div class="result-badge">
          Se termina el ${dayNum} de ${monthName}${yearLabel}
        </div>
        ${leftoverBadge}
      </div>
      ${leftoverReason}
    </div>
  `;

  setActionsVisible(true);
}

// --- Pacientes guardados (panel derecho) ---
function loadPatientsFromStorage() {
  try {
    const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    patients = Array.isArray(parsed) ? parsed.slice(0, MAX_PATIENTS) : [];
  } catch {
    patients = [];
  }
}

function persistPatients() {
  localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients.slice(0, MAX_PATIENTS)));
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
    const summary = `${p.totalPills || 0} comp. | ${p.doseAM || 0} AM + ${p.dosePM || 0} PM`;

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
  totalPillsInput.value = patient.totalPills ? String(patient.totalPills) : '';
  doseAMInput.value = patient.doseAM ? String(patient.doseAM) : '';
  dosePMInput.value = patient.dosePM ? String(patient.dosePM) : '';

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
  if (form.totalPills <= 0 || (form.doseAM + form.dosePM) <= 0) {
    setModalStatus('Primero ingresa un calculo valido para guardar.', 'status-warn');
    return;
  }

  const record = {
    id: normalizedRut,
    name,
    rut: formattedRut,
    totalPills: form.totalPills,
    doseAM: form.doseAM,
    dosePM: form.dosePM,
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
  totalPillsInput.value = '';
  doseAMInput.value = '';
  dosePMInput.value = '';

  selectedPatientId = '';
  calculate();
  renderPatientsList();
  totalPillsInput.focus();
}

// --- Eventos ---
[totalPillsInput, doseAMInput, dosePMInput].forEach((input) => {
  input.addEventListener('input', () => {
    if (input === totalPillsInput) sanitizeIntInput(input, 1);
    else sanitizeIntInput(input, 0);

    calculate();
  });
});

btnClearAll.addEventListener('click', clearAllFields);
btnAddPatient.addEventListener('click', openPatientModal);
btnCancelPatient.addEventListener('click', closePatientModal);
btnSavePatient.addEventListener('click', savePatientFromModal);
btnCheckUpdate.addEventListener('click', () => {
  btnInstallUpdate.classList.add('hidden');
  resetUpdateProgress();
  ipcRenderer.send('check-for-updates');
});
btnInstallUpdate.addEventListener('click', () => {
  ipcRenderer.send('install-update-now');
});

ipcRenderer.on('updater-status', (_event, payload) => {
  if (!payload || typeof payload.message !== 'string') return;
  setUpdaterStatus(payload.message, payload.type);
});

ipcRenderer.on('updater-progress', (_event, payload) => {
  if (!payload) return;
  setUpdateProgress(payload.percent);
  setUpdaterStatus(`Descargando actualización... ${Math.floor(payload.percent || 0)}%`, 'info');
});

ipcRenderer.on('updater-downloaded', (_event, payload) => {
  setUpdateProgress(100);
  const versionLabel = payload?.version ? ` ${payload.version}` : '';
  setUpdaterStatus(`Actualización${versionLabel} descargada. Puedes instalar ahora.`, 'ok');
  btnInstallUpdate.classList.remove('hidden');
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
    else if (!patientModal.classList.contains('hidden')) closePatientModal();
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    ipcRenderer.send('open-devtools');
  }
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

// --- Seed de pacientes de prueba (solo desarrollo) ---
// Atajo: Ctrl+Shift+D genera 100 pacientes de prueba.

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

function generateTestPatients(count) {
  const available = MAX_PATIENTS - patients.length;
  if (available <= 0) {
    console.warn(`[seed] Limite alcanzado (${MAX_PATIENTS}). No se agrego ningun paciente.`);
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

    generated.push({
      id: rutId,
      name: fullName,
      rut: formatRutChile(rutId),
      totalPills: [30, 60, 100, 120, 200, 500, 1000][Math.floor(Math.random() * 7)],
      doseAM: 1 + Math.floor(Math.random() * 3),
      dosePM: 1 + Math.floor(Math.random() * 3),
      savedAt: Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
    });
  }

  patients = [...generated, ...patients].slice(0, MAX_PATIENTS);
  persistPatients();
  renderPatientsList();
  console.log(`[seed] Generados ${generated.length} pacientes de prueba.`);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    generateTestPatients(100);
  }
});

// --- Init ---
loadPatientsFromStorage();
renderPatientsList();
calculate();
