import fs from 'fs';
import path from 'path';

// For local dev, we use a file in 'api/db'.
// In production (Vercel), this should be replaced by @vercel/kv
const DB_PATH = path.join(process.cwd(), 'api', 'db', 'mock_redis.json');

// Ensure DB directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const loadDB = () => {
    if (!fs.existsSync(DB_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
};

const saveDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

export const get = async (key) => {
    const db = loadDB();
    return db[key] || null;
};

export const set = async (key, value) => {
    const db = loadDB();
    db[key] = value;
    saveDB(db);
};
