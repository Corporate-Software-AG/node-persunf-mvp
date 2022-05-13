const config = {
    endpoint: "https://mvppersunf.documents.azure.com:443/",
    key: process.env.DB_KEY,
    databaseId: "mvp_persunf",
    containerId: "items",
    partitionKey: { kind: "Hash", paths: ["/id"] }
};
module.exports = config;