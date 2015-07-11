var express = require('express')
var auth = require('http-auth')
var redis = require('redis')
var url = require('url')
var bodyParser = require('body-parser')
var crypto = require('crypto')
var GitHubApi = require('github')
var github = new GitHubApi({
  version: '3.0.0'
})
var config = require('nconf').env().file({
  file: 'config.json'
})
var app = express()
var basicAuth = auth.basic({
  realm: 'Autocomment.'
}, function (username, password, callback) {
  var usernameMatch = config.get('ADMIN_USERNAME') === username
  var passwordMatch = config.get('ADMIN_PASSWORD') === password
  callback(usernameMatch && passwordMatch)
})
var redisUrl = url.parse(config.get('REDIS_URL'))
var redisClient = redis.createClient(redisUrl.port, redisUrl.hostname)

if (redisUrl.auth) {
  redisClient.auth(redisUrl.auth.split(':')[1])
}

github.authenticate({
  type: 'oauth',
  token: config.get('GITHUB_AUTH_TOKEN')
})

app.engine('jade', require('jade').__express)
app.set('view engine', 'jade')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({
  extended: true
}))

app.get('/', auth.connect(basicAuth), ensureHook, function (req, res) {
  redisClient.get('template', function (err, template) {
    if (err) {
      throw err
    }
    res.render('index', {
      template: template
    })
  })
})

app.post('/template', auth.connect(basicAuth), function (req, res, next) {
  redisClient.set('template', req.body.template || '', function (err) {
    if (err) {
      console.error(err)
    }
    res.render('index', {
      template: req.body.template,
      templateSaved: true
    })
  })
})

app.post('/hooks', function (req, res, next) {
  var signature = req.get('X-Hub-Signature')
  var secret = config.get('GITHUB_SECRET')
  var hmac = crypto.createHmac('sha1', secret).update(JSON.stringify(req.body))
  var digest = hmac.digest('hex')
  console.log(digest === signature, digest, signature)
})

app.listen(config.get('PORT'))

function ensureHook (req, res, next) {
  redisClient.get('github_hook_id', function (err, value) {
    if (err) {
      return console.error(err)
    }
    if (value) {
      return next()
    }
    var hookUrl = url.format({
      protocol: req.protocol,
      hostname: req.hostname,
      port: config.get('PORT'),
      pathname: 'hooks'
    })
    setupHook(hookUrl)
  })

  function setupHook (hookUrl) {
    github.repos.createHook({
      user: config.get('GITHUB_USERNAME'),
      repo: config.get('GITHUB_REPO'),
      name: 'web',
      config: {
        url: hookUrl,
        content_type: 'json',
        secret: config.get('GITHUB_SECRET')
      },
      events: ['issues']
    }, storeHookId)
  }

  function storeHookId (err, hook) {
    if (err) {
      console.error(err)
      return next()
    }
    redisClient.set('github_hook_id', hook.id, function (err) {
      if (err) {
        console.error(err)
      }
      next()
    })
  }
}

