package main

import (
	"encoding/json"
	"errors"
	"log"
	"strings"

	"github.com/gorilla/websocket"
)

type loginRequest struct {
	auth string
	res  chan loginResponse
}

type loginResponse struct {
	token string
	name  string
	role  string
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
	Data json.RawMessage
}

type user struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	client *client
}

// Sync handles data sync between some users
type Sync struct {
	data *tracker

	updatesIn  chan updateRequest
	updatesOut chan updateMessage

	logins      chan loginRequest
	connects    chan connectRequest
	disconnects chan disconnectRequest
	users       map[string]*user
}

func newSync(users []UserDef, data0 json.RawMessage) *Sync {
	users1 := map[string]*user{}
	for _, u := range users {
		u1 := &user{
			Name: u.Name,
			Role: u.Role,
		}
		users1[u1.Name] = u1
	}

	data := newTracker()
	usersJSON, _ := json.Marshal(users1)
	data.addChange("users", usersJSON)
	data.addChange("data", data0)

	return &Sync{
		users:       users1,
		data:        data,
		updatesIn:   make(chan updateRequest, 100),
		updatesOut:  make(chan updateMessage, 100),
		logins:      make(chan loginRequest),
		connects:    make(chan connectRequest),
		disconnects: make(chan disconnectRequest),
	}
}

// MarshalStateJSON encodes all sync data to JSON
func (s *Sync) MarshalStateJSON() ([]byte, error) {
	// TODO tracker snapshot
	return nil, nil
}

// MarshalEventsJSON encodes all sync data to JSON
func (s *Sync) MarshalEventsJSON(from int) ([]byte, error) {
	changes, err := s.data.getChanges(from)
	if err != nil {
		return nil, err
	}
	changes1 := make([]updateMessage, len(changes))
	for i, c := range changes {
		j, _ := json.Marshal(c.data)
		changes1[i] = updateMessage{Version: c.version, Path: c.path, Data: j}
	}
	return json.Marshal(changes1)
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
func (s *Sync) Update(path string, data json.RawMessage) {
	s.updatesIn <- updateRequest{path, data}
}

func (s *Sync) doUpdate(path string, data json.RawMessage) {
	if !strings.HasPrefix(path, "data/") {
		// externals can only update inside data
		return
	}

	version, err := s.data.addChange(path, data)
	if err != nil {
		log.Printf("data rejected: %v", err)
		return
	}

	s.updatesOut <- updateMessage{version, path, data}
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
			role := u.Role
			return loginResponse{token, name, role, nil}
		}
	}

	return loginResponse{err: errors.New("no user")}
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

			path := "users/" + u.Name + "/online"
			version, _ := s.data.addChange(path, json.RawMessage("true"))
			s.updatesOut <- updateMessage{
				Version: version,
				Path:    path,
				Data:    json.RawMessage("true"),
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

			path := "users/" + u.Name + "/online"
			version, _ := s.data.addChange(path, json.RawMessage("false"))
			s.updatesOut <- updateMessage{
				Version: version,
				Path:    path,
				Data:    json.RawMessage("false"),
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

	ingestMessage := func(m []byte) error {
		log.Printf("from user: %s %s", c.user.Name, string(m))
		v := struct {
			Type string          `json:"type"`
			Path string          `json:"path"`
			Data json.RawMessage `json:"value"`
		}{}
		err := json.Unmarshal(m, &v)
		if err != nil {
			return err
		}
		if v.Type == "u" {
			c.sync.Update(v.Path, v.Data)
		}
		return nil
	}
	egestMessage := func(m interface{}) error {
		j, _ := json.Marshal(m)
		// log.Printf("to user: %s %s", c.user.Name, string(j))
		err := c.conn.WriteMessage(websocket.TextMessage, j)
		if err != nil {
			return err
		}
		return nil
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
			err := ingestMessage(m)
			if err != nil {
				log.Printf("error from user: %s, %v", c.user.Name, err)
			}
		case m, ok := <-toUser:
			if !ok {
				log.Printf("user kicked: %s", c.user.Name)
				return
			}
			err := egestMessage(m)
			if err != nil {
				log.Printf("error to user: %s, %v", c.user.Name, err)
			}
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
