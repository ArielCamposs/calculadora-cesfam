// @ts-check

/**
 * @typedef {Object} Administracion
 * @property {string} nombre
 * @property {number} dosisUI
 */

/**
 * @typedef {Object} CalculoEntregaInput
 * @property {Administracion[]} administraciones
 * @property {number} capacidadFrascoUI
 * @property {number} diasMinimosTratamiento
 * @property {number} diasMaximosFrascoAbierto
 * @property {string[]} [feriadosISO]
 * @property {string} [fechaReferenciaISO]
 */

/**
 * @typedef {Object} CalculoEntregaOutput
 * @property {number} dosisDiariaTotal
 * @property {number} administracionesDiarias
 * @property {'50UI' | '100UI'} tipoJeringa
 * @property {number} cantidadFrascos
 * @property {number} diasCoberturaTotal
 * @property {number} cantidadJeringas
 * @property {number} diasQueRindeUnFrasco
 * @property {number} diasNoHabilesAdicionales
 * @property {string} fechaProximaEntregaHabilISO
 * @property {string[]} advertencias
 * @property {string[]} detalleCalculo
 */

/**
 * @param {CalculoEntregaInput} input
 * @returns {CalculoEntregaOutput}
 */
function calcularEntregaInsulina(input) {
  validarEntrada(input);

  const administracionesDiarias = input.administraciones.length;
  const dosisDiariaTotal = input.administraciones.reduce((acc, admin) => acc + admin.dosisUI, 0);

  if (dosisDiariaTotal <= 0) {
    throw new Error('La dosis diaria total debe ser mayor a 0 UI.');
  }

  const existeDosisMayorA100 = input.administraciones.some((admin) => admin.dosisUI > 100);
  const todasDosisMenoresA50 = input.administraciones.every((admin) => admin.dosisUI < 50);
  const existeDosisEntre50y100 = input.administraciones.some((admin) => admin.dosisUI >= 50 && admin.dosisUI <= 100);
  const tipoJeringa = existeDosisMayorA100 ? '100UI' : (todasDosisMenoresA50 ? '50UI' : '100UI');
  const diasQueRindeUnFrascoReal = input.capacidadFrascoUI / dosisDiariaTotal;
  const diasEfectivosPorFrasco = Math.min(diasQueRindeUnFrascoReal, input.diasMaximosFrascoAbierto);
  const frascosPorCobertura = Math.ceil(input.diasMinimosTratamiento / diasEfectivosPorFrasco);
  const cantidadFrascos = Math.max(1, frascosPorCobertura);
  const fechaInicio = parseDateOnly(input.fechaReferenciaISO || getTodayISODate());
  const feriadosSet = new Set((input.feriadosISO || []).map(normalizeIsoDate));

  const diasCoberturaTotalReal = cantidadFrascos * diasEfectivosPorFrasco;
  const diasCoberturaTotal = Math.floor(diasCoberturaTotalReal);
  const fechaTerminoTeorica = addDays(fechaInicio, diasCoberturaTotal);
  const fechaProximaEntregaHabil = moveToPreviousBusinessDay(fechaTerminoTeorica, feriadosSet);
  const diasNoHabilesAdicionales = diffDaysAbs(fechaProximaEntregaHabil, fechaTerminoTeorica);

  const diasQueRindeUnFrasco = Math.floor(diasQueRindeUnFrascoReal);
  const cantidadJeringas = diasCoberturaTotal * administracionesDiarias;

  /** @type {string[]} */
  const advertencias = [];
  /** @type {string[]} */
  const detalleCalculo = [];

  if (existeDosisEntre50y100 && !existeDosisMayorA100) {
    advertencias.push(
      'Regla ambigua de jeringa: hay dosis individuales entre 50 y 100 UI. Se asignó 100UI como criterio operativo provisional.'
    );
    // TODO_NEGOCIO: Definir criterio oficial de jeringa para dosis individuales entre 50 y 100 UI (incluye 50 y 100 exactos).
  }

  if (diasNoHabilesAdicionales > 0) {
    advertencias.push(
      `La fecha teórica de reposición cae en día no hábil; la entrega se adelanta ${diasNoHabilesAdicionales} día(s) hábiles.`
    );
  }

  detalleCalculo.push(`Dosis diaria total: ${dosisDiariaTotal} UI (${administracionesDiarias} administraciones/día).`);
  detalleCalculo.push(`Días que rinde 1 frasco: ${formatNumber(input.capacidadFrascoUI)} / ${dosisDiariaTotal} = ${formatNumber(diasQueRindeUnFrascoReal)} días (${diasQueRindeUnFrasco} días enteros).`);
  detalleCalculo.push(
    `Frascos mínimos por cobertura: ceil(${input.diasMinimosTratamiento} / min(${formatNumber(diasQueRindeUnFrascoReal)}, ${input.diasMaximosFrascoAbierto})) = ${cantidadFrascos}.`
  );
  detalleCalculo.push(
    `Cobertura total real: ${cantidadFrascos} x ${formatNumber(diasEfectivosPorFrasco)} = ${formatNumber(diasCoberturaTotalReal)} días (${diasCoberturaTotal} días enteros).`
  );
  detalleCalculo.push(
    `Fecha de reposición teórica: ${toISODate(fechaTerminoTeorica)}. Fecha de entrega hábil: ${toISODate(fechaProximaEntregaHabil)} (lunes a sábado, excluyendo domingos y feriados).`
  );
  detalleCalculo.push(
    `Jeringas: días enteros cubiertos (${diasCoberturaTotal}) x administraciones diarias (${administracionesDiarias}) = ${cantidadJeringas}.`
  );
  detalleCalculo.push(
    `Tipo de jeringa: ${tipoJeringa} (regla actual: 50UI si todas las dosis son < 50 UI; 100UI si alguna dosis es > 100 UI; rango 50-100 UI marcado como ambiguo).`
  );

  return {
    dosisDiariaTotal,
    administracionesDiarias,
    tipoJeringa,
    cantidadFrascos,
    diasCoberturaTotal,
    cantidadJeringas,
    diasQueRindeUnFrasco,
    diasNoHabilesAdicionales,
    fechaProximaEntregaHabilISO: toISODate(fechaProximaEntregaHabil),
    advertencias,
    detalleCalculo
  };
}

