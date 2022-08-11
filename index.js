const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CosmosClient = require("@azure/cosmos").CosmosClient;
const config = require("./config");
const dbContext = require("./data/databaseContext");

const { endpoint, key, databaseId } = config;
const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

const IotClient = require('azure-iothub').Client;
const Registry = require('azure-iothub').Registry;

const iotConnectionString = process.env.IOTHUB_CONNECTION_STRING;
if (!iotConnectionString) {
    console.log('Please set the IOTHUB_CONNECTION_STRING environment variable.');
    process.exit(-1);
}

const dbConnectionString = process.env.DB_KEY;
if (!dbConnectionString) {
    console.log('Please set the DB_KEY environment variable.');
    process.exit(-1);
}

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded());

app.get('/', async (req, res) => {

    const queryLanguage = req.query.language;
    const queryDeviceId = req.query.deviceId;
    const queryVerificationCode = req.query.verificationCode;

    const registry = Registry.fromConnectionString(iotConnectionString);
    const deviceTwin = await getDeviceTwin(registry, queryDeviceId);
    const isCodeVerified = deviceTwin.properties.desired.verificationCode === queryVerificationCode;
    setNewVerificationCode(deviceTwin);

    if (!deviceTwin) {
        res.render("error", { title: "Error", message: "Device not found" });
    } else if (!isCodeVerified) {
        res.render("error", { title: "Error", message: "invalid verification code" });
    } else if (!queryLanguage) {
        res.render("home", { title: "Home" });
    } else {
        const languageData = await getLanguageData(queryLanguage);
        const deviceLocation = deviceTwin.properties.desired.mzr;
        const locationExists = (e) => e.id === deviceLocation;
        if (!languageData.mzrlocations.items.some(locationExists)) {
            res.render("error", { title: "Error", message: "invalid Device Location" });
        } else {
            res.render("form", { title: "Formular", id: queryVerificationCode, languageData: languageData, deviceLocation: deviceLocation });
        }
    }
})

app.post('/submit_form', async (req, res) => {
    let queryResponse = await submitForm(req)
    res.render('finish',
        { msg: queryResponse });
})

app.get('/pistatus', async (req, res) => {
    let piStatusData = await getPiStatusData();
    res.render("pistatus", { title: "Pi Status", piStatusData: piStatusData });
})

app.listen(port, () => {
    console.log(`This app is listening at http://localhost:${port}`)
})

async function getDeviceTwin(registry, deviceId) {
    let response = await registry.getTwin(deviceId);
    return response.responseBody;
}

function setNewVerificationCode(twin) {
    const twinPatch = { properties: { desired: { verificationCode: uuidv4() } } }

    twin.update(twinPatch, (err) => {
        if (err) {
            console.error(err.message);
        }
    });
}

async function getLanguageData(code) {
    const containerId = "coredata"
    console.log('Querying container: ' + containerId);
    const container = database.container(containerId);
    await dbContext.create(client, databaseId, containerId);

    // query to return all items
    const querySpec = {
        query: "SELECT * from c WHERE c.id = '" + code + "'"
    };

    // read all items in the Items container
    const { resources: items } = await container.items
        .query(querySpec).fetchNext();

    return items[0];
}

async function getPiStatusData() {
    const containerId = "pistatus"
    console.log('Querying container: ' + containerId);
    const container = database.container(containerId);
    await dbContext.create(client, databaseId, containerId);

    // query to return all items
    const querySpec = {
        query: "SELECT * from c"
    };

    // read all items in the Items container
    const { resources: items } = await container.items
        .query(querySpec).fetchNext();

    return items;
}

async function submitForm(req) {
    const containerId = "healthevents"
    const container = database.container(containerId);
    await dbContext.create(client, databaseId, containerId);

    const newItem = req.body;

    newItem.incidentlocation = JSON.parse(newItem.incidentlocation);

    const { resource: createdItem } = await container.items.create(newItem);

    console.log(`\r\nCreated new item: ${createdItem.id}\r\n`);

    return "Your feedback successfully saved."
}
