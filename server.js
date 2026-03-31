import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50kb' }));

// Security middleware — CORS + CSRF protection (must be before static files and routes)
app.use((req, res, next) => {
  // CORS — strict origin check (only allow same localhost:PORT)
  const origin = req.headers.origin;
  const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden: cross-origin request blocked' });
  }
  res.setHeader('Access-Control-Allow-Origin', `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Require X-Requested-With header on all API routes to prevent CSRF via form submissions
app.use('/api', (req, res, next) => {
  if (req.method !== 'OPTIONS' && !req.headers['x-requested-with']) {
    return res.status(403).json({ error: 'Forbidden: missing required header' });
  }
  next();
});

// Validate projectPath on all POST API routes that include a path in the body
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.body && req.body.path) {
    try {
      req.body.path = assertSafePath(req.body.path, 'Project path');
    } catch (e) {
      return res.status(403).json({ error: e.message });
    }
  }
  next();
});

app.use(express.static(join(__dirname, 'public')));

// ---------- CLI detection ----------

// Validate inputs to prevent injection via argument values
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/;
function assertSafeName(name, label = 'name') {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid ${label}: must start with alphanumeric, then alphanumeric/hyphens/underscores`);
  }
}

// Validate project paths — must be within user's home directory
const HOME = process.env.HOME;
function assertSafePath(p, label = 'path') {
  if (!p) throw new Error(`${label} required`);
  const resolved = resolve(p);
  if (!resolved.startsWith(HOME)) {
    throw new Error(`${label} must be within your home directory`);
  }
  return resolved;
}

// Detect whether 'icp' or 'dfx' CLI is available
// Prefer icp CLI (modern replacement), fall back to legacy dfx
function detectCli() {
  // Try icp CLI first — it's the official modern tool
  const icpResult = spawnSync('icp', ['--version'], { encoding: 'utf-8', timeout: 5000 });
  if (icpResult.status === 0 && (icpResult.stdout || '').toLowerCase().includes('icp')) {
    return 'icp';
  }
  // Fall back to legacy dfx
  const dfxResult = spawnSync('dfx', ['--version'], { encoding: 'utf-8', timeout: 5000 });
  if (dfxResult.status === 0 && (dfxResult.stdout || '').toLowerCase().includes('dfx')) {
    return 'dfx';
  }
  // Last resort fallbacks
  if (icpResult.error === undefined) return 'icp';
  if (dfxResult.error === undefined) return 'dfx';
  return 'icp'; // default to modern CLI
}

const CLI = detectCli();

// Map between dfx and icp CLI argument differences
function networkArgs(network) {
  if (!network || network === 'local') return [];
  assertSafeName(network, 'network');
  if (CLI === 'icp') return ['-e', network];
  return ['--network', network];
}

// ---------- helpers ----------

// Get canister ID — dfx uses 'canister id', icp CLI uses 'canister status --id-only'
function getCanisterId(canister, netArgs, cwd) {
  if (CLI === 'icp') {
    return runCliSync(['canister', 'status', canister, '--id-only', ...netArgs], cwd);
  }
  return runCliSync(['canister', 'id', canister, ...netArgs], cwd);
}

// Secure: uses spawnSync with argument arrays — no shell interpolation
function runCliSync(args, cwd) {
  try {
    const result = spawnSync(CLI, args, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, HOME: process.env.HOME },
    });
    if (result.status === 0) {
      return { ok: true, data: (result.stdout || '').trim() };
    }
    return { ok: false, data: (result.stderr || result.stdout || '').trim() };
  } catch (e) {
    return { ok: false, data: e.message };
  }
}

// ---------- Deploy history ----------

const DEPLOY_HISTORY_FILE = '.deploy-history.json';

function readDeployHistory(projectPath) {
  const histPath = join(projectPath, DEPLOY_HISTORY_FILE);
  if (!existsSync(histPath)) return [];
  try {
    const data = JSON.parse(readFileSync(histPath, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function recordDeploy(projectPath, { canister, network, moduleHash, deployMode }) {
  // Get git info from the project
  const gitCommitResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: projectPath, encoding: 'utf-8', timeout: 5000,
  });
  const gitBranchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: projectPath, encoding: 'utf-8', timeout: 5000,
  });
  const gitDirtyResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: projectPath, encoding: 'utf-8', timeout: 5000,
  });

  const entry = {
    canister,
    network,
    moduleHash: moduleHash || null,
    gitCommit: gitCommitResult.status === 0 ? gitCommitResult.stdout.trim() : null,
    gitBranch: gitBranchResult.status === 0 ? gitBranchResult.stdout.trim() : null,
    gitDirty: gitDirtyResult.status === 0 ? gitDirtyResult.stdout.trim().length > 0 : null,
    timestamp: new Date().toISOString(),
    deployMode: deployMode || 'auto',
  };

  let history = readDeployHistory(projectPath);
  history.push(entry);
  if (history.length > 500) history = history.slice(-500); // cap at 500 entries
  try {
    writeFileSync(join(projectPath, DEPLOY_HISTORY_FILE), JSON.stringify(history, null, 2));
  } catch {
    // Non-fatal — don't break deploy if history write fails
  }
  return entry;
}

// ---------- Top-up history ----------

const TOPUP_HISTORY_FILE = '.topup-history.json';

