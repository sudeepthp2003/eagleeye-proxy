const defaultConfig = {
  proxy: {
    host: "127.0.0.1",
    port: 8080,
  },
  intercept: false,
  interceptResponse: false,
  https: {
    enabled: true,
    certPath: "ca-cert.pem",
    keyPath: "ca-key.pem",
  },
  http: {
    version: "auto", // HTTP/1 + HTTP/2
  }
};

module.exports = defaultConfig;
