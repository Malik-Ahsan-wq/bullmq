const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const ACTIVE_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const COLORS = {
  debug: "\x1b[36m",   // cyan
  info:  "\x1b[32m",   // green
  warn:  "\x1b[33m",   // yellow
  error: "\x1b[31m",   // red
  reset: "\x1b[0m",
  dim:   "\x1b[2m",
  bold:  "\x1b[1m",
};

function timestamp() {
  return new Date().toISOString();
}

function format(level, context, message, meta) {
  const color = COLORS[level];
  const ts = `${COLORS.dim}${timestamp()}${COLORS.reset}`;
  const lvl = `${color}${COLORS.bold}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const ctx = `${COLORS.dim}[${context}]${COLORS.reset}`;
  const msg = `${color}${message}${COLORS.reset}`;
  const metaStr = meta ? ` ${COLORS.dim}${JSON.stringify(meta)}${COLORS.reset}` : "";
  return `${ts} ${lvl} ${ctx} ${msg}${metaStr}`;
}

function createLogger(context) {
  return {
    debug: (message, meta) => {
      if (ACTIVE_LEVEL <= LEVELS.debug)
        console.debug(format("debug", context, message, meta));
    },
    info: (message, meta) => {
      if (ACTIVE_LEVEL <= LEVELS.info)
        console.log(format("info", context, message, meta));
    },
    warn: (message, meta) => {
      if (ACTIVE_LEVEL <= LEVELS.warn)
        console.warn(format("warn", context, message, meta));
    },
    error: (message, meta) => {
      if (ACTIVE_LEVEL <= LEVELS.error)
        console.error(format("error", context, message, meta));
    },
  };
}

module.exports = { createLogger };
