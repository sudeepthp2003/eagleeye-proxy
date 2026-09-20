require('dotenv').config();
const express = require("express");

const net = require("net");
const httpProxy = require("http-proxy");
const cors = require("cors");
const forge = require("node-forge");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const initialConfig = require("./config");
const { URL } = require("url");
const aiRoutes = require("./routes/ai");


let appConfig = initialConfig;
const logs = [];
const interceptQueue = [];
const interceptResponseQueue = [];
const cookieJar = {}; // Persistent session state for repeater: { [hostname]: "cookie1=v1; cookie2=v2" }
let proxyRunning = true;

/**
 * ULTRA-ROBUST PARSER
 */
function parseRawRequest(raw) {
    const normalized = raw.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length === 0) throw new Error("Empty Request");

    // 1. Get Method and Path
    const requestLine = lines[0].split(/\s+/);
    const method = requestLine[0] || "GET";
    let path = requestLine[1] || "/";

    // 2. Extract Host Header manually (Regex is safer for mixed line endings)
    const hostMatch = raw.match(/Host:\s*([^\s\n\r]+)/i);
    const host = hostMatch ? hostMatch[1].trim() : null;

    // 3. Reconstruct headers
    const headers = {};
    lines.slice(1).forEach(line => {
        const idx = line.indexOf(":");
        if (idx !== -1) {
            const k = line.substring(0, idx).trim().toLowerCase();
            const v = line.substring(idx + 1).trim();
            headers[k] = v;
        }
    });

    // 4. Force Absolute URL
    let finalUrl = path;
    if (!path.startsWith("http")) {
        if (!host) {
            throw new Error("Host header missing in RAW editor. Please add 'Host: domain.com'");
        }
        // Build the URL
        finalUrl = `http://${host}${path}`;
    }

    // 5. Extract Body (everything after the first double newline)
    const bodyIndex = normalized.indexOf("\n\n");
    const bodyStr = bodyIndex !== -1 ? normalized.substring(bodyIndex + 2) : "";

    return { method, url: finalUrl, headers, bodyStr };
}

const apiApp = express();
apiApp.use(cors());
apiApp.use(express.json());

apiApp.get("/api/logs", (req, res) => res.json(logs));
apiApp.get("/api/intercept-status", (req, res) => res.json({ interceptOn: appConfig.intercept }));
apiApp.post("/api/toggle-intercept", (req, res) => {
    appConfig.intercept = !appConfig.intercept;
    res.json({ interceptOn: appConfig.intercept });
});

// Added to satisfy frontend setup wizard
apiApp.get("/start", (req, res) => {
    res.json({ status: "started" });
});

apiApp.get("/api/intercept/queue", (req, res) => {
    const queueData = interceptQueue.map(item => ({
        id: item.id,
        method: item.req.method,
        url: item.req.url,
        headers: item.req.headers,
        body: item.bodyStr
    }));
    res.json(queueData);
});

apiApp.get("/api/intercept-response/queue", (req, res) => {
    const queueData = interceptResponseQueue.map(item => ({
        id: item.id,
        url: item.req.url,
        statusCode: item.proxyRes.statusCode,
        headers: item.proxyRes.headers,
        body: item.bodyBuffer.toString()
    }));
    res.json(queueData);
});

apiApp.post("/api/intercept/forward", (req, resResponse) => {
    const { id, modifiedRaw } = req.body;
    const index = interceptQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        const item = interceptQueue.splice(index, 1)[0];
        const host = item.req.headers.host || "localhost";
        
        // If modifiedRaw is provided, we could parse and re-apply, but for now 
        // we'll at least allow forwarding the original request.
        proxy.web(item.req, item.res, { target: `http://${host}` });
        resResponse.json({ status: "success" });
    } else {
        resResponse.status(404).json({ error: "Request not found in queue" });
    }
});

apiApp.post("/api/intercept/drop", (req, resResponse) => {
    const { id } = req.body;
    const index = interceptQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        const item = interceptQueue.splice(index, 1)[0];
        item.res.end(); // Terminate the connection
        resResponse.json({ status: "success" });
    } else {
        resResponse.status(404).json({ error: "Request not found" });
    }
});

