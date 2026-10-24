const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

let PORT = 3000;
const ROOT_DIR = __dirname;

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Clean painting titles from filenames
function cleanTitle(filename) {
    let t = filename.replace(/\.(jpe?g|png|webp)$/i, '');
    // Remove leading index / dates like "03_", "25.04 ", "26.02 "
    t = t.replace(/^\d+[\._]\d*[\._]?\s*/g, '');
    t = t.replace(/[\s_]+PS$/i, '');
    t = t.replace(/_0?21jpg/i, '');
    // Separate trailing numbers if attached to words
    t = t.replace(/([^\d\s])(\d+)$/u, '$1 $2');
    // Replace hyphens and underscores with spaces
    t = t.replace(/[_\-]+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    if (/^img[\s_]/i.test(t) || t === 'IMG') t = 'Городской мотив';
    if (/^ams\b/i.test(t)) t = t.replace(/^ams\b/i, 'Amsterdam');
    if (t.toLowerCase() === 'drusk') t = 'Druskininkai';
    return t.trim();
}

// Generate museum subtitle for exhibition plaques
function getPaintingSubtitle(title, filename) {
    const fn = (filename + ' ' + title).toLowerCase();
    if (fn.includes('grodno') || fn.includes('гродно')) return 'Беларусь • Архитектурный пейзаж';
    if (fn.includes('stockholm')) return 'Швеция • Городской мотив';
    if (fn.includes('vilnius') || fn.includes('вильнюс')) return 'Литва • Старый город';
    if (fn.includes('ams')) return 'Нидерланды • Каналы Амстердама';
    if (fn.includes('basel')) return 'Швейцария • Архитектурный этюд';
    if (fn.includes('bayern')) return 'Германия • Баварский мотив';
    if (fn.includes('brussels')) return 'Бельгия • Европейская графика';
    if (fn.includes('budapest')) return 'Венгрия • Панорама Дуная';
    if (fn.includes('cologne')) return 'Германия • Кёльнский собор';
    if (fn.includes('dettelbach') || fn.includes('dettelbah')) return 'Германия • Франконский мотив';
    if (fn.includes('drusk')) return 'Литва • Друскининкай';
    if (fn.includes('faroe')) return 'Фарерские острова • Морской пейзаж';
    if (fn.includes('halfstadt')) return 'Австрия • Альпийский Гальштат';
    if (fn.includes('luzern')) return 'Швейцария • Озеро Люцерн';
    if (fn.includes('monschau')) return 'Германия • Фахверковый Моншау';
    if (fn.includes('munster')) return 'Германия • Вестфальский пейзаж';
    if (fn.includes('riga')) return 'Латвия • Старая Рига';
    if (fn.includes('swiss')) return 'Швейцарские Альпы • Пейзаж';
    if (fn.includes('tallin')) return 'Эстония • Старый Таллинн';
    if (fn.includes('trakai')) return 'Литва • Островной замок';
    if (fn.includes('uzes') || fn.includes('uzės')) return 'Франция • Прованс';
    if (fn.includes('castle')) return 'Архитектурный этюд • Замок';
    if (fn.includes('cabin') || fn.includes('lake')) return 'Пейзаж • Домик у горного озера';
    if (fn.includes('mountain')) return 'Горный пейзаж';
    if (fn.includes('гусар')) return 'Исторический образ';
    if (fn.includes('старый замок')) return 'Историческая архитектура • Замок';
    if (fn.includes('saphir')) return 'Архитектурная графика';
    return 'Живопись • Авторская графика';
}

// Russian month names for exhibition plaque dating
const MONTH_NAMES = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// Verified creation dates (handwritten artist signatures on paintings):
const PAINTING_DATES_OVERRIDE = {
    'Trakai2.jpg': 'Октябрь 2025 г.',
    'Riga.jpg': 'Ноябрь 2025 г.',
    'Uzės.jpg': 'Апрель 2022 г.',
    'Tallin_01.jpg': 'Июль 2025 г.',
    'Ams_04 PS.jpg': 'Май 2019 г.',
    'Basel_021jpg.jpg': 'Декабрь 2018 г.',
    'Bayern_02.jpg': 'Май 2020 г.',
    'Luzern PS.jpg': 'Декабрь 2018 г.',
    'Swiss_PS.jpg': 'Декабрь 2018 г.',
    'Stockholm_PS.jpg': 'Апрель 2019 г.',
    'Budapest.jpg': 'Март 2026 г.',
    'Budapest-2.jpg': 'Апрель 2026 г.'
};

function getPaintingDate(filename, fullPath) {
    if (PAINTING_DATES_OVERRIDE[filename]) {
        return PAINTING_DATES_OVERRIDE[filename];
    }

    // Check filename prefix e.g. "25.04 Stockholm" -> Апрель 2025 г.
    const matchFn = filename.match(/^(\d{2})\.(\d{2})\b/);
    if (matchFn) {
        const yr = '20' + matchFn[1];
        const mo = parseInt(matchFn[2], 10);
        if (mo >= 1 && mo <= 12) {
            return `${MONTH_NAMES[mo]} ${yr} г.`;
        }
    }

    // Read EXIF / Photoshop XMP metadata from image binary
    if (fullPath && fs.existsSync(fullPath)) {
        try {
            const buf = fs.readFileSync(fullPath);
            const str = buf.toString('latin1', 0, Math.min(buf.length, 131072));
            const m1 = str.match(/<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/);
            const m2 = str.match(/CreateDate="([^"]+)"/);
            const m3 = str.match(/DateTimeOriginal>([^<]+)</);
            const rawMeta = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]);
            if (rawMeta) {
                const yr = rawMeta.slice(0, 4);
                const mo = parseInt(rawMeta.slice(5, 7), 10);
                if (mo >= 1 && mo <= 12) {
                    return `${MONTH_NAMES[mo]} ${yr} г.`;
                }
            }

            // Fallback to filesystem mtime
            const stat = fs.statSync(fullPath);
            const mtimeIso = stat.mtime.toISOString();
            const yr = mtimeIso.slice(0, 4);
            const mo = parseInt(mtimeIso.slice(5, 7), 10);
            if (mo >= 1 && mo <= 12) {
                return `${MONTH_NAMES[mo]} ${yr} г.`;
            }
        } catch (e) {
            // Ignore error and fall through
        }
    }

    return '';
}

