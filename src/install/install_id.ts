/**
 * Anonymous install_id management
 * Generates and persists a UUID v4 for anonymous usage tracking
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCAL_DIR = '.local';
const INSTALL_ID_FILE = 'install_id';

/**
 * Get the path to the install_id file
 */
function getInstallIdPath(baseDir: string = process.cwd()): string {
  return path.join(baseDir, LOCAL_DIR, INSTALL_ID_FILE);
}

/**
 * Ensure the .local directory exists
 */
function ensureLocalDir(baseDir: string = process.cwd()): void {
  const localDir = path.join(baseDir, LOCAL_DIR);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
}

/**
 * Generate a new install_id (UUID v4)
 */
export function generateInstallId(): string {
  return uuidv4();
}

/**
 * Read existing install_id from file
 */
export function readInstallId(baseDir: string = process.cwd()): string | null {
  const filePath = getInstallIdPath(baseDir);
  try {
    if (fs.existsSync(filePath)) {
      const id = fs.readFileSync(filePath, 'utf-8').trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return id;
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Write install_id to file
 */
export function writeInstallId(id: string, baseDir: string = process.cwd()): void {
  ensureLocalDir(baseDir);
  const filePath = getInstallIdPath(baseDir);
  fs.writeFileSync(filePath, id, 'utf-8');
}

/**
 * Get or create install_id
 */
export function getOrCreateInstallId(baseDir: string = process.cwd()): string {
  let id = readInstallId(baseDir);
  if (!id) {
    id = generateInstallId();
    writeInstallId(id, baseDir);
  }
  return id;
}

/**
 * Build Kinosuke upgrade URL with install_id parameter
 */
export function buildUpgradeUrl(kinosukeBaseUrl: string, installId: string): string {
  const url = new URL(kinosukeBaseUrl);
  url.searchParams.set('install_id', installId);
  return url.toString();
}
