// זה Middleware שמנטר בקשות לשרת ושומר מידע על כל פעולה שבוצעה, כדי לעזור בדיבוג ובמעקב אחרי פעילות המערכת.
const fs = require('fs');
const path = require('path');

function createLogger({ env = 'development' } = {}) {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const message = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`;

      if (env === 'production') {
        const logsDir = path.join(__dirname, '..', 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.appendFileSync(path.join(logsDir, 'access.log'), `${message}\n`);
        return;
      }

      console.log(message);
    });

    next();
  };
}

module.exports = createLogger;
