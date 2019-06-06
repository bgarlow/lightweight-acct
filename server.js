// Generic node.js express init:
const express = require('express');
const app = express();
const router = express.Router();
const request = require('request');
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser')
const http = require('http').Server(app);
const querystring = require('querystring');
const jws = require('jws');

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieParser());

const hbs = require('hbs');

hbs.registerPartials(__dirname + '/views/partials');

app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

hbs.registerHelper('json', function(context) {
    return JSON.stringify(context, undefined, 2);
});

hbs.registerHelper( "when",function(operand_1, operator, operand_2, options) {
  var operators = {
   'eq': function(l,r) { return l == r; },
   'noteq': function(l,r) { return l != r; },
   'gt': function(l,r) { return Number(l) > Number(r); },
   'or': function(l,r) { return l || r; },
   'and': function(l,r) { return l && r; },
   '%': function(l,r) { return (l % r) === 0; }
  }
  , result = operators[operator](operand_1,operand_2);

  if (result) return options.fn(this);
  else  return options.inverse(this);
});

// Okta OAuth Config
const oktaConfig = {
  baseUrl: `${process.env.OKTA_TENANT}`,
  clientIdLightweight: process.env.CLIENT_ID_LIGHTWEIGHT,
  clientSecretLightweight: process.env.CLIENT_SECRET_LIGHTWEIGHT,
  clientIdFull: process.env.CLIENT_ID_FULL,
  clientSecretFull: process.env.CLIENT_SECRET_FULL,
  redirectUriLightweight: `${process.env.REDIRECT_URI_LIGHTWEIGHT}`,
  redirectUriFull: `${process.env.REDIRECT_URI_FULL}`,
  authServerId: `${process.env.AUTH_SERVER_ID}`,
  scopeLightweight: `${process.env.SCOPE_LIGHTWEIGHT}`,
  scopeFull: `${process.env.SCOPE_FULL}`,
  linkedObjectSub: `${process.env.LINKED_OBJECT_SUB}`,
  logoutUri: `${process.env.OKTA_TENANT}/api/v1/sessions/me`
}

const fullClientIDCookie = `${oktaConfig.clientIdFull}_ID`;
const lightweightClientIDCookie = `${oktaConfig.clientIdLightweight}_ID`;

const fullClientAccessCookie = `${oktaConfig.clientIdFull}_AT`;
const lightweightClientAccessCookie = `${oktaConfig.clientIdLightweight}_AT`;

const fullClientRefreshCookie = `${oktaConfig.clientIdFull}_RT`;
const lightweightClientRefreshCookie = `${oktaConfig.clientIdLightweight}_RT`;

// TODO: generate real values
let state = "rando";
let nonce = "morerando";

const lightweightClientAuthorizeUrl = `${oktaConfig.baseUrl}/oauth2/${oktaConfig.authServerId}/v1/authorize?client_id=${oktaConfig.clientIdLightweight}&response_type=code&scope=${oktaConfig.scopeLightweight} openid profile offline_access&redirect_uri=${oktaConfig.redirectUriLightweight}&state=${state}&nonce=${nonce}`;
const fullClientAuthorizeUrl = `${oktaConfig.baseUrl}/oauth2/${oktaConfig.authServerId}/v1/authorize?client_id=${oktaConfig.clientIdFull}&response_type=code&scope=${oktaConfig.scopeFull} openid profile offline_access&redirect_uri=${oktaConfig.redirectUriFull}&state=${state}&nonce=${nonce}`;

let currentUserId;

/**
*
* /home
*
**/
app.get("/", async function(req, res) {
  let data = {};
  
  data.tokensExist = tokensExist(req);
  data.logoutUri = oktaConfig.logoutUri;
  
  res.render('index', data);
});

/**
*
* /profile
*
**/
app.get("/profile", async function(req, res) {
  
  let data = {};
  data.tokens = getTokensFromStorage(req, res);
  
  // POST to /userinfo
  let options = {
    uri: `${oktaConfig.baseUrl}/oauth2/${oktaConfig.authServerId}/v1/userinfo`,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `Bearer ${data.tokens.access}`
    }
  }
  
  console.log(`DEMO> Get /userinfo for the currently logged in user:`);
  console.log(JSON.stringify(options, undefined, 2));
  
  try {
    let res = await doRequest(options);
    data.user = JSON.parse(res);
  } catch(err) {
    data.err = err;
  }  
  
  data.tokensExist = tokensExist(req);
  data.logoutUri = oktaConfig.logoutUri;
  res.render('landing', data);
})


app.post('/debug', (req, res) => {
  console.log(req);
});

