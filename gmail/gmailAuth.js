// Gmail OAuth for Electron (main process)
// Uses "Desktop app" OAuth client + loopback redirect.
// Tokens are encrypted with Electron safeStorage and written to userData.

const { app, safeStorage, shell } = require('electron');
const { OAuth2Client } = require('google-auth-library');
const { gmail: gmailApi } = require('@googleapis/gmail');
const { oauth2: oauth2Api } = require('@googleapis/oauth2');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const crypto = require('crypto');
const url = require('url');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
];

function tokenPath() {
    return path.join(app.getPath('userData'), 'gmail_tokens.enc');
}

function credsPath() {
    return path.join(app.getPath('userData'), 'gmail_credentials.json');
}

async function saveCredentials(creds) {
    await fs.writeFile(credsPath(), JSON.stringify(creds, null, 2), 'utf8');
}

async function loadCredentials() {
    try {
        const raw = await fs.readFile(credsPath(), 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

async function saveTokens(tokens) {
    const json = JSON.stringify(tokens);
    let out;
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
        out = safeStorage.encryptString(json);
    } else {
        // Fallback: plain bytes. Warn user in UI that OS keychain isn't available.
        out = Buffer.from(json, 'utf8');
    }
    await fs.writeFile(tokenPath(), out);
}

async function loadTokens() {
    try {
        const buf = await fs.readFile(tokenPath());
        let json;
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            try {
                json = safeStorage.decryptString(buf);
            } catch {
                json = buf.toString('utf8');
            }
        } else {
            json = buf.toString('utf8');
        }
        return JSON.parse(json);
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

async function clearTokens() {
    try { await fs.unlink(tokenPath()); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

function buildOAuthClient(creds, redirectUri) {
    return new OAuth2Client({
        clientId: creds.client_id,
        clientSecret: creds.client_secret,
        redirectUri
    });
}

function startLoopbackServerV2() {
    return new Promise((outerResolve, outerReject) => {
        const state = crypto.randomBytes(16).toString('hex');
        let codeResolver, codeRejecter;
        const codePromise = new Promise((r, j) => { codeResolver = r; codeRejecter = j; });
        const server = http.createServer((req, res) => {
            try {
                const parsed = url.parse(req.url, true);
                if (parsed.pathname !== '/oauth2callback') {
                    res.writeHead(404); res.end('Not found'); return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body style="font-family:sans-serif;padding:2rem"><h2>Gmail connected.</h2><p>You can close this window and return to MJS PrimeLogic.</p></body></html>');
                setTimeout(() => { try { server.close(); } catch {} }, 100);
                if (parsed.query.error) codeRejecter(new Error(String(parsed.query.error)));
                else if (parsed.query.state !== state) codeRejecter(new Error('OAuth state mismatch'));
                else codeResolver(String(parsed.query.code));
            } catch (err) {
                try { res.writeHead(500); res.end('Error'); } catch {}
                codeRejecter(err);
            }
        });
        server.on('error', outerReject);
        server.listen(0, '127.0.0.1', () => {
            outerResolve({ port: server.address().port, state, codePromise, close: () => { try { server.close(); } catch {} } });
        });
    });
}

async function beginLogin() {
    const creds = await loadCredentials();
    if (!creds || !creds.client_id || !creds.client_secret) {
        throw new Error('Gmail OAuth credentials not set. Paste your Google "Desktop app" client_id and client_secret in Admin > Gmail.');
    }
    const server = await startLoopbackServerV2();
    const redirectUri = `http://127.0.0.1:${server.port}/oauth2callback`;
    const oauth2 = buildOAuthClient(creds, redirectUri);
    const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state: server.state
    });
    await shell.openExternal(authUrl);
    const code = await server.codePromise;
    const { tokens } = await oauth2.getToken(code);
    await saveTokens(tokens);
    // Fetch email for display. Don't swallow silently — if this call fails
    // the UI would show "Connected as " with a blank email, which looks
    // broken even though the token save succeeded.
    oauth2.setCredentials(tokens);
    let email = null;
    try {
        const api = oauth2Api({ version: 'v2', auth: oauth2 });
        const me = await api.userinfo.get();
        email = me && me.data && me.data.email ? me.data.email : null;
    } catch (e) {
        console.warn('[gmailAuth] userinfo.get failed after login:', e.message);
    }
    // Fallback: try id_token payload (contains email when openid+email scopes granted).
    if (!email && tokens && tokens.id_token) {
        try {
            const payloadB64 = tokens.id_token.split('.')[1];
            if (payloadB64) {
                const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
                if (payload && payload.email) email = payload.email;
            }
        } catch (e) {
            console.warn('[gmailAuth] id_token decode failed:', e.message);
        }
    }
    return { success: true, email };
}

async function getAuthedClient() {
    const creds = await loadCredentials();
    if (!creds) throw new Error('Gmail credentials not configured.');
    const tokens = await loadTokens();
    if (!tokens) throw new Error('Not logged in to Gmail.');
    const oauth2 = buildOAuthClient(creds, 'http://127.0.0.1/oauth2callback');
    oauth2.setCredentials(tokens);
    // Persist refreshed tokens automatically
    oauth2.on('tokens', async (t) => {
        try {
            const merged = { ...tokens, ...t };
            await saveTokens(merged);
        } catch (e) {
            console.error('[gmailAuth] failed to persist refreshed tokens:', e.message);
        }
    });
    return oauth2;
}

async function getGmail() {
    const auth = await getAuthedClient();
    return gmailApi({ version: 'v1', auth });
}

async function status() {
    const creds = await loadCredentials();
    const tokens = await loadTokens();
    return {
        hasCredentials: !!(creds && creds.client_id && creds.client_secret),
        isLoggedIn: !!tokens,
        safeStorage: !!(safeStorage && safeStorage.isEncryptionAvailable())
    };
}

async function logout() {
    await clearTokens();
    return { success: true };
}

module.exports = {
    SCOPES,
    saveCredentials,
    loadCredentials,
    saveTokens,
    loadTokens,
    clearTokens,
    beginLogin,
    getAuthedClient,
    getGmail,
    status,
    logout
};
