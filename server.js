// Generic node.js express init:
const express = require('express');
const app = express();
const router = express.Router();
const request = require('request');
const bodyParser = require('body-parser');
const http = require('http').Server(app);

app.use(express.static('public'));
app.use(bodyParser.json());

const hbs = require('hbs');

hbs.registerPartials(__dirname + '/views/partials');

app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

hbs.registerHelper('json', function(context) {
    return JSON.stringify(context);
});

// Okta OAuth Config
const oktaConfig = {
  baseUrl: `${process.env.OKTA_TENANT}`,
  clientIdLightweight: process.env.CLIENT_ID_LIGHTWEIGHT,
  clientIdFull: process.env.CLIENT_ID_FULL,
  redirectUri: `${process.env.REDIRECT_URI}`,
  authServerIdLightweight: `${process.env.AUTH_SERVER_ID}`,
  linkedObjectSub: `${process.env.LINKED_OBJECT_SUB}`
}

let currentUserId;

/**
*
* /home
*
**/
app.get("/", (req, res) => {
  let data = {};
  res.render('index', data);
});

/** 
*
* /users
*
**/
app.get("/users", async function(req, res) {
  
  let data = {};
  const options = {
    uri: `${process.env.OKTA_TENANT}/api/v1/users`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }
  
  try {
    let res = await doRequest(options);
    data.json = JSON.parse(res);
  } catch(err) {
    data = err;
  }  
  
  data.currentUserId = currentUserId;
  
  res.render('users', data);
  
});

/**
*
* /users/:userID
*
**/
app.get('/users/:userId', async function(req, res) {
  
  currentUserId = req.params.userId;
 
  let data = {};
  
  let options = {
    uri: `${oktaConfig.baseUrl}/api/v1/users/${currentUserId}`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }
  
  try {
    let res = await doRequest(options);
    data.json = JSON.parse(res);
  } catch(err) {
    data.err = err;
  }  
  
  
  // https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul6gyvk92rhwD5S0h7/linkedObjects/lightweight_account
  options = {
    uri: `${oktaConfig.baseUrl}/api/v1/users/${currentUserId}/linkedObjects/${oktaConfig.linkedObjectSub}`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }
  
  try {
    let res = await doRequest(options);
    data.linkedObjects = JSON.parse(res);
  } catch(err) {
    data.err = err;
  }  
  
  let linkedObjectsArray=[];
  
 
  for (let linked in data.linkedObjects) {
    let linkedObject = data.linkedObjects[linked];
    console.log(linkedObject._links.self.href);
    options = {
      uri: `${linkedObject._links.self.href}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
      }
    }    
    
    try {
      let res = await doRequest(options);
      linkedObjectsArray.push(JSON.parse(res));
    } catch(err) {
      data.err = err;
    }  
    
    data.linkedObjectsArray = linkedObjectsArray
    
  }
  
  
  res.render('userdetails', data);
  
});

// Utilities

function doRequest(url) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, res, body) {
      //console.log(res.body);
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}



// And we end with some more generic node stuff -- listening for requests :-)
let listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
