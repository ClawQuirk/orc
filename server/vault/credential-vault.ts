import fs from 'node:fs';
import path from 'node:path';
import { encrypt, decrypt, type EncryptedPayload } from './crypto.js';
import type { VaultContents, ServiceCredentials } from './types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const VAULT_PATH = path.join(DATA_DIR, 'vault.enc');
const VAULT_TMP = VAULT_PATH + '.tmp';

export class CredentialVault {
  private contents: VaultContents | null = null;
  private masterPassword: string | null = null;

  exists(): boolean {
    return fs.existsSync(VAULT_PATH);
  }

  isUnlocked(): boolean {
    return this.contents !== null && this.masterPassword !== null;
  }

  create(masterPassword: string): void {
    this.masterPassword = masterPassword;
    this.contents = { version: 1, services: {} };
    this.persist();
    console.log('[vault] Created new vault');
  }

  unlock(masterPassword: string): boolean {
    try {
      const raw = fs.readFileSync(VAULT_PATH, 'utf-8');
      const payload: EncryptedPayload = JSON.parse(raw);
      const decrypted = decrypt(payload, masterPassword);
      this.contents = JSON.parse(decrypted);
      this.masterPassword = masterPassword;
      console.log('[vault] Vault unlocked');
      return true;
    } catch {
      return false;
    }
  }

  lock(): void {
    this.contents = null;
    this.masterPassword = null;
    console.log('[vault] Vault locked');
  }

  getCredentials(pluginId: string): ServiceCredentials | null {
    if (!this.contents) return null;
    return this.contents.services[pluginId] ?? null;
  }

  setCredentials(pluginId: string, creds: ServiceCredentials): void {
    if (!this.contents) throw new Error('Vault is locked');
    this.contents.services[pluginId] = {
      ...creds,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  removeCredentials(pluginId: string): void {
    if (!this.contents) throw new Error('Vault is locked');
    delete this.contents.services[pluginId];
    this.persist();
  }

  listServices(): string[] {
    if (!this.contents) return [];
    return Object.keys(this.contents.services);
  }

  // --- DB Encryption Key helpers ---
  getDbEncryptionKey(): string | null {
    const creds = this.getCredentials('db-encryption-key');
    return creds?.extra?.key ?? null;
  }

  setDbEncryptionKey(key: string): void {
    this.setCredentials('db-encryption-key', {
      pluginId: 'db-encryption-key',
      type: 'api-key',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extra: { key },
    });
  }

  // --- Vault deletion (for recovery flow) ---
  delete(): void {
    this.lock();
    if (fs.existsSync(VAULT_PATH)) {
      fs.unlinkSync(VAULT_PATH);
      console.log('[vault] Vault deleted');
    }
  }

  private persist(): void {
    if (!this.contents || !this.masterPassword) {
      throw new Error('Vault is locked');
    }
    const plaintext = JSON.stringify(this.contents, null, 2);
    const payload = encrypt(plaintext, this.masterPassword);

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Atomic write
    fs.writeFileSync(VAULT_TMP, JSON.stringify(payload), 'utf-8');
    fs.renameSync(VAULT_TMP, VAULT_PATH);
  }
}
