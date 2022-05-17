const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const short = require('short-uuid');

const CosmosClient = require("@azure/cosmos").CosmosClient;
const config = require("./config");
const dbContext = require("./data/databaseContext");

const { endpoint, key, databaseId } = config;
const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

const IotClient = require('azure-iothub').Client;

const iotConnectionString = process.env.IOTHUB_CONNECTION_STRING;
if (!iotConnectionString) {
    console.log('Please set the IOTHUB_CONNECTION_STRING environment variable.');
    //process.exit(-1);
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

app.get('/', (req, res) => {
    res.send('App up and running');
})

app.get('/form/:lang/:id', async (req, res) => {
    console.log("FORM with " + req.params.id)
    if (req.query.deviceId) {
        console.log("Form from " + req.query.deviceId)
        setUpIoT(deviceId);
    }
    let languageData = await getLanguageData(req.params.lang);
    res.render("form", { title: "Formular", id: req.params.id, languageData: languageData });
})

app.post('/submit_form', async (req, res) => {
    console.log("FORM POST")
    let queryResponse = await submitForm(req)
    res.render('finish',
        { msg: queryResponse });
})

app.get('/results', async (req, res) => {
    console.log(`Querying container: healthevents`);
    const containerId = "coredata"
    const container = database.container(containerId);
    await dbContext.create(client, databaseId, containerId);

    // query to return all items
    const querySpec = {
        query: "SELECT * from c"
    };

    // read all items in the Items container
    const { resources: items } = await container.items
        .query(querySpec)
        .fetchAll();

    items.forEach(item => {
        console.log(`${item.id}`);
    });

    res.render("results", { title: "MVP Data", results: items });
})

app.listen(port, () => {
    console.log(`This app is listening at http://localhost:${port}`)
})

function setUpIoT(targetDevice) {
    const methodParams = {
        methodName: 'onQrAcknowledged',
        payload: { "complete": true },
        responseTimeoutInSeconds: 15 // set response timeout as 15 seconds
    };
    let iotClient = IotClient.fromConnectionString(iotConnectionString);
    iotClient.invokeDeviceMethod(targetDevice, methodParams, (err, result) => {
        if (err) {
            console.error('Failed to invoke method \'' + methodParams.methodName + '\': ' + err.message);
        } else {
            console.log(methodParams.methodName + ' on ' + targetDevice + ':');
            console.log(JSON.stringify(result, null, 2));
        }
    });
}

async function getLanguageData(code) {
    console.log(`Querying container: coredata`);
    const containerId = "coredata"
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

async function submitForm(req) {
    const containerId = "healthevents"
    const container = database.container(containerId);
    await dbContext.create(client, databaseId, containerId);

    const newItem = req.body;

    const { resource: createdItem } = await container.items.create(newItem);

    console.log(`\r\nCreated new item: ${createdItem.id} - ${createdItem.description}\r\n`);

    return "Your feedback successfully saved."
}