apiApp.post("/api/intercept-response/forward", (req, resResponse) => {
    const { id } = req.body;
    const index = interceptResponseQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        const item = interceptResponseQueue.splice(index, 1)[0];
        if (!item.res.headersSent) {
            item.res.writeHead(item.proxyRes.statusCode, item.proxyRes.headers);
            item.res.end(item.bodyBuffer);
        }
        resResponse.json({ status: "success" });
    } else {
        resResponse.status(404).json({ error: "Response not found" });
    }
});

apiApp.post("/api/intruder/start", async (req, res) => {
    const { raw, payloads, attackType, followRedirect } = req.body;
    console.log(`>>> INTRUDER ATTACK STARTED (${attackType}) <<<`);
    
    try {
        const payloadList = Array.isArray(payloads) ? payloads : payloads.split("\n").filter(p => p.trim());
        const results = [];
        const parts = raw.split("§");

        // Helper for single request (Reuse Repeater logic internal)
        const sendSingle = async (finalRaw) => {
            const parsed = parseRawRequest(finalRaw);
            const currentHeaders = { ...parsed.headers };
            const sanitizeHeaders = (h) => {
                const clean = { ...h };
                delete clean["host"];
                delete clean["content-length"];
                delete clean["connection"];
                delete clean["accept-encoding"];
                return clean;
            };

            const startTime = Date.now();
            const response = await fetch(parsed.url, {
                method: parsed.method,
                headers: sanitizeHeaders(currentHeaders),
                body: (parsed.method !== "GET" && parsed.method !== "HEAD") ? parsed.bodyStr : undefined,
                redirect: followRedirect ? "follow" : "manual"
            });
            const text = await response.text();
            const endTime = Date.now();
            
            const resHeaders = {};
            response.headers.forEach((v, k) => resHeaders[k] = v);

            return {
                status: response.status,
                statusText: response.statusText,
                headers: resHeaders,
                response: text,
                time: endTime - startTime,
                length: text.length,
                rawRequest: finalRaw
            };
        };

        // Sniper Attack Logic
        for (let payload of payloadList) {
            let finalRequest = "";
            for (let i = 0; i < parts.length; i++) {
                finalRequest += parts[i];
                if (i % 2 === 0 && i < parts.length - 1) {
                    finalRequest += payload;
                }
            }

            const result = await sendSingle(finalRequest);
            results.push({
                id: Date.now() + Math.random(),
                payload,
                ...result
            });
        }

        res.json({ results });

    } catch (err) {
        console.error("!!! INTRUDER ERROR !!!", err.message);
        res.status(500).json({ error: err.message });
    }
});