/**
*
* /users (create and update)
*
**/
app.post('/users', async function(req, res) {
  
  let accountType = req.body.accountType; // this will be undefined if we aren't creating a linked account
  let userId = req.body.userId;  // this will be undefined if we're creating a new account
  let profileJson = {};
  let options;
  let data = {};
  let newAccountId;
  let accountOwner;
  
  
  if (accountType === process.env.LIGHTWEIGHT) {

    accountOwner = req.body.accountOwner;     
    let fakeDomain;
    let accountOwnerLogin
    let description = req.body.accountDescription;

    if (accountOwner) {
      accountOwnerLogin = req.body.accountOwnerLogin;
      fakeDomain = accountOwnerLogin.substring(0, accountOwnerLogin.indexOf('@'));
    } else {
      fakeDomain = "sonoslightweight"
    }

    let pin = Math.floor(100000 + Math.random() * 900000);
    let identifier = `${pin}@${fakeDomain}.com`;
    // https://sonos-ciam-oie.oktapreview.com/api/v1/users?activate=true
    /*
      "profile": {
        "account_description": "Barry",
        "login": "lightweight@81654aab-d06d-4ea0-91f1-97dc66337c0a.com",
        "email": "lightweight@86568689-c060-45e6-b30e-a2c16fd3255c.com",
        "account_type": "lightweight"
      }  
    */ 
    profileJson = {
        profile: {
        account_description: description,
        login: `${identifier}`,
        email: `${identifier}`,
        account_type: process.env.LIGHTWEIGHT
      }
    }  
  } else {

   /*
    "profile": {
    	"account_type": "full",
        "login": "Barry@mailinator.com",
        "email": "Barry@mailinator.com",
        "firstName": "Barry",
        "lastName": "Dillon",
        "mobilePhone": "555-415-1337",
        "streetAddress": "742 Evergreen Terrace",
        "city": "Springfield",
        "state": "OR",
        "zipCode": "97403"
    } 
    */ 
    
    profileJson = {
      profile: {
        account_type: process.env.FULL,
        login: req.body.login,
        email: req.body.login,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        mobilePhone: req.body.mobilePhone,
        account_description: req.body.accountDescription
      }
    }
  }
  
  let apiEndpoint;
  
  if (userId) {
    apiEndpoint = `${process.env.OKTA_TENANT}/api/v1/users/${userId}`
  } else {
    apiEndpoint = `${process.env.OKTA_TENANT}/api/v1/users?activate=true`
  }
  
  
  options = {
    uri: apiEndpoint,
    method: 'POST',
    json: profileJson,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Authorization': `SSWS ${process.env.OKTA_API_KEY}`
    }
  }   
  
  console.log(`DEMO> Creating account:`);
  console.log(JSON.stringify(options, undefined, 2));    
  
  try {
    let res = await doRequest(options);
    data.json = JSON.parse(JSON.stringify(res));
    newAccountId = data.json.id;
    console.log(`newAccountId: ${newAccountId}`);         
  } catch(err) {
    console.log(err);
  }
  
  // If there is an account owner for this lightweight account,
  // we need to link them
  if (accountOwner && newAccountId) {
   
    // https://sonos-ciam-oie.oktapreview.com/api/v1/users/00ul70ug4pY3zKSvD0h7/linkedObjects/account_owner/00ul6gyvk92rhwD5S0h7
    options = {
      uri: `${process.env.OKTA_TENANT}/api/v1/users/${newAccountId}/linkedObjects/account_owner/${accountOwner}`,
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
    currentUserId = newAccountId;
  }
  
  res.redirect(301,`/users/${currentUserId}`);
  
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
    uri: `${process.env.OKTA_TENANT}/api/v1/users?search=profile.account_type eq "full" or profile.account_type eq "lightweight"`,
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
    }
  
    data.currentUserId = currentUserId;
    data.usersArray = usersArray
    data.tokensExist = tokensExist(req);
    data.logoutUri = oktaConfig.logoutUri;
  
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
  
  // Get user by ID
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

  data.authorizeUrl = {};
  data.authorizeUrl.lightweight = lightweightClientAuthorizeUrl
  data.authorizeUrl.full = fullClientAuthorizeUrl
    
  data.tokensExist = tokensExist(req);
  data.logoutUri = oktaConfig.logoutUri;
  
  res.render('userdetails', data);
  
});

/**
*
* /fullacct
*
**/
app.get('/fullacct', (req, res) => {
  let data = {};
  
  data.tokensExist = tokensExist(req);
  data.logoutUri = oktaConfig.logoutUri;
  
  res.render('fullacct', data);
});

