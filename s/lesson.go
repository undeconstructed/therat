package main

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

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

type line struct {
	Text string `json:"text"`
}

type lesson struct {
	sync.Mutex

	version int
	updates chan updateMessage

	title string
	lines []line
	users []*user
}

func newLesson(title string) *lesson {
	return &lesson{
		version: 0,
		updates: make(chan updateMessage, 100),
		title:   title,
		lines:   []line{},
		users:   []*user{},
	}
}

func loadLesson(filename string) (*lesson, error) {
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	file := lessonFile{}
	err = json.Unmarshal(data, &file)
	if err != nil {
		return nil, err
	}

	l := newLesson(file.Title)

	for _, inline := range file.Lines {
		l.lines = append(l.lines, line{
			Text: inline.Text,
		})
	}

	for _, inuser := range file.Users {
		l.users = append(l.users, &user{
			Name: inuser.Name,
		})
	}

	return l, nil
}

type lessonFile struct {
	Title string `json:"title"`
	Lines []struct {
		Text string `json:"text"`
	} `json:"lines"`
	Users []struct {
		Name string `json:"name"`
	} `json:"people"`
}

type lessonJSON struct {
	Version int     `json:"version"`
	Title   string  `json:"title"`
	Lines   []line  `json:"lines"`
	Users   []*user `json:"users"`
}

func (l *lesson) MarshalJSON() ([]byte, error) {
	return json.Marshal(lessonJSON{l.version, l.title, l.lines, l.users})
}

func (l *lesson) run() {
	for {
		select {
		case m := <-l.updates:
			l.sendUpdates(m)
		}
	}
}

func (l *lesson) sendUpdates(m updateMessage) {
	l.version++
	m.Version = l.version

	for _, u := range l.users {
		if u.client != nil {
			err := u.client.send(m)
			if err != nil {
				log.Print("update problem")
			}
		}
	}
}

func (l *lesson) login(name string) (string, error) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.Name == name {
			return name, nil
		}
	}

	return "", errors.New("no user")
	// l.users = append(l.users, &user{name, nil})
	// return name, nil
}

func (l *lesson) connect(token string, conn *websocket.Conn) (*client, error) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.Name == token {
			if u.client != nil {
				u.client.close("other connect")
				u.client = nil
			}

			u.client = newClient(l, u, conn)

			l.updates <- updateMessage{
				Path: "people",
				Data: l.users,
			}

			return u.client, nil
		}
	}

	return nil, errors.New("no user")
}

func (l *lesson) disconnect(client *client) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.client == client {
			u.client = nil
		}
	}

	l.updates <- updateMessage{
		Path: "people",
		Data: l.users,
	}
}

type client struct {
	lesson *lesson
	user   *user
	outCh  chan interface{}
	conn   *websocket.Conn
}

func newClient(lesson *lesson, user *user, conn *websocket.Conn) *client {
	return &client{
		lesson: lesson,
		user:   user,
		outCh:  make(chan interface{}, 100),
		conn:   conn,
	}
}

func (c *client) run() {
	toUser := make(chan interface{}, 100)
	fromUser := make(chan []byte)

	go func() {
		for {
			_, message, err := c.conn.ReadMessage()
			if err != nil {
				log.Println("read:", err)
				close(fromUser)
				break
			}
			fromUser <- message
		}
	}()

	for {
		select {
		case m := <-c.outCh:
			toUser <- m
		case m, ok := <-fromUser:
			if !ok {
				log.Printf("user gone: %s", c.user.Name)
				c.lesson.disconnect(c)
				return
			}
			log.Printf("from user: %s %v", c.user.Name, m)
		case m, ok := <-toUser:
			if !ok {
				log.Printf("user kicked: %s", c.user.Name)
				return
			}
			log.Printf("to user: %s %v", c.user.Name, m)
			j, _ := json.Marshal(m)
			err := c.conn.WriteMessage(websocket.TextMessage, j)
			if err != nil {
				log.Println("write:", err)
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
