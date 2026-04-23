// @ts-check
const assert = require('node:assert/strict');
const { calcularEntregaInsulina } = require('../calculo-insulina');

/**
 * @typedef {Parameters<typeof calcularEntregaInsulina>[0]} CalculoEntregaInput
 * @typedef {ReturnType<typeof calcularEntregaInsulina>} CalculoEntregaOutput
 */

/**
 * @param {string} nombre
 * @param {CalculoEntregaInput} input
 * @param {(output: CalculoEntregaOutput) => void} expectedChecks
 */
function ejecutarCaso(nombre, input, expectedChecks) {
  const output = calcularEntregaInsulina(input);
  expectedChecks(output);
  console.log(`OK: ${nombre}`);
}

const base = {
  capacidadFrascoUI: 840,
  diasMinimosTratamiento: 30,
  diasMaximosFrascoAbierto: 42,
  fechaReferenciaISO: '2026-04-20',
  feriadosISO: []
};

ejecutarCaso(
  'Caso 1: AM 10 / PM 10 => 84 jeringas si 1 frasco dura 42 dias',
  {
    ...base,
    administraciones: [
      { nombre: 'AM', dosisUI: 10 },
      { nombre: 'PM', dosisUI: 10 }
    ]
  },
  (output) => {
    assert.equal(output.dosisDiariaTotal, 20);
    assert.equal(output.tipoJeringa, '50UI');
    assert.equal(output.cantidadFrascos, 1);
    assert.equal(output.diasCoberturaTotal, 42);
    assert.equal(output.cantidadJeringas, 84);
  }
);

ejecutarCaso(
  'Caso 2: AM 60 => rango ambiguo, se asigna 100UI con advertencia',
  {
    ...base,
    administraciones: [{ nombre: 'AM', dosisUI: 60 }]
  },
  (output) => {
    assert.equal(output.tipoJeringa, '100UI');
    assert.equal(output.advertencias.some((item) => item.includes('Regla ambigua de jeringa')), true);
  }
);

ejecutarCaso(
  'Caso 3: AM 30 / PM 30 => jeringa 50UI',
  {
    ...base,
    administraciones: [
      { nombre: 'AM', dosisUI: 30 },
      { nombre: 'PM', dosisUI: 30 }
    ]
  },
  (output) => {
    assert.equal(output.tipoJeringa, '50UI');
  }
);

ejecutarCaso(
  'Caso 4: AM 70 / PM 20 => rango ambiguo, se asigna 100UI',
  {
    ...base,
    administraciones: [
      { nombre: 'AM', dosisUI: 70 },
      { nombre: 'PM', dosisUI: 20 }
    ]
  },
  (output) => {
    assert.equal(output.tipoJeringa, '100UI');
    assert.equal(output.advertencias.some((item) => item.includes('Regla ambigua de jeringa')), true);
  }
);

ejecutarCaso(
  'Caso 5: dosis baja, frasco dura mas de 42 dias => advertencia',
  {
    ...base,
    administraciones: [{ nombre: 'AM', dosisUI: 5 }]
  },
  (output) => {
    assert.equal(output.diasQueRindeUnFrasco > 42, true);
    assert.equal(output.advertencias.length > 0, true);
  }
);

ejecutarCaso(
  'Caso 6: ajuste por fin de semana y feriado para próxima entrega hábil',
  {
    capacidadFrascoUI: 300,
    diasMinimosTratamiento: 30,
    diasMaximosFrascoAbierto: 42,
    fechaReferenciaISO: '2026-04-17',
    feriadosISO: ['2026-05-18'],
    administraciones: [{ nombre: 'AM', dosisUI: 10 }]
  },
  (output) => {
    assert.equal(output.cantidadFrascos, 1);
    assert.equal(output.fechaProximaEntregaHabilISO, '2026-05-16');
    assert.equal(output.diasNoHabilesAdicionales, 1);
  }
);
