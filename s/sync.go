package main

import (
	"encoding/json"
	"errors"
	"log"

	"github.com/gorilla/websocket"
)

type loginRequest struct {
	auth string
	res  chan loginResponse
}

type loginResponse struct {
	token string
	name  string
	host  bool
	err   error
}

type connectRequest struct {
	token string
	conn  *websocket.Conn
	res   chan connectResponse
}

type connectResponse struct {
	run func()
	err error
}

type disconnectRequest struct {
	client *client
}

type updateRequest struct {
	Path string
	Data interface{}
}

type user struct {
	Name   string
	client *client
}

func (u *user) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Online bool   `json:"online"`
	}{
		u.Name, u.Name, u.client != nil,
	})
}

// box could be for storing typed data?
type box struct {
	Type  string         `json:"type"`
	Value map[string]box `json:"value"`
}

// Sync handles data sync between some users
type Sync struct {
	version int
	// TODO generic data
	data lessonData

	updatesIn  chan updateRequest
	updatesOut chan updateMessage

	logins      chan loginRequest
	connects    chan connectRequest
	disconnects chan disconnectRequest
	users       []*user
}

func newSync(users []UserDef, data lessonData) *Sync {
	users1 := []*user{}
	for _, u := range users {
		u1 := &user{
			Name: u.Name,
		}
		users1 = append(users1, u1)
	}

	return &Sync{
		version:     0,
		users:       users1,
		data:        data,
		updatesIn:   make(chan updateRequest, 100),
		updatesOut:  make(chan updateMessage, 100),
		logins:      make(chan loginRequest),
		connects:    make(chan connectRequest),
		disconnects: make(chan disconnectRequest),
	}
}

// JSON encodes all sync data to JSON
func (s *Sync) JSON() ([]byte, error) {
	// XXX - locking
	return json.Marshal(struct {
		Version int        `json:"version"`
		Users   []*user    `json:"users"`
		Data    lessonData `json:"data"`
	}{s.version, s.users, s.data})
}

// Run is the main loop for the Sync
func (s *Sync) Run() {
	for {
		select {
		case m := <-s.logins:
			res := s.doLogin(m.auth)
			m.res <- res
		case m := <-s.connects:
			res := s.doConnect(m.token, m.conn)
			m.res <- res
		case m := <-s.disconnects:
			s.doDisconnect(m.client)
		case m := <-s.updatesIn:
			s.doUpdate(m.Path, m.Data)
		case m := <-s.updatesOut:
			s.sendUpdates(m)
		}
	}
}

// Update updates the data in the Sync
func (s *Sync) Update(path string, data interface{}) {
	s.updatesIn <- updateRequest{path, data}
}

func (s *Sync) doUpdate(path string, data interface{}) {
	if path == "at" {
		s.version++
		s.data.At = data.(int)
		jn, _ := json.Marshal(s.data.At)
		s.updatesOut <- updateMessage{s.version, "data/at", jn}
	}
}

func (s *Sync) sendUpdates(m updateMessage) {
	log.Printf("broadcasting update: %d %s", m.Version, m.Path)
	for _, u := range s.users {
		if u.client != nil {
			err := u.client.send(m)
			if err != nil {
				log.Print("update problem")
			}
		}
	}
}

// Login gets a token to allow connecting to the Sync
func (s *Sync) Login(name string) (loginResponse, error) {
	resCh := make(chan loginResponse)
	s.logins <- loginRequest{name, resCh}
	res := <-resCh
	return res, res.err
}

func (s *Sync) doLogin(auth string) loginResponse {
	for _, u := range s.users {
		// XXX - auth shouldn't be name maybe
		if u.Name == auth {
			// XXX - token shouldn't be name maybe
			token := u.Name
			name := u.Name
			host := u.Name == "host"
			return loginResponse{token, name, host, nil}
		}
	}

	return loginResponse{"", "", false, errors.New("no user")}
}

// Connect allows a websocket to connect to the Sync. Run the returned func in the web handler.
func (s *Sync) Connect(token string, conn *websocket.Conn) (func(), error) {
	resCh := make(chan connectResponse)
	s.connects <- connectRequest{token, conn, resCh}
	res := <-resCh
	return res.run, res.err
}

func (s *Sync) doConnect(token string, conn *websocket.Conn) connectResponse {
	for _, u := range s.users {
		if u.Name == token {
			if u.client != nil {
				u.client.close("other connect")
				u.client = nil
			}

			log.Printf("client connecting: %s", u.Name)
			u.client = newClient(s, u, conn)

			s.version++
			jn, _ := json.Marshal(s.users)
			s.updatesOut <- updateMessage{
				Version: s.version,
				Path:    "users",
				Data:    jn,
			}

			return connectResponse{func() { u.client.run() }, nil}
		}
	}

	return connectResponse{nil, errors.New("no user")}
}

func (s *Sync) disconnect(client *client) {
	s.disconnects <- disconnectRequest{
		client: client,
	}
}

func (s *Sync) doDisconnect(client *client) {
	for _, u := range s.users {
		if u.client == client {
			u.client = nil

			s.version++
			jn, _ := json.Marshal(s.users)
			s.updatesOut <- updateMessage{
				Version: s.version,
				Path:    "users",
				Data:    jn,
			}
		}
	}
}

type client struct {
	sync  *Sync
	user  *user
	outCh chan interface{}
	conn  *websocket.Conn
}

func newClient(sync *Sync, user *user, conn *websocket.Conn) *client {
	return &client{
		sync:  sync,
		user:  user,
		outCh: make(chan interface{}, 100),
		conn:  conn,
	}
}

func (c *client) run() {
	toUser := make(chan interface{}, 100)
	fromUser := make(chan []byte)

	ingestMessage := func(m []byte) {
		log.Printf("from user: %s %s", c.user.Name, string(m))
		v := struct {
			Type string          `json:"type"`
			Path string          `json:"path"`
			Data json.RawMessage `json:"value"`
		}{}
		err := json.Unmarshal(m, &v)
		if err != nil {
			log.Println("read error:", err)
		}
		if v.Type == "u" {
			if v.Path == "at" {
				val := 0
				json.Unmarshal(v.Data, &val)
				c.sync.Update(v.Path, val)
			}
		}
	}
	egestMessage := func(m interface{}) {
		j, _ := json.Marshal(m)
		// log.Printf("to user: %s %s", c.user.Name, string(j))
		err := c.conn.WriteMessage(websocket.TextMessage, j)
		if err != nil {
			log.Println("write error:", err)
		}
	}

	go func() {
		for {
			mtype, message, err := c.conn.ReadMessage()
			if err != nil {
				log.Println("read:", err)
				close(fromUser)
				break
			}
			if mtype == websocket.TextMessage {
				fromUser <- message
			} else {
				log.Println("other message type")
			}
		}
	}()

	for {
		select {
		case m := <-c.outCh:
			toUser <- m
		case m, ok := <-fromUser:
			if !ok {
				log.Printf("user gone: %s", c.user.Name)
				c.sync.disconnect(c)
				return
			}
			ingestMessage(m)
		case m, ok := <-toUser:
			if !ok {
				log.Printf("user kicked: %s", c.user.Name)
				return
			}
			egestMessage(m)
		}
	}
}

func (c *client) send(message interface{}) error {
	c.outCh <- message
	return nil
}

func (c *client) close(message string) {
	c.outCh <- message
	close(c.outCh)
}
