'use strict';

function switchy (arg, opts) {
  let o = opts[arg]
  if (!o) {
    o = opts['default']
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

const Page = ({data, at}) => {
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
    <header className="title"><MyTitle text={data.title()} /></header>
    <div className="lines">{renderLines(data.list(), at)}</div>
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

function sortPeople(a, b) {
  return a.id > b.id
}

const PeopleList = ({people}) => {
  const [list, setList] = React.useState(people.list().sort(sortPeople))

  const onChange = React.useCallback(() => {
    let l = people.list().sort(sortPeople)
    setList(l)
  }, [])

  React.useEffect(() => {
    people.watch(onChange)
    return () => people.unwatch(onChange)
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
  const [online, setOnline] = React.useState(sync.online)

  const onChange = React.useCallback((type) => {
    console.log('sync update')
    setOnline(sync.online)
  }, [])

  React.useEffect(() => {
    console.log('watch sync')
    sync.watch(onChange)
    return () => sync.unwatch(onChange)
  }, [])

  return <aside className="xxx">
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
      'default': () => ({ ...s })
    })
  }, { at: 0 })

  const onChange = React.useCallback(() => {
    update({ is: null })
  }, [])

  React.useEffect(() => {
    data.watch(onChange)
    return () => data.unwatch(onChange)
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
      <Page data={data} at={state.at} />
      <TransportControls back={back} next={next} />
    </div>
    <div className="side">
      <PeopleList people={people}/>
      <StatusDisplay sync={sync}/>
    </div>
  </div>
}

class PeopleSync {
  constructor() {
    // this.people = Array(5).fill().map(() => ({ id: randomNumber(1, 1000)}))
    this.people = []
    this.watchers = []
  }
  start(people, sync) {
    this.people = people.map(e => ({ id: e.name, name: e.name, online: e.online }))
    this._notify()
    sync.watch(e => this._onEvent)
  }
  _onEvent(type, e) {
  }
  // *[Symbol.iterator]() {
  //   for (let e of this.people) {
  //     yield 'foo'
  //   }
  // }
  list() {
    return [...this.people]
  }
  watch(s) {
    this.watchers.push(s)
  }
  unwatch(s) {
    let n = this.watchers.indexOf(s)
    if (n >= 0) {
      this.watchers.splice(n, n)
    }
  }
  _notify() {
    for (let s of this.watchers) {
      setTimeout(() => {
        s()
      }, 0)
    }
  }
}

class DataSync {
  constructor() {
    this.data = {
      title: 'none',
      lines: []
    }
    this.watchers = []
  }
  start(data, sync) {
    this.data = data
    this._notify()
    sync.watch(e => this.onEvent)
  }
  onEvent(e) {
  }
  title() {
    return this.data.title
  }
  list() {
    return [...this.data.lines]
  }
  length() {
    return this.data.lines.length
  }
  watch(s) {
    this.watchers.push(s)
  }
  unwatch(s) {
    let n = this.watchers.indexOf(s)
    if (n >= 0) {
      this.watchers.splice(n, n)
    }
  }
  _notify() {
    for (let s of this.watchers) {
      setTimeout(() => {
        s()
      }, 0)
    }
  }
}

class Sync {
  constructor() {
    this.watchers = []
    this.online = false
  }
  start(token) {
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
      console.log('sync message: ' + evt.data)
    }
    ws.onerror = (evt) => {
      console.log('sync error: ' + evt.data)
    }
    this.ws = ws
  }
  watch(s) {
    this.watchers.push(s)
  }
  unwatch(s) {
    let n = this.watchers.indexOf(s)
    if (n >= 0) {
      this.watchers.splice(n, n)
    }
  }
  _notify(type, e) {
    for (let s of this.watchers) {
      setTimeout(() => {
        s(type, e)
      }, 0)
    }
  }
}

class App {
  constructor() {
    console.log(urlParams)
    this.user = urlParams.user || 'phil'
    this.token = null

    this.sync = new Sync()
    this.people = new PeopleSync()
    this.data = new DataSync()
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
    this.people.start(d.users, this.sync)
    this.data.start({
      title: d.title,
      lines: d.lines,
    }, this.sync)
    this.sync.start(this.token)
  }
}

// document.addEventListener('DOMContentLoaded', function() {
let app = new App()
app.run()
// })
