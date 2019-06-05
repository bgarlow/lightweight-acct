// Generic node.js express init:
const express = require('express');
const app = express();
const router = express.Router();
const request = require('request');
const bodyParser = require('body-parser');
const http = require('http').Server(app);

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

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


app.post('/debug', (req, res) => {
  
  console.log(req);
  
});

/**
*
* /createLightweight
*
**/
app.post('/users', async function(req, res) {
  
  let description = req.body.accountDescription;
  let accountOwner = req.body.accountOwner;
  let lightweightAccountId;
  let data = {};
  let fakeDomain = 'lightweight.com';
  let options;
  
  let pin = Math.floor(100000 + Math.random() * 900000);
  let identifier = `${pin}@${fakeDomain}`;
  // https://sonos-ciam-oie.oktapreview.com/api/v1/users?activate=true
  /*
    "profile": {
      "account_description": "Barry",
      "login": "lightweight@81654aab-d06d-4ea0-91f1-97dc66337c0a.com",
      "email": "lightweight@86568689-c060-45e6-b30e-a2c16fd3255c.com",
      "account_type": "lightweight"
    }  
  */
  
  let profile = {
      account_description: description,
      login: `${identifier}`,
      email: `${identifier}`,
      account_type: process.env.LIGHTWEIGHT
  }
  
  let profileJson = {
      profile: {
      account_description: description,
      login: `${identifier}`,
      email: `${identifier}`,
      account_type: process.env.LIGHTWEIGHT
    }
  }
  
  let stringifiedProfileJson = JSON.stringify(profileJson);

  console.log(`uri: ${process.env.OKTA_TENANT}/api/v1/users?activate=true`)
  
  // uri: `${process.env.OKTA_TENANT}/api/v1/users?activate=true`,
  // uri: `https://lightweight-acct.glitch.me/debug`,

  options = {
    uri: `${process.env.OKTA_TENANT}/api/v1/users?activate=true`,
    method: 'POST',
    json: profileJson,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }   
  
  console.log(`DEMO> Creating lightweight account:`);
  console.log(JSON.stringify(options, undefined, 2));    
  
  try {
    let res = await doRequest(options);
    data.json = JSON.parse(JSON.stringify(res));
    lightweightAccountId = data.json.id;
    console.log(`lightweightAccountId: ${lightweightAccountId}`);
  } catch(err) {
    console.log(err);
  }
  
  // If there is an account owner for this lightweight account,
  // we need to link them
  if (accountOwner && lightweightAccountId) {
   
    // https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul70ug4pY3zKSvD0h7/linkedObjects/account_owner/00ul6gyvk92rhwD5S0h7
    options = {
      uri: `${process.env.OKTA_TENANT}/api/v1/users/${lightweightAccountId}/linkedObjects/account_owner/${accountOwner}`,
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
      }
    }    
    
    console.log(`DEMO> Linking lightweight account to the account owner account:`);
    console.log(JSON.stringify(options, undefined, 2));      

    try {
      let res = await doRequest(options);
      console.log(res.statusCode);
    } catch(err) {
      console.log(err);
    }      
    
  } else {
    currentUserId = lightweightAccountId;
  }
  
  res.sendStatus(200);
  //res.redirect(301,`/users/${currentUserId}`);
  
});

/**
*
* /revoke
*
**/
app.get('/revoke/:userId/:clientId/:tokenId', async function(req, res) {
  
  console.log(`/revoke`);
  
  let userId = req.params.userId;
  let clientId = req.params.clientId;
  let tokenId = req.params.tokenId;
    
  //https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul70ug4pY3zKSvD0h7/clients/0oal1up3zfMqyEUHK0h7/tokens/oarbv8riiG7rIocUT0h6
  let options = {
    uri: `${process.env.OKTA_TENANT}/api/v1/users/${userId}/clients/${clientId}/tokens/${tokenId}`,
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }  
  
  console.log(`DEMO> Revoking token ${tokenId} for user ${userId} for client ${clientId}`);
  console.log(JSON.stringify(options, undefined, 2));  
    
  try {
    let res = await doRequest(options);
    console.log(`Response...`);
    console.log(res.statusCode);
  } catch(err) {
    console.log(err);
  }    
  
  res.redirect(301,`/users/${currentUserId}`);
  
});