function readTopupHistory(projectPath) {
  const histPath = join(projectPath, TOPUP_HISTORY_FILE);
  if (!existsSync(histPath)) return [];
  try {
    const data = JSON.parse(readFileSync(histPath, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function recordTopup(projectPath, { canister, network, amount, success, output }) {
  const entry = {
    canister,
    network,
    amount: String(amount),
    success,
    output: output || '',
    timestamp: new Date().toISOString(),
  };

  let history = readTopupHistory(projectPath);
  history.push(entry);
  if (history.length > 500) history = history.slice(-500);
  try {
    writeFileSync(join(projectPath, TOPUP_HISTORY_FILE), JSON.stringify(history, null, 2));
  } catch {
    // Non-fatal
  }
  return entry;
}

// Look up a module hash in deploy history to find version info
function lookupVersion(history, canister, network, moduleHash) {
  if (!moduleHash || !history.length) return null;
  // Search backwards (most recent first) for a matching entry
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.canister === canister && e.network === network && e.moduleHash === moduleHash) {
      return e;
    }
  }
  return null;
}

// ---------- REST endpoints ----------

// Which CLI are we using?
app.get('/api/cli', (_req, res) => {
  const versionResult = runCliSync(['--version']);
  res.json({ cli: CLI, version: versionResult.ok ? versionResult.data : 'unknown' });
});

// List identities
app.get('/api/identities', (_req, res) => {
  // icp CLI: 'identity default' (no arg) returns current identity name
  // dfx: 'identity whoami' returns current identity name
  const whoamiCmd = CLI === 'icp' ? ['identity', 'default'] : ['identity', 'whoami'];
  const currentResult = runCliSync(whoamiCmd);
  const currentIdentity = currentResult.ok ? currentResult.data : '';

  const result = runCliSync(['identity', 'list']);
  if (!result.ok) return res.status(500).json({ error: result.data });

  const lines = result.data.split('\n').filter((l) => l.trim());
  const identities = lines.map((line) => {
    if (CLI === 'icp') {
      // icp format: "  name   principal" or "* name   principal"
      const isActive = line.startsWith('*');
      const parts = line.replace(/^\*?\s+/, '').split(/\s+/);
      const name = parts[0];
      return { name, active: isActive };
    } else {
      // dfx format: "name" or "name *" for active
      const isActive = line.includes('*');
      const name = line.replace(/\s*\*/, '').trim();
      return { name, active: isActive || name === currentIdentity };
    }
  });
  res.json(identities);
});

// Get current identity
app.get('/api/identity/current', (_req, res) => {
  // icp CLI: 'identity default' (no arg) = whoami
  const cmd = CLI === 'icp' ? ['identity', 'default'] : ['identity', 'whoami'];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ identity: result.data });
});

// Switch identity
app.post('/api/identity/use', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    assertSafeName(name, 'identity name');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // icp CLI uses 'identity default' instead of 'identity use'
  const cmd = CLI === 'icp' ? ['identity', 'default', name] : ['identity', 'use', name];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ ok: true, identity: name });
});

// Create new identity
app.post('/api/identity/new', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    assertSafeName(name, 'identity name');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const cmd = CLI === 'icp'
    ? ['identity', 'new', name, '--storage', 'plaintext']
    : ['identity', 'new', name, '--storage-mode', 'plaintext'];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ ok: true, name, seed: result.data });
});

// Rename identity
app.post('/api/identity/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
  try {
    assertSafeName(oldName, 'identity name');
    assertSafeName(newName, 'identity name');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const cmd = ['identity', 'rename', oldName, newName];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ ok: true, oldName, newName });
});

// Export identity PEM
app.post('/api/identity/export', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    assertSafeName(name, 'identity name');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const cmd = ['identity', 'export', name];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.json({ ok: true, pem: result.data });
});

// Import identity from PEM
app.post('/api/identity/import', (req, res) => {
  const { name, pem } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!pem) return res.status(400).json({ error: 'pem required' });
  if (!pem.includes('-----BEGIN') || !pem.includes('-----END')) {
    return res.status(400).json({ error: 'Invalid PEM format' });
  }
  if (pem.length > 10000) {
    return res.status(400).json({ error: 'PEM data too large' });
  }
  try {
    assertSafeName(name, 'identity name');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Write PEM to temp file, import, then delete
  const tmpFile = join(tmpdir(), `icp-import-${randomUUID()}.pem`);
  try {
    writeFileSync(tmpFile, pem);
    const cmd = CLI === 'icp'
      ? ['identity', 'import', name, '--from-pem', tmpFile, '--storage', 'plaintext']
      : ['identity', 'import', name, tmpFile, '--storage-mode', 'plaintext'];
    const result = runCliSync(cmd);
    if (!result.ok) return res.status(500).json({ error: result.data });
    res.json({ ok: true, name });
  } finally {
    try { unlinkSync(tmpFile); } catch (_) {}
  }
});

// Get principal for current identity
app.get('/api/identity/principal', (_req, res) => {
  const cmd = CLI === 'icp' ? ['identity', 'principal'] : ['identity', 'get-principal'];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ principal: result.data });
});

