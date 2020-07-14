'use strict';

const other = Symbol('default')

function switchy (arg, opts) {
  let o = opts[arg]
  if (!o) {
    o = opts[other]
  }
  if (!o) {
    throw new Error('switchy: unhandled ' + arg)
  }
  if (typeof o === 'function') {
    return o()
  }
  return o
}

function randomNumber(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

var urlParams;
(window.onpopstate = function () {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    urlParams = {};
    while (match = search.exec(query))
       urlParams[decode(match[1])] = decode(match[2]);
})();

const ActionLink = React.memo(({text, callback}) => {
  let onClick = React.useCallback(e => {
    e.preventDefault()
    callback(text)
  }, [text, callback])

  return <a onClick={onClick}>{text}</a>
})

const Line = ({lineKey, line, state, actions}) => {
  const ref = React.useRef()

  React.useLayoutEffect(x => {
    if (state == 'active') {
      ref.current.scrollIntoView(false, { behavior: 'smooth' })
    }
  }, [state])

  let onAction = React.useCallback((a) => {
    alert(`action ${a} on ${lineKey}`)
  }, [lineKey])

  let actionLinks = []
  for (let a of actions) {
    actionLinks.push(<ActionLink key={a} text={a} callback={onAction}></ActionLink>)
  }

  return <div className={'line ' + state} ref={ref}>
    <div className="content">{line.text}</div>
    <div className="actions">{actionLinks}</div>
  </div>
}

const Page = ({lines, order, at, actions}) => {
  actions = actions || []

  function renderLines(lines, order, at, actions) {
    let out = []
    let state = "done"
    for (let ref of order) {
      if (ref == at) {
        state = "active"
      } else if (state == "active") {
        state = "todo"
      }
      let line = lines[ref]
      out.push(<Line key={ref} lineKey={ref} line={line} state={state} actions={actions} />)
    }
    return out
  }

  return <div className="lines">{renderLines(lines, order, at, actions)}</div>
}

const MyTitle = React.memo(({text}) => {
  return <h1>{text}</h1>
})

function getUsers(sync) {
  let raw = sync.get('users') || []
  let list = [...raw].sort((a, b) => a.name > b.name)
  return list
}

const UsersList = ({sync}) => {
  const [list, setList] = React.useState(() => getUsers(sync))

  React.useEffect(() => {
    let stop = sync.watch('users', () => {
      setList(getUsers(sync))
    })
    return stop
  }, [])

  return <aside className="userslist">
    <header>users</header>
    <div>
      <ul>
        {list.map(e => <li key={e.id}>{e.id} ({e.online ? "online" : "offline"})</li>)}
      </ul>
    </div>
  </aside>
}

const StatusDisplay = ({sync}) => {
  const [online, setOnline] = React.useState(sync.isOnline())

  React.useEffect(() => {
    let stop = sync.watch('online', () => {
      setOnline(sync.online)
    })
    return stop
  }, [])

  return <aside className="status">
    <header>status</header>
    <div>{online ? "online" : "offline"}</div>
  </aside>
}

const StatusLine = ({sync}) => {
  const [online, setOnline] = React.useState(sync.isOnline())

  React.useEffect(() => {
    let stop = sync.watch('online', () => {
      setOnline(sync.online)
    })
    return stop
  }, [])

  return <aside className="statusline">
    <div>{online ? "online" : "offline"}</div>
  </aside>
}

const PreAppScreen = ({text}) => {
  return <h1>... {text} ...</h1>
}

const AsUserScreen = ({sync}) => {
  const [state, update] = React.useReducer(
    (s, a) => ({ ...s, ...a }),
    { title: 'loading', lines: {}, order: [], at: '' })

  React.useEffect(() => {
    return sync.multiwatch({
      'data/title': () => update({ title: sync.get('data/title') }),
      'data/lines': () => update({ lines: sync.get('data/lines') }),
      'data/order': () => update({ order: sync.get('data/order') }),
      'data/at': () => update({ at: sync.get('data/at') })
    })
  }, [])

  let actions = [ '?', '✓' ]

  return <div className="app asuser">
    <div className="main">
      <header className="title"><MyTitle text={state.title} /></header>
      <Page lines={state.lines} order={state.order} at={state.at} actions={actions} />
      <StatusLine sync={sync}/>
    </div>
  </div>
}

const TransportControls = React.memo(({back, next}) => {
  return <div className="transport">
    <a onClick={back ? back : undefined} className={!back ? 'disabled' : undefined}>[back]</a>
    <a onClick={next ? next : undefined} className={!next ? 'disabled' : undefined}>[next]</a>
  </div>
})

const AsHostScreen = ({sync}) => {
  const [state, signal] = React.useReducer((s, a) => {
    return switchy(a.is, {
      'move': () => {
        sync.set('data/at', a.at)
        return s // { ...s, at: n }
      },
      'next': () => {
        let n = s.order[s.order.indexOf(s.at)+1]
        n && sync.set('data/at', n)
        return s
      },
      'set': () => ({ ...s, ...a }),
      [other]: () => ({ ...s })
    })
  }, { title: 'loading', lines: {}, order: [], at: 0 })

  React.useEffect(() => {
    return sync.multiwatch({
      'data/title': () => signal({ is: 'set', title: sync.get('data/title') }),
      'data/lines': () => signal({ is: 'set', lines: sync.get('data/lines') }),
      'data/order': () => signal({ is: 'set', order: sync.get('data/order') }),
      'data/at': () => signal({ is: 'set', at: sync.get('data/at') })
    })
  }, [])

  let backAt = state.order[state.order.indexOf(state.at)-1]
  let nextAt = state.order[state.order.indexOf(state.at)+1]

  let back = React.useCallback((e) => {
    e.preventDefault()
    signal({ is: 'move', at: backAt })
  }, [backAt])
  let next = React.useCallback((e) => {
    e.preventDefault()
    signal({ is: 'move', at: nextAt })
  }, [nextAt])

  React.useEffect(() => {
    const f = e => {
      if (e.code == 'Space') {
        e.preventDefault()
        signal({ is: 'next' })
      }
    }
    document.addEventListener('keypress', f)
    return () => document.removeEventListener('keypress', f)
  }, [next])

  let actions = [ '!', '+' ]

  return <div className="app ashost">
    <div className="main">
      <header className="title"><MyTitle text={state.title} /></header>
      <Page lines={state.lines} order={state.order} at={state.at} actions={actions} />
      <TransportControls back={backAt && back} next={nextAt && next} />
    </div>
    <div className="side">
      <UsersList sync={sync}/>
      <StatusDisplay sync={sync}/>
    </div>
  </div>
}

class Sync {
  constructor(loginResponse) {
    this.token = loginResponse.token
    this.host = loginResponse.host
    this.online = false

    this.version = 0
    this.users = []
    this.data = {}

    this.watchers = []
  }
  start(dataResponse) {
    this.version = dataResponse.version
    this.users = dataResponse.users
    this.data = dataResponse.data

    this._notify('users')
    for (let k in this.data) {
      this._notify(`data/${k}`)
    }

    let url = `ws://${document.location.host}/s/sync?token=${this.token}&from=${this.version}`
    let ws = new WebSocket(url)
    ws.onopen = (evt) => {
      this.online = true
      this._notify('online')
    }
    ws.onclose = (evt) => {
      this.online = false
      this._notify('online')
      this.ws = null
    }
    ws.onmessage = (evt) => {
      let m = JSON.parse(evt.data)
      switchy(m.type, {
        's': () => {
          alert('message: ' + m.message)
        },
        'u': () => {
          this._update(m.version, m.path, m.data)
        },
        [other]: () => {
          console.log('message? ' + m)
        }
      })
    }
    ws.onerror = (evt) => {
      console.log('sync error: ' + evt.data)
    }
    this.ws = ws
  }
  _update(version, path, value) {
    console.log('update arrived', version, path)
    this.version = version
    if (path == 'users') {
      this.users = value
    } else if (path.startsWith('data/')) {
      let dpath = path.substring(5)
      // XXX - actually follow path
      this.data[dpath] = value
    }
    this._notify(path)
  }
  isOnline() {
    return this.online
  }
  isHost() {
    return this.host
  }
  get(path) {
    if (path == 'users') {
      return this.users
    } else if (path.startsWith('data/')) {
      let dpath = path.substring(5)
      return this.data[dpath]
    }
    return null
  }
  set(path, value) {
    let data = JSON.stringify({
      type: 'u',
      path: path,
      value: value
    })
    this.ws.send(data)
  }
  watch(path, callback) {
    this.watchers.push({ path, callback })
    return () => this.unwatch(path, callback)
  }
  multiwatch(watches) {
    let stops = []
    for (let p in watches) {
      this.watch(p, watches[p])
    }
    return () => stops.forEach(e => e())
  }
  unwatch(path, callback) {
    let n = this.watchers.find(e => e.path == path && e.callback == callback)
    if (n >= 0) {
      this.watchers.splice(n, n)
    }
  }
  _notify(path) {
    setTimeout(() => {
      // console.log('notify?', path)
      for (let watcher of this.watchers) {
        if (path.startsWith(watcher.path)) {
          // console.log('yes!', watcher.path)
          try {
            watcher.callback(path)
          } catch (e) {
            console.log('notify error!', e)
          }
        } else {
          // console.log('no!', watcher.path)
        }
      }
    }, 0)
  }
}

class App {
  constructor() {
    this.auth = urlParams.auth
    this.token = null
    this.sync = null
  }

  run() {
    ReactDOM.render(React.createElement(PreAppScreen, { text: 'logging in' }), document.querySelector('#app'))

    fetch('/s/login?auth=' + this.auth)
      .then(response => response.json())
      .then(r => this._onLogin(r))
  }

  _onLogin(loginResponse) {
    ReactDOM.render(React.createElement(PreAppScreen, { text: 'fetching data' }), document.querySelector('#app'))

    this.token = loginResponse.token
    this.sync = new Sync(loginResponse)

    fetch('/s/data?token=' + this.token)
      .then(response => response.json())
      .then(r => this._onData(r))
  }

  _onData(dataResponse) {
    if (this.sync.isHost()) {
      ReactDOM.render(React.createElement(AsHostScreen, { sync: this.sync }), document.querySelector('#app'))
    } else {
      ReactDOM.render(React.createElement(AsUserScreen, { sync: this.sync }), document.querySelector('#app'))
    }
    this.sync.start(dataResponse)
  }

  addLine(text) {
    let lines = [ ...this.sync.get('data/lines') ]
    lines.push({ text })
    this.sync.set('data/lines', lines)
  }
}

// document.addEventListener('DOMContentLoaded', function() {
let app = new App()
app.run()
// })