/**
 * @param {CalculoEntregaInput} input
 */
function validarEntrada(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Entrada inválida.');
  }

  if (!Array.isArray(input.administraciones) || input.administraciones.length === 0) {
    throw new Error('Debes ingresar al menos una administración diaria.');
  }

  input.administraciones.forEach((admin, idx) => {
    if (!admin || typeof admin !== 'object') {
      throw new Error(`La administración #${idx + 1} es inválida.`);
    }
    if (typeof admin.nombre !== 'string' || admin.nombre.trim() === '') {
      throw new Error(`La administración #${idx + 1} debe tener nombre.`);
    }
    if (!Number.isFinite(admin.dosisUI) || admin.dosisUI < 0) {
      throw new Error(`La dosis de "${admin.nombre}" debe ser un número mayor o igual a 0.`);
    }
  });

  if (!Number.isFinite(input.capacidadFrascoUI) || input.capacidadFrascoUI <= 0) {
    throw new Error('La capacidad del frasco debe ser mayor a 0 UI.');
  }

  if (!Number.isFinite(input.diasMinimosTratamiento) || input.diasMinimosTratamiento <= 0) {
    throw new Error('Los días mínimos de tratamiento deben ser mayores a 0.');
  }

  if (!Number.isFinite(input.diasMaximosFrascoAbierto) || input.diasMaximosFrascoAbierto <= 0) {
    throw new Error('Los días máximos de frasco abierto deben ser mayores a 0.');
  }

  if (typeof input.fechaReferenciaISO === 'string') {
    parseDateOnly(input.fechaReferenciaISO);
  }

  if (Array.isArray(input.feriadosISO)) {
    input.feriadosISO.forEach((isoDate) => {
      normalizeIsoDate(isoDate);
    });
  }
}

/**
 * @param {number} value
 */
function formatNumber(value) {
  return Number(value.toFixed(2));
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeIsoDate(value) {
  if (typeof value !== 'string') {
    throw new Error('Cada feriado debe ser texto en formato YYYY-MM-DD.');
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Feriado inválido "${value}". Usa formato YYYY-MM-DD.`);
  }
  parseDateOnly(trimmed);
  return trimmed;
}

/**
 * @param {string} value
 * @returns {Date}
 */
function parseDateOnly(value) {
  const normalized = normalizeIsoDateStructure(value);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida "${value}".`);
  }
  if (toISODate(date) !== normalized) {
    throw new Error(`Fecha inválida "${value}".`);
  }
  return date;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeIsoDateStructure(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error(`Fecha inválida "${value}". Usa formato YYYY-MM-DD.`);
  }
  return value.trim();
}

/**
 * @returns {string}
 */
function getTodayISODate() {
  return toISODate(new Date());
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {number}
 */
function diffDaysAbs(fromDate, toDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromUTC = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const toUTC = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.abs(Math.round((toUTC - fromUTC) / msPerDay));
}

/**
 * @param {Date} date
 * @param {Set<string>} feriadosSet
 * @returns {boolean}
 */
function isBusinessDay(date, feriadosSet) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return false;
  return !feriadosSet.has(toISODate(date));
}

/**
 * @param {Date} date
 * @param {Set<string>} feriadosSet
 * @returns {Date}
 */
function moveToPreviousBusinessDay(date, feriadosSet) {
  const candidate = new Date(date.getTime());
  while (!isBusinessDay(candidate, feriadosSet)) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

if (typeof module !== 'undefined') {
  module.exports = {
    calcularEntregaInsulina
  };
}

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).calcularEntregaInsulina = calcularEntregaInsulina;
}
