package main

import (
	"encoding/json"
	"io/ioutil"
)

type line struct {
	Text string `json:"text"`
}

type lessonFile struct {
	Title string    `json:"title"`
	Lines []line    `json:"lines"`
	Users []UserDef `json:"users"`
}

type lessonData struct {
	Title string `json:"title"`
	Lines []line `json:"lines"`
	At    int    `json:"at"`
}

func newLesson(users []UserDef, title string, lines []line) *Sync {
	s := newSync(users, lessonData{
		Title: title,
		Lines: lines,
		At:    0,
	})
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

	l := newLesson(file.Users, file.Title, file.Lines)

	return l, nil
}