apiApp.post("/api/repeater/send", async (req, res) => {
    const { raw, followRedirect } = req.body;
    console.log(">>> REPEATER SEND REQUEST RECEIVED <<<");
    
    try {
        let parsed = parseRawRequest(raw);
        let currentUrl = parsed.url;
        let currentMethod = parsed.method;
        let currentBody = (parsed.method !== "GET" && parsed.method !== "HEAD") ? parsed.bodyStr : undefined;
        let currentHeaders = { ...parsed.headers };
        
        // Sanitize headers for fetch
        const sanitizeHeaders = (h) => {
            const clean = { ...h };
            delete clean["host"];
            delete clean["content-length"];
            delete clean["connection"];
            delete clean["accept-encoding"];
            return clean;
        };

        let redirectCount = 0;
        const maxRedirects = 5;
        let finalStatus = 0;
        let finalStatusText = "";
        let finalHeaders = {};
        let finalResponseText = "";
        let startTime = Date.now();
        let totalCookies = currentHeaders["cookie"] || "";
        const hostName = new URL(currentUrl).hostname;

        // Auto-inject any persistent cookies for this host
        if (cookieJar[hostName]) {
            const jarCookies = cookieJar[hostName].split('; ');
            const rawCookies = totalCookies.split('; ');
            
            // Merge: rawCookies take precedence if same key? 
            // Actually, usually in testing, the Jar (most recent Set-Cookie) should win
            const merged = {};
            [...rawCookies, ...jarCookies].forEach(c => {
                const [k, v] = c.split('=');
                if (k && v) merged[k] = v;
            });
            totalCookies = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
        }

        while (true) {
            console.log(`[REPEATER] ${currentMethod} -> ${currentUrl}`);
            
            const fetchHeaders = sanitizeHeaders(currentHeaders);
            if (totalCookies) fetchHeaders["cookie"] = totalCookies;

            const response = await fetch(currentUrl, {
                method: currentMethod,
                headers: fetchHeaders,
                body: currentBody,
                redirect: "manual"
            });

            const statusCode = response.status;
            const resHeaders = {};
            response.headers.forEach((v, k) => resHeaders[k] = v);

            // Robust multi-header cookie handling
            const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : (resHeaders["set-cookie"] ? [resHeaders["set-cookie"]] : []);
            setCookies.forEach(cookieStr => {
                const cleanCookie = cookieStr.split(';')[0];
                totalCookies = totalCookies ? `${totalCookies}; ${cleanCookie}` : cleanCookie;
                
                // --- UPDATE PERSISTENT JAR ---
                const [k, v] = cleanCookie.split('=');
                if (k && v) {
                    const jar = cookieJar[hostName] || "";
                    const jarMap = {};
                    jar.split('; ').forEach(c => {
                        const [jk, jv] = c.split('=');
                        if (jk && jv) jarMap[jk] = jv;
                    });
                    jarMap[k] = v;
                    cookieJar[hostName] = Object.entries(jarMap).map(([nk, nv]) => `${nk}=${nv}`).join('; ');
                }
            });


            if (followRedirect && [301, 302, 303, 307, 308].includes(statusCode) && resHeaders.location && redirectCount < maxRedirects) {
                redirectCount++;
                const location = resHeaders.location;
                currentUrl = new URL(location, currentUrl).toString();
                
                // Burp Suite behavior: 302/303 redirects usually switch to GET
                if (statusCode === 302 || statusCode === 303) {
                    currentMethod = "GET";
                    currentBody = undefined;
                }
                // 307/308 keep the same method
                
                console.log(`[REDIRECT ${redirectCount}] To: ${currentUrl}`);
                continue;
            }

            // Final destination or limit reached
            finalStatus = statusCode;
            finalStatusText = response.statusText;
            finalHeaders = resHeaders;
            finalResponseText = await response.text();
            break;
        }

        const endTime = Date.now();
        res.json({
            status: finalStatus,
            statusText: finalStatusText,
            headers: finalHeaders,
            response: finalResponseText,
            time: endTime - startTime
        });

    } catch (err) {
        console.error("!!! REPEATER ERROR !!!", err.message);
        res.status(500).json({ error: err.message });
    }
});

apiApp.get("/download-ca", (req, res) => {
    const certPath = path.join(__dirname, "ca-cert.pem");

    if (!fs.existsSync(certPath)) {
        return res.status(404).json({ error: "CA certificate not found" });
    }

    res.download(certPath, "EagleEye-CA.pem");
});

apiApp.use((req, res, next) => {
    req.logs = logs;
    next();
});
apiApp.use("/api/ai", aiRoutes);

// Serve static React production build if available
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
    apiApp.use(express.static(clientBuildPath));
    apiApp.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

// Catch-all for unknown API routes
apiApp.use('/api', (req, res) => {
    res.status(404).json({ 
        error: "Route Not Found", 
        path: req.originalUrl,
        message: "API route is not registered." 
    });
});

// Global Error Handler
apiApp.use((err, req, res, next) => {
    console.error("API SERVER ERROR:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
});

const API_PORT = process.env.PORT || 8081;
apiApp.listen(API_PORT, "0.0.0.0", () => { console.log(`API & Web Server active on http://0.0.0.0:${API_PORT}`); });


const { PassThrough } = require('stream');
const tls = require('tls');

// --- CERTIFICATE MANAGER ---
const certCache = new Map();

function generateCARoot() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + Date.now();
    cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day in the past
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years validity
    
    const attrs = [
        { name: 'commonName', value: 'EagleEye Proxy Root CA' },
        { name: 'organizationName', value: 'EagleEye Security' },
        { name: 'organizationalUnitName', value: 'EagleEye CA' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }
    ]);
    
    cert.sign(keys.privateKey, forge.md.sha256.create());
    
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    
    fs.writeFileSync('ca-cert.pem', certPem, 'utf8');
    fs.writeFileSync('ca-key.pem', keyPem, 'utf8');
    console.log("[CA] Fresh compliant root CA generated successfully!");
}

if (!fs.existsSync('ca-cert.pem') || !fs.existsSync('ca-key.pem')) {
    console.log("[CA] Cert/Key missing or incomplete, generating new Root CA...");
    generateCARoot();
}

