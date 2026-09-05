import React, { useState, useEffect } from "react";
import { Shield, Sparkles, Send, Copy, ArrowLeftRight, Trash2, Check, RefreshCw, AlertTriangle, FileText, Zap } from "lucide-react";
import CryptoJS from "crypto-js";
import { getDecoderInput, addRawToRepeater, setRawToIntruder, setAIRequest } from "../store";
import MarkdownRenderer from "./MarkdownRenderer";

function Decoder({ setMainTab }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState("text"); // 'text', 'jwt', 'hex', 'error'
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  
  // JWT specifics
  const [jwtHeader, setJwtHeader] = useState("");
  const [jwtPayload, setJwtPayload] = useState("");
  const [jwtSignature, setJwtSignature] = useState("");
  const [jwtStatus, setJwtStatus] = useState(null); // { expired: boolean, expDate: string }

  // AI specifics
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");

  // Check for input from other tabs on load
  useEffect(() => {
    const text = getDecoderInput();
    if (text) {
      setInput(text);
      smartAnalyze(text);
    }
  }, []);

  const handleCopyInput = () => {
    navigator.clipboard.writeText(input);
    setCopiedInput(true);
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
    setJwtHeader("");
    setJwtPayload("");
    setJwtSignature("");
    setJwtStatus(null);
    setAiAnalysis("");
    setMode("text");
  };

  // --- TRANSFORMATION ALGORITHMS ---

  const safeUrlDecode = (str) => {
    const plusReplaced = str.replace(/\+/g, " ");
    return plusReplaced.replace(/(%[0-9a-fA-F]{2})+/g, (match) => {
      try {
        return decodeURIComponent(match);
      } catch (e) {
        let decoded = "";
        const bytes = match.split("%").slice(1);
        for (let b of bytes) {
          const byteVal = parseInt(b, 16);
          decoded += String.fromCharCode(byteVal);
        }
        return decoded;
      }
    });
  };

  const base64Encode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(textVal);
      let binString = "";
      for (let i = 0; i < bytes.length; i++) {
        binString += String.fromCharCode(bytes[i]);
      }
      setOutput(btoa(binString));
      setMode("text");
    } catch (e) {
      setOutput(`Encoding Error: ${e.message}`);
      setMode("error");
    }
  };

  const base64Decode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      let base64 = textVal.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      const binString = atob(base64);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        setOutput(decoder.decode(bytes));
      } catch (utf8Error) {
        setOutput(binString);
      }
      setMode("text");
    } catch (e) {
      setOutput(`Invalid Base64 Input`);
      setMode("error");
    }
  };

  const urlEncode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      setOutput(encodeURIComponent(textVal));
      setMode("text");
    } catch (e) {
      setOutput(`Encoding Error: ${e.message}`);
      setMode("error");
    }
  };

  const urlDecode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      setOutput(safeUrlDecode(textVal));
      setMode("text");
    } catch (e) {
      setOutput(`Invalid URL Encoding`);
      setMode("error");
    }
  };

  const hexEncode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(textVal);
      let arr = [];
      for (let i = 0; i < bytes.length; i++) {
        arr.push(bytes[i].toString(16).padStart(2, "0"));
      }
      setOutput(arr.join(" "));
      setMode("text");
    } catch (e) {
      setOutput(`Hex Encoding Error: ${e.message}`);
      setMode("error");
    }
  };

  const hexDecode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const cleanHex = textVal.replace(/[^0-9a-fA-F]/g, "");
      if (cleanHex.length === 0) {
        setOutput("");
        setMode("text");
        return;
      }
      const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
      }
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        setOutput(decoder.decode(bytes));
      } catch (utf8Error) {
        let str = "";
        for (let i = 0; i < bytes.length; i++) {
          str += String.fromCharCode(bytes[i]);
        }
        setOutput(str);
      }
      setMode("text");
    } catch (e) {
      setOutput(`Invalid Hexadecimal String`);
      setMode("error");
    }
  };

  const htmlEncode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const encoded = textVal.replace(/[\u00A0-\u9999<>&"'/`]/g, (i) => `&#${i.charCodeAt(0)};`);
      setOutput(encoded);
      setMode("text");
    } catch (e) {
      setOutput(`HTML Encoding Error: ${e.message}`);
      setMode("error");
    }
  };

  const htmlDecode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const doc = new DOMParser().parseFromString(textVal, "text/html");
      setOutput(doc.documentElement.textContent || "");
      setMode("text");
    } catch (e) {
      setOutput(`HTML Decoding Error: ${e.message}`);
      setMode("error");
    }
  };

  const jwtDecode = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      let token = textVal.trim();
      if (token.toLowerCase().startsWith("bearer ")) {
        token = token.substring(7).trim();
      }
      const parts = token.split(".");
      if (parts.length < 2 || parts.length > 3) {
        throw new Error("A JWT token must consist of 2 or 3 parts separated by dots.");
      }

      const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) {
          base64 += "=";
        }
        const binString = atob(base64);
        const bytes = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) {
          bytes[i] = binString.charCodeAt(i);
        }
        return new TextDecoder("utf-8").decode(bytes);
      };

      const headerDecoded = JSON.parse(base64UrlDecode(parts[0]));
      const payloadDecoded = JSON.parse(base64UrlDecode(parts[1]));
      
      setJwtHeader(JSON.stringify(headerDecoded, null, 2));
      setJwtPayload(JSON.stringify(payloadDecoded, null, 2));
      setJwtSignature(parts[2] || "");

      if (payloadDecoded.exp) {
        const expMs = payloadDecoded.exp * 1000;
        const expired = Date.now() > expMs;
        const expDate = new Date(expMs).toLocaleString();
        setJwtStatus({ expired, expDate });
      } else {
        setJwtStatus(null);
      }

      setOutput(JSON.stringify(payloadDecoded, null, 2));
      setMode("jwt");
    } catch (e) {
      setOutput(`Failed to decode JWT: ${e.message}`);
      setMode("error");
      setJwtHeader("");
      setJwtPayload("");
      setJwtSignature("");
      setJwtStatus(null);
    }
  };

  const computeHash = (algo, val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      let hashed;
      if (algo === "md5") hashed = CryptoJS.MD5(textVal).toString();
      else if (algo === "sha1") hashed = CryptoJS.SHA1(textVal).toString();
      else if (algo === "sha256") hashed = CryptoJS.SHA256(textVal).toString();
      
      setOutput(hashed);
      setMode("text");
    } catch (e) {
      setOutput(`Hashing Error: ${e.message}`);
      setMode("error");
    }
  };

  const gzipDecompress = async (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const cleanInput = textVal.trim();
      let base64 = cleanInput.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      const binString = atob(base64);
      const len = binString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      
      const arrayBuffer = await new Response(ds.readable).arrayBuffer();
      const decoder = new TextDecoder();
      setOutput(decoder.decode(arrayBuffer));
      setMode("text");
    } catch (e) {
      setOutput(`Failed to decompress gzip (Ensure input is a valid Gzipped Base64 string): ${e.message}`);
      setMode("error");
    }
  };

  const gzipCompress = async (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(textVal);
      
      const cs = new CompressionStream("gzip");
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      
      const arrayBuffer = await new Response(cs.readable).arrayBuffer();
      const outBytes = new Uint8Array(arrayBuffer);
      let binString = "";
      for (let i = 0; i < outBytes.length; i++) {
        binString += String.fromCharCode(outBytes[i]);
      }
      setOutput(btoa(binString));
      setMode("text");
    } catch (e) {
      setOutput(`Gzip Compression Error: ${e.message}`);
      setMode("error");
    }
  };

  const formatJson = (val) => {
    try {
      const textVal = typeof val === "string" ? val : input;
      const parsed = JSON.parse(textVal.trim());
      setOutput(JSON.stringify(parsed, null, 2));
      setMode("text");
    } catch (e) {
      setOutput(`Invalid JSON format: ${e.message}`);
      setMode("error");
    }
  };

  const explainHash = (hashType, hashVal) => {
    const textVal = typeof hashVal === "string" ? hashVal : input;
    const clean = textVal.trim();
    const entropy = calculateEntropy(clean);
    
    let info = `===================================================\n`;
    info += `          🔐 CRYPTOGRAPHIC HASH IDENTIFIER          \n`;
    info += `===================================================\n\n`;
    info += `• Detected Format   : ${hashType}\n`;
    info += `• Digest Length     : ${clean.length} characters (${clean.length * 4}-bit digest)\n`;
    info += `• Character Encoding: Hexadecimal [0-9a-fA-F]\n`;
    info += `• Shannon Entropy   : ${entropy} (High Cryptographic Randomness)\n\n`;
    info += `---------------------------------------------------\n`;
    info += `ℹ️  WHY THIS CANNOT BE DIRECTLY "DECODED":\n`;
    info += `---------------------------------------------------\n`;
    info += `Unlike reversible encodings (such as Base64, Hex, or URL encoding),\n`;
    info += `a cryptographic hash is a ONE-WAY mathematical digest.\n\n`;
    info += `• It is irreversible by design (information is compressed/lost).\n`;
    info += `• To recover original text, standard methods include:\n`;
    info += `  1. Precomputed Rainbow Tables & Hash Lookup Databases\n`;
    info += `  2. Dictionary & Wordlist Attacks (Hashcat / John the Ripper)\n`;
    info += `  3. Online Database Lookup / AI Recognition\n\n`;
    info += `💡 Click "Explain with AI" in the top bar to inspect this hash with EagleAI!\n`;
    
    setOutput(info);
    setMode("text");
  };

  // --- SMART DETECTOR ---
  const detectFormat = (str) => {
    if (!str || str.trim().length === 0) return { type: "Empty", actions: [] };
    const trimmed = str.trim();

    // 1. JWT Check
    let jwtToken = trimmed;
    if (jwtToken.toLowerCase().startsWith("bearer ")) {
      jwtToken = jwtToken.substring(7).trim();
    }
    const jwtParts = jwtToken.split(".");
    if ((jwtParts.length === 2 || jwtParts.length === 3) && (jwtParts[0].startsWith("eyJ") || jwtToken.startsWith("eyJ"))) {
      return {
        type: "JWT Token",
        actions: [{ label: "Decode JWT", action: () => jwtDecode(str) }]
      };
    }

    // 2. JSON Check
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        JSON.parse(trimmed);
        return {
          type: "JSON Data",
          actions: [{ label: "Format JSON Pretty", action: () => formatJson(str) }]
        };
      } catch (e) {}
    }

    // 3. Cryptographic Hashes (Bcrypt / Unix Crypt)
    if (/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(trimmed)) {
      return {
        type: "Bcrypt Password Hash",
        actions: [
          { label: "Identify Hash Info", action: () => explainHash("Bcrypt Hash ($2a/$2b)", str) },
          { label: "Explain with AI", action: handleAskAI }
        ]
      };
    }
    if (/^\$1\$[./A-Za-z0-9]{1,8}\$[./A-Za-z0-9]{22}$/.test(trimmed)) {
      return {
        type: "MD5-Crypt Unix Hash",
        actions: [
          { label: "Identify Hash Info", action: () => explainHash("MD5-Crypt ($1$)", str) },
          { label: "Explain with AI", action: handleAskAI }
        ]
      };
    }
    if (/^\$6\$[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{86}$/.test(trimmed)) {
      return {
        type: "SHA-512-Crypt Unix Hash",
        actions: [
          { label: "Identify Hash Info", action: () => explainHash("SHA-512-Crypt ($6$)", str) },
          { label: "Explain with AI", action: handleAskAI }
        ]
      };
    }

    // 4. Hex-based Cryptographic Hashes vs Hex-Encoded ASCII Text
    const isPureHex = /^[0-9a-fA-F]+$/.test(trimmed);
    if (isPureHex) {
      // Check if hex decodes to clean human-readable ASCII text
      let isReadableAscii = false;
      if (trimmed.length >= 4 && trimmed.length % 2 === 0) {
        try {
          const bytes = new Uint8Array(trimmed.length / 2);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(trimmed.substring(i * 2, i * 2 + 2), 16);
          }
          const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          if (/^[\x20-\x7E\r\n\t]+$/.test(decoded) && decoded.trim().length > 0) {
            isReadableAscii = true;
          }
        } catch (e) {}
      }

      // If it's a fixed length matching standard cryptographic hash digests:
      if (trimmed.length === 32) {
        return {
          type: "MD5 Hash (32-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("MD5 (Message-Digest Algorithm 5)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }
      if (trimmed.length === 40) {
        return {
          type: "SHA-1 Hash (40-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("SHA-1 (Secure Hash Algorithm 1)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }
      if (trimmed.length === 56) {
        return {
          type: "SHA-224 Hash (56-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("SHA-224 (Secure Hash Algorithm 224-bit)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }
      if (trimmed.length === 64) {
        return {
          type: "SHA-256 Hash (64-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("SHA-256 (Secure Hash Algorithm 256-bit)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }
      if (trimmed.length === 96) {
        return {
          type: "SHA-384 Hash (96-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("SHA-384 (Secure Hash Algorithm 384-bit)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }
      if (trimmed.length === 128) {
        return {
          type: "SHA-512 Hash (128-char Hex Digest)",
          actions: [
            { label: "Identify Hash Info", action: () => explainHash("SHA-512 (Secure Hash Algorithm 512-bit)", str) },
            { label: "Explain with AI", action: handleAskAI },
            { label: "Decode as Hex Bytes", action: () => hexDecode(str) }
          ]
        };
      }

      // General Hex String
      if (trimmed.length >= 2 && trimmed.length % 2 === 0) {
        return {
          type: isReadableAscii ? "Hex-Encoded Text" : "Hexadecimal Raw Bytes",
          actions: [{ label: "Decode Hex", action: () => hexDecode(str) }]
        };
      }
    }

    // 5. Base64 Check
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    let cleanB64 = trimmed.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (cleanB64.length % 4) {
      cleanB64 += "=";
    }
    if (trimmed.length >= 8 && base64Regex.test(cleanB64)) {
      try {
        const decoded = atob(cleanB64);
        if (/^[\x20-\x7E\r\n\t]+$/.test(decoded)) {
          return {
            type: "Base64 Encoded Text",
            actions: [{ label: "Decode Base64", action: () => base64Decode(str) }]
          };
        }
      } catch (e) {}
    }

    // 6. URL Encoded Check
    if (trimmed.includes("%") && /%[0-9a-fA-F]{2}/.test(trimmed)) {
      return {
        type: "URL Encoded Data",
        actions: [{ label: "Decode URL", action: () => urlDecode(str) }]
      };
    }

    // 7. HTML Entities Check
    if (/&[a-zA-Z0-9#]+;/.test(trimmed)) {
      return {
        type: "HTML Encoded Entities",
        actions: [{ label: "Decode HTML", action: () => htmlDecode(str) }]
      };
    }

    return { type: "Plain Text / Raw String", actions: [] };
  };

  const smartAnalyze = (text) => {
    const analysis = detectFormat(text);
    if (analysis.actions.length > 0) {
      // Execute the primary suggestion automatically!
      analysis.actions[0].action();
    }
  };

  // Metrics
  const inputStats = {
    bytes: new Blob([input]).size,
    chars: input.length,
    entropy: calculateEntropy(input)
  };

  function calculateEntropy(str) {
    if (!str) return 0;
    const len = str.length;
    const frequencies = {};
    for (let i = 0; i < len; i++) {
      const char = str[i];
      frequencies[char] = (frequencies[char] || 0) + 1;
    }
    let entropy = 0;
    for (const char in frequencies) {
      const p = frequencies[char] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy.toFixed(2);
  }

  // AI Security analysis
  const handleAskAI = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    setAiAnalysis("");
    
    const analysisMessage = `You are a cybersecurity expert. Review this decoded data and payload. Identify if it contains credentials, JWT security issues, obfuscation, or vulnerability patterns. Format beautifully as standard markdown with bullet points. Decoded Payload:\n\n\`\`\`\n${output || input}\n\`\`\``;

    try {
      const res = await fetch("http://127.0.0.1:8081/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: analysisMessage,
          beginnerMode: false
        })
      });

      const data = await res.json();
      setAiAnalysis(data.reply);
    } catch (err) {
      setAiAnalysis("AI intelligence analysis failed: " + err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Dispatch utilities
  const sendToRepeaterSession = () => {
    const fakeReq = {
      method: "POST",
      url: "http://localhost/decoder-import",
      headers: { "content-type": "application/json" },
      body: output || input
    };
    addRawToRepeater(
      `POST /decoder-import HTTP/1.1\nHost: localhost\nContent-Type: application/json\nContent-Length: ${(output || input).length}\n\n${output || input}`
    );
    setMainTab("repeater");
  };

  const sendToIntruderSession = () => {
    setRawToIntruder(
      `POST /decoder-import HTTP/1.1\nHost: localhost\nContent-Type: application/json\nContent-Length: ${(output || input).length}\n\n${output || input}`
    );
    setMainTab("intruder");
  };

  const sendToAiChatTab = () => {
    setAIRequest(output || input);
    setMainTab("ai-chat");
  };
  const detected = detectFormat(input);

  return (
    <div className="proxy-view-container">
      {/* CSS stylesheet embedded in component to make it perfectly robust */}
      <style dangerouslySetInnerHTML={{__html: `
        .decoder-workspace {
          display: flex;
          flex: 1;
          background: var(--burp-border);
          gap: 1px;
          overflow: hidden;
        }

        .decoder-pane {
          background: #ffffff;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .decoder-textarea {
          flex: 1;
          width: 100%;
          border: none;
          padding: 15px;
          font-family: var(--burp-font-mono);
          font-size: 12.5px;
          background: #ffffff;
          color: #2c3e50;
          outline: none;
          resize: none;
          line-height: 1.5;
          overflow-y: auto;
        }

        .decoder-stats-bar {
          background: #f1f3f5;
          padding: 6px 15px;
          border-top: 1px solid var(--burp-border);
          font-size: 11px;
          color: #666;
          display: flex;
          gap: 20px;
        }

        .decoder-sidebar-actions {
          width: 250px;
          background: #f8f9fa;
          border-left: 1px solid var(--burp-border);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .decoder-action-group {
          border-bottom: 1px solid #edf1f3;
          padding: 12px;
        }

        .decoder-action-group-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: #7f8c8d;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .decoder-btn-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .decoder-action-btn {
          padding: 6px;
          border: 1px solid var(--burp-border);
          background: #ffffff;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 3px;
          text-align: center;
          color: var(--burp-text);
          transition: all 0.15s;
        }

        .decoder-action-btn:hover {
          background: var(--burp-selection);
          border-color: var(--burp-blue);
          color: var(--burp-blue);
        }

        .decoder-smart-badge {
          background: rgba(255, 102, 51, 0.1);
          color: var(--burp-orange);
          border: 1px solid rgba(255, 102, 51, 0.2);
          border-radius: 4px;
          padding: 8px 12px;
          margin-bottom: 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .jwt-viewer-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 15px;
          height: 100%;
          overflow-y: auto;
          background: #ffffff;
        }

        .jwt-card {
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          overflow: hidden;
        }

        .jwt-card-header {
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 700;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jwt-card-header.header { background: #e74c3c; }
        .jwt-card-header.payload { background: #3498db; }
        .jwt-card-header.signature { background: #27ae60; }

        .jwt-card pre {
          margin: 0;
          padding: 12px;
          font-family: var(--burp-font-mono);
          font-size: 11.5px;
          background: #fdfefe;
          color: #2c3e50;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .jwt-status-pill {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 9px;
          font-weight: 700;
          color: white;
          text-transform: uppercase;
        }

        .jwt-status-pill.expired { background: #d63031; }
        .jwt-status-pill.valid { background: #2ecc71; }

        .ai-analysis-card {
          margin: 12px;
          border: 1px solid rgba(110, 69, 226, 0.3);
          background: rgba(110, 69, 226, 0.03);
          border-radius: 4px;
          padding: 12px;
        }

        .ai-terminal {
          background: #1e272e;
          border-radius: 4px;
          padding: 12px;
          color: #2ecc71;
          font-family: var(--burp-font-mono);
          font-size: 11px;
          line-height: 1.5;
          margin-top: 10px;
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #111;
        }
      `}} />

      {/* Control Panel / Actions bar */}
      <div className="repeater-controls">
        <span style={{ fontWeight: "700", color: "var(--burp-orange)", textTransform: "uppercase", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
          🔐 Decoder Workspace
        </span>

        <button className="toolbar-btn" style={{ marginLeft: "10px" }} onClick={handleClear}>
          <Trash2 size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} /> Clear
        </button>

        <button 
          className="repeater-send-btn" 
          style={{ 
            background: "linear-gradient(135deg, #6e45e2 0%, #88d3ce 100%)", 
            color: "white", 
            border: "none", 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "6px", 
            padding: "6px 12px",
            fontSize: "11px",
            boxShadow: "0 2px 4px rgba(110, 69, 226, 0.2)"
          }}
          onClick={handleAskAI}
          disabled={isAiLoading || (!input && !output)}
        >
          <Sparkles size={12} /> {isAiLoading ? "AI Thinking..." : "Explain with AI"}
        </button>

        {detected.actions.length > 0 && (
          <div style={{ marginLeft: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", fontWeight: "700", color: "#666", textTransform: "uppercase" }}>Auto Detect:</span>
            <button 
              className="toolbar-btn primary"
              style={{ padding: "3px 10px", fontSize: "10.5px", background: "var(--burp-orange)", borderColor: "#e55b2e" }}
              onClick={detected.actions[0].action}
            >
              <Zap size={11} style={{ marginRight: "4px", display: "inline" }} /> {detected.actions[0].label}
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
          <button className="toolbar-btn" style={{ fontSize: "10px", padding: "4px 8px" }} onClick={sendToRepeaterSession}>
            Send to Repeater
          </button>
          <button className="toolbar-btn" style={{ fontSize: "10px", padding: "4px 8px" }} onClick={sendToIntruderSession}>
            Send to Intruder
          </button>
          <button className="toolbar-btn" style={{ fontSize: "10px", padding: "4px 8px" }} onClick={sendToAiChatTab}>
            Send to AI Chat
          </button>
        </div>
      </div>

      <div className="decoder-workspace">
        {/* Input Pane */}
        <div className="decoder-pane" style={{ borderRight: "1px solid var(--burp-border)" }}>
          <div className="pane-header-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Input</span>
            <button 
              onClick={handleCopyInput} 
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}
            >
              {copiedInput ? <Check size={11} color="green" /> : <Copy size={11} />} {copiedInput ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea
            className="decoder-textarea"
            placeholder="Type, paste raw text, Base64 strings, or raw HTTP body packages here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck="false"
          />
          <div className="decoder-stats-bar">
            <span><strong>Length:</strong> {inputStats.chars} chars</span>
            <span><strong>Size:</strong> {inputStats.bytes} bytes</span>
            <span><strong>Entropy:</strong> {inputStats.entropy} (obfuscation index)</span>
          </div>
        </div>

        {/* Output/Result Pane */}
        <div className="decoder-pane">
          <div className="pane-header-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Decoded / Transformed Result</span>
            {output && (
              <button 
                onClick={handleCopyOutput} 
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}
              >
                {copiedOutput ? <Check size={11} color="green" /> : <Copy size={11} />} {copiedOutput ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          
          {mode === "jwt" ? (
            <div className="jwt-viewer-container">
              {jwtStatus && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", background: jwtStatus.expired ? "#fdf2f2" : "#eafaf1", padding: "8px 12px", borderRadius: "4px", border: jwtStatus.expired ? "1px solid #fab1a0" : "1px solid #2ecc71" }}>
                  <AlertTriangle size={14} color={jwtStatus.expired ? "#e74c3c" : "#27ae60"} />
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#2c3e50" }}>
                    Token Status: <strong>{jwtStatus.expired ? "Expired" : "Active / Valid"}</strong> (Expires: {jwtStatus.expDate})
                  </span>
                  <span className={`jwt-status-pill ${jwtStatus.expired ? "expired" : "valid"}`} style={{ marginLeft: "auto" }}>
                    {jwtStatus.expired ? "Expired" : "Valid"}
                  </span>
                </div>
              )}
              
              <div className="jwt-card">
                <div className="jwt-card-header header">
                  <span>JWT HEADER</span>
                  <code>{JSON.parse(jwtHeader)?.alg || "None"}</code>
                </div>
                <pre>{jwtHeader}</pre>
              </div>

              <div className="jwt-card">
                <div className="jwt-card-header payload">
                  <span>JWT PAYLOAD / CLAIMS</span>
                  <span>{JSON.parse(jwtPayload)?.sub || "Claims"}</span>
                </div>
                <pre>{jwtPayload}</pre>
              </div>

              {jwtSignature && (
                <div className="jwt-card">
                  <div className="jwt-card-header signature">
                    <span>SIGNATURE (HMAC / RSA)</span>
                    <span style={{ fontSize: "9px" }}>Verification Signature Hash</span>
                  </div>
                  <pre style={{ fontStyle: "italic", background: "#f9fcf9", color: "#27ae60" }}>{jwtSignature}</pre>
                </div>
              )}
            </div>
          ) : (
            <textarea
              className="decoder-textarea"
              style={{ 
                color: mode === "error" ? "#c0392b" : "#2c3e50",
                background: mode === "error" ? "#fffbfb" : "#ffffff",
                fontFamily: "var(--burp-font-mono)"
              }}
              placeholder="Transformation result will be dynamically displayed here..."
              value={output}
              readOnly
            />
          )}

          {output && (
            <div className="decoder-stats-bar">
              <span><strong>Output Length:</strong> {output.length} chars</span>
              <span><strong>Output Size:</strong> {new Blob([output]).size} bytes</span>
            </div>
          )}
        </div>

        {/* Sidebar Actions Pane */}
        <div className="decoder-sidebar-actions">
          {/* Smart Detect Box */}
          <div className="decoder-action-group">
            <div className="decoder-action-group-title">Smart Detector</div>
            <div className="decoder-smart-badge">
              <span style={{ fontSize: "10px", opacity: 0.7, textTransform: "uppercase" }}>Detected Format</span>
              <span style={{ fontSize: "13px", fontWeight: "700" }}>{detected.type}</span>
            </div>
          </div>

          {/* Decode/Encode Toolbar */}
          <div className="decoder-action-group">
            <div className="decoder-action-group-title">Decode Options</div>
            <div className="decoder-btn-grid">
              <button className="decoder-action-btn" onClick={base64Decode}>Base64</button>
              <button className="decoder-action-btn" onClick={urlDecode}>URL</button>
              <button className="decoder-action-btn" onClick={hexDecode}>Hex</button>
              <button className="decoder-action-btn" onClick={htmlDecode}>HTML</button>
              <button className="decoder-action-btn" onClick={jwtDecode} style={{ gridColumn: "span 2", fontWeight: "bold", background: "rgba(52, 152, 219, 0.05)" }}>JWT Parser</button>
              <button className="decoder-action-btn" onClick={gzipDecompress} style={{ gridColumn: "span 2" }}>Gzip Decompress</button>
            </div>
          </div>

          <div className="decoder-action-group">
            <div className="decoder-action-group-title">Encode Options</div>
            <div className="decoder-btn-grid">
              <button className="decoder-action-btn" onClick={base64Encode}>Base64</button>
              <button className="decoder-action-btn" onClick={urlEncode}>URL</button>
              <button className="decoder-action-btn" onClick={hexEncode}>Hex</button>
              <button className="decoder-action-btn" onClick={htmlEncode}>HTML</button>
              <button className="decoder-action-btn" onClick={gzipCompress} style={{ gridColumn: "span 2" }}>Gzip Compress</button>
            </div>
          </div>

          <div className="decoder-action-group">
            <div className="decoder-action-group-title">Hashing Engine</div>
            <div className="decoder-btn-grid">
              <button className="decoder-action-btn" onClick={() => computeHash("md5")}>MD5</button>
              <button className="decoder-action-btn" onClick={() => computeHash("sha1")}>SHA-1</button>
              <button className="decoder-action-btn" onClick={() => computeHash("sha256")} style={{ gridColumn: "span 2" }}>SHA-256 Signature</button>
            </div>
          </div>

          <div className="decoder-action-group">
            <div className="decoder-action-group-title">Format Utilities</div>
            <div className="decoder-btn-grid">
              <button className="decoder-action-btn" style={{ gridColumn: "span 2" }} onClick={formatJson}>JSON Pretty Format</button>
            </div>
          </div>
        </div>
      </div>

      {/* AI explanation segment */}
      {aiAnalysis && (
        <div className="ai-analysis-card">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(110, 69, 226, 0.1)", paddingBottom: "6px" }}>
            <Sparkles size={14} color="#6e45e2" />
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#6e45e2" }}>EagleAI Analysis Report</span>
            <button 
              className="close-panel" 
              onClick={() => setAiAnalysis("")} 
              style={{ cursor: "pointer", border: "none", background: "transparent", marginLeft: "auto", fontSize: "10px" }}
            >
              Dismiss
            </button>
          </div>
          <div className="ai-terminal" style={{ background: '#ffffff', border: '1px solid var(--burp-border)' }}>
            <div style={{ fontWeight: "700", marginBottom: "8px", color: 'var(--burp-orange)' }}>[SEC_AUDIT] Analysis Results</div>
            <MarkdownRenderer content={aiAnalysis} />
          </div>
        </div>
      )}
    </div>
  );
}

export default Decoder;
