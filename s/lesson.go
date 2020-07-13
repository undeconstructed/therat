package main

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"strings"
)

type line struct {
	// ID string `json:"text"`
	Text string `json:"text"`
}

type lessonFile struct {
	Title string    `json:"title"`
	Lines []line    `json:"lines"`
	Users []UserDef `json:"users"`
}

type lessonData struct {
	Title string          `json:"title"`
	Lines map[string]line `json:"lines"`
	Order []string        `json:"order"`
	At    string          `json:"at"`
}

func newLesson(users []UserDef, title string, lines []line) *Sync {
	lineMap := map[string]line{}
	order := make([]string, len(lines))
	for i, l := range lines {
		id := randSeq(5)
		lineMap[id] = l
		order[i] = id
	}
	s := newSync(users, &lessonData{
		Title: title,
		Lines: lineMap,
		Order: order,
		At:    order[0],
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

func (l *lessonData) MarshalJSONPart(path string) ([]byte, error) {
	switch {
	case path == "at":
		return json.Marshal(l.At)
	case path == "order":
		return json.Marshal(l.Order)
	case path == "lines":
		return json.Marshal(l.Lines)
	}
	return nil, errors.New("bad path")
}

func (l *lessonData) Update(path string, data json.RawMessage) (string, error) {
	switch {
	case path == "at":
		val := ""
		err := json.Unmarshal(data, &val)
		if err != nil {
			return "", err
		}
		// XXX - could be invalid ref
		l.At = val
		return "at", nil
	case path == "order":
		val := []string{}
		err := json.Unmarshal(data, &val)
		if err != nil {
			return "", err
		}
		// XXX - could have invalid line refs
		l.Order = val
		return "order", nil
	case strings.HasPrefix(path, "lines/"):
		lpath := path[6:]
		val := line{}
		err := json.Unmarshal(data, &val)
		if err != nil {
			return "", err
		}
		// XXX - could cause invalid line refs
		l.Lines[lpath] = val
		return "lines", nil
	}
	return "", errors.New("bad path")
}