// Read dfx.json or icp.yaml from a project folder
app.post('/api/project/info', (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });

  const dfxPath = join(projectPath, 'dfx.json');
  const icpYamlPath = join(projectPath, 'icp.yaml');
  const hasDfxJson = existsSync(dfxPath);
  const hasIcpYaml = existsSync(icpYamlPath);

  if (!hasDfxJson && !hasIcpYaml) {
    return res.status(404).json({ error: 'No icp.yaml or dfx.json found in that folder' });
  }

  try {
    // Prefer icp.yaml when both exist (modern ICP CLI format)
    if (hasIcpYaml) {
      // icp.yaml parsing: line-based parser for canisters array and environments
      const yamlContent = readFileSync(icpYamlPath, 'utf-8');
      const canisters = [];
      const environments = [];
      let currentCanister = null;
      let currentEnv = null;
      let section = null; // 'canisters' | 'environments' | null

      for (const line of yamlContent.split('\n')) {
        // Detect top-level sections
        if (/^canisters:/.test(line)) { section = 'canisters'; continue; }
        if (/^environments:/.test(line)) { section = 'environments'; continue; }
        if (/^\S/.test(line) && !line.startsWith('#')) { section = null; continue; }

        if (section === 'canisters') {
          const nameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
          if (nameMatch) {
            if (currentCanister) canisters.push(currentCanister);
            currentCanister = { name: nameMatch[1].trim().replace(/^["']|["']$/g, ''), type: 'unknown', main: null, source: null, dependencies: [] };
          }
          if (currentCanister) {
            const typeMatch = line.match(/^\s+type:\s*["']?(@?[^"'\s]+)/);
            if (typeMatch) {
              const t = typeMatch[1];
              if (t.includes('rust')) currentCanister.type = 'rust';
              else if (t.includes('motoko')) currentCanister.type = 'motoko';
              else if (t.includes('asset')) currentCanister.type = 'assets';
              else if (t.includes('prebuilt')) currentCanister.type = 'custom';
              else currentCanister.type = t;
            }
            const mainMatch = line.match(/^\s+main:\s*(.+)/);
            if (mainMatch) currentCanister.main = mainMatch[1].trim().replace(/^["']|["']$/g, '');
            const dirMatch = line.match(/^\s+dir:\s*(.+)/);
            if (dirMatch) currentCanister.source = dirMatch[1].trim().replace(/^["']|["']$/g, '');
            const packageMatch = line.match(/^\s+package:\s*(.+)/);
            if (packageMatch) currentCanister.source = packageMatch[1].trim().replace(/^["']|["']$/g, '');
          }
        }

        if (section === 'environments') {
          const envNameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
          if (envNameMatch) {
            if (currentEnv) environments.push(currentEnv);
            currentEnv = { name: envNameMatch[1].trim().replace(/^["']|["']$/g, ''), network: null };
          }
          if (currentEnv) {
            const netMatch = line.match(/^\s+network:\s*(.+)/);
            if (netMatch) currentEnv.network = netMatch[1].trim().replace(/^["']|["']$/g, '');
          }
        }
      }
      if (currentCanister) canisters.push(currentCanister);
      if (currentEnv) environments.push(currentEnv);

      // Build network list from environments — icp CLI uses environments instead of networks
      // Always include 'local' and 'ic' (implicit environments)
      const networkSet = new Set(['local', 'ic']);
      for (const env of environments) {
        networkSet.add(env.name);
      }
      res.json({ canisters, networks: [...networkSet], environments, raw: yamlContent, configType: 'icp.yaml' });
    } else {
      // Legacy dfx.json parsing
      const dfxJson = JSON.parse(readFileSync(dfxPath, 'utf-8'));
      const canisters = Object.entries(dfxJson.canisters || {}).map(
        ([name, config]) => ({
          name,
          type: config.type || 'unknown',
          main: config.main || null,
          source: config.source ? config.source[0] : null,
          dependencies: config.dependencies || [],
          remote: config.remote || null,
          pullType: config.type === 'pull' ? true : false,
        })
      );
      // Collect networks from dfx.json config + canister_ids.json
      const networkSet = new Set(Object.keys(dfxJson.networks || {}));
      const canisterIds = readCanisterIds(projectPath);
      for (const canisterEntry of Object.values(canisterIds)) {
        if (canisterEntry && typeof canisterEntry === 'object') {
          for (const netKey of Object.keys(canisterEntry)) {
            networkSet.add(netKey);
          }
        }
      }
      networkSet.add('local');
      const networks = [...networkSet];
      res.json({ canisters, networks, raw: dfxJson, configType: 'dfx.json' });
    }
  } catch (e) {
    res.status(500).json({ error: `Failed to parse project config: ${e.message}` });
  }
});

// Add or remove an environment/network in icp.yaml or dfx.json
app.post('/api/project/network', (req, res) => {
  const { path: projectPath, action, name, config } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });
  if (!name) return res.status(400).json({ error: 'network name required' });
  try { assertSafeName(name, 'network name'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (name === 'local') return res.status(400).json({ error: 'Cannot modify the local environment' });

  const icpYamlPath = join(projectPath, 'icp.yaml');
  const dfxPath = join(projectPath, 'dfx.json');
  const hasIcpYaml = existsSync(icpYamlPath);
  const hasDfxJson = existsSync(dfxPath);

  if (!hasIcpYaml && !hasDfxJson) return res.status(404).json({ error: 'No icp.yaml or dfx.json found' });

  try {
    if (hasIcpYaml) {
      // icp.yaml: manage environments section
      let yamlContent = readFileSync(icpYamlPath, 'utf-8');

      if (action === 'add') {
        // Check if environment already exists
        if (new RegExp(`^\\s+-\\s+name:\\s*${name}\\s*$`, 'm').test(yamlContent)) {
          return res.status(409).json({ error: `Environment "${name}" already exists` });
        }
        // Append environment to the environments section, or create it
        const envBlock = `  - name: ${name}\n    network: ic\n`;
        if (/^environments:/m.test(yamlContent)) {
          yamlContent = yamlContent.replace(/^(environments:)/m, `$1\n${envBlock}`);
        } else {
          yamlContent += `\nenvironments:\n${envBlock}`;
        }
      } else if (action === 'remove') {
        if (name === 'ic') return res.status(400).json({ error: 'Cannot remove the ic (production) environment' });
        // Remove the environment entry (name line + following indented lines until next - name: or section)
        const envRegex = new RegExp(`^\\s+-\\s+name:\\s*${name}\\s*\\n(?:\\s{4,}\\S[^\\n]*\\n)*`, 'gm');
        const newContent = yamlContent.replace(envRegex, '');
        if (newContent === yamlContent) return res.status(404).json({ error: `Environment "${name}" not found` });
        yamlContent = newContent;
      } else {
        return res.status(400).json({ error: 'action must be "add" or "remove"' });
      }

      writeFileSync(icpYamlPath, yamlContent);
      // Re-parse to return updated network list
      const networkSet = new Set(['local', 'ic']);
      const envMatches = yamlContent.matchAll(/^\s+-\s+name:\s*(.+)/gm);
      for (const m of envMatches) networkSet.add(m[1].trim().replace(/^["']|["']$/g, ''));
      res.json({ ok: true, networks: [...networkSet] });
    } else {
      // Legacy dfx.json: manage networks section
      const dfxJson = JSON.parse(readFileSync(dfxPath, 'utf-8'));
      if (!dfxJson.networks) dfxJson.networks = {};

      if (action === 'add') {
        if (dfxJson.networks[name]) return res.status(409).json({ error: `Network "${name}" already exists` });
        dfxJson.networks[name] = config || {
          providers: ['https://icp-api.io'],
          type: 'persistent',
        };
      } else if (action === 'remove') {
        if (!dfxJson.networks[name]) return res.status(404).json({ error: `Network "${name}" not found` });
        if (name === 'ic') return res.status(400).json({ error: 'Cannot remove the ic (production) network' });
        delete dfxJson.networks[name];
      } else {
        return res.status(400).json({ error: 'action must be "add" or "remove"' });
      }

      writeFileSync(dfxPath, JSON.stringify(dfxJson, null, 2) + '\n');
      const networkSet = new Set(Object.keys(dfxJson.networks));
      const canisterIds = readCanisterIds(projectPath);
      for (const entry of Object.values(canisterIds)) {
        if (entry && typeof entry === 'object') {
          for (const k of Object.keys(entry)) networkSet.add(k);
        }
      }
      networkSet.add('local');
      res.json({ ok: true, networks: [...networkSet] });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Parse full canister status output into structured data
function parseCanisterStatus(raw) {
  const parsed = {};

  const statusMatch = raw.match(/Status:\s*(\w+)/i);
  parsed.runningStatus = statusMatch ? statusMatch[1] : 'unknown';

  // dfx: "Balance: 72_702_614_651 Cycles" — icp CLI: "Cycles: 72_702_614_651"
  const cyclesMatch = raw.match(/(?:Balance:\s*([\d_,]+)\s*Cycles|Cycles:\s*([\d_,]+))/i);
  parsed.cycles = cyclesMatch ? (cyclesMatch[1] || cyclesMatch[2]).replace(/[_,]/g, '') : null;

  // dfx: "Memory Size: ..." — icp CLI: "Memory size: ..." (not "Memory allocation")
  const memoryMatch = raw.match(/Memory\s*[Ss]ize:\s*([\d_,]+)/i);
  parsed.memoryBytes = memoryMatch ? memoryMatch[1].replace(/[_,]/g, '') : null;

  const moduleMatch = raw.match(/Module hash:\s*(0x[a-f0-9]+|None)/i);
  parsed.moduleHash = moduleMatch ? moduleMatch[1] : null;

  const freezingMatch = raw.match(/Freezing threshold:\s*([\d_,]+)/i);
  parsed.freezingThreshold = freezingMatch ? freezingMatch[1].replace(/[_,]/g, '') : null;

  const controllersMatch = raw.match(/Controllers?:\s*(.+)/i);
  parsed.controllers = controllersMatch
    ? controllersMatch[1].split(/\s+/).filter(Boolean)
    : [];

  // icp CLI extras: idle burn rate, reserved cycles
  const idleBurnMatch = raw.match(/Idle cycles burned per day:\s*([\d_,]+)/i);
  parsed.idleBurnPerDay = idleBurnMatch ? idleBurnMatch[1].replace(/[_,]/g, '') : null;

  parsed.raw = raw;
  return parsed;
}

// Read canister_ids.json for a project (deployed IDs per network)
function readCanisterIds(projectPath) {
  const idsPath = join(projectPath, 'canister_ids.json');
  if (!existsSync(idsPath)) return {};
  try {
    return JSON.parse(readFileSync(idsPath, 'utf-8'));
  } catch {
    return {};
  }
}

// Get detailed canister status
app.post('/api/canister/status', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }

  let netArgs;
  try { netArgs = networkArgs(network); } catch (e) { return res.status(400).json({ error: e.message }); }
  const result = runCliSync(['canister', 'status', canister, ...netArgs], projectPath);
  const idResult = getCanisterId(canister, netArgs, projectPath);

  if (!result.ok) {
    return res.json({
      canister,
      canisterId: idResult.ok ? idResult.data : null,
      error: result.data,
    });
  }

  const parsed = parseCanisterStatus(result.data);
  res.json({
    canister,
    canisterId: idResult.ok ? idResult.data : null,
    ...parsed,
  });
});

// Batch fetch all canister statuses for a project
app.post('/api/canisters/status-all', async (req, res) => {
  const { path: projectPath, network, canisterNames } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });

  const netArgs = networkArgs(network);
  const canisterIds = readCanisterIds(projectPath);
  const results = {};

  const names = canisterNames || [];
  for (const name of names) {
    try { assertSafeName(name, 'canister'); } catch { continue; }

    const idResult = getCanisterId(name, netArgs, projectPath);
    const canisterId = idResult.ok ? idResult.data : null;
    const idsJsonId = canisterIds[name]?.[network] || canisterIds[name]?.[network === 'ic' ? 'ic' : 'local'] || null;

    const statusResult = runCliSync(['canister', 'status', name, ...netArgs], projectPath);

    if (statusResult.ok) {
      const parsed = parseCanisterStatus(statusResult.data);
      results[name] = {
        canister: name,
        canisterId: canisterId || idsJsonId || null,
        ...parsed,
      };
    } else {
      results[name] = {
        canister: name,
        canisterId: canisterId || idsJsonId || null,
        error: statusResult.data,
      };
    }
  }

  // Enrich with deploy history version info
  const history = readDeployHistory(projectPath);
  for (const name of Object.keys(results)) {
    const r = results[name];
    if (r.moduleHash && r.moduleHash !== 'None') {
      r.version = lookupVersion(history, name, network, r.moduleHash) || null;
    }
  }

  res.json(results);
});

// ---------- Canister lifecycle operations ----------

// Stop a canister
app.post('/api/canister/stop', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  const result = runCliSync(['canister', 'stop', canister, ...networkArgs(network)], projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Start a canister
app.post('/api/canister/start', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  const result = runCliSync(['canister', 'start', canister, ...networkArgs(network)], projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Delete a canister (requires confirmation from frontend)
app.post('/api/canister/delete', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  // Must stop before deleting
  runCliSync(['canister', 'stop', canister, ...networkArgs(network)], projectPath);
  const result = runCliSync(['canister', 'delete', canister, ...networkArgs(network)], projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Update canister settings (e.g., freezing threshold)
app.post('/api/canister/update-settings', (req, res) => {
  const { path: projectPath, canister, network, freezingThreshold, addController } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }

  const args = ['canister', 'update-settings', canister, ...networkArgs(network)];

  if (freezingThreshold != null) {
    const ft = String(parseInt(freezingThreshold, 10));
    if (isNaN(parseInt(ft, 10))) return res.status(400).json({ error: 'Invalid freezing threshold' });
    args.push('--freezing-threshold', ft);
  }
  if (addController) {
    // Principal IDs contain alphanumeric chars and dashes
    if (!/^[a-z0-9\-]+$/.test(addController)) {
      return res.status(400).json({ error: 'Invalid controller principal' });
    }
    args.push('--add-controller', addController);
  }

  const result = runCliSync(args, projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Top up a canister with cycles (source: 'cycles' = from cycles balance, 'icp' = mint first then top up)
app.post('/api/canister/top-up', (req, res) => {
  const { path: projectPath, canister, network, amount, source } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number of cycles' });
  }

  // If source is 'icp', mint the cycles first
  if (source === 'icp') {
    const mintCmd = CLI === 'icp'
      ? ['cycles', 'mint', '--cycles', String(amount), '-n', 'ic']
      : ['ledger', 'fabricate-cycles', '--amount', String(amount)];
    const mintResult = runCliSync(mintCmd);
    if (!mintResult.ok) {
      if (projectPath) {
        recordTopup(projectPath, { canister, network, amount, success: false, output: `Mint failed: ${mintResult.data}` });
      }
      return res.json({ ok: false, output: `Mint failed: ${mintResult.data}` });
    }
  }

  // Top up from cycles balance
  const args = ['canister', 'top-up', canister, '--amount', String(amount), ...networkArgs(network)];
  const result = runCliSync(args, projectPath);
  if (projectPath) {
    recordTopup(projectPath, { canister, network, amount, success: result.ok, output: result.data, source: source || 'cycles' });
  }
  res.json({ ok: result.ok, output: result.data });
});

// Get top-up history for a project
app.post('/api/topup-history', (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });
  res.json(readTopupHistory(projectPath));
});

// ---------- Canister snapshots ----------

// List snapshots for a canister
app.post('/api/canister/snapshots', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }

  const result = runCliSync(['canister', 'snapshot', 'list', canister, ...networkArgs(network)], projectPath);
  if (!result.ok) return res.status(500).json({ error: result.data });

  // Parse snapshot list output: "ID: SIZE, taken at TIMESTAMP"
  const snapshots = [];
  for (const line of result.data.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "0000000000000000800000000010000a0101: 2.39MiB, taken at 2024-09-16 19:40:23 UTC"
    const match = trimmed.match(/^([0-9a-f]+):\s*([\d.]+\s*\S+),\s*taken at\s*(.+)$/i);
    if (match) {
      snapshots.push({ id: match[1], size: match[2], takenAt: match[3].trim() });
    } else {
      // Fallback: treat the whole line as an ID if it looks hex-like
      const hexMatch = trimmed.match(/^([0-9a-f]{10,})/i);
      if (hexMatch) snapshots.push({ id: hexMatch[1], size: null, takenAt: null, raw: trimmed });
    }
  }
  res.json({ snapshots, raw: result.data });
});

// Create a snapshot (canister should be stopped first)
app.post('/api/canister/snapshot/create', (req, res) => {
  const { path: projectPath, canister, network, replace } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }

  const args = ['canister', 'snapshot', 'create', canister, ...networkArgs(network)];
  if (replace) {
    if (!/^[0-9a-f]+$/i.test(replace)) return res.status(400).json({ error: 'Invalid snapshot ID' });
    args.push('--replace', replace);
  }
  const result = runCliSync(args, projectPath);
  if (!result.ok) return res.json({ ok: false, error: result.data });

  // Try to extract snapshot ID from output
  const idMatch = result.data.match(/Snapshot ID:\s*([0-9a-f]+)/i);
  res.json({ ok: true, snapshotId: idMatch ? idMatch[1] : null, output: result.data });
});

// Load (restore) a snapshot
app.post('/api/canister/snapshot/load', (req, res) => {
  const { path: projectPath, canister, network, snapshotId } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!snapshotId || !/^[0-9a-f]+$/i.test(snapshotId)) return res.status(400).json({ error: 'Invalid snapshot ID' });

  const result = runCliSync(['canister', 'snapshot', 'load', canister, snapshotId, ...networkArgs(network)], projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Delete a snapshot
app.post('/api/canister/snapshot/delete', (req, res) => {
  const { path: projectPath, canister, network, snapshotId } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!snapshotId || !/^[0-9a-f]+$/i.test(snapshotId)) return res.status(400).json({ error: 'Invalid snapshot ID' });

  const result = runCliSync(['canister', 'snapshot', 'delete', canister, snapshotId, ...networkArgs(network)], projectPath);
  res.json({ ok: result.ok, output: result.data });
});

// Download a snapshot to local directory
app.post('/api/canister/snapshot/download', (req, res) => {
  const { path: projectPath, canister, network, snapshotId, dir } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!snapshotId || !/^[0-9a-f]+$/i.test(snapshotId)) return res.status(400).json({ error: 'Invalid snapshot ID' });
  if (!dir) return res.status(400).json({ error: 'Directory path required' });
  try { assertSafePath(dir, 'Snapshot directory'); } catch (e) { return res.status(403).json({ error: e.message }); }

  const args = ['canister', 'snapshot', 'download', canister, snapshotId, '--dir', dir, ...networkArgs(network)];
  // Downloading can take a long time for large canisters
  const result = spawnSync(CLI, args, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 300000, // 5 min
    env: { ...process.env, HOME: process.env.HOME },
  });

  if (result.status === 0) {
    res.json({ ok: true, output: (result.stdout || '').trim() });
  } else {
    res.json({ ok: false, error: (result.stderr || result.stdout || '').trim() });
  }
});

// Upload a snapshot from local directory
app.post('/api/canister/snapshot/upload', (req, res) => {
  const { path: projectPath, canister, network, dir, replace } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!dir) return res.status(400).json({ error: 'Directory path required' });
  try { assertSafePath(dir, 'Snapshot directory'); } catch (e) { return res.status(403).json({ error: e.message }); }

  const args = ['canister', 'snapshot', 'upload', canister, '--dir', dir, ...networkArgs(network)];
  if (replace && /^[0-9a-f]+$/i.test(replace)) {
    args.push('--replace', replace);
  }

  const result = spawnSync(CLI, args, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 300000,
    env: { ...process.env, HOME: process.env.HOME },
  });

  if (result.status === 0) {
    const idMatch = (result.stdout || '').match(/Snapshot ID:\s*([0-9a-f]+)/i);
    res.json({ ok: true, snapshotId: idMatch ? idMatch[1] : null, output: (result.stdout || '').trim() });
  } else {
    res.json({ ok: false, error: (result.stderr || result.stdout || '').trim() });
  }
});

// Get canister info (module hash, controllers — useful for data extraction view)
app.post('/api/canister/info', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  const result = runCliSync(['canister', 'info', canister, ...networkArgs(network)], projectPath);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ ok: true, info: result.data });
});

// Read canister metadata (e.g. candid:service)
app.post('/api/canister/metadata', (req, res) => {
  const { path: projectPath, canister, network, metadataName } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!metadataName) return res.status(400).json({ error: 'Metadata name required' });
  // Metadata names like "candid:service" contain a colon, validate loosely
  if (!/^[a-zA-Z0-9_:\-]+$/.test(metadataName)) return res.status(400).json({ error: 'Invalid metadata name' });

  const result = runCliSync(['canister', 'metadata', canister, metadataName, ...networkArgs(network)], projectPath);
  if (!result.ok) return res.json({ ok: false, error: result.data });
  res.json({ ok: true, data: result.data });
});

// ---------- Deployment readiness summary ----------

app.post('/api/deploy/summary', async (req, res) => {
  const { path: projectPath, network, canisterNames } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });

  const netArgs = networkArgs(network);
  const summary = { canisters: {} };

  // Per-canister: deployed module hash vs local WASM hash
  const names = canisterNames || [];
  const canisterIds = readCanisterIds(projectPath);

  for (const name of names) {
    try { assertSafeName(name, 'canister'); } catch { continue; }

    const entry = { deployed: false, canisterId: null, moduleHash: null, localWasm: null, status: null };

    // Get canister ID
    const idResult = getCanisterId(name, netArgs, projectPath);
    // Try CLI first, then check canister_ids.json for any matching network key
    const idsJsonId = canisterIds[name]?.[network] || canisterIds[name]?.[network === 'ic' ? 'ic' : 'local'] || null;
    entry.canisterId = idResult.ok ? idResult.data : (idsJsonId || null);

    if (entry.canisterId) {
      entry.deployed = true;

      // Get deployed status + module hash from canister status (works for both icp and dfx)
      const statusResult = runCliSync(['canister', 'status', name, ...netArgs], projectPath);
      if (statusResult.ok) {
        const statusMatch = statusResult.data.match(/Status:\s*(\w+)/i);
        entry.status = statusMatch ? statusMatch[1] : null;
        const hashMatch = statusResult.data.match(/Module hash:\s*(0x[a-f0-9]+|None)/i);
        entry.moduleHash = hashMatch ? hashMatch[1] : null;
      }

      // Fallback: try canister info (dfx only, icp CLI doesn't have this)
      if (!entry.moduleHash && CLI !== 'icp') {
        const infoResult = runCliSync(['canister', 'info', name, ...netArgs], projectPath);
        if (infoResult.ok) {
          const hashMatch = infoResult.data.match(/Module hash:\s*(0x[a-f0-9]+|None)/i);
          entry.moduleHash = hashMatch ? hashMatch[1] : null;
        }
      }
    }

    // Check if local WASM exists and compute hash for comparison
    // dfx builds to .dfx/<network>/canisters/<name>/<name>.wasm
    // icp builds to .icp/cache/<name>/<name>.wasm or target/wasm32-.../release/<name>.wasm
    const localNet = network === 'ic' ? 'ic' : 'local';
    const wasmCandidates = [
      join(projectPath, '.dfx', localNet, 'canisters', name, `${name}.wasm`),
      join(projectPath, '.dfx', localNet, 'canisters', name, `${name}.wasm.gz`),
      join(projectPath, '.dfx', 'local', 'canisters', name, `${name}.wasm`),
      join(projectPath, '.dfx', 'local', 'canisters', name, `${name}.wasm.gz`),
      join(projectPath, '.icp', 'cache', name, `${name}.wasm`),
      join(projectPath, '.icp', 'cache', name, `${name}.wasm.gz`),
    ];
    let localWasmPath = null;
    for (const wp of wasmCandidates) {
      if (existsSync(wp)) { localWasmPath = wp; break; }
    }
    if (localWasmPath) {
      entry.localWasmExists = true;
      try {
        let wasmBytes = readFileSync(localWasmPath);
        if (localWasmPath.endsWith('.gz')) {
          wasmBytes = gunzipSync(wasmBytes);
        }
        const hash = createHash('sha256').update(wasmBytes).digest('hex');
        entry.localWasmHash = '0x' + hash;
      } catch { entry.localWasmHash = null; }
    } else {
      entry.localWasmExists = false;
      entry.localWasmHash = null;
    }

    // Compare local vs deployed
    if (entry.moduleHash && entry.localWasmHash) {
      entry.hashMatch = entry.moduleHash === entry.localWasmHash;
    } else {
      entry.hashMatch = null; // can't determine
    }

    summary.canisters[name] = entry;
  }

  // Look up deploy history for version info
  const history = readDeployHistory(projectPath);
  for (const name of Object.keys(summary.canisters)) {
    const c = summary.canisters[name];
    if (c.moduleHash && c.moduleHash !== 'None') {
      const versionInfo = lookupVersion(history, name, network, c.moduleHash);
      c.version = versionInfo || null;
    } else {
      c.version = null;
    }
  }

  res.json(summary);
});

// Build canisters before deploy
app.post('/api/build', (req, res) => {
  const { path: projectPath, canisterNames } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });

  const args = ['build'];
  if (canisterNames && canisterNames.length > 0) {
    for (const name of canisterNames) {
      try { assertSafeName(name, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
    }
    args.push(...canisterNames);
  }

  // Build can take a while
  const result = spawnSync(CLI, args, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 300000, // 5 min
    env: { ...process.env, HOME: process.env.HOME },
  });

  if (result.status === 0) {
    res.json({ ok: true, output: (result.stdout || '').trim() + '\n' + (result.stderr || '').trim() });
  } else {
    res.json({ ok: false, error: (result.stderr || result.stdout || '').trim() });
  }
});

// Get ICP ledger balance for current identity
app.get('/api/ledger/balance', (req, res) => {
  const network = req.query.network;
  if (network) { try { assertSafeName(network, 'network'); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const netArgs = network && network !== 'local'
    ? (CLI === 'icp' ? ['-n', network] : ['--network', network])
    : (CLI === 'icp' ? ['-n', 'ic'] : []);
  const cmd = CLI === 'icp' ? ['token', 'balance', ...netArgs] : ['ledger', 'balance', ...netArgs];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  // Output format: "Balance: 12.34567890 ICP" or just a number
  const match = result.data.match(/([\d.]+)\s*ICP/i);
  const balance = match ? match[1] : result.data.trim();
  res.json({ balance, raw: result.data });
});

// Get cycles balance for current identity
app.get('/api/cycles/identity-balance', (req, res) => {
  const network = req.query.network;
  if (network) { try { assertSafeName(network, 'network'); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const netArgs = network && network !== 'local'
    ? (CLI === 'icp' ? ['-n', network] : ['--network', network])
    : (CLI === 'icp' ? ['-n', 'ic'] : []);
  const cmd = CLI === 'icp' ? ['cycles', 'balance', ...netArgs] : ['wallet', 'balance', ...netArgs];
  const result = runCliSync(cmd);
  if (!result.ok) return res.status(500).json({ error: result.data });
  // icp CLI: "Balance: 314_540_000_000 cycles"
  const match = result.data.match(/([\d_,]+)\s*cycles/i);
  const cycles = match ? match[1].replace(/[_,]/g, '') : result.data.trim();
  res.json({ cycles, raw: result.data });
});

// Mint cycles from ICP
app.post('/api/cycles/mint', (req, res) => {
  const { amount, unit } = req.body; // unit: 'icp' or 'cycles'
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!unit || !['icp', 'cycles'].includes(unit)) {
    return res.status(400).json({ error: 'unit must be "icp" or "cycles"' });
  }
  const flag = unit === 'icp' ? '--icp' : '--cycles';
  const cmd = CLI === 'icp'
    ? ['cycles', 'mint', flag, String(amount), '-n', 'ic']
    : ['ledger', 'fabricate-cycles', '--amount', String(amount)]; // dfx fallback
  const result = runCliSync(cmd);
  res.json({ ok: result.ok, output: result.data });
});

// Get wallet balance (dfx-specific; icp CLI may not support wallet subcommand)
app.post('/api/wallet/balance', (req, res) => {
  const { path: projectPath, network } = req.body;
  if (CLI === 'icp') {
    return res.status(501).json({ error: 'Wallet balance not supported with icp CLI. Use canister status for cycles info.' });
  }
  const result = runCliSync(['wallet', 'balance', ...networkArgs(network)], projectPath);
  if (!result.ok) return res.status(500).json({ error: result.data });
  res.json({ balance: result.data });
});

// Get cycles balance for specific canister (legacy endpoint kept for compat)
app.post('/api/cycles/balance', (req, res) => {
  const { path: projectPath, canister, network } = req.body;
  try { assertSafeName(canister, 'canister'); } catch (e) { return res.status(400).json({ error: e.message }); }
  const result = runCliSync(['canister', 'status', canister, ...networkArgs(network)], projectPath);
  if (!result.ok) return res.status(500).json({ error: result.data });

  const parsed = parseCanisterStatus(result.data);
  res.json({ canister, cycles: parsed.cycles || 'unknown', raw: result.data });
});

// Check if local replica is running
app.get('/api/replica/status', (_req, res) => {
  const cmd = CLI === 'icp' ? ['network', 'ping'] : ['ping'];
  const result = runCliSync(cmd);
  res.json({ running: result.ok, cli: CLI });
});

// Start local replica
app.post('/api/replica/start', (req, res) => {
  const { path: projectPath, clean } = req.body;
  const args = CLI === 'icp'
    ? ['network', 'start', '-d', ...(clean ? ['--clean'] : [])]
    : ['start', '--background', ...(clean ? ['--clean'] : [])];

  const child = spawn(CLI, args, {
    cwd: projectPath || process.cwd(),
    stdio: 'pipe',
  });

  let output = '';
  child.stdout.on('data', (d) => (output += d.toString()));
  child.stderr.on('data', (d) => (output += d.toString()));
  child.on('close', (code) => {
    if (code === 0) {
      res.json({ ok: true, output });
    } else {
      res.status(500).json({ error: output });
    }
  });
});

// Stop local replica
app.post('/api/replica/stop', (_req, res) => {
  const args = CLI === 'icp' ? ['network', 'stop'] : ['stop'];
  const result = runCliSync(args);
  res.json({ ok: result.ok, output: result.data });
});

// Browse directory (for folder picker)
app.post('/api/browse', (req, res) => {
  const { path: dirPath } = req.body;
  const home = process.env.HOME;
  const target = dirPath || home;

  // Restrict browsing to home directory and below
  const resolved = resolve(target);
  if (!resolved.startsWith(home)) {
    return res.status(403).json({ error: 'Cannot browse outside home directory' });
  }

  try {
    const entries = readdirSync(resolved, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: join(resolved, e.name),
        hasIcpYaml: existsSync(join(resolved, e.name, 'icp.yaml')),
        hasDfxJson: existsSync(join(resolved, e.name, 'dfx.json')),
        isIcpProject: existsSync(join(resolved, e.name, 'icp.yaml')) || existsSync(join(resolved, e.name, 'dfx.json')),
      }))
      .sort((a, b) => {
        // ICP projects first
        if (a.isIcpProject && !b.isIcpProject) return -1;
        if (!a.isIcpProject && b.isIcpProject) return 1;
        return a.name.localeCompare(b.name);
      });

    const parentPath = dirname(resolved);
    // Don't let parent go above home
    const safeParent = parentPath.startsWith(home) ? parentPath : home;
    res.json({ current: resolved, parent: safeParent, entries });
  } catch (e) {
    res.status(500).json({ error: 'Failed to browse directory' });
  }
});

// ---------- WebSocket: live deploy ----------

wss.on('connection', (ws, req) => {
  // Verify WebSocket origin
  const origin = req.headers.origin || '';
  if (origin && !origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
    ws.close(1008, 'Forbidden: invalid origin');
    return;
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', data: 'Invalid JSON' }));
      return;
    }

    if (msg.action === 'deploy') {
      const { path: projectPath, network, canisters, identity, mode } = msg;

      if (!projectPath) {
        ws.send(JSON.stringify({ type: 'error', data: 'Project path required' }));
        return;
      }
      try { assertSafePath(projectPath); } catch (e) {
        ws.send(JSON.stringify({ type: 'error', data: e.message }));
        return;
      }

      // Switch identity if specified
      if (identity) {
        try { assertSafeName(identity, 'identity'); } catch (e) {
          ws.send(JSON.stringify({ type: 'error', data: e.message }));
          return;
        }
        const useCmd = CLI === 'icp' ? ['identity', 'default', identity] : ['identity', 'use', identity];
        const idResult = runCliSync(useCmd);
        if (!idResult.ok) {
          ws.send(JSON.stringify({ type: 'error', data: `Failed to switch identity: ${idResult.data}` }));
          return;
        }
        ws.send(JSON.stringify({ type: 'log', data: `Switched to identity: ${identity}` }));
      }

      // Optional: build before deploy
      if (msg.build) {
        ws.send(JSON.stringify({ type: 'log', data: `> ${CLI} build ${(canisters || []).join(' ')}` }));
        ws.send(JSON.stringify({ type: 'status', data: 'building' }));

        const buildArgs = ['build'];
        if (canisters && canisters.length > 0) buildArgs.push(...canisters);

        const buildResult = spawnSync(CLI, buildArgs, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 300000,
          env: { ...process.env, HOME: process.env.HOME },
        });

        if (buildResult.stdout) ws.send(JSON.stringify({ type: 'log', data: buildResult.stdout }));
        if (buildResult.stderr) ws.send(JSON.stringify({ type: 'log', data: buildResult.stderr }));

        if (buildResult.status !== 0) {
          ws.send(JSON.stringify({ type: 'log', data: '\n--- Build failed ---' }));
          ws.send(JSON.stringify({ type: 'status', data: 'error' }));
          return;
        }
        ws.send(JSON.stringify({ type: 'log', data: '--- Build successful ---\n' }));
      }

      // Build deploy command
      const args = ['deploy'];
      if (canisters && canisters.length > 0) {
        for (const c of canisters) {
          try { assertSafeName(c, 'canister'); } catch (e) {
            ws.send(JSON.stringify({ type: 'error', data: e.message }));
            return;
          }
        }
        args.push(...canisters);
      }
      // Deploy mode (upgrade, reinstall, install)
      if (mode && ['upgrade', 'reinstall', 'install'].includes(mode)) {
        args.push('--mode', mode);
      }
      args.push(...networkArgs(network));

      ws.send(JSON.stringify({ type: 'log', data: `> ${CLI} ${args.join(' ')}` }));
      ws.send(JSON.stringify({ type: 'status', data: 'deploying' }));

      const child = spawn(CLI, args, {
        cwd: projectPath,
        env: { ...process.env, HOME: process.env.HOME },
      });

      child.stdout.on('data', (chunk) => {
        ws.send(
          JSON.stringify({ type: 'log', data: chunk.toString() })
        );
      });

      child.stderr.on('data', (chunk) => {
        ws.send(
          JSON.stringify({ type: 'log', data: chunk.toString() })
        );
      });

      child.on('close', (code) => {
        if (code === 0 && projectPath) {
          // Record deploy history for each deployed canister
          const deployedNames = (canisters && canisters.length > 0) ? canisters : [];
          for (const name of deployedNames) {
            // Fetch the module hash of the just-deployed canister
            const infoResult = runCliSync(['canister', 'info', name, ...networkArgs(network)], projectPath);
            let moduleHash = null;
            if (infoResult.ok) {
              const hashMatch = infoResult.data.match(/Module hash:\s*(0x[a-f0-9]+|None)/i);
              moduleHash = hashMatch ? hashMatch[1] : null;
            }
            const entry = recordDeploy(projectPath, { canister: name, network, moduleHash, deployMode: mode || 'auto' });
            ws.send(JSON.stringify({ type: 'log', data: `Recorded deploy: ${name} @ ${entry.gitCommit || 'unknown'} (${entry.gitBranch || 'unknown'})` }));
          }
        }
        ws.send(
          JSON.stringify({
            type: 'status',
            data: code === 0 ? 'success' : 'error',
          })
        );
        ws.send(
          JSON.stringify({
            type: 'log',
            data:
              code === 0
                ? '\n--- Deploy completed successfully ---'
                : `\n--- Deploy failed (exit code ${code}) ---`,
          })
        );
      });

      child.on('error', (err) => {
        ws.send(
          JSON.stringify({
            type: 'error',
            data: `Spawn error: ${err.message}`,
          })
        );
      });

      // Allow cancel
      ws.on('message', (innerRaw) => {
        try {
          const innerMsg = JSON.parse(innerRaw);
          if (innerMsg.action === 'cancel') {
            child.kill('SIGTERM');
            ws.send(
              JSON.stringify({ type: 'log', data: '\n--- Deploy cancelled ---' })
            );
            ws.send(
              JSON.stringify({ type: 'status', data: 'cancelled' })
            );
          }
        } catch {}
      });
    }

    if (msg.action === 'start-replica') {
      const { path: projectPath, clean } = msg;
      const args = CLI === 'icp'
        ? ['network', 'start', '-d', ...(clean ? ['--clean'] : [])]
        : ['start', '--background', ...(clean ? ['--clean'] : [])];

      ws.send(JSON.stringify({ type: 'log', data: `> ${CLI} ${args.join(' ')}` }));
      ws.send(JSON.stringify({ type: 'status', data: 'starting-replica' }));

      const child = spawn(CLI, args, {
        cwd: projectPath || process.cwd(),
        env: { ...process.env, HOME: process.env.HOME },
      });

      child.stdout.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'log', data: chunk.toString() }));
      });
      child.stderr.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'log', data: chunk.toString() }));
      });
      child.on('close', (code) => {
        ws.send(
          JSON.stringify({
            type: 'status',
            data: code === 0 ? 'replica-running' : 'replica-error',
          })
        );
      });
    }
  });
});

