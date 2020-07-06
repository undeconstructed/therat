package main

import (
	"encoding/json"
	"errors"
	"sync"
)

type line struct {
	Text string `json:"text"`
}

type lesson struct {
	sync.Mutex
	version int
	title   string
	lines   []line
	users   []*user
}

func newLesson(title string) *lesson {
	return &lesson{
		version: 0,
		title:   title,
		lines: []line{
			{"default first line"},
		},
		users: []*user{},
	}
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

func (l *lesson) start() {
	go func() {
	}()
}

func (l *lesson) login(name string) (string, error) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.Name == name {
			return name, nil
		}
	}

	l.users = append(l.users, &user{name, nil})
	return name, nil
}

func (l *lesson) connect(token string, outCh chan interface{}) (chan interface{}, error) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.Name == token {
			if u.outCh != nil {
				u.outCh <- clientMessage{"other connect"}
				close(u.outCh)
			}
			u.outCh = outCh
			return nil, nil
		}
	}
	return nil, errors.New("no user")
}

func (l *lesson) disconnect(token string) {
	l.Lock()
	defer l.Unlock()

	for _, u := range l.users {
		if u.Name == token {
			if u.outCh != nil {
				close(u.outCh)
				u.outCh = nil
			}
		}
	}
}

type user struct {
	Name  string
	outCh chan interface{}
}

func (u *user) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Online bool   `json:"online"`
	}{
		u.Name, u.Name, u.outCh != nil,
	})
}
