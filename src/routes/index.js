const { Router } = require('express');
const auth = require('../controllers/authController');
const renos = require('../controllers/renoController');
const mantenimientos = require('../controllers/mantenimientoController');
const { requiereRol } = require('../middlewares/auth');
const AppError = require('../utils/AppError');

const router = Router();
const jefe = requiereRol('JEFE_ESTABLO');

// :id debe ser entero positivo
router.param('id', (_req, _res, next, id) => (
  /^\d+$/.test(id) ? next() : next(new AppError(400, 'ID_INVALIDO', 'El id debe ser un entero positivo', [`id recibido: ${id}`]))
));

router.post('/auth/login', auth.login);

router.post('/renos', jefe, renos.crear);
router.get('/renos', renos.listar);
router.get('/renos/:id', renos.obtener);
router.put('/renos/:id', jefe, renos.actualizar);
router.delete('/renos/:id', jefe, renos.eliminar);
router.patch('/renos/:id/asignacion', jefe, renos.asignar);

router.post('/mantenimientos', mantenimientos.crear);
router.get('/mantenimientos', mantenimientos.listar);
router.patch('/mantenimientos/:id/estado', mantenimientos.cambiarEstado);

router.get('/vuelo/resumen', renos.resumenVuelo); // extra B

module.exports = router;
