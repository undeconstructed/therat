
class Sync {
  constructor(loginResponse) {
    this.token = loginResponse.token
    this.role = loginResponse.role
    this.online = false

    this.version = 0
    this.data = {}

    this.watchers = []
    this._toNotify = {}
  }
  start(dataResponse) {
    for (let e of dataResponse) {
      if (e.type == 'u') {
        this._update(e.version, e.path, e.data)
      }
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
          console.log('update arrived', m)
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
    let xpath = path.split('/')
    let xdata = this.data
    for (let x = 0; x < xpath.length-1; x++) {
      let xp = xpath[x]
      let xd = xdata[xp]
      if (!xd) {
        xd = {}
        xdata[xp] = xd
      }
      xdata = xd
    }
    xdata[xpath[xpath.length-1]] = value
    this.version = version
    this._notify(path)
  }
  isOnline() {
    return this.online
  }
  isHost() {
    return this.role == "host"
  }
  get(path) {
    let xpath = path.split('/')
    let xdata = this.data
    for (let xp of xpath) {
      xdata = xdata[xp]
      if (!xdata) {
        break
      }
    }
    return xdata
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
    let watcher = { path, callback }
    this.watchers.push(watcher)
    return () => this._unwatch(watcher)
  }
  multiwatch(watches) {
    let stops = []
    for (let p in watches) {
      let stop = this.watch(p, watches[p])
      stops.push(stop)
    }
    return () => stops.forEach(e => e())
  }
  _unwatch(watcher) {
    let n = this.watchers.indexOf(watcher)
    if (n >= 0) {
      this.watchers.splice(n, n)
    }
  }
  _notify(path) {
    this._toNotify[path] = true
    if (!this._nto) {
      this._nto = setTimeout(() => {
        this._nto = undefined
        this._notifyCore(this._toNotify)
        this._toNotify = {}
      }, 0)
    }
  }
  _notifyCore(paths) {
    for (let path of Object.keys(paths)) {
      // console.log('notify?', path)
      for (let watcher of this.watchers) {
        if (watcher.path.startsWith(path)) {
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
    }
  }
}
