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

const ActionLink = React.memo(({label, tip, callback}) => {
  let onClick = React.useCallback(e => {
    e.preventDefault()
    callback(label)
  }, [label, callback])

  return <a onClick={onClick} title={tip}>{label}</a>
})

const Line = ({lineKey, line, state, actions, onAction}) => {
  const ref = React.useRef()

  React.useLayoutEffect(x => {
    if (state == 'active') {
      ref.current.scrollIntoView(false, { behavior: 'smooth' })
    }
  }, [state])

  let onAction2 = React.useCallback((action) => {
    onAction(lineKey, action)
  }, [lineKey, onAction])

  let actionLinks = []
  for (let a of actions) {
    actionLinks.push(<ActionLink key={a.label} label={a.label} tip={a.tip} callback={onAction2}></ActionLink>)
  }

  return <div className={'line ' + state} ref={ref}>
    <div className="content">{line.text}</div>
    <div className="actions">{actionLinks}</div>
  </div>
}

const Page = ({lines, order, at, actions, onAction}) => {
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
      out.push(<Line key={ref} lineKey={ref} line={line} state={state} actions={actions} onAction={onAction} />)
    }
    return out
  }

  return <div className="lines">{renderLines(lines, order, at, actions)}</div>
}

const MyTitle = React.memo(({text}) => {
  return <h1>{text}</h1>
})

function getUsers(sync) {
  let raw = sync.get('users') || {}
  let list = Object.keys(raw).map(e => raw[e])
  list.sort((a, b) => a.name > b.name)
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
        {list.map(e => <li key={e.name}>{e.name} ({e.online ? "online" : "offline"})</li>)}
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

const StatusLine = ({user, sync}) => {
  const [online, setOnline] = React.useState(sync.isOnline())

  React.useEffect(() => {
    let stop = sync.watch('online', () => {
      setOnline(sync.online)
    })
    return stop
  }, [])

  return <aside className="statusline">
    <div>{user} - {online ? "online" : "offline"}</div>
  </aside>
}

const PreAppScreen = ({text}) => {
  return <h1>... {text} ...</h1>
}

const AsUserScreen = ({app}) => {
  let user = app.user
  let sync = app.sync

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

  let actions = [{
    label: '?',
    tip: 'if you have a question about this line'
  }, {
    label: '✓',
    tip: 'another button'
  }]
  let actionCb = React.useCallback((line, action) => {
    switchy(action, {
      '?': () => {
        sync.set(`data/lines/{user}`, true)
      },
      '✓': () => {
        alert('what should this do?')
      }
    })
  }, [])

  return <div className="app asuser">
    <div className="main">
      <header className="title"><MyTitle text={state.title} /></header>
      <Page lines={state.lines} order={state.order} at={state.at} actions={actions} onAction={actionCb} />
      <StatusLine user={user} sync={sync}/>
    </div>
  </div>
}

const TransportControls = React.memo(({back, next}) => {
  return <div className="transport">
    <a onClick={back ? back : undefined} className={!back ? 'disabled' : undefined}>[back]</a>
    <a onClick={next ? next : undefined} className={!next ? 'disabled' : undefined}>[next]</a>
  </div>
})

const AsHostScreen = ({app}) => {
  let sync = app.sync

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

  let atIdx = state.order.indexOf(state.at)
  let backAt = state.order[atIdx-1]
  let nextAt = state.order[atIdx+1]

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

  let actions = [{
    label: '!',
    tip: 'focus this line'
  }, {
    label: '+',
    tip: 'add a line'
  }]
  let actionCb = React.useCallback((line, action) => {
    switchy(action, {
      '!': () => {
        signal({ is: 'move', at: line })
      },
      [other]: () => {
        alert(`action ${action} on ${line}`)
      }
    })
  }, [])

  return <div className="app ashost">
    <div className="main">
      <header className="title"><MyTitle text={state.title} /></header>
      <Page lines={state.lines} order={state.order} at={state.at} actions={actions} onAction={actionCb} />
      <TransportControls back={backAt && back} next={nextAt && next} />
    </div>
    <div className="side">
      <UsersList sync={sync}/>
      <StatusDisplay sync={sync}/>
    </div>
  </div>
}

class App {
  constructor() {
    this.auth = urlParams.auth
    this.user = null
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

    this.user = loginResponse.name
    this.token = loginResponse.token
    this.sync = new Sync(loginResponse)

    fetch(`/s/events?token=${this.token}&from=${0}`)
      .then(response => response.json())
      .then(r => this._onData(r))
  }

  _onData(dataResponse) {
    if (this.sync.isHost()) {
      ReactDOM.render(React.createElement(AsHostScreen, { app: this }), document.querySelector('#app'))
    } else {
      ReactDOM.render(React.createElement(AsUserScreen, { app: this }), document.querySelector('#app'))
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
