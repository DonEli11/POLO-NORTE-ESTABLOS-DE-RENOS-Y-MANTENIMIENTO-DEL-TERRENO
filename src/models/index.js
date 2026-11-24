const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ESTADOS_RENO = ['DISPONIBLE', 'EN_DESCANSO', 'EN_REVISION', 'ASIGNADO_VUELO'];
const ZONAS = ['PISTA_DESPEGUE', 'ESTABLO', 'BODEGA_REGALOS', 'HANGAR_TRINEO'];
const TIPOS = ['LIMPIEZA_NIEVE', 'REPARACION', 'INSPECCION'];
const ESTADOS_MANT = ['PROGRAMADO', 'EN_CURSO', 'COMPLETADO', 'CANCELADO', 'PENDIENTE_CLIMA'];

const Reno = sequelize.define('Reno', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  edad: { type: DataTypes.INTEGER, allowNull: false },
  nivelEnergia: { type: DataTypes.INTEGER, allowNull: false },
  estado: { type: DataTypes.ENUM(...ESTADOS_RENO), allowNull: false, defaultValue: 'DISPONIBLE' },
}, { tableName: 'renos' });

const Mantenimiento = sequelize.define('Mantenimiento', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  zona: { type: DataTypes.ENUM(...ZONAS), allowNull: false },
  tipo: { type: DataTypes.ENUM(...TIPOS), allowNull: false },
  fechaProgramada: { type: DataTypes.DATEONLY, allowNull: false },
  responsable: { type: DataTypes.STRING(100), allowNull: false },
  estado: { type: DataTypes.ENUM(...ESTADOS_MANT), allowNull: false, defaultValue: 'PROGRAMADO' },
}, { tableName: 'mantenimientos' });

module.exports = { sequelize, Reno, Mantenimiento, ESTADOS_RENO, ZONAS, TIPOS, ESTADOS_MANT };