const caCertPem = fs.readFileSync('ca-cert.pem', 'utf8');
const caKeyPem = fs.readFileSync('ca-key.pem', 'utf8');
const caCert = forge.pki.certificateFromPem(caCertPem);
const caKey = forge.pki.privateKeyFromPem(caKeyPem);

function getCertificate(hostname) {
    if (certCache.has(hostname)) return certCache.get(hostname);
    
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + Date.now();
    cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day in the past to avoid clock-sync errors
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    cert.setSubject([{ name: 'commonName', value: hostname }]);
    cert.setIssuer(caCert.subject.attributes);
    
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: false
    }, {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
    }, {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: hostname }]
    }]);
    
    cert.sign(caKey, forge.md.sha256.create());
    
    const pem = {
        key: forge.pki.privateKeyToPem(keys.privateKey),
        cert: forge.pki.certificateToPem(cert)
    };
    certCache.set(hostname, pem);
    return pem;
}

// --- SHARED PROXY CORE ---
const proxy = httpProxy.createProxyServer({ changeOrigin: true, secure: false });

// Noise-filtering lists (e.g. background browser updates, telemetry, captive portal checks)
const IGNORED_DOMAINS = [
    "detectportal.firefox.com",
    "firefox-settings-attachments.cdn.mozilla.net",
    "incoming.telemetry.mozilla.org",
    "self-repair.mozilla.org",
    "ocsp.digicert.com",
    "ocsp.sectigo.com",
    "ocsp.verisign.com",
    "ocsp2.globalsign.com",
    "safebrowsing.googleapis.com",
    "clients3.google.com",
    "clients4.google.com",
    "msftconnecttest.com",
    "connectivity-check.ubuntu.com",
    "push.services.mozilla.com",
    "shavar.services.mozilla.com"
];

function shouldIgnoreRequest(host, url) {
    if (!host) return false;
    const cleanHost = host.split(":")[0].toLowerCase();
    return IGNORED_DOMAINS.some(domain => 
        cleanHost === domain || cleanHost.endsWith("." + domain)
    );
}