// ---------- Settings persistence ----------

const SETTINGS_FILE = join(process.env.HOME, '.canister-panel-settings.json');

function readSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

function writeSettings(settings) {
  try { writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch {}
}

app.get('/api/settings', (_req, res) => {
  res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
  const ALLOWED_KEYS = ['lastProject', 'lastNetwork', 'buildBeforeDeploy', 'recentProjects'];
  const current = readSettings();
  const filtered = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_KEYS.includes(k))
  );
  const updated = { ...current, ...filtered };
  writeSettings(updated);
  res.json(updated);
});

// Recent projects list
app.post('/api/settings/add-project', (req, res) => {
  const { path: projectPath, name } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path required' });

  const settings = readSettings();
  if (!settings.recentProjects) settings.recentProjects = [];

  // Remove if already exists, add to front
  settings.recentProjects = settings.recentProjects.filter(p => p.path !== projectPath);
  settings.recentProjects.unshift({ path: projectPath, name: name || projectPath.split('/').pop(), lastUsed: new Date().toISOString() });

  // Keep max 10
  settings.recentProjects = settings.recentProjects.slice(0, 10);

  writeSettings(settings);
  res.json(settings);
});

// Global error handler — catch unhandled route errors, never leak stack traces
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- start ----------

const PORT = process.env.PORT || 3456;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ICP Deploy`);
  console.log(`  --------------------`);
  console.log(`  Open http://localhost:${PORT}\n`);
});
