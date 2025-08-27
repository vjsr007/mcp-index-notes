import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
// Default: no pretty (stdout reserved for JSON-RPC). Opt-in with LOG_PRETTY=true
const pretty = process.env.LOG_PRETTY === 'true';

export const logger = pino({
  level,
  base: undefined,
  redact: {
    paths: ['metadata.secret', 'metadata.password', 'metadata.connectionString'],
    remove: true,
  },
  transport: pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: false,
          ignore: 'pid,hostname',
          destination: 2,
        },
      }
    : undefined,
}, pino.destination({ fd: 2 }));
