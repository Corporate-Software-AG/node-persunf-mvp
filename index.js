const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const axios = require('axios');
const qs = require('qs');
const path = require('path');
const short = require('short-uuid');

const CosmosClient = require("@azure/cosmos").CosmosClient;
const config = require("./config");
const dbContext = require("./data/databaseContext");

const { endpoint, key, databaseId, containerId } = config;

const client = new CosmosClient({ endpoint, key });

const database = client.database(databaseId);
const container = database.container(containerId);


app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded());

app.get('/', (req, res) => {
    res.send('App up and running');
})

app.get('/generate', (req, res) => {
    res.render("generate", { title: "MVP QR", uuid: short.generate() });
})

app.get('/form/:id', (req, res) => {
    res.render("form", { title: "MVP Form", id: req.params.id });
})

app.post('/submit_form', async (req, res) => {
    console.log("FORM POST")
    await dbContext.create(client, databaseId, containerId);


    const newItem = {
        id: short.generate(),
        name: req.body.name,
        description: req.body.desc,
        mzr: req.body.select
    };

    const { resource: createdItem } = await container.items.create(newItem);

    console.log(`\r\nCreated new item: ${createdItem.id} - ${createdItem.description}\r\n`);


    res.render('finish',
        { msg: "Your feedback successfully saved." });
})

app.get('/results', async (req, res) => {
    console.log(`Querying container: Items`);
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
        console.log(`${item.id} - ${item.name}`);
    });

    res.render("results", { title: "MVP Data", results: items });
})

app.listen(port, () => {
    console.log(`This app is listening at http://localhost:${port}`)
})