const CATALOG_PATH = path.join(ROOT_DIR, 'paintings.json');

// Load custom paintings catalog (paintings.json)
function loadPaintingsCatalog() {
    if (!fs.existsSync(CATALOG_PATH)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Предупреждение: Не удалось прочитать paintings.json (проверьте синтаксис JSON):', e.message);
        return null;
    }
}

// Get all paintings in directory (merged with paintings.json)
function getPaintingsList() {
    try {
        const files = fs.readdirSync(ROOT_DIR);
        const imageFiles = files.filter(f => {
            if (f.startsWith('.') || f.includes('.backup.')) return false;
            return /\.(jpe?g|png|webp)$/i.test(f);
        });

        // Natural sort
        imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const catalog = loadPaintingsCatalog() || {};
        let catalogUpdated = false;

        const thumbsDir = path.join(ROOT_DIR, 'thumbs');
        const hasThumbs = fs.existsSync(thumbsDir);

        const result = imageFiles.map(file => {
            const fullPath = path.join(ROOT_DIR, file);
            let entry = catalog[file];

            if (!entry) {
                // Not in catalog yet: generate smart defaults
                const defTitle = cleanTitle(file);
                entry = {
                    title: defTitle,
                    subtitle: getPaintingSubtitle(defTitle, file),
                    date: getPaintingDate(file, fullPath),
                    technique: 'Оригинальная работа • Авторская графика'
                };
                catalog[file] = entry;
                catalogUpdated = true;
            }

            const title = (entry.title && entry.title.trim()) || cleanTitle(file);
            const subtitle = (entry.subtitle && entry.subtitle.trim()) || getPaintingSubtitle(title, file);
            const date = (entry.date && entry.date.trim()) || getPaintingDate(file, fullPath);
            const technique = (entry.technique && entry.technique.trim()) || 'Оригинальная работа • Авторская графика';

            const encodedFile = encodeURIComponent(file);
            const thumbPath = path.join(thumbsDir, file);
            const hasThumbFile = hasThumbs && fs.existsSync(thumbPath);

            return {
                name: file,
                url: hasThumbFile ? `thumbs/${encodedFile}` : encodedFile,
                fullUrl: encodedFile,
                title: title,
                subtitle: subtitle,
                date: date,
                technique: technique
            };
        });

        // Auto-save any newly discovered paintings into paintings.json
        if (catalogUpdated && fs.existsSync(CATALOG_PATH)) {
            try {
                fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 4), 'utf8');
                console.log('Каталог paintings.json автоматически дополнен новыми картинами.');
            } catch (err) {
                console.error('Ошибка сохранения обновлений в paintings.json:', err);
            }
        }

        return result;
    } catch (err) {
        console.error('Error reading gallery folder:', err);
        return [];
    }
}

