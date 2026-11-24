const AppError = require('./AppError');
const { ESTADOS_RENO, ZONAS, TIPOS } = require('../models');

const isInt = (v) => Number.isInteger(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Fecha de hoy en formato YYYY-MM-DD (hora local)
function hoy() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

const invalido = (detalles) => new AppError(400, 'VALIDACION', 'La petición tiene datos inválidos', detalles);

function validarReno(body) {
  const errores = [];
  const { nombre, edad, nivelEnergia, estado } = body || {};

  if (!isNonEmptyString(nombre)) errores.push('nombre es obligatorio');
  if (!isInt(edad) || edad < 1 || edad > 25) errores.push('edad debe ser un entero entre 1 y 25');
  if (!isInt(nivelEnergia) || nivelEnergia < 0 || nivelEnergia > 100) {
    errores.push('nivelEnergia debe ser un entero entre 0 y 100');
  }
  if (estado !== undefined && !ESTADOS_RENO.includes(estado)) {
    errores.push(`estado debe ser uno de: ${ESTADOS_RENO.join(', ')}`);
  }
  if (errores.length) throw invalido(errores);
}

function validarMantenimiento(body) {
  const errores = [];
  const { zona, tipo, fechaProgramada, responsable } = body || {};

  if (!ZONAS.includes(zona)) errores.push(`zona debe ser una de: ${ZONAS.join(', ')}`);
  if (!TIPOS.includes(tipo)) errores.push(`tipo debe ser uno de: ${TIPOS.join(', ')}`);
  if (!isValidDate(fechaProgramada)) {
    errores.push('fechaProgramada es obligatoria (formato YYYY-MM-DD)');
  } else if (fechaProgramada < hoy()) {
    errores.push('fechaProgramada no puede ser una fecha pasada');
  }
  if (!isNonEmptyString(responsable)) errores.push('responsable es obligatorio');
  if (errores.length) throw invalido(errores);
}

function validarEnum(valor, permitidos, campo) {
  if (!permitidos.includes(valor)) throw invalido([`${campo} debe ser uno de: ${permitidos.join(', ')}`]);
}

module.exports = { validarReno, validarMantenimiento, validarEnum, hoy };
