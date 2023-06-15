const config = {
    endpoint: "https://db-epes-cosmos.documents.azure.com:443/",
    key: process.env.DB_KEY,
    databaseId: "db_epes",
    containerId: "items",
    partitionKey: { kind: "Hash", paths: ["/id"] }
};
module.exports = config;
