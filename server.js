const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const KEYS_FILE = './keys.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'SUA_SENHA_SECRETA';

let keys = {};
if (fs.existsSync(KEYS_FILE)) {
    keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
}

function saveKeys() {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

app.post('/generate', (req, res) => {
    const { token, durationDays, note } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "Token inválido" });
    }

    const rawKey = crypto.randomBytes(12).toString('hex');
    const key = `DEDE-${rawKey.slice(0,4)}-${rawKey.slice(4,8)}-${rawKey.slice(8,12)}`.toUpperCase();

    keys[key] = {
        hwid: null,
        expires: Date.now() + (durationDays || 30) * 24 * 60 * 60 * 1000,
        active: true,
        note: note || "",
        createdAt: Date.now()
    };

    saveKeys();
    res.json({ key, expires: keys[key].expires });
});

app.post('/verify', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) {
        return res.json({ status: "INVALID" });
    }

    const data = keys[key];
    if (!data) return res.json({ status: "INVALID" });
    if (!data.active) return res.json({ status: "KEY_BANNED" });
    if (Date.now() > data.expires) return res.json({ status: "EXPIRED" });

    if (!data.hwid) {
        data.hwid = hwid;
        saveKeys();
    } else if (data.hwid !== hwid) {
        return res.json({ status: "HWID_MISMATCH" });
    }

    return res.json({ status: "VALID" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
