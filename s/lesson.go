package main

import (
	"encoding/json"
	"io/ioutil"
)

func newLesson(title string) *Sync {
	s := newSync()
	s.title = title
	return s
}

func loadLesson(filename string) (*Sync, error) {
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
