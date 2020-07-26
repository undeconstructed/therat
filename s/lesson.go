package main

import (
	"encoding/json"
	"io/ioutil"
)

type lineDef struct {
	Text string `json:"text"`
}

type lessonDef struct {
	Title string    `json:"title"`
	Lines []lineDef `json:"lines"`
	Users []UserDef `json:"users"`
}

type line struct {
	// ID string `json:"text"`
	Text  string          `json:"text"`
	Users map[string]bool `json:"users"`
}

type lessonData struct {
	Title string          `json:"title"`
	Lines map[string]line `json:"lines"`
	Order []string        `json:"order"`
	At    string          `json:"at"`
}

func newLesson(users []UserDef, title string, lines []lineDef) *Sync {
	lineMap := map[string]line{}
	order := make([]string, len(lines))
	for i, l := range lines {
		id := randSeq(5)
		lineMap[id] = line{Text: l.Text}
		order[i] = id
	}
	data, _ := json.Marshal(&lessonData{
		Title: title,
		Lines: lineMap,
		Order: order,
		At:    order[0],
	})
	s := newSync(users, data)
	return s
}

func loadLesson(filename string) (*Sync, error) {
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	file := lessonDef{}
	err = json.Unmarshal(data, &file)
	if err != nil {
		return nil, err
	}

	l := newLesson(file.Users, file.Title, file.Lines)

	return l, nil
}
