const history = require('sheet-router/history')
const sheetRouter = require('sheet-router')
const document = require('global/document')
const href = require('sheet-router/href')
const hash = require('sheet-router/hash')
const hashMatch = require('hash-match')
const barracks = require('barracks')
const assert = require('assert')
const xtend = require('xtend')
const yo = require('yo-yo')

module.exports = choo

// framework for creating sturdy web applications
// null -> fn
function choo (opts) {
  opts = opts || {}

  const _store = start._store = barracks(xtend(opts, { onState: render }))
  start._router = null
  var _defaultRoute = null
  var _rootNode = null
  var _routes = null

  start.toString = toString
  start.router = router
  start.model = model
  start.start = start

  return start

  // render the application to a string
  // (str, obj) -> str
  function toString (route, serverState) {
    serverState = serverState || {}
    assert.equal(typeof route, 'string', 'choo.app.toString: route must be a string')
    assert.equal(typeof serverState, 'object', 'choo.app.toString: serverState must be an object')
    _store.start({ noSubscriptions: true, noReducers: true, noEffects: true })
    const state = _store.state({ state: serverState })
    const router = createRouter(_defaultRoute, _routes)
    const tree = router(route, state, function () {
      assert.fail('choo: send() cannot be called from Node')
    })
    return tree.toString()
  }

  // start the application
  // (str?, obj?) -> DOMNode
  function start (selector, startOpts) {
    if (!startOpts && typeof selector !== 'string') {
      startOpts = selector
      selector = null
    }
    startOpts = startOpts || {}

    _store.model(appInit(startOpts))
    const createSend = _store.start(startOpts)
    const router = createRouter(_defaultRoute, _routes, createSend)
    const state = _store.state()

    if (!selector) {
      const tree = router(state.app.location, state, null)
      _rootNode = tree
      return tree
    } else {
      document.addEventListener('DOMContentLoaded', function (event) {
        const oldTree = document.querySelector(selector)
        assert.ok(oldTree, 'could not query selector: ' + selector)
        const newTree = router(state.app.location, state, null)
        _rootNode = yo.update(oldTree, newTree)
      })
    }
  }

  // update the DOM after every state mutation
  // (obj, obj, obj, str, fn) -> null
  function render (action, state, prev, name, createSend) {
    if (opts.onState) opts.onState(action, state, prev, name, createSend)
    if (state === prev) return

    // note(yw): only here till sheet-router supports custom constructors
    const newTree = router(state.app.location, state, prev)
    _rootNode = yo.update(_rootNode, newTree)
  }

  // register all routes on the router
  // (str?, [fn|[fn]]) -> obj
  function router (defaultRoute, routes) {
    _defaultRoute = defaultRoute
    _routes = routes
  }

  // create a new model
  // (str?, obj) -> null
  function model (model) {
    _store.model(model)
  }

  // create a new router with a custom `createRoute()` function
  // (str?, obj, fn?) -> null
  function createRouter (defaultRoute, routes, createSend) {
    start._router = sheetRouter(defaultRoute, routes, createRoute)
    var prev = {}

    function createRoute (routeFn) {
      return function (route, inline, child) {
        if (!child) inline = wrap(inline, route)
        else child = wrap(child, route)
        return routeFn(route, inline, child)
      }

      function wrap (child, route) {
        const send = createSend(route)
        return function wrap (params, state) {
          const nwPrev = prev
          const nwState = prev = xtend(state, { params: params })
          if (!opts.noFreeze) Object.freeze(nwState)
          return child(nwState, nwPrev, send)
        }
      }
    }
  }
}

// initial application state model
// obj -> obj
function appInit (opts) {
  const loc = document.location
  const state = { pathname: (opts.hash) ? hashMatch(loc.hash) : loc.href }
  const reducers = {
    setLocation: function setLocation (action, state) {
      return { pathname: action.pathname.replace(/#.*/, '') }
    }
  }
  // if hash routing explicitly enabled, subscribe to it
  const subs = {}
  if (opts.hash === true) {
    pushLocationSub(function (navigate) {
      hash(function (fragment) {
        navigate(hashMatch(fragment))
      })
    }, 'handleHash', subs)
  } else {
    if (opts.history !== false) pushLocationSub(history, 'handleHistory', subs)
    if (opts.href !== false) pushLocationSub(href, 'handleHref', subs)
  }

  return {
    namespace: 'location',
    subscriptions: subs,
    reducers: reducers,
    state: state
  }

  // create a new subscription that modifies
  // 'app:location' and push it to be loaded
  // (fn, obj) -> null
  function pushLocationSub (cb, key, model) {
    model[key] = function (send) {
      cb(function navigate (href) {
        send('location:setLocation', { location: href })
      })
    }
  }
}
