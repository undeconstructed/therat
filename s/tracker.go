package main

import "encoding/json"

type change struct {
	version int
	path    string
	data    json.RawMessage
}

type tracker struct {
	version int
	changes []change
}

func newTracker() *tracker {
	return &tracker{}
}

func (t *tracker) addChange(path string, data json.RawMessage) (int, error) {
	t.version++
	c := change{t.version, path, data}
	t.changes = append(t.changes, c)
	return t.version, nil
}

func (t *tracker) getChanges(from int) ([]change, error) {
	return t.changes[from:], nil
}
