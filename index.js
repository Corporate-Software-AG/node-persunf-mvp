const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const appInsights = require('applicationinsights');
const crypto = require('crypto'); // Import the crypto module

const CosmosClient = require("@azure/cosmos").CosmosClient;
const config = require("./config");
const dbContext = require("./data/databaseContext");

const { endpoint, key, databaseId } = config;
const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

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

app.use(express.urlencoded({ extended: true }))

const seed = "12345678901234567890123456789012"; // The encryption seed

// Function to decrypt the timestamp
function decrypt(encrypted, seed) {
    const [ivHex, encryptedText] = encrypted.split(':'); // Split the IV and the encrypted text
    const iv = Buffer.from(ivHex, 'hex'); // Convert the IV to a Buffer
    const key = Buffer.from(seed, 'utf8'); // Convert the seed to a Buffer
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

app.get('/', async (req, res) => {

    let queryLanguage = req.query.language;
    const queryDeviceId = req.query.deviceId;
    const queryVerificationCode = req.query.verificationCode;

    if (queryDeviceId == "DEBUG") {
        if (!queryLanguage) {
            queryLanguage = "de";
        }
        const languageData = await getLanguageData(queryLanguage);
        const deviceLocation = "debug2";
        appInsights.defaultClient.trackEvent({ name: "DEBUG Form", properties: { message: "loaded Debug Form" } });
        await createEvent("DEBUG FORM", "Debug Form called", deviceLocation)
        res.render("form", { title: "Formular", id: queryDeviceId, languageData: languageData, deviceLocation: deviceLocation });
        return;
    }

    const registry = Registry.fromConnectionString(iotConnectionString);
    const deviceTwin = await getDeviceTwin(registry, queryDeviceId);
    try {
        const decryptedTimestamp = decrypt(queryVerificationCode, seed);
        console.log('Decrypted Timestamp:', decryptedTimestamp);
        currentTimestamp = new Date().toISOString();
        console.log('Current Timestamp:', currentTimestamp);
        const diff = Math.abs(new Date(currentTimestamp) - new Date(decryptedTimestamp));
        if (diff > 600000) {
            console.log('Verification Code expired');
            //res.render("error", { title: "Error", message: "Verification Code expired" });
            //return;
        }
    } catch (e) {
    }
    const deviceLocation = deviceTwin.properties.desired.mzr;
    const deviceState = deviceTwin.properties.desired.state || "not set";

    /*if (!deviceTwin) {
        await createEvent("ERROR Device", "Device not found error", deviceLocation)
        res.render("error", { title: "Error", message: "Device not found" });
    } else if (!isCodeVerified) {
        await createEvent("ERROR Verification", "Verification Code not valid", deviceLocation)
        res.render("error", { title: "Error", message: "invalid verification code <br />Bitte scannen Sie den Code neu <br />Veuillez rescanner le code <br />Si prega di ripetere la scansione del codice" });
    } else */ if (!queryLanguage) {
        appInsights.defaultClient.trackEvent({ name: "LANGUAGE", properties: { message: "loaded Language Screen", location: deviceLocation, state: deviceState } });
        await createEvent("LANGUAGE Page", "Language Page loaded", deviceLocation)
        res.render("home", { title: "Home" });
    } else {
        const languageData = await getLanguageData(queryLanguage);

        const locationExists = (e) => e.id === deviceLocation;
        if (!languageData.mzrlocations.items.some(locationExists)) {
            await createEvent("ERROR Location", "Location does not exist", deviceLocation)
            res.render("error", { title: "Error", message: "invalid Device Location" });
        } else {
            appInsights.defaultClient.trackEvent({ name: "FORM", properties: { message: "loaded Form Frontend", location: deviceLocation, state: deviceState } });
            await createEvent("FORM Page", "Form Page loaded", deviceLocation)
            setNewVerificationCode(deviceTwin);
            res.render("form", { title: "Formular", id: queryVerificationCode, languageData: languageData, deviceLocation: deviceLocation });
        }
    }
})

app.post('/submit_form', async (req, res) => {
    let queryResponse = await submitForm(req)
    res.render('finish',
        { msg: queryResponse });
})

app.get('/iotstatus', async (req, res) => {
    let piStatusData = await getPiStatusData();
    res.render("pistatus", { title: "IoT Devices Status", piStatusData: piStatusData });
})

app.listen(port, () => {
    console.log(`This app is listening at http://localhost:${port}`)
    appInsights.setup().start()
})

async function createEvent(type, message, deviceId, state) {
    const containerId = "events"
    const container = database.container(containerId)
    await dbContext.create(client, databaseId, containerId);
    let newEvent = {
        id: uuidv4(),
        type: type,
        deviceId: deviceId,
        message: message,
        state: state
    }
    const { resource: createdItem } = await container.items.create(newEvent);
    console.log(`\r\nCreated new Event: ${createdItem.id}\r\n`);
    return
}

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
        query: "SELECT * FROM c WHERE c.location != 'not set' ORDER BY c.id ASC"
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

    console.log('Creating new item in container:\n', container.id);
    console.log('Request Body:\n', req.body);

    const newItem = req.body;

    appInsights.defaultClient.trackEvent({ name: "SUBMIT", properties: { message: "Form submitted", device: newItem.mzr } });
    await createEvent("SUBMIT FORM", "Form Submitted", newItem.mzr)
    try {
        newItem.incidentlocation = JSON.stringify(newItem.incidentlocation);
    }
    catch (e) {
        console.error(e);
    }
    const { resource: createdItem } = await container.items.create(newItem);

    console.log(`\r\nCreated new item: ${createdItem.id}\r\n`);

    return "Your feedback successfully saved."
}
