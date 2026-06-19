import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('Phase 7 documentation', () => {
  it('keeps required WhatsApp Business docs linked from README', () => {
    const readme = read('README.md');
    const docs = [
      'docs/whatsapp-business-api.md',
      'docs/whatsapp-business-setup.md',
      'docs/whatsapp-business-troubleshooting.md',
      'docs/phase7-interactive-draft-manager.md',
      'docs/phase7-pilot-checklist.md',
    ];

    for (const doc of docs) {
      expect(fs.existsSync(path.join(repoRoot, doc)), `${doc} exists`).toBe(true);
      expect(readme, `${doc} is linked from README`).toContain(doc);
    }
  });

  it('documents Meta setup, webhook configuration, local tunnel mode, and Mode B boundary', () => {
    const setup = read('docs/whatsapp-business-setup.md');
    const api = read('docs/whatsapp-business-api.md');
    const combined = `${setup}\n${api}`;

    for (const text of [
      'Meta app',
      'WhatsApp Business Platform / Cloud API',
      'WhatsApp Business phone number',
      'Cloud API access token',
      'Phone number ID',
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_BUSINESS_ALLOWED_USERS',
      'WHATSAPP_BUSINESS_PUBLIC_URL',
      'Public HTTPS webhook URL',
      'Mode A',
      'Mode B',
      'npm run whatsapp-business',
      'Webhook Verification',
    ]) {
      expect(combined).toContain(text);
    }
    expect(combined).toContain('Mode B is documented only');
  });

  it('documents interactive fallback, media handling, dry-run screenshots, and POST/CANCEL behavior', () => {
    const docs = [
      read('docs/whatsapp-business-api.md'),
      read('docs/whatsapp-business-setup.md'),
      read('docs/phase7-interactive-draft-manager.md'),
      read('docs/phase7-pilot-checklist.md'),
    ].join('\n');

    for (const text of [
      'interactive list',
      'reply buttons',
      'text fallback',
      'image.id',
      'artifacts/whatsapp-business/media',
      'artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json',
      'screenshot',
      'POST',
      'CANCEL',
      'local posting worker',
      'OpenCLI plugin',
      'local Brave/Chrome Browser Bridge',
    ]) {
      expect(docs).toContain(text);
    }
  });

  it('covers Phase 7 troubleshooting cases', () => {
    const troubleshooting = read('docs/whatsapp-business-troubleshooting.md');

    for (const heading of [
      'Webhook Verification Fails',
      'Invalid Token Or Signature',
      'Unknown User Rejected',
      'Button Or List Does Not Render',
      'Image Does Not Attach To Draft',
      'Local Worker Failed',
      'Browser Bridge Disconnected',
      'Facebook Logged Out',
      'Checkpoint, CAPTCHA, Or Action Blocked',
    ]) {
      expect(troubleshooting).toContain(`## ${heading}`);
    }
  });

  it('keeps Phase 7 pilot checklist usable by another operator', () => {
    const checklist = read('docs/phase7-pilot-checklist.md');

    for (const text of [
      'Send a menu trigger',
      'Confirm Main Menu renders',
      'Create a new draft',
      'Choose an existing approved group',
      'Send the caption',
      'Upload one to three images',
      'Send `DRY RUN`',
      'Confirm Facebook draft visually',
      'Send `CANCEL`',
      'POST Pilot',
      'explicit human approval',
    ]) {
      expect(checklist.toLowerCase()).toContain(text.toLowerCase());
    }
  });

  it('states Phase 7 safety boundaries without secrets in docs', () => {
    const docs = [
      read('README.md'),
      read('docs/whatsapp-business-api.md'),
      read('docs/whatsapp-business-setup.md'),
      read('docs/whatsapp-business-troubleshooting.md'),
      read('docs/phase7-interactive-draft-manager.md'),
      read('docs/phase7-pilot-checklist.md'),
    ].join('\n');

    for (const text of [
      'No scheduler',
      'No queue',
      'No multi-group posting',
      'No analytics',
      'No cloud browser automation',
      'No credential',
      'No CAPTCHA',
      'No stealth',
      'No automatic live posting',
      'No retry',
      'local OpenCLI plugin remains the only Facebook posting engine',
    ]) {
      expect(docs).toContain(text);
    }

    for (const forbidden of [
      '601234567890',
      'super-secret',
      'EAAG',
      'EAAI',
      'EAAJ',
      'xoxb-',
    ]) {
      expect(docs).not.toContain(forbidden);
    }
  });
});

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}
