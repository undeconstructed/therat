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

function getPeople(sync) {
  let raw = sync.get('people') || []
  let list = [...raw].sort((a, b) => a.name > b.name)
  return list
}

const PeopleList = ({sync}) => {
  const [list, setList] = React.useState(() => getPeople(sync))

  const onChange = React.useCallback(() => {
    console.log('people update')
    setList(getPeople(sync))
  }, [])

  React.useEffect(() => {
    let stop = sync.watch('people', onChange)
    return stop
  }, [])

  return <aside className="peoplelist">
    <header>people</header>
    <div>
      <ul>
        {list.map(e => <li key={e.id}>{e.id} ({e.online ? "online" : "offline"})</li>)}
      </ul>
    </div>
  </aside>
}

const StatusDisplay = ({sync}) => {
  const [online, setOnline] = React.useState(sync.isOnline())

  const onChange = React.useCallback((type) => {
    console.log('status update')
    setOnline(sync.online)
  }, [])

  React.useEffect(() => {
    let stop = sync.watch('online', onChange)
    return stop
  }, [])

  return <aside className="status">
    <header>status</header>
    <div>{online ? "online" : "offline"}</div>
  </aside>
}

const AppCo = ({sync, data, people}) => {
  const [state, update] = React.useReducer((s, a) => {
    return switchy(a.is, {
      'next': () => {
        let n = Math.min(
          s.at + 1,
          data.length() - 1)
        return { ...s, at: n }
      },
      'back': () => {
        let n = Math.max(
          s.at - 1,
          0)
        return { ...s, at: n }
      },
      'set': () => {
        if (a.title) {
          s = { ...s, title: a.title }
        }
        if (a.lines) {
          s = { ...s, lines: a.lines }
        }
        return s
      },
      [other]: () => ({ ...s })
    })
  }, { title: 'loading', lines: [], at: 0 })

  const onChangeTitle = React.useCallback(() => {
    update({ is: 'set', title: sync.get('title') })
  }, [])
  const onChangeLines = React.useCallback(() => {
    update({ is: 'set',  lines: sync.get('lines') })
  }, [])

  React.useEffect(() => {
    let stop1 = sync.watch('title', onChangeTitle)
    let stop2 = sync.watch('lines', onChangeLines)
    return () => { stop1(); stop2() }
  }, [])

  const back = React.useCallback((e) => {
    e.preventDefault()
    update({ is: 'back' })
  }, [])
  const next = React.useCallback((e) => {
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

  return <div className="app">
    <div className="main">
      <Page title={sync.get('title')} lines={sync.get('lines')} at={state.at} />
      <TransportControls back={back} next={next} />
    </div>
    <div className="side">
      <PeopleList sync={sync}/>
      <StatusDisplay sync={sync}/>
    </div>
  </div>
}

class Sync {
  constructor() {
    this.watchers = []
    this.online = false
    this.data = {}
  }
  start(token, data) {
    this.data = data

    for (let k in data) {
      this._notify(k)
    }

    let url = 'ws://' + document.location.host + '/s/sync?token=' + token
    let ws = new WebSocket(url)
    ws.onopen = (evt) => {
      this.online = true
      this._notify('online')
    }
    ws.onclose = (evt) => {
      console.log('CLOSE')
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
          console.log('update: ' + m.path)
          // XXX
          this.data[m.path] = m.data
          this._notify(m.path)
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
  isOnline() {
    return this.online
  }
  get(path) {
    return this.data[path]
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
  _notify(path, event) {
    for (let watcher of this.watchers) {
      if (watcher.path == path) {
        // setTimeout(() => {
          watcher.callback(path, event)
        // }, 0)
      }
    }
  }
}

class App {
  constructor() {
    console.log(urlParams)
    this.user = urlParams.user || 'phil'
    this.token = null

    this.sync = new Sync()
  }

  run() {
    ReactDOM.render(<AppCo sync={this.sync} data={this.data} people={this.people} />, document.querySelector('#app'))

    fetch('/s/login?name=' + this.user)
      .then(response => response.json())
      .then(loginResponse => {
        this.token = loginResponse.token
        this._onLogin()
      })
  }

  _onLogin() {
    fetch('/s/data?token=' + this.token)
      .then(response => response.json())
      .then(dataResponse => {
        this._onData(dataResponse)
      })
  }

  _onData(d) {
    this.sync.start(this.token, {
      people: d.users,
      title: d.title,
      lines: d.lines,
    })
  }
}

// document.addEventListener('DOMContentLoaded', function() {
let app = new App()
app.run()
// })
