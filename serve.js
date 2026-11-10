#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: 8765,
    apkDir: path.resolve(process.cwd(), 'dist'),
    screenshotDir: path.resolve(process.cwd(), 'screenshots'),
    host: '0.0.0.0',
    name: 'App Downloads',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => args[++i];

    if (arg === '-p' || arg === '--port') {
      options.port = parseInt(next(), 10);
    } else if (arg === '-a' || arg === '--apk-dir') {
      options.apkDir = path.resolve(process.cwd(), next());
    } else if (arg === '-s' || arg === '--screenshot-dir') {
      options.screenshotDir = path.resolve(process.cwd(), next());
    } else if (arg === '--host') {
      options.host = next();
    } else if (arg === '-n' || arg === '--name') {
      options.name = next();
    } else if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
    }
  }
  return options;
}

function showHelp() {
  console.log(`
Usage: apk-serve [options]

Serve APK files and screenshots over HTTP for mobile testing.

Options:
  -p, --port <port>               Port to serve on (default: 8765)
  -a, --apk-dir <path>            Directory containing APK files (default: ./dist)
  -s, --screenshot-dir <path>     Directory containing screenshots (default: ./screenshots)
  --host <host>                   Host to bind to (default: 0.0.0.0)
  -n, --name <name>               App name for the page title (default: "App Downloads")
  -h, --help                      Show this help message

Examples:
  apk-serve
  apk-serve --port 8766 -a ./app/build/outputs/apk/debug -n MyApp
  apk-serve -p 8767 -a /path/to/apks -s /path/to/screenshots --host 127.0.0.1
`);
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const mimeTypes = {
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.apk': 'application/vnd.android.package-archive',
  '.m4a': 'audio/mp4',
};

function getApkInfo(apkDir, apkName) {
  const apkPath = path.join(apkDir, apkName);
  if (!fs.existsSync(apkPath)) return null;
  const stats = fs.statSync(apkPath);
  const mtime = new Date(stats.mtime);
  const date = mtime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = mtime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return { date, time, size: Math.round(stats.size / 1024 / 1024) + ' MB' };
}

function getApkList(apkDir) {
  if (!fs.existsSync(apkDir)) return [];
  return fs.readdirSync(apkDir).filter(f => f.endsWith('.apk'));
}

function getLatestScreenshot(screenshotDir) {
  if (!fs.existsSync(screenshotDir)) return null;
  const latest = path.join(screenshotDir, 'latest.png');
  return fs.existsSync(latest) ? latest : null;
}

const options = parseArgs();
const logFile = path.join(__dirname, 'device.log');

const server = http.createServer((req, res) => {
  const ip = getLocalIP();
  const apks = getApkList(options.apkDir);
  const screenshot = getLatestScreenshot(options.screenshotDir);

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const line = `[${new Date().toISOString()}] ${body}\n`;
      fs.appendFileSync(logFile, line);
      process.stdout.write(line);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    let apkCards = '';
    for (const apk of apks) {
      const info = getApkInfo(options.apkDir, apk);
      apkCards += `
  <div class="card">
    <h2>${apk}</h2>
    <p><strong>Uploaded:</strong> ${info ? info.date + ' ' + info.time : 'N/A'}</p>
    <p><strong>Size:</strong> ${info ? info.size : 'N/A'}</p>
    <a class="btn" href="/${apk}">Download</a>
  </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${options.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #0A0A0A; color: #fff; }
    h1 { color: #00D4AA; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .card h2 { margin-top: 0; color: #00D4AA; font-size: 18px; }
    a { color: #00D4AA; }
    img { max-width: 100%; border-radius: 8px; margin-top: 10px; }
    .btn { display: inline-block; background: #00D4AA; color: #0A0A0A; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px; }
    code { background: #333; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${options.name}</h1>
  <p>Download APKs below to test.</p>

  ${apkCards}

  ${screenshot ? `
  <div class="card">
    <h2>Latest Screenshot</h2>
    <a href="/latest.png">View Screenshot</a>
    <br>
    <img src="/latest.png" alt="Latest screenshot">
  </div>
  ` : ''}
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  let serveDir;
  if (req.url.endsWith('.apk')) {
    serveDir = options.apkDir;
  } else {
    serveDir = options.screenshotDir;
  }

  const filePath = path.join(serveDir, path.parse(req.url).base);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Stream with an explicit Content-Length: without it, phone browsers can't tell when a
  // download is complete and may hang at the end (especially through a tunnel).
  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(500);
      res.end('Error reading file');
      return;
    }
    const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' };
    if (ext === '.apk') {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
      headers['Cache-Control'] = 'no-store';
    }
    // Phone download managers resume and probe with Range requests; answer them properly (206).
    let start = 0;
    let end = stats.size - 1;
    let status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      if (range[1]) { start = parseInt(range[1], 10); if (range[2]) end = Math.min(end, parseInt(range[2], 10)); }
      else { start = Math.max(0, stats.size - parseInt(range[2], 10)); }
      if (start > end || start >= stats.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    let sent = 0;
    fs.createReadStream(filePath, { start, end })
      .on('data', chunk => { sent += chunk.length; })
      .on('error', () => res.destroy())
      .pipe(res);
    res.on('close', () => {
      if (ext === '.apk') console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${status} range=${req.headers.range || '-'} sent=${sent}/${end - start + 1} finished=${res.writableFinished} ua="${(req.headers['user-agent'] || '').slice(0, 80)}"`);
    });
  });
});

server.listen(options.port, options.host, () => {
  const ip = getLocalIP();
  const apks = getApkList(options.apkDir);
  console.log(`\n  ${options.name}`);
  console.log(`  ${'─'.repeat(options.name.length)}`);
  console.log(`  View on phone: http://${ip}:${options.port}/`);
  for (const apk of apks) {
    console.log(`  Download APK:  http://${ip}:${options.port}/${apk}`);
  }
  if (getLatestScreenshot(options.screenshotDir)) {
    console.log(`  Screenshot:    http://${ip}:${options.port}/latest.png`);
  }
  console.log();
});