// Find local IPv4 network address
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push({ name, ip: iface.address });
            }
        }
    }
    return addresses;
}

// Server request handler
function handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // API: List of paintings
    if (pathname === '/api/paintings') {
        const paintings = getPaintingsList();
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate'
        });
        res.end(JSON.stringify(paintings));
        return;
    }

    // API: Network info for mobile connectivity
    if (pathname === '/api/network') {
        const ips = getLocalIpAddresses();
        const primaryIp = ips.length > 0 ? ips[0].ip : 'localhost';
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            port: PORT,
            primaryIp,
            ips,
            localUrl: `http://localhost:${PORT}`,
            lanUrl: `http://${primaryIp}:${PORT}`
        }));
        return;
    }

    // Default route -> gallery.html
    if (pathname === '/' || pathname === '') {
        pathname = '/gallery.html';
    }

    const filePath = path.join(ROOT_DIR, pathname);

    // Security check: ensure path is within ROOT_DIR
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(path.resolve(ROOT_DIR))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Access Denied');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`File not found: ${pathname}`);
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const isDynamic = (ext === '.html' || ext === '.json');
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': isDynamic ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400'
        });

        const stream = fs.createReadStream(safePath);
        stream.pipe(res);
    });
}

// Start server with automatic port retry
function startServer(portToTry) {
    const server = http.createServer(handleRequest);

    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[!] Порт ${portToTry} занят, пробуем ${portToTry + 1}...`);
            startServer(portToTry + 1);
        } else {
            console.error('Ошибка сервера:', err);
        }
    });

    server.listen(portToTry, '0.0.0.0', () => {
        PORT = portToTry;
        const ips = getLocalIpAddresses();
        const primaryIp = ips.length > 0 ? ips[0].ip : 'localhost';
        const lanUrl = `http://${primaryIp}:${PORT}`;
        const localUrl = `http://localhost:${PORT}`;

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║               🏛️   3D АРТ-ГАЛЕРЕЯ ЗАПУЩЕНА                     ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log(`║ 💻 На этом компьютере:                                         ║`);
        console.log(`║    👉 ${localUrl.padEnd(57)}║`);
        console.log('║                                                                ║');
        console.log(`║ 📱 На телефоне или планшете (в той же сети Wi-Fi):             ║`);
        console.log(`║    👉 ${lanUrl.padEnd(57)}║`);
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log('║ Для остановки сервера нажмите Ctrl + C                         ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');

        // Automatically open the default browser on Windows
        exec(`start ${localUrl}`, (err) => {
            if (err) {
                // Ignore if browser launch is not critical
            }
        });
    });
}

// Auto-check and generate missing thumbnails in background
function checkAndGenerateMissingThumbs() {
    try {
        const thumbsDir = path.join(ROOT_DIR, 'thumbs');
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir);
        }
        const files = fs.readdirSync(ROOT_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.') && !f.includes('.backup.'));
        const missingThumbs = files.some(f => !fs.existsSync(path.join(thumbsDir, f)));
        if (missingThumbs) {
            console.log('⚡ Обнаружены новые картины без превью. Запуск автоматической оптимизации...');
            const psScript = path.join(ROOT_DIR, 'generate-thumbs.ps1');
            if (fs.existsSync(psScript)) {
                exec(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, (err) => {
                    if (!err) console.log('✅ Превью успешно обновлены.');
                });
            }
        }
    } catch (e) {
        // Silently continue
    }
}

if (require.main === module) {
    checkAndGenerateMissingThumbs();
    startServer(PORT);
}

module.exports = {
    getPaintingsList,
    cleanTitle,
    getPaintingSubtitle,
    getPaintingDate,
    loadPaintingsCatalog
};