proxy.on("error", (err, req, res) => {
    console.error("!!! PROXY ERROR !!!", err.message);
    if (res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Proxy Error: ${err.message}`);
    }
});

proxy.on("proxyRes", (proxyRes, req, res) => {
    let bodyChunks = [];
    proxyRes.on("data", chunk => bodyChunks.push(chunk));
    proxyRes.on("end", () => {
        const bodyBuffer = Buffer.concat(bodyChunks);
        
        // Skip logging if the request is marked as ignored (background browser noise)
        if (!req.ignored) {
            logs.unshift({
                id: Date.now(),
                method: req.method,
                url: (req.isSsl ? "https://" : "http://") + req.headers.host + req.url,
                status: proxyRes.statusCode,
                headers: req.headers,
                responseHeaders: proxyRes.headers,
                responseBody: bodyBuffer.toString(),
                time: Date.now() - (req._startTime || Date.now())
            });
        }
        
        if (!res.headersSent) {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            res.end(bodyBuffer);
        }
    });
});

function handleProxyRequest(req, res, isSsl = false) {
    req.isSsl = isSsl;
    req._startTime = Date.now();
    let bodyChunks = [];
    req.on("data", chunk => bodyChunks.push(chunk));
    req.on("end", () => {
        const bodyBuffer = Buffer.concat(bodyChunks);
        const host = req.headers.host || "localhost";

        // Normalize absolute URL from HTTP proxy requests (e.g. GET http://domain.com/path -> /path)
        let targetPath = req.url;
        if (req.url && (req.url.startsWith("http://") || req.url.startsWith("https://"))) {
            try {
                const parsedUrl = new URL(req.url);
                targetPath = (parsedUrl.pathname || "/") + (parsedUrl.search || "");
            } catch (e) {
                targetPath = req.url.replace(/^https?:\/\/[^\/]+/, '') || "/";
            }
        }
        req.url = targetPath;

        const fullUrl = (isSsl ? "https://" : "http://") + host + req.url;

        // Clean headers for outgoing traffic
        delete req.headers["proxy-connection"];
        delete req.headers["proxy-authorization"];

        // Filter out background browser updates, telemetry, captive portal checks
        if (shouldIgnoreRequest(host, req.url)) {
            req.ignored = true;
            const bufferStream = new PassThrough();
            bufferStream.end(bodyBuffer);
            proxy.web(req, res, { 
                target: (isSsl ? "https://" : "http://") + host,
                buffer: bufferStream
            });
            return;
        }

        if (appConfig.intercept) {
            console.log(`[INTERCEPT] Holding: ${req.method} ${fullUrl}`);
            interceptQueue.push({ 
                id: Date.now(), 
                req, 
                res, 
                bodyBuffer, 
                bodyStr: bodyBuffer.toString(),
                isSsl
            });
        } else {
            const bufferStream = new PassThrough();
            bufferStream.end(bodyBuffer);
            proxy.web(req, res, { 
                target: (isSsl ? "https://" : "http://") + host,
                buffer: bufferStream
            });
        }
    });
}

// --- SERVERS ---

// Internal MITM Decrypter
const mitmServer = https.createServer({
    SNICallback: (servername, cb) => {
        const certs = getCertificate(servername);
        cb(null, tls.createSecureContext(certs));
    }
}, (req, res) => {
    handleProxyRequest(req, res, true);
});

mitmServer.listen(0, '127.0.0.1', () => {
    const port = mitmServer.address().port;
    console.log(`[MITM] TLS Termination server listening on port ${port}`);
});

// Primary Proxy Listener
const proxyServer = http.createServer((req, res) => {
    handleProxyRequest(req, res, false);
});

proxyServer.on('connect', (req, socket, head) => {
    const [host, port] = req.url.split(':');
    
    // Only MITM if HTTPS capture is explicitly enabled in config
    if (appConfig.https.enabled) {
        console.log(`[MITM] Hijacking TLS tunnel for ${host}`);
        const mitmPort = mitmServer.address().port;
        const conn = net.connect(mitmPort, '127.0.0.1', () => {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            conn.write(head);
            conn.pipe(socket);
            socket.pipe(conn);
        });
        conn.on('error', (err) => {
            console.error(`[MITM ERROR] ${err.message}`);
            socket.end();
        });
        socket.on('error', () => conn.end());
    } else {
        // Fallback to RAW tunnel (Browser -> Real Server)
        // This is necessary if CA cert is not installed/trusted
        console.log(`[TUNNEL] Creating direct RAW tunnel to ${host}:${port}`);
        const serverSocket = net.connect(port || 443, host, () => {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            serverSocket.write(head);
            serverSocket.pipe(socket);
            socket.pipe(serverSocket);
        });
        serverSocket.on('error', (err) => {
            console.error(`[TUNNEL ERROR] ${err.message}`);
            socket.end();
        });
        socket.on('error', () => serverSocket.end());
    }
});

proxyServer.listen(8080, "0.0.0.0", () => { 
    console.log("Burp-style Proxy active on 127.0.0.1:8080"); 
});

// Update forward handler to FIX: Apply user modifications
apiApp.post("/api/intercept/forward", (req, resResponse) => {
    const { id, modifiedRaw } = req.body;
    const index = interceptQueue.findIndex(item => item.id === id);
    
    if (index !== -1) {
        const item = interceptQueue.splice(index, 1)[0];
        let targetReq = item.req;
        let targetBodyBuffer = item.bodyBuffer;

        // CRITICAL FIX: If user edited the request, we MUST re-parse and use those edits
        if (modifiedRaw) {
            try {
                const parsed = parseRawRequest(modifiedRaw);
                targetReq.method = parsed.method;
                targetReq.headers = { ...parsed.headers };
                delete targetReq.headers["proxy-connection"]; // Clean up
                targetBodyBuffer = Buffer.from(parsed.bodyStr);
                console.log(`[FORWARD] Applying manual edits for: ${targetReq.method} ${parsed.url}`);
            } catch (err) {
                console.error("!!! FAILED TO APPLY USER EDITS !!!", err.message);
            }
        } else {
            // Even if not edited, clean up proxy headers from original request
            delete targetReq.headers["proxy-connection"];
        }

        const host = targetReq.headers.host || "localhost";
        const bufferStream = new PassThrough();
        bufferStream.end(targetBodyBuffer);

        proxy.web(targetReq, item.res, { 
            target: (item.isSsl ? "https://" : "http://") + host,
            buffer: bufferStream
        });
        resResponse.json({ status: "success" });
    } else {
        resResponse.status(404).json({ error: "Request not found" });
    }
});
