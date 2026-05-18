import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const AccessModeSchema = z.enum(['localhost', 'lan', 'private_server']).default('localhost');

const EnvSchema = z.object({
  TOONFLOW_DATA_DIR: z.string().optional(),
  TOONFLOW_HOST: z.string().optional(),
  TOONFLOW_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  TOONFLOW_BASE_URL: z.string().url().optional(),
  TOONFLOW_ACCESS_MODE: AccessModeSchema.optional(),
});

export type ToonflowAccessMode = z.infer<typeof AccessModeSchema>;

export interface ToonflowServerEnv {
  dataRoot: string;
  databasePath: string;
  artifactsRoot: string;
  host: string;
  port: number;
  baseUrl: string;
  accessMode: ToonflowAccessMode;
}

function getDefaultDataRoot() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Toonflow');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'Toonflow');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'toonflow');
}

export function getServerEnv(): ToonflowServerEnv {
  const parsed = EnvSchema.parse(process.env);
  const host = parsed.TOONFLOW_HOST || '127.0.0.1';
  const port = parsed.TOONFLOW_PORT || 3456;
  const accessMode = parsed.TOONFLOW_ACCESS_MODE || 'localhost';
  const dataRoot = path.resolve(parsed.TOONFLOW_DATA_DIR || getDefaultDataRoot());

  return {
    dataRoot,
    databasePath: path.join(dataRoot, 'toonflow.sqlite'),
    artifactsRoot: path.join(dataRoot, 'artifacts'),
    host,
    port,
    baseUrl: parsed.TOONFLOW_BASE_URL || `http://${host}:${port}`,
    accessMode,
  };
}
