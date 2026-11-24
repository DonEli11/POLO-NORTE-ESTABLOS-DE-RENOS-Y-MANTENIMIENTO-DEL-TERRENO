const app = require('./app');
const { sequelize, ensureDatabase } = require('./config/db');
require('./models');

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    await ensureDatabase();
    await sequelize.sync();
    app.listen(PORT, () => console.log(`API Polo Norte en http://localhost:${PORT}`));
  } catch (err) {
    console.error('No se pudo iniciar la API:', err.message);
    process.exit(1);
  }
})();
