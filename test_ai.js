require('dotenv').config();
const { chatWithAI } = require('./services/chatService');

const dummyRequest = `POST /Login.asp?RetURL=%2FDefault%2Easp%3F HTTP/1.1
Host: testasp.vulnweb.com
content-length: 36
cache-control: max-age=0
upgrade-insecure-requests: 1
content-type: application/x-www-form-urlencoded
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36
origin: http://testasp.vulnweb.com
accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
referer: http://testasp.vulnweb.com/Login.asp?RetURL=%2FDefault%2Easp%3F
accept-encoding: gzip, deflate
accept-language: en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,ml;q=0.6
cookie: ASPSESSIONIDAQBDCSDC=NALLIEHDCIPEGFCDJGLNFNOB

tfUName=admin&tfUPass=32a%409UH59PAz`;

async function run() {
  console.log("Testing chatWithAI under 'analyzer' mode...");
  const result = await chatWithAI({
    message: "Perform full security analysis.",
    rawRequest: dummyRequest,
    history: [],
    mode: "analyzer"
  });
  console.log("RESULT REPLY:\n", result.reply);
  console.log("\nRESULT REASONING:\n", result.reasoning);
  console.log("\nRESULT ACTIONS:\n", JSON.stringify(result.actions, null, 2));
}

run();