/**
*
* /lightweightacct
*
**/
app.get('/lightweightacct', (req, res) => {
  let data = {};
  
  data.tokensExist = tokensExist(req);
  data.logoutUri = oktaConfig.logoutUri;
  
  res.render('lightweightacct', data);
});


// OAuth 2.0


/**
*
* /authorization-code/callback
* Note: this is a very stripped down version...don't use this in a production system
* Note: there are 2 version here because we are dealing with 2 oauth clients and I'm lazy
*
*/
app.get('/authorization-code/lightweight', async function(req, res) {
  
  console.log('DEMO> GET /authorization-code/lightweight');
  
  let data = {};
  let nonce;
  let state;

  if (!req.query == {}) {
    res.redirect(`/home?error=Unknown error in redirect from authorization server. Check Okta system log.`);
    return;
  }

  if (req.query.error) {
    res.redirect(`/home?error=${req.query.error}&error_description=${req.query.error_description}`);
    return;
  }

  if (!req.query.code) {
    res.status(401).location('/home').end(); //send('Required query parameter "code" is missing.').end;
    return;
  }

  const query = querystring.stringify({
    grant_type: 'authorization_code',
    code: req.query.code,
    redirect_uri: oktaConfig.redirectUriLightweight,
    scope: `openId profile offline_access ${oktaConfig.scopeLightweight}`
    });

  const secret = new Buffer(`${oktaConfig.clientIdLightweight}:${oktaConfig.clientSecretLightweight}`, 'utf8').toString('base64');
  const options = {
    url: `${oktaConfig.baseUrl}/oauth2/${oktaConfig.authServerId}/v1/token?${query}`,
    method: 'POST',
    headers: {
        Authorization: `Basic ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    json: true
  }

  console.log('DEMO> GET /authorization-code/callback token endpoint request options:');
  console.log(options);

  // Request token(s)
  request(options, (err, tokenRes, json) => {
    if (err) {
      res.status(500).send(err);
      return;
    }
    if (json.error) {
      res.status(401).send(`${json.error}: ${json.error_description}`);
      return;
    }

    const decodedIdToken = jws.decode(json.id_token);

    if (!decodedIdToken) {
      res.status(401).send('id_token could not be decoded from response.');
      return;
    }

    res.cookie(`${oktaConfig.clientIdLightweight}_ID`, json.id_token, false);
    res.cookie(`${oktaConfig.clientIdLightweight}_AT`, json.access_token, false);
    
    if (json.refresh_token) {
      res.cookie(`${oktaConfig.clientIdLightweight}_RT`, json.refresh_token, false);
    }
    
    const decodedAccessToken = jws.decode(json.access_token);  

    data.tokens = {};
    data.tokens.id = json.id_token;
    data.tokens.access = json.access_token;
    data.tokens.refresh = json.refresh_token;
    data.tokens.decoded_id = decodedIdToken;
    data.tokens.decoded_access = decodedAccessToken;
    data.tokensExist = true;
    data.logoutUri = oktaConfig.logoutUri;    

    console.log('DEMO> Tokens received and validated');
    res.render('landing', data);

  });
});

/**
*
* authorization code handler for full account client
*
**/
app.get('/authorization-code/full', async function(req, res) {
  
  console.log('DEMO> GET /authorization-code/full');

  let data = {};
  let nonce;
  let state;

  if (!req.query == {}) {
    res.redirect(`/home?error=Unknown error in redirect from authorization server. Check Okta system log.`);
    return;
  }

  if (req.query.error) {
    res.redirect(`/home?error=${req.query.error}&error_description=${req.query.error_description}`);
    return;
  }

  if (!req.query.code) {
    res.status(401).location('/home').end(); //send('Required query parameter "code" is missing.').end;
    return;
  }

  const query = querystring.stringify({
    grant_type: 'authorization_code',
    code: req.query.code,
    redirect_uri: oktaConfig.redirectUriFull,
    scope: `openId profile offline_access ${oktaConfig.scopeFull}`
    });

  const secret = new Buffer(`${oktaConfig.clientIdFull}:${oktaConfig.clientSecretFull}`, 'utf8').toString('base64');
  const options = {
    url: `${oktaConfig.baseUrl}/oauth2/${oktaConfig.authServerId}/v1/token?${query}`,
    method: 'POST',
    headers: {
        Authorization: `Basic ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    json: true
  }

  console.log('DEMO> GET /authorization-code/full token endpoint request options:');
  console.log(options);

  // Request token(s)
  request(options, (err, tokenRes, json) => {
    if (err) {
      res.status(500).send(err);
      return;
    }
    if (json.error) {
      res.status(401).send(`${json.error}: ${json.error_description}`);
      return;
    }
    
    const decodedIdToken = jws.decode(json.id_token);
        
    if (!decodedIdToken) {
      res.status(401).send('id_token could not be decoded from response.');
      return;
    }

    res.cookie(`${oktaConfig.clientIdFull}_ID`, json.id_token, false);
    res.cookie(`${oktaConfig.clientIdFull}_AT`, json.access_token, false);
    if (json.refresh_token) {
      res.cookie(`${oktaConfig.clientIdFull}_RT`, json.refresh_token, false);
    }
    
    const decodedAccessToken = jws.decode(json.access_token);

    data.tokens = {};
    data.tokens.id = json.id_token;
    data.tokens.access = json.access_token;
    data.tokens.refresh = json.refresh_token;
    data.tokens.decoded_id = decodedIdToken;
    data.tokens.decoded_access = decodedAccessToken;
    data.tokensExist = true;
    data.logoutUri = oktaConfig.logoutUri;    
    
    console.log('DEMO> Tokens received and validated');
    res.render('landing', data);

  });
});


/**
*
* /tokensExist
* 
**/
app.get('/tokensexist', (req, res) => {
  
  let tokensExist = (req.cookies[fullClientIDCookie] || req.cookies[lightweightClientIDCookie]) ? true : false;
    
  res.json({tokens: tokensExist});
});

app.get('/logout', async function(req, res) {
  
  let data = {};
  
  let lightweightRefreshToken = req.cookies['lighweightClientRefreshCookie'];
  let fullRefreshToken = req.cookies['fullClientRefreshToken'];
  
  // ${baseUrl}/api/v1/authorizationServers/${authServerId}/clients/${clientId}/tokens
  let secret;
  let options;
  
  // revoke full client refresh token
  //secret = new Buffer(`${oktaConfig.clientIdLightweight}:${oktaConfig.clientSecretLightweight}`, 'utf8').toString('base64');
  options = {
    url: `${oktaConfig.baseUrl}/api/v1/authorizationServers/${oktaConfig.authServerId}/clients/${oktaConfig.clientIdLightweight}/tokens`,
    method: 'DELETE',
    headers: {
        Authorization: `SSWS ${process.env.OKTA_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  console.log(`DEMO> Revoking all tokens for ${oktaConfig.clientIdLightweight}`);
  console.log(options);

  try {
    let res = await doRequest(options);
    console.log(res.statusCode);
  } catch(err) {
    data.err = err;
  }    
  
  // revoke lightweight client refresh token
  //secret = new Buffer(`${oktaConfig.clientIdFull}:${oktaConfig.clientSecretFull}`, 'utf8').toString('base64');
  options = {
    url: `${oktaConfig.baseUrl}/api/v1/authorizationServers/${oktaConfig.authServerId}/clients/${oktaConfig.clientIdFull}/tokens`,
    method: 'DELETE',
    headers: {
        Authorization: `SSWS ${process.env.OKTA_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  console.log(`DEMO> Revoking all tokens for ${oktaConfig.clientIdFull}`);
  console.log(options);

  try {
    let res = await doRequest(options);
    console.log(res.statusCode);
  } catch(err) {
    data.err = err;
  }   
  
  res.clearCookie(lightweightClientIDCookie);
  res.clearCookie(lightweightClientAccessCookie);
  res.clearCookie(lightweightClientRefreshCookie);
    
  res.clearCookie(fullClientIDCookie);
  res.clearCookie(fullClientAccessCookie);
  res.clearCookie(fullClientRefreshCookie);

  data.tokensExist = false;
  data.logoutUri = oktaConfig.logoutUri;    
   
  res.render('index', data);
});

// Utilities

function getTokensFromStorage(req, res) {
  
  let data = {};
  
  let idToken = (req.cookies[fullClientIDCookie]) ? req.cookies[fullClientIDCookie] : req.cookies[lightweightClientIDCookie];
  let accessToken = (req.cookies[fullClientAccessCookie]) ? req.cookies[fullClientAccessCookie] : req.cookies[lightweightClientAccessCookie];
  let refreshToken = (req.cookies[fullClientRefreshCookie]) ? req.cookies[fullClientRefreshCookie] : req.cookies[lightweightClientRefreshCookie];
  
  data.tokens = {};
  data.tokens.id = idToken;
  data.tokens.access = accessToken;
  data.tokens.refresh = refreshToken;
  
  
  data.tokens.decoded_id = jws.decode(idToken);;
  data.tokens.decoded_access = jws.decode(accessToken);
  
  return data.tokens;
}

function tokensExist(req) {  
  return (req.cookies[fullClientIDCookie] || req.cookies[lightweightClientIDCookie]) ? true : false;
}

/**
*
* doRequest: handle http requests from our client to Okta
*
**/
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
