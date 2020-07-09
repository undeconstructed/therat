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

const Line = ({text, state}) => {
  const ref = React.useRef()

  React.useLayoutEffect(x => {
    if (state == 'active') {
      ref.current.scrollIntoView(false, { behavior: 'smooth' })
    }
  }, [state])

  return <div className={'line ' + state } ref={ref}>
    <div className="content">{text}</div>
  </div>
}

const Page = ({title, lines, at}) => {
  function renderLines(lines, at) {
    let out = []
    for (let n in lines) {
      let line = lines[n]
      let l = line.text
      if (n < at) {
        out.push(<Line key={l} text={l} state="done" />)
      } else if (n == at) {
        out.push(<Line key={l} text={l} state="active" />)
      } else {
        out.push(<Line key={l} text={l} state="todo" />)
      }
    }
    return out
  }

  return <React.Fragment>
    <header className="title"><MyTitle text={title} /></header>
    <div className="lines">{renderLines(lines, at)}</div>
  </React.Fragment>
}

const MyTitle = React.memo(({text}) => {
  return <h1>{text}</h1>
})

const TransportControls = React.memo(({back, next}) => {
  return <div className="transport">
    <a onClick={back}>[back]</a>
    <a onClick={next}>[next]</a>
  </div>
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
  const [state, update] = React.useReducer((s, a) => {
    return switchy(a.is, {
      'set': () => {
        if (a.title) {
          s = { ...s, title: a.title }
        }
        if (a.lines) {
          s = { ...s, lines: a.lines }
        }
        if (a.at !== undefined) {
          s = { ...s, at: a.at }
        }
        return s
      },
      [other]: () => ({ ...s })
    })
  }, { title: 'loading', lines: [], at: 0 })

  React.useEffect(() => {
    let stop1 = sync.watch('data/title', () => {
      update({ is: 'set', title: sync.get('data/title') })
    })
    let stop2 = sync.watch('data/lines', () => {
      update({ is: 'set',  lines: sync.get('data/lines') })
    })
    let stop3 = sync.watch('data/at', () => {
      update({ is: 'set', at: sync.get('data/at') })
    })
    return () => { stop1(); stop2(); stop3(); }
  }, [])

  return <div className="app asuser">
    <div className="main">
      <Page title={state.title} lines={state.lines} at={state.at} />
      <StatusLine sync={sync}/>
    </div>
  </div>
}

const AsHostScreen = ({sync}) => {
  const [state, update] = React.useReducer((s, a) => {
    return switchy(a.is, {
      'next': () => {
        let n = Math.min(
          s.at + 1,
          s.lines.length - 1)
        n != s.at && sync.set('at', n)
        return s // { ...s, at: n }
      },
      'back': () => {
        let n = Math.max(
          s.at - 1,
          0)
        n != s.at && sync.set('at', n)
        return s // { ...s, at: n }
      },
      'set': () => {
        if (a.title) {
          s = { ...s, title: a.title }
        }
        if (a.lines) {
          s = { ...s, lines: a.lines }
        }
        if (a.at !== undefined) {
          s = { ...s, at: a.at }
        }
        return s
      },
      [other]: () => ({ ...s })
    })
  }, { title: 'loading', lines: [], at: 0 })

  React.useEffect(() => {
    let stop1 = sync.watch('data/title', () => {
      update({ is: 'set', title: sync.get('data/title') })
    })
    let stop2 = sync.watch('data/lines', () => {
      update({ is: 'set',  lines: sync.get('data/lines') })
    })
    let stop3 = sync.watch('data/at', () => {
      update({ is: 'set', at: sync.get('data/at') })
    })
    return () => { stop1(); stop2(); stop3(); }
  }, [])

  let back = React.useCallback((e) => {
    e.preventDefault()
    update({ is: 'back' })
  }, [])
  let next = React.useCallback((e) => {
    e.preventDefault()
    update({ is: 'next' })
  }, [])

  React.useEffect(() => {
    const f = e => {
      if (e.code == 'Space') {
        e.preventDefault()
        update({ is: 'next' })
      }
    }
    document.addEventListener('keypress', f)
    return () => document.removeEventListener('keypress', f)
  }, [])

  return <div className="app ashost">
    <div className="main">
      <Page title={state.title} lines={state.lines} at={state.at} />
      <TransportControls back={back} next={next} />
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
    let lines = [ ...sync.get('data/lines') ]
    lines.push({ text })
    sync.update('data/lines', lines)
  }
}

// document.addEventListener('DOMContentLoaded', function() {
let app = new App()
app.run()
// })
