require('dotenv').config();
const express = require('express');
const routes = require('./routes');
const { manejadorErrores, noEncontrado } = require('./middlewares/errorHandler');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
