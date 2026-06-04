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

const server = http.createServer((req, res) => {
  const ip = getLocalIP();
  const apks = getApkList(options.apkDir);
  const screenshot = getLatestScreenshot(options.screenshotDir);

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

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error reading file');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
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