/** 
*
* /users
*
**/
app.get("/users", async function(req, res) {
  
  let data = {};
  
  let options = {
    uri: `${process.env.OKTA_TENANT}/api/v1/users`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }
  
  console.log(`DEMO> Get a list of all users in the Okta tenant:`);
  console.log(JSON.stringify(options, undefined, 2));
  
  try {
    let res = await doRequest(options);
    data.users = JSON.parse(res);
  } catch(err) {
    data = err;
  }  
  
  console.log(`DEMO> Get account_owner primary relationship for each user (if any):`);
  console.log(`DEMO> Sample https://sonos-ciam-oie.oktapreview.com/api/v1/users/{{userId}}/linkedObjects/account_owner`);
    
  let usersArray=[];
  
 
  // Loop over each user and check for a primary and subordinate linked objects
  // https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul70ug4pY3zKSvD0h7/linkedObjects/account_owner
  for (let user in data.users) {
    
    let theUser = data.users[user];  
    let userData = {
      userObject: theUser,
      accountOwner: {}
    };
    let accountOwner={}

    options = {
        uri: `${oktaConfig.baseUrl}/api/v1/users/${theUser.id}/linkedObjects/account_owner`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
        }
      }    

      //console.log(`DEMO> Get the primary linked object relationship (account owner) for this user (if any):`);
      //console.log(JSON.stringify(options, undefined, 2)); 
    
      try {
        let res = await doRequest(options);
        accountOwner = JSON.parse(res);
        accountOwner = accountOwner[0];
      } catch(err) {
        data.err = err;
      }     
       
      // follow the _link.self.href link (if there is one) to get the account owner Okta profile
      if (accountOwner) {
        
        console.log(accountOwner._links.self.href);
        
        options = {
          uri: `${accountOwner._links.self.href}`,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
          }
        }    

        console.log(`DEMO> Get the account owner's Okta profile by following _links.self.href`);
        console.log(JSON.stringify(options, undefined, 2)); 
        
        try {
          let res = await doRequest(options);
          userData.accountOwner = JSON.parse(res);
        } catch(err) {
          data.err = err;
        }          
        
      }
      
      usersArray.push(userData); 
    
      console.log(usersArray);
    
    }
  
    data.currentUserId = currentUserId;
    data.usersArray = usersArray
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
  
  // Get all users
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
  
  console.log(`DEMO> Get user ${currentUserId}:`);
  console.log(JSON.stringify(options, undefined, 2));
  
  try {
    let res = await doRequest(options);
    data.json = JSON.parse(res);
  } catch(err) {
    data.err = err;
  }  
     
  // Get linked objects for current user
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
  
  console.log(`DEMO> Get linked objects associated with ${currentUserId}:`);
  console.log(JSON.stringify(options, undefined, 2));
  
  try {
    let res = await doRequest(options);
    data.linkedObjects = JSON.parse(res);
  } catch(err) {
    data.err = err;
  }  
  
  let linkedObjectsArray=[];
  // loop over linked objects...
  
  for (let linked in data.linkedObjects) {
    let linkedObject = data.linkedObjects[linked];
    
    // Follow each linked object's self link to get their Okta profile
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
    
    console.log(`DEMO> Get linked objects profile data from _links.self.href:`);
    console.log(JSON.stringify(options, undefined, 2));    
    
    try {
      let res = await doRequest(options);
      let linkedObjectData = {
        linkedObject: JSON.parse(res),
        tokens: []
      };
      linkedObjectsArray.push(linkedObjectData);
    } catch(err) {
      data.err = err;
    }  
    
    // add each linked object's Okta profile to the linkedObjectsArray to send to the page
    data.linkedObjectsArray = linkedObjectsArray 
  }
  
  // loop over the linked objects array and get any active refresh tokens for each user
  //  https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul7rzstkQ62lnFb0h7/clients/0oal1up3zfMqyEUHK0h7/tokens
  for (let linked in linkedObjectsArray) {
    let linkedObject = linkedObjectsArray[linked];
    
    options = {
      uri: `${oktaConfig.baseUrl}/api/v1/users/${linkedObject.linkedObject.id}/clients/${oktaConfig.clientIdLightweight}/tokens`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
      }
    }    
    
    console.log(`DEMO> Get tokens for user ${linkedObject.linkedObject.id} for client ${oktaConfig.clientIdLightweight}`);
    console.log(JSON.stringify(options, undefined, 2));     
    
    try {
      let res = await doRequest(options);
      linkedObjectsArray[linked].tokens = JSON.parse(res);
    } catch(err) {
      data.err = err;
    }         
   
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
        console.log(res.body);
        reject(error);
      }
    });
  });
}

// And we end with some more generic node stuff -- listening for requests :-)
let listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
