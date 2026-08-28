const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ===== CONFIGURAÇÕES =====
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'SUA_SENHA_SECRETA';
const FIREBASE_URL = process.env.FIREBASE_URL || 'https://t8jp-1edab-default-rtdb.firebaseio.com/keys.json';

// ===== FUNÇÕES DE PERSISTÊNCIA (Firebase) =====
async function readKeys() {
    return new Promise((resolve, reject) => {
        https.get(FIREBASE_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data) || {});
                } catch (e) {
                    resolve({});
                }
            });
        }).on('error', reject);
    });
}

async function saveKeys(keys) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(keys);
        const url = new URL(FIREBASE_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        };
        const req = https.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve(true));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ===== ROTA DE TESTE =====
app.get('/', (req, res) => {
    res.send('Sistema de Key Dede Hub X - Backend ativo');
});

// ===== GERAÇÃO DE KEY =====
app.post('/generate', async (req, res) => {
    const { token, durationDays, note } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "Token inválido" });
    }

    const rawKey = crypto.randomBytes(12).toString('hex');
    const key = `DEDE-${rawKey.slice(0,4)}-${rawKey.slice(4,8)}-${rawKey.slice(8,12)}`.toUpperCase();

    try {
        const keys = await readKeys();
        keys[key] = {
            hwid: null,
            expires: Date.now() + (durationDays || 30) * 24 * 60 * 60 * 1000,
            active: true,
            note: note || "",
            createdAt: Date.now()
        };
        await saveKeys(keys);
        res.json({ key, expires: keys[key].expires });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao salvar key" });
    }
});

// ===== VERIFICAÇÃO DE KEY =====
app.post('/verify', async (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) {
        return res.json({ status: "INVALID" });
    }

    try {
        const keys = await readKeys();
        const data = keys[key];
        if (!data) return res.json({ status: "INVALID" });
        if (!data.active) return res.json({ status: "KEY_BANNED" });
        if (Date.now() > data.expires) return res.json({ status: "EXPIRED" });

        if (!data.hwid) {
            data.hwid = hwid;
            keys[key] = data;
            await saveKeys(keys);
        } else if (data.hwid !== hwid) {
            return res.json({ status: "HWID_MISMATCH" });
        }

        return res.json({ status: "VALID" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
});

// ===== LISTAR TODAS AS KEYS (ADMIN) =====
app.get('/admin/keys', async (req, res) => {
    const { token } = req.query;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "Token inválido" });
    }
    try {
        const keys = await readKeys();
        res.json(keys);
    } catch (err) {
        res.status(500).json({ error: "Erro ao listar" });
    }
});

// ===== REVOGAR KEY =====
app.post('/admin/revoke', async (req, res) => {
    const { token, key } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "Token inválido" });
    }
    try {
        const keys = await readKeys();
        if (!keys[key]) {
            return res.status(404).json({ error: "Key não encontrada" });
        }
        keys[key].active = false;
        await saveKeys(keys);
        res.json({ status: "REVOKED", key });
    } catch (err) {
        res.status(500).json({ error: "Erro ao revogar" });
    }
});

// ===== ESTENDER VALIDADE =====
app.post('/admin/extend', async (req, res) => {
    const { token, key, days } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "Token inválido" });
    }
    try {
        const keys = await readKeys();
        if (!keys[key]) {
            return res.status(404).json({ error: "Key não encontrada" });
        }
        keys[key].expires = Date.now() + (days || 30) * 24 * 60 * 60 * 1000;
        await saveKeys(keys);
        res.json({ status: "EXTENDED", key, expires: keys[key].expires });
    } catch (err) {
        res.status(500).json({ error: "Erro ao estender" });
    }
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
